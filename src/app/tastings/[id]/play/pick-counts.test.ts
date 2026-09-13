import { describe, expect, it } from "vitest";
import { OFTEN_THRESHOLD, buildPickCounts, oftenPicked } from "./pick-counts";

const rows = [
  { country_id: "it", region_id: "piemonte", appellation_id: "barolo", primary_grape_id: "nebbiolo", secondary_grape_id: null, producer_id: "vietti", type_designation_id: null },
  { country_id: "it", region_id: "piemonte", appellation_id: null, primary_grape_id: "nebbiolo", secondary_grape_id: null, producer_id: null, type_designation_id: null },
  { country_id: "fr", region_id: null, appellation_id: null, primary_grape_id: "nebbiolo", secondary_grape_id: "barbera", producer_id: null, type_designation_id: null },
];

describe("pick counts ('you guess this often')", () => {
  it("counts ids per field from the viewer's own rows", () => {
    expect(buildPickCounts(rows)).toEqual({
      country: { it: 2, fr: 1 },
      region: { piemonte: 2 },
      appellation: { barolo: 1 },
      primary_grape: { nebbiolo: 3 },
      secondary_grape: { barbera: 1 },
      producer: { vietti: 1 },
    });
  });
  it("a threshold of three", () => {
    const counts = buildPickCounts(rows);
    expect(OFTEN_THRESHOLD).toBe(3);
    expect(oftenPicked(counts.primary_grape, "nebbiolo")).toBe(true);
    expect(oftenPicked(counts.country, "it")).toBe(false);
    expect(oftenPicked(undefined, "it")).toBe(false);
  });
  it("an id is never read off the object prototype", () => {
    expect(oftenPicked({}, "constructor")).toBe(false);
    expect(buildPickCounts([])).toEqual({});
  });
});
