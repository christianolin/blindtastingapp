import { describe, expect, it } from "vitest";
import {
  bottlesLabel,
  catalogMeta,
  cellarLotMeta,
  filterLots,
  glassNumbers,
  rackChips,
  searchCellarMeta,
  tastedMeta,
  windowContains,
  type CellarSheetLot,
} from "./row-format";

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
