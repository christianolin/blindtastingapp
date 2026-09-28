import { describe, expect, it } from "vitest";
import { ladderFor } from "../../../lib/training/match";
import type { TrainingCandidate } from "../../../lib/training/types";
import type { WineColour, WineStyle } from "../../../lib/wset/types";
import {
  aromaRows,
  appellationListCacheable,
  appellationOptions,
  designationRows,
  filterAppellationOptions,
  rangeFits,
  satForStyle,
  scalesFor,
  toggleSignature,
  validateProfile,
  withTermIds,
  type ArchetypeProfileInput,
} from "./profile-rules";

const COUNTRY = "00000000-0000-4000-8000-000000000c01";
const REGION = "00000000-0000-4000-8000-000000000c02";
const APPELLATION = "00000000-0000-4000-8000-000000000c03";
const ARCH = "00000000-0000-4000-8000-000000000c05";
const GRAPE = "00000000-0000-4000-8000-000000000c06";
const GRAPE_2 = "00000000-0000-4000-8000-000000000c07";
const AGE = "Typical age takes two whole numbers of years, low to high.";

function candidate(colour: WineColour, style: WineStyle): TrainingCandidate {
  return {
    id: "a",
    name: "A typical test",
    description: null,
    colour,
    style,
    country: { id: "c", name: "France" },
    region: { id: "r", name: "Bordeaux" },
    appellation: { id: "p", name: "Pauillac AOC", isRegional: false },
    primaryGrape: { id: "g", name: "Cabernet Sauvignon" },
    secondaryGrape: null,
    designations: [],
    typicalAge: null,
    sat: {},
    aromas: [],
    placeCanonicalKey: null,
    qualityLow: null,
    qualityHigh: null,
  };
}

function profile(overrides: Partial<ArchetypeProfileInput> = {}): ArchetypeProfileInput {
  return {
    name: "A typical Pauillac",
    colour: "RED",
    style: "STILL",
    description: null,
    qualityLow: 88,
    qualityHigh: 96,
    sat: {
      tannin: ["MEDIUM_PLUS", "HIGH"],
      appearanceIntensity: ["MEDIUM_PLUS", "DEEP"],
      clarity: ["CLEAR", "CLEAR"],
    },
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
    winePlaceId: null,
    ...overrides,
  };
}

function scale(key: string, colour: WineColour = "RED", style: WineStyle = "STILL") {
  const found = scalesFor(colour, style).find((s) => s.key === key);
  if (!found) throw new Error(`no scale ${key}`);
  return found;
}

describe("scalesFor", () => {
  it("edits eleven scales, twelve with mousse on sparkling", () => {
    expect(scalesFor("RED", "STILL").map((s) => s.key)).toEqual([
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
    ]);
    const sparkling = scalesFor("WHITE", "SPARKLING");
    expect(sparkling).toHaveLength(12);
    expect(sparkling[11].key).toBe("mousse");
  });

  it("uses the matcher's own ladders (still red and still white)", () => {
    for (const [colour, style] of [
      ["RED", "STILL"],
      ["WHITE", "STILL"],
    ] as const) {
      for (const s of scalesFor(colour, style)) {
        // Development stays on the profile for reference but is never matched
        // (owner, 2026-09-28: it is the bottle's age, not the style).
        if (s.key === "development") {
          expect(ladderFor(s.key, candidate(colour, style))).toBeNull();
          continue;
        }
        expect(ladderFor(s.key, candidate(colour, style))).toEqual([...s.ladder]);
      }
    }
  });

  it("uses the matcher's mousse ladder on sparkling", () => {
    expect(ladderFor("mousse", candidate("WHITE", "SPARKLING"))).toEqual([
      ...scale("mousse", "WHITE", "SPARKLING").ladder,
    ]);
  });
});

describe("rangeFits", () => {
  it("needs a range on its ladder, low to high, that the slider can reach", () => {
    expect(rangeFits(scale("appearanceIntensity"), ["MEDIUM_PLUS", "DEEP"])).toBe(true);
    expect(rangeFits(scale("appearanceIntensity"), ["MEDIUM_MINUS", "MEDIUM_MINUS"])).toBe(false);
    expect(rangeFits(scale("sweetness"), ["MEDIUM", "MEDIUM"])).toBe(false);
    expect(rangeFits(scale("sweetness"), ["MEDIUM", "SWEET"])).toBe(true);
    expect(rangeFits(scale("alcohol"), ["MEDIUM_PLUS", "HIGH"])).toBe(false);
    expect(rangeFits(scale("alcohol", "RED", "FORTIFIED"), ["MEDIUM_PLUS", "HIGH"])).toBe(true);
    expect(rangeFits(scale("colourHue", "WHITE"), ["RUBY", "RUBY"])).toBe(false);
    expect(rangeFits(scale("colourHue", "WHITE"), ["LEMON", "GOLD"])).toBe(true);
    expect(rangeFits(scale("tannin"), ["HIGH", "LOW"])).toBe(false);
  });
});

describe("validateProfile", () => {
  it("accepts a complete profile, with or without a quality range", () => {
    expect(validateProfile(profile())).toBeNull();
    expect(validateProfile(profile({ secondaryGrapeId: GRAPE_2 }))).toBeNull();
    expect(validateProfile(profile({ qualityLow: null, qualityHigh: null }))).toBeNull();
    expect(validateProfile(profile({ typicalAgeLow: null, typicalAgeHigh: null }))).toBeNull();
  });

  it("names the first thing that is wrong", () => {
    expect(validateProfile(profile({ name: "  " }))).toBe("Give it a name.");
    expect(validateProfile(profile({ appellationId: "" }))).toBe("Pick a country, region and appellation.");
    expect(validateProfile(profile({ primaryGrapeId: "" }))).toBe("Pick a primary grape.");
    expect(validateProfile(profile({ secondaryGrapeId: GRAPE }))).toBe(
      "The second grape must differ from the primary grape.",
    );
    expect(validateProfile(profile({ qualityLow: 40 }))).toBe("Quality runs from 50 to 100, low to high.");
    expect(validateProfile(profile({ typicalAgeLow: 5, typicalAgeHigh: null }))).toBe(AGE);
    expect(validateProfile(profile({ typicalAgeLow: 12, typicalAgeHigh: 5 }))).toBe(AGE);
    expect(validateProfile(profile({ sat: { sweetness: ["MEDIUM", "MEDIUM"] } }))).toBe(
      "Sweetness: pick a range on its own scale.",
    );
    expect(validateProfile(profile({ winePlaceId: "x" }))).toBe("That map place is not valid.");
  });

  it("refuses malformed input without throwing (the server's check runs on untrusted input)", () => {
    const MALFORMED = "Something in the profile is malformed.";
    const bad = (overrides: Record<string, unknown>) =>
      validateProfile(profile(overrides as Partial<ArchetypeProfileInput>));
    // A null range, a range that is not an array, a one-word range.
    expect(bad({ sat: { tannin: null } })).toBe(MALFORMED);
    expect(bad({ sat: { tannin: "HIGH" } })).toBe(MALFORMED);
    expect(bad({ sat: { tannin: ["HIGH"] } })).toBe(MALFORMED);
    expect(bad({ sat: { tannin: [1, 2] } })).toBe(MALFORMED);
    // Even on a key the editor does not show.
    expect(bad({ sat: { clarity: null } })).toBe(MALFORMED);
    // An unknown colour or style — never reaches HUES_BY_COLOUR[colour].
    expect(bad({ colour: "BLUE" })).toBe(MALFORMED);
    expect(bad({ colour: null })).toBe(MALFORMED);
    expect(bad({ style: "FIZZY" })).toBe(MALFORMED);
    // sat that is not a plain object.
    expect(bad({ sat: null })).toBe(MALFORMED);
    expect(bad({ sat: [["HIGH", "HIGH"]] })).toBe(MALFORMED);
    expect(bad({ sat: "tannin" })).toBe(MALFORMED);
    // Aroma links and designations of the wrong shape.
    expect(bad({ nose: [null] })).toBe(MALFORMED);
    expect(bad({ palate: [{ termId: 1, signature: false }] })).toBe(MALFORMED);
    expect(bad({ designationIds: ["not-an-id"] })).toBe(MALFORMED);
    expect(bad({ secondaryGrapeId: "not-an-id" })).toBe(MALFORMED);
    expect(bad({ secondaryGrapeId: undefined })).toBe(MALFORMED);
    expect(bad({ description: 12 })).toBe(MALFORMED);
    // Not an object at all.
    expect(validateProfile(null as unknown as ArchetypeProfileInput)).toBe(MALFORMED);
  });

  it("leaves keys it does not edit alone", () => {
    expect(
      validateProfile(profile({ sat: { clarity: ["HAZY", "CLEAR"], mousse: ["AGGRESSIVE", "DELICATE"] } })),
    ).toBeNull();
    expect(
      validateProfile(
        profile({ colour: "WHITE", style: "SPARKLING", sat: { mousse: ["AGGRESSIVE", "DELICATE"] } }),
      ),
    ).toBe("Mousse: pick a range on its own scale.");
  });
});

describe("satForStyle", () => {
  const sat: { [key: string]: [string, string] } = {
    tannin: ["MEDIUM_PLUS", "HIGH"],
    alcohol: ["MEDIUM", "HIGH"],
    mousse: ["DELICATE", "CREAMY"],
  };

  it("drops mousse off sparkling, keeps it on sparkling", () => {
    expect(satForStyle(sat, "WHITE", "STILL")).toEqual({
      tannin: ["MEDIUM_PLUS", "HIGH"],
      alcohol: ["MEDIUM", "HIGH"],
    });
    expect(satForStyle(sat, "WHITE", "SPARKLING")).toBe(sat);
  });

  it("drops an alcohol range off the new style's ladder", () => {
    // MEDIUM_PLUS is a stop of the fortified ladder only.
    const fortified: { [key: string]: [string, string] } = { alcohol: ["MEDIUM_PLUS", "HIGH"] };
    expect(satForStyle(fortified, "RED", "FORTIFIED")).toBe(fortified);
    expect(satForStyle(fortified, "RED", "STILL")).toEqual({});
    // A range that fits both ladders stays.
    expect(satForStyle({ alcohol: ["MEDIUM", "HIGH"] }, "RED", "FORTIFIED")).toEqual({ alcohol: ["MEDIUM", "HIGH"] });
  });

  it("returns the same object when nothing goes, and never touches the input", () => {
    const plain: { [key: string]: [string, string] } = { tannin: ["LOW", "MEDIUM"] };
    expect(satForStyle(plain, "RED", "STILL")).toBe(plain);
    satForStyle(sat, "WHITE", "STILL");
    expect(sat.mousse).toEqual(["DELICATE", "CREAMY"]);
  });
});

describe("appellation options", () => {
  const list = [
    { id: "a1", name: "Bourgogne Aligoté AOC" },
    { id: "a2", name: "Bourgogne AOC" },
    { id: "a3", name: "Chablis AOC" },
  ];

  it("offers the region's own appellation first, as Just the region", () => {
    expect(appellationOptions("Bourgogne", list)).toEqual([
      { id: "a2", name: "Just the region · Bourgogne AOC", matchName: "Bourgogne AOC" },
      { id: "a1", name: "Bourgogne Aligoté AOC" },
      { id: "a3", name: "Chablis AOC" },
    ]);
    expect(appellationOptions("Loire", list)[0]).toEqual({ id: "a1", name: "Bourgogne Aligoté AOC" });
  });

  it("keeps a region's list for later searches only when the read found something", () => {
    expect(appellationListCacheable(list)).toBe(true);
    expect(appellationListCacheable([])).toBe(false);
  });

  it("filters by the label or the stored name, accents folded", () => {
    const options = appellationOptions("Bourgogne", list);
    expect(filterAppellationOptions(options, "aligote").map((o) => o.id)).toEqual(["a1"]);
    expect(filterAppellationOptions(options, "just").map((o) => o.id)).toEqual(["a2"]);
    expect(filterAppellationOptions(options, "")).toHaveLength(3);
  });
});

describe("aroma and designation rows", () => {
  it("keeps signatures across a re-pick and toggles one", () => {
    const links = [
      { termId: "t1", signature: true },
      { termId: "t2", signature: false },
    ];
    expect(withTermIds(links, ["t2", "t3"])).toEqual([
      { termId: "t2", signature: false },
      { termId: "t3", signature: false },
    ]);
    expect(toggleSignature(links, "t2")).toEqual([
      { termId: "t1", signature: true },
      { termId: "t2", signature: true },
    ]);
  });

  it("writes one row per term and kind, and one per designation", () => {
    expect(
      aromaRows(
        ARCH,
        [
          { termId: "t1", signature: true },
          { termId: "t1", signature: false },
        ],
        [{ termId: "t1", signature: false }],
      ),
    ).toEqual([
      { archetype_id: ARCH, term_id: "t1", kind: "NOSE", signature: true },
      { archetype_id: ARCH, term_id: "t1", kind: "PALATE", signature: false },
    ]);
    expect(designationRows(ARCH, ["d1", "d2", "d1"])).toEqual([
      { archetype_id: ARCH, type_designation_id: "d1" },
      { archetype_id: ARCH, type_designation_id: "d2" },
    ]);
  });
});
