"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { VintageKind } from "@/lib/supabase/database.types";

type ReferenceOption = { id: string; name: string };

// Two lookups + an insert, kept simple and type-safe by taking the already
// -built find/create queries as closures rather than a dynamic table name
// (Supabase's typed client can't take a table name as a plain string).
async function findOrCreate(
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

export async function createCountry(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  return findOrCreate(
    () =>
      supabase.from("countries").select("id, name").eq("name", trimmed).maybeSingle(),
    () => supabase.from("countries").insert({ name: trimmed }).select("id, name").single(),
  );
}

export async function createGrape(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  return findOrCreate(
    () => supabase.from("grapes").select("id, name").eq("name", trimmed).maybeSingle(),
    () => supabase.from("grapes").insert({ name: trimmed }).select("id, name").single(),
  );
}

export async function createProducer(regionId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
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

export async function createTypeDesignation(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  return findOrCreate(
    () =>
      supabase
        .from("type_designations")
        .select("id, name")
        .eq("name", trimmed)
        .maybeSingle(),
    () =>
      supabase
        .from("type_designations")
        .insert({ name: trimmed })
        .select("id, name")
        .single(),
  );
}

export async function createRegion(countryId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  return findOrCreate(
    () =>
      supabase
        .from("regions")
        .select("id, name")
        .eq("country_id", countryId)
        .eq("name", trimmed)
        .maybeSingle(),
    () =>
      supabase
        .from("regions")
        .insert({ country_id: countryId, name: trimmed })
        .select("id, name")
        .single(),
  );
}

export async function createAppellation(regionId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  return findOrCreate(
    () =>
      supabase
        .from("appellations")
        .select("id, name")
        .eq("region_id", regionId)
        .eq("name", trimmed)
        .maybeSingle(),
    () =>
      supabase
        .from("appellations")
        .insert({ region_id: regionId, name: trimmed })
        .select("id, name")
        .single(),
  );
}

type BlendGrape = { grapeId: string; percentage: number | null };

// The wine forms submit the grape blend as one JSON field (grape_blend). The
// lead entry is the primary grape, the next the secondary — no form shows a raw
// primary/secondary picker outside blind guessing + scoring.
function parseBlend(formData: FormData): BlendGrape[] {
  try {
    const arr = JSON.parse(String(formData.get("grape_blend") ?? "[]"));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((g) => g && typeof g.grapeId === "string" && g.grapeId)
      .map((g) => ({
        grapeId: g.grapeId as string,
        percentage: typeof g.percentage === "number" ? g.percentage : null,
      }));
  } catch {
    return [];
  }
}

// Persist the full blend on the catalog wine (its trigger recomputes the lead
// grape as primary/secondary). Only a wine this user owns is touched, so a
// deduped/existing wine keeps its own blend.
async function syncCatalogWine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  catalogWineId: string,
  userId: string,
  blend: BlendGrape[],
  imageUrl: string | null,
) {
  const { data: cw } = await supabase
    .from("catalog_wines")
    .select("created_by, image_url")
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

export type AddWineFormState = { error: string } | null;

export async function addWine(
  _prevState: AddWineFormState,
  formData: FormData,
): Promise<AddWineFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const tastingId = String(formData.get("tasting_id") ?? "");
  const countryId = String(formData.get("country_id") ?? "");
  const regionId = String(formData.get("region_id") ?? "");
  const appellationId = String(formData.get("appellation_id") ?? "") || null;
  const blend = parseBlend(formData);
  const primaryGrapeId = blend[0]?.grapeId ?? "";
  const secondaryGrapeId = blend[1]?.grapeId ?? null;
  const producerId = String(formData.get("producer_id") ?? "");
  const typeDesignationId =
    String(formData.get("type_designation_id") ?? "") || null;
  const imageUrl = String(formData.get("image_url") ?? "").trim() || null;
  const vintageKind = String(formData.get("vintage_kind") ?? "") as VintageKind;
  const vintageYearRaw = String(formData.get("vintage_year") ?? "");
  const vintageTawnyYearsRaw = String(
    formData.get("vintage_tawny_years") ?? "",
  );
  const wineName = String(formData.get("wine_name") ?? "").trim();
  const colour = String(formData.get("colour") ?? "");
  const style = String(formData.get("style") ?? "");
  // Catalog-first: every tasting wine is a fully-identified real wine, so the old
  // producer/vintage "unknown" escape hatches are gone.
  const producerUnknown = false;
  const vintageUnknown = false;

  if (
    !countryId || !regionId || !appellationId || !primaryGrapeId ||
    !producerId || !colour || !style
  ) {
    return {
      error:
        "Country, region, appellation, grape, producer, colour and style are required.",
    };
  }
  if (!vintageUnknown && !["YEAR", "NV", "TAWNY"].includes(vintageKind)) {
    return { error: "Choose a vintage type." };
  }

  let vintageYear: number | null = null;
  let vintageTawnyYears: number | null = null;
  if (vintageUnknown) {
    // kind/year/tawny all stored as null — nothing to validate
  } else if (vintageKind === "YEAR") {
    vintageYear = parseInt(vintageYearRaw, 10);
    if (!Number.isFinite(vintageYear)) {
      return { error: "Enter a vintage year." };
    }
  } else if (vintageKind === "TAWNY") {
    vintageTawnyYears = parseInt(vintageTawnyYearsRaw, 10);
    if (!Number.isFinite(vintageTawnyYears)) {
      return { error: "Choose the tawny age statement." };
    }
  }

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
      .eq("user_id", user.id)
      .maybeSingle();
    if (!participant) {
      return { error: "You're not a participant in this tasting." };
    }
    // Bring-your-own allows any number of bottles per person (including
    // none) — no one-wine-per-participant cap.
    contributorParticipantId = participant.id;
  } else if (tasting.host_id !== user.id) {
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
    country_id: countryId,
    region_id: regionId,
    appellation_id: appellationId,
    primary_grape_id: primaryGrapeId,
    secondary_grape_id: secondaryGrapeId,
    producer_id: producerId,
    type_designation_id: typeDesignationId,
    vintage_kind: vintageKind,
    vintage_year: vintageYear,
    vintage_tawny_years: vintageTawnyYears,
    wine_name: wineName,
    colour,
    style,
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
    country_id: countryId,
    region_id: regionId,
    appellation_id: appellationId,
    primary_grape_id: primaryGrapeId,
    secondary_grape_id: secondaryGrapeId,
    producer_id: producerUnknown ? null : producerId,
    type_designation_id: typeDesignationId,
    image_url: imageUrl,
    vintage_kind: vintageUnknown ? null : vintageKind,
    vintage_year: vintageYear,
    vintage_tawny_years: vintageTawnyYears,
    catalog_wine_id: catalogWineId,
  });
  if (answerError) {
    await supabase.from("wines").delete().eq("id", wine.id);
    return { error: answerError.message };
  }

  await syncCatalogWine(supabase, catalogWineId, user.id, blend, imageUrl);
  redirect(`/tastings/${tastingId}`);
}

// Rewrites an existing wine's answer key. Only while the tasting is still
// DRAFT, and only by whoever added the wine — the host for host-entered
// wines, the contributing participant for their own BYO bottle.
export async function updateWine(
  _prevState: AddWineFormState,
  formData: FormData,
): Promise<AddWineFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const tastingId = String(formData.get("tasting_id") ?? "");
  const wineId = String(formData.get("wine_id") ?? "");
  const countryId = String(formData.get("country_id") ?? "");
  const regionId = String(formData.get("region_id") ?? "");
  const appellationId = String(formData.get("appellation_id") ?? "") || null;
  const blend = parseBlend(formData);
  const primaryGrapeId = blend[0]?.grapeId ?? "";
  const secondaryGrapeId = blend[1]?.grapeId ?? null;
  const producerId = String(formData.get("producer_id") ?? "");
  const typeDesignationId =
    String(formData.get("type_designation_id") ?? "") || null;
  const imageUrl = String(formData.get("image_url") ?? "").trim() || null;
  const vintageKind = String(formData.get("vintage_kind") ?? "") as VintageKind;
  const vintageYearRaw = String(formData.get("vintage_year") ?? "");
  const vintageTawnyYearsRaw = String(
    formData.get("vintage_tawny_years") ?? "",
  );
  const wineName = String(formData.get("wine_name") ?? "").trim();
  const colour = String(formData.get("colour") ?? "");
  const style = String(formData.get("style") ?? "");
  // Catalog-first: every tasting wine is a fully-identified real wine, so the old
  // producer/vintage "unknown" escape hatches are gone.
  const producerUnknown = false;
  const vintageUnknown = false;

  if (
    !countryId || !regionId || !appellationId || !primaryGrapeId ||
    !producerId || !colour || !style
  ) {
    return {
      error:
        "Country, region, appellation, grape, producer, colour and style are required.",
    };
  }
  if (!vintageUnknown && !["YEAR", "NV", "TAWNY"].includes(vintageKind)) {
    return { error: "Choose a vintage type." };
  }

  let vintageYear: number | null = null;
  let vintageTawnyYears: number | null = null;
  if (vintageUnknown) {
    // kind/year/tawny all stored as null — nothing to validate
  } else if (vintageKind === "YEAR") {
    vintageYear = parseInt(vintageYearRaw, 10);
    if (!Number.isFinite(vintageYear)) {
      return { error: "Enter a vintage year." };
    }
  } else if (vintageKind === "TAWNY") {
    vintageTawnyYears = parseInt(vintageTawnyYearsRaw, 10);
    if (!Number.isFinite(vintageTawnyYears)) {
      return { error: "Choose the tawny age statement." };
    }
  }

  const { data: tasting } = await supabase
    .from("tastings")
    .select("id, host_id, status")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) {
    return { error: "Tasting not found." };
  }
  if (tasting.status !== "DRAFT") {
    return { error: "Wines can only be edited before the tasting starts." };
  }

  const { data: wine } = await supabase
    .from("wines")
    .select("id, tasting_id, contributor_participant_id, is_revealed")
    .eq("id", wineId)
    .maybeSingle();
  if (!wine || wine.tasting_id !== tastingId) {
    return { error: "Wine not found." };
  }
  if (wine.is_revealed) {
    return { error: "This wine has already been revealed." };
  }

  if (wine.contributor_participant_id) {
    const { data: contributor } = await supabase
      .from("tasting_participants")
      .select("user_id")
      .eq("id", wine.contributor_participant_id)
      .maybeSingle();
    if (contributor?.user_id !== user.id) {
      return { error: "Only whoever added this wine can edit it." };
    }
  } else if (tasting.host_id !== user.id) {
    return { error: "Only whoever added this wine can edit it." };
  }

  // Re-resolve the catalog link so it follows any answer edit.
  const answerSnapshot = {
    country_id: countryId,
    region_id: regionId,
    appellation_id: appellationId,
    primary_grape_id: primaryGrapeId,
    secondary_grape_id: secondaryGrapeId,
    producer_id: producerId,
    type_designation_id: typeDesignationId,
    vintage_kind: vintageKind,
    vintage_year: vintageYear,
    vintage_tawny_years: vintageTawnyYears,
    wine_name: wineName,
    colour,
    style,
  };
  const { data: catalogWineId, error: catalogError } = await supabase.rpc(
    "find_or_create_catalog_wine",
    { p: answerSnapshot },
  );
  if (catalogError || !catalogWineId) {
    return {
      error: catalogError?.message ?? "Could not link the wine to the catalog.",
    };
  }

  const { error: answerError } = await supabase
    .from("wine_answers")
    .update({
      country_id: countryId,
      region_id: regionId,
      appellation_id: appellationId,
      primary_grape_id: primaryGrapeId,
      secondary_grape_id: secondaryGrapeId,
      producer_id: producerUnknown ? null : producerId,
      type_designation_id: typeDesignationId,
      image_url: imageUrl,
      vintage_kind: vintageUnknown ? null : vintageKind,
      vintage_year: vintageYear,
      vintage_tawny_years: vintageTawnyYears,
      catalog_wine_id: catalogWineId,
    })
    .eq("wine_id", wineId);
  if (answerError) {
    return { error: answerError.message };
  }

  await syncCatalogWine(supabase, catalogWineId, user.id, blend, imageUrl);
  redirect(`/tastings/${tastingId}`);
}

// --- Catalog-first pick: search the catalog, then add a wine by picking it ---

const cap = (s: string) => (s ? s[0] + s.slice(1).toLowerCase() : s);

export async function searchCatalogWines(query: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_catalog_wines", {
    p_query: query,
    p_limit: 20,
  });
  const mapped = (data ?? []).map((w) => {
    const vintage =
      w.vintage_kind === "YEAR" ? (w.vintage_year ? String(w.vintage_year) : "")
      : w.vintage_kind === "TAWNY" ? (w.vintage_tawny_years ? `${w.vintage_tawny_years}yo` : "Tawny")
      : "NV";
    const seen = new Set<string>();
    const label = [w.producer, w.wine_name, w.appellation, vintage]
      .filter(Boolean)
      .filter((p) => {
        const k = p.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .join(" ");
    return { id: w.id, name: label, group: `${cap(w.colour)} · ${cap(w.style)}` };
  });
  // The dropdown buckets CONSECUTIVE results by group, so identical colour·style
  // groups must be adjacent or the same header repeats. Sort by group (stable,
  // so the RPC's relevance order is preserved within each group).
  return mapped.sort((a, b) => a.group.localeCompare(b.group));
}

export async function addWineFromCatalog(
  tastingId: string,
  catalogWineId: string,
): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tasting } = await supabase
    .from("tastings")
    .select("id, host_id, wine_source")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) return { error: "Tasting not found." };

  let contributorParticipantId: string | null = null;
  if (tasting.wine_source === "PARTICIPANT_CONTRIBUTED") {
    const { data: participant } = await supabase
      .from("tasting_participants")
      .select("id")
      .eq("tasting_id", tastingId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!participant) return { error: "You're not a participant in this tasting." };
    contributorParticipantId = participant.id;
  } else if (tasting.host_id !== user.id) {
    return { error: "Only the host can add wines to this tasting." };
  }

  const { data: cw } = await supabase
    .from("catalog_wines")
    .select(
      "country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years",
    )
    .eq("id", catalogWineId)
    .maybeSingle();
  if (!cw) return { error: "That catalog wine no longer exists." };

  const { count } = await supabase
    .from("wines")
    .select("id", { count: "exact", head: true })
    .eq("tasting_id", tastingId);
  const { data: wine, error: wineError } = await supabase
    .from("wines")
    .insert({
      tasting_id: tastingId,
      position: (count ?? 0) + 1,
      contributor_participant_id: contributorParticipantId,
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
    catalog_wine_id: catalogWineId,
  });
  if (answerError) {
    await supabase.from("wines").delete().eq("id", wine.id);
    return { error: answerError.message };
  }
  redirect(`/tastings/${tastingId}`);
}

// The deliberate escape hatch: a bottle that genuinely can't be identified. It
// still needs the blind-answer floor (country/region/grape/vintage) to be
// guessable, but skips wine_name/colour/style/producer and lives in the separate
// catalog_wines_unidentified table — never in the shared catalog.
export async function addWineUnidentified(
  _prevState: AddWineFormState,
  formData: FormData,
): Promise<AddWineFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tastingId = String(formData.get("tasting_id") ?? "");
  const countryId = String(formData.get("country_id") ?? "");
  const regionId = String(formData.get("region_id") ?? "");
  const appellationId = String(formData.get("appellation_id") ?? "") || null;
  const blend = parseBlend(formData);
  const primaryGrapeId = blend[0]?.grapeId ?? "";
  const secondaryGrapeId = blend[1]?.grapeId ?? null;
  const producerId = String(formData.get("producer_id") ?? "") || null;
  const typeDesignationId = String(formData.get("type_designation_id") ?? "") || null;
  const imageUrl = String(formData.get("image_url") ?? "").trim() || null;
  const wineName = String(formData.get("wine_name") ?? "").trim() || null;
  const colour = (String(formData.get("colour") ?? "") || null) as
    | "WHITE" | "ROSE" | "RED" | null;
  const style = (String(formData.get("style") ?? "") || null) as
    | "STILL" | "SPARKLING" | "FORTIFIED" | null;
  const vintageKind = String(formData.get("vintage_kind") ?? "") as VintageKind;

  if (!countryId || !regionId || !primaryGrapeId) {
    return {
      error:
        "Even an unidentified bottle needs a country, region and grape to guess against.",
    };
  }
  if (!["YEAR", "NV", "TAWNY"].includes(vintageKind)) {
    return { error: "Choose a vintage type." };
  }
  let vintageYear: number | null = null;
  let vintageTawnyYears: number | null = null;
  if (vintageKind === "YEAR") {
    vintageYear = parseInt(String(formData.get("vintage_year") ?? ""), 10);
    if (!Number.isFinite(vintageYear)) return { error: "Enter a vintage year." };
  } else if (vintageKind === "TAWNY") {
    vintageTawnyYears = parseInt(String(formData.get("vintage_tawny_years") ?? ""), 10);
    if (!Number.isFinite(vintageTawnyYears)) return { error: "Choose the tawny age statement." };
  }

  const { data: tasting } = await supabase
    .from("tastings")
    .select("id, host_id, wine_source")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) return { error: "Tasting not found." };
  let contributorParticipantId: string | null = null;
  if (tasting.wine_source === "PARTICIPANT_CONTRIBUTED") {
    const { data: participant } = await supabase
      .from("tasting_participants")
      .select("id")
      .eq("tasting_id", tastingId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!participant) return { error: "You're not a participant in this tasting." };
    contributorParticipantId = participant.id;
  } else if (tasting.host_id !== user.id) {
    return { error: "Only the host can add wines to this tasting." };
  }

  const { data: unidentified, error: unidError } = await supabase
    .from("catalog_wines_unidentified")
    .insert({
      country_id: countryId,
      region_id: regionId,
      appellation_id: appellationId,
      primary_grape_id: primaryGrapeId,
      secondary_grape_id: secondaryGrapeId,
      producer_id: producerId,
      type_designation_id: typeDesignationId,
      vintage_kind: vintageKind,
      vintage_year: vintageYear,
      vintage_tawny_years: vintageTawnyYears,
      colour,
      style,
      wine_name: wineName,
      reason: "Added as an unidentified bottle during a tasting.",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (unidError || !unidentified) {
    return { error: unidError?.message ?? "Could not save the unidentified wine." };
  }

  const { count } = await supabase
    .from("wines")
    .select("id", { count: "exact", head: true })
    .eq("tasting_id", tastingId);
  const { data: wine, error: wineError } = await supabase
    .from("wines")
    .insert({
      tasting_id: tastingId,
      position: (count ?? 0) + 1,
      contributor_participant_id: contributorParticipantId,
    })
    .select()
    .single();
  if (wineError || !wine) return { error: wineError?.message ?? "Could not add the wine." };

  const { error: answerError } = await supabase.from("wine_answers").insert({
    wine_id: wine.id,
    country_id: countryId,
    region_id: regionId,
    appellation_id: appellationId,
    primary_grape_id: primaryGrapeId,
    secondary_grape_id: secondaryGrapeId,
    producer_id: producerId,
    type_designation_id: typeDesignationId,
    image_url: imageUrl,
    vintage_kind: vintageKind,
    vintage_year: vintageYear,
    vintage_tawny_years: vintageTawnyYears,
    unidentified_wine_id: unidentified.id,
  });
  if (answerError) {
    await supabase.from("wines").delete().eq("id", wine.id);
    await supabase.from("catalog_wines_unidentified").delete().eq("id", unidentified.id);
    return { error: answerError.message };
  }
  redirect(`/tastings/${tastingId}`);
}
