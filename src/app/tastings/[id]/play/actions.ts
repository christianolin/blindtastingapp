"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { VintageKind } from "@/lib/supabase/database.types";

// The row shape the ladder edits — defined in ladder-types.ts (pure types) so
// client components can import it without touching this "use server" module.
export type { GuessRow } from "./ladder-types";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// Auto-reveals a wine once every participant who's supposed to guess it has
// LOCKED IN, so an ASYNC host doesn't have to babysit "has everyone
// answered?". LIVE tastings are NEVER auto-revealed — the host paces the
// reveal manually with the Reveal button. Skips silently on any lookup
// failure; a missed auto-reveal just means the host reveals manually.
//
// The ladder autosaves a guess row on the first tap, so "a row exists" no
// longer means "done" — only rows with `locked_at` count. Eligible guessers
// = JOINED participants minus the wine's contributor minus the host when the
// host provides the wines (they set the answers and never guess; counting
// them meant an ASYNC + HOST_PROVIDES tasting could never auto-reveal).
async function maybeAutoRevealWine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  wineId: string,
) {
  const { data: wine } = await supabase
    .from("wines")
    .select("tasting_id, is_revealed, contributor_participant_id")
    .eq("id", wineId)
    .maybeSingle();
  if (!wine || wine.is_revealed) return;

  const { data: tasting } = await supabase
    .from("tastings")
    .select("timing_mode, wine_source, host_id")
    .eq("id", wine.tasting_id)
    .maybeSingle();
  if (!tasting || tasting.timing_mode !== "ASYNC") return;

  const { data: joined } = await supabase
    .from("tasting_participants")
    .select("id, user_id")
    .eq("tasting_id", wine.tasting_id)
    .eq("status", "JOINED");
  const eligibleCount = (joined ?? []).filter(
    (p) =>
      p.id !== (wine.contributor_participant_id ?? NIL_UUID) &&
      !(tasting.wine_source === "HOST_PROVIDES" && p.user_id === tasting.host_id),
  ).length;
  if (eligibleCount <= 0) return;

  const { count: lockedCount } = await supabase
    .from("guesses")
    .select("id", { count: "exact", head: true })
    .eq("wine_id", wineId)
    .not("locked_at", "is", null);

  if ((lockedCount ?? 0) >= eligibleCount) {
    // Known gap (no migration this round): reveal_wine's own non-host gate
    // still counts the HOST_PROVIDES host among the expected guessers and
    // counts unlocked drafts as guesses, so in ASYNC + HOST_PROVIDES tastings
    // it raises "Not everyone has guessed yet" here and the wine waits for
    // the host's manual reveal. Surfaced in the server log rather than
    // swallowed so the next schema pass can realign the gate.
    const { error } = await supabase.rpc("reveal_wine", { p_wine_id: wineId });
    if (error) console.warn(`auto-reveal of wine ${wineId} refused: ${error.message}`);
  }
}

// "One wine at a time" pacing: only the current (lowest-position unrevealed)
// wine may be guessed. Null when in order (or not sequential).
async function sequentialOrderError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tastingId: string,
  wineId: string,
): Promise<string | null> {
  const { data: seqTasting } = await supabase
    .from("tastings")
    .select("sequential_guessing, reveal_mode")
    .eq("id", tastingId)
    .maybeSingle();
  if (!seqTasting?.sequential_guessing || seqTasting.reveal_mode !== "BLIND") return null;
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

export type GuessFormState = { error: string } | { success: true } | null;

// Resolves the caller's participant row and enforces that they may guess:
// they must be a JOINED participant and the tasting must have started (host
// pressed Start → status left 'DRAFT'). Returns the participant id or an
// error message.
async function resolveGuesser(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tastingId: string,
  userId: string,
): Promise<{ participantId: string } | { error: string }> {
  const { data: tasting } = await supabase
    .from("tastings")
    .select("status, wine_source, host_id")
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
  return { participantId: participant.id };
}

const LOCKED_ERROR = "This guess is locked — it's already been scored.";

// Autosave target for the guess ladder: called with the COMPLETE current
// state after every pick (full-row replace — an absent field becomes null).
// Scoring and auto-reveal no longer happen here; they moved to lockGuess so a
// half-filled draft is never scored or counted as "done".
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

  const orderError = await sequentialOrderError(supabase, tastingId, wineId);
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

  const { data: existing } = await supabase
    .from("guesses")
    .select("id, scored_at")
    .eq("wine_id", wineId)
    .eq("participant_id", participant.id)
    .maybeSingle();

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
// submitGuess used to run after every write: score_own_guess (immediate-mode
// async only — a no-op elsewhere) and the ASYNC auto-reveal check. Locking is
// a readiness signal, not a gate: the host can still reveal early and
// reveal_wine scores whatever was saved. A taster with no row yet (skipped
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

  await supabase.rpc("score_own_guess", { p_wine_id: wineId });
  await maybeAutoRevealWine(supabase, wineId);

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
// silently, matching submitAllMatchGuesses.
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

  const { data: rows } = await supabase
    .from("guesses")
    .select("id, wine_id, scored_at, locked_at")
    .eq("participant_id", guesser.participantId)
    .in("wine_id", wineIds);
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

  for (const row of rows ?? []) {
    if (row.scored_at) continue;
    await supabase.rpc("score_own_guess", { p_wine_id: row.wine_id });
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
  const { error } = await supabase.rpc("reveal_wine", { p_wine_id: wineId });
  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/tastings/${wine.tasting_id}/play`);
  revalidatePath(`/tastings/${wine.tasting_id}/results`);
  return null;
}
