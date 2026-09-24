// Which country gets subregion depth in One country mode (spec 2026-09-23
// §7.3). Each precedence step, the share rule's hysteresis, the chip's
// lifecycle, and — through MapLibre's own filter engine — the depth filter the
// resulting flags drive.
import { describe, expect, it } from "vitest";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import {
  centreCountryFrom,
  chipAfterReport,
  chipOnTap,
  COUNTRY_FOCUS_SHARE,
  COUNTRY_RELEASE_SHARE,
  countryShares,
  deepCountriesFor,
  FOCUS_GRID,
  nextFocusCountry,
  scanPastDepthZoom,
} from "./focus";
import { desiredGlobalState } from "./map-state";
import { NEIGHBOUR_MIN_ZOOM, type MountInput } from "./mount-policy";
import { shardFilter, type Bbox } from "./shard-specs";

describe("countryShares", () => {
  // One grid cell per degree: a 48x48 view on a 48-cell grid.
  const VIEW: Bbox = [0, 0, 48, 48];
  // Typed, not `as const`: readonly tuples are not assignable to Bbox.
  const SHARDS: MountInput["shards"] = [
    ["west", { bbox: [0, 0, 24, 48] }],
    // Inside "west": a union must not count its cells twice.
    ["west-core", { bbox: [0, 0, 12, 12] }],
    ["east", { bbox: [24, 0, 36, 48] }],
    // No country (tree does not know it): ignored.
    ["orphan", { bbox: [40, 40, 41, 41] }],
    // Known country, entirely off screen.
    ["away", { bbox: [100, 100, 110, 110] }],
    // No bbox: cannot be measured.
    ["nobox", {}],
  ];
  const COUNTRIES = {
    west: "france",
    "west-core": "france",
    east: "germany",
    away: "italy",
    nobox: "spain",
  };

  it("measures each country's share of the on-screen wine ground by union", () => {
    expect(FOCUS_GRID).toBe(48);
    const { shares, present } = countryShares({
      shards: SHARDS,
      shardCountries: COUNTRIES,
      view: VIEW,
    });
    // france: 24x48 cells (west-core adds none), germany 12x48, union 36x48.
    expect(shares.france).toBeCloseTo(2 / 3, 10);
    expect(shares.germany).toBeCloseTo(1 / 3, 10);
    expect(Object.keys(shares).sort()).toEqual(["france", "germany"]);
    expect(present).toEqual(["france", "germany"]);
  });

  it("returns nothing for a degenerate view", () => {
    expect(
      countryShares({ shards: SHARDS, shardCountries: COUNTRIES, view: [5, 5, 5, 9] }),
    ).toEqual({ shares: {}, present: [] });
  });
});

describe("centreCountryFrom", () => {
  const COUNTRIES = { alsace: "france", baden: "germany" };

  it("takes the first hit whose region has a known country", () => {
    expect(centreCountryFrom([{ region: "alsace", tier: 1 }], COUNTRIES)).toBe("france");
    expect(
      centreCountryFrom(
        [null, undefined, { tier: 0 }, { region: 42 }, { region: "atlantis" }, { region: "baden" }],
        COUNTRIES,
      ),
    ).toBe("germany");
  });

  it("never reads a prototype member as a country", () => {
    expect(centreCountryFrom([{ region: "constructor" }], COUNTRIES)).toBeNull();
    expect(centreCountryFrom([{ region: "__proto__" }], COUNTRIES)).toBeNull();
  });

  it("is null with no hits", () => {
    expect(centreCountryFrom([], COUNTRIES)).toBeNull();
  });
});

describe("nextFocusCountry", () => {
  const base = {
    chipCountry: null,
    selectedCountry: null,
    countriesInView: ["france", "germany"],
    centreCountry: null,
    shares: { france: 0.3, germany: 0.8 },
    prev: null,
  };

  it("names the thresholds", () => {
    expect(COUNTRY_FOCUS_SHARE).toBe(0.6);
    expect(COUNTRY_RELEASE_SHARE).toBe(0.45);
  });

  it("4. falls back to the share rule", () => {
    expect(nextFocusCountry(base)).toBe("germany");
  });

  it("3. prefers the country under the map centre — Colmar is France, whatever Baden's bbox says", () => {
    expect(nextFocusCountry({ ...base, centreCountry: "france" })).toBe("france");
  });

  it("2. prefers the selected place's country while it is on screen", () => {
    expect(
      nextFocusCountry({ ...base, selectedCountry: "germany", centreCountry: "france" }),
    ).toBe("germany");
  });

  it("2. ignores a selection whose country is off screen", () => {
    expect(
      nextFocusCountry({ ...base, selectedCountry: "italy", centreCountry: "france" }),
    ).toBe("france");
  });

  it("1. prefers a tapped chip once its country is on screen", () => {
    expect(
      nextFocusCountry({
        ...base,
        chipCountry: "france",
        selectedCountry: "germany",
        centreCountry: "germany",
      }),
    ).toBe("france");
  });

  it("1. ignores a chip whose country is not on screen yet (its flight is underway)", () => {
    expect(nextFocusCountry({ ...base, chipCountry: "italy" })).toBe("germany");
  });

  it("4. keeps the previous focus until it falls below the release share", () => {
    const even = { ...base, shares: { france: 0.5, germany: 0.5 } };
    expect(nextFocusCountry({ ...even, prev: "france" })).toBe("france");
    expect(nextFocusCountry({ ...even, prev: "germany" })).toBe("germany");
    expect(nextFocusCountry(even)).toBeNull();
    expect(
      nextFocusCountry({ ...base, shares: { france: 0.4, germany: 0.55 }, prev: "france" }),
    ).toBeNull();
  });

  it("4. a leader past the focus share beats the previous focus", () => {
    expect(
      nextFocusCountry({ ...base, shares: { france: 0.5, germany: 0.62 }, prev: "france" }),
    ).toBe("germany");
  });

  it("4. has no focus with no wine ground in view", () => {
    expect(
      nextFocusCountry({ ...base, countriesInView: [], shares: {}, prev: "france" }),
    ).toBeNull();
  });
});

describe("chip lifecycle", () => {
  it("chipOnTap knows at once whether the country is already on screen", () => {
    expect(chipOnTap(null, "france", ["france", "germany"])).toEqual({
      country: "france",
      seen: true,
    });
    expect(chipOnTap(null, "italy", ["france"])).toEqual({ country: "italy", seen: false });
  });

  it("chipOnTap keeps the same chip object on a repeat tap", () => {
    const chip = { country: "italy", seen: false };
    expect(chipOnTap(chip, "italy", ["italy"])).toBe(chip);
  });

  it("chipAfterReport waits for a flight, then clears once the country has left the view", () => {
    const flying = { country: "italy", seen: false };
    expect(chipAfterReport(flying, ["france"])).toBe(flying);
    const landed = chipAfterReport(flying, ["italy"]);
    expect(landed).toEqual({ country: "italy", seen: true });
    expect(chipAfterReport(landed, ["italy", "france"])).toBe(landed);
    expect(chipAfterReport(landed, ["france"])).toBeNull();
    expect(chipAfterReport(null, ["italy"])).toBeNull();
  });
});

describe("deepCountriesFor through the real depth filter", () => {
  const KNOWN = ["france", "germany", "italy"];
  const passes = (country: string, deep: string[], tier: number) => {
    const state = desiredGlobalState({
      visibleKeys: null,
      english: true,
      selectedKey: null,
      deepCountries: deep,
      knownCountries: KNOWN,
    });
    return featureFilter(shardFilter(country) as never, state).filter(
      { zoom: 9 } as never,
      { type: 3, properties: { key: `${country}.region.place`, tier } } as never,
    );
  };

  it("All countries opens full depth for every known country, focus or not", () => {
    const deep = deepCountriesFor("all", "france", KNOWN);
    expect(deep).toEqual(KNOWN);
    for (const country of KNOWN) expect(passes(country, deep, 3)).toBe(true);
  });

  it("One country opens only the focus country; the others keep their regions", () => {
    const deep = deepCountriesFor("one", "france", KNOWN);
    expect(deep).toEqual(["france"]);
    expect(passes("france", deep, 3)).toBe(true);
    expect(passes("germany", deep, 3)).toBe(false);
    expect(passes("germany", deep, 1)).toBe(true);
  });

  it("One country with no focus keeps every country at region level", () => {
    const deep = deepCountriesFor("one", null, KNOWN);
    expect(deep).toEqual([]);
    for (const country of KNOWN) {
      expect(passes(country, deep, 2)).toBe(false);
      expect(passes(country, deep, 1)).toBe(true);
    }
  });
});

// Controller ruling R3: past NEIGHBOUR_MIN_ZOOM an undrawn focus country reads
// "No subregions mapped here", which is honest only when the idle scan that
// saw no depth looked at that same country.
describe("scanPastDepthZoom", () => {
  it("is true once the scan of the current focus was taken at or past NEIGHBOUR_MIN_ZOOM", () => {
    expect(NEIGHBOUR_MIN_ZOOM).toBe(8);
    expect(
      scanPastDepthZoom({ scanZoom: 8, scanFocus: "germany", focusCountry: "germany" }),
    ).toBe(true);
    expect(
      scanPastDepthZoom({ scanZoom: 12, scanFocus: "germany", focusCountry: "germany" }),
    ).toBe(true);
  });

  it("is false below NEIGHBOUR_MIN_ZOOM, where more zoom may yet draw subregions", () => {
    expect(
      scanPastDepthZoom({ scanZoom: 7.99, scanFocus: "germany", focusCountry: "germany" }),
    ).toBe(false);
  });

  it("is false for a scan from before a focus change: France never borrows Germany's scan", () => {
    expect(
      scanPastDepthZoom({ scanZoom: 9, scanFocus: "germany", focusCountry: "france" }),
    ).toBe(false);
    expect(scanPastDepthZoom({ scanZoom: 9, scanFocus: null, focusCountry: "france" })).toBe(
      false,
    );
  });

  it("is false with no focus country", () => {
    expect(scanPastDepthZoom({ scanZoom: 9, scanFocus: null, focusCountry: null })).toBe(false);
  });
});
