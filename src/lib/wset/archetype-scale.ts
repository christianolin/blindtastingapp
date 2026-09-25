// Which ladder an archetype's range is drawn on in the read-only archetype
// sheet (training-room spec §4.4). A range whose bounds are both on the note
// slider's stops is drawn on those stops, exactly as before; a bound the
// slider does not offer (batch 1's appearance [MEDIUM_PLUS, DEEP], a sweetness
// of MEDIUM) moves that one scale onto its full enum ladder; a bound on
// neither is not drawn, and the sheet says "Varies".
//
// Pure: relative runtime imports only, so vitest (no `@/` alias) can load it.
import type { WineColour, WineStyle } from "./types";
import {
  ALCOHOL_STOPS,
  APPEARANCE_INTENSITY_STOPS,
  BODY_STOPS,
  DEVELOPMENT_STOPS,
  FINISH_STOPS,
  FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR,
  INTENSITY_STOPS,
  LEVEL_STOPS,
  SWEETNESS_STOPS,
} from "./vocab";

/** The SAT keys an archetype carries a range for (spec §4.4; clarity is not drawn). */
export type ArchetypeScale =
  | "appearanceIntensity"
  | "colourHue"
  | "noseIntensity"
  | "development"
  | "sweetness"
  | "acidity"
  | "tannin"
  | "alcohol"
  | "body"
  | "flavourIntensity"
  | "finish"
  | "mousse";

/** A taster's answers to draw on the ranges; a whole WsetNoteState fits. */
export type ArchetypeAnswers = Partial<Record<ArchetypeScale, string | null>>;

type Range = [string, string];

// The full Postgres enum orders (wset_appearance_intensity, wset_sweetness —
// read live 2026-09-25); the other graded scales' sliders already offer every
// value.
export const APPEARANCE_INTENSITY_LADDER: readonly string[] = ["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"];
export const SWEETNESS_LADDER: readonly string[] = ["DRY", "OFF_DRY", "MEDIUM_DRY", "MEDIUM", "MEDIUM_SWEET", "SWEET", "LUSCIOUS"];
const MOUSSE_STOPS: readonly string[] = ["DELICATE", "CREAMY", "AGGRESSIVE"];

function laddersFor(
  scale: ArchetypeScale,
  colour: WineColour,
  style: WineStyle,
): { slider: readonly string[]; ladder: readonly string[] } {
  switch (scale) {
    case "appearanceIntensity":
      return { slider: APPEARANCE_INTENSITY_STOPS, ladder: APPEARANCE_INTENSITY_LADDER };
    case "colourHue":
      return { slider: HUES_BY_COLOUR[colour], ladder: HUES_BY_COLOUR[colour] };
    case "noseIntensity":
    case "flavourIntensity":
      return { slider: INTENSITY_STOPS, ladder: INTENSITY_STOPS };
    case "development":
      return { slider: DEVELOPMENT_STOPS, ladder: DEVELOPMENT_STOPS };
    case "sweetness":
      return { slider: SWEETNESS_STOPS, ladder: SWEETNESS_LADDER };
    case "acidity":
    case "tannin":
      return { slider: LEVEL_STOPS, ladder: LEVEL_STOPS };
    case "alcohol":
      // A fortified archetype is written on the five-stop ladder (D19); an
      // unfortified bound off the three stops is still worth drawing there.
      return style === "FORTIFIED"
        ? { slider: FORTIFIED_ALCOHOL_STOPS, ladder: FORTIFIED_ALCOHOL_STOPS }
        : { slider: ALCOHOL_STOPS, ladder: FORTIFIED_ALCOHOL_STOPS };
    case "body":
      return { slider: BODY_STOPS, ladder: BODY_STOPS };
    case "finish":
      return { slider: FINISH_STOPS, ladder: FINISH_STOPS };
    case "mousse":
      return { slider: MOUSSE_STOPS, ladder: MOUSSE_STOPS };
    default: {
      const unknown: never = scale;
      throw new Error(`Unknown archetype scale: ${String(unknown)}`);
    }
  }
}

/** The stops a scale is drawn on, and the range to draw (undefined: "Varies"). */
export function archetypeScale(
  scale: ArchetypeScale,
  a: { colour: WineColour; style: WineStyle; sat: Record<string, Range | undefined> },
): { stops: readonly string[]; range: Range | undefined } {
  const { slider, ladder } = laddersFor(scale, a.colour, a.style);
  const range = a.sat[scale];
  if (!range) return { stops: slider, range: undefined };
  const holds = (stops: readonly string[]) => stops.includes(range[0]) && stops.includes(range[1]);
  if (holds(slider)) return { stops: slider, range };
  if (holds(ladder)) return { stops: ladder, range };
  return { stops: slider, range: undefined };
}
