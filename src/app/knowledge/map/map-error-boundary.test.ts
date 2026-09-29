// The map's error boundary, through its static lifecycle methods (vitest runs
// in node with no DOM, so nothing is rendered): an error switches the map area
// to the Retry card, a new resetKey switches it back, and a failed code-split
// chunk is told apart from an ordinary crash, since only a page load fixes it.
import { describe, expect, it } from "vitest";
import { isChunkLoadError, MapErrorBoundary, MapUnavailableCard } from "./map-error-boundary";

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

// The training room's optional fallback (training-room-map spec RM22): the
// room renders its own two states; the explorer passes none and keeps its card.
describe("MapErrorBoundary's fallback prop", () => {
  function renderWith(error: Error, fallback?: (e: Error, isChunk: boolean) => unknown) {
    const boundary = new MapErrorBoundary({
      resetKey: 0,
      onRetry: () => {},
      fallback: fallback as never,
      children: "the map",
    });
    boundary.state = { error, resetKey: 0 };
    return boundary.render();
  }

  it("renders fallback(error, true) for a chunk error", () => {
    const chunk = new Error("Loading chunk 482 failed.");
    chunk.name = "ChunkLoadError";
    const calls: [string, boolean][] = [];
    const out = renderWith(chunk, (e, isChunk) => {
      calls.push([e.message, isChunk]);
      return "reload card";
    });
    expect(out).toBe("reload card");
    expect(calls).toEqual([["Loading chunk 482 failed.", true]]);
  });

  it("renders fallback(error, false) for any other error", () => {
    const calls: boolean[] = [];
    renderWith(new Error("Style is not done loading."), (_e, isChunk) => {
      calls.push(isChunk);
      return null;
    });
    expect(calls).toEqual([false]);
  });

  it("without a fallback renders the explorer's own card, and the children while healthy", () => {
    const out = renderWith(new Error("x")) as { type: unknown };
    expect(out.type).toBe(MapUnavailableCard);
    const healthy = new MapErrorBoundary({ resetKey: 0, onRetry: () => {}, children: "the map" });
    expect(healthy.render()).toBe("the map");
  });
});
