"use server";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { ReferenceOption } from "@/components/reference-combobox";
import { emptyDraft } from "@/lib/wine-identity/complete";
import { foldName, stripDesignationSuffix } from "@/lib/wine-identity/fold";
import { parseStoredDraft } from "@/lib/wine-identity/from-sources";
import {
  prepareCompleteWine,
  upsertCatalogWine,
  type ResolvedWine,
  type WriteRefusal,
} from "@/lib/wine-identity/server/write";
import type { WineIdentityDraft } from "@/lib/wine-identity/types";

type Db = Awaited<ReturnType<typeof createClient>>;
type CatalogWineUpdate = Database["public"]["Tables"]["catalog_wines"]["Update"];

/** PostgREST silently caps one read at 1000 rows. */
const PAGE_SIZE = 1000;

/** The sentinel region and appellation every country carries (20260829263700). */
const NONE = "None";

/** Two lookups and an insert. A 23505 (someone inserted the same row in between)
    is re-selected rather than surfaced. */
async function findOrCreateRow(
  find: () => PromiseLike<{ data: ReferenceOption | null; error: { message: string } | null }>,
  create: () => PromiseLike<{ data: ReferenceOption | null; error: { code?: string; message: string } | null }>,
): Promise<ReferenceOption> {
  const found = await find();
  if (found.error) throw new Error(found.error.message);
  if (found.data) return found.data;

  const created = await create();
  if (!created.error && created.data) return created.data;
  if (created.error?.code === "23505") {
    const retried = await find();
    if (retried.data) return retried.data;
  }
  throw new Error(created.error?.message ?? "Could not create entry.");
}

/** `%`, `_` and the escape character itself, so a name is matched literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * The region's self-named appellation, created when it has none (byhand-5, spec
 * §D.4 #8). The self-named row carries the region's exact name plus at most a
 * designation suffix ("Bourgogne AOC"; 20260713180000 and
 * scripts/add-appellation-designations.mjs), so the candidates are the region's
 * appellations that start with its name, read in pages until a short one. A new
 * row is named exactly as the region, as 20260713180000 did.
 */
async function ensureSelfNamedAppellation(supabase: Db, region: ReferenceOption): Promise<void> {
  const regionFolded = foldName(region.name);
  const pattern = `${escapeLike(region.name)}%`;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("appellations")
      .select("id, name")
      .eq("region_id", region.id)
      .ilike("name", pattern)
      .order("name")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    if (page.some((row) => foldName(stripDesignationSuffix(row.name)) === regionFolded)) return;
    if (page.length < PAGE_SIZE) break;
  }
  const { error } = await supabase.from("appellations").insert({ region_id: region.id, name: region.name });
  // 23505: the exact name was inserted in between, so it exists now.
  if (error && error.code !== "23505") throw new Error(error.message);
}

/** A new country also gets its "None" region and "None" appellation, named as
    20260829263700 names them, so a wine with no geographic indication stays
    representable. */
export async function createCountry(name: string): Promise<ReferenceOption> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  const country = await findOrCreateRow(
    () => supabase.from("countries").select("id, name").eq("name", trimmed).maybeSingle(),
    () => supabase.from("countries").insert({ name: trimmed }).select("id, name").single(),
  );
  const noneRegion = await findOrCreateRow(
    () =>
      supabase.from("regions").select("id, name").eq("country_id", country.id).eq("name", NONE).maybeSingle(),
    () =>
      supabase.from("regions").insert({ country_id: country.id, name: NONE }).select("id, name").single(),
  );
  await ensureSelfNamedAppellation(supabase, noneRegion);
  return country;
}

export async function createGrape(name: string): Promise<ReferenceOption> {
  const supabase = await createClient();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Grape name is required.");
  // Reuse an exact-name match so re-adding a known grape never spawns a
  // duplicate row.
  const existing = await supabase
    .from("grapes")
    .select("id, name")
    .eq("name", trimmed)
    .maybeSingle();
  if (existing.data) return existing.data;
  const { data, error } = await supabase
    .from("grapes")
    .insert({ name: trimmed })
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** A region, found or created, always with its self-named appellation, so "Just
    the region" is a real choice for it (byhand-5). */
export async function createRegion(countryId: string, name: string): Promise<ReferenceOption> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  const region = await findOrCreateRow(
    () =>
      supabase.from("regions").select("id, name").eq("country_id", countryId).eq("name", trimmed).maybeSingle(),
    () =>
      supabase.from("regions").insert({ country_id: countryId, name: trimmed }).select("id, name").single(),
  );
  await ensureSelfNamedAppellation(supabase, region);
  return region;
}

export async function createAppellation(regionId: string, name: string): Promise<ReferenceOption> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appellations")
    .insert({ region_id: regionId, name })
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** A catalog wine's structured profile, stored as distinct catalog columns and
    edited in Manage wine. Every part is optional. */
export type WineProfileInput = {
  wineryDescription: string | null;
  aroma: string | null;
  tastingNotes: string | null;
  foodPairing: string | null;
  servingTempC: { min: number; max: number } | null;
  decantMinutes: number | null;
  /** The form's value only. The write stores the draft's `alcohol` instead,
      which the wine-identity module keeps inside (0, 100). */
  alcoholPercent: number | null;
};

/** What the catalog page's form sends. The identity is a draft; the one write
    path checks it and resolves every pending name (D2). */
export type CatalogWineInput = {
  draft: WineIdentityDraft;
  profile?: WineProfileInput | null;
  /** Average retail price per bottle in DKK, as the form's text ("" = unknown). */
  estimatedPrice?: string | null;
};

/** The draft from an untrusted payload. A malformed one is treated as a draft
    with every field missing, so the refusal names them. */
function draftFrom(input: { draft?: unknown } | null | undefined): WineIdentityDraft {
  return parseStoredDraft(input?.draft) ?? emptyDraft();
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === "";
}

/** "" and anything that is not a non-negative number mean "unknown". */
function priceOrNull(value: string | null | undefined): number | null {
  const trimmed = blankToNull(value);
  if (trimmed === null) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The profile columns, except `alcohol_percent`, which comes from the draft. */
function profileColumns(p: WineProfileInput): CatalogWineUpdate {
  const min = numberOrNull(p.servingTempC?.min);
  const max = numberOrNull(p.servingTempC?.max);
  const range = min !== null && max !== null;
  return {
    winery_description: blankToNull(p.wineryDescription),
    aroma: blankToNull(p.aroma),
    tasting_notes: blankToNull(p.tastingNotes),
    food_pairing: blankToNull(p.foodPairing),
    serving_temp_min_c: range ? min : null,
    serving_temp_max_c: range ? max : null,
    decant_minutes: numberOrNull(p.decantMinutes),
  };
}

function logFailure(what: string, error: unknown): void {
  console.error(`${what} failed`, { message: error instanceof Error ? error.message : String(error) });
}

/**
 * The profile and price on a wine the caller just created or linked, only on a
 * row the caller created and only into empty columns, so a deduped hit on
 * someone else's wine, or a curated profile, is never overwritten. A failed fill
 * is logged and does not refuse the add: the identity is already linked.
 */
async function fillProfileAndPrice(
  supabase: Db,
  userId: string,
  catalogWineId: string,
  input: CatalogWineInput,
): Promise<void> {
  const profile = input.profile ? profileColumns(input.profile) : null;
  const price = priceOrNull(input.estimatedPrice);
  if (!profile && price === null) return;

  const { data: row, error } = await supabase
    .from("catalog_wines")
    .select(
      "created_by, winery_description, aroma, tasting_notes, food_pairing, serving_temp_min_c, serving_temp_max_c, decant_minutes, estimated_price",
    )
    .eq("id", catalogWineId)
    .maybeSingle();
  if (error) return logFailure("catalog profile read", error.message);
  if (!row || row.created_by !== userId) return;

  const patch: CatalogWineUpdate = {};
  if (profile) {
    if (profile.winery_description && isBlank(row.winery_description)) patch.winery_description = profile.winery_description;
    if (profile.aroma && isBlank(row.aroma)) patch.aroma = profile.aroma;
    if (profile.tasting_notes && isBlank(row.tasting_notes)) patch.tasting_notes = profile.tasting_notes;
    if (profile.food_pairing && isBlank(row.food_pairing)) patch.food_pairing = profile.food_pairing;
    if (
      profile.serving_temp_min_c != null && profile.serving_temp_max_c != null
      && row.serving_temp_min_c === null && row.serving_temp_max_c === null
    ) {
      patch.serving_temp_min_c = profile.serving_temp_min_c;
      patch.serving_temp_max_c = profile.serving_temp_max_c;
    }
    if (profile.decant_minutes != null && row.decant_minutes === null) patch.decant_minutes = profile.decant_minutes;
  }
  if (price !== null && row.estimated_price === null) {
    patch.estimated_price = price;
    patch.estimated_price_currency = "DKK";
  }
  if (Object.keys(patch).length === 0) return;

  // One statement, so the edit-audit trigger records one change.
  const { error: updateError } = await supabase
    .from("catalog_wines")
    .update(patch)
    .eq("id", catalogWineId)
    .eq("created_by", userId);
  if (updateError) logFailure("catalog profile fill", updateError.message);
}

/**
 * The catalog page's create (spec §B.9 "Catalog page create"). The draft goes
 * through `prepareCompleteWine` and `upsertCatalogWine`, so an identity that is
 * already in the catalog is linked (`written: false`) instead of raising
 * `catalog_wines_identity_key`. Never throws.
 */
export async function createCatalogWine(
  input: CatalogWineInput,
): Promise<{ catalogWineId: string; written: boolean } | WriteRefusal> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You must be signed in to add a wine." };

    const prepared = await prepareCompleteWine(supabase, draftFrom(input));
    if ("error" in prepared) return prepared;
    const upserted = await upsertCatalogWine(supabase, user.id, prepared.wine);
    if ("error" in upserted) return upserted;

    try {
      await fillProfileAndPrice(supabase, user.id, upserted.catalogWineId, input);
    } catch (error) {
      logFailure("catalog profile fill", error);
    }
    return { catalogWineId: upserted.catalogWineId, written: upserted.written };
  } catch (error) {
    logFailure("createCatalogWine", error);
    return { error: "Could not add the wine." };
  }
}

/** The explicit blend edit in Manage wine replaces the stored blend: the full
    blend is upserted first, then the grapes it no longer lists are dropped, so
    the wine never passes through a state with no blend rows. */
async function replaceBlend(supabase: Db, catalogWineId: string, blend: ResolvedWine["blend"]): Promise<string | null> {
  const { error: upsertError } = await supabase.from("catalog_wine_grapes").upsert(
    blend.map((grape, index) => ({
      catalog_wine_id: catalogWineId,
      grape_id: grape.grapeId,
      percentage: grape.percentage,
      sort_order: index,
    })),
    { onConflict: "catalog_wine_id,grape_id" },
  );
  if (upsertError) return upsertError.message;
  const { error: trimError } = await supabase
    .from("catalog_wine_grapes")
    .delete()
    .eq("catalog_wine_id", catalogWineId)
    .not("grape_id", "in", `(${blend.map((grape) => grape.grapeId).join(",")})`);
  return trimError ? trimError.message : null;
}

/**
 * A curator's or the creator's edit (spec §B.9 "Manage wine"). RLS ("catalog
 * update") decides who may write, so an update that touches no row is refused
 * with "You can't edit this wine." The audit trigger records before and after.
 * Because cellars reference the wine by id, the edit updates everyone's cellar
 * view. The profile is written only when the caller sends one, so an edit that
 * omits it leaves the wine's tasting notes alone. Never throws.
 */
export async function updateCatalogWine(
  wineId: string,
  input: CatalogWineInput,
): Promise<{ id: string } | WriteRefusal> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You must be signed in to edit a wine." };

    const prepared = await prepareCompleteWine(supabase, draftFrom(input));
    if ("error" in prepared) return prepared;
    const wine = prepared.wine;

    const patch: CatalogWineUpdate = {
      country_id: wine.countryId,
      region_id: wine.regionId,
      appellation_id: wine.appellationId,
      primary_grape_id: wine.primaryGrapeId,
      secondary_grape_id: wine.secondaryGrapeId,
      producer_id: wine.producerId,
      type_designation_id: wine.typeDesignationId,
      colour: wine.colour,
      style: wine.style,
      wine_name: wine.wineName,
      description: wine.description,
      vintage_kind: wine.vintage.kind,
      vintage_year: wine.vintage.year,
      vintage_tawny_years: wine.vintage.tawnyYears,
      image_url: wine.imageUrl,
      ...(input.estimatedPrice !== undefined
        ? { estimated_price: priceOrNull(input.estimatedPrice), estimated_price_currency: "DKK" }
        : {}),
      ...(input.profile ? { ...profileColumns(input.profile), alcohol_percent: wine.alcohol } : {}),
    };
    const { data: updated, error } = await supabase
      .from("catalog_wines")
      .update(patch)
      .eq("id", wineId)
      .select("id");
    if (error) {
      logFailure("updateCatalogWine", error.message);
      return { error: error.message };
    }
    if (!updated || updated.length === 0) return { error: "You can't edit this wine." };

    const blendError = await replaceBlend(supabase, wineId, wine.blend);
    if (blendError) {
      logFailure("catalog blend replace", blendError);
      return { error: blendError };
    }
    return { id: wineId };
  } catch (error) {
    logFailure("updateCatalogWine", error);
    return { error: "Could not save the wine." };
  }
}
