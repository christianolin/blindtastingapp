import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { listIncompleteGlasses } from "@/lib/wine-identity/server/incomplete-glasses";

/**
 * Auto-reveals a glass once every participant who is supposed to guess it has
 * LOCKED IN, so an ASYNC host doesn't have to babysit "has everyone answered?".
 * LIVE tastings are NEVER auto-revealed — the host paces the reveal manually.
 *
 * Not a server action: this module is "server-only" without "use server", so it
 * is never a client-callable endpoint. Callers pass their own session client —
 * play/actions.ts after a lock, and the add-wine write path after an incomplete
 * glass is finished (spec §C.8).
 *
 * Eligible guessers = JOINED participants minus the wine's contributor minus the
 * host when the host provides the wines (they set the answers and never guess).
 * Only LOCKED guesses count: the ladder autosaves a row on the first tap, so "a
 * row exists" doesn't mean "done". The locks come from `tasting_guess_status`
 * (SECURITY DEFINER), not a `guesses` select: on a hidden glass the caller's RLS
 * shows only their own row, so when a guest locked last they saw no one else's
 * lock and an ASYNC AFTER_ALL glass never auto-revealed (plan amendment 13).
 *
 * `reveal_wine`'s participant gate applies the same rule since 20260912092000 —
 * eligible participants with a locked guess, the HOST_PROVIDES host excluded, a
 * CLOSED tasting refused — so a refusal here means the table changed between the
 * count and the call (someone unlocked, or the host ended the tasting). It is
 * logged, never thrown.
 *
 * Skips silently on any lookup failure (a missed auto-reveal just means the host
 * reveals manually) and on an incomplete glass: it has no answer key to score,
 * and finishing it runs this check again (spec §C.8).
 */
export async function maybeAutoRevealWine(
  supabase: SupabaseClient<Database>,
  wineId: string,
): Promise<void> {
  const { data: wine } = await supabase
    .from("wines")
    .select("tasting_id, is_revealed, contributor_participant_id")
    .eq("id", wineId)
    .maybeSingle();
  if (!wine || wine.is_revealed) return;

  const { data: tasting } = await supabase
    .from("tastings")
    .select("status, timing_mode, wine_source, host_id")
    .eq("id", wine.tasting_id)
    .maybeSingle();
  if (!tasting || tasting.timing_mode !== "ASYNC" || tasting.status === "CLOSED") return;

  const { data: joined, error: joinedError } = await supabase
    .from("tasting_participants")
    .select("id, user_id")
    .eq("tasting_id", wine.tasting_id)
    .eq("status", "JOINED");
  if (joinedError) return;
  const eligible = new Set(
    (joined ?? [])
      .filter(
        (p) =>
          p.id !== wine.contributor_participant_id &&
          !(tasting.wine_source === "HOST_PROVIDES" && p.user_id === tasting.host_id),
      )
      .map((p) => p.id),
  );
  if (eligible.size === 0) return;

  const { data: status, error: statusError } = await supabase.rpc("tasting_guess_status", {
    p_tasting_id: wine.tasting_id,
  });
  if (statusError) return;
  const lockedEligible = new Set(
    (status ?? [])
      .filter((row) => row.wine_id === wineId && row.locked && eligible.has(row.participant_id))
      .map((row) => row.participant_id),
  );
  if (lockedEligible.size < eligible.size) return;

  // Checked last, so the RPC runs only when the glass would otherwise reveal.
  try {
    const incomplete = await listIncompleteGlasses(supabase, wine.tasting_id);
    if (incomplete.some((glass) => glass.wineId === wineId)) return;
  } catch {
    return;
  }

  const { error } = await supabase.rpc("reveal_wine", { p_wine_id: wineId });
  if (error) console.warn(`auto-reveal of wine ${wineId} refused: ${error.message}`);
}
