// Phase 1c moved the region shards out of react-map-gl JSX into
// ShardController (src/lib/wine-map/shard-controller.ts): <Source>/<Layer> go
// through map.addSource/addLayer, which validate by serializing the whole
// style on every call — the first-zoom freeze this work removed. Nothing else
// catches that path coming back (the map has no DOM test), so this pins it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CODE = readFileSync(
  path.join(process.cwd(), "src/app/knowledge/map/tile-wine-map.tsx"),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("tile-wine-map.tsx engine wiring", () => {
  it("mounts no region shard through react-map-gl; ShardController does", () => {
    expect(CODE).not.toMatch(/id=\{shardSourceId\(/);
    expect(CODE).not.toMatch(/id=\{`shard-/);
    expect(CODE).toMatch(/new ShardController\(/);
  });

  it("resumes the controller from the style.load listener", () => {
    expect(CODE).toMatch(/\.onStyleRebuilt\(\)/);
  });

  it("sets the cursor from installHoverCursor, not a hover prop", () => {
    // Any hover prop makes react-map-gl query every interactive layer on every
    // mousemove, mid-pan included.
    expect(CODE).not.toMatch(/\bonMouse(?:Move|Enter|Leave)=/);
    expect(CODE).toMatch(/installHoverCursor\(/);
  });

  it("leaves mount pacing to the controller's frame budget", () => {
    expect(CODE).not.toMatch(/\bnextMountStep\b/);
  });
});
