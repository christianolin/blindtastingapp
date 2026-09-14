import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  HOUR_MS,
  QUOTA_FETCH_LIMIT,
  quotaMessage,
  quotaRefusal,
  SCAN_LIMITS,
} from "./quota";

const NOW = new Date("2026-09-14T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const many = (n: number, ms: number) => Array.from({ length: n }, () => ago(ms));

describe("quotaRefusal", () => {
  it("lets a normal session through", () => {
    // A 12-bottle case scanned twice over, plus a few retries.
    expect(quotaRefusal(NOW, many(30, 5 * 60 * 1000))).toBeNull();
  });

  it("lets the very last allowed read through, and stops the next", () => {
    const upToLimit = many(SCAN_LIMITS.perHour - 1, 10 * 60 * 1000);
    expect(quotaRefusal(NOW, upToLimit)).toBeNull();
    expect(quotaRefusal(NOW, [...upToLimit, ago(60_000)])).toBe("hour");
  });

  it("forgets reads older than the window", () => {
    // The hour limit's worth, but all of it 90 minutes ago.
    const old = many(SCAN_LIMITS.perHour, 90 * 60 * 1000);
    expect(quotaRefusal(NOW, old)).toBeNull();
  });

  it("stops the day even when the hour is quiet", () => {
    // Spread across the day, nothing in the last hour: the hour window is
    // empty, so only the day limit can catch this.
    const spread = Array.from({ length: SCAN_LIMITS.perDay }, (_, i) =>
      ago(2 * HOUR_MS + i * 1000),
    );
    expect(quotaRefusal(NOW, spread)).toBe("day");
  });

  it("drops what is older than a day, so the caller may over-fetch", () => {
    expect(quotaRefusal(NOW, many(500, DAY_MS + 60_000))).toBeNull();
  });

  it("reports the hour first when both are full", () => {
    expect(quotaRefusal(NOW, many(SCAN_LIMITS.perDay, 60_000))).toBe("hour");
  });

  it("counts a future timestamp rather than ignoring it", () => {
    // Clock skew must not open a hole: a row stamped ahead of now is still a
    // read that happened and was billed.
    const future = Array.from({ length: SCAN_LIMITS.perHour }, () =>
      new Date(NOW.getTime() + 60_000).toISOString(),
    );
    expect(quotaRefusal(NOW, future)).toBe("hour");
  });

  it("ignores an unparseable timestamp instead of throwing", () => {
    expect(quotaRefusal(NOW, ["not a date", ago(60_000)])).toBeNull();
  });

  it("accepts Date objects as well as ISO strings", () => {
    const dates = Array.from(
      { length: SCAN_LIMITS.perHour },
      () => new Date(NOW.getTime() - 60_000),
    );
    expect(quotaRefusal(NOW, dates)).toBe("hour");
  });

  it("says nothing is spent when nothing was read", () => {
    expect(quotaRefusal(NOW, [])).toBeNull();
  });
});

describe("QUOTA_FETCH_LIMIT", () => {
  it("is one past the day limit, so a full day is always detectable", () => {
    expect(QUOTA_FETCH_LIMIT).toBeGreaterThan(SCAN_LIMITS.perDay);
    // Fetching exactly this many rows, all within the day, must refuse.
    expect(quotaRefusal(NOW, many(QUOTA_FETCH_LIMIT, 2 * HOUR_MS))).toBe("day");
  });
});

describe("quotaMessage", () => {
  it("names when to come back, since retrying sooner cannot work", () => {
    expect(quotaMessage("hour")).toMatch(/later/);
    expect(quotaMessage("day")).toMatch(/tomorrow/);
  });

  it("offers the way through that still works", () => {
    for (const w of ["hour", "day"] as const) {
      expect(quotaMessage(w)).toMatch(/by hand/);
    }
  });
});
