// When the world archive hands a region over to its own shard (spec
// docs/superpowers/specs/2026-09-23-wine-map-one-country-all-countries-design.md
// §5.4). The world copy of a region is hidden (feature-state `handed`) only
// once its shard can draw it, and mounting a shard only STARTS its pmtiles
// fetch — hide the world copy then and the region is a hole until the round
// trip ends.
//
// This used to be a live reading of isSourceLoaded, which goes false on every
// reload — and a grape pick, a Local/English toggle, a focus change and the
// first selection all reload sources. Each one briefly un-handed the region,
// so its world copy drew again on top of the shard (double opacity, a doubled
// outline, a second label). Readiness is now a latch per mount:
//  - a shard becomes ready once it has loaded WHILE its bbox intersects the
//    view. Not merely loaded: a shard mounted by the 50% pad while its region
//    is still off screen needs no tiles, so MapLibre calls it loaded at once,
//    and handing over then would leave a hole when the region scrolls in;
//  - it stays ready while mounted, whatever isSourceLoaded says after that;
//  - it drops out when unmounted (its tiles went with the source) or when its
//    source is missing, and must load in view again after a remount.
// The caller runs this for every committed mount list, so an unmount and a
// remount can never both slip between two readings.
import type { Bbox } from "./shard-specs";

export type ShardProbe = { added: boolean; loaded: boolean; inView: boolean };

export function latchReady(
  prev: ReadonlySet<string>,
  mounted: readonly string[],
  probe: (key: string) => ShardProbe,
): string[] {
  const ready: string[] = [];
  for (const key of mounted) {
    const { added, loaded, inView } = probe(key);
    if (!added) continue;
    if (prev.has(key) || (loaded && inView)) ready.push(key);
  }
  return ready.sort();
}

/** Does a shard's bbox touch the view? A shard with no bbox (the transitional
    v1 manifest) always counts as in view, as the mount rule treats it. */
export function bboxInView(bbox: Bbox | undefined, view: Bbox): boolean {
  if (!bbox) return true;
  const [minX, minY, maxX, maxY] = bbox;
  const [west, south, east, north] = view;
  return maxX >= west && minX <= east && maxY >= south && minY <= north;
}

/** What the world→shard handoff must write to reach `next`. `applied` is what
    was last written and to WHICH world source object: a re-created source
    (MapLibre's full style rebuild — a restored WebGL context, a failed theme
    diff) starts with no feature-state, so nothing is removed from it (MapLibre
    throws inside its next render when a key is removed from a feature that
    has no state) and every key is set again. `resend` (a basemap swap landed)
    sets every key again even on the same source. */
export function handoffWrites(
  applied: { source: unknown; keys: ReadonlySet<string> } | null,
  source: unknown,
  next: ReadonlySet<string>,
  resend: boolean,
): { set: string[]; remove: string[] } {
  const sameSource = applied !== null && applied.source === source;
  const prev = sameSource ? applied.keys : new Set<string>();
  const set: string[] = [];
  for (const key of next) {
    if (resend || !sameSource || !prev.has(key)) set.push(key);
  }
  const remove: string[] = [];
  for (const key of prev) {
    if (!next.has(key)) remove.push(key);
  }
  return { set, remove };
}
