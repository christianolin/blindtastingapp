import { describe, expect, it } from "vitest";
import { blendNeedsReplace, storableBlend } from "./blend-sync";

const seeded = { primaryGrapeId: "g1", secondaryGrapeId: "g2" };
const row = (grapeId: string, percentage: number | null = null) => ({ grapeId, percentage });
describe("blendNeedsReplace (fillCatalogWine's rule, byhand-4/6)", () => {
  it("replaces a trigger-seeded blend with a different incoming blend", () =>
    expect(blendNeedsReplace([row("g1"), row("g2")], seeded, [row("g1", 70), row("g2", 20), row("g3", 10)])).toBe(true));
  it("never overwrites a curated blend", () =>
    expect(blendNeedsReplace([row("g1", 60), row("g2", 40)], seeded, [row("g1", 100)])).toBe(false));
  it("does nothing when incoming equals stored", () =>
    expect(blendNeedsReplace([row("g1")], { primaryGrapeId: "g1", secondaryGrapeId: null }, [row("g1")])).toBe(false));
  it("treats extra stored rows as curated", () =>
    expect(blendNeedsReplace([row("g1"), row("g2"), row("g3")], seeded, [row("g1", 100)])).toBe(false));

  // Edge cases of the same rule.
  it("never writes an empty incoming blend", () =>
    expect(blendNeedsReplace([row("g1")], { primaryGrapeId: "g1", secondaryGrapeId: null }, [])).toBe(false));
  it("adds percentages to a seeded single grape", () =>
    expect(blendNeedsReplace([row("g1")], { primaryGrapeId: "g1", secondaryGrapeId: null }, [row("g1", 100)])).toBe(true));
  it("replaces a seeded blend when incoming leads with the other grape", () =>
    expect(blendNeedsReplace([row("g1"), row("g2")], seeded, [row("g2"), row("g1")])).toBe(true));
  it("reads a seed whose secondary equals its primary as one row (the trigger's on conflict)", () =>
    expect(blendNeedsReplace([row("g1")], { primaryGrapeId: "g1", secondaryGrapeId: "g1" }, [row("g1", 60), row("g2", 40)])).toBe(true));
  it("treats a stored grape the seed never wrote as curated", () =>
    expect(blendNeedsReplace([row("g1"), row("g9")], seeded, [row("g1", 100)])).toBe(false));
});

describe("storableBlend (what catalog_wine_grapes can hold)", () => {
  it("keeps one row per grape, the first wins", () =>
    expect(storableBlend([row("g1", 60), row("g2", 40), row("g1", 10)])).toEqual([row("g1", 60), row("g2", 40)]));
  it("drops a row with no grape id", () =>
    expect(storableBlend([row(""), row("g1")])).toEqual([row("g1")]));
  it("keeps a percentage only in (0, 100] at two decimals, like numeric(5,2) and its check", () =>
    expect(storableBlend([row("g1", 150), row("g2", 33.333), row("g3", 0), row("g4", 0.004), row("g5", Number.NaN)]))
      .toEqual([row("g2", 33.33), row("g1"), row("g3"), row("g4"), row("g5")]));
  it("orders by percentage when any is set, nulls last, ties in row order (the recompute trigger's rule)", () =>
    expect(storableBlend([row("g1"), row("g2", 20), row("g3", 70), row("g4", 20)]))
      .toEqual([row("g3", 70), row("g2", 20), row("g4", 20), row("g1")]));
  it("keeps row order when no percentage is set", () =>
    expect(storableBlend([row("g2"), row("g1")])).toEqual([row("g2"), row("g1")]));
});
