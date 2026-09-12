import type {
  RevealMode,
  TimingMode,
  WineSourceMode,
} from "@/lib/supabase/database.types";

// Pure lifecycle copy and routing shared by the create sheet, the lobby's host
// controls and the host console (spec §D.1 #7, #8). Only type imports, so
// vitest can load it without the `@/` alias.

/** A glass the tasting would end with its answer still hidden: `half` once a
    step reveal has started on it (`reveal_step > 0`), `hidden` before that. */
export type UnrevealedGlass = { glass: number; state: "hidden" | "half" };

/**
 * Where Start lands the host (reveal-5): the dark host console only for a LIVE
 * blind tasting whose host provides the wines. A bring-your-own host competes
 * for the other glasses, and a semi-blind or self-paced tasting has no
 * glass-by-glass reveal to drive — every one of those lands on the lobby.
 */
export function startLandsOnConsole(t: {
  timingMode: TimingMode;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
}): boolean {
  return (
    t.timingMode === "LIVE" &&
    t.revealMode === "BLIND" &&
    t.wineSource === "HOST_PROVIDES"
  );
}

const END_TAIL = "You can reopen it from the tasting page.";

// "6" · "6 and 7" · "4, 5 and 6"
function listGlasses(glasses: readonly number[]): string {
  if (glasses.length <= 1) return glasses.join("");
  return `${glasses.slice(0, -1).join(", ")} and ${glasses[glasses.length - 1]}`;
}

/**
 * The End-tasting confirm (reveal-4). Ending is reversible (reopen), so it
 * never says it can't be undone; it names every glass whose answer would stay
 * hidden instead — the half-revealed ones first, then the untouched ones.
 */
export function endTastingConfirm(glasses: readonly UnrevealedGlass[]): string {
  if (glasses.length === 0) return `End the tasting? ${END_TAIL}`;

  const half = glasses.filter((g) => g.state === "half").map((g) => g.glass);
  const hidden = glasses.filter((g) => g.state === "hidden").map((g) => g.glass);

  const clauses: string[] = [];
  const clause = (nums: number[], one: string, many: string) => {
    if (nums.length === 0) return;
    const noun = nums.length === 1 ? "glass" : "glasses";
    clauses.push(`${noun} ${listGlasses(nums)} ${nums.length === 1 ? one : many}`);
  };
  clause(half, "is half revealed", "are half revealed");
  clause(hidden, "hasn't been revealed", "haven't been revealed");

  const sentence = clauses.join(" and ");
  const stays =
    glasses.length === 1 ? "its answer stays hidden" : "their answers stay hidden";
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} — ${stays}. ${END_TAIL}`;
}

/** The console eyebrow for a finished tasting that still has a hidden glass. */
export function notRevealedEyebrow(glass: number, of: number): string {
  return `Not revealed · glass ${glass} of ${of}`;
}
