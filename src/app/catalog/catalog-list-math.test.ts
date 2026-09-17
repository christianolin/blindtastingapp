import { describe, expect, it } from "vitest";
import {
  CATALOG_FILTERS, CATALOG_PAGE, DEFAULT_SORT, applyCatalogFilter, bandAverage, bandLinePhone, bandParts, catalogFilterCounts,
  catalogFilterLabel, catalogPageLine, factsLine, matchesCatalogSearch, ownedBadge, phoneFactsLine, sortCatalog, sortedByWord, yourLine,
  type CatalogRow,
} from "./catalog-list-math";

let seq = 0;
const row = (o: Partial<CatalogRow> = {}): CatalogRow => {
  seq += 1;
  return {
    id: `w${seq}`, producer: "Vietti", name: "Barolo Castiglione 2017", title: "Vietti Barolo Castiglione Barolo DOCG 2017",
    colour: "RED", style: "STILL", country: "Italy", region: "Piedmont", appellation: "Barolo DOCG", grapes: ["Nebbiolo"],
    designation: null, vintage: "2017", imageUrl: null, avgScore: 92.6, noteCount: 33, appearances: 6, cellarBottles: 34,
    yours: null, owned: 0, addedAt: `2026-01-${String(seq).padStart(2, "0")}T00:00:00Z`, ...o,
  };
};
const rows = [
  row({ id: "a", avgScore: 95.8, noteCount: 58, yours: 96, owned: 2 }),
  row({ id: "b", avgScore: 96.1, noteCount: 52, yours: 95, owned: 0, designation: "Classico" }),
  row({ id: "c", avgScore: null, noteCount: 0, yours: null, owned: 4, country: "Germany", region: "Rheinhessen", appellation: "Rheinhessen", grapes: ["Riesling"], colour: "WHITE" }),
  row({ id: "d", avgScore: 94.8, noteCount: 29, yours: null, owned: 0 }),
];

describe("filters", () => {
  it("three filters with counts and labels", () => {
    expect(CATALOG_FILTERS).toEqual(["all", "cellar", "tasted"]);
    expect(catalogFilterCounts(rows)).toEqual({ all: 4, cellar: 2, tasted: 2 });
    expect(applyCatalogFilter(rows, "cellar").map((r) => r.id)).toEqual(["a", "c"]);
    expect(applyCatalogFilter(rows, "tasted").map((r) => r.id)).toEqual(["a", "b"]);
    expect(catalogFilterLabel("all", 4, { phone: false })).toBe("Everything");
    expect(catalogFilterLabel("cellar", 96, { phone: false })).toBe("In my cellar 96");
    expect(catalogFilterLabel("tasted", 61, { phone: false })).toBe("I have tasted 61");
    expect(catalogFilterLabel("tasted", 61, { phone: true })).toBe("Tasted 61");
  });
  it("search covers the identity", () => {
    expect(matchesCatalogSearch(rows[2], "riesling")).toBe(true);
    expect(matchesCatalogSearch(rows[2], "rheinhessen")).toBe(true);
    expect(matchesCatalogSearch(rows[0], "riesling")).toBe(false);
  });
});

describe("sort and paging", () => {
  it("defaults to newest added; community rating puts unrated last", () => {
    expect(DEFAULT_SORT).toEqual({ key: "added", dir: "desc" });
    expect(sortCatalog(rows, { key: "avgScore", dir: "desc" }).map((r) => r.id)).toEqual(["b", "a", "d", "c"]);
    expect(sortCatalog(rows, { key: "avgScore", dir: "asc" }).map((r) => r.id)).toEqual(["d", "a", "b", "c"]);
    expect(sortCatalog(rows, DEFAULT_SORT).map((r) => r.id)).toEqual(["d", "c", "b", "a"]);
    expect(sortedByWord({ key: "avgScore", dir: "desc" })).toBe("community rating");
    expect(sortedByWord(DEFAULT_SORT)).toBe("newest added");
    expect(CATALOG_PAGE).toBe(25);
    expect(catalogPageLine(1, 25, 8412, { key: "avgScore", dir: "desc" })).toBe("1–25 of 8,412 · sorted by community rating");
    expect(catalogPageLine(2, 25, 30, DEFAULT_SORT)).toBe("26–30 of 30 · sorted by newest added");
  });
});

describe("band and row strings", () => {
  it("weighted average and the band parts", () => {
    expect(bandAverage([{ avg: 90, count: 3 }, { avg: 94, count: 1 }, { avg: null, count: 0 }])).toBe(91);
    expect(bandAverage([])).toBeNull();
    const b = { wines: 8412, notes: 3106, average: 90.4, yourNotes: 61, owned: 96 };
    expect(bandParts(b)).toEqual({ wines: "8,412", notes: "3,106", average: "90.4" });
    expect(bandLinePhone(b)).toBe("8,412 wines · 3,106 notes shared");
    expect(yourLine(b)).toEqual({ notes: "61", owned: "96" });
    expect(bandParts({ ...b, average: null }).average).toBeNull();
  });
  it("owned badge and facts lines", () => {
    expect(ownedBadge(2)).toBe("2 owned");
    expect(ownedBadge(0)).toBeNull();
    expect(factsLine(rows[1])).toBe("Nebbiolo · Red · Classico");
    expect(factsLine(rows[0])).toBe("Nebbiolo · Red");
    expect(phoneFactsLine(rows[0])).toBe("Nebbiolo · Barolo DOCG · Piedmont");
    expect(phoneFactsLine(rows[2])).toBe("Riesling · Rheinhessen, Germany");
  });
});
