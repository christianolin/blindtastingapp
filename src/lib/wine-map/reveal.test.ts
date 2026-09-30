// When a subregion appears on the wine map (owner, 2026-09-30: "you need to
// zoom further in before smaller places appear"). The rule's expression runs
// in MapLibre's worker, its JS mirror in the camera and the status line, so
// both are pinned against each other through BOTH expression engines, and the
// owner-approved table of named places (design-final §2.1) is pinned as data:
// a future change to the rule shows up here as a diff.
//
// Areas, tiers, min_zooms and bboxes are the live catalogue's (release
// 20260930T132635Z, one read-only SELECT); latitudes are each shard's
// manifest bbox mid-latitude.
import { describe, expect, it } from "vitest";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import { bundledStyleEngine } from "../testing/bundled-style-engine";
import {
  bboxZoomForPx,
  REVEAL_CAP_ZOOM,
  REVEAL_MIN_PX,
  REVEAL_PX_MAX,
  revealK,
  revealLatitude,
  revealPasses,
  revealPxFromSearch,
  revealTerm,
  revealZoom,
  sizeHiddenInView,
} from "./reveal";
import type { Bbox } from "./shard-specs";

type Props = Record<string, unknown>;
type Compiled = (props: Props, zoom: number) => boolean;
const engines: { name: string; compile(expression: unknown): Compiled }[] = [
  {
    name: "standalone style-spec",
    compile: (expression) => {
      const f = featureFilter(expression as never);
      return (props, zoom) => f.filter({ zoom }, { type: 3, properties: props } as never);
    },
  },
  {
    name: "bundled maplibre-gl",
    compile: (expression) => {
      const f = bundledStyleEngine().featureFilter(expression, {});
      return (props, zoom) => f.filter({ zoom }, { type: 3, properties: props });
    },
  },
];

const LAT = {
  california: 37.2671,
  bordeaux: 44.92005,
  rhone: 44.595,
  savoie: 45.9313,
  bourgogne: 47.0641,
  mosel: 49.952325,
  piemonte: 45.26211,
  veneto: 45.73669,
  ahr: 50.532055,
  rheingau: 50.565689,
} as const;
type Shard = keyof typeof LAT;

type Place = {
  name: string;
  shard: Shard;
  tier: number;
  min_zoom: number;
  area: number;
  bbox: Bbox;
  /** First zoom drawn today, then at 16 / 24 / 32 px (design-final §2.1). */
  today: number;
  at: { 16: number; 24: number; 32: number };
};

const PLACES: Place[] = [
  { name: "Cole Ranch", shard: "california", tier: 3, min_zoom: 6, area: 0.00008013, bbox: [-123.23493, 39.05565, -123.21377, 39.06551], today: 6, at: { 16: 11, 24: 11, 32: 12 } },
  { name: "Benmore Valley", shard: "california", tier: 3, min_zoom: 6, area: 0.00054262, bbox: [-123.04102, 38.99665, -123.00207, 39.02382], today: 6, at: { 16: 9, 24: 10, 32: 10 } },
  { name: "Rockpile", shard: "california", tier: 3, min_zoom: 6, area: 0.00616419, bbox: [-123.24641, 38.70886, -123.05546, 38.80911], today: 6, at: { 16: 7, 24: 8, 32: 8 } },
  { name: "High Valley", shard: "california", tier: 3, min_zoom: 6, area: 0.00686257, bbox: [-122.76342, 39.00863, -122.59051, 39.08274], today: 6, at: { 16: 7, 24: 8, 32: 8 } },
  { name: "Los Carneros", shard: "california", tier: 3, min_zoom: 6, area: 0.01551156, bbox: [-122.54487, 38.15078, -122.28244, 38.30364], today: 6, at: { 16: 7, 24: 7, 32: 8 } },
  { name: "Mendocino Ridge", shard: "california", tier: 3, min_zoom: 6, area: 0.03528304, bbox: [-123.70138, 38.77659, -123.31982, 39.15532], today: 6, at: { 16: 6, 24: 7, 32: 7 } },
  { name: "Napa Valley", shard: "california", tier: 3, min_zoom: 6, area: 0.16727936, bbox: [-122.64675, 38.15506, -122.0614, 38.76833], today: 6, at: { 16: 6, 24: 6, 32: 6 } },
  { name: "Oakville", shard: "california", tier: 4, min_zoom: 7, area: 0.00283441, bbox: [-122.43791, 38.39871, -122.33021, 38.465], today: 7, at: { 16: 8, 24: 9, 32: 9 } },
  { name: "Stags Leap District", shard: "california", tier: 4, min_zoom: 7, area: 0.00127251, bbox: [-122.35186, 38.37813, -122.2981, 38.43076], today: 7, at: { 16: 9, 24: 9, 32: 10 } },
  { name: "Russian River Valley", shard: "california", tier: 4, min_zoom: 7, area: 0.07142019, bbox: [-123.03101, 38.30056, -122.67373, 38.65234], today: 7, at: { 16: 7, 24: 7, 32: 7 } },
  { name: "Pauillac", shard: "bordeaux", tier: 3, min_zoom: 9, area: 0.00206397, bbox: [-0.7933, 45.1667, -0.7403, 45.2279], today: 9, at: { 16: 9, 24: 9, 32: 9 } },
  { name: "Canon-Fronsac", shard: "bordeaux", tier: 3, min_zoom: 7, area: 0.00058909, bbox: [-0.3046, 44.9217, -0.2734, 44.9452], today: 7, at: { 16: 9, 24: 10, 32: 10 } },
  { name: "Hermitage", shard: "rhone", tier: 3, min_zoom: 7, area: 0.00017304, bbox: [4.8301, 45.0713, 4.8652, 45.0815], today: 7, at: { 16: 10, 24: 11, 32: 11 } },
  { name: "Monthoux", shard: "savoie", tier: 2, min_zoom: 7, area: 2.9e-7, bbox: [5.8364, 45.7003, 5.837, 45.7022], today: 7, at: { 16: 15, 24: 15, 32: 16 } },
  { name: "Romanée-Conti", shard: "bourgogne", tier: 4, min_zoom: 13, area: 0.00000218, bbox: [4.9485, 47.161, 4.9508, 47.1623], today: 13, at: { 16: 13, 24: 14, 32: 14 } },
  { name: "La Tâche", shard: "bourgogne", tier: 4, min_zoom: 13, area: 0.00000718, bbox: [4.9469, 47.158817, 4.9523, 47.1607], today: 13, at: { 16: 13, 24: 13, 32: 13 } },
  { name: "Clos de Vougeot", shard: "bourgogne", tier: 4, min_zoom: 13, area: 0.00006083, bbox: [4.9535, 47.1676, 4.9633, 47.1764], today: 13, at: { 16: 13, 24: 13, 32: 13 } },
  { name: "Les Amoureuses", shard: "bourgogne", tier: 5, min_zoom: 14, area: 0.00000704, bbox: [4.9558, 47.1784, 4.9596, 47.1811], today: 14, at: { 16: 14, 24: 14, 32: 14 } },
  { name: "Bernkasteler Doctor", shard: "mosel", tier: 4, min_zoom: 12, area: 0.00000413, bbox: [7.076351, 49.915349, 7.079655, 49.917562], today: 12, at: { 16: 13, 24: 13, 32: 14 } },
  { name: "Piesporter Goldtröpfchen", shard: "mosel", tier: 4, min_zoom: 12, area: 0.00010614, bbox: [6.893171, 49.876892, 6.937059, 49.889914], today: 12, at: { 16: 12, 24: 12, 32: 12 } },
  { name: "Barolo", shard: "piemonte", tier: 3, min_zoom: 7, area: 0.00803822, bbox: [7.89369, 44.57208, 8.01172, 44.67766], today: 7, at: { 16: 7, 24: 8, 32: 8 } },
  { name: "Barbaresco", shard: "piemonte", tier: 3, min_zoom: 7, area: 0.00453445, bbox: [8.05704, 44.65791, 8.15292, 44.75724], today: 7, at: { 16: 8, 24: 8, 32: 9 } },
  { name: "Lugana", shard: "veneto", tier: 2, min_zoom: 6, area: 0.00084366, bbox: [10.62313, 45.42293, 10.68244, 45.45747], today: 6, at: { 16: 9, 24: 9, 32: 10 } },
  // Regions: 2 to 8 px at their own zoom, and exempt.
  { name: "Ahr", shard: "ahr", tier: 1, min_zoom: 4, area: 0.00491713, bbox: [6.9791, 50.50258, 7.20678, 50.56153], today: 4, at: { 16: 4, 24: 4, 32: 4 } },
  { name: "Rheingau", shard: "rheingau", tier: 1, min_zoom: 4, area: 0.0138727, bbox: [7.781571, 49.970016, 9.433746, 51.161362], today: 4, at: { 16: 4, 24: 4, 32: 4 } },
];

const propsOf = (p: Place): Props => ({ key: p.name, tier: p.tier, area: p.area, min_zoom: p.min_zoom });
const THRESHOLDS = [16, 24, 32] as const;

describe("reveal: the owner's knob", () => {
  it("defaults to 24 px (WCAG 2.2's minimum target size), with a z16 net", () => {
    expect(REVEAL_MIN_PX).toBe(24);
    expect(REVEAL_CAP_ZOOM).toBe(16);
    expect(REVEAL_PX_MAX).toBe(64);
  });

  it("reads ?revealPx= for one visit, clamped, falling back to the knob", () => {
    expect(revealPxFromSearch("")).toBe(24);
    expect(revealPxFromSearch("?revealPx=16")).toBe(16);
    expect(revealPxFromSearch("?place=x&revealPx=32")).toBe(32);
    expect(revealPxFromSearch("?revealPx=0")).toBe(0);
    expect(revealPxFromSearch("?revealPx=abc")).toBe(24);
    expect(revealPxFromSearch("?revealPx=")).toBe(24);
    expect(revealPxFromSearch("?revealPx=%20")).toBe(24);
    expect(revealPxFromSearch("?revealPx=-5")).toBe(0);
    expect(revealPxFromSearch("?revealPx=99")).toBe(64);
    expect(revealPxFromSearch("?revealPx=Infinity")).toBe(24);
  });

  it("a shard's latitude is its bbox's mid-latitude, 45 without one", () => {
    expect(revealLatitude([-124.6, 32.5, -114.1, 42.03])).toBeCloseTo(37.265, 9);
    expect(revealLatitude(undefined)).toBe(45);
  });
});

describe("revealK", () => {
  it("is the planar deg² a feature needs at z0 to be N px across at that latitude", () => {
    // Direct: side_px = sqrt(area / cos φ) · 512 · 2^z / 360, solved for area at z0.
    for (const [px, lat] of [[24, 37.2671], [16, 0], [32, 60], [24, 49.95]] as const) {
      const direct = Math.cos((lat * Math.PI) / 180) * ((px * 360) / 512) ** 2;
      expect(Math.abs(revealK(px, lat) - direct) / direct).toBeLessThan(1e-12);
    }
  });
});

describe("revealTerm", () => {
  it("is null when the rule is off, so the filter is exactly today's", () => {
    expect(revealTerm(revealK(24, 45), 0)).toBeNull();
    expect(revealTerm(revealK(24, 45), -1)).toBeNull();
    expect(revealTerm(revealK(24, 45), Number.NaN)).toBeNull();
  });

  for (const engine of engines) {
    it(`agrees with revealPasses at every whole zoom 0..18 for 16/24/32 px (${engine.name})`, () => {
      for (const px of THRESHOLDS) {
        for (const place of PLACES) {
          const k = revealK(px, LAT[place.shard]);
          const f = engine.compile(revealTerm(k, px));
          for (let z = 0; z <= 18; z += 1) {
            expect(f(propsOf(place), z), `${place.name} z${z} ${px}px`).toBe(
              revealPasses(propsOf(place), z, k, px),
            );
          }
        }
      }
    });

    it(`fails open on odd properties, and never hides a country or region (${engine.name})`, () => {
      const k = revealK(24, 45);
      const f = engine.compile(revealTerm(k, 24));
      const row = (props: Props) => [0, 5, 10, 15, 16].map((z) => (f(props, z) ? 1 : 0)).join("");
      expect(row({ tier: 3 })).toBe("11111"); // no area
      expect(row({ tier: 3, area: null })).toBe("11111");
      expect(row({ tier: 3, area: "0.00008" })).toBe("11111"); // string area
      expect(row({ tier: 3, area: 0 })).toBe("00001"); // only the net draws it
      expect(row({ area: 1e-9 })).toBe("11111"); // no tier
      expect(row({ tier: "3", area: 1e-9 })).toBe("11111"); // string tier
      expect(row({ tier: 0, area: 1e-12 })).toBe("11111");
      expect(row({ tier: 1, area: 1e-12 })).toBe("11111");
      expect(row({ tier: 2, area: 1e-12 })).toBe("00001");
      // The JS mirror says the same.
      for (const props of [{ tier: 3 }, { tier: 3, area: 0 }, { area: 1e-9 }, { tier: "3", area: 1e-9 }, { tier: 1, area: 1e-12 }]) {
        expect([0, 5, 10, 15, 16].map((z) => (revealPasses(props, z, k, 24) ? 1 : 0)).join(""), JSON.stringify(props)).toBe(row(props));
      }
    });

    it(`is monotone in zoom: once drawn, drawn at every deeper zoom (${engine.name})`, () => {
      for (const px of THRESHOLDS) {
        for (const place of PLACES) {
          const f = engine.compile(revealTerm(revealK(px, LAT[place.shard]), px));
          let seen = false;
          for (let z = 0; z <= 22; z += 1) {
            const drawn = f(propsOf(place), z);
            if (seen) expect(drawn, `${place.name} z${z}`).toBe(true);
            seen ||= drawn;
          }
        }
      }
    });
  }

  it("with the rule off, revealPasses passes everything", () => {
    expect(revealPasses({ tier: 5, area: 0 }, 0, 1, 0)).toBe(true);
  });
});

describe("revealZoom: the owner-approved table (design-final §2.1)", () => {
  it("is today's first zoom with the rule off", () => {
    for (const place of PLACES) {
      expect(revealZoom(propsOf(place), revealK(24, LAT[place.shard]), 0), place.name).toBe(place.today);
    }
  });

  for (const px of THRESHOLDS) {
    it(`pins the first zoom each named place is drawn at ${px} px`, () => {
      const got = Object.fromEntries(
        PLACES.map((p) => [p.name, revealZoom(propsOf(p), revealK(px, LAT[p.shard]), px)]),
      );
      expect(got).toEqual(Object.fromEntries(PLACES.map((p) => [p.name, p.at[px]])));
    });
  }

  it("never draws a place earlier than today", () => {
    for (const px of THRESHOLDS) {
      for (const place of PLACES) {
        expect(revealZoom(propsOf(place), revealK(px, LAT[place.shard]), px)).toBeGreaterThanOrEqual(place.today);
      }
    }
  });

  it("reads a missing min_zoom as 0", () => {
    expect(revealZoom({ tier: 1 }, 1, 24)).toBe(0);
  });
});

describe("bboxZoomForPx", () => {
  const coleRanch = PLACES[0].bbox;
  it("is the first whole zoom at which a bbox is that many px across", () => {
    expect(bboxZoomForPx(coleRanch, 48)).toBe(12);
    expect(bboxZoomForPx(coleRanch, 32)).toBe(11);
  });

  it("returns whole zooms clamped to 0..16", () => {
    for (const place of PLACES) {
      for (const px of [1, 16, 48, 64, 4096]) {
        const z = bboxZoomForPx(place.bbox, px);
        expect(Number.isInteger(z)).toBe(true);
        expect(z).toBeGreaterThanOrEqual(0);
        expect(z).toBeLessThanOrEqual(REVEAL_CAP_ZOOM);
      }
    }
    expect(bboxZoomForPx([-180, -85, 180, 85], 16)).toBe(0);
    expect(bboxZoomForPx([5, 45, 5, 45], 48)).toBe(REVEAL_CAP_ZOOM);
  });
});

// The status line's probe (design-final §3.4): past z8 with no subregion of the
// focus country drawn, does the loaded data hold one in view that only the size
// rule hides? Then more zoom will draw it, and "none mapped here" would be wrong.
describe("sizeHiddenInView", () => {
  const k = revealK(64, 45.9313);
  const view: Bbox = [5.7, 45.5, 6.2, 45.9];
  const roussette = {
    properties: { key: "france.savoie.roussette-de-savoie", tier: 2, area: 0.02 }, // 62 px at z8
    geometry: { type: "Polygon", coordinates: [[[5.8, 45.6], [5.9, 45.6], [5.9, 45.7], [5.8, 45.6]]] },
  };
  const base = { view, tileZoom: 8, k, px: 64, visibleKeys: null };

  it("finds a place in view that only the size rule hides", () => {
    expect(revealPasses(roussette.properties, 8, k, 64)).toBe(false);
    expect(sizeHiddenInView({ ...base, features: [roussette] })).toBe(true);
  });

  it("ignores places the rule draws, regions, places out of view and grape-filtered ones", () => {
    expect(sizeHiddenInView({ ...base, tileZoom: 9, features: [roussette] })).toBe(false);
    expect(sizeHiddenInView({ ...base, px: 0, features: [roussette] })).toBe(false);
    expect(
      sizeHiddenInView({ ...base, features: [{ ...roussette, properties: { ...roussette.properties, tier: 1 } }] }),
    ).toBe(false);
    const away = { ...roussette, geometry: { type: "Point", coordinates: [3, 44] } };
    expect(sizeHiddenInView({ ...base, features: [away] })).toBe(false);
    expect(sizeHiddenInView({ ...base, visibleKeys: new Set(["other"]), features: [roussette] })).toBe(false);
    expect(
      sizeHiddenInView({ ...base, visibleKeys: new Set([roussette.properties.key]), features: [roussette] }),
    ).toBe(true);
  });

  it("counts a feature whose geometry it cannot read (it errs towards 'Zoom in')", () => {
    expect(sizeHiddenInView({ ...base, features: [{ ...roussette, geometry: null }] })).toBe(true);
    expect(sizeHiddenInView({ ...base, features: [{ properties: roussette.properties, geometry: { type: "Polygon", coordinates: [] } }] })).toBe(true);
  });

  it("handles multipolygons and a view that crosses the feature without holding a vertex", () => {
    const wide = {
      properties: roussette.properties,
      geometry: { type: "MultiPolygon", coordinates: [[[[5.0, 45.0], [7.0, 45.0], [7.0, 46.5], [5.0, 45.0]]]] },
    };
    expect(sizeHiddenInView({ ...base, features: [wide] })).toBe(true);
  });
});
