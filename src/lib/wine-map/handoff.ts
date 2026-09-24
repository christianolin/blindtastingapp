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
