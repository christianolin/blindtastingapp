import { describe, expect, it } from "vitest";
import { patternSentence, recordPattern, type CategoryRate } from "./record-pattern";

const r = (category: CategoryRate["category"], hits: number, inPlay: number): CategoryRate => ({ category, hits, inPlay });
const tonight = [r("country", 6, 6), r("region", 6, 6), r("appellation", 3, 6), r("primary_grape", 4, 6), r("producer", 1, 6), r("vintage", 2, 6)];
const backer = [r("country", 5, 6), r("region", 6, 6), r("producer", 0, 6)];

describe("recordPattern (RECORD-11)", () => {
  it("needs two earlier tastings behind it", () => {
    expect(recordPattern(tonight, [backer])).toBeNull();
    expect(recordPattern(tonight, [backer, backer])).toEqual({ everyTime: ["country", "region"], weakest: r("producer", 1, 6), backedBy: 2 });
  });
  it("an earlier tasting backs it only past both thresholds", () => {
    const soft = [r("country", 4, 6), r("region", 6, 6), r("producer", 0, 6)];   // country 0.67 < 0.8
    const strong = [r("country", 6, 6), r("region", 6, 6), r("producer", 3, 6)]; // producer 0.5 > 0.34
    expect(recordPattern(tonight, [backer, soft, strong])).toBeNull();
  });
  it("every time needs at least three in play; the weakest must be at most a third", () => {
    expect(recordPattern([r("country", 2, 2), r("producer", 0, 6)], [backer, backer])).toBeNull();
    expect(recordPattern([r("country", 6, 6), r("producer", 3, 6)], [backer, backer])).toBeNull();
  });
  it("equal weakest rates go to the heavier category; a category not in play never backs", () => {
    const tied = [r("country", 6, 6), r("region", 1, 6), r("primary_grape", 1, 6)];
    const grapeBacker = [r("country", 6, 6), r("primary_grape", 0, 6)];
    expect(recordPattern(tied, [grapeBacker, grapeBacker])?.weakest).toEqual(r("primary_grape", 1, 6));
    const grapeNotInPlay = [r("country", 6, 6), r("primary_grape", 0, 0)];
    expect(recordPattern(tied, [grapeBacker, grapeNotInPlay])).toBeNull();
  });
  it("the sentence", () => {
    const p = recordPattern(tonight, [backer, backer]);
    if (!p) throw new Error("expected a pattern");
    expect(patternSentence(p)).toBe(
      "Country and region every time, the producer once in six. That pattern is now three tastings old — it shows up in your numbers too.",
    );
    expect(patternSentence({ ...p, weakest: r("producer", 0, 6) })).toBe(
      "Country and region every time, the producer never in six. That pattern is now three tastings old — it shows up in your numbers too.",
    );
    expect(patternSentence({ everyTime: ["primary_grape"], weakest: r("vintage", 2, 6), backedBy: 4 })).toBe(
      "The grape every time, the vintage twice in six. That pattern is now five tastings old — it shows up in your numbers too.",
    );
  });
});
