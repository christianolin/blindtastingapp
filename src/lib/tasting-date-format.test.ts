import { describe, expect, it } from "vitest";
import { formatTastingDate } from "./tasting-date-format";

describe("formatTastingDate (S4 eyebrow, S5 card, S5b chip)", () => {
  const iso = "2026-09-10T17:00:00Z"; // 19:00 in Copenhagen (CEST)
  it("formats in the given zone, English words, 24-hour clock", () => {
    expect(formatTastingDate(iso, "eyebrow", "Europe/Copenhagen")).toBe("Thursday 10 Sep 19:00");
    expect(formatTastingDate(iso, "eyebrow-short", "Europe/Copenhagen")).toBe("Thursday 19:00");
    expect(formatTastingDate(iso, "card", "Europe/Copenhagen")).toBe("Thursday 10 Sep, 19:00");
  });
  it("formats the record header's {d Mon} in the viewer's zone (S13, spec §11.3 item 12)", () => {
    expect(formatTastingDate(iso, "day-month", "Europe/Copenhagen")).toBe("10 Sep");
    // 22:30 UTC is already the next day in Copenhagen.
    expect(formatTastingDate("2026-09-10T22:30:00Z", "day-month", "Europe/Copenhagen")).toBe("11 Sep");
    expect(formatTastingDate("2026-09-10T22:30:00Z", "day-month", "UTC")).toBe("10 Sep");
  });
  it("an invalid date is an empty part", () => {
    expect(formatTastingDate("not a date", "eyebrow", "UTC")).toBe("");
    expect(formatTastingDate("not a date", "day-month", "UTC")).toBe("");
  });
});
