// The attribute gate the tile map puts on every wine layer while a filter is
// on — grapes today, styles and designations later. "Render only these
// canonical keys; keep the country outline (tier 0) as geographic context."
//
// It is pure and lives here rather than inline in tile-wine-map.tsx so its
// equivalence with the gate it replaced can be measured against MapLibre's own
// expression engine (key-gate.test.ts) without a DOM.
//
// Shape (spec docs/superpowers/specs/2026-09-20-wine-map-performance.md §3):
// the key set is an OBJECT and membership is a two-argument `get`, which is an
// O(1) property read. The previous shape, `["in", ["get","key"], ["literal",
// [...keys]]]`, ends in `Array.prototype.indexOf` inside MapLibre's `In`
// expression — a linear scan of every key, for every feature, for every layer,
// on every tile parse.
//
// Measured through MapLibre's own `featureFilter`, 360,000 evaluations
// (200 tiles x 15 layers x 120 features) of features NOT in the set, which is
// what most features on a tile are while one grape is selected:
//
//        key set     array `in`     object `get`
//         50 keys        121 ms           37 ms      3.2x
//        200 keys        258 ms           40 ms      6.5x
//        598 keys        667 ms           45 ms     14.9x   <- Chardonnay
//       2000 keys      1,653 ms           42 ms     39.2x
//
// The number that matters is not the ratio but the shape: the array's cost
// grows with the key set, the object's does not. With a quarter of features
// hitting the set (indexOf can then stop early) 598 keys measured 216 ms
// against 39 ms. Compiling the filter costs the same either way (300 compiles:
// 27 ms array, 24 ms object), so nothing is traded away at setFilter time.
//
// Two details are load-bearing and were each checked against the bundled
// @maplibre/maplibre-gl-style-spec source, not assumed:
//
//  - `["string", ["get","key"], ""]`, never a bare `["get","key"]`. The
//    two-argument `get` types its first argument `StringType`, and
//    ParsingContext wraps a value-typed argument in an assertion that THROWS
//    at runtime for a missing, null or numeric property. MapLibre catches that
//    (warn once, return the filter default), so the answer would still be
//    false — but it is a throw per feature and a console line. The two-argument
//    `string` assertion returns the fallback instead.
//
//  - `["==", ..., true]`, never `["to-boolean", ...]`. A plain object inherits
//    Object.prototype, so a lookup of "constructor", "toString" or
//    "__proto__" returns something truthy even when the key is not in the set;
//    `to-boolean` would let such a feature through. Strict equality against the
//    literal `true` we stored cannot.
//
// A no-filter state is `null` here, and the caller turns that into its own
// always-true PASS_FILTER. It must never become `undefined`: react-map-gl
// feeds the filter prop straight into addLayer and MapLibre rejects undefined,
// silently never mounting the layer (the "only France until I toggle the grape
// filter" bug).

/** Every country outline carries tier 0 and passes the gate unconditionally. */
const COUNTRY_TIER = 0;

/** A MapLibre filter expression, as the map's layers consume it. */
export type KeyGateExpression = readonly unknown[];

/** The visible-key set as an object, for the O(1) membership read.
    Object.fromEntries defines own properties, so even a key spelled
    "__proto__" lands as data rather than being swallowed by the setter. */
export function keyLookupMap(keys: readonly string[]): Record<string, true> {
  return Object.fromEntries(keys.map((key) => [key, true] as const));
}

/**
 * The gate for one visible-key set, or null for "no filter". Built ONCE per
 * key set — the caller memoizes on `visibleKeys` — and that one expression is
 * shared by all five of the map's composed filters, instead of being rebuilt
 * for each of them on every render.
 *
 * That sharing is a build-time saving only. It does NOT make the live style
 * smaller: MapLibre's Style.setFilter deep-clones what it is handed
 * (`layer.setFilter(clone(filter))`), so the key map still lands in the style
 * once per layer, exactly as the array it replaces did. Measuring the style's
 * size or key count before and after this change shows no difference; the win
 * is per-feature evaluation cost, which is where the time was.
 */
export function keyGateExpression(
  keys: readonly string[] | null,
): KeyGateExpression | null {
  if (keys == null) return null;
  return [
    "any",
    ["==", ["get", "tier"], COUNTRY_TIER],
    ["==", ["get", ["string", ["get", "key"], ""], ["literal", keyLookupMap(keys)]], true],
  ];
}
