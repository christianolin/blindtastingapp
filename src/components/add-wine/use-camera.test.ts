import { afterEach, describe, expect, it, vi } from "vitest";
import { TOUCH_PRIMARY_QUERY, homeViewFor, isTouchPrimary, startViewFor } from "./use-camera";

// The add-wine sheet routes by `canScan` (D5, spec §C.3): a coarse pointer AND
// a video input. `isTouchPrimary` is round 1's touch rule, deprecated until S6
// removes it together with its last importer.

describe("isTouchPrimary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false without a window (a server render)", () => {
    expect(isTouchPrimary()).toBe(false);
  });

  it("asks the coarse-pointer query, not a width", () => {
    const matchMedia = vi.fn((q: string) => ({ matches: q === "(pointer: coarse)" }));
    vi.stubGlobal("window", { matchMedia });
    expect(TOUCH_PRIMARY_QUERY).toBe("(pointer: coarse)");
    expect(isTouchPrimary()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(TOUCH_PRIMARY_QUERY);
  });

  it("is false on a mouse / trackpad device", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(isTouchPrimary()).toBe(false);
  });

  it("is false when matchMedia is missing", () => {
    vi.stubGlobal("window", {});
    expect(isTouchPrimary()).toBe(false);
  });
});

describe("routing by canScan (D5)", () => {
  it.each([
    ["cellar", false, "cellar"], ["byhand", true, "byhand"], ["camera", true, "camera"], ["search", true, "camera"],
    [undefined, true, "camera"], ["camera", false, "desktop"], ["search", false, "desktop"], [undefined, false, "desktop"],
  ] as const)("start %s canScan %s → %s", (start, canScan, view) => expect(startViewFor(start, canScan)).toBe(view));
  it("home", () => expect([homeViewFor(true), homeViewFor(false)]).toEqual(["camera", "desktop"]));
});
