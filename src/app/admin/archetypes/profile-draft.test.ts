import { describe, expect, it } from "vitest";
import { FORTIFIED_ALCOHOL_STOPS, ALCOHOL_STOPS } from "../../../lib/wset/vocab";
import {
  EDITOR_SECTIONS,
  applyDraft,
  archetypeProgress,
  draftFromProfile,
  draftToInput,
  draftView,
  editorLadders,
  isDirty,
  satForColour,
  type ArchetypeDraft,
} from "./profile-draft";
import { scalesFor, validateProfile, type ArchetypeProfile } from "./profile-rules";

const COUNTRY = "00000000-0000-4000-8000-000000000c01";
const REGION = "00000000-0000-4000-8000-000000000c02";
const APPELLATION = "00000000-0000-4000-8000-000000000c03";
const GRAPE = "00000000-0000-4000-8000-000000000c06";
const OTHER_COUNTRY = "00000000-0000-4000-8000-000000000c11";
const OTHER_REGION = "00000000-0000-4000-8000-000000000c12";
const PLACE = "00000000-0000-4000-8000-000000000c21";

const REGIONS = [
  { id: REGION, countryId: COUNTRY },
  { id: OTHER_REGION, countryId: OTHER_COUNTRY },
];

function profile(overrides: Partial<ArchetypeProfile> = {}): ArchetypeProfile {
  return {
    id: "00000000-0000-4000-8000-000000000c05",
    name: "A typical Pauillac",
    colour: "RED",
    style: "STILL",
    description: "Firm.",
    qualityLow: 88,
    qualityHigh: 96,
    sat: { tannin: ["MEDIUM_PLUS", "HIGH"], colourHue: ["RUBY", "GARNET"] },
    nose: [{ termId: "t1", signature: true }],
    palate: [],
    countryId: COUNTRY,
    regionId: REGION,
    appellationId: APPELLATION,
    appellationName: "Pauillac AOC",
    primaryGrapeId: GRAPE,
    secondaryGrapeId: null,
    designationIds: [],
    typicalAgeLow: 8,
    typicalAgeHigh: 25,
    winePlaceId: PLACE,
    winePlaceName: "Pauillac",
    ...overrides,
  };
}

const draft = (overrides: Partial<ArchetypeProfile> = {}): ArchetypeDraft => draftFromProfile(profile(overrides));

describe("draftFromProfile / draftToInput", () => {
  it("round-trips a saved profile into exactly what updateArchetype got before", () => {
    expect(draftToInput(draft())).toEqual({
      name: "A typical Pauillac",
      colour: "RED",
      style: "STILL",
      description: "Firm.",
      qualityLow: 88,
      qualityHigh: 96,
      sat: { tannin: ["MEDIUM_PLUS", "HIGH"], colourHue: ["RUBY", "GARNET"] },
      nose: [{ termId: "t1", signature: true }],
      palate: [],
      countryId: COUNTRY,
      regionId: REGION,
      appellationId: APPELLATION,
      primaryGrapeId: GRAPE,
      secondaryGrapeId: null,
      designationIds: [],
      typicalAgeLow: 8,
      typicalAgeHigh: 25,
      winePlaceId: PLACE,
    });
    expect(validateProfile(draftToInput(draft()))).toBeNull();
  });

  it("trims the name and description, blanks to null, and reads the age inputs as typed", () => {
    let d = draft({ description: null, typicalAgeLow: null, typicalAgeHigh: null, winePlaceId: null });
    expect(d.description).toBe("");
    expect(d.ageLow).toBe("");
    d = applyDraft(d, { type: "name", value: "  A typical Margaux  " });
    d = applyDraft(d, { type: "description", value: "   " });
    d = applyDraft(d, { type: "age", end: "low", value: "5" });
    d = applyDraft(d, { type: "age", end: "high", value: "" });
    const input = draftToInput(d);
    expect(input.name).toBe("A typical Margaux");
    expect(input.description).toBeNull();
    expect(input.typicalAgeLow).toBe(5);
    expect(input.typicalAgeHigh).toBeNull();
    expect(input.winePlaceId).toBeNull();
    expect(validateProfile(input)).toBe("Typical age takes two whole numbers of years, low to high.");
  });

  it("sends an unpicked second grape as null", () => {
    const d = applyDraft(draft({ secondaryGrapeId: GRAPE.replace("c06", "c07") }), { type: "secondaryGrape", id: "" });
    expect(draftToInput(d).secondaryGrapeId).toBeNull();
  });
});

describe("applyDraft", () => {
  it("a new colour drops a hue range off its ladder, as the old editor did", () => {
    const white = applyDraft(draft(), { type: "colour", value: "WHITE" });
    expect(white.colour).toBe("WHITE");
    expect(white.sat.colourHue).toBeUndefined();
    expect(white.sat.tannin).toEqual(["MEDIUM_PLUS", "HIGH"]);
    // BROWN is a red hue and a white hue: it stays.
    const brown = applyDraft(draft({ sat: { colourHue: ["BROWN", "BROWN"] } }), { type: "colour", value: "WHITE" });
    expect(brown.sat.colourHue).toEqual(["BROWN", "BROWN"]);
  });

  it("a new style goes through satForStyle: mousse off sparkling, alcohol off its ladder", () => {
    const sparkling = draft({ colour: "WHITE", style: "SPARKLING", sat: { mousse: ["DELICATE", "CREAMY"] } });
    expect(applyDraft(sparkling, { type: "style", value: "STILL" }).sat).toEqual({});
    const fortified = draft({ style: "FORTIFIED", sat: { alcohol: ["MEDIUM_PLUS", "HIGH"] } });
    expect(applyDraft(fortified, { type: "style", value: "STILL" }).sat).toEqual({});
  });

  it("sets and clears one range, leaving the rest", () => {
    let d = applyDraft(draft(), { type: "range", key: "acidity", range: ["HIGH", "HIGH"] });
    expect(d.sat.acidity).toEqual(["HIGH", "HIGH"]);
    d = applyDraft(d, { type: "range", key: "tannin", range: null });
    expect(d.sat).toEqual({ colourHue: ["RUBY", "GARNET"], acidity: ["HIGH", "HIGH"] });
    expect(applyDraft(d, { type: "range", key: "finish", range: null })).toBe(d);
  });

  it("sets and clears the quality range as a pair", () => {
    let d = applyDraft(draft(), { type: "quality", range: [85, 90] });
    expect([d.qualityLow, d.qualityHigh]).toEqual([85, 90]);
    d = applyDraft(d, { type: "quality", range: null });
    expect([d.qualityLow, d.qualityHigh]).toEqual([null, null]);
  });

  it("keeps each aroma's signature across a re-pick, and toggles one", () => {
    let d = applyDraft(draft(), { type: "aromas", kind: "nose", ids: ["t1", "t2"] });
    expect(d.nose).toEqual([
      { termId: "t1", signature: true },
      { termId: "t2", signature: false },
    ]);
    d = applyDraft(d, { type: "signature", kind: "nose", termId: "t2" });
    expect(d.nose[1]).toEqual({ termId: "t2", signature: true });
    d = applyDraft(d, { type: "aromas", kind: "palate", ids: ["t3"] });
    expect(d.palate).toEqual([{ termId: "t3", signature: false }]);
    expect(d.nose).toHaveLength(2);
  });

  it("cascades country → region → appellation like the answer-key forms", () => {
    const same = applyDraft(draft(), { type: "country", id: COUNTRY, regions: REGIONS });
    expect([same.regionId, same.appellationId]).toEqual([REGION, APPELLATION]);
    const moved = applyDraft(draft(), { type: "country", id: OTHER_COUNTRY, regions: REGIONS });
    expect([moved.countryId, moved.regionId, moved.appellationId, moved.appellationLabel]).toEqual([
      OTHER_COUNTRY,
      "",
      "",
      null,
    ]);
    const region = applyDraft(draft(), { type: "region", id: OTHER_REGION });
    expect([region.regionId, region.appellationId, region.appellationLabel]).toEqual([OTHER_REGION, "", null]);
  });

  it("picking the region it already has keeps the appellation", () => {
    const d = draft();
    expect(applyDraft(d, { type: "region", id: REGION })).toBe(d);
  });

  it("adds a designation once and removes it", () => {
    let d = applyDraft(draft(), { type: "addDesignation", id: "d1" });
    d = applyDraft(d, { type: "addDesignation", id: "d1" });
    d = applyDraft(d, { type: "addDesignation", id: "" });
    expect(d.designationIds).toEqual(["d1"]);
    expect(applyDraft(d, { type: "removeDesignation", id: "d1" }).designationIds).toEqual([]);
  });

  it("sets and removes the map place", () => {
    const d = applyDraft(draft(), { type: "place", place: null });
    expect(draftToInput(d).winePlaceId).toBeNull();
    expect(applyDraft(d, { type: "place", place: { id: PLACE, name: "Pauillac" } }).place).toEqual({
      id: PLACE,
      name: "Pauillac",
    });
  });
});

describe("satForColour", () => {
  it("returns the same object when the hue fits", () => {
    const sat: { [key: string]: [string, string] } = { colourHue: ["RUBY", "GARNET"] };
    expect(satForColour(sat, "RED")).toBe(sat);
    expect(satForColour({}, "WHITE")).toEqual({});
  });
});

describe("isDirty", () => {
  it("is false on open, true after an edit, false again once edited back", () => {
    const base = draft();
    expect(isDirty(base, base)).toBe(false);
    const edited = applyDraft(base, { type: "name", value: "Something else" });
    expect(isDirty(edited, base)).toBe(true);
    expect(isDirty(applyDraft(edited, { type: "name", value: base.name }), base)).toBe(false);
  });

  it("clearing a range and setting it back is no change", () => {
    const base = draft();
    const cleared = applyDraft(base, { type: "range", key: "tannin", range: null });
    const back = applyDraft(cleared, { type: "range", key: "tannin", range: ["MEDIUM_PLUS", "HIGH"] });
    expect(isDirty(back, base)).toBe(false);
  });

  it("re-picking the same appellation is no change, whatever label it carries", () => {
    const base = draft();
    // A search hit's label need not match the name the page loaded.
    const repicked = applyDraft(base, { type: "appellation", id: APPELLATION, label: "Pauillac" });
    expect(repicked.appellationLabel).toBe("Pauillac");
    expect(isDirty(repicked, base)).toBe(false);
    // A draft opened before the label loaded is the same draft too.
    expect(isDirty(draft({ appellationName: null }), base)).toBe(false);
    // Another appellation is a change.
    const other = applyDraft(base, { type: "appellation", id: APPELLATION.replace("c03", "c04"), label: "Pauillac AOC" });
    expect(isDirty(other, base)).toBe(true);
  });

  it("re-picking the same map place is no change; another place is", () => {
    const base = draft();
    const cleared = applyDraft(base, { type: "place", place: null });
    expect(isDirty(cleared, base)).toBe(true);
    const back = applyDraft(cleared, { type: "place", place: { id: PLACE, name: "Pauillac (Bordeaux)" } });
    expect(isDirty(back, base)).toBe(false);
    const other = applyDraft(cleared, { type: "place", place: { id: PLACE.replace("c21", "c22"), name: "Pauillac" } });
    expect(isDirty(other, base)).toBe(true);
  });

  it("removing an aroma and adding it back is no change, in either list", () => {
    const base = draft({
      nose: [
        { termId: "t1", signature: true },
        { termId: "t2", signature: false },
      ],
      palate: [
        { termId: "t3", signature: false },
        { termId: "t4", signature: false },
      ],
    });
    let d = applyDraft(base, { type: "aromas", kind: "nose", ids: ["t1"] });
    expect(isDirty(d, base)).toBe(true);
    d = applyDraft(d, { type: "aromas", kind: "nose", ids: ["t1", "t2"] });
    expect(isDirty(d, base)).toBe(false);
    // The re-added term now comes first: order is not saved, so still clean.
    d = applyDraft(d, { type: "aromas", kind: "palate", ids: ["t4"] });
    d = applyDraft(d, { type: "aromas", kind: "palate", ids: ["t4", "t3"] });
    expect(d.palate.map((l) => l.termId)).toEqual(["t4", "t3"]);
    expect(isDirty(d, base)).toBe(false);
    // A signature is saved: toggling one is a change.
    expect(isDirty(applyDraft(d, { type: "signature", kind: "palate", termId: "t3" }), base)).toBe(true);
  });

  it("removing a designation and adding it back is no change", () => {
    const base = draft({ designationIds: ["d1", "d2"] });
    let d = applyDraft(base, { type: "removeDesignation", id: "d1" });
    expect(isDirty(d, base)).toBe(true);
    d = applyDraft(d, { type: "addDesignation", id: "d1" });
    expect(d.designationIds).toEqual(["d2", "d1"]);
    expect(isDirty(d, base)).toBe(false);
    expect(isDirty(applyDraft(d, { type: "addDesignation", id: "d3" }), base)).toBe(true);
  });
});

describe("editorLadders", () => {
  it("offers exactly scalesFor's scales and ladders", () => {
    for (const [colour, style] of [
      ["RED", "STILL"],
      ["WHITE", "SPARKLING"],
      ["RED", "FORTIFIED"],
    ] as const) {
      const ladders = editorLadders(colour, style);
      expect(Object.keys(ladders)).toEqual(scalesFor(colour, style).map((s) => s.key));
    }
    expect(editorLadders("RED", "STILL").alcohol).toEqual(ALCOHOL_STOPS);
    expect(editorLadders("RED", "FORTIFIED").alcohol).toEqual(FORTIFIED_ALCOHOL_STOPS);
    expect(editorLadders("RED", "STILL").mousse).toBeUndefined();
    expect(editorLadders("WHITE", "SPARKLING").mousse).toEqual(["DELICATE", "CREAMY", "AGGRESSIVE"]);
  });
});

describe("draftView", () => {
  it("draws the draft's colour, style, ranges and quality", () => {
    const v = draftView(draft());
    expect(v).toMatchObject({ colour: "RED", style: "STILL", qualityLow: 88, qualityHigh: 96, description: "Firm." });
    expect(v.sat).toEqual({ tannin: ["MEDIUM_PLUS", "HIGH"], colourHue: ["RUBY", "GARNET"] });
  });
});

describe("archetypeProgress", () => {
  it("counts each tab like the note sheet: 5 · 2 · 3 · 8 · 1 on a still red", () => {
    const p = archetypeProgress(draft());
    expect(p.sections).toEqual({
      wine: [5, 5],
      appearance: [1, 2],
      nose: [1, 3],
      palate: [1, 8],
      conclusions: [1, 1],
    });
    expect([p.done, p.total]).toEqual([9, 19]);
    expect(Object.keys(p.sections)).toEqual([...EDITOR_SECTIONS]);
  });

  it("adds mousse to Palate on sparkling, and counts what Wine still lacks", () => {
    const p = archetypeProgress(
      draft({ colour: "WHITE", style: "SPARKLING", sat: { mousse: ["DELICATE", "CREAMY"] }, appellationId: "", name: " " }),
    );
    expect(p.sections.palate).toEqual([1, 9]);
    expect(p.sections.wine).toEqual([3, 5]);
  });

  it("does not count a range the style no longer edits", () => {
    const p = archetypeProgress(draft({ sat: { mousse: ["DELICATE", "CREAMY"] } }));
    expect(p.sections.palate).toEqual([0, 8]);
  });
});
