import type { RevealMode, TimingMode } from "@/lib/supabase/database.types";

// Pure copy and rules for the live host console (S7, S7b) and the pacing
// surfaces around it (spec §7.3 items 2, 4, 5, 7 and 10). Only type imports,
// so vitest can load it without the `@/` alias.

// ── Who has not locked in ────────────────────────────────────────────────────

const NOT_LOCKED_TAIL =
  "They are scored on whatever they have already answered — nothing at all if they have not started.";

// "Maja" · "Maja and Gustav" · "Maja, Gustav and 2 others"
function namesPhrase(names: readonly string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const others = names.length - 2;
  // (plan copy) "{a}, {b} and 1 other …" — the spec writes only "{n} others".
  return `${names[0]}, ${names[1]} and ${others} ${others === 1 ? "other" : "others"}`;
}

/**
 * The line naming everyone eligible who has not locked in on the glass being
 * poured (B6; HOST-18). They/them for every name, so it never assumes anyone's
 * pronouns. The laptop line says they have not locked in and what a reveal
 * does to them; the phone card's short form (S7b) folds both into one clause.
 * Null when nobody is missing.
 */
export function notLockedLine(
  names: readonly string[],
  opts: { phone: boolean },
): string | null {
  if (names.length === 0) return null;
  const who = namesPhrase(names);
  const one = names.length === 1;
  if (opts.phone) {
    return `${who} ${one ? "is" : "are"} scored on what they have answered — nothing if they have not started.`;
  }
  return `${who} ${one ? "has" : "have"} not locked in. ${NOT_LOCKED_TAIL}`;
}

// ── Pause (Q1) ───────────────────────────────────────────────────────────────

/** The band on every participant's live screen while the host has paused. */
export function pausedBand(host: string): string {
  return `Paused · ${host} has paused the tasting. You can still change and lock your guess.`;
}

/**
 * The console header's eyebrow (owner, 2026-09-24: while paused the eyebrow
 * itself should say so, replacing the separate paused pill that used to sit
 * atop the main column). Finished wins over paused; LIVE-paused beats plain
 * LIVE; ASYNC (self-paced) never pauses.
 */
export function consoleEyebrow(t: {
  finished: boolean;
  timingMode: TimingMode;
  paused: boolean;
}): string {
  if (t.finished) return "Finished · you hosted";
  if (t.timingMode === "LIVE" && t.paused) return "Paused · you are hosting";
  if (t.timingMode === "LIVE") return "Live · you are hosting";
  return "Self-paced · you are hosting";
}

/** What every reveal action and Skip refuse with while the tasting is paused. */
export const PAUSED_REFUSAL = "The tasting is paused — resume to reveal.";

// ── The pour pointer ─────────────────────────────────────────────────────────

/** In guided LIVE pacing a step reveal is accepted only on the current glass. */
export const CURRENT_GLASS_ONLY = "Reveal the glass that is pouring now.";

/** The gold button for a competing bring-your-own host, who never sees which
    attribute comes next (spec §7.3 item 7). */
export const NEXT_ATTRIBUTE = "Reveal the next attribute";

/** "Pouring now · glass 3 of 6 so far" — the count is the flight so far, never
    a planned total. */
export function pouringNowEyebrow(glass: number, soFar: number): string {
  return `Pouring now · glass ${glass} of ${soFar} so far`;
}

/** The eyebrow once the pointer has wrapped back to a glass Skip passed over. */
export function skippedEyebrow(glass: number): string {
  return `Glass ${glass} was skipped · Pour it now`;
}

export function skipLabel(glass: number): string {
  return `Skip to glass ${glass} →`;
}

/**
 * The dashed "next" chip a competing bring-your-own host sees, built from
 * `get_wine_reveal` rather than the answer key (spec §7.3 item 7). Bare "Next"
 * at step 0: `get_wine_reveal` returns a null `in_play_count` there after M1,
 * and even a known count must not show then — 5, 6 or 7 says whether an
 * appellation or a designation is in play (rule 1). From step 1 it reads
 * "{in_play_count − reveal_step} to go"; never "0 to go".
 */
export function nextChipLabel(inPlayCount: number | null, revealStep: number): string {
  if (inPlayCount === null || revealStep <= 0) return "Next";
  const toGo = inPlayCount - revealStep;
  return toGo > 0 ? `${toGo} to go` : "Next";
}

/**
 * Which tastings reveal attribute by attribute (Q8; REVEAL-02): only a LIVE
 * blind tasting with guided pacing — the rule `leaderboardApplies` already uses
 * at creation. The console's chips and the participants' `RevealView` both ask
 * this one predicate, so the two gates cannot drift apart. Every other tasting
 * reveals whole glasses.
 */
export function stepRevealApplies(t: {
  revealMode: RevealMode;
  timingMode: TimingMode;
  sequentialGuessing: boolean;
}): boolean {
  return t.revealMode === "BLIND" && t.timingMode === "LIVE" && t.sequentialGuessing;
}

// ── The two-tap confirm (XCUT-37) ────────────────────────────────────────────

export type TwoTapState = "idle" | "armed";

/** How long a first tap keeps a two-tap button armed. */
export const TWO_TAP_WINDOW_MS = 5000;

/**
 * The inline two-tap confirm that replaces `window.confirm`, shared by Reveal
 * everything (BT-H2) and Delete the tasting (BT-L4). The first tap stores
 * `armedAt`; a second tap inside the window submits. Past the window — or with
 * a clock that reads earlier than the arming tap — the button is idle again,
 * so it can never stay armed.
 */
export function twoTapState(armedAt: number | null, now: number): TwoTapState {
  if (armedAt === null) return "idle";
  const elapsed = now - armedAt;
  return elapsed >= 0 && elapsed < TWO_TAP_WINDOW_MS ? "armed" : "idle";
}

export function revealEverythingLabel(state: TwoTapState): string {
  return state === "armed" ? "Tap again to reveal everything" : "Reveal everything";
}
