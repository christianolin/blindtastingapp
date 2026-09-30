// When a subregion appears on the wine map (owner, 2026-09-30: "you need to
// zoom further in before smaller places appear"). One rule for every country:
// a place below region level is drawn from the first whole zoom at which it is
// at least REVEAL_MIN_PX CSS px across — the side of a square of its on-screen
// area — and never before its catalogue min_zoom (tippecanoe keeps it out of
// the tiles before that). Countries and regions (tier <= 1) are the orientation
// layer and are never delayed. `wine_places.min_zoom` therefore means "never
// before", not "appears at": read reveal zooms through this module.
//
// Pure: no maplibre value import, so vitest runs the expression through both
// engines (reveal.test.ts).
import type { Bbox } from "./shard-specs";

/** THE owner's knob: a place appears once it is this many CSS px across.
    24 = WCAG 2.2's minimum target size, so what appears can be tapped.
    Alternatives: 16 (lighter), 32 (stricter). 0 = off (today's map). */
export const REVEAL_MIN_PX = 24;
/** ?revealPx= is clamped to 0..REVEAL_PX_MAX. */
export const REVEAL_PX_MAX = 64;
/** From this zoom on, everything is drawn whatever its size — a net for a
    degenerate footprint. It binds nothing in today's catalogue at 16/24/32. */
export const REVEAL_CAP_ZOOM = 16;

const PX_PER_DEG_Z0 = 512 / 360; // 512-px tiles
/** A feature without a numeric `area` is drawn as it is today (fail open). */
const AREA_WHEN_MISSING = 1e9;
/** `number`, never `to-number`: a missing or non-numeric tier reads 0 → drawn. */
const TIER = ["number", ["get", "tier"], 0];

/** The threshold a page URL asks for: `?revealPx=` (clamped), else the knob. */
export function revealPxFromSearch(search: string): number {
  const raw = new URLSearchParams(search).get("revealPx");
  if (raw === null || raw.trim() === "") return REVEAL_MIN_PX;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(REVEAL_PX_MAX, Math.max(0, value)) : REVEAL_MIN_PX;
}

let pagePx: number | null = null;
/** This page load's threshold, read once, so the map's filters and the
    explorer's camera always agree. SSR-safe. */
export function currentRevealPx(): number {
  if (typeof window === "undefined") return REVEAL_MIN_PX;
  return (pagePx ??= revealPxFromSearch(window.location.search));
}

/** A shard's mid-latitude, from its manifest bbox (45 when missing). */
export function revealLatitude(bbox: Bbox | undefined): number {
  return bbox ? (bbox[1] + bbox[3]) / 2 : 45;
}

/** One shard's constant: at tile zoom z a feature is at least `minPx` across iff
    area · 4^z >= K, `area` being the tile's planar deg² of the whole footprint
    (side_px = sqrt(area / cos φ) · 512 · 2^z / 360). The shard's mid-latitude
    stands in for the feature's: within ±0.02 zoom from p1 to p99. */
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
    [">=", ["*", ["number", ["get", "area"], AREA_WHEN_MISSING], ["^", 4, ["zoom"]]], k],
  ];
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
  const area = typeof props.area === "number" ? props.area : AREA_WHEN_MISSING;
  return area * Math.pow(4, tileZoom) >= k;
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
