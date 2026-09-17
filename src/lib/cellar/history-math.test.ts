import { describe, expect, it } from "vitest";
import {
  HISTORY_FILTERS, HISTORY_PAGE, actionWord, filterCounts, filterLabel, filterRows, monthBuckets, monthLine,
  rowsInYear, showRestLabel, visibleBuckets, whereLine, yearBand, yearTotals, yearsPresent,
} from "./history-math";
import type { HistoryRow } from "./types";

let seq = 0;
function row(over: Partial<HistoryRow> & { on: string }): HistoryRow {
  seq += 1;
  return {
    id: `c${seq}`, lotId: "lot1", catalogWineId: "w1", title: "Vietti, Barolo Castiglione 2017", reason: "DRANK", quantity: 1,
    consumedOn: over.on, createdAt: `${over.on}T12:00:00Z`, occasion: null, note: null, tasting: null, ...over,
  };
}
const t = { id: "t1", name: "Nebbiolo vs Sangiovese" };
const rows: HistoryRow[] = [
  row({ on: "2026-09-11", occasion: "Nebbiolo vs Sangiovese", tasting: t, note: { id: "n1", score: 85 } }),
  row({ on: "2026-09-09", occasion: "Tuesday dinner", note: { id: "n2", score: 91 } }),
  row({ on: "2026-09-04", occasion: "Loire whites, six ways", tasting: { id: "t2", name: "Loire whites, six ways" }, quantity: 2, note: { id: "n3", score: 88 } }),
  row({ on: "2026-09-02", reason: "GIFTED", occasion: "Anders, for the move" }),
  row({ on: "2026-08-21", tasting: { id: "t3", name: "Rhône, north and south" }, note: { id: "n4", score: 90 } }),
  row({ on: "2026-08-02", occasion: "Sunday lamb" }),
  row({ on: "2026-08-01", reason: "LOST" }),
  row({ on: "2025-05-11", reason: "GIFTED", occasion: "Maja" }),
];

describe("years and totals", () => {
  it("lists years newest first and totals a year", () => {
    expect(yearsPresent(rows)).toEqual([2026, 2025]);
    const y = rowsInYear(rows, 2026);
    expect(y).toHaveLength(7);
    expect(yearTotals(y)).toEqual({ bottles: 8, atTasting: 4, atHome: 2, gifted: 1, writtenUp: 5, notWrittenUp: 3 });
  });
  it("the band on both widths", () => {
    const t26 = yearTotals(rowsInYear(rows, 2026));
    expect(yearBand(t26, 2026, { phone: false })).toEqual({ headline: "8 bottles in 2026", split: "4 at a tasting · 2 at home · 1 gifted", notes: "5 you wrote up · 3 you did not" });
    expect(yearBand(t26, 2026, { phone: true })).toEqual({ headline: "8", split: "4 at a tasting · 2 at home · 1 gifted", notes: "bottles · 5 written up" });
  });
});

describe("filters", () => {
  const y = rowsInYear(rows, 2026);
  it("five filters, counted in bottles", () => {
    expect(HISTORY_FILTERS).toEqual(["all", "drank", "gifted", "tasting", "noNote"]);
    expect(filterCounts(y)).toEqual({ all: 8, drank: 6, gifted: 1, tasting: 4, noNote: 3 });
    expect(filterRows(y, "tasting").map((r) => r.consumedOn)).toEqual(["2026-09-11", "2026-09-04", "2026-08-21"]);
    expect(filterRows(y, "noNote").map((r) => r.consumedOn)).toEqual(["2026-09-02", "2026-08-02", "2026-08-01"]);
    expect(filterRows(y, "gifted")).toHaveLength(1);
  });
  it("labels on both widths", () => {
    expect(filterLabel("all", 64, { phone: false })).toBe("Everything 64");
    expect(filterLabel("tasting", 41, { phone: false })).toBe("At a tasting 41");
    expect(filterLabel("noNote", 22, { phone: false })).toBe("Without a note 22");
    expect(filterLabel("all", 64, { phone: true })).toBe("All 64");
    expect(filterLabel("tasting", 41, { phone: true })).toBe("Tastings 41");
    expect(filterLabel("noNote", 22, { phone: true })).toBe("No note 22");
    expect(filterLabel("drank", 59, { phone: true })).toBe("Drank 59");
  });
});

describe("months and rows", () => {
  const b = monthBuckets(rowsInYear(rows, 2026));
  it("buckets newest first with subtotals", () => {
    expect(b.map((x) => [x.key, x.label, x.bottles, x.writtenUp])).toEqual([["2026-09", "September 2026", 5, 4], ["2026-08", "August 2026", 3, 1]]);
    expect(b[0].rows.map((r) => r.consumedOn)).toEqual(["2026-09-11", "2026-09-09", "2026-09-04", "2026-09-02"]);
    expect(monthLine(b[0], { phone: false })).toBe("5 bottles · 4 written up");
    expect(monthLine(b[0], { phone: true })).toBe("5 bottles");
  });
  it("where each bottle went", () => {
    expect(whereLine(rows[0], { phone: false })).toEqual({ kind: "tasting", tastingId: "t1", name: "Nebbiolo vs Sangiovese" });
    expect(whereLine(rows[1], { phone: false })).toEqual({ kind: "text", text: "at home · Tuesday dinner" });
    expect(whereLine(rows[3], { phone: false })).toEqual({ kind: "text", text: "to Anders, for the move" });
    expect(whereLine(rows[5], { phone: true })).toEqual({ kind: "text", text: "at home · Sunday lamb" });
    expect(whereLine(rows[6], { phone: false })).toEqual({ kind: "text", text: "lost" });
    expect(whereLine(row({ on: "2026-01-01", reason: "OTHER" }), { phone: false })).toEqual({ kind: "text", text: "taken out" });
    expect(whereLine(row({ on: "2026-01-01", reason: "GIFTED" }), { phone: false })).toEqual({ kind: "text", text: "gifted" });
  });
  it("action words", () => {
    expect(actionWord(rows[0])).toBe("Drank 1");
    expect(actionWord(rows[2])).toBe("Drank 2");
    expect(actionWord(rows[3])).toBe("Gifted 1");
    expect(actionWord(rows[6])).toBe("Lost 1");
    expect(actionWord(row({ on: "2026-01-01", reason: "OTHER", quantity: 3 }))).toBe("Removed 3");
  });
});

describe("show the rest", () => {
  it("keeps 25 rows, then hides the rest until expanded", () => {
    const many = Array.from({ length: 40 }, (_, i) => row({ on: `2026-${i < 20 ? "09" : "08"}-${String(28 - (i % 20)).padStart(2, "0")}` }));
    const b = monthBuckets(many);
    const cut = visibleBuckets(b, false);
    expect(cut.buckets.reduce((n, x) => n + x.rows.length, 0)).toBe(HISTORY_PAGE);
    expect(cut.buckets[1].rows).toHaveLength(5);
    expect(cut.hiddenRows).toBe(15);
    expect(visibleBuckets(b, true).hiddenRows).toBe(0);
    expect(showRestLabel(2026)).toBe("Show the rest of 2026");
  });
});
