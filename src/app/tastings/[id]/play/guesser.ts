import "server-only";

import { guessBlockReason } from "@/lib/guess-guards";
import { guessOrderAllows } from "@/lib/pour-pointer";
import { createClient } from "@/lib/supabase/server";

// The three guards every guess and lock action shares (play-8, spec §D.1
// #1, §D.2 #6): who may guess at all, whether a given glass is guessable,
// and whether pacing allows it right now. Not a server action: "server-only"
// without "use server" keeps this module out of any client bundle without
// making its exports a client-callable endpoint. Moved here from
// play/actions.ts so match actions (BT-S2) and reveal actions can share them
// without importing a "use server" file's internals.

type Client = Awaited<ReturnType<typeof createClient>>;

type Guesser = {
  participantId: string;
  /** ASYNC + IMMEDIATE: locking a complete glass scores it (score_own_guess). */
  scoresOnLock: boolean;
};

// Resolves the caller's participant row and enforces that they may guess:
// they must be a JOINED participant and the tasting must have started (host
// pressed Start → status left 'DRAFT'). Returns the participant id or an
// error message.
export async function resolveGuesser(
  supabase: Client,
  tastingId: string,
  userId: string,
): Promise<Guesser | { error: string }> {
  const { data: tasting } = await supabase
    .from("tastings")
    .select("status, wine_source, host_id, timing_mode, async_reveal_policy")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) return { error: "Tasting not found." };
  if (tasting.status === "DRAFT") {
    return { error: "The host hasn't started this tasting yet." };
  }
  if (tasting.status === "CLOSED") {
    return { error: "This tasting is finished — guessing is closed." };
  }
  // When the host provides all the wines they set the answers, so they host
  // rather than guess.
  if (tasting.wine_source === "HOST_PROVIDES" && tasting.host_id === userId) {
    return { error: "You set these wines — you're hosting, not guessing." };
  }

  const { data: participant } = await supabase
    .from("tasting_participants")
    .select("id, status")
    .eq("tasting_id", tastingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!participant) {
    return { error: "You're not a participant in this tasting." };
  }
  if (participant.status !== "JOINED") {
    return { error: "Accept your invitation before guessing." };
  }
  return {
    participantId: participant.id,
    scoresOnLock: tasting.timing_mode === "ASYNC" && tasting.async_reveal_policy === "IMMEDIATE",
  };
}

type GuessableWine = NonNullable<Parameters<typeof guessBlockReason>[0]>;

// play-8 (spec §D.2 #6): the wines rows guessBlockReason judges, looked up
// inside this tasting only, so a wine id from another tasting (or one that
// isn't a uuid) reads as "This glass isn't in this tasting."
export async function guessableWines(
  supabase: Client,
  tastingId: string,
  wineIds: readonly string[],
): Promise<{ wines: Map<string, GuessableWine> } | { error: string }> {
  const { data, error } = await supabase
    .from("wines")
    .select("id, is_revealed, reveal_step, contributor_participant_id")
    .eq("tasting_id", tastingId)
    .in("id", [...wineIds]);
  // 22P02 (invalid_text_representation): not a uuid, so no such glass.
  if (error && error.code !== "22P02") return { error: error.message };
  return {
    wines: new Map<string, GuessableWine>(
      (data ?? []).map((w) => [
        w.id,
        {
          isRevealed: w.is_revealed,
          revealStep: w.reveal_step,
          contributorParticipantId: w.contributor_participant_id,
        },
      ]),
    ),
  };
}

// No new guess once a glass's reveal has started, and no guess on your own
// bottle (play-8). Null when the participant may guess this glass.
export async function guessableWineError(
  supabase: Client,
  tastingId: string,
  wineId: string,
  participantId: string,
): Promise<string | null> {
  const result = await guessableWines(supabase, tastingId, [wineId]);
  if ("error" in result) return result.error;
  return guessBlockReason(result.wines.get(wineId) ?? null, participantId);
}

// "One wine at a time" pacing (spec §D.1 #1; refinement 5): a guess is
// accepted only for the current glass under guided pacing (LIVE, sequential
// guessing on) — the pour pointer's glass in BLIND, any glass poured so far
// in SEMI_BLIND (`guessOrderAllows`, BT-P3). A self-paced tasting may still
// carry a flag stored before that rule; guessOrderAllows ignores it outside
// LIVE, so it's never read here as "in order" incorrectly.
export async function sequentialOrderError(
  supabase: Client,
  tastingId: string,
  wineId: string,
): Promise<string | null> {
  const { data: tasting } = await supabase
    .from("tastings")
    .select("sequential_guessing, reveal_mode, timing_mode, current_wine_id")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) return null;
  const { data: glasses } = await supabase
    .from("wines")
    .select("id, is_revealed, reveal_step")
    .eq("tasting_id", tastingId)
    .order("position");
  const allowed = guessOrderAllows({
    revealMode: tasting.reveal_mode,
    timingMode: tasting.timing_mode,
    sequentialGuessing: tasting.sequential_guessing,
    glasses: (glasses ?? []).map((w) => ({
      id: w.id,
      isRevealed: w.is_revealed,
      revealStep: w.reveal_step,
    })),
    pointerWineId: tasting.current_wine_id,
    wineId,
  });
  return allowed ? null : "Guess the wines in order — earlier wines come first.";
}
