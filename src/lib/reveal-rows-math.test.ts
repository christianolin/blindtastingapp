import { describe, expect, it } from "vitest";
import {
  heroLabel,
  inPlayKeys,
  keyMaxPoints,
  REVEAL_KEY_ORDER,
} from "./reveal-rows-math";

describe("inPlayKeys", () => {
  it("count 5 and nothing revealed → the five always-in-play categories", () => {
    expect(inPlayKeys([], 5)).toEqual({
      keys: ["country", "region", "grapes", "producer", "vintage"],
      uncertain: false,
    });
  });

  it("count 7 → every category, in reveal order", () => {
    expect(inPlayKeys(["country"], 7)).toEqual({
      keys: [...REVEAL_KEY_ORDER],
      uncertain: false,
    });
  });

  it("count 6 with appellation revealed third → no designation", () => {
    expect(inPlayKeys(["country", "region", "appellation"], 6)).toEqual({
      keys: ["country", "region", "appellation", "grapes", "producer", "vintage"],
      uncertain: false,
    });
  });

  it("count 6 with grapes revealed third → designation, no appellation", () => {
    expect(inPlayKeys(["country", "region", "grapes"], 6)).toEqual({
      keys: ["country", "region", "grapes", "producer", "type_designation", "vintage"],
      uncertain: false,
    });
  });

  it("count 6 before the third reveal is ambiguous: show appellation, hold designation", () => {
    expect(inPlayKeys(["country"], 6)).toEqual({
      keys: ["country", "region", "appellation", "grapes", "producer", "vintage"],
      uncertain: true,
    });
  });

  it("a revealed prefix always wins over the inference", () => {
    expect(
      inPlayKeys(["country", "region", "grapes", "producer", "type_designation"], 6).keys,
    ).toEqual(["country", "region", "grapes", "producer", "type_designation", "vintage"]);
  });

  it("never drops a key that has already been revealed", () => {
    // A malformed count must not hide what the server already showed.
    expect(inPlayKeys(["country", "region", "appellation", "grapes"], 5).keys).toContain(
      "appellation",
    );
  });
});

describe("keyMaxPoints", () => {
  it("carries the real VM/DM values, grapes as the 8 for the primary", () => {
    expect(REVEAL_KEY_ORDER.map(keyMaxPoints)).toEqual([2, 3, 5, 8, 6, 2, 2]);
  });
});

describe("heroLabel", () => {
  it("names the category the way the reveal eyebrow does", () => {
    expect(heroLabel("grapes", false)).toBe("The grape was");
    expect(heroLabel("grapes", true)).toBe("The grapes were");
    expect(heroLabel("type_designation", false)).toBe("The designation was");
    expect(heroLabel("vintage", false)).toBe("The vintage was");
  });
});
