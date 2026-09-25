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
  FIT_PADDING_PX,
  MIN_FIT_BAND_PX,
  selectionFit,
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

// A selection's fit on a phone whose bottom sheet is open at half (the
// 2026-09-25 phone plan, ruling R1): the sheet's height is left free at the
// bottom, and the place is eased to the centre of what the sheet leaves, as
// long as that leaves a band of at least MIN_FIT_BAND_PX to fit into.
describe("selectionFit", () => {
  const PLAIN = { padding: 48, offset: [0, 0] };

  it("without a sheet is the 48 px frame all round and no offset", () => {
    expect(FIT_PADDING_PX).toBe(48);
    expect(selectionFit(undefined, 800)).toEqual(PLAIN);
    expect(selectionFit(undefined, 800).sheet).toBeUndefined();
    // Whatever the canvas: the desktop path never looks at its height.
    expect(selectionFit(undefined, 0)).toEqual(PLAIN);
  });

  it("on a tall canvas adds the sheet's height at the bottom and offsets the centre by half of it", () => {
    // 844 - 406 - 96 = 342 px of band.
    expect(selectionFit({ bottom: 406 }, 844)).toEqual({
      padding: { top: 48, right: 48, bottom: 454, left: 48 },
      offset: [0, -203],
      sheet: { bottom: 406 },
    });
  });

  it("treats a sheet of no height, or a negative one, as no sheet", () => {
    expect(selectionFit({ bottom: 0 }, 844)).toEqual(PLAIN);
    expect(selectionFit({ bottom: -10 }, 844)).toEqual(PLAIN);
  });

  it("keeps a floor of 120 px of visible map", () => {
    expect(MIN_FIT_BAND_PX).toBe(120);
  });

  it("drops the sheet on a landscape phone, where the band above it is negative", () => {
    // 260 - 235 - 96 = -71: MapLibre would refuse the padded fit outright.
    const fit = selectionFit({ bottom: 235 }, 260);
    expect(fit).toEqual(PLAIN);
    expect(fit.sheet).toBeUndefined();
  });

  it("drops the sheet when the band is thin but positive (a portrait phone under the tasting strip)", () => {
    // 572 - 449 - 96 = 27 px: a region would fit at an absurdly low zoom.
    expect(selectionFit({ bottom: 449 }, 572)).toEqual(PLAIN);
  });

  it("keeps the sheet on a 667 px canvas under a 380 px sheet (191 px of band)", () => {
    expect(selectionFit({ bottom: 380 }, 667)).toEqual({
      padding: { top: 48, right: 48, bottom: 428, left: 48 },
      offset: [0, -190],
      sheet: { bottom: 380 },
    });
  });

  it("keeps the sheet exactly at the floor, and drops it one pixel under", () => {
    // 596 - 380 - 96 = 120.
    expect(selectionFit({ bottom: 380 }, 596).sheet).toEqual({ bottom: 380 });
    expect(selectionFit({ bottom: 380 }, 595)).toEqual(PLAIN);
  });

  it("drops the sheet for a canvas with no measurable height", () => {
    expect(selectionFit({ bottom: 380 }, 0)).toEqual(PLAIN);
    expect(selectionFit({ bottom: 380 }, Number.NaN)).toEqual(PLAIN);
  });
});
