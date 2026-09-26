import { describe, expect, it } from "vitest";
import { ladderFor } from "../../../lib/training/match";
import type { TrainingCandidate } from "../../../lib/training/types";
import type { WineColour, WineStyle } from "../../../lib/wset/types";
import {
  aromaRows,
  appellationOptions,
  designationRows,
  filterAppellationOptions,
  rangeFits,
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
    expect(validateProfile(profile({ qualityLow: null, qualityHigh: null }))).toBeNull();
    expect(validateProfile(profile({ typicalAgeLow: null, typicalAgeHigh: null }))).toBeNull();
  });

  it("names the first thing that is wrong", () => {
    expect(validateProfile(profile({ name: "  " }))).toBe("Give it a name.");
    expect(validateProfile(profile({ appellationId: "" }))).toBe("Pick a country, region and appellation.");
    expect(validateProfile(profile({ qualityLow: 40 }))).toBe("Quality runs from 50 to 100, low to high.");
    expect(validateProfile(profile({ typicalAgeLow: 5, typicalAgeHigh: null }))).toBe(AGE);
    expect(validateProfile(profile({ typicalAgeLow: 12, typicalAgeHigh: 5 }))).toBe(AGE);
    expect(validateProfile(profile({ sat: { sweetness: ["MEDIUM", "MEDIUM"] } }))).toBe(
      "Sweetness: pick a range on its own scale.",
    );
    expect(validateProfile(profile({ winePlaceId: "x" }))).toBe("That map place is not valid.");
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
