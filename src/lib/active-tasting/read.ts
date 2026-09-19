// The active-tasting banner's one read (spec §5): the viewer's own JOINED
// participant rows, each with its tasting embedded, as the viewer under RLS —
// one round trip, no fan-out. `!inner` drops any tasting RLS hides, and the
// pure rules in ./select re-check every filter (D1, D2).
//
// A server-only module, not a "use server" one: AppHeader and the Overview
// page call it during render, and React's cache() gives them one shared read
// per request. The client reaches it only through ./actions.
//
// Rule 1: no column from wines, wine_answers or guesses, and not
// current_wine_id — only tasting-level facts a JOINED member already reads.
import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  candidateFromRow,
  selectActiveTastings,
  type ActiveTastingSnapshot,
} from "./select";

// Not a literal select type: every table carries `Relationships: []`, so
// postgrest-js cannot type the embed and the rows go through candidateFromRow.
const ACTIVE_TASTING_SELECT: string =
  "status, tastings!inner(id, name, host_id, status, timing_mode, reveal_mode, " +
  "wine_source, started_at, paused_at, scheduled_at, created_at)";

/**
 * The viewer's active tastings, in banner order, stamped with the server's
 * clock. Null on a query error (D13) — the caller keeps what it has rather
 * than blanking the banner.
 */
export const readActiveTastings = cache(
  async (userId: string): Promise<ActiveTastingSnapshot | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tasting_participants")
      .select(ACTIVE_TASTING_SELECT)
      .eq("user_id", userId)
      .eq("status", "JOINED")
      .in("tastings.status", ["DRAFT", "IN_PROGRESS"]);
    if (error) {
      console.error("Active tasting banner: the read failed", error);
      return null;
    }
    const now = new Date();
    const candidates = ((data ?? []) as unknown[]).flatMap(
      (r) => candidateFromRow(r) ?? [],
    );
    return {
      items: selectActiveTastings(candidates, userId, now),
      checkedAt: now.toISOString(),
    };
  },
);
