import { describe, expect, it } from "vitest";
import { pickGrapeSuggestion } from "./grape-suggestion";

const neb = { grapeId: "g-neb", name: "Nebbiolo" };
const bar = { grapeId: "g-bar", name: "Barbera" };
describe("pickGrapeSuggestion (spec B.8)", () => {
  it("one principal grape → place", () =>
    expect(pickGrapeSuggestion([{ ...neb, sharePct: null }], [])).toEqual({ grape: { id: "g-neb", name: "Nebbiolo" }, source: "place" }));
  it("several principals, one at ≥ 60% → place", () =>
    expect(pickGrapeSuggestion([{ ...neb, sharePct: 85 }, { ...bar, sharePct: 15 }], [])?.grape.id).toBe("g-neb"));
  it("several principals without one falls back to the catalog", () =>
    expect(pickGrapeSuggestion([{ ...neb, sharePct: 50 }, { ...bar, sharePct: 50 }], [{ ...neb, count: 3 }])).toEqual({ grape: { id: "g-neb", name: "Nebbiolo" }, source: "catalog" }));
  it("catalog: 60% of at least 3 wines", () =>
    expect(pickGrapeSuggestion([], [{ ...neb, count: 3 }, { ...bar, count: 2 }])?.source).toBe("catalog"));
  it("nothing from 2 wines, or at 59%", () => {
    expect(pickGrapeSuggestion([], [{ ...neb, count: 2 }])).toBeNull();
    expect(pickGrapeSuggestion([], [{ ...neb, count: 59 }, { ...bar, count: 41 }])).toBeNull();
  });
});
