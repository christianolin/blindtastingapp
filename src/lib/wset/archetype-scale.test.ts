import { describe, expect, it } from "vitest";
import { makeT, uiStrings } from "./i18n";
import {
  APPEARANCE_INTENSITY_LADDER,
  SWEETNESS_LADDER,
  archetypeScale,
} from "./archetype-scale";
import {
  ALCOHOL_STOPS,
  APPEARANCE_INTENSITY_STOPS,
  FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR,
  LEVEL_STOPS,
  SWEETNESS_STOPS,
} from "./vocab";

// Training-room spec §4.4: a range may use an enum value the note slider does
// not offer (batch 1's Pauillac appearance [MEDIUM_PLUS, DEEP]). The read-only
// sheet draws such a scale on its full enum ladder; a range the slider can
// already show is drawn exactly as before.
const red = (sat: Record<string, [string, string] | undefined>) => ({ colour: "RED" as const, style: "STILL" as const, sat });

describe("archetypeScale", () => {
  it("a range on the slider's stops is drawn on them, unchanged (the 15 live rows)", () => {
    expect(archetypeScale("appearanceIntensity", red({ appearanceIntensity: ["PALE", "MEDIUM"] }))).toEqual({
      stops: APPEARANCE_INTENSITY_STOPS,
      range: ["PALE", "MEDIUM"],
    });
    expect(archetypeScale("tannin", red({ tannin: ["MEDIUM_PLUS", "HIGH"] }))).toEqual({ stops: LEVEL_STOPS, range: ["MEDIUM_PLUS", "HIGH"] });
  });
  it("an appearance bound the slider lacks moves the scale onto the five-step enum ladder", () => {
    expect(APPEARANCE_INTENSITY_LADDER).toEqual(["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"]);
    expect(archetypeScale("appearanceIntensity", red({ appearanceIntensity: ["MEDIUM_PLUS", "DEEP"] }))).toEqual({
      stops: APPEARANCE_INTENSITY_LADDER,
      range: ["MEDIUM_PLUS", "DEEP"],
    });
  });
  it("sweetness MEDIUM (not on the slider) uses the seven-step ladder; a slider range keeps the six stops", () => {
    expect(SWEETNESS_LADDER).toEqual(["DRY", "OFF_DRY", "MEDIUM_DRY", "MEDIUM", "MEDIUM_SWEET", "SWEET", "LUSCIOUS"]);
    expect(archetypeScale("sweetness", red({ sweetness: ["DRY", "MEDIUM"] })).stops).toBe(SWEETNESS_LADDER);
    expect(archetypeScale("sweetness", { colour: "WHITE", style: "SWEET", sat: { sweetness: ["SWEET", "LUSCIOUS"] } }).stops).toBe(SWEETNESS_STOPS);
  });
  it("hue is drawn on the archetype colour's hues; a hue off that colour is not drawn", () => {
    expect(archetypeScale("colourHue", red({ colourHue: ["RUBY", "GARNET"] }))).toEqual({ stops: HUES_BY_COLOUR.RED, range: ["RUBY", "GARNET"] });
    expect(archetypeScale("colourHue", { colour: "WHITE", style: "STILL", sat: { colourHue: ["RUBY", "RUBY"] } }).range).toBeUndefined();
  });
  it("alcohol: three stops unfortified, five fortified; an unfortified five-step bound is still drawn", () => {
    expect(archetypeScale("alcohol", red({ alcohol: ["MEDIUM", "HIGH"] })).stops).toBe(ALCOHOL_STOPS);
    expect(archetypeScale("alcohol", { colour: "RED", style: "FORTIFIED", sat: { alcohol: ["MEDIUM_PLUS", "HIGH"] } }).stops).toBe(FORTIFIED_ALCOHOL_STOPS);
    expect(archetypeScale("alcohol", red({ alcohol: ["MEDIUM_PLUS", "HIGH"] }))).toEqual({ stops: FORTIFIED_ALCOHOL_STOPS, range: ["MEDIUM_PLUS", "HIGH"] });
  });
  it("a scale the archetype lacks, or a bound on no ladder, is not drawn ('Varies')", () => {
    expect(archetypeScale("tannin", { colour: "WHITE", style: "STILL", sat: {} })).toEqual({ stops: LEVEL_STOPS, range: undefined });
    expect(archetypeScale("tannin", red({ tannin: ["LOUD", "HIGH"] })).range).toBeUndefined();
  });
  it("mousse is drawn on its three values", () => {
    expect(archetypeScale("mousse", { colour: "WHITE", style: "SPARKLING", sat: { mousse: ["DELICATE", "CREAMY"] } })).toEqual({
      stops: ["DELICATE", "CREAMY", "AGGRESSIVE"],
      range: ["DELICATE", "CREAMY"],
    });
  });
  it("the answer line exists in English and Danish", () => {
    expect(makeT("en")("your_answer", { value: "high" })).toBe("you: high");
    expect(uiStrings("da").your_answer).toBe("dig: {value}");
  });
});
