"use server";

// Server-side search for reference tables too large to preload in full
// (appellations, producers, especially after the LWIN import). Backed by
// the pg_trgm GIN indexes added in
// supabase/migrations/20260713124415_add_reference_search_indexes.sql.
import { createClient } from "@/lib/supabase/server";

export type SearchOption = { id: string; name: string };

const RESULT_LIMIT = 25;

export async function searchAppellations(
  query: string,
  regionId?: string,
): Promise<SearchOption[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const supabase = await createClient();
  let request = supabase
    .from("appellations")
    .select("id, name")
    .ilike("name", `%${trimmed}%`)
    .order("name")
    .limit(RESULT_LIMIT);
  if (regionId) request = request.eq("region_id", regionId);
  const { data } = await request;
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

export async function searchProducers(query: string): Promise<SearchOption[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("producers")
    .select("id, name")
    .ilike("name", `%${trimmed}%`)
    .order("name")
    .limit(RESULT_LIMIT);
  return data ?? [];
}
