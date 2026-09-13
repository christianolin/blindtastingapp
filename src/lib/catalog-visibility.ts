import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

/** Ids per `in(...)` filter, so a long result list never builds an over-long URL. */
const ID_CHUNK = 100;

/**
 * `rows` without hidden blind wines (spec §B.6 "Other catalog searches"; scan-2).
 * A wine added to an unrevealed flight is a `catalog_wines` row with
 * `blind_pending = true` that every signed-in user can read, and
 * `search_catalog_wines` does not filter it. Offering it by name would leak
 * "someone is pouring X tonight". This is the same rule the add-wine search
 * applies (components/add-wine/actions.ts), shared by every other catalog search.
 *
 * Fails closed. A row is kept only when the catalog positively says it is visible,
 * and a failed read keeps nothing (it is logged). Showing no results is better
 * than showing a hidden glass, and the comboboxes behind these searches have no
 * error path. Order and duplicates in `rows` are preserved.
 */
export async function withoutBlindPending<T extends { id: string }>(
  supabase: SupabaseClient<Database>,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((row) => row.id))];
  const visible = new Set<string>();
  for (let from = 0; from < ids.length; from += ID_CHUNK) {
    const { data, error } = await supabase
      .from("catalog_wines")
      .select("id")
      .in("id", ids.slice(from, from + ID_CHUNK))
      .eq("blind_pending", false);
    if (error) {
      console.error("catalog visibility check failed", { message: error.message });
      return [];
    }
    for (const row of data ?? []) visible.add(row.id);
  }
  return rows.filter((row) => visible.has(row.id));
}
