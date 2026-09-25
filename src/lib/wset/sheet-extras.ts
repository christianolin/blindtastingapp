// The training room's additions to the WSET sheet (training-room spec §3.3,
// D19): the style an unknown wine's answers imply, the Appearance "Bubbles"
// toggle's tri-state mapping, and the alcohol row's display-only fourth stop,
// "fortified (15 %+)". WsetSheet reads these; nothing here renders.
//
// Pure: relative runtime imports only, so vitest (no `@/` alias) can load it.
import type { Level, Mousse, WineStyle } from "./types";
import { ALCOHOL_STOPS, FORTIFIED_ALCOHOL_STOPS } from "./vocab";

/** A stop on the alcohol row: a level, or the display-only fortified stop. */
export type AlcoholStop = Level | "FORTIFIED";

export const FORTIFIED_STOP = "FORTIFIED" as const;

// The unfortified ladder plus the fourth stop. One constant, so the slider is
// handed the same array on every render.
const ALCOHOL_STOPS_WITH_FORTIFIED: readonly AlcoholStop[] = [...ALCOHOL_STOPS, FORTIFIED_STOP];

/**
 * The style the sheet draws with: the wine's own when it is known, else what
 * the taster has said — bubbles make it sparkling, then fortified makes it
 * fortified, else still. `null` (not answered) and `undefined` (no toggle)
 * never count. Drives the mousse row, the alcohol ladder and sectionProgress.
 */
export function effectiveStyle(
  style: WineStyle | null,
  bubbles: boolean | null | undefined,
  fortified: boolean | null | undefined,
): WineStyle {
  if (style !== null) return style;
  if (bubbles === true) return "SPARKLING";
  if (fortified === true) return "FORTIFIED";
  return "STILL";
}

/**
 * The alcohol row's stops. With the fortified toggle wired, always the three
 * unfortified stops plus "FORTIFIED" (D19: never a five-stop distance);
 * without it, today's rule — the five-stop ladder for a fortified wine.
 */
export function alcoholStopsFor(style: WineStyle, withFortifiedStop: boolean): readonly AlcoholStop[] {
  if (withFortifiedStop) return ALCOHOL_STOPS_WITH_FORTIFIED;
  return style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS;
}

/** The value the row shows: the fortified stop while fortified is on. */
export function alcoholShown(alcohol: Level | null, fortified: boolean | null): AlcoholStop | null {
  return fortified === true ? FORTIFIED_STOP : alcohol;
}

/**
 * What a pick on the row writes: the fortified stop is high alcohol and
 * fortified; any other stop is that level and not fortified; clearing leaves
 * both unknown.
 */
export function alcoholPick(stop: AlcoholStop | null): { alcohol: Level | null; fortified: boolean | null } {
  if (stop === null) return { alcohol: null, fortified: null };
  if (stop === FORTIFIED_STOP) return { alcohol: "HIGH", fortified: true };
  return { alcohol: stop, fortified: false };
}

/** The Bubbles toggle's two pills; neither selected is "not answered". */
export type BubblesPill = "NONE" | "SPARKLING";
export const BUBBLES_OPTIONS: readonly BubblesPill[] = ["NONE", "SPARKLING"];

export function bubblesPill(value: boolean | null): BubblesPill | null {
  if (value === null) return null;
  return value ? "SPARKLING" : "NONE";
}

export function bubblesFromPill(pill: BubblesPill | null): boolean | null {
  if (pill === null) return null;
  return pill === "SPARKLING";
}

/** A mousse survives a Bubbles answer only while the wine still reads sparkling. */
export function mousseAfterBubbles(
  style: WineStyle | null,
  bubbles: boolean | null,
  fortified: boolean | null,
  mousse: Mousse | null,
): Mousse | null {
  return effectiveStyle(style, bubbles, fortified) === "SPARKLING" ? mousse : null;
}
