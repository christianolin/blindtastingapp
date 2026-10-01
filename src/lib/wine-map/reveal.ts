// When a subregion appears on the wine map (owner, 2026-09-30: "you need to
// zoom further in before smaller places appear"; his decisions the same day:
// 24 px, and "keep ribbons visible"). One rule for every country: a place
// below region level is drawn from the first whole zoom at which it is at
// least REVEAL_MIN_PX CSS px across, and never before its catalogue min_zoom
// (tippecanoe keeps it out of the tiles before that). Countries and regions
// (tier <= 1) are the orientation layer and are never delayed.
// `wine_places.min_zoom` therefore means "never before", not "appears at":
// read reveal zooms through this module.
//
// "Across" is worked out by the tile export, which has the geometry
// (scripts/wine-map-tiles/lib.mjs revealPlan), and reaches the app as ONE
// number per feature, `reveal_area`, in the unit of the tile's `area`
// (planar deg²) at the shard's mid-latitude, so the app's whole test is
// `reveal_area * 4^z >= K` (revealK). The export's rule, in CSS px:
//   - a part is big enough once the square of its area is N px across, or,
//     if it is a ribbon (8 times as long as thick), once it is 2N px long and
//     N/12 px thick (Côte de Nuits at the Burgundy view: 54 px long, 3.7 px
//     thick; Condrieu at z8: 59 px long, 2.3 px thick); every compact shape
//     gets exactly the square rule;
//   - a region's SUBREGIONS come in with their median sibling when they are
//     at least half its size (Burgundy's six districts at the Burgundy view);
//   - a place's parts are separate features: the anchor part comes with its
//     place, the others once their own square is N (no 10-20 px fragments);
//   - a label carries its place's value, so a name comes with its shape.
// Everything is a ratio of N, so REVEAL_MIN_PX and ?revealPx= keep their
// meaning. Where places overlap, the deeper and then the smaller paints on top:
// the export writes each shard in that order and tippecanoe keeps it.
//
// FAIL OPEN: a feature without a numeric reveal_area is not delayed at all
// (every release before the rule; `area` is never used instead), and a shard
// applies the rule only when its manifest entry says its tiles carry it
// (`reveal_rule` === REVEAL_RULE_VERSION, shardRevealPx). Without that, the
// shard's filters, the selection camera and the status probes are exactly
// the map from before the rule, so an app deploy ahead of the tiles release
// changes nothing, and promoting an older release switches the rule off.
//
// The test runs at the tile's WHOLE zoom (filters see nothing finer), so what
// appears is always at least REVEAL_MIN_PX across, but between whole zooms a
// place still hidden can be up to twice that on screen: Romanée-Conti is 21 px
// at z13, so it waits for z14, and at z13.9 it is 39 px and still hidden.
// That errs towards later, which is the owner's ask.
//
// Pure: no maplibre value import, so vitest runs the expression through both
// engines (reveal.test.ts).
import type { Bbox } from "./shard-specs";

/** THE owner's knob: a place appears once it is this many CSS px across at a
    whole zoom. 24 = WCAG 2.2's minimum target size, so what appears can be
    tapped; the owner chose it on 2026-09-30 after comparing 16/24/32
    (?revealPx= still overrides it for one visit). 0 = off, the rollback
    switch: the filters, the selection camera (camera-fit.ts selectionZooms)
    and the status probes are then exactly the map before this rule. */
export const REVEAL_MIN_PX = 24;
/** The rule version a shard's manifest entry names when its tiles carry
    reveal_area (scripts/wine-map-tiles/lib.mjs REVEAL_RULE). Any other value,
    or none, and the shard keeps the map from before the rule. */
export const REVEAL_RULE_VERSION = 1;
/** ?revealPx= is clamped to 0..REVEAL_PX_MAX. */
export const REVEAL_PX_MAX = 64;
/** From this zoom on, everything is drawn whatever its size — a net for a
    degenerate footprint. It binds nothing in today's catalogue at 16/24/32. */
export const REVEAL_CAP_ZOOM = 16;

const PX_PER_DEG_Z0 = 512 / 360; // 512-px tiles
/** A feature without a numeric reveal_area is drawn as it is today (fail open). */
const SIZE_WHEN_MISSING = 1e9;
/** `number`, never `to-number`: a missing or non-numeric tier reads 0 → drawn. */
const TIER = ["number", ["get", "tier"], 0];
/** The size a feature is judged by: its reveal_area, else drawn (fail open).
    Never `area`: tiles from before the rule must look exactly as they did. */
const SIZE = ["number", ["get", "reveal_area"], SIZE_WHEN_MISSING];

/** The threshold a page URL asks for: `?revealPx=` (clamped), else the knob. */
export function revealPxFromSearch(search: string): number {
  const raw = new URLSearchParams(search).get("revealPx");
  if (raw === null || raw.trim() === "") return REVEAL_MIN_PX;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(REVEAL_PX_MAX, Math.max(0, value)) : REVEAL_MIN_PX;
}

/** The threshold the current URL asks for. Read it ONCE per visit: the
    explorer does, when it mounts, and hands that one value to the map's
    filters and to its own camera, so the two always agree. Never cached here:
    a module outlives a client-side navigation, and a cached value carried one
    visit's ?revealPx= into the next (review 2026-09-30). SSR-safe. */
export function currentRevealPx(): number {
  if (typeof window === "undefined") return REVEAL_MIN_PX;
  return revealPxFromSearch(window.location.search);
}

/** The threshold one shard applies this visit: the visit's `revealPx` when
    the shard's manifest entry says its tiles carry the rule, else 0 (the map
    from before the rule, for its filters, the camera and the probes alike). */
export function shardRevealPx(
  shard: { reveal_rule?: unknown } | undefined,
  revealPx: number,
): number {
  return shard?.reveal_rule === REVEAL_RULE_VERSION ? revealPx : 0;
}

/** The threshold a selection camera applies to a place (its canonical key):
    its shard's (shardRevealPx). A country has no shard of its own; it gets the
    visit's threshold once any shard carries the rule. */
export function placeRevealPx(
  shards: Readonly<Record<string, { reveal_rule?: unknown }>>,
  placeKey: string,
  revealPx: number,
): number {
  const shard = placeKey.split(".")[1];
  if (shard !== undefined) {
    return shardRevealPx(Object.hasOwn(shards, shard) ? shards[shard] : undefined, revealPx);
  }
  return Object.values(shards).some((s) => shardRevealPx(s, revealPx) > 0) ? revealPx : 0;
}

/** A shard's mid-latitude, from its manifest bbox (45 when missing). */
export function revealLatitude(bbox: Bbox | undefined): number {
  return bbox ? (bbox[1] + bbox[3]) / 2 : 45;
}

/** One shard's constant: at tile zoom z a feature is at least `minPx` across iff
    reveal_area · 4^z >= K. reveal_area is in the unit of the tile's `area`,
    planar deg², at the shard's mid-latitude (side_px = sqrt(reveal_area /
    cos φ) · 512 · 2^z / 360); the export works it out at exactly the latitude
    this K uses (the manifest bbox's), so the test is exact. */
export function revealK(minPx: number, latitude: number): number {
  return (minPx / PX_PER_DEG_Z0) ** 2 * Math.cos((latitude * Math.PI) / 180);
}

/** The arm every shard fill, outline and label layer ANDs in FIRST (it is the
    cheapest and rejects most features at z5-z9). null when the rule is off, so
    the filter is then exactly today's. Filters see the tile's integer zoom
    (overscaledZ, overzoom included), so this costs nothing per frame. */
export function revealTerm(k: number, minPx: number): unknown[] | null {
  if (!(minPx > 0)) return null;
  return [
    "any",
    ["<=", TIER, 1],
    [">=", ["zoom"], REVEAL_CAP_ZOOM],
    [">=", ["*", SIZE, ["^", 4, ["zoom"]]], k],
  ];
}

/** SIZE in JS: reveal_area, else drawn (fail open). */
function revealSize(props: Readonly<Record<string, unknown>>): number {
  return typeof props.reveal_area === "number" ? props.reveal_area : SIZE_WHEN_MISSING;
}

/** revealTerm in JS with the same doubles (the status probe and the tests). */
export function revealPasses(
  props: Readonly<Record<string, unknown>>,
  tileZoom: number,
  k: number,
  minPx: number,
): boolean {
  if (!(minPx > 0)) return true;
  const tier = typeof props.tier === "number" ? props.tier : 0;
  if (tier <= 1 || tileZoom >= REVEAL_CAP_ZOOM) return true;
  return revealSize(props) * Math.pow(4, tileZoom) >= k;
}

/** The first whole zoom a feature is drawn at: its tile zoom floor(min_zoom)
    (a missing one reads 0), or later if the size rule holds it back. */
export function revealZoom(
  props: Readonly<Record<string, unknown>>,
  k: number,
  minPx: number,
): number {
  const minZoom = typeof props.min_zoom === "number" ? Math.max(0, Math.floor(props.min_zoom)) : 0;
  for (let z = minZoom; z < REVEAL_CAP_ZOOM; z += 1) {
    if (revealPasses(props, z, k, minPx)) return z;
  }
  return Math.max(minZoom, REVEAL_CAP_ZOOM);
}

/** The first whole zoom at which a bbox is `px` across (the side of a square of
    its Web-Mercator area), clamped to 0..REVEAL_CAP_ZOOM: the camera's floor. */
export function bboxZoomForPx(bbox: Bbox, px: number): number {
  const mercY = (lat: number) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  };
  const w = Math.max(((bbox[2] - bbox[0]) / 360) * 512, 1e-9);
  const h = Math.max((mercY(bbox[1]) - mercY(bbox[3])) * 512, 1e-9);
  const z = Math.ceil(Math.log2(px / Math.sqrt(w * h)));
  return Math.min(REVEAL_CAP_ZOOM, Math.max(0, z));
}

/** The [west, south, east, north] of a GeoJSON geometry's coordinates, or null
    when it has none that can be read. */
function geometryBbox(geometry: unknown): Bbox | null {
  const g = geometry as { coordinates?: unknown } | null | undefined;
  if (!g || g.coordinates === undefined) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  const walk = (c: unknown): void => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      w = Math.min(w, c[0]);
      e = Math.max(e, c[0]);
      s = Math.min(s, c[1]);
      n = Math.max(n, c[1]);
      return;
    }
    for (const part of c) walk(part);
  };
  walk(g.coordinates);
  return w <= e && s <= n ? [w, s, e, n] : null;
}

/** The status line's probe (design 2026-09-30 §3.4). Given the tier >= 2
    features of the focus country's loaded tiles (querySourceFeatures), is
    there one in view that the grape filter keeps and that ONLY the size rule
    hides at this tile zoom? Then more zoom will draw it, and "No subregions
    mapped here" would be wrong. A feature whose geometry cannot be read counts
    as in view: the error is towards "Zoom in", never towards "none here". */
export function sizeHiddenInView(input: {
  features: readonly { properties?: Readonly<Record<string, unknown>> | null; geometry?: unknown }[];
  view: Bbox;
  tileZoom: number;
  k: number;
  px: number;
  /** The grape filter's keys, or null when it is off. */
  visibleKeys: ReadonlySet<string> | null;
}): boolean {
  const { view, tileZoom, k, px, visibleKeys } = input;
  if (!(px > 0)) return false;
  for (const feature of input.features) {
    const p = feature.properties ?? {};
    if (typeof p.tier !== "number" || p.tier < 2) continue;
    if (visibleKeys && !(typeof p.key === "string" && visibleKeys.has(p.key))) continue;
    if (revealPasses(p, tileZoom, k, px)) continue;
    const b = geometryBbox(feature.geometry);
    if (!b || (b[0] <= view[2] && b[2] >= view[0] && b[1] <= view[3] && b[3] >= view[1])) return true;
  }
  return false;
}

/** The selection cue's probe (review 2026-09-30: a drill-down landed where its
    children are all size-hidden, with nothing on screen to say so; fix round
    2026-10-01: every DESCENDANT counts, not only the children, since a
    region's landing can hide its grandchildren the same way: Bordeaux's
    Pomerol and Fronsac, the Rhône Valley's Côte-Rôtie and Hermitage).
    `drawnKeys` are the selected place's descendants the map drew in view at
    this scan (its rendered features); `features` the loaded tile features of
    its descendants (querySourceFeatures; one place can arrive as several
    features: tile edges and its parts). `hidden` counts, per key, those in
    view that ONLY the size rule hides at this tile zoom and that the map drew
    in none of their features. Places the grape filter drops count as
    neither; with the rule off (px 0) nothing is hidden. */
export function descendantsInView(input: {
  drawnKeys: ReadonlySet<string>;
  features: readonly { properties?: Readonly<Record<string, unknown>> | null; geometry?: unknown }[];
  view: Bbox;
  tileZoom: number;
  k: number;
  px: number;
  visibleKeys: ReadonlySet<string> | null;
}): { drawn: number; hidden: number } {
  const { drawnKeys, view, tileZoom, k, px, visibleKeys } = input;
  const hidden = new Set<string>();
  if (px > 0) {
    for (const feature of input.features) {
      const p = feature.properties ?? {};
      if (typeof p.key !== "string" || drawnKeys.has(p.key) || hidden.has(p.key)) continue;
      if (visibleKeys && !visibleKeys.has(p.key)) continue;
      if (revealPasses(p, tileZoom, k, px)) continue;
      const b = geometryBbox(feature.geometry);
      if (b && !(b[0] <= view[2] && b[2] >= view[0] && b[1] <= view[3] && b[3] >= view[1])) continue;
      hidden.add(p.key);
    }
  }
  return { drawn: drawnKeys.size, hidden: hidden.size };
}
