import { describe, expect, it } from "vitest";
import { COLLECTION_TOP, averageTile, bestTile, bottlesTile, collectionStats, decadeLabel, panelEyebrow, tastedTile } from "./collection-math";
import type { BottleRow } from "./types";

let seq = 0;
function row(o: { wineId?: string; producer?: string; name?: string; year?: number | null; kind?: "YEAR" | "NV" | "TAWNY"; grape?: string; colour?: "RED" | "WHITE" | "ROSE" | "ORANGE"; region?: string; country?: string; qty?: number; yours?: number | null; avg?: number | null }): BottleRow {
  seq += 1;
  return {
    lot: { id: `l${seq}`, quantity: o.qty ?? 1, purchasedQuantity: o.qty ?? 1, bottleSizeMl: 750, storageLocation: null, purchasedOn: null, purchaseSource: null, pricePerBottle: null, currency: "DKK", drinkFrom: null, drinkTo: null, lotNote: null, createdAt: "2024-01-01T00:00:00Z" },
    wine: { catalogWineId: o.wineId ?? `w${seq}`, title: "", producer: o.producer ?? "Vietti", wineName: o.name ?? "Barolo", vintageKind: o.kind ?? "YEAR", vintageYear: o.year === undefined ? 2017 : o.year, vintageTawnyYears: null, primaryGrape: o.grape ?? "Nebbiolo", colour: o.colour ?? "RED", style: "STILL", designation: null, appellation: "Barolo DOCG", region: o.region ?? "Piedmont", country: o.country ?? "Italy", imageUrl: null },
    community: { avg: o.avg === undefined ? 92 : o.avg, count: o.avg == null ? 0 : 10 },
    yours: o.yours === undefined || o.yours === null ? null : { noteId: `n${seq}`, score: o.yours, tastedOn: "2026-01-01" },
    inFlight: 0,
  };
}

const rows = [
  row({ wineId: "a", producer: "Quintarelli", name: "Amarone", year: 2015, region: "Veneto", qty: 2, yours: 95, avg: 96.1 }),
  row({ wineId: "b", producer: "Vietti", year: 2017, qty: 3, yours: null, avg: 92.6 }),
  row({ wineId: "b", producer: "Vietti", year: 2017, qty: 1, yours: null, avg: 92.6 }),
  row({ wineId: "c", producer: "Keller", name: "GG", year: 2018, grape: "Riesling", colour: "WHITE", region: "Rheinhessen", country: "Germany", qty: 4, yours: 93, avg: 94.2 }),
  row({ wineId: "d", producer: "Fontodi", name: "Flaccianello", year: 2019, grape: "Sangiovese", region: "Tuscany", qty: 2, yours: 88, avg: null }),
  row({ wineId: "e", producer: "Krug", name: "Grande Cuvée", kind: "NV", year: null, grape: "Chardonnay", colour: "WHITE", region: "Champagne", country: "France", qty: 1, yours: null, avg: 95 }),
  row({ wineId: "f", producer: "Vietti", name: "Barbera", year: 2001, grape: "Barbera", qty: 1, yours: 84, avg: 86 }),
];

describe("collectionStats", () => {
  const s = collectionStats(rows);
  it("counts bottles, wines, tasted and the distinct dimensions", () => {
    expect(s.bottles).toBe(14);
    expect(s.wines).toBe(6);
    expect(s.tasted).toBe(4);
    expect(s.toGo).toBe(2);
    expect([s.countries, s.regions, s.producers, s.grapes, s.years]).toEqual([3, 5, 5, 5, 5]);
  });
  it("compares your average with the community's on the same wines only", () => {
    // a (95 vs 96.1), c (93 vs 94.2), f (84 vs 86); d has no community average, b and e no note of yours
    expect(s.yourAverage).toBe(90.7);
    expect(s.communityAverage).toBe(92.1);
  });
  it("names the best you own", () => {
    expect(s.best).toEqual({ score: 96.1, title: "Quintarelli, Amarone 2015" });
  });
  it("panels by bottles, decades newest first with No vintage last", () => {
    expect(s.byRegion).toEqual([{ label: "Piedmont", value: 5 }, { label: "Rheinhessen", value: 4 }, { label: "Tuscany", value: 2 }, { label: "Veneto", value: 2 }, { label: "Champagne", value: 1 }]);
    expect(s.byProducer[0]).toEqual({ label: "Vietti", value: 5 });
    expect(s.byGrape[0]).toEqual({ label: "Nebbiolo", value: 6 });
    expect(s.byColour).toEqual([{ label: "Red", value: 9 }, { label: "White", value: 5 }]);
    expect(s.byDecade).toEqual([{ label: "2010s", value: 12 }, { label: "2000s", value: 1 }, { label: "No vintage", value: 1 }]);
    expect(decadeLabel({ vintageKind: "TAWNY", vintageYear: null })).toBe("No vintage");
  });
  it("caps every value panel at eight", () => {
    const many = Array.from({ length: 12 }, (_, i) => row({ producer: `P${i}`, qty: 12 - i }));
    expect(collectionStats(many).byProducer).toHaveLength(COLLECTION_TOP);
  });
  it("is empty-safe", () => {
    const e = collectionStats([]);
    expect(e.bottles).toBe(0);
    expect(e.yourAverage).toBeNull();
    expect(e.best).toBeNull();
    expect(e.byDecade).toEqual([]);
  });
});

describe("tiles and eyebrows", () => {
  const s = collectionStats(rows);
  it("headline tiles on both widths", () => {
    expect(bottlesTile(s, { phone: false })).toEqual({ value: "14", sub: "across 6 wines" });
    expect(bottlesTile(s, { phone: true })).toEqual({ value: "14", sub: "bottles · 6 wines" });
    expect(tastedTile(s, { phone: false })).toEqual({ label: "You have tasted", value: "4", sub: "of the 6 · 2 to go" });
    expect(tastedTile(s, { phone: true })).toEqual({ label: "tasted", value: "4", sub: "2 to go" });
    expect(averageTile(s, { phone: false })).toEqual({ label: "Your average", value: "90.7", sub: "community 92.1 on the same wines" });
    expect(averageTile(s, { phone: true })).toEqual({ label: "your average", value: "90.7", sub: "community: 92.1" });
    expect(bestTile(s)).toEqual({ label: "Best you own", value: "96.1", sub: "Quintarelli, Amarone 2015" });
  });
  it("eyebrows", () => {
    expect(panelEyebrow("region", s)).toBe("3 countries · 5 regions");
    expect(panelEyebrow("producer", s)).toBe("5 producers");
    expect(panelEyebrow("grape", s)).toBe("5 grapes");
    expect(panelEyebrow("colour", s)).toBeNull();
    expect(panelEyebrow("decade", s)).toBe("5 years");
  });
});
