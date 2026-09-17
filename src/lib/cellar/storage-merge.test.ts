import { describe, expect, it } from "vitest";
import { foldPlace, mergeGroups, mergeNotice } from "./storage-merge";

const lot = (storageLocation: string | null, quantity: number) => ({ storageLocation, quantity });

describe("foldPlace", () => {
  it("trims, collapses whitespace and ignores case, but keeps accents", () => {
    expect(foldPlace("  Rack  B ")).toBe("rack b");
    expect(foldPlace("rack B")).toBe("rack b");
    expect(foldPlace("Kælder")).toBe("kælder");
    expect(foldPlace("Kaelder")).not.toBe(foldPlace("Kælder"));
  });
});

describe("mergeGroups", () => {
  it("returns nothing when every place is spelt one way", () => {
    expect(mergeGroups([lot("Rack A", 2), lot("Rack B", 3), lot(null, 1)])).toEqual([]);
  });
  it("groups spellings that fold equal and suggests the most-used one", () => {
    const g = mergeGroups([lot("rack B", 3), lot("Rack B", 6), lot("Rack B", 2), lot("rack  b", 1), lot("Rack A", 4)]);
    expect(g).toHaveLength(1);
    expect(g[0].target).toBe("Rack B");
    expect(g[0].variants).toEqual([
      { spelling: "Rack B", bottles: 8, lots: 2 },
      { spelling: "rack B", bottles: 3, lots: 1 },
      { spelling: "rack  b", bottles: 1, lots: 1 },
    ]);
  });
  it("breaks a bottle tie on lot count, then on spelling", () => {
    expect(mergeGroups([lot("kitchen", 4), lot("Kitchen", 2), lot("Kitchen", 2)])[0].target).toBe("Kitchen");
    expect(mergeGroups([lot("floor", 2), lot("Floor", 2)])[0].target).toBe("Floor");
  });
  it("ignores blank places", () => {
    expect(mergeGroups([lot("", 1), lot("   ", 1), lot(null, 1)])).toEqual([]);
  });
});

describe("mergeNotice", () => {
  it("is the C3 notice for one pair", () => {
    const n = mergeNotice(mergeGroups([lot("rack B", 3), lot("Rack B", 6)]));
    expect(n).toEqual({
      title: "Two places look like one.",
      body: "“Rack B” and “rack B” are separate groups because the field is free text. Grouping is where that becomes visible, so it is also where it should be fixable.",
      button: "Merge them",
    });
  });
  it("counts spellings and groups beyond one pair (plan copy)", () => {
    const n = mergeNotice(mergeGroups([lot("rack B", 3), lot("Rack B", 6), lot("rack  b", 1), lot("kitchen", 1), lot("Kitchen", 1)]));
    expect(n?.title).toBe("Five places look like two.");
  });
  it("is null with nothing to merge", () => {
    expect(mergeNotice([])).toBeNull();
  });
});
