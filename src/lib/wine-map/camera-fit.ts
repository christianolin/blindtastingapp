// The camera side of a country chip (spec 2026-09-23 §7.3). A chip is a
// focus-and-camera action with its own request, not a selection. A country
// selection caps the camera at z4.5 (its children are regions, min_zoom 4),
// below the z5 shard floor, so it could never show a subregion.
//
// Also the frame a selection's fit leaves round its place (`selectionFit`),
// which on a phone makes room for the bottom sheet.
import type { Bbox } from "./shard-specs";
import { countryOfShard, SHARD_MIN_ZOOM } from "./mount-policy";
import { bboxZoomForPx } from "./reveal";

/** A chip flight never lands shallower than this. At z5.5 the country's
    shards are mounted and its regions load, and those of Italy's and
    Portugal's first subregions (min_zoom 5) that are at least REVEAL_MIN_PX
    across (reveal.ts) are already drawn. */
export const CHIP_MIN_ZOOM = 5.5;

/** A selection flight's deepest cap while the size rule is on: the reveal net
    (REVEAL_CAP_ZOOM, z16) plus headroom. */
export const CAMERA_MAX_ZOOM = 17;
/** The cap with the rule off (?revealPx=0 or REVEAL_MIN_PX = 0): the cap from
    before the rule, so the kill switch restores the old camera too. */
export const CAMERA_MAX_ZOOM_RULE_OFF = 16;

/** Where a tree, search, details or ?place= pick flies (design 2026-09-30,
    "small places appear later"): where the place can be seen.

    Leaf: the old [min_zoom + 0.35, min_zoom + 1.5], raised to the size floor,
    the first whole zoom where the place's bbox is 2N px across (the side of a
    square of its Web-Mercator area). A place filling a quarter of its box or
    more is drawn there by its ordinary fill; a sparser one is drawn by the
    selected-place overlay fill (shard-specs selectedFillFilter).

    Parent: the old framing (deepest child + 0.5; the fit to its bbox usually
    lands shallower), never below its own tile zoom floor(min_zoom): the old
    floor 0 let six picks (Chablis 1er Cru, Corton, ...) land where nothing is
    drawn, not even the ring, and the cap never undercuts that floor, whatever
    its children's min_zoom. It is raised further only if even its bbox is
    under N px there: its footprint is no bigger than its bbox, so the parent
    then really is size-delayed. A parent drawn at the old landing is not
    moved (Libournais, Montalcino, Malibu Coast). The landing does not wait
    for every child: a parent that fits the screen can hold children under
    N px, which come in as the viewer zooms (the status line says so,
    detail-status.ts), or with their family once the tiles carry reveal_area
    (reveal.ts).

    Countries and regions (tier <= 1) get no size floor: the rule exempts them.
    With the rule off (revealPx 0) this is exactly the old camera: a parent's
    floor is 0 and the cap is z16. */
export function selectionZooms(input: {
  tier: number;
  /** The place's catalogue min_zoom. */
  minZoom: number;
  childMinZooms: readonly number[];
  bbox: Bbox;
  /** reveal.ts's threshold for this visit (0 = the rule is off). */
  revealPx: number;
}): { minZoom: number; maxZoom: number } {
  const on = input.revealPx > 0;
  const cap = on ? CAMERA_MAX_ZOOM : CAMERA_MAX_ZOOM_RULE_OFF;
  const n = input.tier >= 2 && on ? input.revealPx : 0;
  if (input.childMinZooms.length > 0) {
    const deepest = Math.max(...input.childMinZooms) + 0.5;
    if (!on) return { minZoom: 0, maxZoom: Math.min(cap, deepest) };
    const floor = Math.max(Math.floor(input.minZoom), n > 0 ? bboxZoomForPx(input.bbox, n) : 0);
    const maxZoom = Math.min(cap, Math.max(deepest, floor + 0.5));
    return { minZoom: Math.min(floor, maxZoom), maxZoom };
  }
  const sizeFloor = n > 0 ? bboxZoomForPx(input.bbox, 2 * n) : 0;
  const maxZoom = Math.min(cap, Math.max(input.minZoom + 1.5, sizeFloor + 0.5));
  return { minZoom: Math.min(Math.max(input.minZoom + 0.35, sizeFloor), maxZoom), maxZoom };
}

/** The frame a fit leaves round its place, in CSS px on every side. */
export const FIT_PADDING_PX = 48;

/** A phone's bottom sheet open at half over the canvas's lower edge (the
    2026-09-25 phone plan, ruling R1): its height in CSS px. */
export type SheetPadding = { bottom: number };

/** The least height, in CSS px, a sheet-padded fit must leave the place: the
    canvas minus the sheet minus the frame above and below it. A landscape
    phone (a ~260 px canvas under a ~235 px sheet) leaves less than nothing,
    and MapLibre then refuses the fit outright (cameraForBounds returns
    undefined, and fitBounds with the same padding does nothing), so a tree
    pick or a ?place= link would not fly at all; a portrait phone under the
    active-tasting strip leaves ~27 px, which fits a region at an absurdly low
    zoom. Below this floor the fit ignores the sheet and frames the whole
    canvas, as on a larger screen. */
export const MIN_FIT_BAND_PX = 120;

/** How a selection's camera fits its place on a canvas `canvasHeight` CSS px
    tall. Without a sheet: FIT_PADDING_PX all round and no offset, as ever,
    whatever the canvas. With one, the frame also leaves the sheet's height
    free at the bottom, so the place fits the part of the canvas the sheet
    leaves visible, and `offset` puts the place's centre at that part's
    centre, half the sheet's height above the canvas centre. The offset is in
    pixels at the FINAL zoom (easeTo applies it there), so raising the fitted
    zoom to the place's reveal floor never over-shifts the place, which a
    centre pre-shifted by cameraForBounds at the fitted zoom would.

    `sheet` is the sheet the fit actually leaves room for: the one asked for,
    or undefined when there is none or when the band it leaves (the canvas
    minus the sheet minus the frame above and below) is under MIN_FIT_BAND_PX,
    in which case the fit is the plain one of the whole canvas. A place partly
    under the sheet beats a flight MapLibre refuses. */
export function selectionFit(
  sheet: SheetPadding | undefined,
  canvasHeight: number,
): {
  padding: number | { top: number; right: number; bottom: number; left: number };
  offset: [number, number];
  sheet?: SheetPadding;
} {
  // A sheet of no height (or a nonsense one) covers nothing: the plain fit.
  if (!sheet || !(sheet.bottom > 0)) return { padding: FIT_PADDING_PX, offset: [0, 0] };
  // Too little canvas above the sheet to fit into (or a canvas not measured
  // yet): the plain fit. Written as a negated >= so a NaN height drops too.
  const band = canvasHeight - sheet.bottom - 2 * FIT_PADDING_PX;
  if (!(band >= MIN_FIT_BAND_PX)) return { padding: FIT_PADDING_PX, offset: [0, 0] };
  return {
    padding: {
      top: FIT_PADDING_PX,
      right: FIT_PADDING_PX,
      bottom: FIT_PADDING_PX + sheet.bottom,
      left: FIT_PADDING_PX,
    },
    offset: [0, -sheet.bottom / 2],
    sheet,
  };
}

/** A camera move a chip asks for. `nonce` makes a repeat tap fly again (the
    selection camera is memoised on context and cannot repeat). A non-null
    `stayIfVisible` names a country: TileWineMap skips the move when that
    country's wine ground is already on screen at shard zoom, which it judges
    at apply time from its live zoom. */
export type CameraRequest = {
  bbox: Bbox;
  minZoom: number;
  nonce: number;
  stayIfVisible: string | null;
};

// A shard whose centre is further than this many times the median distance
// from the median centre is an outlier: Madeira sits 11.4 deg off mainland
// Portugal against a 1.2 deg median, while Corse sits 5.8 against France's 2.8.
const OUTLIER_FACTOR = 3;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Countries whose chip frames every shard, outliers included (spec 2026-09-29
    D26). The outlier rule would drop New York from the three West Coast states,
    the first thing a user tapping "United States" would notice. */
export const CHIP_FIT_ALL_SHARDS: ReadonlySet<string> = new Set(["united-states"]);

/** The least zoom a country chip lands at: CHIP_MIN_ZOOM, except for a
    CHIP_FIT_ALL_SHARDS country, where the fit must win (D26). Its box runs
    from California to New York, and MapLibre fits that at about z4.4 on a
    laptop and z2 on a phone; raised to z5.5 it would centre on the box's
    middle, the bare Great Plains, with neither coast on screen. Below shard
    zoom the world archive's state washes show first, and a tap drills in. */
export function chipMinZoom(country: string): number {
  return CHIP_FIT_ALL_SHARDS.has(country) ? 0 : CHIP_MIN_ZOOM;
}

/** The zoom a chip flight lands at: MapLibre's fitted zoom for the request's
    box, raised to the request's floor. */
export function chipLandingZoom(fittedZoom: number | undefined, minZoom: number): number {
  return Math.max(fittedZoom ?? 0, minZoom);
}

/** The box a chip flies to: the union of the country's shard bboxes, without
    outliers unless `keepAll`. At least half the shards always survive, since
    their distance is at most the median. Null for no bboxes. */
export function countryCameraBox(
  bboxes: readonly Bbox[],
  opts: { keepAll?: boolean } = {},
): Bbox | null {
  if (bboxes.length === 0) return null;
  let kept: readonly Bbox[] = bboxes;
  if (!opts.keepAll) {
    const centres = bboxes.map(
      ([minX, minY, maxX, maxY]) => [(minX + maxX) / 2, (minY + maxY) / 2] as const,
    );
    const mx = median(centres.map(([x]) => x));
    const my = median(centres.map(([, y]) => y));
    const distances = centres.map(([x, y]) => Math.hypot(x - mx, y - my));
    const limit = OUTLIER_FACTOR * median(distances);
    kept = bboxes.filter((_, i) => distances[i] <= limit);
  }
  return [
    Math.min(...kept.map((b) => b[0])),
    Math.min(...kept.map((b) => b[1])),
    Math.max(...kept.map((b) => b[2])),
    Math.max(...kept.map((b) => b[3])),
  ];
}

/** One country's shard bboxes from the manifest, in key order. */
export function bboxesForCountry(
  shards: Readonly<Record<string, { bbox?: Bbox }>>,
  shardCountries: Readonly<Record<string, string>>,
  country: string,
): Bbox[] {
  const out: Bbox[] = [];
  for (const key of Object.keys(shards).sort()) {
    const bbox = shards[key].bbox;
    if (bbox && countryOfShard(shardCountries, key) === country) out.push(bbox);
  }
  return out;
}

/** Whether a chip's camera request should move the map. The country is
    already showing if its wine ground is on screen and the map is at shard
    zoom. Then focus switches in place, and a flight would only throw away
    where the viewer is. */
export function chipFlightNeeded(input: {
  zoom: number;
  countriesInView: readonly string[];
  stayIfVisible: string | null;
}): boolean {
  if (input.stayIfVisible === null) return true;
  return !(input.zoom >= SHARD_MIN_ZOOM && input.countriesInView.includes(input.stayIfVisible));
}
