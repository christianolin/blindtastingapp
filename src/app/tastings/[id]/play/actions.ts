"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { guessBlockReason } from "@/lib/guess-guards";
import { createClient } from "@/lib/supabase/server";
import type { VintageKind } from "@/lib/supabase/database.types";
import { revealRefusal, type IncompleteGlass } from "@/lib/wine-identity/incomplete";
import { listIncompleteGlasses } from "@/lib/wine-identity/server/incomplete-glasses";
import { maybeAutoRevealWine } from "./auto-reveal";

// The row shape the ladder edits — defined in ladder-types.ts (pure types) so
// client components can import it without touching this "use server" module.
export type { GuessRow } from "./ladder-types";

type Client = Awaited<ReturnType<typeof createClient>>;

// "One wine at a time" pacing: only the current (lowest-position unrevealed)
// wine may be guessed. LIVE blind tastings only (spec §D.1 #1): a self-paced
// tasting may still carry a flag stored before that rule, and it is ignored
// here. Null when in order (or not paced).
async function sequentialOrderError(
  supabase: Client,
  tastingId: string,
  wineId: string,
): Promise<string | null> {
  const { data: seqTasting } = await supabase
    .from("tastings")
    .select("sequential_guessing, reveal_mode, timing_mode")
    .eq("id", tastingId)
    .maybeSingle();
  if (
    !seqTasting?.sequential_guessing ||
    seqTasting.reveal_mode !== "BLIND" ||
    seqTasting.timing_mode !== "LIVE"
  ) {
    return null;
  }
  const { data: current } = await supabase
    .from("wines")
    .select("id")
    .eq("tasting_id", tastingId)
    .eq("is_revealed", false)
    .order("position")
    .limit(1)
    .maybeSingle();
  if (current && current.id !== wineId) {
    return "Guess the wines in order — earlier wines come first.";
  }
  return null;
}

type GuessableWine = NonNullable<Parameters<typeof guessBlockReason>[0]>;

// play-8 (spec §D.2 #6): the wines rows guessBlockReason judges, looked up
// inside this tasting only, so a wine id from another tasting (or one that
// isn't a uuid) reads as "This glass isn't in this tasting."
async function guessableWines(
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
async function guessableWineError(
  supabase: Client,
  tastingId: string,
  wineId: string,
  participantId: string,
): Promise<string | null> {
  const result = await guessableWines(supabase, tastingId, [wineId]);
  if ("error" in result) return result.error;
  return guessBlockReason(result.wines.get(wineId) ?? null, participantId);
}

// Every glass in the tasting with no answer key yet (spec §C.8).
// listIncompleteGlasses throws on an RPC error, so a failed read never passes
// for "every glass is complete"; here the failure comes back as a value, since a
// thrown server action lands in the error boundary instead of inline.
async function readIncompleteGlasses(
  supabase: Client,
  tastingId: string,
): Promise<{ rows: IncompleteGlass[] } | { error: string }> {
  try {
    return { rows: await listIncompleteGlasses(supabase, tastingId) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// The wines among wineIds that have an answer key, so ASYNC + IMMEDIATE scoring
// waits on an incomplete glass (spec §C.8). A failed read counts none as
// complete: scoring only waits, and scoreLockedGuess runs it once the locked-in
// state sees the glass complete.
async function completeGlassIds(
  supabase: Client,
  tastingId: string,
  wineIds: readonly string[],
): Promise<Set<string>> {
  const incomplete = await readIncompleteGlasses(supabase, tastingId);
  if ("error" in incomplete) {
    console.warn(`deferred scoring for tasting ${tastingId}: ${incomplete.error}`);
    return new Set();
  }
  const pending = new Set(incomplete.rows.map((glass) => glass.wineId));
  return new Set(wineIds.filter((id) => !pending.has(id)));
}

export type GuessFormState = { error: string } | { success: true } | null;

type Guesser = {
  participantId: string;
  /** ASYNC + IMMEDIATE: locking a complete glass scores it (score_own_guess). */
  scoresOnLock: boolean;
};

// Resolves the caller's participant row and enforces that they may guess:
// they must be a JOINED participant and the tasting must have started (host
// pressed Start → status left 'DRAFT'). Returns the participant id or an
// error message.
async function resolveGuesser(
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

const LOCKED_ERROR = "This guess is locked — it's already been scored.";

// Autosave target for the guess ladder: called with the COMPLETE current
// state after every pick (full-row replace — an absent field becomes null).
// Scoring and auto-reveal no longer happen here; they moved to lockGuess so a
// half-filled draft is never scored or counted as "done". It writes guess
// fields only, never a scoring column (20260912093000), and it is refused once
// the glass's reveal has started or on your own bottle (play-8). An incomplete
// glass can still be guessed (spec §C.8).
export async function submitGuess(
  _prevState: GuessFormState,
  formData: FormData,
): Promise<GuessFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const tastingId = String(formData.get("tasting_id") ?? "");
  const wineId = String(formData.get("wine_id") ?? "");

  const guesser = await resolveGuesser(supabase, tastingId, user.id);
  if ("error" in guesser) return { error: guesser.error };
  const participant = { id: guesser.participantId };

  // Independent reads, run together: this action fires on every autosave.
  const [blocked, orderError, { data: existing }] = await Promise.all([
    guessableWineError(supabase, tastingId, wineId, participant.id),
    sequentialOrderError(supabase, tastingId, wineId),
    supabase
      .from("guesses")
      .select("id, scored_at")
      .eq("wine_id", wineId)
      .eq("participant_id", participant.id)
      .maybeSingle(),
  ]);
  if (blocked) return { error: blocked };
  if (orderError) return { error: orderError };

  const get = (name: string) => String(formData.get(name) ?? "") || null;
  const vintageKind = (get("vintage_kind") as VintageKind | null) ?? null;
  const vintageYearRaw = get("vintage_year");
  const vintageTawnyYearsRaw = get("vintage_tawny_years");

  const payload = {
    wine_id: wineId,
    participant_id: participant.id,
    country_id: get("country_id"),
    region_id: get("region_id"),
    appellation_id: get("appellation_id"),
    primary_grape_id: get("primary_grape_id"),
    secondary_grape_id: get("secondary_grape_id"),
    producer_id: get("producer_id"),
    type_designation_id: get("type_designation_id"),
    vintage_kind: vintageKind,
    vintage_year: vintageKind === "YEAR" && vintageYearRaw ? parseInt(vintageYearRaw, 10) : null,
    vintage_tawny_years:
      vintageKind === "TAWNY" && vintageTawnyYearsRaw
        ? parseInt(vintageTawnyYearsRaw, 10)
        : null,
  };

  // Once a guess has been scored (immediate-reveal async, or a revealed wine)
  // it's locked — you've already seen the answer, no re-guessing.
  if (existing?.scored_at) {
    return { error: LOCKED_ERROR };
  }

  const { error } = existing
    ? await supabase.from("guesses").update(payload).eq("id", existing.id)
    : await supabase.from("guesses").insert(payload);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath(`/tastings/${tastingId}/play`);
  revalidatePath(`/tastings/${tastingId}/results`);
  return { success: true };
}

export type LockResult = { ok: true } | { error: string };

// Stamps locked_at on the caller's saved guess for one wine, then runs what
// submitGuess used to run after every write: score_own_guess (ASYNC +
// IMMEDIATE only, and only for a complete glass — an incomplete one defers
// scoring to scoreLockedGuess, spec §C.8) and the ASYNC auto-reveal check.
// Locking is a readiness signal, not a gate: the host can still reveal early
// and reveal_wine scores whatever was saved. A taster with no row yet (skipped
// every field, or never opened a picker) locks a blank row — a blank scores 0
// per category and is a valid guess, and without it "{locked} of {eligible}"
// could never reach everyone.
export async function lockGuess(
  tastingId: string,
  wineId: string,
): Promise<LockResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const guesser = await resolveGuesser(supabase, tastingId, user.id);
  if ("error" in guesser) return { error: guesser.error };
  const blocked = await guessableWineError(supabase, tastingId, wineId, guesser.participantId);
  if (blocked) return { error: blocked };

  const { data: existing } = await supabase
    .from("guesses")
    .select("id, scored_at, locked_at")
    .eq("wine_id", wineId)
    .eq("participant_id", guesser.participantId)
    .maybeSingle();
  if (existing?.scored_at) {
    return { error: LOCKED_ERROR };
  }

  if (!existing) {
    // Same order rule as submitGuess, so an out-of-order blank row can't be
    // created either. All category columns default null — the shape
    // submitGuess writes for an all-skipped guess.
    const orderError = await sequentialOrderError(supabase, tastingId, wineId);
    if (orderError) return { error: orderError };
    const { error } = await supabase.from("guesses").insert({
      wine_id: wineId,
      participant_id: guesser.participantId,
      locked_at: new Date().toISOString(),
    });
    if (error) return { error: error.message };
  } else if (!existing.locked_at) {
    const { error } = await supabase
      .from("guesses")
      .update({ locked_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  }

  if (guesser.scoresOnLock && (await completeGlassIds(supabase, tastingId, [wineId])).has(wineId)) {
    await supabase.rpc("score_own_guess", { p_wine_id: wineId });
  }
  await maybeAutoRevealWine(supabase, wineId);

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath(`/tastings/${tastingId}/play`);
  return { ok: true };
}

// Deferred scoring for ASYNC + IMMEDIATE (spec §C.8). lockGuess and lockGuesses
// skip score_own_guess while a glass is incomplete; once it is finished, the
// locked-in state calls this once. Idempotent: it calls score_own_guess only for
// the caller's own guess, only when that guess is locked and unscored and the
// glass is complete, and otherwise returns ok without writing anything.
export async function scoreLockedGuess(
  tastingId: string,
  wineId: string,
): Promise<LockResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const guesser = await resolveGuesser(supabase, tastingId, user.id);
  if ("error" in guesser) return { error: guesser.error };
  if (!guesser.scoresOnLock) return { ok: true };

  const { data: guess, error: guessError } = await supabase
    .from("guesses")
    .select("locked_at, scored_at")
    .eq("wine_id", wineId)
    .eq("participant_id", guesser.participantId)
    .maybeSingle();
  if (guessError) return { error: guessError.message };
  // Not locked, or already scored (by an earlier call, or by a reveal): done.
  if (!guess?.locked_at || guess.scored_at) return { ok: true };

  const blocked = await guessableWineError(supabase, tastingId, wineId, guesser.participantId);
  if (blocked) return { error: blocked };

  const incomplete = await readIncompleteGlasses(supabase, tastingId);
  if ("error" in incomplete) return { error: incomplete.error };
  if (incomplete.rows.some((glass) => glass.wineId === wineId)) return { ok: true };

  const { error } = await supabase.rpc("score_own_guess", { p_wine_id: wineId });
  if (error) return { error: error.message };

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath(`/tastings/${tastingId}/play`);
  return { ok: true };
}

// "Change it": clears locked_at so the ladder reopens. A scored guess stays
// locked — the answer has already been seen.
export async function unlockGuess(
  tastingId: string,
  wineId: string,
): Promise<LockResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const guesser = await resolveGuesser(supabase, tastingId, user.id);
  if ("error" in guesser) return { error: guesser.error };

  const { data: existing } = await supabase
    .from("guesses")
    .select("id, scored_at")
    .eq("wine_id", wineId)
    .eq("participant_id", guesser.participantId)
    .maybeSingle();
  if (!existing) return { ok: true };
  if (existing.scored_at) {
    return { error: LOCKED_ERROR };
  }

  const { error } = await supabase
    .from("guesses")
    .update({ locked_at: null })
    .eq("id", existing.id);
  if (error) return { error: error.message };

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath(`/tastings/${tastingId}/play`);
  return { ok: true };
}

// Semi-blind "Lock in all glasses": locks every unscored row among the given
// wines in one call (after submitAllMatchGuesses has written them), then
// scores/auto-reveals each. Rows that are already scored are skipped
// silently, matching submitAllMatchGuesses. Your own bottles are skipped too;
// any other refused glass (play-8) refuses the whole call.
export async function lockGuesses(
  tastingId: string,
  wineIds: string[],
): Promise<LockResult> {
  if (wineIds.length === 0) return { error: "No glasses to lock." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const guesser = await resolveGuesser(supabase, tastingId, user.id);
  if ("error" in guesser) return { error: guesser.error };

  const guard = await guessableWines(supabase, tastingId, wineIds);
  if ("error" in guard) return { error: guard.error };
  const lockable: string[] = [];
  for (const wineId of wineIds) {
    const wine = guard.wines.get(wineId) ?? null;
    // You never guess your own bottle, so there is nothing of yours to lock.
    if (wine && wine.contributorParticipantId === guesser.participantId) continue;
    const reason = guessBlockReason(wine, guesser.participantId);
    if (reason) return { error: reason };
    lockable.push(wineId);
  }
  if (lockable.length === 0) return { error: "No glasses to lock." };

  const { data: rows } = await supabase
    .from("guesses")
    .select("id, wine_id, scored_at, locked_at")
    .eq("participant_id", guesser.participantId)
    .in("wine_id", lockable);
  const toLock = (rows ?? []).filter((r) => !r.scored_at && !r.locked_at);
  if (toLock.length > 0) {
    const { error } = await supabase
      .from("guesses")
      .update({ locked_at: new Date().toISOString() })
      .in(
        "id",
        toLock.map((r) => r.id),
      );
    if (error) return { error: error.message };
  }

  const unscored = (rows ?? []).filter((r) => !r.scored_at);
  const scorable =
    guesser.scoresOnLock && unscored.length > 0
      ? await completeGlassIds(
          supabase,
          tastingId,
          unscored.map((r) => r.wine_id),
        )
      : new Set<string>();
  for (const row of unscored) {
    if (scorable.has(row.wine_id)) {
      await supabase.rpc("score_own_guess", { p_wine_id: row.wine_id });
    }
    await maybeAutoRevealWine(supabase, row.wine_id);
  }

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath(`/tastings/${tastingId}/play`);
  return { ok: true };
}

// Semi-blind matching is submitted as one batch (every still-hidden glass
// paired to a candidate at once), not per-glass — see match-guess-form.tsx
// for why partial submission doesn't make sense here. Like submitGuess, this
// only writes: scoring/auto-reveal happen in lockGuesses.
export async function submitAllMatchGuesses(
  _prevState: GuessFormState,
  formData: FormData,
): Promise<GuessFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const tastingId = String(formData.get("tasting_id") ?? "");
  let guessesByWineId: Record<string, string>;
  try {
    guessesByWineId = JSON.parse(String(formData.get("guesses") ?? "{}"));
  } catch {
    return { error: "Malformed submission." };
  }

  const wineIds = Object.keys(guessesByWineId);
  if (wineIds.length === 0) {
    return { error: "No glasses to match." };
  }
  if (wineIds.some((id) => !guessesByWineId[id])) {
    return { error: "Match every glass before submitting." };
  }

  const guesser = await resolveGuesser(supabase, tastingId, user.id);
  if ("error" in guesser) return { error: guesser.error };
  const participant = { id: guesser.participantId };

  // play-8: one refused glass refuses the whole batch, before anything is written.
  const guard = await guessableWines(supabase, tastingId, wineIds);
  if ("error" in guard) return { error: guard.error };
  for (const wineId of wineIds) {
    const reason = guessBlockReason(guard.wines.get(wineId) ?? null, participant.id);
    if (reason) return { error: reason };
  }

  const { data: existingGuesses } = await supabase
    .from("guesses")
    .select("id, wine_id, scored_at")
    .eq("participant_id", participant.id)
    .in("wine_id", wineIds);
  const existingByWineId = new Map(
    (existingGuesses ?? []).map((g) => [g.wine_id, g]),
  );

  for (const wineId of wineIds) {
    const existing = existingByWineId.get(wineId);
    // Skip glasses whose match is already locked in (scored).
    if (existing?.scored_at) continue;
    const payload = {
      wine_id: wineId,
      participant_id: participant.id,
      guessed_wine_id: guessesByWineId[wineId],
    };
    const { error } = existing
      ? await supabase.from("guesses").update(payload).eq("id", existing.id)
      : await supabase.from("guesses").insert(payload);
    if (error) {
      return { error: error.message };
    }
  }

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath(`/tastings/${tastingId}/play`);
  revalidatePath(`/tastings/${tastingId}/results`);
  return { success: true };
}

export type RevealFormState = { error: string } | null;

export async function revealWine(
  _prevState: RevealFormState,
  formData: FormData,
): Promise<RevealFormState> {
  const wineId = String(formData.get("wine_id") ?? "");

  const supabase = await createClient();
  // Derive the tasting from the wine row — the form's tasting_id is
  // client-supplied and must not be trusted for the closed-state check.
  const { data: wine } = await supabase
    .from("wines")
    .select("tasting_id")
    .eq("id", wineId)
    .maybeSingle();
  if (!wine) return { error: "Wine not found." };
  const { data: tasting } = await supabase
    .from("tastings")
    .select("status")
    .eq("id", wine.tasting_id)
    .maybeSingle();
  if (tasting?.status === "CLOSED") {
    return { error: "This tasting is finished — reveals are closed." };
  }
  // An incomplete glass (no answer key yet) is never revealed (spec §C.8). A
  // failed read refuses too.
  const incomplete = await readIncompleteGlasses(supabase, wine.tasting_id);
  if ("error" in incomplete) return { error: incomplete.error };
  const refusal = revealRefusal(incomplete.rows, wineId);
  if (refusal) return { error: refusal };

  const { error } = await supabase.rpc("reveal_wine", { p_wine_id: wineId });
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/tastings/${wine.tasting_id}/play`);
  revalidatePath(`/tastings/${wine.tasting_id}/results`);
  return null;
}
