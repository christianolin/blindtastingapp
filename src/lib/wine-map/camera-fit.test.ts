// Where a country chip flies (spec 2026-09-23 §7.3): the union of that
// country's shard bboxes, minus outliers such as Madeira, so a tap on
// Portugal lands on the mainland instead of a frame spanning the Atlantic.
// Bboxes are the live manifest's.
import { describe, expect, it } from "vitest";
import {
  bboxesForCountry,
  CHIP_MIN_ZOOM,
  chipFlightNeeded,
  countryCameraBox,
} from "./camera-fit";
import type { Bbox } from "./shard-specs";

const PORTUGAL: Bbox[] = [
  [-8.359, 40.136, -7.42, 40.875], // dao
  [-7.914, 40.923, -6.749, 41.557], // douro
  [-8.881, 40.763, -7.704, 42.154], // minho
  [-17.266, 32.633, -16.289, 33.107], // madeira
  [-8.583, 37.741, -6.987, 39.584], // alentejo
  [-8.746, 40.233, -8.303, 40.669], // bairrada
  [-9.261, 37.749, -8.13, 38.843], // peninsula-de-setubal
];

const FRANCE: Bbox[] = [
  [5.344, 46.398, 5.901, 47.039], // jura
  [8.575, 41.454, 9.49, 43.008], // corse
  [-2.023, 45.536, 4.109, 47.908], // loire
  [4.311, 43.669, 5.742, 45.521], // rhone
  [7.051, 47.79, 7.612, 48.701], // alsace
  [5.77, 45.464, 6.526, 46.399], // savoie
  [-1.06, 44.383, 0.313, 45.457], // bordeaux
  [4.705, 42.985, 6.86, 43.916], // provence
  [3.609, 46.243, 5.005, 47.885], // bourgogne
  [3.137, 47.924, 4.9, 49.455], // champagne
  [-1.366, 43.131, 2.568, 45.007], // sud-ouest
  [4.434, 45.836, 4.782, 46.282], // beaujolais
  [1.97, 42.435, 4.61, 43.906], // languedoc-roussillon
];

describe("countryCameraBox", () => {
  it("drops Madeira from Portugal (centre 11.4 deg away against a 1.24 median)", () => {
    expect(countryCameraBox(PORTUGAL)).toEqual([-9.261, 37.741, -6.749, 42.154]);
  });

  it("keeps Corse in France (5.8 deg against a 2.8 median, under the 3x cut)", () => {
    expect(countryCameraBox(FRANCE)).toEqual([-2.023, 41.454, 9.49, 49.455]);
  });

  it("handles the small cases", () => {
    expect(countryCameraBox([])).toBeNull();
    expect(countryCameraBox([[1, 2, 3, 4]])).toEqual([1, 2, 3, 4]);
    expect(
      countryCameraBox([
        [0, 0, 1, 1],
        [2, 2, 3, 3],
      ]),
    ).toEqual([0, 0, 3, 3]);
    // Two shards at one place and a third far off: the far one is the outlier.
    expect(
      countryCameraBox([
        [0, 0, 1, 1],
        [0, 0, 1, 1],
        [20, 20, 21, 21],
      ]),
    ).toEqual([0, 0, 1, 1]);
  });
});

describe("bboxesForCountry", () => {
  it("collects that country's shard bboxes in key order, skipping shards without one", () => {
    const shards = {
      minho: { bbox: [-8.881, 40.763, -7.704, 42.154] as Bbox },
      alsace: { bbox: [7.051, 47.79, 7.612, 48.701] as Bbox },
      douro: { bbox: [-7.914, 40.923, -6.749, 41.557] as Bbox },
      legacy: {},
    };
    const countries = { minho: "portugal", douro: "portugal", alsace: "france", legacy: "portugal" };
    expect(bboxesForCountry(shards, countries, "portugal")).toEqual([
      [-7.914, 40.923, -6.749, 41.557],
      [-8.881, 40.763, -7.704, 42.154],
    ]);
    expect(bboxesForCountry(shards, countries, "spain")).toEqual([]);
  });
});

describe("chipFlightNeeded", () => {
  it("lands deep enough for regions and first subregions to load", () => {
    expect(CHIP_MIN_ZOOM).toBe(5.5);
  });

  it("stays put for a country already on screen at shard zoom", () => {
    const req = { countriesInView: ["france", "germany"], stayIfVisible: "germany" };
    expect(chipFlightNeeded({ ...req, zoom: 9 })).toBe(false);
    expect(chipFlightNeeded({ ...req, zoom: 5 })).toBe(false);
  });

  it("flies below shard zoom, for a country off screen, and whenever it may not stay", () => {
    expect(chipFlightNeeded({ zoom: 4.4, countriesInView: ["france"], stayIfVisible: "france" })).toBe(true);
    expect(chipFlightNeeded({ zoom: 9, countriesInView: ["france"], stayIfVisible: "italy" })).toBe(true);
    expect(chipFlightNeeded({ zoom: 9, countriesInView: ["france"], stayIfVisible: null })).toBe(true);
  });
});
