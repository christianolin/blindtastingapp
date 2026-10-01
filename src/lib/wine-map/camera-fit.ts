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

    Parent: the fit to its bbox decides, capped only at CAMERA_MAX_ZOOM
    (review 2026-09-30). The old cap, the deepest child's min_zoom + 0.5,
    assumed the children are drawn from their min_zoom; under the rule they
    come later, so it landed Napa Valley at z7.5 on a laptop, a small patch in
    a wide frame with none of its fifteen AVAs drawn, where its own fit
    (z8.97) draws ten of them. A country keeps the old cap (its regions are
    exempt from the rule, and a country's fit would mount its shards).
    A parent never lands below its own tile zoom floor(min_zoom): the old
    floor 0 let six picks (Chablis 1er Cru, Corton, ...) land where nothing is
    drawn, not even the ring. It is raised further only if even its bbox is
    under N px there: its footprint is no bigger than its bbox, so the parent
    then really is size-delayed. The landing does not wait for every child:
    a parent that fits the screen can hold children under N px, which come
    in as the viewer zooms (the status line says so, detail-status.ts); a
    region's subregions come in together (reveal.ts).

    The floors are judged from the bbox, which the camera has, not from the
    tile's reveal_area, which it does not: a ribbon the size rule draws by its
    length (reveal.ts) is drawn at or before its floor, so a pick of one lands
    where it is drawn, if a zoom deeper than it needs.

    Countries and regions (tier <= 1) get no size floor: the rule exempts them.
    With the rule off (revealPx 0: the kill switch, or a shard whose tiles do
    not carry the rule, reveal.ts placeRevealPx) this is exactly the old
    camera: a parent's floor is 0 and the cap is z16. */
export function selectionZooms(input: {
  tier: number;
  /** The place's catalogue min_zoom. */
  minZoom: number;
  childMinZooms: readonly number[];
  bbox: Bbox;
  /** reveal.ts's threshold for this place (placeRevealPx: the visit's, or 0
      where the rule is off or its shard's tiles do not carry it). */
  revealPx: number;
}): { minZoom: number; maxZoom: number } {
  const on = input.revealPx > 0;
  const cap = on ? CAMERA_MAX_ZOOM : CAMERA_MAX_ZOOM_RULE_OFF;
  const n = input.tier >= 2 && on ? input.revealPx : 0;
  if (input.childMinZooms.length > 0) {
    const deepest = Math.max(...input.childMinZooms) + 0.5;
    if (!on) return { minZoom: 0, maxZoom: Math.min(cap, deepest) };
    const floor = Math.max(Math.floor(input.minZoom), n > 0 ? bboxZoomForPx(input.bbox, n) : 0);
    const maxZoom = input.tier >= 1 ? cap : Math.min(cap, Math.max(deepest, floor + 0.5));
    return { minZoom: Math.min(floor, maxZoom), maxZoom };
  }
  const sizeFloor = n > 0 ? bboxZoomForPx(input.bbox, 2 * n) : 0;
  const maxZoom = Math.min(cap, Math.max(input.minZoom + 1.5, sizeFloor + 0.5));
  return { minZoom: Math.min(Math.max(input.minZoom + 0.35, sizeFloor), maxZoom), maxZoom };
}

/** The frame a fit leaves round its place, in CSS px on every side. */
export const FIT_PADDING_PX = 48;

/** A phone's bottom sheet open at half over the canvas's lower edge (the
    2026-09-25 phone plan, ruling R1): its height in CSS px. `reserveTop` is
    frame a pick keeps free at the TOP beyond FIT_PADDING_PX, for the zoom-in
    pill a phone shows over the map (cueTopReservePx; fix round 2026-10-01:
    the pill covered the top of Northern Rhône). `topClear` is the line, in
    CSS px from the map's top, that pill's strip ends at (cuePillClearPx: its
    bottom plus the gap, for one line or two), which a whole-zoom landing's
    box must stay below (landingZoom); selectionFit ignores it. */
export type SheetPadding = { bottom: number; reserveTop?: number; topClear?: number };

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
    under the sheet beats a flight MapLibre refuses.

    A `reserveTop` (the phone's zoom-in pill) adds to the frame at the top the
    same way and moves the place down by half of it. It is given up before the
    sheet when the two together leave under MIN_FIT_BAND_PX (the pill may then
    cover a little of a place that barely fits anyway), and kept on its own
    when the sheet is dropped. `reserveTop` in the result is the one kept. */
export function selectionFit(
  sheet: SheetPadding | undefined,
  canvasHeight: number,
): {
  padding: number | { top: number; right: number; bottom: number; left: number };
  offset: [number, number];
  sheet?: SheetPadding;
  reserveTop?: number;
} {
  // A sheet or a reserve of no height (or a nonsense one) is none.
  const bottom = sheet && sheet.bottom > 0 ? sheet.bottom : 0;
  const top = sheet?.reserveTop !== undefined && sheet.reserveTop > 0 ? sheet.reserveTop : 0;
  // Whether a frame leaves the place a band of at least MIN_FIT_BAND_PX to fit
  // into. Written as a negated >= so a NaN or unmeasured canvas fails it.
  const fits = (b: number, t: number) =>
    canvasHeight - b - t - 2 * FIT_PADDING_PX >= MIN_FIT_BAND_PX;
  const framed = (b: number, t: number) => ({
    padding: {
      top: FIT_PADDING_PX + t,
      right: FIT_PADDING_PX,
      bottom: FIT_PADDING_PX + b,
      left: FIT_PADDING_PX,
    },
    offset: [0, (t - b) / 2] as [number, number],
    ...(b > 0 ? { sheet: { bottom: b } } : {}),
    ...(t > 0 ? { reserveTop: t } : {}),
  });
  if (bottom > 0 && top > 0 && fits(bottom, top)) return framed(bottom, top);
  if (bottom > 0 && fits(bottom, 0)) return framed(bottom, 0);
  if (top > 0 && fits(0, top)) return framed(0, top);
  return { padding: FIT_PADDING_PX, offset: [0, 0] };
}

/** A pick lands on the next whole zoom when its fit is at most this far under
    it (owner, 2026-10-01, "Zoom to fit the place": "I'll round the zoom so no
    sub-area pops in a hair later"). The filters see whole zooms only
    (reveal.ts), so a landing at z8.97 draws what z8 draws, and 0.03 more zoom
    pops in everything z9 adds: Napa Valley's laptop fit landed exactly there,
    five of its fifteen AVAs and every AVA name missing. */
export const LANDING_ROUND_WITHIN = 0.25;
/** ...as long as the place's box at that whole zoom keeps this much map to
    every edge: it may grow into its 48 px frame, never off the map. On the
    769 x 654 laptop map that allows up to 12.9% of growth in the limiting
    direction; Northern Rhône needs 12.1% (z8.835 to z9, 14 px to spare),
    which is what draws Côte-Rôtie (39 px long at z8) at its landing. */
export const LANDING_ROUND_MARGIN_PX = 12;

type LandingInput = {
  zoom: number;
  maxZoom: number;
  bbox: Bbox;
  width: number;
  height: number;
  fit: { offset: readonly [number, number]; sheet?: SheetPadding; reserveTop?: number };
  /** A phone's zoom-in pill: the line its strip ends at (SheetPadding.topClear). */
  topClear?: number;
};

/** Where a selection lands, and the offset easeTo places it with: `zoom` (its
    fit, raised to the target's minZoom) at `fit.offset`, or the next whole
    zoom when that is within LANDING_ROUND_WITHIN, no deeper than `maxZoom`,
    and the place's box (north-up Web Mercator) still fits the `width` x
    `height` map with LANDING_ROUND_MARGIN_PX to every edge. Beside a phone's
    sheet the box stays the margin clear of the sheet; under a phone's zoom-in
    pill its top stays below the pill's strip (`topClear`, and with a
    `fit.reserveTop` the frame's top as well), for one line or two (review
    2026-10-01: a one-line pill reserves no frame, and a rounded box rose
    under it). Across, the box keeps the fit's centre. Down, it keeps it too
    unless the bounds above and below are uneven (a pill above, a sheet
    below): the box then moves down just enough to clear the pill, as long
    as it still fits above the sheet, so a phone pick under the pill still
    rounds (North Coast z5.90 to z6: six AVAs at the landing, not a 0.1 pinch
    later). The caller asks only where the size rule applies, so the kill
    switch and tiles from before the rule keep the old camera. */
export function selectionLanding(input: LandingInput): { zoom: number; offset: [number, number] } {
  const { zoom, maxZoom, bbox, width, height, fit } = input;
  const stay = { zoom, offset: [fit.offset[0], fit.offset[1]] as [number, number] };
  const up = Math.ceil(zoom);
  if (!(up > zoom) || up - zoom > LANDING_ROUND_WITHIN || up > maxZoom) return stay;
  const mercY = (lat: number) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  };
  const scale = 512 * 2 ** up;
  const w = ((bbox[2] - bbox[0]) / 360) * scale;
  const h = (mercY(bbox[1]) - mercY(bbox[3])) * scale;
  const cx = width / 2 + fit.offset[0];
  const cy = height / 2 + fit.offset[1];
  const m = LANDING_ROUND_MARGIN_PX;
  const reserve = fit.reserveTop ?? 0;
  const clear = input.topClear !== undefined && input.topClear > 0 ? input.topClear : 0;
  const top = Math.max(m, reserve > 0 ? FIT_PADDING_PX + reserve : 0, clear);
  const bottom = height - (fit.sheet?.bottom ?? 0) - m;
  const fitsAcross = cx - w / 2 >= m && cx + w / 2 <= width - m;
  // Written as a negated >= so a NaN (an unmeasured map) never rounds.
  if (!fitsAcross || !(bottom - top >= h)) return stay;
  // The fit's centre, moved only as far as the box needs to clear the top
  // bound (it fits, so it then still clears the bottom one), or the bottom.
  const shift = Math.max(0, top - (cy - h / 2)) - Math.max(0, cy + h / 2 - bottom);
  return { zoom: up, offset: [fit.offset[0], fit.offset[1] + shift] };
}

/** The zoom selectionLanding lands at. */
export function landingZoom(input: LandingInput): number {
  return selectionLanding(input).zoom;
}

/** Whether a tree, breadcrumb or chip pick may leave the camera where it is
    (tile-wine-map.tsx applyCameraTarget): the place's centre is on screen, it
    spans 0.18-1.3 of the view, and the view is past the pick's minZoom. With
    a whole-zoom landing (`landing`: the zoom the pick would land at, given
    only where the size rule applies) the view must also draw what that
    landing draws: the filters see whole zooms, so the view's whole zoom must
    be at least the landing's (review 2026-10-01: picking Napa Valley from
    North Coast's z7.52 landing stayed there, 0 of its 15 AVAs drawn, where
    its own landing is z9; Bordeaux to Graves and Graves to Sauternes the
    same). Without one, the test from before the rule, so the kill switch
    keeps the old camera. */
export function viewAlreadyFrames(input: {
  centreVisible: boolean;
  spanFrac: number;
  zoom: number;
  minZoom: number;
  landing?: number;
}): boolean {
  const { centreVisible, spanFrac, zoom, minZoom, landing } = input;
  if (!(centreVisible && zoom >= minZoom - 0.01 && spanFrac >= 0.18 && spanFrac <= 1.3)) return false;
  if (landing === undefined) return true;
  const eps = 1e-6;
  return Math.floor(zoom + eps) >= Math.floor(landing + eps);
}

/** The phone's zoom-in pill over the map (tile-wine-map-explorer.tsx, its
    classes pinned in desktop-layout.test.ts): its top 8 px below the map's
    (top-2); 12 px text on a 16.5 px line (text-xs leading-snug); 4 px of
    padding above and below and a 1 px border (py-1 border: `chrome`); 56 px
    clear of each side of the map (inset-x-14), with 12 px of padding and a
    1 px border inside that (px-3 border: `padX`); and `gap` more kept free
    below it by a pick. */
export const CUE_PILL = { top: 8, line: 16.5, chrome: 10, inset: 56, padX: 13, gap: 8 } as const;

/** The width one line of the pill's text has on a map `canvasWidth` wide. */
export function cuePillTextWidth(canvasWidth: number): number {
  return canvasWidth - 2 * CUE_PILL.inset - 2 * CUE_PILL.padX;
}

/** How many lines greedy word wrapping makes of words this wide, a space
    between them, in lines `maxWidth` wide (a word wider than a line takes a
    line of its own, as the browser's does). 0 for no words. */
export function wrappedLineCount(
  wordWidths: readonly number[],
  spaceWidth: number,
  maxWidth: number,
): number {
  let lines = 0;
  let used = 0;
  for (const width of wordWidths) {
    if (lines > 0 && used + spaceWidth + width <= maxWidth) {
      used += spaceWidth + width;
    } else {
      lines += 1;
      used = width;
    }
  }
  return lines;
}

/** Where a pill of `lines` lines ends, plus CUE_PILL's gap: the line, from
    the map's top, a landing's box stays below (SheetPadding.topClear). 0 for
    no lines. */
export function cuePillClearPx(lines: number): number {
  if (!(lines > 0)) return 0;
  return CUE_PILL.top + CUE_PILL.chrome + lines * CUE_PILL.line + CUE_PILL.gap;
}

/** The frame, beyond FIT_PADDING_PX, a pick keeps free at the top of a
    phone's map for a pill of `lines` lines: the pill's bottom plus CUE_PILL's
    gap. None for one line, which the 48 px frame already clears (a rounded
    landing still keeps below it: cuePillClearPx). */
export function cueTopReservePx(lines: number): number {
  return Math.max(0, cuePillClearPx(lines) - FIT_PADDING_PX);
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
