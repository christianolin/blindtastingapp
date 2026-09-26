// The training room's server reads (training-room spec §4.6, §3.6): the
// candidate pool, the viewer's history page by page, one attempt, and the
// tally — all as the viewer under RLS. Server-only, not "use server": the page
// calls these during render (cache() shares one pool read per request) and
// src/app/taste/training/actions.ts wraps the history reads for the client.
// Every rule lives in the pure ./pool-shape; this file only queries.
//
// PostgREST answers at most 1000 rows per request, so whole-table reads go
// page by page and id lookups go in chunks (CLAUDE.md: never preload a table
// with a bare select).
import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { WineColour } from "@/lib/wset/types";
import type { HistoryCursor, HistoryPage, TrainingAttemptDetail, TrainingTally } from "./action-types";
import { tally } from "./history-math";
import {
  ATTEMPT_COLUMNS,
  CATALOG_DISPLAY_COLUMNS,
  MAX_MERGE_HOPS,
  HISTORY_PAGE,
  finalWineId,
  historyOrFilter,
  pageOf,
  shapeAttemptRow,
  shapeCandidates,
  tallyRows,
  wineDisplay,
  type AromaTermRaw,
  type ArchetypeAromaRaw,
  type ArchetypeDesignationRaw,
  type ArchetypeRaw,
  type AttemptRaw,
  type CatalogDisplayRaw,
  type WineDisplay,
} from "./pool-shape";
import type { AttemptRow, Named, TrainingCandidate } from "./types";

export { coverageCountries } from "./pool-shape";
export { candidateToArchetypeView } from "./archetype-view";

type Client = SupabaseClient<Database>;
type Result<T> = { data: T[] | null; error: { message: string } | null };

const PAGE = 1000;
const ID_CHUNK = 150;

// A failed read fails the page: a pool or history quietly missing rows would mislead.
async function readAll<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<Result<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`Training room: the ${what} read failed (${error.message})`);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE) return rows;
  }
}

async function readByIds<T>(
  what: string,
  ids: readonly string[],
  read: (chunk: string[]) => PromiseLike<Result<T>>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const { data, error } = await read(unique.slice(i, i + ID_CHUNK));
    if (error) throw new Error(`Training room: the ${what} read failed (${error.message})`);
    rows.push(...(data ?? []));
  }
  return rows;
}

const ARCHETYPE_COLUMNS: string =
  "id, name, description, colour, style, country_id, region_id, appellation_id, " +
  "primary_grape_id, secondary_grape_id, typical_age_low, typical_age_high, sat, " +
  "quality_low, quality_high, wine_place_id, sort_order";

/** Every archetype as a TrainingCandidate (spec §4.6). One read per table, joined in TS. */
export const readTrainingPool = cache(async (supabase: Client): Promise<TrainingCandidate[]> => {
  const [archetypesRaw, aromasRaw, termsRaw, designationsRaw] = await Promise.all([
    readAll("archetypes", (from, to) =>
      supabase.from("wine_archetypes").select(ARCHETYPE_COLUMNS).order("sort_order").order("id").range(from, to),
    ),
    readAll("archetype aromas", (from, to) =>
      supabase
        .from("wine_archetype_aromas")
        .select("archetype_id, term_id, kind, signature")
        .order("archetype_id")
        .order("term_id")
        .order("kind")
        .range(from, to),
    ),
    readAll("aroma terms", (from, to) =>
      supabase.from("wset_aroma_terms").select("id, term, group_name").order("sort_order").order("id").range(from, to),
    ),
    readAll("archetype designations", (from, to) =>
      supabase
        .from("wine_archetype_designations")
        .select("archetype_id, type_designation_id")
        .order("archetype_id")
        .order("type_designation_id")
        .range(from, to),
    ),
  ]);
  const archetypes = archetypesRaw as unknown as ArchetypeRaw[];
  const designations = designationsRaw as unknown as ArchetypeDesignationRaw[];
  const ids = (pick: (a: ArchetypeRaw) => string | null) =>
    archetypes.map(pick).filter((id): id is string => id !== null);

  const [countries, regions, appellations, grapes, typeDesignations, places] = await Promise.all([
    readByIds("countries", ids((a) => a.country_id), (chunk) =>
      supabase.from("countries").select("id, name").in("id", chunk),
    ),
    readByIds("regions", ids((a) => a.region_id), (chunk) =>
      supabase.from("regions").select("id, name").in("id", chunk),
    ),
    readByIds("appellations", ids((a) => a.appellation_id), (chunk) =>
      supabase.from("appellations").select("id, name").in("id", chunk),
    ),
    readByIds("grapes", [...ids((a) => a.primary_grape_id), ...ids((a) => a.secondary_grape_id)], (chunk) =>
      supabase.from("grapes").select("id, name").in("id", chunk),
    ),
    readByIds("type designations", designations.map((d) => d.type_designation_id), (chunk) =>
      supabase.from("type_designations").select("id, name, sort_order").in("id", chunk),
    ),
    // Only non-null place ids: a map place is optional (D9) — in batch 1, 69
    // of the 87 archetypes have one and 18 do not.
    readByIds("map places", ids((a) => a.wine_place_id), (chunk) =>
      supabase.from("wine_places").select("id, canonical_key").in("id", chunk),
    ),
  ]);

  const orderedDesignations: Named[] = [...typeDesignations]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }));

  return shapeCandidates({
    archetypes,
    aromas: aromasRaw as unknown as ArchetypeAromaRaw[],
    terms: termsRaw as unknown as AromaTermRaw[],
    designations,
    names: { countries, regions, appellations, grapes, typeDesignations: orderedDesignations },
    placeKeys: places,
  });
});

// Follows merged_into from the given wines, a hop at a time (spec §6.1).
async function followMerges(supabase: Client, ids: readonly string[]): Promise<Map<string, string | null>> {
  const mergedInto = new Map<string, string | null>();
  let frontier = [...new Set(ids)];
  for (let hop = 0; hop <= MAX_MERGE_HOPS && frontier.length > 0; hop++) {
    const rows = await readByIds("merged wines", frontier, (chunk) =>
      supabase.from("catalog_wines").select("id, merged_into").in("id", chunk),
    );
    for (const r of rows) mergedInto.set(r.id, r.merged_into);
    frontier = rows
      .map((r) => r.merged_into)
      .filter((m): m is string => m !== null && !mergedInto.has(m));
  }
  return mergedInto;
}

type Hydrated = { row: AttemptRow; raw: AttemptRaw; wineColour: WineColour | null };

// Names the picks and the archetypes, follows merged wines and reads their labels.
// A wine the viewer cannot read (a hidden catalog row) keeps label null: the copy
// says "a wine you can't see yet".
async function hydrateAttempts(supabase: Client, raws: readonly AttemptRaw[]): Promise<Hydrated[]> {
  if (raws.length === 0) return [];
  const archetypeIds = raws
    .flatMap((r) => [r.picked_archetype_id, r.actual_archetype_id])
    .filter((id): id is string => id !== null);
  const wineIds = raws.map((r) => r.actual_catalog_wine_id).filter((id): id is string => id !== null);

  const [archetypes, mergedInto] = await Promise.all([
    readByIds("archetype names", archetypeIds, (chunk) =>
      supabase.from("wine_archetypes").select("id, name").in("id", chunk),
    ),
    followMerges(supabase, wineIds),
  ]);
  const finals = wineIds.map((id) => finalWineId(id, mergedInto));
  const displayRows = await readByIds("revealed wines", finals, (chunk) =>
    supabase.from("catalog_wines").select(CATALOG_DISPLAY_COLUMNS).in("id", chunk),
  );
  const wines = new Map<string, WineDisplay>(
    (displayRows as unknown as CatalogDisplayRaw[]).map((w) => [w.id, wineDisplay(w)]),
  );
  const archetypeNames = new Map(archetypes.map((a) => [a.id, a.name] as const));

  return raws.map((raw) => {
    const row = shapeAttemptRow(raw, { archetypeNames, mergedInto, wines });
    const wineColour = row.actual ? (wines.get(row.actual.catalogWineId)?.colour ?? null) : null;
    return { row, raw, wineColour };
  });
}

/** One page of the viewer's attempts, newest first (spec §3.6). */
export async function readTrainingHistory(
  supabase: Client,
  userId: string,
  cursor?: HistoryCursor,
): Promise<HistoryPage> {
  const base = supabase.from("training_attempts").select(ATTEMPT_COLUMNS).eq("author_id", userId);
  const filtered = cursor ? base.or(historyOrFilter(cursor)) : base;
  const { data, error } = await filtered
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_PAGE + 1);
  if (error) throw new Error(`Training room: the history read failed (${error.message})`);
  const page = pageOf((data ?? []) as unknown as AttemptRaw[], (r) => ({ createdAt: r.created_at, id: r.id }));
  const hydrated = await hydrateAttempts(supabase, page.rows);
  return { rows: hydrated.map((h) => h.row), nextCursor: page.nextCursor };
}

/** One of the viewer's attempts for the result screen; null when it is not theirs. */
export async function readTrainingAttemptDetail(
  supabase: Client,
  userId: string,
  attemptId: string,
): Promise<TrainingAttemptDetail | null> {
  const { data, error } = await supabase
    .from("training_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("author_id", userId)
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw new Error(`Training room: the attempt read failed (${error.message})`);
  if (!data) return null;
  const [hydrated] = await hydrateAttempts(supabase, [data as unknown as AttemptRaw]);
  return { row: hydrated.row, noteId: hydrated.raw.note_id, wineColour: hydrated.wineColour };
}

/** "6 of 9 right on the grape · 4 on the appellation" over every attempt — one light select. */
export async function readTrainingTally(supabase: Client, userId: string): Promise<TrainingTally> {
  const rows = await readAll("tally", (from, to) =>
    supabase
      .from("training_attempts")
      .select("primary_grape_points, appellation_points, total_points")
      .eq("author_id", userId)
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  return tally(tallyRows(rows as unknown as Parameters<typeof tallyRows>[0]));
}
