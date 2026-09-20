// The archetypes hung off a map place (canonical key), curated order — powers
// the map's "typical wines from here" list and its deep-links.
//
// ONE request, not three. This used to chain wine_places (id) →
// wine_archetype_placements → wine_archetypes, which cost 2–3 serial round
// trips (~110–220 ms of pure latency) for a list most places do not even have.
// The embedded filter does the same joins server-side in ~20 ms.
// Spec: docs/superpowers/specs/2026-09-20-wine-map-data-latency.md §4.2.
//
// Same rows, same order, same RLS: `wine_places!inner` drops an unverified
// place exactly as the old first hop's `VERIFIED`-gated `select("id")` did, and
// `.order("sort_order")` fully determines the sequence because no two
// placements of one place share a sort_order (checked live). No column is
// widened — `canonical_key` is the caller's own argument.
//
// Its own module, with type-only `@/` imports, so vitest (node, no path alias)
// can load it; ./queries re-exports it for every existing importer.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { archetypeRows, type ArchetypeListItem } from "./archetype-rows";

// Not a literal select type: every table carries `Relationships: []`, so
// postgrest-js cannot type the embed and the rows go through archetypeRows().
export const ARCHETYPES_FOR_PLACE_SELECT: string =
  "sort_order, wine_archetypes!inner(id, name, colour, style), wine_places!inner(canonical_key)";

export async function fetchArchetypesForPlace(
  supabase: SupabaseClient<Database>,
  canonicalKey: string,
): Promise<ArchetypeListItem[]> {
  const { data, error } = await supabase
    .from("wine_archetype_placements")
    .select(ARCHETYPES_FOR_PLACE_SELECT)
    .eq("wine_places.canonical_key", canonicalKey)
    .order("sort_order");
  if (error) throw new Error(`wine_archetype_placements failed: ${error.message}`);
  return archetypeRows(data);
}
