// The basemap swap (light Positron <-> dark Dark Matter) goes through
// map.setStyle(url, { diff: true, transformStyle }) with withWineLayers carrying
// our sources and layers across (docs/superpowers/specs/2026-09-19-map-dark-mode.md
// §6). These cases pin the pure half of that against the real Carto styles:
// the basemap tweaks agree between the two styles, the wine layers survive
// byte for byte, and MapLibre's own style diff emits no command naming them.
//
// Fixture: __fixtures__/carto-styles.json is a TRIMMED copy of both Carto style
// JSONs (retrieved 2026-09-19): top-level version/name/sprite/glyphs/sources
// plus any camera/projection/terrain/sky/light/transition/state key present
// (none are), per layer id/type/source/source-layer/minzoom/maxzoom/filter/
// layout, and paint only for background/landcover/landuse/water. To refresh it:
//
//   curl -o positron.json https://basemaps.cartocdn.com/gl/positron-gl-style/style.json
//   curl -o dark-matter.json https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json
//   node trim.mjs positron.json dark-matter.json src/lib/wine-map/__fixtures__/carto-styles.json
//
// where trim.mjs is:
//
//   import { readFileSync, writeFileSync } from "node:fs";
//   const [pos, dm, out] = process.argv.slice(2);
//   const TOP = ["version", "name", "sprite", "glyphs", "sources", "center", "zoom", "bearing",
//     "pitch", "roll", "projection", "terrain", "sky", "light", "transition", "state"];
//   const LAYER = ["id", "type", "source", "source-layer", "minzoom", "maxzoom", "filter", "layout"];
//   const PAINTED = new Set(["background", "landcover", "landuse", "water"]);
//   const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
//   const trim = (file) => {
//     const s = JSON.parse(readFileSync(file, "utf8"));
//     const layers = s.layers.map((l) => ({ ...pick(l, LAYER), ...(PAINTED.has(l.id) ? { paint: l.paint } : {}) }));
//     return { ...pick(s, TOP), layers };
//   };
//   const retrieved = new Date().toISOString().slice(0, 10);
//   writeFileSync(out, JSON.stringify({ retrieved, positron: trim(pos), darkMatter: trim(dm) }, null, 1) + "\n");
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// maplibre-gl's own style-spec dependency (hoisted): `diff` is the function
// Style.setState runs, validateStyleMin the validator it runs first.
import {
  diff,
  validateStyleMin,
  type LayerSpecification,
  type StyleSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import {
  BASEMAP_ORIGIN,
  BASEMAP_STYLE_URL,
  basemapTweaks,
  isWineSourceId,
  PLACE_LABEL_MIN_ZOOM,
  shardSourceId,
  tuneBasemapStyle,
  withWineLayers,
  WORLD_SOURCE_ID,
} from "./basemap";
import { englishTextFieldExpression } from "./localize-names";

const FIXTURE = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/lib/wine-map/__fixtures__/carto-styles.json"), "utf8"),
) as { retrieved: string; positron: StyleSpecification; darkMatter: StyleSpecification };
const { positron, darkMatter } = FIXTURE;

const PRUNED_IDS = [
  "aeroway-runway", "aeroway-taxiway", "building", "building-top", "poi_stadium",
  "poi_park", "roadname_minor", "roadname_sec", "roadname_pri", "roadname_major",
  "housenumber",
];
const PLACE_LABEL_IDS = [
  "place_hamlet", "place_suburbs", "place_villages", "place_town", "place_country_2",
  "place_country_1", "place_state", "place_continent", "place_city_r6", "place_city_r5",
  "place_city_dot_r7", "place_city_dot_r4", "place_city_dot_r2", "place_city_dot_z7",
  "place_capital_dot_z7",
];

const sourceLayerOf = (l: LayerSpecification) =>
  "source-layer" in l ? l["source-layer"] : undefined;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// A live style as MapLibre would serialize it mid-session: the tuned light
// basemap plus the world source and two shards, and seven of our layers in a
// deliberately unsorted order (world first, as they mount).
const WINE_SOURCES = {
  [WORLD_SOURCE_ID]: {
    type: "vector",
    url: "pmtiles://https://tiles.example.test/world.pmtiles",
    promoteId: "region",
  },
  [shardSourceId("bordeaux")]: {
    type: "vector",
    url: "pmtiles://https://tiles.example.test/bordeaux.pmtiles",
  },
  [shardSourceId("bourgogne")]: {
    type: "vector",
    url: "pmtiles://https://tiles.example.test/bourgogne.pmtiles",
  },
} as StyleSpecification["sources"];

const WINE_LAYERS = [
  {
    id: "world-fills",
    type: "fill",
    source: WORLD_SOURCE_ID,
    "source-layer": "places",
    maxzoom: 8,
    filter: ["==", ["get", "tier"], 0],
    layout: { visibility: "visible" },
    paint: {
      "fill-antialias": false,
      "fill-color": ["match", ["get", "region"], "bordeaux", "#5C1A2B", "#6B6257"],
      "fill-opacity": [
        "*",
        0.3,
        ["case", ["boolean", ["feature-state", "handed"], false], 0, 1],
      ],
    },
  },
  {
    id: "world-labels",
    type: "symbol",
    source: WORLD_SOURCE_ID,
    "source-layer": "labels",
    filter: ["boolean", true],
    layout: { "text-field": englishTextFieldExpression() },
    paint: { "text-color": "#2b0f18", "text-halo-color": "#FFFDF7", "text-halo-width": 1.7 },
  },
  {
    id: "shard-fills-bordeaux",
    type: "fill",
    source: shardSourceId("bordeaux"),
    "source-layer": "places",
    filter: [
      "any",
      ["==", ["get", "tier"], 0],
      ["in", ["get", "key"], ["literal", ["fr.bordeaux.medoc.pauillac", "fr.bordeaux"]]],
    ],
    layout: { visibility: "visible" },
    paint: { "fill-color": "#8C2D3C", "fill-opacity": 0.3 },
  },
  {
    id: "shard-outlines-bordeaux",
    type: "line",
    source: shardSourceId("bordeaux"),
    "source-layer": "places",
    paint: { "line-color": "#8C2D3C", "line-width": 1.5 },
  },
  {
    id: "shard-fills-bourgogne",
    type: "fill",
    source: shardSourceId("bourgogne"),
    "source-layer": "places",
    layout: { visibility: "none" },
    paint: { "fill-color": "#1F4E5F" },
  },
  {
    id: "shard-selected-ring-bordeaux",
    type: "line",
    source: shardSourceId("bordeaux"),
    "source-layer": "places",
    filter: ["==", ["get", "key"], "fr.bordeaux.medoc.pauillac"],
    paint: { "line-color": "#B78E42", "line-width": 2.5 },
  },
  {
    id: "shard-labels-bordeaux",
    type: "symbol",
    source: shardSourceId("bordeaux"),
    "source-layer": "labels",
    layout: { "text-field": ["get", "name"] },
    paint: { "text-color": "#2b0f18" },
  },
] as LayerSpecification[];

const WINE_IDS = [...Object.keys(WINE_SOURCES), ...WINE_LAYERS.map((l) => l.id)];

function liveStyle(basemap: StyleSpecification): StyleSpecification {
  const tuned = tuneBasemapStyle(basemap);
  return {
    ...tuned,
    sources: { ...tuned.sources, ...structuredClone(WINE_SOURCES) },
    layers: [...tuned.layers, ...structuredClone(WINE_LAYERS)],
  };
}

describe("the basemap URLs", () => {
  it("names Positron for light and Dark Matter for dark, both on the preconnected origin", () => {
    expect(BASEMAP_STYLE_URL.light).toBe(
      "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    );
    expect(BASEMAP_STYLE_URL.dark).toBe(
      "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    );
    for (const url of Object.values(BASEMAP_STYLE_URL)) {
      expect(new URL(url).origin).toBe(BASEMAP_ORIGIN);
    }
  });
});

describe("basemapTweaks", () => {
  it("prunes the same 11 layers and lifts the same 15 place labels in both styles", () => {
    const tweaks = basemapTweaks(positron.layers);
    expect(tweaks.remove).toEqual(PRUNED_IDS);
    expect(tweaks.zoomRanges.map((r) => r.id).sort()).toEqual([...PLACE_LABEL_IDS].sort());
    for (const range of tweaks.zoomRanges) {
      const original = positron.layers.find((l) => l.id === range.id)!;
      expect(range.minzoom).toBe(Math.max(PLACE_LABEL_MIN_ZOOM, original.minzoom ?? 0));
      expect(range.maxzoom).toBe(original.maxzoom ?? 24);
    }
    expect(basemapTweaks(darkMatter.layers)).toEqual(tweaks);
  });

  it("never touches one of our own layers", () => {
    expect(basemapTweaks(WINE_LAYERS)).toEqual({ remove: [], zoomRanges: [] });
  });
});

describe("tuneBasemapStyle", () => {
  it("drops the pruned layers and applies the ranges, without mutating its input", () => {
    const frozen = deepFreeze(structuredClone(positron));
    const tuned = tuneBasemapStyle(frozen);
    const pruned = new Set(["housenumber", "poi", "transportation_name", "aeroway", "building"]);
    expect(tuned.layers.some((l) => pruned.has(sourceLayerOf(l) ?? ""))).toBe(false);
    for (const range of basemapTweaks(positron.layers).zoomRanges) {
      const tunedLayer = tuned.layers.find((l) => l.id === range.id)!;
      expect(tunedLayer.minzoom).toBe(range.minzoom);
      expect(tunedLayer.maxzoom).toBe(range.maxzoom);
    }
    expect(frozen).toEqual(positron);
  });

  it("leaves both styles with the same 82 layer ids and the same sources, and no camera", () => {
    const [a, b] = [tuneBasemapStyle(positron), tuneBasemapStyle(darkMatter)];
    const ids = (s: StyleSpecification) => s.layers.map((l) => l.id).sort();
    expect(ids(a)).toHaveLength(82);
    expect(ids(b)).toEqual(ids(a));
    expect(b.sources).toEqual(a.sources);
    // A camera, projection, terrain or sky key in either style would move the
    // map or change its projection on a swap; neither style carries one.
    for (const style of [positron, darkMatter]) {
      for (const key of ["center", "zoom", "bearing", "pitch", "roll", "projection", "terrain", "sky"]) {
        expect(style, key).not.toHaveProperty(key);
      }
    }
  });
});

describe("isWineSourceId", () => {
  it("recognises the world archive and the shards, and nothing else", () => {
    expect(isWineSourceId("wine-world")).toBe(true);
    expect(isWineSourceId("wine-shard-bordeaux")).toBe(true);
    expect(isWineSourceId(shardSourceId("valle-d-aosta"))).toBe(true);
    expect(isWineSourceId("carto")).toBe(false);
    expect(isWineSourceId("wine-worldx")).toBe(false);
    expect(isWineSourceId("")).toBe(false);
  });
});

describe("withWineLayers", () => {
  it("adds our sources and layers to the incoming basemap, byte for byte, in prev order", () => {
    const prev = liveStyle(positron);
    const next = tuneBasemapStyle(darkMatter);
    const result = withWineLayers(prev, next);

    expect(result.sources.carto).toBe(next.sources.carto);
    for (const id of Object.keys(WINE_SOURCES)) {
      expect(result.sources[id]).toEqual(prev.sources[id]);
    }
    expect((result.sources[WORLD_SOURCE_ID] as { promoteId?: unknown }).promoteId).toBe("region");

    const wineInPrev = prev.layers.slice(next.layers.length);
    expect(wineInPrev.map((l) => l.id)).toEqual(WINE_LAYERS.map((l) => l.id));
    expect(result.layers).toEqual([...next.layers, ...wineInPrev]);
    const ids = result.layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Top-level fields other than sources/layers come from the incoming style.
    expect(result.sprite).toBe(darkMatter.sprite);
  });

  it("returns the incoming style unchanged when there is no previous style", () => {
    const next = tuneBasemapStyle(darkMatter);
    expect(withWineLayers(undefined, next)).toBe(next);
  });
});

describe("the style diff a swap produces", () => {
  const argsName = (args: unknown, id: string) => JSON.stringify(args).includes(JSON.stringify(id));

  it("light to dark: basemap ops only, not one naming a wine source or layer", () => {
    const prev = liveStyle(positron);
    const next = withWineLayers(prev, tuneBasemapStyle(darkMatter));
    const commands = diff(prev, next);
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      for (const id of WINE_IDS) {
        expect(argsName(command.args, id), `${command.command} names ${id}`).toBe(false);
      }
    }
    const names = new Set<string>(commands.map((c) => c.command));
    for (const forbidden of ["setStyle", "addSource", "removeSource", "setLayerZoomRange"]) {
      expect(names.has(forbidden), forbidden).toBe(false);
    }
    const moved = commands
      .filter((c) => c.command === "removeLayer" || c.command === "addLayer")
      .map((c) => {
        const first = c.args[0] as string | LayerSpecification;
        return typeof first === "string" ? first : first.id;
      });
    expect(new Set(moved)).toEqual(new Set(["waterway_label"]));
    expect(validateStyleMin(next)).toEqual([]);
  });

  it("dark to light: basemap layers may be re-added, wine ones never are", () => {
    const prev = withWineLayers(liveStyle(positron), tuneBasemapStyle(darkMatter));
    const next = withWineLayers(prev, tuneBasemapStyle(positron));
    const commands = diff(prev, next);
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      for (const id of WINE_IDS) {
        expect(argsName(command.args, id), `${command.command} names ${id}`).toBe(false);
      }
    }
    expect(validateStyleMin(next)).toEqual([]);
  });
});
