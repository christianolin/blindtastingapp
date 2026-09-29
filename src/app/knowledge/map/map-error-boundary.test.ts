// The map's error boundary, through its static lifecycle methods (vitest runs
// in node with no DOM, so nothing is rendered): an error switches the map area
// to the Retry card, a new resetKey switches it back, and a failed code-split
// chunk is told apart from an ordinary crash, since only a page load fixes it.
import { describe, expect, it } from "vitest";
import { isChunkLoadError, MapErrorBoundary } from "./map-error-boundary";

describe("MapErrorBoundary", () => {
  it("records the error that reached it", () => {
    const error = new Error("Style is not done loading.");
    expect(MapErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
  });

  it("wraps a non-Error throw so the fallback always has an Error", () => {
    const state = MapErrorBoundary.getDerivedStateFromError("boom");
    expect(state.error).toBeInstanceOf(Error);
    expect(state.error?.message).toBe("boom");
  });

  it("clears the error when the explorer bumps resetKey (Retry)", () => {
    const error = new Error("x");
    expect(
      MapErrorBoundary.getDerivedStateFromProps(
        { resetKey: 1, onRetry: () => {}, children: null },
        { error, resetKey: 0 },
      ),
    ).toEqual({ error: null, resetKey: 1 });
  });

  it("keeps the error while resetKey is unchanged", () => {
    const error = new Error("x");
    expect(
      MapErrorBoundary.getDerivedStateFromProps(
        { resetKey: 3, onRetry: () => {}, children: null },
        { error, resetKey: 3 },
      ),
    ).toBeNull();
  });
});

describe("isChunkLoadError", () => {
  it("recognises webpack's ChunkLoadError", () => {
    const error = new Error("Loading chunk 482 failed.\n(error: https://x/_next/static/chunks/482.js)");
    error.name = "ChunkLoadError";
    expect(isChunkLoadError(error)).toBe(true);
    expect(isChunkLoadError(new Error("Loading CSS chunk 12 failed."))).toBe(true);
  });

  it("recognises Turbopack's chunk failure", () => {
    expect(
      isChunkLoadError(
        new Error(
          "Failed to load chunk /_next/static/chunks/0f1e2d.js from module 81234: TypeError: Failed to fetch",
        ),
      ),
    ).toBe(true);
  });

  it("does not mistake an ordinary crash, or a non-Error, for one", () => {
    expect(isChunkLoadError(new Error("Style is not done loading."))).toBe(false);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError("Loading chunk 1 failed.")).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});
