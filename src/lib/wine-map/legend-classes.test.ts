// The legend's classification rows and the ramp latch only ever see the three
// classes the legend has rows for, so a US shard (regional/subregional AVA
// levels, spec 2026-09-29 D4) never shows an empty "Classification" heading and
// never ramps.
import { describe, expect, it } from "vitest";
import { latchRampedRegions } from "./fill-palette";
import { legendClassOf } from "./legend-classes";

function scan(features: Record<string, unknown>[]) {
  const classifications = new Set<string>();
  const levelsByRegion = new Map<string, Set<string>>();
  for (const p of features) {
    const cls = legendClassOf(p);
    if (!cls) continue;
    classifications.add(cls);
    const region = p.region as string;
    if (!levelsByRegion.has(region)) levelsByRegion.set(region, new Set());
    levelsByRegion.get(region)!.add(cls);
  }
  return { classifications: [...classifications].sort(), levelsByRegion };
}

describe("legendClassOf", () => {
  it("keeps only the three classes the legend has rows for", () => {
    expect(legendClassOf({ classification: "grand_cru" })).toBe("grand_cru");
    expect(legendClassOf({ classification: "premier_cru", level: "communal" })).toBe("premier_cru");
    expect(legendClassOf({ classification: null, level: "communal" })).toBe("communal");
    expect(legendClassOf({ classification: "", level: "communal" })).toBe("communal");
    expect(legendClassOf({ classification: "constructor" })).toBeNull();
    expect(legendClassOf({})).toBeNull();
  });

  it("gives US AVAs no legend class, so no heading and no ramp", () => {
    const { classifications, levelsByRegion } = scan([
      { region: "california", classification: "regional", level: "regional" },
      { region: "california", classification: "subregional", level: "subregional" },
      { region: "oregon", classification: null, level: "subregional" },
    ]);
    expect(classifications).toEqual([]);
    expect(latchRampedRegions([], levelsByRegion)).toEqual([]);
  });

  it("still ramps a region with two real classes", () => {
    const { levelsByRegion } = scan([
      { region: "bourgogne", classification: "grand_cru" },
      { region: "bourgogne", classification: "communal" },
    ]);
    expect(latchRampedRegions([], levelsByRegion)).toEqual(["bourgogne"]);
  });
});
