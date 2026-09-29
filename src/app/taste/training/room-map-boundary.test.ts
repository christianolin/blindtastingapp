// The training room's map boundary (training-room-map spec RM22): a failed
// chunk renders the reload fallback, any other error the stopped one, and the
// children render while healthy. A retry is a fresh boundary (the slot keys it
// by the reducer's attempt), so it starts healthy.
import { describe, expect, it } from "vitest";
import { RoomMapBoundary } from "./room-map-boundary";

function boundary() {
  return new RoomMapBoundary({ fallback: (isChunk) => (isChunk ? "reload" : "stopped"), children: "the map" });
}

describe("RoomMapBoundary", () => {
  it("renders the children while healthy", () => {
    expect(boundary().render()).toBe("the map");
  });

  it("renders fallback(true) for a chunk error, webpack's or Turbopack's", () => {
    const webpack = new Error("Loading chunk 482 failed.");
    webpack.name = "ChunkLoadError";
    const turbopack = new Error("Failed to load chunk /_next/static/chunks/0abc.js from module 1234");
    for (const error of [webpack, turbopack]) {
      const b = boundary();
      b.state = RoomMapBoundary.getDerivedStateFromError(error);
      expect(b.render()).toBe("reload");
    }
  });

  it("renders fallback(false) for any other error", () => {
    const b = boundary();
    b.state = RoomMapBoundary.getDerivedStateFromError(new Error("Style is not done loading."));
    expect(b.render()).toBe("stopped");
    b.state = RoomMapBoundary.getDerivedStateFromError("not even an Error");
    expect(b.render()).toBe("stopped");
  });
});
