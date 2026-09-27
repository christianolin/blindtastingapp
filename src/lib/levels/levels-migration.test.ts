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
  xp_award: "25cd28e3b4d2501d32e9031ca87b9bca",
  xp_consumption_masked: "9a8f6ce6d9de3063e5743dac5bec12b4",
  xp_cellar_on_hand: "3481a84c307948e83a41e56a2e1c40b3",
  xp_tasting_player: "c94850b9c2a258b0042a04a25e7ae7dd",
  xp_tasting_won_by: "a9c32de88c5af2fc781bd7ec0d5689f2",
  xp_achievement_metric: "6221cc770dd3aee16c43bc50a2ca1004",
  xp_check_achievements: "42fb379abdab68f1fdeec11f1af96b58",
  xp_award_guess: "599f905cd9d9f4cc631b57cb2bf4c887",
  xp_award_tasting_close: "12f3b0633f833e11eda81d9a56a62e00",
  xp_award_cellar_lot: "7baec44db9b657eaf6dd6ea1c425e9e6",
  xp_award_drink: "bb4410ed83f66ceed1a5f469c68f2b91",
  xp_award_note: "e04cf320098a84a871eba439e8af0a66",
  xp_award_training: "52a1e008282add33cafcbddf17eb63bc",
  xp_replay_user: "84cd76a07bc5d20cdb2c421839ef4ca3",
  xp_on_glass_revealed: "d6820017f7549a2d2ee7773817d08e07",
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

  // Review round (whole branch): sharing-defaults' held notes, the deletion
  // race and the repair. scripts/levels.test.mjs 13c and 21b are the
  // behavioural tests; these pin the shapes the DB suite exercises.
  it("requires sharing-defaults M1: pins the hold's functions and accepts only the four-trigger wines set", () => {
    const pre = sql.slice(0, sql.indexOf("create table public.xp_sources"));
    expect(pre).toContain("('public.wset_note_held(uuid)',                     '9599a36cd224a3af0d5c2fb3dea70b2b')");
    expect(pre).toContain("('public.wset_notes_hold_on_identity()',            '392edc2f47b146e8fa291703c6739702')");
    expect(pre).toContain("('public.wines_release_note_holds()',               '419a9f4dda4fac12a601207ea3f3b45a')");
    const sets = [...sql.matchAll(/v_text is distinct from '(semi_blind_release_revealed_wine,[^']*)'/g)].map((m) => m[1]);
    expect(sets).toEqual([
      "semi_blind_release_revealed_wine,trg_catalog_wine_unmark_blind,wines_release_note_holds,wset_notes_resolve_on_reveal",
      "semi_blind_release_revealed_wine,trg_catalog_wine_unmark_blind,wines_release_note_holds,wines_xp_on_reveal,wset_notes_resolve_on_reveal",
    ]);
  });

  it("leaves a held note out of note XP and every notes metric (sharing S9)", () => {
    expect(body("xp_award_note")).toContain("if v_context <> 'TRAINING' and not wset_note_held(p_note) then");
    const metric = body("xp_achievement_metric");
    const notes = metric.slice(metric.indexOf("'first_note'"), metric.indexOf("'first_training'"));
    expect(notes.match(/not wset_note_held\(n\.id\)/g)).toHaveLength(2);
  });

  it("pays the notes a reveal releases inside the reveal's one user_id order (L34)", () => {
    const reveal = body("xp_on_glass_revealed");
    expect(reveal).toContain("order by x.user_id, x.step, x.guess_id, x.consumption_id");
    expect(reveal).toContain("case when new.added_by_host then t.host_id else tp.user_id end");
    // Each guesser too: sharing holds an ASYNC IMMEDIATE guesser's note keyed to the glass.
    expect(reveal).toContain("join tasting_participants gp on gp.id = gg.participant_id");
    expect(reveal).toContain("and gt.timing_mode = 'ASYNC' and gt.async_reveal_policy = 'IMMEDIATE'");
    expect(reveal).toContain("perform xp_award_note(v_note.id, now(), false, false);");
    expect(reveal).toContain("perform xp_check_achievements(r.user_id, 'notes', now(), false, false);");
  });

  it("holds the profile row FOR SHARE before an award or an unlock (L27's deletion race)", () => {
    for (const name of ["xp_award", "xp_check_achievements"]) {
      const b = body(name);
      const lock = b.indexOf("perform 1 from profiles where id = p_user and deleted_at is null for share;");
      expect(lock, name).toBeGreaterThan(0);
      expect(b.indexOf("insert into profile_levels"), name).toBeGreaterThan(lock);
      expect(b, name).not.toMatch(/not exists \(select 1 from profiles/);
    }
  });

  it("gives the repair replay the live rules: no lot-less drink without a pour, no time before the account", () => {
    const replay = body("xp_replay_user");
    expect(sql).toContain(
      "create function public.xp_replay_user(p_user uuid, p_seen boolean, p_backfill boolean, p_repair boolean)",
    );
    expect(replay).toMatch(
      /and \(not v_repair\s+or c\.lot_id is not null\s+or exists \(select 1 from wine_pour_intents i where i\.cellar_consumption_id = c\.id\)\)/,
    );
    expect(replay).toContain("v_at := case when v_repair then greatest(r.at, v_joined) else r.at end;");
    expect(replay).toContain("least(f.at, now()) as at");
    expect(sql).toContain("perform public.xp_replay_user(r.id, true, true, false);");
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
