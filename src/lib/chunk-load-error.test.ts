// A failed code-split chunk, told apart from an ordinary crash: only a page
// load fixes one. The training room's copy must agree with the explorer's own
// (map-error-boundary.tsx), which it restates rather than imports.
import { describe, expect, it } from "vitest";
import { isChunkLoadError as explorers } from "../app/knowledge/map/map-error-boundary";
import { isChunkLoadError } from "./chunk-load-error";

const webpack = Object.assign(new Error("Loading chunk 123 failed."), { name: "ChunkLoadError" });
const CASES: [unknown, boolean][] = [
  [webpack, true],
  [new Error("Loading CSS chunk 7 failed."), true],
  [new Error("Failed to load chunk /_next/static/chunks/x.js"), true],
  [new Error("WebGL is not supported"), false],
  [new Error("Style is not done loading."), false],
  ["Failed to load chunk x", false],
  [null, false],
];

describe("isChunkLoadError", () => {
  it("knows webpack's ChunkLoadError and Turbopack's plain Error, and nothing else", () => {
    for (const [error, expected] of CASES) expect(isChunkLoadError(error), String(error)).toBe(expected);
  });

  it("agrees with the explorer's own test on every case", () => {
    for (const [error] of CASES) expect(isChunkLoadError(error), String(error)).toBe(explorers(error));
  });
});
