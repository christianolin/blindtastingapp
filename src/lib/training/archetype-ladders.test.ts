// Pins scripts/training/archetype-ladders.mjs (plain node, used by the batch
// validator and generator) to the TypeScript vocabulary, so the two cannot
// drift (training-room spec §4.4). The full-enum ladders are also checked
// against the live enums by validate-archetype-batch.mjs on every run.
import { describe, expect, it } from "vitest";
import {
  ALCOHOL_STOPS as BATCH_ALCOHOL_STOPS,
  APPEARANCE_INTENSITY,
  APPEARANCE_INTENSITY_SLIDER,
  BODY,
  DEVELOPMENT,
  FINISH,
  FORTIFIED_ALCOHOL_STOPS as BATCH_FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR as BATCH_HUES_BY_COLOUR,
  INTENSITY,
  LEVEL,
  MATCHED_SCALES,
  MOUSSE,
  SWEETNESS,
  SWEETNESS_SLIDER,
  WINE_COLOURS,
  WINE_STYLES,
} from "../../../scripts/training/archetype-ladders.mjs";
import type {
  AppearanceIntensity,
  Mousse,
  Sweetness,
  WineColour,
  WineStyle,
  WsetNoteState,
} from "../wset/types";
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
} from "../wset/vocab";

// Every member of each union, in src/lib/wset/types.ts order: `satisfies`
// refuses a misspelt member and the Exhaustive checks refuse a missing one.
const FULL_APPEARANCE = [
  "PALE",
  "MEDIUM_MINUS",
  "MEDIUM",
  "MEDIUM_PLUS",
  "DEEP",
] as const satisfies readonly AppearanceIntensity[];
const FULL_SWEETNESS = [
  "DRY",
  "OFF_DRY",
  "MEDIUM_DRY",
  "MEDIUM",
  "MEDIUM_SWEET",
  "SWEET",
  "LUSCIOUS",
] as const satisfies readonly Sweetness[];
const FULL_MOUSSE = ["DELICATE", "CREAMY", "AGGRESSIVE"] as const satisfies readonly Mousse[];
const FULL_COLOURS = ["WHITE", "ROSE", "RED", "ORANGE"] as const satisfies readonly WineColour[];
const FULL_STYLES = ["STILL", "SPARKLING", "FORTIFIED", "SWEET"] as const satisfies readonly WineStyle[];
type Exhaustive<Union, Listed> = [Exclude<Union, Listed>] extends [never] ? true : false;
const exhaustive: [
  Exhaustive<AppearanceIntensity, (typeof FULL_APPEARANCE)[number]>,
  Exhaustive<Sweetness, (typeof FULL_SWEETNESS)[number]>,
  Exhaustive<Mousse, (typeof FULL_MOUSSE)[number]>,
  Exhaustive<WineColour, (typeof FULL_COLOURS)[number]>,
  Exhaustive<WineStyle, (typeof FULL_STYLES)[number]>,
] = [true, true, true, true, true];

describe("archetype-ladders.mjs", () => {
  it("lists every member of the full-enum ladders in type order", () => {
    expect(exhaustive).toEqual([true, true, true, true, true]);
    expect(APPEARANCE_INTENSITY).toEqual([...FULL_APPEARANCE]);
    expect(SWEETNESS).toEqual([...FULL_SWEETNESS]);
    expect(MOUSSE).toEqual([...FULL_MOUSSE]);
    expect(WINE_COLOURS).toEqual([...FULL_COLOURS]);
    expect(WINE_STYLES).toEqual([...FULL_STYLES]);
  });

  it("matches the note's slider stops in vocab.ts", () => {
    expect(INTENSITY).toEqual(INTENSITY_STOPS);
    expect(LEVEL).toEqual(LEVEL_STOPS);
    expect(BODY).toEqual(BODY_STOPS);
    expect(FINISH).toEqual(FINISH_STOPS);
    expect(DEVELOPMENT).toEqual(DEVELOPMENT_STOPS);
    expect(BATCH_ALCOHOL_STOPS).toEqual(ALCOHOL_STOPS);
    expect(BATCH_FORTIFIED_ALCOHOL_STOPS).toEqual(FORTIFIED_ALCOHOL_STOPS);
    expect(APPEARANCE_INTENSITY_SLIDER).toEqual(APPEARANCE_INTENSITY_STOPS);
    expect(SWEETNESS_SLIDER).toEqual(SWEETNESS_STOPS);
    expect(BATCH_HUES_BY_COLOUR).toEqual(HUES_BY_COLOUR);
  });

  it("names only scales that are WsetNoteState keys", () => {
    const keys: (keyof WsetNoteState)[] = [
      "appearanceIntensity",
      "colourHue",
      "noseIntensity",
      "development",
      "sweetness",
      "acidity",
      "tannin",
      "alcohol",
      "body",
      "flavourIntensity",
      "finish",
    ];
    expect(MATCHED_SCALES).toEqual(keys);
  });
});
