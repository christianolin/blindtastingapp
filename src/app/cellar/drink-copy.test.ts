import { describe, expect, it } from "vitest";
import { REASONS, confirmLabel, dateFor, isoDate, leftLine, liveChipLabel, subtitleLine } from "./drink-copy";

describe("drink-copy", () => {
  it("confirm names the count and the reason word", () => {
    expect(confirmLabel("DRANK", 1)).toBe("Drink one bottle");
    expect(confirmLabel("DRANK", 2)).toBe("Drink two bottles");
    expect(confirmLabel("DRANK", 12)).toBe("Drink 12 bottles");
    expect(confirmLabel("GIFTED", 1)).toBe("Gift one bottle");
    expect(confirmLabel("LOST", 1)).toBe("Write off one bottle");
    expect(confirmLabel("OTHER", 3)).toBe("Take out three bottles");
    expect(REASONS).toEqual(["DRANK", "GIFTED", "LOST", "OTHER"]);
  });
  it("what is left after this", () => {
    expect(leftLine(3, 1)).toEqual({ of: "of 3 ·", left: "2 left", after: "after this" });
    expect(leftLine(3, 3)).toEqual({ of: "of 3 ·", left: "0 left", after: "after this" });
  });
  it("the subtitle drops what is missing", () => {
    expect(subtitleLine({ quantity: 3, place: "rack B", community: { avg: 92.6, count: 33 } })).toBe("3 in the cellar · rack B · community 92.6 from 33 notes");
    expect(subtitleLine({ quantity: 1, place: null, community: { avg: null, count: 0 } })).toBe("1 in the cellar");
    expect(subtitleLine({ quantity: 2, place: null, community: { avg: 88, count: 1 } })).toBe("2 in the cellar · community 88.0 from 1 note");
  });
  it("dates are local and relative to now", () => {
    const now = new Date(2026, 8, 17, 23, 30); // 17 Sep 2026, local
    expect(isoDate(now)).toBe("2026-09-17");
    expect(dateFor("today", "", now)).toBe("2026-09-17");
    expect(dateFor("yesterday", "", now)).toBe("2026-09-16");
    expect(dateFor("date", "2026-09-01", now)).toBe("2026-09-01");
  });
  it("the live chip", () => {
    expect(liveChipLabel("Nebbiolo vs Sangiovese")).toBe("Nebbiolo vs Sangiovese — live now");
  });
});
