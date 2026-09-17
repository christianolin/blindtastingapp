import { describe, expect, it } from "vitest";
import {
  addedMonth,
  bottleTitle,
  colourWord,
  countTimes,
  dayMonth,
  dayMonthYear,
  drunkLine,
  fmtAvg,
  fmtScore,
  inFlightLine,
  isLastOne,
  lotTitle,
  monthLabel,
  monthYear,
  plural,
  sizeLabel,
  sizeSub,
  vintageLabel,
} from "./format";
import type { BottleWine } from "./types";

const wine = (over: Partial<BottleWine> = {}): BottleWine => ({
  catalogWineId: "w1",
  title: "Vietti Barolo Castiglione Barolo DOCG 2017",
  producer: "Vietti",
  wineName: "Barolo Castiglione",
  vintageKind: "YEAR",
  vintageYear: 2017,
  vintageTawnyYears: null,
  primaryGrape: "Nebbiolo",
  colour: "RED",
  style: "STILL",
  designation: null,
  appellation: "Barolo DOCG",
  region: "Piedmont",
  country: "Italy",
  imageUrl: null,
  ...over,
});

describe("titles", () => {
  it("the row title is the name and its vintage; the producer leads the lot title", () => {
    expect(bottleTitle(wine())).toBe("Barolo Castiglione 2017");
    expect(lotTitle(wine())).toBe("Vietti, Barolo Castiglione 2017");
    expect(bottleTitle(wine(), { dropVintage: true })).toBe(
      "Barolo Castiglione",
    );
  });
  it("falls back to the appellation, then the producer, then Untitled wine", () => {
    expect(bottleTitle(wine({ wineName: null, vintageYear: 2018 }))).toBe(
      "Barolo DOCG 2018",
    );
    expect(bottleTitle(wine({ wineName: null, appellation: null }))).toBe(
      "Vietti 2017",
    );
    expect(lotTitle(wine({ wineName: null, appellation: null }))).toBe(
      "Vietti 2017",
    );
    expect(
      bottleTitle(wine({ wineName: null, appellation: null, producer: null })),
    ).toBe("Untitled wine");
    expect(lotTitle(wine({ producer: null }))).toBe("Barolo Castiglione 2017");
  });
  it("vintage labels follow catalogWineTitle", () => {
    expect(
      vintageLabel({ vintageKind: "YEAR", vintageYear: 2016, vintageTawnyYears: null }),
    ).toBe("2016");
    expect(
      vintageLabel({ vintageKind: "YEAR", vintageYear: null, vintageTawnyYears: null }),
    ).toBe("");
    expect(
      vintageLabel({ vintageKind: "NV", vintageYear: null, vintageTawnyYears: null }),
    ).toBe("NV");
    expect(
      vintageLabel({ vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: 20 }),
    ).toBe("20yo");
    expect(
      vintageLabel({ vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: null }),
    ).toBe("Tawny");
    expect(bottleTitle(wine({ vintageKind: "NV", vintageYear: null }))).toBe(
      "Barolo Castiglione NV",
    );
  });
});

describe("sizes and counts", () => {
  it("names the common formats", () => {
    expect(sizeLabel(750)).toBe("750 ml");
    expect(sizeSub(750)).toBe("standard");
    expect(sizeLabel(1500)).toBe("1.5 L magnum");
    expect(sizeLabel(375)).toBe("375 ml half");
    expect(sizeLabel(3000)).toBe("3 L double magnum");
    expect(sizeLabel(2000)).toBe("2 L");
    expect(sizeLabel(500)).toBe("500 ml");
    expect(sizeSub(1500)).toBeNull();
  });
  it("count, drunk and last-one", () => {
    expect(countTimes(6)).toBe("6 ×");
    expect(drunkLine({ quantity: 3, purchasedQuantity: 6 })).toBe(
      "3 of 6 drunk",
    );
    expect(drunkLine({ quantity: 6, purchasedQuantity: 6 })).toBeNull();
    expect(drunkLine({ quantity: 7, purchasedQuantity: 6 })).toBeNull();
    expect(isLastOne(1)).toBe(true);
    expect(isLastOne(2)).toBe(false);
  });
  it("the in-flight marker (D9)", () => {
    expect(inFlightLine(1)).toBe("1 bottle in tonight’s flight");
    expect(inFlightLine(2)).toBe("2 bottles in tonight’s flight");
    expect(inFlightLine(1, { phone: true })).toBe("1 in tonight’s flight");
    expect(inFlightLine(0)).toBeNull();
  });
  it("colour words", () => {
    expect(colourWord("RED")).toBe("Red");
    expect(colourWord("ROSE")).toBe("Rosé");
    expect(colourWord(null)).toBeNull();
  });
});

describe("dates from date strings (no zone) and ISO timestamps (UTC)", () => {
  it("month and year", () => {
    expect(monthYear("2023-11-05")).toBe("Nov 2023");
    expect(monthYear("2023-11-30T23:30:00+00:00")).toBe("Nov 2023");
    expect(monthLabel("2026-09-11")).toBe("September 2026");
  });
  it("day forms", () => {
    expect(dayMonthYear("2026-08-02")).toBe("2 Aug 2026");
    expect(dayMonth("2026-09-11")).toBe("11 Sep");
  });
  it("added = purchased_on, else created_at", () => {
    expect(
      addedMonth({ purchasedOn: "2023-11-05", createdAt: "2024-01-01T00:00:00Z" }),
    ).toBe("Nov 2023");
    expect(
      addedMonth({ purchasedOn: null, createdAt: "2024-01-01T00:00:00Z" }),
    ).toBe("Jan 2024");
  });
});

describe("scores and plurals", () => {
  it("one decimal for an average, an integer for a score, a dash for nothing", () => {
    expect(fmtAvg(93.44)).toBe("93.4");
    expect(fmtAvg(93.45)).toBe("93.5");
    // `(91.85).toFixed(1)` is "91.8" (binary rounding, not decimal half-up) —
    // regression coverage for the exact midpoints toFixed gets wrong.
    expect(fmtAvg(91.85)).toBe("91.9");
    expect(fmtAvg(0.35)).toBe("0.4");
    expect(fmtAvg(null)).toBe("—");
    expect(fmtScore(92)).toBe("92");
    expect(fmtScore(null)).toBe("—");
  });
  it("plural", () => {
    expect(plural(1, "bottle", "bottles")).toBe("1 bottle");
    expect(plural(6, "bottle", "bottles")).toBe("6 bottles");
    expect(plural(0, "note", "notes")).toBe("0 notes");
  });
});
