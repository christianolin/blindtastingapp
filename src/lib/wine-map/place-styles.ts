// A place's wine styles, keyed by canonical_key so the request can start from
// the selection itself instead of waiting for get_wine_place_context to hand
// back a place id. Same rows, same order, same cost as the old
// `.eq("wine_place_id", …)` form (measured live, both ~20 ms) — it just no
// longer sits 400 ms behind the context RPC.
// Spec: docs/superpowers/specs/2026-09-20-wine-map-data-latency.md §4.3.
//
// RLS is unchanged: "wine place styles published read" already required the
// parent place to be VERIFIED, which is exactly what `wine_places!inner` keeps.
// No column is widened — `canonical_key` is the value the caller passed in, and
// PostgREST requires an embedded resource to appear in the select before it can
// be filtered on.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { placeStyleRows, type StyleRow } from "./place-style-rows";

export type { StyleRow };

// Not a literal select type: every table carries `Relationships: []`, so
// postgrest-js cannot type the embed and the rows go through placeStyleRows().
export const PLACE_STYLES_SELECT: string =
  "style, colour, note, sort_order, wine_places!inner(canonical_key)";

export async function fetchPlaceStyles(
  supabase: SupabaseClient<Database>,
  canonicalKey: string,
): Promise<StyleRow[]> {
  const { data, error } = await supabase
    .from("wine_place_styles")
    .select(PLACE_STYLES_SELECT)
    .eq("wine_places.canonical_key", canonicalKey)
    .order("sort_order");
  if (error) throw new Error(`wine_place_styles failed: ${error.message}`);
  return placeStyleRows(data);
}
