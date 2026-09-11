import { describe, expect, it } from "vitest";
import {
  accuracyRows,
  bestRegions,
  footerRange,
  inRange,
  isBestMonth,
  longestWeeklyStreak,
  monthlyCounts,
  movementsByMonth,
  placementBuckets,
  pointsPerTasting,
  rangeLabel,
  scoreBuckets,
  trend,
  vintageBuckets,
  weightedMedian,
  type ScoredGuess,
} from "./your-numbers-math";

// 2026-09-11 is a Friday; the ISO week runs Mon 7 Sep – Sun 13 Sep.
const now = new Date("2026-09-11T12:00:00Z");

describe("inRange", () => {
  it("accepts everything for all-time", () => {
    expect(inRange("2019-01-01", "all", now)).toBe(true);
    expect(inRange("2031-01-01T00:00:00Z", "all", now)).toBe(true);
  });

  it("uses the UTC calendar year for this-year", () => {
    expect(inRange("2026-01-01", "year", now)).toBe(true);
    expect(inRange("2026-12-31T23:59:59Z", "year", now)).toBe(true);
    expect(inRange("2025-12-31T23:59:59Z", "year", now)).toBe(false);
    expect(inRange("2027-01-01T00:00:00Z", "year", now)).toBe(false);
  });

  it("counts today and the 89 days before it as the last 90 days", () => {
    expect(inRange("2026-09-11T00:00:00Z", "90d", now)).toBe(true);
    expect(inRange("2026-09-11T23:59:00Z", "90d", now)).toBe(true);
    // 89 days back → in; 90 days back → out.
    expect(inRange("2026-06-14", "90d", now)).toBe(true);
    expect(inRange("2026-06-14T23:00:00Z", "90d", now)).toBe(true);
    expect(inRange("2026-06-13T23:59:59Z", "90d", now)).toBe(false);
    expect(inRange("2026-03-01", "90d", now)).toBe(false);
  });

  it("rejects an unparseable date rather than throwing", () => {
    expect(inRange("not a date", "year", now)).toBe(false);
    expect(inRange("not a date", "90d", now)).toBe(false);
  });
});

describe("accuracyRows", () => {
  const perfect: ScoredGuess = {
    country_points: 2,
    region_points: 3,
    appellation_points: 5,
    primary_grape_points: 8,
    producer_points: 6,
    vintage_points: 2,
    total_points: 26,
  };
  const partial: ScoredGuess = {
    country_points: 2,
    region_points: 0,
    appellation_points: null, // wine has no appellation → not applicable
    primary_grape_points: 0,
    producer_points: 0,
    vintage_points: 1, // off by one year → counts for "Vintage ±1"
    total_points: 3,
  };
  const semiBlind: ScoredGuess = {
    country_points: null,
    region_points: null,
    appellation_points: null,
    primary_grape_points: null,
    producer_points: null,
    vintage_points: null,
    total_points: 1,
  };

  it("returns the six rows in the fixed order with zero counts when empty", () => {
    expect(accuracyRows([])).toEqual([
      { label: "Country", correct: 0, applicable: 0 },
      { label: "Region", correct: 0, applicable: 0 },
      { label: "Appellation", correct: 0, applicable: 0 },
      { label: "Grape", correct: 0, applicable: 0 },
      { label: "Vintage ±1", correct: 0, applicable: 0 },
      { label: "Producer", correct: 0, applicable: 0 },
    ]);
  });

  it("counts a category as correct only at its maximum and skips nulls", () => {
    expect(accuracyRows([perfect, partial])).toEqual([
      { label: "Country", correct: 2, applicable: 2 },
      { label: "Region", correct: 1, applicable: 2 },
      { label: "Appellation", correct: 1, applicable: 1 },
      { label: "Grape", correct: 1, applicable: 2 },
      { label: "Vintage ±1", correct: 2, applicable: 2 },
      { label: "Producer", correct: 1, applicable: 2 },
    ]);
  });

  it("treats a semi-blind guess (every category null) as not applicable", () => {
    expect(accuracyRows([semiBlind])).toEqual(accuracyRows([]));
  });

  it("does not give vintage credit for zero points", () => {
    const [, , , , vintage] = accuracyRows([{ ...partial, vintage_points: 0 }]);
    expect(vintage).toEqual({ label: "Vintage ±1", correct: 0, applicable: 1 });
  });
});

describe("pointsPerTasting", () => {
  const rows = [
    { tastingId: "a", name: "Alpha", points: 5, scoredAt: "2026-09-01T10:00:00Z" },
    { tastingId: "b", name: "Beta", points: 3, scoredAt: "2026-08-01T10:00:00Z" },
    { tastingId: "a", name: "Alpha", points: 7, scoredAt: "2026-09-02T10:00:00Z" },
    { tastingId: "c", name: "Gamma", points: 9, scoredAt: "2026-07-01T10:00:00Z" },
  ];

  it("sums per tasting, dates by the latest scored_at and orders oldest → newest", () => {
    expect(pointsPerTasting(rows)).toEqual([
      { tastingId: "c", name: "Gamma", points: 9, scoredAt: "2026-07-01T10:00:00Z" },
      { tastingId: "b", name: "Beta", points: 3, scoredAt: "2026-08-01T10:00:00Z" },
      { tastingId: "a", name: "Alpha", points: 12, scoredAt: "2026-09-02T10:00:00Z" },
    ]);
  });

  it("keeps only the newest `limit` tastings", () => {
    expect(pointsPerTasting(rows, 2).map((t) => t.tastingId)).toEqual(["b", "a"]);
  });

  it("returns nothing for no rows", () => {
    expect(pointsPerTasting([])).toEqual([]);
  });
});

describe("trend", () => {
  it("needs at least four tastings", () => {
    expect(trend([])).toBeNull();
    expect(trend([10, 20, 30])).toBeNull();
  });

  it("is the newer half's mean minus the older half's mean", () => {
    expect(trend([10, 12, 14, 16])).toEqual({ delta: 4, over: 4 });
    expect(trend([20, 20, 10, 10])).toEqual({ delta: -10, over: 4 });
  });

  it("gives the middle value to the older half on odd counts", () => {
    expect(trend([10, 10, 10, 20, 20])).toEqual({ delta: 10, over: 5 });
  });

  it("rounds the delta to one decimal", () => {
    // older (10, 12, 13) → 11.667; newer (13, 14) → 13.5; delta 1.833…
    expect(trend([10, 12, 13, 13, 14])).toEqual({ delta: 1.8, over: 5 });
  });

  it("reports a flat trend as plain zero", () => {
    expect(trend([5, 5, 5, 5])).toEqual({ delta: 0, over: 4 });
  });
});

describe("placementBuckets", () => {
  it("counts podium places and folds the rest into lower", () => {
    expect(placementBuckets([1, 1, 2, 3, 4, 7])).toEqual({
      first: 2,
      second: 1,
      third: 1,
      lower: 2,
    });
  });

  it("is all zeros with no placements", () => {
    expect(placementBuckets([])).toEqual({ first: 0, second: 0, third: 0, lower: 0 });
  });
});

describe("bestRegions", () => {
  const rows = [
    { region: "Burgundy", points: 20 },
    { region: "Burgundy", points: 22 },
    { region: "Burgundy", points: 22 },
    { region: "Piedmont", points: 18 },
    { region: "Piedmont", points: 19.8 },
    { region: "Mosel", points: 14.1 },
    { region: "Rhône", points: 11 },
    { region: "Rhône", points: 11.4 },
    { region: "Loire", points: 5 },
    { region: "Loire", points: 5 },
    { region: "Alsace", points: 30 },
    { region: "Alsace", points: 30 },
  ];

  it("averages per region, requires two wines, sorts by average and caps at four", () => {
    expect(bestRegions(rows)).toEqual([
      { label: "Alsace", avgPoints: 30, wines: 2 },
      { label: "Burgundy", avgPoints: 21.3, wines: 3 },
      { label: "Piedmont", avgPoints: 18.9, wines: 2 },
      { label: "Rhône", avgPoints: 11.2, wines: 2 },
    ]);
  });

  it("honours a custom minimum and limit", () => {
    expect(bestRegions(rows, 1, 2)).toEqual([
      { label: "Alsace", avgPoints: 30, wines: 2 },
      { label: "Burgundy", avgPoints: 21.3, wines: 3 },
    ]);
    expect(bestRegions(rows, 3, 4)).toEqual([
      { label: "Burgundy", avgPoints: 21.3, wines: 3 },
    ]);
  });

  it("returns nothing when no region has enough wines", () => {
    expect(bestRegions([{ region: "Mosel", points: 14 }])).toEqual([]);
  });

  it("breaks an equal average on more wines, then on name", () => {
    const tied = [
      { region: "Rioja", points: 10 },
      { region: "Rioja", points: 10 },
      { region: "Douro", points: 10 },
      { region: "Douro", points: 10 },
      { region: "Douro", points: 10 },
      { region: "Barossa", points: 10 },
      { region: "Barossa", points: 10 },
    ];
    // Douro (3 wines) precedes the two 2-wine regions; Barossa precedes
    // Rioja alphabetically.
    expect(bestRegions(tied).map((r) => r.label)).toEqual(["Douro", "Barossa", "Rioja"]);
  });
});

describe("scoreBuckets", () => {
  it("always returns the five labelled buckets", () => {
    expect(scoreBuckets([])).toEqual([
      { label: "<80", count: 0 },
      { label: "80–84", count: 0 },
      { label: "85–89", count: 0 },
      { label: "90–94", count: 0 },
      { label: "95+", count: 0 },
    ]);
  });

  it("places every edge score in the right bucket", () => {
    expect(scoreBuckets([79, 80, 84, 85, 89, 90, 94, 95, 100, 50])).toEqual([
      { label: "<80", count: 2 },
      { label: "80–84", count: 2 },
      { label: "85–89", count: 2 },
      { label: "90–94", count: 2 },
      { label: "95+", count: 2 },
    ]);
  });
});

describe("monthlyCounts", () => {
  it("zero-fills eight calendar months ending at now's month, oldest first", () => {
    expect(
      monthlyCounts(
        [
          "2026-09-01",
          "2026-09-10T08:00:00Z",
          "2026-02-15",
          "2026-01-31", // before the window
          "2026-07-04",
          "2026-10-01", // after the window
        ],
        now,
      ),
    ).toEqual([
      { label: "Feb", count: 1 },
      { label: "Mar", count: 0 },
      { label: "Apr", count: 0 },
      { label: "May", count: 0 },
      { label: "Jun", count: 0 },
      { label: "Jul", count: 1 },
      { label: "Aug", count: 0 },
      { label: "Sep", count: 2 },
    ]);
  });

  it("wraps across a year boundary", () => {
    expect(
      monthlyCounts(["2025-11-20", "2026-01-02", "2026-01-30"], new Date("2026-02-10T00:00:00Z"), 4),
    ).toEqual([
      { label: "Nov", count: 1 },
      { label: "Dec", count: 0 },
      { label: "Jan", count: 2 },
      { label: "Feb", count: 0 },
    ]);
  });
});

describe("longestWeeklyStreak", () => {
  it("is zero with no dates and one for a single date", () => {
    expect(longestWeeklyStreak([])).toBe(0);
    expect(longestWeeklyStreak(["2026-09-08"])).toBe(1);
  });

  it("uses Monday-start weeks: Sunday and the next Monday are different weeks", () => {
    // Mon 7 Sep and Sun 13 Sep share a week; Mon 14 Sep starts the next.
    expect(longestWeeklyStreak(["2026-09-07", "2026-09-13"])).toBe(1);
    expect(longestWeeklyStreak(["2026-09-13", "2026-09-14"])).toBe(2);
  });

  it("counts the longest run of consecutive weeks, not the total", () => {
    // weeks of 7 Sep and 14 Sep are consecutive (2); 28 Sep stands alone.
    expect(
      longestWeeklyStreak(["2026-09-08", "2026-09-14", "2026-09-20T18:00:00Z", "2026-09-28"]),
    ).toBe(2);
  });

  it("runs across a year boundary", () => {
    // Mon 22 Dec 2025 · Wed 31 Dec 2025 · Tue 6 Jan 2026 · Mon 12 Jan 2026 → four weeks.
    expect(
      longestWeeklyStreak(["2025-12-22", "2025-12-31", "2026-01-06", "2026-01-12"]),
    ).toBe(4);
  });

  it("ignores duplicates within a week", () => {
    expect(longestWeeklyStreak(["2026-09-08", "2026-09-09", "2026-09-10"])).toBe(1);
  });
});

describe("isBestMonth", () => {
  const thisMonth = ["2026-09-02", "2026-09-05T18:00:00Z", "2026-09-10"];

  it("compares against every month, not just the eight-month chart window", () => {
    // Five notes in Nov 2025 — outside the Feb–Sep 2026 chart window — still
    // beat three this month.
    const strongerOldMonth = [
      "2025-11-03",
      "2025-11-08",
      "2025-11-14",
      "2025-11-21",
      "2025-11-29",
    ];
    expect(isBestMonth([...thisMonth, ...strongerOldMonth], now)).toBe(false);
  });

  it("is true when this month beats every other month", () => {
    expect(isBestMonth([...thisMonth, "2026-08-04", "2026-08-20"], now)).toBe(true);
    expect(isBestMonth(thisMonth, now)).toBe(true);
  });

  it("is false with no notes this month", () => {
    expect(isBestMonth([], now)).toBe(false);
    expect(isBestMonth(["2026-08-04", "2026-08-20"], now)).toBe(false);
  });

  it("needs strictly more than an earlier month, so a tie is not the best yet", () => {
    expect(
      isBestMonth([...thisMonth, "2026-03-01", "2026-03-02", "2026-03-03"], now),
    ).toBe(false);
  });

  it("ignores unparseable dates", () => {
    expect(isBestMonth([...thisMonth, "not a date"], now)).toBe(true);
  });
});

describe("vintageBuckets", () => {
  it("always returns the five labelled buckets", () => {
    expect(vintageBuckets([])).toEqual([
      { label: "≤2010", count: 0 },
      { label: "2011–14", count: 0 },
      { label: "2015–17", count: 0 },
      { label: "2018–20", count: 0 },
      { label: "2021+", count: 0 },
    ]);
  });

  it("is quantity-weighted, places every edge year and ignores null years", () => {
    expect(
      vintageBuckets([
        { year: 2005, quantity: 1 },
        { year: 2010, quantity: 1 },
        { year: 2011, quantity: 2 },
        { year: 2014, quantity: 1 },
        { year: 2015, quantity: 3 },
        { year: 2017, quantity: 1 },
        { year: 2018, quantity: 2 },
        { year: 2020, quantity: 1 },
        { year: 2021, quantity: 4 },
        { year: null, quantity: 9 },
      ]),
    ).toEqual([
      { label: "≤2010", count: 2 },
      { label: "2011–14", count: 3 },
      { label: "2015–17", count: 4 },
      { label: "2018–20", count: 3 },
      { label: "2021+", count: 4 },
    ]);
  });
});

describe("weightedMedian", () => {
  it("is null with no weight", () => {
    expect(weightedMedian([])).toBeNull();
    expect(weightedMedian([{ value: 2015, weight: 0 }])).toBeNull();
  });

  it("finds the value where the cumulative weight reaches half", () => {
    expect(
      weightedMedian([
        { value: 2020, weight: 1 },
        { value: 2015, weight: 1 },
        { value: 2017, weight: 2 },
      ]),
    ).toBe(2017);
    expect(
      weightedMedian([
        { value: 2016, weight: 3 },
        { value: 2019, weight: 1 },
      ]),
    ).toBe(2016);
  });

  it("takes the lower value on an even split", () => {
    expect(
      weightedMedian([
        { value: 2010, weight: 1 },
        { value: 2020, weight: 1 },
      ]),
    ).toBe(2010);
  });
});

describe("movementsByMonth", () => {
  it("zero-fills six months oldest → newest with added over drunk", () => {
    expect(
      movementsByMonth(
        [
          { on: "2026-04-03", qty: 2 },
          { on: "2026-09-01T09:00:00Z", qty: 5 },
          { on: "2026-03-30", qty: 9 }, // before the window
        ],
        [
          { on: "2026-06-15", qty: 1 },
          { on: "2026-09-05", qty: 2 },
        ],
        now,
      ),
    ).toEqual([
      { label: "Apr", added: 2, drunk: 0 },
      { label: "May", added: 0, drunk: 0 },
      { label: "Jun", added: 0, drunk: 1 },
      { label: "Jul", added: 0, drunk: 0 },
      { label: "Aug", added: 0, drunk: 0 },
      { label: "Sep", added: 5, drunk: 2 },
    ]);
  });

  it("honours a custom month count", () => {
    expect(movementsByMonth([], [], now, 2)).toEqual([
      { label: "Aug", added: 0, drunk: 0 },
      { label: "Sep", added: 0, drunk: 0 },
    ]);
  });
});

describe("rangeLabel", () => {
  it("names the footer period for each range", () => {
    expect(rangeLabel("all")).toBe("this year");
    expect(rangeLabel("year")).toBe("this year");
    expect(rangeLabel("90d")).toBe("in the last 90 days");
  });
});

describe("footerRange", () => {
  it("is the window the footer label names — this year for all-time", () => {
    expect(footerRange("all")).toBe("year");
    expect(footerRange("year")).toBe("year");
    expect(footerRange("90d")).toBe("90d");
  });

  it("agrees with rangeLabel for every range", () => {
    for (const range of ["all", "year", "90d"] as const) {
      expect(rangeLabel(range)).toBe(rangeLabel(footerRange(range)));
    }
  });
});
