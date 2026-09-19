// Profile favourites — favourite regions and favourite producers, multiple of
// each, picked from a dropdown (spec docs/superpowers/specs/2026-09-19-profile-favourites.md,
// replacing the single favourite-wine-type field per the owner's request).
// Shaped like src/app/tastings/new/place.ts: type-only imports, no
// "use server" and no server-only import, so vitest can load it and a client
// component may import its constants and pure helpers. vitest has no `@/`
// alias, so this file makes no runtime import — every import here is
// type-only and erased before vitest ever sees it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FAVOURITES_LIMIT = 10;
/** The per-country sentinel region (D7) — never offered, never accepted. */
export const NONE_REGION_NAME = "None";

export const FAVOURITE_REGION_IDS_FIELD = "favourite_region_ids";
export const FAVOURITE_PRODUCER_IDS_FIELD = "favourite_producer_ids";

// ---------------------------------------------------------------------------
// Copy (§6) — pinned character for character by profile-favourites.test.ts.
// Lines marked (spec copy) were added by the spec; the rest is owner copy,
// verbatim from the task's decisions.
// ---------------------------------------------------------------------------

export const FAVOURITE_REGIONS_LABEL = "Favourite regions";
export const FAVOURITE_PRODUCERS_LABEL = "Favourite producers";
export const ADD_REGION_PLACEHOLDER = "Add a region";
export const ADD_PRODUCER_PLACEHOLDER = "Add a producer";
export const FAVOURITES_HINT = "Up to 10.";

// (spec copy)
export const FAVOURITES_LOAD_ERROR =
  "Your favourites could not be loaded. Reload the page to change them.";
// (spec copy) — the whole edit-profile-form, not only the favourites fields,
// but the copy lives here so one test file pins every string this spec adds.
export const BIO_PLACEHOLDER =
  "Go-to grape, how you got into wine, anything you'd like other tasters to know";

/** The migration's refusal strings, in §6's order, shown verbatim through the
 *  action (never rendered by a component of this feature). "this account has
 *  been deleted" is reused from account deletion's own DB_REFUSALS, not
 *  repeated here. */
export const FAVOURITES_DB_REFUSALS: readonly string[] = [
  "you can pick up to 10 favourite regions",
  "you can pick up to 10 favourite producers",
  "each region can be picked once",
  "each producer can be picked once",
  "that region cannot be a favourite",
  "favourites must be two lists of ids",
  "not signed in",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FavouriteRegion = { id: string; name: string; country: string };
export type FavouriteProducer = { id: string; name: string };
export type ProfileFavourites = {
  regions: FavouriteRegion[];
  producers: FavouriteProducer[];
};

// profile_favourite_regions / profile_favourite_producers and
// set_profile_favourites are defined by
// supabase/migrations/20260919141700_profile_favourites.sql (spec §3) and are
// reflected in src/lib/supabase/database.types.ts, so every call below is
// typed against the real generated types directly — no local augmentation
// needed.

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** "{name}, {country}" — the region picker's option label and the display chip. */
export function regionLabel({ name, country }: { name: string; country: string }): string {
  return `${name}, ${country}`;
}

/**
 * The region picker's option list: every named region (never the per-country
 * `None` sentinel, D7) whose country is present in `countries`, sorted by
 * `regionLabel` accent- and case-insensitively (`Intl.Collator("en", {
 * sensitivity: "base" })`), with id as the tiebreak so the order is stable.
 */
export function favouriteRegionOptions(
  regions: { id: string; name: string; country_id: string }[],
  countries: { id: string; name: string }[],
): FavouriteRegion[] {
  const countryNameById = new Map(countries.map((c) => [c.id, c.name]));
  const options: FavouriteRegion[] = [];
  for (const region of regions) {
    if (region.name === NONE_REGION_NAME) continue;
    const country = countryNameById.get(region.country_id);
    if (country === undefined) continue;
    options.push({ id: region.id, name: region.name, country });
  }
  const collator = new Intl.Collator("en", { sensitivity: "base" });
  return options.sort((a, b) => {
    const byLabel = collator.compare(regionLabel(a), regionLabel(b));
    if (byLabel !== 0) return byLabel;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Appends `item`, keeping insertion order. Returns the SAME array instance
 *  (no-op) when `item.id` is already in the list or the list is already at
 *  FAVOURITES_LIMIT, so a caller can compare with `===`/`toBe` to detect a
 *  no-op add. */
export function withFavourite<T extends { id: string }>(list: T[], item: T): T[] {
  if (list.length >= FAVOURITES_LIMIT) return list;
  if (list.some((x) => x.id === item.id)) return list;
  return [...list, item];
}

/** Removes by id, keeping the order of the rest. An absent id is a no-op
 *  (still returns a new array — callers compare ids, not instances, for this one). */
export function withoutFavourite<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((x) => x.id !== id);
}

export function canAddFavourite(list: { id: string }[]): boolean {
  return list.length < FAVOURITES_LIMIT;
}

/** `options` minus every id already in `chosen`, keeping `options`' order. */
export function unchosen<T extends { id: string }>(options: T[], chosen: { id: string }[]): T[] {
  const chosenIds = new Set(chosen.map((c) => c.id));
  return options.filter((o) => !chosenIds.has(o.id));
}

/** The hidden `<input>` payload: ids joined with "\n", in list (= chosen) order. */
export function serializeFavouriteIds(list: { id: string }[]): string {
  return list.map((x) => x.id).join("\n");
}

/**
 * The inverse of `serializeFavouriteIds`, read from `FormData.get(...)`.
 * `null` when `value` is not a string — the field was absent, meaning "leave
 * favourites alone" (D11: an old cached form, or a settings page that
 * couldn't load favourites and rendered no hidden input at all). Otherwise
 * every line, trimmed, blanks dropped, order kept. No dedupe and no id
 * validation: the database refuses those (D3, D5's guard), and the UI never
 * sends them.
 */
export function parseFavouriteIds(value: unknown): string[] | null {
  if (typeof value !== "string") return null;
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * The pure mapper from favourite rows (as read from the two tables) plus the
 * reference rows they name, to the display shape. Rows are ordered by
 * `position` regardless of the order they were read in; a row whose region,
 * its region's country, or its producer is missing from the reads is
 * silently dropped (never surfaced as an error — a merge/cleanup script that
 * moves favourites, per D8, should never leave a dangling favourite visible
 * as broken).
 */
export function favouritesFromRows({
  regionRows,
  producerRows,
  regions,
  countries,
  producers,
}: {
  regionRows: { region_id: string; position: number }[];
  producerRows: { producer_id: string; position: number }[];
  regions: { id: string; name: string; country_id: string }[];
  countries: { id: string; name: string }[];
  producers: { id: string; name: string }[];
}): ProfileFavourites {
  const regionById = new Map(regions.map((r) => [r.id, r]));
  const countryNameById = new Map(countries.map((c) => [c.id, c.name]));
  const producerById = new Map(producers.map((p) => [p.id, p]));

  const orderedRegionRows = [...regionRows].sort((a, b) => a.position - b.position);
  const favRegions: FavouriteRegion[] = [];
  for (const row of orderedRegionRows) {
    const region = regionById.get(row.region_id);
    if (!region) continue;
    const country = countryNameById.get(region.country_id);
    if (country === undefined) continue;
    favRegions.push({ id: region.id, name: region.name, country });
  }

  const orderedProducerRows = [...producerRows].sort((a, b) => a.position - b.position);
  const favProducers: FavouriteProducer[] = [];
  for (const row of orderedProducerRows) {
    const producer = producerById.get(row.producer_id);
    if (!producer) continue;
    favProducers.push({ id: producer.id, name: producer.name });
  }

  return { regions: favRegions, producers: favProducers };
}

// ---------------------------------------------------------------------------
// Reads and writes
// ---------------------------------------------------------------------------

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/** Every row of an ordered, paged query (PostgREST caps one read at 1000
 *  rows), in the pattern of loadByHandReferences. `null` on any error, so a
 *  transient failure never reads back as an empty page. */
async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[] | null> {
  const PAGE_SIZE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return null;
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
}

/**
 * A profile's favourites, as any signed-in viewer may read them (D4: public
 * like the rest of a profile). Returns `null` — never an empty set — when any
 * read fails, so a transient error never reads back as "no favourites" (D11):
 * the settings page shows a load notice and posts no favourites, and a
 * profile page simply shows nothing extra.
 *
 * Round 1 (parallel): both favourites tables, ordered by position. With no
 * rows in either, returns empty lists without reading further. Round 2
 * (parallel, and only the reads a favourite actually needs): `regions` and
 * `countries` only when there is at least one region favourite, `producers`
 * only when there is at least one producer favourite — `countries` is read
 * in full (46 rows), `regions`/`producers` only by the ids actually used, so
 * this never preloads the whole `producers` table (CLAUDE.md).
 */
export async function getProfileFavourites(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<ProfileFavourites | null> {
  const [regionRowsRes, producerRowsRes] = await Promise.all([
    supabase
      .from("profile_favourite_regions")
      .select("region_id, position")
      .eq("profile_id", profileId)
      .order("position"),
    supabase
      .from("profile_favourite_producers")
      .select("producer_id, position")
      .eq("profile_id", profileId)
      .order("position"),
  ]);
  if (regionRowsRes.error || producerRowsRes.error) return null;
  const regionRows = regionRowsRes.data ?? [];
  const producerRows = producerRowsRes.data ?? [];
  if (regionRows.length === 0 && producerRows.length === 0) {
    return { regions: [], producers: [] };
  }

  const regionIds = regionRows.map((r) => r.region_id);
  const producerIds = producerRows.map((r) => r.producer_id);
  type RegionRow = { id: string; name: string; country_id: string };
  type CountryRow = { id: string; name: string };
  type ProducerRow = { id: string; name: string };
  const empty = <T>(): Promise<{ data: T[]; error: null }> => Promise.resolve({ data: [], error: null });

  const [regionsRes, countriesRes, producersRes] = await Promise.all([
    regionIds.length > 0
      ? supabase.from("regions").select("id, name, country_id").in("id", regionIds)
      : empty<RegionRow>(),
    regionIds.length > 0 ? supabase.from("countries").select("id, name") : empty<CountryRow>(),
    producerIds.length > 0
      ? supabase.from("producers").select("id, name").in("id", producerIds)
      : empty<ProducerRow>(),
  ]);
  if (regionsRes.error || countriesRes.error || producersRes.error) return null;

  return favouritesFromRows({
    regionRows,
    producerRows,
    regions: regionsRes.data ?? [],
    countries: countriesRes.data ?? [],
    producers: producersRes.data ?? [],
  });
}

/**
 * The region picker's full option list: every country and every region,
 * paged 1,000 rows at a time so the page cap never truncates them (as
 * `loadByHandReferences` does for the by-hand form), mapped through
 * `favouriteRegionOptions`. `null` on any error — the settings page then
 * shows the load notice (D11).
 */
export async function loadFavouriteRegionOptions(
  supabase: SupabaseClient<Database>,
): Promise<FavouriteRegion[] | null> {
  const [countries, regions] = await Promise.all([
    readAllPages<{ id: string; name: string }>((from, to) =>
      supabase.from("countries").select("id, name").order("name").order("id").range(from, to),
    ),
    readAllPages<{ id: string; name: string; country_id: string }>((from, to) =>
      supabase.from("regions").select("id, name, country_id").order("name").order("id").range(from, to),
    ),
  ]);
  if (countries === null || regions === null) return null;
  return favouriteRegionOptions(regions, countries);
}

/**
 * Replaces a person's whole favourites set in one call (D6's
 * `set_profile_favourites` RPC — SECURITY INVOKER, atomic, and the sole
 * write path). A refusal (the 10-limit, a duplicate, the `None` sentinel,
 * "not signed in", or "this account has been deleted") comes back as the
 * database's message, verbatim.
 */
export async function setProfileFavourites(
  supabase: SupabaseClient<Database>,
  regionIds: string[],
  producerIds: string[],
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.rpc("set_profile_favourites", {
    p_region_ids: regionIds,
    p_producer_ids: producerIds,
  });
  if (error) return { error: error.message };
  return { ok: true };
}
