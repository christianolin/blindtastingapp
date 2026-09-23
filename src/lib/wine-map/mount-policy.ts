// Which region shards the tile map mounts, and how fast it gets there.
//
// Pure: no DOM, no maplibre value import, so vitest covers the rules.

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
