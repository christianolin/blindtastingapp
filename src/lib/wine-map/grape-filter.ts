// Grape filtering for the tile map, computed client-side so filters need no
// tile rebuild: wine_place_grapes rows become a place-id -> grape-id set,
// and a tree walk turns one selected grape into the set of canonical keys
// allowed to render. A place's effective encepagement is the NEAREST
// ancestor-or-self that declares any grape links — children inherit a
// parent's grapes until they declare their own, so a Burgundy climat without
// rows inherits its village while Chablis' own Chardonnay-only links
// correctly drop it from a Pinot Noir filter. Future filters (styles,
// designations) reuse the same visible-key-set contract.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { WinePlaceTreeNode } from "./tree";

export type GrapeOption = { id: string; name: string };

export async function fetchGrapeOptions(
  supabase: SupabaseClient<Database>,
): Promise<GrapeOption[]> {
  const { data, error } = await supabase
    .from("grapes")
    .select("id, name")
    .order("name");
  if (error) throw new Error(`Grape list request failed: ${error.message}`);
  return data ?? [];
}

// PostgREST caps a single select at 1000 rows; page until a short page.
export async function fetchPlaceGrapeLinks(
  supabase: SupabaseClient<Database>,
): Promise<Map<string, Set<string>>> {
  const byPlace = new Map<string, Set<string>>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("wine_place_grapes")
      .select("wine_place_id, grape_id")
      .range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`Place grape links request failed: ${error.message}`);
    }
    for (const row of data ?? []) {
      let set = byPlace.get(row.wine_place_id);
      if (!set) {
        set = new Set();
        byPlace.set(row.wine_place_id, set);
      }
      set.add(row.grape_id);
    }
    if (!data || data.length < pageSize) break;
  }
  return byPlace;
}

export function grapeVisibleKeys(
  roots: WinePlaceTreeNode[],
  linksByPlace: Map<string, Set<string>>,
  grapeId: string,
): string[] {
  const keys: string[] = [];
  const walk = (node: WinePlaceTreeNode, inherited: Set<string> | null) => {
    const own = linksByPlace.get(node.id);
    const effective = own && own.size > 0 ? own : inherited;
    if (effective?.has(grapeId)) keys.push(node.key);
    for (const child of node.children) walk(child, effective);
  };
  for (const root of roots) walk(root, null);
  return keys;
}
