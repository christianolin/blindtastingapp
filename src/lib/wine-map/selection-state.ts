// Which features the selection emphasises, as MapLibre feature-state (spec
// docs/superpowers/specs/2026-09-23-wine-map-one-country-all-countries-design.md
// §5.2). Paint reads three flags:
//   sel   — the selected place (fill pops, darkest label);
//   child — its direct children (keep full fill presence: you drill into them);
//   rel   — children, siblings and the parent (labels stay at full presence).
// Everything else fades once wm_has_sel is on. These replace the old per-layer
// `["==", ["get","key"], selectedKey]` / `parent_id` expressions, which made
// every selection rewrite the paint and layout of every mounted layer (and
// reload every source). A feature-state write reloads nothing.
//
// The sets come from the loaded place tree, whose parent links are the same
// primary_parent links the tiles' `parent_id` was exported from. Without the
// tree (still loading, failed, or a tile release newer than it) the place
// context's children and parent stand in; siblings then stay plain.
//
// Feature ids follow the tile pipeline's routing (archiveForPlace in
// scripts/wine-map-tiles/lib.mjs): tier 0 lives in the world archive only,
// tier 1 in the world archive AND its region's shard, tier >= 2 in the shard
// only. Shard sources promote `key`; the world source promotes `region`, which
// is the region slug for a region and the country's own key for a country.
import { shardSourceId, WORLD_SOURCE_ID } from "./basemap";
import { shardKeyFor } from "./shard";
import type { WinePlaceTreeNode } from "./tree";

export type SelectionFlags = { sel?: true; child?: true; rel?: true };
export type SelectionStates = Map<string /* source id */, Map<string /* feature id */, SelectionFlags>>;

type Located = { node: WinePlaceTreeNode; parent: WinePlaceTreeNode | null };

// One index per loaded tree (the explorer holds a single roots array for the
// session), so a selection is a Map lookup, not a walk of ~3,900 nodes.
const indexes = new WeakMap<readonly WinePlaceTreeNode[], Map<string, Located>>();
function indexTree(roots: readonly WinePlaceTreeNode[]): Map<string, Located> {
  let index = indexes.get(roots);
  if (index) return index;
  index = new Map();
  const stack: Located[] = roots.map((node) => ({ node, parent: null }));
  while (stack.length > 0) {
    const entry = stack.pop()!;
    index.set(entry.node.key, entry);
    for (const child of entry.node.children) stack.push({ node: child, parent: entry.node });
  }
  indexes.set(roots, index);
  return index;
}

/** A key's display tier when only the key is known (the context fallback):
    countries have one segment, regions two, everything deeper is a shard
    feature. */
function tierFromKey(key: string): number {
  return Math.min(key.split(".").length - 1, 2);
}

function flag(states: SelectionStates, sourceId: string, id: string, name: keyof SelectionFlags) {
  let bucket = states.get(sourceId);
  if (!bucket) states.set(sourceId, (bucket = new Map()));
  const flags = bucket.get(id) ?? {};
  flags[name] = true;
  bucket.set(id, flags);
}

function mark(states: SelectionStates, key: string, tier: number, name: keyof SelectionFlags) {
  const shard = shardKeyFor(key);
  if (tier <= 1) flag(states, WORLD_SOURCE_ID, shard ?? key, name);
  if (tier >= 1 && shard) flag(states, shardSourceId(shard), key, name);
}

export function selectionFeatureStates(input: {
  roots: readonly WinePlaceTreeNode[] | null;
  selectedKey: string | null;
  fallback: { childKeys: readonly string[]; parentKey: string | null } | null;
}): SelectionStates {
  const states: SelectionStates = new Map();
  const { roots, selectedKey, fallback } = input;
  if (!selectedKey) return states;
  const located = roots ? indexTree(roots).get(selectedKey) : undefined;
  if (located) {
    const { node, parent } = located;
    mark(states, node.key, node.tier, "sel");
    for (const child of node.children) {
      mark(states, child.key, child.tier, "child");
      mark(states, child.key, child.tier, "rel");
    }
    if (parent) {
      mark(states, parent.key, parent.tier, "rel");
      for (const sibling of parent.children) {
        if (sibling !== node) mark(states, sibling.key, sibling.tier, "rel");
      }
    }
    return states;
  }
  mark(states, selectedKey, tierFromKey(selectedKey), "sel");
  if (fallback) {
    for (const key of fallback.childKeys) {
      mark(states, key, tierFromKey(key), "child");
      mark(states, key, tierFromKey(key), "rel");
    }
    if (fallback.parentKey) mark(states, fallback.parentKey, tierFromKey(fallback.parentKey), "rel");
  }
  return states;
}
