// Which region shards the tile map mounts (spec 2026-09-23 §7.4): the
// mount target for a view (mountTarget), the zoom thresholds it keys on
// (SHARD_MIN_ZOOM, NEIGHBOUR_MIN_ZOOM), a shard's country (countryOfShard) and
// what the 150% keep may hold across a sync (keepAcrossSync). How fast the
// target is reached is ShardController's frame budget, not this file's.
//
// Pure: no DOM, no maplibre value import, so vitest covers the rules.

import type { Bbox } from "./shard-specs";

/** Below this zoom no region shard is mounted. Verified against the
    catalogue: every shard-only place has min_zoom >= 5, so beneath it a shard
    could only contribute its region outline/fill — which the world archive
    also carries and paints with the same colours. The map therefore opens
    (initialViewState is z4.4) without reading a single shard's pmtiles header. */
export const SHARD_MIN_ZOOM = 5;

/** One country mode mounts another country's shards only from here. Below it
    such a shard would draw nothing deeper than its regions (that country's
    depth flag is off), which the world archive draws identically up to its z7
    max zoom. From z8 the world copy is overzoomed, so the shard takes over for
    crisp region outlines. This is what makes One country genuinely lighter:
    the first zoom past z5 mounts one country's shards, not 36-44 of them. */
export const NEIGHBOUR_MIN_ZOOM = 8;

export type MountInput = {
  shards: readonly (readonly [string, { bbox?: Bbox }])[];
  view: Bbox;
  zoom: number;
  selectedShard: string | null;
  prev: ReadonlySet<string>;
  detail: "one" | "all";
  focusCountry: string | null;
  shardCountries: Readonly<Record<string, string>>;
};

/** A shard's country from the tree-derived map, or null while it is unknown.
    Own properties only, so a key that happens to spell an Object.prototype
    member can never read a function back as a "country". */
export function countryOfShard(
  shardCountries: Readonly<Record<string, string>>,
  key: string,
): string | null {
  return Object.prototype.hasOwnProperty.call(shardCountries, key)
    ? shardCountries[key]
    : null;
}

/** The mounted set that mountTarget's 150% keep may hold on to: the last
    sync's set while the mode holds, and nothing right after a mode change, so
    switching to One country unmounts the other countries' shards at once
    instead of keeping them until they leave the 150% pad. */
export function keepAcrossSync(
  prev: readonly string[],
  syncedDetail: "one" | "all",
  detail: "one" | "all",
): ReadonlySet<string> {
  return syncedDetail === detail ? new Set(prev) : new Set();
}

/**
 * The shards to mount for this view, sorted.
 *
 * - The selected shard always mounts, at any zoom, so a tree selection can
 *   ring its place before the camera arrives.
 * - Nothing else mounts below SHARD_MIN_ZOOM.
 * - Hysteresis: a shard mounts once its bbox meets the view padded by 50%,
 *   and a mounted one stays until it leaves the view padded by 150%. Panning
 *   never thrashes sources. The keep ignores country on purpose. Focus flips
 *   whenever the map centre crosses a border, and unmounting there would throw
 *   away that source's tiles and refetch them on the way back. The caller
 *   builds `prev` with keepAcrossSync, which is empty right after a mode
 *   change, so switching to One country still unmounts the other countries'
 *   shards at once.
 * - All countries mounts every shard in the pad (today's rule). One country
 *   mounts the focus country's shards, and other countries' only from
 *   NEIGHBOUR_MIN_ZOOM. A shard whose country is unknown (the place tree has
 *   not loaded, or failed) follows today's rule, so a missing tree never
 *   costs detail.
 * - No bbox (transitional v1 manifest) never hides a shard.
 */
export function mountTarget(input: MountInput): string[] {
  const { shards, view, zoom, selectedShard, prev, detail, focusCountry, shardCountries } =
    input;
  const [w, s, e, n] = view;
  const dx = e - w;
  const dy = n - s;
  const hit = (bbox: Bbox | undefined, pad: number) => {
    if (!bbox) return true;
    const [minX, minY, maxX, maxY] = bbox;
    return (
      maxX >= w - dx * pad && minX <= e + dx * pad &&
      maxY >= s - dy * pad && minY <= n + dy * pad
    );
  };
  const next: string[] = [];
  for (const [key, shard] of shards) {
    if (key === selectedShard) {
      next.push(key);
      continue;
    }
    if (zoom < SHARD_MIN_ZOOM) continue;
    if (prev.has(key) && hit(shard.bbox, 1.5)) {
      next.push(key);
      continue;
    }
    if (!hit(shard.bbox, 0.5)) continue;
    if (detail === "one") {
      const country = countryOfShard(shardCountries, key);
      if (country !== null && country !== focusCountry && zoom < NEIGHBOUR_MIN_ZOOM) continue;
    }
    next.push(key);
  }
  return next.sort();
}
