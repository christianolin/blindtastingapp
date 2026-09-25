import { describe, expect, it } from "vitest";
import { candidateToArchetypeView, isRegionalAppellation, lineageForParts } from "./archetype-view";
import { lineageLine } from "./copy";
import type { TrainingCandidate } from "./types";

// Training-room spec §4.6 and D11: the detail sheet's view of a candidate, and
// the lineage line — the same line whether it is built from a pool candidate
// or from an archetype's reference ids (the Library, the map's sheet).
const pauillac: TrainingCandidate = {
  id: "a-pauillac",
  name: "A typical Pauillac",
  description: "Cassis and cedar over firm tannin.",
  colour: "RED",
  style: "STILL",
  country: { id: "c-fr", name: "France" },
  region: { id: "r-bdx", name: "Bordeaux" },
  appellation: { id: "ap-pauillac", name: "Pauillac", isRegional: false },
  primaryGrape: { id: "g-cs", name: "Cabernet Sauvignon" },
  secondaryGrape: { id: "g-me", name: "Merlot" },
  designations: [],
  typicalAge: [8, 30],
  sat: { tannin: ["MEDIUM_PLUS", "HIGH"], colourHue: ["RUBY", "GARNET"] },
  aromas: [
    { termId: "t-cassis", term: "blackcurrant", group: "Black fruit", kind: "NOSE", signature: true },
    { termId: "t-cedar", term: "cedar", group: "Oak", kind: "NOSE", signature: true },
    { termId: "t-cassis", term: "blackcurrant", group: "Black fruit", kind: "PALATE", signature: false },
  ],
  placeCanonicalKey: "france.bordeaux.haut-medoc.pauillac",
  qualityLow: 89,
  qualityHigh: 98,
};

const bourgogne: TrainingCandidate = {
  ...pauillac,
  id: "a-cdn",
  name: "A typical Côte de Nuits red",
  region: { id: "r-bourgogne", name: "Bourgogne" },
  appellation: { id: "ap-bourgogne", name: "Bourgogne AOC", isRegional: true },
  primaryGrape: { id: "g-pn", name: "Pinot Noir" },
  secondaryGrape: null,
  aromas: [],
  placeCanonicalKey: null,
};

describe("candidateToArchetypeView", () => {
  it("builds the sheet's view: lineage as the place line, grapes, nose and palate terms", () => {
    expect(candidateToArchetypeView(pauillac)).toEqual({
      name: "A typical Pauillac",
      colour: "RED",
      style: "STILL",
      placeName: "Pauillac · Bordeaux, France · Cabernet Sauvignon, Merlot",
      lineage: "Pauillac · Bordeaux, France · Cabernet Sauvignon, Merlot",
      grapes: "Cabernet Sauvignon · Merlot",
      description: "Cassis and cedar over firm tannin.",
      qualityLow: 89,
      qualityHigh: 98,
      sat: { tannin: ["MEDIUM_PLUS", "HIGH"], colourHue: ["RUBY", "GARNET"] },
      aromas: ["blackcurrant", "cedar"],
      flavours: ["blackcurrant"],
    });
  });
  it("uses copy.ts's lineageLine, so the room and the sheet never disagree", () => {
    expect(candidateToArchetypeView(pauillac).lineage).toBe(lineageLine(pauillac));
    expect(candidateToArchetypeView(bourgogne).lineage).toBe(lineageLine(bourgogne));
  });
  it("a regional appellation leaves the appellation out; no place and no aromas are fine", () => {
    const view = candidateToArchetypeView(bourgogne);
    expect(view.lineage).toBe("Bourgogne, France · Pinot Noir");
    expect([view.grapes, view.aromas, view.flavours]).toEqual(["Pinot Noir", [], []]);
  });
});

describe("isRegionalAppellation", () => {
  it("is the region's self-named row, suffix aside", () => {
    expect(isRegionalAppellation({ id: "r", name: "Bourgogne" }, { id: "a", name: "Bourgogne AOC" })).toBe(true);
    expect(isRegionalAppellation({ id: "r", name: "Bourgogne" }, { id: "a", name: "Bourgogne Aligoté AOC" })).toBe(false);
    expect(isRegionalAppellation({ id: "r", name: "Bordeaux" }, { id: "a", name: "Pauillac AOC" })).toBe(false);
  });
});

describe("lineageForParts", () => {
  it("formats reference names exactly as lineageLine formats a candidate", () => {
    expect(
      lineageForParts({
        country: pauillac.country,
        region: pauillac.region,
        appellation: { id: "ap-pauillac", name: "Pauillac" },
        primaryGrape: pauillac.primaryGrape,
        secondaryGrape: pauillac.secondaryGrape,
      }),
    ).toBe(lineageLine(pauillac));
    expect(
      lineageForParts({
        country: bourgogne.country,
        region: bourgogne.region,
        appellation: { id: "ap-bourgogne", name: "Bourgogne AOC" },
        primaryGrape: bourgogne.primaryGrape,
        secondaryGrape: null,
      }),
    ).toBe("Bourgogne, France · Pinot Noir");
  });
});
