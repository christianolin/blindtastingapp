// B6 pacing guards: the server-side rules behind reveal pacing and the host's
// Pause / Skip controls (spec §7.3 items 2-3, §5.3 items 4-5; refinements 5,
// 6; Q1). Every action that reveals a category, reveals a whole glass, or
// skips the pour pointer asks this module instead of holding its own rule,
// so the console, the guided ladder and a stale second console tab can never
// disagree about what's allowed right now.
// Pure: runtime imports by relative path only, so vitest loads it in node.

import { CURRENT_GLASS_ONLY, PAUSED_REFUSAL } from "./console-copy";
import { currentGlass, skipTarget, type PointerGlass } from "./pour-pointer";
import type { RevealMode, TastingStatus } from "@/lib/supabase/database.types";

// (plan copy) — skipPlan outside IN_PROGRESS: the spec names no refusal for a
// Skip on a tasting that isn't running.
const NOT_RUNNING_REFUSAL = "The tasting is not running.";

// (plan copy) — skipPlan with a stale glass or one past step 0: a second
// console tab can race the first, so both read the same sentence.
const STALE_GLASS_REFUSAL = "That glass is no longer the one pouring.";

/**
 * Whether a step reveal (or a full reveal) of `wineId` is refused right now,
 * or null when it's allowed.
 * - A pause refuses every reveal, guided or free (Q1) — checked first, so a
 *   paused guided tasting reads as paused, not as the wrong glass.
 * - Guided pacing (LIVE blind, `sequential_guessing` on) accepts only the
 *   glass the pour pointer is currently on — `currentGlass` (BT-P3), not a
 *   bare lowest-position check, so a Skip that moved the pointer is honoured.
 * - Free order (not guided) never refuses on the glass alone.
 */
export function revealStepRefusal(input: {
  guided: boolean;
  paused: boolean;
  glasses: readonly PointerGlass[];
  pointer: string | null;
  wineId: string;
}): string | null {
  if (input.paused) return PAUSED_REFUSAL;
  if (!input.guided) return null;
  const current = currentGlass(input.glasses, input.pointer);
  if (!current || current.id === input.wineId) return null;
  return CURRENT_GLASS_ONLY;
}

/**
 * What "Skip to the next glass" should do, read from `fromWineId` — the
 * glass the console believed was current a moment ago.
 * - Refused outright: the tasting isn't IN_PROGRESS, it's paused, or
 *   `fromWineId` is no longer the current glass — either a stale read (a
 *   second console tab already skipped, or the reveal moved on) or a glass
 *   whose reveal is under way (`revealStep > 0`, so there's nothing
 *   left to skip away from). Both share one sentence: neither is a glass a
 *   Skip makes sense on any more.
 * - `null`: nothing to skip to. In BLIND that's only the current glass being
 *   the sole unrevealed one; in SEMI_BLIND it also covers a wrap that would
 *   land before the pointer (refinement 23) — every glass up to the pointer
 *   is already open for matching, so wrapping back over them would re-dim
 *   glasses guests can already act on. The console hides Skip in that case.
 * - Otherwise the target glass and the pointer value this call read, so the
 *   caller can write a compare-and-set
 *   (`.eq("current_wine_id", expectPointer)`) and a second tap that already
 *   landed becomes a no-op instead of skipping twice.
 */
export function skipPlan(input: {
  status: TastingStatus;
  paused: boolean;
  glasses: readonly PointerGlass[];
  pointer: string | null;
  fromWineId: string;
  revealMode: RevealMode;
}): { targetId: string; expectPointer: string | null } | { error: string } | null {
  if (input.status !== "IN_PROGRESS") return { error: NOT_RUNNING_REFUSAL };
  if (input.paused) return { error: PAUSED_REFUSAL };

  const current = currentGlass(input.glasses, input.pointer);
  if (!current || current.id !== input.fromWineId) {
    return { error: STALE_GLASS_REFUSAL };
  }
  if ((input.glasses[current.index]?.revealStep ?? 0) > 0) {
    return { error: STALE_GLASS_REFUSAL };
  }

  const target = skipTarget(input.glasses, current);
  if (!target) return null;
  if (input.revealMode === "SEMI_BLIND") {
    // A glass can wrap `current` behind the pointer (e.g. a non-pointer-gated
    // `revealFull` on the pointer's own glass wraps `current` back to a lower
    // index) — the no-wrap rule (refinement 23) is about the pointer, the
    // glass every already-open candidate list is measured from, not about
    // wherever `current` happens to have wrapped to. Guard on whichever index
    // is higher so a target already open for matching (at or before either
    // one) is never re-offered as a Skip destination.
    const pointerIndex =
      input.pointer === null ? -1 : input.glasses.findIndex((glass) => glass.id === input.pointer);
    if (target.index < Math.max(current.index, pointerIndex)) {
      return null;
    }
  }
  return { targetId: target.id, expectPointer: input.pointer };
}
