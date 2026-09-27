import { describe, expect, it } from "vitest";
import {
  levelsById,
  otherProfileLevel,
  ownLevelFromRow,
  ownProfileLevel,
  parseLevelSnapshot,
  type ProgressRow,
} from "./snapshot";

describe("parseLevelSnapshot", () => {
  it("reads get_my_level_state's jsonb", () => {
    const raw = {
      xp: 440,
      level: 4,
      welcome: true,
      checked_at: "2026-09-27T12:00:00.000Z",
      unseen: [
        {
          id: 7,
          kind: "tasting_finished",
          xp: 40,
          xp_after: 440,
          units: null,
          achievement: null,
          created_at: "2026-09-27T11:59:00.000Z",
        },
        { id: 8, kind: "achievement", xp: 25, xp_after: 465, units: null, achievement: "first_tasting", created_at: "2026-09-27T11:59:00.000Z" },
      ],
    };
    expect(parseLevelSnapshot(raw, "u1")).toEqual({
      userId: "u1",
      xp: 440,
      level: 4,
      welcome: true,
      checkedAt: "2026-09-27T12:00:00.000Z",
      unseen: [
        { id: 7, kind: "tasting_finished", xp: 40, xpAfter: 440, units: null, achievement: null, createdAt: "2026-09-27T11:59:00.000Z" },
        { id: 8, kind: "achievement", xp: 25, xpAfter: 465, units: null, achievement: "first_tasting", createdAt: "2026-09-27T11:59:00.000Z" },
      ],
    });
  });

  it("drops a malformed row and refuses a malformed snapshot", () => {
    const ok = { xp: 0, level: 1, welcome: false, checked_at: "2026-09-27T12:00:00.000Z", unseen: [{ id: "x" }] };
    expect(parseLevelSnapshot(ok, "u1")?.unseen).toEqual([]);
    expect(parseLevelSnapshot(null, "u1")).toBeNull();
    expect(parseLevelSnapshot({ ...ok, xp: "12" }, "u1")).toBeNull();
    expect(parseLevelSnapshot({ ...ok, unseen: null }, "u1")).toBeNull();
  });
});

describe("level rows", () => {
  it("defaults a missing profile_levels row to level 1", () => {
    expect(ownLevelFromRow(null)).toEqual({ xp: 0, level: 1 });
    expect(ownLevelFromRow({ xp: 780, level: 6 })).toEqual({ xp: 780, level: 6 });
  });
  it("maps /community's ids, level 1 for anyone without a row", () => {
    const m = levelsById(["a", "b"], [{ user_id: "a", level: 5 }]);
    expect([...m]).toEqual([
      ["a", 5],
      ["b", 1],
    ]);
    expect([...levelsById(["a"], null)]).toEqual([["a", 1]]);
  });
});

const row = (key: string, extra: Partial<ProgressRow> = {}): ProgressRow => ({
  key,
  bonus_xp: 25,
  target: 1,
  progress: 0,
  unlocked_at: null,
  backfill: false,
  ...extra,
});

describe("ownProfileLevel", () => {
  it("splits earned from not yet, in the copy's order, skipping unknown keys", () => {
    const p = ownProfileLevel({ xp: 300, level: 4 }, [
      row("first_friend", { unlocked_at: "2026-09-20T10:00:00Z", backfill: true }),
      row("cellar_25", { target: 25, progress: 12, bonus_xp: 50 }),
      row("sommelier_of_the_year"),
      row("first_bottle", { unlocked_at: "2026-09-27T10:00:00Z" }),
      row("cellar_100", { target: 100, progress: 400, bonus_xp: 150 }),
    ]);
    expect(p.earned).toEqual([
      { key: "first_bottle", category: "cellar", unlockedAt: "2026-09-27T10:00:00Z", backfill: false },
      { key: "first_friend", category: "friends", unlockedAt: "2026-09-20T10:00:00Z", backfill: true },
    ]);
    expect(p.locked).toEqual([
      { key: "cellar_25", category: "cellar", progress: 12, target: 25, bonusXp: 50 },
      { key: "cellar_100", category: "cellar", progress: 100, target: 100, bonusXp: 150 },
    ]);
  });
});

describe("otherProfileLevel", () => {
  it("lists only what the viewer may read, and never the locked ones", () => {
    const p = otherProfileLevel({ xp: 25, level: 1 }, [
      { achievement_key: "winner", unlocked_at: "2026-09-27T10:00:00Z", backfill: false },
      { achievement_key: "first_tasting", unlocked_at: "2026-09-27T09:00:00Z", backfill: true },
      { achievement_key: "made_up", unlocked_at: "2026-09-27T09:00:00Z", backfill: false },
    ]);
    expect(p.earned.map((e) => e.key)).toEqual(["first_tasting", "winner"]);
    expect(p.locked).toBeNull();
  });
});
