# Training Room — Region Guess Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The training room's candidate list groups the typical wines by scoring region, and "Your call" lets the taster stop at the region (optionally naming a grape) or go deeper to one of its typical wines, scored in SQL by the one scoring source.

**Architecture:** The matcher is untouched; a new pure module (`src/lib/training/groups.ts`) regroups its ranking by `regions` row, and a second (`src/lib/training/call.ts`) holds Your call's rules (region options, grape chips, how a tap changes the pick, the pick the attempt stores). The laptop column and phone sheet render region rows that expand in place to the existing wine rows; Your call becomes region → go deeper → grape. `training_attempts` gains `picked_region_id` / `picked_grape_id` with two checks, and `record_training_attempt` is recreated from its live body (md5-pinned before and after) with a region branch in step 4. The device draft, the finish payload, the history read and the result/history lines carry the new pick.

**Tech Stack:** Next.js App Router (TypeScript, React client components), Tailwind tokens, base-ui (`@base-ui/react`), Supabase Postgres (plpgsql, RLS), vitest (pure modules, node env), node:test DB suite (`scripts/training-room.test.mjs`, rolled-back transactions against live).

**Spec:** `docs/superpowers/specs/2026-09-27-training-room-region-guess.md` (the binding design, R1–R11) and its base `docs/superpowers/specs/2026-09-25-training-room-design.md` (§5 matcher, §6 RPC, §9 copy; D1–D22 still hold). Executors read both.

**Verified before writing.** Every code block below was built in a scratch copy of this worktree at `c5143a1` (`src/`, `scripts/`, `tsconfig.json`, `vitest.config.mts`, `eslint.config.mjs`, `package.json`, `node_modules` junctioned) and checked task by task: `npx tsc --noEmit` exits 0, `npx eslint` prints nothing on every touched file, `node --check scripts/training-room.test.mjs` passes, and `npx vitest run src/lib/training` passes the exact counts stated in each task. The live `record_training_attempt` body was read read-only (`begin read only` … `rollback`) with `pg_get_functiondef`: it is byte-for-byte the `20260925120000_training_room.sql` body, md5 of `prosrc` (CRs stripped) `79b65a0e38ea00be8b8adcc771abcc60` — the same method reproduces that value from the file. The new body's md5 `f6a24c83c24aaab34ab568dc6280083f` was computed the same way from the Task 1 file. The migration SQL and the six new DB tests have NOT been executed (no writes were allowed while planning): the main session's dry run (Task 1, Step 8) is their first execution.

## Global Constraints

- Every shell command starts with `cd /c/Users/Public/repos/blindtastingapp-friends && …` (worktree, branch `training-region-guess`, base production master `eb14ffd`). Never write under `C:\Users\Public\repos\blindtastingapp`.
- Implementers never touch the live database: no applier, no DB suite run, no dev server. The main session runs the applier (`node --env-file=.env.local <scratchpad>/apply-migration.mjs <file> [--dry]`), the DB suite and the browser checklist. No Anthropic API call anywhere (AGENTS.md).
- Design tokens only (`bg-primary`, `bg-muted-foreground`, `bg-muted`, `border-border`, `border-border-light`, `bg-gold/10`, `text-muted-foreground`, …); no hex or arbitrary colour. Light by default; `.dark` follows.
- Every tap target is 44 px on touch: `min-h-11 md:pointer-fine:min-h-0` (the `TAP` constant each component already declares).
- Every form value is React state (the region search, the grape pick, the vintage); never an uncontrolled `defaultValue` input.
- A `"use server"` file exports only async functions: `src/app/taste/training/actions.ts` is not changed; shared shapes stay in the plain `src/lib/training/action-types.ts`.
- Pure modules under `src/lib/training/` import relatively (never `@/`), so vitest (no alias) loads them.
- All room copy lives in `src/lib/training/copy.ts`; the R10 strings are verbatim: "Which region is it?", "Search regions…", "It's not in the list", "Go deeper (optional)", "Just the region", "Grape (optional)", "Other grape…", "Search grapes…", "best: {shortName}", "Show all {n} regions", "You said {region} · {grape}". Existing strings keep their wording; the strip is the one line R4 rewrites.
- The WSET sheet / app-header fixes on master must not regress (`eb14ffd`, `ffbc41e`): do not edit `src/components/wset/wset-sheet.tsx`, `src/components/app-header.tsx` or `src/app/globals.css`; `src/app/taste/training/page.tsx` keeps its `flex flex-1 flex-col` wrapper, `<AppHeader>` and `<main>` exactly.
- The working tree is CRLF (`core.autocrlf=true`); the Edit tool matches either ending, and git normalises new files.
- Commits: `GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit …`, message ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only what the task lists; never push.

## Review Focus

1. A draft saved by the live build (a typical wine picked, no `pickedRegionId` / `pickedGrapeId` keys) — Continue must show that wine's region with the wine selected, and the finish must send the wine alone. Pinned by Task 4's draft test "reads a draft saved before the region step…" and Task 2's `normalizeCall` test "gives a typical wine its own region".
2. The picked region drops out of the top five as the taster keeps describing — it must stay listed and checked in Your call. Pinned by Task 2's `regionCallOptions` test "keeps a picked one from further down".
3. A grape chosen through "Other grape…" that none of the region's typical wines name — it must show as a pressed chip, and changing the region must clear it. Pinned by Task 2's `grapeChips` and `chooseRegion` tests.
4. A capped wine's number must never lift its region above the region's best uncapped wine, and a region whose wines are all capped must sit under "Unlikely from what you've said". Pinned by Task 2's `groupRanking` tests and `regionPanelView` "…under the unlikely heading".
5. A leading wine whose short name is its region's own ("A typical Champagne" in Champagne) — the strip must read "Top match: Champagne 88 %", never "Champagne · Champagne 88 %". Pinned by Task 2's `stripLine` test "names the region once…".

## Spec coverage and interpretations

R1–R3 (groups, best-member closeness, the grouped list) → Tasks 2 and 3. R4 (strip) → Task 2 (`stripLine`), shown by Task 3's strip. R5 (two-step call) → rules in Task 2, UI in Task 5. R6–R7 (scoring, storage, checks, md5-pinned recreate, grants) → Task 1, with the client-side check in Task 4. R8 (result and history lines) → Task 4. R9 (snapshot) → deliberately untouched (`snapshotRanking` and `candidates_snapshot` unchanged). R10 (copy) → Tasks 2 and 5. R11 (grapes preloaded, no new content or API) → Task 5. Spec §3's tests → Tasks 1, 2 and 4; its browser pass → the checklist at the end.

Where the addendum is silent, this plan chooses (flagged for the owner's review):
- The strip names the region once when the leading wine is named like it ("Top match: Champagne 88 %", not "Champagne · Champagne").
- "Search regions…" also finds a region through one of its typical wines or appellations ("chablis" → Bourgogne), since a taster who thinks "Chablis" types that.
- Before any answer a region row has no "best:" line (there is no best without numbers).
- Choosing a typical wine hides the grape step but keeps the grape in the draft (going back to "Just the region" shows it again); `callPayload` never sends it with a wine.
- A region pick's result line keeps today's vintage suffix: "You said Bourgogne · Chardonnay, 2019".
- Continue drops a stored wine or region that has left the pool (and a grape without a region) rather than sending an id the RPC would refuse.

## File map

| File | Task | Responsibility |
|---|---|---|
| `supabase/migrations/20260927100000_training_region_guess.sql` | 1 (create) | two pick columns, two checks, the RPC's region branch, grants, pre/post asserts with md5 pins |
| `scripts/training-room.test.mjs` | 1 | six DB tests for R6/R7 (rolled back) |
| `src/lib/supabase/database.types.ts` | 1 | `training_attempts` Row/Insert, the RPC comment |
| `src/lib/training/groups.ts` (+ test) | 2 (create) | `groupRanking`, `findMember`, `regionPanelView`, `groupExpanded`, `toggleGroup` |
| `src/lib/training/call.ts` (+ test) | 2 (create) | `regionCallOptions`, `regionGrapeChoices`, `grapeChips`, `chooseRegion/Deeper/Grape`, `normalizeCall`, `callPayload`, `NO_CALL` |
| `src/lib/training/types.ts` | 2, 4 | `RegionGroup`, `CallPick`; `TrainingDraft` / `AttemptRow` pick fields |
| `src/lib/training/copy.ts` (+ test) | 2, 3, 4, 5 | R10 strings, R4 strip, group lines, "You said" lines |
| `src/lib/training/panel.ts` (+ test) | 3, 5 | drops `panelView` (Task 3) and `yourCallOptions` (Task 5) |
| `src/app/taste/training/candidates-panel.tsx`, `candidates-sheet.tsx`, `candidates-strip.tsx` | 3 | region rows, expand/collapse, Show all N regions |
| `src/lib/training/draft.ts`, `action-types.ts`, `attempt-payload.ts`, `pool-shape.ts`, `pool.ts` (+ tests) | 4 | the pick in the draft, the payload, the history read |
| `src/app/taste/training/result-view.tsx`, `training-room.tsx` | 4, 5 | the result line; start / continue / finish; Your call wiring |
| `src/app/taste/training/your-call.tsx`, `page.tsx` | 5 | the two-step call; the grapes read |
| `CLAUDE.md` | 6 | the Training room bullet |

Task order is 1 → 6. Tasks 2–6 build and test without the database; the app code from Task 4 on selects the new columns, so the migration must be live before any browser check (see "Rollout").

---

### Task 1: Migration, generated types and the DB suite

**Files:**
- Create: `supabase/migrations/20260927100000_training_region_guess.sql`
- Modify: `scripts/training-room.test.mjs` (header comment, `refs()`, six tests appended at the end)
- Modify: `src/lib/supabase/database.types.ts` (`training_attempts` Row and Insert; the `record_training_attempt` comment)

**Interfaces:**
- Consumes: the live `record_training_attempt(jsonb,jsonb,jsonb)` body (md5 `79b65a0e38ea00be8b8adcc771abcc60`), `save_wset_note` (md5 `9ac29b18bbda5b08bcd9a12e19beb932`), `wset_hue_fits_colour` (md5 `96339c7d5a5a84074ffc33db8e89d6ba`).
- Produces: `training_attempts.picked_region_id uuid → regions(id) on delete set null`, `training_attempts.picked_grape_id uuid → grapes(id) on delete set null`, checks `training_attempts_one_pick` and `training_attempts_grape_needs_region`; `p_attempt` accepts `picked_region_id?` and `picked_grape_id?` (uuid strings) on a fresh attempt; new refusals `no such region` / `no such grape` (22023) and the checks' 23514. The return shape of the RPC is unchanged. `database.types.ts`: `training_attempts.Row.picked_region_id: string | null`, `.picked_grape_id: string | null` (Insert: optional).

The migration is written by the implementer and applied ONLY by the main session. The implementer's gates are `node --check`, eslint, tsc and a local md5 check of the function body.

- [ ] **Step 1: Write the failing DB tests**

In `scripts/training-room.test.mjs`, replace the header's first paragraph:

```js
// Training room DB suite (spec docs/superpowers/specs/2026-09-25-training-room-design.md
// §10): the TRAINING branch of wset_notes_one_identity, record_training_attempt
// (fresh attempts, re-reveals, the championship points, D17's style verdict,
// the hue rule, idempotency, refusals and grants), training_attempts' RLS and
// grants, the account-deletion scrub and the 15-row archetype back-fill of
// 20260925120000_training_room.sql.
```

with:

```js
// Training room DB suite (spec docs/superpowers/specs/2026-09-25-training-room-design.md
// §10): the TRAINING branch of wset_notes_one_identity, record_training_attempt
// (fresh attempts, re-reveals, the championship points, D17's style verdict,
// the hue rule, idempotency, refusals and grants), training_attempts' RLS and
// grants, the account-deletion scrub and the 15-row archetype back-fill of
// 20260925120000_training_room.sql; and the region pick of
// 20260927100000_training_region_guess.sql (region-guess addendum §3: its
// scoring, checks, columns and re-reveal).
```

and, in the same header, the dry-run example:

```js
//   TRAINING_ROOM_APPLY=supabase/migrations/20260925120000_training_room.sql \
//     node --env-file=.env.local --test scripts/training-room.test.mjs
```

with:

```js
//   TRAINING_ROOM_APPLY=supabase/migrations/20260927100000_training_region_guess.sql \
//     node --env-file=.env.local --test scripts/training-room.test.mjs
```

In `refs()`, after `bourgogne: await region("France", "Bourgogne"),` add one line (the live row "Rioja" under Spain is exactly one row, checked read-only):

```js
    rioja: await region("Spain", "Rioja"),
```

Append at the end of the file (after the batch-1 test's closing `});`):

```js
// --- The region pick (region-guess addendum R6, R7; 20260927100000) --------------

test("a region pick with the right region and grape scores country 2, region 3 and grape 8", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const w = await wine(a, margauxBottle(r));
    const out = await fresh(a, { picked_region_id: r.bordeaux, picked_grape_id: r.cabernet, actual_catalog_wine_id: w });
    assert.deepEqual(out.points, {
      country: 2,
      region: 3,
      appellation: 0,
      primary_grape: 8,
      secondary_grape: 0,
      type_designation: null,
      vintage: null,
    });
    assert.equal(out.total, 13);
    assert.equal(out.possible, 20, "possible depends on the wine, not the pick");
    assert.equal(out.actual_archetype_id, r.margaux, "the style verdict is unchanged");
    const row = await attemptRow(out.attempt_id);
    assert.equal(row.picked_archetype_id, null);
    assert.equal(row.picked_region_id, r.bordeaux);
    assert.equal(row.picked_grape_id, r.cabernet);

    // A designation on the wine is 0 for a region pick (it names none); the vintage scores as before.
    const gcc = await wine(a, margauxBottle(r, { designation: r.grandCruClasse }));
    const designated = await fresh(a, {
      picked_region_id: r.bordeaux,
      picked_grape_id: r.cabernet,
      guessed_vintage_kind: "YEAR",
      guessed_vintage_year: 2015,
      actual_catalog_wine_id: gcc,
    });
    assert.deepEqual(designated.points, {
      country: 2,
      region: 3,
      appellation: 0,
      primary_grape: 8,
      secondary_grape: 0,
      type_designation: 0,
      vintage: 2,
    });
    assert.equal(designated.total, 15);
    assert.equal(designated.possible, 24);

    // A wine with no second grape: that row does not apply, as for a typical-wine pick.
    const plain = await wine(a, margauxBottle(r, { secondary: null }));
    const single = await fresh(a, { picked_region_id: r.bordeaux, actual_catalog_wine_id: plain });
    assert.equal(single.points.secondary_grape, null);
    assert.equal(single.possible, 18);
  });
});

test("a region pick with a wrong grape or none scores 5; another region only its country", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const w = await wine(a, margauxBottle(r));
    // Merlot is this wine's second grape: a region pick's one grape is scored as the primary only.
    const wrongGrape = await fresh(a, { picked_region_id: r.bordeaux, picked_grape_id: r.merlot, actual_catalog_wine_id: w });
    assert.deepEqual(wrongGrape.points, {
      country: 2,
      region: 3,
      appellation: 0,
      primary_grape: 0,
      secondary_grape: 0,
      type_designation: null,
      vintage: null,
    });
    assert.equal(wrongGrape.total, 5);
    const noGrape = await fresh(a, { picked_region_id: r.bordeaux, actual_catalog_wine_id: w });
    assert.equal(noGrape.points.primary_grape, 0);
    assert.equal(noGrape.total, 5);
    const neighbour = await fresh(a, { picked_region_id: r.bourgogne, picked_grape_id: r.cabernet, actual_catalog_wine_id: w });
    assert.deepEqual([neighbour.points.country, neighbour.points.region, neighbour.points.primary_grape], [2, 0, 8]);
    assert.equal(neighbour.total, 10);
    const abroad = await fresh(a, { picked_region_id: r.rioja, actual_catalog_wine_id: w });
    assert.deepEqual([abroad.points.country, abroad.points.region], [0, 0]);
    assert.equal(abroad.total, 0);
  });
});

test("a typical-wine pick scores exactly as before and stores no region or grape", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const w = await wine(a, margauxBottle(r));
    const out = await fresh(a, { picked_archetype_id: r.margaux, actual_catalog_wine_id: w });
    assert.deepEqual(out.points, {
      country: 2,
      region: 3,
      appellation: 5,
      primary_grape: 8,
      secondary_grape: 2,
      type_designation: null,
      vintage: null,
    });
    assert.equal(out.total, 20);
    assert.equal(out.possible, 20);
    const row = await attemptRow(out.attempt_id);
    assert.equal(row.picked_region_id, null);
    assert.equal(row.picked_grape_id, null);
  });
});

test("both picks, a grape without a region and unknown ids are refused, and nothing is written", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    await expectError(
      () => fresh(a, { picked_archetype_id: r.margaux, picked_region_id: r.bordeaux }),
      "23514",
      'new row for relation "training_attempts" violates check constraint "training_attempts_one_pick"',
    );
    await expectError(
      () => fresh(a, { picked_grape_id: r.cabernet }),
      "23514",
      'new row for relation "training_attempts" violates check constraint "training_attempts_grape_needs_region"',
    );
    await expectError(() => fresh(a, { picked_region_id: randomUUID() }), "22023", "no such region");
    await expectError(
      () => fresh(a, { picked_region_id: r.bordeaux, picked_grape_id: randomUUID() }),
      "22023",
      "no such grape",
    );
    await asOwner();
    const counts = (
      await client.query(
        `select (select count(*)::int from training_attempts where author_id = $1) attempts,
                (select count(*)::int from wset_notes where author_id = $1) notes`,
        [a],
      )
    ).rows[0];
    assert.deepEqual(counts, { attempts: 0, notes: 0 }, "a refused call keeps neither the attempt nor its note");
  });
});

test("Reveal now scores a stored region pick and ignores the payload's pick", async () => {
  await withRollback(async () => {
    const [a] = await freshProfiles(1);
    const r = await refs();
    const unrevealed = await fresh(a, { picked_region_id: r.bourgogne, picked_grape_id: r.pinotNoir });
    assert.equal(unrevealed.total, null);
    const w = await wine(a, {
      country: r.france,
      region: r.bourgogne,
      appellation: r.vosneAoc,
      primary: r.pinotNoir,
      producer: r.producer,
    });
    await asUser(a);
    const out = await record({}, [], {
      attempt_id: unrevealed.attempt_id,
      actual_catalog_wine_id: w,
      picked_archetype_id: r.margaux,
      picked_region_id: r.bordeaux,
    });
    assert.deepEqual(out.points, {
      country: 2,
      region: 3,
      appellation: 0,
      primary_grape: 8,
      secondary_grape: null,
      type_designation: null,
      vintage: null,
    });
    assert.equal(out.total, 13);
    assert.equal(out.possible, 18);
    assert.equal(out.actual_archetype_id, r.vosne);
    const row = await attemptRow(unrevealed.attempt_id);
    assert.deepEqual([row.picked_archetype_id, row.picked_region_id, row.picked_grape_id], [null, r.bourgogne, r.pinotNoir]);
  });
});

test("training_attempts carries the two pick columns, their checks and their foreign keys", async () => {
  await withRollback(async () => {
    await asOwner();
    const defs = (
      await client.query(
        `select conname, regexp_replace(pg_get_constraintdef(oid), '\\mpublic\\.', '', 'g') def
           from pg_constraint
          where conrelid = 'public.training_attempts'::regclass
            and conname = any($1::text[])
          order by conname collate "C"`,
        [
          [
            "training_attempts_grape_needs_region",
            "training_attempts_one_pick",
            "training_attempts_picked_grape_id_fkey",
            "training_attempts_picked_region_id_fkey",
          ],
        ],
      )
    ).rows;
    assert.deepEqual(defs, [
      {
        conname: "training_attempts_grape_needs_region",
        def: "CHECK (((picked_grape_id IS NULL) OR (picked_region_id IS NOT NULL)))",
      },
      {
        conname: "training_attempts_one_pick",
        def: "CHECK (((picked_archetype_id IS NULL) OR (picked_region_id IS NULL)))",
      },
      {
        conname: "training_attempts_picked_grape_id_fkey",
        def: "FOREIGN KEY (picked_grape_id) REFERENCES grapes(id) ON DELETE SET NULL",
      },
      {
        conname: "training_attempts_picked_region_id_fkey",
        def: "FOREIGN KEY (picked_region_id) REFERENCES regions(id) ON DELETE SET NULL",
      },
    ]);
  });
});
```

- [ ] **Step 2: Syntax and lint only (implementer); the failing run is the main session's**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && node --check scripts/training-room.test.mjs && npx eslint scripts/training-room.test.mjs`
Expected: no output.

Main session only, before the migration exists anywhere: `cd /c/Users/Public/repos/blindtastingapp-friends && node --env-file=.env.local --test --test-reporter=tap --test-reporter-destination=stdout scripts/training-room.test.mjs`
Expected: `# tests 23`, `# pass 17`, `# fail 6` — each new test fails on `column "picked_region_id" does not exist` or on an RPC that ignores the region keys (e.g. `country: 0` where 2 was expected, and the checks' 23514 never raised).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260927100000_training_region_guess.sql` with exactly this content (the function body is the live one plus the region branch; do not reformat it — its md5 is pinned):

```sql
-- Training room: a call may stop at the region (and name a grape).
--
-- Spec: docs/superpowers/specs/2026-09-27-training-room-region-guess.md (R6,
-- R7), extending docs/superpowers/specs/2026-09-25-training-room-design.md
-- §6.1-§6.2. Plan: docs/superpowers/plans/2026-09-27-training-room-region-guess.md,
-- Task 1. Additive for the deployed app: two nullable columns, two checks, and
-- record_training_attempt gains a branch the deployed app never takes (it
-- never sends picked_region_id or picked_grape_id).
--
-- Written against the LIVE state (read-only, 2026-09-27), never an older
-- migration file alone:
-- * record_training_attempt(jsonb,jsonb,jsonb): md5 79b65a0e38ea00be8b8adcc771abcc60
--   (the 20260925120000 body, byte for byte), SECURITY DEFINER, search_path
--   public, EXECUTE held by its owner and authenticated only. Recreated below
--   from that body with the region branch added and nothing else changed.
-- * save_wset_note(jsonb,jsonb) md5 9ac29b18bbda5b08bcd9a12e19beb932 and
--   wset_hue_fits_colour(wset_colour_hue,wine_colour) md5
--   96339c7d5a5a84074ffc33db8e89d6ba are called, not changed.
-- * training_attempts: the 24 columns and 13 constraints of 20260925120000,
--   one live row (a typical-wine pick). grapes: 276 rows; wine_archetypes: 102
--   rows in 43 regions.
--
-- What this migration does:
-- 1. training_attempts.picked_region_id (-> regions, on delete set null) and
--    picked_grape_id (-> grapes, on delete set null); checks: never a typical
--    wine and a region together, and a grape only with a region (R7).
-- 2. record_training_attempt reads picked_region_id / picked_grape_id from
--    p_attempt on a fresh attempt ("no such region" / "no such grape" when
--    they name no row; a re-reveal keeps the stored pick, as before) and
--    scores a region pick (R6): country 2 and region 3 by the region's own
--    country_id / id, appellation 0, primary grape 8 when the picked grape is
--    the wine's primary grape, second grape 0 when the wine has one (null when
--    not), designation 0 when the wine has one (null when not), vintage as
--    before. A typical-wine pick scores exactly as before; possible_points and
--    D17's style verdict (which prefers the picked typical wine; a region pick
--    has none) are unchanged.
-- 3. EXECUTE re-granted to authenticated only (PUBLIC, anon, service_role
--    revoked), as 20260925120000 did.
--
-- Rule 1: nothing here reads or writes a tasting, glass, guess or answer key.
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
  -- 1. The RPC this file recreates: one overload, the live body, its attributes.
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'record_training_attempt';
  if v_text is distinct from 'record_training_attempt(jsonb,jsonb,jsonb)' then
    raise exception 'record_training_attempt overloads are %, expected the one (jsonb,jsonb,jsonb)', coalesce(v_text, 'none');
  end if;
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
       where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure)
     is distinct from '79b65a0e38ea00be8b8adcc771abcc60' then
    raise exception 'record_training_attempt is not the 20260925120000 body this file recreates; re-read live before applying';
  end if;
  if not exists (select 1 from pg_proc p
                 where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure
                   and p.prosecdef and p.proconfig::text = '{search_path=public}') then
    raise exception 'record_training_attempt is not SECURITY DEFINER with search_path public';
  end if;

  -- 2. What it calls without changing.
  select string_agg(s.sig, ', ') into v_text
  from (values
    ('public.save_wset_note(jsonb,jsonb)',                       '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.wset_hue_fits_colour(wset_colour_hue,wine_colour)', '96339c7d5a5a84074ffc33db8e89d6ba')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'a function the RPC calls differs from live: %', v_text;
  end if;

  -- 3. training_attempts as 20260925120000 left it: no pick column added yet.
  select string_agg(a.attname, ', ' order by a.attnum) into v_text
  from pg_attribute a
  where a.attrelid = 'public.training_attempts'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'id, author_id, session_key, note_id, picked_archetype_id, guessed_vintage_kind, guessed_vintage_year, '
       || 'guessed_vintage_tawny_years, actual_catalog_wine_id, actual_archetype_id, note_colour_hue, hue_cleared, '
       || 'candidates_snapshot, country_points, region_points, appellation_points, primary_grape_points, '
       || 'secondary_grape_points, type_designation_points, vintage_points, total_points, possible_points, '
       || 'scored_at, created_at' then
    raise exception 'training_attempts columns differ from the live state this file was written against: %', v_text;
  end if;
  select string_agg(k.conname, ', ' order by k.conname::text collate "C") into v_text
  from pg_constraint k
  where k.conrelid = 'public.training_attempts'::regclass;
  if v_text is distinct from
       'training_attempts_actual_archetype_id_fkey, training_attempts_actual_catalog_wine_id_fkey, '
       || 'training_attempts_author_id_fkey, training_attempts_author_id_session_key_key, '
       || 'training_attempts_guessed_vintage_year_check, training_attempts_note_id_fkey, training_attempts_note_id_key, '
       || 'training_attempts_picked_archetype_id_fkey, training_attempts_pkey, training_attempts_scored_when_revealed, '
       || 'training_attempts_snapshot_is_array, training_attempts_vintage_tawny_shape, training_attempts_vintage_year_shape' then
    raise exception 'training_attempts constraints differ from the live state this file was written against: %', v_text;
  end if;

  -- 4. The two tables the new columns reference, keyed by uuid.
  if (select format_type(a.atttypid, null) from pg_attribute a
       where a.attrelid = 'public.regions'::regclass and a.attname = 'id') is distinct from 'uuid'
     or (select format_type(a.atttypid, null) from pg_attribute a
          where a.attrelid = 'public.grapes'::regclass and a.attname = 'id') is distinct from 'uuid' then
    raise exception 'regions.id or grapes.id is not a uuid';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The region pick (R7).
-- ---------------------------------------------------------------------------
alter table public.training_attempts
  add column picked_region_id uuid
    constraint training_attempts_picked_region_id_fkey references public.regions(id) on delete set null,
  add column picked_grape_id uuid
    constraint training_attempts_picked_grape_id_fkey references public.grapes(id) on delete set null,
  add constraint training_attempts_one_pick
    check (picked_archetype_id is null or picked_region_id is null),
  add constraint training_attempts_grape_needs_region
    check (picked_grape_id is null or picked_region_id is not null);

-- ---------------------------------------------------------------------------
-- 2. record_training_attempt: the 20260925120000 body with the region branch
--    (R6). Only the declarations, the fresh attempt's pick checks and insert,
--    and step 4's country, region and primary grape lines change.
-- ---------------------------------------------------------------------------
create or replace function public.record_training_attempt(p_note jsonb, p_aromas jsonb, p_attempt jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  -- The championship maxima (spec D7); the DB suite pins each to reveal_wine's.
  c_country constant smallint := 2;
  c_region constant smallint := 3;
  c_appellation constant smallint := 5;
  c_primary_grape constant smallint := 8;
  c_secondary_grape constant smallint := 2;
  c_type_designation constant smallint := 2;
  c_vintage constant smallint := 2;
  c_vintage_near constant smallint := 1;
  v_uid uuid := auth.uid();
  v_attempt training_attempts%rowtype;
  v_attempt_id uuid;
  v_session uuid;
  v_started timestamptz;
  v_wine_id uuid;
  v_wine catalog_wines%rowtype;
  v_pick_id uuid;
  v_pick wine_archetypes%rowtype;
  v_has_pick boolean := false;
  -- A pick that stopped at the region (region-guess addendum R6, R7).
  v_region_pick_id uuid;
  v_grape_pick_id uuid;
  v_region_country uuid;
  v_has_region boolean := false;
  v_note jsonb;
  v_hue wset_colour_hue;
  v_identities int;
  v_cleared boolean := false;
  v_note_id uuid;
  v_kind vintage_kind;
  v_score boolean := false;
  v_country smallint;
  v_region smallint;
  v_appellation smallint;
  v_primary smallint;
  v_secondary smallint;
  v_designation smallint;
  v_vintage smallint;
  v_actual uuid;
begin
  -- 1. Signed in.
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if p_attempt is null or jsonb_typeof(p_attempt) <> 'object' then
    raise exception 'the attempt must be an object' using errcode = 'invalid_parameter_value';
  end if;
  v_attempt_id := nullif(p_attempt ->> 'attempt_id', '')::uuid;
  v_wine_id := nullif(p_attempt ->> 'actual_catalog_wine_id', '')::uuid;
  if v_wine_id is not null then
    -- Read as the definer: "catalog read" may hide a blind_pending row from
    -- the caller, and the score is still computed (step 4).
    select * into v_wine from catalog_wines where id = v_wine_id;
    if not found then
      raise exception 'no such wine' using errcode = 'invalid_parameter_value';
    end if;
  end if;

  if v_attempt_id is null then
    -- 2. A fresh attempt, idempotent on (caller, session key): a second tab
    --    or a reload returns the first attempt unchanged.
    v_session := nullif(p_attempt ->> 'session_key', '')::uuid;
    if v_session is null then
      raise exception 'a session key is required' using errcode = 'invalid_parameter_value';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('training-session:' || v_uid::text || ':' || v_session::text, 0));
    select * into v_attempt from training_attempts where author_id = v_uid and session_key = v_session;
    if not found then
      if p_note is null or jsonb_typeof(p_note) <> 'object' then
        raise exception 'the note must be an object' using errcode = 'invalid_parameter_value';
      end if;
      if nullif(p_note ->> 'id', '') is not null then
        raise exception 'a new session takes no note id' using errcode = 'insufficient_privilege';
      end if;
      if p_aromas is not null and jsonb_typeof(p_aromas) <> 'array' then
        raise exception 'the aromas must be a list' using errcode = 'invalid_parameter_value';
      end if;
      if jsonb_typeof(coalesce(p_attempt -> 'candidates_snapshot', '[]'::jsonb)) <> 'array' then
        raise exception 'the ranking must be a list' using errcode = 'invalid_parameter_value';
      end if;
      v_pick_id := nullif(p_attempt ->> 'picked_archetype_id', '')::uuid;
      if v_pick_id is not null and not exists (select 1 from wine_archetypes where id = v_pick_id) then
        raise exception 'no such typical wine' using errcode = 'invalid_parameter_value';
      end if;
      -- A region pick, optionally with a grape. The table's checks refuse a
      -- typical wine and a region together, and a grape without a region.
      v_region_pick_id := nullif(p_attempt ->> 'picked_region_id', '')::uuid;
      if v_region_pick_id is not null and not exists (select 1 from regions where id = v_region_pick_id) then
        raise exception 'no such region' using errcode = 'invalid_parameter_value';
      end if;
      v_grape_pick_id := nullif(p_attempt ->> 'picked_grape_id', '')::uuid;
      if v_grape_pick_id is not null and not exists (select 1 from grapes where id = v_grape_pick_id) then
        raise exception 'no such grape' using errcode = 'invalid_parameter_value';
      end if;
      v_started := coalesce(nullif(p_attempt ->> 'started_at', '')::timestamptz, now());
      v_hue := nullif(p_note ->> 'colour_hue', '')::wset_colour_hue;
      v_note := (p_note - 'id') || jsonb_build_object(
        'context_kind', 'TRAINING',
        'tasting_wine_id', null,
        'unidentified_wine_id', null,
        'catalog_wine_id', v_wine_id,
        'tasted_on', (v_started at time zone 'UTC')::date);
      -- 2b. A hue that does not fit the revealed wine's colour would be refused
      --     by wset_notes_check_hue: drop it from the note, keep it on the attempt.
      if v_wine_id is not null and not wset_hue_fits_colour(v_hue, v_wine.colour) then
        v_note := jsonb_set(v_note, '{colour_hue}', 'null'::jsonb);
        v_cleared := true;
      end if;
      v_note_id := save_wset_note(v_note, coalesce(p_aromas, '[]'::jsonb));
      v_kind := nullif(p_attempt ->> 'guessed_vintage_kind', '')::vintage_kind;
      insert into training_attempts (
        author_id, session_key, note_id, picked_archetype_id, picked_region_id, picked_grape_id,
        guessed_vintage_kind, guessed_vintage_year, guessed_vintage_tawny_years,
        note_colour_hue, hue_cleared, candidates_snapshot
      ) values (
        v_uid, v_session, v_note_id, v_pick_id, v_region_pick_id, v_grape_pick_id,
        v_kind,
        case when v_kind = 'YEAR' then (p_attempt ->> 'guessed_vintage_year')::smallint end,
        case when v_kind = 'TAWNY' then (p_attempt ->> 'guessed_vintage_tawny_years')::smallint end,
        v_hue, v_cleared, coalesce(p_attempt -> 'candidates_snapshot', '[]'::jsonb)
      )
      returning * into v_attempt;
      v_score := v_wine_id is not null;
    end if;
  else
    -- 3. A re-reveal of the caller's own unscored attempt: only the note's
    --    identity and the score are written; p_note, p_aromas, the pick, the
    --    vintage and the ranking are ignored.
    select * into v_attempt from training_attempts
     where id = v_attempt_id and author_id = v_uid
     for update;
    if not found then
      raise exception 'that session is not yours' using errcode = 'insufficient_privilege';
    end if;
    if v_attempt.scored_at is not null then
      raise exception 'already revealed' using errcode = 'P0001';
    end if;
    if v_wine_id is null then
      raise exception 'name the wine to reveal' using errcode = 'invalid_parameter_value';
    end if;
    select n.colour_hue, num_nonnulls(n.catalog_wine_id, n.unidentified_wine_id)
      into v_hue, v_identities
      from wset_notes n where n.id = v_attempt.note_id
     for update;
    if v_identities = 0 then
      v_cleared := not wset_hue_fits_colour(v_hue, v_wine.colour);
      update wset_notes
         set catalog_wine_id = v_wine_id,
             colour_hue = case when wset_hue_fits_colour(colour_hue, v_wine.colour) then colour_hue end
       where id = v_attempt.note_id and num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0;
    end if;
    v_score := true;
  end if;

  -- 4. Score against the named wine with the picked archetype's FKs, grapes
  --    and designations, or with the picked region's own FKs and the picked
  --    grape; no pick scores 0 on every category that applies.
  if v_score then
    if v_attempt.picked_archetype_id is not null then
      select * into v_pick from wine_archetypes where id = v_attempt.picked_archetype_id;
      v_has_pick := found;
    end if;
    if not v_has_pick and v_attempt.picked_region_id is not null then
      select r.country_id into v_region_country from regions r where r.id = v_attempt.picked_region_id;
      v_has_region := found;
    end if;
    v_country := case
      when v_has_pick and v_pick.country_id = v_wine.country_id then c_country
      when v_has_region and v_region_country = v_wine.country_id then c_country
      else 0
    end;
    v_region := case
      when v_has_pick and v_pick.region_id = v_wine.region_id then c_region
      when v_has_region and v_attempt.picked_region_id = v_wine.region_id then c_region
      else 0
    end;
    v_appellation := case when v_has_pick and v_pick.appellation_id = v_wine.appellation_id then c_appellation else 0 end;
    v_primary := case
      when v_has_pick and v_pick.primary_grape_id = v_wine.primary_grape_id then c_primary_grape
      when v_has_region and v_attempt.picked_grape_id = v_wine.primary_grape_id then c_primary_grape
      else 0
    end;
    v_secondary := case
      when v_wine.secondary_grape_id is null then null
      when v_has_pick and v_pick.secondary_grape_id = v_wine.secondary_grape_id then c_secondary_grape
      else 0
    end;
    v_designation := case
      when v_wine.type_designation_id is null then null
      when v_has_pick and exists (select 1 from wine_archetype_designations d
                                   where d.archetype_id = v_pick.id
                                     and d.type_designation_id = v_wine.type_designation_id) then c_type_designation
      else 0
    end;
    -- reveal_wine's vintage rule; null when no vintage was guessed.
    v_vintage := case
      when v_attempt.guessed_vintage_kind is null then null
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'NV' then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'TAWNY'
        and v_attempt.guessed_vintage_tawny_years = v_wine.vintage_tawny_years then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'YEAR'
        and v_attempt.guessed_vintage_year = v_wine.vintage_year then c_vintage
      when v_attempt.guessed_vintage_kind = v_wine.vintage_kind
        and v_wine.vintage_kind = 'YEAR'
        and abs(v_attempt.guessed_vintage_year - v_wine.vintage_year) = 1 then c_vintage_near
      else 0
    end;
    -- D17: the wine's own style. Same appellation, colour and style; else same
    -- region, primary grape, colour and style. Ties: the wine's designation,
    -- then the taster's pick, then an equal second grape, sort_order, id.
    select a.id into v_actual
      from wine_archetypes a
     where a.colour = v_wine.colour and a.style = v_wine.style
       and (a.appellation_id = v_wine.appellation_id
            or (a.region_id = v_wine.region_id and a.primary_grape_id = v_wine.primary_grape_id))
     order by (a.appellation_id = v_wine.appellation_id) desc,
              exists (select 1 from wine_archetype_designations d
                       where d.archetype_id = a.id
                         and d.type_designation_id = v_wine.type_designation_id) desc,
              (a.id is not distinct from v_attempt.picked_archetype_id) desc,
              (a.secondary_grape_id is not distinct from v_wine.secondary_grape_id) desc,
              a.sort_order,
              a.id
     limit 1;
    update training_attempts
       set actual_catalog_wine_id = v_wine_id,
           actual_archetype_id = v_actual,
           hue_cleared = v_cleared,
           country_points = v_country,
           region_points = v_region,
           appellation_points = v_appellation,
           primary_grape_points = v_primary,
           secondary_grape_points = v_secondary,
           type_designation_points = v_designation,
           vintage_points = v_vintage,
           total_points = v_country + v_region + v_appellation + v_primary
             + coalesce(v_secondary, 0) + coalesce(v_designation, 0) + coalesce(v_vintage, 0),
           possible_points = c_country + c_region + c_appellation + c_primary_grape
             + case when v_secondary is null then 0 else c_secondary_grape end
             + case when v_designation is null then 0 else c_type_designation end
             + case when v_vintage is null then 0 else c_vintage end,
           scored_at = now()
     where id = v_attempt.id
    returning * into v_attempt;
  end if;

  -- 5. The attempt as stored.
  return jsonb_build_object(
    'attempt_id', v_attempt.id,
    'note_id', v_attempt.note_id,
    'points', jsonb_build_object(
      'country', v_attempt.country_points,
      'region', v_attempt.region_points,
      'appellation', v_attempt.appellation_points,
      'primary_grape', v_attempt.primary_grape_points,
      'secondary_grape', v_attempt.secondary_grape_points,
      'type_designation', v_attempt.type_designation_points,
      'vintage', v_attempt.vintage_points),
    'total', v_attempt.total_points,
    'possible', v_attempt.possible_points,
    'actual_archetype_id', v_attempt.actual_archetype_id,
    'hue_cleared', v_attempt.hue_cleared);
end $$;

-- create or replace keeps the ACL; restated so this file alone says who may
-- call it (the 20260925120000 grant, and its OD-1 precedent: auth.uid() is
-- null for anon and service_role).
revoke all on function public.record_training_attempt(jsonb, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.record_training_attempt(jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. training_attempts: the columns of 20260925120000, then the two picks.
  select string_agg(format('%s %s%s%s', a.attname, t.typname,
                           case when a.attnotnull then ' not null' else '' end,
                           case when d.adbin is null then ''
                                else ' default ' || regexp_replace(pg_get_expr(d.adbin, d.adrelid), '\mpublic\.', '', 'g') end),
                    ', ' order by a.attnum)
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.training_attempts'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'id uuid not null default gen_random_uuid(), author_id uuid not null, session_key uuid not null, '
       || 'note_id uuid not null, picked_archetype_id uuid, guessed_vintage_kind vintage_kind, '
       || 'guessed_vintage_year int2, guessed_vintage_tawny_years int2, actual_catalog_wine_id uuid, '
       || 'actual_archetype_id uuid, note_colour_hue wset_colour_hue, hue_cleared bool not null default false, '
       || 'candidates_snapshot jsonb not null default ''[]''::jsonb, country_points int2, region_points int2, '
       || 'appellation_points int2, primary_grape_points int2, secondary_grape_points int2, '
       || 'type_designation_points int2, vintage_points int2, total_points int2, possible_points int2, '
       || 'scored_at timestamptz, created_at timestamptz not null default now(), '
       || 'picked_region_id uuid, picked_grape_id uuid' then
    raise exception 'training_attempts columns differ from R7: %', v_text;
  end if;

  -- 2. Its constraints: the 13 of 20260925120000 plus the four of R7.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.training_attempts'::regclass;
  if v_text is distinct from
       'training_attempts_actual_archetype_id_fkey FOREIGN KEY (actual_archetype_id) REFERENCES wine_archetypes(id) ON DELETE SET NULL; '
       || 'training_attempts_actual_catalog_wine_id_fkey FOREIGN KEY (actual_catalog_wine_id) REFERENCES catalog_wines(id) ON DELETE RESTRICT; '
       || 'training_attempts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'training_attempts_author_id_session_key_key UNIQUE (author_id, session_key); '
       || 'training_attempts_grape_needs_region CHECK (((picked_grape_id IS NULL) OR (picked_region_id IS NOT NULL))); '
       || 'training_attempts_guessed_vintage_year_check CHECK (((guessed_vintage_year >= 1900) AND (guessed_vintage_year <= 2100))); '
       || 'training_attempts_note_id_fkey FOREIGN KEY (note_id) REFERENCES wset_notes(id) ON DELETE CASCADE; '
       || 'training_attempts_note_id_key UNIQUE (note_id); '
       || 'training_attempts_one_pick CHECK (((picked_archetype_id IS NULL) OR (picked_region_id IS NULL))); '
       || 'training_attempts_picked_archetype_id_fkey FOREIGN KEY (picked_archetype_id) REFERENCES wine_archetypes(id) ON DELETE SET NULL; '
       || 'training_attempts_picked_grape_id_fkey FOREIGN KEY (picked_grape_id) REFERENCES grapes(id) ON DELETE SET NULL; '
       || 'training_attempts_picked_region_id_fkey FOREIGN KEY (picked_region_id) REFERENCES regions(id) ON DELETE SET NULL; '
       || 'training_attempts_pkey PRIMARY KEY (id); '
       || 'training_attempts_scored_when_revealed CHECK (((actual_catalog_wine_id IS NULL) = (scored_at IS NULL))); '
       || 'training_attempts_snapshot_is_array CHECK ((jsonb_typeof(candidates_snapshot) = ''array''::text)); '
       || 'training_attempts_vintage_tawny_shape CHECK (((guessed_vintage_kind IS DISTINCT FROM ''TAWNY''::vintage_kind) OR (guessed_vintage_tawny_years IS NOT NULL))); '
       || 'training_attempts_vintage_year_shape CHECK (((guessed_vintage_kind IS NULL) OR ((guessed_vintage_kind = ''YEAR''::vintage_kind) = (guessed_vintage_year IS NOT NULL))))' then
    raise exception 'training_attempts constraints differ from R7: %', v_text;
  end if;
  if exists (select 1 from public.training_attempts where picked_region_id is not null or picked_grape_id is not null) then
    raise exception 'an existing attempt gained a region or grape pick';
  end if;
  -- Still no client write and no column grant (20260925120000's lockdown).
  if exists (select 1 from pg_attribute t
             where t.attrelid = 'public.training_attempts'::regclass and t.attnum > 0 and t.attacl is not null) then
    raise exception 'training_attempts carries a column-level grant';
  end if;
  select string_agg(a.privilege_type, ',' order by a.privilege_type collate "C") into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = 'public.training_attempts'::regclass and a.grantee = 'authenticated'::regrole;
  if v_text is distinct from 'SELECT' then
    raise exception 'authenticated table privileges on training_attempts are %, expected SELECT only', coalesce(v_text, '-');
  end if;

  -- 3. The RPC: attributes, the body this file wrote (md5 of prosrc with any
  --    CR stripped), and EXECUTE for its owner and authenticated only.
  if not exists (select 1 from pg_proc p
                 join pg_language l on l.oid = p.prolang
                 where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure
                   and p.prosecdef and p.proconfig::text = '{search_path=public}' and p.provolatile = 'v'
                   and l.lanname = 'plpgsql' and format_type(p.prorettype, null) = 'jsonb' and not p.proretset
                   and pg_get_function_identity_arguments(p.oid) = 'p_note jsonb, p_aromas jsonb, p_attempt jsonb') then
    raise exception 'record_training_attempt attributes differ from 20260925120000';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_text
  from pg_proc p where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure;
  if v_text is distinct from 'f6a24c83c24aaab34ab568dc6280083f' then
    raise exception 'record_training_attempt body is not the one this migration was written with (md5 %)', v_text;
  end if;
  select string_agg(x.g, ',' order by x.g collate "C") into v_text
  from (select distinct case when a.grantee = 0 then 'PUBLIC'
                             when a.grantee = p.proowner then 'OWNER'
                             else pg_get_userbyid(a.grantee)::text end as g
        from pg_proc p, aclexplode(p.proacl) a
        where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure
          and a.privilege_type = 'EXECUTE') x;
  if v_text is distinct from 'OWNER,authenticated' then
    raise exception 'record_training_attempt EXECUTE is held by %, expected OWNER,authenticated', v_text;
  end if;
  if has_function_privilege('anon', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.record_training_attempt(jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'EXECUTE on record_training_attempt is not authenticated-only';
  end if;

  -- 4. What the RPC calls without changing it.
  select string_agg(s.sig, ', ') into v_text
  from (values
    ('public.save_wset_note(jsonb,jsonb)',                       '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.wset_hue_fits_colour(wset_colour_hue,wine_colour)', '96339c7d5a5a84074ffc33db8e89d6ba')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'a function the RPC calls changed: %', v_text;
  end if;

  raise notice 'training region guess: % attempts, record_training_attempt md5 %',
    (select count(*) from public.training_attempts),
    (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
      where p.oid = 'public.record_training_attempt(jsonb,jsonb,jsonb)'::regprocedure);
end $$;
```

- [ ] **Step 4: Check the pinned body locally (no database)**

Run:

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && node -e "const s=require('fs').readFileSync('supabase/migrations/20260927100000_training_region_guess.sql','utf8').replace(/\r/g,'');const i=s.indexOf('function public.record_training_attempt(');const o=s.indexOf('\$\$',i)+2;console.log(require('crypto').createHash('md5').update(s.slice(o,s.indexOf('\$\$;',o))).digest('hex'))"
```

Expected: `f6a24c83c24aaab34ab568dc6280083f`. Anything else means the body differs from Step 3's by a character: diff it against the plan, never edit the pinned md5 to match.

- [ ] **Step 5: Update the generated types**

In `src/lib/supabase/database.types.ts`, inside `training_attempts`, replace:

```ts
          scored_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          session_key: string;
          note_id: string;
          picked_archetype_id?: string | null;
```

with:

```ts
          scored_at: string | null;
          created_at: string;
          // 20260927100000 (region-guess addendum R7): a pick that stopped at
          // the region, with an optional grape. Never both a region and a
          // picked_archetype_id; a grape only with a region (table checks).
          picked_region_id: string | null;
          picked_grape_id: string | null;
        };
        Insert: {
          id?: string;
          author_id: string;
          session_key: string;
          note_id: string;
          picked_archetype_id?: string | null;
          picked_region_id?: string | null;
          picked_grape_id?: string | null;
```

In the `record_training_attempt` comment, replace:

```ts
      // authenticated only. p_attempt: { attempt_id?, session_key, started_at,
      // picked_archetype_id?, guessed_vintage_kind?, guessed_vintage_year?,
      // guessed_vintage_tawny_years?, actual_catalog_wine_id?,
      // candidates_snapshot }. Returns { attempt_id, note_id, points: {
```

with:

```ts
      // authenticated only. p_attempt: { attempt_id?, session_key, started_at,
      // picked_archetype_id?, picked_region_id?, picked_grape_id?,
      // guessed_vintage_kind?, guessed_vintage_year?,
      // guessed_vintage_tawny_years?, actual_catalog_wine_id?,
      // candidates_snapshot }. A region pick (20260927100000) scores country
      // and region by the region's own FKs and the grape against the wine's
      // primary grape. Returns { attempt_id, note_id, points: {
```

and:

```ts
      // (42501), "already revealed" (P0001); "no such wine", "no such typical
      // wine", "a session key is required", "name the wine to reveal" and a
      // malformed argument (22023).
```

with:

```ts
      // (42501), "already revealed" (P0001); "no such wine", "no such typical
      // wine", "no such region", "no such grape", "a session key is
      // required", "name the wine to reveal" and a malformed argument
      // (22023); a typical wine and a region together, or a grape without a
      // region, fail the table's checks (23514).
```

- [ ] **Step 6: Gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && node --check scripts/training-room.test.mjs && npx eslint scripts/training-room.test.mjs src/lib/supabase/database.types.ts && npx tsc --noEmit`
Expected: no output from any of the three.

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add supabase/migrations/20260927100000_training_region_guess.sql scripts/training-room.test.mjs src/lib/supabase/database.types.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(db): a training call may stop at the region and name a grape (not applied)

training_attempts gains picked_region_id and picked_grape_id (on delete set
null) with two checks: never a typical wine and a region together, and a grape
only with a region. record_training_attempt is recreated from its live body
(md5 79b65a0e… pinned before, f6a24c83… after) with a region branch: country 2
and region 3 by the region's own FKs, grape 8 against the wine's primary
grape, appellation 0, second grape and designation 0 when the wine has one.
Six DB tests; the main session applies it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 8 (main session only): dry run, suite, apply, suite**

1. `cd /c/Users/Public/repos/blindtastingapp-friends && node --env-file=.env.local <scratchpad>/apply-migration.mjs supabase/migrations/20260927100000_training_region_guess.sql --dry` → `DRY RUN OK: 20260927100000_training_region_guess ran in <n> ms and was rolled back` (every pre- and post-state assert ran; the post-state's NOTICE names the body md5 `f6a24c83c24aaab34ab568dc6280083f`). If a post-state assert fails on a constraint string, its exception prints the live text: the four new definitions were derived by hand from the deparse pattern 20260925120000 pins, so compare character by character before changing anything — and never change the body to fit the md5.
2. `cd /c/Users/Public/repos/blindtastingapp-friends && TRAINING_ROOM_APPLY=supabase/migrations/20260927100000_training_region_guess.sql node --env-file=.env.local --test --test-reporter=tap --test-reporter-destination=stdout scripts/training-room.test.mjs` → `# tests 23`, `# pass 23`, `# fail 0`. This also re-runs every older test (maxima pinned to `reveal_wine`, grants authenticated-only, typical-wine scoring) against the recreated function.
3. Apply live: the same applier command without `--dry` (additive; the deployed app never sends the new keys).
4. The suite again without `TRAINING_ROOM_APPLY` → `# pass 23`.

---

### Task 2: Region groups, Your call rules and their copy (pure)

**Files:**
- Create: `src/lib/training/groups.ts`, `src/lib/training/groups.test.ts`
- Create: `src/lib/training/call.ts`, `src/lib/training/call.test.ts`
- Modify: `src/lib/training/types.ts` (add `RegionGroup`, `CallPick`)
- Modify: `src/lib/training/copy.ts` (R10 keys, R4 strip, `regionLabel`, `bestLine`, `groupSubLine`, `showAllRegionsLine`, `youSaidRegionLine`)
- Modify: `src/lib/training/copy.test.ts`

**Interfaces:**
- Consumes: `RankedCandidate`, `TrainingCandidate`, `Named`, `CapReason` (`types.ts`); `rankCandidates` (`match.ts`, tests only); `PANEL_LIMIT`, `isBeforeAnswers`, `CALL_LIMIT`, `CALL_SEARCH_LIMIT` (`panel.ts`); `foldName` (`../wine-identity/fold`); `shortName`, `TRAINING_COPY` (`copy.ts`).
- Produces (later tasks rely on these exact names):
  - `types.ts`: `type RegionGroup = { key: string; region: Named; country: Named; closeness: number | null; capped: CapReason | null; best: RankedCandidate; members: RankedCandidate[] }`; `type CallPick = { pickedArchetypeId: string | null; pickedRegionId: string | null; pickedGrapeId: string | null }`.
  - `groups.ts`: `groupRanking(ranked: readonly RankedCandidate[]): RegionGroup[]`; `findMember(groups: readonly RegionGroup[], id: string): RankedCandidate | null`; `type RegionSection = { key: "likely" | "unlikely"; heading: string | null; groups: RegionGroup[] }`; `type RegionPanelView = { before: boolean; sections: RegionSection[]; total: number; hidden: number; topKey: string | null }`; `regionPanelView(groups: readonly RegionGroup[], showAll: boolean, limit?: number): RegionPanelView`; `type ExpandState = Readonly<Record<string, boolean>>`; `groupExpanded(key: string, topKey: string | null, state: ExpandState): boolean`; `toggleGroup(state: ExpandState, key: string, topKey: string | null): ExpandState`.
  - `call.ts`: `NO_CALL: CallPick`; `regionCallOptions(groups: readonly RegionGroup[], query: string, pickedRegionId: string | null): RegionGroup[]`; `regionGrapeChoices(members: readonly RankedCandidate[]): Named[]`; `grapeChips(choices: readonly Named[], pickedGrapeId: string | null, grapes: readonly Named[]): Named[]`; `chooseRegion(pick: CallPick, regionId: string): CallPick`; `chooseDeeper(pick: CallPick, archetypeId: string | null): CallPick`; `chooseGrape(pick: CallPick, grapeId: string | null): CallPick`; `normalizeCall(pick: CallPick, pool: readonly TrainingCandidate[]): CallPick`; `callPayload(pick: CallPick): CallPick`.
  - `copy.ts`: `TRAINING_COPY.whichRegion | searchRegions | goDeeper | justTheRegion | grapeOptional | otherGrape | searchGrapes`; `regionLabel(g: { region: { name: string }; country: { name: string } }): string`; `bestLine(wineShortName: string): string`; `groupSubLine(g: RegionGroup): string | null`; `showAllRegionsLine(n: number): string`; `youSaidRegionLine(region: string, grape: string | null, vintage: VintageGuess): string`; `stripLine` now "Top match: {region} · {wine} {pct} %".

- [ ] **Step 1: Write the failing tests**

Create `src/lib/training/groups.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyNoteState } from "../wset/note-state";
import { LEXICON, POOL, arch } from "./__fixtures__/archetypes";
import { TRAINING_COPY } from "./copy";
import {
  findMember,
  groupExpanded,
  groupRanking,
  regionPanelView,
  toggleGroup,
} from "./groups";
import { rankCandidates } from "./match";
import type { CapReason, RankedCandidate, RegionGroup } from "./types";

// The ranking grouped by region (region-guess addendum R1-R3). Every list
// below is in rankCandidates' own order (spec §5.8): uncapped numbers desc,
// uncapped nulls, then capped.

function rc(key: string, closeness: number | null, capped: CapReason | null = null): RankedCandidate {
  return { candidate: arch(key), closeness, capped, explanation: null, signatureHits: [] };
}

const summary = (groups: RegionGroup[]) =>
  groups.map((g) => ({
    region: g.region.name,
    closeness: g.closeness,
    capped: g.capped,
    best: g.best.candidate.id,
    members: g.members.map((m) => m.candidate.id),
  }));

const SCORED = [
  rc("margaux", 91),
  rc("vosne", 88),
  rc("cote-rotie", 85),
  rc("cote-de-nuits", 80),
  rc("cdp", 60),
  rc("bandol", 50),
  rc("sauternes", 15, "colour"),
  rc("chablis", 15, "colour"),
  rc("champagne", 12, "colour"),
  rc("sancerre", null, "colour"),
];

describe("groupRanking", () => {
  it("groups by region, stands each at its best member and keeps members in ranking order", () => {
    expect(summary(groupRanking(SCORED))).toEqual([
      { region: "Bordeaux", closeness: 91, capped: null, best: "arch-margaux", members: ["arch-margaux", "arch-sauternes"] },
      {
        region: "Bourgogne",
        closeness: 88,
        capped: null,
        best: "arch-vosne",
        members: ["arch-vosne", "arch-cote-de-nuits", "arch-chablis"],
      },
      { region: "Rhône", closeness: 85, capped: null, best: "arch-cote-rotie", members: ["arch-cote-rotie", "arch-cdp"] },
      { region: "Provence", closeness: 50, capped: null, best: "arch-bandol", members: ["arch-bandol"] },
      { region: "Champagne", closeness: 12, capped: "colour", best: "arch-champagne", members: ["arch-champagne"] },
      { region: "Loire", closeness: null, capped: "colour", best: "arch-sancerre", members: ["arch-sancerre"] },
    ]);
  });

  it("carries the region and its country, keyed by the region id", () => {
    const [bordeaux] = groupRanking(SCORED);
    expect(bordeaux.key).toBe("region-Bordeaux");
    expect(bordeaux.region).toEqual({ id: "region-Bordeaux", name: "Bordeaux" });
    expect(bordeaux.country).toEqual({ id: "country-France", name: "France" });
  });

  it("a capped member never lifts its group above the best uncapped one", () => {
    const groups = groupRanking([rc("vosne", 40), rc("margaux", 10), rc("sauternes", 15, "colour")]);
    expect(summary(groups).map((g) => [g.region, g.closeness, g.capped, g.best])).toEqual([
      ["Bourgogne", 40, null, "arch-vosne"],
      ["Bordeaux", 10, null, "arch-margaux"],
    ]);
  });

  it("puts a group without a number after the numbered ones and before the capped ones", () => {
    const groups = groupRanking([rc("margaux", 70), rc("tannin-free-white", null), rc("chablis", 15, "colour")]);
    expect(summary(groups).map((g) => [g.region, g.closeness, g.capped])).toEqual([
      ["Bordeaux", 70, null],
      ["Niederösterreich", null, null],
      ["Bourgogne", 15, "colour"],
    ]);
  });

  it("breaks a tie by country, then region (the matcher broke it by wine name)", () => {
    const groups = groupRanking([rc("bandol", 80), rc("sancerre", 80), rc("tannin-free-white", 80)]);
    expect(groups.map((g) => g.region.name)).toEqual(["Niederösterreich", "Loire", "Provence"]);
  });

  it("before any answer: every group, by country then region, with no number", () => {
    const ranked = rankCandidates(emptyNoteState(), { bubbles: null, fortified: null }, POOL, LEXICON);
    const groups = groupRanking(ranked);
    expect(groups.map((g) => `${g.country.name} / ${g.region.name}`)).toEqual([
      "Austria / Niederösterreich",
      "France / Alsace",
      "France / Bordeaux",
      "France / Bourgogne",
      "France / Champagne",
      "France / Loire",
      "France / Provence",
      "France / Rhône",
      "Portugal / Porto",
    ]);
    expect(groups.every((g) => g.closeness === null && g.capped === null)).toBe(true);
    expect(groups.flatMap((g) => g.members)).toHaveLength(POOL.length);
  });

  it("is empty for an empty ranking", () => {
    expect(groupRanking([])).toEqual([]);
  });
});

describe("findMember", () => {
  it("finds a wine in whichever group holds it", () => {
    const groups = groupRanking(SCORED);
    expect(findMember(groups, "arch-cdp")?.closeness).toBe(60);
    expect(findMember(groups, "arch-nope")).toBeNull();
  });
});

describe("regionPanelView", () => {
  const groups = groupRanking([...SCORED.slice(0, 6), rc("alsace-riesling", 40), ...SCORED.slice(6)]);

  it("shows the top five groups until Show all, with the top one's key", () => {
    const view = regionPanelView(groups, false);
    expect(view.total).toBe(7);
    expect(view.hidden).toBe(2);
    expect(view.before).toBe(false);
    expect(view.topKey).toBe("region-Bordeaux");
    expect(view.sections.map((s) => [s.heading, s.groups.map((g) => g.region.name)])).toEqual([
      [null, ["Bordeaux", "Bourgogne", "Rhône", "Provence", "Alsace"]],
    ]);
  });

  it("shows every group once Show all is on, the capped ones under the unlikely heading", () => {
    const view = regionPanelView(groups, true);
    expect(view.hidden).toBe(0);
    expect(view.sections.map((s) => [s.key, s.heading, s.groups.map((g) => g.region.name)])).toEqual([
      ["likely", null, ["Bordeaux", "Bourgogne", "Rhône", "Provence", "Alsace"]],
      ["unlikely", TRAINING_COPY.unlikelyGroup, ["Champagne", "Loire"]],
    ]);
  });

  it("is in before-answers mode only while no wine has a number or a cap", () => {
    const empty = rankCandidates(emptyNoteState(), { bubbles: null, fortified: null }, POOL, LEXICON);
    expect(regionPanelView(groupRanking(empty), false).before).toBe(true);
    // A capped wine in an otherwise un-numbered group still ends it.
    expect(regionPanelView(groupRanking([rc("vosne", null), rc("chablis", 15, "colour")]), false).before).toBe(false);
    expect(regionPanelView([], false)).toEqual({ before: true, sections: [], total: 0, hidden: 0, topKey: null });
  });
});

describe("group rows open and close", () => {
  it("only the top group starts open", () => {
    expect(groupExpanded("region-Bordeaux", "region-Bordeaux", {})).toBe(true);
    expect(groupExpanded("region-Rhône", "region-Bordeaux", {})).toBe(false);
    expect(groupExpanded("region-Rhône", null, {})).toBe(false);
  });

  it("a tap flips a row from what it shows, and the choice sticks", () => {
    const top = "region-Bordeaux";
    let state = toggleGroup({}, top, top);
    expect(groupExpanded(top, top, state)).toBe(false);
    state = toggleGroup(state, "region-Rhône", top);
    expect(groupExpanded("region-Rhône", top, state)).toBe(true);
    // Rhône becomes the top group: it stays open, Bordeaux stays closed.
    expect(groupExpanded("region-Rhône", "region-Rhône", state)).toBe(true);
    expect(groupExpanded(top, "region-Rhône", state)).toBe(false);
    expect(toggleGroup(state, "region-Rhône", top)).toEqual({ [top]: false, "region-Rhône": false });
  });
});
```

Create `src/lib/training/call.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { arch } from "./__fixtures__/archetypes";
import {
  NO_CALL,
  callPayload,
  chooseDeeper,
  chooseGrape,
  chooseRegion,
  grapeChips,
  normalizeCall,
  regionCallOptions,
  regionGrapeChoices,
} from "./call";
import { groupRanking } from "./groups";
import type { CallPick, CapReason, RankedCandidate } from "./types";

// Your call by region (region-guess addendum R5, R7).

function rc(key: string, closeness: number | null, capped: CapReason | null = null): RankedCandidate {
  return { candidate: arch(key), closeness, capped, explanation: null, signatureHits: [] };
}

// Seven regions, in rankCandidates' order.
const GROUPS = groupRanking([
  rc("margaux", 91),
  rc("vosne", 88),
  rc("cote-rotie", 85),
  rc("cote-de-nuits", 80),
  rc("cdp", 60),
  rc("bandol", 50),
  rc("alsace-riesling", 40),
  rc("tannin-free-white", 30),
  rc("chablis", 15, "colour"),
  rc("sancerre", 12, "colour"),
]);
const regions = (gs: { region: { name: string } }[]) => gs.map((g) => g.region.name);

describe("regionCallOptions", () => {
  it("offers the top five regions and keeps a picked one from further down", () => {
    expect(regions(regionCallOptions(GROUPS, "", null))).toEqual([
      "Bordeaux",
      "Bourgogne",
      "Rhône",
      "Provence",
      "Alsace",
    ]);
    expect(regions(regionCallOptions(GROUPS, "", "region-Loire"))).toEqual([
      "Bordeaux",
      "Bourgogne",
      "Rhône",
      "Provence",
      "Alsace",
      "Loire",
    ]);
    expect(regions(regionCallOptions(GROUPS, "", "region-Rhône"))).toHaveLength(5);
  });

  it("searches every region by its name, its country, or a wine or appellation in it, accents folded", () => {
    expect(regions(regionCallOptions(GROUPS, "rhone", null))).toEqual(["Rhône"]);
    expect(regions(regionCallOptions(GROUPS, "austria", null))).toEqual(["Niederösterreich"]);
    expect(regions(regionCallOptions(GROUPS, "chablis", null))).toEqual(["Bourgogne"]);
    expect(regions(regionCallOptions(GROUPS, "Côte-Rôtie AOC", null))).toEqual(["Rhône"]);
    expect(regions(regionCallOptions(GROUPS, "zzz", null))).toEqual([]);
  });

  it("does not match every region on the names' shared 'A typical'", () => {
    expect(regionCallOptions(GROUPS, "typical", null)).toEqual([]);
  });
});

describe("regionGrapeChoices", () => {
  const members = (region: string) => GROUPS.find((g) => g.region.name === region)!.members;

  it("names the region's grapes once each, most named first", () => {
    // Bourgogne here: Vosne-Romanée and Côte de Nuits (Pinot Noir), Chablis (Chardonnay).
    expect(regionGrapeChoices(members("Bourgogne")).map((g) => g.name)).toEqual(["Pinot Noir", "Chardonnay"]);
    // Rhône: Côte-Rôtie (Syrah), Châteauneuf-du-Pape (Grenache, Syrah).
    expect(regionGrapeChoices(members("Rhône"))).toEqual([
      { id: "grape-Syrah", name: "Syrah" },
      { id: "grape-Grenache", name: "Grenache" },
    ]);
  });

  it("breaks a tie by how often the grape is the primary one, then by name", () => {
    const bordeaux = groupRanking([rc("margaux", 60), rc("sauternes", 50)])[0].members;
    // Every grape is named once: Cabernet Sauvignon and Semillon lead as primaries.
    expect(regionGrapeChoices(bordeaux).map((g) => g.name)).toEqual([
      "Cabernet Sauvignon",
      "Semillon",
      "Merlot",
      "Sauvignon Blanc",
    ]);
  });

  it("is empty without wines", () => {
    expect(regionGrapeChoices([])).toEqual([]);
  });
});

describe("grapeChips", () => {
  const CHOICES = [
    { id: "grape-Syrah", name: "Syrah" },
    { id: "grape-Grenache", name: "Grenache" },
  ];
  const ALL = [...CHOICES, { id: "grape-Mourvèdre", name: "Mourvèdre" }];

  it("adds a grape picked through Other grape… that the region does not name", () => {
    expect(grapeChips(CHOICES, "grape-Mourvèdre", ALL).map((g) => g.name)).toEqual(["Syrah", "Grenache", "Mourvèdre"]);
  });
  it("adds nothing for a grape already a chip, no grape, or an unknown one", () => {
    expect(grapeChips(CHOICES, "grape-Syrah", ALL)).toEqual(CHOICES);
    expect(grapeChips(CHOICES, null, ALL)).toEqual(CHOICES);
    expect(grapeChips(CHOICES, "grape-gone", ALL)).toEqual(CHOICES);
  });
});

describe("a tap changes the pick", () => {
  const FULL: CallPick = { pickedArchetypeId: "arch-vosne", pickedRegionId: "region-Bourgogne", pickedGrapeId: "g" };

  it("a new region clears the deeper choice and the grape; the same region changes nothing", () => {
    expect(chooseRegion(FULL, "region-Rhône")).toEqual({
      pickedArchetypeId: null,
      pickedRegionId: "region-Rhône",
      pickedGrapeId: null,
    });
    expect(chooseRegion(FULL, "region-Bourgogne")).toBe(FULL);
  });

  it("going deeper keeps the region and the (hidden) grape", () => {
    expect(chooseDeeper(FULL, null)).toEqual({ ...FULL, pickedArchetypeId: null });
    expect(chooseDeeper({ ...FULL, pickedArchetypeId: null }, "arch-cote-de-nuits")).toEqual({
      ...FULL,
      pickedArchetypeId: "arch-cote-de-nuits",
    });
  });

  it("a grape needs a region", () => {
    expect(chooseGrape({ ...FULL, pickedGrapeId: null }, "grape-Pinot Noir").pickedGrapeId).toBe("grape-Pinot Noir");
    expect(chooseGrape(FULL, null).pickedGrapeId).toBeNull();
    expect(chooseGrape(NO_CALL, "grape-Pinot Noir")).toBe(NO_CALL);
  });
});

describe("normalizeCall", () => {
  const POOL = [arch("vosne"), arch("chablis"), arch("margaux")];

  it("gives a typical wine its own region (a draft from before the region step)", () => {
    expect(normalizeCall({ pickedArchetypeId: "arch-vosne", pickedRegionId: null, pickedGrapeId: null }, POOL)).toEqual({
      pickedArchetypeId: "arch-vosne",
      pickedRegionId: "region-Bourgogne",
      pickedGrapeId: null,
    });
    expect(
      normalizeCall({ pickedArchetypeId: "arch-margaux", pickedRegionId: "region-Bourgogne", pickedGrapeId: "g" }, POOL),
    ).toEqual({ pickedArchetypeId: "arch-margaux", pickedRegionId: "region-Bordeaux", pickedGrapeId: "g" });
  });

  it("drops a wine, or a region, that left the pool — and a grape without a region", () => {
    expect(normalizeCall({ pickedArchetypeId: "arch-gone", pickedRegionId: "region-Bourgogne", pickedGrapeId: "g" }, POOL))
      .toEqual({ pickedArchetypeId: null, pickedRegionId: "region-Bourgogne", pickedGrapeId: "g" });
    expect(normalizeCall({ pickedArchetypeId: null, pickedRegionId: "region-Rhône", pickedGrapeId: "g" }, POOL)).toEqual(
      NO_CALL,
    );
    expect(normalizeCall({ pickedArchetypeId: null, pickedRegionId: null, pickedGrapeId: "g" }, POOL)).toEqual(NO_CALL);
    expect(normalizeCall(NO_CALL, POOL)).toEqual(NO_CALL);
  });
});

describe("callPayload", () => {
  it("a typical wine alone, a region with its grape, or nothing", () => {
    expect(callPayload({ pickedArchetypeId: "arch-vosne", pickedRegionId: "region-Bourgogne", pickedGrapeId: "g" })).toEqual(
      { pickedArchetypeId: "arch-vosne", pickedRegionId: null, pickedGrapeId: null },
    );
    expect(callPayload({ pickedArchetypeId: null, pickedRegionId: "region-Bourgogne", pickedGrapeId: "g" })).toEqual({
      pickedArchetypeId: null,
      pickedRegionId: "region-Bourgogne",
      pickedGrapeId: "g",
    });
    expect(callPayload({ pickedArchetypeId: null, pickedRegionId: "region-Bourgogne", pickedGrapeId: null })).toEqual({
      pickedArchetypeId: null,
      pickedRegionId: "region-Bourgogne",
      pickedGrapeId: null,
    });
    expect(callPayload({ pickedArchetypeId: null, pickedRegionId: null, pickedGrapeId: "g" })).toEqual(NO_CALL);
  });
});
```

In `src/lib/training/copy.test.ts`, replace the import block:

```ts
import {
  CLOSE_WINDOW,
  RESULT_ROW_LABELS,
  RESULT_ROW_ORDER,
  TRAINING_COPY,
  capReasonLine,
  clockTime,
  continueLine,
  coverageLine,
  groupLossLine,
  hueClearedLine,
  itWasLine,
  lineageLine,
  percentLabel,
  resultMark,
  resultTotalLine,
  scaleLossLine,
  sessionsLine,
  sheetTitle,
  shortDate,
  shortName,
  showAllLine,
  signatureLine,
  stripLine,
  styleVerdictLine,
  tallyLine,
  tawnyAgeOption,
  vintageGuessLabel,
  youSaidLine,
} from "./copy";
```

with:

```ts
import {
  CLOSE_WINDOW,
  RESULT_ROW_LABELS,
  RESULT_ROW_ORDER,
  TRAINING_COPY,
  bestLine,
  capReasonLine,
  clockTime,
  continueLine,
  coverageLine,
  groupLossLine,
  groupSubLine,
  hueClearedLine,
  itWasLine,
  lineageLine,
  percentLabel,
  regionLabel,
  resultMark,
  resultTotalLine,
  scaleLossLine,
  sessionsLine,
  sheetTitle,
  shortDate,
  shortName,
  showAllLine,
  showAllRegionsLine,
  signatureLine,
  stripLine,
  styleVerdictLine,
  tallyLine,
  tawnyAgeOption,
  vintageGuessLabel,
  youSaidLine,
  youSaidRegionLine,
} from "./copy";
import { groupRanking } from "./groups";
```

In the `TRAINING_COPY` object expectation, replace:

```ts
      notInList: "It's not in the list",
      vintageOptional: "Vintage (optional)",
```

with:

```ts
      notInList: "It's not in the list",
      whichRegion: "Which region is it?",
      searchRegions: "Search regions…",
      goDeeper: "Go deeper (optional)",
      justTheRegion: "Just the region",
      grapeOptional: "Grape (optional)",
      otherGrape: "Other grape…",
      searchGrapes: "Search grapes…",
      vintageOptional: "Vintage (optional)",
```

In `describe("stripLine", …)`, replace the three tests "leader plus the other uncapped candidates within 10 points", "k = 1" and "k = 0: just the leader":

```ts
  it("leader plus the other uncapped candidates within 10 points", () => {
    // 91 − 85 = 6 and 91 − 81 = 10 count; 91 − 80 = 11 and the capped one do not.
    const ranked = [
      rc("margaux", 91),
      rc("cote-rotie", 85),
      rc("bandol", 81),
      rc("cdp", 80),
      rc("chablis", 15, "colour"),
    ];
    expect(stripLine(ranked)).toBe("Top match: Margaux 91 % · 2 more close");
  });
  it("k = 1", () => {
    expect(stripLine([rc("margaux", 91), rc("bandol", 81), rc("cdp", 70)])).toBe(
      "Top match: Margaux 91 % · 1 more close",
    );
  });
  it("k = 0: just the leader", () => {
    expect(stripLine([rc("margaux", 20), rc("chablis", 15, "colour")])).toBe("Top match: Margaux 20 %");
  });
```

with:

```ts
  it("the leader's region and the leader, plus the other uncapped wines within 10 points", () => {
    // 91 − 85 = 6 and 91 − 81 = 10 count; 91 − 80 = 11 and the capped one do not.
    const ranked = [
      rc("margaux", 91),
      rc("cote-rotie", 85),
      rc("bandol", 81),
      rc("cdp", 80),
      rc("chablis", 15, "colour"),
    ];
    expect(stripLine(ranked)).toBe("Top match: Bordeaux · Margaux 91 % · 2 more close");
  });
  it("k = 1", () => {
    expect(stripLine([rc("margaux", 91), rc("bandol", 81), rc("cdp", 70)])).toBe(
      "Top match: Bordeaux · Margaux 91 % · 1 more close",
    );
  });
  it("k = 0: just the leader", () => {
    expect(stripLine([rc("margaux", 20), rc("chablis", 15, "colour")])).toBe("Top match: Bordeaux · Margaux 20 %");
  });
  it("names the region once when the wine is the region's own name", () => {
    expect(stripLine([rc("champagne", 88)])).toBe("Top match: Champagne 88 %");
  });
```

Immediately before `describe("lineageLine", () => {`, insert:

```ts
describe("region groups (region-guess addendum R1, R3)", () => {
  it("names a region with its country, its best wine and Show all", () => {
    expect(regionLabel({ region: { name: "Bourgogne" }, country: { name: "France" } })).toBe("Bourgogne, France");
    expect(bestLine("Chablis Premier Cru")).toBe("best: Chablis Premier Cru");
    expect(showAllRegionsLine(12)).toBe("Show all 12 regions");
  });
  it("a group row's second line is its best wine, only once there are numbers", () => {
    const [bourgogne] = groupRanking([rc("vosne", 88), rc("chablis", 70)]);
    expect(groupSubLine(bourgogne)).toBe("best: Vosne-Romanée");
    const [before] = groupRanking([rc("vosne", null), rc("chablis", null)]);
    expect(groupSubLine(before)).toBeNull();
    const [capped] = groupRanking([rc("chablis", 15, "colour")]);
    expect(groupSubLine(capped)).toBe("best: Chablis");
  });
});

```

In `describe("vintage and 'You said'", …)`, after the test "You said {shortName}{, vintage}" (whose last line is `expect(youSaidLine("A typical Champagne", { kind: "NV" })).toBe("You said Champagne, NV");` followed by `  });`), insert:

```ts
  it("You said {region} · {grape}{, vintage} for a pick that stopped at the region", () => {
    expect(youSaidRegionLine("Bourgogne", "Chardonnay", null)).toBe("You said Bourgogne · Chardonnay");
    expect(youSaidRegionLine("Bourgogne", null, null)).toBe("You said Bourgogne");
    expect(youSaidRegionLine("Bourgogne", "Pinot Noir", { kind: "YEAR", year: 2019 })).toBe(
      "You said Bourgogne · Pinot Noir, 2019",
    );
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training`
Expected: FAIL — `groups.test.ts` and `call.test.ts` with `Failed to resolve import "./groups"` / `"./call"`, and `copy.test.ts` failing to import `./groups` (then, once it loads, on the missing exports, the `TRAINING_COPY` object and the strip lines).

- [ ] **Step 3: Add the types**

In `src/lib/training/types.ts`, immediately before `/** The whole ranking, frozen into the attempt at reveal (spec §5.8). */`, insert:

```ts
/** One region of the ranking (region-guess addendum R1, R2): its typical wines
    in ranking order, and its standing — the best uncapped member's closeness,
    or, when every member is capped, the best capped one's (`capped` is then
    that member's reason, null otherwise). `key` is the region id. */
export type RegionGroup = {
  key: string;
  region: Named;
  country: Named;
  closeness: number | null;
  capped: CapReason | null;
  best: RankedCandidate;
  members: RankedCandidate[];
};

/** What Your call has picked (addendum R5): a region, optionally a grape, or a
    typical wine of that region. The device draft carries the same three fields. */
export type CallPick = {
  pickedArchetypeId: string | null;
  pickedRegionId: string | null;
  pickedGrapeId: string | null;
};

```

- [ ] **Step 4: Add the copy**

In `src/lib/training/copy.ts`:

Replace the import block's head:

```ts
import type { WineColour, WineStyle } from "../wset/types";
import { LABELS } from "../wset/vocab";
import type {
  AttemptRow,
  CapReason,
  PointCategory,
  RankedCandidate,
  TrainingCandidate,
  VintageGuess,
} from "./types";
```

with:

```ts
import { foldName } from "../wine-identity/fold";
import type { WineColour, WineStyle } from "../wset/types";
import { LABELS } from "../wset/vocab";
import type {
  AttemptRow,
  CapReason,
  PointCategory,
  RankedCandidate,
  RegionGroup,
  TrainingCandidate,
  VintageGuess,
} from "./types";
```

Replace:

```ts
  notInList: "It's not in the list",
  vintageOptional: "Vintage (optional)",
```

with:

```ts
  notInList: "It's not in the list",
  // your call by region (region-guess addendum R5, R10)
  whichRegion: "Which region is it?",
  searchRegions: "Search regions…",
  goDeeper: "Go deeper (optional)",
  justTheRegion: "Just the region",
  grapeOptional: "Grape (optional)",
  otherGrape: "Other grape…",
  searchGrapes: "Search grapes…",
  vintageOptional: "Vintage (optional)",
```

Replace the whole `stripLine` function (its doc comment through its closing brace):

```ts
/**
 * The phone strip under the sheet's bar (spec §3.3, §9). `ranked` is
 * rankCandidates' output, already in §5.8 order (uncapped numbered first).
 */
export function stripLine(ranked: readonly RankedCandidate[]): string {
  if (ranked.length === 0) return TRAINING_COPY.beforeAnswers;
  const leader = ranked.find((r) => r.capped === null);
  if (!leader) return TRAINING_COPY.nothingFits;
  if (leader.closeness === null) return TRAINING_COPY.beforeAnswers;
  const top = leader.closeness;
  const k = ranked.filter(
    (r) =>
      r !== leader &&
      r.capped === null &&
      r.closeness !== null &&
      top - r.closeness <= CLOSE_WINDOW,
  ).length;
  const head = `Top match: ${shortName(leader.candidate.name)} ${top} %`;
  return k === 0 ? head : `${head} · ${k} more close`;
}
```

with:

```ts
/**
 * The phone strip under the sheet's bar (spec §3.3, §9; region-guess addendum
 * R4): "Top match: Bourgogne · Chablis Premier Cru 100 % · 3 more close" — the
 * leading wine's region, then the wine (the region alone when the wine's short
 * name is the region's own, folded: "Top match: Champagne 88 %"). `ranked` is
 * rankCandidates' output, already in §5.8 order (uncapped numbered first); k
 * counts the other uncapped wines within CLOSE_WINDOW of the leader.
 */
export function stripLine(ranked: readonly RankedCandidate[]): string {
  if (ranked.length === 0) return TRAINING_COPY.beforeAnswers;
  const leader = ranked.find((r) => r.capped === null);
  if (!leader) return TRAINING_COPY.nothingFits;
  if (leader.closeness === null) return TRAINING_COPY.beforeAnswers;
  const top = leader.closeness;
  const k = ranked.filter(
    (r) =>
      r !== leader &&
      r.capped === null &&
      r.closeness !== null &&
      top - r.closeness <= CLOSE_WINDOW,
  ).length;
  const wine = shortName(leader.candidate.name);
  const region = leader.candidate.region.name;
  const label = foldName(wine) === foldName(region) ? wine : `${region} · ${wine}`;
  const head = `Top match: ${label} ${top} %`;
  return k === 0 ? head : `${head} · ${k} more close`;
}

/** A region group's name with its country: "Bourgogne, France" (R1). */
export function regionLabel(g: { region: { name: string }; country: { name: string } }): string {
  return `${g.region.name}, ${g.country.name}`;
}

/** "best: {shortName}" (R3). */
export function bestLine(wineShortName: string): string {
  return `best: ${wineShortName}`;
}

/** A group row's second line: its best wine, once the list has numbers — before
    any answer there is no "best" (R3), so the row has no second line. */
export function groupSubLine(g: RegionGroup): string | null {
  return g.closeness === null ? null : bestLine(shortName(g.best.candidate.name));
}

/** "Show all {n} regions" (R3). */
export function showAllRegionsLine(n: number): string {
  return `Show all ${n} regions`;
}
```

Immediately before `/** "It was {wine}"; an unreadable wine reads "a wine you can't see yet". */`, insert:

```ts
/** "You said {region} · {grape}{, vintage}" / "You said {region}{, vintage}" —
    a pick that stopped at the region (R8). */
export function youSaidRegionLine(region: string, grape: string | null, vintage: VintageGuess): string {
  const v = vintageGuessLabel(vintage);
  return `You said ${region}${grape ? ` · ${grape}` : ""}${v ? `, ${v}` : ""}`;
}

```

- [ ] **Step 5: Write the two modules**

Create `src/lib/training/groups.ts`:

```ts
// The ranking grouped by scoring region (training-room region-guess addendum,
// docs/superpowers/specs/2026-09-27-training-room-region-guess.md R1-R3): a
// group is one `regions` row with its typical wines in ranking order, standing
// at its best member's closeness. The matcher is unchanged; this only regroups
// its output. Also the candidate list's view of those groups (top five, Show
// all, the "Unlikely" section) and which group rows are open. Pure, relative
// imports only, so vitest pins it.
import { TRAINING_COPY } from "./copy";
import { PANEL_LIMIT, isBeforeAnswers } from "./panel";
import type { RankedCandidate, RegionGroup } from "./types";

function bucket(g: RegionGroup): number {
  if (g.capped !== null) return 2;
  return g.closeness === null ? 1 : 0;
}

function byPlace(x: RegionGroup, y: RegionGroup): number {
  return (
    x.country.name.localeCompare(y.country.name, "en") ||
    x.region.name.localeCompare(y.region.name, "en") ||
    x.key.localeCompare(y.key)
  );
}

// R2: uncapped groups with a number first (closeness desc), then uncapped
// groups without one, then capped groups (closeness desc, nulls last); ties —
// and the whole un-numbered bucket — by country, then region.
function compareGroups(x: RegionGroup, y: RegionGroup): number {
  const bx = bucket(x);
  const by = bucket(y);
  if (bx !== by) return bx - by;
  if (x.closeness !== y.closeness) {
    if (x.closeness === null) return 1;
    if (y.closeness === null) return -1;
    return y.closeness - x.closeness;
  }
  return byPlace(x, y);
}

/**
 * rankCandidates' output (spec §5.8 order) as region groups (R1, R2). Members
 * keep the ranking's order, so a group's first uncapped member is its best —
 * the ranking puts every uncapped number before the uncapped nulls and every
 * uncapped wine before a capped one. A group with no uncapped member is capped
 * and stands at its first (best capped) member.
 */
export function groupRanking(ranked: readonly RankedCandidate[]): RegionGroup[] {
  const members = new Map<string, RankedCandidate[]>();
  for (const r of ranked) {
    const list = members.get(r.candidate.region.id);
    if (list) list.push(r);
    else members.set(r.candidate.region.id, [r]);
  }
  const groups: RegionGroup[] = [];
  for (const [key, list] of members) {
    const best = list.find((r) => r.capped === null) ?? list[0];
    groups.push({
      key,
      region: best.candidate.region,
      country: best.candidate.country,
      closeness: best.closeness,
      capped: best.capped,
      best,
      members: list,
    });
  }
  return groups.sort(compareGroups);
}

/** A wine of the ranking by archetype id, wherever its group is; null when none. */
export function findMember(groups: readonly RegionGroup[], id: string): RankedCandidate | null {
  for (const g of groups) {
    const hit = g.members.find((r) => r.candidate.id === id);
    if (hit) return hit;
  }
  return null;
}

export type RegionSection = { key: "likely" | "unlikely"; heading: string | null; groups: RegionGroup[] };
export type RegionPanelView = {
  /** Nothing answered yet that any wine can be measured on, and nothing capped. */
  before: boolean;
  sections: RegionSection[];
  /** Every group, shown or not ("Show all {n} regions"). */
  total: number;
  hidden: number;
  /** The top group's key: it starts expanded (R3). Null for an empty pool. */
  topKey: string | null;
};

/**
 * The laptop column's and the phone sheet's list (R3): the top `limit` groups
 * until Show all, the uncapped ones without a heading, the capped ones after
 * them under "Unlikely from what you've said".
 */
export function regionPanelView(
  groups: readonly RegionGroup[],
  showAll: boolean,
  limit: number = PANEL_LIMIT,
): RegionPanelView {
  const shown = showAll ? [...groups] : groups.slice(0, limit);
  const sections: RegionSection[] = [];
  for (const g of shown) {
    const key = g.capped !== null ? "unlikely" : "likely";
    const last = sections[sections.length - 1];
    if (last && last.key === key) last.groups.push(g);
    else sections.push({ key, heading: key === "unlikely" ? TRAINING_COPY.unlikelyGroup : null, groups: [g] });
  }
  return {
    before: isBeforeAnswers(groups.flatMap((g) => g.members)),
    sections,
    total: groups.length,
    hidden: groups.length - shown.length,
    topKey: groups[0]?.key ?? null,
  };
}

/** The group rows the taster opened or closed by hand, by group key. */
export type ExpandState = Readonly<Record<string, boolean>>;

/** Whether a group row is open: the taster's own choice, else only the top group (R3). */
export function groupExpanded(key: string, topKey: string | null, state: ExpandState): boolean {
  return state[key] ?? key === topKey;
}

/** The state after a tap on a group row: that row flips from what it shows now. */
export function toggleGroup(state: ExpandState, key: string, topKey: string | null): ExpandState {
  return { ...state, [key]: !groupExpanded(key, topKey, state) };
}
```

Create `src/lib/training/call.ts`:

```ts
// Your call's rules (training-room region-guess addendum R5, R7): the region
// options, the grape chips a region offers, how a tap changes the pick, and the
// pick the attempt stores. Pure, relative imports only, so vitest pins it.
import { foldName } from "../wine-identity/fold";
import { shortName } from "./copy";
import { CALL_LIMIT, CALL_SEARCH_LIMIT } from "./panel";
import type { CallPick, Named, RankedCandidate, RegionGroup, TrainingCandidate } from "./types";

/** Nothing picked: a fresh session, and "It's not in the list". */
export const NO_CALL: CallPick = { pickedArchetypeId: null, pickedRegionId: null, pickedGrapeId: null };

/**
 * Step 1's regions (R5): the top five groups (plus the picked one when it sits
 * further down), or — with a query — every group whose region or country, or
 * one of whose typical wines or appellations, contains it, accents and
 * punctuation folded, in ranking order.
 */
export function regionCallOptions(
  groups: readonly RegionGroup[],
  query: string,
  pickedRegionId: string | null,
): RegionGroup[] {
  const key = foldName(query);
  if (key !== "") {
    return groups
      .filter((g) =>
        [
          g.region.name,
          g.country.name,
          ...g.members.flatMap((m) => [shortName(m.candidate.name), m.candidate.appellation.name]),
        ].some((n) => foldName(n).includes(key)),
      )
      .slice(0, CALL_SEARCH_LIMIT);
  }
  const top = groups.slice(0, CALL_LIMIT);
  if (pickedRegionId && !top.some((g) => g.key === pickedRegionId)) {
    const picked = groups.find((g) => g.key === pickedRegionId);
    if (picked) return [...top, picked];
  }
  return top;
}

/**
 * Step 3's chips (R5): the grapes the region's typical wines name, primary and
 * secondary, once each — most named first, then most often primary, then by
 * name.
 */
export function regionGrapeChoices(members: readonly RankedCandidate[]): Named[] {
  const tally = new Map<string, { grape: Named; count: number; primary: number }>();
  const add = (grape: Named, primary: boolean) => {
    const t = tally.get(grape.id) ?? { grape, count: 0, primary: 0 };
    t.count += 1;
    if (primary) t.primary += 1;
    tally.set(grape.id, t);
  };
  for (const m of members) {
    add(m.candidate.primaryGrape, true);
    if (m.candidate.secondaryGrape) add(m.candidate.secondaryGrape, false);
  }
  return [...tally.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.primary - a.primary ||
        a.grape.name.localeCompare(b.grape.name, "en") ||
        a.grape.id.localeCompare(b.grape.id),
    )
    .map((t) => ({ id: t.grape.id, name: t.grape.name }));
}

/** The chips on screen: the region's grapes, plus a grape picked through
    "Other grape…" that is not among them (so the pick stays visible). */
export function grapeChips(
  choices: readonly Named[],
  pickedGrapeId: string | null,
  grapes: readonly Named[],
): Named[] {
  if (!pickedGrapeId || choices.some((c) => c.id === pickedGrapeId)) return [...choices];
  const extra = grapes.find((g) => g.id === pickedGrapeId);
  return extra ? [...choices, extra] : [...choices];
}

/** A region tap: the same region changes nothing; another clears the deeper
    choice and the grape (R5). */
export function chooseRegion(pick: CallPick, regionId: string): CallPick {
  if (pick.pickedRegionId === regionId) return pick;
  return { pickedArchetypeId: null, pickedRegionId: regionId, pickedGrapeId: null };
}

/** "Just the region" (null) or one of the region's typical wines. The grape is
    kept: it is hidden while a wine is chosen and never sent with one. */
export function chooseDeeper(pick: CallPick, archetypeId: string | null): CallPick {
  return { ...pick, pickedArchetypeId: archetypeId };
}

/** A grape chip or "Other grape…" pick (null: none). Only with a region. */
export function chooseGrape(pick: CallPick, grapeId: string | null): CallPick {
  return pick.pickedRegionId === null ? pick : { ...pick, pickedGrapeId: grapeId };
}

/**
 * A stored pick made consistent with today's pool (a draft from before the
 * region step, or one whose rows left the pool): a typical wine names its own
 * region; a wine no longer in the pool is dropped; a region no wine of the pool
 * is in is dropped with its grape; a grape never stands without a region.
 */
export function normalizeCall(pick: CallPick, pool: readonly TrainingCandidate[]): CallPick {
  const wine = pick.pickedArchetypeId ? pool.find((c) => c.id === pick.pickedArchetypeId) : undefined;
  const regionId = wine ? wine.region.id : pick.pickedRegionId;
  const regionKnown = regionId !== null && pool.some((c) => c.region.id === regionId);
  return {
    pickedArchetypeId: wine ? wine.id : null,
    pickedRegionId: regionKnown ? regionId : null,
    pickedGrapeId: regionKnown ? pick.pickedGrapeId : null,
  };
}

/**
 * The pick the attempt stores (R7's checks): a typical wine alone, or a region
 * with an optional grape, or nothing.
 */
export function callPayload(pick: CallPick): CallPick {
  if (pick.pickedArchetypeId !== null) {
    return { pickedArchetypeId: pick.pickedArchetypeId, pickedRegionId: null, pickedGrapeId: null };
  }
  if (pick.pickedRegionId === null) return NO_CALL;
  return { pickedArchetypeId: null, pickedRegionId: pick.pickedRegionId, pickedGrapeId: pick.pickedGrapeId };
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training`
Expected: `Test Files  12 passed (12)`, `Tests  194 passed (194)` (163 before this task: +13 groups, +14 call, +4 copy).

- [ ] **Step 7: Gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx tsc --noEmit && npx eslint src/lib/training`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add src/lib/training/groups.ts src/lib/training/groups.test.ts src/lib/training/call.ts src/lib/training/call.test.ts src/lib/training/types.ts src/lib/training/copy.ts src/lib/training/copy.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(training): the ranking by region, Your call's rules and their copy

groupRanking stands each region at its best uncapped wine (an all-capped
region is capped at its best capped one) and orders regions as the matcher
orders wines; regionPanelView, groupExpanded and toggleGroup are the list's
view of them. call.ts holds Your call's rules: region options, the region's
grape chips, how a tap changes the pick, normalizeCall for older drafts and
the pick the attempt stores. The strip names the leader's region.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: The candidate list by region (laptop column, phone sheet, strip)

**Files:**
- Modify (replace whole file): `src/app/taste/training/candidates-panel.tsx`
- Modify (replace whole file): `src/app/taste/training/candidates-sheet.tsx`
- Modify: `src/app/taste/training/candidates-strip.tsx` (comment only; `stripLine` already changed in Task 2)
- Modify: `src/app/taste/training/training-room.tsx` (compute the groups; pass them to the column and the sheet)
- Modify: `src/lib/training/panel.ts`, `src/lib/training/panel.test.ts` (drop `panelView`, `PanelGroup`, `PanelView`)
- Modify: `src/lib/training/copy.ts`, `src/lib/training/copy.test.ts` (drop `showAllLine`, now unused)

**Interfaces:**
- Consumes (Task 2): `groupRanking`, `findMember`, `regionPanelView`, `groupExpanded`, `toggleGroup`, `ExpandState`, `RegionPanelView` (`groups.ts`); `RegionGroup` (`types.ts`); `regionLabel`, `groupSubLine`, `showAllRegionsLine`, `stripLine` (`copy.ts`).
- Produces: `CandidatesPanel({ groups: RegionGroup[]; note: WsetNoteState })`; `CandidatesSheet({ open; onOpenChange; groups: RegionGroup[]; note; returnFocusRef? })`; exported `CandidateRow` (unchanged props), `RegionGroups({ view: RegionPanelView; expand: ExpandState; onToggle(key: string): void; onOpen(id: string, anchor: HTMLElement): void; openId?: string | null })`, `ShowAllRegions({ view: RegionPanelView; onShowAll(): void })`. `training-room.tsx` gains `const groups = useMemo(() => groupRanking(ranked), [ranked]);` which Task 5 also passes to Your call.

UI behaviour (R3): the top five regions, then "Show all N regions"; a region row shows "Bourgogne, France", "best: Chablis Premier Cru" and the region's bar once there are numbers (before any answer: no bar, no best line, "Start describing the wine"); tapping it opens its typical wines in place (the existing wine rows, explanation and all); the top region starts open; the capped regions sit under "Unlikely from what you've said". On the laptop a wine row opens its popover exactly as today; on the phone it swaps the sheet to the wine's profile and Back finds the list as left (the open regions and Show all live in the sheet, not in the list).

- [ ] **Step 1: Update the tests for what goes away**

In `src/lib/training/panel.test.ts`:

Replace the import head:

```ts
import { describe, expect, it } from "vitest";
import { TRAINING_COPY } from "./copy";
import {
  PANEL_LIMIT,
  detailReturnsFocus,
  isBeforeAnswers,
  panelView,
  pressOnOwningRow,
```

with:

```ts
import { describe, expect, it } from "vitest";
import {
  PANEL_LIMIT,
  detailReturnsFocus,
  isBeforeAnswers,
  pressOnOwningRow,
```

Delete the `BEFORE` fixture and the blank line after it:

```ts
const BEFORE = [
  ranked(candidate("1", "A typical Barossa Shiraz", "Australia"), null),
  ranked(candidate("2", "A typical Clare Valley Riesling", "Australia"), null),
  ranked(candidate("3", "A typical Bandol", "France"), null),
  ranked(candidate("4", "A typical Chablis", "France"), null),
  ranked(candidate("5", "A typical Margaux", "France"), null),
  ranked(candidate("6", "A typical Barolo", "Italy"), null),
  ranked(candidate("7", "A typical Soave", "Italy"), null),
];

```

Replace:

```ts
describe("panelView", () => {
  it("groups the first five by country before anything is answered", () => {
    const view = panelView(BEFORE, false);
    expect(view.before).toBe(true);
    expect(view.total).toBe(7);
    expect(view.hidden).toBe(2);
    expect(view.groups.map((g) => [g.heading, ids(g.rows)])).toEqual([
      ["Australia", ["1", "2"]],
      ["France", ["3", "4", "5"]],
    ]);
    expect(PANEL_LIMIT).toBe(5);
  });

  it("shows every candidate once expanded", () => {
    const view = panelView(BEFORE, true);
    expect(view.hidden).toBe(0);
    expect(view.groups.map((g) => g.heading)).toEqual(["Australia", "France", "Italy"]);
  });

  it("puts capped candidates under the unlikely heading", () => {
    const list = [
      ranked(candidate("1", "A typical Pauillac", "France"), 91),
      ranked(candidate("2", "A typical Margaux", "France"), 84),
      ranked(candidate("3", "A typical Bandol", "France"), null),
      ranked(candidate("4", "A typical Chablis", "France"), 15, "colour"),
      ranked(candidate("5", "A typical Champagne", "France"), 12, "bubbles"),
      ranked(candidate("6", "A typical Sancerre", "France"), null, "colour"),
    ];
    const view = panelView(list, false);
    expect(view.before).toBe(false);
    expect(view.groups.map((g) => [g.heading, ids(g.rows)])).toEqual([
      [null, ["1", "2", "3"]],
      [TRAINING_COPY.unlikelyGroup, ["4", "5"]],
    ]);
    expect(view.hidden).toBe(1);
  });

  it("is in before-answers mode only while nothing has a number or a cap", () => {
```

with:

```ts
describe("isBeforeAnswers", () => {
  it("shows five region groups before Show all", () => {
    expect(PANEL_LIMIT).toBe(5);
  });

  it("is in before-answers mode only while nothing has a number or a cap", () => {
```

(the body of that last test and the rest of the file stay as they are; `groups.test.ts` covers the region list now; `ids` and `SCORED` stay until Task 5).

In `src/lib/training/copy.test.ts`, delete the line `    expect(showAllLine(17)).toBe("Show all 17");` and, in the import block, the line `  showAllLine,`.

- [ ] **Step 2: Run the tests**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training`
Expected: `Tests  192 passed (192)` (the removed tests are gone; the code they tested still exists until Step 3).

- [ ] **Step 3: Drop the retired helpers**

In `src/lib/training/panel.ts`, replace the header comment:

```ts
// View rules for the room's candidate list and Your call card (training-room
// spec §3.3, §5.8): the laptop column's top five and Show all, the
// before-answers country groups, the "Unlikely from what you've said" group,
// the Your call options and the vintage picker's groups and ids. Pure,
// relative imports only, so vitest pins it.
```

with:

```ts
// View rules for the room's candidate list and Your call card (training-room
// spec §3.3, §5.8): how many rows the lists show, whether anything has been
// answered yet, the laptop popover's focus rules, the Your call options and
// the vintage picker's groups and ids. The list's region groups live in
// ./groups (region-guess addendum R1-R3). Pure, relative imports only, so
// vitest pins it.
```

and replace:

```ts
/** Rows the laptop column shows before Show all. */
export const PANEL_LIMIT = 5;

export type PanelGroup = { key: string; heading: string | null; rows: RankedCandidate[] };
export type PanelView = { before: boolean; groups: PanelGroup[]; total: number; hidden: number };

/** Nothing answered yet that any candidate can be measured on, and nothing capped. */
export function isBeforeAnswers(ranked: readonly RankedCandidate[]): boolean {
  return ranked.every((r) => r.closeness === null && r.capped === null);
}

/**
 * The list as groups, in the matcher's order. Before any answer the groups are
 * countries (the matcher already sorts un-numbered candidates by country then
 * name); after, the uncapped rows come first without a heading and the capped
 * ones follow under "Unlikely from what you've said".
 */
export function panelView(
  ranked: readonly RankedCandidate[],
  expanded: boolean,
  limit: number = PANEL_LIMIT,
): PanelView {
  const before = isBeforeAnswers(ranked);
  const rows = expanded ? [...ranked] : ranked.slice(0, limit);
  const groups: PanelGroup[] = [];
  for (const r of rows) {
    const key = before ? `country:${r.candidate.country.name}` : r.capped ? "unlikely" : "likely";
    const heading = before ? r.candidate.country.name : r.capped ? TRAINING_COPY.unlikelyGroup : null;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, heading, rows: [r] });
  }
  return { before, groups, total: ranked.length, hidden: ranked.length - rows.length };
}
```

with:

```ts
/** Region groups the laptop column and the phone sheet show before Show all. */
export const PANEL_LIMIT = 5;

/** Nothing answered yet that any candidate can be measured on, and nothing capped. */
export function isBeforeAnswers(ranked: readonly RankedCandidate[]): boolean {
  return ranked.every((r) => r.closeness === null && r.capped === null);
}
```

In `src/lib/training/copy.ts`, delete:

```ts
/** "Show all {n}" */
export function showAllLine(n: number): string {
  return `Show all ${n}`;
}

```

- [ ] **Step 4: The laptop column**

Replace the whole of `src/app/taste/training/candidates-panel.tsx` with:

```tsx
"use client";

// "What it could be" — the laptop column (lg+, spec §3.3; region-guess
// addendum R3): the top five regions, Show all N regions in place, the capped
// ones last under "Unlikely from what you've said". A region row expands in
// place to its typical wines (the top region starts expanded); a wine row
// opens its profile in a popover anchored to it, and pressed again closes it;
// on a fine pointer focus moves into the popover and, closed with Escape,
// comes back to the row (the Popover touch rule: never on touch).
// CandidateRow, RegionGroups and ShowAllRegions are shared with the phone sheet.
// Tokens only: the bars are --primary, a capped row --muted-foreground.
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Eyebrow } from "@/components/overview/eyebrow";
import { finePointer } from "@/lib/fine-pointer";
import {
  TRAINING_COPY,
  groupSubLine,
  lineageLine,
  percentLabel,
  regionLabel,
  shortName,
  showAllRegionsLine,
} from "@/lib/training/copy";
import {
  findMember,
  groupExpanded,
  regionPanelView,
  toggleGroup,
  type ExpandState,
  type RegionPanelView,
} from "@/lib/training/groups";
import { detailReturnsFocus, pressOnOwningRow } from "@/lib/training/panel";
import type { RankedCandidate, RegionGroup } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";
import { cn } from "@/lib/utils";
import { ArchetypeDetail } from "./archetype-detail";

// 44 px on touch, the row's own height on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";

function ClosenessBar({ value, capped, label }: { value: number; capped: boolean; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={label}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <span
          className={cn("block h-full rounded-full", capped ? "bg-muted-foreground" : "bg-primary")}
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="w-11 shrink-0 text-right text-[12px] font-semibold tabular-nums">{percentLabel(value)}</span>
    </span>
  );
}

export function CandidateRow({
  r,
  onOpen,
  expanded,
}: {
  r: RankedCandidate;
  onOpen: (anchor: HTMLElement) => void;
  /** Set where the row opens a popover (the laptop column): whether its
      popover is the open one. The phone sheet swaps its own content instead. */
  expanded?: boolean;
}) {
  const capped = r.capped !== null;
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      aria-haspopup={expanded === undefined ? undefined : "dialog"}
      aria-expanded={expanded}
      className={cn(
        "flex w-full flex-col gap-1 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
        TAP,
      )}
    >
      <span className={cn("text-[13.5px] leading-tight font-semibold", capped && "text-muted-foreground")}>
        {r.candidate.name}
      </span>
      <span className="text-[11.5px] leading-snug text-muted-foreground">{lineageLine(r.candidate)}</span>
      {r.closeness !== null ? (
        <ClosenessBar value={r.closeness} capped={capped} label={shortName(r.candidate.name)} />
      ) : null}
      {r.explanation ? (
        <span className="text-[11.5px] leading-snug text-muted-foreground">{r.explanation}</span>
      ) : null}
    </button>
  );
}

// A region: "Bourgogne, France", "best: Chablis Premier Cru" once there are
// numbers, and the region's bar. It opens and closes its typical wines.
function RegionRow({ group, expanded, onToggle }: { group: RegionGroup; expanded: boolean; onToggle: () => void }) {
  const capped = group.capped !== null;
  const sub = groupSubLine(group);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        "flex w-full flex-col gap-1 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
        TAP,
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn("min-w-0 flex-1 text-[14px] leading-tight font-semibold", capped && "text-muted-foreground")}
        >
          {regionLabel(group)}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      </span>
      {sub ? <span className="text-[11.5px] leading-snug text-muted-foreground">{sub}</span> : null}
      {group.closeness !== null ? (
        <ClosenessBar value={group.closeness} capped={capped} label={regionLabel(group)} />
      ) : null}
    </button>
  );
}

export function RegionGroups({
  view,
  expand,
  onToggle,
  onOpen,
  openId,
}: {
  view: RegionPanelView;
  /** The group rows opened or closed by hand (the owner keeps it, so it
      survives the phone sheet swapping to a wine and back). */
  expand: ExpandState;
  onToggle: (key: string) => void;
  onOpen: (id: string, anchor: HTMLElement) => void;
  /** The laptop column only: the wine whose popover is open (null: none). */
  openId?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      {view.sections.map((section) => (
        <div key={section.key} className="flex flex-col">
          {section.heading ? (
            <Eyebrow size="sm" className="block px-3 pt-2 pb-1">
              {section.heading}
            </Eyebrow>
          ) : null}
          <ul className="flex flex-col">
            {section.groups.map((group) => {
              const expanded = groupExpanded(group.key, view.topKey, expand);
              return (
                <li key={group.key} className="flex flex-col">
                  <RegionRow group={group} expanded={expanded} onToggle={() => onToggle(group.key)} />
                  {expanded ? (
                    <ul className="ml-3 flex flex-col border-l border-border-light pl-1">
                      {group.members.map((r) => (
                        <li key={r.candidate.id}>
                          <CandidateRow
                            r={r}
                            onOpen={(anchor) => onOpen(r.candidate.id, anchor)}
                            expanded={openId === undefined ? undefined : openId === r.candidate.id}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** "Show all {n} regions", while some are hidden. */
export function ShowAllRegions({ view, onShowAll }: { view: RegionPanelView; onShowAll: () => void }) {
  if (view.hidden === 0) return null;
  return (
    <button
      type="button"
      onClick={onShowAll}
      className={cn(
        "mx-1 mb-1 flex items-center justify-center rounded-[10px] border border-border bg-background py-2 text-[12.5px] font-semibold text-primary transition-colors hover:border-gold",
        TAP,
      )}
    >
      {showAllRegionsLine(view.total)}
    </button>
  );
}

export function CandidatesPanel({ groups, note }: { groups: RegionGroup[]; note: WsetNoteState }) {
  const [showAll, setShowAll] = useState(false);
  const [expand, setExpand] = useState<ExpandState>({});
  const [detail, setDetail] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const view = regionPanelView(groups, showAll);
  const open = detail ? findMember(groups, detail.id) : null;
  const popupRef = useRef<HTMLDivElement>(null);
  // The row the open popover belongs to, and why it last closed: kept outside
  // `detail`, which is already null by the time the focus goes back.
  const anchorRef = useRef<HTMLElement | null>(null);
  const closeReason = useRef<string | null>(null);

  return (
    <section
      aria-labelledby="training-candidates"
      className="flex flex-col gap-2 rounded-[12px] border border-border bg-card p-2"
    >
      <h2 id="training-candidates" className="px-3 pt-2 font-heading text-[19px] font-semibold">
        {TRAINING_COPY.candidatesHeading}
      </h2>
      {view.before ? (
        <p className="px-3 text-[12.5px] text-muted-foreground">{TRAINING_COPY.beforeAnswers}</p>
      ) : null}
      <RegionGroups
        view={view}
        expand={expand}
        onToggle={(key) => setExpand((e) => toggleGroup(e, key, view.topKey))}
        openId={open ? open.candidate.id : null}
        onOpen={(id, anchor) => {
          // The open popover's own row toggles it closed, as a trigger would.
          if (detail?.id === id) {
            closeReason.current = "trigger-press";
            setDetail(null);
            return;
          }
          anchorRef.current = anchor;
          closeReason.current = null;
          setDetail({ id, anchor });
        }}
      />
      <ShowAllRegions view={view} onShowAll={() => setShowAll(true)} />

      <PopoverPrimitive.Root
        open={open !== null}
        onOpenChange={(next, details) => {
          if (next) return;
          // A press on the owning row is the row's to handle: its click, which
          // follows, closes the popover (onOpen above).
          const target = details.event?.target;
          if (pressOnOwningRow(details.reason, anchorRef.current, target instanceof Node ? target : null)) {
            details.cancel();
            return;
          }
          closeReason.current = details.reason;
          setDetail(null);
        }}
        modal={false}
      >
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            anchor={detail?.anchor ?? null}
            positionMethod="fixed"
            side="left"
            align="start"
            sideOffset={12}
            collisionPadding={16}
            className="z-50"
          >
            <PopoverPrimitive.Popup
              ref={popupRef}
              aria-label={open ? open.candidate.name : undefined}
              initialFocus={() => (finePointer() ? popupRef.current : false)}
              finalFocus={() =>
                detailReturnsFocus(closeReason.current, finePointer()) ? (anchorRef.current ?? false) : false
              }
              className="max-h-[80vh] w-[560px] overflow-y-auto overscroll-contain rounded-2xl bg-background p-4 shadow-lg ring-1 ring-foreground/10 outline-hidden"
            >
              {open ? <ArchetypeDetail candidate={open.candidate} note={note} /> : null}
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </section>
  );
}
```

- [ ] **Step 5: The phone sheet**

Replace the whole of `src/app/taste/training/candidates-sheet.tsx` with:

```tsx
"use client";

// Below lg: the ranked regions as the app's bottom sheet (spec §3.3, §8;
// region-guess addendum R3) — the tour sheet's idiom: one base-ui Dialog,
// rounded top, drag pill, at most 88dvh, the PHONE classes as max-lg: variants
// and a centred card from lg (never seen: the column takes over there). The
// top five regions, Show all N regions, a region row opening its typical wines
// in place (the top region starts open); a wine row swaps the sheet's content
// to that wine's profile with a back arrow — no stacked sheets — and back
// finds the list as it was left (the open regions and Show all live here, not
// in the list). ✕, Escape and the backdrop close it; focus moves in, and back
// to the strip on close, on a fine pointer only (the Popover touch rule). The
// list body is the only nested scroller (§8).
import { useState, type RefObject } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { finePointer } from "@/lib/fine-pointer";
import { TRAINING_COPY } from "@/lib/training/copy";
import { findMember, regionPanelView, toggleGroup, type ExpandState } from "@/lib/training/groups";
import type { RegionGroup } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";
import { cn } from "@/lib/utils";
import { ArchetypeDetail } from "./archetype-detail";
import { RegionGroups, ShowAllRegions } from "./candidates-panel";

// Overrides DialogContent's centred defaults below lg (tailwind-merge keeps the
// variants beside the defaults; a variant wins where it applies). max-w needs
// `!` to beat the default `sm:max-w-sm` between sm and lg.
const PHONE =
  "flex flex-col gap-0 overflow-hidden bg-card p-0 text-foreground max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:max-h-[88dvh] max-lg:w-full max-lg:max-w-none! max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-[22px_22px_0_0] max-lg:ring-0 max-lg:data-open:zoom-in-100 max-lg:data-open:slide-in-from-bottom-8";
const CARD = "lg:max-h-[80vh] lg:w-[480px] lg:max-w-[calc(100vw-2rem)] lg:rounded-2xl";

export function CandidatesSheet({
  open,
  onOpenChange,
  groups,
  note,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: RegionGroup[];
  note: WsetNoteState;
  /** The strip that opened the sheet: focus goes back to it on close (fine pointer only). */
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expand, setExpand] = useState<ExpandState>({});
  const detail = detailId ? findMember(groups, detailId) : null;
  const view = regionPanelView(groups, showAll);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setDetailId(null);
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        initialFocus={() => finePointer()}
        finalFocus={() => (finePointer() ? (returnFocusRef?.current ?? false) : false)}
        className={cn(PHONE, CARD)}
      >
        <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 pt-3 pb-3">
          <span aria-hidden className="h-1 w-[38px] self-center rounded-full bg-border lg:hidden" />
          <div className="flex items-center gap-1">
            {detail ? (
              <button
                type="button"
                aria-label={TRAINING_COPY.back}
                onClick={() => setDetailId(null)}
                className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <ArrowLeft aria-hidden className="size-5" />
              </button>
            ) : null}
            <DialogTitle className="min-w-0 flex-1 font-heading text-[20px] leading-tight font-semibold">
              {detail ? detail.candidate.name : TRAINING_COPY.candidatesHeading}
            </DialogTitle>
            {/* 44 px on touch, a compact 32 px on a laptop pointer. */}
            <DialogClose
              aria-label={TRAINING_COPY.close}
              className="-mr-2 inline-flex size-8 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted md:pointer-fine:min-h-0 md:pointer-fine:min-w-0"
            >
              <X aria-hidden className="size-5" />
            </DialogClose>
          </div>
          {!detail && view.before ? (
            <DialogDescription className="text-[12.5px] text-muted-foreground">
              {TRAINING_COPY.beforeAnswers}
            </DialogDescription>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2 pb-[max(16px,env(safe-area-inset-bottom))]">
          {detail ? (
            <div className="px-2">
              <ArchetypeDetail candidate={detail.candidate} note={note} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <RegionGroups
                view={view}
                expand={expand}
                onToggle={(key) => setExpand((e) => toggleGroup(e, key, view.topKey))}
                onOpen={(id) => setDetailId(id)}
              />
              <ShowAllRegions view={view} onShowAll={() => setShowAll(true)} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: The strip's comment**

In `src/app/taste/training/candidates-strip.tsx`, replace:

```ts
// Below lg: the 44 px strip in the WSET sheet's sticky bar (`belowBar`, spec
// §3.3) — "Top match: Pauillac 91 % · 2 more close" — which opens the
// candidates sheet. It re-renders with every answer. Exactly 44 px tall with
```

with:

```ts
// Below lg: the 44 px strip in the WSET sheet's sticky bar (`belowBar`, spec
// §3.3) — "Top match: Bordeaux · Pauillac 91 % · 2 more close" (the leading
// wine's region, then the wine: region-guess addendum R4, copy.ts's
// stripLine) — which opens the candidates sheet. It re-renders with every
// answer; the one line truncates rather than wraps. Exactly 44 px tall with
```

- [ ] **Step 7: Wire the room**

In `src/app/taste/training/training-room.tsx`:

After `import { clearDraft, draftClearedBy, newSessionKey, readDraft, writeDraft } from "@/lib/training/draft";` add:

```ts
import { groupRanking } from "@/lib/training/groups";
```

Replace:

```ts
  const ranked = useMemo(
    () => (note && extras ? rankCandidates(note, extras, candidates, lexicon) : []),
    [note, extras, candidates, lexicon],
  );
```

with:

```ts
  const ranked = useMemo(
    () => (note && extras ? rankCandidates(note, extras, candidates, lexicon) : []),
    [note, extras, candidates, lexicon],
  );
  // The same ranking by region (region-guess addendum R1-R3).
  const groups = useMemo(() => groupRanking(ranked), [ranked]);
```

Replace:

```tsx
            <CandidatesPanel ranked={ranked} note={session.note} />
          </aside>
        </div>
        <CandidatesSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          ranked={ranked}
```

with:

```tsx
            <CandidatesPanel groups={groups} note={session.note} />
          </aside>
        </div>
        <CandidatesSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          groups={groups}
```

(`ranked` stays: the strip, the snapshot and Your call still read it.)

- [ ] **Step 8: Tests and gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training && npx tsc --noEmit && npx eslint src/lib/training src/app/taste/training`
Expected: `Tests  192 passed (192)`; tsc and eslint print nothing.

- [ ] **Step 9: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add src/app/taste/training/candidates-panel.tsx src/app/taste/training/candidates-sheet.tsx src/app/taste/training/candidates-strip.tsx src/app/taste/training/training-room.tsx src/lib/training/panel.ts src/lib/training/panel.test.ts src/lib/training/copy.ts src/lib/training/copy.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(training): the candidate list shows regions that open to their wines

The laptop column and the phone sheet list the top five regions ("Bourgogne,
France", "best: Chablis Premier Cru", the region's bar), Show all N regions,
and a region row opens its typical wines in place; the top one starts open.
A wine row still opens its profile as before. panelView and showAllLine are
retired.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: The pick in the draft, the payload, history and the result line

**Files:**
- Modify: `src/lib/training/types.ts` (`TrainingDraft` + `pickedRegionId`, `pickedGrapeId`; `AttemptRow` + `pickedRegion`, `pickedGrape`)
- Modify: `src/lib/training/draft.ts`, `src/lib/training/draft.test.ts`
- Modify: `src/lib/training/action-types.ts` (`FinishInput`)
- Modify: `src/lib/training/attempt-payload.ts`, `src/lib/training/attempt-payload.test.ts`
- Modify: `src/lib/training/pool-shape.ts`, `src/lib/training/pool-shape.test.ts`
- Modify: `src/lib/training/pool.ts` (`hydrateAttempts` names the picked region and grape)
- Modify: `src/lib/training/copy.ts`, `src/lib/training/copy.test.ts` (`pickSaidLine`; `attemptRowLine` uses it)
- Modify: `src/lib/training/history-math.test.ts`, `src/lib/training/result-math.test.ts` (fixtures gain the new fields)
- Modify: `src/app/taste/training/result-view.tsx`, `src/app/taste/training/training-room.tsx`

**Interfaces:**
- Consumes (Task 1): `training_attempts.picked_region_id`, `.picked_grape_id`; the RPC's `p_attempt.picked_region_id` / `picked_grape_id`. (Task 2): `CallPick`, `NO_CALL`, `normalizeCall`, `callPayload`, `youSaidRegionLine`, `youSaidLine`.
- Produces: `TrainingDraft.pickedRegionId: string | null`, `TrainingDraft.pickedGrapeId: string | null` (so a `TrainingDraft` is a `CallPick`); `AttemptRow.pickedRegion: Named | null`, `AttemptRow.pickedGrape: Named | null`; `FinishInput.pickedRegionId: string | null`, `FinishInput.pickedGrapeId: string | null`; `attemptPayload` sends `picked_region_id` / `picked_grape_id` and refuses both picks or a grape alone; `shapeAttemptRow(raw, ctx)` with `ctx.regionNames` / `ctx.grapeNames: ReadonlyMap<string, string>`; `pickSaidLine(row: Pick<AttemptRow, "picked" | "pickedRegion" | "pickedGrape">, vintage: VintageGuess): string`.

The data path lands before the Your call UI (Task 5): until then the old card only ever picks a typical wine, and `callPayload` sends it alone.

- [ ] **Step 1: Write the failing tests**

`src/lib/training/draft.test.ts` — in `function draft(…)`, replace:

```ts
    extras: { bubbles: false, fortified: null },
    pickedArchetypeId: "arch-margaux",
    vintage: { kind: "YEAR", year: 2016 },
    ...patch,
  };
}
```

with:

```ts
    extras: { bubbles: false, fortified: null },
    pickedArchetypeId: "arch-margaux",
    pickedRegionId: "region-bordeaux",
    pickedGrapeId: null,
    vintage: { kind: "YEAR", year: 2016 },
    ...patch,
  };
}
```

Immediately before `  it("clears only this user's draft", () => {`, insert:

```ts
  it("keeps a pick that stopped at the region, with or without a grape", () => {
    const s = fakeStorage();
    const regionPick = { pickedArchetypeId: null, pickedRegionId: "region-bourgogne", pickedGrapeId: "grape-chardonnay" };
    writeDraft(draft(regionPick), s.get);
    expect(readDraft(USER, s.get)).toEqual(draft(regionPick));
    writeDraft(draft({ ...regionPick, pickedGrapeId: null }), s.get);
    expect(readDraft(USER, s.get)?.pickedGrapeId).toBeNull();
  });

  it("reads a draft saved before the region step with no region and no grape", () => {
    const s = fakeStorage();
    const older: Record<string, unknown> = { ...draft() };
    delete older.pickedRegionId;
    delete older.pickedGrapeId;
    s.get().setItem(draftKey(USER), JSON.stringify(older));
    const read = readDraft(USER, s.get);
    expect(read?.pickedArchetypeId).toBe("arch-margaux");
    expect(read?.pickedRegionId).toBeNull();
    expect(read?.pickedGrapeId).toBeNull();
  });

```

In "refuses a malformed draft", after `      { ...draft(), pickedArchetypeId: 42 },` add:

```ts
      { ...draft(), pickedRegionId: 7 },
      { ...draft(), pickedGrapeId: { id: "grape-chardonnay" } },
```

`src/lib/training/attempt-payload.test.ts` — after `const NOTE = "00000000-0000-4000-8000-00000000d001";` add:

```ts
const REGION = "00000000-0000-4000-8000-00000000e101";
const GRAPE = "00000000-0000-4000-8000-00000000e201";
```

In `function input(…)`, replace:

```ts
    pickedArchetypeId: ARCH,
    vintage: { kind: "YEAR", year: 2016 },
```

with:

```ts
    pickedArchetypeId: ARCH,
    pickedRegionId: null,
    pickedGrapeId: null,
    vintage: { kind: "YEAR", year: 2016 },
```

In "builds the RPC's p_attempt from a valid input", replace:

```ts
        picked_archetype_id: ARCH,
        guessed_vintage_kind: "YEAR",
```

with:

```ts
        picked_archetype_id: ARCH,
        picked_region_id: null,
        picked_grape_id: null,
        guessed_vintage_kind: "YEAR",
```

and replace:

```ts
        picked_archetype_id: null,
        guessed_vintage_kind: null,
```

with:

```ts
        picked_archetype_id: null,
        picked_region_id: null,
        picked_grape_id: null,
        guessed_vintage_kind: null,
```

Replace the test "refuses a bad session key, start time, pick or wine id" with:

```ts
  it("sends a pick that stopped at the region, with or without its grape", () => {
    expect(attemptPayload(input({ pickedArchetypeId: null, pickedRegionId: REGION, pickedGrapeId: GRAPE }))).toMatchObject({
      attempt: { picked_archetype_id: null, picked_region_id: REGION, picked_grape_id: GRAPE },
    });
    expect(attemptPayload(input({ pickedArchetypeId: null, pickedRegionId: REGION }))).toMatchObject({
      attempt: { picked_archetype_id: null, picked_region_id: REGION, picked_grape_id: null },
    });
  });

  it("refuses a bad session key, start time, pick or wine id", () => {
    for (const bad of [
      input({ sessionKey: "nope" }),
      input({ startedAt: "yesterday" }),
      input({ pickedArchetypeId: "x" }),
      input({ pickedArchetypeId: null, pickedRegionId: "x" }),
      input({ pickedArchetypeId: null, pickedRegionId: REGION, pickedGrapeId: "x" }),
      input({ actualCatalogWineId: "x" }),
    ]) {
      expect(attemptPayload(bad)).toEqual({ error: SAVE_REFUSED });
    }
  });

  it("refuses a typical wine and a region together, and a grape without a region", () => {
    expect(attemptPayload(input({ pickedRegionId: REGION }))).toEqual({ error: SAVE_REFUSED });
    expect(attemptPayload(input({ pickedArchetypeId: null, pickedGrapeId: GRAPE }))).toEqual({ error: SAVE_REFUSED });
  });
```

`src/lib/training/pool-shape.test.ts` — replace:

```ts
import {
  HISTORY_PAGE,
  actualWineLineage,
```

with:

```ts
import {
  ATTEMPT_COLUMNS,
  HISTORY_PAGE,
  actualWineLineage,
```

In `function attempt(…)`, after `    picked_archetype_id: ARCH_PAUILLAC,` add:

```ts
    picked_region_id: null,
    picked_grape_id: null,
```

Replace:

```ts
const CTX = {
  archetypeNames: new Map([
    [ARCH_PAUILLAC, "A typical Pauillac"],
    [ARCH_BOURGOGNE, "A typical Bourgogne rouge"],
  ]),
```

with:

```ts
const REGION_BGN = "00000000-0000-4000-8000-00000000e101";
const GRAPE_PN = "00000000-0000-4000-8000-00000000e201";

const CTX = {
  archetypeNames: new Map([
    [ARCH_PAUILLAC, "A typical Pauillac"],
    [ARCH_BOURGOGNE, "A typical Bourgogne rouge"],
  ]),
  regionNames: new Map([[REGION_BGN, "Bourgogne"]]),
  grapeNames: new Map([[GRAPE_PN, "Pinot Noir"]]),
```

In "shapes a scored attempt and follows a merged wine", after `      picked: { id: ARCH_PAUILLAC, name: "A typical Pauillac" },` add:

```ts
      pickedRegion: null,
      pickedGrape: null,
```

At the end of `describe("shapeAttemptRow", …)` (after the test "shapes an unrevealed attempt and a wine the viewer cannot read"), insert:

```ts

  it("names a pick that stopped at the region, with its grape (region-guess addendum R8)", () => {
    const regionPick = shapeAttemptRow(
      attempt({ picked_archetype_id: null, picked_region_id: REGION_BGN, picked_grape_id: GRAPE_PN }),
      CTX,
    );
    expect(regionPick.picked).toBeNull();
    expect(regionPick.pickedRegion).toEqual({ id: REGION_BGN, name: "Bourgogne" });
    expect(regionPick.pickedGrape).toEqual({ id: GRAPE_PN, name: "Pinot Noir" });
    // A name that was not read leaves the pick unnamed rather than half-named.
    const unread = shapeAttemptRow(attempt({ picked_archetype_id: null, picked_region_id: "gone" }), CTX);
    expect(unread.pickedRegion).toBeNull();
  });

  it("reads the two pick columns", () => {
    expect(ATTEMPT_COLUMNS).toContain("picked_region_id, picked_grape_id");
  });
```

`src/lib/training/history-math.test.ts` — in `function row(…)`, after `    picked: { id: "arch-pauillac", name: "A typical Pauillac" },` add:

```ts
    pickedRegion: null,
    pickedGrape: null,
```

Immediately before `  it("not revealed: the list adds the Reveal now button after it", () => {`, insert:

```ts
  it("a pick that stopped at the region, with or without a grape (region-guess addendum R8)", () => {
    const bourgogne = { id: "region-bgn", name: "Bourgogne" };
    const r = { ...scored(8, 0, 13), picked: null, pickedRegion: bourgogne, pickedGrape: { id: "g", name: "Chardonnay" } };
    expect(attemptRowLine(r, utc)).toBe("24 Sep · You said Bourgogne · Chardonnay · It was Château Talbot 2016 · 13 of 22");
    expect(attemptRowLine(row({ picked: null, pickedRegion: bourgogne }), utc)).toBe(
      "24 Sep · You said Bourgogne · Not revealed",
    );
  });

```

`src/lib/training/result-math.test.ts` — in `function row(…)`, replace:

```ts
    createdAt,
    picked: null,
    vintage: null,
```

with:

```ts
    createdAt,
    picked: null,
    pickedRegion: null,
    pickedGrape: null,
    vintage: null,
```

In the `LEFT` draft, after `    pickedArchetypeId: "arch-margaux",` add:

```ts
    pickedRegionId: "region-bordeaux",
    pickedGrapeId: null,
```

`src/lib/training/copy.test.ts` — add `pickSaidLine,` to the import list right after `percentLabel,`. After the test "You said {region} · {grape}{, vintage} for a pick that stopped at the region" (Task 2), insert:

```ts
  it("pickSaidLine words each kind of pick (R8)", () => {
    const none = { picked: null, pickedRegion: null, pickedGrape: null };
    const bourgogne = { id: "region-bgn", name: "Bourgogne" };
    const nv = { kind: "NV" } as const;
    expect(pickSaidLine({ ...none, picked: { id: "a", name: "A typical Chablis Premier Cru" } }, nv)).toBe(
      "You said Chablis Premier Cru, NV",
    );
    expect(pickSaidLine({ ...none, pickedRegion: bourgogne, pickedGrape: { id: "g", name: "Chardonnay" } }, null)).toBe(
      "You said Bourgogne · Chardonnay",
    );
    expect(pickSaidLine({ ...none, pickedRegion: bourgogne }, nv)).toBe("You said Bourgogne, NV");
    expect(pickSaidLine(none, nv)).toBe("You didn't pick a wine");
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training`
Expected: FAIL — draft (the new fields are not read back), attempt-payload (`picked_region_id` missing; the both-picks and grape-alone inputs are accepted), pool-shape (`pickedRegion` / `pickedGrape` absent, `ATTEMPT_COLUMNS` lacks the columns), history-math (the region row reads "You didn't pick a wine"), copy (`pickSaidLine` is not a function).

- [ ] **Step 3: The types**

In `src/lib/training/types.ts`, replace:

```ts
/** An unfinished session, kept on the device only (D13). */
export type TrainingDraft = {
  userId: string;
  sessionKey: string;
  startedAt: string;
  note: WsetNoteState;
  extras: MatchExtras;
  pickedArchetypeId: string | null;
  vintage: VintageGuess;
};
```

with:

```ts
/** An unfinished session, kept on the device only (D13). Its pick is Your
    call's (CallPick): a region, optionally a grape, or a typical wine — whose
    region the draft keeps too, so the region step can show it. */
export type TrainingDraft = {
  userId: string;
  sessionKey: string;
  startedAt: string;
  note: WsetNoteState;
  extras: MatchExtras;
  pickedArchetypeId: string | null;
  pickedRegionId: string | null;
  pickedGrapeId: string | null;
  vintage: VintageGuess;
};
```

and replace:

```ts
/** One row of Your sessions (spec §3.6). */
export type AttemptRow = {
  id: string;
  createdAt: string;
  picked: Named | null;
```

with:

```ts
/** One row of Your sessions (spec §3.6). `picked` is a typical wine; a pick
    that stopped at the region has `pickedRegion` (and maybe `pickedGrape`)
    instead (region-guess addendum R7, R8). */
export type AttemptRow = {
  id: string;
  createdAt: string;
  picked: Named | null;
  pickedRegion: Named | null;
  pickedGrape: Named | null;
```

- [ ] **Step 4: The draft reads old and new drafts**

In `src/lib/training/draft.ts`, replace:

```ts
const NOTE_ARRAYS = ["observations", "faults", "tanninNature", "noseTermIds", "palateTermIds"] as const;

/**
 * This user's draft, or null when there is none, it cannot be read, it is not
 * valid JSON, or its shape is wrong (a draft from another user, a bad session
 * key or timestamp, a malformed pick, extras or vintage). A note saved by an
 * older build is filled up from `emptyNoteState()`, so a field added later
 * starts unrated rather than undefined.
 */
```

with:

```ts
// A pick id: a string, or none. A draft saved before the region step
// (region-guess addendum R5) has no region or grape key at all.
function isOptionalId(v: unknown): v is string | null | undefined {
  return v === undefined || v === null || typeof v === "string";
}

const NOTE_ARRAYS = ["observations", "faults", "tanninNature", "noseTermIds", "palateTermIds"] as const;

/**
 * This user's draft, or null when there is none, it cannot be read, it is not
 * valid JSON, or its shape is wrong (a draft from another user, a bad session
 * key or timestamp, a malformed pick, extras or vintage). A note saved by an
 * older build is filled up from `emptyNoteState()`, so a field added later
 * starts unrated rather than undefined; a draft from before the region step
 * reads with no region and no grape (the room then gives a picked typical wine
 * its region: call.ts's normalizeCall).
 */
```

and replace:

```ts
  if (d.pickedArchetypeId !== null && typeof d.pickedArchetypeId !== "string") return null;
  if (!isVintage(d.vintage)) return null;
  return {
    userId,
    sessionKey: d.sessionKey,
    startedAt: d.startedAt,
    note,
    extras: { bubbles: d.extras.bubbles, fortified: d.extras.fortified },
    pickedArchetypeId: d.pickedArchetypeId,
    vintage: d.vintage,
  };
```

with:

```ts
  if (d.pickedArchetypeId !== null && typeof d.pickedArchetypeId !== "string") return null;
  if (!isOptionalId(d.pickedRegionId) || !isOptionalId(d.pickedGrapeId)) return null;
  if (!isVintage(d.vintage)) return null;
  return {
    userId,
    sessionKey: d.sessionKey,
    startedAt: d.startedAt,
    note,
    extras: { bubbles: d.extras.bubbles, fortified: d.extras.fortified },
    pickedArchetypeId: d.pickedArchetypeId,
    pickedRegionId: d.pickedRegionId ?? null,
    pickedGrapeId: d.pickedGrapeId ?? null,
    vintage: d.vintage,
  };
```

- [ ] **Step 5: The finish input and its server-side check**

In `src/lib/training/action-types.ts`, replace:

```ts
  aromas: AromaPayload[];
  pickedArchetypeId: string | null;
  vintage: VintageGuess;
```

with:

```ts
  aromas: AromaPayload[];
  /** call.ts's callPayload: a typical wine alone, or a region with an
      optional grape, or none (region-guess addendum R7). */
  pickedArchetypeId: string | null;
  pickedRegionId: string | null;
  pickedGrapeId: string | null;
  vintage: VintageGuess;
```

In `src/lib/training/attempt-payload.ts`, replace:

```ts
/** record_training_attempt's p_attempt for a fresh attempt, or a refusal. */
export function attemptPayload(
  input: FinishInput,
): { attempt: Record<string, unknown> } | { error: string } {
  const ok =
    input !== null &&
    typeof input === "object" &&
    isUuid(input.sessionKey) &&
    typeof input.startedAt === "string" &&
    TIMESTAMP.test(input.startedAt) &&
    (input.pickedArchetypeId === null || isUuid(input.pickedArchetypeId)) &&
    (input.actualCatalogWineId === null || isUuid(input.actualCatalogWineId)) &&
```

with:

```ts
/**
 * record_training_attempt's p_attempt for a fresh attempt, or a refusal. The
 * pick is a typical wine, or a region with an optional grape — never both, and
 * never a grape alone (the table's own checks, region-guess addendum R7).
 */
export function attemptPayload(
  input: FinishInput,
): { attempt: Record<string, unknown> } | { error: string } {
  const ok =
    input !== null &&
    typeof input === "object" &&
    isUuid(input.sessionKey) &&
    typeof input.startedAt === "string" &&
    TIMESTAMP.test(input.startedAt) &&
    (input.pickedArchetypeId === null || isUuid(input.pickedArchetypeId)) &&
    (input.pickedRegionId === null || isUuid(input.pickedRegionId)) &&
    (input.pickedGrapeId === null || isUuid(input.pickedGrapeId)) &&
    (input.pickedArchetypeId === null || input.pickedRegionId === null) &&
    (input.pickedGrapeId === null || input.pickedRegionId !== null) &&
    (input.actualCatalogWineId === null || isUuid(input.actualCatalogWineId)) &&
```

and replace:

```ts
      picked_archetype_id: input.pickedArchetypeId,
      ...vintageColumns(input.vintage),
```

with:

```ts
      picked_archetype_id: input.pickedArchetypeId,
      picked_region_id: input.pickedRegionId,
      picked_grape_id: input.pickedGrapeId,
      ...vintageColumns(input.vintage),
```

- [ ] **Step 6: The history read**

In `src/lib/training/pool-shape.ts`, replace:

```ts
export const ATTEMPT_COLUMNS: string =
  "id, created_at, note_id, picked_archetype_id, guessed_vintage_kind, guessed_vintage_year, " +
```

with:

```ts
export const ATTEMPT_COLUMNS: string =
  "id, created_at, note_id, picked_archetype_id, picked_region_id, picked_grape_id, " +
  "guessed_vintage_kind, guessed_vintage_year, " +
```

In `AttemptRaw`, replace:

```ts
  note_id: string;
  picked_archetype_id: string | null;
  guessed_vintage_kind: VintageKind | null;
```

with:

```ts
  note_id: string;
  picked_archetype_id: string | null;
  picked_region_id: string | null;
  picked_grape_id: string | null;
  guessed_vintage_kind: VintageKind | null;
```

Replace:

```ts
export function shapeAttemptRow(
  raw: AttemptRaw,
  ctx: {
    archetypeNames: ReadonlyMap<string, string>;
    mergedInto: ReadonlyMap<string, string | null>;
    wines: ReadonlyMap<string, WineDisplay>;
  },
): AttemptRow {
  const archetype = (id: string | null): Named | null => {
    const name = id ? ctx.archetypeNames.get(id) : undefined;
    return id && name !== undefined ? { id, name } : null;
  };
```

with:

```ts
// An id with its name, or null when there is no id or no name was read for it.
function namedFrom(names: ReadonlyMap<string, string>, id: string | null): Named | null {
  const name = id ? names.get(id) : undefined;
  return id && name !== undefined ? { id, name } : null;
}

export function shapeAttemptRow(
  raw: AttemptRaw,
  ctx: {
    archetypeNames: ReadonlyMap<string, string>;
    /** The picked regions' and grapes' names (region-guess addendum R8). */
    regionNames: ReadonlyMap<string, string>;
    grapeNames: ReadonlyMap<string, string>;
    mergedInto: ReadonlyMap<string, string | null>;
    wines: ReadonlyMap<string, WineDisplay>;
  },
): AttemptRow {
  const archetype = (id: string | null) => namedFrom(ctx.archetypeNames, id);
```

and replace:

```ts
    picked: archetype(raw.picked_archetype_id),
    vintage: vintageFromColumns(
```

with:

```ts
    picked: archetype(raw.picked_archetype_id),
    pickedRegion: namedFrom(ctx.regionNames, raw.picked_region_id),
    pickedGrape: namedFrom(ctx.grapeNames, raw.picked_grape_id),
    vintage: vintageFromColumns(
```

In `src/lib/training/pool.ts`, replace:

```ts
// Names the picks and the archetypes, follows merged wines and reads their labels.
// A wine the viewer cannot read (a hidden catalog row) keeps label null: the copy
// says "a wine you can't see yet".
async function hydrateAttempts(supabase: Client, raws: readonly AttemptRaw[]): Promise<Hydrated[]> {
  if (raws.length === 0) return [];
  const archetypeIds = raws
    .flatMap((r) => [r.picked_archetype_id, r.actual_archetype_id])
    .filter((id): id is string => id !== null);
  const wineIds = raws.map((r) => r.actual_catalog_wine_id).filter((id): id is string => id !== null);

  const [archetypes, mergedInto] = await Promise.all([
    readByIds("archetype names", archetypeIds, (chunk) =>
      supabase.from("wine_archetypes").select("id, name").in("id", chunk),
    ),
    followMerges(supabase, wineIds),
  ]);
```

with:

```ts
// Names the picks (a typical wine, or a region and grape) and the archetypes,
// follows merged wines and reads their labels. A wine the viewer cannot read (a
// hidden catalog row) keeps label null: the copy says "a wine you can't see yet".
async function hydrateAttempts(supabase: Client, raws: readonly AttemptRaw[]): Promise<Hydrated[]> {
  if (raws.length === 0) return [];
  const present = (ids: (string | null)[]) => ids.filter((id): id is string => id !== null);
  const archetypeIds = present(raws.flatMap((r) => [r.picked_archetype_id, r.actual_archetype_id]));
  const regionIds = present(raws.map((r) => r.picked_region_id));
  const grapeIds = present(raws.map((r) => r.picked_grape_id));
  const wineIds = present(raws.map((r) => r.actual_catalog_wine_id));

  const [archetypes, regions, grapes, mergedInto] = await Promise.all([
    readByIds("archetype names", archetypeIds, (chunk) =>
      supabase.from("wine_archetypes").select("id, name").in("id", chunk),
    ),
    readByIds("picked regions", regionIds, (chunk) => supabase.from("regions").select("id, name").in("id", chunk)),
    readByIds("picked grapes", grapeIds, (chunk) => supabase.from("grapes").select("id, name").in("id", chunk)),
    followMerges(supabase, wineIds),
  ]);
```

and replace:

```ts
  const archetypeNames = new Map(archetypes.map((a) => [a.id, a.name] as const));

  return raws.map((raw) => {
    const row = shapeAttemptRow(raw, { archetypeNames, mergedInto, wines });
```

with:

```ts
  const archetypeNames = new Map(archetypes.map((a) => [a.id, a.name] as const));
  const regionNames = new Map(regions.map((r) => [r.id, r.name] as const));
  const grapeNames = new Map(grapes.map((g) => [g.id, g.name] as const));

  return raws.map((raw) => {
    const row = shapeAttemptRow(raw, { archetypeNames, regionNames, grapeNames, mergedInto, wines });
```

- [ ] **Step 7: The "You said" lines**

In `src/lib/training/copy.ts`, immediately before `/** "It was {wine}"; an unreadable wine reads "a wine you can't see yet". */`, insert:

```ts
/**
 * What the taster said (R8): a typical wine "You said Pauillac{, vintage}", a
 * region "You said Bourgogne · Chardonnay{, vintage}" or "You said
 * Bourgogne{, vintage}", else "You didn't pick a wine". The history row passes
 * no vintage — its line never showed one.
 */
export function pickSaidLine(
  row: Pick<AttemptRow, "picked" | "pickedRegion" | "pickedGrape">,
  vintage: VintageGuess,
): string {
  if (row.picked) return youSaidLine(row.picked.name, vintage);
  if (row.pickedRegion) return youSaidRegionLine(row.pickedRegion.name, row.pickedGrape?.name ?? null, vintage);
  return TRAINING_COPY.noPick;
}

```

and replace:

```ts
/**
 * One history row's text (spec §3.6, §9 "history"):
 * "24 Sep · You said Pauillac · It was Saint-Julien · 14 of 22",
 * "24 Sep · You didn't pick a wine · It was … · 0 of 22",
 * "24 Sep · You said Pauillac · Not revealed". An unrevealed row's
 * "Reveal now" is a button the list renders after this text
 * (TRAINING_COPY.revealNow), so it is not part of the string.
 */
export function attemptRowLine(row: AttemptRow, opts?: { timeZone?: string }): string {
  const parts = [shortDate(row.createdAt, opts?.timeZone)];
  parts.push(row.picked ? `You said ${shortName(row.picked.name)}` : TRAINING_COPY.noPick);
```

with:

```ts
/**
 * One history row's text (spec §3.6, §9 "history"; region-guess addendum R8):
 * "24 Sep · You said Pauillac · It was Saint-Julien · 14 of 22",
 * "24 Sep · You said Bourgogne · Chardonnay · It was … · 13 of 22",
 * "24 Sep · You didn't pick a wine · It was … · 0 of 22",
 * "24 Sep · You said Pauillac · Not revealed". An unrevealed row's
 * "Reveal now" is a button the list renders after this text
 * (TRAINING_COPY.revealNow), so it is not part of the string.
 */
export function attemptRowLine(row: AttemptRow, opts?: { timeZone?: string }): string {
  const parts = [shortDate(row.createdAt, opts?.timeZone)];
  parts.push(pickSaidLine(row, null));
```

In `src/app/taste/training/result-view.tsx`, replace:

```ts
  itWasLine,
  percentLabel,
  resultTotalLine,
  shortName,
  styleVerdictLine,
  youSaidLine,
} from "@/lib/training/copy";
```

with:

```ts
  itWasLine,
  percentLabel,
  pickSaidLine,
  resultTotalLine,
  shortName,
  styleVerdictLine,
} from "@/lib/training/copy";
```

and replace:

```ts
  const said = row.picked ? youSaidLine(row.picked.name, row.vintage) : TRAINING_COPY.noPick;
```

with:

```ts
  // "You said Pauillac, 2016" · "You said Bourgogne · Chardonnay" · "You didn't pick a wine".
  const said = pickSaidLine(row, row.vintage);
```

- [ ] **Step 8: The room starts, continues and finishes with the new pick**

In `src/app/taste/training/training-room.tsx`, after `import { SAVE_REFUSED } from "@/lib/training/attempt-payload";` add:

```ts
import { NO_CALL, callPayload, normalizeCall } from "@/lib/training/call";
```

Replace:

```ts
      extras: { bubbles: null, fortified: null },
      pickedArchetypeId: null,
      vintage: null,
    });
    enterView("session");
  }

  function continueSession() {
    if (!stored) return;
    setError(null);
    setSession(stored);
    enterView("session");
  }
```

with:

```ts
      extras: { bubbles: null, fortified: null },
      ...NO_CALL,
      vintage: null,
    });
    enterView("session");
  }

  // A draft from before the region step names a typical wine but no region:
  // normalizeCall gives the wine its region (and drops a pick that left the pool).
  function continueSession() {
    if (!stored) return;
    setError(null);
    setSession({ ...stored, ...normalizeCall(stored, candidates) });
    enterView("session");
  }
```

and replace:

```ts
        aromas: aromasToPayload(draft.note),
        pickedArchetypeId: draft.pickedArchetypeId,
        vintage: draft.vintage,
```

with:

```ts
        aromas: aromasToPayload(draft.note),
        // A typical wine alone, or the region with its optional grape (R7).
        ...callPayload(draft),
        vintage: draft.vintage,
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training`
Expected: `Test Files  12 passed (12)`, `Tests  200 passed (200)` (+2 draft, +2 attempt-payload, +2 pool-shape, +1 history-math, +1 copy).

- [ ] **Step 10: Gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx tsc --noEmit && npx eslint src/lib/training src/app/taste/training`
Expected: no output.

- [ ] **Step 11: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add src/lib/training/types.ts src/lib/training/draft.ts src/lib/training/draft.test.ts src/lib/training/action-types.ts src/lib/training/attempt-payload.ts src/lib/training/attempt-payload.test.ts src/lib/training/pool-shape.ts src/lib/training/pool-shape.test.ts src/lib/training/pool.ts src/lib/training/copy.ts src/lib/training/copy.test.ts src/lib/training/history-math.test.ts src/lib/training/result-math.test.ts src/app/taste/training/result-view.tsx src/app/taste/training/training-room.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(training): a region pick in the draft, the payload and history

The device draft carries pickedRegionId and pickedGrapeId (an older draft
reads with neither, and Continue gives a picked typical wine its region); the
finish sends a typical wine alone or a region with its optional grape, and the
server check refuses both or a grape alone. History names the picked region
and grape: "You said Bourgogne · Chardonnay".

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Your call in two steps (region, then deeper or a grape)

**Files:**
- Modify (replace whole file): `src/app/taste/training/your-call.tsx`
- Modify: `src/app/taste/training/training-room.tsx` (the grapes prop, `patchCall`, the new Your call props)
- Modify: `src/app/taste/training/page.tsx` (read every grape)
- Modify: `src/lib/training/pool.ts` (`readTrainingGrapes`)
- Modify: `src/lib/training/copy.ts`, `src/lib/training/copy.test.ts` (retire `whichWine`, `somethingElse`)
- Modify: `src/lib/training/panel.ts`, `src/lib/training/panel.test.ts` (retire `yourCallOptions`)

**Interfaces:**
- Consumes (Task 2): `regionCallOptions`, `regionGrapeChoices`, `grapeChips`, `chooseRegion`, `chooseDeeper`, `chooseGrape`, `NO_CALL` (`call.ts`); `RegionGroup`, `CallPick`, `Named`. (Task 3): `groups` in `training-room.tsx`. (Task 4): `TrainingDraft` with the pick fields. The guess ladder's `FieldPicker` (`src/app/tastings/[id]/play/field-picker.tsx`) as the vintage picker already uses it: `search="client"`, a keep-mounted search input focused synchronously inside the opening tap; with `searchPlaceholder` and no `totalCount` it shows "Search grapes…".
- Produces: `YourCall({ groups: RegionGroup[]; pick: CallPick; grapes: Named[]; onRegion(regionId: string): void; onDeeper(archetypeId: string | null): void; onGrape(grapeId: string | null): void; onNotListed(): void; vintage; onVintage; onReveal; onCantFindOut; busy; error })`; `TrainingRoom` prop `grapes: Named[]`; `readTrainingGrapes(supabase: Client): Promise<Named[]>` (server-only, `cache()`d, paged).

UI behaviour (R5): step 1 "Which region is it?" — "Search regions…" above the top five regions as radios (region, country, %) and "It's not in the list"; a search also finds a region by one of its wines or appellations ("chablis" → Bourgogne). Step 2, once a region is chosen: "Go deeper (optional)" — "Just the region" (default) and the region's typical wines with their %. Step 3, only while "Just the region" is chosen: "Grape (optional)" — the region's grapes as chips (most named first; tap again to let go) and "Other grape…", which opens the guess ladder's picker over every grape ("Search grapes…"); a grape picked there shows as a pressed chip. Choosing a typical wine hides the grape step (its grape is kept, never sent). A new region clears the deeper choice and the grape; "It's not in the list" clears everything. Vintage and the two buttons are unchanged.

- [ ] **Step 1: Update the tests for what goes away**

In `src/lib/training/copy.test.ts`, in the `TRAINING_COPY` expectation, delete the two lines:

```ts
      whichWine: "Which wine is it?",
      somethingElse: "Something else…",
```

In `src/lib/training/panel.test.ts`, delete `  yourCallOptions,` from the `./panel` import, delete the `ids` helper and the `SCORED` fixture:

```ts
const ids = (rows: RankedCandidate[]) => rows.map((r) => r.candidate.id);

const SCORED = [
  ranked(candidate("1", "A typical Pauillac", "France", "Bordeaux"), 91),
  ranked(candidate("2", "A typical Margaux", "France", "Bordeaux"), 84),
  ranked(candidate("3", "A typical Bandol", "France", "Provence"), 80),
  ranked(candidate("4", "A typical Barolo", "Italy", "Piemonte"), 72),
  ranked(candidate("5", "A typical Rioja Reserva", "Spain", "Rioja"), 70),
  ranked(candidate("6", "A typical Barossa Shiraz", "Australia", "South Australia"), 61),
  ranked(candidate("7", "A typical Côte-Rôtie", "France", "Rhône"), 55),
];

```

and the whole `describe("yourCallOptions", …)` block (its two tests; `call.test.ts`'s `regionCallOptions` tests replace them).

- [ ] **Step 2: Run the tests to see the copy test fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training`
Expected: FAIL — `copy.test.ts` "holds every fixed string": `TRAINING_COPY` still has `whichWine` and `somethingElse`.

- [ ] **Step 3: Retire the old strings and options**

In `src/lib/training/copy.ts`, replace:

```ts
  yourCall: "Your call",
  whichWine: "Which wine is it?",
  somethingElse: "Something else…",
  notInList: "It's not in the list",
```

with:

```ts
  yourCall: "Your call",
  notInList: "It's not in the list",
```

In `src/lib/training/panel.ts`, replace the header comment and imports:

```ts
// View rules for the room's candidate list and Your call card (training-room
// spec §3.3, §5.8): how many rows the lists show, whether anything has been
// answered yet, the laptop popover's focus rules, the Your call options and
// the vintage picker's groups and ids. The list's region groups live in
// ./groups (region-guess addendum R1-R3). Pure, relative imports only, so
// vitest pins it.
import {
  VINTAGE_NV_ID,
  VINTAGE_TAWNY_OTHER_ID,
  vintageTawnyId,
  vintageYearId,
  type PickerGroup,
} from "../../app/tastings/[id]/play/ladder-types";
import { foldName } from "../wine-identity/fold";
import { TRAINING_COPY, tawnyAgeOption } from "./copy";
```

with:

```ts
// View rules for the room's candidate list and Your call card (training-room
// spec §3.3, §5.8): how many rows the lists show, whether anything has been
// answered yet, the laptop popover's focus rules and the vintage picker's
// groups and ids. The list's region groups live in ./groups and Your call's
// region rules in ./call (region-guess addendum R1-R5). Pure, relative imports
// only, so vitest pins it.
import {
  VINTAGE_NV_ID,
  VINTAGE_TAWNY_OTHER_ID,
  vintageTawnyId,
  vintageYearId,
  type PickerGroup,
} from "../../app/tastings/[id]/play/ladder-types";
import { TRAINING_COPY, tawnyAgeOption } from "./copy";
```

and replace:

```ts
/** Your call's list without a search: the top five. */
export const CALL_LIMIT = 5;
/** Your call's search results. */
export const CALL_SEARCH_LIMIT = 20;

/**
 * The candidates Your call offers: the ranking's top five (plus the current
 * pick when it sits further down), or — with a query — every candidate whose
 * name, appellation, region or country contains it, accents and punctuation
 * folded, in ranking order.
 */
export function yourCallOptions(
  ranked: readonly RankedCandidate[],
  query: string,
  pickedId: string | null,
): RankedCandidate[] {
  const key = foldName(query);
  if (key !== "") {
    return ranked
      .filter((r) =>
        [r.candidate.name, r.candidate.appellation.name, r.candidate.region.name, r.candidate.country.name].some(
          (n) => foldName(n).includes(key),
        ),
      )
      .slice(0, CALL_SEARCH_LIMIT);
  }
  const top = ranked.slice(0, CALL_LIMIT);
  if (pickedId && !top.some((r) => r.candidate.id === pickedId)) {
    const picked = ranked.find((r) => r.candidate.id === pickedId);
    if (picked) return [...top, picked];
  }
  return top;
}
```

with:

```ts
/** Your call's regions without a search: the top five (call.ts's regionCallOptions). */
export const CALL_LIMIT = 5;
/** Your call's region search results. */
export const CALL_SEARCH_LIMIT = 20;
```

- [ ] **Step 4: Read every grape**

In `src/lib/training/pool.ts`, immediately before `// Follows merged_into from the given wines, a hop at a time (spec §6.1).`, insert:

```ts
/** Every grape by name — Your call's "Other grape…" list (region-guess addendum
    R11; ≈280 rows, preloaded as the guess ladder preloads its grapes, paged
    all the same). */
export const readTrainingGrapes = cache(async (supabase: Client): Promise<Named[]> =>
  readAll("grapes", (from, to) =>
    supabase.from("grapes").select("id, name").order("name").order("id").range(from, to),
  ),
);

```

In `src/app/taste/training/page.tsx`, replace:

```ts
import {
  coverageCountries,
  readTrainingHistory,
  readTrainingPool,
  readTrainingTally,
} from "@/lib/training/pool";
```

with:

```ts
import {
  coverageCountries,
  readTrainingGrapes,
  readTrainingHistory,
  readTrainingPool,
  readTrainingTally,
} from "@/lib/training/pool";
```

replace:

```ts
// The training room (training-room spec §3, §8): a pillar page — the app bar,
// then one client component with the landing, a session and the result. The
// pool, the aroma lexicon, the first history page and the tally are read here,
// as the viewer; nothing about a session is on the server before its reveal.
export default async function TrainingRoomPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [candidates, termRes, history, tally] = await Promise.all([
    readTrainingPool(supabase),
```

with:

```ts
// The training room (training-room spec §3, §8): a pillar page — the app bar,
// then one client component with the landing, a session and the result. The
// pool, the grapes (Your call's "Other grape…"), the aroma lexicon, the first
// history page and the tally are read here, as the viewer; nothing about a
// session is on the server before its reveal.
export default async function TrainingRoomPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [candidates, grapes, termRes, history, tally] = await Promise.all([
    readTrainingPool(supabase),
    readTrainingGrapes(supabase),
```

and replace:

```tsx
          candidates={candidates}
          terms={terms}
```

with:

```tsx
          candidates={candidates}
          grapes={grapes}
          terms={terms}
```

(The page's wrapper `<div className="flex flex-1 flex-col">`, `<AppHeader>` and `<main>` stay exactly as they are.)

- [ ] **Step 5: The card**

Replace the whole of `src/app/taste/training/your-call.tsx` with:

```tsx
"use client";

// "Your call" — the card under the sheet at every width (spec §3.3;
// region-guess addendum R5): which region it is (a search over every region
// above the top five regions with their percentages, and "It's not in the
// list"); once a region is chosen, how deep to go — "Just the region" or one
// of its typical wines — and, while the call stays at the region, an optional
// grape (the grapes its typical wines name, and "Other grape…" for any grape);
// an optional vintage through the guess ladder's own vintage picker (years,
// NV, tawny ages, "Other age…"); then Reveal the bottle / I can't find out.
// Every value is React state owned by the room (CLAUDE.md: never an
// uncontrolled input); call.ts holds the rules.
import { useId, useRef, useState, type ReactNode, type Ref } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/overview/eyebrow";
import { FieldPicker } from "@/app/tastings/[id]/play/field-picker";
import { vintageOptions } from "@/app/tastings/[id]/play/guess-write";
import { VINTAGE_EMPTY } from "@/app/tastings/[id]/play/ladder-copy";
import { grapeChips, regionCallOptions, regionGrapeChoices } from "@/lib/training/call";
import { TRAINING_COPY, lineageLine, percentLabel, shortName, vintageGuessLabel } from "@/lib/training/copy";
import {
  tawnyYearsFromInput,
  vintageFromPickerId,
  vintagePickerGroups,
  vintagePickerValue,
} from "@/lib/training/panel";
import type { CallPick, Named, RegionGroup, VintageGuess } from "@/lib/training/types";
import { cn } from "@/lib/utils";

const TAP = "min-h-11 md:pointer-fine:min-h-0";

function OptionRow({
  checked,
  onSelect,
  title,
  sub,
  pct,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  sub?: string;
  pct?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors",
        checked ? "border-primary bg-gold/10" : "border-border hover:bg-muted",
        TAP,
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-semibold">{title}</span>
        {sub ? <span className="truncate text-[11.5px] text-muted-foreground">{sub}</span> : null}
      </span>
      {pct ? <span className="shrink-0 text-[12.5px] font-semibold tabular-nums">{pct}</span> : null}
      <span
        aria-hidden
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full",
          checked ? "bg-primary text-primary-foreground" : "border-[1.5px] border-border",
        )}
      >
        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

// A grape chip: pressed while it is the call's grape; pressed again, it lets go.
function GrapeChip({
  pressed,
  onClick,
  children,
  buttonRef,
  dialog,
}: {
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
  buttonRef?: Ref<HTMLButtonElement>;
  /** "Other grape…": opens the grape picker (a dialog) instead of toggling. */
  dialog?: { open: boolean };
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-pressed={dialog ? undefined : (pressed ?? false)}
      aria-haspopup={dialog ? "dialog" : undefined}
      aria-expanded={dialog ? dialog.open : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors",
        pressed ? "border-primary bg-gold/10" : "border-border hover:bg-muted",
        dialog && "border-dashed text-muted-foreground",
        TAP,
      )}
    >
      {pressed ? <Check aria-hidden className="size-3" strokeWidth={3} /> : null}
      {children}
    </button>
  );
}

export function YourCall({
  groups,
  pick,
  grapes,
  onRegion,
  onDeeper,
  onGrape,
  onNotListed,
  vintage,
  onVintage,
  onReveal,
  onCantFindOut,
  busy,
  error,
}: {
  /** The ranking by region (groups.ts's groupRanking). */
  groups: RegionGroup[];
  pick: CallPick;
  /** Every grape, by name: "Other grape…"'s list (R11). */
  grapes: Named[];
  onRegion: (regionId: string) => void;
  /** "Just the region" (null) or one of the region's typical wines. */
  onDeeper: (archetypeId: string | null) => void;
  onGrape: (grapeId: string | null) => void;
  /** "It's not in the list": the room clears the whole pick. */
  onNotListed: () => void;
  vintage: VintageGuess;
  onVintage: (v: VintageGuess) => void;
  onReveal: () => void;
  onCantFindOut: () => void;
  busy: boolean;
  error: string | null;
}) {
  // The guess ladder does the same: its picker lists years from next year down.
  const { years, tawny } = vintageOptions(new Date());
  const [query, setQuery] = useState("");
  // "It's not in the list" and "nothing picked yet" are both an empty pick;
  // this flag only says which one the taster tapped.
  const [notListed, setNotListed] = useState(false);
  const [grapeOpen, setGrapeOpen] = useState(false);
  const [vintageOpen, setVintageOpen] = useState(false);
  // "Other age…" — closed until picked, as in the ladder; the chosen age itself
  // shows on the vintage button.
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const grapeInputRef = useRef<HTMLInputElement>(null);
  const otherGrapeRef = useRef<HTMLButtonElement>(null);
  const vintageInputRef = useRef<HTMLInputElement>(null);
  const vintageButtonRef = useRef<HTMLButtonElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);
  const deeperLabelId = useId();
  const grapeLabelId = useId();
  // The vintage button is named by its label, then its own text:
  // "Vintage (optional) 2016".
  const vintageLabelId = useId();
  const vintageButtonId = useId();

  const options = regionCallOptions(groups, query, pick.pickedRegionId);
  const region = pick.pickedRegionId ? (groups.find((g) => g.key === pick.pickedRegionId) ?? null) : null;
  const chips = region ? grapeChips(regionGrapeChoices(region.members), pick.pickedGrapeId, grapes) : [];
  const otherYears = tawnyYearsFromInput(otherText);

  // The ladder's own groups, word for word (guess-ladder.tsx, "vintage").
  const vintageGroups = vintagePickerGroups(years, tawny);
  const grapeGroups = [{ options: grapes.map((g) => ({ id: g.id, name: g.name })) }];

  function chooseRegion(regionId: string) {
    setNotListed(false);
    onRegion(regionId);
  }

  function chooseNotListed() {
    setNotListed(true);
    onNotListed();
  }

  // Back to "Other grape…", as the ladder's closePicker returns to its row.
  function closeGrape() {
    setGrapeOpen(false);
    otherGrapeRef.current?.focus({ preventScroll: true });
  }

  function pickGrape(id: string | null) {
    onGrape(id);
    closeGrape();
  }

  // Back to the vintage button, as the ladder's closePicker returns to its row:
  // this also takes focus (and the phone keyboard) off the picker's search, or
  // off the "Other age…" box once it closes.
  function focusVintageButton() {
    vintageButtonRef.current?.focus({ preventScroll: true });
  }

  function closeVintage() {
    setVintageOpen(false);
    focusVintageButton();
  }

  function pickVintage(id: string | null) {
    const result = vintageFromPickerId(id);
    if ("otherTawny" in result) {
      // Closed directly, not through closeVintage(): focusing the button would
      // fight the synchronous focus on the age input below.
      setVintageOpen(false);
      // Prefilled with an age already typed, as the ladder does.
      setOtherText(vintage?.kind === "TAWNY" && !tawny.includes(vintage.years) ? String(vintage.years) : "");
      setOtherOpen(true);
      // In the same tap: the phone keyboard only opens for a synchronous focus.
      otherInputRef.current?.focus();
      return;
    }
    setOtherOpen(false);
    closeVintage();
    onVintage(result.vintage);
  }

  function confirmOther() {
    if (otherYears === null) return;
    onVintage({ kind: "TAWNY", years: otherYears });
    setOtherOpen(false);
    focusVintageButton();
  }

  function cancelOther() {
    setOtherOpen(false);
    focusVintageButton();
  }

  return (
    <section
      id="your-call"
      aria-labelledby="your-call-title"
      className="flex scroll-mt-[72px] flex-col gap-4 rounded-[12px] border border-border bg-card p-4 md:p-6"
    >
      <div className="flex flex-col gap-1">
        <Eyebrow size="sm">{TRAINING_COPY.yourCall}</Eyebrow>
        <h2 id="your-call-title" className="font-heading text-[22px] leading-tight font-semibold">
          {TRAINING_COPY.whichRegion}
        </h2>
      </div>

      {/* Step 1. The region search sits above the list it filters, on screen
          and in the DOM (a textbox is not a radio, so it stays outside the
          radiogroup). Flex columns, not a grid: every row is as wide as the
          card and truncates its lines (min-w-0) instead of widening it. */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={TRAINING_COPY.searchRegions}
          aria-label={TRAINING_COPY.searchRegions}
          className="min-h-11 w-full min-w-0 rounded-[10px] border border-border bg-card px-3 text-base text-foreground placeholder:text-muted-foreground md:text-[14px]"
        />
        <div role="radiogroup" aria-labelledby="your-call-title" className="flex min-w-0 flex-col gap-1.5">
          {options.map((g) => (
            <OptionRow
              key={g.key}
              checked={pick.pickedRegionId === g.key}
              onSelect={() => chooseRegion(g.key)}
              title={g.region.name}
              sub={g.country.name}
              pct={percentLabel(g.closeness) || undefined}
            />
          ))}
          <OptionRow
            checked={pick.pickedRegionId === null && notListed}
            onSelect={chooseNotListed}
            title={TRAINING_COPY.notInList}
          />
        </div>
      </div>

      {/* Step 2, once a region is chosen: stop there, or go deeper. */}
      {region ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 id={deeperLabelId} className="text-[13px] font-semibold">
            {TRAINING_COPY.goDeeper}
          </h3>
          <div role="radiogroup" aria-labelledby={deeperLabelId} className="flex min-w-0 flex-col gap-1.5">
            <OptionRow
              checked={pick.pickedArchetypeId === null}
              onSelect={() => onDeeper(null)}
              title={TRAINING_COPY.justTheRegion}
            />
            {region.members.map((r) => (
              <OptionRow
                key={r.candidate.id}
                checked={pick.pickedArchetypeId === r.candidate.id}
                onSelect={() => onDeeper(r.candidate.id)}
                title={shortName(r.candidate.name)}
                sub={lineageLine(r.candidate)}
                pct={percentLabel(r.closeness) || undefined}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Step 3, only while the call stays at the region: a typical wine
          already names its grapes. */}
      {region && pick.pickedArchetypeId === null ? (
        <div role="group" aria-labelledby={grapeLabelId} className="flex min-w-0 flex-col gap-2">
          <h3 id={grapeLabelId} className="text-[13px] font-semibold">
            {TRAINING_COPY.grapeOptional}
          </h3>
          <div className="flex flex-wrap gap-2">
            {chips.map((g) => (
              <GrapeChip
                key={g.id}
                pressed={pick.pickedGrapeId === g.id}
                onClick={() => onGrape(pick.pickedGrapeId === g.id ? null : g.id)}
              >
                {g.name}
              </GrapeChip>
            ))}
            <GrapeChip
              buttonRef={otherGrapeRef}
              dialog={{ open: grapeOpen }}
              onClick={() => {
                setGrapeOpen(true);
                // The field picker's search input stays mounted, so this focus
                // runs inside the tap that opens it (the combobox rule).
                grapeInputRef.current?.focus();
              }}
            >
              {TRAINING_COPY.otherGrape}
            </GrapeChip>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span id={vintageLabelId} className="text-[13px] font-semibold">
          {TRAINING_COPY.vintageOptional}
        </span>
        <button
          ref={vintageButtonRef}
          id={vintageButtonId}
          aria-labelledby={`${vintageLabelId} ${vintageButtonId}`}
          aria-haspopup="dialog"
          aria-expanded={vintageOpen}
          type="button"
          onClick={() => {
            setVintageOpen(true);
            // The field picker's search input stays mounted, so this focus runs
            // inside the tap that opens it (the combobox rule).
            vintageInputRef.current?.focus();
          }}
          className={cn(
            "flex w-full items-center rounded-[10px] border border-border bg-background px-3 py-2 text-left text-[14px]",
            TAP,
            vintage === null && "text-muted-foreground",
          )}
        >
          {vintageGuessLabel(vintage) ?? VINTAGE_EMPTY}
        </button>
        {/* Collapsed rather than unmounted, so "Other age…" can focus it in the
            same tap (the ladder's own tawny input does the same). */}
        <div
          aria-hidden={!otherOpen}
          className={cn(
            "flex flex-col gap-2 rounded-[11px] border border-primary bg-card px-[13px] py-3 transition-[opacity,max-height]",
            otherOpen ? "max-h-40 opacity-100" : "pointer-events-none max-h-0 overflow-hidden border-0 px-0 py-0 opacity-0",
          )}
        >
          <span className="text-[11px] text-muted-foreground">{TRAINING_COPY.tawnyAgeLabel}</span>
          <div className="flex items-center gap-[10px]">
            <input
              ref={otherInputRef}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmOther();
                }
              }}
              placeholder={TRAINING_COPY.tawnyAgePlaceholder}
              aria-label={TRAINING_COPY.tawnyAgeLabel}
              tabIndex={otherOpen ? undefined : -1}
              className="min-h-11 w-24 rounded-[10px] border border-border bg-card px-3 text-[15.5px] text-foreground"
            />
            <button
              type="button"
              tabIndex={otherOpen ? undefined : -1}
              onClick={cancelOther}
              className="flex min-h-11 items-center px-2 text-[13px] font-semibold text-muted-foreground"
            >
              {TRAINING_COPY.tawnyAgeCancel}
            </button>
            <button
              type="button"
              tabIndex={otherOpen ? undefined : -1}
              disabled={otherYears === null}
              onClick={confirmOther}
              className="ml-auto flex min-h-11 items-center justify-center rounded-[10px] bg-primary px-[16px] text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {TRAINING_COPY.tawnyAgeSet}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button className={cn(TAP, "px-4")} disabled={busy} onClick={onReveal}>
          {TRAINING_COPY.revealBottle}
        </Button>
        <Button variant="ghost" className={TAP} disabled={busy} onClick={onCantFindOut}>
          {TRAINING_COPY.cantFindOut}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}

      <FieldPicker
        open={grapeOpen}
        field="primary_grape"
        points={8}
        title={TRAINING_COPY.grapeOptional}
        groups={grapeGroups}
        value={pick.pickedGrapeId ?? ""}
        onPick={pickGrape}
        onNext={closeGrape}
        nextLabel={TRAINING_COPY.done}
        search="client"
        searchPlaceholder={TRAINING_COPY.searchGrapes}
        onClose={closeGrape}
        inputRef={grapeInputRef}
      />
      <FieldPicker
        open={vintageOpen}
        field="vintage"
        points={2}
        title={TRAINING_COPY.vintageOptional}
        groups={vintageGroups}
        value={vintagePickerValue(vintage, tawny)}
        onPick={pickVintage}
        onNext={closeVintage}
        nextLabel={TRAINING_COPY.done}
        search="client"
        onClose={closeVintage}
        inputRef={vintageInputRef}
        totalCount={years.length}
      />
    </section>
  );
}
```

- [ ] **Step 6: Wire the room**

In `src/app/taste/training/training-room.tsx`, replace:

```ts
import { NO_CALL, callPayload, normalizeCall } from "@/lib/training/call";
```

with:

```ts
import {
  NO_CALL,
  callPayload,
  chooseDeeper,
  chooseGrape,
  chooseRegion,
  normalizeCall,
} from "@/lib/training/call";
```

replace:

```ts
import type {
  AromaLexicon,
  MatchExtras,
  RankingSnapshot,
  TrainingCandidate,
  TrainingDraft,
  VintageGuess,
} from "@/lib/training/types";
```

with:

```ts
import type {
  AromaLexicon,
  CallPick,
  MatchExtras,
  Named,
  RankingSnapshot,
  TrainingCandidate,
  TrainingDraft,
  VintageGuess,
} from "@/lib/training/types";
```

replace:

```ts
export function TrainingRoom({
  userId,
  candidates,
  terms,
  history,
  tally,
  coverage,
}: {
  userId: string;
  candidates: TrainingCandidate[];
  terms: AromaTerm[];
```

with:

```ts
export function TrainingRoom({
  userId,
  candidates,
  grapes,
  terms,
  history,
  tally,
  coverage,
}: {
  userId: string;
  candidates: TrainingCandidate[];
  /** Every grape, for Your call's "Other grape…" (region-guess addendum R11). */
  grapes: Named[];
  terms: AromaTerm[];
```

replace:

```ts
  const patchSession = useCallback(
    (patch: Partial<Pick<TrainingDraft, "note" | "pickedArchetypeId" | "vintage">>) =>
      setSession((s) => (s ? { ...s, ...patch } : s)),
    [],
  );
```

with:

```ts
  const patchSession = useCallback(
    (patch: Partial<Pick<TrainingDraft, "note" | "vintage">>) => setSession((s) => (s ? { ...s, ...patch } : s)),
    [],
  );
  // Your call's taps, through call.ts's rules (a new region clears the deeper
  // choice and the grape; a grape needs a region), functional like the rest.
  const patchCall = useCallback(
    (next: (pick: CallPick) => CallPick) => setSession((s) => (s ? { ...s, ...next(s) } : s)),
    [],
  );
```

and replace:

```tsx
            <YourCall
              ranked={ranked}
              pickedId={session.pickedArchetypeId}
              onPick={(id) => patchSession({ pickedArchetypeId: id })}
              vintage={session.vintage}
```

with:

```tsx
            <YourCall
              groups={groups}
              pick={session}
              grapes={grapes}
              onRegion={(id) => patchCall((p) => chooseRegion(p, id))}
              onDeeper={(id) => patchCall((p) => chooseDeeper(p, id))}
              onGrape={(id) => patchCall((p) => chooseGrape(p, id))}
              onNotListed={() => patchCall(() => NO_CALL)}
              vintage={session.vintage}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training`
Expected: `Test Files  12 passed (12)`, `Tests  198 passed (198)` (the two `yourCallOptions` tests are gone).

- [ ] **Step 8: Gates, including the whole suite**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && npx tsc --noEmit && npx eslint src/lib/training src/app/taste/training && npx vitest run`
Expected: tsc and eslint print nothing; the whole vitest run passes (no file outside the training room imports anything this plan removed — `showAllLine`, `panelView`, `yourCallOptions`, `whichWine`, `somethingElse` — checked with grep while planning).

- [ ] **Step 9: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add src/app/taste/training/your-call.tsx src/app/taste/training/training-room.tsx src/app/taste/training/page.tsx src/lib/training/pool.ts src/lib/training/copy.ts src/lib/training/copy.test.ts src/lib/training/panel.ts src/lib/training/panel.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(training): Your call names the region, then goes deeper or names a grape

"Which region is it?" lists the top five regions with a search over every
region; a chosen region offers "Just the region" or its typical wines, and
while the call stays at the region, the grapes its wines name as chips plus
"Other grape…" over every grape (the guess ladder's picker). A new region
clears the deeper choice and the grape.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (the "Training room" bullet)

**Interfaces:** none (documentation of Tasks 1–5).

- [ ] **Step 1: Extend the Training room bullet**

In `CLAUDE.md`, replace the end of the Training room bullet:

```md
  nav's Training Room label and Preview pill (`nav-links.ts`) also read;
  never hard-code a room string in a component.
```

with:

```md
  nav's Training Room label and Preview pill (`nav-links.ts`) also read;
  never hard-code a room string in a component.
  **Region guess** (2026-09-27, addendum
  `docs/superpowers/specs/2026-09-27-training-room-region-guess.md`, plan
  `docs/superpowers/plans/2026-09-27-training-room-region-guess.md`, migration
  `20260927100000_training_region_guess.sql`): the candidate list groups the
  ranking by scoring region (`src/lib/training/groups.ts`'s `groupRanking`: a
  region stands at its best UNCAPPED wine, a region whose wines are all capped
  is capped at its best capped one; the matcher is unchanged and the attempt's
  snapshot is still the full wine ranking). The laptop column and the phone
  sheet show the top five regions ("Show all N regions"); a region row opens
  its typical wines in place (the top one starts open; the phone sheet keeps
  the open regions across a wine's detail and back), and the phone strip reads
  "Top match: {region} · {wine} {pct} %" (the region alone when the wine is
  named like it). Your call (`your-call.tsx`, every rule pure in `call.ts`) is
  two steps: which region (top five, a search that also matches a region's
  wines and appellations, "It's not in the list"), then "Go deeper" ("Just the
  region" or one of its typical wines) and, only while it stays at the region,
  an optional grape (the region's grapes as chips, "Other grape…" over every
  grape through the guess ladder's `FieldPicker`, preloaded by
  `readTrainingGrapes`). `training_attempts.picked_region_id` /
  `picked_grape_id` (on delete set null) store a region pick; checks refuse a
  typical wine and a region together and a grape without a region, and
  `callPayload` never sends either. `record_training_attempt` scores a region
  pick country 2 + region 3 by the region's own FKs and 8 when the grape is
  the wine's PRIMARY grape (appellation 0; second grape and designation 0 when
  the wine has one, null when not); `possible_points` is the wine's, the same
  as for a deep pick. Its latest body is the one in
  `20260927100000_training_region_guess.sql` (md5
  `f6a24c83c24aaab34ab568dc6280083f`): a future recreate starts from that
  body. A region with a grape-bearing region pick on it cannot be deleted (the
  FK's SET NULL would leave a grape without a region, which the check
  refuses) — clear those attempts' picks first. The device draft carries
  `pickedRegionId` / `pickedGrapeId`; a draft from before them reads with both
  null, and Continue gives a picked typical wine its region (`normalizeCall`).
```

- [ ] **Step 2: Check the edit**

Run: `cd /c/Users/Public/repos/blindtastingapp-friends && git diff --stat CLAUDE.md`
Expected: one file changed, insertions only.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-friends && git add CLAUDE.md && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
docs: the training room's region guess in CLAUDE.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Rollout (main session)

1. Task 1, Step 8: dry run, suite with `TRAINING_ROOM_APPLY`, apply live, suite again (additive: two nullable columns, two checks, an RPC branch the deployed app never takes).
2. Tasks 2–6 land on `training-region-guess`; the browser checklist below runs against a local production build (`npm run build && npm run start`) on the live database — which needs step 1 done, since the app selects the new columns from Task 4 on.
3. Merge and deploy per the standing deploy mechanics; live smoke = checklist items 1, 4, 6 and 9 on production.
4. Rollback: revert the app; the migration stays (the old app never reads or sends the new columns).

## Browser checklist (main session; laptop 1280×800 and phone 375×812, light, then dark once)

Sign in as a demo taster (`.superpowers/demo-session.mjs`, never a typed password). The Browser pane must be fronted: a hidden pane stalls on `loading.tsx`.

1. **Grouping before answers (laptop).** `/taste/training` → Start a session. The column reads "What it could be", "Start describing the wine", five region rows ("{Region}, {Country}", alphabetical by country, then region) with no bar and no "best:" line, the first one open on its wines (no %), and "Show all N regions" (N = the pool's region count: 43 live on 2026-09-27).
2. **Grouping with answers (laptop).** Set a ruby hue, high tannin, high acidity, black fruit. Regions reorder; each row reads "Bordeaux, France", "best: …" and a bar with %; the top region is open. Open another region, close the top one; a wine row inside opens its popover (Escape returns focus to that wine row; pressing a region row closes the popover). A white-only region shows under "Unlikely from what you've said" after Show all, muted.
3. **Expand/collapse and Show all (phone).** The strip reads "Top match: {region} · {wine} {pct} % · k more close" on one truncated line inside the sticky bar, which stays flush under the top bar while scrolling (eb14ffd not regressed; no gap, nothing ghosting through). Tap it: the sheet lists five regions, the top one open, "Show all N regions" works; open a region, tap a wine → its profile with a back arrow → Back shows the list with the same regions open. No horizontal scroll at 375.
4. **Region only.** Your call: "Which region is it?" with five radios (region, country, %) and "It's not in the list". Type "chablis" in "Search regions…" → Bourgogne. Pick it → "Go deeper (optional)" appears with "Just the region" checked and Bourgogne's wines with %, and "Grape (optional)" chips (most named first) plus "Other grape…". Reveal the bottle (catalog search) → the result reads "You said Bourgogne" (plus ", 2019" if a vintage was set), the verdict rows show Country ✓ 2 / Region ✓ 3 when right, Appellation ✗ 0, and "{n} of {m}" with the same m a deep pick would have.
5. **Region + grape.** New glass; pick a region, tap a grape chip (pressed, ✓), tap it again (released), tap it once more. "Other grape…" opens the picker: the search field has focus (on the phone the keyboard opens), placeholder "Search grapes…"; pick a grape the region's wines do not name → the picker closes, focus returns to "Other grape…", the grape shows as a pressed chip. Change the region → the deeper choice resets to "Just the region" and no chip is pressed. Reveal → "You said Bourgogne · Chardonnay"; Grape ✓ 8 when it is the wine's primary grape.
6. **Deep pick.** Pick a region, then one of its wines → the grape step disappears; back to "Just the region" → the earlier grape chip is still pressed. Choose the wine again and reveal → "You said Chablis Premier Cru" and the same scoring as before this change.
7. **Continue.** Mid-session, reload → Continue → the region, the deeper choice and the grape come back as left. (If a draft from the live build exists on a device, Continue shows its wine's region with the wine selected.)
8. **History.** Landing: the new rows read "{date} · You said Bourgogne · Chardonnay · It was … · n of m" and "… · You said Bourgogne · …". "I can't find out" with a region pick → the unrevealed result's heading is "You said Bourgogne"; its history row ends "Not revealed" with Reveal now, which scores the stored region pick.
9. **Touch targets and theme.** On the phone every region row, wine row, chip and "Other grape…" is at least 44 px tall; dark mode keeps every row readable (bars `--primary`, capped `--muted-foreground`). The console shows no new errors (no base-ui `nativeButton` warnings).
