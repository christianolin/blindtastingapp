import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TOUCH_PRIMARY_QUERY,
  homeViewFor,
  isTouchPrimary,
  startViewFor,
  viewForDevice,
} from "./use-camera";

// The add-wine sheet's device rule (owner, 2026-09-12): the live camera is
// for phones and tablets only. Routing is by input type, never by width.

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

describe("startViewFor", () => {
  it("opens a touch device on the phone views exactly as before", () => {
    expect(startViewFor(undefined, true)).toBe("camera");
    expect(startViewFor("camera", true)).toBe("camera");
    expect(startViewFor("search", true)).toBe("search");
    expect(startViewFor("cellar", true)).toBe("cellar");
    expect(startViewFor("byhand", true)).toBe("byhand");
  });

  it("never opens a mouse device on the camera — camera and search both land on the desktop view", () => {
    expect(startViewFor(undefined, false)).toBe("desktop");
    expect(startViewFor("camera", false)).toBe("desktop");
    expect(startViewFor("search", false)).toBe("desktop");
    expect(startViewFor("cellar", false)).toBe("cellar");
    expect(startViewFor("byhand", false)).toBe("byhand");
  });
});

describe("homeViewFor", () => {
  it("is the camera on touch and the desktop view on a mouse device", () => {
    expect(homeViewFor(true)).toBe("camera");
    expect(homeViewFor(false)).toBe("desktop");
  });
});

describe("viewForDevice", () => {
  it("shows a mouse device the desktop view in place of the camera or the phone search", () => {
    expect(viewForDevice("camera", false)).toBe("desktop");
    expect(viewForDevice("search", false)).toBe("desktop");
  });

  it("leaves every other view alone on a mouse device", () => {
    for (const v of ["reading", "confirm", "cellar", "byhand", "desktop", "lot", "choose"]) {
      expect(viewForDevice(v, false)).toBe(v);
    }
  });

  it("leaves every view alone on a touch device", () => {
    for (const v of ["camera", "search", "reading", "confirm", "cellar", "byhand", "desktop"]) {
      expect(viewForDevice(v, true)).toBe(v);
    }
  });
});
