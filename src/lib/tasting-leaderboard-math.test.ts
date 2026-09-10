import { describe, expect, it } from "vitest";
import { ownWineCounts } from "./tasting-leaderboard-math";

describe("ownWineCounts", () => {
  it("returns an empty map when nobody contributed a bottle", () => {
    const counts = ownWineCounts([
      { contributor_participant_id: null },
      { contributor_participant_id: null },
    ]);
    expect(counts.size).toBe(0);
  });

  it("counts one bottle per contributor", () => {
    const counts = ownWineCounts([
      { contributor_participant_id: "a" },
      { contributor_participant_id: "b" },
    ]);
    expect(counts.get("a")).toBe(1);
    expect(counts.get("b")).toBe(1);
  });

  // The edge case worth having: in bring-your-own tastings a participant can
  // bring more than one bottle, and their "out of" must drop by all of them.
  it("accumulates when one participant contributed several bottles", () => {
    const counts = ownWineCounts([
      { contributor_participant_id: "a" },
      { contributor_participant_id: "a" },
      { contributor_participant_id: "a" },
      { contributor_participant_id: "b" },
      { contributor_participant_id: null },
    ]);
    expect(counts.get("a")).toBe(3);
    expect(counts.get("b")).toBe(1);
    expect(counts.size).toBe(2);
  });

  it("ignores nulls mixed in with contributors", () => {
    const counts = ownWineCounts([
      { contributor_participant_id: null },
      { contributor_participant_id: "a" },
      { contributor_participant_id: null },
    ]);
    expect(counts.get("a")).toBe(1);
    expect(counts.has("null")).toBe(false);
  });
});
