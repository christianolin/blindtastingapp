"use server";

// Server-side search for reference tables too large to preload in full
// (appellations, producers, especially after the LWIN import). Backed by
// the pg_trgm GIN indexes added in
// supabase/migrations/20260713124415_add_reference_search_indexes.sql.
import { createClient } from "@/lib/supabase/server";

export type SearchOption = { id: string; name: string };

export async function searchAppellations(
  query: string,
  regionId?: string,
): Promise<SearchOption[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const supabase = await createClient();
  // RPC (not a plain ilike) so the match is accent-insensitive — "estephe"
  // must find "Saint-Estèphe AOP". See search_appellations in
  // 20260716160000_accent_insensitive_search.sql.
  const { data } = await supabase.rpc("search_appellations", {
    p_query: trimmed,
    p_region_id: regionId ?? undefined,
  });
  return data ?? [];
}

// Lists every appellation under a set of regions (used to scope the
// answer-key form's appellation field by country instead of by a single
// region) — paginated rather than a plain .select(), since a big wine
// country (France has 1800+ appellations) would otherwise silently
// truncate at Supabase's default 1000-row page cap.
export async function listAppellationsForRegions(
  regionIds: string[],
): Promise<SearchOption[]> {
  if (regionIds.length === 0) return [];
  const supabase = await createClient();
  const PAGE_SIZE = 1000;
  let all: SearchOption[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("appellations")
      .select("id, name")
      .in("region_id", regionIds)
      .order("name")
      .range(from, from + PAGE_SIZE - 1);
    if (error || !data) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

export type ProducerSearchOption = SearchOption & { in_region: boolean };

export async function searchProducers(
  query: string,
  regionId?: string,
): Promise<ProducerSearchOption[]> {
  const trimmed = query.trim();
  // An empty query is meaningful when a region is chosen: the RPC returns
  // that region's first page so the dropdown shows real options the moment
  // it opens. Without a region there's nothing sensible to page through.
  if (!trimmed && !regionId) return [];
  const supabase = await createClient();
  // Accent-insensitive RPC — "chateau"/"petrus" must find "Château …" /
  // "Pétrus". See 20260716160000_accent_insensitive_search.sql. A typed
  // query is NOT filtered by region (20260721090000_producer_search_groups.sql)
  // — matches from other regions still return, just with in_region=false so
  // the UI can rank/group the selected region's producers first. A wrong
  // region guess must never hide the right producer.
  const { data } = await supabase.rpc("search_producers", {
    p_query: trimmed,
    p_region_id: regionId ?? undefined,
  });
  return data ?? [];
}
