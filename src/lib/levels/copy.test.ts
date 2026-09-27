import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_KEYS,
  CATEGORY_ORDER,
  UNIT_CAPS,
  achievementToastTitle,
  atUnitCap,
  awayToastTitle,
  formatUtcDate,
  formatXp,
  isAchievementKey,
  kindLabel,
  levelUpTitle,
  pillLabel,
  pillText,
  ringLabel,
  ringLinkLabel,
  welcomeTitle,
  xpToastTitle,
} from "./copy";

describe("achievements copy", () => {
  it("has spec §4's twenty keys in sort_order", () => {
    expect(ACHIEVEMENT_KEYS).toEqual([
      "first_bottle",
      "cellar_25",
      "cellar_100",
      "first_drink",
      "drank_50",
      "first_tasting",
      "tastings_10",
      "first_host",
      "perfect_glass",
      "winner",
      "glasses_50",
      "first_note",
      "notes_25",
      "notes_100",
      "note_countries_10",
      "first_training",
      "training_10",
      "training_ace",
      "first_friend",
      "friends_10",
    ]);
  });
  it("gives every key a name, a sentence and one of the five categories", () => {
    for (const key of ACHIEVEMENT_KEYS) {
      const a = ACHIEVEMENTS[key];
      expect(a.name.length, key).toBeGreaterThan(0);
      expect(a.description, key).toMatch(/^[A-Z].*\.$/);
      expect(CATEGORY_ORDER, key).toContain(a.category);
    }
    expect(ACHIEVEMENTS.cellar_100).toEqual({
      name: "Serious cellar",
      description: "Hold 100 bottles in your cellar at once.",
      category: "cellar",
    });
  });
  it("are the migration's seeded keys, in sort_order (L22)", () => {
    const sql = readFileSync("supabase/migrations/20260927160000_levels_and_achievements.sql", "utf8").replace(/\r/g, "");
    const seed = sql.slice(sql.indexOf("insert into public.achievements"), sql.indexOf("create table public.xp_events"));
    const seeded = [...seed.matchAll(/\('(\w+)',\s+'(\w+)',/g)].map((m) => [m[1], m[2]]);
    expect(seeded).toEqual(ACHIEVEMENT_KEYS.map((k) => [k, ACHIEVEMENTS[k].category]));
  });
  it("knows only its own keys", () => {
    expect(isAchievementKey("winner")).toBe(true);
    expect(isAchievementKey("constructor")).toBe(false);
    expect(isAchievementKey("sommelier_of_the_year")).toBe(false);
    expect(isAchievementKey(7)).toBe(false);
  });
});

describe("kind labels", () => {
  it("are singular for one and counted for more", () => {
    expect(kindLabel("guess", 1, 25)).toBe("Glass revealed");
    expect(kindLabel("guess_match", 3, 2)).toBe("3 glasses revealed");
    expect(kindLabel("tasting_finished", 1, 1)).toBe("Tasting finished");
    expect(kindLabel("tasting_hosted", 2, 2)).toBe("2 tastings hosted");
    expect(kindLabel("cellar_add", 1, 1)).toBe("Bottle added");
    expect(kindLabel("cellar_add", 1, 12)).toBe("12 bottles added");
    expect(kindLabel("drink", 1, 1)).toBe("Bottle opened");
    expect(kindLabel("drink", 2, 3)).toBe("3 bottles opened");
    expect(kindLabel("note", 1, 1)).toBe("Tasting note");
    expect(kindLabel("note", 4, 4)).toBe("4 tasting notes");
    expect(kindLabel("training", 1, 17)).toBe("Training round");
    expect(kindLabel("training", 2, 30)).toBe("2 training rounds");
    expect(kindLabel("achievement", 1, 1)).toBeNull();
    expect(kindLabel("mystery", 1, 1)).toBeNull();
  });

  // units are the bottles PAID, capped per award (a lot pays at most 20, a
  // drink 6): at the cap the real count may be higher, so no number is said.
  it("say no count once an award's bottles reached the kind's unit cap", () => {
    expect(kindLabel("cellar_add", 1, 20, true)).toBe("Bottles added");
    expect(kindLabel("drink", 1, 6, true)).toBe("Bottles opened");
    expect(kindLabel("drink", 2, 7, true)).toBe("Bottles opened");
    expect(kindLabel("cellar_add", 1, 19, false)).toBe("19 bottles added");
    expect(kindLabel("note", 1, 1, true)).toBe("Tasting note");
  });
  it("know the unit caps the migration seeds (xp_sources.unit_cap)", () => {
    expect(atUnitCap("cellar_add", 20)).toBe(true);
    expect(atUnitCap("cellar_add", 19)).toBe(false);
    expect(atUnitCap("drink", 6)).toBe(true);
    expect(atUnitCap("drink", 5)).toBe(false);
    expect(atUnitCap("drink", null)).toBe(false);
    expect(atUnitCap("guess", 26)).toBe(false);
    const sql = readFileSync("supabase/migrations/20260927160000_levels_and_achievements.sql", "utf8").replace(/\r/g, "");
    const seed = sql.slice(sql.indexOf("insert into public.xp_sources"), sql.indexOf("create table public.achievements"));
    const caps = Object.fromEntries(
      [...seed.matchAll(/\('(\w+)',\s+\d+,\s+\d+,\s+(\d+),/g)].map((m) => [m[1], Number(m[2])]),
    );
    expect(caps).toEqual(UNIT_CAPS);
  });
});

describe("the owner's three examples", () => {
  it("render exactly", () => {
    expect(xpToastTitle(40, kindLabel("tasting_finished", 1, 1))).toBe("+40 XP · Tasting finished");
    expect(levelUpTitle(4)).toBe("Level up · You're level 4");
    expect(achievementToastTitle([ACHIEVEMENTS.cellar_100.name])).toBe("Achievement · Serious cellar");
  });
});

describe("toast copy", () => {
  it("welcome, away and merged achievements", () => {
    expect(welcomeTitle(3)).toBe("You're level 3");
    expect(awayToastTitle(1234)).toBe("+1,234 XP while you were away");
    expect(xpToastTitle(15, null)).toBe("+15 XP");
    expect(achievementToastTitle(["First cork", "Well stocked", "Serious cellar"])).toBe(
      "3 achievements · First cork, Well stocked",
    );
  });
});

describe("ring labels", () => {
  it("state the level and the way to the next", () => {
    expect(ringLabel(420)).toBe("Level 4, 120 of 200 XP to level 5");
    expect(ringLabel(0)).toBe("Level 1, 0 of 50 XP to level 2");
    expect(ringLabel(22_000)).toBe("Level 30, 250 of 1,500 XP to level 31");
  });
  it("say the top level at 60", () => {
    expect(ringLabel(88_500)).toBe("Level 60, the top level");
    expect(ringLinkLabel("Ada", 90_000)).toBe("Ada, level 60, the top level");
  });
  it("put the visible name first inside a link", () => {
    expect(ringLinkLabel("Ada", 420)).toBe("Ada, level 4, 120 of 200 XP to level 5");
  });
});

describe("formatting", () => {
  it("groups thousands without a locale", () => {
    expect(formatXp(0)).toBe("0");
    expect(formatXp(999)).toBe("999");
    expect(formatXp(88_500)).toBe("88,500");
    expect(formatXp(1_000_000)).toBe("1,000,000");
  });
  it("dates in UTC as 12 Sep 2026", () => {
    expect(formatUtcDate("2026-09-12T23:30:00Z")).toBe("12 Sep 2026");
    expect(formatUtcDate("2026-09-13T00:30:00+02:00")).toBe("12 Sep 2026");
    expect(formatUtcDate("not a date")).toBe("");
  });
  it("the pill", () => {
    expect(pillText(7)).toBe("Lv 7");
    expect(pillLabel(7)).toBe("Level 7");
  });
});
