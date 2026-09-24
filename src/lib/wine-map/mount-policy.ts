// Which region shards the tile map mounts, and how fast it gets there.
//
// Pure: no DOM, no maplibre value import, so vitest covers the rules.

import type { Bbox } from "./shard-specs";

// Shard order everywhere on the map: the manifest's keys sorted with
// localeCompare, exactly as TileWineMap's `shardEntries` sorts them, so a
// step's result lines up with the target it walks toward.
const byKey = (a: string, b: string) => a.localeCompare(b);

/**
 * One step of the rendered shard set toward the target set.
 *
 * Mounting a shard is a <Source> plus its layers, and every MapLibre addLayer
 * validates by serializing the whole style — so the first zoom past z5, which
 * used to mount 36-67 shards in one commit, was one long frozen task. The
 * target is still decided in one go; the rendered set now walks toward it:
 * - removals apply at once (an unmounted shard is off screen by definition, so
 *   dropping it early is invisible and frees work);
 * - at most `maxAdds` new shards join per step, `first` (the selected shard)
 *   ahead of the rest, the rest in shard order;
 * - the result is in shard order, and is `current` itself when the step
 *   changes nothing, so a setState with it bails out.
 */
export function nextMountStep(
  current: readonly string[],
  target: readonly string[],
  opts: { maxAdds: number; first: string | null },
): string[] {
  const wanted = new Set(target);
  const kept = current.filter((key) => wanted.has(key));
  const have = new Set(kept);
  const pending = [...new Set(target)].filter((key) => !have.has(key)).sort(byKey);
  const firstAt = opts.first === null ? -1 : pending.indexOf(opts.first);
  if (firstAt > 0) {
    pending.splice(firstAt, 1);
    pending.unshift(opts.first as string);
  }
  const next = [...kept, ...pending.slice(0, Math.max(0, opts.maxAdds))].sort(byKey);
  const unchanged =
    next.length === current.length && next.every((key, i) => key === current[i]);
  // Same reference on a no-op step: callers compare by identity.
  return unchanged ? (current as string[]) : next;
}

// ---------------------------------------------------------------------------
// Which region shards to mount (spec 2026-09-23 §7.4)
// ---------------------------------------------------------------------------

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
