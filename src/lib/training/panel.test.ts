import { describe, expect, it } from "vitest";
import {
  PANEL_LIMIT,
  detailReturnsFocus,
  isBeforeAnswers,
  pressOnOwningRow,
  tawnyYearsFromInput,
  vintageFromPickerId,
  vintagePickerGroups,
  vintagePickerValue,
} from "./panel";
import type { CapReason, RankedCandidate, TrainingCandidate } from "./types";

function candidate(id: string, name: string, country: string, region = "Somewhere"): TrainingCandidate {
  return {
    id,
    name,
    description: null,
    colour: "RED",
    style: "STILL",
    country: { id: `c-${country}`, name: country },
    region: { id: `r-${region}`, name: region },
    appellation: { id: `a-${id}`, name: `${name} AOC`, isRegional: false },
    primaryGrape: { id: "g", name: "Syrah" },
    secondaryGrape: null,
    designations: [],
    typicalAge: null,
    sat: {},
    aromas: [],
    placeCanonicalKey: null,
    qualityLow: null,
    qualityHigh: null,
  };
}

function ranked(c: TrainingCandidate, closeness: number | null, capped: CapReason | null = null): RankedCandidate {
  return { candidate: c, closeness, capped, explanation: null, signatureHits: [] };
}

describe("isBeforeAnswers", () => {
  it("shows five region groups before Show all", () => {
    expect(PANEL_LIMIT).toBe(5);
  });

  it("is in before-answers mode only while nothing has a number or a cap", () => {
    const c = candidate("1", "A typical Pauillac", "France");
    expect(isBeforeAnswers([ranked(c, null)])).toBe(true);
    expect(isBeforeAnswers([])).toBe(true);
    expect(isBeforeAnswers([ranked(c, 40)])).toBe(false);
    expect(isBeforeAnswers([ranked(c, null, "bubbles")])).toBe(false);
  });
});

describe("detailReturnsFocus", () => {
  it("hands focus back to the row on a fine pointer, for Escape and the like", () => {
    expect(detailReturnsFocus("escape-key", true)).toBe(true);
    expect(detailReturnsFocus("close-press", true)).toBe(true);
    expect(detailReturnsFocus(null, true)).toBe(true);
  });
  it("never on touch, nor when a press or focus elsewhere closed it", () => {
    expect(detailReturnsFocus("escape-key", false)).toBe(false);
    expect(detailReturnsFocus("outside-press", true)).toBe(false);
    expect(detailReturnsFocus("focus-out", true)).toBe(false);
  });
  it("hands focus back to the row whose own second press closed it", () => {
    expect(detailReturnsFocus("trigger-press", true)).toBe(true);
    expect(detailReturnsFocus("trigger-press", false)).toBe(false);
  });
});

describe("pressOnOwningRow", () => {
  // A row and its children, as plain objects: contains() is the DOM's.
  type N = { parent: N | null };
  const row: N = { parent: null };
  const label: N = { parent: row };
  const elsewhere: N = { parent: null };
  const anchor = { contains: (n: N) => n === row || n.parent === row };

  it("is an outside press that lands on the owning row or inside it", () => {
    expect(pressOnOwningRow("outside-press", anchor, row)).toBe(true);
    expect(pressOnOwningRow("outside-press", anchor, label)).toBe(true);
  });
  it("is not a press elsewhere, another reason, or no row / target", () => {
    expect(pressOnOwningRow("outside-press", anchor, elsewhere)).toBe(false);
    expect(pressOnOwningRow("escape-key", anchor, row)).toBe(false);
    expect(pressOnOwningRow("focus-out", anchor, label)).toBe(false);
    expect(pressOnOwningRow("outside-press", null, row)).toBe(false);
    expect(pressOnOwningRow("outside-press", anchor, null)).toBe(false);
  });
});

describe("vintage picker mapping", () => {
  const PRESETS = [10, 20, 30, 40];

  it("names the picker row a guess sits on", () => {
    expect(vintagePickerValue(null, PRESETS)).toBe("");
    expect(vintagePickerValue({ kind: "YEAR", year: 2016 }, PRESETS)).toBe("year:2016");
    expect(vintagePickerValue({ kind: "NV" }, PRESETS)).toBe("nv");
    expect(vintagePickerValue({ kind: "TAWNY", years: 20 }, PRESETS)).toBe("tawny:20");
    expect(vintagePickerValue({ kind: "TAWNY", years: 25 }, PRESETS)).toBe("tawny:other");
  });

  it("turns a picked row back into a guess", () => {
    expect(vintageFromPickerId(null)).toEqual({ vintage: null });
    expect(vintageFromPickerId("nv")).toEqual({ vintage: { kind: "NV" } });
    expect(vintageFromPickerId("year:2016")).toEqual({ vintage: { kind: "YEAR", year: 2016 } });
    expect(vintageFromPickerId("tawny:20")).toEqual({ vintage: { kind: "TAWNY", years: 20 } });
    expect(vintageFromPickerId("tawny:other")).toEqual({ otherTawny: true });
    expect(vintageFromPickerId("junk")).toEqual({ vintage: null });
  });

  it("reads a typed tawny age of 1 to 100 whole years", () => {
    expect(tawnyYearsFromInput("25")).toBe(25);
    expect(tawnyYearsFromInput("")).toBeNull();
    expect(tawnyYearsFromInput("0")).toBeNull();
    expect(tawnyYearsFromInput("101")).toBeNull();
    expect(tawnyYearsFromInput("2.5")).toBeNull();
  });

  it("groups the picker as the guess ladder does, in its words", () => {
    expect(vintagePickerGroups([2027, 2026], [10, 20])).toEqual([
      {
        heading: "Year",
        options: [
          { id: "year:2027", name: "2027" },
          { id: "year:2026", name: "2026" },
        ],
      },
      { heading: "Non-vintage", options: [{ id: "nv", name: "NV", sub: "Non-vintage" }] },
      {
        heading: "Tawny",
        options: [
          { id: "tawny:10", name: "10 years" },
          { id: "tawny:20", name: "20 years" },
          { id: "tawny:other", name: "Other age…" },
        ],
      },
    ]);
  });
});
