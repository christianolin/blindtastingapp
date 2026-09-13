import { describe, expect, it } from "vitest";
import { lockedLine, rankDeltaPill, revealHeaderMeta, revealingGlass } from "./reveal-copy";

describe("reveal copy (S11, S11b)", () => {
  it("the locked line", () => {
    expect(lockedLine([{ label: "Producer", points: 6 }, { label: "Vintage", points: 2 }])).toBe(
      "Producer and vintage are worth 8 between them. Nothing you do now changes them — the guess is locked.",
    );
    expect(lockedLine([{ label: "Appellation", points: 5 }, { label: "Producer", points: 6 }, { label: "Vintage", points: 2 }])).toBe(
      "Appellation, producer and vintage are worth 13 between them. Nothing you do now changes them — the guess is locked.",
    );
    expect(lockedLine([{ label: "Vintage", points: 2 }])).toBe("Vintage is worth 2. Nothing you do now changes it — the guess is locked.");
    expect(lockedLine([])).toBeNull();
  });
  it("the laptop header and the delta pill", () => {
    expect(revealingGlass(3)).toBe("Revealing glass 3");
    expect(revealHeaderMeta(4, 6, "Christian")).toBe("4 of 6 attributes · Christian is driving");
    expect(rankDeltaPill({ before: 2, after: 1 })).toBe("▲ 2nd → 1st");
    expect(rankDeltaPill({ before: 1, after: 3 })).toBe("▼ 1st → 3rd");
    expect(rankDeltaPill({ before: 2, after: 2 })).toBeNull();
  });
});
