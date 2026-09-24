// Which country the wine map gives subregion depth to in One country mode,
// and the small pieces around that choice (spec 2026-09-23 §7.3). Pure: the
// map feeds in measurements (bboxes, the feature under the centre, the chip
// state), so every precedence step and the hysteresis are tested without a map.
import type { Bbox } from "./shard-specs";
import { countryOfShard, NEIGHBOUR_MIN_ZOOM, type MountInput } from "./mount-policy";

/** Share of the on-screen wine ground one country must cover before the share
    rule gives it focus. Below it the frame spans several countries, and no
    country is focused by shares alone. */
export const COUNTRY_FOCUS_SHARE = 0.6;

/** Release threshold for that focus. Taking focus at 0.6 and dropping it at
    0.6 made a frame near the boundary flip on every small drag, blinking every
    appellation in view. Keep focus until the leader falls well clear. */
export const COUNTRY_RELEASE_SHARE = 0.45;

/** Resolution of the grid that measures each country's share by UNION rather
    than by summing overlapping bboxes. 48x48 over a viewport is far finer than
    the bboxes it measures. */
export const FOCUS_GRID = 48;

/**
 * Each country's share of the visible wine ground, plus every country with any
 * ground on screen (`present`, sorted).
 *
 * Union, not sum. Region bboxes overlap heavily (Italy has 20 of them), so
 * adding per-shard intersections double-counts and favours whichever country
 * is split into the most overlapping pieces — it once ranked Spain over Italy
 * on a frame Italy dominated. Rasterising the view into a coarse grid and
 * marking covered cells gives the real share.
 */
export function countryShares(input: {
  shards: MountInput["shards"];
  shardCountries: Readonly<Record<string, string>>;
  view: Bbox;
}): { shares: Record<string, number>; present: string[] } {
  const [w, s, e, n] = input.view;
  const dx = e - w;
  const dy = n - s;
  if (!(dx > 0) || !(dy > 0)) return { shares: {}, present: [] };
  const covered = new Map<string, Set<number>>();
  const anyCovered = new Set<number>();
  for (const [key, shard] of input.shards) {
    const country = countryOfShard(input.shardCountries, key);
    if (!country || !shard.bbox) continue;
    const [minX, minY, maxX, maxY] = shard.bbox;
    const cx0 = Math.max(0, Math.floor(((minX - w) / dx) * FOCUS_GRID));
    const cx1 = Math.min(FOCUS_GRID - 1, Math.ceil(((maxX - w) / dx) * FOCUS_GRID) - 1);
    const cy0 = Math.max(0, Math.floor(((minY - s) / dy) * FOCUS_GRID));
    const cy1 = Math.min(FOCUS_GRID - 1, Math.ceil(((maxY - s) / dy) * FOCUS_GRID) - 1);
    if (cx1 < cx0 || cy1 < cy0) continue;
    let cells = covered.get(country);
    if (!cells) covered.set(country, (cells = new Set()));
    for (let gx = cx0; gx <= cx1; gx += 1) {
      for (let gy = cy0; gy <= cy1; gy += 1) {
        const cell = gy * FOCUS_GRID + gx;
        cells.add(cell);
        anyCovered.add(cell);
      }
    }
  }
  const total = anyCovered.size;
  const shares: Record<string, number> = {};
  if (total > 0) {
    for (const [country, cells] of covered) shares[country] = cells.size / total;
  }
  return { shares, present: [...covered.keys()].sort() };
}

/** The country of the wine region under the map centre, from the properties
    of what `queryRenderedFeatures` found there: the first feature whose
    `region` (its shard key) has a known country. Region polygons of different
    countries do not overlap, so "first" is exact. Bboxes do overlap, which is
    why this beats the share rule at borders. */
export function centreCountryFrom(
  properties: readonly (Readonly<Record<string, unknown>> | null | undefined)[],
  shardCountries: Readonly<Record<string, string>>,
): string | null {
  for (const p of properties) {
    const region = p && typeof p.region === "string" ? p.region : null;
    if (!region) continue;
    const country = countryOfShard(shardCountries, region);
    if (country) return country;
  }
  return null;
}

/** Ring radii, in CSS pixels, sampled around the centre when the centre
    itself is not on wine ground (a gap between region footprints). */
export const CENTRE_PROBE_RADII_PX: readonly number[] = [16, 32, 64, 128];

/** The eight unit directions sampled on each ring, E first, clockwise in
    screen space (y grows downwards). */
export const CENTRE_PROBE_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0], [Math.SQRT1_2, Math.SQRT1_2], [0, 1], [-Math.SQRT1_2, Math.SQRT1_2],
  [-1, 0], [-Math.SQRT1_2, -Math.SQRT1_2], [0, -1], [Math.SQRT1_2, -Math.SQRT1_2],
];

/** The radii to probe on a canvas of this size: every CENTRE_PROBE_RADII_PX
    entry no larger than a third of the canvas's shorter side, so a phone
    never reaches for a region most of the way to the edge. */
export function centreProbeRadii(width: number, height: number): number[] {
  const limit = Math.min(width, height) / 3;
  return CENTRE_PROBE_RADII_PX.filter((r) => r <= limit);
}

/**
 * The wine region NEAREST the centre, as a country. `rings[0]` is the centre
 * point's hits (one entry: that point's properties list); `rings[i]` for i >= 1
 * holds one properties list per sampled point on ring i. The first ring in
 * which any point resolves (via centreCountryFrom on that point's list) to a
 * known country decides. In that ring each point votes for its country; the
 * most votes win; a tie goes to `prev` if `prev` is among the tied, else to
 * the alphabetically first tied country. No ring resolves -> null.
 */
export function nearestCentreCountry(
  rings: readonly (readonly (readonly (Readonly<Record<string, unknown>> | null | undefined)[])[])[],
  shardCountries: Readonly<Record<string, string>>,
  prev: string | null,
): string | null {
  for (const ring of rings) {
    const votes = new Map<string, number>();
    for (const point of ring) {
      const country = centreCountryFrom(point, shardCountries);
      if (country) votes.set(country, (votes.get(country) ?? 0) + 1);
    }
    if (votes.size === 0) continue;
    const most = Math.max(...votes.values());
    const tied = [...votes.keys()].filter((country) => votes.get(country) === most);
    if (prev !== null && tied.includes(prev)) return prev;
    return tied.sort()[0];
  }
  return null;
}

/**
 * The focus country, in order:
 * 1. a tapped chip, once its country is on screen (before that its flight is
 *    still underway, and a country off screen can show nothing);
 * 2. the selected place's country, but ONLY while it is on screen — the
 *    explorer never clears a selection, so an unconditional pin meant the
 *    first selection of the session (or arriving via ?place=) held depth to
 *    that country forever, and panning to Tuscany never showed a Tuscan
 *    subzone;
 * 3. the country of the wine region nearest the map centre (the centre
 *    itself, else the closest ring of sampled points around it), which is
 *    what you are looking at (bbox shares called Colmar "Germany" through
 *    Baden's bbox, and the Colmar centre pixel itself sits in a gap east of
 *    the Alsace footprint);
 * 4. the share rule: a leader at COUNTRY_FOCUS_SHARE takes focus, and the
 *    previous focus keeps it until it falls under COUNTRY_RELEASE_SHARE.
 * Null means no country: everything stays at region level.
 */
export function nextFocusCountry(input: {
  chipCountry: string | null;
  selectedCountry: string | null;
  countriesInView: readonly string[];
  centreCountry: string | null;
  shares: Readonly<Record<string, number>>;
  prev: string | null;
}): string | null {
  const { chipCountry, selectedCountry, countriesInView, centreCountry, shares, prev } = input;
  if (chipCountry && countriesInView.includes(chipCountry)) return chipCountry;
  if (selectedCountry && countriesInView.includes(selectedCountry)) return selectedCountry;
  if (centreCountry) return centreCountry;
  // Alphabetical scan with a strict `>`, so a tie is decided by name, not by
  // object key order.
  let leader: string | null = null;
  let best = 0;
  for (const country of Object.keys(shares).sort()) {
    if (shares[country] > best) {
      leader = country;
      best = shares[country];
    }
  }
  if (leader !== null && best >= COUNTRY_FOCUS_SHARE) return leader;
  if (prev !== null && (shares[prev] ?? 0) >= COUNTRY_RELEASE_SHARE) return prev;
  return null;
}

/** A tapped country chip: focus without selection. `seen` turns true once the
    country has been on screen, so leaving the view after that clears it while
    a flight still on its way does not. */
export type ChipFocus = { country: string; seen: boolean };

/** The chip state after a tap. A repeat tap keeps the object, so a state
    update bails out. */
export function chipOnTap(
  prev: ChipFocus | null,
  country: string,
  countriesInView: readonly string[],
): ChipFocus {
  if (prev?.country === country) return prev;
  return { country, seen: countriesInView.includes(country) };
}

/** The chip state after the map reports the countries on screen. It is
    returned unchanged (same object) when nothing moved. */
export function chipAfterReport(
  prev: ChipFocus | null,
  countriesInView: readonly string[],
): ChipFocus | null {
  if (!prev) return null;
  if (countriesInView.includes(prev.country)) {
    return prev.seen ? prev : { country: prev.country, seen: true };
  }
  return prev.seen ? null : prev;
}

/** The chip state after a user-initiated camera move (a drag, wheel, pinch or
    keyboard — never a flight the app started). An unseen chip is dropped: its
    flight was interrupted, or never started (a tap while the map chunk was
    still loading), and left pending it would grab focus whenever its country
    next edged into view, hours later. A seen chip is kept (same object);
    chipAfterReport clears it once its country leaves the view. */
export function chipAfterUserMove(prev: ChipFocus | null): ChipFocus | null {
  return prev && !prev.seen ? null : prev;
}

/** Countries whose `wm_deep_<country>` flag is on: every known one in All
    countries, the focus country alone (or none) in One country. */
export function deepCountriesFor(
  detail: "one" | "all",
  focusCountry: string | null,
  knownCountries: readonly string[],
): string[] {
  if (detail === "all") return [...knownCountries];
  return focusCountry ? [focusCountry] : [];
}

/** Whether the map is past the zoom where more zoom could still draw the focus
    country's subregions (NEIGHBOUR_MIN_ZOOM, controller ruling R3), so the
    status line may say none are mapped here. It is judged from the idle scan
    that measured depth, and only when that scan was taken with the current
    focus country: focus moves at moveend, the scan lands a beat after idle,
    and in between a pan from Würzburg to Colmar must not tell the viewer that
    France has nothing mapped there on the strength of Germany's scan. */
export function scanPastDepthZoom(input: {
  scanZoom: number;
  scanFocus: string | null;
  focusCountry: string | null;
}): boolean {
  return (
    input.focusCountry !== null &&
    input.scanFocus === input.focusCountry &&
    input.scanZoom >= NEIGHBOUR_MIN_ZOOM
  );
}

/** What TileWineMap tells the explorer. It reports whenever a value changes,
    and the status line and the chips are built from it. `depthCountries` are
    the countries whose tier >= 2 features the idle scan actually saw on
    screen. `pastDepthZoom` is scanPastDepthZoom for the current focus. */
export type DetailReport = {
  focusCountry: string | null;
  depthCountries: string[];
  countriesInView: string[];
  pastDepthZoom: boolean;
};
