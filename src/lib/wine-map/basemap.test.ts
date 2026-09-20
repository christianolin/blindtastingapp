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
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  BASEMAP_ROAD_MIN_ZOOM,
  BASEMAP_ROAD_SOURCE_LAYER,
  BASEMAP_STYLE_URL,
  basemapTweaks,
  cachedBasemapStyle,
  isWineSourceId,
  loadBasemapStyle,
  PLACE_LABEL_MIN_ZOOM,
  PRUNED_BASEMAP_SOURCE_LAYERS,
  REMOVED_BASEMAP_LAYER_IDS,
  resetBasemapStyleCache,
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

// The 11 layers the source-layer rule drops (street numbers, POIs, road-name
// labels, runways, buildings).
const PRUNED_IDS = [
  "aeroway-runway", "aeroway-taxiway", "building", "building-top", "poi_stadium",
  "poi_park", "roadname_minor", "roadname_sec", "roadname_pri", "roadname_major",
  "housenumber",
];
// The 9 the id rule drops: the motorway/trunk/primary ramps, the two rail
// cross-hatch layers and the cemetery/stadium fill (2026-09-20 performance
// round). Everything else on `transportation` — every tunnel, every service
// road, the path/track layers — is ZOOM-GATED instead of removed: see the
// brunnel-family case below for why deleting the tunnel half of a road breaks
// the surface half, and BASEMAP_ROAD_MIN_ZOOM for why gating costs the tile
// worker exactly what deleting costs at the gated zooms.
const REMOVED_IDS = [
  "road_pri_case_ramp", "road_trunk_case_ramp", "road_mot_case_ramp",
  "road_pri_fill_ramp", "road_trunk_fill_ramp", "road_mot_fill_ramp",
  "rail_dash", "tunnel_rail_dash", "landuse",
];
// The 5 the PLACE LABEL FLOOR drops rather than gates, because z7 reaches or
// passes their own maxzoom: place_country_1 (z2-7), place_continent (z0-2) and
// the three small-city dots (z4-7, z5-7, z6-7). MapLibre hides a layer at
// `zoom >= maxzoom`, so after the floor none of them can draw at ANY zoom —
// removing them is invisible, and keeps five dead layers out of every style
// diff and every serialize. Nothing here is a judgement about place labels:
// move PLACE_LABEL_MIN_ZOOM and the rule re-decides which ones qualify.
const DEAD_UNDER_FLOOR_IDS = [
  "place_country_1", "place_continent",
  "place_city_dot_r7", "place_city_dot_r4", "place_city_dot_r2",
];
// All three rules together, in the order the styles list them — which is the
// order basemapTweaks reports, and it is the same order in both styles.
const ALL_REMOVED_IDS = [
  "landuse", "aeroway-runway", "aeroway-taxiway", "tunnel_rail_dash",
  "road_pri_case_ramp", "road_trunk_case_ramp", "road_mot_case_ramp",
  "road_pri_fill_ramp", "road_trunk_fill_ramp", "road_mot_fill_ramp", "rail_dash",
  "building", "building-top",
  "place_country_1", "place_continent",
  "place_city_dot_r7", "place_city_dot_r4", "place_city_dot_r2",
  "poi_stadium", "poi_park", "roadname_minor",
  "roadname_sec", "roadname_pri", "roadname_major", "housenumber",
];
// The 41 transportation layers that survive, every one gated to z10+.
const ROAD_IDS = [
  "tunnel_service_case", "tunnel_minor_case", "tunnel_sec_case", "tunnel_pri_case",
  "tunnel_trunk_case", "tunnel_mot_case", "tunnel_path", "tunnel_service_fill",
  "tunnel_minor_fill", "tunnel_sec_fill", "tunnel_pri_fill", "tunnel_trunk_fill",
  "tunnel_mot_fill", "tunnel_rail",
  "road_service_case", "road_minor_case", "road_sec_case_noramp",
  "road_pri_case_noramp", "road_trunk_case_noramp", "road_mot_case_noramp",
  "road_path", "road_service_fill", "road_minor_fill", "road_sec_fill_noramp",
  "road_pri_fill_noramp", "road_trunk_fill_noramp", "road_mot_fill_noramp", "rail",
  "bridge_service_case", "bridge_minor_case", "bridge_sec_case", "bridge_pri_case",
  "bridge_trunk_case", "bridge_mot_case", "bridge_path", "bridge_service_fill",
  "bridge_minor_fill", "bridge_sec_fill", "bridge_pri_fill", "bridge_trunk_fill",
  "bridge_mot_fill",
];
// The nine of those the gate actually moves, and where they started. Carto
// draws a road's casing two or three zooms before its fill, so these are what
// used to put motorways and trunk roads on a country-zoom wine map.
const ROAD_REZONED: [string, number][] = [
  ["road_pri_case_noramp", 7], ["road_trunk_case_noramp", 5], ["road_mot_case_noramp", 5],
  ["bridge_pri_case", 8], ["bridge_trunk_case", 5], ["bridge_mot_case", 5],
  ["tunnel_pri_case", 8], ["tunnel_trunk_case", 5], ["tunnel_mot_case", 5],
];
// The six layers Carto itself already starts at z15, which the tile worker
// therefore never touches below z15 — so removing them would buy nothing at
// any zoom the baseline measured, and would cost the only ground reference
// the deepest zoom has. `road_path`'s filter is ["in","class","path","track"]:
// `track` is the OSM class for vineyard access roads, and `service` is the
// lanes between parcels. All six are kept, gated by their own minzoom.
const VILLAGE_ZOOM_ROAD_IDS = [
  "road_service_case", "road_service_fill", "road_path",
  "bridge_service_case", "bridge_service_fill", "bridge_path",
];
const PLACE_LABEL_IDS = [
  "place_hamlet", "place_suburbs", "place_villages", "place_town", "place_country_2",
  "place_country_1", "place_state", "place_continent", "place_city_r6", "place_city_r5",
  "place_city_dot_r7", "place_city_dot_r4", "place_city_dot_r2", "place_city_dot_z7",
  "place_capital_dot_z7",
];
// The two of those the z7 floor MOVES, and where they started. Eight already
// start at z7 or later and are left alone entirely; the remaining five have a
// maxzoom the floor reaches, so they are removed instead (DEAD_UNDER_FLOOR_IDS).
const PLACE_LABEL_REZONED: [string, number][] = [
  ["place_country_2", 3], ["place_state", 5],
];
/** Context a wine map never gives up, whatever else is trimmed. */
const KEPT_SOURCE_LAYERS = ["water", "water_name", "waterway", "place", "boundary"];
const SURVIVING_LAYER_COUNT = 68;

const sourceLayerOf = (l: LayerSpecification) =>
  "source-layer" in l ? l["source-layer"] : undefined;
// `filter` is absent from BackgroundLayerSpecification, so the union needs the
// same `in` narrowing `source-layer` does.
const filterOf = (l: LayerSpecification) => ("filter" in l ? l.filter : undefined);
const byId = (style: StyleSpecification, id: string) => style.layers.find((l) => l.id === id)!;

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
  it("removes the same 25 layers in both styles: 11 by source-layer, 9 by id, 5 by floor", () => {
    const tweaks = basemapTweaks(positron.layers);
    expect(tweaks.remove).toEqual(ALL_REMOVED_IDS);
    expect(tweaks.remove).toHaveLength(25);
    expect([...tweaks.remove].sort()).toEqual(
      [...PRUNED_IDS, ...REMOVED_IDS, ...DEAD_UNDER_FLOOR_IDS].sort(),
    );
    // The three rules must not overlap, or the counts below stop meaning anything.
    expect(PRUNED_IDS.filter((id) => REMOVED_IDS.includes(id))).toEqual([]);
    expect(
      DEAD_UNDER_FLOOR_IDS.filter((id) => PRUNED_IDS.includes(id) || REMOVED_IDS.includes(id)),
    ).toEqual([]);
    expect([...REMOVED_BASEMAP_LAYER_IDS].sort()).toEqual([...REMOVED_IDS].sort());
    // The floor rule is derived, never a hardcoded list: each of these five is
    // a place label whose own maxzoom is at or below PLACE_LABEL_MIN_ZOOM, so
    // the floor had already made it unrenderable at every zoom.
    for (const style of [positron, darkMatter]) {
      for (const id of DEAD_UNDER_FLOOR_IDS) {
        const layer = style.layers.find((l) => l.id === id)!;
        expect(layer.type, id).toBe("symbol");
        expect(sourceLayerOf(layer), id).toBe("place");
        expect(layer.maxzoom, id).toBeLessThanOrEqual(PLACE_LABEL_MIN_ZOOM);
        expect(layer.minzoom ?? 0, id).toBeLessThan(PLACE_LABEL_MIN_ZOOM);
      }
    }
    // Both styles carry all 93 of the same ids, so one list covers both.
    for (const style of [positron, darkMatter]) {
      const ids = new Set(style.layers.map((l) => l.id));
      for (const id of ALL_REMOVED_IDS) expect(ids.has(id), id).toBe(true);
    }
    expect(basemapTweaks(darkMatter.layers)).toEqual(tweaks);
  });

  it("lists only the 11 layers a floor actually moves: 9 road casings and 2 place labels", () => {
    // The floors are z10 for every road and z7 for every place label, but a
    // layer already above its floor is left OUT of the list, not restated.
    // That is a performance rule, not tidiness: `map.setLayerZoomRange` calls
    // `_update(true)` whatever it is handed, and for a layer carrying no
    // maxzoom the `maxzoom ?? 24` defeats `Style.setLayerZoomRange`'s own
    // early-return, so it runs `_updateLayer` — which marks the layer's source
    // 'reload' and PAUSES its tile manager, during the map's first paint.
    // 56 ranges used to be emitted here; 40 of them changed nothing.
    const tweaks = basemapTweaks(positron.layers);
    const REZONED = [...ROAD_REZONED, ...PLACE_LABEL_REZONED];
    expect(tweaks.zoomRanges).toHaveLength(11);
    expect(tweaks.zoomRanges.map((r) => r.id).sort()).toEqual(REZONED.map(([id]) => id).sort());
    expect(basemapTweaks(darkMatter.layers)).toEqual(tweaks);

    const by = new Map(tweaks.zoomRanges.map((r) => [r.id, r]));
    for (const [id, was] of REZONED) {
      const floor = ROAD_REZONED.some(([r]) => r === id)
        ? BASEMAP_ROAD_MIN_ZOOM
        : PLACE_LABEL_MIN_ZOOM;
      for (const style of [positron, darkMatter]) {
        const original = style.layers.find((l) => l.id === id)!;
        // Where it started, in both styles — so a Carto refresh that moves a
        // layer's own minzoom past the floor fails here rather than silently
        // dropping it from the list.
        expect(original.minzoom ?? 0, id).toBe(was);
        expect(was, id).toBeLessThan(floor);
        expect(by.get(id)!.maxzoom, id).toBe(original.maxzoom ?? 24);
      }
      expect(by.get(id)!.minzoom, id).toBe(floor);
    }

    // Every road and place label NOT listed is already at or above its floor,
    // so leaving it out changes nothing about what renders. (The five the
    // floor removed outright are not "untouched" and are excluded here.)
    const untouched = [
      ...ROAD_IDS.filter((id) => !ROAD_REZONED.some(([r]) => r === id)),
      ...PLACE_LABEL_IDS.filter(
        (id) => !PLACE_LABEL_REZONED.some(([p]) => p === id) && !DEAD_UNDER_FLOOR_IDS.includes(id),
      ),
    ];
    expect(untouched).toHaveLength(41 - 9 + 15 - 2 - 5);
    for (const id of untouched) {
      const original = positron.layers.find((l) => l.id === id)!;
      const floor =
        sourceLayerOf(original) === BASEMAP_ROAD_SOURCE_LAYER
          ? BASEMAP_ROAD_MIN_ZOOM
          : PLACE_LABEL_MIN_ZOOM;
      expect(original.minzoom ?? 0, id).toBeGreaterThanOrEqual(floor);
      expect(by.has(id), `${id} restated`).toBe(false);
    }
    expect(ROAD_IDS).toHaveLength(41);
    expect(PLACE_LABEL_IDS).toHaveLength(15);
  });

  it("gates every surviving road to z10 and every place label to z7, listed or not", () => {
    // The outcome the list above is only a means to. Whatever a Carto refresh
    // changes, no road may render below z10 and no place label below z7 once
    // the style is tuned — this is what would catch a floor silently lost to
    // the no-op filter.
    for (const style of [positron, darkMatter]) {
      for (const layer of tuneBasemapStyle(style).layers) {
        if (sourceLayerOf(layer) === BASEMAP_ROAD_SOURCE_LAYER) {
          expect(layer.minzoom, layer.id).toBeGreaterThanOrEqual(BASEMAP_ROAD_MIN_ZOOM);
        }
        if (layer.type === "symbol" && sourceLayerOf(layer) === "place") {
          expect(layer.minzoom, layer.id).toBeGreaterThanOrEqual(PLACE_LABEL_MIN_ZOOM);
        }
        // A floor must never leave a layer that can no longer draw: MapLibre
        // hides `zoom >= maxzoom`, so minzoom >= maxzoom is dead weight. Such
        // a layer is removed by the rule, never gated, so none can survive.
        if (layer.minzoom != null && layer.maxzoom != null) {
          expect(layer.minzoom, layer.id).toBeLessThan(layer.maxzoom);
        }
      }
    }
  });

  it("never drops or re-zooms the context a wine map lives on", () => {
    // Water, rivers, water names, place labels, boundaries and the background
    // are not negotiable; only the place labels may be zoom-gated, by their own
    // older rule, or dropped when that gate has already silenced them at every
    // zoom. If a future trim reaches anything else here, this fails.
    const tweaks = basemapTweaks(positron.layers);
    const removed = new Set(tweaks.remove);
    const zoomed = new Set(tweaks.zoomRanges.map((r) => r.id));
    for (const style of [positron, darkMatter]) {
      for (const layer of style.layers) {
        if (DEAD_UNDER_FLOOR_IDS.includes(layer.id)) continue;
        const sourceLayer = sourceLayerOf(layer) ?? "";
        if (!KEPT_SOURCE_LAYERS.includes(sourceLayer) && layer.type !== "background") continue;
        expect(removed.has(layer.id), `${layer.id} removed`).toBe(false);
        if (sourceLayer !== "place") {
          expect(zoomed.has(layer.id), `${layer.id} re-zoomed`).toBe(false);
        }
      }
    }
    expect(removed.has("background")).toBe(false);
    // Land cover and village extents stay too; only the cemetery/stadium fill goes.
    for (const id of ["landcover", "landuse_residential", "park_national_park", "park_nature_reserve"]) {
      expect(removed.has(id), id).toBe(false);
    }
  });

  it("never leaves a road drawn in one brunnel state and not another", () => {
    // The continuity floor. Carto splits every road class into three layers
    // with mutually exclusive filters — surface (["!has","brunnel"]), bridge
    // (["==","brunnel","bridge"]) and tunnel (["==","brunnel","tunnel"]) —
    // and NO layer draws a state other than its own. Keep road_mot_fill_noramp
    // and bridge_mot_fill but drop tunnel_mot_fill and every tunnelled stretch
    // of that motorway matches nothing at all: the line stops at one portal
    // and restarts at the other, which reads as a broken map. Same for `rail`,
    // whose own filter is ["!=","brunnel","tunnel"].
    //
    // So the removal decision has to be UNANIMOUS within a family. A family is
    // the layer id with its brunnel prefix stripped (tunnel_/bridge_/road_)
    // and Carto's "_noramp" spelling normalised away, since the tunnel and
    // bridge variants carry ["!=","ramp",1] without saying so in the id. A
    // `_ramp` layer keeps its suffix and so forms its own family: a ramp is a
    // separate slip road, never a segment of the mainline, so dropping the six
    // ramp layers leaves nothing half-drawn.
    const family = (id: string) =>
      id.replace(/^(?:tunnel|bridge|road)_/, "").replace(/_noramp$/, "");
    const removed = new Set(basemapTweaks(positron.layers).remove);
    for (const style of [positron, darkMatter]) {
      const families = new Map<string, { id: string; gone: boolean }[]>();
      for (const layer of style.layers) {
        if (sourceLayerOf(layer) !== BASEMAP_ROAD_SOURCE_LAYER) continue;
        const key = family(layer.id);
        const group = families.get(key) ?? [];
        group.push({ id: layer.id, gone: removed.has(layer.id) });
        families.set(key, group);
      }
      // The grouping has to actually group, or this passes vacuously on 41
      // singletons. Both styles give 21 families: 13 road classes x {surface,
      // bridge, tunnel}, plus rail and rail_dash as pairs, plus the 6 ramp
      // singletons. A Carto rename that defeated the prefix/_noramp stripping
      // would split a family into singletons and drop this count.
      expect(families.size).toBe(21);
      expect([...families].filter(([, g]) => g.length > 1)).toHaveLength(15);
      for (const [key, group] of families) {
        const gone = group.filter((l) => l.gone).map((l) => l.id);
        const kept = group.filter((l) => !l.gone).map((l) => l.id);
        expect(
          gone.length === 0 || kept.length === 0,
          `${key}: removed ${gone.join(", ") || "none"} but kept ${kept.join(", ") || "none"}`,
        ).toBe(true);
      }
      // Spelled out for the three that matter most, so a rename that defeats
      // the grouping above still fails here rather than passing vacuously.
      for (const id of ["tunnel_mot_fill", "tunnel_trunk_fill", "tunnel_rail", "tunnel_path"]) {
        expect(removed.has(id), id).toBe(false);
      }
      // Both rail cross-hatch layers go together, or a railway would be
      // hatched inside tunnels and plain outside them.
      expect(removed.has("rail_dash") && removed.has("tunnel_rail_dash")).toBe(true);
    }
  });

  it("keeps the six z15 village-zoom roads, which deleting could not have sped up", () => {
    // MapLibre's tile worker calls layer.isHidden(tileZoom, true) and skips
    // the layer before building its bucket or filtering a feature, so a layer
    // Carto already starts at z15 costs nothing at all below z15 — every zoom
    // the baseline measured as heavy. Removing these six would buy no frame
    // time anywhere and would cost the climat zoom its only ground reference:
    // road_path draws class `track` (vineyard access roads) as well as `path`,
    // and the service layers are the lanes between parcels.
    const tweaks = basemapTweaks(positron.layers);
    const removed = new Set(tweaks.remove);
    const by = new Map(tweaks.zoomRanges.map((r) => [r.id, r]));
    for (const style of [positron, darkMatter]) {
      for (const id of VILLAGE_ZOOM_ROAD_IDS) {
        const layer = style.layers.find((l) => l.id === id)!;
        expect(layer.minzoom, id).toBe(15);
        expect(removed.has(id), id).toBe(false);
        expect(ROAD_IDS, id).toContain(id);
        // The z10 gate is a floor, so their own z15 start is what survives —
        // and, being already above it, they are not restated as a zoom range
        // at all. The tuned style is where that is visible.
        expect(by.has(id), id).toBe(false);
        expect(byId(tuneBasemapStyle(style), id).minzoom, id).toBe(15);
      }
    }
    // And `track` really is in there — the class this would have dropped.
    expect(JSON.stringify(filterOf(byId(positron, "road_path")))).toContain("track");
  });

  it("never touches one of our own layers", () => {
    expect(basemapTweaks(WINE_LAYERS)).toEqual({ remove: [], zoomRanges: [] });
  });

  it("skips a wine layer even when it is spelled like a basemap one", () => {
    // The id and source-layer rules are only ever allowed to reach the
    // basemap: a layer on one of our sources is passed over before any rule
    // is consulted, so a future tile schema that reused "transportation" or a
    // Carto id could not blank a wine layer.
    const decoys = [
      { id: "landuse", type: "fill", source: WORLD_SOURCE_ID, "source-layer": "transportation" },
      { id: "shard-fills-rhone", type: "fill", source: shardSourceId("rhone"), "source-layer": "poi" },
    ] as LayerSpecification[];
    expect(basemapTweaks(decoys)).toEqual({ remove: [], zoomRanges: [] });
  });
});

describe("tuneBasemapStyle", () => {
  it("drops the pruned layers and applies the ranges, without mutating its input", () => {
    const frozen = deepFreeze(structuredClone(positron));
    const tuned = tuneBasemapStyle(frozen);
    expect(
      tuned.layers.some((l) => PRUNED_BASEMAP_SOURCE_LAYERS.has(sourceLayerOf(l) ?? "")),
    ).toBe(false);
    for (const id of ALL_REMOVED_IDS) {
      expect(tuned.layers.some((l) => l.id === id), id).toBe(false);
    }
    for (const range of basemapTweaks(positron.layers).zoomRanges) {
      const tunedLayer = tuned.layers.find((l) => l.id === range.id)!;
      expect(tunedLayer.minzoom).toBe(range.minzoom);
      expect(tunedLayer.maxzoom).toBe(range.maxzoom);
    }
    expect(frozen).toEqual(positron);
  });

  it("leaves no road below z10 in either style", () => {
    for (const style of [positron, darkMatter]) {
      const tuned = tuneBasemapStyle(style);
      const roads = tuned.layers.filter(
        (l) => sourceLayerOf(l) === BASEMAP_ROAD_SOURCE_LAYER,
      );
      expect(roads.map((l) => l.id).sort()).toEqual([...ROAD_IDS].sort());
      for (const road of roads) {
        expect(road.minzoom, road.id).toBeGreaterThanOrEqual(BASEMAP_ROAD_MIN_ZOOM);
      }
    }
  });

  it("is idempotent, so tuning an already-tuned style changes nothing", () => {
    // The swap hands setStyle a style that has already been tuned and
    // transformStyle tunes it again; that second pass must be a no-op.
    const once = tuneBasemapStyle(positron);
    expect(tuneBasemapStyle(once)).toEqual(once);
  });

  it("leaves both styles with the same 68 layer ids and the same sources, and no camera", () => {
    const [a, b] = [tuneBasemapStyle(positron), tuneBasemapStyle(darkMatter)];
    const ids = (s: StyleSpecification) => s.layers.map((l) => l.id).sort();
    expect(positron.layers).toHaveLength(93);
    expect(ids(a)).toHaveLength(SURVIVING_LAYER_COUNT);
    expect(
      93 - PRUNED_IDS.length - REMOVED_IDS.length - DEAD_UNDER_FLOOR_IDS.length,
    ).toBe(SURVIVING_LAYER_COUNT);
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

describe("the tuned-style cache", () => {
  // A theme flip used to hand setStyle a URL, so MapLibre fetched and parsed
  // the style on every flip. These cases pin the module-memory cache that
  // replaces that: one fetch per theme per tab, already tuned.
  beforeEach(() => {
    resetBasemapStyleCache();
  });
  afterEach(() => {
    resetBasemapStyleCache();
  });

  function stubFetch(body: StyleSpecification, ok = true) {
    const calls: string[] = [];
    const impl = async (url: string): Promise<Response> => {
      calls.push(url);
      return {
        ok,
        status: ok ? 200 : 503,
        json: async () => structuredClone(body),
      } as unknown as Response;
    };
    return { impl, calls };
  }

  it("fetches a theme's style once and returns it tuned", async () => {
    const { impl, calls } = stubFetch(positron);
    expect(cachedBasemapStyle("light")).toBeNull();
    const first = await loadBasemapStyle("light", impl);
    expect(calls).toEqual([BASEMAP_STYLE_URL.light]);
    expect(first.layers).toHaveLength(SURVIVING_LAYER_COUNT);
    expect(first.layers.some((l) => ALL_REMOVED_IDS.includes(l.id))).toBe(false);
    expect(first.layers.find((l) => l.id === "road_mot_case_noramp")!.minzoom).toBe(
      BASEMAP_ROAD_MIN_ZOOM,
    );
    const second = await loadBasemapStyle("light", impl);
    expect(calls).toHaveLength(1);
    expect(second).toBe(first);
    expect(cachedBasemapStyle("light")).toBe(first);
  });

  it("keeps the two themes apart", async () => {
    const light = stubFetch(positron);
    const dark = stubFetch(darkMatter);
    await loadBasemapStyle("light", light.impl);
    expect(cachedBasemapStyle("dark")).toBeNull();
    await loadBasemapStyle("dark", dark.impl);
    expect(dark.calls).toEqual([BASEMAP_STYLE_URL.dark]);
    expect(cachedBasemapStyle("dark")).not.toBe(cachedBasemapStyle("light"));
  });

  it("two concurrent callers share one request", async () => {
    const { impl, calls } = stubFetch(darkMatter);
    const [a, b] = await Promise.all([
      loadBasemapStyle("dark", impl),
      loadBasemapStyle("dark", impl),
    ]);
    expect(calls).toHaveLength(1);
    expect(a).toBe(b);
  });

  it("a failed fetch caches nothing, so a later flip retries", async () => {
    const bad = stubFetch(positron, false);
    await expect(loadBasemapStyle("light", bad.impl)).rejects.toThrow(/503/);
    expect(cachedBasemapStyle("light")).toBeNull();
    const good = stubFetch(positron);
    await expect(loadBasemapStyle("light", good.impl)).resolves.toBeTruthy();
    expect(good.calls).toHaveLength(1);
  });

  it("a body that is not a style caches nothing either", async () => {
    const junk = stubFetch({ not: "a style" } as unknown as StyleSpecification);
    await expect(loadBasemapStyle("dark", junk.impl)).rejects.toBeTruthy();
    expect(cachedBasemapStyle("dark")).toBeNull();
  });

  it("what it caches is exactly tuneBasemapStyle of what came back", async () => {
    const { impl } = stubFetch(darkMatter);
    expect(await loadBasemapStyle("dark", impl)).toEqual(tuneBasemapStyle(darkMatter));
  });

  it("a swap never mutates what is cached", async () => {
    const { impl } = stubFetch(positron);
    const cached = await loadBasemapStyle("light", impl);
    const before = structuredClone(cached);
    // Exactly what swapBasemap's transformStyle does with it.
    const prev = liveStyle(darkMatter);
    const next = withWineLayers(prev, tuneBasemapStyle(cached));
    expect(next.layers.length).toBeGreaterThan(cached.layers.length);
    expect(cached).toEqual(before);
    expect(cachedBasemapStyle("light")).toBe(cached);
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

  it("a swapped-in basemap is trimmed and gated exactly as the first one was", () => {
    // The whole point of basemapTweaks being one rule: a flip must not bring
    // back a layer onLoad removed, or reset a zoom range it set. Three flips,
    // so a style that has already been through a transform is checked too.
    let style = liveStyle(positron);
    for (const incoming of [darkMatter, positron, darkMatter]) {
      style = withWineLayers(style, tuneBasemapStyle(incoming));
      const basemapLayers = style.layers.filter((l) => !WINE_IDS.includes(l.id));
      expect(basemapLayers).toHaveLength(SURVIVING_LAYER_COUNT);
      for (const id of ALL_REMOVED_IDS) {
        expect(basemapLayers.some((l) => l.id === id), id).toBe(false);
      }
      for (const layer of basemapLayers) {
        if (sourceLayerOf(layer) === BASEMAP_ROAD_SOURCE_LAYER) {
          expect(layer.minzoom, layer.id).toBeGreaterThanOrEqual(BASEMAP_ROAD_MIN_ZOOM);
        }
        if (sourceLayerOf(layer) === "place" && layer.type === "symbol") {
          expect(layer.minzoom, layer.id).toBeGreaterThanOrEqual(PLACE_LABEL_MIN_ZOOM);
        }
      }
      // Our layers come through every flip unchanged, still last and still in
      // mount order — what world-labels' collision order depends on.
      expect(style.layers.slice(SURVIVING_LAYER_COUNT).map((l) => l.id)).toEqual(
        WINE_LAYERS.map((l) => l.id),
      );
      expect(validateStyleMin(style)).toEqual([]);
    }
  });
});
