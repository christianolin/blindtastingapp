import { describe, expect, it } from "vitest";
import { levelCardView } from "./card";
import { ACHIEVEMENT_KEYS, ACHIEVEMENTS } from "./copy";
import type { EarnedAchievement } from "./types";

const earned = (
  key: (typeof ACHIEVEMENT_KEYS)[number],
  backfill = false,
  unlockedAt = "2026-09-12T20:00:00Z",
): EarnedAchievement => ({
  key,
  category: ACHIEVEMENTS[key].category,
  unlockedAt,
  backfill,
});

// Profile achievements card spec 2026-09-28 §8 and §10.
describe("levelCardView", () => {
  it("is the collapsed summary: the trio and the level row", () => {
    const v = levelCardView({ xp: 420, level: 4, earned: [], locked: null });
    expect(v.trio).toEqual([
      { value: "4", label: "level", spoken: null },
      { value: "420", label: "XP in all", spoken: null },
      { value: "0", label: "achievements", spoken: null },
    ]);
    expect(v.levelRow).toEqual({ label: "To level 5", fraction: 0.6, value: "120 / 200 XP" });
    expect(v.latest).toBeNull();
    expect(v.closest).toBeNull();
    expect(v.empty).toBe("No achievements yet.");
    expect(v.notYetGroups).toBeNull();
    expect(v.canExpand).toBe(false);
  });

  it("says Top level at 60", () => {
    expect(levelCardView({ xp: 90_000, level: 60, earned: [], locked: null }).levelRow).toEqual({
      label: "Top level",
      fraction: 1,
      value: "Level 60",
    });
  });

  it("groups every earned one by category", () => {
    const keys = ACHIEVEMENT_KEYS.slice(0, 8);
    const v = levelCardView({ xp: 1000, level: 7, earned: keys.map((k) => earned(k, k === "first_bottle")), locked: null });
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

  describe("Latest", () => {
    it("is the later unlock", () => {
      const v = levelCardView({
        xp: 100,
        level: 2,
        earned: [earned("first_bottle"), earned("first_note", false, "2026-09-20T08:00:00Z")],
        locked: null,
      });
      expect(v.latest).toBe("First impressions · 20 Sep 2026");
      expect(v.empty).toBeNull();
    });

    it("keeps catalogue order on equal stamps, after skipping the backfilled", () => {
      const keys = ACHIEVEMENT_KEYS.slice(0, 8);
      const v = levelCardView({ xp: 1000, level: 7, earned: keys.map((k) => earned(k, k === "first_bottle")), locked: null });
      expect(v.latest).toBe("Well stocked · 12 Sep 2026");
    });

    it("falls back to the first backfilled one in catalogue order", () => {
      const v = levelCardView({
        xp: 100,
        level: 2,
        earned: [earned("first_bottle", true), earned("first_tasting", true), earned("first_note", true)],
        locked: null,
      });
      expect(v.latest).toBe("First bottle · Before levels");
    });

    it("prefers a real unlock over a newer-stamped backfill", () => {
      const v = levelCardView({
        xp: 100,
        level: 2,
        earned: [earned("first_bottle", true, "2026-09-30T00:00:00Z"), earned("first_note", false, "2026-09-01T00:00:00Z")],
        locked: null,
      });
      expect(v.latest).toBe("First impressions · 1 Sep 2026");
    });
  });

  it("lists what is not yet earned on your own profile, by category", () => {
    const v = levelCardView({
      xp: 30,
      level: 1,
      earned: [],
      locked: [{ key: "cellar_25", category: "cellar", progress: 12, target: 25, bonusXp: 50 }],
    });
    expect(v.notYetGroups).toEqual([
      {
        category: "cellar",
        label: "Cellar",
        items: [
          {
            key: "cellar_25",
            name: "Well stocked",
            description: "Hold 25 bottles in your cellar at once.",
            fraction: 0.48,
            progress: "12 / 25",
            bonus: "+50 XP",
          },
        ],
      },
    ]);
    expect(v.trio[2]).toEqual({ value: "0/1", label: "achievements", spoken: "0 of 1" });
    expect(v.closest).toBe("Well stocked · 12 / 25");
    expect(v.canExpand).toBe(true);
  });

  it("picks the largest fraction for Closest, catalogue order on ties", () => {
    const v = levelCardView({
      xp: 30,
      level: 1,
      earned: [],
      locked: [
        { key: "cellar_25", category: "cellar", progress: 5, target: 25, bonusXp: 50 },
        { key: "notes_25", category: "notes", progress: 10, target: 25, bonusXp: 75 },
        { key: "notes_100", category: "notes", progress: 40, target: 100, bonusXp: 150 },
      ],
    });
    expect(v.closest).toBe("Note taker · 10 / 25");
    expect(v.notYetGroups?.map((g) => [g.label, g.items.map((i) => i.key)])).toEqual([
      ["Cellar", ["cellar_25"]],
      ["Notes", ["notes_25", "notes_100"]],
    ]);
  });

  it("leaves Closest out when nothing has progress", () => {
    const v = levelCardView({
      xp: 30,
      level: 1,
      earned: [],
      locked: [
        { key: "cellar_25", category: "cellar", progress: 0, target: 25, bonusXp: 50 },
        { key: "notes_25", category: "notes", progress: 0, target: 25, bonusXp: 75 },
      ],
    });
    expect(v.closest).toBeNull();
  });

  it("gives someone else only a visible count (Rule 1)", () => {
    const v = levelCardView({ xp: 200, level: 3, earned: [earned("first_friend")], locked: null });
    expect(v.trio[2]).toEqual({ value: "1", label: "achievement", spoken: null });
    expect(v.notYetGroups).toBeNull();
    expect(v.closest).toBeNull();
    for (const s of v.trio) expect(s.value).not.toContain("/");
  });
});
