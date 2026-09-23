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
import type { WinePlaceTreeNode } from "./tree";
import { paletteArms, visitAreaSlugs } from "./fill-palette";
import {
  classificationShades,
  SHADE_STEPS,
  shiftLightness,
  type MapPalette,
} from "./map-palette";
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
