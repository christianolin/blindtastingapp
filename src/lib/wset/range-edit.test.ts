import { describe, expect, it } from "vitest";
import { bandOnStops, capKeyStep, dragBand, sameBand, scoreBand, stepBandEnd, tapBand, type Band } from "./range-edit";

describe("tapBand (EditableRange's rule)", () => {
  it("seeds a one-stop band on the first tap", () => {
    expect(tapBand(null, 2)).toEqual({ band: [2, 2], anchor: 2 });
  });

  it("extends the nearer end to a tap outside the band", () => {
    expect(tapBand([2, 3], 0)).toEqual({ band: [0, 3], anchor: 3 });
    expect(tapBand([2, 3], 4)).toEqual({ band: [2, 4], anchor: 2 });
  });

  it("moves the nearer end in on a tap inside the band, a tie going to the low end", () => {
    expect(tapBand([0, 4], 1)).toEqual({ band: [1, 4], anchor: 4 });
    expect(tapBand([0, 4], 3)).toEqual({ band: [0, 3], anchor: 0 });
    expect(tapBand([0, 4], 2)).toEqual({ band: [2, 4], anchor: 4 });
  });

  it("leaves the band alone on a tap at either end", () => {
    expect(tapBand([1, 3], 1).band).toEqual([1, 3]);
    expect(tapBand([1, 3], 3).band).toEqual([1, 3]);
    expect(tapBand([2, 2], 2).band).toEqual([2, 2]);
  });

  it("works on scores as well as stop indices", () => {
    expect(tapBand(null, 88)).toEqual({ band: [88, 88], anchor: 88 });
    expect(tapBand([88, 92], 96)).toEqual({ band: [88, 96], anchor: 88 });
  });
});

describe("dragBand", () => {
  it("spans the anchor and the pointer, low first", () => {
    expect(dragBand(1, 4)).toEqual([1, 4]);
    expect(dragBand(3, 0)).toEqual([0, 3]);
    expect(dragBand(2, 2)).toEqual([2, 2]);
  });

  it("a press that seeded a band and slides right grows it from the seed", () => {
    const { anchor } = tapBand(null, 1);
    expect(dragBand(anchor, 3)).toEqual([1, 3]);
  });
});

describe("sameBand", () => {
  it("compares both ends, and null only with null", () => {
    expect(sameBand([1, 2], [1, 2])).toBe(true);
    expect(sameBand([1, 2], [1, 3])).toBe(false);
    expect(sameBand(null, null)).toBe(true);
    expect(sameBand(null, [0, 0])).toBe(false);
  });
});

describe("bandOnStops", () => {
  const stops = ["LOW", "MEDIUM", "HIGH"] as const;

  it("maps a range to stop indices, low first", () => {
    expect(bandOnStops(stops, ["MEDIUM", "HIGH"])).toEqual([1, 2]);
    expect(bandOnStops(stops, ["HIGH", "LOW"])).toEqual([0, 2]);
  });

  it("is null for no range, or a bound that is not a stop", () => {
    expect(bandOnStops(stops, null)).toBeNull();
    expect(bandOnStops<string>(stops, ["MEDIUM_PLUS", "HIGH"])).toBeNull();
  });
});

describe("scoreBand", () => {
  it("orders a score range low first", () => {
    expect(scoreBand([96, 88])).toEqual([88, 96]);
    expect(scoreBand([88, 96])).toEqual([88, 96]);
    expect(scoreBand(null)).toBeNull();
  });
});

describe("capKeyStep (a focused quality cap)", () => {
  it("moves one score on an arrow, five with Shift; right and up raise, left and down lower", () => {
    expect(capKeyStep("ArrowRight", false)).toBe(1);
    expect(capKeyStep("ArrowUp", false)).toBe(1);
    expect(capKeyStep("ArrowLeft", false)).toBe(-1);
    expect(capKeyStep("ArrowDown", false)).toBe(-1);
    expect(capKeyStep("ArrowRight", true)).toBe(5);
    expect(capKeyStep("ArrowLeft", true)).toBe(-5);
  });

  it("leaves every other key alone (Tab still leaves the cap)", () => {
    for (const key of ["Tab", "Enter", " ", "Home", "End", "a"]) expect(capKeyStep(key, false)).toBeNull();
    expect(capKeyStep("Tab", true)).toBeNull();
  });
});

describe("stepBandEnd", () => {
  it("moves the one end it is given", () => {
    expect(stepBandEnd([88, 96], 0, 1, 50, 100)).toEqual([89, 96]);
    expect(stepBandEnd([88, 96], 1, -5, 50, 100)).toEqual([88, 91]);
  });

  it("stops at the ends of the scale", () => {
    expect(stepBandEnd([52, 90], 0, -5, 50, 100)).toEqual([50, 90]);
    expect(stepBandEnd([50, 90], 0, -1, 50, 100)).toEqual([50, 90]);
    expect(stepBandEnd([80, 98], 1, 5, 50, 100)).toEqual([80, 100]);
    expect(stepBandEnd([80, 100], 1, 1, 50, 100)).toEqual([80, 100]);
  });

  it("never lets an end pass the other: low stays at or under high", () => {
    expect(stepBandEnd([88, 90], 0, 5, 50, 100)).toEqual([90, 90]);
    expect(stepBandEnd([90, 90], 0, 1, 50, 100)).toEqual([90, 90]);
    expect(stepBandEnd([88, 90], 1, -5, 50, 100)).toEqual([88, 88]);
    expect(stepBandEnd([90, 90], 1, -1, 50, 100)).toEqual([90, 90]);
  });

  it("lets a keyboard curator set 88–94 from a tapped 85", () => {
    const press = (band: Band, end: 0 | 1, key: string, shift = false) =>
      stepBandEnd(band, end, capKeyStep(key, shift)!, 50, 100);
    let band = tapBand(null, 85).band;
    band = press(band, 1, "ArrowRight", true); // high 90
    for (let i = 0; i < 4; i++) band = press(band, 1, "ArrowRight"); // high 94
    for (let i = 0; i < 3; i++) band = press(band, 0, "ArrowRight"); // low 88
    expect(band).toEqual([88, 94]);
  });
});
