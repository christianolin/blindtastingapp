// The folded producer lookup's tie-break (owner approval 3, 2026-09-13; migration
// 20260914112500_producer_lookup_exact_then_wines). snapshotLookup mirrors
// find_producer_by_folded_name: among producers whose names fold equal it prefers
//   1. the given region;
//   2. the exact spelling, lower(name) = lower(btrim(query));
//   3. a producer that holds wines (a catalog_wines or wine_answers row, the
//      snapshot's has_wines);
//   4. any region link;
//   5. the name, then the id.
// Each "beats" case runs both ways round, so the key decides whatever the names
// would sort to.
import { describe, expect, it } from "vitest";
import { snapshotLookup, type ReferenceSnapshot } from "./__fixtures__/snapshot-lookup";

type Producer = ReferenceSnapshot["producers"][number];

const snapshot = (producers: Producer[]): ReferenceSnapshot => ({
  countries: [{ id: "fr", name: "France" }],
  regions: [
    { id: "bg", name: "Bourgogne", country_id: "fr" },
    { id: "rh", name: "Rhône", country_id: "fr" },
  ],
  appellations: [],
  none: [],
  producers,
  grapes: [],
  type_designations: [],
});

const pick = async (producers: Producer[], name: string, regionId: string | null) =>
  (await snapshotLookup(snapshot(producers)).producerByFoldedName(name, regionId))?.id ?? null;

describe("producerByFoldedName tie-break (20260914112500)", () => {
  it("the given region beats the exact spelling and held wines", async () => {
    const hyphen: Producer = { id: "hyphen", name: "Vidal-Fleury", region_id: "rh", has_wines: true };
    const spaced: Producer = { id: "spaced", name: "Vidal Fleury", region_id: "bg" };
    expect(await pick([hyphen, spaced], "Vidal-Fleury", "bg")).toBe("spaced");
    expect(await pick([hyphen, spaced], "Vidal Fleury", "rh")).toBe("hyphen");
  });

  it("the exact spelling beats held wines and a region link", async () => {
    const dotted: Producer = { id: "dotted", name: "J.M. Boillot", region_id: "bg", has_wines: true };
    const spaced: Producer = { id: "spaced", name: "J. M. Boillot", region_id: null };
    expect(await pick([dotted, spaced], "J. M. Boillot", null)).toBe("spaced");
    expect(await pick([dotted, spaced], "J. M. Boillot", "rh")).toBe("spaced");
    const swapped = [{ ...dotted, region_id: null, has_wines: false }, { ...spaced, region_id: "bg", has_wines: true }];
    expect(await pick(swapped, "J.M. Boillot", null)).toBe("dotted");
  });

  it("the exact spelling ignores case and surrounding spaces, as lower(btrim()) does, but btrim trims spaces only", async () => {
    const hyphen: Producer = { id: "hyphen", name: "Vidal-Fleury", region_id: null };
    const spaced: Producer = { id: "spaced", name: "Vidal Fleury", region_id: "rh", has_wines: true };
    expect(await pick([hyphen, spaced], "  VIDAL-FLEURY ", null)).toBe("hyphen");
    expect(await pick([hyphen, spaced], "\tVidal-Fleury", null)).toBe("spaced");
  });

  it("held wines beat a region link when no spelling is exact", async () => {
    const wines: Producer = { id: "wines", name: "Vidal Fleury", region_id: null, has_wines: true };
    const linked: Producer = { id: "linked", name: "Vidal-Fleury", region_id: "rh" };
    expect(await pick([wines, linked], "Vidal–Fleury", null)).toBe("wines");
    expect(await pick([wines, linked], "Vidal–Fleury", "bg")).toBe("wines");
    const swapped = [{ ...wines, region_id: "rh", has_wines: false }, { ...linked, region_id: null, has_wines: true }];
    expect(await pick(swapped, "Vidal–Fleury", null)).toBe("linked");
  });

  it("a region link beats the name; then the name, then the id", async () => {
    const spaced: Producer = { id: "spaced", name: "Vidal Fleury", region_id: null };
    const hyphen: Producer = { id: "hyphen", name: "Vidal-Fleury", region_id: "rh" };
    expect(await pick([spaced, hyphen], "Vidal–Fleury", null)).toBe("hyphen");
    expect(await pick([{ ...spaced, region_id: "rh" }, { ...hyphen, region_id: null }], "Vidal–Fleury", null)).toBe("spaced");
    const first = ["Vidal-Fleury", "Vidal Fleury"].sort((a, b) => a.localeCompare(b))[0];
    expect(await pick([hyphen, { ...spaced, region_id: "rh" }], "Vidal–Fleury", null)).toBe(first === "Vidal Fleury" ? "spaced" : "hyphen");
    expect(await pick([{ id: "z", name: "Paitin", region_id: null }, { id: "a", name: "Paitin", region_id: null }], "PAITIN ", null)).toBe("a");
  });

  it("an absent has_wines counts as false, so a snapshot exported before the field resolves as before", async () => {
    const absent: Producer[] = [
      { id: "spaced", name: "Vidal Fleury", region_id: "rh" },
      { id: "hyphen", name: "Vidal-Fleury", region_id: "rh" },
    ];
    const explicit = absent.map((p) => ({ ...p, has_wines: false }));
    for (const query of ["Vidal–Fleury", "Vidal Fleury", "Vidal-Fleury"]) {
      expect(await pick(absent, query, "rh")).toBe(await pick(explicit, query, "rh"));
    }
    expect(await pick([absent[0], { ...absent[1], has_wines: true }], "Vidal–Fleury", "rh")).toBe("hyphen");
  });

  it("a name that folds to nothing, or to no producer, finds nothing", async () => {
    const rows: Producer[] = [{ id: "p", name: "Vidal-Fleury", region_id: "rh", has_wines: true }];
    expect(await pick(rows, " – ", "rh")).toBeNull();
    expect(await pick(rows, "Guigal", "rh")).toBeNull();
  });

  // The two duplicate sets approval 3 merges, as they stood live on 2026-09-13
  // (read-only check). Until the merges run, and for any later duplicate of the same
  // shape: a label spelled like the copy that holds the wines finds that copy, a
  // label spelled like another copy finds that exact copy, and a spelling that
  // matches no copy exactly finds the copy that holds the wines.
  describe("the duplicate shapes approval 3 merges", () => {
    const boillot: Producer[] = [
      { id: "266af94b", name: "J.M. Boillot", region_id: "bg", has_wines: true },
      { id: "745fc108", name: "J. M. Boillot", region_id: "bg" },
      { id: "b50dfcdf", name: "J. M.Boillot", region_id: "bg" },
    ];
    it.each([
      ["J.M. Boillot", "bg", "266af94b"],
      ["J.M. Boillot", null, "266af94b"],
      ["J. M. Boillot", "bg", "745fc108"],
      ["J. M.Boillot", null, "b50dfcdf"],
      ["JM Boillot", "bg", "266af94b"],
      ["Jean-Marc Boillot", "bg", null],
    ] as const)("J.M. Boillot: %j with region %j finds %j", async (query, regionId, id) => {
      expect(await pick(boillot, query, regionId)).toBe(id);
    });

    const vidal: Producer[] = [
      { id: "58116bac", name: "Vidal-Fleury", region_id: "rh", has_wines: true },
      { id: "9f9c976f", name: "Vidal Fleury", region_id: "rh" },
    ];
    it.each([
      ["Vidal-Fleury", "rh", "58116bac"],
      ["Vidal-Fleury", null, "58116bac"],
      ["Vidal Fleury", "rh", "9f9c976f"],
      ["VIDAL–FLEURY", "rh", "58116bac"],
    ] as const)("Vidal-Fleury: %j with region %j finds %j", async (query, regionId, id) => {
      expect(await pick(vidal, query, regionId)).toBe(id);
    });
  });
});
