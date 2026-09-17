// The tile map's fixed fill palette: which slug each polygon colours by, and
// the discover-once latch behind the classification ramp.
//
// MapLibre expressions cannot hash a string, so the map colours an area through
// a `match` from its slug to a palette index. That table used to be built from
// whatever the viewport scan had seen so far — every newly scanned area
// rewrote the fill and outline paint of every layer, and each rewrite made
// MapLibre reload that source's tiles. The explorer already loads the whole
// verified place tree, which names every place the tiles carry, so the table
// is derived from it once, up front, and never changes for the session.
import type { WinePlaceTreeNode } from "./tree";

/** The hash behind the map's district palette (`districtColor` in
    tile-wine-map.tsx): a plain 31-multiplier string hash. It lives here so the
    palette arms in the fill expression and the legend swatches agree byte for
    byte — a slug's colour is `DISTRICT_PALETTE[districtHash(slug) % 12]`
    wherever it is drawn. */
export function districtHash(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h;
}

function lastSegment(key: string): string {
  return key.split(".").at(-1) ?? key;
}

/** Every value the `area_key` and `group` tile properties can take, derived
    from the place tree exactly the way scripts/wine-map-tiles/export.mjs
    derives them for the tiles:
    - `group` is the third canonical-key segment (a region's top areas — medoc,
      graves, cote-de-nuits), present on every key of three or more segments.
    - `area_key` is the last segment of the place's AREA: for a tier >= 2 place,
      its nearest tier-3 ancestor-or-self (a Burgundy village, so climats
      inherit the village hue), else its tier-2 ancestor-or-self (a district,
      or a Champagne sub-region, whose villages hang off the region by key but
      parent onto the sub-region — hence the walk is by parent, never by key
      segment); a place with neither falls back to its `group`.
    Both are collected, since the map's area expression coalesces `area_key`
    then `group` (tiles from before `area_key` existed carry only the latter).
    Sorted and de-duplicated, so an unchanged tree yields an equal list. */
export function areaSlugsFromTree(roots: WinePlaceTreeNode[]): string[] {
  const slugs = new Set<string>();
  // Explicit stack (node + its ancestor chain, nearest first) rather than
  // recursion: the tree has a few thousand nodes and the chain is what the
  // area walk reads.
  const stack: { node: WinePlaceTreeNode; lineage: WinePlaceTreeNode[] }[] =
    roots.map((node) => ({ node, lineage: [] }));
  while (stack.length > 0) {
    const { node, lineage } = stack.pop()!;
    const segments = node.key.split(".");
    const group = segments.length >= 3 ? segments[2] : null;
    let area: WinePlaceTreeNode | null = null;
    if (node.tier >= 2) {
      let tier2: WinePlaceTreeNode | null = null;
      for (const cursor of [node, ...lineage]) {
        if (cursor.tier === 3) {
          area = cursor;
          break;
        }
        if (cursor.tier === 2) tier2 = cursor;
        if (cursor.tier < 2) break;
      }
      area ??= tier2;
    }
    const areaKey = area ? lastSegment(area.key) : group;
    if (areaKey) slugs.add(areaKey);
    if (group) slugs.add(group);
    const childLineage = [node, ...lineage];
    for (const child of node.children) stack.push({ node: child, lineage: childLineage });
  }
  return [...slugs].sort();
}

/** Split the slugs into one arm per palette colour — arm i holds every slug
    whose `districtHash` lands on palette index i — so the fill expression is
    one `match` with at most `size` arms, each labelled by a list of slugs,
    instead of one arm per slug carrying its own shade sub-expression. Empty
    strings (the area expression's "no area" fallback) are dropped; arms are
    sorted so equal input yields an equal expression. */
export function paletteArms(slugs: readonly string[], size: number): string[][] {
  const arms: string[][] = Array.from({ length: size }, () => []);
  for (const slug of new Set(slugs)) {
    if (!slug) continue;
    arms[districtHash(slug) % size].push(slug);
  }
  for (const arm of arms) arm.sort();
  return arms;
}

/** The classification ramp (grand cru darkest, premier cru mid, village land
    plain) is comparative: it only makes sense where at least two levels exist —
    an all-grand-cru region like Alsace has nothing to be darker THAN. That
    used to be decided per viewport, which rewrote the paint on every gesture
    that changed the set of levels in view. The tree does not carry a place's
    classification, so the decision is discovered instead: a region joins the
    ramped set the first time a scan sees two or more levels among its own
    features, and never leaves it. One paint rewrite per region per session at
    most, and never one for a region that only ever shows one level.
    Per REGION rather than per area on purpose: a Burgundy village with no
    premier cru sits between villages that have them, and today the viewport
    rule ramps all three together — per area it would render its village land
    at a different wash from its neighbours'. Returns `prev` itself when nothing
    new was found, so a state update can bail out. */
export function latchRampedRegions(
  prev: string[],
  levelsByRegion: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const next = new Set(prev);
  for (const [region, levels] of levelsByRegion) {
    if (levels.size >= 2) next.add(region);
  }
  return next.size === prev.length ? prev : [...next].sort();
}
