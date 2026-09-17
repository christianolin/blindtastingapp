// The collection's numbers (CC-D4, spec §4 "collection.ts"; §5.8).
//
// This module reads nothing of its own: it is `getCellarBottles` for the
// owner's own cellar, handed straight to the pure `collectionStats`. Keeping
// the read in one place is what stops the collection page drifting from the
// Bottles page — the two are the same rows, counted differently.
//
// The owner is also the viewer here (`readOnly: false`), which is what
// populates `yours` on every row: "tasted", "your average" and the
// your-vs-community comparison all need the viewer's own most-recent score
// (D3), and `getCellarBottles` skips that read entirely in a read-only
// cellar (D12). The collection is therefore an owner-only surface, like
// History — `/u/[id]/cellar` never calls it.
//
// No money and no readiness: `collectionStats` derives neither, and nothing
// here selects a price (D4).
//
// Takes the Supabase client as a parameter (the `place.ts` pattern): no `next`
// import, no `server-only`, so a page or an action can call it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getCellarBottles } from "./bottles";
import { collectionStats } from "./collection-math";
import type { CollectionStats } from "./types";

/**
 * Everything The collection renders for one owner, from that owner's own
 * bottle rows. `ownerId` is both the cellar's owner and the viewer, so the
 * rows carry the viewer's own scores.
 */
export async function getCollectionStats(
  supabase: SupabaseClient<Database>,
  ownerId: string,
): Promise<CollectionStats> {
  const rows = await getCellarBottles(supabase, ownerId, ownerId, {
    readOnly: false,
  });
  return collectionStats(rows);
}
