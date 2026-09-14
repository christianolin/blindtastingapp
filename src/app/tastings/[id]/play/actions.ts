"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PAUSED_REFUSAL } from "@/lib/console-copy";
import { createClient } from "@/lib/supabase/server";
import { chooseFirst, matchRefusalSentence } from "@/lib/semi-blind-copy";
import type { SemiBlindBoardJson } from "@/lib/semi-blind-board";
import { revealRefusal, type IncompleteGlass } from "@/lib/wine-identity/incomplete";
import { listIncompleteGlasses } from "@/lib/wine-identity/server/incomplete-glasses";
import { maybeAutoRevealWine } from "./auto-reveal";
import { guessableWineError, resolveGuesser, sequentialOrderError } from "./guesser";
import { LOCKED_EDIT_REFUSAL } from "./ladder-copy";
import { groupPayload, type GuessFieldGroup } from "./guess-write";
import type { GuessRow } from "./ladder-types";

// The row shape the ladder edits — defined in ladder-types.ts (pure types) so
// client components can import it without touching this "use server" module.
export type { GuessRow } from "./ladder-types";

type Client = Awaited<ReturnType<typeof createClient>>;

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

// ── Semi-blind matching (BT-S2, spec §10.3 item 2) ──────────────────────────
//
// assignMatch/clearMatch call assign_semi_blind_match/clear_semi_blind_match
// (M9a) and map a refusal through matchRefusalSentence (BT-P6), which needs
// two small lookups the RPC's own refusal doesn't carry: which list-order
// glass a holder wine id is ("glass locked") and which candidate keys are
// currently revealed ("that wine is not in your pool"). Both are fetched only
// when the specific refusal that needs them actually happens.

// wineId → list-order glass number ("Glass 3"), never the stored position —
// same convention as semi-blind-board.ts's BoardGlass.glass.
async function glassNumberLookup(
  supabase: Client,
  tastingId: string,
): Promise<(wineId: string) => number | null> {
  const { data } = await supabase
    .from("wines")
    .select("id")
    .eq("tasting_id", tastingId)
    .order("position");
  const index = new Map((data ?? []).map((w, i) => [w.id, i + 1]));
  return (wineId: string) => index.get(wineId) ?? null;
}

// The candidate keys of every currently revealed glass, from get_semi_blind_board
// — never semi_blind_candidate_keys directly (RLS reserves that table for the
// SECURITY DEFINER functions; rule 1: the board speaks in opaque keys only).
async function revealedCandidateKeys(
  supabase: Client,
  tastingId: string,
): Promise<ReadonlySet<string>> {
  const { data } = await supabase.rpc("get_semi_blind_board", { p_tasting_id: tastingId });
  const board = data as SemiBlindBoardJson | null;
  return new Set((board?.revealed ?? []).map((row) => row.key));
}

// assign_semi_blind_match / clear_semi_blind_match's error → the sentence the
// board shows (spec §10.3 item 2). glassNumberOf and revealedKeys are only
// fetched for the one refusal each actually explains.
async function matchErrorMessage(
  supabase: Client,
  tastingId: string,
  candidateKey: string,
  error: { message: string; details?: string | null },
): Promise<string> {
  const message = error.message.trim().toLowerCase();
  const glassNumberOf =
    message === "glass locked" ? await glassNumberLookup(supabase, tastingId) : () => null;
  const revealedKeys =
    message === "that wine is not in your pool"
      ? await revealedCandidateKeys(supabase, tastingId)
      : new Set<string>();
  return matchRefusalSentence(error, {
    glassNumberOf,
    candidateKey,
    revealedKeys,
    lockedIn: LOCKED_EDIT_REFUSAL,
  });
}

// lockGuess's app guard for a semi-blind glass (spec §10.3 item 2, "Lock per
// glass"): chooseFirst(n) when the caller has not assigned this glass yet,
// read through get_semi_blind_board — never the picked-wine column (rule 1).
// Null for a BLIND tasting (nothing to guard) and whenever a key is already
// assigned.
async function semiBlindLockGuard(
  supabase: Client,
  tastingId: string,
  wineId: string,
): Promise<string | null> {
  const { data: tasting } = await supabase
    .from("tastings")
    .select("reveal_mode")
    .eq("id", tastingId)
    .maybeSingle();
  if (tasting?.reveal_mode !== "SEMI_BLIND") return null;

  const { data } = await supabase.rpc("get_semi_blind_board", { p_tasting_id: tastingId });
  const board = data as SemiBlindBoardJson | null;
  const mine = board?.mine.find((row) => row.glass_wine_id === wineId);
  if (mine?.key != null) return null;

  const glassNumberOf = await glassNumberLookup(supabase, tastingId);
  return chooseFirst(glassNumberOf(wineId) ?? 0);
}

const LOCKED_ERROR = "This guess is locked — it's already been scored.";

const EMPTY_GUESS_ROW: GuessRow = {
  country_id: null,
  region_id: null,
  appellation_id: null,
  primary_grape_id: null,
  secondary_grape_id: null,
  producer_id: null,
  type_designation_id: null,
  vintage_kind: null,
  vintage_year: null,
  vintage_tawny_years: null,
};

export type LockResult = { ok: true } | { error: string };

// Per-field-group autosave (spec §8.3 item 5; reverses "each pick autosaves
// the COMPLETE row"). The ladder keeps one save queue per GuessFieldGroup
// (guess-save-queue.ts) and calls this once per pick with only that group's
// values, so a failed save reverts just that group on screen instead of the
// whole ladder (critic on XCUT-53). The server never trusts the client's
// shape — groupPayload validates again here. Writes guess fields only, never
// a scoring column (20260912093000); refused once the glass's reveal has
// started or on your own bottle (play-8), or once the glass is locked. An
// incomplete glass can still be guessed (spec §C.8).
export async function saveGuessFields(
  tastingId: string,
  wineId: string,
  group: GuessFieldGroup,
  values: Partial<GuessRow>,
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
  const participant = { id: guesser.participantId };

  const blocked = await guessableWineError(supabase, tastingId, wineId, participant.id);
  if (blocked) return { error: blocked };
  const orderError = await sequentialOrderError(supabase, tastingId, wineId);
  if (orderError) return { error: orderError };

  const payload = groupPayload(group, { ...EMPTY_GUESS_ROW, ...values }, new Date());
  if ("error" in payload) return { error: payload.error };

  const { data: existing } = await supabase
    .from("guesses")
    .select("locked_at, scored_at")
    .eq("wine_id", wineId)
    .eq("participant_id", participant.id)
    .maybeSingle();
  if (existing?.scored_at) {
    return { error: LOCKED_ERROR };
  }
  if (existing?.locked_at) {
    return { error: LOCKED_EDIT_REFUSAL };
  }

  // PostgREST's merge-duplicates upsert updates only the columns present in
  // payload.values, so the other groups' columns are left exactly as they
  // are (093000: only guess columns are ever sent). groupPayload's return type
  // is Partial<GuessRow>, which structurally still carries GuessRow's own
  // optional locked_at/scored_at — groupPayload itself never sets either, but
  // the Insert type marks both never-assignable by a client (093000), so the
  // cast drops the two keys the value never actually carries.
  const writable = payload.values as Omit<Partial<GuessRow>, "locked_at" | "scored_at">;
  const { error } = await supabase
    .from("guesses")
    .upsert(
      { wine_id: wineId, participant_id: participant.id, ...writable },
      { onConflict: "wine_id,participant_id" },
    );
  if (error) {
    // 42501 (insufficient_privilege): guesses_refuse_locked_edit fired — a
    // lock committed between the read above and this write.
    return { error: error.code === "42501" ? LOCKED_EDIT_REFUSAL : error.message };
  }

  // No revalidatePath: this is a background autosave, not a user-visible
  // navigation — the ladder already shows the confirmed state itself.
  return { ok: true };
}

// Stamps locked_at on the caller's saved guess for one wine, then runs
// score_own_guess (ASYNC + IMMEDIATE only, and only for a complete glass —
// an incomplete one defers scoring to scoreLockedGuess, spec §C.8) and the
// ASYNC auto-reveal check — the same follow-up every per-group save used to
// run on every autosave, now done once at lock instead.
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
  const matchGuard = await semiBlindLockGuard(supabase, tastingId, wineId);
  if (matchGuard) return { error: matchGuard };

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
    // Same order rule as saveGuessFields, so an out-of-order blank row
    // can't be created either. All category columns default null — the
    // shape a fully-skipped guess ends up with.
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

  // The lock has already committed here, so this must NOT return an error: the
  // ladder reads `{ error }` as "the lock did not happen", clears lockedRef and
  // reopens over a row that is in fact locked. A failed scoring is recoverable
  // instead — LockedIn re-runs the idempotent `scoreLockedGuess` once the glass
  // is complete, and that one does surface its error. So it is logged, not
  // discarded and not raised, the same way `keepRead` treats a lost read.
  if (guesser.scoresOnLock && (await completeGlassIds(supabase, tastingId, [wineId])).has(wineId)) {
    const { error } = await supabase.rpc("score_own_guess", { p_wine_id: wineId });
    if (error) {
      console.error("lockGuess: scoring the locked guess failed", {
        wineId,
        code: error.code,
        message: error.message,
      });
    }
  }
  await maybeAutoRevealWine(supabase, wineId);

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath(`/tastings/${tastingId}/play`);
  return { ok: true };
}

// Deferred scoring for ASYNC + IMMEDIATE (spec §C.8). lockGuess skips
// score_own_guess while a glass is incomplete; once it is finished, the
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
// locked — the answer has already been seen. Also refused once the glass's
// reveal has started (guessBlockReason's own string, via guessableWineError):
// once reveal_step > 0 the taster has started seeing the answer, so "Change
// it" hides (S10) and a stray call here is refused the same way a new guess
// would be (play-8).
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

  const blocked = await guessableWineError(supabase, tastingId, wineId, guesser.participantId);
  if (blocked) return { error: blocked };

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

// Semi-blind matching (B9, spec §10.3 item 2): puts candidateKey on the
// caller's glassWineId row. assign_semi_blind_match does the swap itself (a
// candidate already held by another open, unlocked glass moves to this
// glass's previous candidate, or leaves it empty) — applyAssignment
// (semi-blind-board.ts) mirrors the same rule for the optimistic board, so
// this only ever needs to apply the RPC's own answer, never recompute a
// swap. No revalidatePath: like saveGuessFields, this is a background
// autosave the board already shows optimistically.
export async function assignMatch(
  tastingId: string,
  glassWineId: string,
  candidateKey: string,
): Promise<{ ok: true; swappedWith: string | null } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const guesser = await resolveGuesser(supabase, tastingId, user.id);
  if ("error" in guesser) return { error: guesser.error };
  // Review round 1: bind glassWineId to tastingId the same way every other
  // guess action does, before trusting either for pacing — sequentialOrderError
  // reads *this* tasting's glasses/pointer, so without this a glass id from a
  // different tasting the caller also belongs to would have its pacing judged
  // against the wrong tasting's settings (and could bypass pacing entirely by
  // naming a non-LIVE or non-guided tasting as tastingId).
  const blocked = await guessableWineError(supabase, tastingId, glassWineId, guesser.participantId);
  if (blocked) return { error: blocked };
  // Refinement 6: semi-blind guided pacing refuses a glass beyond pouredThrough
  // on the server too, with the same sentence a not-in-order blind guess gets.
  const orderError = await sequentialOrderError(supabase, tastingId, glassWineId);
  if (orderError) return { error: orderError };

  let { data, error } = await supabase.rpc("assign_semi_blind_match", {
    p_wine_id: glassWineId,
    p_candidate_key: candidateKey,
  });
  // BT-SQL9 review: 40P01 (a deadlock between this participant's own two row
  // locks, taken in a different order by an overlapping call) and 23505 (a
  // race on guesses_one_open_glass_per_candidate) are transient concurrency
  // artifacts, not a real refusal — a lone retry resolves them silently
  // rather than surfacing a raw Postgres sentence (the same retry-once
  // pattern upsertCatalogWine uses for its own 23505 race).
  if (error && (error.code === "40P01" || error.code === "23505")) {
    ({ data, error } = await supabase.rpc("assign_semi_blind_match", {
      p_wine_id: glassWineId,
      p_candidate_key: candidateKey,
    }));
  }
  if (error) {
    return { error: await matchErrorMessage(supabase, tastingId, candidateKey, error) };
  }

  const result = data as { glass: string; swapped_with: string | null } | null;
  return { ok: true, swappedWith: result?.swapped_with ?? null };
}

// The caller's own unlocked, unscored row on glassWineId loses its
// candidate. No pacing guard (clear_semi_blind_match has none — pacing only
// ever stops a glass from being assigned in the first place); errors mapped
// the same way as assignMatch.
export async function clearMatch(
  tastingId: string,
  glassWineId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const guesser = await resolveGuesser(supabase, tastingId, user.id);
  if ("error" in guesser) return { error: guesser.error };
  // Same binding as assignMatch (review round 1) — clearMatch has no pacing
  // guard of its own, but glassNumberLookup below still reads *this* tasting's
  // wines for the "glass locked" sentence, so glassWineId must belong to it.
  const blocked = await guessableWineError(supabase, tastingId, glassWineId, guesser.participantId);
  if (blocked) return { error: blocked };

  let { error } = await supabase.rpc("clear_semi_blind_match", { p_wine_id: glassWineId });
  if (error && (error.code === "40P01" || error.code === "23505")) {
    ({ error } = await supabase.rpc("clear_semi_blind_match", { p_wine_id: glassWineId }));
  }
  if (error) {
    return { error: await matchErrorMessage(supabase, tastingId, "", error) };
  }
  return { ok: true };
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
    .select("status, paused_at")
    .eq("id", wine.tasting_id)
    .maybeSingle();
  if (tasting?.status === "CLOSED") {
    return { error: "This tasting is finished — reveals are closed." };
  }
  // Q1: no reveal while the host has paused, checked here so the common case
  // never round-trips to the database for it. wines_refuse_reveal_while_paused
  // (M7) still refuses the RPC below if a pause commits between this check
  // and the call — mapped to the same copy rather than the raw DB message.
  if (tasting?.paused_at) {
    return { error: PAUSED_REFUSAL };
  }
  // An incomplete glass (no answer key yet) is never revealed (spec §C.8). A
  // failed read refuses too.
  const incomplete = await readIncompleteGlasses(supabase, wine.tasting_id);
  if ("error" in incomplete) return { error: incomplete.error };
  const refusal = revealRefusal(incomplete.rows, wineId);
  if (refusal) return { error: refusal };

  const { error } = await supabase.rpc("reveal_wine", { p_wine_id: wineId });
  if (error) {
    return { error: error.message === "The tasting is paused" ? PAUSED_REFUSAL : error.message };
  }

  revalidatePath(`/tastings/${wine.tasting_id}/play`);
  revalidatePath(`/tastings/${wine.tasting_id}/results`);
  return null;
}
