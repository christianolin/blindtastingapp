// Cellar rows: dimensions, header stats, search, sort, filter, grouping,
// paging and footer copy (CC-P1). Pure: runtime imports from ./format only.
import { describe, expect, it } from "vitest";
import {
  DIMENSION_GROUP, EMPTY_FILTERS, GROUP_CAP, GROUP_LABELS, GROUP_ORDER, NO_PLACE, SORT_LABELS, STRIP_CAPTION,
  applyFilters, clearFilter, dimensionCounts, filterChips, filterCount, filterOptions, foldSearch, footerLine,
  groupHeaderLine, groupRows, headerStats, headerSubtitle, matchesSearch, pageLabel, pageSlice, placeText, rangeLabel,
  rowLines, searchPlaceholder, showMoreLabel, sortRows, visibleGroups,
} from "./cellar-rows";
import type { BottleRow } from "./types";

let seq = 0;
function row(over: {
  id?: string; wineId?: string; producer?: string | null; name?: string | null; year?: number | null; kind?: "YEAR" | "NV" | "TAWNY";
  grape?: string | null; colour?: "RED" | "WHITE" | "ROSE" | "ORANGE" | null; designation?: string | null;
  appellation?: string | null; region?: string | null; country?: string | null; qty?: number; bought?: number;
  place?: string | null; created?: string; yours?: number | null; avg?: number | null; count?: number; inFlight?: number;
} = {}): BottleRow {
  seq += 1;
  const id = over.id ?? `lot${seq}`;
  const wineId = over.wineId ?? `wine${seq}`;
  return {
    lot: {
      id, quantity: over.qty ?? 1, purchasedQuantity: over.bought ?? over.qty ?? 1, bottleSizeMl: 750,
      storageLocation: over.place === undefined ? "Cellar, rack B" : over.place, purchasedOn: null, purchaseSource: null,
      pricePerBottle: null, currency: "DKK", drinkFrom: null, drinkTo: null, lotNote: null,
      createdAt: over.created ?? `2024-01-${String(seq).padStart(2, "0")}T00:00:00Z`,
    },
    wine: {
      catalogWineId: wineId, title: `${over.producer ?? "P"} ${over.name ?? "W"}`,
      producer: over.producer === undefined ? "Vietti" : over.producer,
      wineName: over.name === undefined ? "Barolo Castiglione" : over.name,
      vintageKind: over.kind ?? "YEAR", vintageYear: over.year === undefined ? 2017 : over.year, vintageTawnyYears: null,
      primaryGrape: over.grape === undefined ? "Nebbiolo" : over.grape, colour: over.colour === undefined ? "RED" : over.colour,
      style: "STILL", designation: over.designation ?? null,
      appellation: over.appellation === undefined ? "Barolo DOCG" : over.appellation,
      region: over.region === undefined ? "Piedmont" : over.region, country: over.country === undefined ? "Italy" : over.country,
      imageUrl: null,
    },
    community: { avg: over.avg === undefined ? 92.6 : over.avg, count: over.count ?? 33 },
    yours: over.yours === undefined ? { noteId: `n${seq}`, score: 88, tastedOn: "2026-08-02" } : over.yours === null ? null : { noteId: `n${seq}`, score: over.yours, tastedOn: "2026-08-02" },
    inFlight: over.inFlight ?? 0,
  };
}

const cellar: BottleRow[] = [
  row({ id: "a", wineId: "w1", producer: "Produttori del Barbaresco", name: "Barbaresco Riserva Asili", year: 2016, designation: "Riserva", appellation: "Barbaresco DOCG", qty: 6, place: "Cellar, rack B", yours: 92, avg: 93.4, count: 41, created: "2023-11-05T00:00:00Z" }),
  row({ id: "b", wineId: "w2", producer: "Vietti", name: "Barolo Castiglione", year: 2017, qty: 3, bought: 6, place: "rack B", yours: null, avg: 92.6, created: "2024-03-01T00:00:00Z" }),
  row({ id: "c", wineId: "w3", producer: "Casa Raia", name: "Brunello di Montalcino", year: 2018, grape: "Sangiovese", appellation: "Brunello di Montalcino DOCG", region: "Tuscany", qty: 2, place: "Cellar, rack C", yours: 91, avg: 92.4, count: 28, inFlight: 1, created: "2024-03-02T00:00:00Z" }),
  row({ id: "d", wineId: "w4", producer: "Weingut Keller", name: "Riesling Grosses Gewächs", year: 2018, grape: "Riesling", colour: "WHITE", designation: "Grosses Gewächs", appellation: "Rheinhessen", region: "Rheinhessen", country: "Germany", qty: 4, place: "Cellar, rack A", yours: 93, avg: 94.2, count: 36, created: "2024-06-01T00:00:00Z" }),
  row({ id: "e", wineId: "w5", producer: "Passopisciaro", name: "Etna Rosso", year: 2020, grape: "Nerello Mascalese", appellation: "Etna DOC", region: "Sicily", qty: 1, place: "Kitchen rack", yours: null, avg: 89.7, count: 12, created: "2026-01-01T00:00:00Z" }),
  row({ id: "f", wineId: "w6", producer: "Vietti", name: "Barolo Castiglione", year: 2015, qty: 2, place: null, yours: null, avg: null, count: 0, created: "2022-09-01T00:00:00Z" }),
];

describe("dimensions and header", () => {
  it("counts distinct countries, regions, producers, grapes and vintages", () => {
    expect(dimensionCounts(cellar)).toEqual({ countries: 2, regions: 4, producers: 5, grapes: 4, vintages: 5 });
    expect(DIMENSION_GROUP.countries).toBe("country");
    expect(DIMENSION_GROUP.vintages).toBe("vintage");
    expect(STRIP_CAPTION.startsWith("The shape of what you own")).toBe(true);
  });
  it("header stats and subtitle in three forms", () => {
    const s = headerStats(cellar);
    expect(s).toEqual({ bottles: 18, wines: 6, tasted: 3, producers: 5, countries: 2 });
    expect(headerSubtitle(s, { phone: false, readOnly: false })).toBe("18 bottles · 6 wines · you have tasted 3 of them");
    expect(headerSubtitle(s, { phone: true, readOnly: false })).toBe("18 bottles · 6 wines · 3 tasted");
    expect(headerSubtitle(s, { phone: false, readOnly: true })).toBe("18 bottles · 6 wines");
    expect(headerSubtitle({ ...s, bottles: 1, wines: 1, tasted: 1 }, { phone: false, readOnly: false })).toBe("1 bottle · 1 wine · you have tasted 1 of them");
  });
});

describe("search", () => {
  it("folds accents and matches the whole identity plus the place", () => {
    expect(foldSearch("Gewürztraminer")).toBe("gewurztraminer");
    expect(matchesSearch(cellar[3], foldSearch("gewachs"))).toBe(true);
    expect(matchesSearch(cellar[0], foldSearch("rack b"))).toBe(true);
    expect(matchesSearch(cellar[0], foldSearch("riserva"))).toBe(true);
    expect(matchesSearch(cellar[0], foldSearch("sangiovese"))).toBe(false);
    expect(matchesSearch(cellar[0], "")).toBe(true);
  });
  it("placeholders", () => {
    expect(searchPlaceholder(142, { phone: false })).toBe("Wine, producer, grape or where it is");
    expect(searchPlaceholder(142, { phone: true })).toBe("Search 142 bottles");
  });
});

describe("filters", () => {
  it("applies each key and counts the set ones", () => {
    expect(applyFilters(cellar, { ...EMPTY_FILTERS, country: "Italy" }).map((r) => r.lot.id)).toEqual(["a", "b", "c", "e", "f"]);
    expect(applyFilters(cellar, { ...EMPTY_FILTERS, region: "Tuscany" }).map((r) => r.lot.id)).toEqual(["c"]);
    expect(applyFilters(cellar, { ...EMPTY_FILTERS, colour: "WHITE" }).map((r) => r.lot.id)).toEqual(["d"]);
    expect(applyFilters(cellar, { ...EMPTY_FILTERS, grape: "Nebbiolo" }).map((r) => r.lot.id)).toEqual(["a", "b", "f"]);
    expect(applyFilters(cellar, { ...EMPTY_FILTERS, vintage: "2018" }).map((r) => r.lot.id)).toEqual(["c", "d"]);
    expect(filterCount({ ...EMPTY_FILTERS, country: "Italy", grape: "Nebbiolo" })).toBe(2);
  });
  it("options carry bottle counts under the other filters, regions scoped to the country", () => {
    const o = filterOptions(cellar, { ...EMPTY_FILTERS, country: "Italy" });
    expect(o.region.map((x) => [x.label, x.count])).toEqual([["Piedmont", 11], ["Sicily", 1], ["Tuscany", 2]]);
    expect(o.country.map((x) => [x.label, x.count])).toEqual([["Germany", 4], ["Italy", 14]]);
    expect(o.colour.map((x) => x.label)).toEqual(["Red"]);
    expect(o.grape.map((x) => x.label)).toEqual(["Nebbiolo", "Nerello Mascalese", "Sangiovese"]);
    expect(o.vintage.map((x) => x.label)).toEqual(["2020", "2018", "2017", "2016", "2015"]);
  });
  it("chips and clearing (the country clears its region)", () => {
    const f = { ...EMPTY_FILTERS, country: "Italy", region: "Piedmont", colour: "RED" as const };
    expect(filterChips(f)).toEqual([{ key: "country", label: "Italy" }, { key: "region", label: "Piedmont" }, { key: "colour", label: "Red" }]);
    expect(clearFilter(f, "country")).toEqual({ ...EMPTY_FILTERS, colour: "RED" });
    expect(clearFilter(f, "colour")).toEqual({ ...EMPTY_FILTERS, country: "Italy", region: "Piedmont" });
  });
});

describe("sort", () => {
  it("most bottles, name, added, your score, community — untasted and unrated last", () => {
    expect(sortRows(cellar, "bottles").map((r) => r.lot.id)).toEqual(["a", "d", "b", "f", "c", "e"]);
    expect(sortRows(cellar, "name").map((r) => r.lot.id)).toEqual(["a", "f", "b", "c", "e", "d"]);
    expect(sortRows(cellar, "added").map((r) => r.lot.id)).toEqual(["e", "d", "c", "b", "a", "f"]);
    expect(sortRows(cellar, "yours").map((r) => r.lot.id)).toEqual(["d", "a", "c", "b", "e", "f"]);
    expect(sortRows(cellar, "community").map((r) => r.lot.id)).toEqual(["d", "a", "b", "c", "e", "f"]);
    expect(SORT_LABELS.bottles).toBe("Most bottles");
    expect(SORT_LABELS.community).toBe("Community rating");
  });
});

describe("grouping", () => {
  it("none groups nothing; the dropdown order and labels are the mock's", () => {
    expect(groupRows(cellar, "none")).toEqual([]);
    expect(GROUP_ORDER).toEqual(["none", "where", "country", "region", "appellation", "producer", "grape", "vintage", "colour"]);
    expect(GROUP_LABELS.where).toBe("Where it is");
  });
  it("where: exact spellings are separate groups, No place set is last", () => {
    const g = groupRows(cellar, "where");
    expect(g.map((x) => x.label)).toEqual(["Cellar, rack B", "Cellar, rack A", "rack B", "Cellar, rack C", "Kitchen rack", NO_PLACE]);
    expect(g[0].stats).toEqual({ bottles: 6, wines: 1, tasted: 1, regions: 1, appellations: 1, producers: 1 });
    expect(g[5].rows.map((r) => r.lot.id)).toEqual(["f"]);
  });
  it("country headers count regions and producers; region headers name the country and count appellations", () => {
    const c = groupRows(cellar, "country");
    expect(c.map((x) => [x.label, x.sublabel])).toEqual([["Italy", null], ["Germany", null]]);
    expect(groupHeaderLine("country", c[0].stats, { phone: false, readOnly: false })).toBe("14 bottles · 5 wines · 3 regions · 4 producers · you have tasted 2");
    const r = groupRows(cellar, "region");
    expect(r[0].label).toBe("Piedmont");
    expect(r[0].sublabel).toBe("Italy");
    expect(groupHeaderLine("region", r[0].stats, { phone: false, readOnly: false })).toBe("11 bottles · 3 wines · 2 appellations · 2 producers · you have tasted 1");
    expect(groupHeaderLine("region", { ...r[0].stats, appellations: 1 }, { phone: false, readOnly: false })).toBe("11 bottles · 3 wines · 1 appellation · 2 producers · you have tasted 1");
    expect(groupHeaderLine("producer", r[0].stats, { phone: false, readOnly: false })).toBe("11 bottles · 3 wines · you have tasted 1");
    expect(groupHeaderLine("where", r[0].stats, { phone: true, readOnly: false })).toBe("11 bottles · 1 tasted");
    expect(groupHeaderLine("where", r[0].stats, { phone: false, readOnly: true })).toBe("11 bottles · 3 wines · 2 producers");
  });
  it("vintage and colour group by label; producer by name", () => {
    expect(groupRows(cellar, "vintage").map((x) => x.label)).toEqual(["2016", "2018", "2017", "2015", "2020"]);
    expect(groupRows(cellar, "colour").map((x) => x.label)).toEqual(["Red", "White"]);
    expect(groupRows(cellar, "producer")[0].label).toBe("Produttori del Barbaresco");
  });
  it("caps at eight groups with a show-more line", () => {
    const many = Array.from({ length: 11 }, (_, i) => row({ country: `Country ${i}`, qty: 11 - i }));
    const groups = groupRows(many, "country");
    expect(groups).toHaveLength(11);
    expect(visibleGroups(groups, false).shown).toHaveLength(GROUP_CAP);
    expect(visibleGroups(groups, false).hidden).toBe(3);
    expect(visibleGroups(groups, true).hidden).toBe(0);
    expect(showMoreLabel(3, "country")).toBe("Show 3 more countries");
    expect(showMoreLabel(1, "region")).toBe("Show 1 more region");
    expect(showMoreLabel(5, "where")).toBe("Show 5 more places");
  });
});

describe("what a row keeps under each grouping", () => {
  const a = cellar[0];
  it("ungrouped keeps everything", () => {
    const l = rowLines(a, "none");
    expect(l.producer).toBe("Produttori del Barbaresco");
    expect(l.title).toBe("Barbaresco Riserva Asili 2016");
    expect(l.facts).toBe("Nebbiolo · Red · Riserva");
    expect(placeText(l.place)).toBe("Barbaresco DOCG · Piedmont, Italy");
    expect(l.where).toBe("Cellar, rack B");
  });
  it("drops what the header said", () => {
    expect(placeText(rowLines(a, "country").place)).toBe("Barbaresco DOCG · Piedmont");
    expect(placeText(rowLines(a, "region").place)).toBe("Barbaresco DOCG");
    expect(placeText(rowLines(a, "appellation").place)).toBe("Piedmont, Italy");
    expect(rowLines(a, "producer").producer).toBeNull();
    expect(rowLines(a, "grape").facts).toBe("Red · Riserva");
    expect(rowLines(a, "colour").facts).toBe("Nebbiolo · Riserva");
    expect(rowLines(a, "vintage").title).toBe("Barbaresco Riserva Asili");
    expect(rowLines(a, "where").where).toBeNull();
    expect(rowLines(cellar[5], "none").where).toBeNull();
  });
  it("a wine with no designation has a two-part facts line; a self-named appellation is not said twice", () => {
    expect(rowLines(cellar[1], "none").facts).toBe("Nebbiolo · Red");
    expect(placeText(rowLines(cellar[3], "none").place)).toBe("Rheinhessen, Germany");
  });
});

describe("paging and footer", () => {
  it("slices, clamps and labels", () => {
    const rows = Array.from({ length: 34 }, (_, i) => i);
    expect(pageSlice(rows, 1, 24).rows).toHaveLength(24);
    expect(pageSlice(rows, 2, 24)).toEqual({ rows: rows.slice(24), page: 2, pages: 2 });
    expect(pageSlice(rows, 9, 24).page).toBe(2);
    expect(pageSlice([], 1, 25)).toEqual({ rows: [], page: 1, pages: 1 });
    expect(pageLabel(1, 6)).toBe("Page 1 of 6");
    expect(rangeLabel(1, 8, 34)).toBe("1–8 of 34");
    expect(rangeLabel(2, 25, 30)).toBe("26–30 of 30");
  });
  it("the footer names the filters, the shape and the grouping", () => {
    const stats = { bottles: 142, wines: 96, tasted: 61, producers: 48, countries: 11 };
    expect(footerLine({ chips: [], group: "none", stats, readOnly: false })).toBe("All · across 96 wines, 48 producers and 11 countries · nothing filtered, nothing grouped");
    expect(footerLine({ chips: [{ key: "country", label: "Italy" }], group: "region", stats: { ...stats, countries: 1 }, readOnly: false })).toBe("Italy · across 96 wines, 48 producers and 1 country · 1 filter, grouped by region");
    expect(footerLine({ chips: [{ key: "country", label: "Italy" }, { key: "colour", label: "Red" }], group: "none", stats, readOnly: false })).toBe("Italy · Red · across 96 wines, 48 producers and 11 countries · 2 filters, nothing grouped");
  });
});
