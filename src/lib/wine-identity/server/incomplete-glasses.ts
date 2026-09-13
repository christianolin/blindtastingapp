import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { toIncompleteGlasses, type IncompleteGlass } from "../incomplete";

/**
 * Every glass in a tasting that has no answer key yet, with its list-order glass
 * number and only its missing field keys, never draft values (spec §E.3). Hosts and
 * participants may both call it. It throws on an RPC error, so no Start warning or
 * reveal gate mistakes a failed read for "every glass is complete".
 */
export async function listIncompleteGlasses(
  supabase: SupabaseClient<Database>,
  tastingId: string,
): Promise<IncompleteGlass[]> {
  const { data, error } = await supabase.rpc("tasting_incomplete_glasses", {
    p_tasting_id: tastingId,
  });
  if (error) {
    throw new Error(`tasting_incomplete_glasses failed: ${error.message}`);
  }
  return toIncompleteGlasses(data ?? []);
}
