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
import { GRAPE_LINK_PAGE_SIZE, pageRanges, roundIsLast } from "./page-plan";

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

// PostgREST caps a single select at 1000 rows, so this table takes several
// pages. They go out a ROUND AT A TIME rather than one after another: rows are
// a contiguous range, so nothing can follow a short page, and asking for a few
// pages at once costs at most one empty request while saving a full network
// round trip per page. Three serial requests on every map load became one
// round. The rule itself is in ./page-plan, where it is unit-tested.
export async function fetchPlaceGrapeLinks(
  supabase: SupabaseClient<Database>,
): Promise<Map<string, Set<string>>> {
  const byPlace = new Map<string, Set<string>>();
  for (let round = 0; ; round += 1) {
    const pages = await Promise.all(
      pageRanges(round).map(async ([from, to]) => {
        const { data, error } = await supabase
          .from("wine_place_grapes")
          .select("wine_place_id, grape_id")
          .range(from, to);
        if (error) {
          throw new Error(`Place grape links request failed: ${error.message}`);
        }
        return data ?? [];
      }),
    );
    for (const page of pages) {
      for (const row of page) {
        let set = byPlace.get(row.wine_place_id);
        if (!set) {
          set = new Set();
          byPlace.set(row.wine_place_id, set);
        }
        set.add(row.grape_id);
      }
    }
    if (roundIsLast(pages.map((page) => page.length), GRAPE_LINK_PAGE_SIZE)) {
      return byPlace;
    }
  }
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
