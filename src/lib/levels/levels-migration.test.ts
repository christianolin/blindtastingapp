import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Pins 20260927160000_levels_and_achievements.sql to what the plan reviewed
// (docs/superpowers/plans/2026-09-27-levels-and-achievements.md, Task 1):
// every function body's md5 — the same md5 the migration's own post-state
// asserts against the database (md5 of prosrc with any CR stripped) — the
// seeds against spec §2/§4 (copy.test.ts pins copy.ts to the same keys, L22).
// scripts/levels.test.mjs checks the live rows; this runs without a database.
// Normalised so a CRLF checkout (Windows autocrlf) reads the same text.

const FILE = "supabase/migrations/20260927160000_levels_and_achievements.sql";
const sql = readFileSync(FILE, "utf8").replace(/\r/g, "");
const md5 = (text: string) => createHash("md5").update(text).digest("hex");

/** What Postgres stores as prosrc: the text between `as $$` and the closing `$$`. */
function body(name: string): string {
  const at = sql.search(new RegExp(`create function public\\.${name}\\(`));
  if (at < 0) throw new Error(`no function ${name}`);
  const open = sql.indexOf(" as $$", at) + " as $$".length;
  return sql.slice(open, sql.indexOf("$$", open));
}

const PINS: Record<string, string> = {
  level_for_xp: "e1e671dec9b7f9fe961895fb89da0b1f",
  xp_award: "be99b79b59a85c5b94932708547d25e6",
  xp_consumption_masked: "9a8f6ce6d9de3063e5743dac5bec12b4",
  xp_cellar_on_hand: "3481a84c307948e83a41e56a2e1c40b3",
  xp_tasting_player: "c94850b9c2a258b0042a04a25e7ae7dd",
  xp_tasting_won_by: "a9c32de88c5af2fc781bd7ec0d5689f2",
  xp_achievement_metric: "c6f6c368814f0694d82d90e95350181c",
  xp_check_achievements: "ddea6ee0dcb39c0b975ff0c6df39e69f",
  xp_award_guess: "599f905cd9d9f4cc631b57cb2bf4c887",
  xp_award_tasting_close: "12f3b0633f833e11eda81d9a56a62e00",
  xp_award_cellar_lot: "7baec44db9b657eaf6dd6ea1c425e9e6",
  xp_award_drink: "bb4410ed83f66ceed1a5f469c68f2b91",
  xp_award_note: "a6d7d6862ae10cecb65509cc02419f59",
  xp_award_training: "52a1e008282add33cafcbddf17eb63bc",
  xp_replay_user: "84480be4887b33b1ec9bc0a253fa5fbf",
  xp_on_glass_revealed: "76b15ee71e070281ec48b8c3e7b8be4c",
  xp_on_tasting_closed: "a5ba1c057b2b99f8f00fc796c3467bd4",
  xp_on_cellar_lot: "5174e05a934bec37adc7b6c3b88ed677",
  xp_on_cellar_consumption: "908ed16361d1c53d273853798cbc4aa2",
  xp_on_wset_note: "0ddc191a6f385d42baa704393ba7d1c9",
  xp_on_training_scored: "1835464dbc5fbd898c6e55e5becfb532",
  xp_on_friendship: "37281ca530320b28c483fbd750ad8a7f",
  xp_drop_deleted_profile: "7919bfa1008d0ed574212d316031bbc8",
  get_my_level_state: "1be2bcfe134b250867e8f44cee243dd8",
  mark_xp_seen: "e079b0a31504b3108aa7180b5ca9f53e",
  get_my_achievement_progress: "e34084467ab9655a1a0cb2be3400c942",
};

describe(FILE, () => {
  it("creates exactly the pinned functions, with the pinned bodies", () => {
    const created = [...sql.matchAll(/create function public\.(\w+)\(/g)].map((m) => m[1]);
    expect(created.sort()).toEqual(Object.keys(PINS).sort());
    const actual = Object.fromEntries(Object.keys(PINS).map((name) => [name, md5(body(name))]));
    expect(actual).toEqual(PINS);
  });

  it("asserts each of those md5s in its own post-state", () => {
    for (const [name, hash] of Object.entries(PINS)) {
      expect(sql, name).toMatch(new RegExp(`\\('public\\.${name}\\([^)]*\\)',[\\s\\S]{0,400}?'${hash}'`));
    }
  });

  it("recreates no existing function and writes no migration history of its own", () => {
    expect(sql).not.toMatch(/create or replace function/i);
    expect(sql).not.toMatch(/^\s*(begin|commit)\s*;/im);
  });

  it("seeds spec §4's twenty achievements in sort_order", () => {
    const seed = sql.slice(sql.indexOf("insert into public.achievements"), sql.indexOf("create table public.xp_events"));
    const keys = [...seed.matchAll(/\('(\w+)',\s+'(\w+)',\s+'(\w+)',\s+(\d+),\s+(\d+),\s+(\d+)\)/g)];
    expect(keys.map((m) => m[1])).toEqual([
      "first_bottle", "cellar_25", "cellar_100", "first_drink", "drank_50",
      "first_tasting", "tastings_10", "first_host", "perfect_glass", "winner", "glasses_50",
      "first_note", "notes_25", "notes_100", "note_countries_10",
      "first_training", "training_10", "training_ace",
      "first_friend", "friends_10",
    ]);
    expect(keys.map((m) => Number(m[6]))).toEqual(keys.map((_, i) => i + 1));
    expect(keys.every((m) => (m[2] === "cellar") === (m[3] === "cellar"))).toBe(true);
    expect(keys.reduce((s, m) => s + Number(m[5]), 0)).toBe(1525);
  });

  it("seeds spec §2's XP table", () => {
    const seed = sql.slice(sql.indexOf("insert into public.xp_sources"), sql.indexOf("create table public.achievements"));
    const rows = [...seed.matchAll(/\('(\w+)',\s+(\d+),\s+(\d+),\s+(\w+),\s+(\w+),\s+(\w+)\)/g)].map((m) => m.slice(1).join(" "));
    expect(rows).toEqual([
      "guess 10 1 null null null",
      "guess_match 10 10 null null null",
      "tasting_finished 40 0 null null 3",
      "tasting_hosted 40 0 null null 3",
      "cellar_add 0 5 20 100 null",
      "drink 0 15 6 90 null",
      "note 20 0 null null 5",
      "training 20 1 null null 5",
      "achievement 0 0 null null null",
    ]);
  });
});
