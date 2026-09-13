// B6 pour pointer (spec §7.3 item 3; plan refinement 6). `tastings.current_wine_id`
// is the glass the host is pouring; null means the lowest unrevealed glass. A
// reveal never rewrites the pointer: once its glass is revealed, the next
// unrevealed glass after it is current, wrapping back to a skipped one. The
// console, the ladder, the matching board, `sequentialOrderError` and
// `assignMatch` all ask this module, so the pacing rule lives in one place.
// Pure: runtime imports by relative path only, so vitest loads it in node.

import type { RevealMode, TimingMode } from "@/lib/supabase/database.types";

/** One glass of the flight. Every function here takes glasses in list order. */
export type PointerGlass = { id: string; isRevealed: boolean; revealStep: number };

/** The first unrevealed glass with an index in [from, to), or null. */
function firstUnrevealed(
  glasses: readonly PointerGlass[],
  from: number,
  to: number,
): { id: string; index: number } | null {
  for (let index = Math.max(0, from); index < Math.min(to, glasses.length); index++) {
    const glass = glasses[index];
    if (glass && !glass.isRevealed) return { id: glass.id, index };
  }
  return null;
}

function indexOfGlass(glasses: readonly PointerGlass[], wineId: string | null): number {
  return wineId === null ? -1 : glasses.findIndex((glass) => glass.id === wineId);
}

/**
 * The glass pouring now.
 * - No pointer, or a pointer outside the list: the lowest unrevealed glass.
 * - The pointer's glass while unrevealed: that glass.
 * - The pointer's glass once revealed: the next unrevealed glass after it,
 *   wrapping to the lowest unrevealed one (`wrapped: true`, a skipped glass).
 * - Null when every glass is revealed.
 */
export function currentGlass(
  glasses: readonly PointerGlass[],
  pointerWineId: string | null,
): { id: string; index: number; wrapped: boolean } | null {
  const pointerIndex = indexOfGlass(glasses, pointerWineId);
  if (pointerIndex === -1) {
    const lowest = firstUnrevealed(glasses, 0, glasses.length);
    return lowest && { ...lowest, wrapped: false };
  }
  const fromPointer = firstUnrevealed(glasses, pointerIndex, glasses.length);
  if (fromPointer) return { ...fromPointer, wrapped: false };
  const beforePointer = firstUnrevealed(glasses, 0, pointerIndex);
  return beforePointer && { ...beforePointer, wrapped: true };
}

/** Where "Skip to glass N →" moves the pointer: the next unrevealed glass after `current`, wrapping; null when `current` is the only unrevealed glass. */
export function skipTarget(
  glasses: readonly PointerGlass[],
  current: { index: number },
): { id: string; index: number } | null {
  return (
    firstUnrevealed(glasses, current.index + 1, glasses.length) ??
    firstUnrevealed(glasses, 0, current.index)
  );
}

/**
 * The highest list index already poured; -1 when none. Poured = revealed, a
 * reveal step taken, the pointer's glass, or the current glass (semi-blind
 * dims every glass beyond it).
 */
export function pouredThrough(glasses: readonly PointerGlass[], pointerWineId: string | null): number {
  let through = -1;
  glasses.forEach((glass, index) => {
    if (glass.isRevealed || glass.revealStep > 0 || glass.id === pointerWineId) through = index;
  });
  const current = currentGlass(glasses, pointerWineId);
  return current ? Math.max(through, current.index) : through;
}

/**
 * Whether pacing allows a guess or a match on this glass now.
 * - Guided pacing is LIVE with `sequential_guessing` on; a self-paced tasting
 *   ignores a flag stored before that rule, and free order paces nothing.
 * - BLIND guided: only the current glass. With every glass revealed nothing is
 *   pouring, so order no longer applies (the reveal guards refuse those glasses).
 * - SEMI_BLIND guided: any glass up to `pouredThrough`.
 * - Under guided pacing a glass outside the flight is never in order.
 */
export function guessOrderAllows(input: {
  revealMode: RevealMode;
  timingMode: TimingMode;
  sequentialGuessing: boolean;
  glasses: readonly PointerGlass[];
  pointerWineId: string | null;
  wineId: string;
}): boolean {
  if (input.timingMode !== "LIVE" || !input.sequentialGuessing) return true;
  const index = indexOfGlass(input.glasses, input.wineId);
  switch (input.revealMode) {
    case "BLIND": {
      if (index === -1) return false;
      const current = currentGlass(input.glasses, input.pointerWineId);
      return current === null || current.index === index;
    }
    case "SEMI_BLIND":
      return index !== -1 && index <= pouredThrough(input.glasses, input.pointerWineId);
    default:
      // OPEN tastings have no guessing to pace.
      return true;
  }
}
