// The tile shard that holds a place's detail is the 2nd segment of its
// canonical key (france.<region>.<...>). Mirrors shardKeyFor in
// scripts/wine-map-tiles/lib.mjs so the UI routes to the same archive.
export function shardKeyFor(canonicalKey: string): string | null {
  const segments = canonicalKey.split(".");
  return segments.length >= 2 ? segments[1] : null;
}
