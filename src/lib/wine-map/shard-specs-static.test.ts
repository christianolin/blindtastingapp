// The static paint and layout builders against the per-selection builders they
// replace. Today's buildFillPaint, labelLayout and labelPaint (with the
// helpers they use) are copied below VERBATIM from tile-wine-map.tsx as it
// stood at cd9acd5, and serve as the oracle: for every fixture feature, every
// selection state, several zooms, ramp on and off and the world handoff on and
// off, the old expression (literal selectedKey/Id/ParentId baked in) and the
// new one (feature-state from selectionFeatureStates plus the wm_has_sel
// global) must evaluate to the same value — through the standalone style-spec
// AND the engine maplibre-gl ships. The one accepted difference, D4 (label size
// and collision order no longer move with the selection), is asserted as such.
import { describe, expect, it } from "vitest";
import {
  createExpression,
  featureFilter,
  latest,
  validateStyleMin,
  type StyleSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { bundledStyleEngine } from "../testing/bundled-style-engine";
import { englishTextFieldExpression } from "./localize-names";
import { MAP_PALETTES, type MapPalette } from "./map-palette";
import { desiredGlobalState } from "./map-state";
import { selectionFeatureStates } from "./selection-state";
import {
  selectedLabelLayout,
  selectedLabelPaint,
  selectedPlaceFilter,
  shardColorExpression,
  shardFilter,
  staticFillPaint,
  staticLabelLayout,
  staticLabelPaint,
  staticOutlinePaint,
  worldRegionColor,
} from "./shard-specs";
import { FIXTURE_PLACES, FIXTURE_TREE, fixturePlace, tileProps } from "./__fixtures__/place-tree";

// ---------------------------------------------------------------------------
// Oracle: tile-wine-map.tsx at cd9acd5, verbatim.
// ---------------------------------------------------------------------------
const WORLD_HANDED_FACTOR = [
  "case",
  ["boolean", ["feature-state", "handed"], false],
  0,
  1,
];
const classificationExpr = [
  "coalesce",
  ["get", "classification"],
  ["get", "level"],
  "",
];
function rampExpression(rampedRegions: string[]) {
  return rampedRegions.length
    ? ["match", ["coalesce", ["get", "region"], ""], rampedRegions, true, false]
    : false;
}
function buildFillPaint(
  selectedKey: string | null,
  selectedId: string | null,
  areaColor: string,
  rampedRegions: string[],
  hide: unknown[] | null,
) {
  const sel = ["==", ["get", "key"], selectedKey ?? ""];
  const child = ["==", ["get", "parent_id"], selectedId ?? "__none__"];
  const hasSelection = selectedKey !== null;
  // Focus wrapper per zoom stop: the selection pops, its direct children
  // keep full presence (you drill into them), everything else fades to
  // 45% of its normal opacity. The selected fill still relaxes at deep
  // zoom so children render readably on top of it.
  const focus = (selectedOpacity: number, base: unknown) => {
    const focused = hasSelection
      ? ["case", sel, selectedOpacity, child, base, ["*", base, 0.45]]
      : ["case", sel, selectedOpacity, base];
    return hide ? ["*", focused, hide] : focused;
  };
  return {
    // Every fill already has a dedicated `line` outline layer drawn over it,
    // so MapLibre's built-in fill antialiasing is a redundant second edge
    // pass per fill layer. Turning it off removes that pass outright; the
    // outline layer keeps edges crisp, so it reads the same.
    "fill-antialias": false,
    "fill-color": areaColor,
    "fill-opacity": [
      "let",
      "ramp",
      rampExpression(rampedRegions),
      [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        focus(0.6, ["min", 0.5, ["*", 0.16, ["get", "tier"]]]),
        9,
        // Classification intensity: grand cru plots read solid, premier cru
        // firm, village land a light wash — the darkness ramp IS the
        // classification signal (paired with the shaded fill hue). Where the
        // region's ramp is off every level sits at one uniform mid opacity.
        focus(0.3, [
          "match",
          classificationExpr,
          "grand_cru",
          ["case", ["var", "ramp"], 0.65, 0.4],
          "premier_cru",
          ["case", ["var", "ramp"], 0.45, 0.4],
          "communal",
          ["case", ["var", "ramp"], 0.18, 0.4],
          ["min", 0.5, ["*", 0.08, ["get", "tier"]]],
        ]),
      ],
    ] as unknown as number,
  };
}
function relatedExpression(
  selectedId: string | null,
  selectedParentId: string | null,
) {
  return [
    "any",
    ["==", ["get", "parent_id"], selectedId ?? "__none__"],
    ["==", ["get", "parent_id"], selectedParentId ?? "__none__"],
    ["==", ["get", "id"], selectedParentId ?? "__none__"],
  ];
}
const LABEL_TIER_SIZE = [
  "match", ["get", "tier"], 0, 16, 1, 15, 2, 13.5, 3, 12, 4, 11, 10,
];
function labelLayout(
  selectedKey: string | null,
  selectedId: string | null,
  selectedParentId: string | null,
  english: boolean,
) {
  const base = {
    "text-field": (english
      ? englishTextFieldExpression()
      : ["get", "name"]) as unknown as string,
    "text-transform": [
      "match", ["get", "tier"], 0, "uppercase", 1, "uppercase", "none",
    ] as unknown as "none",
    "text-letter-spacing": [
      "match", ["get", "tier"], 0, 0.1, 1, 0.08, 0.02,
    ] as unknown as number,
  };
  if (!selectedKey) {
    return {
      ...base,
      "text-size": LABEL_TIER_SIZE as unknown as number,
      "symbol-sort-key": ["-", 10, ["get", "tier"]] as unknown as number,
    };
  }
  const sel = ["==", ["get", "key"], selectedKey];
  const related = relatedExpression(selectedId, selectedParentId);
  return {
    ...base,
    "text-size": [
      "+", LABEL_TIER_SIZE, ["case", sel, 2.5, related, 0, -0.5],
    ] as unknown as number,
    "symbol-sort-key": [
      "case", sel, -2, related, -1, ["-", 10, ["get", "tier"]],
    ] as unknown as number,
  };
}
function labelPaint(
  selectedKey: string | null,
  selectedId: string | null,
  selectedParentId: string | null,
  palette: MapPalette,
) {
  const { label } = palette;
  if (!selectedKey) {
    return {
      "text-color": label.text,
      "text-opacity": 1 as unknown as number,
      "text-halo-color": label.halo,
      "text-halo-width": 1.7 as unknown as number,
    };
  }
  const sel = ["==", ["get", "key"], selectedKey];
  const related = relatedExpression(selectedId, selectedParentId);
  return {
    "text-color": [
      "case", sel, label.selected, related, label.related, label.distant,
    ] as unknown as string,
    "text-opacity": ["case", sel, 1, related, 0.95, 0.8] as unknown as number,
    "text-halo-color": label.halo,
    "text-halo-width": ["case", sel, 2.2, related, 1.7, 1.3] as unknown as number,
  };
}
// ---------------------------------------------------------------------------

type State = Record<string, unknown>;
type Evaluate = (zoom: number, props: Record<string, unknown>, featureState: State) => unknown;
type Engine = {
  name: string;
  compile(group: string, property: string, value: unknown, state: State): Evaluate;
};

function normalize(value: unknown): unknown {
  if (typeof value === "number") return Math.round(value * 1e6) / 1e6;
  // Color and Formatted both print their value.
  if (value !== null && typeof value === "object") return String(value);
  return value;
}

const standalone: Engine = {
  name: "standalone style-spec",
  compile(group, property, value, state) {
    const spec = (latest as unknown as Record<string, Record<string, unknown>>)[group][property];
    const parsed = createExpression(value, spec as never, state);
    if (parsed.result !== "success") throw new Error(`${property}: ${JSON.stringify(parsed.value)}`);
    const expression = parsed.value;
    return (zoom, props, featureState) =>
      normalize(expression.evaluate({ zoom }, { type: 3, properties: props } as never, featureState));
  },
};
const bundled: Engine = {
  name: "bundled maplibre-gl",
  compile(group, property, value, state) {
    const engine = bundledStyleEngine();
    const parsed = engine.createExpression(value, engine.v8Spec[group][property], state);
    if (parsed.result !== "success") throw new Error(`${property}: ${JSON.stringify(parsed.value)}`);
    const expression = parsed.value;
    return (zoom, props, featureState) =>
      normalize(expression.evaluate({ zoom }, { type: 3, properties: props }, featureState));
  },
};
const ENGINES = [standalone, bundled];

const ZOOMS = [5, 7, 9, 12];
const SHARD = "wine-shard-bourgogne";
const WORLD = "wine-world";
const SHARD_KEYS = FIXTURE_PLACES.map((p) => p.key).filter((key) => key.startsWith("france.bourgogne"));
const WORLD_KEYS = FIXTURE_PLACES.filter((p) => p.tier <= 1).map((p) => p.key);
const SELECTIONS: (string | null)[] = [
  null,
  "france",
  "france.bourgogne",
  "france.bourgogne.cote-de-nuits",
  "france.bourgogne.cote-de-nuits.vosne-romanee",
  "france.bourgogne.cote-de-nuits.vosne-romanee.la-tache",
  "italy.toscana",
];
// Every way "nothing selected" can reach the engine: never written, other
// names written but not this one (undefined in the bundled engine), false.
const NO_SELECTION: State[] = [{}, { wm_local: false, wm_keys: null }, { wm_has_sel: false }];

function oldIds(selectedKey: string | null) {
  if (!selectedKey) return { selectedId: null, selectedParentId: null };
  const place = fixturePlace(selectedKey);
  return {
    selectedId: place.id,
    selectedParentId: place.parent_key ? fixturePlace(place.parent_key).id : null,
  };
}

/** What the new layers see for one feature under one selection. */
function newInputs(selectedKey: string | null, source: string, key: string) {
  const states = selectionFeatureStates({ roots: FIXTURE_TREE, selectedKey, fallback: null });
  const id = source === WORLD ? (tileProps(key).region as string) : key;
  const featureState = { ...(states.get(source)?.get(id) ?? {}) } as State;
  const globals: State[] = selectedKey
    ? [desiredGlobalState({ visibleKeys: null, english: true, selectedKey, deepCountries: [], knownCountries: [] })]
    : NO_SELECTION;
  return { featureState, globals };
}

type Case = { source: string; keys: string[]; handed: boolean[] };
const CASES: Case[] = [
  { source: SHARD, keys: SHARD_KEYS, handed: [false] },
  { source: WORLD, keys: WORLD_KEYS, handed: [false, true] },
];

describe("staticFillPaint matches buildFillPaint", () => {
  for (const engine of ENGINES) {
    it(`${engine.name}: fill-opacity for every feature, selection, zoom, ramp and handoff`, () => {
      let checked = 0;
      for (const { source, keys, handed } of CASES) {
        const world = source === WORLD;
        for (const rampOn of world ? [false] : [false, true]) {
          const newPaint = staticFillPaint({ color: "#000000", ramp: rampOn, worldHandoff: world });
          for (const selectedKey of SELECTIONS) {
            const { selectedId } = oldIds(selectedKey);
            const oldPaint = buildFillPaint(
              selectedKey,
              selectedId,
              "#000000",
              rampOn ? ["bourgogne"] : [],
              world ? WORLD_HANDED_FACTOR : null,
            );
            const before = engine.compile("paint_fill", "fill-opacity", oldPaint["fill-opacity"], {});
            for (const key of keys) {
              const props = tileProps(key);
              const { featureState, globals } = newInputs(selectedKey, source, key);
              for (const state of globals) {
                const after = engine.compile("paint_fill", "fill-opacity", newPaint["fill-opacity"], state);
                for (const isHanded of handed) {
                  const fs = isHanded ? { ...featureState, handed: true } : featureState;
                  for (const zoom of ZOOMS) {
                    expect(after(zoom, props, fs), `${source} ${key} sel=${selectedKey} z${zoom} ramp=${rampOn} handed=${isHanded}`).toBe(
                      before(zoom, props, fs),
                    );
                    checked += 1;
                  }
                }
              }
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(500);
    });
  }

  it("keeps the fill colour it is given and drops the antialias pass", () => {
    const color = ["get", "anything"];
    const paint = staticFillPaint({ color, ramp: true, worldHandoff: false });
    expect(paint["fill-color"]).toBe(color);
    expect(paint["fill-antialias"]).toBe(false);
  });
});

describe("staticLabelPaint matches labelPaint", () => {
  const PROPS = ["text-color", "text-opacity", "text-halo-color", "text-halo-width"] as const;
  for (const engine of ENGINES) {
    for (const theme of ["light", "dark"] as const) {
      it(`${engine.name}, ${theme}: every label paint property`, () => {
        const palette = MAP_PALETTES[theme];
        for (const { source, keys, handed } of CASES) {
          const world = source === WORLD;
          const newPaint = staticLabelPaint({ palette, worldHandoff: world });
          for (const selectedKey of SELECTIONS) {
            const { selectedId, selectedParentId } = oldIds(selectedKey);
            const plain = labelPaint(selectedKey, selectedId, selectedParentId, palette);
            // World labels multiply opacity by the handoff factor (tile-wine-map.tsx worldLabelPaint).
            const oldPaint: Record<string, unknown> = world
              ? { ...plain, "text-opacity": ["*", plain["text-opacity"], WORLD_HANDED_FACTOR] }
              : plain;
            for (const property of PROPS) {
              const before = engine.compile("paint_symbol", property, oldPaint[property], {});
              for (const key of keys) {
                const props = tileProps(key);
                const { featureState, globals } = newInputs(selectedKey, source, key);
                for (const state of globals) {
                  const after = engine.compile("paint_symbol", property, newPaint[property], state);
                  for (const isHanded of handed) {
                    const fs = isHanded ? { ...featureState, handed: true } : featureState;
                    expect(after(9, props, fs), `${property} ${source} ${key} sel=${selectedKey} handed=${isHanded}`).toBe(
                      before(9, props, fs),
                    );
                  }
                }
              }
            }
          }
        }
      });
    }
  }

  it("the selected label paint is the old selected weight, hidden with its world region", () => {
    for (const engine of ENGINES) {
      for (const theme of ["light", "dark"] as const) {
        const palette = MAP_PALETTES[theme];
        const selected = labelPaint("france.bourgogne", "id-bourgogne", "id-france", palette);
        const shardPaint = selectedLabelPaint({ palette, worldHandoff: false });
        const worldPaint = selectedLabelPaint({ palette, worldHandoff: true });
        const props = tileProps("france.bourgogne");
        for (const property of ["text-color", "text-opacity", "text-halo-color", "text-halo-width"]) {
          const want = engine.compile("paint_symbol", property, selected[property as keyof typeof selected], {})(9, props, {});
          expect(engine.compile("paint_symbol", property, shardPaint[property], {})(9, props, {}), property).toBe(want);
          expect(engine.compile("paint_symbol", property, worldPaint[property], {})(9, props, {}), property).toBe(want);
        }
        const handedOpacity = engine.compile("paint_symbol", "text-opacity", worldPaint["text-opacity"], {});
        expect(handedOpacity(9, props, { handed: true })).toBe(0);
      }
    }
  });
});

describe("label layout (D4: selection no longer moves size or collision order)", () => {
  const LAYOUT_PROPS = ["text-size", "symbol-sort-key", "text-transform", "text-letter-spacing"] as const;

  it("every ordinary label keeps its no-selection layout under any selection", () => {
    for (const engine of ENGINES) {
      const layout = staticLabelLayout();
      const noSelection = labelLayout(null, null, null, true);
      for (const property of LAYOUT_PROPS) {
        const after = engine.compile("layout_symbol", property, layout[property], {});
        const before = engine.compile("layout_symbol", property, noSelection[property], {});
        for (const key of [...SHARD_KEYS, ...WORLD_KEYS]) {
          expect(after(9, tileProps(key), {}), `${property} ${key}`).toBe(before(9, tileProps(key), {}));
        }
      }
    }
  });

  it("the selected label layer carries exactly the old selected size and sort key", () => {
    for (const engine of ENGINES) {
      const layout = selectedLabelLayout();
      for (const selectedKey of SELECTIONS.filter((k): k is string => k !== null)) {
        const { selectedId, selectedParentId } = oldIds(selectedKey);
        const old = labelLayout(selectedKey, selectedId, selectedParentId, true);
        const props = tileProps(selectedKey);
        for (const property of LAYOUT_PROPS) {
          const want = engine.compile("layout_symbol", property, old[property], {})(9, props, {});
          expect(engine.compile("layout_symbol", property, layout[property], {})(9, props, {}), `${property} ${selectedKey}`).toBe(want);
        }
      }
    }
  });

  it("what D4 changes, pinned: a distant label no longer shrinks or drops back", () => {
    const selectedKey = "france.bourgogne.cote-de-nuits.vosne-romanee";
    const { selectedId, selectedParentId } = oldIds(selectedKey);
    const old = labelLayout(selectedKey, selectedId, selectedParentId, true);
    const layout = staticLabelLayout();
    const distant = tileProps("france.bourgogne.cote-de-beaune.meursault");
    const size = (value: unknown) => standalone.compile("layout_symbol", "text-size", value, {})(9, distant, {});
    const sort = (value: unknown) => standalone.compile("layout_symbol", "symbol-sort-key", value, {})(9, distant, {});
    expect(size(old["text-size"])).toBe(11.5);
    expect(size(layout["text-size"])).toBe(12);
    expect(sort(old["symbol-sort-key"])).toBe(7);
    expect(sort(layout["symbol-sort-key"])).toBe(7);
    const related = tileProps("france.bourgogne.cote-de-nuits.gevrey-chambertin");
    const sortRelated = (value: unknown) =>
      standalone.compile("layout_symbol", "symbol-sort-key", value, {})(9, related, {});
    expect(sortRelated(old["symbol-sort-key"])).toBe(-1);
    expect(sortRelated(layout["symbol-sort-key"])).toBe(7);
  });

  it("text-field follows wm_local exactly as labelLayout followed `english`", () => {
    for (const engine of ENGINES) {
      const field = staticLabelLayout()["text-field"];
      for (const english of [true, false]) {
        const before = engine.compile("layout_symbol", "text-field", labelLayout(null, null, null, english)["text-field"], {});
        const after = engine.compile("layout_symbol", "text-field", field, { wm_local: !english });
        for (const name of ["Bourgogne", "Toscana", "Italia", "Meursault"]) {
          expect(after(9, { name }, {}), `${name} english=${english}`).toBe(before(9, { name }, {}));
        }
      }
    }
  });
});

describe("staticOutlinePaint", () => {
  it("is today's outline paint, with the handoff factor on the world copy only", () => {
    const color = worldRegionColor(MAP_PALETTES.light);
    expect(staticOutlinePaint({ color, worldHandoff: false })).toEqual({
      "line-color": color,
      "line-width": ["min", 2, ["+", 0.5, ["*", 0.4, ["get", "tier"]]]],
    });
    expect(staticOutlinePaint({ color, worldHandoff: true })).toEqual({
      "line-color": color,
      "line-width": ["min", 2, ["+", 0.5, ["*", 0.4, ["get", "tier"]]]],
      "line-opacity": WORLD_HANDED_FACTOR,
    });
  });
});

describe("the builders make a valid style", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`${theme}: validateStyleMin accepts every builder output`, () => {
      const palette = MAP_PALETTES[theme];
      const worldColor = worldRegionColor(palette);
      const shardColor = shardColorExpression({
        region: "bourgogne",
        areaSlugs: ["cote-de-nuits", "vosne-romanee", "meursault"],
        ramp: true,
        palette,
      });
      const layer = (id: string, type: string, source: string, sourceLayer: string, rest: object) => ({
        id,
        type,
        source,
        "source-layer": sourceLayer,
        ...rest,
      });
      const style = {
        version: 8,
        glyphs: "https://example.test/{fontstack}/{range}.pbf",
        sources: {
          [WORLD]: { type: "vector", url: "pmtiles://tiles.test/world.pmtiles", promoteId: "region" },
          [SHARD]: { type: "vector", url: "pmtiles://tiles.test/bourgogne.pmtiles", promoteId: "key" },
        },
        layers: [
          layer("world-region-fills", "fill", WORLD, "places", {
            filter: shardFilter(null),
            paint: staticFillPaint({ color: worldColor, ramp: false, worldHandoff: true }),
          }),
          layer("world-region-outlines", "line", WORLD, "places", {
            paint: staticOutlinePaint({ color: worldColor, worldHandoff: true }),
          }),
          layer("world-selected-ring", "line", WORLD, "places", { filter: selectedPlaceFilter() }),
          layer("world-labels", "symbol", WORLD, "labels", {
            layout: staticLabelLayout(),
            paint: staticLabelPaint({ palette, worldHandoff: true }),
          }),
          layer("world-selected-label", "symbol", WORLD, "labels", {
            filter: selectedPlaceFilter(),
            layout: selectedLabelLayout(),
            paint: selectedLabelPaint({ palette, worldHandoff: true }),
          }),
          layer("shard-fills-bourgogne", "fill", SHARD, "places", {
            filter: shardFilter("france"),
            paint: staticFillPaint({ color: shardColor, ramp: true, worldHandoff: false }),
          }),
          layer("shard-outlines-bourgogne", "line", SHARD, "places", {
            filter: shardFilter("france"),
            paint: staticOutlinePaint({ color: shardColor, worldHandoff: false }),
          }),
          layer("shard-labels-bourgogne", "symbol", SHARD, "labels", {
            filter: shardFilter("france"),
            layout: staticLabelLayout(),
            paint: staticLabelPaint({ palette, worldHandoff: false }),
          }),
          layer("shard-selected-label-bourgogne", "symbol", SHARD, "labels", {
            filter: selectedPlaceFilter(),
            layout: selectedLabelLayout(),
            paint: selectedLabelPaint({ palette, worldHandoff: false }),
          }),
        ],
      } as unknown as StyleSpecification;
      expect(validateStyleMin(style)).toEqual([]);
    });
  }
});

describe("the filters", () => {
  type Filter = (props: Record<string, unknown>) => boolean;
  const FILTER_ENGINES: { name: string; compile(filter: unknown, state: State): Filter }[] = [
    {
      name: "standalone style-spec",
      compile: (filter, state) => {
        const compiled = featureFilter(filter as never, state);
        return (props) => compiled.filter({ zoom: 9 }, { type: 3, properties: props } as never);
      },
    },
    {
      name: "bundled maplibre-gl",
      compile: (filter, state) => {
        const compiled = bundledStyleEngine().featureFilter(filter, state);
        return (props) => compiled.filter({ zoom: 9 }, { type: 3, properties: props });
      },
    },
  ];

  it("shardFilter: an unknown country keeps full depth; a known one follows its flag", () => {
    const deep = tileProps("france.bourgogne.cote-de-nuits.vosne-romanee");
    for (const engine of FILTER_ENGINES) {
      expect(engine.compile(shardFilter(null), {})(deep), engine.name).toBe(true);
      expect(engine.compile(shardFilter("france"), { wm_local: true })(deep), engine.name).toBe(false);
      expect(engine.compile(shardFilter("france"), { wm_deep_france: true })(deep), engine.name).toBe(true);
      expect(engine.compile(shardFilter("france"), {})(tileProps("france.bourgogne")), engine.name).toBe(true);
    }
  });

  it("selectedPlaceFilter: only the selected key, and never a keyless feature", () => {
    const key = "france.bourgogne.cote-de-nuits";
    for (const engine of FILTER_ENGINES) {
      const on = engine.compile(selectedPlaceFilter(), { wm_sel_key: key, wm_keys: null });
      expect(on(tileProps(key)), engine.name).toBe(true);
      expect(on(tileProps("france.bourgogne")), engine.name).toBe(false);
      for (const state of [{}, { wm_sel_key: null }, { wm_local: true }]) {
        const off = engine.compile(selectedPlaceFilter(), state);
        const label = `${engine.name} ${JSON.stringify(state)}`;
        expect(off({ tier: 3 }), label).toBe(false);
        expect(off({ key: null, tier: 3 }), label).toBe(false);
        expect(off(tileProps(key)), label).toBe(false);
      }
    }
  });

  it("selectedPlaceFilter: the grape gate can hide the ring", () => {
    const key = "france.bourgogne.cote-de-nuits";
    const hidden = FILTER_ENGINES[0].compile(selectedPlaceFilter(), {
      wm_sel_key: key,
      wm_keys: { "france.bourgogne": true },
    });
    expect(hidden(tileProps(key))).toBe(false);
  });
});
