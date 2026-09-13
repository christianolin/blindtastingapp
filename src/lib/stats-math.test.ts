import { describe, expect, it } from "vitest";
import {
  competitorRank,
  foldOther,
  ordinal,
  percent,
  rankLabel,
  rankRows,
  relativeTime,
  wineTypeLabel,
} from "./stats-math";

describe("foldOther", () => {
  it("keeps the top N by count and folds the rest into Other", () => {
    expect(
      foldOther(
        [
          { label: "Italy", count: 11 },
          { label: "France", count: 21 },
          { label: "Germany", count: 6 },
          { label: "Spain", count: 2 },
          { label: "Portugal", count: 1 },
        ],
        3,
      ),
    ).toEqual([
      { label: "France", count: 21 },
      { label: "Italy", count: 11 },
      { label: "Germany", count: 6 },
      { label: "Other", count: 3 },
    ]);
  });

  it("omits Other when nothing is left over", () => {
    expect(
      foldOther(
        [
          { label: "France", count: 3 },
          { label: "Italy", count: 1 },
        ],
        3,
      ),
    ).toEqual([
      { label: "France", count: 3 },
      { label: "Italy", count: 1 },
    ]);
  });

  it("drops zero-count entries", () => {
    expect(foldOther([{ label: "France", count: 0 }], 3)).toEqual([]);
  });
});

describe("wineTypeLabel", () => {
  it("uses the style when it is not still", () => {
    expect(wineTypeLabel("WHITE", "SPARKLING")).toBe("Sparkling");
    expect(wineTypeLabel("RED", "FORTIFIED")).toBe("Fortified");
    expect(wineTypeLabel("WHITE", "SWEET")).toBe("Sweet");
  });

  it("falls back to the colour for still wines", () => {
    expect(wineTypeLabel("RED", "STILL")).toBe("Red");
    expect(wineTypeLabel("WHITE", "STILL")).toBe("White");
    expect(wineTypeLabel("ROSE", "STILL")).toBe("Rosé");
    expect(wineTypeLabel("ORANGE", null)).toBe("Orange");
  });

  it("reads Other when nothing is known", () => {
    expect(wineTypeLabel(null, null)).toBe("Other");
  });
});

describe("ordinal", () => {
  it("handles the English suffix rules including the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
    ]);
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-09-11T12:00:00Z");
  const at = (iso: string) => relativeTime(iso, now);

  it("names the near past in days", () => {
    expect(at("2026-09-11T08:00:00Z")).toBe("today");
    expect(at("2026-09-10T20:00:00Z")).toBe("yesterday");
    expect(at("2026-09-08T12:00:00Z")).toBe("3 days ago");
  });

  it("switches to weeks after six days", () => {
    expect(at("2026-09-04T12:00:00Z")).toBe("1 week ago");
    expect(at("2026-08-28T12:00:00Z")).toBe("2 weeks ago");
  });

  it("switches to months after four weeks and years after twelve months", () => {
    expect(at("2026-08-10T12:00:00Z")).toBe("1 month ago");
    expect(at("2026-04-10T12:00:00Z")).toBe("5 months ago");
    expect(at("2024-08-10T12:00:00Z")).toBe("2 years ago");
  });

  it("accepts a plain date string (tasted_on) as midnight UTC", () => {
    expect(at("2026-09-09")).toBe("2 days ago");
  });
});

describe("competitorRank", () => {
  it("ranks by total with dense ties", () => {
    const rows = [
      { participantId: "a", total: 10 },
      { participantId: "b", total: 10 },
      { participantId: "c", total: 8 },
    ];
    expect(competitorRank(rows, "c")).toEqual({ rank: 2, of: 3 });
    expect(competitorRank(rows, "b")).toEqual({ rank: 1, of: 3 });
  });

  it("returns null when the viewer is not a competitor", () => {
    expect(competitorRank([{ participantId: "a", total: 1 }], "zz")).toBeNull();
  });
});

describe("percent", () => {
  it("rounds to an integer and treats an empty whole as zero", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 0)).toBe(0);
  });
});

describe("rankRows (reveal-6)", () => {
  it("dense ranks, highest first, stable among ties", () => {
    const rows = [{ id: "a", t: 8 }, { id: "b", t: 10 }, { id: "c", t: 8 }, { id: "d", t: 5 }];
    expect(rankRows(rows, (r) => r.t).map((x) => [x.row.id, x.rank, x.tied])).toEqual([["b", 1, false], ["a", 2, true], ["c", 2, true], ["d", 3, false]]);
  });
  it("empty", () => expect(rankRows([], () => 0)).toEqual([]));
  it("labels ties", () => expect([rankLabel({ rank: 2, tied: true }), rankLabel({ rank: 1, tied: false })]).toEqual(["=2", "1"]));
});
