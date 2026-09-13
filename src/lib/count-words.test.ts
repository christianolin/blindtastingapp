import { describe, expect, it } from "vitest";
import { countWord } from "./count-words";

describe("countWord", () => {
  it("words to ten, numerals above", () => {
    expect([1, 2, 5, 10].map((n) => countWord(n))).toEqual(["one", "two", "five", "ten"]);
    expect(countWord(0)).toBe("zero");
    expect(countWord(11)).toBe("11");
    expect(countWord(7, { capital: true })).toBe("Seven");
    expect(countWord(12, { capital: true })).toBe("12");
  });
  // Beyond the plan's cases.
  it("anything but a whole number from zero to ten stays numerals", () => {
    expect(countWord(-1)).toBe("-1");
    expect(countWord(2.5, { capital: true })).toBe("2.5");
  });
});
