import { describe, expect, it } from "vitest";
import { TRAINING_COPY } from "./copy";
import {
  PANEL_LIMIT,
  isBeforeAnswers,
  panelView,
  tawnyYearsFromInput,
  vintageFromPickerId,
  vintagePickerValue,
  yourCallOptions,
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

const ids = (rows: RankedCandidate[]) => rows.map((r) => r.candidate.id);

const BEFORE = [
  ranked(candidate("1", "A typical Barossa Shiraz", "Australia"), null),
  ranked(candidate("2", "A typical Clare Valley Riesling", "Australia"), null),
  ranked(candidate("3", "A typical Bandol", "France"), null),
  ranked(candidate("4", "A typical Chablis", "France"), null),
  ranked(candidate("5", "A typical Margaux", "France"), null),
  ranked(candidate("6", "A typical Barolo", "Italy"), null),
  ranked(candidate("7", "A typical Soave", "Italy"), null),
];

const SCORED = [
  ranked(candidate("1", "A typical Pauillac", "France", "Bordeaux"), 91),
  ranked(candidate("2", "A typical Margaux", "France", "Bordeaux"), 84),
  ranked(candidate("3", "A typical Bandol", "France", "Provence"), 80),
  ranked(candidate("4", "A typical Barolo", "Italy", "Piemonte"), 72),
  ranked(candidate("5", "A typical Rioja Reserva", "Spain", "Rioja"), 70),
  ranked(candidate("6", "A typical Barossa Shiraz", "Australia", "South Australia"), 61),
  ranked(candidate("7", "A typical Côte-Rôtie", "France", "Rhône"), 55),
];

describe("panelView", () => {
  it("groups the first five by country before anything is answered", () => {
    const view = panelView(BEFORE, false);
    expect(view.before).toBe(true);
    expect(view.total).toBe(7);
    expect(view.hidden).toBe(2);
    expect(view.groups.map((g) => [g.heading, ids(g.rows)])).toEqual([
      ["Australia", ["1", "2"]],
      ["France", ["3", "4", "5"]],
    ]);
    expect(PANEL_LIMIT).toBe(5);
  });

  it("shows every candidate once expanded", () => {
    const view = panelView(BEFORE, true);
    expect(view.hidden).toBe(0);
    expect(view.groups.map((g) => g.heading)).toEqual(["Australia", "France", "Italy"]);
  });

  it("puts capped candidates under the unlikely heading", () => {
    const list = [
      ranked(candidate("1", "A typical Pauillac", "France"), 91),
      ranked(candidate("2", "A typical Margaux", "France"), 84),
      ranked(candidate("3", "A typical Bandol", "France"), null),
      ranked(candidate("4", "A typical Chablis", "France"), 15, "colour"),
      ranked(candidate("5", "A typical Champagne", "France"), 12, "bubbles"),
      ranked(candidate("6", "A typical Sancerre", "France"), null, "colour"),
    ];
    const view = panelView(list, false);
    expect(view.before).toBe(false);
    expect(view.groups.map((g) => [g.heading, ids(g.rows)])).toEqual([
      [null, ["1", "2", "3"]],
      [TRAINING_COPY.unlikelyGroup, ["4", "5"]],
    ]);
    expect(view.hidden).toBe(1);
  });

  it("is in before-answers mode only while nothing has a number or a cap", () => {
    const c = candidate("1", "A typical Pauillac", "France");
    expect(isBeforeAnswers([ranked(c, null)])).toBe(true);
    expect(isBeforeAnswers([])).toBe(true);
    expect(isBeforeAnswers([ranked(c, 40)])).toBe(false);
    expect(isBeforeAnswers([ranked(c, null, "bubbles")])).toBe(false);
  });
});

describe("yourCallOptions", () => {
  it("lists the top five and keeps a pick from further down", () => {
    expect(ids(yourCallOptions(SCORED, "", null))).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids(yourCallOptions(SCORED, "", "7"))).toEqual(["1", "2", "3", "4", "5", "7"]);
    expect(ids(yourCallOptions(SCORED, "", "2"))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("searches every candidate by name, region or country, accents folded", () => {
    expect(ids(yourCallOptions(SCORED, "cote rotie", null))).toEqual(["7"]);
    expect(ids(yourCallOptions(SCORED, "rhone", null))).toEqual(["7"]);
    expect(ids(yourCallOptions(SCORED, "italy", null))).toEqual(["4"]);
    expect(ids(yourCallOptions(SCORED, "zzz", null))).toEqual([]);
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
});
