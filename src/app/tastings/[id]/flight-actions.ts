"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { moveRefusalSentence } from "@/lib/flight-glass-rules";

// The lobby's flight-glass server actions the database gates end to end (spec
// §3.3 items 5, 12; ledger B2 "Remove after Start, reorder"). Split out of
// ./actions.ts (plan refinement 2) so tracks that only touch the flight don't
// queue on the lifecycle file. Host-or-adder checks live in the database
// (`move_flight_glass`, `glass_removal_impact`, both BT-SQL6) — these actions
// only confirm a session and hand the RPC's sentence back: `move_flight_glass`'s
// own refusals in the lobby's copy (`moveRefusalSentence`, the sentences the
// optimistic list shows; BT-V3 A-19), anything else as the RPC wrote it.

/**
 * The RPC's own lower-case exception text, made presentable: first letter
 * upper-cased, a closing period added if it lacks one (spec §2.3 item 6,
 * "shows the RPC's sentence"), for a refusal the lobby has no copy for.
 */
function asSentence(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "That could not be done.";
  const capitalised = trimmed[0].toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

/**
 * Reorder a flight glass to the 1-based `toIndex` (drag, or the ▲▼ fallback) —
 * spec §3.3 item 5. `move_flight_glass` is the floor: host only, refused on a
 * CLOSED tasting, refused whenever the move would change the number of a
 * glass the table has already seen, and after Start refused for a semi-blind
 * flight or a range holding a guessed glass (M6 decision 5). A refusal
 * surfaces that sentence, in the lobby's copy where it has one.
 */
export async function moveFlightGlass(
  tastingId: string,
  wineId: string,
  toIndex: number,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("move_flight_glass", {
    p_wine_id: wineId,
    p_to_index: toIndex,
  });
  if (error) return { error: moveRefusalSentence(error.message) ?? asSentence(error.message) };

  revalidatePath(`/tastings/${tastingId}`);
  return { ok: true };
}

/**
 * What Remove would take with the glass, loaded when the edit sheet opens
 * (spec §3.3 item 12) — the counts to show inline before the tap. A row only
 * for whoever may remove the glass; `glass_removal_impact` itself decides
 * that (host or adder, per `can_remove_flight_glass`), so a null return here
 * just means "not yours to remove", not an error.
 */
export async function getGlassRemovalImpact(
  wineId: string,
): Promise<{ guesses: number; privateNotes: number } | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("glass_removal_impact", {
    p_wine_id: wineId,
  });
  const row = data?.[0];
  return row ? { guesses: row.guesses, privateNotes: row.private_notes } : null;
}
