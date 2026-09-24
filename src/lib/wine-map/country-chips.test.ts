// The country chip row (spec 2026-09-23 §7.1): countries only, ordered as the
// viewer reads them, a lang attribute on local names, and per-country counts
// while a grape filter is on. It also covers the row's keyboard and scroll
// arithmetic.
import { describe, expect, it } from "vitest";
import type { WinePlaceTreeNode } from "./tree";
import {
  CHIP_FADE_PX,
  chipScrollLeft,
  countryChips,
  rovingIndex,
} from "./country-chips";

function node(
  key: string,
  name: string,
  kind: string,
  tier: number,
  children: WinePlaceTreeNode[] = [],
): WinePlaceTreeNode {
  const cut = key.lastIndexOf(".");
  return {
    id: `id-${key}`,
    key,
    name,
    kind,
    tier,
    parent_key: cut > 0 ? key.slice(0, cut) : null,
    has_children: children.length > 0,
    children,
  };
}

// Roots as buildWinePlaceTree returns them (sorted by key), local names as in
// the catalogue. There is also one orphan: a verified place whose parent is
// unpublished is a root too, and it is not a country.
const ROOTS = [
  node("france", "France", "COUNTRY", 0, [node("france.bourgogne", "Bourgogne", "REGION", 1)]),
  node("germany", "Deutschland", "COUNTRY", 0, [node("germany.mosel", "Mosel", "REGION", 1)]),
  node("italy", "Italia", "COUNTRY", 0),
  node("italy.toscana.chianti-classico", "Chianti Classico", "APPELLATION", 2),
  node("portugal", "Portugal", "COUNTRY", 0),
  node("spain", "España", "COUNTRY", 0),
];

describe("countryChips", () => {
  it("lists countries only, in English order with English names", () => {
    const chips = countryChips(ROOTS, { english: true, visibleKeys: null });
    expect(chips.map((c) => c.label)).toEqual(["France", "Germany", "Italy", "Portugal", "Spain"]);
    expect(chips.map((c) => c.key)).toEqual(["france", "germany", "italy", "portugal", "spain"]);
    expect(chips.every((c) => c.lang === undefined)).toBe(true);
    expect(chips.every((c) => c.count === null)).toBe(true);
  });

  it("orders local names as they read, each tagged with its language", () => {
    const chips = countryChips(ROOTS, { english: false, visibleKeys: null });
    expect(chips.map((c) => c.label)).toEqual([
      "Deutschland",
      "España",
      "France",
      "Italia",
      "Portugal",
    ]);
    expect(chips.map((c) => c.lang)).toEqual(["de", "es", "fr", "it", "pt"]);
  });

  it("counts the visible places per country while a filter is on", () => {
    const visibleKeys = [
      "france",
      "france.bourgogne",
      "france.bourgogne.cote-de-nuits",
      "germany.mosel",
      "italy.toscana.chianti-classico",
    ];
    const chips = countryChips(ROOTS, { english: true, visibleKeys });
    expect(Object.fromEntries(chips.map((c) => [c.key, c.count]))).toEqual({
      france: 3,
      germany: 1,
      italy: 1,
      portugal: 0,
      spain: 0,
    });
    // Every visible key belongs to one country, so the chips add up to the badge.
    expect(chips.reduce((sum, c) => sum + (c.count ?? 0), 0)).toBe(visibleKeys.length);
  });

  it("is empty without a tree", () => {
    expect(countryChips([], { english: true, visibleKeys: null })).toEqual([]);
  });
});

describe("rovingIndex", () => {
  it("moves along a horizontal row, wrapping, with Home and End", () => {
    expect(rovingIndex("ArrowRight", 0, 5, "horizontal")).toBe(1);
    expect(rovingIndex("ArrowRight", 4, 5, "horizontal")).toBe(0);
    expect(rovingIndex("ArrowLeft", 0, 5, "horizontal")).toBe(4);
    expect(rovingIndex("ArrowLeft", 3, 5, "horizontal")).toBe(2);
    expect(rovingIndex("Home", 3, 5, "horizontal")).toBe(0);
    expect(rovingIndex("End", 1, 5, "horizontal")).toBe(4);
  });

  it("leaves vertical arrows and other keys to the page in a horizontal row", () => {
    expect(rovingIndex("ArrowDown", 0, 5, "horizontal")).toBeNull();
    expect(rovingIndex("ArrowUp", 0, 5, "horizontal")).toBeNull();
    expect(rovingIndex("Enter", 0, 5, "horizontal")).toBeNull();
    expect(rovingIndex(" ", 0, 5, "horizontal")).toBeNull();
  });

  it("takes all four arrows in a radio group", () => {
    expect(rovingIndex("ArrowDown", 0, 2, "both")).toBe(1);
    expect(rovingIndex("ArrowDown", 1, 2, "both")).toBe(0);
    expect(rovingIndex("ArrowUp", 0, 2, "both")).toBe(1);
    expect(rovingIndex("ArrowRight", 1, 2, "both")).toBe(0);
    expect(rovingIndex("ArrowLeft", 0, 2, "both")).toBe(1);
  });

  it("has nowhere to go in an empty row", () => {
    expect(rovingIndex("ArrowRight", 0, 0, "horizontal")).toBeNull();
  });
});

describe("chipScrollLeft", () => {
  it("leaves a chip that is clear of both faded edges alone", () => {
    expect(CHIP_FADE_PX).toBe(12);
    expect(chipScrollLeft({ chipLeft: 40, chipWidth: 70, scrollLeft: 0, viewWidth: 300 })).toBeNull();
  });

  it("centres a chip that is off to the right", () => {
    expect(chipScrollLeft({ chipLeft: 400, chipWidth: 80, scrollLeft: 0, viewWidth: 300 })).toBe(290);
    expect(chipScrollLeft({ chipLeft: 401, chipWidth: 81, scrollLeft: 0, viewWidth: 300 })).toBe(292);
  });

  it("scrolls back for a chip off to the left, never past the start", () => {
    expect(chipScrollLeft({ chipLeft: 100, chipWidth: 80, scrollLeft: 250, viewWidth: 300 })).toBe(0);
  });

  it("does nothing when the target is where the row already is", () => {
    expect(chipScrollLeft({ chipLeft: 6, chipWidth: 60, scrollLeft: 0, viewWidth: 300 })).toBeNull();
  });
});
