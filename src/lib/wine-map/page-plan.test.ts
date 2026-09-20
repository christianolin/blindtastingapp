import { describe, expect, it } from "vitest";
import {
  GRAPE_LINK_PAGE_SIZE,
  GRAPE_LINK_PARALLEL_PAGES,
  pageRanges,
  roundIsLast,
} from "./page-plan";

describe("paging constants", () => {
  it("pins the page size to PostgREST's own cap", () => {
    // Supabase sets db-max-rows to 1000; asking for more silently truncates,
    // so the page size is not a tuning knob — it is the server's limit.
    expect(GRAPE_LINK_PAGE_SIZE).toBe(1000);
  });

  it("pins how many pages go out at once", () => {
    expect(GRAPE_LINK_PARALLEL_PAGES).toBe(4);
  });

  it("covers today's table in a single round", () => {
    // wine_place_grapes held 2 964 rows when this was written (measured live
    // 2026-09-20). Four pages cover 4 000, so the whole table arrives in one
    // round trip with room to grow.
    const rowsToday = 2964;
    expect(GRAPE_LINK_PARALLEL_PAGES * GRAPE_LINK_PAGE_SIZE).toBeGreaterThan(rowsToday);
  });
});

describe("pageRanges", () => {
  it("round 0 asks for the first four pages at once", () => {
    expect(pageRanges(0)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
    ]);
  });

  it("round 1 continues where round 0 stopped, with no gap and no overlap", () => {
    const first = pageRanges(0);
    const second = pageRanges(1);
    expect(second[0][0]).toBe(first[first.length - 1][1] + 1);
    expect(second).toEqual([
      [4000, 4999],
      [5000, 5999],
      [6000, 6999],
      [7000, 7999],
    ]);
  });

  it("every range is inclusive and exactly one page wide", () => {
    for (const [from, to] of [...pageRanges(0), ...pageRanges(3)]) {
      expect(to - from + 1).toBe(GRAPE_LINK_PAGE_SIZE);
    }
  });

  it("is deterministic — the same round always asks for the same rows", () => {
    expect(pageRanges(2)).toEqual(pageRanges(2));
  });

  it("rejects a negative round rather than asking for negative offsets", () => {
    expect(() => pageRanges(-1)).toThrow();
  });

  it("honours an explicit page size and width", () => {
    expect(pageRanges(0, 10, 2)).toEqual([
      [0, 9],
      [10, 19],
    ]);
    expect(pageRanges(1, 10, 2)).toEqual([
      [20, 29],
      [30, 39],
    ]);
  });
});

describe("roundIsLast", () => {
  it("is last when any page came back short — nothing follows a short page", () => {
    expect(roundIsLast([1000, 1000, 964, 0])).toBe(true);
  });

  it("is last when a page came back empty", () => {
    expect(roundIsLast([1000, 0, 0, 0])).toBe(true);
  });

  it("is NOT last when every page filled", () => {
    expect(roundIsLast([1000, 1000, 1000, 1000])).toBe(false);
  });

  it("is last for an empty table", () => {
    expect(roundIsLast([0, 0, 0, 0])).toBe(true);
  });

  it("is last when the round returned nothing at all", () => {
    expect(roundIsLast([])).toBe(true);
  });

  it("honours an explicit page size", () => {
    expect(roundIsLast([10, 10], 10)).toBe(false);
    expect(roundIsLast([10, 3], 10)).toBe(true);
  });

  it("treats an over-full page as full, never as a terminator", () => {
    // Defensive: a server that ignored the range must not end the walk early.
    expect(roundIsLast([1000, 1200])).toBe(false);
  });
});
