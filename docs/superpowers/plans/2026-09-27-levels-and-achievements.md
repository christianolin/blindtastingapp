# Levels and Achievements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Blindr member XP, a level (1–60) and twenty achievements, awarded in the database from everything they already do (blind guesses, finished and hosted tastings, cellar adds, bottles drunk, notes, training rounds, friends), shown as small pop-ups, a gold ring round their avatar, a level pill in /community and a "Level & achievements" card on /u/[id].

**Architecture:** One additive migration adds an append-only XP ledger (`xp_events`) written only by SECURITY DEFINER triggers on the source tables through one `xp_award()` (row lock, UTC-day caps, running total), levels on `25·L·(L−1)`, twenty seeded achievements checked by one metric function, a replay function that is both the history backfill and the repair tool, and three client RPCs. The app reads the viewer's unseen awards in AppHeader's existing `Promise.all`, hands them to a module store through a render-nothing `<AwardsFeed>`, and one `<AwardsToaster>` in AppShell shows at most three cards and marks them seen through a server action that never revalidates; the rings read the same store.

**Tech Stack:** Next.js 16.2 (App Router, React 19.2, server actions), TypeScript, Tailwind v4 tokens (`globals.css`), lucide-react, Supabase Postgres 17 (plpgsql, RLS), vitest 3 (node environment, `react-dom/server` markup tests), `node:test` + `pg` for the DB suite.

**Spec:** `docs/superpowers/specs/2026-09-27-levels-and-achievements-design.md` (binding, including §13 rulings C1–C4). CLAUDE.md is authoritative context. Where this plan departs from the spec, the section "Where the plan corrects the spec" says so and why.

## Global Constraints

- **Shell prefix:** every shell command starts with `cd /c/Users/Public/repos/blindtastingapp-mapdetail && …` (the shell cwd resets between calls). Never write under `C:\Users\Public\repos\blindtastingapp` (the owner's checkout) or any other worktree.
- **Commits:** `GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit …`, every message ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `levels`; never push (the main session deploys, Rollout R8).
- **The live database is production.** Implementers never touch it: no `pg` connection, no `apply-migration.mjs`, no `scripts/levels.test.mjs` run, no `supabase` CLI. The MAIN SESSION runs every applier dry run and apply and every DB-suite run (section "Rollout (main session)"). No servers, no Anthropic API calls (AGENTS.md cost rules).
- **Migration version:** `20260927160000_levels_and_achievements.sql` (C1). It recreates no existing function, carries no `begin`/`commit` (the applier owns the transaction) and fails closed on its pre-state.
- **Pure modules** under `src/lib/levels/` (`types.ts`, `curve.ts`, `copy.ts`, `toasts.ts`, `level-store.ts`, `snapshot.ts`, `ring.ts`, `card.ts`) import only relatively (`./curve`), with no React and no browser globals, so vitest loads them. `read.ts` is `import "server-only"`; `actions.ts` is `"use server"`.
- **`"use server"` files export only async functions** — not even a type re-export (CLAUDE.md, 2026-09-18). `src/lib/levels/actions.ts` exports `markXpSeen` alone; its types live in `src/lib/levels/types.ts`, imported with `import type`.
- **Tokens only:** colours come from `globals.css` tokens (`gold`, `gold-deep`, `gold-dark`, `on-accent`, `border-light`, `primary`, `primary-foreground`, `card`, `secondary`, `primary-ink`); no hex in any component. Dark mode comes from the same tokens.
- **44 px tap targets** on phones: every new control is `min-h-11`/`size-11` (a `md:pointer-fine:min-h-8` desktop shrink is allowed, the repo's pattern).
- **The page-wrapper rule** (CLAUDE.md, 2026-09-27): every page wrapper is `flex flex-1 flex-col`, never `min-h-full`. This plan adds no page and changes no wrapper.
- **Base UI:** no `Button` is composed with a `Link` in this plan, so no `nativeButton` changes.
- **Rebase-friendly edits (C4):** `database.types.ts`, `CLAUDE.md`, `src/app/u/[id]/page.tsx` and `src/app/u/[id]/profile-header.tsx` are also edited by `training-region-guess` and `sharing-defaults`. Every edit to them here is a targeted insertion at the anchor this plan names; never reformat or reorder those files.
- **Copy (C3):** the spec's §8 drafts ship verbatim (they live in `src/lib/levels/copy.ts`); the owner edits them live later.

## Review Focus

The five inputs most likely to bite a person using this, each pinned by a test in the task that owns the code:

1. **A bottle poured into a glass that is not revealed yet** (D11's Start draw-down or a pour into a running flight): the owner's public XP, level, `first_drink` and on-hand count must not move until that glass's reveal, or a guest learns tonight's bottle from the host's +15. Pinned by DB test 11-12 (Task 1), which also pins `xp_consumption_masked` equal to `catalog_wine_masked_pours`.
2. **An XP award that fails** (a bug, an overflow, a lock): the reveal, the drink and the note it rode on must still succeed, and one person's failure must not cost the other guessers theirs. Pinned by DB test 20 (Task 1) with a per-person integer overflow.
3. **The same award arriving again** — every AppHeader render re-sends the unseen rows, a second tab shows the same rows, an older render lands after a newer one: one card, never twice in a tab, and the level never goes backwards. Pinned by `level-store.test.ts` ("dedupes ids across renders", "keeps the highest XP", "drops a waiting card another tab already showed") in Task 3.
4. **Someone else signing in on the same tab** (sign-out/sign-in is a soft navigation; the store survives it): the new person never sees the previous person's cards or ring. Pinned by `level-store.test.ts` ("forgets the other person's cards when the signed-in user changes", "is keyed by user") in Task 3; the toaster also renders only the view whose `userId` is the signed-in user's (Task 5).
5. **The database ahead of the app** (an achievement key or XP kind the deployed app has no copy for): never rendered raw, and still marked seen so it cannot sit in the 50-row unseen window forever. Pinned by `toasts.test.ts` ("marks a key it has no copy for silently", "still sums a kind it has no label for") in Task 3, `snapshot.test.ts` ("skipping unknown keys") in Task 4 and `copy.test.ts` ("knows only its own keys") in Task 2.

## Where the plan corrects the spec

Read against live (read-only, 2026-09-27) and the code. Each is deliberate; the spec's intent is kept.

1. **§5.4 "exactly" three `wines` triggers.** `sharing-defaults` (merging first, C4) adds `wines_release_note_holds` (AFTER UPDATE OF is_revealed). The pre- and post-state accept exactly the three live names, or those plus that one; `wines_xp_on_reveal` still sorts after `trg_catalog_wine_unmark_blind` and before `wset_notes_resolve_on_reveal` either way (L21).
2. **§5.4 pins.** Two bodies are pinned beyond the spec's seventeen: `semi_blind_release_revealed_wine` (`f2b99368…`, the third same-event trigger) and `send_friend_request` (`8efbf453…`, the other writer of `friendships`). All nineteen live md5s were re-read on 2026-09-27 and match the spec's prefixes.
3. **L14 cellar adds.** The spec's key `cellar_add:<lot>:<least(pq,20)>` alone would pay a lot lowered and raised again (a client can write `purchased_quantity`: 5 → 3 → 6 pays 3 bottles under key `:6`). `xp_award_cellar_lot` pays only past the highest level already paid for that lot, so one lot pays at most 20 bottles in its life, as L14 says. An award the day cap cut to nothing writes no row (L16), so those bottles can still pay on a later day's growth — never past 20.
4. **One lock order.** `xp_check_achievements` takes the person's `profile_levels` row before inserting any `profile_achievements` row (the spec is silent); `xp_award` takes the same row. The reveal trigger also processes the pour's owner inside the same `user_id` order as the guessers (L34), not after them.
5. **Named constraints.** `xp_events.xp_after >= xp` and the two shape checks are named table constraints: Postgres would auto-name both multi-column checks `xp_events_check`/`xp_events_check1`.
6. **Cards.** A welcome batch leaves out the level-up card ("You're level N" already says it), so a batch is always ≤ 3 cards (L29, §10.2). Rows whose achievement key the app has no copy for become `silentIds`, marked seen without a card; otherwise they would refill the 50-row window forever.
7. **Times on the wire.** `get_my_level_state` returns `checked_at` and `created_at` as UTC ISO strings with milliseconds (`to_char`), so every browser parses them alike.
8. **`mark_xp_seen` refuses more than 100 ids** (22023) in the database too; the spec had the limit only in the action. `xp_events_id_seq` is revoked from anon/authenticated (default privileges grant USAGE).
9. **DB test 20** injects the failure with a per-person integer overflow (`profile_levels.xp = 2147483647`) instead of `alter table xp_events add constraint … check (false)`: the DDL takes an ACCESS EXCLUSIVE lock on a live production table for the test's length. It also proves one person's failure leaves the other guessers paid.
10. **DB test 21** (replay parity) uses one-shot facts. A replay sees only a lot's final `purchased_quantity`, so a grown lot has different keys live (`:5`, `:8`) than replayed (`:8`) though the same XP; the test pins keys and XP on facts whose keys cannot differ, and the totals.
11. **/u/[id]** starts the level read before the page's existing `Promise.all` and awaits it after (same parallelism) instead of adding a slot inside it: that destructuring is the line `sharing-defaults` edits.
12. **Rings.** The sidebar, rail and drawer call `useOwnLevel` and render `LevelRing` directly (the profile link's `aria-label` needs the level too); `LiveLevelRing` serves the own /u/[id] header. `ProfileHeader` renders two rings (90 px from md, 74 px on phones) toggled by breakpoint, since each size has its own geometry.
13. **Calibration.** §3.2's activity XP was recomputed read-only from live under this plan's rules: every row of the table matches (d3ee0f40 480, 95584be2 276, f9d82d2a 257, 430f8450 250, …).
14. **Whole-branch review round** (spec §14 A1-A6). The migration now requires sharing-defaults M1 (held notes pay and count only at the reveal that releases them; pre-state pins `wset_note_held`, `wset_notes_hold_on_identity`, `wines_release_note_holds` and only the four-trigger `wines` set — correction 1's three-trigger alternative is gone); `xp_award`/`xp_check_achievements` take the profile row FOR SHARE; `xp_replay_user` gains `p_repair`; the ring's badge gap is computed from the badge; capped bottle rows pop a count-free label; the level card's headings are h2/h3. The DB suite gains 13c and 21b (25 tests).

## File map

| File | Task | Responsibility |
|---|---|---|
| `supabase/migrations/20260927160000_levels_and_achievements.sql` | 1 | Tables, seeds, RLS/grants, functions, triggers, backfill, pre/post asserts |
| `src/lib/levels/__fixtures__/curve.json` | 1 | `[xp, level]` parity rows for SQL and TS |
| `src/lib/levels/levels-migration.test.ts` | 1 | Pins every function body md5, the seeds, no recreate |
| `scripts/levels.test.mjs` | 1 | The DB suite (§10.1), main session only |
| `src/lib/supabase/database.types.ts` | 1 | Five tables, three functions (two insertions) |
| `src/lib/levels/types.ts` | 2 | Shared types |
| `src/lib/levels/curve.ts` (+ test) | 2 | `xpForLevel`, `levelForXp`, `levelProgress` |
| `src/lib/levels/copy.ts` (+ test) | 2 | Every string, labels, formatters |
| `src/lib/levels/toasts.ts` (+ test) | 3 | `buildToasts`, `freshEvents`, `splitXp`, `cleanSeenIds` |
| `src/lib/levels/level-store.ts` (+ test) | 3 | The tab's store: levels, queue, visible cards |
| `src/lib/levels/snapshot.ts` (+ test) | 4 | Raw rows → app types |
| `src/lib/levels/read.ts` | 4 | Server reads (server-only) |
| `src/lib/levels/actions.ts` | 4 | `markXpSeen` (use server) |
| `src/components/levels/awards-feed.tsx` | 4 | Publishes AppHeader's snapshot |
| `src/components/app-header.tsx` | 4, 6 | Snapshot read + `AwardsFeed`; MobileNav level |
| `src/components/levels/awards-toaster.tsx` (+ test) | 5 | The cards |
| `src/components/app-shell.tsx` | 5, 6 | Mount the toaster; the sidebar's first level |
| `src/lib/levels/ring.ts` (+ test) | 6 | Ring geometry |
| `src/components/levels/level-ring.tsx` (+ test) | 6 | Hook-free ring |
| `src/components/levels/live-level-ring.tsx` | 6 | `useOwnLevel`, `LiveLevelRing` |
| `src/components/app-sidebar.tsx`, `src/components/mobile-nav.tsx` | 6 | Rings in full, rail and drawer |
| `src/components/levels/level-pill.tsx` (+ test) | 7 | "Lv N" |
| `src/app/community/page.tsx`, `community-list.tsx` | 7 | Batched levels, the pill |
| `src/lib/levels/card.ts` (+ test) | 8 | The card as data |
| `src/app/u/[id]/level-card.tsx` | 8 | The card |
| `src/app/u/[id]/profile-header.tsx`, `page.tsx` | 8 | Ring + card wiring |
| `src/app/cellar/new/actions.ts` (+ `levels-revalidate.test.ts`) | 9 | L33 |
| `CLAUDE.md` | 9 | The levels bullet |

Vitest totals on this branch's base (`e069861`): 212 files / 4,138 tests. Each task's gate states the expected total after it; after the C4 rebase the base moves — then the gate is "the previous total plus this task's new tests, 0 failed".

---

### Task 1: The migration, its types and the DB suite

The whole database side in one reviewable unit: five tables, the award machinery, ten triggers, the backfill, and the suite that proves it. Implementers write and statically check it; the main session runs it (Rollout R2–R6).

**Files:**
- Create: `src/lib/levels/levels-migration.test.ts`
- Create: `supabase/migrations/20260927160000_levels_and_achievements.sql`
- Create: `src/lib/levels/__fixtures__/curve.json`
- Modify: `src/lib/supabase/database.types.ts` (two insertions at named anchors)
- Create: `scripts/levels.test.mjs`

**Interfaces:**
- Consumes: nothing from other tasks. Live objects it relies on are pinned in its pre-state (nineteen md5s, the `wines` trigger set, five enum labels).
- Produces (database, all `public`):
  - tables `xp_sources(kind pk, base_xp, unit_xp, unit_cap, daily_xp_cap, daily_count_cap)`, `achievements(key pk, category, gate, target, bonus_xp, sort_order, is_active)`, `xp_events(id bigint identity pk, user_id, kind, source_key, xp, xp_after, units, achievement_key, day, created_at, seen_at)` unique `(user_id, source_key)`, `profile_levels(user_id pk, xp, level smallint, welcome_pending, updated_at)`, `profile_achievements(user_id, achievement_key, gate, unlocked_at, backfill)` pk `(user_id, achievement_key)`.
  - client RPCs (EXECUTE `authenticated` only): `get_my_level_state() returns jsonb` = `{ xp, level, welcome, checked_at, unseen: [{ id, kind, xp, xp_after, units, achievement, created_at }] }` (≤ 50, oldest first; times `YYYY-MM-DDTHH:MM:SS.mmmZ`); `mark_xp_seen(p_ids bigint[], p_welcome boolean) returns void`; `get_my_achievement_progress() returns table(key text, category text, bonus_xp int, target int, progress int, unlocked_at timestamptz, backfill boolean)`.
  - owner-only: `level_for_xp(integer) returns smallint`, `xp_award(...)`, `xp_replay_user(uuid, boolean, boolean) returns integer` (the repair tool), `xp_achievement_metric(uuid, text) returns integer`, `xp_cellar_on_hand(uuid)`, `xp_consumption_masked(uuid)`, and the rest listed in the post-state.
  - TypeScript: `Database["public"]["Tables"]["profile_levels" | "profile_achievements" | "xp_events" | "xp_sources" | "achievements"]`, `Database["public"]["Functions"]["get_my_level_state" | "mark_xp_seen" | "get_my_achievement_progress"]`.
  - `src/lib/levels/__fixtures__/curve.json`: `[xp, level][]`, 179 rows (Task 2's `curve.test.ts` and DB test 1 read it).

- [ ] **Step 1: Write the failing pin test**

Create `src/lib/levels/levels-migration.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels/levels-migration.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, open 'supabase/migrations/20260927160000_levels_and_achievements.sql'`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260927160000_levels_and_achievements.sql` exactly as below. The pre-state was executed read-only against live on 2026-09-27 and passes; every plpgsql body was compiled against live (inside a never-executed `DO` block) and every SQL body that touches only existing tables was `PREPARE`d; the `pg_get_*` strings in the post-state are written from the live formats of equivalent objects and are confirmed by the main session's dry run (Rollout R2), not here.

```sql
-- Levels and achievements: an append-only XP ledger written by triggers on the
-- source tables, levels on a fixed curve, twenty achievements, the history
-- backfill and three client RPCs.
--
-- Spec: docs/superpowers/specs/2026-09-27-levels-and-achievements-design.md
-- (§2-§7; L1-L36; C1: this version, 20260927160000). Plan:
-- docs/superpowers/plans/2026-09-27-levels-and-achievements.md, Task 1.
-- Additive for the deployed app: nothing it runs reads the five new tables,
-- and no existing function is recreated.
--
-- Written against the LIVE state (read-only, 2026-09-27), never an older
-- migration file alone:
-- * reveal_wine and the last step of reveal_next_category score every guess
--   on the glass BEFORE `update wines set is_revealed = true`; score_own_guess
--   never sets is_revealed (L12).
-- * pour_cellar_lot_into_glass and draw_down_flight_cellar_lots insert the
--   DRANK consumption BEFORE pointing wine_pour_intents.cellar_consumption_id
--   at it, which is why the consumption trigger is deferred to COMMIT (L21).
-- * The AFTER UPDATE OF is_revealed triggers on wines are
--   semi_blind_release_revealed_wine, trg_catalog_wine_unmark_blind (which
--   deletes the glass's flight_holds rows) and wset_notes_resolve_on_reveal;
--   sharing-defaults (20260927140000) adds wines_release_note_holds. Same-event
--   triggers fire in name order, so wines_xp_on_reveal runs after the unmark
--   and before the note resolve.
-- * No trigger exists on cellar_consumptions, training_attempts or
--   friendships beyond friendships_refuse_deleted_profile.
-- * wset_notes has no index on author_id and tasting_participants none on
--   user_id (L24).
-- * record_training_attempt is deliberately NOT pinned (its live body is
--   training-region-guess's); the training trigger reads training_attempts
--   columns only.
--
-- What this migration does:
-- 1. xp_sources, achievements (seeded), xp_events (the ledger),
--    profile_levels, profile_achievements; RLS and grants (§5.2).
-- 2. Two indexes: wset_notes (author_id), tasting_participants (user_id).
-- 3. The curve, the one award function, the metrics, the achievement check,
--    the per-source award functions and the replay (§4.1, §5.3).
-- 4. Ten triggers on the source tables (§7.1), each wrapping its work so an
--    XP error never blocks the write that caused it (L20).
-- 5. get_my_level_state, mark_xp_seen, get_my_achievement_progress (§6.1).
-- 6. The backfill: every non-deleted profile replayed, seen, with one welcome
--    (L1, L25, L26). The triggers already exist, so no fact falls between.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. Nothing this migration creates exists yet.
  select string_agg(t, ', ') into v_text
  from unnest(array['xp_sources', 'achievements', 'xp_events', 'profile_levels', 'profile_achievements',
                    'wset_notes_author_idx', 'tasting_participants_user_idx']) as t
  where to_regclass('public.' || t) is not null;
  if v_text is not null then
    raise exception 'already exists: %; re-read live before applying', v_text;
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and (p.proname like 'xp\_%' or p.proname in ('level_for_xp', 'get_my_level_state', 'mark_xp_seen',
                                                  'get_my_achievement_progress'));
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %', v_text;
  end if;
  select string_agg(t.tgname, ', ') into v_text
  from pg_trigger t
  where not t.tgisinternal
    and t.tgname in ('wines_xp_on_reveal', 'tastings_xp_on_close', 'cellar_lots_xp_insert',
                     'cellar_lots_xp_update', 'cellar_consumptions_xp', 'wset_notes_xp_insert',
                     'wset_notes_xp_identity', 'training_attempts_xp', 'friendships_xp',
                     'profiles_deleted_drop_levels');
  if v_text is not null then
    raise exception 'a trigger this migration creates already exists: %', v_text;
  end if;

  -- 2. The bodies the triggers rely on (md5 of prosrc with any CR stripped).
  --    §5.4's seventeen, plus semi_blind_release_revealed_wine (the third
  --    same-event trigger on wines) and send_friend_request (the other writer
  --    of friendships).
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.reveal_wine(uuid)',                        'ed7f78a59fb299b6307e586b8e8ab5c0'),
    ('public.reveal_next_category(uuid,smallint)',      '6a08183662534db0d212b2412d729ac2'),
    ('public.score_own_guess(uuid)',                    '395045b10c179a6fea43507ce8ce15e6'),
    ('public.pour_cellar_lot_into_glass(uuid)',         '558e60723fa745ead80dd0dc75871411'),
    ('public.draw_down_flight_cellar_lots(uuid)',       '0cbe5dd2dd771abb3cbd5855ea78f7c4'),
    ('public.consume_cellar_lot(jsonb)',                '990d02e64f1e093c4f6d5aac3269e5c7'),
    ('public.add_cellar_lot(jsonb)',                    '52c28f6b1dc08254407cc2aa59601e62'),
    ('public.import_cellar_lot(jsonb)',                 '4ebae4297787e1afef2cf79781480429'),
    ('public.save_wset_note(jsonb,jsonb)',              '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.catalog_wine_unmark_blind()',              'de1f11ee58c418bf8fdc9310f0ba508f'),
    ('public.flight_holds_on_pour()',                   'f2eefca376cd3135468195963bf32ae5'),
    ('public.wset_notes_resolve_on_reveal()',           'f406623e9d46feb1f1aa0fb8c285529d'),
    ('public.catalog_wine_masked_pours(uuid[])',        'fea91b152e3565f16c56cc1d15810d29'),
    ('public.scrub_deleted_account(uuid)',              'b9aa8d71a00dda3aec526a2ec6950f1d'),
    ('public.can_view_cellar(uuid)',                    '3af2e51e338dc43cc48b58f061049ec2'),
    ('public.accept_friend_request(uuid)',              '8c473e36e07123e4a4ab2ee5b211b454'),
    ('public.accept_platform_invite(text)',             '9b3e4a89a84d2eb482c312eba87c4d37'),
    ('public.semi_blind_release_revealed_wine()',       'f2b99368997eaa08944e7d31943ed12a'),
    ('public.send_friend_request(uuid)',                '8efbf4536f08f335934d517ca5007238')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'function bodies differ from the live ones this file was written against: %', v_text;
  end if;

  -- 3. L21's name-order premise: the same-event triggers on wines are the
  --    three live ones, or those plus sharing-defaults' note-hold release.
  select string_agg(t.tgname, ',' order by t.tgname collate "C") into v_text
  from pg_trigger t
  where t.tgrelid = 'public.wines'::regclass and not t.tgisinternal
    and pg_get_triggerdef(t.oid) like '% AFTER UPDATE OF is_revealed ON public.wines %';
  if v_text is distinct from 'semi_blind_release_revealed_wine,trg_catalog_wine_unmark_blind,wset_notes_resolve_on_reveal'
     and v_text is distinct from 'semi_blind_release_revealed_wine,trg_catalog_wine_unmark_blind,wines_release_note_holds,wset_notes_resolve_on_reveal' then
    raise exception 'the AFTER UPDATE OF is_revealed triggers on wines are not the known set: %', v_text;
  end if;

  -- 4. The enum labels the functions compare against.
  if not (array['BLIND', 'SEMI_BLIND'] <@ enum_range(null::reveal_mode_type)::text[])
     or not ('CLOSED' = any (enum_range(null::tasting_status)::text[]))
     or not ('JOINED' = any (enum_range(null::participant_status)::text[]))
     or not ('DRANK' = any (enum_range(null::cellar_consumption_reason)::text[]))
     or not ('TRAINING' = any (enum_range(null::wset_note_context)::text[])) then
    raise exception 'an enum label the XP rules compare against is missing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Tables (§5.1; multi-column checks carry explicit names).
-- ---------------------------------------------------------------------------
create table public.xp_sources (
  kind            text primary key,
  base_xp         integer not null default 0 check (base_xp >= 0),
  unit_xp         integer not null default 0 check (unit_xp >= 0),
  unit_cap        integer check (unit_cap > 0),
  daily_xp_cap    integer check (daily_xp_cap > 0),
  daily_count_cap integer check (daily_count_cap > 0)
);

-- §2's table. A change here affects future awards only (L36).
insert into public.xp_sources (kind, base_xp, unit_xp, unit_cap, daily_xp_cap, daily_count_cap) values
  ('guess',            10,  1, null, null, null),
  ('guess_match',      10, 10, null, null, null),
  ('tasting_finished', 40,  0, null, null,    3),
  ('tasting_hosted',   40,  0, null, null,    3),
  ('cellar_add',        0,  5,   20,  100, null),
  ('drink',             0, 15,    6,   90, null),
  ('note',             20,  0, null, null,    5),
  ('training',         20,  1, null, null,    5),
  ('achievement',       0,  0, null, null, null);

create table public.achievements (
  key        text primary key,
  category   text not null check (category in ('cellar', 'tastings', 'notes', 'training', 'friends')),
  gate       text not null check (gate in ('public', 'cellar')),
  target     integer not null check (target > 0),
  bonus_xp   integer not null check (bonus_xp between 25 and 250),
  sort_order integer not null,
  is_active  boolean not null default true,
  constraint achievements_gate_follows_category check ((category = 'cellar') = (gate = 'cellar'))
);

-- §4's table; names and descriptions live in src/lib/levels/copy.ts (L22).
insert into public.achievements (key, category, gate, target, bonus_xp, sort_order) values
  ('first_bottle',      'cellar',   'cellar',   1,  25,  1),
  ('cellar_25',         'cellar',   'cellar',  25,  50,  2),
  ('cellar_100',        'cellar',   'cellar', 100, 150,  3),
  ('first_drink',       'cellar',   'cellar',   1,  25,  4),
  ('drank_50',          'cellar',   'cellar',  50, 100,  5),
  ('first_tasting',     'tastings', 'public',   1,  25,  6),
  ('tastings_10',       'tastings', 'public',  10, 100,  7),
  ('first_host',        'tastings', 'public',   1,  50,  8),
  ('perfect_glass',     'tastings', 'public',   1, 100,  9),
  ('winner',            'tastings', 'public',   1, 100, 10),
  ('glasses_50',        'tastings', 'public',  50, 100, 11),
  ('first_note',        'notes',    'public',   1,  25, 12),
  ('notes_25',          'notes',    'public',  25,  75, 13),
  ('notes_100',         'notes',    'public', 100, 200, 14),
  ('note_countries_10', 'notes',    'public',  10, 100, 15),
  ('first_training',    'training', 'public',   1,  25, 16),
  ('training_10',       'training', 'public',  10,  75, 17),
  ('training_ace',      'training', 'public',   1, 100, 18),
  ('first_friend',      'friends',  'public',   1,  25, 19),
  ('friends_10',        'friends',  'public',  10,  75, 20);

create table public.xp_events (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  kind            text not null references public.xp_sources(kind),
  source_key      text not null,
  xp              integer not null check (xp > 0),
  xp_after        integer not null,
  units           integer,
  achievement_key text references public.achievements(key),
  day             date not null,
  created_at      timestamptz not null default now(),
  seen_at         timestamptz,
  constraint xp_events_user_id_source_key_key unique (user_id, source_key),
  constraint xp_events_xp_after_check check (xp_after >= xp),
  constraint xp_events_achievement_shape check ((kind = 'achievement') = (achievement_key is not null))
);
create index xp_events_user_kind_day_idx on public.xp_events (user_id, kind, day);
create index xp_events_unseen_idx on public.xp_events (user_id, id) where seen_at is null;

create table public.profile_levels (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  xp              integer not null default 0 check (xp >= 0),
  level           smallint not null default 1 check (level between 1 and 60),
  welcome_pending boolean not null default false,
  updated_at      timestamptz not null default now()
);

create table public.profile_achievements (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null references public.achievements(key),
  gate            text not null check (gate in ('public', 'cellar')),
  unlocked_at     timestamptz not null default now(),
  backfill        boolean not null default false,
  primary key (user_id, achievement_key)
);

-- L24: the two reads the metrics lean on.
create index wset_notes_author_idx on public.wset_notes (author_id);
create index tasting_participants_user_idx on public.tasting_participants (user_id);

-- §5.2. Supabase's default privileges hand every new table to anon,
-- authenticated and service_role; authenticated keeps SELECT alone, anon and
-- PUBLIC nothing. No client role writes any of the five.
alter table public.xp_sources enable row level security;
alter table public.achievements enable row level security;
alter table public.xp_events enable row level security;
alter table public.profile_levels enable row level security;
alter table public.profile_achievements enable row level security;

create policy "xp sources read" on public.xp_sources for select to authenticated using (true);
create policy "achievements read" on public.achievements for select to authenticated using (true);
create policy "xp events read own" on public.xp_events for select to authenticated
  using (user_id = auth.uid());
create policy "profile levels read" on public.profile_levels for select to authenticated using (true);
-- A cellar achievement follows the cellar's own gate (L6, L23).
create policy "profile achievements read" on public.profile_achievements for select to authenticated
  using (user_id = auth.uid() or gate <> 'cellar' or can_view_cellar(user_id));

revoke all on table public.xp_sources, public.achievements, public.xp_events,
  public.profile_levels, public.profile_achievements from public, anon, authenticated;
revoke all on sequence public.xp_events_id_seq from public, anon, authenticated;
grant select on table public.xp_sources, public.achievements, public.xp_events,
  public.profile_levels, public.profile_achievements to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The curve (§3.1): the largest L ≤ 60 with 25·L·(L−1) ≤ xp. The square
--    root is a first guess; the integer thresholds correct it by ±1.
--    src/lib/levels/curve.ts is the same rule; both are pinned to
--    src/lib/levels/__fixtures__/curve.json.
-- ---------------------------------------------------------------------------
create function public.level_for_xp(p_xp integer)
returns smallint language plpgsql immutable set search_path = public as $$
declare
  x bigint := greatest(coalesce(p_xp, 0), 0);
  v bigint;
begin
  v := floor((1 + sqrt(1 + 4 * x / 25.0)) / 2);
  while v > 1 and 25 * v * (v - 1) > x loop
    v := v - 1;
  end loop;
  while v < 60 and 25 * (v + 1) * v <= x loop
    v := v + 1;
  end loop;
  return least(greatest(v, 1), 60)::smallint;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The one award (L19): locks the person's profile_levels row, applies the
--    kind's daily caps for the UTC day of p_at (L16), writes the ledger row
--    with its running total, and moves the level. Returns the XP paid; 0 when
--    p_xp <= 0, the profile is missing or deleted, the key was paid, or a cap
--    took it all (no zero-XP rows).
-- ---------------------------------------------------------------------------
create function public.xp_award(p_user uuid, p_kind text, p_source_key text, p_xp integer,
                                p_units integer, p_achievement text, p_at timestamptz, p_seen boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_at timestamptz := coalesce(p_at, now());
  v_day date := (coalesce(p_at, now()) at time zone 'utc')::date;
  v_src xp_sources%rowtype;
  v_total integer;
  v_xp integer := p_xp;
  v_count integer;
  v_sum integer;
  v_id bigint;
begin
  if p_user is null or p_source_key is null or coalesce(p_xp, 0) <= 0 then
    return 0;
  end if;
  if not exists (select 1 from profiles where id = p_user and deleted_at is null) then
    return 0;
  end if;
  select * into v_src from xp_sources where kind = p_kind;
  if not found then
    raise exception 'unknown xp kind %', p_kind;
  end if;
  insert into profile_levels (user_id) values (p_user) on conflict (user_id) do nothing;
  select xp into v_total from profile_levels where user_id = p_user for update;
  -- Under the lock: a concurrent transaction may have paid this key already.
  if exists (select 1 from xp_events where user_id = p_user and source_key = p_source_key) then
    return 0;
  end if;
  if v_src.daily_count_cap is not null then
    select count(*) into v_count from xp_events
     where user_id = p_user and kind = p_kind and day = v_day;
    if v_count >= v_src.daily_count_cap then
      return 0;
    end if;
  end if;
  if v_src.daily_xp_cap is not null then
    select coalesce(sum(xp), 0) into v_sum from xp_events
     where user_id = p_user and kind = p_kind and day = v_day;
    v_xp := least(v_xp, v_src.daily_xp_cap - v_sum);
    if v_xp <= 0 then
      return 0;
    end if;
  end if;
  insert into xp_events (user_id, kind, source_key, xp, xp_after, units, achievement_key, day, created_at, seen_at)
  values (p_user, p_kind, p_source_key, v_xp, v_total + v_xp, p_units, p_achievement, v_day, v_at,
          case when p_seen then now() end)
  on conflict (user_id, source_key) do nothing
  returning id into v_id;
  if v_id is null then
    return 0;
  end if;
  update profile_levels
     set xp = v_total + v_xp,
         level = level_for_xp(v_total + v_xp),
         updated_at = now()
   where user_id = p_user;
  return v_xp;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The metrics (§4.1): the one definition of every unlock rule, used by the
--    live check, the replay and the own-profile progress RPC.
-- ---------------------------------------------------------------------------

-- catalog_wine_masked_pours' predicate (md5 fea91b15…, pinned above), per
-- consumption: a bottle poured into a glass not revealed yet (L4).
create function public.xp_consumption_masked(p_consumption uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from flight_holds h where h.consumption_id = p_consumption)
      or exists (select 1
                   from wine_pour_intents i
                   join wines w on w.id = i.wine_id
                  where i.cellar_consumption_id = p_consumption
                    and not w.is_revealed);
$$;

-- Bottles on hand, a masked pour still counted as in the cellar (L4).
create function public.xp_cellar_on_hand(p_user uuid)
returns integer language sql stable security definer set search_path = public as $$
  select ((select coalesce(sum(l.quantity), 0) from cellar_lots l where l.owner_id = p_user)
        + (select coalesce(sum(c.quantity), 0)
             from cellar_consumptions c
            where c.owner_id = p_user and xp_consumption_masked(c.id)))::integer;
$$;

-- A JOINED seat with a scored, non-blank guess on a revealed glass (L13).
create function public.xp_tasting_player(p_tasting uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from tasting_participants p
      join guesses g on g.participant_id = p.id
      join wines w on w.id = g.wine_id
     where p.tasting_id = p_tasting and p.user_id = p_user and p.status = 'JOINED'
       and w.tasting_id = p_tasting and w.is_revealed and g.scored_at is not null
       and num_nonnulls(g.country_id, g.region_id, g.appellation_id, g.primary_grape_id,
                        g.secondary_grape_id, g.producer_id, g.type_designation_id,
                        g.vintage_kind, g.guessed_wine_id) > 0);
$$;

-- L35: most points over revealed glasses among >= 3 players; top > 0; ties all win.
create function public.xp_tasting_won_by(p_tasting uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with totals as (
    select p.user_id, sum(coalesce(g.total_points, 0)) as points
      from tasting_participants p
      join guesses g on g.participant_id = p.id
      join wines w on w.id = g.wine_id
     where p.tasting_id = p_tasting and p.status = 'JOINED'
       and w.tasting_id = p_tasting and w.is_revealed and g.scored_at is not null
       and num_nonnulls(g.country_id, g.region_id, g.appellation_id, g.primary_grape_id,
                        g.secondary_grape_id, g.producer_id, g.type_designation_id,
                        g.vintage_kind, g.guessed_wine_id) > 0
     group by p.user_id
  )
  select coalesce(count(*) >= 3
                  and max(points) > 0
                  and max(points) = max(points) filter (where user_id = p_user), false)
    from totals;
$$;

create function public.xp_achievement_metric(p_user uuid, p_key text)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v bigint := 0;
begin
  if p_key = 'first_bottle' then
    select count(*) into v from cellar_lots where owner_id = p_user;
  elsif p_key in ('cellar_25', 'cellar_100') then
    v := xp_cellar_on_hand(p_user);
  elsif p_key in ('first_drink', 'drank_50') then
    select coalesce(sum(c.quantity), 0) into v
      from cellar_consumptions c
     where c.owner_id = p_user and c.reason = 'DRANK' and not xp_consumption_masked(c.id);
  elsif p_key in ('first_tasting', 'tastings_10') then
    select count(*) into v
      from tastings t
     where (t.host_id = p_user
            or t.id in (select s.tasting_id from tasting_participants s where s.user_id = p_user))
       and t.status = 'CLOSED' and t.reveal_mode in ('BLIND', 'SEMI_BLIND')
       and exists (select 1 from wines w where w.tasting_id = t.id and w.is_revealed)
       and ((t.host_id <> p_user and xp_tasting_player(t.id, p_user))
            or (t.host_id = p_user
                and exists (select 1 from tasting_participants o
                             where o.tasting_id = t.id and o.status = 'JOINED' and o.user_id <> p_user)));
  elsif p_key = 'first_host' then
    select count(*) into v
      from tastings t
     where t.host_id = p_user
       and t.status = 'CLOSED' and t.reveal_mode in ('BLIND', 'SEMI_BLIND')
       and exists (select 1 from wines w where w.tasting_id = t.id and w.is_revealed)
       and exists (select 1 from tasting_participants o
                    where o.tasting_id = t.id and o.status = 'JOINED' and o.user_id <> p_user);
  elsif p_key = 'perfect_glass' then
    -- reveal_wine's own per-category maxima; after a full reveal a null
    -- points column means "not in play".
    select count(*) into v
      from tasting_participants p
      join guesses g on g.participant_id = p.id
      join wines w on w.id = g.wine_id
      join tastings t on t.id = w.tasting_id
     where p.user_id = p_user and t.reveal_mode = 'BLIND' and w.is_revealed
       and g.scored_at is not null
       and (2 * (g.country_points is not null)::int + 3 * (g.region_points is not null)::int
            + 5 * (g.appellation_points is not null)::int + 8 * (g.primary_grape_points is not null)::int
            + 2 * (g.secondary_grape_points is not null)::int + 6 * (g.producer_points is not null)::int
            + 2 * (g.type_designation_points is not null)::int + 2 * (g.vintage_points is not null)::int) > 0
       and g.total_points =
             2 * (g.country_points is not null)::int + 3 * (g.region_points is not null)::int
             + 5 * (g.appellation_points is not null)::int + 8 * (g.primary_grape_points is not null)::int
             + 2 * (g.secondary_grape_points is not null)::int + 6 * (g.producer_points is not null)::int
             + 2 * (g.type_designation_points is not null)::int + 2 * (g.vintage_points is not null)::int;
  elsif p_key = 'winner' then
    select count(*) into v
      from tastings t
     where (t.host_id = p_user
            or t.id in (select s.tasting_id from tasting_participants s where s.user_id = p_user))
       and t.status = 'CLOSED' and t.reveal_mode in ('BLIND', 'SEMI_BLIND')
       and exists (select 1 from wines w where w.tasting_id = t.id and w.is_revealed)
       and xp_tasting_won_by(t.id, p_user);
  elsif p_key = 'glasses_50' then
    -- The ledger's guess rows (L24): exact, because guess XP is uncapped.
    select count(*) into v from xp_events where user_id = p_user and kind in ('guess', 'guess_match');
  elsif p_key in ('first_note', 'notes_25', 'notes_100') then
    -- Every note, identity-less ones included: a count names no wine.
    select count(*) into v from wset_notes where author_id = p_user;
  elsif p_key = 'note_countries_10' then
    select count(distinct cw.country_id) into v
      from wset_notes n
      join catalog_wines cw on cw.id = n.catalog_wine_id
     where n.author_id = p_user and not cw.blind_pending;
  elsif p_key in ('first_training', 'training_10') then
    select count(*) into v from training_attempts where author_id = p_user and scored_at is not null;
  elsif p_key = 'training_ace' then
    select count(*) into v
      from training_attempts
     where author_id = p_user and scored_at is not null
       and possible_points > 0 and total_points = possible_points;
  elsif p_key in ('first_friend', 'friends_10') then
    select count(*) into v from friendships where user_id = p_user;
  end if;
  return least(coalesce(v, 0), 2147483647)::integer;
end $$;

-- Walks the active achievements of one category the person has NOT unlocked
-- (a veteran pays nothing for earned ones), in sort_order; unlocks each whose
-- metric reached its target and pays its bonus. Takes the person's
-- profile_levels row before any profile_achievements row: one lock order.
create function public.xp_check_achievements(p_user uuid, p_category text, p_at timestamptz,
                                             p_seen boolean, p_backfill boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  v_locked boolean := false;
  v_unlocked integer := 0;
begin
  if p_user is null
     or not exists (select 1 from profiles where id = p_user and deleted_at is null) then
    return 0;
  end if;
  for r in
    select a.key, a.gate, a.target, a.bonus_xp
      from achievements a
     where a.category = p_category and a.is_active
       and not exists (select 1 from profile_achievements pa
                        where pa.user_id = p_user and pa.achievement_key = a.key)
     order by a.sort_order, a.key
  loop
    if xp_achievement_metric(p_user, r.key) >= r.target then
      if not v_locked then
        insert into profile_levels (user_id) values (p_user) on conflict (user_id) do nothing;
        perform 1 from profile_levels where user_id = p_user for update;
        v_locked := true;
      end if;
      insert into profile_achievements (user_id, achievement_key, gate, unlocked_at, backfill)
      values (p_user, r.key, r.gate, coalesce(p_at, now()), coalesce(p_backfill, false))
      on conflict (user_id, achievement_key) do nothing;
      if found then
        perform xp_award(p_user, 'achievement', 'achievement:' || r.key, r.bonus_xp, null, r.key,
                         p_at, p_seen);
        v_unlocked := v_unlocked + 1;
      end if;
    end if;
  end loop;
  return v_unlocked;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The per-source awards (§5.3), shared by the triggers (p_check true) and
--    the replay (p_check false): one definition of every rule.
-- ---------------------------------------------------------------------------

-- L11/L12: a scored, non-blank guess on a globally revealed glass of a
-- BLIND/SEMI_BLIND tasting. guess = 10 + points; guess_match = 10 + 10·match (L10).
create function public.xp_award_guess(p_guess uuid, p_at timestamptz, p_seen boolean, p_check boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_user uuid;
  v_mode reveal_mode_type;
  v_points integer;
  v_kind text;
  v_src xp_sources%rowtype;
  v_units integer;
  v_paid integer;
begin
  select p.user_id, t.reveal_mode, coalesce(g.total_points, 0)
    into v_user, v_mode, v_points
    from guesses g
    join wines w on w.id = g.wine_id
    join tastings t on t.id = w.tasting_id
    join tasting_participants p on p.id = g.participant_id and p.tasting_id = w.tasting_id
   where g.id = p_guess
     and w.is_revealed
     and g.scored_at is not null
     and t.reveal_mode in ('BLIND', 'SEMI_BLIND')
     and num_nonnulls(g.country_id, g.region_id, g.appellation_id, g.primary_grape_id,
                      g.secondary_grape_id, g.producer_id, g.type_designation_id,
                      g.vintage_kind, g.guessed_wine_id) > 0;
  if v_user is null then
    return 0;
  end if;
  v_kind := case when v_mode = 'SEMI_BLIND' then 'guess_match' else 'guess' end;
  select * into v_src from xp_sources where kind = v_kind;
  v_units := greatest(v_points, 0);
  if v_src.unit_cap is not null then
    v_units := least(v_units, v_src.unit_cap);
  end if;
  v_paid := xp_award(v_user, v_kind, 'guess:' || p_guess::text,
                     v_src.base_xp + v_src.unit_xp * v_units, v_units, null, p_at, p_seen);
  if p_check then
    perform xp_check_achievements(v_user, 'tastings', p_at, p_seen, false);
  end if;
  return v_paid;
end $$;

-- L13: a closed BLIND/SEMI_BLIND tasting with a revealed glass pays a JOINED
-- guest who played (finish:) and a host with another JOINED seat (host:).
-- Keys make a reopen and re-close pay nothing twice.
create function public.xp_award_tasting_close(p_tasting uuid, p_user uuid, p_at timestamptz,
                                              p_seen boolean, p_check boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_host uuid;
  v_kind text;
  v_key text;
  v_src xp_sources%rowtype;
  v_paid integer;
begin
  select t.host_id into v_host
    from tastings t
   where t.id = p_tasting and t.status = 'CLOSED'
     and t.reveal_mode in ('BLIND', 'SEMI_BLIND')
     and exists (select 1 from wines w where w.tasting_id = t.id and w.is_revealed);
  if v_host is null or p_user is null then
    return 0;
  end if;
  if v_host = p_user then
    if exists (select 1 from tasting_participants o
                where o.tasting_id = p_tasting and o.status = 'JOINED' and o.user_id <> p_user) then
      v_kind := 'tasting_hosted';
      v_key := 'host:' || p_tasting::text;
    end if;
  elsif xp_tasting_player(p_tasting, p_user) then
    v_kind := 'tasting_finished';
    v_key := 'finish:' || p_tasting::text;
  end if;
  if v_kind is null then
    return 0;
  end if;
  select * into v_src from xp_sources where kind = v_kind;
  v_paid := xp_award(p_user, v_kind, v_key, v_src.base_xp, null, null, p_at, p_seen);
  if p_check then
    perform xp_check_achievements(p_user, 'tastings', p_at, p_seen, false);
  end if;
  return v_paid;
end $$;

-- L14: growth of purchased_quantity, at most unit_cap (20) bottles over the
-- lot's life. The key names the level reached; a lot lowered and raised again
-- is paid only past the highest level already paid.
create function public.xp_award_cellar_lot(p_lot uuid, p_old integer, p_new integer, p_at timestamptz,
                                           p_seen boolean, p_check boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_owner uuid;
  v_src xp_sources%rowtype;
  v_cap integer;
  v_from integer;
  v_to integer;
  v_paid_to integer;
  v_units integer;
  v_paid integer := 0;
begin
  select l.owner_id into v_owner from cellar_lots l where l.id = p_lot;
  if v_owner is null then
    return 0;
  end if;
  select * into v_src from xp_sources where kind = 'cellar_add';
  v_cap := coalesce(v_src.unit_cap, 2147483647);
  v_from := least(greatest(coalesce(p_old, 0), 0), v_cap);
  v_to := least(greatest(coalesce(p_new, 0), 0), v_cap);
  select coalesce(max(split_part(e.source_key, ':', 3)::integer), 0) into v_paid_to
    from xp_events e
   where e.user_id = v_owner and e.kind = 'cellar_add'
     and e.source_key like 'cellar_add:' || p_lot::text || ':%';
  v_units := v_to - greatest(v_from, v_paid_to);
  if v_units > 0 then
    v_paid := xp_award(v_owner, 'cellar_add', 'cellar_add:' || p_lot::text || ':' || v_to::text,
                       v_src.base_xp + v_src.unit_xp * v_units, v_units, null, p_at, p_seen);
  end if;
  if p_check then
    perform xp_check_achievements(v_owner, 'cellar', p_at, p_seen, false);
  end if;
  return v_paid;
end $$;

-- L17/L21: a DRANK consumption, at most unit_cap (6) bottles, never while its
-- pour is masked. The reveal passes p_require_lot false (the lot may be gone).
create function public.xp_award_drink(p_consumption uuid, p_at timestamptz, p_seen boolean,
                                      p_check boolean, p_require_lot boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_c cellar_consumptions%rowtype;
  v_src xp_sources%rowtype;
  v_units integer;
  v_paid integer;
begin
  select * into v_c from cellar_consumptions where id = p_consumption;
  if not found or v_c.reason <> 'DRANK' or (coalesce(p_require_lot, true) and v_c.lot_id is null)
     or xp_consumption_masked(v_c.id) then
    return 0;
  end if;
  select * into v_src from xp_sources where kind = 'drink';
  v_units := greatest(v_c.quantity, 0);
  if v_src.unit_cap is not null then
    v_units := least(v_units, v_src.unit_cap);
  end if;
  v_paid := xp_award(v_c.owner_id, 'drink', 'drink:' || v_c.id::text,
                     v_src.base_xp + v_src.unit_xp * v_units, v_units, null, p_at, p_seen);
  if p_check then
    perform xp_check_achievements(v_c.owner_id, 'cellar', p_at, p_seen, false);
  end if;
  return v_paid;
end $$;

-- L18: a TRAINING note is paid by its round, but still counts as a note.
create function public.xp_award_note(p_note uuid, p_at timestamptz, p_seen boolean, p_check boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_author uuid;
  v_context wset_note_context;
  v_src xp_sources%rowtype;
  v_paid integer := 0;
begin
  select n.author_id, n.context_kind into v_author, v_context from wset_notes n where n.id = p_note;
  if v_author is null then
    return 0;
  end if;
  if v_context <> 'TRAINING' then
    select * into v_src from xp_sources where kind = 'note';
    v_paid := xp_award(v_author, 'note', 'note:' || p_note::text, v_src.base_xp, null, null, p_at, p_seen);
  end if;
  if p_check then
    perform xp_check_achievements(v_author, 'notes', p_at, p_seen, false);
  end if;
  return v_paid;
end $$;

create function public.xp_award_training(p_attempt uuid, p_at timestamptz, p_seen boolean, p_check boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_author uuid;
  v_points integer;
  v_src xp_sources%rowtype;
  v_units integer;
  v_paid integer;
begin
  select a.author_id, coalesce(a.total_points, 0) into v_author, v_points
    from training_attempts a
   where a.id = p_attempt and a.scored_at is not null;
  if v_author is null then
    return 0;
  end if;
  select * into v_src from xp_sources where kind = 'training';
  v_units := greatest(v_points, 0);
  if v_src.unit_cap is not null then
    v_units := least(v_units, v_src.unit_cap);
  end if;
  v_paid := xp_award(v_author, 'training', 'training:' || p_attempt::text,
                     v_src.base_xp + v_src.unit_xp * v_units, v_units, null, p_at, p_seen);
  if p_check then
    perform xp_check_achievements(v_author, 'training', p_at, p_seen, false);
  end if;
  return v_paid;
end $$;

-- §5.5: a person's facts, oldest first, each with its own time, through the
-- same award functions; then every category's check once. Keys make it
-- idempotent: run again (the repair after a swallowed error, L20) it adds only
-- what is missing. Returns the XP it added.
create function public.xp_replay_user(p_user uuid, p_seen boolean, p_backfill boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  v_before integer;
  v_after integer;
  v_category text;
begin
  if p_user is null
     or not exists (select 1 from profiles where id = p_user and deleted_at is null) then
    return 0;
  end if;
  select coalesce((select xp from profile_levels where user_id = p_user), 0) into v_before;
  for r in
    select f.kind, f.fact, f.at, f.qty
      from (
        select 'guess'::text as kind, g.id as fact, coalesce(w.revealed_at, g.scored_at) as at,
               null::integer as qty
          from guesses g
          join tasting_participants p on p.id = g.participant_id
          join wines w on w.id = g.wine_id
          join tastings t on t.id = w.tasting_id
         where p.user_id = p_user and w.is_revealed and g.scored_at is not null
           and t.reveal_mode in ('BLIND', 'SEMI_BLIND')
        union all
        select 'close', t.id,
               coalesce(t.finished_at,
                        (select max(w.revealed_at) from wines w where w.tasting_id = t.id),
                        t.created_at),
               null
          from tastings t
         where t.status = 'CLOSED'
           and (t.host_id = p_user
                or exists (select 1 from tasting_participants s
                            where s.tasting_id = t.id and s.user_id = p_user))
        union all
        select 'lot', l.id, l.created_at, l.purchased_quantity
          from cellar_lots l
         where l.owner_id = p_user
        union all
        select 'drink', c.id, c.created_at, null
          from cellar_consumptions c
         where c.owner_id = p_user and c.reason = 'DRANK'
        union all
        select 'note', n.id, n.created_at, null
          from wset_notes n
         where n.author_id = p_user
        union all
        select 'training', a.id, a.scored_at, null
          from training_attempts a
         where a.author_id = p_user and a.scored_at is not null
      ) f
     order by f.at, f.kind, f.fact
  loop
    if r.kind = 'guess' then
      perform xp_award_guess(r.fact, r.at, p_seen, false);
    elsif r.kind = 'close' then
      perform xp_award_tasting_close(r.fact, p_user, r.at, p_seen, false);
    elsif r.kind = 'lot' then
      perform xp_award_cellar_lot(r.fact, 0, r.qty, r.at, p_seen, false);
    elsif r.kind = 'drink' then
      perform xp_award_drink(r.fact, r.at, p_seen, false, false);
    elsif r.kind = 'note' then
      perform xp_award_note(r.fact, r.at, p_seen, false);
    elsif r.kind = 'training' then
      perform xp_award_training(r.fact, r.at, p_seen, false);
    end if;
  end loop;
  foreach v_category in array array['cellar', 'tastings', 'notes', 'training', 'friends'] loop
    perform xp_check_achievements(p_user, v_category, now(), p_seen, p_backfill);
  end loop;
  select coalesce((select xp from profile_levels where user_id = p_user), 0) into v_after;
  return v_after - v_before;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Trigger functions (§7.1). Each wraps its work (L20): an XP error is a
--    WARNING, never a failed reveal, pour, note or cellar write; a loop wraps
--    each person, so one bad award never costs the others theirs.
--    xp_replay_user repairs whatever a swallowed error missed.
-- ---------------------------------------------------------------------------

-- Every guess on the glass, and the pour this reveal unmasks (L21), one person
-- at a time in user_id order (L34). Runs after trg_catalog_wine_unmark_blind
-- has deleted the glass's flight_holds rows (name order).
create function public.xp_on_glass_revealed()
returns trigger language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
begin
  begin
    for r in
      select p.user_id, g.id as guess_id, null::uuid as consumption_id
        from guesses g
        join tasting_participants p on p.id = g.participant_id
       where g.wine_id = new.id
      union all
      select c.owner_id, null::uuid, c.id
        from wine_pour_intents i
        join cellar_consumptions c on c.id = i.cellar_consumption_id
       where i.wine_id = new.id
      order by 1, 2, 3
    loop
      begin
        if r.guess_id is not null then
          perform xp_award_guess(r.guess_id, now(), false, true);
        else
          perform xp_award_drink(r.consumption_id, now(), false, true, false);
        end if;
      exception when others then
        raise warning 'xp_on_glass_revealed: glass %, user %: % %', new.id, r.user_id, sqlstate, sqlerrm;
      end;
    end loop;
  exception when others then
    raise warning 'xp_on_glass_revealed: glass %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

-- Every seat of the tasting plus the host, in user_id order (L34).
create function public.xp_on_tasting_closed()
returns trigger language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
begin
  begin
    for r in
      select s.user_id from tasting_participants s where s.tasting_id = new.id
      union
      select new.host_id
      order by 1
    loop
      begin
        perform xp_award_tasting_close(new.id, r.user_id, now(), false, true);
      exception when others then
        raise warning 'xp_on_tasting_closed: tasting %, user %: % %', new.id, r.user_id, sqlstate, sqlerrm;
      end;
    end loop;
  exception when others then
    raise warning 'xp_on_tasting_closed: tasting %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

-- Insert: the lot's bottles. Update: purchased_quantity growth; a quantity
-- growth alone (an Edit-lot correction) pays nothing but re-checks on-hand.
create function public.xp_on_cellar_lot()
returns trigger language plpgsql volatile security definer set search_path = public as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform xp_award_cellar_lot(new.id, 0, new.purchased_quantity, now(), false, true);
    elsif new.purchased_quantity > old.purchased_quantity then
      perform xp_award_cellar_lot(new.id, old.purchased_quantity, new.purchased_quantity, now(), false, true);
    else
      perform xp_check_achievements(new.owner_id, 'cellar', now(), false, false);
    end if;
  exception when others then
    raise warning 'xp_on_cellar_lot: lot %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

-- Deferred to COMMIT (L21): by then a pour has its intent and hold, so a
-- masked bottle is skipped here and paid by the reveal.
create function public.xp_on_cellar_consumption()
returns trigger language plpgsql volatile security definer set search_path = public as $$
begin
  begin
    perform xp_award_drink(new.id, now(), false, true, true);
  exception when others then
    raise warning 'xp_on_cellar_consumption: consumption %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

-- Insert: the note. An identity change: the notes check only
-- (note_countries_10 counts a hidden-glass note once its glass is revealed).
create function public.xp_on_wset_note()
returns trigger language plpgsql volatile security definer set search_path = public as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform xp_award_note(new.id, now(), false, true);
    else
      perform xp_check_achievements(new.author_id, 'notes', now(), false, false);
    end if;
  exception when others then
    raise warning 'xp_on_wset_note: note %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

create function public.xp_on_training_scored()
returns trigger language plpgsql volatile security definer set search_path = public as $$
begin
  begin
    perform xp_award_training(new.id, now(), false, true);
  exception when others then
    raise warning 'xp_on_training_scored: attempt %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

create function public.xp_on_friendship()
returns trigger language plpgsql volatile security definer set search_path = public as $$
begin
  begin
    perform xp_check_achievements(new.user_id, 'friends', now(), false, false);
  exception when others then
    raise warning 'xp_on_friendship: friendship %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

-- L27: the profiles_deleted_drop_favourites pattern; scrub_deleted_account is
-- not recreated.
create function public.xp_drop_deleted_profile()
returns trigger language plpgsql volatile security definer set search_path = public as $$
begin
  begin
    delete from xp_events where user_id = new.id;
    delete from profile_achievements where user_id = new.id;
    delete from profile_levels where user_id = new.id;
  exception when others then
    raise warning 'xp_drop_deleted_profile: profile %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Client RPCs (§6.1).
-- ---------------------------------------------------------------------------

-- AppHeader's one read per render: the level and the oldest 50 unseen rows.
-- SECURITY INVOKER: RLS scopes the ledger to the caller. Times are UTC ISO
-- strings with milliseconds, so every browser parses them alike.
create function public.get_my_level_state()
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'xp', coalesce(l.xp, 0),
    'level', coalesce(l.level, 1),
    'welcome', coalesce(l.welcome_pending, false),
    'checked_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'unseen', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'kind', e.kind,
               'xp', e.xp,
               'xp_after', e.xp_after,
               'units', e.units,
               'achievement', e.achievement_key,
               'created_at', to_char(e.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
             order by e.id)
        from (select x.id, x.kind, x.xp, x.xp_after, x.units, x.achievement_key, x.created_at
                from xp_events x
               where x.user_id = me.uid and x.seen_at is null
               order by x.id
               limit 50) e), '[]'::jsonb))
    from (select auth.uid() as uid) me
    left join profile_levels l on l.user_id = me.uid;
$$;

-- Explicit ids, not "up to id N": two transactions for one person can commit
-- out of id order. Idempotent.
create function public.mark_xp_seen(p_ids bigint[], p_welcome boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(cardinality(p_ids), 0) > 100 then
    raise exception 'at most 100 ids at a time' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(cardinality(p_ids), 0) > 0 then
    update xp_events set seen_at = now()
     where user_id = v_uid and id = any (p_ids) and seen_at is null;
  end if;
  if coalesce(p_welcome, false) then
    update profile_levels set welcome_pending = false
     where user_id = v_uid and welcome_pending;
  end if;
end $$;

-- Your own profile's card: every active achievement with its progress.
-- SECURITY DEFINER because the cellar metrics read flight_holds and
-- wine_pour_intents; it only ever computes for auth.uid().
create function public.get_my_achievement_progress()
returns table (key text, category text, bonus_xp integer, target integer, progress integer,
               unlocked_at timestamptz, backfill boolean)
language sql stable security definer set search_path = public as $$
  select a.key, a.category, a.bonus_xp, a.target,
         case when pa.user_id is not null then a.target
              else least(xp_achievement_metric(auth.uid(), a.key), a.target) end,
         pa.unlocked_at,
         coalesce(pa.backfill, false)
    from achievements a
    left join profile_achievements pa on pa.user_id = auth.uid() and pa.achievement_key = a.key
   where a.is_active and auth.uid() is not null
   order by a.sort_order, a.key;
$$;

-- Supabase's default privileges grant EXECUTE on a new function to PUBLIC,
-- anon, authenticated and service_role. The three RPCs are authenticated-only
-- (auth.uid() is null for anon and service_role: the OD-1 precedent); every
-- other function here is owner-only.
revoke all on function public.level_for_xp(integer) from public, anon, authenticated, service_role;
revoke all on function public.xp_award(uuid, text, text, integer, integer, text, timestamptz, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_consumption_masked(uuid) from public, anon, authenticated, service_role;
revoke all on function public.xp_cellar_on_hand(uuid) from public, anon, authenticated, service_role;
revoke all on function public.xp_tasting_player(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.xp_tasting_won_by(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.xp_achievement_metric(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.xp_check_achievements(uuid, text, timestamptz, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_award_guess(uuid, timestamptz, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_award_tasting_close(uuid, uuid, timestamptz, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_award_cellar_lot(uuid, integer, integer, timestamptz, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_award_drink(uuid, timestamptz, boolean, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_award_note(uuid, timestamptz, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_award_training(uuid, timestamptz, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_replay_user(uuid, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function public.xp_on_glass_revealed() from public, anon, authenticated, service_role;
revoke all on function public.xp_on_tasting_closed() from public, anon, authenticated, service_role;
revoke all on function public.xp_on_cellar_lot() from public, anon, authenticated, service_role;
revoke all on function public.xp_on_cellar_consumption() from public, anon, authenticated, service_role;
revoke all on function public.xp_on_wset_note() from public, anon, authenticated, service_role;
revoke all on function public.xp_on_training_scored() from public, anon, authenticated, service_role;
revoke all on function public.xp_on_friendship() from public, anon, authenticated, service_role;
revoke all on function public.xp_drop_deleted_profile() from public, anon, authenticated, service_role;
revoke all on function public.get_my_level_state() from public, anon, service_role;
revoke all on function public.mark_xp_seen(bigint[], boolean) from public, anon, service_role;
revoke all on function public.get_my_achievement_progress() from public, anon, service_role;
grant execute on function public.get_my_level_state() to authenticated;
grant execute on function public.mark_xp_seen(bigint[], boolean) to authenticated;
grant execute on function public.get_my_achievement_progress() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Triggers (§7.1), created before the backfill so no fact falls between.
-- ---------------------------------------------------------------------------
create trigger wines_xp_on_reveal after update of is_revealed on public.wines
  for each row when (new.is_revealed and not old.is_revealed)
  execute function public.xp_on_glass_revealed();
create trigger tastings_xp_on_close after update of status on public.tastings
  for each row when (new.status = 'CLOSED' and old.status is distinct from 'CLOSED')
  execute function public.xp_on_tasting_closed();
create trigger cellar_lots_xp_insert after insert on public.cellar_lots
  for each row execute function public.xp_on_cellar_lot();
create trigger cellar_lots_xp_update after update of purchased_quantity, quantity on public.cellar_lots
  for each row when (new.purchased_quantity > old.purchased_quantity or new.quantity > old.quantity)
  execute function public.xp_on_cellar_lot();
create constraint trigger cellar_consumptions_xp after insert on public.cellar_consumptions
  deferrable initially deferred for each row execute function public.xp_on_cellar_consumption();
create trigger wset_notes_xp_insert after insert on public.wset_notes
  for each row execute function public.xp_on_wset_note();
create trigger wset_notes_xp_identity after update of catalog_wine_id, unidentified_wine_id on public.wset_notes
  for each row when (old.catalog_wine_id is distinct from new.catalog_wine_id
                     or old.unidentified_wine_id is distinct from new.unidentified_wine_id)
  execute function public.xp_on_wset_note();
create trigger training_attempts_xp after insert or update of scored_at on public.training_attempts
  for each row when (new.scored_at is not null)
  execute function public.xp_on_training_scored();
create trigger friendships_xp after insert on public.friendships
  for each row execute function public.xp_on_friendship();
create trigger profiles_deleted_drop_levels after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.xp_drop_deleted_profile();

-- ---------------------------------------------------------------------------
-- 9. The backfill (§5.5; L1, L25, L26): every non-deleted profile gets its
--    welcome and its history, all seen; achievements stamped as backfilled.
-- ---------------------------------------------------------------------------
insert into public.profile_levels (user_id, welcome_pending)
select p.id, true from public.profiles p where p.deleted_at is null
on conflict (user_id) do nothing;

do $$
declare
  r record;
begin
  for r in select p.id from public.profiles p where p.deleted_at is null order by p.id loop
    perform public.xp_replay_user(r.id, true, true);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_text text;
  v_expected text;
begin
  -- 1. The five tables' columns, in order.
  select string_agg(format('%s.%s %s%s%s', c.relname, a.attname, format_type(a.atttypid, a.atttypmod),
                           case when a.attnotnull then ' not null' else '' end,
                           case when d.adbin is null then ''
                                else ' default ' || pg_get_expr(d.adbin, d.adrelid) end),
                    ', ' order by c.relname collate "C", a.attnum)
    into v_text
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where c.relnamespace = 'public'::regnamespace
    and c.relname in ('xp_sources', 'achievements', 'xp_events', 'profile_levels', 'profile_achievements')
    and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'achievements.key text not null, achievements.category text not null, achievements.gate text not null, '
       || 'achievements.target integer not null, achievements.bonus_xp integer not null, '
       || 'achievements.sort_order integer not null, achievements.is_active boolean not null default true, '
       || 'profile_achievements.user_id uuid not null, profile_achievements.achievement_key text not null, '
       || 'profile_achievements.gate text not null, profile_achievements.unlocked_at timestamp with time zone not null default now(), '
       || 'profile_achievements.backfill boolean not null default false, '
       || 'profile_levels.user_id uuid not null, profile_levels.xp integer not null default 0, '
       || 'profile_levels.level smallint not null default 1, profile_levels.welcome_pending boolean not null default false, '
       || 'profile_levels.updated_at timestamp with time zone not null default now(), '
       || 'xp_events.id bigint not null, xp_events.user_id uuid not null, xp_events.kind text not null, '
       || 'xp_events.source_key text not null, xp_events.xp integer not null, xp_events.xp_after integer not null, '
       || 'xp_events.units integer, xp_events.achievement_key text, xp_events.day date not null, '
       || 'xp_events.created_at timestamp with time zone not null default now(), '
       || 'xp_events.seen_at timestamp with time zone, '
       || 'xp_sources.kind text not null, xp_sources.base_xp integer not null default 0, '
       || 'xp_sources.unit_xp integer not null default 0, xp_sources.unit_cap integer, '
       || 'xp_sources.daily_xp_cap integer, xp_sources.daily_count_cap integer' then
    raise exception 'the new tables'' columns differ from spec §5.1: %', v_text;
  end if;

  -- 2. Their constraints.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid in ('public.xp_sources'::regclass, 'public.achievements'::regclass,
                       'public.xp_events'::regclass, 'public.profile_levels'::regclass,
                       'public.profile_achievements'::regclass);
  if v_text is distinct from
       'achievements_bonus_xp_check CHECK (((bonus_xp >= 25) AND (bonus_xp <= 250))); '
       || 'achievements_category_check CHECK ((category = ANY (ARRAY[''cellar''::text, ''tastings''::text, ''notes''::text, ''training''::text, ''friends''::text]))); '
       || 'achievements_gate_check CHECK ((gate = ANY (ARRAY[''public''::text, ''cellar''::text]))); '
       || 'achievements_gate_follows_category CHECK (((category = ''cellar''::text) = (gate = ''cellar''::text))); '
       || 'achievements_pkey PRIMARY KEY (key); '
       || 'achievements_target_check CHECK ((target > 0)); '
       || 'profile_achievements_achievement_key_fkey FOREIGN KEY (achievement_key) REFERENCES achievements(key); '
       || 'profile_achievements_gate_check CHECK ((gate = ANY (ARRAY[''public''::text, ''cellar''::text]))); '
       || 'profile_achievements_pkey PRIMARY KEY (user_id, achievement_key); '
       || 'profile_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'profile_levels_level_check CHECK (((level >= 1) AND (level <= 60))); '
       || 'profile_levels_pkey PRIMARY KEY (user_id); '
       || 'profile_levels_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'profile_levels_xp_check CHECK ((xp >= 0)); '
       || 'xp_events_achievement_key_fkey FOREIGN KEY (achievement_key) REFERENCES achievements(key); '
       || 'xp_events_achievement_shape CHECK (((kind = ''achievement''::text) = (achievement_key IS NOT NULL))); '
       || 'xp_events_kind_fkey FOREIGN KEY (kind) REFERENCES xp_sources(kind); '
       || 'xp_events_pkey PRIMARY KEY (id); '
       || 'xp_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'xp_events_user_id_source_key_key UNIQUE (user_id, source_key); '
       || 'xp_events_xp_after_check CHECK ((xp_after >= xp)); '
       || 'xp_events_xp_check CHECK ((xp > 0)); '
       || 'xp_sources_base_xp_check CHECK ((base_xp >= 0)); '
       || 'xp_sources_daily_count_cap_check CHECK ((daily_count_cap > 0)); '
       || 'xp_sources_daily_xp_cap_check CHECK ((daily_xp_cap > 0)); '
       || 'xp_sources_pkey PRIMARY KEY (kind); '
       || 'xp_sources_unit_cap_check CHECK ((unit_cap > 0)); '
       || 'xp_sources_unit_xp_check CHECK ((unit_xp >= 0))' then
    raise exception 'the new tables'' constraints differ from spec §5.1: %', v_text;
  end if;

  -- 3. The four indexes besides the keys.
  select string_agg(format('%s %s', i.indexname, regexp_replace(i.indexdef, '^.* USING ', '')), '; '
                    order by i.indexname collate "C")
    into v_text
  from pg_indexes i
  where i.schemaname = 'public'
    and i.indexname in ('xp_events_user_kind_day_idx', 'xp_events_unseen_idx', 'wset_notes_author_idx',
                        'tasting_participants_user_idx');
  if v_text is distinct from
       'tasting_participants_user_idx btree (user_id); '
       || 'wset_notes_author_idx btree (author_id); '
       || 'xp_events_unseen_idx btree (user_id, id) WHERE (seen_at IS NULL); '
       || 'xp_events_user_kind_day_idx btree (user_id, kind, day)' then
    raise exception 'the indexes differ from spec §5.1/L24: %', v_text;
  end if;

  -- 4. RLS on (not forced) and exactly the five read policies.
  if exists (select 1 from pg_class c
              where c.relnamespace = 'public'::regnamespace
                and c.relname in ('xp_sources', 'achievements', 'xp_events', 'profile_levels', 'profile_achievements')
                and (not c.relrowsecurity or c.relforcerowsecurity)) then
    raise exception 'row level security is off, or forced, on a new table';
  end if;
  select string_agg(format('%s: %s %s %s %s %s', c.relname, p.polname, p.polcmd,
                           case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text, coalesce(pg_get_expr(p.polqual, p.polrelid), '-')),
                    '; ' order by c.relname collate "C", p.polname collate "C")
    into v_text
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  where c.relnamespace = 'public'::regnamespace
    and c.relname in ('xp_sources', 'achievements', 'xp_events', 'profile_levels', 'profile_achievements');
  if v_text is distinct from
       'achievements: achievements read r permissive {authenticated} true; '
       || 'profile_achievements: profile achievements read r permissive {authenticated} '
       || '((user_id = auth.uid()) OR (gate <> ''cellar''::text) OR can_view_cellar(user_id)); '
       || 'profile_levels: profile levels read r permissive {authenticated} true; '
       || 'xp_events: xp events read own r permissive {authenticated} (user_id = auth.uid()); '
       || 'xp_sources: xp sources read r permissive {authenticated} true' then
    raise exception 'the new tables'' policies differ from spec §5.2: %', v_text;
  end if;

  -- 5. Grants: authenticated SELECT alone; anon and PUBLIC nothing; no column grants.
  select string_agg(format('%s %s', c.relname, a.privilege_type), ', ' order by c.relname collate "C", a.privilege_type collate "C")
    into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.relnamespace = 'public'::regnamespace
    and c.relname in ('xp_sources', 'achievements', 'xp_events', 'profile_levels', 'profile_achievements')
    and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole));
  if v_text is distinct from
       'achievements SELECT, profile_achievements SELECT, profile_levels SELECT, xp_events SELECT, xp_sources SELECT' then
    raise exception 'client grants on the new tables are not "authenticated SELECT only": %', v_text;
  end if;
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
              where c.oid = 'public.xp_events_id_seq'::regclass
                and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole))) then
    raise exception 'a client role holds a privilege on xp_events_id_seq';
  end if;
  if exists (select 1 from pg_attribute t join pg_class c on c.oid = t.attrelid
              where c.relnamespace = 'public'::regnamespace
                and c.relname in ('xp_sources', 'achievements', 'xp_events', 'profile_levels', 'profile_achievements')
                and t.attnum > 0 and t.attacl is not null) then
    raise exception 'a new table carries a column-level grant';
  end if;

  -- 6. The seeds: exactly §2 and §4.
  select string_agg(format('%s %s/%s/%s/%s/%s', kind, base_xp, unit_xp, coalesce(unit_cap::text, '-'),
                           coalesce(daily_xp_cap::text, '-'), coalesce(daily_count_cap::text, '-')),
                    ', ' order by kind collate "C")
    into v_text from public.xp_sources;
  if v_text is distinct from
       'achievement 0/0/-/-/-, cellar_add 0/5/20/100/-, drink 0/15/6/90/-, guess 10/1/-/-/-, '
       || 'guess_match 10/10/-/-/-, note 20/0/-/-/5, tasting_finished 40/0/-/-/3, '
       || 'tasting_hosted 40/0/-/-/3, training 20/1/-/-/5' then
    raise exception 'xp_sources is not spec §2''s table: %', v_text;
  end if;
  select string_agg(format('%s %s %s %s %s', key, category, gate, target, bonus_xp), ', ' order by sort_order)
    into v_text from public.achievements where is_active;
  if v_text is distinct from
       'first_bottle cellar cellar 1 25, cellar_25 cellar cellar 25 50, cellar_100 cellar cellar 100 150, '
       || 'first_drink cellar cellar 1 25, drank_50 cellar cellar 50 100, '
       || 'first_tasting tastings public 1 25, tastings_10 tastings public 10 100, '
       || 'first_host tastings public 1 50, perfect_glass tastings public 1 100, winner tastings public 1 100, '
       || 'glasses_50 tastings public 50 100, first_note notes public 1 25, notes_25 notes public 25 75, '
       || 'notes_100 notes public 100 200, note_countries_10 notes public 10 100, '
       || 'first_training training public 1 25, training_10 training public 10 75, '
       || 'training_ace training public 1 100, first_friend friends public 1 25, friends_10 friends public 10 75' then
    raise exception 'achievements is not spec §4''s table: %', v_text;
  end if;

  -- 7. Every function this file creates: security, search_path, volatility,
  --    language, return type, arguments, body (md5 of prosrc with any CR
  --    stripped) and who holds EXECUTE ("OWNER" is the owner).
  for v_fn in
    select s.sig, s.secdef, s.volatile, s.lang, s.rettype, s.retset, s.args, s.body_md5, s.grantees,
           p.oid, p.prosecdef, p.proconfig::text as config_now, p.provolatile::text as volatile_now,
           l.lanname, format_type(p.prorettype, null) as rettype_now, p.proretset,
           pg_get_function_identity_arguments(p.oid) as args_now,
           md5(replace(p.prosrc, chr(13), '')) as md5_now,
           (select string_agg(x.g, ',' order by x.g collate "C")
            from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                       when a.grantee = p.proowner then 'OWNER'
                                       else pg_get_userbyid(a.grantee)::text end as g
                  from aclexplode(p.proacl) a
                  where a.privilege_type = 'EXECUTE') x) as grantees_now
    from (values
      ('public.level_for_xp(integer)', false, 'i', 'plpgsql', 'smallint', false, 'p_xp integer',
       'e1e671dec9b7f9fe961895fb89da0b1f', 'OWNER'),
      ('public.xp_award(uuid,text,text,integer,integer,text,timestamptz,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_user uuid, p_kind text, p_source_key text, p_xp integer, p_units integer, p_achievement text, p_at timestamp with time zone, p_seen boolean',
       'be99b79b59a85c5b94932708547d25e6', 'OWNER'),
      ('public.xp_consumption_masked(uuid)', true, 's', 'sql', 'boolean', false, 'p_consumption uuid',
       '9a8f6ce6d9de3063e5743dac5bec12b4', 'OWNER'),
      ('public.xp_cellar_on_hand(uuid)', true, 's', 'sql', 'integer', false, 'p_user uuid',
       '3481a84c307948e83a41e56a2e1c40b3', 'OWNER'),
      ('public.xp_tasting_player(uuid,uuid)', true, 's', 'sql', 'boolean', false, 'p_tasting uuid, p_user uuid',
       'c94850b9c2a258b0042a04a25e7ae7dd', 'OWNER'),
      ('public.xp_tasting_won_by(uuid,uuid)', true, 's', 'sql', 'boolean', false, 'p_tasting uuid, p_user uuid',
       'a9c32de88c5af2fc781bd7ec0d5689f2', 'OWNER'),
      ('public.xp_achievement_metric(uuid,text)', true, 's', 'plpgsql', 'integer', false, 'p_user uuid, p_key text',
       'c6f6c368814f0694d82d90e95350181c', 'OWNER'),
      ('public.xp_check_achievements(uuid,text,timestamptz,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_user uuid, p_category text, p_at timestamp with time zone, p_seen boolean, p_backfill boolean',
       'ddea6ee0dcb39c0b975ff0c6df39e69f', 'OWNER'),
      ('public.xp_award_guess(uuid,timestamptz,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_guess uuid, p_at timestamp with time zone, p_seen boolean, p_check boolean',
       '599f905cd9d9f4cc631b57cb2bf4c887', 'OWNER'),
      ('public.xp_award_tasting_close(uuid,uuid,timestamptz,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_tasting uuid, p_user uuid, p_at timestamp with time zone, p_seen boolean, p_check boolean',
       '12f3b0633f833e11eda81d9a56a62e00', 'OWNER'),
      ('public.xp_award_cellar_lot(uuid,integer,integer,timestamptz,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_lot uuid, p_old integer, p_new integer, p_at timestamp with time zone, p_seen boolean, p_check boolean',
       '7baec44db9b657eaf6dd6ea1c425e9e6', 'OWNER'),
      ('public.xp_award_drink(uuid,timestamptz,boolean,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_consumption uuid, p_at timestamp with time zone, p_seen boolean, p_check boolean, p_require_lot boolean',
       'bb4410ed83f66ceed1a5f469c68f2b91', 'OWNER'),
      ('public.xp_award_note(uuid,timestamptz,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_note uuid, p_at timestamp with time zone, p_seen boolean, p_check boolean',
       'a6d7d6862ae10cecb65509cc02419f59', 'OWNER'),
      ('public.xp_award_training(uuid,timestamptz,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_attempt uuid, p_at timestamp with time zone, p_seen boolean, p_check boolean',
       '52a1e008282add33cafcbddf17eb63bc', 'OWNER'),
      ('public.xp_replay_user(uuid,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_user uuid, p_seen boolean, p_backfill boolean',
       '84480be4887b33b1ec9bc0a253fa5fbf', 'OWNER'),
      ('public.xp_on_glass_revealed()', true, 'v', 'plpgsql', 'trigger', false, '',
       '76b15ee71e070281ec48b8c3e7b8be4c', 'OWNER'),
      ('public.xp_on_tasting_closed()', true, 'v', 'plpgsql', 'trigger', false, '',
       'a5ba1c057b2b99f8f00fc796c3467bd4', 'OWNER'),
      ('public.xp_on_cellar_lot()', true, 'v', 'plpgsql', 'trigger', false, '',
       '5174e05a934bec37adc7b6c3b88ed677', 'OWNER'),
      ('public.xp_on_cellar_consumption()', true, 'v', 'plpgsql', 'trigger', false, '',
       '908ed16361d1c53d273853798cbc4aa2', 'OWNER'),
      ('public.xp_on_wset_note()', true, 'v', 'plpgsql', 'trigger', false, '',
       '0ddc191a6f385d42baa704393ba7d1c9', 'OWNER'),
      ('public.xp_on_training_scored()', true, 'v', 'plpgsql', 'trigger', false, '',
       '1835464dbc5fbd898c6e55e5becfb532', 'OWNER'),
      ('public.xp_on_friendship()', true, 'v', 'plpgsql', 'trigger', false, '',
       '37281ca530320b28c483fbd750ad8a7f', 'OWNER'),
      ('public.xp_drop_deleted_profile()', true, 'v', 'plpgsql', 'trigger', false, '',
       '7919bfa1008d0ed574212d316031bbc8', 'OWNER'),
      ('public.get_my_level_state()', false, 's', 'sql', 'jsonb', false, '',
       '1be2bcfe134b250867e8f44cee243dd8', 'OWNER,authenticated'),
      ('public.mark_xp_seen(bigint[],boolean)', true, 'v', 'plpgsql', 'void', false, 'p_ids bigint[], p_welcome boolean',
       'e079b0a31504b3108aa7180b5ca9f53e', 'OWNER,authenticated'),
      ('public.get_my_achievement_progress()', true, 's', 'sql', 'record', true, '',
       'e34084467ab9655a1a0cb2be3400c942', 'OWNER,authenticated')
    ) as s (sig, secdef, volatile, lang, rettype, retset, args, body_md5, grantees)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% does not exist post-migration', v_fn.sig;
    end if;
    if v_fn.prosecdef is distinct from v_fn.secdef
       or v_fn.config_now is distinct from '{search_path=public}'
       or v_fn.volatile_now is distinct from v_fn.volatile
       or v_fn.lanname is distinct from v_fn.lang
       or v_fn.rettype_now is distinct from v_fn.rettype
       or v_fn.proretset is distinct from v_fn.retset
       or v_fn.args_now is distinct from v_fn.args then
      raise exception '% attributes differ: security definer %, config %, volatility %, language %, returns % (set %), arguments (%)',
        v_fn.sig, v_fn.prosecdef, v_fn.config_now, v_fn.volatile_now, v_fn.lanname, v_fn.rettype_now,
        v_fn.proretset, v_fn.args_now;
    end if;
    if v_fn.md5_now is distinct from v_fn.body_md5 then
      raise exception '% body is not the one this migration was written with (md5 %)', v_fn.sig, v_fn.md5_now;
    end if;
    if v_fn.grantees_now is distinct from v_fn.grantees then
      raise exception '% EXECUTE is held by %, expected %', v_fn.sig, v_fn.grantees_now, v_fn.grantees;
    end if;
  end loop;

  -- 8. The ten triggers, and the reveal trigger's place among its neighbours.
  select string_agg(pg_get_triggerdef(t.oid), E'\n' order by t.tgname collate "C") into v_text
  from pg_trigger t
  where not t.tgisinternal
    and t.tgname in ('wines_xp_on_reveal', 'tastings_xp_on_close', 'cellar_lots_xp_insert',
                     'cellar_lots_xp_update', 'cellar_consumptions_xp', 'wset_notes_xp_insert',
                     'wset_notes_xp_identity', 'training_attempts_xp', 'friendships_xp',
                     'profiles_deleted_drop_levels');
  v_expected := concat_ws(E'\n',
    'CREATE CONSTRAINT TRIGGER cellar_consumptions_xp AFTER INSERT ON public.cellar_consumptions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION xp_on_cellar_consumption()',
    'CREATE TRIGGER cellar_lots_xp_insert AFTER INSERT ON public.cellar_lots FOR EACH ROW EXECUTE FUNCTION xp_on_cellar_lot()',
    'CREATE TRIGGER cellar_lots_xp_update AFTER UPDATE OF purchased_quantity, quantity ON public.cellar_lots FOR EACH ROW WHEN (((new.purchased_quantity > old.purchased_quantity) OR (new.quantity > old.quantity))) EXECUTE FUNCTION xp_on_cellar_lot()',
    'CREATE TRIGGER friendships_xp AFTER INSERT ON public.friendships FOR EACH ROW EXECUTE FUNCTION xp_on_friendship()',
    'CREATE TRIGGER profiles_deleted_drop_levels AFTER UPDATE OF deleted_at ON public.profiles FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION xp_drop_deleted_profile()',
    'CREATE TRIGGER tastings_xp_on_close AFTER UPDATE OF status ON public.tastings FOR EACH ROW WHEN (((new.status = ''CLOSED''::tasting_status) AND (old.status IS DISTINCT FROM ''CLOSED''::tasting_status))) EXECUTE FUNCTION xp_on_tasting_closed()',
    'CREATE TRIGGER training_attempts_xp AFTER INSERT OR UPDATE OF scored_at ON public.training_attempts FOR EACH ROW WHEN ((new.scored_at IS NOT NULL)) EXECUTE FUNCTION xp_on_training_scored()',
    'CREATE TRIGGER wines_xp_on_reveal AFTER UPDATE OF is_revealed ON public.wines FOR EACH ROW WHEN ((new.is_revealed AND (NOT old.is_revealed))) EXECUTE FUNCTION xp_on_glass_revealed()',
    'CREATE TRIGGER wset_notes_xp_identity AFTER UPDATE OF catalog_wine_id, unidentified_wine_id ON public.wset_notes FOR EACH ROW WHEN (((old.catalog_wine_id IS DISTINCT FROM new.catalog_wine_id) OR (old.unidentified_wine_id IS DISTINCT FROM new.unidentified_wine_id))) EXECUTE FUNCTION xp_on_wset_note()',
    'CREATE TRIGGER wset_notes_xp_insert AFTER INSERT ON public.wset_notes FOR EACH ROW EXECUTE FUNCTION xp_on_wset_note()');
  if v_text is distinct from v_expected then
    raise exception 'the triggers differ from spec §7.1: %', v_text;
  end if;
  select string_agg(t.tgname, ',' order by t.tgname collate "C") into v_text
  from pg_trigger t
  where t.tgrelid = 'public.wines'::regclass and not t.tgisinternal
    and pg_get_triggerdef(t.oid) like '% AFTER UPDATE OF is_revealed ON public.wines %';
  if v_text is distinct from 'semi_blind_release_revealed_wine,trg_catalog_wine_unmark_blind,wines_xp_on_reveal,wset_notes_resolve_on_reveal'
     and v_text is distinct from 'semi_blind_release_revealed_wine,trg_catalog_wine_unmark_blind,wines_release_note_holds,wines_xp_on_reveal,wset_notes_resolve_on_reveal' then
    raise exception 'wines_xp_on_reveal does not fire after the unmark and before the note resolve: %', v_text;
  end if;

  -- 9. The backfill (§5.4): totals and levels agree with the ledger, each
  --    person's newest row carries their total, nothing unseen, one welcome
  --    per non-deleted profile, every achievement's bonus paid once.
  if exists (select 1 from public.profile_levels l
              where l.xp <> coalesce((select sum(e.xp) from public.xp_events e where e.user_id = l.user_id), 0)
                 or l.level <> public.level_for_xp(l.xp)) then
    raise exception 'a profile_levels row disagrees with its ledger or the curve';
  end if;
  if exists (select 1 from public.profile_levels l
              where l.xp > 0
                and l.xp <> (select e.xp_after from public.xp_events e
                              where e.user_id = l.user_id order by e.id desc limit 1)) then
    raise exception 'a person''s newest ledger row does not carry their total';
  end if;
  if exists (select 1 from public.xp_events where seen_at is null) then
    raise exception 'the backfill left an unseen ledger row';
  end if;
  if (select count(*) from public.profile_levels where welcome_pending)
       <> (select count(*) from public.profiles where deleted_at is null)
     or exists (select 1 from public.profile_levels l join public.profiles p on p.id = l.user_id
                 where l.welcome_pending and p.deleted_at is not null) then
    raise exception 'welcome_pending is not set for exactly the non-deleted profiles';
  end if;
  if exists (select 1 from public.profile_achievements pa
              where (select count(*) from public.xp_events e
                      where e.user_id = pa.user_id and e.source_key = 'achievement:' || pa.achievement_key) <> 1)
     or exists (select 1 from public.profile_achievements where not backfill) then
    raise exception 'an unlocked achievement lacks its one bonus row, or is not marked backfilled';
  end if;

  select string_agg(format('L%s × %s', level, n), ', ' order by level desc) into v_text
  from (select level, count(*) as n from public.profile_levels group by level) x;
  raise notice 'levels: % profiles, % ledger rows, % XP, % achievements; %',
    (select count(*) from public.profile_levels), (select count(*) from public.xp_events),
    (select coalesce(sum(xp), 0) from public.profile_levels),
    (select count(*) from public.profile_achievements), v_text;
end $$;
```

- [ ] **Step 4: Run the pin test to verify it passes**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels/levels-migration.test.ts`
Expected: PASS, 5 tests. If "creates exactly the pinned functions, with the pinned bodies" fails, the SQL above was not copied byte for byte (the diff shows which body); fix the copy, never the pin.

- [ ] **Step 5: Write the curve fixture**

Create `src/lib/levels/__fixtures__/curve.json` (0, every threshold −1/0/+1 for levels 2–60, and 1,000,000; generated by a brute-force scan, not by either implementation):

```json
[
  [0, 1],
  [49, 1], [50, 2], [51, 2],
  [149, 2], [150, 3], [151, 3],
  [299, 3], [300, 4], [301, 4],
  [499, 4], [500, 5], [501, 5],
  [749, 5], [750, 6], [751, 6],
  [1049, 6], [1050, 7], [1051, 7],
  [1399, 7], [1400, 8], [1401, 8],
  [1799, 8], [1800, 9], [1801, 9],
  [2249, 9], [2250, 10], [2251, 10],
  [2749, 10], [2750, 11], [2751, 11],
  [3299, 11], [3300, 12], [3301, 12],
  [3899, 12], [3900, 13], [3901, 13],
  [4549, 13], [4550, 14], [4551, 14],
  [5249, 14], [5250, 15], [5251, 15],
  [5999, 15], [6000, 16], [6001, 16],
  [6799, 16], [6800, 17], [6801, 17],
  [7649, 17], [7650, 18], [7651, 18],
  [8549, 18], [8550, 19], [8551, 19],
  [9499, 19], [9500, 20], [9501, 20],
  [10499, 20], [10500, 21], [10501, 21],
  [11549, 21], [11550, 22], [11551, 22],
  [12649, 22], [12650, 23], [12651, 23],
  [13799, 23], [13800, 24], [13801, 24],
  [14999, 24], [15000, 25], [15001, 25],
  [16249, 25], [16250, 26], [16251, 26],
  [17549, 26], [17550, 27], [17551, 27],
  [18899, 27], [18900, 28], [18901, 28],
  [20299, 28], [20300, 29], [20301, 29],
  [21749, 29], [21750, 30], [21751, 30],
  [23249, 30], [23250, 31], [23251, 31],
  [24799, 31], [24800, 32], [24801, 32],
  [26399, 32], [26400, 33], [26401, 33],
  [28049, 33], [28050, 34], [28051, 34],
  [29749, 34], [29750, 35], [29751, 35],
  [31499, 35], [31500, 36], [31501, 36],
  [33299, 36], [33300, 37], [33301, 37],
  [35149, 37], [35150, 38], [35151, 38],
  [37049, 38], [37050, 39], [37051, 39],
  [38999, 39], [39000, 40], [39001, 40],
  [40999, 40], [41000, 41], [41001, 41],
  [43049, 41], [43050, 42], [43051, 42],
  [45149, 42], [45150, 43], [45151, 43],
  [47299, 43], [47300, 44], [47301, 44],
  [49499, 44], [49500, 45], [49501, 45],
  [51749, 45], [51750, 46], [51751, 46],
  [54049, 46], [54050, 47], [54051, 47],
  [56399, 47], [56400, 48], [56401, 48],
  [58799, 48], [58800, 49], [58801, 49],
  [61249, 49], [61250, 50], [61251, 50],
  [63749, 50], [63750, 51], [63751, 51],
  [66299, 51], [66300, 52], [66301, 52],
  [68899, 52], [68900, 53], [68901, 53],
  [71549, 53], [71550, 54], [71551, 54],
  [74249, 54], [74250, 55], [74251, 55],
  [76999, 55], [77000, 56], [77001, 56],
  [79799, 56], [79800, 57], [79801, 57],
  [82649, 57], [82650, 58], [82651, 58],
  [85549, 58], [85550, 59], [85551, 59],
  [88499, 59], [88500, 60], [88501, 60],
  [1000000, 60]
]
```

- [ ] **Step 6: Add the types**

In `src/lib/supabase/database.types.ts`, insert this block immediately **before** the line `      // 20260918130500 (platform-invites spec §4, D4, D7, D8): a personal` (inside `Tables`, after `profile_favourite_producers`):

```ts
      // 20260927160000 (levels spec §5.1, L22, L23): XP values and caps per
      // kind, and the twenty achievements (their names live in
      // src/lib/levels/copy.ts). Every signed-in member reads both; no client
      // role writes either (the Insert/Update shapes only describe the table).
      xp_sources: {
        Row: {
          kind: string;
          base_xp: number;
          unit_xp: number;
          unit_cap: number | null;
          daily_xp_cap: number | null;
          daily_count_cap: number | null;
        };
        Insert: {
          kind: string;
          base_xp?: number;
          unit_xp?: number;
          unit_cap?: number | null;
          daily_xp_cap?: number | null;
          daily_count_cap?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["xp_sources"]["Insert"]>;
        Relationships: [];
      };
      achievements: {
        Row: {
          key: string;
          category: string;
          gate: string;
          target: number;
          bonus_xp: number;
          sort_order: number;
          is_active: boolean;
        };
        Insert: {
          key: string;
          category: string;
          gate: string;
          target: number;
          bonus_xp: number;
          sort_order: number;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["achievements"]["Insert"]>;
        Relationships: [];
      };
      // The append-only XP ledger (levels spec §5.1, L3, L19): written only by
      // the triggers' SECURITY DEFINER award functions and read by its owner
      // alone ("xp events read own"); seen_at is written only by mark_xp_seen.
      xp_events: {
        Row: {
          id: number;
          user_id: string;
          kind: string;
          source_key: string;
          xp: number;
          xp_after: number;
          units: number | null;
          achievement_key: string | null;
          day: string;
          created_at: string;
          seen_at: string | null;
        };
        Insert: {
          user_id: string;
          kind: string;
          source_key: string;
          xp: number;
          xp_after: number;
          units?: number | null;
          achievement_key?: string | null;
          day: string;
          created_at?: string;
          seen_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["xp_events"]["Insert"]>;
        Relationships: [];
      };
      // A person's total and level; every signed-in member reads every row
      // (L23). Someone with no row is level 1 with 0 XP.
      profile_levels: {
        Row: {
          user_id: string;
          xp: number;
          level: number;
          welcome_pending: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          xp?: number;
          level?: number;
          welcome_pending?: boolean;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profile_levels"]["Insert"]>;
        Relationships: [];
      };
      // Unlocked achievements. A 'cellar'-gated row is read only by its owner
      // and whoever can_view_cellar admits (L6, L23); a backfilled row shows
      // "Before levels" instead of a date (L25).
      profile_achievements: {
        Row: {
          user_id: string;
          achievement_key: string;
          gate: string;
          unlocked_at: string;
          backfill: boolean;
        };
        Insert: {
          user_id: string;
          achievement_key: string;
          gate: string;
          unlocked_at?: string;
          backfill?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["profile_achievements"]["Insert"]>;
        Relationships: [];
      };
```

Then insert this block immediately **before** the line `      // 20260919183100 (scan-photos spec §6.3): attaches the caller's own object` (inside `Functions`, after `set_profile_favourites`):

```ts
      // 20260927160000 (levels spec §6.1): the caller's level state — { xp,
      // level, welcome, checked_at, unseen: [{ id, kind, xp, xp_after, units,
      // achievement, created_at }] } (the oldest 50 unseen ledger rows, by id;
      // times are UTC ISO strings). SECURITY INVOKER; authenticated only.
      // Parsed by src/lib/levels/snapshot.ts's parseLevelSnapshot.
      get_my_level_state: {
        Args: Record<string, never>;
        Returns: Json;
      };
      // Marks the caller's own listed ledger rows seen (others' ids are
      // ignored) and, with p_welcome, clears their welcome. Idempotent.
      // Refusals: "not signed in" (42501), more than 100 ids (22023).
      mark_xp_seen: {
        Args: { p_ids: number[]; p_welcome: boolean };
        Returns: undefined;
      };
      // Every active achievement with the caller's progress (your own profile's
      // card). SECURITY DEFINER; computes for auth.uid() only.
      get_my_achievement_progress: {
        Args: Record<string, never>;
        Returns: {
          key: string;
          category: string;
          bonus_xp: number;
          target: number;
          progress: number;
          unlocked_at: string | null;
          backfill: boolean;
        }[];
      };
```

Mid-file anchors on purpose: `sharing-defaults` appends its tables and functions at the ends of both maps (C4).

- [ ] **Step 7: Write the DB suite**

Create `scripts/levels.test.mjs`. It runs only in the main session (it connects to production); here it is syntax-checked. Its fixtures follow `scripts/cellar-social.test.mjs` (pours, draw-down) and `scripts/training-room.test.mjs` (throwaway profiles, `expectError`).

```js
// Levels and achievements DB suite (spec
// docs/superpowers/specs/2026-09-27-levels-and-achievements-design.md §10.1):
// the curve, the post-state, every award source and its caps, Rule 1 on masked
// pours, the achievements, RLS, the three client RPCs, account deletion, error
// isolation (L20), replay parity and the reveal's timing, for
// 20260927160000_levels_and_achievements.sql.
//
// It connects to the database pgConfig() names, which is production, so only
// the main session runs it. Every test runs inside a transaction that always
// rolls back, on throwaway profiles, catalog wines, lots and tastings created
// inside that transaction: no real person's row decides a result or is written.
// Deferred triggers fire only at COMMIT, so the drink tests run
// `set constraints all immediate` after the write.
//
//   node --env-file=.env.local --test --test-concurrency=1 scripts/levels.test.mjs
//
// Dry run before the migration is live: LEVELS_APPLY lists migration files
// (comma-separated, in order) that each test applies inside its own
// rolled-back transaction first, e.g.
//   LEVELS_APPLY=supabase/migrations/20260927160000_levels_and_achievements.sql \
//     node --env-file=.env.local --test --test-concurrency=1 scripts/levels.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const APPLY = (process.env.LEVELS_APPLY ?? "")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);

const client = new pg.Client(pgConfig());
/** WARNINGs raised inside the current test's transaction (L20). */
const warnings = [];
client.on("notice", (n) => {
  if (n.severity === "WARNING") warnings.push(n.message);
});
before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

async function withRollback(cb) {
  await client.query("begin");
  try {
    for (const file of APPLY) await client.query(readFileSync(file, "utf8"));
    warnings.length = 0;
    return await cb();
  } finally {
    await client.query("rollback");
  }
}

async function asOwner() {
  await client.query("reset role");
}
// A signed-in caller; `null` is a request with no user (auth.uid() is null).
async function asUser(id) {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(id ? { sub: id, role: "authenticated" } : { role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}
async function asAnon() {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
  await client.query("set local role anon");
}

// Runs `fn` inside a savepoint that is always rolled back, and checks it failed with `code`.
async function expectError(fn, code) {
  await client.query("savepoint expect_error");
  let error = null;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  await client.query("rollback to savepoint expect_error");
  assert.ok(error, `expected SQLSTATE ${code}, but it succeeded`);
  assert.equal(error.code, code, error.message);
}

// Throwaway people that exist only inside the current transaction.
async function people(n) {
  await asOwner();
  const ids = [];
  for (let i = 1; i <= n; i += 1) {
    const r = await client.query(
      `insert into profiles (id, display_name, email)
       values (gen_random_uuid(), $1, 'levels-test+' || gen_random_uuid()::text || '@blindr.invalid')
       returning id`,
      [`Levels test ${i}`],
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

// Live reference ids by exact name (owner role).
let REFS = null;
async function refs() {
  if (REFS) return REFS;
  await asOwner();
  const one = async (what, sql, params) => {
    const r = await client.query(sql, params);
    assert.equal(r.rowCount, 1, `${what} should be exactly one live row`);
    return r.rows[0].id;
  };
  const byName = (table, name) => one(`${table} ${name}`, `select id from ${table} where name = $1`, [name]);
  REFS = {
    france: await byName("countries", "France"),
    spain: await byName("countries", "Spain"),
    bordeaux: await one(
      "France / Bordeaux",
      "select r.id from regions r join countries c on c.id = r.country_id where c.name = 'France' and r.name = 'Bordeaux'",
    ),
    rioja: await one(
      "Spain / Rioja",
      "select r.id from regions r join countries c on c.id = r.country_id where c.name = 'Spain' and r.name = 'Rioja'",
    ),
    margauxAoc: await one(
      "Bordeaux / Margaux AOC",
      `select a.id from appellations a join regions r on r.id = a.region_id join countries c on c.id = r.country_id
        where c.name = 'France' and r.name = 'Bordeaux' and a.name = 'Margaux AOC'`,
    ),
    riojaApp: (
      await client.query(
        `select a.id from appellations a join regions r on r.id = a.region_id join countries c on c.id = r.country_id
          where c.name = 'Spain' and r.name = 'Rioja' order by a.id limit 1`,
      )
    ).rows[0].id,
    cabernet: await byName("grapes", "Cabernet Sauvignon"),
    tempranillo: await byName("grapes", "Tempranillo"),
    producer: (await client.query("select id from producers order by id limit 1")).rows[0].id,
  };
  return REFS;
}

// A catalog wine written by the owner; a fresh name keeps it clear of
// catalog_wines_identity_key. Margaux, Cabernet Sauvignon, 2019 unless told.
async function catalogWine(createdBy, f = {}) {
  const r = await refs();
  await asOwner();
  const w = {
    country: r.france,
    region: r.bordeaux,
    appellation: r.margauxAoc,
    primary: r.cabernet,
    producer: r.producer,
    blindPending: false,
    ...f,
  };
  const row = await client.query(
    `insert into catalog_wines
       (country_id, region_id, appellation_id, primary_grape_id, producer_id, vintage_kind, vintage_year,
        colour, style, wine_name, created_by, blind_pending)
     values ($1, $2, $3, $4, $5, 'YEAR', 2019, 'RED', 'STILL', 'Levels test ' || gen_random_uuid()::text, $6, $7)
     returning *`,
    [w.country, w.region, w.appellation, w.primary, w.producer, createdBy, w.blindPending],
  );
  return row.rows[0];
}

// A tasting as DRAFT with the host's JOINED seat; `start` moves it on.
async function tasting(host, { mode = "BLIND", timing = "LIVE", policy = "AFTER_ALL" } = {}) {
  await asOwner();
  const t = (
    await client.query(
      `insert into tastings (name, host_id, timing_mode, wine_source, reveal_mode, async_reveal_policy)
       values ('Levels test', $1, $2, 'HOST_PROVIDES', $3, $4) returning id`,
      [host, timing, mode, policy],
    )
  ).rows[0].id;
  await seat(t, host);
  return t;
}
async function seat(tastingId, userId, status = "JOINED") {
  await asOwner();
  return (
    await client.query(
      "insert into tasting_participants (tasting_id, user_id, status) values ($1, $2, $3) returning id",
      [tastingId, userId, status],
    )
  ).rows[0].id;
}
async function start(tastingId) {
  await asOwner();
  await client.query("update tastings set status = 'IN_PROGRESS' where id = $1", [tastingId]);
}
async function close(tastingId) {
  await asOwner();
  await client.query("update tastings set status = 'CLOSED' where id = $1", [tastingId]);
}
// A glass whose answer key is `wine` (a catalog_wines row).
async function glass(tastingId, position, wine) {
  await asOwner();
  const id = (
    await client.query("insert into wines (tasting_id, position) values ($1, $2) returning id", [tastingId, position])
  ).rows[0].id;
  await client.query(
    `insert into wine_answers
       (wine_id, catalog_wine_id, country_id, region_id, appellation_id, primary_grape_id, producer_id,
        vintage_kind, vintage_year)
     values ($1, $2, $3, $4, $5, $6, $7, 'YEAR', 2019)`,
    [id, wine.id, wine.country_id, wine.region_id, wine.appellation_id, wine.primary_grape_id, wine.producer_id],
  );
  return id;
}
// A guess row; `exact` copies the answer (26 points: 2+3+5+8+6+2), `wrong` is
// a non-blank all-wrong guess (0 points), `blank` has no field at all.
async function guess(glassId, participantId, shape, wine, extra = {}) {
  const r = await refs();
  await asOwner();
  const f =
    shape === "exact"
      ? { country_id: wine.country_id, region_id: wine.region_id, appellation_id: wine.appellation_id,
          primary_grape_id: wine.primary_grape_id, producer_id: wine.producer_id, vintage_kind: "YEAR", vintage_year: 2019 }
      : shape === "country"
        ? { country_id: wine.country_id }
        : shape === "wrong"
          ? { country_id: r.spain }
          : {};
  const all = { ...f, ...extra };
  const cols = Object.keys(all);
  const g = await client.query(
    `insert into guesses (wine_id, participant_id${cols.map((c) => `, ${c}`).join("")})
     values ($1, $2${cols.map((_, i) => `, $${i + 3}`).join("")}) returning id`,
    [glassId, participantId, ...cols.map((c) => all[c])],
  );
  return g.rows[0].id;
}
async function reveal(host, glassId) {
  await asUser(host);
  await client.query("select reveal_wine($1)", [glassId]);
  await asOwner();
}
async function immediate() {
  await client.query("set constraints all immediate");
}
// Back to COMMIT-time firing after an immediate(): a pour must see its own
// intent and hold before the drink trigger runs, as it does in production.
async function deferred() {
  await client.query("set constraints all deferred");
}
async function ledger(userId) {
  await asOwner();
  return (
    await client.query(
      "select kind, source_key, xp, units, achievement_key from xp_events where user_id = $1 order by id",
      [userId],
    )
  ).rows;
}
const keysOf = (rows) => rows.map((r) => r.source_key);
async function xpOf(userId) {
  await asOwner();
  const r = await client.query("select xp, level from profile_levels where user_id = $1", [userId]);
  return r.rows[0] ?? { xp: 0, level: 1 };
}
async function achievementsOf(userId) {
  await asOwner();
  return (
    await client.query(
      "select achievement_key from profile_achievements where user_id = $1 order by achievement_key",
      [userId],
    )
  ).rows.map((r) => r.achievement_key);
}
async function metric(userId, key) {
  await asOwner();
  return (await client.query("select public.xp_achievement_metric($1, $2) as m", [userId, key])).rows[0].m;
}
async function addLot(userId, quantity, wine) {
  await asUser(userId);
  const id = (
    await client.query("select add_cellar_lot($1::jsonb) as id", [
      JSON.stringify({ catalog_wine_id: wine.id, quantity }),
    ])
  ).rows[0].id;
  await asOwner();
  return id;
}
async function consume(userId, lotId, quantity, reason = "DRANK") {
  await asUser(userId);
  const id = (
    await client.query("select consume_cellar_lot($1::jsonb) as id", [
      JSON.stringify({ lot_id: lotId, quantity, reason }),
    ])
  ).rows[0].id;
  await asOwner();
  return id;
}
async function note(userId, fields) {
  await asUser(userId);
  const id = (
    await client.query("select save_wset_note($1::jsonb, '[]'::jsonb) as id", [JSON.stringify(fields)])
  ).rows[0].id;
  await asOwner();
  return id;
}

// ---------------------------------------------------------------------------
// 1. The curve.
// ---------------------------------------------------------------------------
test("1. level_for_xp matches src/lib/levels/__fixtures__/curve.json on every row", async () => {
  const rows = JSON.parse(readFileSync("src/lib/levels/__fixtures__/curve.json", "utf8"));
  assert.equal(rows.length, 179);
  await withRollback(async () => {
    const r = await client.query(
      "select x.xp, public.level_for_xp(x.xp)::int as level from unnest($1::int[]) with ordinality as x(xp, n) order by x.n",
      [rows.map(([xp]) => xp)],
    );
    assert.deepEqual(
      r.rows.map((row) => [row.xp, row.level]),
      rows,
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Post-state: seeds, copy parity, triggers, EXECUTE holders.
// ---------------------------------------------------------------------------
test("2. seeds, copy keys, triggers and grants are spec §5", async () => {
  const copy = readFileSync("src/lib/levels/copy.ts", "utf8").replace(/\r/g, "");
  const block = copy.slice(copy.indexOf("export const ACHIEVEMENTS"), copy.indexOf("\n};", copy.indexOf("export const ACHIEVEMENTS")));
  const copyKeys = [...block.matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1]);
  assert.equal(copyKeys.length, 20);
  await withRollback(async () => {
    await asOwner();
    const keys = (await client.query("select key from achievements where is_active order by sort_order")).rows.map(
      (r) => r.key,
    );
    assert.deepEqual(keys, copyKeys, "achievements keys (sort_order) equal copy.ts's ACHIEVEMENTS (L22)");
    const sources = (
      await client.query(
        "select kind, base_xp, unit_xp, unit_cap, daily_xp_cap, daily_count_cap from xp_sources order by kind",
      )
    ).rows;
    assert.deepEqual(sources, [
      { kind: "achievement", base_xp: 0, unit_xp: 0, unit_cap: null, daily_xp_cap: null, daily_count_cap: null },
      { kind: "cellar_add", base_xp: 0, unit_xp: 5, unit_cap: 20, daily_xp_cap: 100, daily_count_cap: null },
      { kind: "drink", base_xp: 0, unit_xp: 15, unit_cap: 6, daily_xp_cap: 90, daily_count_cap: null },
      { kind: "guess", base_xp: 10, unit_xp: 1, unit_cap: null, daily_xp_cap: null, daily_count_cap: null },
      { kind: "guess_match", base_xp: 10, unit_xp: 10, unit_cap: null, daily_xp_cap: null, daily_count_cap: null },
      { kind: "note", base_xp: 20, unit_xp: 0, unit_cap: null, daily_xp_cap: null, daily_count_cap: 5 },
      { kind: "tasting_finished", base_xp: 40, unit_xp: 0, unit_cap: null, daily_xp_cap: null, daily_count_cap: 3 },
      { kind: "tasting_hosted", base_xp: 40, unit_xp: 0, unit_cap: null, daily_xp_cap: null, daily_count_cap: 3 },
      { kind: "training", base_xp: 20, unit_xp: 1, unit_cap: null, daily_xp_cap: null, daily_count_cap: 5 },
    ]);
    const order = (
      await client.query(
        `select t.tgname from pg_trigger t
          where t.tgrelid = 'public.wines'::regclass and not t.tgisinternal
            and pg_get_triggerdef(t.oid) like '% AFTER UPDATE OF is_revealed ON public.wines %'
          order by t.tgname collate "C"`,
      )
    ).rows.map((r) => r.tgname);
    const at = order.indexOf("wines_xp_on_reveal");
    assert.ok(at > order.indexOf("trg_catalog_wine_unmark_blind"), `fires after the unmark: ${order}`);
    assert.ok(at < order.indexOf("wset_notes_resolve_on_reveal"), `fires before the note resolve: ${order}`);
    const exec = async (role, sig) =>
      (await client.query("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, sig])).rows[0].ok;
    for (const sig of ["public.get_my_level_state()", "public.mark_xp_seen(bigint[],boolean)", "public.get_my_achievement_progress()"]) {
      assert.equal(await exec("authenticated", sig), true, sig);
      assert.equal(await exec("anon", sig), false, sig);
      assert.equal(await exec("service_role", sig), false, sig);
    }
    for (const sig of [
      "public.xp_award(uuid,text,text,integer,integer,text,timestamptz,boolean)",
      "public.xp_replay_user(uuid,boolean,boolean)",
      "public.level_for_xp(integer)",
    ]) {
      assert.equal(await exec("authenticated", sig), false, sig);
      assert.equal(await exec("service_role", sig), false, sig);
    }
  });
});

// ---------------------------------------------------------------------------
// 3-6. Guess XP.
// ---------------------------------------------------------------------------
test("3. a BLIND reveal pays each guesser 10 + points once; blank guesses and the host nothing", async () => {
  await withRollback(async () => {
    const [host, a, b, c] = await people(4);
    const wine = await catalogWine(host);
    const t = await tasting(host);
    const pa = await seat(t, a);
    const pb = await seat(t, b);
    const pc = await seat(t, c);
    const g1 = await glass(t, 1, wine);
    await start(t);
    const ga = await guess(g1, pa, "exact", wine);
    const gb = await guess(g1, pb, "country", wine);
    await guess(g1, pc, "blank", wine, { locked_at: new Date().toISOString() });
    await reveal(host, g1);

    const la = await ledger(a);
    assert.deepEqual(
      la.filter((r) => r.kind === "guess"),
      [{ kind: "guess", source_key: `guess:${ga}`, xp: 36, units: 26, achievement_key: null }],
    );
    assert.ok(keysOf(la).includes("achievement:perfect_glass"), "26/26 unlocks Perfect glass");
    assert.deepEqual(
      (await ledger(b)).map((r) => [r.source_key, r.xp]),
      [[`guess:${gb}`, 12]],
    );
    assert.deepEqual(await ledger(c), [], "a blank locked guess earns nothing (L11)");
    assert.deepEqual(await ledger(host), [], "the HOST_PROVIDES host has no guess");

    // A second pass (the repair) finds everything paid.
    await client.query("select public.xp_award_guess($1, now(), false, true)", [ga]);
    assert.equal((await ledger(a)).filter((r) => r.kind === "guess").length, 1);
  });
});

test("4. reveal_next_category pays nothing until its last step, then the final points", async () => {
  await withRollback(async () => {
    const [host, a] = await people(2);
    const wine = await catalogWine(host);
    const t = await tasting(host);
    const pa = await seat(t, a);
    const g1 = await glass(t, 1, wine);
    await start(t);
    const ga = await guess(g1, pa, "country", wine);
    const steps = (await client.query("select array_length(public.in_play_steps($1), 1) as n", [g1])).rows[0].n;
    assert.equal(steps, 6, "country, region, appellation, grapes, producer, vintage");
    for (let step = 0; step < steps; step += 1) {
      assert.deepEqual(await ledger(a), [], `nothing before the last step (${step} done)`);
      await asUser(host);
      await client.query("select reveal_next_category($1, $2::smallint)", [g1, step]);
    }
    assert.deepEqual(
      (await ledger(a)).map((r) => [r.source_key, r.xp, r.units]),
      [[`guess:${ga}`, 12, 2]],
    );
  });
});

test("5. ASYNC IMMEDIATE: score_own_guess pays nothing, the global reveal pays (L12)", async () => {
  await withRollback(async () => {
    const [host, a] = await people(2);
    const wine = await catalogWine(host);
    const t = await tasting(host, { timing: "ASYNC", policy: "IMMEDIATE" });
    const pa = await seat(t, a);
    const g1 = await glass(t, 1, wine);
    await start(t);
    const ga = await guess(g1, pa, "exact", wine);
    await asUser(a);
    await client.query("select score_own_guess($1)", [g1]);
    await asOwner();
    assert.ok((await client.query("select scored_at from guesses where id = $1", [ga])).rows[0].scored_at);
    assert.deepEqual(await ledger(a), [], "self-scored, not yet public");
    await reveal(host, g1);
    assert.ok(keysOf(await ledger(a)).includes(`guess:${ga}`));
  });
});

test("6. SEMI_BLIND: a match earns 20, a miss 10, an unassigned guess nothing (L10)", async () => {
  await withRollback(async () => {
    const [host, a, b, c] = await people(4);
    const w1 = await catalogWine(host);
    const w2 = await catalogWine(host);
    const t = await tasting(host, { mode: "SEMI_BLIND" });
    const pa = await seat(t, a);
    const pb = await seat(t, b);
    const pc = await seat(t, c);
    const g1 = await glass(t, 1, w1);
    const g2 = await glass(t, 2, w2);
    await start(t);
    const ga = await guess(g1, pa, "blank", w1, { guessed_wine_id: g1 });
    const gb = await guess(g1, pb, "blank", w1, { guessed_wine_id: g2 });
    await guess(g1, pc, "blank", w1);
    await reveal(host, g1);
    assert.deepEqual(
      (await ledger(a)).map((r) => [r.kind, r.source_key, r.xp, r.units]),
      [["guess_match", `guess:${ga}`, 20, 1]],
    );
    assert.deepEqual(
      (await ledger(b)).map((r) => [r.kind, r.source_key, r.xp, r.units]),
      [["guess_match", `guess:${gb}`, 10, 0]],
    );
    assert.deepEqual(await ledger(c), []);
  });
});

// ---------------------------------------------------------------------------
// 7-8. Closing a tasting.
// ---------------------------------------------------------------------------
test("7. close pays a playing guest and a host with a guest, once, three a day", async () => {
  await withRollback(async () => {
    const [host, a, b, c, d] = await people(5);
    const wine = await catalogWine(host);
    const t = await tasting(host);
    const pa = await seat(t, a);
    await seat(t, b);
    await seat(t, c, "INVITED");
    await seat(t, d, "DECLINED");
    const g1 = await glass(t, 1, wine);
    await start(t);
    await guess(g1, pa, "country", wine);
    await reveal(host, g1);
    await close(t);
    assert.ok(keysOf(await ledger(a)).includes(`finish:${t}`));
    assert.equal((await ledger(a)).find((r) => r.source_key === `finish:${t}`).xp, 40);
    assert.ok(keysOf(await ledger(a)).includes("achievement:first_tasting"));
    assert.deepEqual(await ledger(b), [], "a JOINED guest with no scored guess");
    assert.deepEqual(await ledger(c), [], "INVITED");
    assert.deepEqual(await ledger(d), [], "DECLINED");
    assert.deepEqual(
      (await ledger(host)).map((r) => r.source_key),
      [`host:${t}`, "achievement:first_tasting", "achievement:first_host"],
    );

    // Reopen and close again: nothing twice.
    const before = (await ledger(a)).length + (await ledger(host)).length;
    await start(t);
    await close(t);
    assert.equal((await ledger(a)).length + (await ledger(host)).length, before);

    // A host alone, no revealed glass, and an OPEN board pay nothing.
    const alone = await tasting(host);
    const gAlone = await glass(alone, 1, wine);
    await start(alone);
    await reveal(host, gAlone);
    await close(alone);
    const unrevealed = await tasting(host);
    await seat(unrevealed, a);
    await glass(unrevealed, 1, wine);
    await start(unrevealed);
    await close(unrevealed);
    const open = await tasting(host, { mode: "OPEN" });
    await seat(open, a);
    const gOpen = await glass(open, 1, wine);
    await start(open);
    await reveal(host, gOpen);
    await close(open);
    const hostKeys = keysOf(await ledger(host));
    for (const id of [alone, unrevealed, open]) assert.ok(!hostKeys.includes(`host:${id}`), `no host XP for ${id}`);
    assert.ok(!keysOf(await ledger(a)).includes(`finish:${open}`), "OPEN mode has no game");

    // The fourth finish of one UTC day writes no row.
    for (let i = 0; i < 3; i += 1) {
      const more = await tasting(host);
      const p = await seat(more, a);
      const g = await glass(more, 1, wine);
      await start(more);
      await guess(g, p, "country", wine);
      await reveal(host, g);
      await close(more);
    }
    assert.equal((await ledger(a)).filter((r) => r.kind === "tasting_finished").length, 3);
  });
});

test("8. winner: the top of three or more players; ties all win; two players or a 0 top do not", async () => {
  await withRollback(async () => {
    const [host, a, b, c, d, e] = await people(6);
    const wine = await catalogWine(host);
    const play = async (players) => {
      const t = await tasting(host);
      const g = await glass(t, 1, wine);
      const seats = [];
      for (const [user] of players) seats.push(await seat(t, user));
      await start(t);
      for (let i = 0; i < players.length; i += 1) await guess(g, seats[i], players[i][1], wine);
      await reveal(host, g);
      await close(t);
      return t;
    };
    await play([
      [a, "exact"],
      [b, "country"],
      [c, "wrong"],
    ]);
    assert.ok((await achievementsOf(a)).includes("winner"));
    assert.ok(!(await achievementsOf(b)).includes("winner"));
    assert.equal((await ledger(a)).find((r) => r.source_key === "achievement:winner").xp, 100);

    await play([
      [b, "country"],
      [d, "country"],
      [c, "wrong"],
    ]);
    assert.ok((await achievementsOf(b)).includes("winner"), "a tie: both win");
    assert.ok((await achievementsOf(d)).includes("winner"), "a tie: both win");

    await play([
      [e, "exact"],
      [c, "wrong"],
    ]);
    assert.ok(!(await achievementsOf(e)).includes("winner"), "two players are not a table");

    const [f, g2, h] = await people(3);
    await play([
      [f, "wrong"],
      [g2, "wrong"],
      [h, "wrong"],
    ]);
    assert.ok(!(await achievementsOf(f)).includes("winner"), "a top of 0 wins nothing");
  });
});

// ---------------------------------------------------------------------------
// 9-12. The cellar.
// ---------------------------------------------------------------------------
test("9a. a lot pays 5 a bottle, growth pays the difference, an Edit correction and a re-grow nothing", async () => {
  await withRollback(async () => {
    const [u] = await people(1);
    const wine = await catalogWine(u);
    const lot = await addLot(u, 5, wine);
    assert.deepEqual(
      (await ledger(u)).map((r) => [r.source_key, r.xp, r.units]),
      [
        [`cellar_add:${lot}:5`, 25, 5],
        ["achievement:first_bottle", 25, null],
      ],
    );
    await asUser(u);
    await client.query(
      "update cellar_lots set quantity = quantity + 3, purchased_quantity = purchased_quantity + 3 where id = $1",
      [lot],
    );
    await client.query("update cellar_lots set quantity = quantity + 2 where id = $1", [lot]);
    await client.query("update cellar_lots set purchased_quantity = 3 where id = $1", [lot]);
    await client.query("update cellar_lots set purchased_quantity = 8 where id = $1", [lot]);
    assert.deepEqual(
      (await ledger(u)).filter((r) => r.kind === "cellar_add").map((r) => [r.source_key, r.xp, r.units]),
      [
        [`cellar_add:${lot}:5`, 25, 5],
        [`cellar_add:${lot}:8`, 15, 3],
      ],
    );
  });
});

test("9b. a lot pays at most 20 bottles; the day's award that crosses 100 is clamped, later ones write nothing", async () => {
  await withRollback(async () => {
    const [u, v] = await people(2);
    const wine = await catalogWine(u);
    const big = await addLot(u, 30, wine);
    assert.deepEqual(
      (await ledger(u)).filter((r) => r.kind === "cellar_add").map((r) => [r.source_key, r.xp, r.units]),
      [[`cellar_add:${big}:20`, 100, 20]],
    );
    await addLot(v, 8, wine);
    await addLot(v, 8, wine);
    const third = await addLot(v, 8, wine);
    await addLot(v, 1, wine);
    assert.deepEqual(
      (await ledger(v)).filter((r) => r.kind === "cellar_add").map((r) => r.xp),
      [40, 40, 20],
    );
    assert.equal((await ledger(v)).find((r) => r.source_key === `cellar_add:${third}:8`).units, 8);
  });
});

test("10. a drink pays at COMMIT: 15 a bottle up to 6, 90 a day; GIFTED and lot-less nothing", async () => {
  await withRollback(async () => {
    const [u, v] = await people(2);
    const wine = await catalogWine(u);
    const lot = await addLot(u, 20, wine);
    const c1 = await consume(u, lot, 2);
    assert.equal((await ledger(u)).filter((r) => r.kind === "drink").length, 0, "deferred to COMMIT");
    await immediate();
    assert.deepEqual(
      (await ledger(u)).filter((r) => r.kind === "drink").map((r) => [r.source_key, r.xp, r.units]),
      [[`drink:${c1}`, 30, 2]],
    );
    assert.ok((await achievementsOf(u)).includes("first_drink"));
    await consume(u, lot, 1, "GIFTED");
    await asOwner();
    await client.query(
      `insert into cellar_consumptions (owner_id, lot_id, catalog_wine_id, quantity, reason, consumed_on)
       values ($1, null, $2, 1, 'DRANK', current_date)`,
      [u, wine.id],
    );
    await immediate();
    assert.equal((await ledger(u)).filter((r) => r.kind === "drink").length, 1, "GIFTED and lot-less pay nothing");

    const vlot = await addLot(v, 20, wine);
    const c10 = await consume(v, vlot, 10);
    await immediate();
    assert.deepEqual(
      (await ledger(v)).filter((r) => r.kind === "drink").map((r) => [r.source_key, r.xp, r.units]),
      [[`drink:${c10}`, 90, 6]],
    );
    await consume(v, vlot, 1);
    await immediate();
    assert.equal((await ledger(v)).filter((r) => r.kind === "drink").length, 1, "the 90/day cap");
  });
});

test("11-12. a masked pour pays nothing until its glass is revealed; a removed glass never (Rule 1)", async () => {
  await withRollback(async () => {
    const [host, other] = await people(2);
    const wine = await catalogWine(host);
    const lot = await addLot(host, 3, wine);
    const onHand = async () =>
      (await client.query("select public.xp_cellar_on_hand($1) as n", [host])).rows[0].n;
    const masked = async (c) => {
      await asOwner();
      const r = await client.query(
        `select public.xp_consumption_masked($1) as mine,
                exists (select 1 from public.catalog_wine_masked_pours(array[$2::uuid]) m where m.consumption_id = $1) as theirs`,
        [c, wine.id],
      );
      assert.equal(r.rows[0].mine, r.rows[0].theirs, "xp_consumption_masked agrees with catalog_wine_masked_pours");
      return r.rows[0].mine;
    };
    const othersView = async () => {
      await asUser(other);
      const r = await client.query("select xp from profile_levels where user_id = $1", [host]);
      await asOwner();
      return r.rows[0]?.xp ?? 0;
    };

    // pour_cellar_lot_into_glass into a running flight.
    const t = await tasting(host);
    const g1 = await glass(t, 1, wine);
    const g2 = await glass(t, 2, wine);
    await start(t);
    await client.query(
      "insert into wine_pour_intents (wine_id, owner_id, cellar_lot_id, consume_on_start) values ($1, $2, $3, false), ($4, $2, $3, false)",
      [g1, host, lot, g2],
    );
    const xpBefore = await othersView();
    const handBefore = await onHand();
    await asUser(host);
    const c1 = (await client.query("select pour_cellar_lot_into_glass($1) as id", [g1])).rows[0].id;
    const c2 = (await client.query("select pour_cellar_lot_into_glass($1) as id", [g2])).rows[0].id;
    await immediate();
    await asOwner();
    assert.equal((await ledger(host)).filter((r) => r.kind === "drink").length, 0, "no drink at the pour");
    assert.equal(await onHand(), handBefore, "a masked bottle still counts as in the cellar");
    assert.ok(!(await achievementsOf(host)).includes("first_drink"));
    assert.equal(await othersView(), xpBefore, "another member sees no change before the reveal");
    assert.equal(await masked(c1), true);

    await reveal(host, g1);
    assert.equal(await masked(c1), false);
    assert.deepEqual(
      (await ledger(host)).filter((r) => r.kind === "drink").map((r) => [r.source_key, r.xp]),
      [[`drink:${c1}`, 15]],
    );
    assert.ok((await achievementsOf(host)).includes("first_drink"));
    assert.equal(await othersView(), xpBefore + 15 + 25, "the reveal moves the public number");

    // The second glass is removed before its reveal: its pour stays masked for good.
    await asOwner();
    await client.query("delete from wines where id = $1", [g2]);
    await immediate();
    assert.equal(await masked(c2), true);
    assert.ok(!keysOf(await ledger(host)).includes(`drink:${c2}`));

    // The same through draw_down_flight_cellar_lots at Start.
    await deferred();
    const t2 = await tasting(host);
    const g3 = await glass(t2, 1, wine);
    await client.query(
      "insert into wine_pour_intents (wine_id, owner_id, cellar_lot_id, consume_on_start) values ($1, $2, $3, true)",
      [g3, host, lot],
    );
    await start(t2);
    await asUser(host);
    const drawn = await client.query("select outcome from draw_down_flight_cellar_lots($1)", [t2]);
    assert.deepEqual(drawn.rows.map((r) => r.outcome), ["drawn"]);
    await immediate();
    await asOwner();
    const c3 = (await client.query("select cellar_consumption_id as id from wine_pour_intents where wine_id = $1", [g3]))
      .rows[0].id;
    assert.equal(await masked(c3), true);
    assert.ok(!keysOf(await ledger(host)).includes(`drink:${c3}`), "nothing at Start");
    await reveal(host, g3);
    assert.ok(keysOf(await ledger(host)).includes(`drink:${c3}`), "paid at the reveal");
  });
});

// ---------------------------------------------------------------------------
// 13-15. Notes, training, friends.
// ---------------------------------------------------------------------------
test("13. notes: 20 each, five a day; TRAINING counts but pays nothing; note_countries follows Rule 1", async () => {
  await withRollback(async () => {
    const r = await refs();
    const [u, host] = await people(2);
    const wine = await catalogWine(u);
    const n1 = await note(u, { catalog_wine_id: wine.id });
    assert.deepEqual(
      (await ledger(u)).map((row) => [row.source_key, row.xp]),
      [
        [`note:${n1}`, 20],
        ["achievement:first_note", 25],
      ],
    );
    for (let i = 0; i < 5; i += 1) await note(u, { catalog_wine_id: wine.id });
    assert.equal((await ledger(u)).filter((row) => row.kind === "note").length, 5, "the sixth of the day pays nothing");

    // An unchanged re-save does no work.
    const before = await ledger(u);
    await note(u, { id: n1, catalog_wine_id: wine.id });
    assert.deepEqual(await ledger(u), before);

    // TRAINING: no note XP, still a note (first_note).
    const [t] = await people(1);
    await asOwner();
    await client.query(
      "insert into wset_notes (author_id, context_kind, tasted_on) values ($1, 'TRAINING', current_date)",
      [t],
    );
    assert.deepEqual((await ledger(t)).map((row) => row.source_key), ["achievement:first_note"]);

    // A hidden-glass BLIND note's country counts only once its glass is
    // revealed (13b pins its XP; u's notes for today are spent here).
    const spain = { country: r.spain, region: r.rioja, appellation: r.riojaApp, primary: r.tempranillo };
    const spanish = await catalogWine(host, spain);
    const tt = await tasting(host);
    const pu = await seat(tt, u);
    const g1 = await glass(tt, 1, spanish);
    await start(tt);
    await guess(g1, pu, "country", spanish);
    const countriesBefore = await metric(u, "note_countries_10");
    await note(u, { context_kind: "BLIND", tasting_wine_id: g1 });
    assert.equal(await metric(u, "note_countries_10"), countriesBefore, "an identity-less note names no country");
    await reveal(host, g1);
    assert.equal(await metric(u, "note_countries_10"), countriesBefore + 1, "counted once its glass is revealed");

    // A blind_pending wine never counts.
    const pending = await catalogWine(host, { ...spain, blindPending: true });
    const [w] = await people(1);
    await asOwner();
    await client.query(
      "insert into wset_notes (author_id, context_kind, tasted_on, catalog_wine_id) values ($1, 'OPEN', current_date, $2)",
      [w, pending.id],
    );
    assert.equal(await metric(w, "note_countries_10"), 0);
    assert.equal(await metric(w, "first_note"), 1);
  });
});

test("13b. a hidden-glass BLIND note pays 20 at its insert", async () => {
  await withRollback(async () => {
    const [u, host] = await people(2);
    const wine = await catalogWine(host);
    const t = await tasting(host);
    await seat(t, u);
    const g1 = await glass(t, 1, wine);
    await start(t);
    const hidden = await note(u, { context_kind: "BLIND", tasting_wine_id: g1 });
    assert.deepEqual(
      (await ledger(u)).map((row) => [row.source_key, row.xp]),
      [
        [`note:${hidden}`, 20],
        ["achievement:first_note", 25],
      ],
    );
  });
});

test("14. training: a scored round pays 20 + points once, five a day; Spot on at total = possible", async () => {
  await withRollback(async () => {
    const [u] = await people(1);
    const wine = await catalogWine(u);
    const round = async ({ scored, total = 17, possible = 26 }) => {
      await asOwner();
      const noteId = (
        await client.query(
          "insert into wset_notes (author_id, context_kind, tasted_on) values ($1, 'TRAINING', current_date) returning id",
          [u],
        )
      ).rows[0].id;
      return (
        await client.query(
          `insert into training_attempts (author_id, session_key, note_id, actual_catalog_wine_id,
             total_points, possible_points, scored_at)
           values ($1, gen_random_uuid(), $2, $3, $4, $5, $6) returning id`,
          [u, noteId, scored ? wine.id : null, scored ? total : null, scored ? possible : null, scored ? new Date().toISOString() : null],
        )
      ).rows[0].id;
    };
    const a1 = await round({ scored: true });
    assert.deepEqual(
      (await ledger(u)).filter((r) => r.kind === "training").map((r) => [r.source_key, r.xp, r.units]),
      [[`training:${a1}`, 37, 17]],
    );
    assert.ok((await achievementsOf(u)).includes("first_training"));

    const a2 = await round({ scored: false });
    assert.ok(!keysOf(await ledger(u)).includes(`training:${a2}`), "an unscored round pays nothing");
    await client.query(
      "update training_attempts set actual_catalog_wine_id = $2, total_points = 26, possible_points = 26, scored_at = now() where id = $1",
      [a2, wine.id],
    );
    await client.query("update training_attempts set scored_at = now() where id = $1", [a2]);
    assert.equal((await ledger(u)).filter((r) => r.source_key === `training:${a2}`).length, 1, "scored later, paid once");
    assert.ok((await achievementsOf(u)).includes("training_ace"), "26 of 26");

    for (let i = 0; i < 4; i += 1) await round({ scored: true });
    assert.equal((await ledger(u)).filter((r) => r.kind === "training").length, 5, "the sixth round of the day pays nothing");
  });
});

test("15. friends: an accepted request gives both first_friend; the tenth friend Full table", async () => {
  await withRollback(async () => {
    const [a, b] = await people(2);
    await asUser(a);
    await client.query("select send_friend_request($1)", [b]);
    await asUser(b);
    await client.query("select accept_friend_request($1)", [a]);
    assert.ok((await achievementsOf(a)).includes("first_friend"));
    assert.ok((await achievementsOf(b)).includes("first_friend"));
    const more = await people(9);
    await asOwner();
    for (const f of more.slice(0, 8)) {
      await client.query("insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)", [a, f]);
    }
    assert.ok(!(await achievementsOf(a)).includes("friends_10"), "nine friends");
    await client.query("insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)", [a, more[8]]);
    assert.ok((await achievementsOf(a)).includes("friends_10"), "ten friends");
  });
});

// ---------------------------------------------------------------------------
// 16-18. RLS and the client RPCs.
// ---------------------------------------------------------------------------
test("16. RLS: levels and public achievements are readable; cellar ones follow the cellar; the ledger is the owner's", async () => {
  await withRollback(async () => {
    const [owner, friend, stranger] = await people(3);
    const wine = await catalogWine(owner);
    await addLot(owner, 1, wine); // first_bottle (cellar gate) and a ledger row
    await note(owner, { catalog_wine_id: wine.id }); // first_note (public)
    await asOwner();
    await client.query("insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)", [owner, friend]);
    const read = async (viewer) => {
      await asUser(viewer);
      const levels = (await client.query("select xp from profile_levels where user_id = $1", [owner])).rowCount;
      const keys = (
        await client.query("select achievement_key from profile_achievements where user_id = $1 order by 1", [owner])
      ).rows.map((r) => r.achievement_key);
      const events = (await client.query("select 1 from xp_events where user_id = $1", [owner])).rowCount;
      await asOwner();
      return { levels, keys, events };
    };
    const setVisibility = (v) => client.query("update profiles set cellar_visibility = $2 where id = $1", [owner, v]);

    assert.deepEqual((await read(owner)).keys, ["first_bottle", "first_note"], "the owner sees their own");
    assert.ok((await read(owner)).events > 0);
    await setVisibility("PUBLIC");
    assert.deepEqual(await read(stranger), { levels: 1, keys: ["first_bottle", "first_note"], events: 0 });
    await setVisibility("FRIENDS");
    assert.deepEqual((await read(friend)).keys, ["first_bottle", "first_note"]);
    assert.deepEqual((await read(stranger)).keys, ["first_note"]);
    await setVisibility("PRIVATE");
    assert.deepEqual((await read(friend)).keys, ["first_note"]);
    assert.deepEqual((await read(stranger)).keys, ["first_note"]);
    assert.equal((await read(friend)).events, 0, "nobody reads another's ledger");

    await asAnon();
    await expectError(() => client.query("select 1 from profile_levels"), "42501");
    await expectError(() => client.query("select 1 from xp_events"), "42501");
    await expectError(() => client.query("select public.get_my_level_state()"), "42501");
    await asOwner();
  });
});

test("17. mark_xp_seen marks only the caller's ids, idempotently, and clears the welcome", async () => {
  await withRollback(async () => {
    const [a, b] = await people(2);
    const wine = await catalogWine(a);
    await note(a, { catalog_wine_id: wine.id });
    await note(b, { catalog_wine_id: wine.id });
    await asOwner();
    const idsOf = async (u) =>
      (await client.query("select id from xp_events where user_id = $1 order by id", [u])).rows.map((r) => Number(r.id));
    const aIds = await idsOf(a);
    const bIds = await idsOf(b);
    await client.query("update profile_levels set welcome_pending = true where user_id = $1", [a]);
    await asUser(a);
    await client.query("select mark_xp_seen($1::bigint[], true)", [[aIds[0], bIds[0]]]);
    await client.query("select mark_xp_seen($1::bigint[], true)", [[aIds[0], bIds[0]]]);
    await asOwner();
    const seen = async (id) => (await client.query("select seen_at from xp_events where id = $1", [id])).rows[0].seen_at;
    assert.ok(await seen(aIds[0]), "the caller's own row");
    assert.equal(await seen(aIds[1]), null, "an id not passed stays unseen");
    assert.equal(await seen(bIds[0]), null, "someone else's id is ignored");
    assert.equal(
      (await client.query("select welcome_pending from profile_levels where user_id = $1", [a])).rows[0].welcome_pending,
      false,
    );
    await asUser(null);
    await expectError(() => client.query("select mark_xp_seen('{}'::bigint[], false)"), "42501");
    await asUser(a);
    await expectError(
      () => client.query("select mark_xp_seen($1::bigint[], false)", [Array.from({ length: 101 }, (_, i) => i + 1)]),
      "22023",
    );
    await asOwner();
  });
});

test("18. get_my_level_state: the shape, the defaults, the oldest 50 unseen", async () => {
  await withRollback(async () => {
    const [fresh, busy] = await people(2);
    await asUser(fresh);
    const empty = (await client.query("select get_my_level_state() as s")).rows[0].s;
    assert.deepEqual(
      { ...empty, checked_at: typeof empty.checked_at },
      { xp: 0, level: 1, welcome: false, unseen: [], checked_at: "string" },
    );
    assert.match(empty.checked_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);

    await asOwner();
    await client.query(
      `insert into xp_events (user_id, kind, source_key, xp, xp_after, day)
       select $1, 'note', 'test:' || n, 1, n, current_date from generate_series(1, 55) n`,
      [busy],
    );
    const ids = (await client.query("select id from xp_events where user_id = $1 order by id", [busy])).rows.map((r) =>
      Number(r.id),
    );
    await asUser(busy);
    const s = (await client.query("select get_my_level_state() as s")).rows[0].s;
    assert.equal(s.unseen.length, 50);
    assert.deepEqual(
      s.unseen.map((e) => e.id),
      ids.slice(0, 50),
    );
    assert.deepEqual(Object.keys(s.unseen[0]).sort(), ["achievement", "created_at", "id", "kind", "units", "xp", "xp_after"]);
    await asOwner();
  });
});

// ---------------------------------------------------------------------------
// 19. Account deletion (L27).
// ---------------------------------------------------------------------------
test("19. deletion drops the person's levels; later reveals pay them nothing; a scrub-closed tasting pays its guests", async () => {
  await withRollback(async () => {
    const [gone, host, guest] = await people(3);
    const wine = await catalogWine(host);
    // gone plays in host's running tasting; their JOINED seat stays (step 5).
    const t1 = await tasting(host);
    const pGone = await seat(t1, gone);
    const g1 = await glass(t1, 1, wine);
    const g2 = await glass(t1, 2, wine);
    await start(t1);
    await guess(g1, pGone, "country", wine);
    await guess(g2, pGone, "country", wine);
    await reveal(host, g1);
    // gone hosts a started tasting with a revealed glass and a playing guest.
    const t2 = await tasting(gone);
    const pGuest = await seat(t2, guest);
    const g3 = await glass(t2, 1, wine);
    await start(t2);
    await guess(g3, pGuest, "country", wine);
    await reveal(gone, g3);
    assert.ok((await ledger(gone)).length > 0);

    await asOwner();
    await client.query("select public.scrub_deleted_account($1)", [gone]);
    assert.deepEqual(await ledger(gone), []);
    assert.deepEqual(await achievementsOf(gone), []);
    assert.equal((await client.query("select 1 from profile_levels where user_id = $1", [gone])).rowCount, 0);
    assert.ok(keysOf(await ledger(guest)).includes(`finish:${t2}`), "the scrub's close paid the guest");

    await reveal(host, g2);
    assert.deepEqual(await ledger(gone), [], "a later reveal pays a deleted account nothing");
  });
});

// ---------------------------------------------------------------------------
// 20. Error isolation (L20): an award that fails never fails its write.
// ---------------------------------------------------------------------------
test("20. a failing award is a WARNING; the reveal, the drink and the note still succeed", async () => {
  await withRollback(async () => {
    const [host, poisoned, fine] = await people(3);
    const wine = await catalogWine(host);
    // A total at integer max: any further award overflows inside xp_award.
    await asOwner();
    await client.query(
      "insert into profile_levels (user_id, xp, level) values ($1, 2147483647, 60)",
      [poisoned],
    );
    const t = await tasting(host);
    const pp = await seat(t, poisoned);
    const pf = await seat(t, fine);
    const g1 = await glass(t, 1, wine);
    await start(t);
    await guess(g1, pp, "country", wine);
    const gf = await guess(g1, pf, "country", wine);
    await reveal(host, g1);
    assert.equal((await client.query("select is_revealed from wines where id = $1", [g1])).rows[0].is_revealed, true);
    assert.deepEqual(await ledger(poisoned), []);
    assert.ok(keysOf(await ledger(fine)).includes(`guess:${gf}`), "one person's failure costs the others nothing");
    assert.ok(warnings.some((w) => w.startsWith("xp_on_glass_revealed")), warnings.join(" | "));

    const lot = (
      await client.query(
        `insert into cellar_lots (owner_id, catalog_wine_id, bottle_size_ml, quantity, purchased_quantity, currency)
         values ($1, $2, 750, 3, 3, 'DKK') returning id`,
        [poisoned, wine.id],
      )
    ).rows[0].id;
    warnings.length = 0;
    const c = await consume(poisoned, lot, 1);
    await immediate();
    assert.ok(c);
    assert.ok(warnings.some((w) => w.startsWith("xp_on_cellar_consumption")), warnings.join(" | "));
    warnings.length = 0;
    const n = await note(poisoned, { catalog_wine_id: wine.id });
    assert.ok(n);
    assert.ok(warnings.some((w) => w.startsWith("xp_on_wset_note")), warnings.join(" | "));
    assert.deepEqual(await ledger(poisoned), []);
  });
});

// ---------------------------------------------------------------------------
// 21. Replay parity (L19).
// ---------------------------------------------------------------------------
test("21. xp_replay_user rebuilds exactly what the live triggers paid", async () => {
  await withRollback(async () => {
    const [u, host, friend] = await people(3);
    const wine = await catalogWine(u);
    const lot = await addLot(u, 5, wine);
    await consume(u, lot, 1);
    await immediate();
    await note(u, { catalog_wine_id: wine.id });
    await asOwner();
    await client.query("insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)", [u, friend]);
    const t = await tasting(host);
    const pu = await seat(t, u);
    const g1 = await glass(t, 1, wine);
    await start(t);
    await guess(g1, pu, "exact", wine);
    await reveal(host, g1);
    await close(t);

    const snapshot = async () =>
      (await ledger(u))
        .map((r) => `${r.source_key}=${r.xp}`)
        .sort();
    const live = await snapshot();
    const liveTotal = (await xpOf(u)).xp;
    assert.ok(live.length >= 8, live.join(", "));

    await asOwner();
    await client.query("delete from xp_events where user_id = $1", [u]);
    await client.query("delete from profile_achievements where user_id = $1", [u]);
    await client.query("update profile_levels set xp = 0, level = 1 where user_id = $1", [u]);
    const added = (await client.query("select public.xp_replay_user($1, true, false) as n", [u])).rows[0].n;
    assert.deepEqual(await snapshot(), live);
    assert.equal(added, liveTotal);
    assert.equal((await xpOf(u)).xp, liveTotal);
    // Idempotent: a second run adds nothing.
    assert.equal((await client.query("select public.xp_replay_user($1, false, false) as n", [u])).rows[0].n, 0);
  });
});

// ---------------------------------------------------------------------------
// 22. Timing (logged, not asserted — the pooler round trip dominates).
// ---------------------------------------------------------------------------
test("22. an 8-guesser reveal's duration", async () => {
  await withRollback(async () => {
    const [host, ...guessers] = await people(9);
    const wine = await catalogWine(host);
    const t = await tasting(host);
    const g1 = await glass(t, 1, wine);
    const seats = [];
    for (const g of guessers) seats.push(await seat(t, g));
    await start(t);
    for (const p of seats) await guess(g1, p, "country", wine);
    await asUser(host);
    const t0 = process.hrtime.bigint();
    await client.query("select reveal_wine($1)", [g1]);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    await asOwner();
    console.log(`# 8-guesser reveal: ${ms.toFixed(1)} ms (round trip included)`);
    assert.equal((await client.query("select count(*)::int as n from xp_events where kind = 'guess' and user_id = any($1)", [guessers])).rows[0].n, 8);
  });
});
```

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && node --check scripts/levels.test.mjs`
Expected: no output, exit 0. Do NOT run the suite itself.

- [ ] **Step 8: Gates**

Run each; each must pass:
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx tsc --noEmit`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx eslint scripts/levels.test.mjs src/lib/levels/levels-migration.test.ts src/lib/supabase/database.types.ts`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run` → 213 files, 4,143 tests passed (base + 5).

- [ ] **Step 9: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-mapdetail && git add supabase/migrations/20260927160000_levels_and_achievements.sql src/lib/levels/levels-migration.test.ts src/lib/levels/__fixtures__/curve.json src/lib/supabase/database.types.ts scripts/levels.test.mjs && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(db): levels and achievements - the XP ledger, triggers, backfill and DB suite (not applied)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The curve, the types and the copy

**Files:**
- Create: `src/lib/levels/types.ts`
- Create: `src/lib/levels/curve.test.ts`, `src/lib/levels/curve.ts`
- Create: `src/lib/levels/copy.test.ts`, `src/lib/levels/copy.ts`

**Interfaces:**
- Consumes: `src/lib/levels/__fixtures__/curve.json` and the migration's achievements seed text (Task 1).
- Produces:
  - `types.ts`: `XpKind`, `AchievementCategory`, `AchievementKey` (the twenty keys), `XpEvent { id: number; kind: string; xp: number; xpAfter: number; units: number | null; achievement: string | null; createdAt: string }`, `LevelSnapshot { userId: string; xp: number; level: number; welcome: boolean; checkedAt: string; unseen: XpEvent[] }`, `OwnLevel { xp: number; level: number }`, `EarnedAchievement`, `LockedAchievement`, `ProfileLevel { xp; level; earned: EarnedAchievement[]; locked: LockedAchievement[] | null }`, `ToastKind`, `Toast { id; userId; kind; title; detail: string | null; eventIds: number[]; welcome: boolean; durationMs: number; tone: "plain" | "gold" }`.
  - `curve.ts`: `MAX_LEVEL = 60`, `xpForLevel(level: number): number`, `levelForXp(xp: number): number`, `levelProgress(xp: number): LevelProgress` where `LevelProgress = { level; into; span; fraction; next: number | null }`.
  - `copy.ts`: `ACHIEVEMENTS: Record<AchievementKey, { name; description; category }>`, `ACHIEVEMENT_KEYS`, `isAchievementKey(key: unknown): key is AchievementKey`, `CATEGORY_ORDER`, `CATEGORY_LABELS`, `formatXp(n)`, `formatUtcDate(iso)`, `ringLabel(xp)`, `ringLinkLabel(name, xp)`, `pillText(level)`, `pillLabel(level)`, `welcomeTitle(level)`, `WELCOME_DETAIL_EARNED`, `WELCOME_DETAIL_FRESH`, `kindLabel(kind, count, units): string | null`, `xpToastTitle(sum, label)`, `awayToastTitle(sum)`, `achievementToastTitle(names)`, `bonusDetail(sum)`, `levelUpTitle(level)`, `CARD_COPY`, `levelHeading`, `xpInAll`, `toNextLevel(into, span, next)`, `progressText(progress, target)`, `bonusText(bonus)`.

- [ ] **Step 1: Write the types**

Create `src/lib/levels/types.ts` (types only; nothing to test on its own):

```ts
// Levels and achievements: the types shared by the server reads, the "use
// server" action, the pure rules and the client components (spec
// docs/superpowers/specs/2026-09-27-levels-and-achievements-design.md §6.2).
// A plain module — src/lib/levels/actions.ts is a "use server" file and may
// export only async functions, so it imports these with `import type`.

/** What `xp_events.kind` holds (spec §2). A kind the app does not know yet
    (the database ahead of a deploy) still arrives, typed as a plain string. */
export type XpKind =
  | "guess"
  | "guess_match"
  | "tasting_finished"
  | "tasting_hosted"
  | "cellar_add"
  | "drink"
  | "note"
  | "training"
  | "achievement";

export type AchievementCategory = "cellar" | "tastings" | "notes" | "training" | "friends";

/** The twenty keys of spec §4, in `achievements.sort_order`. */
export type AchievementKey =
  | "first_bottle"
  | "cellar_25"
  | "cellar_100"
  | "first_drink"
  | "drank_50"
  | "first_tasting"
  | "tastings_10"
  | "first_host"
  | "perfect_glass"
  | "winner"
  | "glasses_50"
  | "first_note"
  | "notes_25"
  | "notes_100"
  | "note_countries_10"
  | "first_training"
  | "training_10"
  | "training_ace"
  | "first_friend"
  | "friends_10";

/** One unseen ledger row, as get_my_level_state returns it (camelCased). */
export type XpEvent = {
  id: number;
  kind: string;
  xp: number;
  xpAfter: number;
  units: number | null;
  achievement: string | null;
  /** ISO 8601, UTC, server clock. */
  createdAt: string;
};

/** The viewer's own level state, read by AppHeader on every render. */
export type LevelSnapshot = {
  userId: string;
  xp: number;
  level: number;
  welcome: boolean;
  /** ISO 8601, UTC, server clock: when the read ran. */
  checkedAt: string;
  /** The oldest (at most 50) unseen ledger rows, by id. */
  unseen: XpEvent[];
};

/** A level as the ring and the pill need it. */
export type OwnLevel = { xp: number; level: number };

export type EarnedAchievement = {
  key: AchievementKey;
  category: AchievementCategory;
  /** ISO 8601. */
  unlockedAt: string;
  /** Unlocked by the launch backfill: shown as "Before levels", no date (L25). */
  backfill: boolean;
};

export type LockedAchievement = {
  key: AchievementKey;
  category: AchievementCategory;
  progress: number;
  target: number;
  bonusXp: number;
};

/** /u/[id]'s level card: someone else's (earned only) or your own (with the
    locked ones and their progress). */
export type ProfileLevel = {
  xp: number;
  level: number;
  earned: EarnedAchievement[];
  /** Your own profile only; null on someone else's. */
  locked: LockedAchievement[] | null;
};

export type ToastKind = "welcome" | "xp" | "achievement" | "level";

/** One pop-up card (spec §8.1). */
export type Toast = {
  /** Stable within a tab: the kind plus the ids it carries. */
  id: string;
  userId: string;
  kind: ToastKind;
  title: string;
  detail: string | null;
  /** The ledger rows this card marks seen when it first shows. */
  eventIds: number[];
  /** True on the welcome card: showing it clears welcome_pending. */
  welcome: boolean;
  durationMs: number;
  /** "gold": the filled level-up card. */
  tone: "plain" | "gold";
};
```

- [ ] **Step 2: Write the failing curve test**

Create `src/lib/levels/curve.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_LEVEL, levelForXp, levelProgress, xpForLevel } from "./curve";

// The parity fixture: 0, every threshold −1 / 0 / +1 for levels 2..60, and
// 1,000,000, generated by a brute-force scan (not by this module).
// scripts/levels.test.mjs checks SQL's level_for_xp against the same file.
const FIXTURE = JSON.parse(
  readFileSync(new URL("./__fixtures__/curve.json", import.meta.url), "utf8"),
) as [number, number][];

describe("xpForLevel", () => {
  it("is 25·L·(L−1): the spec §3.1 table", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 30, 40, 60].map(xpForLevel)).toEqual([
      0, 50, 150, 300, 500, 750, 1050, 1400, 1800, 2250, 3300, 5250, 9500, 21750, 39000, 88500,
    ]);
  });
  it("treats anything below 1 as level 1", () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-3)).toBe(0);
  });
});

describe("levelForXp", () => {
  it("matches the fixture on every row", () => {
    expect(FIXTURE).toHaveLength(179);
    for (const [xp, level] of FIXTURE) expect(levelForXp(xp), `xp ${xp}`).toBe(level);
  });
  it("caps at 60 and floors at 1", () => {
    expect(MAX_LEVEL).toBe(60);
    expect(levelForXp(88_500)).toBe(60);
    expect(levelForXp(2_147_483_647)).toBe(60);
    expect(levelForXp(-10)).toBe(1);
    expect(levelForXp(Number.NaN)).toBe(1);
  });
});

describe("levelProgress", () => {
  it("is the owner's example: level 4, 120 of 200 XP to level 5", () => {
    expect(levelProgress(420)).toEqual({ level: 4, into: 120, span: 200, fraction: 0.6, next: 5 });
  });
  it("starts every level at 0", () => {
    expect(levelProgress(0)).toEqual({ level: 1, into: 0, span: 50, fraction: 0, next: 2 });
    expect(levelProgress(50)).toEqual({ level: 2, into: 0, span: 100, fraction: 0, next: 3 });
  });
  it("is full at the top level", () => {
    expect(levelProgress(88_500)).toEqual({ level: 60, into: 0, span: 0, fraction: 1, next: null });
    expect(levelProgress(100_000)).toEqual({ level: 60, into: 11_500, span: 0, fraction: 1, next: null });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels/curve.test.ts`
Expected: FAIL — `Failed to resolve import "./curve"`.

- [ ] **Step 4: Implement the curve**

Create `src/lib/levels/curve.ts`:

```ts
// The level curve (spec §3.1, L5): threshold(L) = 25·L·(L−1) XP, capped at
// level 60 (88,500 XP). The same rule is public.level_for_xp in SQL; both are
// pinned to __fixtures__/curve.json (curve.test.ts here, scripts/levels.test.mjs
// there). Pure: no imports, so vitest and client components load it.

export const MAX_LEVEL = 60;

/** The XP at which `level` starts: 0 for level 1, 50 for 2, 88,500 for 60. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return 25 * l * (l - 1);
}

/** The largest level ≤ 60 whose threshold is ≤ xp. The square root gives a
    first guess; the integer thresholds correct it by ±1, so no floating-point
    edge ever lands a person one level off. */
export function levelForXp(xp: number): number {
  const x = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  let v = Math.floor((1 + Math.sqrt(1 + (4 * x) / 25)) / 2);
  while (v > 1 && xpForLevel(v) > x) v -= 1;
  while (v < MAX_LEVEL && xpForLevel(v + 1) <= x) v += 1;
  return Math.min(Math.max(v, 1), MAX_LEVEL);
}

export type LevelProgress = {
  level: number;
  /** XP earned since this level started. */
  into: number;
  /** XP this level spans (0 at the top level). */
  span: number;
  /** 0..1; 1 at the top level. */
  fraction: number;
  /** The next level, or null at the top. */
  next: number | null;
};

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const x = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  if (level >= MAX_LEVEL) {
    return { level, into: x - xpForLevel(level), span: 0, fraction: 1, next: null };
  }
  const start = xpForLevel(level);
  const span = xpForLevel(level + 1) - start;
  const into = x - start;
  return { level, into, span, fraction: into / span, next: level + 1 };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels/curve.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Write the failing copy test**

Create `src/lib/levels/copy.test.ts` (it also pins copy.ts's keys and categories to the migration's seed, L22):

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_KEYS,
  CATEGORY_ORDER,
  achievementToastTitle,
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
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels/copy.test.ts`
Expected: FAIL — `Failed to resolve import "./copy"`.

- [ ] **Step 8: Implement the copy**

Create `src/lib/levels/copy.ts`:

```ts
// Every string levels and achievements show (spec §4, §8; C3: the drafts ship
// as written and the owner edits them live), and the helpers that fill their
// templates. The numbers (XP values, caps, targets, bonuses) live in the
// database (`xp_sources`, `achievements`, L22); scripts/levels.test.mjs pins
// the achievement keys here to the seeded rows, in `sort_order`.
// Pure: relative imports only, no React, no browser globals.
import { levelProgress } from "./curve";
import type { AchievementCategory, AchievementKey } from "./types";

type AchievementCopy = { name: string; description: string; category: AchievementCategory };

/** Spec §4's table, in `achievements.sort_order`. */
export const ACHIEVEMENTS: Record<AchievementKey, AchievementCopy> = {
  first_bottle: { name: "First bottle", description: "Add your first bottle to your cellar.", category: "cellar" },
  cellar_25: { name: "Well stocked", description: "Hold 25 bottles in your cellar at once.", category: "cellar" },
  cellar_100: { name: "Serious cellar", description: "Hold 100 bottles in your cellar at once.", category: "cellar" },
  first_drink: { name: "First cork", description: "Drink your first bottle from your cellar.", category: "cellar" },
  drank_50: { name: "Fifty corks", description: "Drink 50 bottles from your cellar.", category: "cellar" },
  first_tasting: { name: "First flight", description: "Finish your first blind tasting.", category: "tastings" },
  tastings_10: { name: "Regular", description: "Finish 10 blind tastings.", category: "tastings" },
  first_host: {
    name: "Host for the night",
    description: "Host a blind tasting to the end, with at least one guest.",
    category: "tastings",
  },
  perfect_glass: { name: "Perfect glass", description: "Get every part of a blind glass right.", category: "tastings" },
  winner: { name: "Top of the table", description: "Win a blind tasting of three or more players.", category: "tastings" },
  glasses_50: { name: "Fifty glasses", description: "Guess 50 blind glasses.", category: "tastings" },
  first_note: { name: "First impressions", description: "Write your first tasting note.", category: "notes" },
  notes_25: { name: "Note taker", description: "Write 25 tasting notes.", category: "notes" },
  notes_100: { name: "Critic", description: "Write 100 tasting notes.", category: "notes" },
  note_countries_10: { name: "Well travelled", description: "Write notes on wines from 10 countries.", category: "notes" },
  first_training: { name: "Practice round", description: "Finish your first round in the training room.", category: "training" },
  training_10: { name: "In training", description: "Finish 10 rounds in the training room.", category: "training" },
  training_ace: { name: "Spot on", description: "Score every possible point in a training round.", category: "training" },
  first_friend: { name: "Good company", description: "Make your first friend on Blindr.", category: "friends" },
  friends_10: { name: "Full table", description: "Have 10 friends at once.", category: "friends" },
};

/** The keys in display order (= `achievements.sort_order`). */
export const ACHIEVEMENT_KEYS = Object.keys(ACHIEVEMENTS) as AchievementKey[];

/** A key the app has copy for. A key it does not know (the database ahead of
    a deploy) is skipped everywhere, never rendered raw (spec §8.4). */
export function isAchievementKey(key: unknown): key is AchievementKey {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(ACHIEVEMENTS, key);
}

export const CATEGORY_ORDER: readonly AchievementCategory[] = [
  "cellar",
  "tastings",
  "notes",
  "training",
  "friends",
];

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  cellar: "Cellar",
  tastings: "Tastings",
  notes: "Notes",
  training: "Training",
  friends: "Friends",
};

/** 1234567 → "1,234,567". Deterministic (no locale), so a server render and
    a client render always agree. */
export function formatXp(n: number): string {
  const whole = Math.trunc(n);
  const sign = whole < 0 ? "-" : "";
  return sign + String(Math.abs(whole)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** An ISO timestamp as its UTC date, "12 Sep 2026" (spec §8.4). */
export function formatUtcDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// The ring (spec §8.2, L8)
// ---------------------------------------------------------------------------

/** "Level 4, 120 of 200 XP to level 5"; "Level 60, the top level". */
export function ringLabel(xp: number): string {
  const p = levelProgress(xp);
  if (p.next === null) return `Level ${p.level}, the top level`;
  return `Level ${p.level}, ${formatXp(p.into)} of ${formatXp(p.span)} XP to level ${p.next}`;
}

/** A link that holds the ring: the visible name first (WCAG 2.5.3). */
export function ringLinkLabel(name: string, xp: number): string {
  const p = levelProgress(xp);
  if (p.next === null) return `${name}, level ${p.level}, the top level`;
  return `${name}, level ${p.level}, ${formatXp(p.into)} of ${formatXp(p.span)} XP to level ${p.next}`;
}

// ---------------------------------------------------------------------------
// The community pill (spec §8.3)
// ---------------------------------------------------------------------------

export const pillText = (level: number): string => `Lv ${level}`;
export const pillLabel = (level: number): string => `Level ${level}`;

// ---------------------------------------------------------------------------
// Pop-ups (spec §8.1)
// ---------------------------------------------------------------------------

export const welcomeTitle = (level: number): string => `You're level ${level}`;
export const WELCOME_DETAIL_EARNED =
  "Levels are here — your tastings, cellar and notes so far already count.";
export const WELCOME_DETAIL_FRESH = "Levels are here — taste, cellar and note wines to earn XP.";

/** One kind's label on the XP card. `count` events, `units` summed (bottles for
    cellar_add and drink). Null for a kind the app has no label for. */
export function kindLabel(kind: string, count: number, units: number): string | null {
  switch (kind) {
    case "guess":
    case "guess_match":
      return count === 1 ? "Glass revealed" : `${count} glasses revealed`;
    case "tasting_finished":
      return count === 1 ? "Tasting finished" : `${count} tastings finished`;
    case "tasting_hosted":
      return count === 1 ? "Tasting hosted" : `${count} tastings hosted`;
    case "cellar_add":
      return units === 1 ? "Bottle added" : `${units} bottles added`;
    case "drink":
      return units === 1 ? "Bottle opened" : `${units} bottles opened`;
    case "note":
      return count === 1 ? "Tasting note" : `${count} tasting notes`;
    case "training":
      return count === 1 ? "Training round" : `${count} training rounds`;
    default:
      return null;
  }
}

/** "+40 XP · Tasting finished"; "+40 XP" when no label applies. */
export function xpToastTitle(sum: number, label: string | null): string {
  return label ? `+${formatXp(sum)} XP · ${label}` : `+${formatXp(sum)} XP`;
}

export const awayToastTitle = (sum: number): string => `+${formatXp(sum)} XP while you were away`;

/** "Achievement · Serious cellar"; two or more: "3 achievements · First cork, Well stocked". */
export function achievementToastTitle(names: string[]): string {
  if (names.length === 1) return `Achievement · ${names[0]}`;
  return `${names.length} achievements · ${names.slice(0, 2).join(", ")}`;
}

export const bonusDetail = (sum: number): string => `+${formatXp(sum)} XP`;
export const levelUpTitle = (level: number): string => `Level up · You're level ${level}`;

// ---------------------------------------------------------------------------
// /u/[id]'s "Level & achievements" card (spec §8.4)
// ---------------------------------------------------------------------------

export const CARD_COPY = {
  title: "Level & achievements",
  topLevel: "Top level",
  showAll: "All achievements",
  showFewer: "Fewer",
  earned: "Earned",
  notYet: "Not yet",
  beforeLevels: "Before levels",
  noneYet: "No achievements yet.",
} as const;

export const levelHeading = (level: number): string => `Level ${level}`;
export const xpInAll = (xp: number): string => `${formatXp(xp)} XP in all`;
export const toNextLevel = (into: number, span: number, next: number): string =>
  `${formatXp(into)} / ${formatXp(span)} XP to level ${next}`;
export const progressText = (progress: number, target: number): string =>
  `${formatXp(progress)} / ${formatXp(target)}`;
export const bonusText = (bonus: number): string => `+${formatXp(bonus)} XP`;
```

- [ ] **Step 9: Run it to verify it passes, then the gates**

- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels` → 3 files, 25 tests passed.
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx tsc --noEmit`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx eslint src/lib/levels`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run` → 215 files, 4,163 tests passed.

- [ ] **Step 10: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-mapdetail && git add src/lib/levels/types.ts src/lib/levels/curve.ts src/lib/levels/curve.test.ts src/lib/levels/copy.ts src/lib/levels/copy.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(levels): the level curve, shared types and every string" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The pop-up rules and the level store

**Files:**
- Create: `src/lib/levels/toasts.test.ts`, `src/lib/levels/toasts.ts`
- Create: `src/lib/levels/level-store.test.ts`, `src/lib/levels/level-store.ts`

**Interfaces:**
- Consumes: `levelForXp` (Task 2's `./curve`); `ACHIEVEMENTS`, `isAchievementKey`, `kindLabel`, the toast copy (Task 2's `./copy`); `Toast`, `XpEvent`, `LevelSnapshot`, `OwnLevel` (Task 2's `./types`).
- Produces:
  - `toasts.ts`: `TOAST_MS = 4000`, `WELCOME_MS = 6000`, `MAX_VISIBLE = 3`, `CATCH_UP_MS = 600000`, `MAX_SEEN_IDS = 100`, `freshEvents(events, seen: ReadonlySet<number>): XpEvent[]`, `buildToasts(events, { userId, welcome, xp, checkedAt }): { toasts: Toast[]; silentIds: number[] }`, `splitXp(text): { xp: string; rest: string } | null`, `cleanSeenIds(ids: unknown): number[] | null`.
  - `level-store.ts`: `type ShownToast = Toast & { leaving: boolean }`, `type ToasterView = { userId: string | null; visible: readonly ShownToast[]; announcement: string; announcementKey: number; silent: readonly number[] }`, `EMPTY_VIEW`, `createLevelStore()` (starts hidden until `setActive(true)`) returning `{ subscribe(listener): () => void; getView(): ToasterView; getLevel(userId): OwnLevel | null; publish(snapshot: LevelSnapshot): void; setActive(visible: boolean): void; dismiss(toastId): void; remove(toastId): void; clearSilent(ids): void; markShownElsewhere(userId, ids, welcome): void }`, and the tab's instance `levelStore`.

- [ ] **Step 1: Write the failing toast-rules test**

Create `src/lib/levels/toasts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CATCH_UP_MS, TOAST_MS, WELCOME_MS, buildToasts, cleanSeenIds, freshEvents, splitXp } from "./toasts";
import type { XpEvent } from "./types";

const CHECKED = "2026-09-27T12:00:00.000Z";
const NOW = Date.parse(CHECKED);
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

let nextId = 1;
function ev(kind: string, xp: number, xpAfter: number, extra: Partial<XpEvent> = {}): XpEvent {
  return { id: nextId++, kind, xp, xpAfter, units: null, achievement: null, createdAt: at(5_000), ...extra };
}
const opts = (o: Partial<{ welcome: boolean; xp: number; checkedAt: string }> = {}) => ({
  userId: "u1",
  welcome: false,
  xp: 0,
  checkedAt: CHECKED,
  ...o,
});

describe("buildToasts: the XP card", () => {
  it("is one card per render for every activity row", () => {
    const events = [ev("tasting_finished", 40, 440)];
    const { toasts, silentIds } = buildToasts(events, opts({ xp: 440 }));
    expect(toasts.map((t) => [t.kind, t.title, t.detail, t.eventIds, t.durationMs])).toEqual([
      ["xp", "+40 XP · Tasting finished", null, [events[0].id], TOAST_MS],
    ]);
    expect(silentIds).toEqual([]);
  });

  it("counts glasses and bottles", () => {
    const events = [
      ev("guess", 25, 100, { units: 15 }),
      ev("guess_match", 20, 120, { units: 1 }),
      ev("guess", 12, 132, { units: 2 }),
    ];
    expect(buildToasts(events, opts()).toasts[0].title).toBe("+57 XP · 3 glasses revealed");
    const bottles = [ev("cellar_add", 60, 60, { units: 12 })];
    expect(buildToasts(bottles, opts()).toasts[0].title).toBe("+60 XP · 12 bottles added");
  });

  it("merges two kinds, the bigger first, the second lower-cased", () => {
    const events = [ev("drink", 15, 15, { units: 1 }), ev("guess", 30, 45, { units: 20 })];
    expect(buildToasts(events, opts()).toasts[0].title).toBe("+45 XP · Glass revealed & bottle opened");
  });

  it("says '& more' past two kinds", () => {
    const events = [
      ev("note", 20, 20),
      ev("drink", 15, 35, { units: 1 }),
      ev("cellar_add", 5, 40, { units: 1 }),
    ];
    expect(buildToasts(events, opts()).toasts[0].title).toBe("+40 XP · Tasting note & more");
  });

  it("collapses into 'while you were away' once a row is older than 10 minutes", () => {
    const events = [ev("note", 20, 20, { createdAt: at(CATCH_UP_MS + 1) }), ev("drink", 15, 35, { units: 1 })];
    expect(buildToasts(events, opts()).toasts[0].title).toBe("+35 XP while you were away");
    const fresh = [ev("note", 20, 20, { createdAt: at(CATCH_UP_MS - 1) })];
    expect(buildToasts(fresh, opts()).toasts[0].title).toBe("+20 XP · Tasting note");
  });

  it("still sums a kind it has no label for", () => {
    expect(buildToasts([ev("mystery", 12, 12)], opts()).toasts[0].title).toBe("+12 XP");
  });
});

describe("buildToasts: the achievement card", () => {
  it("names one achievement", () => {
    const events = [ev("achievement", 150, 1150, { achievement: "cellar_100" })];
    const [card] = buildToasts(events, opts()).toasts;
    expect([card.kind, card.title, card.detail]).toEqual(["achievement", "Achievement · Serious cellar", "+150 XP"]);
  });

  it("merges two or more", () => {
    const events = [
      ev("achievement", 25, 25, { achievement: "first_bottle" }),
      ev("achievement", 50, 75, { achievement: "cellar_25" }),
    ];
    const [card] = buildToasts(events, opts()).toasts;
    expect([card.title, card.detail]).toEqual(["2 achievements · First bottle, Well stocked", "+75 XP"]);
  });

  it("marks a key it has no copy for silently, never renders it", () => {
    const unknown = ev("achievement", 30, 30, { achievement: "sommelier_of_the_year" });
    const { toasts, silentIds } = buildToasts([unknown], opts());
    expect(toasts.map((t) => t.kind)).toEqual([]);
    expect(silentIds).toEqual([unknown.id]);
  });
});

describe("buildToasts: the level-up card", () => {
  it("shows the highest level reached across several rows", () => {
    // 290 → 300 (level 4) → 520 (level 5)
    const events = [
      ev("guess", 10, 300),
      ev("achievement", 25, 325, { achievement: "first_tasting" }),
      ev("tasting_finished", 40, 365),
      ev("achievement", 155, 520, { achievement: "perfect_glass" }),
    ];
    const cards = buildToasts(events, opts({ xp: 520 })).toasts;
    expect(cards.map((c) => c.kind)).toEqual(["xp", "achievement", "level"]);
    const level = cards[2];
    expect([level.title, level.tone, level.eventIds]).toEqual(["Level up · You're level 5", "gold", []]);
  });

  it("is absent when the level did not change", () => {
    expect(buildToasts([ev("note", 20, 70)], opts()).toasts.map((c) => c.kind)).toEqual(["xp"]);
  });
});

describe("buildToasts: the welcome card", () => {
  it("comes first and replaces the level-up card", () => {
    const events = [ev("note", 20, 520), ev("achievement", 25, 545, { achievement: "first_note" })];
    const cards = buildToasts(events, opts({ welcome: true, xp: 545 })).toasts;
    expect(cards.map((c) => [c.kind, c.title])).toEqual([
      ["welcome", "You're level 5"],
      ["xp", "+20 XP · Tasting note"],
      ["achievement", "Achievement · First impressions"],
    ]);
    expect(cards[0]).toMatchObject({
      welcome: true,
      durationMs: WELCOME_MS,
      detail: "Levels are here — your tastings, cellar and notes so far already count.",
    });
  });

  it("invites a newcomer with no XP", () => {
    const [card] = buildToasts([], opts({ welcome: true, xp: 0 })).toasts;
    expect([card.title, card.detail]).toEqual([
      "You're level 1",
      "Levels are here — taste, cellar and note wines to earn XP.",
    ]);
  });

  it("never makes more than three cards in one batch", () => {
    const events = [
      ev("guess", 30, 480),
      ev("achievement", 100, 580, { achievement: "perfect_glass" }),
    ];
    expect(buildToasts(events, opts({ welcome: true, xp: 580 })).toasts).toHaveLength(3);
    expect(buildToasts(events, opts({ welcome: false, xp: 580 })).toasts).toHaveLength(3);
  });
});

describe("freshEvents", () => {
  it("drops rows already queued or shown in this tab", () => {
    const a = ev("note", 20, 20);
    const b = ev("note", 20, 40);
    expect(freshEvents([a, b], new Set([a.id]))).toEqual([b]);
  });
});

describe("splitXp", () => {
  it("separates the leading +N XP", () => {
    expect(splitXp("+40 XP · Tasting finished")).toEqual({ xp: "+40 XP", rest: " · Tasting finished" });
    expect(splitXp("+1,234 XP while you were away")).toEqual({ xp: "+1,234 XP", rest: " while you were away" });
    expect(splitXp("+150 XP")).toEqual({ xp: "+150 XP", rest: "" });
    expect(splitXp("Level up · You're level 4")).toBeNull();
  });
});

describe("cleanSeenIds", () => {
  it("accepts up to 100 positive integers, deduped", () => {
    expect(cleanSeenIds([3, 1, 3])).toEqual([3, 1]);
    expect(cleanSeenIds([])).toEqual([]);
    expect(cleanSeenIds(Array.from({ length: 100 }, (_, i) => i + 1))).toHaveLength(100);
  });
  it("refuses anything else", () => {
    expect(cleanSeenIds(Array.from({ length: 101 }, (_, i) => i + 1))).toBeNull();
    expect(cleanSeenIds([0])).toBeNull();
    expect(cleanSeenIds([-1])).toBeNull();
    expect(cleanSeenIds([1.5])).toBeNull();
    expect(cleanSeenIds(["1"])).toBeNull();
    expect(cleanSeenIds(null)).toBeNull();
    expect(cleanSeenIds("1,2")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels/toasts.test.ts`
Expected: FAIL — `Failed to resolve import "./toasts"`.

- [ ] **Step 3: Implement the rules**

Create `src/lib/levels/toasts.ts`:

```ts
// The pop-up rules (spec §8.1, L7, L29): one render's new ledger rows become at
// most three cards — the welcome card first, then one XP card, one achievement
// card and one level-up card — plus the validator markXpSeen runs on its
// input. Pure: relative imports only, so vitest loads it.
import { levelForXp } from "./curve";
import {
  ACHIEVEMENTS,
  WELCOME_DETAIL_EARNED,
  WELCOME_DETAIL_FRESH,
  achievementToastTitle,
  awayToastTitle,
  bonusDetail,
  isAchievementKey,
  kindLabel,
  levelUpTitle,
  welcomeTitle,
  xpToastTitle,
} from "./copy";
import type { Toast, XpEvent } from "./types";

/** How long a card stays (spec §8.1). */
export const TOAST_MS = 4000;
export const WELCOME_MS = 6000;
/** At most three cards on screen; the rest wait, oldest first. */
export const MAX_VISIBLE = 3;
/** Rows older than this (against the read's own server clock) collapse into
    "+N XP while you were away". */
export const CATCH_UP_MS = 10 * 60 * 1000;
/** markXpSeen's input limit (spec §6.2). */
export const MAX_SEEN_IDS = 100;

/** The rows no card in this tab has queued or shown yet. */
export function freshEvents(events: readonly XpEvent[], seen: ReadonlySet<number>): XpEvent[] {
  return events.filter((e) => !seen.has(e.id));
}

/** guess and guess_match share one label ("Glass revealed"). */
function labelGroup(kind: string): string {
  return kind === "guess_match" ? "guess" : kind;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** The XP card's label: one kind "{label}", two "{label1} & {label2}", more
    "{label1} & more", ordered by XP (ties: first seen). Null when no kind has
    a label. */
function xpCardLabel(events: readonly XpEvent[]): string | null {
  const groups = new Map<string, { kind: string; count: number; units: number; xp: number; first: number }>();
  events.forEach((e, index) => {
    const key = labelGroup(e.kind);
    const g = groups.get(key) ?? { kind: key, count: 0, units: 0, xp: 0, first: index };
    g.count += 1;
    g.units += e.units ?? 1;
    g.xp += e.xp;
    groups.set(key, g);
  });
  const labels = [...groups.values()]
    .sort((a, b) => b.xp - a.xp || a.first - b.first)
    .map((g) => kindLabel(g.kind, g.count, g.units))
    .filter((l): l is string => l !== null);
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} & ${lowerFirst(labels[1])}`;
  return `${labels[0]} & more`;
}

export type ToastBatch = {
  toasts: Toast[];
  /** Rows no card carries (an achievement the app has no copy for): marked
      seen without a card, so they never block the 50-row window. */
  silentIds: number[];
};

/**
 * One render's new rows as cards. `events` must already be fresh (see
 * freshEvents). With `welcome`, the welcome card comes first and the level-up
 * card is left out — "You're level N" already says it.
 */
export function buildToasts(
  events: readonly XpEvent[],
  opts: { userId: string; welcome: boolean; xp: number; checkedAt: string },
): ToastBatch {
  const toasts: Toast[] = [];
  const silentIds: number[] = [];
  const sorted = [...events].sort((a, b) => a.id - b.id);

  if (opts.welcome) {
    toasts.push({
      id: "welcome",
      userId: opts.userId,
      kind: "welcome",
      title: welcomeTitle(levelForXp(opts.xp)),
      detail: opts.xp > 0 ? WELCOME_DETAIL_EARNED : WELCOME_DETAIL_FRESH,
      eventIds: [],
      welcome: true,
      durationMs: WELCOME_MS,
      tone: "plain",
    });
  }

  const activity = sorted.filter((e) => e.kind !== "achievement");
  if (activity.length > 0) {
    const sum = activity.reduce((s, e) => s + e.xp, 0);
    const checked = Date.parse(opts.checkedAt);
    const away =
      Number.isFinite(checked) &&
      activity.some((e) => {
        const at = Date.parse(e.createdAt);
        return Number.isFinite(at) && at < checked - CATCH_UP_MS;
      });
    toasts.push({
      id: `xp:${activity.map((e) => e.id).join(",")}`,
      userId: opts.userId,
      kind: "xp",
      title: away ? awayToastTitle(sum) : xpToastTitle(sum, xpCardLabel(activity)),
      detail: null,
      eventIds: activity.map((e) => e.id),
      welcome: false,
      durationMs: TOAST_MS,
      tone: "plain",
    });
  }

  const achievements = sorted.filter((e) => e.kind === "achievement");
  const named = achievements.filter((e) => isAchievementKey(e.achievement));
  if (named.length > 0) {
    toasts.push({
      id: `achievement:${achievements.map((e) => e.id).join(",")}`,
      userId: opts.userId,
      kind: "achievement",
      title: achievementToastTitle(
        named.map((e) => ACHIEVEMENTS[e.achievement as keyof typeof ACHIEVEMENTS].name),
      ),
      detail: bonusDetail(named.reduce((s, e) => s + e.xp, 0)),
      eventIds: achievements.map((e) => e.id),
      welcome: false,
      durationMs: TOAST_MS,
      tone: "plain",
    });
  } else {
    silentIds.push(...achievements.map((e) => e.id));
  }

  if (!opts.welcome && sorted.length > 0) {
    const byTotal = [...sorted].sort((a, b) => a.xpAfter - b.xpAfter || a.id - b.id);
    const first = byTotal[0];
    const last = byTotal[byTotal.length - 1];
    const before = levelForXp(first.xpAfter - first.xp);
    const after = levelForXp(last.xpAfter);
    if (after > before) {
      toasts.push({
        id: `level:${after}`,
        userId: opts.userId,
        kind: "level",
        title: levelUpTitle(after),
        detail: null,
        eventIds: [],
        welcome: false,
        durationMs: TOAST_MS,
        tone: "gold",
      });
    }
  }

  return { toasts, silentIds };
}

/** A card line's leading "+N XP", drawn in text-gold-dark (spec §8.1), and
    the rest; null when the line does not start with one. */
export function splitXp(text: string): { xp: string; rest: string } | null {
  const m = /^(\+[\d,]+ XP)(.*)$/.exec(text);
  return m ? { xp: m[1], rest: m[2] } : null;
}

/** markXpSeen's input: at most 100 positive integers. Anything else is null —
    the action then does nothing. */
export function cleanSeenIds(ids: unknown): number[] | null {
  if (!Array.isArray(ids) || ids.length > MAX_SEEN_IDS) return null;
  if (!ids.every((id) => typeof id === "number" && Number.isSafeInteger(id) && id > 0)) return null;
  return [...new Set(ids as number[])];
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels/toasts.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Write the failing store test**

Create `src/lib/levels/level-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createLevelStore } from "./level-store";
import type { LevelSnapshot, XpEvent } from "./types";

const CHECKED = "2026-09-27T12:00:00.000Z";

let nextId = 100;
function ev(kind: string, xp: number, xpAfter: number, extra: Partial<XpEvent> = {}): XpEvent {
  return {
    id: nextId++,
    kind,
    xp,
    xpAfter,
    units: null,
    achievement: null,
    createdAt: "2026-09-27T11:59:00.000Z",
    ...extra,
  };
}
function snap(userId: string, xp: number, unseen: XpEvent[] = [], welcome = false): LevelSnapshot {
  return { userId, xp, level: Math.max(1, Math.floor(xp / 100)), welcome, checkedAt: CHECKED, unseen };
}

describe("level store: levels", () => {
  it("is keyed by user", () => {
    const s = createLevelStore();
    s.publish(snap("a", 120));
    s.publish(snap("b", 900));
    expect(s.getLevel("a")).toEqual({ xp: 120, level: 1 });
    expect(s.getLevel("b")).toEqual({ xp: 900, level: 9 });
    expect(s.getLevel("c")).toBeNull();
  });

  it("keeps the highest XP, and the same object while nothing grows", () => {
    const s = createLevelStore();
    s.publish(snap("a", 500));
    const first = s.getLevel("a");
    s.publish(snap("a", 300)); // an older render arriving late
    expect(s.getLevel("a")).toBe(first);
    s.publish(snap("a", 700));
    expect(s.getLevel("a")).toEqual({ xp: 700, level: 7 });
  });
});

describe("level store: cards", () => {
  it("dedupes ids across renders", () => {
    const s = createLevelStore();
    const note = ev("note", 20, 20);
    s.publish(snap("a", 20, [note]));
    s.publish(snap("a", 20, [note]));
    expect(s.getView().visible.map((t) => t.eventIds)).toEqual([[note.id]]);
  });

  it("queues the welcome card once per tab", () => {
    const s = createLevelStore();
    s.publish(snap("a", 0, [], true));
    s.publish(snap("a", 0, [], true));
    expect(s.getView().visible.map((t) => t.kind)).toEqual(["welcome"]);
  });

  it("shows at most three and promotes the rest as cards leave", () => {
    const s = createLevelStore();
    s.publish(snap("a", 20, [ev("note", 20, 20)], true)); // welcome + xp
    s.publish(snap("a", 45, [ev("achievement", 25, 45, { achievement: "first_note" })])); // achievement
    s.publish(snap("a", 60, [ev("drink", 15, 60, { units: 1 })])); // queued: over the limit
    expect(s.getView().visible.map((t) => t.kind)).toEqual(["welcome", "xp", "achievement"]);
    const welcomeId = s.getView().visible[0].id;
    s.dismiss(welcomeId);
    expect(s.getView().visible[0].leaving).toBe(true);
    s.remove(welcomeId);
    expect(s.getView().visible.map((t) => t.title)).toEqual([
      "+20 XP · Tasting note",
      "Achievement · First impressions",
      "+15 XP · Bottle opened",
    ]);
  });

  it("holds cards while the tab is hidden", () => {
    const s = createLevelStore();
    s.setActive(false);
    s.publish(snap("a", 20, [ev("note", 20, 20)]));
    expect(s.getView().visible).toEqual([]);
    s.setActive(true);
    expect(s.getView().visible.map((t) => t.kind)).toEqual(["xp"]);
    expect(s.getView().announcement).toBe("+20 XP · Tasting note");
  });

  it("announces a card's title and detail once it appears", () => {
    const s = createLevelStore();
    s.publish(snap("a", 150, [ev("achievement", 150, 150, { achievement: "cellar_100" })]));
    expect(s.getView().announcement).toBe("Achievement · Serious cellar. +150 XP. Level up · You're level 3");
  });

  it("drops a waiting card another tab already showed", () => {
    const s = createLevelStore();
    s.setActive(false);
    const note = ev("note", 20, 20);
    s.publish(snap("a", 20, [note], true));
    s.markShownElsewhere("a", [note.id], true);
    s.setActive(true);
    expect(s.getView().visible).toEqual([]);
  });

  it("keeps a waiting card another tab showed only part of", () => {
    const s = createLevelStore();
    s.setActive(false);
    const a = ev("note", 20, 20);
    const b = ev("note", 20, 40);
    s.publish(snap("a", 40, [a, b]));
    s.markShownElsewhere("a", [a.id], false);
    s.setActive(true);
    expect(s.getView().visible.map((t) => t.eventIds)).toEqual([[a.id, b.id]]);
  });

  it("forgets the other person's cards when the signed-in user changes", () => {
    const s = createLevelStore();
    s.publish(snap("a", 20, [ev("note", 20, 20)]));
    s.publish(snap("b", 0));
    expect(s.getView().userId).toBe("b");
    expect(s.getView().visible).toEqual([]);
  });

  it("hands over rows no card carries, then forgets them", () => {
    const s = createLevelStore();
    const unknown = ev("achievement", 30, 30, { achievement: "sommelier_of_the_year" });
    s.publish(snap("a", 30, [unknown]));
    expect(s.getView().silent).toEqual([unknown.id]);
    s.clearSilent([unknown.id]);
    expect(s.getView().silent).toEqual([]);
  });

  it("replaces the view object on every change and only then", () => {
    const s = createLevelStore();
    const before = s.getView();
    expect(s.getView()).toBe(before);
    s.publish(snap("a", 20, [ev("note", 20, 20)]));
    expect(s.getView()).not.toBe(before);
    const after = s.getView();
    s.dismiss("no-such-card");
    expect(s.getView()).toBe(after);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels/level-store.test.ts`
Expected: FAIL — `Failed to resolve import "./level-store"`.

- [ ] **Step 7: Implement the store**

Create `src/lib/levels/level-store.ts`. Every change replaces the view object (a `useSyncExternalStore` snapshot must be stable until something changed), and `getLevel` returns the same object until the XP grows:

```ts
// The tab's one level store (spec §8.1, L28). AppHeader's <AwardsFeed>
// publishes every render's snapshot here; the one <AwardsToaster> in AppShell
// and the viewer's own rings read it through useSyncExternalStore. Keyed by
// user id: a sign-out and sign-in in the same tab is a soft navigation, so this
// module outlives it. Every change replaces the view object, so a
// useSyncExternalStore snapshot is stable until something changed.
// Pure: relative imports only, no React, no browser globals.
import { MAX_VISIBLE, buildToasts, freshEvents } from "./toasts";
import type { LevelSnapshot, OwnLevel, Toast } from "./types";

export type ShownToast = Toast & { leaving: boolean };

export type ToasterView = {
  userId: string | null;
  /** On screen, oldest first (newest at the bottom), at most MAX_VISIBLE. */
  visible: readonly ShownToast[];
  /** The text the polite live region reads: the cards that last appeared. */
  announcement: string;
  /** Rows to mark seen without a card (toasts.ts's silentIds). */
  silent: readonly number[];
};

type UserState = {
  /** The newest level seen: the highest XP (XP never goes down). */
  level: OwnLevel | null;
  /** Every ledger id queued or shown in this tab, or reported shown by another. */
  shownIds: Set<number>;
  /** The welcome card was queued (or shown elsewhere) in this tab. */
  welcomeDone: boolean;
};

export const EMPTY_VIEW: ToasterView = { userId: null, visible: [], announcement: "", silent: [] };

export type LevelStore = ReturnType<typeof createLevelStore>;

export function createLevelStore() {
  const users = new Map<string, UserState>();
  const listeners = new Set<() => void>();
  let current: string | null = null;
  let queued: Toast[] = [];
  let visible: ShownToast[] = [];
  let silent: number[] = [];
  let announcement = "";
  let active = true;
  let view: ToasterView = EMPTY_VIEW;

  function userState(userId: string): UserState {
    let s = users.get(userId);
    if (!s) {
      s = { level: null, shownIds: new Set(), welcomeDone: false };
      users.set(userId, s);
    }
    return s;
  }

  function emit() {
    view = { userId: current, visible: [...visible], announcement, silent: [...silent] };
    for (const l of listeners) l();
  }

  /** Moves waiting cards on screen while the tab is visible. */
  function promote(): boolean {
    if (!active) return false;
    const appeared: ShownToast[] = [];
    while (visible.length < MAX_VISIBLE && queued.length > 0) {
      const next = { ...(queued.shift() as Toast), leaving: false };
      visible.push(next);
      appeared.push(next);
    }
    if (appeared.length === 0) return false;
    announcement = appeared.map((t) => (t.detail ? `${t.title}. ${t.detail}` : t.title)).join(". ");
    return true;
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getView(): ToasterView {
      return view;
    },

    /** The viewer's newest level, or null before any snapshot arrived. */
    getLevel(userId: string): OwnLevel | null {
      return users.get(userId)?.level ?? null;
    },

    /** Merges one render's snapshot: the level (highest XP wins), the rows no
        card carried yet, and the welcome card once per tab. */
    publish(snapshot: LevelSnapshot): void {
      const s = userState(snapshot.userId);
      if (current !== snapshot.userId) {
        current = snapshot.userId;
        queued = [];
        visible = [];
        silent = [];
        announcement = "";
      }
      if (!s.level || snapshot.xp > s.level.xp) {
        s.level = { xp: snapshot.xp, level: snapshot.level };
      }
      const fresh = freshEvents(snapshot.unseen, s.shownIds);
      for (const e of fresh) s.shownIds.add(e.id);
      const welcome = snapshot.welcome && !s.welcomeDone;
      if (welcome) s.welcomeDone = true;
      if (fresh.length > 0 || welcome) {
        const batch = buildToasts(fresh, {
          userId: snapshot.userId,
          welcome,
          xp: snapshot.xp,
          checkedAt: snapshot.checkedAt,
        });
        queued.push(...batch.toasts);
        silent.push(...batch.silentIds);
      }
      promote();
      emit();
    },

    /** The tab became visible (true) or hidden (false). Hidden: nothing new shows. */
    setActive(isVisible: boolean): void {
      if (active === isVisible) return;
      active = isVisible;
      promote();
      emit();
    },

    /** Starts a card's exit (a 150 ms fade); `remove` takes it off screen. */
    dismiss(toastId: string): void {
      if (!visible.some((t) => t.id === toastId && !t.leaving)) return;
      visible = visible.map((t) => (t.id === toastId ? { ...t, leaving: true } : t));
      emit();
    },

    remove(toastId: string): void {
      const before = visible.length;
      visible = visible.filter((t) => t.id !== toastId);
      if (visible.length === before) return;
      promote();
      emit();
    },

    /** The toaster marked these silent rows seen. */
    clearSilent(ids: readonly number[]): void {
      const done = new Set(ids);
      const next = silent.filter((id) => !done.has(id));
      if (next.length === silent.length) return;
      silent = next;
      emit();
    },

    /** Another tab showed these rows (BroadcastChannel): never repeat them here. */
    markShownElsewhere(userId: string, ids: readonly number[], welcome: boolean): void {
      const s = userState(userId);
      for (const id of ids) s.shownIds.add(id);
      if (welcome) s.welcomeDone = true;
      if (userId !== current) return;
      // Only a waiting card whose rows the other tab showed, all of them —
      // never one this tab grouped differently (a duplicate is harmless, R12).
      const incoming = new Set(ids);
      const before = queued.length;
      queued = queued.filter(
        (t) =>
          !(t.welcome && welcome) &&
          !(t.eventIds.length > 0 && t.eventIds.every((id) => incoming.has(id))),
      );
      if (queued.length !== before) emit();
    },
  };
}

/** The tab's store. */
export const levelStore = createLevelStore();
```

- [ ] **Step 8: Run it to verify it passes, then the gates**

- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels` → 5 files, 55 tests passed.
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx tsc --noEmit`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx eslint src/lib/levels`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run` → 217 files, 4,193 tests passed.

- [ ] **Step 9: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-mapdetail && git add src/lib/levels/toasts.ts src/lib/levels/toasts.test.ts src/lib/levels/level-store.ts src/lib/levels/level-store.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(levels): the pop-up rules and the tab's level store" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Probe P1 (MAIN SESSION) — before Task 4 starts

Spec §9/§10.3's first check. Everything from Task 4 on assumes that an AppHeader rendered by a **section layout** (`/cellar`, `/catalog`, `/community`, `/tastings`, `/admin`) re-renders after (a) `router.refresh()` and (b) a server action that calls `revalidatePath`. Next 16's docs say both re-render the current route server-side (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, "A single response carries data and UI"), and the client applies a server action's payload as a root render; the probe confirms it on the real app before the toaster builds on it. It needs no code from this plan: AppHeader already passes `ActiveTastingBanner` an `initial` snapshot stamped with a server-clock `checkedAt`, and a client component's props travel in the RSC payload — so a response that re-rendered AppHeader carries a new `"checkedAt"`.

Run it on production (`https://blindrapp.vercel.app`), Browser pane **fronted** (a hidden pane never hydrates), signed in as a seeded demo person via a magic-link session (`mint.mjs`, never a typed password). Keep each production-touching command single-purpose.

1. **router.refresh() in a section layout (read-only).** Open `/cellar`. Read the page's first `checkedAt` with `javascript_tool`: `document.documentElement.innerHTML.match(/checkedAt\\?":\\?"([^"\\]+)/)?.[1]`. Call `window.next.router.refresh()` with `javascript_tool` (Next 16 exposes the app router there in production, `app-router-instance.js`). With `read_network_requests` (filter `/cellar`), open the RSC response of that refresh and search it for `checkedAt`. **Pass:** present, and later than the first value.
2. **A revalidating server action in a section layout (writes a request, then removes it).** Open `/community`. On another seeded demo person's row tap "Add friend" (`sendFriendRequest` → `revalidatePath("/community")`); find the POST to `/community` in `read_network_requests` and search its response for `checkedAt`. **Pass:** present and later than the page's first value. Undo it on the same row: "Requested" → "Tap again to cancel" (`cancelFriendRequest`, also revalidating — a second sample).

**If both pass:** proceed with Tasks 4–9 as written (the spec's design, L28).

**If either fails** (the response carries no `checkedAt`, or only the old one), take **Fallback F1** — the smallest change that keeps L7's "no always-on poller": the toaster reads the state itself on every navigation and on returning to the tab, through a read-only server action. Apply it as part of Task 5 (after Task 5's Step 3), and add R8 to the residuals in the Task 9 CLAUDE.md bullet ("inside a section layout, an award the viewer causes shows on their next navigation or tab return").

F1a — append to `src/lib/levels/actions.ts` (and add `import { readLevelSnapshot } from "./read";` and `import type { LevelSnapshot } from "./types";` to its imports; it stays async-only):

```ts
// Fallback F1 (plan, Probe P1): the toaster's own read, for when a section
// layout's AppHeader does not re-render after a revalidating action or
// router.refresh(). Read-only; never revalidates.
export async function readMyLevelState(): Promise<LevelSnapshot | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return readLevelSnapshot(supabase, user.id);
}
```

F1b — in `src/components/levels/awards-toaster.tsx`, import `usePathname` from `next/navigation` and `readMyLevelState` beside `markXpSeen`, and add this effect as the first effect of `AwardsToaster`:

```tsx
  // Fallback F1: re-read on every navigation and on returning to the tab.
  const pathname = usePathname();
  useEffect(() => {
    let alive = true;
    const read = () => {
      readMyLevelState()
        .then((s) => {
          if (alive && s) levelStore.publish(s);
        })
        .catch(() => {});
    };
    read();
    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);
```

F1 was compiled (`tsc`) and linted in a scratch copy of this branch.

---

### Task 4: The read paths, markXpSeen and AppHeader's feed

**Files:**
- Create: `src/lib/levels/snapshot.test.ts`, `src/lib/levels/snapshot.ts`
- Create: `src/lib/levels/read.ts`
- Create: `src/lib/levels/actions.ts`
- Create: `src/components/levels/awards-feed.tsx`
- Modify: `src/components/app-header.tsx` (imports, the `Promise.all`, one render line)

**Interfaces:**
- Consumes: Task 1's RPCs and table types; Task 2's `ACHIEVEMENTS`, `ACHIEVEMENT_KEYS`, `isAchievementKey` and types; Task 3's `cleanSeenIds` and `levelStore`.
- Produces:
  - `snapshot.ts`: `parseLevelSnapshot(raw: unknown, userId: string): LevelSnapshot | null`, `ownLevelFromRow(row: { xp: number; level: number } | null | undefined): OwnLevel`, `levelsById(ids: readonly string[], rows): Map<string, number>`, `type ProgressRow`, `type EarnedRow`, `ownProfileLevel(level: OwnLevel, rows: readonly ProgressRow[]): ProfileLevel`, `otherProfileLevel(level: OwnLevel, rows: readonly EarnedRow[]): ProfileLevel`.
  - `read.ts` (server-only; every reader returns null / an empty map on error): `readLevelSnapshot(supabase, userId): Promise<LevelSnapshot | null>`, `readOwnLevel(supabase, userId): Promise<OwnLevel | null>`, `readLevels(supabase, ids: string[]): Promise<Map<string, number>>`, `readProfileLevel(supabase, profileId, isOwn): Promise<ProfileLevel | null>` — `supabase` is `SupabaseClient<Database>`.
  - `actions.ts` ("use server"): `markXpSeen(ids: number[], welcome: boolean): Promise<void>` — validates through `cleanSeenIds`, calls `mark_xp_seen`, never revalidates.
  - `awards-feed.tsx` (client): `AwardsFeed({ snapshot }: { snapshot: LevelSnapshot | null })` — renders null, publishes to `levelStore`.
  - AppHeader: a `levelSnapshot` const (`LevelSnapshot | null`) in scope for Task 6's MobileNav edit.

- [ ] **Step 1: Write the failing parsing test**

Create `src/lib/levels/snapshot.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels/snapshot.test.ts`
Expected: FAIL — `Failed to resolve import "./snapshot"`.

- [ ] **Step 3: Implement the parsers**

Create `src/lib/levels/snapshot.ts`:

```ts
// The server reads' raw rows as the app's types (spec §6): get_my_level_state's
// jsonb, profile_levels rows, get_my_achievement_progress rows and
// profile_achievements rows. Every parser drops what it cannot read instead of
// throwing — a malformed row never breaks a page — and skips an achievement key
// the app has no copy for (spec §8.4). Pure: relative imports only.
import { ACHIEVEMENTS, ACHIEVEMENT_KEYS, isAchievementKey } from "./copy";
import type {
  EarnedAchievement,
  LevelSnapshot,
  LockedAchievement,
  OwnLevel,
  ProfileLevel,
  XpEvent,
} from "./types";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) ? v : null;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function parseEvent(raw: unknown): XpEvent | null {
  if (!isObj(raw)) return null;
  const id = int(raw.id);
  const kind = str(raw.kind);
  const xp = int(raw.xp);
  const xpAfter = int(raw.xp_after);
  const createdAt = str(raw.created_at);
  if (id === null || kind === null || xp === null || xpAfter === null || createdAt === null) return null;
  return {
    id,
    kind,
    xp,
    xpAfter,
    units: int(raw.units),
    achievement: str(raw.achievement),
    createdAt,
  };
}

/** get_my_level_state's jsonb. Null when the shape is not the documented one. */
export function parseLevelSnapshot(raw: unknown, userId: string): LevelSnapshot | null {
  if (!isObj(raw)) return null;
  const xp = int(raw.xp);
  const level = int(raw.level);
  const checkedAt = str(raw.checked_at);
  if (xp === null || level === null || checkedAt === null || !Array.isArray(raw.unseen)) return null;
  return {
    userId,
    xp,
    level,
    welcome: raw.welcome === true,
    checkedAt,
    unseen: raw.unseen.flatMap((e) => parseEvent(e) ?? []),
  };
}

/** A profile_levels row ({ xp, level }); a missing row is level 1 with 0 XP. */
export function ownLevelFromRow(row: { xp: number; level: number } | null | undefined): OwnLevel {
  return row ? { xp: row.xp, level: row.level } : { xp: 0, level: 1 };
}

/** /community's batched read: user id → level; someone with no row is level 1. */
export function levelsById(
  ids: readonly string[],
  rows: readonly { user_id: string; level: number }[] | null | undefined,
): Map<string, number> {
  const found = new Map((rows ?? []).map((r) => [r.user_id, r.level] as const));
  return new Map(ids.map((id) => [id, found.get(id) ?? 1] as const));
}

const order = (key: string) => ACHIEVEMENT_KEYS.indexOf(key as (typeof ACHIEVEMENT_KEYS)[number]);

export type ProgressRow = {
  key: string;
  bonus_xp: number;
  target: number;
  progress: number;
  unlocked_at: string | null;
  backfill: boolean;
};

export type EarnedRow = { achievement_key: string; unlocked_at: string; backfill: boolean };

/** Your own profile: get_my_achievement_progress's rows, split into earned and
    not yet, in the copy's order. */
export function ownProfileLevel(level: OwnLevel, rows: readonly ProgressRow[]): ProfileLevel {
  const known = rows.filter((r) => isAchievementKey(r.key)).sort((a, b) => order(a.key) - order(b.key));
  const earned: EarnedAchievement[] = [];
  const locked: LockedAchievement[] = [];
  for (const r of known) {
    const key = r.key as EarnedAchievement["key"];
    if (r.unlocked_at) {
      earned.push({ key, category: ACHIEVEMENTS[key].category, unlockedAt: r.unlocked_at, backfill: r.backfill });
    } else {
      locked.push({
        key,
        category: ACHIEVEMENTS[key].category,
        progress: Math.max(0, Math.min(r.progress, r.target)),
        target: r.target,
        bonusXp: r.bonus_xp,
      });
    }
  }
  return { ...level, earned, locked };
}

/** Someone else's profile: the profile_achievements rows RLS lets the viewer
    read (a hidden cellar's are simply absent), in the copy's order. */
export function otherProfileLevel(level: OwnLevel, rows: readonly EarnedRow[]): ProfileLevel {
  const earned = rows
    .filter((r) => isAchievementKey(r.achievement_key))
    .sort((a, b) => order(a.achievement_key) - order(b.achievement_key))
    .map((r) => {
      const key = r.achievement_key as EarnedAchievement["key"];
      return { key, category: ACHIEVEMENTS[key].category, unlockedAt: r.unlocked_at, backfill: r.backfill };
    });
  return { ...level, earned, locked: null };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels/snapshot.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: The server reads**

Create `src/lib/levels/read.ts`:

```ts
// The server's level reads (spec §6.2, L23, L28). A server-only module, not a
// "use server" one: AppHeader, AppShell, /community and /u/[id] call these
// during render. Every reader returns null (or an empty map) on any error —
// a failed level read never breaks a page; the feed then publishes nothing and
// the rings fall back to the bare avatar. Parsing lives in ./snapshot (pure,
// vitest-covered).
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  levelsById,
  otherProfileLevel,
  ownLevelFromRow,
  ownProfileLevel,
  parseLevelSnapshot,
} from "./snapshot";
import type { LevelSnapshot, OwnLevel, ProfileLevel } from "./types";

type Client = SupabaseClient<Database>;

/** AppHeader: the viewer's level and unseen awards, one RPC per render. */
export async function readLevelSnapshot(supabase: Client, userId: string): Promise<LevelSnapshot | null> {
  const { data, error } = await supabase.rpc("get_my_level_state");
  if (error) {
    console.error("[levels] get_my_level_state failed", error.code, error.message);
    return null;
  }
  return parseLevelSnapshot(data, userId);
}

/** AppShell: the sidebar ring's first paint. */
export async function readOwnLevel(supabase: Client, userId: string): Promise<OwnLevel | null> {
  const { data, error } = await supabase
    .from("profile_levels")
    .select("xp, level")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[levels] profile_levels read failed", error.code, error.message);
    return null;
  }
  return ownLevelFromRow(data);
}

/** /community: one batched read for the listed people; missing = level 1. */
export async function readLevels(supabase: Client, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("profile_levels").select("user_id, level").in("user_id", ids);
  if (error) {
    console.error("[levels] profile_levels batch read failed", error.code, error.message);
  }
  return levelsById(ids, error ? [] : data);
}

/** /u/[id]'s card: the level, and either your own progress (every active
    achievement) or the achievements RLS lets you read of someone else's. */
export async function readProfileLevel(
  supabase: Client,
  profileId: string,
  isOwn: boolean,
): Promise<ProfileLevel | null> {
  const [levelResult, achievementsResult] = await Promise.all([
    supabase.from("profile_levels").select("xp, level").eq("user_id", profileId).maybeSingle(),
    isOwn
      ? supabase.rpc("get_my_achievement_progress")
      : supabase
          .from("profile_achievements")
          .select("achievement_key, unlocked_at, backfill")
          .eq("user_id", profileId),
  ]);
  if (levelResult.error || achievementsResult.error) {
    const e = levelResult.error ?? achievementsResult.error;
    console.error("[levels] profile level read failed", e?.code, e?.message);
    return null;
  }
  const level = ownLevelFromRow(levelResult.data);
  if (isOwn) {
    const rows = (achievementsResult.data ?? []) as Database["public"]["Functions"]["get_my_achievement_progress"]["Returns"];
    return ownProfileLevel(level, rows);
  }
  const rows = (achievementsResult.data ?? []) as {
    achievement_key: string;
    unlocked_at: string;
    backfill: boolean;
  }[];
  return otherProfileLevel(level, rows);
}
```

- [ ] **Step 6: The one action**

Create `src/lib/levels/actions.ts`:

```ts
"use server";

// The toaster's one write (spec §6.2, L7, L28): marks the ledger rows a card
// showed as seen, and clears the welcome. It never revalidates and never
// refreshes — the rows are already on screen. Only this async function is
// exported (a "use server" file's every export becomes an action); its types
// live in ./types.
import { createClient } from "@/lib/supabase/server";
import { cleanSeenIds } from "./toasts";

export async function markXpSeen(ids: number[], welcome: boolean): Promise<void> {
  const clean = cleanSeenIds(ids);
  if (clean === null) return;
  if (clean.length === 0 && welcome !== true) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_xp_seen", { p_ids: clean, p_welcome: welcome === true });
  if (error) console.error("[levels] mark_xp_seen failed", error.code, error.message);
}
```

Check the "use server" rule: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && grep -n "^export" src/lib/levels/actions.ts` → exactly one line, `export async function markXpSeen(…`.

- [ ] **Step 7: The feed**

Create `src/components/levels/awards-feed.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { levelStore } from "@/lib/levels/level-store";
import type { LevelSnapshot } from "@/lib/levels/types";

/**
 * Rendered by AppHeader with that render's level snapshot (spec §8.1, L28).
 * It draws nothing: it hands the snapshot to the tab's level store, which the
 * one AwardsToaster (in AppShell) and the viewer's own rings read. Every
 * server render of an AppHeader — a navigation, a revalidating action, a
 * router.refresh(), RevealSync, AutoRefresh — brings a new snapshot; the store
 * ignores rows it has already queued or shown.
 */
export function AwardsFeed({ snapshot }: { snapshot: LevelSnapshot | null }) {
  useEffect(() => {
    if (snapshot) levelStore.publish(snapshot);
  }, [snapshot]);
  return null;
}
```

- [ ] **Step 8: Wire AppHeader**

In `src/components/app-header.tsx`:

(a) after `import { EMPTY_SNAPSHOT } from "@/lib/active-tasting/select";` add:

```tsx
import { AwardsFeed } from "@/components/levels/awards-feed";
import { readLevelSnapshot } from "@/lib/levels/read";
```

(b) replace

```tsx
  // In parallel, so the strip costs no extra latency. A failed read renders
  // the epoch-stamped empty snapshot, which any later poll replaces (D13).
  const [notifications, active] = await Promise.all([
    getPendingInvites(),
    readActiveTastings(userId),
  ]);
```

with

```tsx
  // In parallel, so the strip costs no extra latency. A failed read renders
  // the epoch-stamped empty snapshot, which any later poll replaces (D13).
  // The level snapshot (levels spec §6.2, L28) rides the same Promise.all:
  // null on any error, and the feed then publishes nothing.
  const [notifications, active, levelSnapshot] = await Promise.all([
    getPendingInvites(),
    readActiveTastings(userId),
    readLevelSnapshot(supabase, userId),
  ]);
```

(c) replace

```tsx
      <ActiveTastingBanner initial={active ?? EMPTY_SNAPSHOT} />
    </>
```

with

```tsx
      <ActiveTastingBanner initial={active ?? EMPTY_SNAPSHOT} />
      {/* Draws nothing: hands this render's level snapshot to the tab's
          store, which AppShell's AwardsToaster and the rings read (L28). */}
      <AwardsFeed snapshot={levelSnapshot} />
    </>
```

- [ ] **Step 9: Gates**

- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx tsc --noEmit`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx eslint src/lib/levels src/components/levels src/components/app-header.tsx`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run` → 218 files, 4,199 tests passed.

- [ ] **Step 10: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-mapdetail && git add src/lib/levels/snapshot.ts src/lib/levels/snapshot.test.ts src/lib/levels/read.ts src/lib/levels/actions.ts src/components/levels/awards-feed.tsx src/components/app-header.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(levels): level reads, markXpSeen and AppHeader's award feed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The award toaster

**Files:**
- Create: `src/components/levels/awards-toaster.test.tsx`, `src/components/levels/awards-toaster.tsx`
- Modify: `src/components/app-shell.tsx` (one import, one mount)

**Interfaces:**
- Consumes: `levelStore`, `EMPTY_VIEW`, `ShownToast` (Task 3); `splitXp` (Task 3); `markXpSeen` (Task 4).
- Produces: `AwardsToaster({ userId }: { userId: string })` (client), mounted once in AppShell. BroadcastChannel name `blindr-awards`, message `{ userId: string; ids: number[]; welcome: boolean }`.

- [ ] **Step 1: Write the failing first-paint test**

Create `src/components/levels/awards-toaster.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AwardsToaster } from "./awards-toaster";

// The server render (and the first client render, before AwardsFeed publishes)
// is the empty view: the polite live region exists before any card text
// arrives, and the card stack never blocks the page beneath it.
describe("AwardsToaster first paint", () => {
  it("renders an empty polite status region and no card", () => {
    const html = renderToStaticMarkup(<AwardsToaster userId="u1" />);
    expect(html).toContain('<div role="status" aria-live="polite" class="sr-only"></div>');
    expect(html).not.toContain("XP");
  });
  it("stacks cards in a fixed, click-through corner above the sheets", () => {
    const html = renderToStaticMarkup(<AwardsToaster userId="u1" />);
    expect(html).toMatch(/class="pointer-events-none fixed z-\[60\] flex flex-col gap-2 [^"]*md:right-4 md:bottom-4 md:w-80"/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/components/levels/awards-toaster.test.tsx`
Expected: FAIL — `Failed to resolve import "./awards-toaster"`.

- [ ] **Step 3: Implement the toaster**

Create `src/components/levels/awards-toaster.tsx`. No state is set inside an effect (react-hooks/set-state-in-effect): the effects only call the store, the timers call the store, and `paused` changes in event handlers.

```tsx
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronsUp, Sparkles, Trophy } from "lucide-react";
import { markXpSeen } from "@/lib/levels/actions";
import { EMPTY_VIEW, levelStore, type ShownToast } from "@/lib/levels/level-store";
import { splitXp } from "@/lib/levels/toasts";
import { cn } from "@/lib/utils";

/** Another tab's shown ids arrive here, so a card never repeats across tabs. */
const CHANNEL = "blindr-awards";
/** The exit fade before a dismissed card leaves the DOM. */
const EXIT_MS = 150;

type ChannelMessage = { userId: string; ids: number[]; welcome: boolean };

function parseMessage(data: unknown): ChannelMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.userId !== "string" || !Array.isArray(d.ids)) return null;
  return {
    userId: d.userId,
    ids: d.ids.filter((id): id is number => typeof id === "number"),
    welcome: d.welcome === true,
  };
}

/**
 * The small award cards in a bottom corner (spec §8.1, L7, L29), mounted once
 * in AppShell. It reads the tab's level store (AppHeader's AwardsFeed fills
 * it), shows at most three cards, holds them while the tab is hidden, and
 * marks each card's rows seen the first time it shows (markXpSeen, which never
 * revalidates). One polite live region reads each card once; the cards are not
 * focusable. No poller.
 */
export function AwardsToaster({ userId }: { userId: string }) {
  const view = useSyncExternalStore(levelStore.subscribe, levelStore.getView, () => EMPTY_VIEW);
  const marked = useRef(new Set<string>());
  const channel = useRef<BroadcastChannel | null>(null);

  // The store starts hidden (level-store.ts): AwardsFeed publishes earlier in
  // this same commit, so this first sync is what lets a visible tab show the
  // cards that queued before it. Unmounting hands the store back to "unknown".
  useEffect(() => {
    const sync = () => levelStore.setActive(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      levelStore.setActive(false);
    };
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    ch.onmessage = (event: MessageEvent) => {
      const m = parseMessage(event.data);
      if (m) levelStore.markShownElsewhere(m.userId, m.ids, m.welcome);
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, []);

  useEffect(() => {
    for (const card of view.visible) {
      if (marked.current.has(card.id)) continue;
      marked.current.add(card.id);
      if (card.eventIds.length === 0 && !card.welcome) continue;
      // A failure keeps the ids in this tab's shown set: no repeat here; a
      // later render may show them in another tab (spec §8.1).
      markXpSeen(card.eventIds, card.welcome).catch(() => {});
      const message: ChannelMessage = { userId: card.userId, ids: card.eventIds, welcome: card.welcome };
      channel.current?.postMessage(message);
    }
    if (view.silent.length > 0) {
      const ids = [...view.silent];
      levelStore.clearSilent(ids);
      markXpSeen(ids, false).catch(() => {});
    }
  }, [view]);

  const mine = view.userId === userId;
  return (
    <>
      {/* Keyed child: a card whose text repeats the last one is still read. */}
      <div role="status" aria-live="polite" className="sr-only">
        {mine && view.announcement ? <span key={view.announcementKey}>{view.announcement}</span> : null}
      </div>
      <div className="pointer-events-none fixed z-[60] flex flex-col gap-2 max-md:inset-x-3 max-md:bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:right-4 md:bottom-4 md:w-80">
        {mine ? view.visible.map((card) => <ToastCard key={card.id} card={card} />) : null}
      </div>
    </>
  );
}

const ICONS = { welcome: Sparkles, xp: Sparkles, achievement: Trophy, level: ChevronsUp } as const;

/** One card: 4 s (the welcome 6 s), paused while hovered, dismissed on click. */
function ToastCard({ card }: { card: ShownToast }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (card.leaving) {
      const t = window.setTimeout(() => levelStore.remove(card.id), EXIT_MS);
      return () => window.clearTimeout(t);
    }
    if (paused) return;
    const t = window.setTimeout(() => levelStore.dismiss(card.id), card.durationMs);
    return () => window.clearTimeout(t);
  }, [card.id, card.leaving, card.durationMs, paused]);

  const Icon = ICONS[card.kind];
  const gold = card.tone === "gold";
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onClick={() => levelStore.dismiss(card.id)}
      className={cn(
        "pointer-events-auto flex cursor-default items-start gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-lg",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:transition-opacity motion-safe:duration-150",
        gold ? "border-gold bg-gold text-on-accent" : "border-border bg-card text-card-foreground",
        card.leaving && "opacity-0",
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", gold ? "text-on-accent" : "text-gold-dark")} />
      <div className="min-w-0">
        <p className="text-sm leading-snug font-semibold">
          <XpText text={card.title} gold={gold} />
        </p>
        {card.detail ? (
          <p className={cn("mt-0.5 text-xs leading-snug", gold ? "text-on-accent" : "text-muted-foreground")}>
            <XpText text={card.detail} gold={gold} />
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The "+N XP" part in text-gold-dark (6.23:1 on the card, light and dark). */
function XpText({ text, gold }: { text: string; gold: boolean }) {
  const parts = gold ? null : splitXp(text);
  if (!parts) return <>{text}</>;
  return (
    <>
      <span className="text-gold-dark tabular-nums">{parts.xp}</span>
      {parts.rest}
    </>
  );
}
```

(If Probe P1 failed, apply Fallback F1 now.)

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/components/levels/awards-toaster.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Mount it in AppShell**

In `src/components/app-shell.tsx`:

(a) after `import { isProfileBare, tourSeenFromProfile } from "@/lib/first-run/tour";` add:

```tsx
import { AwardsToaster } from "@/components/levels/awards-toaster";
```

(b) replace

```tsx
            <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
              {children}
            </div>
          </div>
```

with

```tsx
            <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
              {children}
            </div>
          </div>
          {/* The one award toaster (levels spec §8.1, L28): the root layout
              is never re-rendered by a soft navigation, so it keeps its
              queue; AppHeader's AwardsFeed fills it. */}
          <AwardsToaster userId={user.id} />
```

- [ ] **Step 6: Gates**

- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx tsc --noEmit`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx eslint src/components/levels src/components/app-shell.tsx src/lib/levels`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run` → 219 files, 4,201 tests passed.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-mapdetail && git add src/components/levels/awards-toaster.tsx src/components/levels/awards-toaster.test.tsx src/components/app-shell.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(levels): the award pop-ups" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The ring — sidebar (full and rail), tablet drawer and phone drawer

**Files:**
- Create: `src/lib/levels/ring.test.ts`, `src/lib/levels/ring.ts`
- Create: `src/components/levels/level-ring.test.tsx`, `src/components/levels/level-ring.tsx`
- Create: `src/components/levels/live-level-ring.tsx`
- Modify: `src/components/app-shell.tsx` (the level read, one prop)
- Modify: `src/components/app-sidebar.tsx`
- Modify: `src/components/mobile-nav.tsx`
- Modify: `src/components/app-header.tsx` (one MobileNav prop)

**Interfaces:**
- Consumes: `levelProgress` (Task 2), `ringLabel`, `ringLinkLabel` (Task 2), `levelStore` (Task 3), `readOwnLevel` (Task 4), `OwnLevel` (Task 2), AppHeader's `levelSnapshot` (Task 4).
- Produces:
  - `ring.ts`: `ringGeometry(size: number, fraction: number): RingGeometry` (`stroke`, `gap`, `gapDegrees`, `radius`, `circumference`, `arc`, `fill`, `offset`, `rotate`, `inner`, `badgeHeight`, `badgeFontSize`).
  - `level-ring.tsx` (hook-free, server-renderable): `LevelRing({ level, xp, size, tone: "sidebar" | "surface", labelled?, className?, children })`.
  - `live-level-ring.tsx` (client): `useOwnLevel(userId: string, initial: OwnLevel | null): OwnLevel | null` and `LiveLevelRing({ userId, initial, size, tone, labelled?, className?, children })`.
  - `AppSidebar` gains the prop `level: OwnLevel | null`; `MobileNav` gains `level: OwnLevel | null`.

- [ ] **Step 1: Write the failing geometry test**

Create `src/lib/levels/ring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ringGeometry } from "./ring";

describe("ringGeometry", () => {
  it("uses the small stroke, gap and badge below 64 px", () => {
    const g = ringGeometry(40, 0);
    expect([g.stroke, g.gap, g.gapDegrees, g.inner, g.badgeHeight, g.badgeFontSize, g.rotate]).toEqual([
      2.5, 1.5, 50, 32, 14, 9, -65,
    ]);
    expect(ringGeometry(34, 0).inner).toBe(26);
  });

  it("uses the large ones from 64 px", () => {
    const g = ringGeometry(90, 0);
    expect([g.stroke, g.gap, g.gapDegrees, g.inner, g.badgeHeight, g.badgeFontSize, g.rotate]).toEqual([
      3, 2, 36, 80, 20, 12, -72,
    ]);
    expect(ringGeometry(74, 0).inner).toBe(64);
  });

  it("draws 360° − g of the circle as the track", () => {
    const g = ringGeometry(40, 0);
    // r = 18.75, C = 117.81, arc = C · 310/360
    expect([g.radius, g.circumference, g.arc]).toEqual([18.75, 117.81, 101.45]);
  });

  it("fills 0 %, 37 % and 100 % of the arc", () => {
    expect([ringGeometry(40, 0).fill, ringGeometry(40, 0).offset]).toEqual([0, 101.45]);
    expect([ringGeometry(40, 0.37).fill, ringGeometry(40, 0.37).offset]).toEqual([37.54, 63.91]);
    expect([ringGeometry(40, 1).fill, ringGeometry(40, 1).offset]).toEqual([101.45, 0]);
  });

  it("clamps a fraction outside 0..1", () => {
    expect(ringGeometry(40, 1.5).fill).toBe(ringGeometry(40, 1).fill);
    expect(ringGeometry(40, -1).fill).toBe(0);
    expect(ringGeometry(40, Number.NaN).fill).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels/ring.test.ts`
Expected: FAIL — `Failed to resolve import "./ring"`.

- [ ] **Step 3: Implement the geometry**

Create `src/lib/levels/ring.ts`:

```ts
// The level ring's geometry (spec §8.2, L30): one circle drawn as an arc of
// 360° − g, starting at 12 o'clock + g/2 and running clockwise, so the gap sits
// under the badge and no progress ever hides beneath it. Lengths are in px for
// strokeDasharray/strokeDashoffset. Pure: no imports.

export type RingGeometry = {
  /** Stroke width. */
  stroke: number;
  /** Space between the stroke and the avatar. */
  gap: number;
  /** The badge's gap in the arc, in degrees. */
  gapDegrees: number;
  radius: number;
  circumference: number;
  /** The arc's length (the track). */
  arc: number;
  /** The filled length. */
  fill: number;
  /** strokeDashoffset that shows exactly `fill` of the arc from its start. */
  offset: number;
  /** SVG rotate() angle that puts the arc's start at 12 o'clock + g/2. */
  rotate: number;
  /** The avatar's diameter inside the ring. */
  inner: number;
  badgeHeight: number;
  badgeFontSize: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Below 64 px: stroke 2.5, gap 1.5, a 50° badge gap, a 14 px badge with 9 px
    text; from 64 px: 3, 2, 36°, 20 px, 12 px. */
export function ringGeometry(size: number, fraction: number): RingGeometry {
  const big = size >= 64;
  const stroke = big ? 3 : 2.5;
  const gap = big ? 2 : 1.5;
  const gapDegrees = big ? 36 : 50;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arc = (circumference * (360 - gapDegrees)) / 360;
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const fill = arc * f;
  return {
    stroke,
    gap,
    gapDegrees,
    radius: round2(radius),
    circumference: round2(circumference),
    arc: round2(arc),
    fill: round2(fill),
    offset: round2(arc - fill),
    rotate: -90 + gapDegrees / 2,
    inner: size - 2 * (stroke + gap),
    badgeHeight: big ? 20 : 14,
    badgeFontSize: big ? 12 : 9,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels/ring.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing ring markup test**

Create `src/components/levels/level-ring.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LevelRing } from "./level-ring";

// react-dom/server in node, like src/components/wset/sheet-markup.test.tsx:
// what is pinned is the first paint.
const ring = (xp: number, level: number, extra: { labelled?: boolean; size?: number } = {}) =>
  renderToStaticMarkup(
    <LevelRing level={level} xp={xp} size={extra.size ?? 40} tone="sidebar" labelled={extra.labelled}>
      <span>A</span>
    </LevelRing>,
  );

describe("LevelRing", () => {
  it("is an image with the level label when labelled", () => {
    const html = ring(420, 4, { labelled: true, size: 90 });
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Level 4, 120 of 200 XP to level 5"');
    expect(html).not.toContain("aria-hidden");
  });

  it("hides itself inside a link (the link carries the label)", () => {
    const html = ring(420, 4);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("aria-label");
  });

  it("shows the level in the badge", () => {
    expect(ring(420, 4)).toMatch(/>4<\/span><\/span>$/);
    expect(ring(88_500, 60)).toMatch(/>60<\/span><\/span>$/);
  });

  it("fills 0 %, 37 % and 100 % of a 40 px arc", () => {
    // 40 px: r 18.75, C 117.81, arc 101.45 (310° of 360°).
    const offsets = (html: string) => [...html.matchAll(/stroke-dashoffset="([\d.]+)"/g)].map((m) => m[1]);
    expect(ring(0, 1)).toContain('stroke-dasharray="101.45 117.81"');
    expect(offsets(ring(0, 1))).toEqual(["101.45"]);
    // level 4 spans 300..500: 37 % is 374 XP.
    expect(offsets(ring(374, 4))).toEqual(["63.91"]);
    expect(offsets(ring(88_500, 60))).toEqual(["0"]);
  });

  it("uses tokens only", () => {
    const html = ring(420, 4);
    expect(html).toContain("stroke-primary-foreground/20");
    expect(html).toContain("stroke-gold");
    expect(html).toContain("bg-gold");
    expect(html).toContain("text-on-accent");
    expect(html).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/components/levels/level-ring.test.tsx`
Expected: FAIL — `Failed to resolve import "./level-ring"`.

- [ ] **Step 7: Implement the ring and its live wrapper**

Create `src/components/levels/level-ring.tsx`:

```tsx
import type { ReactNode } from "react";
import { levelProgress } from "@/lib/levels/curve";
import { ringLabel } from "@/lib/levels/copy";
import { ringGeometry } from "@/lib/levels/ring";
import { cn } from "@/lib/utils";

// Tokens only (L30): on the bordeaux sidebar and drawer the fill is gold over
// primary-foreground/20; on the page (/u/[id]) gold-deep over border-light,
// supplementary to the card's own text. The badge is always gold with
// on-accent ink, ringed in the colour around it so it reads apart from the arc.
const TONES = {
  sidebar: { track: "stroke-primary-foreground/20", fill: "stroke-gold", badgeRing: "ring-primary" },
  surface: { track: "stroke-border-light", fill: "stroke-gold-deep", badgeRing: "ring-background" },
} as const;

/**
 * The XP ring around an avatar, with the level in a badge above it (spec
 * §8.2, L8). Hook-free, so server components render it; the viewer's own
 * ring goes through LiveLevelRing. One circle drawn as an arc with a gap under
 * the badge; the fill is the same arc cut short with strokeDashoffset.
 * `labelled`: a standalone ring (role="img" + its label); otherwise it is
 * aria-hidden and the link around it carries ringLinkLabel.
 */
export function LevelRing({
  level,
  xp,
  size,
  tone,
  labelled = false,
  className,
  children,
}: {
  level: number;
  xp: number;
  /** Outer diameter, px. */
  size: number;
  tone: keyof typeof TONES;
  labelled?: boolean;
  className?: string;
  /** The avatar, sized to fit inside (ringGeometry(size).inner px). */
  children: ReactNode;
}) {
  const progress = levelProgress(xp);
  const g = ringGeometry(size, progress.fraction);
  const t = TONES[tone];
  const c = size / 2;
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      {...(labelled ? { role: "img", "aria-label": ringLabel(xp) } : { "aria-hidden": true })}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" fill="none">
        <g transform={`rotate(${g.rotate} ${c} ${c})`}>
          <circle
            cx={c}
            cy={c}
            r={g.radius}
            strokeWidth={g.stroke}
            strokeDasharray={`${g.arc} ${g.circumference}`}
            className={t.track}
          />
          <circle
            cx={c}
            cy={c}
            r={g.radius}
            strokeWidth={g.stroke}
            strokeDasharray={`${g.arc} ${g.circumference}`}
            strokeDashoffset={g.offset}
            className={cn(t.fill, "motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700")}
          />
        </g>
      </svg>
      <span className="relative flex items-center justify-center" style={{ width: g.inner, height: g.inner }}>
        {children}
      </span>
      <span
        className={cn(
          "absolute top-0 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gold px-1 leading-none font-semibold text-on-accent tabular-nums ring-2",
          t.badgeRing,
        )}
        style={{ height: g.badgeHeight, minWidth: g.badgeHeight, fontSize: g.badgeFontSize }}
      >
        {level}
      </span>
    </span>
  );
}
```

Create `src/components/levels/live-level-ring.tsx`:

```tsx
"use client";

import { useSyncExternalStore, type ComponentProps } from "react";
import { levelStore } from "@/lib/levels/level-store";
import type { OwnLevel } from "@/lib/levels/types";
import { LevelRing } from "./level-ring";

const noLevel = () => null;

/**
 * The viewer's own level: the newest of the store (every AppHeader render
 * publishes into it) and the server's `initial`, by XP. Null when neither has
 * one — the caller then renders the bare avatar, never a false 0 %.
 */
export function useOwnLevel(userId: string, initial: OwnLevel | null): OwnLevel | null {
  const stored = useSyncExternalStore(
    levelStore.subscribe,
    () => levelStore.getLevel(userId),
    noLevel,
  );
  if (!stored) return initial;
  if (!initial) return stored;
  return stored.xp >= initial.xp ? stored : initial;
}

/** LevelRing for the viewer's own avatar, kept live by the store (spec §8.2). */
export function LiveLevelRing({
  userId,
  initial,
  children,
  ...ring
}: Omit<ComponentProps<typeof LevelRing>, "level" | "xp"> & {
  userId: string;
  initial: OwnLevel | null;
}) {
  const level = useOwnLevel(userId, initial);
  if (!level) return <>{children}</>;
  return (
    <LevelRing level={level.level} xp={level.xp} {...ring}>
      {children}
    </LevelRing>
  );
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/components/levels/level-ring.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 9: AppShell reads the first level**

In `src/components/app-shell.tsx`:

(a) after `import { AwardsToaster } from "@/components/levels/awards-toaster";` add:

```tsx
import { readOwnLevel } from "@/lib/levels/read";
```

(b) replace

```tsx
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, role, location, tour_seen_at")
    .eq("id", user.id)
    .maybeSingle();
```

with

```tsx
  // The sidebar ring's first paint (levels spec §6.2) runs beside the profile
  // read; null on any error, and the ring then waits for AppHeader's snapshot.
  const [{ data: profile, error: profileError }, level] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url, role, location, tour_seen_at")
      .eq("id", user.id)
      .maybeSingle(),
    readOwnLevel(supabase, user.id),
  ]);
```

(c) replace

```tsx
            <AppSidebar
              isManager={isManager}
```

with

```tsx
            <AppSidebar
              isManager={isManager}
              level={level}
```

- [ ] **Step 10: The sidebar: full row, rail and tablet drawer**

In `src/components/app-sidebar.tsx`:

(a) after `import { PROFILE_LINKS } from "@/components/profile-links";` add:

```tsx
import { LevelRing } from "@/components/levels/level-ring";
import { useOwnLevel } from "@/components/levels/live-level-ring";
import { ringLinkLabel } from "@/lib/levels/copy";
import type { OwnLevel } from "@/lib/levels/types";
```

(b) replace

```tsx
export function AppSidebar({
  isManager,
  user,
}: {
  isManager: boolean;
  user: SidebarUser;
}) {
```

with

```tsx
export function AppSidebar({
  isManager,
  user,
  level,
}: {
  isManager: boolean;
  user: SidebarUser;
  /** The ring's first paint (AppShell's read); the store keeps it live. */
  level: OwnLevel | null;
}) {
```

(c) in each of the three `<SidebarBody` renders (the tablet drawer's, and the aside's `full` and `rail`), add `level={level}` on the line after `user={user}`.

(d) in `function SidebarBody({`, add `level: initialLevel,` after `user,` in the destructuring, and `level: OwnLevel | null;` after `user: SidebarUser;` in its props type.

(e) replace

```tsx
  const pathname = usePathname();
  const profileActive = pathname.startsWith("/profile") || pathname === `/u/${user.id}`;
```

(the one inside `SidebarBody`) with

```tsx
  const pathname = usePathname();
  const profileActive = pathname.startsWith("/profile") || pathname === `/u/${user.id}`;
  // The viewer's level (levels spec §8.2, L8): AppShell's first paint, kept
  // live by the store AppHeader's AwardsFeed fills. Null: the bare avatar.
  const level = useOwnLevel(user.id, initialLevel);
  const profileLabel = level ? ringLinkLabel(user.name, level.xp) : user.name;
```

(f) the rail's profile link — replace

```tsx
          <Link
            href={`/u/${user.id}`}
            aria-label={user.name}
            title={user.name}
            className={cn(
              "flex size-11 items-center justify-center rounded-lg transition-colors hover:bg-primary-foreground/10",
              profileActive && "bg-primary-foreground/15",
            )}
          >
            <UserAvatar user={user} className="size-[30px]" />
          </Link>
```

with

```tsx
          <Link
            href={`/u/${user.id}`}
            aria-label={profileLabel}
            title={user.name}
            className={cn(
              "flex size-11 items-center justify-center rounded-lg transition-colors hover:bg-primary-foreground/10",
              profileActive && "bg-primary-foreground/15",
              level && "mt-1.5",
            )}
          >
            {level ? (
              <LevelRing level={level.level} xp={level.xp} size={34} tone="sidebar">
                <UserAvatar user={user} className="size-[26px]" />
              </LevelRing>
            ) : (
              <UserAvatar user={user} className="size-[30px]" />
            )}
          </Link>
```

(g) the full footer's profile row — replace

```tsx
        <div className="mt-1 flex items-center gap-2">
          <Link
            href={`/u/${user.id}`}
            onClick={onNavigate}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-primary-foreground/10",
              profileActive && "bg-primary-foreground/15",
            )}
          >
            <UserAvatar user={user} className="size-8" />
```

with

```tsx
        <div className={cn("mt-1 flex items-center gap-2", level && "pt-2")}>
          <Link
            href={`/u/${user.id}`}
            onClick={onNavigate}
            aria-label={level ? profileLabel : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-primary-foreground/10",
              profileActive && "bg-primary-foreground/15",
            )}
          >
            {level ? (
              <LevelRing level={level.level} xp={level.xp} size={40} tone="sidebar">
                <UserAvatar user={user} className="size-8" />
              </LevelRing>
            ) : (
              <UserAvatar user={user} className="size-8" />
            )}
```

- [ ] **Step 11: The phone drawer**

In `src/components/mobile-nav.tsx`:

(a) after `import { useTasteLauncher } from "@/components/taste-launcher-context";` add:

```tsx
import { LevelRing } from "@/components/levels/level-ring";
import { useOwnLevel } from "@/components/levels/live-level-ring";
import { ringLinkLabel } from "@/lib/levels/copy";
import type { OwnLevel } from "@/lib/levels/types";
```

(b) replace

```tsx
  links,
  notifications,
}: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  links: NavLink[];
  notifications?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
```

with

```tsx
  links,
  notifications,
  level: initialLevel,
}: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  links: NavLink[];
  notifications?: React.ReactNode;
  /** AppHeader's snapshot level (levels spec §8.2); the store keeps it live. */
  level: OwnLevel | null;
}) {
  const [open, setOpen] = useState(false);
  const level = useOwnLevel(userId, initialLevel);
```

(c) immediately before `  const drawer =`, add:

```tsx
  const drawerAvatar = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarUrl}
      alt=""
      className="size-8 shrink-0 rounded-full object-cover ring-1 ring-primary-foreground/20"
    />
  ) : (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 text-xs font-medium">
      {displayName.slice(0, 1).toUpperCase()}
    </span>
  );

```

(d) replace

```tsx
                <div className="flex items-center gap-2">
                  <Link
                    href={`/u/${userId}`}
                    onClick={close}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-primary-foreground/10"
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt=""
                        className="size-8 shrink-0 rounded-full object-cover ring-1 ring-primary-foreground/20"
                      />
                    ) : (
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 text-xs font-medium">
                        {displayName.slice(0, 1).toUpperCase()}
                      </span>
                    )}
```

with

```tsx
                <div className={cn("flex items-center gap-2", level && "pt-2")}>
                  <Link
                    href={`/u/${userId}`}
                    onClick={close}
                    aria-label={level ? ringLinkLabel(displayName, level.xp) : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-primary-foreground/10"
                  >
                    {level ? (
                      <LevelRing level={level.level} xp={level.xp} size={40} tone="sidebar">
                        {drawerAvatar}
                      </LevelRing>
                    ) : (
                      drawerAvatar
                    )}
```

- [ ] **Step 12: AppHeader hands the phone drawer its level**

In `src/components/app-header.tsx`, replace

```tsx
          avatarUrl={avatarUrl}
          links={navLinks}
        />
```

with

```tsx
          avatarUrl={avatarUrl}
          links={navLinks}
          level={levelSnapshot ? { xp: levelSnapshot.xp, level: levelSnapshot.level } : null}
        />
```

- [ ] **Step 13: Gates**

- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx tsc --noEmit`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx eslint src/lib/levels src/components/levels src/components/app-shell.tsx src/components/app-sidebar.tsx src/components/mobile-nav.tsx src/components/app-header.tsx`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run` → 221 files, 4,211 tests passed.

- [ ] **Step 14: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-mapdetail && git add src/lib/levels/ring.ts src/lib/levels/ring.test.ts src/components/levels/level-ring.tsx src/components/levels/level-ring.test.tsx src/components/levels/live-level-ring.tsx src/components/app-shell.tsx src/components/app-sidebar.tsx src/components/mobile-nav.tsx src/components/app-header.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(levels): the XP ring round your avatar in the sidebar, rail and drawers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The level pill in /community

**Files:**
- Create: `src/components/levels/level-pill.test.tsx`, `src/components/levels/level-pill.tsx`
- Modify: `src/app/community/page.tsx`
- Modify: `src/app/community/community-list.tsx`

**Interfaces:**
- Consumes: `pillText`, `pillLabel` (Task 2); `readLevels` (Task 4).
- Produces: `LevelPill({ level, className? })`; `CommunityRow` gains `level: number`.

- [ ] **Step 1: Write the failing pill test**

Create `src/components/levels/level-pill.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LevelPill } from "./level-pill";

describe("LevelPill", () => {
  it("reads 'Lv N' and says 'Level N' to assistive technology", () => {
    const html = renderToStaticMarkup(<LevelPill level={7} />);
    expect(html).toContain('<span aria-hidden="true">Lv 7</span>');
    expect(html).toContain('<span class="sr-only">Level 7</span>');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/components/levels/level-pill.test.tsx`
Expected: FAIL — `Failed to resolve import "./level-pill"`.

- [ ] **Step 3: Implement the pill**

Create `src/components/levels/level-pill.tsx`:

```tsx
import { pillLabel, pillText } from "@/lib/levels/copy";
import { cn } from "@/lib/utils";

/** /community's "Lv N" beside a name (spec §8.3, L31): text, not a ring. */
export function LevelPill({ level, className }: { level: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border border-gold-deep/50 px-1.5 text-[11px] font-semibold text-gold-dark tabular-nums",
        className,
      )}
    >
      <span aria-hidden="true">{pillText(level)}</span>
      <span className="sr-only">{pillLabel(level)}</span>
    </span>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/components/levels/level-pill.test.tsx`
Expected: PASS, 1 test.

- [ ] **Step 5: One batched read beside the summaries**

In `src/app/community/page.tsx`:

(a) after `import { getBulkProfileSummaries } from "@/lib/profile-stats";` add:

```tsx
import { readLevels } from "@/lib/levels/read";
```

(b) replace

```tsx
  // Batched once for the whole page (CLAUDE.md's People/profile rule): never
  // fetch one profile's stats at a time in a loop.
  const summaries = await getBulkProfileSummaries(rows.map((r) => r.id));
```

with

```tsx
  // Batched once for the whole page (CLAUDE.md's People/profile rule): never
  // fetch one profile's stats at a time in a loop. Levels (levels spec §8.3,
  // L31) are one `.in()` read beside them; anyone without a row is level 1.
  const rowIds = rows.map((r) => r.id);
  const [summaries, levels] = await Promise.all([
    getBulkProfileSummaries(rowIds),
    readLevels(supabase, rowIds),
  ]);
```

(c) replace

```tsx
      stats: statCells(summaries.get(p.id)),
    };
```

with

```tsx
      stats: statCells(summaries.get(p.id)),
      level: levels.get(p.id) ?? 1,
    };
```

- [ ] **Step 6: The pill beside every name**

In `src/app/community/community-list.tsx`:

(a) after `import { InvitePeopleButton } from "@/components/invite/invite-people-button";` add:

```tsx
import { LevelPill } from "@/components/levels/level-pill";
```

(b) in `export type CommunityRow`, replace

```tsx
  stats: { tastings: string; wines: string | null; avg: string; phoneBottom: string };
};
```

with

```tsx
  stats: { tastings: string; wines: string | null; avg: string; phoneBottom: string };
  /** The person's level (levels spec §8.3); 1 when they have no row. */
  level: number;
};
```

(c) the phone/tablet card — replace

```tsx
                      <span className="truncate font-medium">{r.name}</span>
                      {r.isMe ? <Badge variant="secondary">You</Badge> : null}
                    </span>
```

with

```tsx
                      <span className="truncate font-medium">{r.name}</span>
                      {r.isMe ? <Badge variant="secondary">You</Badge> : null}
                      <LevelPill level={r.level} />
                    </span>
```

(d) the xl table's Person cell — replace

```tsx
                            <span className="truncate font-medium">{r.name}</span>
                            {r.isMe ? <Badge variant="secondary">You</Badge> : null}
                          </span>
```

with

```tsx
                            <span className="truncate font-medium">{r.name}</span>
                            {r.isMe ? <Badge variant="secondary">You</Badge> : null}
                            <LevelPill level={r.level} />
                          </span>
```

- [ ] **Step 7: Gates**

- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx tsc --noEmit`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx eslint src/components/levels src/app/community`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run` → 222 files, 4,212 tests passed.

- [ ] **Step 8: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-mapdetail && git add src/components/levels/level-pill.tsx src/components/levels/level-pill.test.tsx src/app/community/page.tsx src/app/community/community-list.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(levels): a level pill beside every name in Community" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: /u/[id] — the ring and the "Level & achievements" card

**Files:**
- Create: `src/lib/levels/card.test.ts`, `src/lib/levels/card.ts`
- Create: `src/app/u/[id]/level-card.tsx`
- Modify: `src/app/u/[id]/profile-header.tsx` (imports, two props, the avatar, one helper at the end)
- Modify: `src/app/u/[id]/page.tsx` (imports, one started read, one await, two props, one render)

**Interfaces:**
- Consumes: `levelProgress` (Task 2), the card copy (Task 2), `ProfileLevel`/`OwnLevel` (Task 2), `readProfileLevel` (Task 4), `LevelRing`/`LiveLevelRing` (Task 6), `StatCard` (`src/app/profile/numbers/stat-card.tsx`).
- Produces: `CHIP_LIMIT = 6`, `levelCardView(p: ProfileLevel): LevelCardView`; `LevelCard({ level }: { level: ProfileLevel })` (client); `ProfileHeader` gains optional `level?: OwnLevel | null` and `liveUserId?: string`.

- [ ] **Step 1: Write the failing card test**

Create `src/lib/levels/card.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels/card.test.ts`
Expected: FAIL — `Failed to resolve import "./card"`.

- [ ] **Step 3: Implement the card data**

Create `src/lib/levels/card.ts`:

```ts
// /u/[id]'s "Level & achievements" card as plain data (spec §8.4, L32): the
// collapsed row (level, XP in all, the bar, up to six earned chips) and the
// expanded lists (earned by category with dates; on your own profile, the ones
// not yet earned with their progress). Pure: relative imports only.
import { levelProgress } from "./curve";
import {
  ACHIEVEMENTS,
  CARD_COPY,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  bonusText,
  formatUtcDate,
  levelHeading,
  progressText,
  toNextLevel,
  xpInAll,
} from "./copy";
import type { AchievementCategory, AchievementKey, ProfileLevel } from "./types";

/** Earned chips shown collapsed. */
export const CHIP_LIMIT = 6;

export type CardChip = { key: AchievementKey; category: AchievementCategory; name: string };

export type LevelCardView = {
  heading: string;
  xpLine: string;
  bar: { fraction: number; text: string };
  chips: CardChip[];
  /** "No achievements yet." when nothing is earned (or visible), else null. */
  empty: string | null;
  earnedGroups: {
    category: AchievementCategory;
    label: string;
    items: { key: AchievementKey; name: string; description: string; when: string }[];
  }[];
  /** Your own profile only; null on someone else's. */
  notYet:
    | { key: AchievementKey; name: string; description: string; fraction: number; progress: string; bonus: string }[]
    | null;
  /** The expanded view adds something (dates, the rest, or what is not yet
      earned): the "All achievements" toggle shows. */
  canExpand: boolean;
};

export function levelCardView(p: ProfileLevel): LevelCardView {
  const progress = levelProgress(p.xp);
  const chips = p.earned.slice(0, CHIP_LIMIT).map((e) => ({
    key: e.key,
    category: e.category,
    name: ACHIEVEMENTS[e.key].name,
  }));
  const earnedGroups = CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: p.earned
      .filter((e) => e.category === category)
      .map((e) => ({
        key: e.key,
        name: ACHIEVEMENTS[e.key].name,
        description: ACHIEVEMENTS[e.key].description,
        when: e.backfill ? CARD_COPY.beforeLevels : formatUtcDate(e.unlockedAt),
      })),
  })).filter((g) => g.items.length > 0);
  const notYet =
    p.locked === null
      ? null
      : p.locked.map((l) => ({
          key: l.key,
          name: ACHIEVEMENTS[l.key].name,
          description: ACHIEVEMENTS[l.key].description,
          fraction: l.target > 0 ? Math.min(1, l.progress / l.target) : 0,
          progress: progressText(l.progress, l.target),
          bonus: bonusText(l.bonusXp),
        }));
  return {
    heading: levelHeading(progress.level),
    xpLine: xpInAll(p.xp),
    bar: {
      fraction: progress.fraction,
      text: progress.next === null ? CARD_COPY.topLevel : toNextLevel(progress.into, progress.span, progress.next),
    },
    chips,
    empty: p.earned.length === 0 ? CARD_COPY.noneYet : null,
    earnedGroups,
    notYet,
    canExpand: p.earned.length > 0 || (notYet?.length ?? 0) > 0,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/levels/card.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: The card**

Create `src/app/u/[id]/level-card.tsx` (a plain `<button aria-expanded>` toggle, 44 px on phones; the "Earned"/"Not yet" headings are `h3` under the page's `h1`):

```tsx
"use client";

import { useId, useState, type ComponentType } from "react";
import { Boxes, GraduationCap, NotebookPen, Users, Wine } from "lucide-react";
import { StatCard } from "@/app/profile/numbers/stat-card";
import { levelCardView } from "@/lib/levels/card";
import { CARD_COPY } from "@/lib/levels/copy";
import type { AchievementCategory, ProfileLevel } from "@/lib/levels/types";
import { cn } from "@/lib/utils";

const ICONS: Record<AchievementCategory, ComponentType<{ className?: string }>> = {
  cellar: Boxes,
  tastings: Wine,
  notes: NotebookPen,
  training: GraduationCap,
  friends: Users,
};

function Bar({ fraction, className }: { fraction: number; className?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-secondary", className)}>
      <div className="h-full rounded-full bg-gold-deep" style={{ width: `${Math.round(fraction * 1000) / 10}%` }} />
    </div>
  );
}

/**
 * /u/[id]'s "Level & achievements" card (spec §8.4, L9, L32), directly under
 * ProfileHeader. Collapsed: the level, XP in all, the bar and up to six earned
 * chips. "All achievements" opens the earned ones by category with their UTC
 * dates ("Before levels" when backfilled) and, on your own profile only, the
 * ones not yet earned with their progress. Someone else's hidden cellar
 * achievements never reach this component (RLS), so nothing hints at them.
 */
export function LevelCard({ level }: { level: ProfileLevel }) {
  const v = levelCardView(level);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <StatCard title={CARD_COPY.title}>
      {/* One row from md (L32: compact); it wraps on phones. */}
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-heading text-xl font-semibold">{v.heading}</span>
          <span className="text-sm text-muted-foreground tabular-nums">{v.xpLine}</span>
        </div>
        <div className="flex flex-col gap-1 md:w-56">
          <Bar fraction={v.bar.fraction} />
          <span className="text-xs text-muted-foreground tabular-nums">{v.bar.text}</span>
        </div>
        {v.empty ? (
          <p className="text-[12.5px] text-muted-foreground italic md:flex-1">{v.empty}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5 md:flex-1">
            {v.chips.map((chip) => {
              const Icon = ICONS[chip.category];
              return (
                <li
                  key={chip.key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border-light px-2.5 py-1 text-xs"
                >
                  <Icon className="size-3.5 text-gold-dark" />
                  {chip.name}
                </li>
              );
            })}
          </ul>
        )}
        {v.canExpand ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
            className="-mx-2 inline-flex min-h-11 items-center self-start rounded-md px-2 text-sm font-medium text-primary hover:text-primary/80 dark:text-primary-ink dark:hover:text-primary-ink/80 md:self-center md:pointer-fine:min-h-8"
          >
            {open ? CARD_COPY.showFewer : CARD_COPY.showAll}
          </button>
        ) : null}
      </div>
      {open ? (
        <div id={panelId} className="flex flex-col gap-4 border-t border-border-light pt-3">
          {v.earnedGroups.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{CARD_COPY.earned}</h3>
              {v.earnedGroups.map((group) => {
                const Icon = ICONS[group.category];
                return (
                  <div key={group.category} className="flex flex-col gap-1">
                    <h4 className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon className="size-3.5" />
                      {group.label}
                    </h4>
                    <ul className="flex flex-col gap-1">
                      {group.items.map((item) => (
                        <li key={item.key} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0">
                            <span className="font-medium">{item.name}</span>
                            <span className="block text-xs text-muted-foreground">{item.description}</span>
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{item.when}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          ) : null}
          {v.notYet && v.notYet.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">{CARD_COPY.notYet}</h3>
              <ul className="flex flex-col gap-2.5">
                {v.notYet.map((item) => (
                  <li key={item.key} className="flex flex-col gap-1 text-sm">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{item.name}</span>
                      <span className="shrink-0 text-xs text-gold-dark tabular-nums">{item.bonus}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                    <span className="flex items-center gap-2">
                      <Bar fraction={item.fraction} className="h-1 flex-1" />
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{item.progress}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </StatCard>
  );
}
```

- [ ] **Step 6: The header's ring**

In `src/app/u/[id]/profile-header.tsx`:

(a) after `import { Badge } from "@/components/ui/badge";` add:

```tsx
import { LevelRing } from "@/components/levels/level-ring";
import { LiveLevelRing } from "@/components/levels/live-level-ring";
import type { OwnLevel } from "@/lib/levels/types";
```

(b) replace

```tsx
  favourites,
  actions,
}: {
  name: string;
  avatarUrl: string | null;
  isOwn: boolean;
  meta: string;
  bio: string | null;
  /** Favourite regions and producers as chips (renders nothing when empty). */
  favourites?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
      <Avatar
        src={avatarUrl}
        name={name}
        size="lg"
        className="size-20 text-3xl max-md:size-16 max-md:text-2xl"
      />
```

with

```tsx
  favourites,
  actions,
  level,
  liveUserId,
}: {
  name: string;
  avatarUrl: string | null;
  isOwn: boolean;
  meta: string;
  bio: string | null;
  /** Favourite regions and producers as chips (renders nothing when empty). */
  favourites?: ReactNode;
  actions: ReactNode;
  /** The person's level (levels spec §8.2): a ring round the avatar. Null or
      absent: the plain avatar, as before. */
  level?: OwnLevel | null;
  /** Your own profile: the ring follows the store live (LiveLevelRing). */
  liveUserId?: string;
}) {
  return (
    <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
      {level ? (
        // 90 px around an 80 px avatar from md, 74 around 64 on phones; one
        // is display:none, so assistive technology meets one labelled ring.
        <>
          <ProfileRing level={level} liveUserId={liveUserId} size={90} className="mt-2 max-md:hidden">
            <Avatar src={avatarUrl} name={name} size="lg" className="size-20 text-3xl" />
          </ProfileRing>
          <ProfileRing level={level} liveUserId={liveUserId} size={74} className="mt-2 md:hidden">
            <Avatar src={avatarUrl} name={name} size="lg" className="size-16 text-2xl" />
          </ProfileRing>
        </>
      ) : (
        <Avatar
          src={avatarUrl}
          name={name}
          size="lg"
          className="size-20 text-3xl max-md:size-16 max-md:text-2xl"
        />
      )}
```

(c) at the end of the file, after `ProfileHeader`'s closing brace, add:

```tsx

/** The /u/[id] ring: labelled, on the page surface; live on your own profile. */
function ProfileRing({
  level,
  liveUserId,
  size,
  className,
  children,
}: {
  level: OwnLevel;
  liveUserId?: string;
  size: number;
  className?: string;
  children: ReactNode;
}) {
  return liveUserId ? (
    <LiveLevelRing userId={liveUserId} initial={level} size={size} tone="surface" labelled className={className}>
      {children}
    </LiveLevelRing>
  ) : (
    <LevelRing level={level.level} xp={level.xp} size={size} tone="surface" labelled className={className}>
      {children}
    </LevelRing>
  );
}
```

- [ ] **Step 7: The page**

In `src/app/u/[id]/page.tsx`:

(a) after `import { ProfileHeader } from "./profile-header";` add:

```tsx
import { LevelCard } from "./level-card";
import { readProfileLevel } from "@/lib/levels/read";
```

(b) replace

```tsx
  const isOwnProfile = view === "own";
  const inviterName = me?.display_name ?? user.email ?? "";
```

with

```tsx
  const isOwnProfile = view === "own";
  const inviterName = me?.display_name ?? user.email ?? "";
  // Levels (spec 2026-09-27 §6.2, §8.4): started before the reads below so it
  // runs alongside them; never rejects — null hides the ring and the card.
  const levelRead = readProfileLevel(supabase, profile.id, isOwnProfile).catch(() => null);
```

(c) replace

```tsx
  // An RPC error hides the button rather than throwing (R2).
  const canViewCellar = cellarResult?.data === true;
```

with

```tsx
  // An RPC error hides the button rather than throwing (R2).
  const canViewCellar = cellarResult?.data === true;
  const profileLevel = await levelRead;
```

(d) replace

```tsx
          favourites={<FavouritesChips favourites={favourites} className="mt-3" />}
          actions={actions}
        />
```

with

```tsx
          favourites={<FavouritesChips favourites={favourites} className="mt-3" />}
          actions={actions}
          level={profileLevel ? { xp: profileLevel.xp, level: profileLevel.level } : null}
          liveUserId={isOwnProfile ? user.id : undefined}
        />
        {/* L32: directly under the header, shown even when the empty state
            replaces the stats below (a cellar-only person still has a level). */}
        {profileLevel ? <LevelCard level={profileLevel} /> : null}
```

The deleted-account branch returns before any of this, so a deleted profile shows no ring and no card.

- [ ] **Step 8: Gates**

- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx tsc --noEmit`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx eslint src/lib/levels "src/app/u/[id]"`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run` → 223 files, 4,216 tests passed.

- [ ] **Step 9: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-mapdetail && git add src/lib/levels/card.ts src/lib/levels/card.test.ts "src/app/u/[id]/level-card.tsx" "src/app/u/[id]/profile-header.tsx" "src/app/u/[id]/page.tsx" && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(levels): the profile ring and the Level & achievements card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Cellar-add revalidation (L33) and the CLAUDE.md bullet

**Files:**
- Create: `src/app/cellar/new/levels-revalidate.test.ts`
- Modify: `src/app/cellar/new/actions.ts` (one import, two lines)
- Modify: `CLAUDE.md` (one bullet at a named anchor)

**Interfaces:**
- Consumes: nothing new.
- Produces: `addCellarLot` and `increaseCellarLotQuantity` call `revalidatePath("/cellar")` after a successful write.

- [ ] **Step 1: Write the failing pin**

Create `src/app/cellar/new/levels-revalidate.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Levels spec L33: both cellar adds re-render the cellar layout's AppHeader,
// so the "+N XP" card shows at once (/cellar/new router.pushes inside that
// layout, and the add-wine sheet's merge card otherwise re-renders nothing
// until the sheet closes).
const source = readFileSync("src/app/cellar/new/actions.ts", "utf8").replace(/\r/g, "");

function body(name: string): string {
  const at = source.indexOf(`export async function ${name}(`);
  if (at < 0) throw new Error(`no ${name}`);
  const next = source.indexOf("\nexport ", at + 1);
  return source.slice(at, next < 0 ? undefined : next);
}

describe("cellar adds revalidate /cellar (L33)", () => {
  it("addCellarLot, after the lot is saved", () => {
    const b = body("addCellarLot");
    expect(b).toContain('revalidatePath("/cellar");');
    expect(b.indexOf('revalidatePath("/cellar");')).toBeGreaterThan(b.indexOf('rpc("add_cellar_lot"'));
  });
  it("increaseCellarLotQuantity, after the update", () => {
    const b = body("increaseCellarLotQuantity");
    expect(b).toContain('revalidatePath("/cellar");');
    expect(b.indexOf('revalidatePath("/cellar");')).toBeGreaterThan(b.indexOf("if (error) throw new Error(error.message);"));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/app/cellar/new/levels-revalidate.test.ts`
Expected: FAIL, 2 tests — `expected '…' to contain 'revalidatePath("/cellar");'`.

- [ ] **Step 3: Add the revalidates**

In `src/app/cellar/new/actions.ts`:

(a) replace

```ts
"use server";

import { withoutBlindPending } from "@/lib/catalog-visibility";
```

with

```ts
"use server";

import { revalidatePath } from "next/cache";
import { withoutBlindPending } from "@/lib/catalog-visibility";
```

(b) in `addCellarLot`, replace

```ts
      return { error: error?.message ?? "Couldn't save this wine. Please try again." };
    }
    return { id: data };
```

with

```ts
      return { error: error?.message ?? "Couldn't save this wine. Please try again." };
    }
    // Levels L33: re-renders the cellar layout's AppHeader, so the "+N XP"
    // card shows at once (the add's own router.push keeps that layout).
    revalidatePath("/cellar");
    return { id: data };
```

(c) in `increaseCellarLotQuantity`, replace

```ts
    .eq("id", lotId);
  if (error) throw new Error(error.message);
  return { id: lotId };
```

with

```ts
    .eq("id", lotId);
  if (error) throw new Error(error.message);
  // Levels L33: the add-wine sheet's merge card ("Add N to the existing lot")
  // and /cellar/new's merge otherwise re-render nothing until the sheet closes.
  revalidatePath("/cellar");
  return { id: lotId };
```

Both callers that already revalidate (`addToCellar`, the lot sheet's `addBottles`) now revalidate twice in one action; `revalidatePath` is idempotent within a request.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/app/cellar/new/levels-revalidate.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: The CLAUDE.md bullet**

In `CLAUDE.md`, insert this bullet immediately **before** the line that starts `- Tasting lifecycle: a new tasting is created \`DRAFT\`` (so it sits after the "Active-tasting banner" bullet; a mid-file anchor, C4):

```md
- **Levels and achievements** (2026-09-27, spec
  `docs/superpowers/specs/2026-09-27-levels-and-achievements-design.md`,
  migration `20260927160000_levels_and_achievements.sql`). XP is an
  append-only ledger, `xp_events`, unique per `(user_id, source_key)` and never
  taken back, written only by SECURITY DEFINER triggers on the source tables
  through one `xp_award()`: it locks the person's `profile_levels` row, applies
  the kind's UTC-day caps from `xp_sources`, writes the row with its running
  `xp_after` and moves the level (`level_for_xp`, `25·L·(L−1)`, cap 60; the TS
  twin is `src/lib/levels/curve.ts`, both pinned to
  `src/lib/levels/__fixtures__/curve.json`). Sources: a scored non-blank guess
  at its glass's global reveal (`wines_xp_on_reveal`, which also pays the pour
  that reveal unmasks), a CLOSED BLIND/SEMI_BLIND tasting with a revealed glass
  (`tastings_xp_on_close`: the playing guests and a host with a guest), a
  `cellar_lots` insert or `purchased_quantity` growth (at most 20 bottles a lot,
  100 XP a day; an Edit-lot `quantity` correction pays nothing), a DRANK
  consumption with a lot (`cellar_consumptions_xp`, a DEFERRABLE INITIALLY
  DEFERRED constraint trigger — both pour RPCs insert the consumption before
  pointing the pour intent at it, so a masked pour is skipped at COMMIT and paid
  by the reveal), a non-TRAINING note, a scored training round, and twenty
  achievements (numbers in the `achievements` table, names in
  `src/lib/levels/copy.ts`; `copy.test.ts` and `scripts/levels.test.mjs` pin
  the keys equal). Every trigger function wraps its work in `begin … exception
  when others then raise warning`: an XP bug never blocks a reveal, pour, note
  or cellar write, and `select public.xp_replay_user(<user>, false, false)`
  (owner-only; also the launch backfill) repairs what a swallowed error missed.
  **Rule 1:** levels, XP and achievements are public, so they are shared counts
  — a bottle poured into an unrevealed glass counts as in the cellar and not
  drunk until that reveal (`xp_consumption_masked` is
  `catalog_wine_masked_pours`' predicate, pinned equal by the DB suite). Any new
  count over `cellar_*` or `wset_notes` shown publicly must follow the same
  rule. `wines_xp_on_reveal` fires after `trg_catalog_wine_unmark_blind` (which
  deletes the glass's `flight_holds`) and before `wset_notes_resolve_on_reveal`
  by name order; a new AFTER UPDATE OF is_revealed trigger on `wines` must keep
  that order (the migration's post-state lists the accepted sets). Reads:
  `profile_levels` by every signed-in member; `profile_achievements` likewise
  except `gate = 'cellar'` rows (the owner or `can_view_cellar`); the ledger
  owner-only; client RPCs `get_my_level_state`, `mark_xp_seen`,
  `get_my_achievement_progress` (authenticated only). UI: AppHeader reads
  `get_my_level_state` in its `Promise.all` and renders `<AwardsFeed>` (draws
  nothing), which publishes into `src/lib/levels/level-store.ts`; the one
  `<AwardsToaster>` in AppShell shows at most three cards (bottom corner, 4 s,
  polite live region, a BroadcastChannel stops a second tab repeating one) and
  calls `markXpSeen`, which never revalidates; the rings (`LevelRing`,
  `useOwnLevel`) read the same store. A pop-up appears on the next render of an
  AppHeader after the award commits, so a new award path whose page lives in a
  section layout needs a `revalidatePath` or `router.refresh()` (the cellar adds
  got theirs, L33). Account deletion drops the person's ledger, achievements
  and level (`profiles_deleted_drop_levels`). Rollback SQL: spec §11.
```

- [ ] **Step 6: Gates**

- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx tsc --noEmit`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx eslint src/app/cellar/new`
- `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run` → 224 files, 4,218 tests passed.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-mapdetail && git add src/app/cellar/new/actions.ts src/app/cellar/new/levels-revalidate.test.ts CLAUDE.md && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(levels): cellar adds re-render the header; CLAUDE.md levels bullet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Rollout (MAIN SESSION only)

Every step below touches production and is run by the main session, never by an implementer, one single-purpose command per call (the auto-mode classifier refuses chained production commands). C2: the owner approved the design and authorised applies and pushes for this project; every apply is dry-run first and done when no LIVE tasting is revealing. `APPLIER` below is `C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs` (pass it as a `C:/` path: `MSYS_NO_PATHCONV` also stops `/c/` conversion).

**R0 — Probe P1.** Before Task 4 (section "Probe P1", above). Record the outcome (pass, or F1 applied) in the Task 5 review.

**R1 — Rebase (C4).** Once `training-region-guess` and `sharing-defaults` are on master: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && git fetch origin && git rebase origin/master`. Keep both sides in `src/lib/supabase/database.types.ts` (their blocks and ours), `CLAUDE.md` (both bullets), `src/app/u/[id]/page.tsx` and `src/app/u/[id]/profile-header.tsx`. Then every gate again: `npx tsc --noEmit`, `npx eslint` on the files this plan touched, `npx vitest run` → master's total + 12 files, + 80 tests, 0 failed. Confirm live has `20260927140000` and `20260927150000` (read-only: `select version from supabase_migrations.schema_migrations where version like '20260927%' order by 1`).

**R2 — DB suite, dry run.** At a quiet time: each test's transaction applies the migration and so holds its SHARE ROW EXCLUSIVE locks on `wines`, `tastings`, `cellar_lots`, `cellar_consumptions`, `wset_notes`, `training_attempts`, `friendships` and `profiles` until its rollback (seconds per test).

`cd /c/Users/Public/repos/blindtastingapp-mapdetail && LEVELS_APPLY=supabase/migrations/20260927160000_levels_and_achievements.sql node --env-file=.env.local --test scripts/levels.test.mjs`

The migration requires sharing-defaults M1 (`20260927140000`, confirmed live in R1); if it is not live yet, list it first: `LEVELS_APPLY=supabase/migrations/20260927140000_sharing_defaults.sql,supabase/migrations/20260927160000_levels_and_achievements.sql`.

Expected: 25 tests pass and a `# 8-guesser reveal: N ms` line (logged, not asserted). How to read a failure:
- **A post-state deparse string** (the migration raises "… differ from spec …: <actual text>"): if the actual text differs from the expected only in formatting (parentheses, casts, spacing, schema qualification), paste the actual text into that expected string, re-run `npx vitest run src/lib/levels/levels-migration.test.ts` (function bodies are untouched, so it still passes), commit `fix(db): levels post-state deparse strings`, and re-run R2. Any semantic difference stops the rollout and goes back to review.
- **A pre-state md5 or trigger-set failure:** something live changed since 2026-09-27 (the rebase names the likely cause). Read the new body, confirm the trigger's premise still holds (for `reveal_wine`/`reveal_next_category`: guesses scored before `is_revealed`; for the pour RPCs: the consumption inserted before the intent update), then update the pin. Never re-pin blind.
- **A fixture error** (a live constraint a helper missed): fix the fixture, never the assertion.

**R3 — Applier dry run.** `cd /c/Users/Public/repos/blindtastingapp-mapdetail && node --env-file=.env.local C:/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad/apply-migration.mjs supabase/migrations/20260927160000_levels_and_achievements.sql --dry`
Expected: `DRY RUN OK: 20260927160000_levels_and_achievements ran in N ms and was rolled back`. (The applier does not print NOTICEs; the level distribution is read in R5.)

**R4 — Apply.** At a quiet time, no LIVE reveal running: the same command without `--dry`. Expected: `APPLIED: 20260927160000_levels_and_achievements in N ms; history row: { version: '20260927160000', name: 'levels_and_achievements' }`. The migration is additive; the deployed app ignores the new tables until R6, and awards earned between R4 and R6 arrive as one "while you were away" card after the welcome.

**R5 — Calibration and the live suite.** Read-only (`begin read only … rollback`):
- `select level, count(*) from profile_levels group by level order by level desc` — §3.2 predicts L6 × 1, L5 × 1, L4 × 2, L3 × 7, L2 × 6, L1 × 21 for the 38 profiles of 2026-09-27; activity since can only raise levels.
- `select left(user_id::text, 8), xp, level from profile_levels order by xp desc, user_id limit 6` — §3.2: d3ee0f40 780 (6), f9d82d2a 557 (5), 95584be2 401 (4), 430f8450 400 (4), caa708a1 270 (3), ad5343d0 250 (3), plus anything earned since.
- `select count(*) filter (where seen_at is null) as unseen, count(*) as rows from xp_events` — unseen 0.
- `select (select count(*) from profile_levels where welcome_pending) = (select count(*) from profiles where deleted_at is null)` — true.
Then `cd /c/Users/Public/repos/blindtastingapp-mapdetail && node --env-file=.env.local --test scripts/levels.test.mjs` (no LEVELS_APPLY) → 25 pass against the applied schema.

**R6 — App deploy.** After the whole-branch review: fast-forward `master` to `levels` and push (a production deploy); wait for `gh api repos/christianolin/blindtastingapp/commits/<full sha>/status` to read `success`. Rollback is `git revert` + push (R9).

**R7 — Browser checklist** (spec §10.3) on https://blindrapp.vercel.app, Browser pane fronted, demo sessions from magic links, laptop and phone emulation (`resize_window` preset `mobile`, reset to `desktop` after), light and dark:
- Sidebar full (xl), rail (md–xl) and tablet drawer: ring, badge, no clipping in the 44 px rail link; dark mode.
- Phone drawer ring; /u/[id] own (live) and someone else's; the card collapsed and expanded; own "Not yet" progress; a PRIVATE cellar owner's cellar achievements absent for another viewer.
- /community cards (below xl) and table (xl): "Lv N" beside every name.
- The welcome card once per account; a reload shows nothing.
- Add a bottle from /cellar (the sheet) → "+5 XP · Bottle added" at once; /cellar/new; "+1 bottle"; the merge card's "Add N to the existing lot"; a drink; a note; a training reveal.
- Two demo sessions on a throwaway LIVE tasting (one account per tab, re-minted when switching — the tabs share a cookie jar): a reveal → the guest's card within ≈ 1 s; Finish → the host's card at once, the guest's within 6 s; a level-up card.
- Reduced-motion emulation: no slide, no ring transition. Two tabs: one card. A hidden tab: queued until fronted.
- Network idle for 5 minutes: no new periodic request.
- Server timing of an AppHeader page before and after (the owner's devices: desktop and iPhone Safari/Chrome).

**R8 — Watch and repair.** A person reporting a missing award: first read their `cellar_lots`, `cellar_consumptions` and `wset_notes` rows for crafted values (a `created_at` far from its neighbours, a reason edited to DRANK) — those tables are client-writable (R4) and a repair re-derives from the rows as they are now — then `select public.xp_replay_user('<user id>', false, false, true)` (owner-only; idempotent; `p_repair` pays a lot-less drink only when a pour links it and clamps every fact's time into the account's life; returns the XP it added). A swallowed error shows only as a Postgres WARNING (R10).

**R9 — Rollback.**
- App: `git revert` + push; the triggers keep awarding silently (harmless).
- One misbehaving trigger: `alter table public.<table> disable trigger <name>` (owner only), then `xp_replay_user(u, false, false, true)` per person once fixed.
- Full database rollback (after the app revert), then delete the history row `20260927160000`:

```sql
drop trigger if exists wines_xp_on_reveal on public.wines;
drop trigger if exists tastings_xp_on_close on public.tastings;
drop trigger if exists cellar_lots_xp_insert on public.cellar_lots;
drop trigger if exists cellar_lots_xp_update on public.cellar_lots;
drop trigger if exists cellar_consumptions_xp on public.cellar_consumptions;
drop trigger if exists wset_notes_xp_insert on public.wset_notes;
drop trigger if exists wset_notes_xp_identity on public.wset_notes;
drop trigger if exists training_attempts_xp on public.training_attempts;
drop trigger if exists friendships_xp on public.friendships;
drop trigger if exists profiles_deleted_drop_levels on public.profiles;
drop function if exists
  public.get_my_level_state(), public.mark_xp_seen(bigint[], boolean), public.get_my_achievement_progress(),
  public.xp_on_glass_revealed(), public.xp_on_tasting_closed(), public.xp_on_cellar_lot(),
  public.xp_on_cellar_consumption(), public.xp_on_wset_note(), public.xp_on_training_scored(),
  public.xp_on_friendship(), public.xp_drop_deleted_profile(),
  public.xp_replay_user(uuid, boolean, boolean, boolean),
  public.xp_award_training(uuid, timestamptz, boolean, boolean),
  public.xp_award_note(uuid, timestamptz, boolean, boolean),
  public.xp_award_drink(uuid, timestamptz, boolean, boolean, boolean),
  public.xp_award_cellar_lot(uuid, integer, integer, timestamptz, boolean, boolean),
  public.xp_award_tasting_close(uuid, uuid, timestamptz, boolean, boolean),
  public.xp_award_guess(uuid, timestamptz, boolean, boolean),
  public.xp_check_achievements(uuid, text, timestamptz, boolean, boolean),
  public.xp_achievement_metric(uuid, text),
  public.xp_tasting_won_by(uuid, uuid), public.xp_tasting_player(uuid, uuid),
  public.xp_cellar_on_hand(uuid), public.xp_consumption_masked(uuid),
  public.xp_award(uuid, text, text, integer, integer, text, timestamptz, boolean),
  public.level_for_xp(integer);
drop table if exists public.profile_achievements, public.xp_events, public.profile_levels,
  public.achievements, public.xp_sources;
-- wset_notes_author_idx and tasting_participants_user_idx may stay.
delete from supabase_migrations.schema_migrations where version = '20260927160000';
```

**R10 — Risks the main session watches.**
- Reveal latency: every guesser's award re-checks their locked Tastings achievements; `winner` scans each of their closed tastings until they have won once, and `guesses` has no index on `participant_id` (L24 forbids adding one). R2 logs an 8-guesser reveal; if it grows past ~200 ms in production, narrow the reveal's check to `perfect_glass`/`glasses_50` in a follow-up.
- Server actions run one at a time per client: a `markXpSeen` in flight delays the next user action by one round trip (~100–300 ms).
- A deadlock between two concurrent writes for overlapping people (e.g. a platform-invite accept and a friend accept on the same pair) is caught inside the XP trigger (L20): the write succeeds, the award waits for `xp_replay_user`.
- R2 holds trigger-creation locks on eight production tables per test; run it when nobody is tasting.
- If Probe P1 failed and F1 shipped, the cards inside a section layout show on the next navigation or tab return, not at once.

---

## Self-review (done while writing)

- **Spec coverage:** L1–L36 and §2–§11 map to Tasks 1–9 and R0–R9; §10.1's 22 DB tests are 23 here (9 split into 9a/9b, 11 and 12 merged, 13b added for the hidden-glass note's XP); §10.2's five vitest files are nine here (plus snapshot, ring, card, the toaster's first paint, the pill and the L33 pin).
- **Verified in a scratch copy of this branch:** every TS/TSX file and edit in this plan compiles (`tsc`), lints clean (`eslint`), and the full vitest run is 224 files / 4,218 tests passed; `node --check` passes on the DB suite; the migration's pre-state passes against live read-only, every plpgsql body compiles against live, the SQL helpers `PREPARE` against live, and §3.2's activity XP recomputes exactly.
- **Not verifiable without a write:** the DB suite's behaviour and the post-state's predicted `pg_get_*` strings — R2 is their first run.
