import { describe, expect, it } from "vitest";
import { homeViewFor, startViewFor } from "./use-camera";

// The add-wine sheet routes by `canScan` (D5, spec §C.3): a coarse pointer AND
// a video input, resolved in use-can-scan.ts. Never by touch alone, never by
// width.

describe("routing by canScan (D5)", () => {
  it.each([
    ["cellar", false, "cellar"], ["byhand", true, "byhand"], ["camera", true, "camera"], ["search", true, "camera"],
    [undefined, true, "camera"], ["camera", false, "desktop"], ["search", false, "desktop"], [undefined, false, "desktop"],
  ] as const)("start %s canScan %s → %s", (start, canScan, view) => expect(startViewFor(start, canScan)).toBe(view));
  it("home", () => expect([homeViewFor(true), homeViewFor(false)]).toEqual(["camera", "desktop"]));
});
