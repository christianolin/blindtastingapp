import { describe, expect, it } from "vitest";
import {
  MAX_PREFETCH_IN_FLIGHT,
  PREFETCH_DWELL_MS,
  shouldPrefetch,
  type PrefetchEnv,
} from "./prefetch-rule";

const ideal: PrefetchEnv = {
  key: "france.bourgogne",
  selectedKey: "france.savoie",
  pointerFine: true,
  cached: false,
  inFlight: 0,
};

describe("prefetch constants", () => {
  it("pins the dwell and the in-flight cap, so a change is deliberate", () => {
    expect(PREFETCH_DWELL_MS).toBe(120);
    expect(MAX_PREFETCH_IN_FLIGHT).toBe(2);
  });
});

describe("shouldPrefetch", () => {
  it("prefetches the ordinary case", () => {
    expect(shouldPrefetch(ideal)).toBe(true);
  });

  it("never prefetches without a key", () => {
    expect(shouldPrefetch({ ...ideal, key: null })).toBe(false);
    expect(shouldPrefetch({ ...ideal, key: "" })).toBe(false);
  });

  it("never prefetches on a coarse / hoverless pointer, however ideal the rest", () => {
    expect(shouldPrefetch({ ...ideal, pointerFine: false })).toBe(false);
  });

  it("never prefetches the already-selected place", () => {
    expect(
      shouldPrefetch({ ...ideal, key: "france.savoie", selectedKey: "france.savoie" }),
    ).toBe(false);
  });

  it("never prefetches something already cached", () => {
    expect(shouldPrefetch({ ...ideal, cached: true })).toBe(false);
  });

  it("stops at the in-flight cap", () => {
    expect(shouldPrefetch({ ...ideal, inFlight: 1 })).toBe(true);
    expect(shouldPrefetch({ ...ideal, inFlight: 2 })).toBe(false);
    expect(shouldPrefetch({ ...ideal, inFlight: 5 })).toBe(false);
  });

  it("prefetches with nothing selected yet", () => {
    expect(shouldPrefetch({ ...ideal, selectedKey: null })).toBe(true);
  });

  it("a fast sweep down a long tree never warms more than two places at once", () => {
    // Browser check §8.6: drag the pointer over many rows and only two may be
    // in flight. Nothing settles during the sweep, so the counter only rises.
    let inFlight = 0;
    const warmed: string[] = [];
    for (const key of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      if (shouldPrefetch({ ...ideal, key, inFlight })) {
        warmed.push(key);
        inFlight += 1;
      }
    }
    expect(warmed).toEqual(["a", "b"]);
    expect(inFlight).toBe(MAX_PREFETCH_IN_FLIGHT);
  });

  it("the same sweep on a phone warms nothing at all", () => {
    let inFlight = 0;
    for (const key of ["a", "b", "c", "d"]) {
      if (shouldPrefetch({ ...ideal, key, pointerFine: false, inFlight })) {
        inFlight += 1;
      }
    }
    expect(inFlight).toBe(0);
  });
});
