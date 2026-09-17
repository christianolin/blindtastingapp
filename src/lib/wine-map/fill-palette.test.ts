import { describe, expect, it } from "vitest";
import type { WinePlaceTreeNode } from "./tree";
import {
  areaSlugsFromTree,
  districtHash,
  latchRampedRegions,
  paletteArms,
} from "./fill-palette";

function node(
  key: string,
  tier: number,
  children: WinePlaceTreeNode[] = [],
): WinePlaceTreeNode {
  return {
    id: key,
    key,
    name: key.split(".").at(-1) ?? key,
    kind: "APPELLATION",
    tier,
    parent_key: key.includes(".") ? key.slice(0, key.lastIndexOf(".")) : null,
    has_children: children.length > 0,
    children,
  };
}

// A cut of the real catalogue shapes: Burgundy's village-then-climat depth,
// Champagne's sub-region whose villages parent onto it but are keyed off the
// region, and a Bordeaux district with an appellation directly beneath.
const TREE: WinePlaceTreeNode[] = [
  node("france", 0, [
    node("france.bourgogne", 1, [
      node("france.bourgogne.cote-de-nuits", 2, [
        node("france.bourgogne.cote-de-nuits.gevrey-chambertin", 3, [
          node("france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin", 4),
        ]),
      ]),
    ]),
    node("france.champagne", 1, [
      node("france.champagne.montagne-de-reims", 2, [
        // Keyed off the region (segment 2 is the village), parented onto the
        // sub-region, and deeper than tier 3 — the walk must land on the
        // sub-region, not on the key segment.
        node("france.champagne.ay", 4),
      ]),
    ]),
    node("france.bordeaux", 1, [
      node("france.bordeaux.medoc", 2, [node("france.bordeaux.medoc.pauillac", 3)]),
    ]),
  ]),
];

describe("districtHash", () => {
  it("is the 31-multiplier hash the map's districtColor has always used", () => {
    // Hand-computed: "ab" -> 97 * 31 + 98.
    expect(districtHash("ab")).toBe(97 * 31 + 98);
    expect(districtHash("")).toBe(0);
    // Stays a 32-bit unsigned value however long the slug is.
    const h = districtHash("a-very-long-appellation-slug-with-many-segments");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});

describe("areaSlugsFromTree", () => {
  it("mirrors export.mjs: tier-3 self, tier-2 fallback, and the key-segment group", () => {
    const slugs = areaSlugsFromTree(TREE);
    // Chambertin (tier 4) inherits its village; the village is its own area.
    expect(slugs).toContain("gevrey-chambertin");
    // Aÿ has no tier-3 ancestor, so its area is the tier-2 sub-region — and
    // its own key segment "ay" is still present as the `group` value.
    expect(slugs).toContain("montagne-de-reims");
    expect(slugs).toContain("ay");
    // A Bordeaux appellation at tier 3 is its own area; the district stays
    // both as a tier-2 area (for itself) and as everyone's group.
    expect(slugs).toContain("pauillac");
    expect(slugs).toContain("medoc");
    expect(slugs).toContain("cote-de-nuits");
    // Countries and regions have two-segment keys: no group, no area.
    expect(slugs).not.toContain("france");
    expect(slugs).not.toContain("bourgogne");
    expect(slugs).not.toContain("champagne");
    // Never the climat itself: it colours by its village.
    expect(slugs).not.toContain("chambertin");
  });

  it("is sorted and de-duplicated", () => {
    const slugs = areaSlugsFromTree(TREE);
    expect(slugs).toEqual([...new Set(slugs)].sort());
  });

  it("handles an empty tree", () => {
    expect(areaSlugsFromTree([])).toEqual([]);
  });
});

describe("paletteArms", () => {
  it("puts every slug in the arm its hash selects, sorted, once", () => {
    const slugs = ["pauillac", "medoc", "gevrey-chambertin", "medoc", ""];
    const arms = paletteArms(slugs, 12);
    expect(arms).toHaveLength(12);
    expect(arms.flat().sort()).toEqual(["gevrey-chambertin", "medoc", "pauillac"]);
    for (const [i, arm] of arms.entries()) {
      for (const slug of arm) expect(districtHash(slug) % 12).toBe(i);
      expect(arm).toEqual([...arm].sort());
    }
  });

  it("yields only empty arms for no slugs", () => {
    expect(paletteArms([], 3)).toEqual([[], [], []]);
  });
});

describe("latchRampedRegions", () => {
  const levels = (entries: [string, string[]][]) =>
    new Map(entries.map(([region, list]) => [region, new Set(list)]));

  it("adds a region the first time two levels are seen among its features", () => {
    expect(
      latchRampedRegions(
        [],
        levels([
          ["bourgogne", ["communal", "grand_cru"]],
          ["alsace", ["grand_cru"]],
        ]),
      ),
    ).toEqual(["bourgogne"]);
  });

  it("never drops a region once latched, even if a later scan sees one level", () => {
    expect(
      latchRampedRegions(["bourgogne"], levels([["bourgogne", ["communal"]]])),
    ).toEqual(["bourgogne"]);
  });

  it("returns the same array when nothing changes, so setState can bail out", () => {
    const prev = ["bourgogne"];
    expect(latchRampedRegions(prev, levels([["alsace", ["grand_cru"]]]))).toBe(prev);
    expect(latchRampedRegions(prev, levels([]))).toBe(prev);
  });

  it("does not latch on two levels spread across two regions", () => {
    expect(
      latchRampedRegions(
        [],
        levels([
          ["alsace", ["grand_cru"]],
          ["bourgogne", ["communal"]],
        ]),
      ),
    ).toEqual([]);
  });

  it("keeps the result sorted", () => {
    expect(
      latchRampedRegions(
        ["champagne"],
        levels([["bourgogne", ["communal", "premier_cru"]]]),
      ),
    ).toEqual(["bourgogne", "champagne"]);
  });
});
