import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { VintageKind } from "@/lib/supabase/database.types";
import type { ByHandIdentity } from "@/components/add-wine/types";

// The write helpers behind the tasting-wine server actions.
//
// Deliberately NOT a "use server" file: every export of one of those is
// registered as a server action reachable by a direct POST, whether or not
// anything imports it (node_modules/next/dist/docs/01-app/02-guides/
// data-security.md, "Built-in Server Actions Security features"). These
// helpers trust a caller-supplied Supabase client and user id instead of
// resolving auth themselves, so they must only ever be reachable through an
// action that has already authenticated the caller — addWine /
// addWineFromCatalog / addTastingWineFromCellarLot in ./actions.ts and
// addToFlight / addToCellar / addToCatalog in components/add-wine/actions.ts.
// `server-only` keeps the module (and its trusted signatures) out of every
// client bundle.

export type TastingDb = Awaited<ReturnType<typeof createClient>>;

export type ReferenceOption = { id: string; name: string };

export type BlendGrape = { grapeId: string; percentage: number | null };

export type InsertedTastingWine = {
  wineId: string;
  position: number;
  catalogWineId: string;
};

// Two lookups + an insert, kept simple and type-safe by taking the already
// -built find/create queries as closures rather than a dynamic table name
// (Supabase's typed client can't take a table name as a plain string).
export async function findOrCreate(
  find: () => PromiseLike<{ data: ReferenceOption | null }>,
  create: () => PromiseLike<{
    data: ReferenceOption | null;
    error: { code?: string; message: string } | null;
  }>,
): Promise<ReferenceOption> {
  const { data: existing } = await find();
  if (existing) return existing;

  const { data: created, error } = await create();
  if (!error && created) return created;

  // Unique-constraint race: someone else inserted the same row between our
  // check and our insert. Re-select rather than surface a spurious error.
  if (error?.code === "23505") {
    const { data: retried } = await find();
    if (retried) return retried;
  }

  throw new Error(error?.message ?? "Could not create entry.");
}

// Find-or-create a producer by exact trimmed name (the name is globally
// unique; region_id is only a scoping hint on a fresh row). Shared by the
// createProducer action and the identity write below, so a pending producer
// is created the same way whichever path saves it.
export async function findOrCreateProducer(
  supabase: TastingDb,
  regionId: string | null,
  name: string,
): Promise<ReferenceOption> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  return findOrCreate(
    () => supabase.from("producers").select("id, name").eq("name", trimmed).maybeSingle(),
    () =>
      supabase
        .from("producers")
        .insert({ name: trimmed, region_id: regionId })
        .select("id, name")
        .single(),
  );
}

// Persist the full blend on the catalog wine (its trigger recomputes the lead
// grape as primary/secondary). Only a wine this user owns is touched, so a
// deduped/existing wine keeps its own blend. Also used by the add-wine
// sheet's catalog destination, which creates rows through the same RPC.
export async function syncCatalogWine(
  supabase: TastingDb,
  catalogWineId: string,
  userId: string,
  blend: BlendGrape[],
  imageUrl: string | null,
  description: string | null,
  alcoholPercent: number | null = null,
) {
  const { data: cw } = await supabase
    .from("catalog_wines")
    .select("created_by, image_url, description, alcohol_percent")
    .eq("id", catalogWineId)
    .maybeSingle();
  // Only the wine's creator may edit it — a deduped/existing wine keeps its own
  // blend + photo (we never overwrite someone else's catalog entry).
  if (cw?.created_by !== userId) return;
  // Put the label photo on the shared catalog wine too, so it shows in the
  // catalog and results — not only on the post-reveal answer row.
  if (imageUrl && !cw.image_url) {
    await supabase
      .from("catalog_wines")
      .update({ image_url: imageUrl })
      .eq("id", catalogWineId);
  }
  // Seed the wine's description on the creator's catalog entry when it has none
  // yet — never clobbering an existing writeup (mirrors the photo rule above).
  if (description && !cw.description) {
    await supabase
      .from("catalog_wines")
      .update({ description })
      .eq("id", catalogWineId);
  }
  // Same rule for a typed alcohol % (the by-hand sheet's "More detail").
  if (alcoholPercent != null && cw.alcohol_percent == null) {
    await supabase
      .from("catalog_wines")
      .update({ alcohol_percent: alcoholPercent })
      .eq("id", catalogWineId);
  }
  if (blend.length === 0) return;
  await supabase
    .from("catalog_wine_grapes")
    .delete()
    .eq("catalog_wine_id", catalogWineId);
  await supabase.from("catalog_wine_grapes").insert(
    blend.map((g, i) => ({
      catalog_wine_id: catalogWineId,
      grape_id: g.grapeId,
      percentage: g.percentage,
      sort_order: i,
    })),
  );
}

export type IdentifiedTastingWine = {
  countryId: string;
  regionId: string;
  appellationId: string;
  primaryGrapeId: string;
  secondaryGrapeId: string | null;
  producerId: string | null;
  typeDesignationId: string | null;
  vintageKind: VintageKind | null;
  vintageYear: number | null;
  vintageTawnyYears: number | null;
  wineName: string;
  colour: string;
  style: string;
  imageUrl: string | null;
  description: string | null;
  /** Full blend for the catalog row (percentages when the form had them). */
  blend: BlendGrape[];
  alcoholPercent: number | null;
};

// The write half of "add an identified wine to a tasting": permission gate
// (host, or any participant in bring-your-own), the wines row at the next
// position, the canonical catalog link, the protected answer row, and the
// creator-only catalog sync. Shared by the FormData action (addWine) and the
// add-wine sheet's identity path (insertTastingWineFromIdentity) so the two
// can never drift. Validation stays with each caller; NO redirect here.
export async function insertTastingWineCore(
  supabase: TastingDb,
  userId: string,
  tastingId: string,
  w: IdentifiedTastingWine,
): Promise<{ error: string } | InsertedTastingWine> {
  const { data: tasting } = await supabase
    .from("tastings")
    .select("*")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) {
    return { error: "Tasting not found." };
  }

  let contributorParticipantId: string | null = null;
  if (tasting.wine_source === "PARTICIPANT_CONTRIBUTED") {
    const { data: participant } = await supabase
      .from("tasting_participants")
      .select("id")
      .eq("tasting_id", tastingId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!participant) {
      return { error: "You're not a participant in this tasting." };
    }
    // Bring-your-own allows any number of bottles per person (including
    // none) — no one-wine-per-participant cap.
    contributorParticipantId = participant.id;
  } else if (tasting.host_id !== userId) {
    return { error: "Only the host can add wines to this tasting." };
  }

  const { count } = await supabase
    .from("wines")
    .select("id", { count: "exact", head: true })
    .eq("tasting_id", tastingId);
  const position = (count ?? 0) + 1;

  const { data: wine, error: wineError } = await supabase
    .from("wines")
    .insert({
      tasting_id: tastingId,
      position,
      contributor_participant_id: contributorParticipantId,
      // OPEN (group Taste & Rate) hides nothing — wines are visible and
      // scoreable the moment they're added, with no reveal step.
      is_revealed: tasting.reveal_mode === "OPEN",
    })
    .select()
    .single();
  if (wineError || !wine) {
    return { error: wineError?.message ?? "Could not add the wine." };
  }

  // Resolve (or create) the canonical catalog wine this answer describes, so
  // every blind wine links to one source-of-truth entry. The link lives on the
  // protected wine_answers row — invisible to participants until reveal.
  const answerSnapshot = {
    country_id: w.countryId,
    region_id: w.regionId,
    appellation_id: w.appellationId,
    primary_grape_id: w.primaryGrapeId,
    secondary_grape_id: w.secondaryGrapeId,
    producer_id: w.producerId,
    type_designation_id: w.typeDesignationId,
    vintage_kind: w.vintageKind,
    vintage_year: w.vintageYear,
    vintage_tawny_years: w.vintageTawnyYears,
    wine_name: w.wineName,
    colour: w.colour,
    style: w.style,
  };
  const { data: catalogWineId, error: catalogError } = await supabase.rpc(
    "find_or_create_catalog_wine",
    { p: answerSnapshot },
  );
  if (catalogError || !catalogWineId) {
    await supabase.from("wines").delete().eq("id", wine.id);
    return {
      error: catalogError?.message ?? "Could not link the wine to the catalog.",
    };
  }

  const { error: answerError } = await supabase.from("wine_answers").insert({
    wine_id: wine.id,
    country_id: w.countryId,
    region_id: w.regionId,
    appellation_id: w.appellationId,
    primary_grape_id: w.primaryGrapeId,
    secondary_grape_id: w.secondaryGrapeId,
    producer_id: w.producerId,
    type_designation_id: w.typeDesignationId,
    image_url: w.imageUrl,
    vintage_kind: w.vintageKind,
    vintage_year: w.vintageYear,
    vintage_tawny_years: w.vintageTawnyYears,
    catalog_wine_id: catalogWineId,
  });
  if (answerError) {
    await supabase.from("wines").delete().eq("id", wine.id);
    return { error: answerError.message };
  }

  await syncCatalogWine(
    supabase,
    catalogWineId,
    userId,
    w.blend,
    w.imageUrl,
    w.description,
    w.alcoholPercent,
  );
  return { wineId: wine.id, position, catalogWineId };
}

// The add-wine sheet's by-hand / scan-prefill path: the same floor and error
// copy as addWine, a pending producer created on save (find-or-create by
// exact name, region-scoped), then the shared write. Returns — no redirect —
// so the sheet can stay open in multi mode.
export async function insertTastingWineFromIdentity(
  supabase: TastingDb,
  userId: string,
  tastingId: string,
  identity: ByHandIdentity,
): Promise<{ error: string } | InsertedTastingWine> {
  const producerName = identity.producerName.trim();
  if (
    !identity.countryId || !identity.regionId || !identity.appellationId ||
    !identity.primaryGrapeId || (!identity.producerId && !producerName) ||
    !identity.colour || !identity.style
  ) {
    return {
      error:
        "Country, region, appellation, grape, producer, colour and style are required.",
    };
  }
  if (!["YEAR", "NV", "TAWNY"].includes(identity.vintageKind)) {
    return { error: "Choose a vintage type." };
  }
  let vintageYear: number | null = null;
  let vintageTawnyYears: number | null = null;
  if (identity.vintageKind === "YEAR") {
    vintageYear = identity.vintageYear ?? Number.NaN;
    if (!Number.isFinite(vintageYear)) return { error: "Enter a vintage year." };
  } else if (identity.vintageKind === "TAWNY") {
    vintageTawnyYears = identity.vintageTawnyYears ?? Number.NaN;
    if (!Number.isFinite(vintageTawnyYears)) {
      return { error: "Choose the tawny age statement." };
    }
  }

  let producerId = identity.producerId;
  if (!producerId) {
    try {
      producerId = (await findOrCreateProducer(supabase, identity.regionId, producerName)).id;
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Could not create the producer." };
    }
  }

  const blend: BlendGrape[] = [{ grapeId: identity.primaryGrapeId, percentage: null }];
  if (identity.secondaryGrapeId) {
    blend.push({ grapeId: identity.secondaryGrapeId, percentage: null });
  }
  return insertTastingWineCore(supabase, userId, tastingId, {
    countryId: identity.countryId,
    regionId: identity.regionId,
    appellationId: identity.appellationId,
    primaryGrapeId: identity.primaryGrapeId,
    secondaryGrapeId: identity.secondaryGrapeId,
    producerId,
    typeDesignationId: identity.typeDesignationId,
    vintageKind: identity.vintageKind,
    vintageYear,
    vintageTawnyYears,
    wineName: identity.wineName?.trim() ?? "",
    colour: identity.colour,
    style: identity.style,
    imageUrl: identity.imageUrl,
    description: identity.description?.trim() || null,
    blend,
    alcoholPercent: identity.alcoholPercent,
  });
}

// The insert half of "add a catalog wine to a tasting" (wines + wine_answers),
// with NO redirect — so callers that must run more work afterwards (drawing a
// cellar bottle down, keeping the add-wine sheet open) can. Caller resolves
// auth first. Returns the new row + its glass position.
export async function insertTastingWineFromCatalogRow(
  supabase: TastingDb,
  userId: string,
  tastingId: string,
  catalogWineId: string,
): Promise<{ error: string } | { wineId: string; position: number }> {
  const { data: tasting } = await supabase
    .from("tastings")
    .select("id, host_id, wine_source, reveal_mode")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) return { error: "Tasting not found." };

  let contributorParticipantId: string | null = null;
  if (tasting.wine_source === "PARTICIPANT_CONTRIBUTED") {
    const { data: participant } = await supabase
      .from("tasting_participants")
      .select("id")
      .eq("tasting_id", tastingId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!participant) return { error: "You're not a participant in this tasting." };
    contributorParticipantId = participant.id;
  } else if (tasting.host_id !== userId) {
    return { error: "Only the host can add wines to this tasting." };
  }

  const { data: cw } = await supabase
    .from("catalog_wines")
    .select(
      "country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years, image_url",
    )
    .eq("id", catalogWineId)
    .maybeSingle();
  if (!cw) return { error: "That catalog wine no longer exists." };

  const { count } = await supabase
    .from("wines")
    .select("id", { count: "exact", head: true })
    .eq("tasting_id", tastingId);
  const position = (count ?? 0) + 1;
  const { data: wine, error: wineError } = await supabase
    .from("wines")
    .insert({
      tasting_id: tastingId,
      position,
      contributor_participant_id: contributorParticipantId,
      // Same rule as addWine: an OPEN tasting hides nothing.
      is_revealed: tasting.reveal_mode === "OPEN",
    })
    .select()
    .single();
  if (wineError || !wine) return { error: wineError?.message ?? "Could not add the wine." };

  const { error: answerError } = await supabase.from("wine_answers").insert({
    wine_id: wine.id,
    country_id: cw.country_id,
    region_id: cw.region_id,
    appellation_id: cw.appellation_id,
    primary_grape_id: cw.primary_grape_id,
    secondary_grape_id: cw.secondary_grape_id,
    producer_id: cw.producer_id,
    type_designation_id: cw.type_designation_id,
    vintage_kind: cw.vintage_kind,
    vintage_year: cw.vintage_year,
    vintage_tawny_years: cw.vintage_tawny_years,
    // The catalog photo rides along so the reveal shows the label, as a
    // hand-entered answer's photo does.
    image_url: cw.image_url,
    catalog_wine_id: catalogWineId,
  });
  if (answerError) {
    await supabase.from("wines").delete().eq("id", wine.id);
    return { error: answerError.message };
  }
  return { wineId: wine.id, position };
}
