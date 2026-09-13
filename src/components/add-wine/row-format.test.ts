import { describe, expect, it } from "vitest";
import {
  bottlesLabel,
  catalogMeta,
  cellarListState,
  cellarLotMeta,
  existingLotLabel,
  filterLots,
  glassNumbers,
  mergeCardCopy,
  pourableBottles,
  rackChips,
  searchCellarMeta,
  searchListGroups,
  skippedLotNotice,
  tastedMeta,
  windowContains,
  type CellarSheetLot,
} from "./row-format";
import type { SearchGroups } from "./types";

function lot(over: Partial<CellarSheetLot> = {}): CellarSheetLot {
  return {
    lotId: "l1",
    catalogWineId: "w1",
    title: "Brovia, Barolo Villero 2016",
    imageUrl: null,
    rack: "Rack B",
    quantity: 2,
    drinkNow: true,
    inFlight: false,
    glass: null,
    ...over,
  };
}

describe("windowContains", () => {
  it("is false with no window at all", () => {
    expect(windowContains(null, null, 2026)).toBe(false);
  });
  it("respects each known bound", () => {
    expect(windowContains(2024, 2030, 2026)).toBe(true);
    expect(windowContains(2027, null, 2026)).toBe(false);
    expect(windowContains(null, 2025, 2026)).toBe(false);
    expect(windowContains(2026, 2026, 2026)).toBe(true);
  });
});

describe("bottlesLabel", () => {
  it("pluralises", () => {
    expect(bottlesLabel(1)).toBe("1 bottle");
    expect(bottlesLabel(2)).toBe("2 bottles");
    expect(bottlesLabel(0)).toBe("0 bottles");
  });
});

describe("searchCellarMeta (7e)", () => {
  it("joins rack · bottles · drink now", () => {
    expect(
      searchCellarMeta({ rack: "Rack B", quantity: 2, drinkNow: true }),
    ).toBe("Rack B · 2 bottles · drink now");
  });
  it("drops a missing rack and a closed window", () => {
    expect(searchCellarMeta({ rack: null, quantity: 1, drinkNow: false })).toBe(
      "1 bottle",
    );
  });
});

describe("catalogMeta (7e)", () => {
  it("shows the rating and note count", () => {
    expect(catalogMeta({ avgScore: 94.6, noteCount: 22, subtitle: null })).toBe(
      "★ 95 · 22 notes",
    );
    expect(catalogMeta({ avgScore: 91, noteCount: 1, subtitle: null })).toBe(
      "★ 91 · 1 note",
    );
  });
  it("falls back to the origin line when nobody has rated it", () => {
    expect(
      catalogMeta({ avgScore: null, noteCount: 0, subtitle: "Barbaresco DOCG · Piemonte" }),
    ).toBe("Barbaresco DOCG · Piemonte");
    expect(catalogMeta({ avgScore: null, noteCount: 0, subtitle: null })).toBe(
      "No notes yet",
    );
  });
});

describe("tastedMeta (7e)", () => {
  const now = new Date(Date.UTC(2026, 8, 12));
  it("says when you rated it, month only within the year", () => {
    expect(tastedMeta({ myScore: 92, tastedOn: "2026-05-14" }, now)).toBe(
      "you rated it 92 in May",
    );
  });
  it("adds the year for an older note and copes without a score", () => {
    expect(tastedMeta({ myScore: 88, tastedOn: "2024-11-02" }, now)).toBe(
      "you rated it 88 in November 2024",
    );
    expect(tastedMeta({ myScore: null, tastedOn: "2026-01-30" }, now)).toBe(
      "you tasted it in January",
    );
  });
  it("survives an unparseable date", () => {
    expect(tastedMeta({ myScore: 90, tastedOn: "" }, now)).toBe("you rated it 90");
  });
});

describe("cellarLotMeta (7f)", () => {
  it("joins rack · bottles · in its window", () => {
    expect(cellarLotMeta(lot())).toBe("Rack B · 2 bottles · in its window");
  });
  it("names the glass a bottle already fills", () => {
    expect(cellarLotMeta(lot({ inFlight: true, glass: 1, drinkNow: false }))).toBe(
      "Rack B · 2 bottles · already glass 1",
    );
  });
  it("keeps a withheld glass number private", () => {
    expect(cellarLotMeta(lot({ inFlight: true, glass: null, rack: null }))).toBe(
      "2 bottles · in its window",
    );
  });
});

// S2 regression pin (plan §S2 Tests): the knowledge rule's glass number. The
// rack is the stored `storage_location`, printed as typed — so the fixture
// stores "rack B" for the handoff's "rack B · …" meta (the plan's `rack: "B"`
// would print "B · …"; the meta has never prefixed the word).
describe("cellarLotMeta and the knowledge rule", () => {
  const lot: CellarSheetLot = { lotId: "l1", catalogWineId: "c1", title: "Vietti, Barolo Castiglione 2017", imageUrl: null, rack: "rack B", quantity: 2, drinkNow: true, inFlight: true, glass: 1 };
  it("an in-flight lot names its glass only when the caller may know it (C.9)", () => {
    expect(cellarLotMeta(lot)).toBe("rack B · 2 bottles · already glass 1");
    expect(cellarLotMeta({ ...lot, glass: null })).toBe(cellarLotMeta({ ...lot, inFlight: false, glass: null }));
  });
});

describe("searchListGroups (A5)", () => {
  const cellarRow = (lotId: string, catalogWineId: string, o: Partial<SearchGroups["cellar"][number]> = {}) => ({
    lotId, catalogWineId, title: `Lot ${lotId}`, imageUrl: null, rack: "Rack B", quantity: 2, drinkNow: true, inFlight: false, ...o,
  });
  const catalogRow = (catalogWineId: string): SearchGroups["catalog"][number] => ({
    catalogWineId, title: `Wine ${catalogWineId}`, subtitle: null, imageUrl: null, avgScore: null, noteCount: 0, inFlight: false,
    producerId: "p", wineName: null, appellationId: "a", vintageLabel: "2018",
  });
  const tastedRow = (catalogWineId: string): SearchGroups["tasted"][number] => ({
    catalogWineId, title: `Wine ${catalogWineId}`, imageUrl: null, myScore: 92, tastedOn: "2026-05-14",
    producerId: "p", wineName: null, appellationId: "a", vintageLabel: "2018", inFlight: false,
  });
  const groups: SearchGroups = {
    cellar: [cellarRow("l1", "c1"), cellarRow("l2", "c1", { rack: "Rack C" })],
    catalog: [catalogRow("c1"), catalogRow("c2")],
    tasted: [tastedRow("c1"), tastedRow("c3")],
  };
  const shape = (order: readonly ("cellar" | "catalog" | "tasted")[], g: SearchGroups = groups) =>
    searchListGroups(g, order).map((group) => [group.kind, group.rows.map((r) => ("lotId" in r ? r.lotId : r.catalogWineId))]);

  it("follows the matrix's group order and lists a wine you own once, as its lot rows", () => {
    expect(shape(["cellar", "catalog", "tasted"])).toEqual([
      ["cellar", ["l1", "l2"]],
      ["catalog", ["c2"]],
      ["tasted", ["c3"]],
    ]);
  });
  it("without the cellar group (the catalog destination) nothing is dropped", () => {
    expect(shape(["catalog", "tasted"])).toEqual([
      ["catalog", ["c1", "c2"]],
      ["tasted", ["c1", "c3"]],
    ]);
  });
  it("leaves out empty groups", () => {
    expect(shape(["cellar", "catalog", "tasted"], { cellar: [], catalog: [catalogRow("c2")], tasted: [] })).toEqual([["catalog", ["c2"]]]);
  });
  it("counts the bottles you can pour tonight: drink-now lots only", () => {
    expect(pourableBottles([cellarRow("l1", "c1", { quantity: 2 }), cellarRow("l2", "c2", { quantity: 3, drinkNow: false }), cellarRow("l3", "c3", { quantity: 4 })])).toBe(6);
    expect(pourableBottles([])).toBe(0);
  });
});

describe("the merge card and its way out (plan amendment 18, D17)", () => {
  it("offers the two adds, then \"Don't add it\"", () => {
    expect(mergeCardCopy(3)).toEqual({
      title: "You already have this wine in your cellar.",
      actions: [
        { id: "merge", label: "Add 3 to the existing lot" },
        { id: "separate", label: "Keep as a separate lot" },
        { id: "skip", label: "Don't add it" },
      ],
    });
    expect(mergeCardCopy(1).actions[0].label).toBe("Add 1 to the existing lot");
  });
  it("names an existing lot by its bottles and rack", () => {
    expect(existingLotLabel({ quantity: 2, storageLocation: "Rack B" })).toBe("2 btl · Rack B");
    expect(existingLotLabel({ quantity: 1, storageLocation: null })).toBe("1 btl");
    expect(existingLotLabel({ quantity: 1, storageLocation: "  " })).toBe("1 btl");
  });
  it("after a skip: one line and a link to the lot you already have", () => {
    expect(skippedLotNotice("lot-9")).toEqual({
      line: "Not added — it's already in your cellar",
      open: "Open it",
      href: "/cellar/lot-9/edit",
    });
  });
});

describe("rackChips", () => {
  it("lists distinct racks in order, skipping blanks", () => {
    const lots = [
      lot({ rack: "Rack C" }),
      lot({ rack: "Rack A" }),
      lot({ rack: null }),
      lot({ rack: "Rack A" }),
      lot({ rack: "  " }),
    ];
    expect(rackChips(lots)).toEqual(["Rack A", "Rack C"]);
  });
});

describe("filterLots", () => {
  const lots = [
    lot({ lotId: "a", rack: "Rack A", drinkNow: true }),
    lot({ lotId: "b", rack: "Rack B", drinkNow: false }),
    lot({ lotId: "c", rack: null, drinkNow: true }),
  ];
  it("returns everything with no filter", () => {
    expect(filterLots(lots, null).map((l) => l.lotId)).toEqual(["a", "b", "c"]);
  });
  it("filters by drink window and by rack", () => {
    expect(filterLots(lots, { kind: "drinkNow" }).map((l) => l.lotId)).toEqual(["a", "c"]);
    expect(filterLots(lots, { kind: "rack", rack: "Rack B" }).map((l) => l.lotId)).toEqual(["b"]);
  });
});

describe("cellarListState (A6's list area)", () => {
  const sheet = { lots: [lot()], totalBottles: 2 };
  it("spins while the cellar loads, and says so when the load fails", () => {
    expect(cellarListState({ sheet: null, loadFailed: false, visibleCount: 0 })).toBe("loading");
    expect(cellarListState({ sheet: null, loadFailed: true, visibleCount: 0 })).toBe("failed");
  });
  it("keeps a cellar already in hand when a later reload fails", () => {
    expect(cellarListState({ sheet, loadFailed: true, visibleCount: 1 })).toBe("list");
  });
  it("tells an empty cellar from a filter that hides every lot", () => {
    expect(
      cellarListState({ sheet: { lots: [], totalBottles: 0 }, loadFailed: false, visibleCount: 0 }),
    ).toBe("empty");
    expect(cellarListState({ sheet, loadFailed: false, visibleCount: 0 })).toBe("filteredEmpty");
    expect(cellarListState({ sheet, loadFailed: false, visibleCount: 1 })).toBe("list");
  });
});

describe("glassNumbers", () => {
  it("numbers wines by list order, not the stored position", () => {
    const map = glassNumbers([
      { id: "x", position: 7 },
      { id: "y", position: 2 },
      { id: "z", position: 40 },
    ]);
    expect(map.get("y")).toBe(1);
    expect(map.get("x")).toBe(2);
    expect(map.get("z")).toBe(3);
  });
});
