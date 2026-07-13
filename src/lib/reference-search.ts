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
