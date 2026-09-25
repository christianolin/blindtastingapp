// The camera side of a country chip (spec 2026-09-23 §7.3). A chip is a
// focus-and-camera action with its own request, not a selection. A country
// selection caps the camera at z4.5 (its children are regions, min_zoom 4),
// below the z5 shard floor, so it could never show a subregion.
//
// Also the frame a selection's fit leaves round its place (`selectionFit`),
// which on a phone makes room for the bottom sheet.
import type { Bbox } from "./shard-specs";
import { countryOfShard, SHARD_MIN_ZOOM } from "./mount-policy";

/** A chip flight never lands shallower than this. At z5.5 the country's
    shards are mounted and its regions load, and Italy's and Portugal's first
    subregions (min_zoom 5) are already drawn. */
export const CHIP_MIN_ZOOM = 5.5;

/** The frame a fit leaves round its place, in CSS px on every side. */
export const FIT_PADDING_PX = 48;

/** A phone's bottom sheet open at half over the canvas's lower edge (the
    2026-09-25 phone plan, ruling R1): its height in CSS px. */
export type SheetPadding = { bottom: number };

/** How a selection's camera fits its place. Without a sheet: FIT_PADDING_PX
    all round and no offset, as ever. With one, the frame also leaves the
    sheet's height free at the bottom, so the place fits the part of the canvas
    the sheet leaves visible, and `offset` puts the place's centre at that
    part's centre, half the sheet's height above the canvas centre. The offset
    is in pixels at the FINAL zoom (easeTo applies it there), so raising the
    fitted zoom to the place's reveal floor never over-shifts the place, which
    a centre pre-shifted by cameraForBounds at the fitted zoom would. */
export function selectionFit(sheet: SheetPadding | undefined): {
  padding: number | { top: number; right: number; bottom: number; left: number };
  offset: [number, number];
} {
  // A sheet of no height (or a nonsense one) covers nothing: the plain fit.
  if (!sheet || !(sheet.bottom > 0)) return { padding: FIT_PADDING_PX, offset: [0, 0] };
  return {
    padding: {
      top: FIT_PADDING_PX,
      right: FIT_PADDING_PX,
      bottom: FIT_PADDING_PX + sheet.bottom,
      left: FIT_PADDING_PX,
    },
    offset: [0, -sheet.bottom / 2],
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

/** The box a chip flies to: the union of the country's shard bboxes, without
    outliers. At least half the shards always survive, since their distance is
    at most the median. Null for no bboxes. */
export function countryCameraBox(bboxes: readonly Bbox[]): Bbox | null {
  if (bboxes.length === 0) return null;
  const centres = bboxes.map(
    ([minX, minY, maxX, maxY]) => [(minX + maxX) / 2, (minY + maxY) / 2] as const,
  );
  const mx = median(centres.map(([x]) => x));
  const my = median(centres.map(([, y]) => y));
  const distances = centres.map(([x, y]) => Math.hypot(x - mx, y - my));
  const limit = OUTLIER_FACTOR * median(distances);
  const kept = bboxes.filter((_, i) => distances[i] <= limit);
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
