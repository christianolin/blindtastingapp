// The wine map's colour expressions, built per region shard.
//
// Every live tile feature's `region` property equals the key of the shard
// that carries it (shard = canonical_key segment 1, scripts/wine-map-tiles
// lib.mjs shardKeyFor), so a shard's fill and outline colour never needs the
// other regions' hues or any other region's area slugs. The one catalogue-wide
// expression every shard layer used to share — a 934-slug palette `match` plus
// the full region `match` twice — was ~38 KB, and MapLibre's addLayer
// serializes the WHOLE style to validate each add, so that size was paid again
// for every layer already mounted: the first-zoom freeze (spec
// docs/superpowers/specs/2026-09-23-wine-map-one-country-all-countries-design.md
// §1). Built from the shard's own region and slugs, the same colours come out
// of an expression of ~2 KB (7 KB at most), byte-identical per feature —
// shard-specs.test.ts proves it against the old expression through MapLibre's
// own engine.
//
// Pure: no maplibre value import (type-only at most), so vitest evaluates these
// expressions through @maplibre/maplibre-gl-style-spec directly.
import type {
  FillLayerSpecification,
  FilterSpecification,
  LayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
  VectorSourceSpecification,
} from "maplibre-gl";
import type { WinePlaceTreeNode } from "./tree";
import { shardSourceId } from "./basemap";
import { paletteArms, visitAreaSlugs } from "./fill-palette";
import {
  classificationShades,
  SHADE_STEPS,
  shiftLightness,
  type MapPalette,
} from "./map-palette";
import { depthTerm, grapeGateExpression, GS, labelTextField } from "./map-state";
import { shardKeyFor } from "./shard";

/** [west, south, east, north], as the manifest and the place context carry it. */
export type Bbox = [number, number, number, number];

/** A MapLibre colour value: a data-driven expression or a plain colour. */
export type ColorExpression = unknown[] | string;

/** Zoom at which the fill colour steps from the region hue to the per-area /
    classification palette. The legend keys off the same number so it never
    advertises colours the map is not painting yet. */
export const AREA_PALETTE_ZOOM = 8;

/** The `tint` a feature without one reads as — the middle of the 0..5 ramp,
    as the tiles have always been coloured. */
export const SHADE_TINT_FALLBACK = 2;

/** Classification source: the `classification` tile property (appellation
    level, or Champagne's échelle village rating), falling back to `level` for
    tiles from before the property existed. It drives the fill-intensity ramp —
    stronger, more saturated shades of the area hue for higher classifications
    (darker in light, brighter in dark) — leaving gold reserved for selection. */
export const classificationExpr = [
  "coalesce",
  ["get", "classification"],
  ["get", "level"],
  "",
];

/** Hue-grouping unit: village-level in Burgundy, sub-region in Champagne (the
    `area_key` tile property), falling back to the district group for tiles
    from before the property existed. */
export const areaExpr = ["coalesce", ["get", "area_key"], ["get", "group"], ""];

// One colour spread across the tint ramp. At vineyard zoom a dozen
// neighbouring sites in one hue read as a single block; each place carries a
// stable `tint` (0..5, hashed from its key in the tile build), and the ramp
// separates neighbours while the family still reads as one.
function tintRamp(color: string): unknown[] {
  return [
    "match",
    ["to-number", ["coalesce", ["get", "tint"], SHADE_TINT_FALLBACK]],
    ...SHADE_STEPS.flatMap((step, i) => [i, shiftLightness(color, step)]),
    color,
  ];
}

/** One region's own hue arm: its palette colour across the tint ramp, or the
    palette's fallback FLAT when the palette does not name the region. Flat is
    today's behaviour for baden, franken, rheingau, wuerttemberg, saale-unstrut
    and hessische-bergstrasse — tinting it would make those regions jump from
    flat (world copy) to tinted (shard copy) at the handoff. */
export function regionHue(region: string, palette: MapPalette): ColorExpression {
  // Own properties only: the table is a plain object literal, so a lookup of
  // "constructor" would otherwise find Object.prototype's.
  return Object.prototype.hasOwnProperty.call(palette.regions, region)
    ? tintRamp(palette.regions[region])
    : palette.fallback;
}

// Built once per palette object and handed back by reference, so a theme flip
// is the only thing that changes what the world layers read.
const worldColors = new WeakMap<MapPalette, ColorExpression>();

/** The world archive's region colour: every region's hue arm, keyed by the
    feature's `region`. World features carry no `area_key`/`group` (72 live
    features checked, tier 0 and 1 only), so the area palette never applied
    there and this is the whole of what they paint. */
export function worldRegionColor(palette: MapPalette): ColorExpression {
  let expression = worldColors.get(palette);
  if (!expression) {
    expression = [
      "match",
      ["get", "region"],
      ...Object.entries(palette.regions).flatMap(([key, color]) => [
        key,
        tintRamp(color),
      ]),
      palette.fallback,
    ];
    worldColors.set(palette, expression);
  }
  return expression;
}

/** The shade family of one palette colour: where the shard's region is on the
    classification ramp, grand cru strongest (darkest in light, brightest in
    dark), premier cru mid, everything else across the tint ramp; otherwise the
    tint ramp alone. `ramp` is a per-shard constant, so this is one family or
    the other — never the old per-feature `case` on a `ramp` variable. */
export function paletteShadeExpression(
  color: string,
  palette: MapPalette,
  ramp: boolean,
): unknown[] {
  const shades = classificationShades(color, palette);
  // Within an area, sites that share a classification would otherwise render
  // in one identical colour; the tint ramp separates them. Cru shades stay
  // exact, because there intensity carries real meaning.
  const tinted = tintRamp(shades.base);
  return ramp
    ? [
        "match",
        classificationExpr,
        "grand_cru",
        shades.grand_cru,
        "premier_cru",
        shades.premier_cru,
        tinted,
      ]
    : tinted;
}

/** One shard's fill and outline colour. Below AREA_PALETTE_ZOOM every feature
    is its region hue; from there each area (Burgundy village, Champagne
    sub-region, Bordeaux district) gets its palette colour — a `match` from slug
    to palette index with one arm per colour, then from index to that colour's
    shade family — and a slug the list does not know (a tile release newer than
    the loaded tree) keeps the region hue. A shard with no area slugs at all
    (baden, franken, navarra, wuerttemberg and saale-unstrut carry only their
    region polygon, and every shard before the tree has loaded) is its region
    hue at every zoom: an arm-less `match` would not compile, and under
    validate:false it would throw rather than be dropped. */
export function shardColorExpression(input: {
  region: string;
  areaSlugs: readonly string[];
  ramp: boolean;
  palette: MapPalette;
}): ColorExpression {
  const { region, areaSlugs, ramp, palette } = input;
  const hue = regionHue(region, palette);
  const arms = paletteArms(areaSlugs, palette.districts.length);
  if (!arms.some((slugs) => slugs.length > 0)) return hue;
  const paletteIndex = [
    "match",
    areaExpr,
    ...arms.flatMap((slugs, i) => (slugs.length ? [slugs, i] : [])),
    -1,
  ];
  const areaMatch = [
    "match",
    ["var", "pi"],
    ...palette.districts.flatMap((color, i) =>
      arms[i].length ? [i, paletteShadeExpression(color, palette, ramp)] : [],
    ),
    hue,
  ];
  // The zoom step must stay the top-level expression (a `let` around it is
  // fine — MapLibre looks through `let` for the zoom curve).
  return [
    "let",
    "pi",
    paletteIndex,
    ["step", ["zoom"], hue, AREA_PALETTE_ZOOM, areaMatch],
  ];
}

/** Every shard's own area slugs: each node's area_key/group contribution,
    bucketed by the shard its canonical key routes to (shardKeyFor, which
    mirrors scripts/wine-map-tiles/lib.mjs) — not by walking each region's
    subtree, which would drop a place whose parent is unpublished (the tree
    makes it a root). The union of the buckets is exactly areaSlugsFromTree.
    Each list is sorted and de-duplicated; shards with no slugs are absent. */
export function areaSlugsByShard(
  roots: readonly WinePlaceTreeNode[],
): Record<string, string[]> {
  const buckets = new Map<string, Set<string>>();
  visitAreaSlugs(roots, (node, own) => {
    if (own.length === 0) return;
    const shard = shardKeyFor(node.key);
    if (!shard) return;
    let bucket = buckets.get(shard);
    if (!bucket) buckets.set(shard, (bucket = new Set()));
    for (const slug of own) bucket.add(slug);
  });
  // Object.fromEntries defines own properties, so no shard key can land on
  // the prototype.
  return Object.fromEntries(
    [...buckets.entries()].map(([shard, slugs]) => [shard, [...slugs].sort()]),
  );
}

/** Each named shard's colour expression, keyed by shard. `slugsByShard` is
    areaSlugsByShard's output — a shard it does not name has no areas (yet),
    and paints its region hue. `ramp` applies to every key given: the map calls
    this once for the plain shards and once for the ramped ones, so a region
    joining the ramp latch rebuilds only its own entry and every other shard
    keeps the very same expression object. */
export function shardColorsFor(input: {
  keys: readonly string[];
  slugsByShard: Readonly<Record<string, readonly string[]>>;
  ramp: boolean;
  palette: MapPalette;
}): Record<string, ColorExpression> {
  const { keys, slugsByShard, ramp, palette } = input;
  return Object.fromEntries(
    keys.map((key) => [
      key,
      shardColorExpression({
        region: key,
        // Own properties only, as in regionHue.
        areaSlugs: Object.prototype.hasOwnProperty.call(slugsByShard, key)
          ? slugsByShard[key]
          : [],
        ramp,
        palette,
      }),
    ]),
  );
}

// Static layer specs (Phase 1b; spec §5.2). Nothing below changes with the
// selection, the grape filter, Local/English or the focus country: those are
// read from global state (map-state.ts) and feature-state (selection-state.ts).
// A selection used to rewrite the paint and layout of every mounted layer —
// each call validated, each one reloading its source; now it is a few
// feature-state writes plus one wm_sel_key write that only the world source's
// and the selected shard's overlay layers read.

/** The world archive's handed-off multiplier: 0 once the region's own shard
    has loaded (feature-state `handed`, set by TileWineMap's handoff effect),
    1 otherwise. Folded into fill, line and text opacity instead of a filter,
    so a handoff rewrites no layer. */
export const WORLD_HANDED_FACTOR = [
  "case",
  ["boolean", ["feature-state", "handed"], false],
  0,
  1,
];

const IS_SELECTED = ["boolean", ["feature-state", "sel"], false];
const IS_CHILD = ["boolean", ["feature-state", "child"], false];
const IS_RELATED = ["boolean", ["feature-state", "rel"], false];
// Something is selected: everything unrelated fades. On from the first
// selection of the session, since the explorer never clears one.
const HAS_SELECTION = ["==", ["global-state", GS.hasSel], true];

/** The fill paint every wine polygon layer shares. `ramp` is the shard's
    classification-ramp constant (the world archive passes false: its features
    carry no cru levels); `worldHandoff` folds WORLD_HANDED_FACTOR into each
    zoom stop, since the zoom interpolation must stay the top-level
    expression. */
export function staticFillPaint(input: {
  color: ColorExpression;
  ramp: boolean;
  worldHandoff: boolean;
}): Record<string, unknown> {
  const { color, ramp, worldHandoff } = input;
  // The selection pops, its direct children keep full presence (you drill
  // into them), everything else fades to 45% once something is selected. The
  // selected fill still relaxes at deep zoom so children read on top of it.
  const focus = (selectedOpacity: number, base: unknown) => {
    const focused = [
      "case",
      IS_SELECTED,
      selectedOpacity,
      IS_CHILD,
      base,
      HAS_SELECTION,
      ["*", base, 0.45],
      base,
    ];
    return worldHandoff ? ["*", focused, WORLD_HANDED_FACTOR] : focused;
  };
  return {
    // Every fill has its own outline layer, so the built-in antialias pass is
    // a redundant second edge.
    "fill-antialias": false,
    "fill-color": color,
    "fill-opacity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      5,
      focus(0.6, ["min", 0.5, ["*", 0.16, ["get", "tier"]]]),
      9,
      // Classification intensity where the region ramps (grand cru solid,
      // premier cru firm, village land a light wash); one uniform mid opacity
      // where it does not.
      focus(0.3, [
        "match",
        classificationExpr,
        "grand_cru",
        ramp ? 0.65 : 0.4,
        "premier_cru",
        ramp ? 0.45 : 0.4,
        "communal",
        ramp ? 0.18 : 0.4,
        ["min", 0.5, ["*", 0.08, ["get", "tier"]]],
      ]),
    ],
  };
}

/** Outlines follow the fill palette, so deep levels are not ringed in the
    region hue. Shared by the shard outlines and the world region outlines, so
    a region drawn from either archive is pixel-identical. */
export function staticOutlinePaint(input: {
  color: ColorExpression;
  worldHandoff: boolean;
}): Record<string, unknown> {
  return {
    "line-color": input.color,
    "line-width": ["min", 2, ["+", 0.5, ["*", 0.4, ["get", "tier"]]]],
    ...(input.worldHandoff ? { "line-opacity": WORLD_HANDED_FACTOR } : {}),
  };
}

// Typography hierarchy: regions largest (uppercase, spaced), then steadily
// smaller through subregions, appellations and crus.
const LABEL_TIER_SIZE = ["match", ["get", "tier"], 0, 16, 1, 15, 2, 13.5, 3, 12, 4, 11, 10];

function labelLayoutBase(): Record<string, unknown> {
  return {
    "text-field": labelTextField(),
    "text-transform": ["match", ["get", "tier"], 0, "uppercase", 1, "uppercase", "none"],
    "text-letter-spacing": ["match", ["get", "tier"], 0, 0.1, 1, 0.08, 0.02],
  };
}

/** Every ordinary label layer. Size and collision priority no longer move
    with the selection (owner decision D4): feature-state cannot reach layout,
    and a global-state layout read would reload every label source on every
    selection. The selected place's own label is drawn by the
    selectedLabelLayout layer, and this copy of it loses to that one by
    collision. */
export function staticLabelLayout(): Record<string, unknown> {
  return {
    ...labelLayoutBase(),
    "text-size": LABEL_TIER_SIZE,
    "symbol-sort-key": ["-", 10, ["get", "tier"]],
  };
}

/** The selected place's label, one layer on its own source: 2.5 larger than
    its tier and first in collision order — what the selected label always
    got. */
export function selectedLabelLayout(): Record<string, unknown> {
  return {
    ...labelLayoutBase(),
    "text-size": ["+", LABEL_TIER_SIZE, 2.5],
    "symbol-sort-key": -2,
  };
}

/** Labels are never hidden by selection; it drives three weights instead:
    selected loudest, related (children, siblings, the parent) full presence,
    distant places lighter — and every label plain while nothing is selected. */
export function staticLabelPaint(input: {
  palette: MapPalette;
  worldHandoff: boolean;
}): Record<string, unknown> {
  const { label } = input.palette;
  const weigh = (selected: unknown, related: unknown, distant: unknown, plain: unknown) => [
    "case",
    IS_SELECTED,
    selected,
    IS_RELATED,
    related,
    HAS_SELECTION,
    distant,
    plain,
  ];
  const opacity = weigh(1, 0.95, 0.8, 1);
  return {
    "text-color": weigh(label.selected, label.related, label.distant, label.text),
    "text-opacity": input.worldHandoff ? ["*", opacity, WORLD_HANDED_FACTOR] : opacity,
    "text-halo-color": label.halo,
    "text-halo-width": weigh(2.2, 1.7, 1.3, 1.7),
  };
}

/** The selected label's paint: the "selected" weight, constant. The world
    copy still hides once its region is handed off, so it never draws beside
    the shard's own. */
export function selectedLabelPaint(input: {
  palette: MapPalette;
  worldHandoff: boolean;
}): Record<string, unknown> {
  const { label } = input.palette;
  return {
    "text-color": label.selected,
    "text-opacity": input.worldHandoff ? WORLD_HANDED_FACTOR : 1,
    "text-halo-color": label.halo,
    "text-halo-width": 2.2,
  };
}

/** A shard's fills, outlines and labels: the grape gate, plus region-level
    depth unless its country's wm_deep_ flag is on. A shard whose country is
    unknown (tree not loaded, or a shard newer than it) stays at full depth,
    as it always has. Never undefined: MapLibre silently drops a layer whose
    filter is. */
export function shardFilter(country: string | null): unknown[] {
  return country
    ? ["all", grapeGateExpression(), depthTerm(country)]
    : ["all", grapeGateExpression()];
}

/** The selection ring, its casing and the selected label: the selected key
    only, still subject to the grape gate. The feature's key is asserted to a
    string with an "" fallback, so a keyless feature can never equal a null
    wm_sel_key. Only these overlay layers read wm_sel_key, which is what keeps
    a selection's reloads to the world source and the selected place's shard. */
export function selectedPlaceFilter(): unknown[] {
  return [
    "all",
    grapeGateExpression(),
    ["==", ["string", ["get", "key"], ""], ["global-state", GS.selKey]],
  ];
}

// Phase 1c: the specs ShardController hands to map.style.addSource/addLayer
// with {validate:false}. MapLibre no longer checks them at runtime, so
// shard-layer-specs.test.ts runs validateStyleMin over every one of them
// instead, the way basemap.test.ts does for a swapped basemap.

/** Everything a shard's layers are built from. `country` null means the tree
    has not placed this shard (still loading, failed, or a newer release):
    no depth term, full depth, as before the tree. `areaSlugs` empty means
    region hue only. `fillsVisible` is read at add time only (?debugFills is
    fixed for the visit). */
export type ShardSpecInputs = {
  country: string | null;
  areaSlugs: readonly string[];
  ramp: boolean;
  palette: MapPalette;
  fillsVisible: boolean;
};

export type ShardLayerSpecs = {
  sourceId: string;
  source: VectorSourceSpecification;
  /** fills, outlines, labels — the order they are added in. */
  layers: LayerSpecification[];
};

/** A shard's base layer ids, exactly the ids the JSX mounted before 1c:
    scanView, interactiveLayerIds and ?debugClick all name them. */
export function shardLayerIds(key: string) {
  return {
    fills: `shard-fills-${key}`,
    outlines: `shard-outlines-${key}`,
    labels: `shard-labels-${key}`,
  };
}

/** The selected place's overlay layer ids on its own shard, bottom to top. */
export function shardOverlayIds(key: string) {
  return {
    casing: `shard-selected-casing-${key}`,
    ring: `shard-selected-ring-${key}`,
    label: `shard-selected-label-${key}`,
  };
}

/** The keyline under the gold ring (cream in light, near-black in dark).
    Shared by the world ring and every shard ring, so a selection looks the
    same whichever archive draws it. */
export function selectionCasingPaint(palette: MapPalette): LineLayerSpecification["paint"] {
  return { "line-color": palette.selectedCasing, "line-width": 5, "line-opacity": 0.85 };
}

/** The gold selection ring itself. */
export function selectionRingPaint(palette: MapPalette): LineLayerSpecification["paint"] {
  return { "line-color": palette.selectedRing, "line-width": 2.5 };
}

/** One shard's source and its fill, outline and label layers. `url` is the
    manifest's archive URL; the pmtiles protocol prefix is added here.

    Every call returns a new, fully independent object tree. MapLibre keeps
    the paint, layout and filter values addLayer is handed by reference (only
    setFilter clones), and the static builders may share constant
    sub-expressions between calls; one structuredClone per shard means nothing
    handed to the map is ever shared with anything else. */
export function shardLayerSpecs(key: string, url: string, inputs: ShardSpecInputs): ShardLayerSpecs {
  const sourceId = shardSourceId(key);
  const ids = shardLayerIds(key);
  const color = shardColorExpression({
    region: key,
    areaSlugs: inputs.areaSlugs,
    ramp: inputs.ramp,
    palette: inputs.palette,
  });
  const filter = shardFilter(inputs.country) as FilterSpecification;
  const layers: LayerSpecification[] = [
    {
      id: ids.fills,
      type: "fill",
      source: sourceId,
      "source-layer": "places",
      filter,
      layout: { visibility: inputs.fillsVisible ? "visible" : "none" },
      paint: staticFillPaint({ color, ramp: inputs.ramp, worldHandoff: false }) as FillLayerSpecification["paint"],
    },
    {
      id: ids.outlines,
      type: "line",
      source: sourceId,
      "source-layer": "places",
      filter,
      paint: staticOutlinePaint({ color, worldHandoff: false }) as LineLayerSpecification["paint"],
    },
    {
      id: ids.labels,
      type: "symbol",
      source: sourceId,
      "source-layer": "labels",
      filter,
      layout: staticLabelLayout() as SymbolLayerSpecification["layout"],
      paint: staticLabelPaint({ palette: inputs.palette, worldHandoff: false }) as SymbolLayerSpecification["paint"],
    },
  ];
  return structuredClone({
    sourceId,
    source: { type: "vector", url: `pmtiles://${url}`, promoteId: "key" },
    layers,
  });
}

/** The selected place's casing, ring and bigger label, on its own shard's
    source. ShardController keeps them at the very top of the style: the ring
    above every fill and outline, and the label placed first, so it wins every
    collision (D4). Fresh objects per call, as shardLayerSpecs. */
export function shardOverlaySpecs(key: string, palette: MapPalette): LayerSpecification[] {
  const source = shardSourceId(key);
  const ids = shardOverlayIds(key);
  const filter = selectedPlaceFilter() as FilterSpecification;
  return structuredClone<LayerSpecification[]>([
    {
      id: ids.casing,
      type: "line",
      source,
      "source-layer": "places",
      filter,
      paint: selectionCasingPaint(palette),
    },
    {
      id: ids.ring,
      type: "line",
      source,
      "source-layer": "places",
      filter,
      paint: selectionRingPaint(palette),
    },
    {
      id: ids.label,
      type: "symbol",
      source,
      "source-layer": "labels",
      filter,
      layout: selectedLabelLayout() as SymbolLayerSpecification["layout"],
      paint: selectedLabelPaint({ palette, worldHandoff: false }) as SymbolLayerSpecification["paint"],
    },
  ]);
}
