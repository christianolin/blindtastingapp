import { describe, expect, it } from "vitest";
import { CHIP_LIMIT, levelCardView } from "./card";
import { ACHIEVEMENT_KEYS, ACHIEVEMENTS } from "./copy";
import type { EarnedAchievement } from "./types";

const earned = (key: (typeof ACHIEVEMENT_KEYS)[number], backfill = false): EarnedAchievement => ({
  key,
  category: ACHIEVEMENTS[key].category,
  unlockedAt: "2026-09-12T20:00:00Z",
  backfill,
});

describe("levelCardView", () => {
  it("is the collapsed row: level, XP in all, the bar", () => {
    const v = levelCardView({ xp: 420, level: 4, earned: [], locked: null });
    expect([v.heading, v.xpLine, v.bar]).toEqual([
      "Level 4",
      "420 XP in all",
      { fraction: 0.6, text: "120 / 200 XP to level 5" },
    ]);
    expect(v.empty).toBe("No achievements yet.");
    expect(v.canExpand).toBe(false);
  });

  it("says Top level at 60", () => {
    expect(levelCardView({ xp: 90_000, level: 60, earned: [], locked: null }).bar).toEqual({
      fraction: 1,
      text: "Top level",
    });
  });

  it("shows six chips at most and groups every earned one by category", () => {
    const keys = ACHIEVEMENT_KEYS.slice(0, 8);
    const v = levelCardView({ xp: 1000, level: 7, earned: keys.map((k) => earned(k, k === "first_bottle")), locked: null });
    expect(v.chips).toHaveLength(CHIP_LIMIT);
    expect(v.earnedGroups.map((g) => [g.label, g.items.length])).toEqual([
      ["Cellar", 5],
      ["Tastings", 3],
    ]);
    expect(v.earnedGroups[0].items[0]).toEqual({
      key: "first_bottle",
      name: "First bottle",
      description: "Add your first bottle to your cellar.",
      when: "Before levels",
    });
    expect(v.earnedGroups[0].items[1].when).toBe("12 Sep 2026");
    expect(v.canExpand).toBe(true);
  });

  it("lists what is not yet earned on your own profile", () => {
    const v = levelCardView({
      xp: 30,
      level: 1,
      earned: [],
      locked: [{ key: "cellar_25", category: "cellar", progress: 12, target: 25, bonusXp: 50 }],
    });
    expect(v.notYet).toEqual([
      {
        key: "cellar_25",
        name: "Well stocked",
        description: "Hold 25 bottles in your cellar at once.",
        fraction: 0.48,
        progress: "12 / 25",
        bonus: "+50 XP",
      },
    ]);
    expect(v.canExpand).toBe(true);
  });
});
