// Where a country chip flies (spec 2026-09-23 §7.3): the union of that
// country's shard bboxes, minus outliers such as Madeira, so a tap on
// Portugal lands on the mainland instead of a frame spanning the Atlantic.
// Bboxes are the live manifest's.
import { describe, expect, it } from "vitest";
import {
  bboxesForCountry,
  CHIP_FIT_ALL_SHARDS,
  CHIP_MIN_ZOOM,
  chipFlightNeeded,
  chipLandingZoom,
  chipMinZoom,
  countryCameraBox,
  FIT_PADDING_PX,
  MIN_FIT_BAND_PX,
  selectionFit,
  selectionZooms,
  CAMERA_MAX_ZOOM,
  CAMERA_MAX_ZOOM_RULE_OFF,
} from "./camera-fit";
import { SHARD_MIN_ZOOM } from "./mount-policy";
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

const USA: Bbox[] = [
  [-124.41, 32.53, -114.13, 42.01], // california
  [-79.76, 40.5, -71.86, 45.02], // new-york
  [-124.57, 41.99, -116.46, 46.29], // oregon
  [-124.73, 45.54, -116.92, 49.0], // washington
];

describe("countryCameraBox with keepAll (spec 2026-09-29 D26)", () => {
  it("keeps New York when asked, so the chip frames California to New York", () => {
    expect(countryCameraBox(USA, { keepAll: true })).toEqual([-124.73, 32.53, -71.86, 49.0]);
  });
  it("drops New York without it (centre 44 deg off against a 5.1 median: why the option exists)", () => {
    expect(countryCameraBox(USA)).toEqual([-124.73, 32.53, -114.13, 49.0]);
  });
  it("leaves Portugal and France as they were", () => {
    expect(countryCameraBox(PORTUGAL, { keepAll: false })).toEqual([-9.261, 37.741, -6.749, 42.154]);
    expect(countryCameraBox(FRANCE, {})).toEqual([-2.023, 41.454, 9.49, 49.455]);
  });
  it("applies to the United States only", () => {
    expect([...CHIP_FIT_ALL_SHARDS]).toEqual(["united-states"]);
  });
});

// MapLibre's cameraForBounds for a north-up map: the zoom at which the box,
// in 512 px Web Mercator world units, fills the canvas minus the padding on
// each side. Used only to check where a chip really lands.
function fittedZoom(bbox: Bbox, width: number, height: number, padding = 48): number {
  const x = (lon: number) => ((lon + 180) / 360) * 512;
  const y = (lat: number) =>
    ((180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360) * 512;
  const [minX, minY, maxX, maxY] = bbox;
  const scale = Math.min(
    (width - 2 * padding) / (x(maxX) - x(minX)),
    (height - 2 * padding) / (y(minY) - y(maxY)),
  );
  return Math.log2(scale);
}

describe("where a chip lands (spec 2026-09-29 D26)", () => {
  const lower48 = countryCameraBox(USA, { keepAll: true })!;
  const floor = chipMinZoom("united-states");
  it.each([
    ["an iPhone", 375, 667],
    ["a laptop", 1675, 900],
  ])("the United States keeps its fitted zoom on %s, below shard zoom", (_, w, h) => {
    const fitted = fittedZoom(lower48, w, h);
    const landed = chipLandingZoom(fitted, floor);
    expect(landed).toBe(fitted);
    expect(landed).toBeLessThan(CHIP_MIN_ZOOM);
    expect(landed).toBeLessThan(SHARD_MIN_ZOOM);
  });
  it("frames both coasts: the fitted box is the whole lower-48 box, not a z5.5 slice of its middle", () => {
    // At the landed zoom on a laptop the view spans more longitude than the box.
    const landed = chipLandingZoom(fittedZoom(lower48, 1675, 900), floor);
    const degreesAcross = (1675 / (512 * 2 ** landed)) * 360;
    expect(degreesAcross).toBeGreaterThan(lower48[2] - lower48[0]);
    // What the old floor did: z5.5 shows about 26 degrees, neither California nor New York.
    expect((1675 / (512 * 2 ** CHIP_MIN_ZOOM)) * 360).toBeLessThan(30);
  });
  it("every other country keeps the z5.5 floor", () => {
    expect(chipMinZoom("portugal")).toBe(CHIP_MIN_ZOOM);
    expect(chipMinZoom("france")).toBe(CHIP_MIN_ZOOM);
    const portugal = countryCameraBox(PORTUGAL)!;
    // Portugal's mainland fits deeper than z5.5 on a laptop, so the floor is idle there,
    const laptop = fittedZoom(portugal, 1675, 900);
    expect(chipLandingZoom(laptop, chipMinZoom("portugal"))).toBe(laptop);
    // and a fitted zoom under it is still raised.
    expect(chipLandingZoom(3, chipMinZoom("portugal"))).toBe(CHIP_MIN_ZOOM);
    expect(chipLandingZoom(undefined, chipMinZoom("portugal"))).toBe(CHIP_MIN_ZOOM);
  });
});

// Where a tree, search or ?place= pick lands (design-final §3.5): where the
// place can be seen. Bboxes, tiers and min_zooms are the live catalogue's.
describe("selectionZooms", () => {
  const COLE_RANCH: Bbox = [-123.23493, 39.05565, -123.21377, 39.06551];
  const MONTHOUX: Bbox = [5.8364, 45.7003, 5.837, 45.7022];
  const PAUILLAC: Bbox = [-0.7933, 45.1667, -0.7403, 45.2279];
  const NAPA: Bbox = [-122.64675, 38.15506, -122.0614, 38.76833];
  const RRV: Bbox = [-123.03101, 38.30056, -122.67373, 38.65234];
  const CHABLIS_1ER: Bbox = [3.7266, 47.7837, 3.8421, 47.859];
  const USA: Bbox = [-124.71, 24.5423, -66.987, 49.3697];
  const leaf = (bbox: Bbox, tier: number, minZoom: number, revealPx: number) =>
    selectionZooms({ tier, minZoom, childMinZooms: [], bbox, revealPx });
  // Today's rule, as the explorer computed it before the size rule.
  const today = (minZoom: number, childMinZooms: number[]) => {
    const maxZoom = Math.min(
      childMinZooms.length > 0 ? Math.max(...childMinZooms) + 0.5 : minZoom + 1.5,
      16,
    );
    return { minZoom: childMinZooms.length > 0 ? 0 : Math.min(minZoom + 0.35, maxZoom), maxZoom };
  };

  it("leaves large places where they land today", () => {
    // At 32 px Pauillac's floor rises to z10, under its z10.5 cap, which a
    // desktop or phone fit reaches anyway: it still lands where it does today.
    expect(leaf(PAUILLAC, 3, 9, 32)).toEqual({ minZoom: 10, maxZoom: 10.5 });
    for (const px of [0, 16, 24]) {
      expect(leaf(PAUILLAC, 3, 9, px), `Pauillac ${px}`).toEqual(today(9, []));
      expect(leaf(RRV, 4, 7, px), `Russian River Valley ${px}`).toEqual(today(7, []));
    }
    // A parent keeps its framing; only its floor rises to its own tile zoom.
    for (const px of [16, 24, 32]) {
      expect(selectionZooms({ tier: 3, minZoom: 6, childMinZooms: [7], bbox: NAPA, revealPx: px })).toEqual({
        minZoom: 6,
        maxZoom: today(6, [7]).maxZoom,
      });
    }
  });

  // The kill switch (review 2026-09-30): REVEAL_MIN_PX = 0 or ?revealPx=0 is
  // the old camera exactly, parents and the z16 cap included.
  it("with the rule off, every pick lands exactly as before the rule", () => {
    expect(CAMERA_MAX_ZOOM_RULE_OFF).toBe(16);
    for (const minZoom of [4, 6, 7, 9.5, 12, 13, 14, 14.9, 15.5]) {
      expect(leaf(COLE_RANCH, 3, minZoom, 0), `leaf ${minZoom}`).toEqual(today(minZoom, []));
      for (const children of [[minZoom], [minZoom + 1], [minZoom - 1], [15.8], [11, 12]]) {
        for (const tier of [0, 1, 2, 4]) {
          expect(
            selectionZooms({ tier, minZoom, childMinZooms: children, bbox: CHABLIS_1ER, revealPx: 0 }),
            `parent ${tier} ${minZoom} ${children}`,
          ).toEqual(today(minZoom, children));
        }
      }
    }
  });

  // Review 2026-09-30: a parent whose children all sit below its own tile
  // zoom was capped under that zoom, where neither it nor its ring is drawn.
  it("never caps a parent below its own tile zoom, whatever its children's min_zoom", () => {
    for (const px of [16, 24, 32]) {
      for (const bbox of [CHABLIS_1ER, COLE_RANCH, NAPA]) {
        for (const tier of [1, 2, 3]) {
          const z = selectionZooms({ tier, minZoom: 12, childMinZooms: [11, 11], bbox, revealPx: px });
          expect(z.minZoom, `${tier} ${px}`).toBeGreaterThanOrEqual(12);
          expect(z.maxZoom, `${tier} ${px}`).toBeGreaterThanOrEqual(12.5);
        }
      }
    }
    expect(selectionZooms({ tier: 3, minZoom: 12, childMinZooms: [11, 11], bbox: CHABLIS_1ER, revealPx: 24 })).toEqual({
      minZoom: 12,
      maxZoom: 12.5,
    });
  });

  // Review 2026-09-30: the parent floor tested a 2N-px bbox, stricter than the
  // N-px footprint the fill needs, so ten parents already drawn at their old
  // landing were pushed a zoom deeper. Libournais is 33 px across at z7.
  it("does not move a parent that is drawn at its old landing", () => {
    const LIBOURNAIS: Bbox = [-0.3413, 44.8379, -0.0474, 44.9977];
    const MONTALCINO: Bbox = [11.34984, 42.95799, 11.58996, 43.1129];
    const MALIBU_COAST: Bbox = [-119.08114, 34.00018, -118.56485, 34.2054];
    const EICHHOFFEN: Bbox = [7.425805, 48.368634, 7.453398, 48.386819];
    for (const px of [16, 24]) {
      expect(selectionZooms({ tier: 2, minZoom: 6, childMinZooms: [7], bbox: LIBOURNAIS, revealPx: px }).maxZoom).toBe(7.5);
      expect(selectionZooms({ tier: 2, minZoom: 6, childMinZooms: [7], bbox: MONTALCINO, revealPx: px }).maxZoom).toBe(7.5);
      expect(selectionZooms({ tier: 2, minZoom: 6, childMinZooms: [6], bbox: MALIBU_COAST, revealPx: px }).maxZoom).toBe(6.5);
      // Its floor rises to where its bbox is N px (z9 or z10), under the same cap.
      expect(selectionZooms({ tier: 2, minZoom: 8, childMinZooms: [10], bbox: EICHHOFFEN, revealPx: px }).maxZoom).toBe(10.5);
    }
    // A parent whose very bbox is under N px at its old cap is raised, to the
    // first zoom where the bbox is N px across (then it can be drawn at all).
    expect(selectionZooms({ tier: 3, minZoom: 6, childMinZooms: [7], bbox: COLE_RANCH, revealPx: 24 })).toEqual({
      minZoom: 11,
      maxZoom: 11.5,
    });
  });

  it("lands a tiny place where it is drawn", () => {
    expect(leaf(COLE_RANCH, 3, 6, 24)).toEqual({ minZoom: 12, maxZoom: 12.5 });
    expect(leaf(COLE_RANCH, 3, 6, 16)).toEqual({ minZoom: 11, maxZoom: 11.5 });
    expect(leaf(MONTHOUX, 2, 7, 24)).toEqual({ minZoom: 15, maxZoom: 15.5 });
    expect(leaf(MONTHOUX, 2, 7, 32)).toEqual({ minZoom: 16, maxZoom: 16.5 });
  });

  it("floors a parent at its own tile zoom (Chablis 1er Cru landed at 11.77, drawing nothing)", () => {
    for (const px of [16, 24, 32]) {
      const z = selectionZooms({ tier: 4, minZoom: 12, childMinZooms: [14], bbox: CHABLIS_1ER, revealPx: px });
      expect(z).toEqual({ minZoom: 12, maxZoom: 14.5 });
    }
    // The kill switch brings the old floor back with everything else.
    expect(selectionZooms({ tier: 4, minZoom: 12, childMinZooms: [14], bbox: CHABLIS_1ER, revealPx: 0 })).toEqual({
      minZoom: 0,
      maxZoom: 14.5,
    });
  });

  it("never floors a country or region above its own tile zoom", () => {
    for (const px of [16, 24, 32, 64]) {
      expect(selectionZooms({ tier: 0, minZoom: 1.5, childMinZooms: [1.5], bbox: USA, revealPx: px })).toEqual({
        minZoom: 1,
        maxZoom: 2,
      });
      expect(leaf(COLE_RANCH, 1, 4, px).minZoom).toBe(4.35);
    }
  });

  it("keeps minZoom <= maxZoom <= CAMERA_MAX_ZOOM", () => {
    expect(CAMERA_MAX_ZOOM).toBe(17);
    for (const px of [0, 16, 24, 32, 64]) {
      for (const bbox of [COLE_RANCH, MONTHOUX, PAUILLAC, NAPA, [5, 45, 5, 45] as Bbox]) {
        for (const [tier, minZoom, children] of [[3, 6, []], [4, 14, []], [2, 7, [16]], [4, 12, [14]]] as const) {
          const z = selectionZooms({ tier, minZoom, childMinZooms: children, bbox, revealPx: px });
          expect(z.minZoom).toBeLessThanOrEqual(z.maxZoom);
          expect(z.maxZoom).toBeLessThanOrEqual(CAMERA_MAX_ZOOM);
        }
      }
    }
  });
});
