import { describe, expect, it } from "vitest";
import { visibleGlasses } from "./match-board-visibility";
import type { BoardGlass } from "@/lib/semi-blind-board";

function glass(wineId: string, position: number): BoardGlass {
  return { wineId, glass: position, isRevealed: false, revealStep: 0, ownBottle: false };
}

describe("visibleGlasses (owner decision OD-4a)", () => {
  it("drops the hero glass so it does not render a second time", () => {
    const glasses = [glass("w1", 1), glass("w2", 2), glass("w3", 3)];
    expect(visibleGlasses(glasses, "w2").map((g) => g.wineId)).toEqual(["w1", "w3"]);
  });

  it("returns every glass unchanged when nothing is mid-reveal", () => {
    const glasses = [glass("w1", 1), glass("w2", 2)];
    expect(visibleGlasses(glasses, null)).toEqual(glasses);
  });

  it("returns every glass unchanged when the hero id matches none of them", () => {
    const glasses = [glass("w1", 1), glass("w2", 2)];
    expect(visibleGlasses(glasses, "not-on-the-board")).toEqual(glasses);
  });
});
