import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { blendNeedsReplace, storableBlend } from "../blend-sync";
import { toCompleteWine, toUnidentifiedWine } from "../complete";
import { describeMissing } from "../describe";
import { foldName } from "../fold";
import type {
  BlendRow, CompleteWine, RefChoice, UnidentifiedWine,
  WineColour, WineFieldKey, WineIdentityDraft, WineStyle,
} from "../types";

// The one server write path for a wine identity (D2, spec §B.9). Every server
// write that turns a draft into catalog rows comes through here, so the
// completeness rule, the producer and grape resolution and the fill rule for a
// catalog wine can never drift between the flight, cellar, catalog and note paths.
//
// Deliberately NOT a "use server" file: every export of one of those is a server
// action reachable by a direct POST (node_modules/next/dist/docs/01-app/02-guides/
// data-security.md). These helpers trust a caller-supplied Supabase client and
// user id, so they must only be reached through an action that has already
// authenticated the caller. `server-only` keeps them out of every client bundle.
//
// Error channel: `prepareCompleteWine`, `prepareUnidentifiedWine` and
// `upsertCatalogWine` never throw. Every failure comes back as a `WriteRefusal`,
// so no server action surfaces an unhandled throw. The building blocks
// (`resolveProducer`, `findOrCreateGrapeFolded`, `fillCatalogWine`) throw.

type Db = SupabaseClient<Database>;

export type WriteRefusal = { error: string; missing?: WineFieldKey[] };

export type ResolvedWine = Omit<CompleteWine, "producer" | "blend" | "primaryGrape" | "secondaryGrape"> & {
  producerId: string;
  blend: { grapeId: string; percentage: number | null }[];
  primaryGrapeId: string;
  secondaryGrapeId: string | null;
};
export type ResolvedUnidentifiedWine = Omit<ResolvedWine, "producerId" | "colour" | "style" | "appellationId"> & {
  producerId: string | null;
  colour: WineColour | null;
  style: WineStyle | null;
  appellationId: string | null;
};

/** PostgREST silently caps one read at 1000 rows. */
const PAGE_SIZE = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A reference id in the draft that names no row. A malformed id counts too, so
    it never reaches Postgres as an invalid-uuid error. The prepare functions turn
    it into that field's completeness refusal, so the form flags the field. */
class ReferenceNotFound extends Error {
  readonly field: WineFieldKey;

  constructor(message: string, field: WineFieldKey) {
    super(message);
    this.name = "ReferenceNotFound";
    this.field = field;
  }
}

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

/** The one refusal wording (D2): "This wine needs a vintage." */
function refusalFor(missing: WineFieldKey[]): WriteRefusal {
  return { error: "This wine " + describeMissing(missing) + ".", missing };
}

function refusalFromError(error: unknown, what: string): WriteRefusal {
  if (error instanceof ReferenceNotFound) return refusalFor([error.field]);
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${what} failed`, { message });
  return { error: message };
}

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === "";
}

/**
 * The producer id for a choice (spec §B.7). An `existing` choice is verified by
 * id; a missing id throws `Error("Producer not found")`. A `pending` name goes
 * through `find_or_create_producer`: a name that folds equal to an existing
 * producer reuses it (byhand-1, scan-3), and a new one takes `regionId` as its
 * region link.
 */
export async function resolveProducer(supabase: Db, choice: RefChoice, regionId: string | null): Promise<string> {
  if (choice.kind === "existing") {
    if (!UUID.test(choice.id)) throw new ReferenceNotFound("Producer not found", "producer");
    const { data, error } = await supabase.from("producers").select("id").eq("id", choice.id).maybeSingle();
    check(error, "producer lookup");
    if (!data) throw new ReferenceNotFound("Producer not found", "producer");
    return data.id;
  }
  const { data, error } = await supabase.rpc("find_or_create_producer", {
    p_name: choice.name,
    p_region_id: regionId,
  });
  check(error, "find_or_create_producer");
  if (!data) throw new Error("find_or_create_producer returned no producer");
  return data;
}

/** A grape whose name folds equal to `folded`. An exact name wins; otherwise the
    first folded-equal grape in name order. Read in pages, so a cap never hides one. */
async function findGrapeFolded(supabase: Db, name: string, folded: string): Promise<string | null> {
  let firstFolded: string | null = null;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("grapes")
      .select("id, name")
      .order("name")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    check(error, "grapes");
    const page = data ?? [];
    for (const grape of page) {
      if (grape.name === name) return grape.id;
      if (firstFolded === null && foldName(grape.name) === folded) firstFolded = grape.id;
    }
    if (page.length < PAGE_SIZE) return firstFolded;
  }
}

/**
 * The grape id for a name (spec §B.9 step 4). Folded equality over `grapes`, so
 * "Grüner Veltliner" and "gruner veltliner" are one grape. A miss inserts the
 * trimmed, space-collapsed name. A 23505 (someone inserted it in between) is
 * retried once.
 */
export async function findOrCreateGrapeFolded(supabase: Db, name: string): Promise<string> {
  const folded = foldName(name);
  if (folded === "") throw new Error("Grape name is empty");
  const stored = name.trim().replace(/\s+/g, " ");

  const found = await findGrapeFolded(supabase, stored, folded);
  if (found) return found;

  const { data, error } = await supabase.from("grapes").insert({ name: stored }).select("id").single();
  if (!error && data) return data.id;
  if (error?.code === "23505") {
    const retried = await findGrapeFolded(supabase, stored, folded);
    if (retried) return retried;
  }
  throw new Error(`grape insert failed: ${error?.message ?? "no row returned"}`);
}

/** Existing grape ids verified in one read, pending names found or created, then
    the storable blend: deduped by id (a pending name can resolve to a grape the
    blend already lists), percentages in range, and the trigger's order. */
async function resolveBlend(supabase: Db, rows: readonly BlendRow[]): Promise<ResolvedWine["blend"]> {
  const existingIds = [...new Set(rows.flatMap((row) => (row.grape.kind === "existing" ? [row.grape.id] : [])))];
  if (existingIds.some((id) => !UUID.test(id))) throw new ReferenceNotFound("Grape not found", "primaryGrape");
  if (existingIds.length > 0) {
    const { data, error } = await supabase.from("grapes").select("id").in("id", existingIds);
    check(error, "grape lookup");
    const known = new Set((data ?? []).map((grape) => grape.id));
    if (existingIds.some((id) => !known.has(id))) throw new ReferenceNotFound("Grape not found", "primaryGrape");
  }

  const resolved: ResolvedWine["blend"] = [];
  for (const row of rows) {
    const grapeId = row.grape.kind === "existing"
      ? row.grape.id
      : await findOrCreateGrapeFolded(supabase, row.grape.name);
    resolved.push({ grapeId, percentage: row.percentage });
  }
  return storableBlend(resolved);
}

async function appellationRegionId(supabase: Db, appellationId: string): Promise<string | null> {
  if (!UUID.test(appellationId)) return null;
  const { data, error } = await supabase
    .from("appellations")
    .select("region_id")
    .eq("id", appellationId)
    .maybeSingle();
  check(error, "appellation lookup");
  return data?.region_id ?? null;
}

async function regionCountryId(supabase: Db, regionId: string): Promise<string | null> {
  if (!UUID.test(regionId)) return null;
  const { data, error } = await supabase.from("regions").select("country_id").eq("id", regionId).maybeSingle();
  check(error, "region lookup");
  return data?.country_id ?? null;
}

/** Spec §B.9 step 2: the appellation sits in the region, and the region in the
    country. An unknown appellation or region fails its check the same way. */
async function consistencyRefusal(
  supabase: Db,
  place: { countryId: string; regionId: string; appellationId: string | null },
): Promise<WriteRefusal | null> {
  const [appellationRegion, regionCountry] = await Promise.all([
    place.appellationId === null ? Promise.resolve(null) : appellationRegionId(supabase, place.appellationId),
    regionCountryId(supabase, place.regionId),
  ]);
  if (place.appellationId !== null && appellationRegion !== place.regionId) {
    return { error: "The appellation is not in the chosen region.", missing: ["appellation"] };
  }
  if (regionCountry !== place.countryId) {
    return { error: "The region is not in the chosen country.", missing: ["region"] };
  }
  return null;
}

/**
 * A draft ready for a catalog write, as ids only (spec §B.9 steps 1–5):
 * completeness through `toCompleteWine`, the place's consistency, the producer
 * (a new one linked to the chosen region), then the grapes. Never throws.
 */
export async function prepareCompleteWine(
  supabase: Db,
  draft: WineIdentityDraft,
): Promise<{ wine: ResolvedWine } | WriteRefusal> {
  const complete = toCompleteWine(draft);
  if ("missing" in complete) return refusalFor(complete.missing);
  const wine = complete.wine;

  try {
    const inconsistent = await consistencyRefusal(supabase, wine);
    if (inconsistent) return inconsistent;

    const producerId = await resolveProducer(supabase, wine.producer, wine.regionId);
    const blend = await resolveBlend(supabase, wine.blend);
    if (blend.length === 0) return refusalFor(["primaryGrape"]);

    return {
      wine: {
        producerId,
        wineName: wine.wineName,
        vintage: wine.vintage,
        colour: wine.colour,
        style: wine.style,
        countryId: wine.countryId,
        regionId: wine.regionId,
        appellationId: wine.appellationId,
        blend,
        primaryGrapeId: blend[0].grapeId,
        secondaryGrapeId: blend[1]?.grapeId ?? null,
        typeDesignationId: wine.typeDesignationId,
        alcohol: wine.alcohol,
        description: wine.description,
        imageUrl: wine.imageUrl,
      },
    };
  } catch (error) {
    return refusalFromError(error, "prepareCompleteWine");
  }
}

/**
 * The same steps for the flight-only "I can't identify this bottle" glass
 * (byhand-7): completeness through `toUnidentifiedWine`, so producer, colour,
 * style and appellation may be absent. A given appellation is still checked
 * against the region, and a given producer is still resolved. Never throws.
 */
export async function prepareUnidentifiedWine(
  supabase: Db,
  draft: WineIdentityDraft,
): Promise<{ wine: ResolvedUnidentifiedWine } | WriteRefusal> {
  const unidentified = toUnidentifiedWine(draft);
  if ("missing" in unidentified) return refusalFor(unidentified.missing);
  const wine: UnidentifiedWine = unidentified.wine;

  try {
    const inconsistent = await consistencyRefusal(supabase, wine);
    if (inconsistent) return inconsistent;

    const producerId = wine.producer ? await resolveProducer(supabase, wine.producer, wine.regionId) : null;
    const blend = await resolveBlend(supabase, wine.blend);
    if (blend.length === 0) return refusalFor(["primaryGrape"]);

    return {
      wine: {
        producerId,
        wineName: wine.wineName,
        vintage: wine.vintage,
        colour: wine.colour,
        style: wine.style,
        countryId: wine.countryId,
        regionId: wine.regionId,
        appellationId: wine.appellationId,
        blend,
        primaryGrapeId: blend[0].grapeId,
        secondaryGrapeId: blend[1]?.grapeId ?? null,
        typeDesignationId: wine.typeDesignationId,
        alcohol: wine.alcohol,
        description: wine.description,
        imageUrl: wine.imageUrl,
      },
    };
  } catch (error) {
    return refusalFromError(error, "prepareUnidentifiedWine");
  }
}

/** `coalesce(lower(btrim(wine_name)), '')`, the name half of
    `catalog_wines_identity_key` (20260829215000). SQL btrim trims only spaces. */
function identityName(name: string | null): string {
  return (name ?? "").replace(/^ +| +$/g, "").toLowerCase();
}

/** Whether a live catalog row already holds this identity: the same columns
    `find_or_create_catalog_wine` matches on. */
async function identityExists(supabase: Db, wine: ResolvedWine): Promise<boolean> {
  let query = supabase
    .from("catalog_wines")
    .select("id, wine_name")
    .eq("producer_id", wine.producerId)
    .eq("appellation_id", wine.appellationId)
    .eq("colour", wine.colour)
    .eq("vintage_kind", wine.vintage.kind)
    // `merged_into` exists (20260829203000_catalog_curation) but not in the
    // hand-written database.types.ts, so it goes through the untyped filter.
    .filter("merged_into", "is", null);
  query = wine.vintage.year === null
    ? query.is("vintage_year", null)
    : query.eq("vintage_year", wine.vintage.year);
  query = wine.vintage.tawnyYears === null
    ? query.is("vintage_tawny_years", null)
    : query.eq("vintage_tawny_years", wine.vintage.tawnyYears);
  const { data, error } = await query;
  check(error, "catalog identity lookup");
  const name = identityName(wine.wineName);
  return (data ?? []).some((row) => identityName(row.wine_name) === name);
}

/** The jsonb keys every `find_or_create_catalog_wine` caller sends. A blank wine
    name is null (D3); the RPC stores `nullif(btrim(...), '')` either way. */
function catalogWinePayload(wine: ResolvedWine) {
  return {
    country_id: wine.countryId,
    region_id: wine.regionId,
    appellation_id: wine.appellationId,
    primary_grape_id: wine.primaryGrapeId,
    secondary_grape_id: wine.secondaryGrapeId,
    producer_id: wine.producerId,
    type_designation_id: wine.typeDesignationId,
    vintage_kind: wine.vintage.kind,
    vintage_year: wine.vintage.year,
    vintage_tawny_years: wine.vintage.tawnyYears,
    wine_name: wine.wineName,
    colour: wine.colour,
    style: wine.style,
  };
}

/**
 * The catalog wine for a resolved identity, found or created (spec §B.9):
 * 1. a lookup of the identity sets `written`, true only when no row existed;
 * 2. `find_or_create_catalog_wine` links to that row or inserts it. Two first adds
 *    of one identity at once make the later insert hit `catalog_wines_identity_key`
 *    (23505); that call is retried once, and it finds the other row;
 * 3. `fillCatalogWine`. A failed fill is logged and does not refuse the write: the
 *    identity is already linked, and the fill runs again on the next add.
 * Never throws.
 */
export async function upsertCatalogWine(
  supabase: Db,
  userId: string,
  wine: ResolvedWine,
): Promise<{ catalogWineId: string; written: boolean } | WriteRefusal> {
  try {
    const existed = await identityExists(supabase, wine);
    const payload = catalogWinePayload(wine);

    let written = !existed;
    let response = await supabase.rpc("find_or_create_catalog_wine", { p: payload });
    if (response.error?.code === "23505") {
      written = false;
      response = await supabase.rpc("find_or_create_catalog_wine", { p: payload });
    }
    const catalogWineId = response.data;
    if (response.error || !catalogWineId) {
      if (response.error) console.error("find_or_create_catalog_wine failed", { message: response.error.message });
      return { error: response.error?.message ?? "Could not add the wine to the catalog." };
    }

    try {
      await fillCatalogWine(supabase, userId, catalogWineId, wine);
    } catch (error) {
      console.error("fillCatalogWine failed", {
        catalogWineId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return { catalogWineId, written };
  } catch (error) {
    return refusalFromError(error, "upsertCatalogWine");
  }
}

/**
 * The one fill rule for every writer (spec §B.9). It touches only a row whose
 * `created_by` is the caller; a deduped hit on someone else's wine is left alone.
 * - `image_url` and `description` are written only when empty, and
 *   `alcohol_percent` only when null.
 * - The blend is replaced only when the stored rows are still the insert trigger's
 *   seed and the incoming blend differs (`blendNeedsReplace`), so a curated blend
 *   is never overwritten. When it is replaced, the full blend is written with its
 *   percentages (byhand-4, byhand-6).
 * Throws on a database error.
 */
export async function fillCatalogWine(
  supabase: Db,
  userId: string,
  catalogWineId: string,
  wine: ResolvedWine,
): Promise<void> {
  const { data: row, error } = await supabase
    .from("catalog_wines")
    .select("created_by, image_url, description, alcohol_percent, primary_grape_id, secondary_grape_id")
    .eq("id", catalogWineId)
    .maybeSingle();
  check(error, "catalog wine read");
  if (!row || row.created_by !== userId) return;

  const patch: Database["public"]["Tables"]["catalog_wines"]["Update"] = {};
  if (wine.imageUrl && isBlank(row.image_url)) patch.image_url = wine.imageUrl;
  if (wine.description && isBlank(row.description)) patch.description = wine.description;
  if (wine.alcohol !== null && row.alcohol_percent === null) patch.alcohol_percent = wine.alcohol;
  if (Object.keys(patch).length > 0) {
    // One statement, so the edit-audit trigger records one change.
    const { error: updateError } = await supabase
      .from("catalog_wines")
      .update(patch)
      .eq("id", catalogWineId)
      .eq("created_by", userId);
    check(updateError, "catalog wine fill");
  }

  const incoming = storableBlend(wine.blend);
  if (incoming.length === 0) return;
  const { data: stored, error: storedError } = await supabase
    .from("catalog_wine_grapes")
    .select("grape_id, percentage")
    .eq("catalog_wine_id", catalogWineId)
    .order("sort_order");
  check(storedError, "catalog wine blend read");
  const storedRows = (stored ?? []).map((grape) => ({
    grapeId: grape.grape_id,
    percentage: grape.percentage === null ? null : Number(grape.percentage),
  }));
  const seeded = { primaryGrapeId: row.primary_grape_id, secondaryGrapeId: row.secondary_grape_id };
  if (!blendNeedsReplace(storedRows, seeded, incoming)) return;

  // Upsert the full blend first, then drop the grapes it no longer lists, so the
  // wine never passes through a state with no blend rows. The recompute trigger
  // derives primary and secondary from the final rows, in the same order.
  const { error: upsertError } = await supabase.from("catalog_wine_grapes").upsert(
    incoming.map((grape, index) => ({
      catalog_wine_id: catalogWineId,
      grape_id: grape.grapeId,
      percentage: grape.percentage,
      sort_order: index,
    })),
    { onConflict: "catalog_wine_id,grape_id" },
  );
  check(upsertError, "catalog wine blend write");
  const { error: trimError } = await supabase
    .from("catalog_wine_grapes")
    .delete()
    .eq("catalog_wine_id", catalogWineId)
    .not("grape_id", "in", `(${incoming.map((grape) => grape.grapeId).join(",")})`);
  check(trimError, "catalog wine blend trim");
}
