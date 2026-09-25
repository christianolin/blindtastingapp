import { describe, expect, it } from "vitest";
import { makeT, uiStrings } from "./i18n";
import type { WsetNoteState } from "./types";
import { ALCOHOL_STOPS, FORTIFIED_ALCOHOL_STOPS, sectionProgress } from "./vocab";
import {
  BUBBLES_OPTIONS,
  FORTIFIED_STOP,
  alcoholPick,
  alcoholShown,
  alcoholStopsFor,
  bubblesFromPill,
  bubblesPill,
  effectiveStyle,
  mousseAfterBubbles,
} from "./sheet-extras";

// Training-room spec §3.3 and D19: an unknown wine's answers imply its style,
// and the alcohol row's fourth stop states fortification without ever being a
// distance on the five-stop ladder.
const blank: WsetNoteState = {
  id: null,
  tastedOn: "2026-09-25",
  clarity: null,
  appearanceIntensity: null,
  colourHue: null,
  observations: [],
  condition: null,
  faults: [],
  noseIntensity: null,
  development: null,
  sweetness: null,
  acidity: null,
  tannin: null,
  tanninNature: [],
  alcohol: null,
  body: null,
  mousse: null,
  flavourIntensity: null,
  finish: null,
  qualityScore: null,
  priceCategory: null,
  readiness: null,
  tasterNotes: "",
  noseTermIds: [],
  palateTermIds: [],
};

describe("effectiveStyle", () => {
  it("a known style always wins over the toggles", () => {
    expect(effectiveStyle("STILL", true, true)).toBe("STILL");
    expect(effectiveStyle("SWEET", true, null)).toBe("SWEET");
    expect(effectiveStyle("SPARKLING", false, null)).toBe("SPARKLING");
  });
  it("an unknown wine: bubbles first, then fortified, else still; null and undefined never count", () => {
    expect(effectiveStyle(null, true, true)).toBe("SPARKLING");
    expect(effectiveStyle(null, false, true)).toBe("FORTIFIED");
    expect(effectiveStyle(null, null, true)).toBe("FORTIFIED");
    expect(effectiveStyle(null, null, null)).toBe("STILL");
    expect(effectiveStyle(null, undefined, undefined)).toBe("STILL");
    expect(effectiveStyle(null, false, false)).toBe("STILL");
  });
  it("Palate counts 9 while Bubbles is on and 8 otherwise", () => {
    expect(sectionProgress(blank, effectiveStyle(null, true, null)).palate).toEqual([0, 9]);
    expect(sectionProgress(blank, effectiveStyle(null, false, null)).palate).toEqual([0, 8]);
    expect(sectionProgress(blank, effectiveStyle(null, null, true)).palate).toEqual([0, 8]);
  });
});

describe("the alcohol row", () => {
  it("offers the fourth stop only when the fortified toggle is wired, whatever the style", () => {
    expect(alcoholStopsFor("STILL", true)).toEqual(["LOW", "MEDIUM", "HIGH", "FORTIFIED"]);
    expect(alcoholStopsFor("FORTIFIED", true)).toEqual(["LOW", "MEDIUM", "HIGH", "FORTIFIED"]);
    expect(alcoholStopsFor("STILL", false)).toBe(ALCOHOL_STOPS);
    expect(alcoholStopsFor("SPARKLING", false)).toBe(ALCOHOL_STOPS);
    expect(alcoholStopsFor("FORTIFIED", false)).toBe(FORTIFIED_ALCOHOL_STOPS);
  });
  it("hands the slider the same array on every render", () => {
    expect(alcoholStopsFor("STILL", true)).toBe(alcoholStopsFor("STILL", true));
  });
  it("a pick: the fortified stop is high alcohol and fortified; any other stop is not fortified; clearing is unknown", () => {
    expect(alcoholPick(FORTIFIED_STOP)).toEqual({ alcohol: "HIGH", fortified: true });
    expect(alcoholPick("HIGH")).toEqual({ alcohol: "HIGH", fortified: false });
    expect(alcoholPick("LOW")).toEqual({ alcohol: "LOW", fortified: false });
    expect(alcoholPick(null)).toEqual({ alcohol: null, fortified: null });
  });
  it("shows the fortified stop while fortified is on, the level otherwise", () => {
    expect(alcoholShown("HIGH", true)).toBe("FORTIFIED");
    expect(alcoholShown("HIGH", false)).toBe("HIGH");
    expect(alcoholShown("MEDIUM", null)).toBe("MEDIUM");
    expect(alcoholShown(null, null)).toBeNull();
  });
});

describe("the Bubbles toggle", () => {
  it("maps tri-state to two pills and back", () => {
    expect(BUBBLES_OPTIONS).toEqual(["NONE", "SPARKLING"]);
    expect([bubblesPill(null), bubblesPill(true), bubblesPill(false)]).toEqual([null, "SPARKLING", "NONE"]);
    expect([bubblesFromPill(null), bubblesFromPill("SPARKLING"), bubblesFromPill("NONE")]).toEqual([null, true, false]);
  });
  it("keeps a mousse only while the wine still reads sparkling", () => {
    expect(mousseAfterBubbles(null, true, null, "CREAMY")).toBe("CREAMY");
    expect(mousseAfterBubbles(null, false, null, "CREAMY")).toBeNull();
    expect(mousseAfterBubbles(null, null, null, "CREAMY")).toBeNull();
    expect(mousseAfterBubbles("SPARKLING", false, null, "CREAMY")).toBe("CREAMY");
    expect(mousseAfterBubbles(null, true, null, null)).toBeNull();
  });
});

describe("copy", () => {
  it("the new sheet strings exist in English and Danish", () => {
    const en = makeT("en");
    expect([en("bubbles"), en("bubbles_none"), en("bubbles_sparkling"), en("fortified_stop")]).toEqual([
      "Bubbles",
      "none",
      "sparkling",
      "fortified (15 %+)",
    ]);
    const da = uiStrings("da");
    expect([da.bubbles, da.bubbles_none, da.bubbles_sparkling, da.fortified_stop]).toEqual([
      "Bobler",
      "ingen",
      "mousserende",
      "hedvin (15 %+)",
    ]);
  });
});
