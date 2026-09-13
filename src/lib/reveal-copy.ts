import { revealingGlassEyebrow } from "./semi-blind-copy";
import { ordinal } from "./stats-math";

// Copy for the blind reveal: S11 (phone) and S11b (laptop), spec §11.3
// items 1–2. Exact handoff and spec copy. Pure: relative runtime imports only,
// so vitest loads it without the `@/` alias.

// "a" · "a and b" · "a, b and c" (no serial comma).
function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The line under the rows while at least one step is still hidden. The labels
 * are the rows' own ("Producer", "Vintage"): the first keeps its case and the
 * later ones are lower-cased, so they read as one sentence. The points are the
 * hidden rows' values summed. One hidden step takes the singular (spec copy).
 * Null once nothing is hidden.
 */
export function lockedLine(
  hidden: readonly { label: string; points: number }[],
): string | null {
  if (hidden.length === 0) return null;
  const points = hidden.reduce((n, h) => n + h.points, 0);
  if (hidden.length === 1) {
    return `${hidden[0].label} is worth ${points}. Nothing you do now changes it — the guess is locked.`;
  }
  const labels = hidden.map((h, i) => (i === 0 ? h.label : h.label.toLowerCase()));
  return `${joinAnd(labels)} are worth ${points} between them. Nothing you do now changes them — the guess is locked.`;
}

/** "Revealing glass 3": the same eyebrow as the semi-blind reveal (SB4). */
export function revealingGlass(glass: number): string {
  return revealingGlassEyebrow(glass);
}

/** The laptop header's second line: "4 of 6 attributes · Christian is driving". */
export function revealHeaderMeta(step: number, inPlay: number, host: string): string {
  return `${step} of ${inPlay} attributes · ${host} is driving`;
}

/**
 * "▲ 2nd → 1st" when the viewer climbed, "▼ 1st → 3rd" when they fell. Null
 * when the rank did not move: the pill shows only a change. The ranks are
 * `rankDelta`'s dense ranks (`guess-ladder-math.ts`).
 */
export function rankDeltaPill(delta: { before: number; after: number }): string | null {
  if (delta.after === delta.before) return null;
  const arrow = delta.after < delta.before ? "▲" : "▼";
  return `${arrow} ${ordinal(delta.before)} → ${ordinal(delta.after)}`;
}
