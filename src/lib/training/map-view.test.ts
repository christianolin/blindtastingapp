import { validateStyleMin, type StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";
import { MAP_PALETTES } from "../wine-map/map-palette";
import { arch } from "./__fixtures__/archetypes";
import { stripLine } from "./copy";
import {
  CAMERA_REACH_DEG,
  CAMERA_SET_MAX,
  CAMERA_SETTLE_MS,
  DOT_LAYOUT,
  EUROPE_BOX,
  FIT_MAX_ZOOM,
  FIT_MIN_SPAN_DEG,
  HEAT_STOPS,
  LABEL_ALL_ZOOM,
  LABEL_COUNT,
  LABEL_FILTER,
  cameraKey,
  cameraTarget,
  chooserOrder,
  closeSet,
  closestSpots,
  dotPaint,
  featuresFingerprint,
  fitSet,
  heatOf,
  hoverLabel,
  labelLayout,
  labelPaint,
  labelledPositions,
  shouldAutoFit,
  trainingFeatures,
  unmappedCandidates,
} from "./map-view";
import type { CapReason, MapPoint, RankedCandidate, TrainingCandidate } from "./types";

// The likelihood map's pure rules (training-room-map spec RM12-RM18, RM26, §11).

/** A fixture wine given a dot. */
function at(key: string, lon: number, lat: number, source: MapPoint["source"] = "place"): TrainingCandidate {
  return { ...arch(key), mapPoint: { lon, lat, source } };
}

function rc(c: TrainingCandidate, closeness: number | null, capped: CapReason | null = null): RankedCandidate {
  return {
    candidate: c,
    closeness,
    capped,
    explanation: null,
    signatureHits: [],
  };
}

// Real label points, roughly (spec §2, §7).
const MARGAUX = at("margaux", -0.67, 45.04);
const COTE_ROTIE = at("cote-rotie", 4.78, 45.49);
const CDP = at("cdp", 4.83, 44.06);
const BANDOL = at("bandol", 5.75, 43.14);
const ALSACE: [number, number] = [7.3, 48.1];
const ALSACE_RIESLING = at("alsace-riesling", ...ALSACE);
const STACK_B = at("sancerre", ...ALSACE);
const STACK_C = at("chablis", ...ALSACE);
const BAROSSA = at("vosne", 138.96, -34.52, "curated");
const OFF_MAP = arch("champagne"); // mapPoint null

describe("constants (spec RM13, RM15, RM17, RM18)", () => {
  it("are the spec's values", () => {
    expect(HEAT_STOPS).toEqual([0.5, 0.75, 0.9, 1]);
    expect(LABEL_COUNT).toBe(3);
    expect(LABEL_ALL_ZOOM).toBe(7);
    expect(EUROPE_BOX).toEqual([-10, 35.5, 27, 52.5]);
    expect(FIT_MAX_ZOOM).toBe(10);
    expect(FIT_MIN_SPAN_DEG).toBe(0.6);
    expect(CAMERA_SET_MAX).toBe(12);
    expect(CAMERA_REACH_DEG).toBe(25);
    expect(CAMERA_SETTLE_MS).toBe(600);
  });
});

describe("heatOf (RM13)", () => {
  it("is null without a closeness", () => {
    expect(heatOf(null, 90)).toBeNull();
    expect(heatOf(null, null)).toBeNull();
  });
  it("is 0 with no leader, or a leader at 0", () => {
    expect(heatOf(40, null)).toBe(0);
    expect(heatOf(0, 0)).toBe(0);
    expect(heatOf(10, -5)).toBe(0);
  });
  it("is linear in the leader's closeness", () => {
    expect(heatOf(90, 90)).toBe(1);
    expect(heatOf(45, 90)).toBe(0.5);
    expect(heatOf(35, 35)).toBe(1); // a 35 % leader is as hot as a 95 % one (risk X1)
    expect(heatOf(81, 90)).toBeCloseTo(0.9);
  });
});

describe("labelledPositions (RM15)", () => {
  it("one label per spot: its best-ranked uncapped wine with a number, +n for the others there", () => {
    const ranked = [
      rc(ALSACE_RIESLING, 88),
      rc(MARGAUX, 80),
      rc(STACK_B, 70),
      rc(COTE_ROTIE, 60),
      rc(STACK_C, 10, "colour"),
    ];
    const spots = [...labelledPositions(ranked).values()];
    expect(spots.map((s) => [s.text, s.rank])).toEqual([
      ["Alsace Riesling 88 % +2", 1],
      ["Margaux 80 %", 2],
      ["Côte-Rôtie 60 %", 3],
    ]);
    expect(spots[0].ids).toEqual(["arch-alsace-riesling", "arch-sancerre", "arch-chablis"]);
    expect(spots[0]).toMatchObject({
      id: "arch-alsace-riesling",
      lon: 7.3,
      lat: 48.1,
    });
  });

  it("a spot whose wines are all ruled out, or not yet measured, has no label", () => {
    const ranked = [rc(MARGAUX, 80), rc(COTE_ROTIE, null), rc(BANDOL, 12, "colour")];
    expect([...labelledPositions(ranked).keys()]).toEqual(["-0.67,45.04"]);
  });

  it("ranks run past three; closestSpots keeps the first three", () => {
    const ranked = [rc(MARGAUX, 90), rc(COTE_ROTIE, 85), rc(CDP, 84), rc(BANDOL, 83), rc(ALSACE_RIESLING, 70)];
    expect([...labelledPositions(ranked).values()].map((s) => s.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(closestSpots(ranked).map((s) => s.text)).toEqual([
      "Margaux 90 %",
      "Côte-Rôtie 85 %",
      "Châteauneuf-du-Pape 84 %",
    ]);
  });

  it("no answers, no labels", () => {
    expect(labelledPositions([rc(MARGAUX, null), rc(CDP, null)]).size).toBe(0);
  });
});

describe("trainingFeatures (RM12, RM13, RM15)", () => {
  it("one feature per wine with a dot, in ranking order; a wine with no dot has none", () => {
    const fc = trainingFeatures([rc(MARGAUX, 90), rc(OFF_MAP, 80), rc(BAROSSA, 45)]);
    expect(fc.features.map((f) => f.properties.id)).toEqual(["arch-margaux", "arch-vosne"]);
    expect(fc.features[1].geometry).toEqual({
      type: "Point",
      coordinates: [138.96, -34.52],
    });
  });

  it("scored: heat relative to the leader (2 dp), sort = heat; the label and rank on the carrier only", () => {
    const fc = trainingFeatures([rc(ALSACE_RIESLING, 90), rc(STACK_B, 60), rc(MARGAUX, 30)]);
    const [a, b, m] = fc.features.map((f) => f.properties);
    expect(a).toEqual({
      id: "arch-alsace-riesling",
      state: "scored",
      heat: 1,
      label: "Alsace Riesling 90 % +1",
      rank: 1,
      sort: 1,
    });
    expect(b).toEqual({
      id: "arch-sancerre",
      state: "scored",
      heat: 0.67,
      label: "",
      rank: 0,
      sort: 0.67,
    });
    expect(m).toEqual({
      id: "arch-margaux",
      state: "scored",
      heat: 0.33,
      label: "Margaux 30 %",
      rank: 2,
      sort: 0.33,
    });
  });

  it("a capped wine is a ring whatever its capped closeness; before any answer every dot is neutral", () => {
    const capped = trainingFeatures([rc(MARGAUX, 50), rc(CDP, 15, "colour")]).features[1].properties;
    expect(capped).toEqual({
      id: "arch-cdp",
      state: "capped",
      heat: 0,
      label: "",
      rank: 0,
      sort: -1,
    });
    const before = trainingFeatures([rc(MARGAUX, null), rc(CDP, null)]).features.map((f) => f.properties);
    for (const p of before)
      expect(p).toMatchObject({
        state: "neutral",
        heat: 0,
        label: "",
        rank: 0,
        sort: -0.5,
      });
  });
});

describe("featuresFingerprint (RM16)", () => {
  const base = [rc(MARGAUX, 90), rc(CDP, 60), rc(BANDOL, 15, "colour")];
  it("is stable for the same ranking", () => {
    expect(featuresFingerprint(trainingFeatures(base))).toBe(featuresFingerprint(trainingFeatures([...base])));
  });
  it("changes with a heat, a label, a rank or a cap", () => {
    const fp = featuresFingerprint(trainingFeatures(base));
    expect(featuresFingerprint(trainingFeatures([rc(MARGAUX, 90), rc(CDP, 50), rc(BANDOL, 15, "colour")]))).not.toBe(
      fp,
    );
    expect(featuresFingerprint(trainingFeatures([rc(MARGAUX, 91), rc(CDP, 60), rc(BANDOL, 15, "colour")]))).not.toBe(
      fp,
    );
    expect(featuresFingerprint(trainingFeatures([rc(CDP, 90), rc(MARGAUX, 60), rc(BANDOL, 15, "colour")]))).not.toBe(
      fp,
    );
    expect(featuresFingerprint(trainingFeatures([rc(MARGAUX, 90), rc(CDP, 60), rc(BANDOL, 15)]))).not.toBe(fp);
  });
});

describe("closeSet (RM17)", () => {
  it("is the leader plus stripLine's 'N more close'", () => {
    const ranked = [rc(MARGAUX, 91), rc(COTE_ROTIE, 85), rc(BANDOL, 81), rc(CDP, 80), rc(STACK_C, 15, "colour")];
    expect(stripLine(ranked)).toBe("Top match: Bordeaux · Margaux 91 % · 2 more close");
    expect(closeSet(ranked).map((r) => r.candidate.id)).toEqual(["arch-margaux", "arch-cote-rotie", "arch-bandol"]);
  });
  it("is empty with no leader", () => {
    expect(closeSet([rc(MARGAUX, null)])).toEqual([]);
    expect(closeSet([rc(MARGAUX, 12, "colour")])).toEqual([]);
  });
});

describe("fitSet and cameraTarget (RM17)", () => {
  it("before any answer, and when everything is ruled out: Europe", () => {
    expect(cameraTarget([rc(MARGAUX, null), rc(BAROSSA, null)])).toEqual({
      box: EUROPE_BOX,
      maxZoom: 10,
    });
    expect(cameraTarget([rc(MARGAUX, 12, "colour")])).toEqual({
      box: EUROPE_BOX,
      maxZoom: 10,
    });
    expect(cameraKey([rc(MARGAUX, null)])).toBe("europe");
  });

  it("after answers: the fit set's box, at most maxZoom 10", () => {
    const target = cameraTarget([rc(MARGAUX, 90), rc(CDP, 85), rc(COTE_ROTIE, 70)]);
    expect(target).toEqual({ box: [-0.67, 44.06, 4.83, 45.04], maxZoom: 10 });
  });

  it("drops a far curated point (Barossa) when the leader is in Europe", () => {
    const ranked = [rc(MARGAUX, 90), rc(BAROSSA, 88), rc(CDP, 85)];
    expect(fitSet(ranked).map((r) => r.candidate.id)).toEqual(["arch-margaux", "arch-cdp"]);
    expect(cameraTarget(ranked)?.box).toEqual([-0.67, 44.06, 4.83, 45.04]);
  });

  it("fits at most CAMERA_SET_MAX wines", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      rc({ ...at("margaux", i * 0.1, 45), id: `w${String(i).padStart(2, "0")}` }, 95 - i * 0.1),
    );
    expect(fitSet(many)).toHaveLength(CAMERA_SET_MAX);
    expect(fitSet(many)[0].candidate.id).toBe("w00");
  });

  it("pads a single spot by FIT_MIN_SPAN_DEG each way (a stack is one spot)", () => {
    expect(cameraTarget([rc(ALSACE_RIESLING, 90), rc(STACK_B, 88), rc(MARGAUX, 20)])?.box).toEqual([
      7.3 - 0.6,
      48.1 - 0.6,
      7.3 + 0.6,
      48.1 + 0.6,
    ]);
  });

  it("is null when the close set has no dot: the camera stays", () => {
    expect(cameraTarget([rc(OFF_MAP, 90), rc(MARGAUX, 40)])).toBeNull();
    expect(cameraKey([rc(OFF_MAP, 90), rc(MARGAUX, 40)])).toBe("");
  });

  it("cameraKey follows membership, not order or numbers", () => {
    const a = cameraKey([rc(MARGAUX, 90), rc(CDP, 85)]);
    expect(cameraKey([rc(CDP, 91), rc(MARGAUX, 84)])).toBe(a);
    expect(cameraKey([rc(MARGAUX, 90), rc(CDP, 70)])).not.toBe(a);
  });
});

describe("shouldAutoFit (RM17)", () => {
  it("waits CAMERA_SETTLE_MS after the membership last changed", () => {
    expect(shouldAutoFit({ userMoved: false, membershipChangedAt: 1000, now: 1599 })).toBe(false);
    expect(shouldAutoFit({ userMoved: false, membershipChangedAt: 1000, now: 1600 })).toBe(true);
  });
  it("never after the viewer moved the map", () => {
    expect(shouldAutoFit({ userMoved: true, membershipChangedAt: 0, now: 99_999 })).toBe(false);
  });
});

describe("a tap and a hover (RM15, RM18)", () => {
  const ranked = [rc(ALSACE_RIESLING, 88), rc(MARGAUX, 80), rc(STACK_B, 70), rc(STACK_C, 10, "colour")];
  it("chooserOrder follows ranking order, each wine once", () => {
    const ids = chooserOrder(["arch-chablis", "arch-alsace-riesling", "arch-sancerre", "arch-chablis"], ranked);
    expect(ids.map((r) => r.candidate.id)).toEqual(["arch-alsace-riesling", "arch-sancerre", "arch-chablis"]);
  });
  it("hoverLabel is the best hit's label text, +n for the other hits; null for none", () => {
    expect(hoverLabel(["arch-sancerre", "arch-alsace-riesling", "arch-chablis"], ranked)).toBe(
      "Alsace Riesling 88 % +2",
    );
    expect(hoverLabel(["arch-margaux"], ranked)).toBe("Margaux 80 %");
    expect(hoverLabel(["arch-chablis"], ranked)).toBe("Chablis 10 %");
    expect(hoverLabel([], ranked)).toBeNull();
  });
});

describe("unmappedCandidates (RM12)", () => {
  it("lists the wines with no dot at all, in the order given", () => {
    expect(unmappedCandidates([MARGAUX, OFF_MAP, BAROSSA, arch("bandol")]).map((c) => c.id)).toEqual([
      "arch-champagne",
      "arch-bandol",
    ]);
  });
});

describe("the MapLibre expressions (RM13-RM15)", () => {
  it("validate as a style in both themes", () => {
    for (const palette of [MAP_PALETTES.light, MAP_PALETTES.dark]) {
      const style = {
        version: 8,
        glyphs: "https://example.test/{fontstack}/{range}.pbf",
        sources: {
          "wine-training": {
            type: "geojson",
            data: trainingFeatures([rc(MARGAUX, 90)]),
            promoteId: "id",
          },
        },
        layers: [
          {
            id: "training-dots",
            type: "circle",
            source: "wine-training",
            layout: DOT_LAYOUT,
            paint: dotPaint(palette),
          },
          {
            id: "training-labels",
            type: "symbol",
            source: "wine-training",
            filter: LABEL_FILTER,
            layout: labelLayout(),
            paint: labelPaint(palette),
          },
        ],
      } as unknown as StyleSpecification;
      expect(validateStyleMin(style)).toEqual([]);
    }
  });

  it("colour the stops from the palette's heat block, and ring a capped wine", () => {
    const paint = dotPaint(MAP_PALETTES.light) as Record<string, unknown>;
    const color = JSON.stringify(paint["circle-color"]);
    for (const stop of MAP_PALETTES.light.heat.stops) expect(color).toContain(stop);
    expect(color).toContain(MAP_PALETTES.light.heat.capped);
    expect(paint["circle-opacity"]).toEqual(["case", ["==", ["get", "state"], "capped"], 0, 1]);
    expect(JSON.stringify(paint["circle-stroke-color"])).toContain(MAP_PALETTES.light.selectedRing);
  });

  it("label the top three at every zoom and the rest from z7", () => {
    const layout = labelLayout() as Record<string, unknown>;
    expect(layout["text-field"]).toEqual([
      "step",
      ["zoom"],
      ["case", ["<=", ["get", "rank"], 3], ["get", "label"], ""],
      7,
      ["get", "label"],
    ]);
    expect(layout["symbol-sort-key"]).toEqual(["get", "rank"]);
    expect(layout["text-variable-anchor"]).toEqual(["right", "left", "top", "bottom"]);
    expect(layout["text-allow-overlap"]).toBeUndefined();
  });
});
