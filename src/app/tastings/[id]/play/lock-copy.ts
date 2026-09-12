// Lock-in copy for the guess ladder and the semi-blind match ladder (spec
// §D.2 #3–#5; play-4, play-5, play-7). Pure — no React, no Supabase — so the
// wording is pinned by lock-copy.test.ts.
//
// Only ASYNC + IMMEDIATE tastings get their own lock copy: there, locking runs
// score_own_guess, so the button is a final submission that shows the answer.
// Everywhere else (LIVE, ASYNC AFTER_ALL, or no mode passed) locking is a
// readiness signal that "Change it" can take back, and today's copy stays —
// the helpers return null so the caller keeps its existing string.
import type { AsyncRevealPolicy, TimingMode } from "@/lib/supabase/database.types";

type LockMode = {
  timingMode?: TimingMode;
  asyncRevealPolicy?: AsyncRevealPolicy;
};

function submitsImmediately({ timingMode, asyncRevealPolicy }: LockMode): boolean {
  return timingMode === "ASYNC" && asyncRevealPolicy === "IMMEDIATE";
}

/** The note under the ladder's six main rows (play-5). The two optional rows
 *  are offered for every glass, so the note must not suggest they leak
 *  whether this wine has them. */
export const LADDER_EXTRAS_NOTE =
  "Secondary grape and type designation only score if the wine has one (2 pts each). They're under More for every glass.";

/** The match ladder's footer helper (play-7): there is no skip, every glass
 *  must be matched before it can lock. */
export const MATCH_FOOTER =
  "Every glass needs a match — a wrong match just scores 0. Locking saves every match at once and shows the others you are ready.";

/**
 * The lock button's label in ASYNC + IMMEDIATE — one glass on the guess
 * ladder, every glass on the match ladder — or null to keep today's label.
 */
export function lockButtonLabel(
  args: LockMode & ({ match: false; glass: number } | { match: true; glass?: number }),
): string | null {
  if (!submitsImmediately(args)) return null;
  return args.match
    ? "Submit all glasses and see the answers"
    : `Submit glass ${args.glass} and see the answer`;
}

/** The guess ladder's footer line in ASYNC + IMMEDIATE, or null to keep
 *  today's "Saved as you go. Locking stops edits…" line. */
export function lockFooter(mode: LockMode): string | null {
  if (!submitsImmediately(mode)) return null;
  return "Saved as you go. Submitting scores this glass and shows you the answer — it can't be changed afterwards.";
}

/** The window.confirm text before an ASYNC + IMMEDIATE submit; a blank guess
 *  (0 points at stake) gets the stronger warning. */
export function lockConfirm({ glass, blank }: { glass: number; blank: boolean }): string {
  if (blank) return "You haven't answered anything — submit a blank guess for 0 points?";
  return `Submit glass ${glass}? You'll see the answer, and it can't be changed afterwards.`;
}
