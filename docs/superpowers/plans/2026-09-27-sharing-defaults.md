# Sharing Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cellars and tasting notes become visible to everyone by default, with one "Everyone / Friends / Only me" setting for each, other people's notes shown on a wine's page and on profiles, Rule 1 kept intact for a host's own flight, and a one-time notice for the people the change affects.

**Architecture:** Two migrations with the app deploy between them. M1 (`20260927140000`) adds `profiles.notes_visibility`, narrows the `"wset notes read"` policy to `author OR (identified AND can_view_notes(author) AND NOT wset_note_held(id) AND the reader's own "catalog read")`, adds the Rule 1 hold table, its triggers and the guard, switches `catalog_wine_structure` to INVOKER, recreates `catalog_wine_usage` and `shared_cellar_lots`, and creates the empty owner-only `sharing_notices`. The app reads everything as the viewer, so the policy decides; pure modules under `src/lib/sharing` and `src/lib/notes` hold every rule and string. M2 (`20260927150000`) flips PRIVATE cellars to PUBLIC, changes the default and writes the notices, only after the app that explains it is live.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4 (tokens), base-ui/shadcn, Supabase Postgres/RLS, vitest (node, no DOM; `renderToStaticMarkup` for first-paint markup), node `--test` DB suites (production, always rolled back).

**Spec:** `docs/superpowers/specs/2026-09-27-sharing-defaults-design.md` — S1–S23, §3–§10 and the §13 Controller rulings C1–C4 are binding. Where the code disagrees with the spec's facts, this plan follows the code and says so under "Planner notes".

## Global Constraints

- Every shell command starts with `cd /c/Users/Public/repos/blindtastingapp-training && …` (the Bash cwd resets to the owner's checkout after every call).
- Never write under `C:\Users\Public\repos\blindtastingapp` (the owner's checkout) or any other worktree.
- Commit identity and trailer, exactly: `GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit …`, message ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Implementers never touch the live database.** Every applier dry run or apply, every DB suite run (`scripts/*.test.mjs` that connect through `pgConfig()`), and every read of live data is the MAIN SESSION's, in "Rollout (main session)". An implementer's gates for SQL and DB-suite files are `node --check` (for `.mjs`) and the vitest pins that read the migration files.
- Migration versions: M1 `20260927140000_sharing_defaults.sql`, M2 `20260927150000_sharing_defaults_flip.sql`. Checked absent 2026-09-27 from live `supabase_migrations.schema_migrations` (newest live: `20260927100000`), from `origin/master`, from every branch and from every worktree's `supabase/migrations` (`git worktree list`: blindtastingapp, -friends, -map, -mapdetail, -signup, -tour, -training). `levels` sorts after M2 (C4).
- Migrations are written, never applied, by implementers; no `begin`/`commit` inside them (the applier owns the transaction); `set local lock_timeout = '10s'`; fail-closed pre-state; same-transaction post-state; every body md5 is `md5(replace(prosrc, chr(13), ''))`.
- md5 pins read from live 2026-09-27 (unchanged by this work unless stated): `can_view_cellar` `3af2e51e338dc43cc48b58f061049ec2`; `catalog_wine_structure` `e5111f04dc3c14e5d62a82072e70b6be` (M1 flips only `prosecdef`); `catalog_wine_usage` `8544e9afe31d30c26d516e68b19fca23` → M1 `79615b604369fe584ba39bf9ef6f4dd8`; `shared_cellar_lots` `c3da48f21c077f0a349e5d88e55b0ff7` → M1 `1091a585637cbc6235a220a52b12cb99`; `catalog_wine_masked_pours` `fea91b152e3565f16c56cc1d15810d29`; `catalog_wine_in_callers_unrevealed_glass` `f33fbd7f4e283cb0ed682469aa6ea2c2`; `save_wset_note` `9ac29b18bbda5b08bcd9a12e19beb932`; `record_training_attempt` `f6a24c83c24aaab34ab568dc6280083f`; `wset_notes_resolve_on_reveal` `f406623e9d46feb1f1aa0fb8c285529d`; `scrub_deleted_account` `b9aa8d71a00dda3aec526a2ec6950f1d`; `handle_new_user` `f18c8dc309331e2b2cf7d40bad8d55fa` (pinned by M2). New in M1: `catalog_wine_unrevealed_glasses_of` `91748b399ca7bbb3de7f752e6c47c3d9`, `can_view_notes` `3fe471b0d155ff618afd5e4f559044d6`, `wset_note_held` `9599a36cd224a3af0d5c2fb3dea70b2b`, `wset_my_held_notes` `3a08cb7faf015f9b2f592d60d6a5bafb`, `wset_notes_hold_on_identity` `8b500cd6a6f62204c02c66c4760793fc`, `wines_release_note_holds` `419a9f4dda4fac12a601207ea3f3b45a`, `wset_notes_rule1_guard` `770e9c571942c4a9e6bd337fc0dbf200`, `drop_deleted_profile_sharing_notice` `656d8d4d8f86f71b61a0238f1cf59636`. The md5 of the three live `wset_notes` insert/update/delete policies' canonical text is `1a032311d06ac6939ff04ca5977a61d6`.
- Every new function revokes Supabase's default EXECUTE (PUBLIC, anon, authenticated, service_role) and grants back only: `can_view_notes` → authenticated, service_role; `wset_note_held`, `wset_my_held_notes` → authenticated; everything else owner-only.
- Pure modules under `src/lib` import relatively (`../supabase/database.types`, `../wset/...`), never through `@/`, so vitest loads them without the alias.
- `"use server"` files export only async functions — no types, no constants (`src/lib/sharing/actions.ts` exports `dismissSharingNotice` alone).
- Tokens only (no hex, no inline colours): `bg-card`, `border-border`, `text-muted-foreground`, `text-primary`, `text-rose`, `text-destructive`, `bg-secondary`. Light by default; `.dark` follows the tokens.
- 44 px tap targets on touch: `min-h-11` with a `md:pointer-fine:min-h-*` reset where a denser desktop control is wanted.
- Copy is spec §7 verbatim (C3: ships as drafted); every string lives in a pure module (`SHARING_COPY`, `SHARING_NOTICE`, `SHARED_NOTES_COPY`, `NOTE_RULE1_MESSAGE`, `TOUR` sentences).
- The WSET sheet's first paint must not change: `npx vitest run src/components/wset/sheet-markup.test.tsx` passes **without** `-u`.
- This checkout is CRLF (`core.autocrlf=true`); the Edit/Write tools handle it, the SQL pins strip CR, and file-reading tests normalise `\r\n`.
- vitest path filters do not match directories with brackets (`[wineId]`, `[id]`); run those tests by name filter (`npx vitest run others-notes`).
- No Anthropic API calls anywhere (AGENTS.md).

## Review Focus

1. **A profile write that RLS matches to zero rows** (a tab whose session is now another account's, or a stale session) must snap the select back and say "Not saved. Still set to …", never show a setting the row does not hold. Pinned by `profileWriteSaved` tests in Task 3 and used by `VisibilitySelect` in Task 4.
2. **An empty or whitespace-only note** (the "Save all to ratings" placeholder, `taster_notes` of `"  \n "`) must never appear to others and must not make its author "noted" for the notice. Pinned in Task 3 (`noteHasContent` tests and a test that pins `NOTE_CONTENT_COLUMNS` to M2's SQL, column for column) and in Task 2's DB test (`placeholderOnly` and `blankText` get no notice).
3. **The notice must never claim a setting the row no longer holds** — someone who set notes to Only me, or a cellar back to Friends, between M1 and M2 or before opening `/overview`. Pinned by Task 3's exhaustive flag × setting test of `sharingNoticeCopy`, and by Task 2's DB test (`onlyMeNoted` gets a row whose card the copy then suppresses).
4. **A pending friend request grants nothing**, and a Friends note reaches exactly the accepted friends that `can_view_cellar` admits. Pinned by Task 1's DB tests (the `can_view_notes` × `can_view_cellar` table over self, accepted pair, one-way row, pending requester, stranger, no user; and the policy test).
5. **A hidden or foreign note's URL** (`/catalog/<wine>/notes/<id>` for a note the policy hides, a note on another wine, a wine the viewer cannot read) must answer exactly like a missing id — `notFound()` — never an editor, never a partial page. Pinned by Task 7's `noteRouteMode` tests.

## Planner notes (the code's reality where it differs from the spec)

- **§5.3 "the note editor already throws `error.message` for a failed save":** only *delete* shows the message (`wset-sheet.tsx`'s delete dialog). A failed *save* is swallowed into the bare "Retry save". Task 3 adds a `saveNotice` line through `SheetFooter`'s existing `notice` slot, shown only for a `NoteSaveRefusal` error; the sheet's first paint (and `sheet-markup.test.tsx`) is unchanged.
- **§7.1 `noteHasContent` via `summarizeNoteRow(...).done > 0` is not an exact twin of M2's SQL:** `sectionProgress` counts `mousse` only for a sparkling wine, while the SQL counts all 17 columns. Task 3 lists the 17 columns once (`NOTE_CONTENT_COLUMNS`) and a vitest pins them to M2's `num_nonnulls(...)`, in order.
- **§3.2 `btrim(taster_notes) <> ''` vs JS `trim()`:** `btrim` strips spaces only, so `"\n"` would count as content in SQL and not in TS. M2 uses `n.taster_notes ~ '\S'` and TS uses `/\S/`. Live result unchanged (read-only check 2026-09-27: 34 flipped, 5 noted).
- **§7.4 "Taster's notes":** the sheet's live-note caption is "Taster" (`i18n.ts` `taster`). The read view reuses the sheet's own `NOTE_CAPTIONS` (moved to `src/lib/wset/note-captions.ts`, Task 7), so it reads "Taster", identical to what the author saw.
- **S22 comments:** besides the five files the spec names, `src/lib/wset/queries.ts` has two more comments the change makes false (descriptors "all notes, any author"; structure "SECURITY DEFINER RPC … across all authors"). Task 3 fixes all seven.
- **§9.3 suites had no APPLY hook.** Task 1 adds `SHARING_DEFAULTS_APPLY` to `tour-seen`, `catalog-wine-structure`, `wset-notes`, `catalog-manage` and `cellar-social` (each applies every listed file except M2, which flips live cellars and none of them is about). Only one `wset-notes` test depends on another author's setting ("another author's note is visible…"); it now authors with a throwaway profile. `catalog-wine-structure`'s pair becomes two throwaway profiles made inside the transaction. `training-room` and `friend-requests` already have their own APPLY variables and are re-run with M1 listed there.
- **§9.4 names `.superpowers/demo-session.mjs`:** it does not exist in this worktree. Demo sessions are minted with `node <scratchpad>/mint.mjs <origin> <next> demo.<name>@blindr.invalid` (magic link + `verifyOtp`, never a typed password).
- **§10.3 rollback through the applier:** `apply-migration.mjs` refuses a file name without a 14-digit version and records a history row. Task 1 adds `scripts/sharing-defaults/run-sql.mjs` (no history row; each rollback file deletes its own migration's history row, so the migration can be re-applied).
- **S15 "the primary link dismisses too, then navigates":** the link calls `dismissSharingNotice()` and navigates at once. Next's router discards a pending server action's *result* on navigation but the POST has already been sent, so the server still stamps `dismissed_at`. "Got it" hides the card at once; both set a per-tab `sessionStorage` flag, so a failed write or a back navigation to a cached `/overview` keeps it hidden for the visit.
- **`VisibilitySelect` is stricter than `CellarVisibilityControl`:** the old control trusted "no error"; RLS answers a write to a row that is not yours with no error and no row. The new one requires exactly one returned row (`profileWriteSaved`).
- **`#sharing` scroll:** the app shell's content column scrolls, not the window, and `AppHeader` is `sticky top-0`. The card carries `scroll-mt-20` and a tiny `ScrollToHash` client helper; browser check B2 confirms.
- **Live-only migration outside every branch:** live `schema_migrations` records `20260925190000_wine_place_context_inherited_profile`, which is in no worktree or branch. It touches nothing here; mentioned so nobody mistakes it for this work.
- **The new read policy's deparsed text** (M1 post-state check 1, M2 pre-state) is the one pin written from Postgres' known `pg_get_expr` style rather than read back from a dry run (a dry run is a write transaction). Everything else in both files was checked read-only against live: the whole file parses (a `begin read only` run gets past the raw parser and the pre-state block and stops at the first DDL), M1's pre-state passes against live, both post-state blocks compile, the recreated bodies differ from live by exactly the intended lines, and the audience query returns 5 noted / 34 flipped. Rollout R1 says what to do if that one pin needs the printed text.

## File map

| File | Task | Responsibility |
|---|---|---|
| `supabase/migrations/20260927140000_sharing_defaults.sql` | 1 | M1: notes setting, policy, hold/pour/guard, helpers, figures, shared cellars, notice table |
| `supabase/migrations/20260927150000_sharing_defaults_flip.sql` | 2 | M2: flip PRIVATE cellars, default PUBLIC, notices |
| `scripts/sharing-defaults.test.mjs` | 1, 2 | DB suite §9.2 (27 tests in Task 1, 3 appended in Task 2) |
| `scripts/sharing-defaults/run-sql.mjs`, `rollback-m1.sql`, `rollback-m2.sql` | 1, 2 | §10.3 rollback, main session only |
| `scripts/{tour-seen,catalog-wine-structure,wset-notes,catalog-manage,cellar-social}.test.mjs` | 1 | §9.3 updates + APPLY hook |
| `src/lib/supabase/database.types.ts` | 1 | `SharingAudience`, `notes_visibility`, `sharing_notices`, two RPCs (targeted insertions only) |
| `src/lib/sharing/visibility.ts` (+test) | 3 | audience vocabulary, settings copy, `profileWriteSaved` |
| `src/lib/sharing/notice.ts` (+test) | 3 | notice copy from current settings |
| `src/lib/notes/shared-notes-view.ts` (+test) | 3 | content rule, summary, order, cap, badges, score, row shaping, selects |
| `src/lib/notes/rule1-guard.ts` (+test) | 3 | the guard's message and refusal detection |
| `src/lib/first-run/tour.ts` (+test), `src/components/wset/wset-sheet.tsx`, `src/app/catalog/[wineId]/notes/note-editor.tsx` (+test), five comment files + `src/lib/wset/queries.ts` | 3 | copy the change makes false; the refusal line |
| `src/components/sharing/visibility-select.tsx` (+test), `src/components/scroll-to-hash.tsx` | 4 | one control for both settings; hash scroll |
| `src/app/profile/edit/page.tsx`, `src/app/cellar/page.tsx`, `src/app/cellar/cellar-visibility-control.tsx` | 4 | Sharing card; `/cellar` uses the same control |
| `src/lib/notes/shared-notes.ts` (+test) | 5, 6 | server-only loaders |
| `src/app/catalog/[wineId]/others-notes.tsx` (+test), `page.tsx`, `your-notes.tsx` | 5 | "Notes from others"; "Hidden from others" tag |
| `src/app/u/[id]/profile-notes.tsx` (+test), `page.tsx` | 6 | "Tasting notes" |
| `src/lib/wset/note-captions.ts`, `src/lib/notes/note-read.ts` (+test), `src/app/catalog/[wineId]/notes/[noteId]/note-read-view.tsx` (+test), `page.tsx` | 7 | read-only note view |
| `src/lib/sharing/actions.ts` (+test), `src/app/overview/sharing-notice.tsx` (+test), `src/app/overview/page.tsx`, `CLAUDE.md` | 8 | the notice; the CLAUDE.md bullet |

## Gates, counted

Reference numbers at this branch's head `a9f5e43`: **212 test files, 4138 tests**, `npx tsc --noEmit` clean. C4 rebases this branch onto master before Task 1, which moves the baseline: record it as **B_files / B_tests** in the Pre-flight and use the deltas. Cumulative after each task (verified by building each task boundary in a scratch copy and running tsc + the full vitest suite):

| After task | test files | tests |
|---|---|---|
| 1 | B_files | B_tests |
| 2 | B_files | B_tests |
| 3 | B_files + 4 | B_tests + 57 |
| 4 | B_files + 5 | B_tests + 61 |
| 5 | B_files + 7 | B_tests + 69 |
| 6 | B_files + 8 | B_tests + 75 |
| 7 | B_files + 10 | B_tests + 82 |
| 8 | B_files + 12 | B_tests + 88 |

Full-suite command (no pipe, so the exit code is real): `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run --reporter=dot; echo "vitest exit $?"`. Type check: `cd /c/Users/Public/repos/blindtastingapp-training && npx tsc --noEmit; echo "tsc exit $?"`.

## Pre-flight (main session, before Task 1)

- [ ] **P1: Rebase (C4).** After `training-region-guess` has merged to master: `cd /c/Users/Public/repos/blindtastingapp-training && git fetch origin && git rebase origin/master`. That branch edits `database.types.ts` only around `training_attempts` and `record_training_attempt`'s comment; none of this plan's insertions touch those lines. If anything conflicts, keep both sides.
- [ ] **P2: Versions still free.** `cd /c/Users/Public/repos/blindtastingapp-training && git worktree list && for b in $(git for-each-ref --format='%(refname:short)' refs/heads refs/remotes); do git ls-tree --name-only $b supabase/migrations/ 2>/dev/null | grep -E '2026092714|2026092715' && echo "IN $b"; done; ls ../blindtastingapp*/supabase/migrations | grep -E '2026092714|2026092715'` prints nothing, and a read-only `select version from supabase_migrations.schema_migrations where version >= '20260927100001'` returns no rows (a `levels` version, if live by then, must sort after `20260927150000`; if not, stop and re-plan).
- [ ] **P3: Pins still hold.** Read-only (`begin read only` … `rollback`):

```sql
select s.sig, md5(replace(p.prosrc, chr(13), '')) = s.md5 as same
  from (values
    ('public.can_view_cellar(uuid)',                          '3af2e51e338dc43cc48b58f061049ec2'),
    ('public.catalog_wine_structure(uuid)',                   'e5111f04dc3c14e5d62a82072e70b6be'),
    ('public.catalog_wine_usage(uuid)',                       '8544e9afe31d30c26d516e68b19fca23'),
    ('public.shared_cellar_lots(uuid)',                       'c3da48f21c077f0a349e5d88e55b0ff7'),
    ('public.catalog_wine_masked_pours(uuid[])',              'fea91b152e3565f16c56cc1d15810d29'),
    ('public.catalog_wine_in_callers_unrevealed_glass(uuid)', 'f33fbd7f4e283cb0ed682469aa6ea2c2'),
    ('public.save_wset_note(jsonb,jsonb)',                    '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.record_training_attempt(jsonb,jsonb,jsonb)',     'f6a24c83c24aaab34ab568dc6280083f'),
    ('public.wset_notes_resolve_on_reveal()',                 'f406623e9d46feb1f1aa0fb8c285529d'),
    ('public.scrub_deleted_account(uuid)',                    'b9aa8d71a00dda3aec526a2ec6950f1d'),
    ('public.handle_new_user()',                              'f18c8dc309331e2b2cf7d40bad8d55fa')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig);
```

Every row `same = true`. If one is false, stop: the migration that changed it must be read and this plan's pins re-derived.
- [ ] **P4: Baseline.** Run the full-suite and tsc commands above; record B_files and B_tests.

---

### Task 1: M1 migration, types, DB suite and the §9.3 suite updates

**Files:**
- Create: `supabase/migrations/20260927140000_sharing_defaults.sql`
- Create: `scripts/sharing-defaults.test.mjs`
- Create: `scripts/sharing-defaults/run-sql.mjs`, `scripts/sharing-defaults/rollback-m1.sql`
- Modify: `src/lib/supabase/database.types.ts` (four targeted insertions)
- Modify: `scripts/tour-seen.test.mjs`, `scripts/catalog-wine-structure.test.mjs`, `scripts/wset-notes.test.mjs`, `scripts/catalog-manage.test.mjs`, `scripts/cellar-social.test.mjs`

**Interfaces:**
- Consumes: the live objects pinned in Global Constraints.
- Produces (database, once applied by the main session):
  - `profiles.notes_visibility cellar_visibility not null default 'PUBLIC'`, in the client UPDATE grant (eleven columns).
  - `can_view_notes(p_author uuid) returns boolean` (DEFINER, STABLE; authenticated, service_role).
  - `wset_note_held(p_note_id uuid) returns boolean` (DEFINER, STABLE; authenticated).
  - `wset_my_held_notes(p_note_ids uuid[]) returns setof uuid` (DEFINER, STABLE; authenticated) — the caller's own held ids only.
  - `catalog_wine_unrevealed_glasses_of(p_catalog_wine_id uuid, p_user uuid) returns setof uuid` (owner-only).
  - Tables `wset_note_holds(id, note_id → wset_notes on delete cascade, wine_id → wines on delete set null, created_at, unique(note_id, wine_id))` (no client access) and `sharing_notices(user_id pk → profiles on delete cascade, cellar_flipped bool, notes_shared bool, created_at, dismissed_at)` (own-row SELECT; UPDATE(dismissed_at) own row).
  - Triggers `wset_notes_hold_on_identity`, `wset_notes_rule1_guard` (on `wset_notes`), `wines_release_note_holds` (on `wines`), `profiles_deleted_drop_sharing_notice` (on `profiles`).
  - The guard's refusal: SQLSTATE `42501`, message exactly `This wine is in one of your flights that hasn't been revealed yet. Change or delete this note after the reveal.`
- Produces (TypeScript, `src/lib/supabase/database.types.ts`): `export type SharingAudience = CellarVisibility;` `profiles.Row.notes_visibility: CellarVisibility` (Insert/Update optional); `Tables.sharing_notices` (`Row { user_id; cellar_flipped; notes_shared; created_at; dismissed_at: string | null }`, `Update { dismissed_at?: string | null }`, `Relationships: []`); `Functions.can_view_notes { Args: { p_author: string }; Returns: boolean }`; `Functions.wset_my_held_notes { Args: { p_note_ids: string[] }; Returns: string[] }`. Not typed on purpose: `wset_note_holds`, `wset_note_held`, the internal helper (the app never calls them, like `flight_holds`).

- [ ] **Step 1: Write the DB suite (it fails against live today — every function it calls is missing).** Create `scripts/sharing-defaults.test.mjs`:

```js
// Sharing defaults DB suite (spec docs/superpowers/specs/2026-09-27-sharing-defaults-design.md
// §9.2): can_view_notes against can_view_cellar, the narrowed "wset notes
// read" policy, the community figures that follow the reader, the Rule 1
// hold / pour link / guard, the grants, shared_cellar_lots' blanked fields,
// M2's flip and notices, and account deletion.
//
// It connects to the database pgConfig() names, which is production, so only
// the main session runs it. Every test runs inside a transaction that always
// rolls back, on throwaway profiles, wines and tastings created inside that
// transaction: no real person's row decides a result or is written.
//
//   node --env-file=.env.local --test --test-reporter=tap --test-reporter-destination=stdout \
//     scripts/sharing-defaults.test.mjs
//
// Dry run before the migrations are live: SHARING_DEFAULTS_APPLY lists the
// migration files (comma-separated, in order). Each test applies M1 inside
// its own rolled-back transaction first; M2 flips every live PRIVATE cellar,
// so only the tests about M2 apply it, after their own fixtures:
//   SHARING_DEFAULTS_APPLY=supabase/migrations/20260927140000_sharing_defaults.sql,supabase/migrations/20260927150000_sharing_defaults_flip.sql \
//     node --env-file=.env.local --test scripts/sharing-defaults.test.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const APPLY = (process.env.SHARING_DEFAULTS_APPLY ?? "")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);
const M1_FILE = APPLY.find((f) => f.endsWith("20260927140000_sharing_defaults.sql")) ?? null;
const M2_FILE = APPLY.find((f) => f.endsWith("20260927150000_sharing_defaults_flip.sql")) ?? null;
// What every test applies first: everything listed but M2.
const BASE = APPLY.filter((f) => f !== M2_FILE);
const GUARD = "This wine is in one of your flights that hasn't been revealed yet. Change or delete this note after the reveal.";

const client = new pg.Client(pgConfig());
before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

async function withRollback(cb, files = BASE) {
  await client.query("begin");
  try {
    for (const file of files) await client.query(readFileSync(file, "utf8"));
    return await cb();
  } finally {
    await client.query("rollback");
  }
}

// The table owner with no request at all (auth.uid() is null): fixtures,
// and how the auth.users triggers and the admin client reach the scrub.
async function asOwner() {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', '', true)");
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
async function asServiceRole() {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
  await client.query("set local role service_role");
}

// Runs `fn` inside a savepoint that is always rolled back, and checks it failed
// with `code` (and `message`, when given).
async function expectError(fn, code, message) {
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
  if (message !== undefined) assert.equal(error.message, message);
}

// Throwaway people that exist only inside the current transaction.
async function freshProfiles(n) {
  await asOwner();
  const ids = [];
  for (let i = 1; i <= n; i += 1) {
    const r = await client.query(
      `insert into profiles (id, display_name, email)
       values (gen_random_uuid(), $1, 'sharing-defaults-test+' || gen_random_uuid()::text || '@blindr.invalid')
       returning id`,
      [`Sharing defaults test ${i}`],
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

async function setNotes(id, value) {
  await asOwner();
  await client.query("update profiles set notes_visibility = $2 where id = $1", [id, value]);
}
async function setCellar(id, value) {
  await asOwner();
  await client.query("update profiles set cellar_visibility = $2 where id = $1", [id, value]);
}
async function befriend(a, b) {
  await asOwner();
  await client.query("insert into friendships (user_id, friend_id) values ($1, $2), ($2, $1)", [a, b]);
}

// One live id per reference table, and three aroma terms (owner role).
let refCache = null;
async function refs() {
  if (refCache) return refCache;
  await asOwner();
  const first = async (table) => (await client.query(`select id from ${table} order by id limit 1`)).rows[0].id;
  refCache = {
    country: await first("countries"),
    region: await first("regions"),
    appellation: await first("appellations"),
    grape: await first("grapes"),
    producer: await first("producers"),
    terms: (await client.query("select id from wset_aroma_terms order by id limit 3")).rows.map((r) => r.id),
  };
  return refCache;
}

// A catalog wine written by the owner; a fresh name keeps it clear of
// catalog_wines_identity_key.
async function catalogWine(createdBy, { blindPending = false } = {}) {
  const r = await refs();
  await asOwner();
  return (
    await client.query(
      `insert into catalog_wines
         (country_id, region_id, appellation_id, primary_grape_id, producer_id,
          vintage_kind, vintage_year, colour, style, wine_name, created_by, blind_pending)
       values ($1, $2, $3, $4, $5, 'YEAR', 2019, 'RED', 'STILL',
               'Sharing defaults test ' || gen_random_uuid()::text, $6, $7)
       returning id`,
      [r.country, r.region, r.appellation, r.grape, r.producer, createdBy, blindPending],
    )
  ).rows[0].id;
}

// One glass of `tasting`, keyed to `wineId` through its answer key (owner role).
async function addGlass(tasting, wineId, contributorSeat, position) {
  await asOwner();
  const glass = (
    await client.query(
      "insert into wines (tasting_id, position, contributor_participant_id) values ($1, $2, $3) returning id",
      [tasting, position, contributorSeat],
    )
  ).rows[0].id;
  await client.query(
    `insert into wine_answers
       (wine_id, country_id, region_id, appellation_id, primary_grape_id, producer_id,
        vintage_kind, vintage_year, catalog_wine_id)
     select $1, cw.country_id, cw.region_id, cw.appellation_id, cw.primary_grape_id, cw.producer_id,
            cw.vintage_kind, cw.vintage_year, cw.id
       from catalog_wines cw where cw.id = $2`,
    [glass, wineId],
  );
  return glass;
}

// A LIVE blind tasting, IN_PROGRESS, hosted by `host`, with `guests` JOINED and
// one unrevealed glass keyed to `wineId` — added by the host, or, with
// `contributor` (one of `guests`), brought by that guest (owner role).
async function flight({ host, guests = [], wineId, contributor = null }) {
  await asOwner();
  const tasting = (
    await client.query(
      `insert into tastings (name, host_id, timing_mode, wine_source, reveal_mode)
       values ('Sharing defaults test', $1, 'LIVE', $2, 'BLIND') returning id`,
      [host, contributor ? "PARTICIPANT_CONTRIBUTED" : "HOST_PROVIDES"],
    )
  ).rows[0].id;
  const seats = new Map();
  for (const user of [host, ...guests]) {
    const seat = (
      await client.query(
        "insert into tasting_participants (tasting_id, user_id, status) values ($1, $2, 'JOINED') returning id",
        [tasting, user],
      )
    ).rows[0].id;
    seats.set(user, seat);
  }
  const glass = await addGlass(tasting, wineId, contributor ? seats.get(contributor) : null, 1);
  await client.query("update tastings set status = 'IN_PROGRESS' where id = $1", [tasting]);
  return { tasting, glass, seats };
}

async function reveal(host, glass) {
  await asUser(host);
  await client.query("select public.reveal_wine($1)", [glass]);
}

// A note saved by its author through save_wset_note, as the app saves one.
async function note(author, wineId, fields = { quality_score: 88 }) {
  await asUser(author);
  return (
    await client.query("select public.save_wset_note($1::jsonb, '[]'::jsonb) as id", [
      JSON.stringify({ catalog_wine_id: wineId, ...fields }),
    ])
  ).rows[0].id;
}

async function aroma(noteId, termId) {
  await asOwner();
  await client.query(
    "insert into wset_note_aromas (note_id, term_id, sensed_on_nose, sensed_on_palate) values ($1, $2, true, false)",
    [noteId, termId],
  );
}

// Whether `reader` can read the note (the policy decides).
async function sees(reader, noteId) {
  await asUser(reader);
  return (await client.query("select count(*)::int as n from wset_notes where id = $1", [noteId])).rows[0].n === 1;
}

async function holdsOf(noteId) {
  await asOwner();
  return (
    await client.query("select wine_id from wset_note_holds where note_id = $1 order by wine_id", [noteId])
  ).rows.map((r) => r.wine_id);
}

async function myHeld(who, ids) {
  await asUser(who);
  return (await client.query("select t.id from public.wset_my_held_notes($1::uuid[]) as t(id)", [ids])).rows.map(
    (r) => r.id,
  );
}

// ---------------------------------------------------------------------------
// 1. can_view_notes against can_view_cellar
// ---------------------------------------------------------------------------

test("can_view_notes answers exactly as can_view_cellar for every audience and viewer; a deleted author is refused", async () => {
  await withRollback(async () => {
    const [owner, pal, oneWay, requester, stranger] = await freshProfiles(5);
    await befriend(owner, pal);
    await asOwner();
    await client.query("insert into friendships (user_id, friend_id) values ($1, $2)", [oneWay, owner]);
    await client.query("insert into friend_requests (requester_id, recipient_id) values ($1, $2)", [requester, owner]);
    const viewers = { self: owner, pal, oneWay, requester, stranger, nobody: null };
    const expected = {
      PUBLIC: { self: true, pal: true, oneWay: true, requester: true, stranger: true, nobody: true },
      FRIENDS: { self: false, pal: true, oneWay: true, requester: false, stranger: false, nobody: false },
      PRIVATE: { self: false, pal: false, oneWay: false, requester: false, stranger: false, nobody: false },
    };
    for (const audience of ["PUBLIC", "FRIENDS", "PRIVATE"]) {
      await asOwner();
      await client.query("update profiles set cellar_visibility = $2, notes_visibility = $2 where id = $1", [
        owner,
        audience,
      ]);
      for (const [name, viewer] of Object.entries(viewers)) {
        await asUser(viewer);
        const r = (
          await client.query("select public.can_view_cellar($1) as cellar, public.can_view_notes($1) as notes", [owner])
        ).rows[0];
        assert.equal(r.notes, r.cellar, `${audience} / ${name}: the two helpers disagree`);
        assert.equal(r.notes, expected[audience][name], `${audience} / ${name}`);
      }
    }
    await setNotes(owner, "PUBLIC");
    await asOwner();
    await client.query("select public.scrub_deleted_account($1)", [owner]);
    await asUser(stranger);
    assert.equal(
      (await client.query("select public.can_view_notes($1) as ok", [owner])).rows[0].ok,
      false,
      "a deleted author's notes are refused whatever notes_visibility says",
    );
  });
});

// ---------------------------------------------------------------------------
// 2-3. The read policy
// ---------------------------------------------------------------------------

test("the author reads every note of their own: identity-less, held, Only me, on an unidentified wine", async () => {
  await withRollback(async () => {
    const [author, host, guest] = await freshProfiles(3);
    const hostsWine = await catalogWine(host);
    const { glass } = await flight({ host, guests: [author, guest], wineId: hostsWine });
    await asOwner();
    const blind = (
      await client.query(
        "insert into wset_notes (author_id, context_kind, tasting_wine_id) values ($1, 'BLIND', $2) returning id",
        [author, glass],
      )
    ).rows[0].id;
    const training = (
      await client.query("insert into wset_notes (author_id, context_kind) values ($1, 'TRAINING') returning id", [
        author,
      ])
    ).rows[0].id;
    const own = await catalogWine(author);
    await flight({ host: author, guests: [guest], wineId: own });
    const held = await note(author, own);
    assert.equal((await holdsOf(held)).length, 1, "held: the author adds an unrevealed glass of the wine");
    await asOwner();
    const unidentifiedWine = (
      await client.query(
        "insert into catalog_wines_unidentified (created_by, colour, style) values ($1, 'RED', 'STILL') returning id",
        [author],
      )
    ).rows[0].id;
    await asUser(author);
    const unidentified = (
      await client.query("select public.save_wset_note($1::jsonb, '[]'::jsonb) as id", [
        JSON.stringify({ unidentified_wine_id: unidentifiedWine, quality_score: 80 }),
      ])
    ).rows[0].id;
    await setNotes(author, "PRIVATE");
    const onlyMe = await note(author, await catalogWine(host));
    for (const [name, id] of Object.entries({ blind, training, held, unidentified, onlyMe })) {
      assert.equal(await sees(author, id), true, `the author reads their own ${name} note`);
    }
  });
});

test("others read a note by its author's setting; never identity-less, unidentified, or on a wine they cannot read; aromas follow", async () => {
  await withRollback(async () => {
    const r = await refs();
    const [author, friend, stranger, requester, creator] = await freshProfiles(5);
    await befriend(author, friend);
    await asOwner();
    await client.query("insert into friend_requests (requester_id, recipient_id) values ($1, $2)", [requester, author]);
    const wine = await catalogWine(creator);
    const n = await note(author, wine, { quality_score: 90 });
    await aroma(n, r.terms[0]);
    const aromasSeenBy = async (who) => {
      await asUser(who);
      return (await client.query("select count(*)::int as n from wset_note_aromas where note_id = $1", [n])).rows[0].n;
    };

    for (const who of [friend, stranger, requester]) assert.equal(await sees(who, n), true, "Everyone: readable");
    assert.equal(await aromasSeenBy(stranger), 1, "Everyone: its aromas too");

    await setNotes(author, "FRIENDS");
    assert.equal(await sees(friend, n), true, "Friends: the accepted friend");
    assert.equal(await sees(stranger, n), false, "Friends: not a stranger");
    assert.equal(await sees(requester, n), false, "Friends: not a pending requester");
    assert.equal(await aromasSeenBy(stranger), 0, "Friends: nor its aromas");

    await setNotes(author, "PRIVATE");
    for (const who of [friend, stranger, requester]) assert.equal(await sees(who, n), false, "Only me: nobody");
    await setNotes(author, "PUBLIC");

    const { glass } = await flight({ host: creator, guests: [author, friend], wineId: wine });
    await asOwner();
    const blind = (
      await client.query(
        "insert into wset_notes (author_id, context_kind, tasting_wine_id) values ($1, 'BLIND', $2) returning id",
        [author, glass],
      )
    ).rows[0].id;
    const training = (
      await client.query("insert into wset_notes (author_id, context_kind) values ($1, 'TRAINING') returning id", [
        author,
      ])
    ).rows[0].id;
    const unidentifiedWine = (
      await client.query(
        "insert into catalog_wines_unidentified (created_by, colour, style) values ($1, 'RED', 'STILL') returning id",
        [author],
      )
    ).rows[0].id;
    const unidentified = (
      await client.query(
        "insert into wset_notes (author_id, unidentified_wine_id, quality_score) values ($1, $2, 80) returning id",
        [author, unidentifiedWine],
      )
    ).rows[0].id;
    for (const [name, id] of Object.entries({ blind, training, unidentified })) {
      assert.equal(await sees(friend, id), false, `${name}: nobody but the author`);
    }

    const hidden = await catalogWine(creator, { blindPending: true });
    const onHidden = await note(author, hidden);
    assert.equal(await sees(stranger, onHidden), false, "a blind_pending wine's note: not a stranger");
    assert.equal(await sees(creator, onHidden), true, "a blind_pending wine's note: its creator, who reads the wine");
  });
});

// ---------------------------------------------------------------------------
// 4. Figures others see
// ---------------------------------------------------------------------------

test("ratings, descriptors, structure and usage leave out an Only-me note and a held note for others, and include your own", async () => {
  await withRollback(async () => {
    const r = await refs();
    const [a, b, c, stranger, guest] = await freshProfiles(5);
    const wine = await catalogWine(a);
    const na = await note(a, wine, { quality_score: 90, acidity: "HIGH" });
    await setNotes(b, "PRIVATE");
    const nb = await note(b, wine, { quality_score: 60, acidity: "LOW" });
    await flight({ host: c, guests: [guest], wineId: wine });
    const nc = await note(c, wine, { quality_score: 70, acidity: "MEDIUM" });
    assert.equal((await holdsOf(nc)).length, 1, "c's note is held");
    await aroma(na, r.terms[0]);
    await aroma(nb, r.terms[1]);
    await aroma(nc, r.terms[2]);

    const figures = async (who) => {
      await asUser(who);
      const ratings = (
        await client.query("select avg_score, note_count from catalog_wine_ratings where catalog_wine_id = $1", [wine])
      ).rows[0];
      const terms = (
        await client.query(
          "select term_id from catalog_wine_descriptors where catalog_wine_id = $1 order by term_id",
          [wine],
        )
      ).rows.map((x) => x.term_id);
      const acidity = (
        await client.query("select n from public.catalog_wine_structure($1) where dimension = 'acidity'", [wine])
      ).rows[0];
      return { avg: Number(ratings?.avg_score ?? NaN), count: ratings?.note_count ?? 0, terms, acidity: acidity?.n ?? 0 };
    };

    assert.deepEqual(await figures(stranger), { avg: 90, count: 1, terms: [r.terms[0]], acidity: 1 });
    assert.deepEqual(await figures(b), { avg: 75, count: 2, terms: [r.terms[0], r.terms[1]].sort(), acidity: 2 });
    assert.deepEqual(await figures(c), { avg: 80, count: 2, terms: [r.terms[0], r.terms[2]].sort(), acidity: 2 });

    await asUser(stranger);
    assert.equal(
      (await client.query("select note_count from public.catalog_wine_usage($1)", [wine])).rows[0].note_count,
      2,
      "usage counts the Only-me note (a reference count) but not the held one",
    );
    await asOwner();
    assert.equal(
      (await client.query("select prosecdef from pg_proc where oid = 'public.catalog_wine_structure(uuid)'::regprocedure"))
        .rows[0].prosecdef,
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. The hold (S10)
// ---------------------------------------------------------------------------

test("a host's note on the wine in their unrevealed glass is held: the author reads it, a guest does not, and only the author is told", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(host);
    const { glass } = await flight({ host, guests: [guest], wineId: wine });
    const n = await note(host, wine);
    assert.equal(await sees(guest, n), false);
    assert.equal(await sees(host, n), true);
    assert.deepEqual(await holdsOf(n), [glass]);
    assert.deepEqual(await myHeld(host, [n]), [n]);
    assert.deepEqual(await myHeld(guest, [n]), [], "a guest learns nothing from the id");
  });
});

test("a bring-your-own contributor's note on the bottle they brought is held the same way", async () => {
  await withRollback(async () => {
    const [host, contributor, guest] = await freshProfiles(3);
    const wine = await catalogWine(contributor);
    const { glass } = await flight({ host, guests: [contributor, guest], wineId: wine, contributor });
    const n = await note(contributor, wine);
    assert.deepEqual(await holdsOf(n), [glass]);
    assert.equal(await sees(guest, n), false);
    assert.equal(await sees(host, n), false, "the host did not add this glass and does not read the note either");
    assert.equal(await sees(contributor, n), true);
  });
});

test("a guest's own note on the poured wine is not held", async () => {
  await withRollback(async () => {
    const [host, guest, stranger] = await freshProfiles(3);
    const wine = await catalogWine(host);
    await flight({ host, guests: [guest], wineId: wine });
    const n = await note(guest, wine);
    assert.deepEqual(await holdsOf(n), []);
    assert.equal(await sees(stranger, n), true);
  });
});

test("a note written before the glass stays readable after the glass is poured (no vanish)", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(host);
    const n = await note(host, wine);
    assert.equal(await sees(guest, n), true);
    await flight({ host, guests: [guest], wineId: wine });
    assert.equal(await sees(guest, n), true, "keying a glass never hides an older note");
    assert.deepEqual(await holdsOf(n), []);
  });
});

test("the reveal releases the hold", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(host);
    const { glass } = await flight({ host, guests: [guest], wineId: wine });
    const n = await note(host, wine);
    assert.equal(await sees(guest, n), false);
    await reveal(host, glass);
    assert.equal(await sees(guest, n), true);
    assert.deepEqual(await holdsOf(n), []);
  });
});

test("removing the glass, or deleting the tasting, before the reveal keeps the note held", async () => {
  for (const removal of ["glass", "tasting"]) {
    await withRollback(async () => {
      const [host, guest] = await freshProfiles(2);
      const wine = await catalogWine(host);
      const { tasting, glass } = await flight({ host, guests: [guest], wineId: wine });
      const n = await note(host, wine);
      await asOwner();
      if (removal === "glass") await client.query("delete from wines where id = $1", [glass]);
      else await client.query("delete from tastings where id = $1", [tasting]);
      assert.deepEqual(await holdsOf(n), [null], `${removal}: the hold stays, its glass gone`);
      assert.equal(await sees(guest, n), false, `${removal}: still hidden`);
    });
  }
});

test("an identity that arrives at another glass's reveal is held while the author adds an unrevealed glass of that wine", async () => {
  await withRollback(async () => {
    const [author, other, guest] = await freshProfiles(3);
    const wine = await catalogWine(other);
    const first = await flight({ host: other, guests: [author, guest], wineId: wine });
    await asUser(author);
    const n = (
      await client.query("select public.save_wset_note($1::jsonb, '[]'::jsonb) as id", [
        JSON.stringify({ context_kind: "BLIND", tasting_wine_id: first.glass, quality_score: 85 }),
      ])
    ).rows[0].id;
    const second = await flight({ host: author, guests: [guest], wineId: wine });
    await reveal(other, first.glass);
    await asOwner();
    assert.equal(
      (await client.query("select catalog_wine_id from wset_notes where id = $1", [n])).rows[0].catalog_wine_id,
      wine,
      "the reveal resolved the note",
    );
    assert.deepEqual(await holdsOf(n), [second.glass]);
    assert.equal(await sees(guest, n), false);
  });
});

test("record_training_attempt's revealed note is held while its taster adds an unrevealed glass of that wine", async () => {
  await withRollback(async () => {
    const [author, guest] = await freshProfiles(2);
    const wine = await catalogWine(author);
    const { glass } = await flight({ host: author, guests: [guest], wineId: wine });
    await asUser(author);
    const out = (
      await client.query("select public.record_training_attempt($1::jsonb, '[]'::jsonb, $2::jsonb) as r", [
        JSON.stringify({ quality_score: 80 }),
        JSON.stringify({ session_key: randomUUID(), actual_catalog_wine_id: wine, candidates_snapshot: [] }),
      ])
    ).rows[0].r;
    assert.deepEqual(await holdsOf(out.note_id), [glass]);
    assert.equal(await sees(guest, out.note_id), false);
  });
});

test("resolve_unidentified_wine's arrival is held while the author adds an unrevealed glass of the target", async () => {
  await withRollback(async () => {
    const [author, guest] = await freshProfiles(2);
    const wine = await catalogWine(author);
    const { glass } = await flight({ host: author, guests: [guest], wineId: wine });
    await asOwner();
    const unidentifiedWine = (
      await client.query(
        "insert into catalog_wines_unidentified (created_by, colour, style) values ($1, 'RED', 'STILL') returning id",
        [author],
      )
    ).rows[0].id;
    await asUser(author);
    const n = (
      await client.query("select public.save_wset_note($1::jsonb, '[]'::jsonb) as id", [
        JSON.stringify({ unidentified_wine_id: unidentifiedWine, quality_score: 80 }),
      ])
    ).rows[0].id;
    await asUser(author);
    await client.query("select public.resolve_unidentified_wine($1, $2)", [unidentifiedWine, wine]);
    assert.deepEqual(await holdsOf(n), [glass]);
    assert.equal(await sees(guest, n), false);
  });
});

test("a curator's merge of someone else's note onto the poured wine is allowed and does not hold it (R3)", async () => {
  await withRollback(async () => {
    const [author, curator, guest, stranger] = await freshProfiles(4);
    const loser = await catalogWine(author);
    const winner = await catalogWine(curator);
    await flight({ host: author, guests: [guest], wineId: winner });
    const n = await note(author, loser);
    await asOwner();
    await client.query("update profiles set is_curator = true where id = $1", [curator]);
    await asUser(curator);
    await client.query("select public.merge_catalog_wines($1, $2)", [loser, winner]);
    await asOwner();
    assert.equal(
      (await client.query("select catalog_wine_id from wset_notes where id = $1", [n])).rows[0].catalog_wine_id,
      winner,
    );
    assert.deepEqual(await holdsOf(n), [], "a move is not an arrival: holding it would be a vanish");
    assert.equal(await sees(stranger, n), true);
  });
});

test("M1's back-fill holds a note whose author already adds an unrevealed glass of its wine", async (t) => {
  if (!M1_FILE) {
    t.skip("runs only while M1 is not live and SHARING_DEFAULTS_APPLY lists it");
    return;
  }
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(host);
    const { glass } = await flight({ host, guests: [guest], wineId: wine });
    await asOwner();
    const n = (
      await client.query(
        "insert into wset_notes (catalog_wine_id, author_id, quality_score) values ($1, $2, 90) returning id",
        [wine, host],
      )
    ).rows[0].id;
    await client.query(readFileSync(M1_FILE, "utf8"));
    assert.deepEqual(await holdsOf(n), [glass]);
    assert.equal(await sees(guest, n), false);
  }, []);
});

// ---------------------------------------------------------------------------
// 6. The pour link (S11)
// ---------------------------------------------------------------------------

test("a note linked to its author's masked pour is hidden from others until that glass's reveal", async () => {
  await withRollback(async () => {
    const [host, guest, stranger] = await freshProfiles(3);
    const poured = await catalogWine(host);
    const keyed = await catalogWine(host); // the glass now names another wine (a Swap)
    const { glass } = await flight({ host, guests: [guest], wineId: keyed });
    await asOwner();
    const lot = (
      await client.query(
        "insert into cellar_lots (owner_id, catalog_wine_id, quantity, purchased_quantity) values ($1, $2, 1, 2) returning id",
        [host, poured],
      )
    ).rows[0].id;
    const pour = (
      await client.query(
        "insert into cellar_consumptions (owner_id, lot_id, catalog_wine_id, quantity) values ($1, $2, $3, 1) returning id",
        [host, lot, poured],
      )
    ).rows[0].id;
    await client.query(
      `insert into wine_pour_intents (wine_id, owner_id, cellar_lot_id, consume_on_start, cellar_consumption_id)
       values ($1, $2, $3, true, $4)`,
      [glass, host, lot, pour],
    );
    const n = await note(host, poured);
    await asUser(host);
    await client.query("update cellar_consumptions set wset_note_id = $1 where id = $2", [n, pour]);
    assert.deepEqual(await holdsOf(n), [], "no hold row: the pour link alone hides it");
    assert.equal(await sees(stranger, n), false, "the masked pour hides it");
    assert.equal(await sees(host, n), true);
    assert.deepEqual(await myHeld(host, [n]), [n]);
    await reveal(host, glass);
    assert.equal(await sees(stranger, n), true, "the reveal unmasks the pour");
  });
});

test("another owner's masked pour pointing at my note does not hide it", async () => {
  await withRollback(async () => {
    const [author, other, stranger] = await freshProfiles(3);
    const wine = await catalogWine(author);
    const n = await note(author, wine);
    await asOwner();
    const lot = (
      await client.query(
        "insert into cellar_lots (owner_id, catalog_wine_id, quantity, purchased_quantity) values ($1, $2, 1, 2) returning id",
        [other, wine],
      )
    ).rows[0].id;
    const pour = (
      await client.query(
        "insert into cellar_consumptions (owner_id, lot_id, catalog_wine_id, quantity, wset_note_id) values ($1, $2, $3, 1, $4) returning id",
        [other, lot, wine, n],
      )
    ).rows[0].id;
    await client.query("insert into flight_holds (consumption_id) values ($1)", [pour]);
    assert.equal(await sees(stranger, n), true);
  });
});

// ---------------------------------------------------------------------------
// 7. The guard (S12)
// ---------------------------------------------------------------------------

test("the adder's update, save_wset_note and delete of a note others see on the poured wine are refused", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(host);
    const n = await note(host, wine, { quality_score: 80 });
    await flight({ host, guests: [guest], wineId: wine });
    await asUser(host);
    await expectError(
      () => client.query("update wset_notes set taster_notes = 'changed' where id = $1", [n]),
      "42501",
      GUARD,
    );
    await expectError(
      () =>
        client.query("select public.save_wset_note($1::jsonb, '[]'::jsonb)", [
          JSON.stringify({ id: n, catalog_wine_id: wine, quality_score: 81 }),
        ]),
      "42501",
      GUARD,
    );
    await expectError(() => client.query("delete from wset_notes where id = $1", [n]), "42501", GUARD);
  });
});

test("moving any note onto the poured wine is refused", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const poured = await catalogWine(host);
    const other = await catalogWine(host);
    const n = await note(host, other);
    await flight({ host, guests: [guest], wineId: poured });
    await asUser(host);
    await expectError(
      () => client.query("update wset_notes set catalog_wine_id = $2 where id = $1", [n, poured]),
      "42501",
      GUARD,
    );
  });
});

test("the guard allows the author's writes to a held note, a non-adder's writes, and the adder's after the reveal", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(host);
    const older = await note(host, wine);
    const { glass } = await flight({ host, guests: [guest], wineId: wine });

    const held = await note(host, wine);
    await asUser(host);
    assert.equal((await client.query("update wset_notes set taster_notes = 'x' where id = $1", [held])).rowCount, 1);
    await client.query("select public.save_wset_note($1::jsonb, '[]'::jsonb)", [
      JSON.stringify({ id: held, catalog_wine_id: wine, quality_score: 82 }),
    ]);
    assert.equal((await client.query("delete from wset_notes where id = $1", [held])).rowCount, 1);

    const guests = await note(guest, wine);
    await asUser(guest);
    assert.equal((await client.query("update wset_notes set taster_notes = 'g' where id = $1", [guests])).rowCount, 1);
    assert.equal((await client.query("delete from wset_notes where id = $1", [guests])).rowCount, 1);

    await reveal(host, glass);
    await asUser(host);
    assert.equal((await client.query("update wset_notes set taster_notes = 'after' where id = $1", [older])).rowCount, 1);
  });
});

test("service_role and the account scrub are not judged by the guard", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(guest);
    const n = await note(host, wine);
    await flight({ host, guests: [guest], wineId: wine });
    await asServiceRole();
    assert.equal((await client.query("update wset_notes set taster_notes = 'svc' where id = $1", [n])).rowCount, 1);
    await asOwner();
    await client.query("select public.scrub_deleted_account($1)", [host]);
    assert.equal(
      (await client.query("select count(*)::int as n from wset_notes where author_id = $1", [host])).rows[0].n,
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Grants and ACLs
// ---------------------------------------------------------------------------

test("the profiles client UPDATE grant is exactly the eleven columns", async () => {
  await withRollback(async () => {
    const r = await client.query(
      `select string_agg(format('%s:%s', a.attname, x.privilege_type), ','
                order by a.attname::text collate "C", x.privilege_type collate "C") as acl
         from pg_attribute a, aclexplode(a.attacl) x
        where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped`,
    );
    assert.equal(
      r.rows[0].acl,
      "avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE," +
        "last_seen_at:UPDATE,location:UPDATE,notes_visibility:UPDATE,phone:UPDATE,preferred_currency:UPDATE,tour_seen_at:UPDATE",
    );
  });
});

test("sharing_notices: a person reads and dismisses only their own row, writes nothing else; anon reads nothing", async () => {
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await asOwner();
    await client.query(
      "insert into sharing_notices (user_id, cellar_flipped, notes_shared) values ($1, true, false), ($2, false, true)",
      [a, b],
    );
    await asUser(a);
    assert.deepEqual(
      (await client.query("select user_id from sharing_notices where user_id = any($1)", [[a, b]])).rows.map(
        (r) => r.user_id,
      ),
      [a],
    );
    assert.equal((await client.query("update sharing_notices set dismissed_at = now() where user_id = $1", [b])).rowCount, 0);
    assert.equal((await client.query("update sharing_notices set dismissed_at = now() where user_id = $1", [a])).rowCount, 1);
    await expectError(() => client.query("update sharing_notices set cellar_flipped = false where user_id = $1", [a]), "42501");
    await expectError(
      () => client.query("insert into sharing_notices (user_id, cellar_flipped, notes_shared) values ($1, true, true)", [a]),
      "42501",
    );
    await expectError(() => client.query("delete from sharing_notices where user_id = $1", [a]), "42501");
    await asAnon();
    await expectError(() => client.query("select * from sharing_notices"), "42501");
  });
});

test("wset_note_holds grants nothing to any client role", async () => {
  await withRollback(async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        assert.equal(
          (await client.query("select has_table_privilege($1, 'public.wset_note_holds', $2) as ok", [role, privilege]))
            .rows[0].ok,
          false,
          `${role} ${privilege}`,
        );
      }
    }
    const [a] = await freshProfiles(1);
    await asUser(a);
    await expectError(() => client.query("select * from wset_note_holds"), "42501");
  });
});

test("the new functions' EXECUTE is exactly spec §3.1's", async () => {
  await withRollback(async () => {
    const r = await client.query(
      `select p.oid::regprocedure::text as sig,
              (select string_agg(x.g, ',' order by x.g collate "C")
                 from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                            when a.grantee = p.proowner then 'OWNER'
                                            else pg_get_userbyid(a.grantee)::text end as g
                         from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE') x) as grantees
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname = any($1)
        order by 1`,
      [
        [
          "can_view_notes",
          "wset_note_held",
          "wset_my_held_notes",
          "catalog_wine_unrevealed_glasses_of",
          "wset_notes_hold_on_identity",
          "wines_release_note_holds",
          "wset_notes_rule1_guard",
          "drop_deleted_profile_sharing_notice",
        ],
      ],
    );
    assert.deepEqual(Object.fromEntries(r.rows.map((x) => [x.sig, x.grantees])), {
      "can_view_notes(uuid)": "OWNER,authenticated,service_role",
      "catalog_wine_unrevealed_glasses_of(uuid,uuid)": "OWNER",
      "drop_deleted_profile_sharing_notice()": "OWNER",
      "wines_release_note_holds()": "OWNER",
      "wset_my_held_notes(uuid[])": "OWNER,authenticated",
      "wset_note_held(uuid)": "OWNER,authenticated",
      "wset_notes_hold_on_identity()": "OWNER",
      "wset_notes_rule1_guard()": "OWNER",
    });
  });
});

// ---------------------------------------------------------------------------
// 9. shared_cellar_lots (S13)
// ---------------------------------------------------------------------------

test("shared_cellar_lots blanks the owner-only lot fields for anyone else, keeps the location and the masked quantity", async () => {
  await withRollback(async () => {
    const [owner, viewer] = await freshProfiles(2);
    const wine = await catalogWine(owner);
    await setCellar(owner, "PUBLIC");
    await asOwner();
    const lot = (
      await client.query(
        `insert into cellar_lots (owner_id, catalog_wine_id, quantity, purchased_quantity, price_per_bottle,
                                  purchase_source, storage_location, lot_note)
         values ($1, $2, 2, 3, 120, 'Wine shop', 'Rack 3', 'Private note text') returning id`,
        [owner, wine],
      )
    ).rows[0].id;
    const pour = (
      await client.query(
        "insert into cellar_consumptions (owner_id, lot_id, catalog_wine_id, quantity) values ($1, $2, $3, 1) returning id",
        [owner, lot, wine],
      )
    ).rows[0].id;
    await client.query("insert into flight_holds (consumption_id) values ($1)", [pour]);
    const read = async (who) => {
      await asUser(who);
      const row = (
        await client.query(
          `select lot_note, price_per_bottle, purchase_source, storage_location, quantity
             from public.shared_cellar_lots($1) where id = $2`,
          [owner, lot],
        )
      ).rows[0];
      return { ...row, price_per_bottle: row.price_per_bottle === null ? null : Number(row.price_per_bottle) };
    };
    assert.deepEqual(await read(viewer), {
      lot_note: null,
      price_per_bottle: null,
      purchase_source: null,
      storage_location: "Rack 3",
      quantity: 3,
    });
    assert.deepEqual(await read(owner), {
      lot_note: "Private note text",
      price_per_bottle: 120,
      purchase_source: "Wine shop",
      storage_location: "Rack 3",
      quantity: 3,
    });
  });
});

// ---------------------------------------------------------------------------
// 11. Account deletion
// ---------------------------------------------------------------------------

test("an account deletion drops the notice and the notes, and the guard does not refuse the scrub", async () => {
  await withRollback(async () => {
    const [host, guest] = await freshProfiles(2);
    const wine = await catalogWine(guest);
    await note(host, wine);
    await flight({ host, guests: [guest], wineId: wine });
    await asOwner();
    await client.query("insert into sharing_notices (user_id, cellar_flipped, notes_shared) values ($1, true, true)", [
      host,
    ]);
    // The auth.users triggers call this same function; a throwaway profile has
    // no auth user, so the suite calls it directly, with no JWT — the way the
    // admin client's and the dashboard's deletions reach it.
    await client.query("select public.scrub_deleted_account($1)", [host]);
    const left = (
      await client.query(
        `select (select count(*)::int from sharing_notices where user_id = $1) as notices,
                (select count(*)::int from wset_notes where author_id = $1) as notes,
                (select deleted_at is not null from profiles where id = $1) as deleted`,
        [host],
      )
    ).rows[0];
    assert.deepEqual(left, { notices: 0, notes: 0, deleted: true });
  });
});
```

- [ ] **Step 2: Syntax gate.** Run `cd /c/Users/Public/repos/blindtastingapp-training && node --check scripts/sharing-defaults.test.mjs && echo ok`. Expected: `ok`. (Running it is the main session's: Rollout R1. Against live without `SHARING_DEFAULTS_APPLY` every test fails — `can_view_notes` and friends do not exist yet.)

- [ ] **Step 3: Write M1.** Create `supabase/migrations/20260927140000_sharing_defaults.sql`:

```sql
-- Sharing defaults, M1 of 2: the notes setting, the narrowed notes read
-- policy and its Rule 1 machinery (the hold, the pour link, the guard), the
-- community figures that follow the reader, shared cellars without the
-- owner-only lot fields, and the empty notice table M2 fills.
--
-- Spec: docs/superpowers/specs/2026-09-27-sharing-defaults-design.md (§3.1,
-- §4, §5; S5-S14, S19-S23). Plan: docs/superpowers/plans/2026-09-27-sharing-defaults.md,
-- Task 1. Safe under the app deployed today (spec §10.1): M1 flips no
-- cellar, and every author is Everyone, so the deployed app's readers of
-- other people's notes lose only held notes (0 live).
--
-- Written against the LIVE state (read-only, 2026-09-27), never an older
-- migration file alone:
-- * "wset notes read": SELECT, authenticated,
--   ((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR (author_id = auth.uid())).
--   The insert, update and delete policies are 20260914094500's; md5 of
--   their canonical text (below) 1a032311d06ac6939ff04ca5977a61d6. RLS on,
--   not forced. Triggers: wset_notes_glass_move_guard,
--   wset_notes_glass_resolve_on_write, wset_notes_hue_matches_colour,
--   wset_notes_set_updated_at. wset_notes_one_identity is 20260925120000's.
-- * 16 notes (10 OPEN, 5 BLIND identified, 1 TRAINING identity-less); 0 on
--   an unidentified wine, 0 on a blind_pending wine; 0 unrevealed glasses,
--   0 flight_holds, so the hold back-fill (step 9) writes 0 rows today.
-- * profiles: 34 PRIVATE, 2 FRIENDS, 2 PUBLIC cellars, 0 deleted;
--   cellar_visibility defaults to 'PRIVATE'. Two policies ("profiles read"
--   true, "profiles update own"). The client UPDATE grant is ten columns
--   (tour_seen_at since 20260925010000); anon and authenticated hold no
--   table-level UPDATE.
-- * "catalog read" = ((NOT blind_pending) OR (created_by = auth.uid()) OR
--   can_read_blind_pending_catalog_wine(id)); "wset note aromas read" =
--   EXISTS over wset_notes; catalog_wine_ratings and catalog_wine_descriptors
--   are security_invoker=true.
-- * Function bodies (md5 of prosrc with CR stripped): can_view_cellar
--   3af2e51e338dc43cc48b58f061049ec2, catalog_wine_structure
--   e5111f04dc3c14e5d62a82072e70b6be (DEFINER; switched to INVOKER below),
--   catalog_wine_usage 8544e9afe31d30c26d516e68b19fca23 and
--   shared_cellar_lots c3da48f21c077f0a349e5d88e55b0ff7 (recreated below),
--   catalog_wine_masked_pours fea91b152e3565f16c56cc1d15810d29 and
--   catalog_wine_in_callers_unrevealed_glass f33fbd7f4e283cb0ed682469aa6ea2c2
--   (owner-only; called / mirrored), save_wset_note
--   9ac29b18bbda5b08bcd9a12e19beb932, record_training_attempt
--   f6a24c83c24aaab34ab568dc6280083f, wset_notes_resolve_on_reveal
--   f406623e9d46feb1f1aa0fb8c285529d, scrub_deleted_account
--   b9aa8d71a00dda3aec526a2ec6950f1d (all unchanged).
-- * Default privileges hand every new function EXECUTE to PUBLIC, anon,
--   authenticated and service_role, and every new table all privileges to
--   anon, authenticated and service_role: each object below revokes what it
--   must not keep.
--
-- Never add a catalog_wines_unidentified check to the notes read policy:
-- its policy calls can_read_unidentified_wine, SECURITY INVOKER over
-- wset_notes, and the policy would recurse (spec §4.3). Notes on an
-- unidentified wine are simply author-only.
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
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'notes_visibility') then
    raise exception 'profiles.notes_visibility already exists; re-read live before applying';
  end if;
  if to_regclass('public.wset_note_holds') is not null or to_regclass('public.sharing_notices') is not null then
    raise exception 'wset_note_holds or sharing_notices already exists; re-read live before applying';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('can_view_notes', 'wset_note_held', 'wset_my_held_notes',
                      'catalog_wine_unrevealed_glasses_of', 'wset_notes_hold_on_identity',
                      'wines_release_note_holds', 'wset_notes_rule1_guard',
                      'drop_deleted_profile_sharing_notice');
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %', v_text;
  end if;
  if exists (select 1 from pg_trigger t
             where not t.tgisinternal
               and t.tgname in ('wset_notes_hold_on_identity', 'wines_release_note_holds',
                                'wset_notes_rule1_guard', 'profiles_deleted_drop_sharing_notice')) then
    raise exception 'a trigger this migration creates already exists';
  end if;
  if exists (select 1 from pg_indexes i
             where i.schemaname = 'public'
               and i.indexname in ('wset_notes_author_tasted_idx', 'wset_notes_catalog_wine_idx',
                                   'cellar_consumptions_wset_note_idx')) then
    raise exception 'an index this migration creates already exists';
  end if;

  -- 2. The enum both settings use, and the cellar default M2 changes.
  if enum_range(null::public.cellar_visibility)::text[] is distinct from array['PRIVATE', 'FRIENDS', 'PUBLIC'] then
    raise exception 'cellar_visibility labels are not PRIVATE, FRIENDS, PUBLIC';
  end if;
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility')
     is distinct from '''PRIVATE''::cellar_visibility' then
    raise exception 'profiles.cellar_visibility does not default to PRIVATE';
  end if;

  -- 3. wset_notes: RLS, the four policies, the four triggers, the identity check.
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.wset_notes'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'wset_notes row level security is not enabled, or is forced';
  end if;
  if (select string_agg(p.polname::text, ',' order by p.polname::text collate "C")
        from pg_policy p where p.polrelid = 'public.wset_notes'::regclass)
     is distinct from 'wset notes delete,wset notes insert,wset notes read,wset notes update' then
    raise exception 'wset_notes does not have exactly its four live policies';
  end if;
  if (select format('%s %s %s', p.polcmd, p.polroles::regrole[]::text, pg_get_expr(p.polqual, p.polrelid))
        from pg_policy p where p.polrelid = 'public.wset_notes'::regclass and p.polname = 'wset notes read')
     is distinct from
       'r {authenticated} ((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR (author_id = auth.uid()))' then
    raise exception '"wset notes read" is not the live policy this file replaces';
  end if;
  select md5(string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd,
                               case when p.polpermissive then 'permissive' else 'restrictive' end,
                               p.polroles::regrole[]::text,
                               coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                               coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                        E'\n' order by p.polname::text collate "C"))
    into v_text
  from pg_policy p
  where p.polrelid = 'public.wset_notes'::regclass and p.polname <> 'wset notes read';
  if v_text is distinct from '1a032311d06ac6939ff04ca5977a61d6' then
    raise exception 'the wset_notes insert/update/delete policies differ from live (md5 %)', v_text;
  end if;
  if (select string_agg(t.tgname::text, ',' order by t.tgname::text collate "C")
        from pg_trigger t where t.tgrelid = 'public.wset_notes'::regclass and not t.tgisinternal)
     is distinct from
       'wset_notes_glass_move_guard,wset_notes_glass_resolve_on_write,wset_notes_hue_matches_colour,wset_notes_set_updated_at' then
    raise exception 'wset_notes triggers differ from the four live ones';
  end if;
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = 'public.wset_notes'::regclass and c.conname = 'wset_notes_one_identity')
     is distinct from
       'CHECK (((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR '
       || '((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0) AND (tasting_wine_id IS NOT NULL) '
       || 'AND (context_kind = ''BLIND''::wset_note_context)) OR '
       || '((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0) AND (tasting_wine_id IS NULL) '
       || 'AND (context_kind = ''TRAINING''::wset_note_context))))' then
    raise exception 'wset_notes_one_identity is not the live constraint';
  end if;

  -- 4. profiles: the two policies, the ten-column client UPDATE grant, no table UPDATE.
  if (select string_agg(format('%s %s %s %s %s', p.polname, p.polcmd, p.polroles::regrole[]::text,
                               coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                               coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                        '; ' order by p.polname::text collate "C")
        from pg_policy p where p.polrelid = 'public.profiles'::regclass)
     is distinct from
       'profiles read r {authenticated} true -; profiles update own w {authenticated} (id = auth.uid()) (id = auth.uid())' then
    raise exception 'profiles policies differ from live';
  end if;
  select string_agg(format('%s:%s', a.attname, x.privilege_type), ','
                    order by a.attname::text collate "C", x.privilege_type collate "C")
    into v_text
  from pg_attribute a, aclexplode(a.attacl) x
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    and x.grantee = 'authenticated'::regrole;
  if v_text is distinct from
       'avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE,'
       || 'last_seen_at:UPDATE,location:UPDATE,phone:UPDATE,preferred_currency:UPDATE,tour_seen_at:UPDATE' then
    raise exception 'the profiles client UPDATE grant is not the ten live columns: %', v_text;
  end if;
  if has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'anon or authenticated holds a table-level UPDATE on profiles';
  end if;

  -- 5. The catalog gate the new policy leans on, and the two invoker views.
  if (select pg_get_expr(p.polqual, p.polrelid) from pg_policy p
      where p.polrelid = 'public.catalog_wines'::regclass and p.polname = 'catalog read')
     is distinct from
       '((NOT blind_pending) OR (created_by = auth.uid()) OR can_read_blind_pending_catalog_wine(id))' then
    raise exception '"catalog read" is not the live policy this file relies on';
  end if;
  if (select regexp_replace(pg_get_expr(p.polqual, p.polrelid), '\s+', ' ', 'g') from pg_policy p
      where p.polrelid = 'public.wset_note_aromas'::regclass and p.polname = 'wset note aromas read')
     is distinct from '(EXISTS ( SELECT 1 FROM wset_notes n WHERE (n.id = wset_note_aromas.note_id)))' then
    raise exception '"wset note aromas read" is not the live policy';
  end if;
  if exists (select 1 from pg_class c
             where c.oid in ('public.catalog_wine_ratings'::regclass, 'public.catalog_wine_descriptors'::regclass)
               and not ('security_invoker=true' = any (coalesce(c.reloptions, '{}')))) then
    raise exception 'catalog_wine_ratings or catalog_wine_descriptors is not security_invoker';
  end if;

  -- 6. The bodies this file recreates, switches, calls or mirrors.
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.can_view_cellar(uuid)',                           '3af2e51e338dc43cc48b58f061049ec2'),
    ('public.catalog_wine_structure(uuid)',                    'e5111f04dc3c14e5d62a82072e70b6be'),
    ('public.catalog_wine_usage(uuid)',                        '8544e9afe31d30c26d516e68b19fca23'),
    ('public.shared_cellar_lots(uuid)',                        'c3da48f21c077f0a349e5d88e55b0ff7'),
    ('public.catalog_wine_masked_pours(uuid[])',               'fea91b152e3565f16c56cc1d15810d29'),
    ('public.catalog_wine_in_callers_unrevealed_glass(uuid)',  'f33fbd7f4e283cb0ed682469aa6ea2c2'),
    ('public.save_wset_note(jsonb,jsonb)',                     '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.record_training_attempt(jsonb,jsonb,jsonb)',      'f6a24c83c24aaab34ab568dc6280083f'),
    ('public.wset_notes_resolve_on_reveal()',                  'f406623e9d46feb1f1aa0fb8c285529d'),
    ('public.scrub_deleted_account(uuid)',                     'b9aa8d71a00dda3aec526a2ec6950f1d')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'function bodies differ from the live ones this file was written against: %', v_text;
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.catalog_wine_structure(uuid)'::regprocedure) then
    raise exception 'catalog_wine_structure is already SECURITY INVOKER';
  end if;
end $$;

-- The "before" numbers the post-state compares against.
drop table if exists pg_temp._sd_profiles_before;
create temp table _sd_profiles_before on commit drop as
select p.cellar_visibility::text as visibility, (p.deleted_at is not null) as deleted, count(*)::int as n
  from public.profiles p
 group by 1, 2;

drop table if exists pg_temp._sd_notes_before;
create temp table _sd_notes_before on commit drop as
select count(*)::int as n from public.wset_notes;

-- The holds step 9 must write, computed here independently of the helper:
-- every identified note whose author is right now the adder of an unrevealed
-- glass keyed to the note's wine (the host for added_by_host, else the
-- contributor), paired with that glass.
drop table if exists pg_temp._sd_backfill;
create temp table _sd_backfill on commit drop as
select distinct n.id as note_id, w.id as wine_id
  from public.wset_notes n
  join public.wine_answers wa on wa.catalog_wine_id = n.catalog_wine_id
  join public.wines w on w.id = wa.wine_id
  join public.tastings t on t.id = w.tasting_id
  left join public.tasting_participants tp on tp.id = w.contributor_participant_id
 where n.catalog_wine_id is not null
   and not w.is_revealed
   and case when w.added_by_host then t.host_id = n.author_id else tp.user_id = n.author_id end;

-- ---------------------------------------------------------------------------
-- 1. The notes setting (S5): same enum and friend rule as the cellar.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column notes_visibility public.cellar_visibility not null default 'PUBLIC';
grant update (notes_visibility) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The hold table (S10): internal, no client access, flight_holds style.
--    A removed glass keeps its hold (wine_id set null, OD4).
-- ---------------------------------------------------------------------------
create table public.wset_note_holds (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.wset_notes(id) on delete cascade,
  wine_id uuid references public.wines(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (note_id, wine_id)
);
create index wset_note_holds_wine_idx on public.wset_note_holds (wine_id);
alter table public.wset_note_holds enable row level security;
revoke all on public.wset_note_holds from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Helpers (spec §4.2).
-- ---------------------------------------------------------------------------

-- catalog_wine_in_callers_unrevealed_glass with p_user for auth.uid(),
-- returning the glass ids. Internal: owner-only EXECUTE.
create function public.catalog_wine_unrevealed_glasses_of(p_catalog_wine_id uuid, p_user uuid)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select w.id
    from wine_answers wa
    join wines w on w.id = wa.wine_id
    join tastings t on t.id = w.tasting_id
    left join tasting_participants tp on tp.id = w.contributor_participant_id
   where wa.catalog_wine_id = p_catalog_wine_id
     and not w.is_revealed
     and case when w.added_by_host then t.host_id = p_user else tp.user_id = p_user end;
$$;
revoke all on function public.catalog_wine_unrevealed_glasses_of(uuid, uuid) from public, anon, authenticated, service_role;

-- S7: can_view_cellar's Friends clause, byte for byte, over notes_visibility,
-- plus one clause: a deleted author's notes are refused.
create function public.can_view_notes(p_author uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_author
      and p.deleted_at is null
      and (
        p.notes_visibility = 'PUBLIC'
        or (
          p.notes_visibility = 'FRIENDS'
          and exists (
            select 1 from friendships f
            where (f.user_id = p_author and f.friend_id = auth.uid())
               or (f.user_id = auth.uid() and f.friend_id = p_author)
          )
        )
      )
  );
$$;
revoke all on function public.can_view_notes(uuid) from public, anon;
grant execute on function public.can_view_notes(uuid) to authenticated, service_role;

-- S10 + S11: held by a hold row, or linked through its author's own
-- consumption to a pour catalog_wine_masked_pours still masks. The owner
-- match stops anyone hiding another person's note with their own pour.
create function public.wset_note_held(p_note_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from wset_note_holds h where h.note_id = p_note_id)
      or exists (
        select 1
          from wset_notes n
          join cellar_consumptions c on c.wset_note_id = n.id and c.owner_id = n.author_id
          cross join lateral catalog_wine_masked_pours(array[c.catalog_wine_id]) m
         where n.id = p_note_id and m.consumption_id = c.id);
$$;
revoke all on function public.wset_note_held(uuid) from public, anon, service_role;
grant execute on function public.wset_note_held(uuid) to authenticated;

-- S19: which of these note ids are the caller's own held notes.
create function public.wset_my_held_notes(p_note_ids uuid[])
returns setof uuid
language sql stable security definer set search_path = public as $$
  select n.id from wset_notes n
   where n.id = any(p_note_ids) and n.author_id = auth.uid() and wset_note_held(n.id);
$$;
revoke all on function public.wset_my_held_notes(uuid[]) from public, anon, service_role;
grant execute on function public.wset_my_held_notes(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Triggers (spec §5): the hold, its release, the guard.
-- ---------------------------------------------------------------------------

-- S10: a note that gains an identity while its author adds an unrevealed
-- glass of that wine is held until that glass is revealed. Keyed on the
-- author's glasses, never auth.uid(), so every write path is covered.
create function public.wset_notes_hold_on_identity()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.catalog_wine_id is null then
    return null;
  end if;
  -- A move is not an arrival: a note others could see never becomes held.
  if tg_op = 'UPDATE' and old.catalog_wine_id is not null then
    return null;
  end if;
  insert into wset_note_holds (note_id, wine_id)
  select new.id, g from catalog_wine_unrevealed_glasses_of(new.catalog_wine_id, new.author_id) g
  on conflict (note_id, wine_id) do nothing;
  return null;
end $$;
revoke all on function public.wset_notes_hold_on_identity() from public, anon, authenticated, service_role;
create trigger wset_notes_hold_on_identity
  after insert or update of catalog_wine_id on public.wset_notes
  for each row execute function public.wset_notes_hold_on_identity();

-- Only a reveal releases a hold: that glass's. A removed glass, a deleted
-- tasting or a CLOSED one leaves it held for good (the flight_holds rule).
-- Same trigger shape as wset_notes_resolve_on_reveal, so both fire together.
create function public.wines_release_note_holds()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from wset_note_holds where wine_id = new.id;
  return null;
end $$;
revoke all on function public.wines_release_note_holds() from public, anon, authenticated, service_role;
create trigger wines_release_note_holds
  after update of is_revealed on public.wines
  for each row when (new.is_revealed and not old.is_revealed)
  execute function public.wines_release_note_holds();

-- S12: catalog_wines_rule1_guard's analogue. The adder of an unrevealed
-- glass of W may not change or delete a note on W that others can already
-- see, nor move any note onto W. Only the author's own statement is judged.
create function public.wset_notes_rule1_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or old.author_id is distinct from auth.uid() then
    return coalesce(new, old);
  end if;
  if (old.catalog_wine_id is not null
      and not wset_note_held(old.id)
      and exists (select 1 from catalog_wine_unrevealed_glasses_of(old.catalog_wine_id, old.author_id)))
     or (tg_op = 'UPDATE' and old.catalog_wine_id is not null
         and new.catalog_wine_id is distinct from old.catalog_wine_id and new.catalog_wine_id is not null
         and exists (select 1 from catalog_wine_unrevealed_glasses_of(new.catalog_wine_id, old.author_id))) then
    raise exception using
      errcode = '42501',
      message = 'This wine is in one of your flights that hasn''t been revealed yet. Change or delete this note after the reveal.';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.wset_notes_rule1_guard() from public, anon, authenticated, service_role;
create trigger wset_notes_rule1_guard
  before update or delete on public.wset_notes
  for each row execute function public.wset_notes_rule1_guard();

-- ---------------------------------------------------------------------------
-- 5. Indexes for the new surfaces (by author, by wine) and the pour link.
-- ---------------------------------------------------------------------------
create index wset_notes_author_tasted_idx on public.wset_notes (author_id, tasted_on desc, created_at desc);
create index wset_notes_catalog_wine_idx on public.wset_notes (catalog_wine_id, tasted_on desc)
  where catalog_wine_id is not null;
create index cellar_consumptions_wset_note_idx on public.cellar_consumptions (wset_note_id)
  where wset_note_id is not null;

-- ---------------------------------------------------------------------------
-- 6. The read policy (S8, spec §4.3). The EXISTS runs under the reader's own
--    "catalog read", so a note on a blind_pending wine reaches only people
--    who can already read that wine.
-- ---------------------------------------------------------------------------
drop policy "wset notes read" on public.wset_notes;
create policy "wset notes read" on public.wset_notes for select to authenticated
using (
  author_id = auth.uid()
  or (
    catalog_wine_id is not null
    and public.can_view_notes(author_id)
    and not public.wset_note_held(id)
    and exists (select 1 from public.catalog_wines cw where cw.id = wset_notes.catalog_wine_id)
  )
);

-- ---------------------------------------------------------------------------
-- 7. Structure averages follow the reader (S9): only prosecdef flips.
-- ---------------------------------------------------------------------------
alter function public.catalog_wine_structure(uuid) security invoker;

-- ---------------------------------------------------------------------------
-- 8. catalog_wine_usage: the live body with one line changed — a held note
--    moves no count others see. Private notes still count (a reference
--    count for the delete guard). create or replace keeps its ACL.
-- ---------------------------------------------------------------------------
create or replace function public.catalog_wine_usage(p_id uuid)
returns table(holders integer, bottles integer, lot_count integer, note_count integer,
              appearance_count integer, consumption_count integer)
language sql stable security definer set search_path = public as $$
  with masked as (
    select m.consumption_id, m.lot_id, m.quantity from catalog_wine_masked_pours(array[p_id]) m
  ),
  counted as (
    select l.owner_id,
           l.quantity + coalesce((select sum(m.quantity) from masked m where m.lot_id = l.id), 0) as quantity
      from cellar_lots l
     where l.catalog_wine_id = p_id
  )
  select
    (select count(distinct owner_id)::int from counted where quantity > 0),
    (select coalesce(sum(quantity), 0)::int from counted where quantity > 0),
    (select count(*)::int from cellar_lots where catalog_wine_id = p_id),
    (select count(*)::int from wset_notes n where n.catalog_wine_id = p_id and not wset_note_held(n.id)),
    (select count(*)::int from wine_answers wa join wines w on w.id = wa.wine_id
      where wa.catalog_wine_id = p_id and w.is_revealed),
    (select count(*)::int from cellar_consumptions c
      where c.catalog_wine_id = p_id
        and not exists (select 1 from masked m where m.consumption_id = c.id));
$$;

-- ---------------------------------------------------------------------------
-- 9. Back-fill holds for notes whose author adds an unrevealed glass of the
--    note's wine right now (0 live). A one-off hide of notes the app has
--    never shown to anyone but their author.
-- ---------------------------------------------------------------------------
insert into public.wset_note_holds (note_id, wine_id)
select n.id, g from public.wset_notes n
cross join lateral public.catalog_wine_unrevealed_glasses_of(n.catalog_wine_id, n.author_id) g
where n.catalog_wine_id is not null
on conflict (note_id, wine_id) do nothing;

-- ---------------------------------------------------------------------------
-- 10. shared_cellar_lots (S13): anyone but the owner gets lot_note,
--     price_per_bottle and purchase_source as null. A null auth.uid() takes
--     the blanking branch. create or replace keeps its ACL.
-- ---------------------------------------------------------------------------
create or replace function public.shared_cellar_lots(p_owner uuid)
returns setof public.cellar_lots
language sql stable security definer set search_path = public as $$
  with lots as (
    select l.*
      from cellar_lots l
     where l.owner_id = p_owner
       and (p_owner = auth.uid() or can_view_cellar(p_owner))
  ),
  masked as (
    select m.lot_id, sum(m.quantity)::int as quantity
      from catalog_wine_masked_pours(array(select distinct lots.catalog_wine_id from lots)) m
     group by m.lot_id
  )
  select (jsonb_populate_record(null::cellar_lots,
            to_jsonb(lots) || jsonb_build_object(
              'quantity', lots.quantity + coalesce(masked.quantity, 0),
              'updated_at', lots.created_at)
            || case when p_owner = auth.uid() then '{}'::jsonb
                    else jsonb_build_object('lot_note', null, 'price_per_bottle', null,
                                            'purchase_source', null) end)).*
    from lots
    left join masked on masked.lot_id = lots.id;
$$;

-- ---------------------------------------------------------------------------
-- 11. The notice table (S14), created empty; M2 fills it. Owner-only: every
--     member reads profiles, so a flag there would publish who used to have
--     a private cellar.
-- ---------------------------------------------------------------------------
create table public.sharing_notices (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  cellar_flipped boolean not null,
  notes_shared boolean not null,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  constraint sharing_notices_reason check (cellar_flipped or notes_shared)
);
alter table public.sharing_notices enable row level security;
revoke all on public.sharing_notices from public, anon, authenticated;
grant select on public.sharing_notices to authenticated;
grant update (dismissed_at) on public.sharing_notices to authenticated;
create policy "sharing notices read own" on public.sharing_notices for select to authenticated
  using (user_id = auth.uid());
create policy "sharing notices dismiss own" on public.sharing_notices for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- An account deletion drops the notice (the profiles_deleted_drop_favourites
-- precedent).
create function public.drop_deleted_profile_sharing_notice()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from sharing_notices where user_id = new.id;
  return null;
end $$;
revoke all on function public.drop_deleted_profile_sharing_notice() from public, anon, authenticated, service_role;
create trigger profiles_deleted_drop_sharing_notice
  after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.drop_deleted_profile_sharing_notice();

-- ---------------------------------------------------------------------------
-- Post-state: every check in the same transaction; any failure rolls it all back.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_fn record;
  v_n int;
begin
  -- 1. The read policy's new text (whitespace and any public. prefix
  --    normalised); the three write policies byte-identical to before.
  select regexp_replace(regexp_replace(format('%s %s %s', p.polcmd, p.polroles::regrole[]::text,
                                              pg_get_expr(p.polqual, p.polrelid)),
                                       '\s+', ' ', 'g'), '\mpublic\.', '', 'g')
    into v_text
  from pg_policy p
  where p.polrelid = 'public.wset_notes'::regclass and p.polname = 'wset notes read' and p.polwithcheck is null;
  if v_text is distinct from
       'r {authenticated} ((author_id = auth.uid()) OR ((catalog_wine_id IS NOT NULL) AND can_view_notes(author_id) '
       || 'AND (NOT wset_note_held(id)) AND (EXISTS ( SELECT 1 FROM catalog_wines cw '
       || 'WHERE (cw.id = wset_notes.catalog_wine_id)))))' then
    raise exception '"wset notes read" is not spec §4.3''s policy: %', v_text;
  end if;
  select md5(string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd,
                               case when p.polpermissive then 'permissive' else 'restrictive' end,
                               p.polroles::regrole[]::text,
                               coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                               coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                        E'\n' order by p.polname::text collate "C"))
    into v_text
  from pg_policy p
  where p.polrelid = 'public.wset_notes'::regclass and p.polname <> 'wset notes read';
  if v_text is distinct from '1a032311d06ac6939ff04ca5977a61d6' then
    raise exception 'the wset_notes insert/update/delete policies changed (md5 %)', v_text;
  end if;
  if (select count(*) from pg_policy p where p.polrelid = 'public.wset_notes'::regclass) <> 4 then
    raise exception 'wset_notes does not have exactly four policies';
  end if;

  -- 2. Triggers: the four from before plus the hold and the guard; the
  --    release on wines; the notice drop on profiles.
  if (select string_agg(t.tgname::text, ',' order by t.tgname::text collate "C")
        from pg_trigger t where t.tgrelid = 'public.wset_notes'::regclass and not t.tgisinternal)
     is distinct from
       'wset_notes_glass_move_guard,wset_notes_glass_resolve_on_write,wset_notes_hold_on_identity,'
       || 'wset_notes_hue_matches_colour,wset_notes_rule1_guard,wset_notes_set_updated_at' then
    raise exception 'wset_notes triggers are not the four live ones plus the hold and the guard';
  end if;
  select string_agg(regexp_replace(pg_get_triggerdef(t.oid), '\mpublic\.', '', 'g'), ' | '
                    order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where not t.tgisinternal
    and t.tgname in ('wset_notes_hold_on_identity', 'wset_notes_rule1_guard', 'wines_release_note_holds',
                     'profiles_deleted_drop_sharing_notice');
  if v_text is distinct from
       'CREATE TRIGGER profiles_deleted_drop_sharing_notice AFTER UPDATE OF deleted_at ON profiles FOR EACH ROW '
       || 'WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION drop_deleted_profile_sharing_notice()'
       || ' | CREATE TRIGGER wines_release_note_holds AFTER UPDATE OF is_revealed ON wines FOR EACH ROW '
       || 'WHEN ((new.is_revealed AND (NOT old.is_revealed))) EXECUTE FUNCTION wines_release_note_holds()'
       || ' | CREATE TRIGGER wset_notes_hold_on_identity AFTER INSERT OR UPDATE OF catalog_wine_id ON wset_notes '
       || 'FOR EACH ROW EXECUTE FUNCTION wset_notes_hold_on_identity()'
       || ' | CREATE TRIGGER wset_notes_rule1_guard BEFORE DELETE OR UPDATE ON wset_notes '
       || 'FOR EACH ROW EXECUTE FUNCTION wset_notes_rule1_guard()' then
    raise exception 'the new triggers differ from spec §3.1 step 4: %', v_text;
  end if;

  -- 3. profiles: notes_visibility not null default PUBLIC everywhere; the
  --    eleven-column grant; the cellar untouched (M1 flips nothing).
  if (select format('%s %s %s', c.udt_name, c.is_nullable, c.column_default)
        from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'profiles' and c.column_name = 'notes_visibility')
     is distinct from 'cellar_visibility NO ''PUBLIC''::cellar_visibility' then
    raise exception 'profiles.notes_visibility is not cellar_visibility not null default PUBLIC';
  end if;
  if exists (select 1 from public.profiles where notes_visibility <> 'PUBLIC') then
    raise exception 'a profile does not start with notes_visibility PUBLIC';
  end if;
  select string_agg(format('%s:%s', a.attname, x.privilege_type), ','
                    order by a.attname::text collate "C", x.privilege_type collate "C")
    into v_text
  from pg_attribute a, aclexplode(a.attacl) x
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    and x.grantee = 'authenticated'::regrole;
  if v_text is distinct from
       'avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE,'
       || 'last_seen_at:UPDATE,location:UPDATE,notes_visibility:UPDATE,phone:UPDATE,preferred_currency:UPDATE,'
       || 'tour_seen_at:UPDATE' then
    raise exception 'the profiles client UPDATE grant is not the eleven columns: %', v_text;
  end if;
  if has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     or has_column_privilege('anon', 'public.profiles', 'notes_visibility', 'UPDATE') then
    raise exception 'the profiles UPDATE grant widened past the eleven authenticated columns';
  end if;
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility')
     is distinct from '''PRIVATE''::cellar_visibility' then
    raise exception 'M1 must not change the cellar default';
  end if;
  if exists (
    (select p.cellar_visibility::text, (p.deleted_at is not null), count(*)::int from public.profiles p group by 1, 2)
    except
    (select visibility, deleted, n from _sd_profiles_before)
  ) or exists (
    (select visibility, deleted, n from _sd_profiles_before)
    except
    (select p.cellar_visibility::text, (p.deleted_at is not null), count(*)::int from public.profiles p group by 1, 2)
  ) then
    raise exception 'M1 changed a cellar setting';
  end if;
  if (select count(*)::int from public.wset_notes) <> (select n from _sd_notes_before) then
    raise exception 'M1 changed the number of notes';
  end if;

  -- 4. wset_note_holds: RLS on, no policy, no client privilege; exactly the
  --    back-fill computed before anything changed.
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.wset_note_holds'::regclass and c.relrowsecurity and not c.relforcerowsecurity)
     or exists (select 1 from pg_policy p where p.polrelid = 'public.wset_note_holds'::regclass)
     or exists (select 1 from pg_class c, aclexplode(c.relacl) a
                where c.oid = 'public.wset_note_holds'::regclass
                  and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole))) then
    raise exception 'wset_note_holds is not internal (RLS on, no policy, no PUBLIC/anon/authenticated privilege)';
  end if;
  if exists ((select note_id, wine_id from public.wset_note_holds) except (select note_id, wine_id from _sd_backfill))
     or exists ((select note_id, wine_id from _sd_backfill) except (select note_id, wine_id from public.wset_note_holds)) then
    raise exception 'the hold back-fill differs from the notes whose author adds an unrevealed glass of their wine';
  end if;

  -- 5. sharing_notices: its columns, RLS and two own-row policies,
  --    authenticated SELECT + UPDATE(dismissed_at) only, anon nothing, empty.
  select string_agg(format('%s %s%s%s', a.attname, t.typname,
                           case when a.attnotnull then ' not null' else '' end,
                           case when d.adbin is null then ''
                                else ' default ' || pg_get_expr(d.adbin, d.adrelid) end),
                    ', ' order by a.attnum)
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.sharing_notices'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'user_id uuid not null, cellar_flipped bool not null, notes_shared bool not null, '
       || 'created_at timestamptz not null default now(), dismissed_at timestamptz' then
    raise exception 'sharing_notices columns differ from spec §3.1 step 11: %', v_text;
  end if;
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.sharing_notices'::regclass;
  if v_text is distinct from
       'sharing_notices_pkey PRIMARY KEY (user_id); '
       || 'sharing_notices_reason CHECK ((cellar_flipped OR notes_shared)); '
       || 'sharing_notices_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE' then
    raise exception 'sharing_notices constraints differ from spec §3.1 step 11: %', v_text;
  end if;
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.sharing_notices'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'sharing_notices row level security is not enabled, or is forced';
  end if;
  select string_agg(format('%s %s %s %s %s', p.polname, p.polcmd, p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.sharing_notices'::regclass;
  if v_text is distinct from
       'sharing notices dismiss own w {authenticated} (user_id = auth.uid()) (user_id = auth.uid()); '
       || 'sharing notices read own r {authenticated} (user_id = auth.uid()) -' then
    raise exception 'sharing_notices policies differ from spec §3.1 step 11: %', v_text;
  end if;
  select string_agg(a.privilege_type, ',' order by a.privilege_type collate "C") into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = 'public.sharing_notices'::regclass and a.grantee = 'authenticated'::regrole;
  if v_text is distinct from 'SELECT' then
    raise exception 'authenticated table privileges on sharing_notices are %, expected SELECT only', coalesce(v_text, '-');
  end if;
  select string_agg(format('%s:%s:%s', a.attname, pg_get_userbyid(x.grantee), x.privilege_type), ','
                    order by a.attname::text collate "C")
    into v_text
  from pg_attribute a, aclexplode(a.attacl) x
  where a.attrelid = 'public.sharing_notices'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from 'dismissed_at:authenticated:UPDATE' then
    raise exception 'sharing_notices column grants are %, expected dismissed_at:authenticated:UPDATE', coalesce(v_text, '-');
  end if;
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
             where c.oid = 'public.sharing_notices'::regclass and (a.grantee = 0 or a.grantee = 'anon'::regrole)) then
    raise exception 'anon or PUBLIC holds a privilege on sharing_notices';
  end if;
  if exists (select 1 from public.sharing_notices) then
    raise exception 'sharing_notices must start empty (M2 fills it)';
  end if;

  -- 6. The three indexes.
  select string_agg(regexp_replace(i.indexdef, '\mpublic\.', '', 'g'), ' | ' order by i.indexname collate "C")
    into v_text
  from pg_indexes i
  where i.schemaname = 'public'
    and i.indexname in ('cellar_consumptions_wset_note_idx', 'wset_notes_author_tasted_idx', 'wset_notes_catalog_wine_idx');
  if v_text is distinct from
       'CREATE INDEX cellar_consumptions_wset_note_idx ON cellar_consumptions USING btree (wset_note_id) WHERE (wset_note_id IS NOT NULL)'
       || ' | CREATE INDEX wset_notes_author_tasted_idx ON wset_notes USING btree (author_id, tasted_on DESC, created_at DESC)'
       || ' | CREATE INDEX wset_notes_catalog_wine_idx ON wset_notes USING btree (catalog_wine_id, tasted_on DESC) WHERE (catalog_wine_id IS NOT NULL)' then
    raise exception 'the new indexes differ from spec §3.1 step 5: %', v_text;
  end if;

  -- 7. Every function this file creates or recreates, and the one it
  --    switches: security, search_path, volatility, language, return type,
  --    arguments, body md5 and who holds EXECUTE ("OWNER" is the owner).
  for v_fn in
    select s.sig, s.definer, s.volatile, s.lang, s.rettype, s.retset, s.args, s.body_md5, s.grantees,
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
      ('public.catalog_wine_unrevealed_glasses_of(uuid,uuid)', true, 's', 'sql', 'uuid', true,
       'p_catalog_wine_id uuid, p_user uuid', '91748b399ca7bbb3de7f752e6c47c3d9', 'OWNER'),
      ('public.can_view_notes(uuid)', true, 's', 'sql', 'boolean', false,
       'p_author uuid', '3fe471b0d155ff618afd5e4f559044d6', 'OWNER,authenticated,service_role'),
      ('public.wset_note_held(uuid)', true, 's', 'sql', 'boolean', false,
       'p_note_id uuid', '9599a36cd224a3af0d5c2fb3dea70b2b', 'OWNER,authenticated'),
      ('public.wset_my_held_notes(uuid[])', true, 's', 'sql', 'uuid', true,
       'p_note_ids uuid[]', '3a08cb7faf015f9b2f592d60d6a5bafb', 'OWNER,authenticated'),
      ('public.wset_notes_hold_on_identity()', true, 'v', 'plpgsql', 'trigger', false,
       '', '8b500cd6a6f62204c02c66c4760793fc', 'OWNER'),
      ('public.wines_release_note_holds()', true, 'v', 'plpgsql', 'trigger', false,
       '', '419a9f4dda4fac12a601207ea3f3b45a', 'OWNER'),
      ('public.wset_notes_rule1_guard()', true, 'v', 'plpgsql', 'trigger', false,
       '', '770e9c571942c4a9e6bd337fc0dbf200', 'OWNER'),
      ('public.drop_deleted_profile_sharing_notice()', true, 'v', 'plpgsql', 'trigger', false,
       '', '656d8d4d8f86f71b61a0238f1cf59636', 'OWNER'),
      ('public.catalog_wine_usage(uuid)', true, 's', 'sql', 'record', true,
       'p_id uuid', '79615b604369fe584ba39bf9ef6f4dd8', 'OWNER,authenticated,service_role'),
      ('public.shared_cellar_lots(uuid)', true, 's', 'sql', 'cellar_lots', true,
       'p_owner uuid', '1091a585637cbc6235a220a52b12cb99', 'OWNER,authenticated,service_role'),
      ('public.catalog_wine_structure(uuid)', false, 's', 'sql', 'record', true,
       'p_catalog_wine_id uuid', 'e5111f04dc3c14e5d62a82072e70b6be', 'OWNER,anon,authenticated,service_role')
    ) as s (sig, definer, volatile, lang, rettype, retset, args, body_md5, grantees)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% does not exist post-migration', v_fn.sig;
    end if;
    if v_fn.prosecdef is distinct from v_fn.definer
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

  -- 8. What this file calls or mirrors without changing it.
  select string_agg(s.sig, ', ') into v_text
  from (values
    ('public.can_view_cellar(uuid)',                          '3af2e51e338dc43cc48b58f061049ec2'),
    ('public.catalog_wine_masked_pours(uuid[])',              'fea91b152e3565f16c56cc1d15810d29'),
    ('public.catalog_wine_in_callers_unrevealed_glass(uuid)', 'f33fbd7f4e283cb0ed682469aa6ea2c2'),
    ('public.save_wset_note(jsonb,jsonb)',                    '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.record_training_attempt(jsonb,jsonb,jsonb)',     'f6a24c83c24aaab34ab568dc6280083f'),
    ('public.wset_notes_resolve_on_reveal()',                 'f406623e9d46feb1f1aa0fb8c285529d'),
    ('public.scrub_deleted_account(uuid)',                    'b9aa8d71a00dda3aec526a2ec6950f1d')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'a function this file relies on changed: %', v_text;
  end if;

  select count(*)::int into v_n from public.wset_note_holds;
  raise notice 'sharing defaults M1: % hold(s) back-filled; % notes; % profiles',
    v_n, (select n from _sd_notes_before), (select sum(n) from _sd_profiles_before);
end $$;
```

- [ ] **Step 4: Rollback runner and M1 rollback (main session only ever runs them).** Create `scripts/sharing-defaults/run-sql.mjs`:

```js
// Runs one sharing-defaults rollback file against the LIVE database in a
// single transaction (spec docs/superpowers/specs/2026-09-27-sharing-defaults-design.md
// §10.3). Unlike the migration applier it writes no schema_migrations row:
// each rollback file deletes the history row of the migration it undoes.
// Main session only, with the owner's go-ahead; always --dry first.
//
//   node --env-file=.env.local scripts/sharing-defaults/run-sql.mjs scripts/sharing-defaults/rollback-m2.sql --dry
//   node --env-file=.env.local scripts/sharing-defaults/run-sql.mjs scripts/sharing-defaults/rollback-m2.sql
//
// --dry runs the whole file inside BEGIN ... ROLLBACK: every statement and
// every same-transaction assert executes, nothing is kept.
import { readFileSync } from "node:fs";
import pg from "pg";

const [, , file, flag] = process.argv;
if (!file || (flag !== undefined && flag !== "--dry")) {
  console.error("usage: run-sql.mjs <file.sql> [--dry]");
  process.exit(2);
}
if (!/^scripts\/sharing-defaults\/rollback-m[12]\.sql$/.test(file.replace(/\\/g, "/"))) {
  console.error("run-sql.mjs only runs scripts/sharing-defaults/rollback-m1.sql or rollback-m2.sql");
  process.exit(2);
}
const dry = flag === "--dry";
const sql = readFileSync(file, "utf8");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.on("notice", (n) => console.log("NOTICE:", n.message));
await client.connect();
try {
  await client.query("begin");
  const t0 = Date.now();
  await client.query(sql);
  if (dry) {
    await client.query("rollback");
    console.log(`DRY RUN OK: ${file} ran in ${Date.now() - t0} ms and was rolled back`);
  } else {
    await client.query("commit");
    console.log(`APPLIED: ${file} in ${Date.now() - t0} ms`);
  }
} catch (e) {
  try {
    await client.query("rollback");
  } catch {
    // the connection is gone; nothing was committed
  }
  console.error("FAILED (rolled back):", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
```

Create `scripts/sharing-defaults/rollback-m1.sql` (its two function bodies are the live ones byte for byte, md5 `8544e9af…` and `c3da48f2…`):

```sql
-- Undo M1 (20260927140000_sharing_defaults): spec §10.3. NEVER under
-- supabase/migrations. Run with scripts/sharing-defaults/run-sql.mjs,
-- --dry first, and only AFTER the app is reverted to a build that does not
-- read notes_visibility, sharing_notices or wset_my_held_notes, and after
-- rollback-m2.sql (or before M2 was ever applied). People's notes settings
-- are lost. The three indexes stay (harmless). Removes M1's history row.

set local lock_timeout = '10s';

do $$
begin
  if to_regclass('public.sharing_notices') is null then
    raise exception 'M1 is not applied';
  end if;
  if exists (select 1 from public.sharing_notices)
     or (select column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility')
        is distinct from '''PRIVATE''::cellar_visibility' then
    raise exception 'M2 is still applied: run rollback-m2.sql first';
  end if;
end $$;

-- 1. The notice table and its deletion trigger.
drop trigger profiles_deleted_drop_sharing_notice on public.profiles;
drop function public.drop_deleted_profile_sharing_notice();
drop table public.sharing_notices;

-- 2. The read policy, exactly as it was.
drop policy "wset notes read" on public.wset_notes;
create policy "wset notes read" on public.wset_notes for select to authenticated
  using ((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) or (author_id = auth.uid()));

-- 3. The hold, release and guard triggers.
drop trigger wset_notes_rule1_guard on public.wset_notes;
drop trigger wset_notes_hold_on_identity on public.wset_notes;
drop trigger wines_release_note_holds on public.wines;
drop function public.wset_notes_rule1_guard();
drop function public.wset_notes_hold_on_identity();
drop function public.wines_release_note_holds();

-- 4. The recreated bodies, back to the pinned live ones (md5 8544e9af...,
--    c3da48f2...); structure back to SECURITY DEFINER.
create or replace function public.catalog_wine_usage(p_id uuid)
returns table(holders integer, bottles integer, lot_count integer, note_count integer,
              appearance_count integer, consumption_count integer)
language sql stable security definer set search_path = public as $$
  with masked as (
    select m.consumption_id, m.lot_id, m.quantity from catalog_wine_masked_pours(array[p_id]) m
  ),
  counted as (
    select l.owner_id,
           l.quantity + coalesce((select sum(m.quantity) from masked m where m.lot_id = l.id), 0) as quantity
      from cellar_lots l
     where l.catalog_wine_id = p_id
  )
  select
    (select count(distinct owner_id)::int from counted where quantity > 0),
    (select coalesce(sum(quantity), 0)::int from counted where quantity > 0),
    (select count(*)::int from cellar_lots where catalog_wine_id = p_id),
    (select count(*)::int from wset_notes where catalog_wine_id = p_id),
    (select count(*)::int from wine_answers wa join wines w on w.id = wa.wine_id
      where wa.catalog_wine_id = p_id and w.is_revealed),
    (select count(*)::int from cellar_consumptions c
      where c.catalog_wine_id = p_id
        and not exists (select 1 from masked m where m.consumption_id = c.id));
$$;

create or replace function public.shared_cellar_lots(p_owner uuid)
returns setof public.cellar_lots
language sql stable security definer set search_path = public as $$
  with lots as (
    select l.*
      from cellar_lots l
     where l.owner_id = p_owner
       and (p_owner = auth.uid() or can_view_cellar(p_owner))
  ),
  masked as (
    select m.lot_id, sum(m.quantity)::int as quantity
      from catalog_wine_masked_pours(array(select distinct lots.catalog_wine_id from lots)) m
     group by m.lot_id
  )
  select (jsonb_populate_record(null::cellar_lots,
            to_jsonb(lots) || jsonb_build_object(
              'quantity', lots.quantity + coalesce(masked.quantity, 0),
              'updated_at', lots.created_at))).*
    from lots
    left join masked on masked.lot_id = lots.id;
$$;

alter function public.catalog_wine_structure(uuid) security definer;

-- 5. The helpers and the hold table.
drop function public.wset_my_held_notes(uuid[]);
drop function public.wset_note_held(uuid);
drop function public.can_view_notes(uuid);
drop function public.catalog_wine_unrevealed_glasses_of(uuid, uuid);
drop table public.wset_note_holds;

-- 6. The notes setting.
revoke update (notes_visibility) on public.profiles from authenticated;
alter table public.profiles drop column notes_visibility;

delete from supabase_migrations.schema_migrations where version = '20260927140000';

do $$
begin
  if (select format('%s %s', p.polroles::regrole[]::text, pg_get_expr(p.polqual, p.polrelid))
        from pg_policy p where p.polrelid = 'public.wset_notes'::regclass and p.polname = 'wset notes read')
     is distinct from '{authenticated} ((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR (author_id = auth.uid()))' then
    raise exception '"wset notes read" is not the pre-M1 policy';
  end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.catalog_wine_usage(uuid)'::regprocedure)
       is distinct from '8544e9afe31d30c26d516e68b19fca23'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.shared_cellar_lots(uuid)'::regprocedure)
       is distinct from 'c3da48f21c077f0a349e5d88e55b0ff7'
     or not (select prosecdef from pg_proc where oid = 'public.catalog_wine_structure(uuid)'::regprocedure) then
    raise exception 'a recreated function is not back to its pre-M1 body or security';
  end if;
  if (select string_agg(t.tgname::text, ',' order by t.tgname::text collate "C")
        from pg_trigger t where t.tgrelid = 'public.wset_notes'::regclass and not t.tgisinternal)
     is distinct from
       'wset_notes_glass_move_guard,wset_notes_glass_resolve_on_write,wset_notes_hue_matches_colour,wset_notes_set_updated_at' then
    raise exception 'wset_notes triggers are not the four pre-M1 ones';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'notes_visibility')
     or to_regclass('public.wset_note_holds') is not null
     or to_regprocedure('public.can_view_notes(uuid)') is not null then
    raise exception 'an M1 object is still present';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260927140000') then
    raise exception 'M1''s history row is still recorded';
  end if;
  raise notice 'rollback M1: done';
end $$;
```

- [ ] **Step 5: `database.types.ts`, targeted insertions only** (they rebase cleanly past `training-region-guess`, which edits `training_attempts` and `record_training_attempt`'s comment). Apply exactly:

```diff
--- a/src/lib/supabase/database.types.ts
+++ b/src/lib/supabase/database.types.ts
@@ -29,6 +29,10 @@ export type WineLeaderboardReveal = "PER_ATTRIBUTE" | "PER_WINE";
 export type VintageKind = "YEAR" | "NV" | "TAWNY";
 export type CellarConsumptionReason = "DRANK" | "GIFTED" | "LOST" | "OTHER";
 export type CellarVisibility = "PRIVATE" | "FRIENDS" | "PUBLIC";
+// Sharing defaults (20260927140000): the cellar and the notes settings share
+// one enum and one vocabulary — Everyone / Friends / Only me
+// (src/lib/sharing/visibility.ts).
+export type SharingAudience = CellarVisibility;
 export type GrapeColor = "RED" | "WHITE";
 export type WinePlaceKind =
   | "COUNTRY"
@@ -342,6 +346,10 @@ export type Database = {
           role: UserRole;
           preferred_currency: string;
           cellar_visibility: CellarVisibility;
+          // Sharing defaults (20260927140000, spec 2026-09-27 S5): who may read
+          // this person's tasting notes; default PUBLIC; in the client UPDATE
+          // grant. can_view_notes applies it with can_view_cellar's friend rule.
+          notes_visibility: CellarVisibility;
           last_seen_at: string | null;
           // First-run tour (20260925010000, spec 2026-09-25 D1): null = show
           // the tour. Stamped by markTourSeen, cleared by resetTour
@@ -367,6 +375,7 @@ export type Database = {
           role?: UserRole;
           preferred_currency?: string;
           cellar_visibility?: CellarVisibility;
+          notes_visibility?: CellarVisibility;
           last_seen_at?: string | null;
           tour_seen_at?: string | null;
           created_at?: string;
@@ -384,6 +393,7 @@ export type Database = {
           role: UserRole;
           preferred_currency: string;
           cellar_visibility: CellarVisibility;
+          notes_visibility: CellarVisibility;
           last_seen_at: string | null;
           tour_seen_at: string | null;
           created_at: string;
@@ -428,6 +438,30 @@ export type Database = {
         Update: Partial<Database["public"]["Tables"]["friend_requests"]["Insert"]>;
         Relationships: [];
       };
+      // 20260927140000 (sharing-defaults spec §3.1 step 11, S14, S15): the
+      // one-time "your cellar and notes are now visible" notice, one row per
+      // person M2 (20260927150000) flipped or whose notes became visible.
+      // Owner-only: SELECT own row; the one client write is an UPDATE of
+      // dismissed_at on it (dismissSharingNotice). No client INSERT or
+      // DELETE; an account deletion drops the row.
+      sharing_notices: {
+        Row: {
+          user_id: string;
+          cellar_flipped: boolean;
+          notes_shared: boolean;
+          created_at: string;
+          dismissed_at: string | null;
+        };
+        Insert: {
+          user_id: string;
+          cellar_flipped: boolean;
+          notes_shared: boolean;
+          created_at?: string;
+          dismissed_at?: string | null;
+        };
+        Update: { dismissed_at?: string | null };
+        Relationships: [];
+      };
       // 20260919141700 (profile-favourites spec §3, D2-D4): a person's
       // favourite regions and producers, position 1..10 in the order they
       // chose (at most 10 per table, enforced by the position range + a
@@ -2043,6 +2077,21 @@ export type Database = {
         Args: { p_owner: string };
         Returns: boolean;
       };
+      // 20260927140000 (sharing-defaults spec S7): may the caller read
+      // p_author's notes — notes_visibility with can_view_cellar's friend
+      // rule, never a deleted author's. The "wset notes read" policy calls it;
+      // the author's own clause is the policy's, not this function's.
+      can_view_notes: {
+        Args: { p_author: string };
+        Returns: boolean;
+      };
+      // 20260927140000 (spec S19): which of these note ids are the caller's
+      // own notes that others cannot read yet (a Rule 1 hold or a masked
+      // pour link). Only ever returns the caller's own ids.
+      wset_my_held_notes: {
+        Args: { p_note_ids: string[] };
+        Returns: string[];
+      };
       // 20260919223100 (spec 2026-09-19-rule1-older-leaks D10): someone's cellar
       // as another person may see it — the owner, or can_view_cellar. A bottle
       // poured into a glass that is not revealed yet still counts in its lot, and
```

- [ ] **Step 6: The §9.3 suite updates.** `tour-seen` expects eleven columns and gains the APPLY hook:

```diff
--- a/scripts/tour-seen.test.mjs
+++ b/scripts/tour-seen.test.mjs
@@ -1,15 +1,26 @@
 // First-run tour DB suite (spec docs/superpowers/specs/2026-09-25-first-run-tour-design.md
 // D1, §3): profiles.tour_seen_at is written by the signed-in person through the
-// ten-column client UPDATE grant and "profiles update own" — never on someone
+// client UPDATE grant (eleven columns since 20260927140000 added
+// notes_visibility) and "profiles update own" — never on someone
 // else's row, never by anon — and the grant did not widen past it. Every test
 // runs inside a transaction that is rolled back. Passes only once
 // 20260925010000_tour_seen is live; before that four tests fail (the column
 // does not exist, the grant is still nine columns) and one passes.
 import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
 import test, { after, before } from "node:test";
 import pg from "pg";
 import { pgConfig } from "./wine-map-tiles/lib.mjs";
 
+// Dry run before the sharing-defaults migrations are live:
+// SHARING_DEFAULTS_APPLY lists them (comma-separated); each test applies
+// every file but M2 (20260927150000, the cellar flip) inside its own
+// rolled-back transaction first.
+const APPLY = (process.env.SHARING_DEFAULTS_APPLY ?? "")
+  .split(",")
+  .map((f) => f.trim())
+  .filter((f) => f && !f.endsWith("20260927150000_sharing_defaults_flip.sql"));
+
 const client = new pg.Client(pgConfig());
 before(async () => {
   await client.connect();
@@ -21,6 +32,7 @@ after(async () => {
 async function withRollback(cb) {
   await client.query("begin");
   try {
+    for (const file of APPLY) await client.query(readFileSync(file, "utf8"));
     return await cb();
   } finally {
     await client.query("rollback");
@@ -93,18 +105,21 @@ test("anon cannot write tour_seen_at", async () => {
   });
 });
 
-test("the client UPDATE grant is exactly the ten columns", async () => {
-  const r = await client.query(
-    `select string_agg(format('%s:%s', a.attname, x.privilege_type), ','
-              order by a.attname::text collate "C", x.privilege_type collate "C") as acl
-       from pg_attribute a, aclexplode(a.attacl) x
-      where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped`,
-  );
-  assert.equal(
-    r.rows[0].acl,
-    "avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE," +
-      "last_seen_at:UPDATE,location:UPDATE,phone:UPDATE,preferred_currency:UPDATE,tour_seen_at:UPDATE",
-  );
+test("the client UPDATE grant is exactly the eleven columns", async () => {
+  await withRollback(async () => {
+    const r = await client.query(
+      `select string_agg(format('%s:%s', a.attname, x.privilege_type), ','
+                order by a.attname::text collate "C", x.privilege_type collate "C") as acl
+         from pg_attribute a, aclexplode(a.attacl) x
+        where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped`,
+    );
+    assert.equal(
+      r.rows[0].acl,
+      "avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE," +
+        "last_seen_at:UPDATE,location:UPDATE,notes_visibility:UPDATE,phone:UPDATE,preferred_currency:UPDATE," +
+        "tour_seen_at:UPDATE",
+    );
+  });
 });
 
 test("the grant did not widen: role and deleted_at stay unwritable", async () => {
```

`catalog-wine-structure` authors with throwaway profiles made inside the transaction, and its comment stops saying SECURITY DEFINER:

```diff
--- a/scripts/catalog-wine-structure.test.mjs
+++ b/scripts/catalog-wine-structure.test.mjs
@@ -1,20 +1,34 @@
 // catalog_wine_structure RPC — migration 20260829251000.
 //
-// Averages the ordinal SAT fields across ALL notes for a catalog wine (any
-// author), mapping each enum value to its 1-based position. Proves: the
-// average index is correct, max_index reflects the enum size, no-data
-// dimensions are omitted, and a SECURITY DEFINER call aggregates across
-// authors (past per-author RLS) for an authenticated caller.
+// Averages the ordinal SAT fields over the notes for a catalog wine the
+// caller may read, mapping each enum value to its 1-based position. Proves:
+// the average index is correct, max_index reflects the enum size, no-data
+// dimensions are omitted, and it aggregates across authors who share their
+// notes. SECURITY INVOKER since 20260927140000 (sharing defaults S9): an
+// Only-me or held note leaves others' averages — scripts/sharing-defaults.test.mjs
+// pins that. The authors here are throwaway profiles made inside the
+// rolled-back transaction, so no real person's setting decides a result.
 import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
 import test, { after, before } from "node:test";
 import pg from "pg";
 import { pgConfig } from "./wine-map-tiles/lib.mjs";
 
+// Dry run before the sharing-defaults migrations are live:
+// SHARING_DEFAULTS_APPLY lists them (comma-separated); each test applies
+// every file but M2 (20260927150000, the cellar flip) inside its own
+// rolled-back transaction first.
+const APPLY = (process.env.SHARING_DEFAULTS_APPLY ?? "")
+  .split(",")
+  .map((f) => f.trim())
+  .filter((f) => f && !f.endsWith("20260927150000_sharing_defaults_flip.sql"));
+
 const client = new pg.Client(pgConfig());
 
 async function withRollback(callback) {
   await client.query("begin");
   try {
+    for (const file of APPLY) await client.query(readFileSync(file, "utf8"));
     return await callback();
   } finally {
     await client.query("rollback");
@@ -48,10 +62,20 @@ async function referenceIds() {
   return ids;
 }
 
+// Two throwaway authors inside the current transaction (owner role): a
+// real person's notes setting or deletion must never decide a result.
 async function profilePair() {
-  const r = await client.query("select id from profiles order by id limit 2");
-  assert.equal(r.rowCount, 2, "need at least two profiles");
-  return [r.rows[0].id, r.rows[1].id];
+  const ids = [];
+  for (const name of ["Structure test A", "Structure test B"]) {
+    const r = await client.query(
+      `insert into profiles (id, display_name, email)
+       values (gen_random_uuid(), $1, 'structure-test+' || gen_random_uuid()::text || '@blindr.invalid')
+       returning id`,
+      [name],
+    );
+    ids.push(r.rows[0].id);
+  }
+  return ids;
 }
 
 const CATALOG_INSERT = `
@@ -77,11 +101,11 @@ after(async () => {
 
 test("averages ordinal SAT levels across authors; omits no-data dimensions", async () => {
   const ids = await referenceIds();
-  const [authorA, authorB] = await profilePair();
   await withRollback(async () => {
+    const [authorA, authorB] = await profilePair();
     const wineId = await insertCatalog(ids);
-    // Seeded as the pooled owner (bypasses RLS). Two authors, so a correct
-    // aggregate must see both notes via SECURITY DEFINER.
+    // Seeded as the pooled owner (bypasses RLS). Two authors, both sharing
+    // with everyone (the default), so the aggregate sees both notes.
     // acidity MEDIUM(3)+HIGH(5) -> 4; body MEDIUM(3)+FULL(5) -> 4;
     // finish SHORT(1)+LONG(5) -> 3; sweetness left null -> omitted.
     await client.query(
```

`wset-notes`: the one cross-author read uses a throwaway author:

```diff
--- a/scripts/wset-notes.test.mjs
+++ b/scripts/wset-notes.test.mjs
@@ -4,15 +4,26 @@
 // probes (the pooled role owns the tables, so RLS only bites after
 // `set local role authenticated` inside a rolled-back transaction).
 import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
 import test, { after, before } from "node:test";
 import pg from "pg";
 import { pgConfig } from "./wine-map-tiles/lib.mjs";
 
+// Dry run before the sharing-defaults migrations are live:
+// SHARING_DEFAULTS_APPLY lists them (comma-separated); each test applies
+// every file but M2 (20260927150000, the cellar flip) inside its own
+// rolled-back transaction first.
+const APPLY = (process.env.SHARING_DEFAULTS_APPLY ?? "")
+  .split(",")
+  .map((f) => f.trim())
+  .filter((f) => f && !f.endsWith("20260927150000_sharing_defaults_flip.sql"));
+
 const client = new pg.Client(pgConfig());
 
 async function withRollback(callback) {
   await client.query("begin");
   try {
+    for (const file of APPLY) await client.query(readFileSync(file, "utf8"));
     return await callback();
   } finally {
     await client.query("rollback");
@@ -205,10 +216,20 @@ test("insert with another profile's author_id is rejected by RLS", async () => {
   });
 });
 
-test("another author's note is visible under authenticated (public read)", async () => {
+test("another author's note is visible to a signed-in reader while its author shares with everyone", async () => {
   const ids = await referenceIds();
-  const [selfId, otherId] = await profilePair();
+  const [selfId] = await profilePair();
   await withRollback(async () => {
+    // A throwaway author: notes_visibility defaults to PUBLIC, and no real
+    // person's setting (sharing defaults, 20260927140000) decides the result.
+    const otherId = (
+      await client.query(
+        `insert into profiles (id, display_name, email)
+         values (gen_random_uuid(), 'wset-notes test author',
+                 'wset-notes-test+' || gen_random_uuid()::text || '@blindr.invalid')
+         returning id`,
+      )
+    ).rows[0].id;
     const catalogWineId = await insertCatalog(ids);
     // Seeded as the pooled owner role, which bypasses RLS.
     const note = await client.query(
```

`catalog-manage` and `cellar-social`: the APPLY hook only:

```diff
--- a/scripts/catalog-manage.test.mjs
+++ b/scripts/catalog-manage.test.mjs
@@ -3,15 +3,26 @@
 // withRollback for probes, `set local role authenticated` + a JWT sub so
 // auth.uid() resolves inside the SECURITY DEFINER functions.
 import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
 import test, { after, before } from "node:test";
 import pg from "pg";
 import { pgConfig } from "./wine-map-tiles/lib.mjs";
 
+// Dry run before the sharing-defaults migrations are live:
+// SHARING_DEFAULTS_APPLY lists them (comma-separated); each test applies
+// every file but M2 (20260927150000, the cellar flip) inside its own
+// rolled-back transaction first.
+const APPLY = (process.env.SHARING_DEFAULTS_APPLY ?? "")
+  .split(",")
+  .map((f) => f.trim())
+  .filter((f) => f && !f.endsWith("20260927150000_sharing_defaults_flip.sql"));
+
 const client = new pg.Client(pgConfig());
 
 async function withRollback(cb) {
   await client.query("begin");
   try {
+    for (const file of APPLY) await client.query(readFileSync(file, "utf8"));
     return await cb();
   } finally {
     await client.query("rollback");
```

```diff
--- a/scripts/cellar-social.test.mjs
+++ b/scripts/cellar-social.test.mjs
@@ -5,10 +5,20 @@
 // still counts in its lot (spec 2026-09-19-rule1-older-leaks D10, D11). Passes
 // only once 20260919223200 is live.
 import assert from "node:assert/strict";
+import { readFileSync } from "node:fs";
 import test, { after, before } from "node:test";
 import pg from "pg";
 import { pgConfig } from "./wine-map-tiles/lib.mjs";
 
+// Dry run before the sharing-defaults migrations are live:
+// SHARING_DEFAULTS_APPLY lists them (comma-separated); each test applies
+// every file but M2 (20260927150000, the cellar flip) inside its own
+// rolled-back transaction first.
+const APPLY = (process.env.SHARING_DEFAULTS_APPLY ?? "")
+  .split(",")
+  .map((f) => f.trim())
+  .filter((f) => f && !f.endsWith("20260927150000_sharing_defaults_flip.sql"));
+
 const client = new pg.Client(pgConfig());
 before(async () => {
   await client.connect();
@@ -20,6 +30,7 @@ after(async () => {
 async function withRollback(cb) {
   await client.query("begin");
   try {
+    for (const file of APPLY) await client.query(readFileSync(file, "utf8"));
     return await cb();
   } finally {
     await client.query("rollback");
```

- [ ] **Step 7: Gates.**
  - `cd /c/Users/Public/repos/blindtastingapp-training && for f in scripts/sharing-defaults.test.mjs scripts/sharing-defaults/run-sql.mjs scripts/tour-seen.test.mjs scripts/catalog-wine-structure.test.mjs scripts/wset-notes.test.mjs scripts/catalog-manage.test.mjs scripts/cellar-social.test.mjs; do node --check "$f" || echo "FAIL $f"; done` prints nothing.
  - `grep -c "^test(" scripts/sharing-defaults.test.mjs` prints `27`.
  - tsc: exit 0. Full vitest: exit 0 with **B_files / B_tests** (unchanged).
  - `cd /c/Users/Public/repos/blindtastingapp-training && npx eslint src/lib/supabase/database.types.ts scripts/sharing-defaults.test.mjs scripts/sharing-defaults/run-sql.mjs scripts/tour-seen.test.mjs scripts/catalog-wine-structure.test.mjs scripts/wset-notes.test.mjs scripts/catalog-manage.test.mjs scripts/cellar-social.test.mjs; echo "eslint exit $?"` → `eslint exit 0`.

- [ ] **Step 8: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add supabase/migrations/20260927140000_sharing_defaults.sql scripts/sharing-defaults.test.mjs scripts/sharing-defaults/run-sql.mjs scripts/sharing-defaults/rollback-m1.sql src/lib/supabase/database.types.ts scripts/tour-seen.test.mjs scripts/catalog-wine-structure.test.mjs scripts/wset-notes.test.mjs scripts/catalog-manage.test.mjs scripts/cellar-social.test.mjs && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "$(cat <<'EOF'
feat(db): sharing defaults M1 - notes setting, narrowed notes policy, Rule 1 hold and guard (not applied)

Spec 2026-09-27-sharing-defaults §3.1, §4, §5. Adds profiles.notes_visibility,
can_view_notes, the hold table and triggers, the guard, invoker structure
figures, blanked owner-only fields in shared cellars and the empty
sharing_notices table; the DB suite and the §9.3 suite updates.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: M2 migration, its DB tests and its rollback

**Files:**
- Create: `supabase/migrations/20260927150000_sharing_defaults_flip.sql`
- Create: `scripts/sharing-defaults/rollback-m2.sql`
- Modify: `scripts/sharing-defaults.test.mjs` (append three tests)

**Interfaces:**
- Consumes: Task 1's M1 objects (`sharing_notices`, `notes_visibility`, `wset_note_held`, the M1 policy text).
- Produces: M2 at exactly `supabase/migrations/20260927150000_sharing_defaults_flip.sql` — Task 3's `shared-notes-view.test.ts` reads its `_sd_noted` block (`num_nonnulls(n.clarity, … n.readiness) > 0`, `n.taster_notes ~ '\S'`, the aroma `exists`, `not public.wset_note_held(n.id)`, `n.catalog_wine_id is not null`); keep those lines verbatim.

- [ ] **Step 1: Append the M2 tests to `scripts/sharing-defaults.test.mjs`** (at the end of the file). They skip unless `SHARING_DEFAULTS_APPLY` lists M2 (the "new account" test also runs once M2 is live):

```js
// ---------------------------------------------------------------------------
// 10. M2: the flip, the default, the notices
// ---------------------------------------------------------------------------

async function cellarDefault() {
  await asOwner();
  return (
    await client.query(
      `select column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility'`,
    )
  ).rows[0].column_default;
}

test("M2 flips every non-deleted PRIVATE cellar, keeps FRIENDS and deleted rows, and writes exactly the notices", async (t) => {
  if (!M2_FILE) {
    t.skip("runs only while M2 is not live and SHARING_DEFAULTS_APPLY lists it");
    return;
  }
  await withRollback(async () => {
    const people = await freshProfiles(9);
    const [privNone, privNoted, friendsNoted, placeholderOnly, publicNone, gone, heldOnly, blankText, onlyMeNoted] =
      people;
    const wine = await catalogWine(privNone);
    const cellars = {
      [privNone]: "PRIVATE",
      [privNoted]: "PRIVATE",
      [friendsNoted]: "FRIENDS",
      [placeholderOnly]: "PUBLIC",
      [publicNone]: "PUBLIC",
      [gone]: "PRIVATE",
      [heldOnly]: "PUBLIC",
      [blankText]: "PUBLIC",
      [onlyMeNoted]: "PUBLIC",
    };
    for (const [id, value] of Object.entries(cellars)) await setCellar(id, value);
    await note(privNoted, wine, { quality_score: 88 });
    await note(friendsNoted, wine, { taster_notes: "Lovely" });
    await note(placeholderOnly, wine, {}); // the empty "Save all to ratings" row
    await note(blankText, wine, { taster_notes: "  \n " });
    await flight({ host: heldOnly, guests: [publicNone], wineId: wine });
    await note(heldOnly, wine, { quality_score: 90 }); // held: never shown to anyone
    await setNotes(onlyMeNoted, "PRIVATE");
    await note(onlyMeNoted, wine, { quality_score: 70 }); // noted: the flag records facts, the card reads settings
    await asOwner();
    await client.query("select public.scrub_deleted_account($1)", [gone]);

    await client.query(readFileSync(M2_FILE, "utf8"));

    await asOwner();
    const after = Object.fromEntries(
      (await client.query("select id, cellar_visibility from profiles where id = any($1)", [people])).rows.map((r) => [
        r.id,
        r.cellar_visibility,
      ]),
    );
    assert.deepEqual(after, {
      [privNone]: "PUBLIC",
      [privNoted]: "PUBLIC",
      [friendsNoted]: "FRIENDS",
      [placeholderOnly]: "PUBLIC",
      [publicNone]: "PUBLIC",
      [gone]: "PRIVATE",
      [heldOnly]: "PUBLIC",
      [blankText]: "PUBLIC",
      [onlyMeNoted]: "PUBLIC",
    });
    const notices = Object.fromEntries(
      (
        await client.query(
          "select user_id, cellar_flipped, notes_shared, dismissed_at from sharing_notices where user_id = any($1)",
          [people],
        )
      ).rows.map((r) => [r.user_id, [r.cellar_flipped, r.notes_shared, r.dismissed_at]]),
    );
    assert.deepEqual(notices, {
      [privNone]: [true, false, null],
      [privNoted]: [true, true, null],
      [friendsNoted]: [false, true, null],
      [onlyMeNoted]: [false, true, null],
    });
    assert.equal(
      (await client.query("select count(*)::int as n from profiles where deleted_at is null and cellar_visibility = 'PRIVATE'"))
        .rows[0].n,
      0,
    );
    assert.equal(await cellarDefault(), "'PUBLIC'::cellar_visibility");
  });
});

test("an account made after M2 starts with its cellar and notes visible to everyone, and no notice", async (t) => {
  const live = (await cellarDefault()) === "'PUBLIC'::cellar_visibility";
  if (!M2_FILE && !live) {
    t.skip("M2 is neither live nor in SHARING_DEFAULTS_APPLY");
    return;
  }
  await withRollback(async () => {
    if (M2_FILE) await client.query(readFileSync(M2_FILE, "utf8"));
    await asOwner();
    // handle_new_user inserts (id, display_name, email) and nothing else.
    const row = (
      await client.query(
        `insert into profiles (id, display_name, email)
         values (gen_random_uuid(), 'New account', 'sharing-defaults-new+' || gen_random_uuid()::text || '@blindr.invalid')
         returning id, cellar_visibility, notes_visibility`,
      )
    ).rows[0];
    assert.deepEqual([row.cellar_visibility, row.notes_visibility], ["PUBLIC", "PUBLIC"]);
    assert.equal(
      (await client.query("select count(*)::int as n from sharing_notices where user_id = $1", [row.id])).rows[0].n,
      0,
    );
  });
});

test("dismissSharingNotice's update, as the person, stamps only their own notice", async (t) => {
  if (!M2_FILE) {
    t.skip("runs only while M2 is not live and SHARING_DEFAULTS_APPLY lists it");
    return;
  }
  await withRollback(async () => {
    const [a, b] = await freshProfiles(2);
    await setCellar(a, "PRIVATE");
    await setCellar(b, "PRIVATE");
    await client.query(readFileSync(M2_FILE, "utf8"));
    await asUser(a);
    const stamped = await client.query("update sharing_notices set dismissed_at = now() returning user_id");
    assert.deepEqual(
      stamped.rows.map((r) => r.user_id),
      [a],
    );
    await asOwner();
    assert.equal(
      (await client.query("select dismissed_at from sharing_notices where user_id = $1", [b])).rows[0].dismissed_at,
      null,
    );
  });
});
```

- [ ] **Step 2: Syntax gate.** `cd /c/Users/Public/repos/blindtastingapp-training && node --check scripts/sharing-defaults.test.mjs && grep -c "^test(" scripts/sharing-defaults.test.mjs` → `30`.

- [ ] **Step 3: Write M2.** Create `supabase/migrations/20260927150000_sharing_defaults_flip.sql`:

```sql
-- Sharing defaults, M2 of 2: every private cellar becomes visible to
-- everyone, new accounts start public, and the people this affects get a
-- one-time notice.
--
-- Spec: docs/superpowers/specs/2026-09-27-sharing-defaults-design.md (§3.2;
-- S1, S4, S14, S21). Plan: docs/superpowers/plans/2026-09-27-sharing-defaults.md,
-- Task 2. Applied only after M1 (20260927140000) AND the app deploy that
-- explains it are live on prod (spec §10.2 step 4).
--
-- Written against the LIVE state (read-only, 2026-09-27):
-- * 34 PRIVATE, 2 FRIENDS, 2 PUBLIC cellars of 38 profiles; 0 deleted.
--   profiles.cellar_visibility defaults to 'PRIVATE'.
-- * handle_new_user() md5 f18c8dc309331e2b2cf7d40bad8d55fa inserts only
--   (id, display_name, email), so column defaults decide a new account's
--   settings.
-- * The notice audience today: 34 flipped (3 of them also noted) and 2
--   noted only (the FRIENDS and the PUBLIC author) = 36 rows. Signups
--   between M1 and this file move it (R12).
--
-- "Noted" is the SQL twin of src/lib/notes/shared-notes-view.ts's
-- noteHasContent (NOTE_CONTENT_COLUMNS, pinned by a vitest test against
-- this file): any of the 17 assessment columns set, an aroma row, or free
-- text with a non-space character — on an identified note that is not held.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: M1 is present, nothing is flipped yet.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.sharing_notices') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'profiles' and column_name = 'notes_visibility')
     or to_regprocedure('public.wset_note_held(uuid)') is null then
    raise exception 'M1 (20260927140000_sharing_defaults) is not applied';
  end if;
  if (select regexp_replace(regexp_replace(pg_get_expr(p.polqual, p.polrelid), '\s+', ' ', 'g'), '\mpublic\.', '', 'g')
        from pg_policy p where p.polrelid = 'public.wset_notes'::regclass and p.polname = 'wset notes read')
     is distinct from
       '((author_id = auth.uid()) OR ((catalog_wine_id IS NOT NULL) AND can_view_notes(author_id) '
       || 'AND (NOT wset_note_held(id)) AND (EXISTS ( SELECT 1 FROM catalog_wines cw '
       || 'WHERE (cw.id = wset_notes.catalog_wine_id)))))' then
    raise exception '"wset notes read" is not M1''s policy';
  end if;
  if exists (select 1 from public.sharing_notices) then
    raise exception 'sharing_notices is not empty: M2 has run before';
  end if;
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility')
     is distinct from '''PRIVATE''::cellar_visibility' then
    raise exception 'profiles.cellar_visibility no longer defaults to PRIVATE';
  end if;
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
      where p.oid = to_regprocedure('public.handle_new_user()'))
     is distinct from 'f18c8dc309331e2b2cf7d40bad8d55fa' then
    raise exception 'handle_new_user changed: a new account''s settings may no longer come from the column defaults';
  end if;
  if exists (select 1 from public.profiles where deleted_at is not null and cellar_visibility <> 'PRIVATE') then
    raise exception 'a deleted profile''s cellar is not PRIVATE';
  end if;
end $$;

-- The snapshot, before anything changes.
drop table if exists pg_temp._sd_flipped;
create temp table _sd_flipped on commit drop as
select p.id from public.profiles p
 where p.deleted_at is null and p.cellar_visibility = 'PRIVATE';

drop table if exists pg_temp._sd_noted;
create temp table _sd_noted on commit drop as
select distinct n.author_id as id
  from public.wset_notes n
  join public.profiles p on p.id = n.author_id and p.deleted_at is null
 where n.catalog_wine_id is not null
   and not public.wset_note_held(n.id)
   and (num_nonnulls(n.clarity, n.appearance_intensity, n.colour_hue, n.condition, n.nose_intensity,
                     n.development, n.sweetness, n.acidity, n.tannin, n.alcohol, n.body, n.mousse,
                     n.flavour_intensity, n.finish, n.quality_score, n.price_category, n.readiness) > 0
        or n.taster_notes ~ '\S'
        or exists (select 1 from public.wset_note_aromas a where a.note_id = n.id));

drop table if exists pg_temp._sd_counts_before;
create temp table _sd_counts_before on commit drop as
select p.cellar_visibility::text as visibility, (p.deleted_at is not null) as deleted, count(*)::int as n
  from public.profiles p
 group by 1, 2;

drop table if exists pg_temp._sd_deleted_before;
create temp table _sd_deleted_before on commit drop as
select p.id, p.cellar_visibility::text as visibility, p.notes_visibility::text as notes
  from public.profiles p
 where p.deleted_at is not null;

-- ---------------------------------------------------------------------------
-- 1. The notices: one row per flipped or noted person.
-- ---------------------------------------------------------------------------
insert into public.sharing_notices (user_id, cellar_flipped, notes_shared)
select u.id,
       exists (select 1 from _sd_flipped f where f.id = u.id),
       exists (select 1 from _sd_noted d where d.id = u.id)
  from (select id from _sd_flipped union select id from _sd_noted) u;

-- ---------------------------------------------------------------------------
-- 2. The flip (S1): PRIVATE becomes PUBLIC; FRIENDS stays; deleted rows are
--    never touched. Runs as the owner, so profiles_deleted_guard lets it through.
-- ---------------------------------------------------------------------------
update public.profiles
   set cellar_visibility = 'PUBLIC'
 where deleted_at is null and cellar_visibility = 'PRIVATE';

-- ---------------------------------------------------------------------------
-- 3. New accounts start public.
-- ---------------------------------------------------------------------------
alter table public.profiles alter column cellar_visibility set default 'PUBLIC';

-- ---------------------------------------------------------------------------
-- Post-state.
-- ---------------------------------------------------------------------------
do $$
declare
  v_flipped int := (select count(*)::int from _sd_flipped);
  v_noted int := (select count(*)::int from _sd_noted);
  v_rows int;
begin
  if exists (select 1 from public.profiles where deleted_at is null and cellar_visibility = 'PRIVATE') then
    raise exception 'a non-deleted profile is still PRIVATE';
  end if;
  if (select count(*)::int from public.profiles where deleted_at is null and cellar_visibility = 'FRIENDS')
     is distinct from coalesce((select n from _sd_counts_before where visibility = 'FRIENDS' and not deleted), 0) then
    raise exception 'the FRIENDS count changed';
  end if;
  if (select count(*)::int from public.profiles where deleted_at is null and cellar_visibility = 'PUBLIC')
     is distinct from coalesce((select n from _sd_counts_before where visibility = 'PUBLIC' and not deleted), 0) + v_flipped then
    raise exception 'PUBLIC is not the snapshot''s PUBLIC plus the flipped';
  end if;
  if exists ((select id, visibility, notes from _sd_deleted_before)
             except
             (select p.id, p.cellar_visibility::text, p.notes_visibility::text from public.profiles p where p.deleted_at is not null))
     or exists ((select p.id, p.cellar_visibility::text, p.notes_visibility::text from public.profiles p where p.deleted_at is not null)
                except
                (select id, visibility, notes from _sd_deleted_before))
     or exists (select 1 from public.profiles where deleted_at is not null and cellar_visibility <> 'PRIVATE') then
    raise exception 'a deleted profile changed, or is not PRIVATE';
  end if;
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility')
     is distinct from '''PUBLIC''::cellar_visibility' then
    raise exception 'profiles.cellar_visibility does not default to PUBLIC';
  end if;
  select count(*)::int into v_rows from public.sharing_notices;
  if v_rows is distinct from (select count(*)::int from (select id from _sd_flipped union select id from _sd_noted) u) then
    raise exception 'sharing_notices has % rows, expected |flipped ∪ noted|', v_rows;
  end if;
  if exists (
    select 1 from public.sharing_notices s
     where s.cellar_flipped is distinct from exists (select 1 from _sd_flipped f where f.id = s.user_id)
        or s.notes_shared is distinct from exists (select 1 from _sd_noted d where d.id = s.user_id)
        or s.dismissed_at is not null
  ) then
    raise exception 'a notice''s flags differ from the snapshot, or it starts dismissed';
  end if;
  raise notice 'sharing defaults M2: % cellar(s) flipped, % noted author(s), % notice row(s)', v_flipped, v_noted, v_rows;
end $$;
```

- [ ] **Step 4: Write the M2 rollback.** Create `scripts/sharing-defaults/rollback-m2.sql`:

```sql
-- Undo M2 (20260927150000_sharing_defaults_flip): spec §10.3. NEVER under
-- supabase/migrations. Run with scripts/sharing-defaults/run-sql.mjs,
-- --dry first. It re-privatizes every cellar M2 flipped that is still
-- PUBLIC — including anyone who chose PUBLIC on purpose after the notice
-- (R10) — restores the PRIVATE default, empties the notices and removes
-- M2's history row so the file can be applied again later.

set local lock_timeout = '10s';

do $$
begin
  if to_regclass('public.sharing_notices') is null then
    raise exception 'M1 is not applied; there is no M2 to undo';
  end if;
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility')
     is distinct from '''PUBLIC''::cellar_visibility' then
    raise exception 'M2 is not applied: the cellar default is not PUBLIC';
  end if;
end $$;

drop table if exists pg_temp._sd_reprivatized;
create temp table _sd_reprivatized on commit drop as
select p.id
  from public.profiles p
  join public.sharing_notices s on s.user_id = p.id
 where s.cellar_flipped and p.cellar_visibility = 'PUBLIC' and p.deleted_at is null;

update public.profiles p
   set cellar_visibility = 'PRIVATE'
  from public.sharing_notices s
 where s.user_id = p.id and s.cellar_flipped and p.cellar_visibility = 'PUBLIC' and p.deleted_at is null;
alter table public.profiles alter column cellar_visibility set default 'PRIVATE';
delete from public.sharing_notices;
delete from supabase_migrations.schema_migrations where version = '20260927150000';

do $$
begin
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility')
     is distinct from '''PRIVATE''::cellar_visibility' then
    raise exception 'the cellar default is not PRIVATE again';
  end if;
  if exists (select 1 from public.sharing_notices) then
    raise exception 'sharing_notices is not empty';
  end if;
  if exists (select 1 from public.profiles p join _sd_reprivatized r on r.id = p.id
              where p.cellar_visibility <> 'PRIVATE') then
    raise exception 'a flipped cellar is not PRIVATE again';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260927150000') then
    raise exception 'M2''s history row is still recorded';
  end if;
  raise notice 'rollback M2: % cellar(s) made private again', (select count(*) from _sd_reprivatized);
end $$;
```

- [ ] **Step 5: Gates.** `node --check` as above; tsc exit 0; full vitest **B_files / B_tests**; `npx eslint scripts/sharing-defaults.test.mjs` exit 0.

- [ ] **Step 6: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add supabase/migrations/20260927150000_sharing_defaults_flip.sql scripts/sharing-defaults/rollback-m2.sql scripts/sharing-defaults.test.mjs && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "$(cat <<'EOF'
feat(db): sharing defaults M2 - private cellars become public, new accounts start public, one-time notices (not applied)

Spec 2026-09-27-sharing-defaults §3.2. Applied only after M1 and the app
deploy are live (§10.2). Rollback SQL in scripts/sharing-defaults/.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Pure helpers, copy, and the notes rule-1 refusal line

**Files:**
- Create: `src/lib/sharing/visibility.ts`, `src/lib/sharing/visibility.test.ts`
- Create: `src/lib/sharing/notice.ts`, `src/lib/sharing/notice.test.ts`
- Create: `src/lib/notes/shared-notes-view.ts`, `src/lib/notes/shared-notes-view.test.ts`
- Create: `src/lib/notes/rule1-guard.ts`, `src/lib/notes/rule1-guard.test.ts`
- Modify: `src/lib/first-run/tour.ts`, `src/lib/first-run/tour.test.ts`
- Modify: `src/components/wset/wset-sheet.tsx`, `src/app/catalog/[wineId]/notes/note-editor.tsx`, `src/app/catalog/[wineId]/notes/note-editor.test.ts`
- Modify (comments only): `src/app/taste/notes/notes-data.ts`, `src/components/wset/note-modal.tsx`, `src/app/tastings/[id]/open-board.tsx`, `src/app/tastings/[id]/play/play-experience.tsx`, `src/lib/cellar/lot-sheet.ts`, `src/lib/wset/queries.ts`

**Interfaces:**
- Consumes: `SharingAudience` (Task 1); M2's file (Task 2) for the SQL-twin pin; M1's file (Task 1) for the message pin; `scoreWord` (`src/lib/wset/note-summary.ts`), `dayMonthYear` (`src/lib/cellar/format.ts`), `catalogWineTitle` (`src/lib/wset/wine-title.ts`), `TRAINING_COPY.trainingBadge` (`src/lib/training/copy.ts`).
- Produces:
  - `src/lib/sharing/visibility.ts`: `type SharingAudience`; `AUDIENCE_OPTIONS: readonly { value: SharingAudience; label: string }[]`; `isSharingAudience(value: unknown): value is SharingAudience`; `audienceLabel(value): string`; `notSavedLine(value): string`; `profileWriteSaved(result: { data: readonly unknown[] | null; error: unknown }): boolean`; `ownNotesLine(value): string`; `SHARING_COPY` = `{ cardTitle, sectionId: "sharing", settingsHref: "/profile/edit#sharing", cellarLabel, cellarHelp, notesLabel, notesHelp, cellarControlLabel: "Visible to" }`.
  - `src/lib/sharing/notice.ts`: `type SharingNoticeInput = { cellarFlipped: boolean; notesShared: boolean; cellar: SharingAudience; notes: SharingAudience; dismissedAt: string | null }`; `type SharingNoticeCopy = { title: string; body: string; cta: string }`; `SHARING_NOTICE = { eyebrow: "Sharing", dismiss: "Got it", href: "/profile/edit#sharing" }`; `sharingNoticeCopy(input): SharingNoticeCopy | null`; `sharingNoticeHiddenKey(userId: string): string`.
  - `src/lib/notes/shared-notes-view.ts`: `SHARED_NOTES_COPY` (`othersHeading, profileHeading, profileHeadingOwn, profileEmptyOwn, change, showFewer, notScored, heldTag, readEyebrow, nothingRecorded`); `NOTES_SHOWN = 5`; `NOTES_FETCHED = 50`; `SUMMARY_AROMAS = 4`; `SUMMARY_MAX = 90`; `NOTE_CONTENT_COLUMNS` (17); `type NoteContentRow`; `noteHasContent(row: NoteContentRow, aromaCount: number): boolean`; `noteSummaryLine(input: { aromaWords: readonly string[]; tasterNotes: string | null }): string | null`; `orderNotes<T extends { id; tasted_on; created_at }>(rows: readonly T[]): T[]`; `visibleNotes<T>(rows: readonly T[], expanded: boolean): T[]`; `showAllLabel(count: number): string | null`; `cappedFooter(fetched: number): string | null`; `contextBadge(kind: string | null): string | null`; `scoreLine(score: number | null): string`; `tastedLine(tastedOn: string): string`; `OTHERS_NOTE_SELECT`; `PROFILE_NOTE_SELECT`; types `RawSharedNote`, `RawOthersNote`, `RawProfileNote`, `SharedNoteRow { id; href; tastedOn; dateLabel; badge; score; summary }`, `OthersNoteRow = SharedNoteRow & { author: { id; name; avatarUrl; href } }`, `ProfileNoteRow = SharedNoteRow & { wineTitle; imageUrl; held }`; `toOthersNoteRows(raws: readonly RawOthersNote[], wineId: string): OthersNoteRow[]`; `toProfileNoteRows(raws: readonly RawProfileNote[], held: ReadonlySet<string>): ProfileNoteRow[]`.
  - `src/lib/notes/rule1-guard.ts`: `NOTE_RULE1_MESSAGE`; `isNoteRule1Refusal(error): boolean`; `NOTE_SAVE_REFUSAL = "NoteSaveRefusal"`; `noteSaveRefusal(message: string): Error`; `saveRefusalMessage(error: unknown): string | null`.
  - `WsetSheet` shows a thrown `NoteSaveRefusal`'s message above its footer (`SheetFooter notice`); `NoteEditor` throws one for the guard's refusal.

- [ ] **Step 1: Write the failing tests.** Create `src/lib/sharing/visibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  AUDIENCE_OPTIONS,
  SHARING_COPY,
  audienceLabel,
  isSharingAudience,
  notSavedLine,
  ownNotesLine,
  profileWriteSaved,
} from "./visibility";

// Sharing defaults spec 2026-09-27 S6, §7.1, §7.6.

describe("AUDIENCE_OPTIONS", () => {
  it("lists Everyone, Friends, Only me — widest first — over the stored values", () => {
    expect(AUDIENCE_OPTIONS).toEqual([
      { value: "PUBLIC", label: "Everyone" },
      { value: "FRIENDS", label: "Friends" },
      { value: "PRIVATE", label: "Only me" },
    ]);
  });
});

describe("audienceLabel", () => {
  it("names each stored value in the owner's words", () => {
    expect(audienceLabel("PUBLIC")).toBe("Everyone");
    expect(audienceLabel("FRIENDS")).toBe("Friends");
    expect(audienceLabel("PRIVATE")).toBe("Only me");
  });

  it("throws on anything else rather than inventing a label", () => {
    expect(() => audienceLabel("SECRET" as never)).toThrow("not a sharing audience");
  });
});

describe("isSharingAudience", () => {
  it("accepts exactly the three stored values", () => {
    for (const v of ["PUBLIC", "FRIENDS", "PRIVATE"]) expect(isSharingAudience(v)).toBe(true);
    for (const v of ["public", "Everyone", "", null, undefined, 1]) expect(isSharingAudience(v)).toBe(false);
  });
});

describe("notSavedLine", () => {
  it("says the save failed and names what is still stored", () => {
    expect(notSavedLine("PUBLIC")).toBe("Not saved. Still set to Everyone.");
    expect(notSavedLine("FRIENDS")).toBe("Not saved. Still set to Friends.");
    expect(notSavedLine("PRIVATE")).toBe("Not saved. Still set to Only me.");
  });
});

describe("profileWriteSaved", () => {
  it("is true only when exactly one row came back with no error", () => {
    expect(profileWriteSaved({ data: [{ id: "u1" }], error: null })).toBe(true);
  });

  it("is false for a refused write, a write that matched no row, or no data", () => {
    expect(profileWriteSaved({ data: null, error: { message: "permission denied" } })).toBe(false);
    expect(profileWriteSaved({ data: [], error: null })).toBe(false);
    expect(profileWriteSaved({ data: null, error: null })).toBe(false);
  });
});

describe("ownNotesLine", () => {
  it("tells the author who can see their notes", () => {
    expect(ownNotesLine("PUBLIC")).toBe("Everyone can see these");
    expect(ownNotesLine("FRIENDS")).toBe("Your friends can see these");
    expect(ownNotesLine("PRIVATE")).toBe("Only you can see these");
  });
});

describe("SHARING_COPY", () => {
  it("carries the spec's §7.6 strings and the settings anchor", () => {
    expect(SHARING_COPY).toEqual({
      cardTitle: "Sharing",
      sectionId: "sharing",
      settingsHref: "/profile/edit#sharing",
      cellarLabel: "Who can see your cellar",
      cellarHelp:
        "Your bottles and where you keep them. What you paid, where you bought them and your private notes stay yours.",
      notesLabel: "Who can see your tasting notes",
      notesHelp:
        "Applies to every note you write. A note on a wine in your own unrevealed flight stays hidden until the reveal.",
      cellarControlLabel: "Visible to",
    });
  });

  it("links to the card's own id", () => {
    expect(SHARING_COPY.settingsHref.endsWith(`#${SHARING_COPY.sectionId}`)).toBe(true);
  });
});
```

Create `src/lib/sharing/notice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SharingAudience } from "../supabase/database.types";
import { SHARING_NOTICE, sharingNoticeCopy, sharingNoticeHiddenKey, type SharingNoticeInput } from "./notice";

// Sharing defaults spec 2026-09-27 S4, S15, §7.5.

const AUDIENCES: SharingAudience[] = ["PUBLIC", "FRIENDS", "PRIVATE"];
const base: SharingNoticeInput = {
  cellarFlipped: true,
  notesShared: true,
  cellar: "PUBLIC",
  notes: "PUBLIC",
  dismissedAt: null,
};

describe("sharingNoticeCopy", () => {
  it("names both when both flags hold and both settings are still Everyone", () => {
    expect(sharingNoticeCopy(base)).toEqual({
      title: "Your cellar and tasting notes are now visible to everyone",
      body: "Other Blindr members can now see the bottles in your cellar and the notes you write. You choose who sees each one in your settings.",
      cta: "Change who can see them",
    });
  });

  it("names only the notes when the cellar was not flipped", () => {
    expect(sharingNoticeCopy({ ...base, cellarFlipped: false })).toEqual({
      title: "Your tasting notes are now visible to everyone",
      body: "Other Blindr members can now see the notes you write. You choose who sees them in your settings.",
      cta: "Change who can see them",
    });
  });

  it("names only the cellar when the person already changed the notes setting", () => {
    expect(sharingNoticeCopy({ ...base, notes: "FRIENDS" })).toEqual({
      title: "Your cellar is now visible to everyone",
      body: "Other Blindr members can now see the bottles in your cellar. You choose who sees it in your settings.",
      cta: "Change who can see it",
    });
  });

  it("is null once dismissed, whatever the flags and settings", () => {
    for (const cellar of AUDIENCES) {
      for (const notes of AUDIENCES) {
        expect(sharingNoticeCopy({ ...base, cellar, notes, dismissedAt: "2026-09-27T10:00:00Z" })).toBeNull();
      }
    }
  });

  it("is null when nothing it would say is still true", () => {
    expect(sharingNoticeCopy({ ...base, cellar: "FRIENDS", notes: "PRIVATE" })).toBeNull();
    expect(sharingNoticeCopy({ ...base, cellarFlipped: false, notes: "PRIVATE" })).toBeNull();
    expect(sharingNoticeCopy({ ...base, notesShared: false, cellar: "PRIVATE" })).toBeNull();
    expect(sharingNoticeCopy({ ...base, cellarFlipped: false, notesShared: false })).toBeNull();
  });

  it("never mentions a setting the row does not hold, over every flag x setting combination", () => {
    for (const cellarFlipped of [true, false]) {
      for (const notesShared of [true, false]) {
        for (const cellar of AUDIENCES) {
          for (const notes of AUDIENCES) {
            const copy = sharingNoticeCopy({ cellarFlipped, notesShared, cellar, notes, dismissedAt: null });
            const saysCellar = copy?.title.includes("cellar") ?? false;
            const saysNotes = copy?.title.includes("notes") ?? false;
            expect(saysCellar).toBe(cellarFlipped && cellar === "PUBLIC");
            expect(saysNotes).toBe(notesShared && notes === "PUBLIC");
          }
        }
      }
    }
  });
});

describe("SHARING_NOTICE", () => {
  it("carries the eyebrow, the dismiss label and the settings anchor", () => {
    expect(SHARING_NOTICE).toEqual({ eyebrow: "Sharing", dismiss: "Got it", href: "/profile/edit#sharing" });
  });
});

describe("sharingNoticeHiddenKey", () => {
  it("is per person, so another account in the same tab still sees its own notice", () => {
    expect(sharingNoticeHiddenKey("u1")).toBe("blindr:sharing-notice-hidden:u1");
    expect(sharingNoticeHiddenKey("u1")).not.toBe(sharingNoticeHiddenKey("u2"));
  });
});
```

Create `src/lib/notes/shared-notes-view.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NOTES_FETCHED,
  NOTES_SHOWN,
  NOTE_CONTENT_COLUMNS,
  OTHERS_NOTE_SELECT,
  PROFILE_NOTE_SELECT,
  SHARED_NOTES_COPY,
  cappedFooter,
  contextBadge,
  noteHasContent,
  noteSummaryLine,
  orderNotes,
  scoreLine,
  showAllLabel,
  tastedLine,
  toOthersNoteRows,
  toProfileNoteRows,
  visibleNotes,
  type NoteContentRow,
  type RawOthersNote,
  type RawProfileNote,
} from "./shared-notes-view";

// Sharing defaults spec 2026-09-27 S16, §7.1-§7.3.

const EMPTY: NoteContentRow = {
  clarity: null,
  appearance_intensity: null,
  colour_hue: null,
  condition: null,
  nose_intensity: null,
  development: null,
  sweetness: null,
  acidity: null,
  tannin: null,
  alcohol: null,
  body: null,
  mousse: null,
  flavour_intensity: null,
  finish: null,
  quality_score: null,
  price_category: null,
  readiness: null,
  taster_notes: "",
};

describe("noteHasContent", () => {
  it("is false for the empty placeholder 'Save all to ratings' writes", () => {
    expect(noteHasContent(EMPTY, 0)).toBe(false);
  });

  it("is true for an aroma alone", () => {
    expect(noteHasContent(EMPTY, 1)).toBe(true);
  });

  it("is true for free text alone, false for whitespace alone", () => {
    expect(noteHasContent({ ...EMPTY, taster_notes: "Lovely" }, 0)).toBe(true);
    expect(noteHasContent({ ...EMPTY, taster_notes: "  \n\t " }, 0)).toBe(false);
    expect(noteHasContent({ ...EMPTY, taster_notes: null }, 0)).toBe(false);
  });

  it("is true for a score alone, and for any one assessment alone", () => {
    expect(noteHasContent({ ...EMPTY, quality_score: 88 }, 0)).toBe(true);
    for (const column of NOTE_CONTENT_COLUMNS) {
      expect(noteHasContent({ ...EMPTY, [column]: "X" }, 0), column).toBe(true);
    }
  });

  it("counts mousse on any wine, as the SQL twin does (unlike the sheet's still-wine progress)", () => {
    expect(noteHasContent({ ...EMPTY, mousse: "CREAMY" }, 0)).toBe(true);
  });
});

describe("NOTE_CONTENT_COLUMNS is M2's noted rule, column for column", () => {
  const sql = readFileSync("supabase/migrations/20260927150000_sharing_defaults_flip.sql", "utf8").replace(
    /\r\n/g,
    "\n",
  );
  const noted = sql.slice(sql.indexOf("create temp table _sd_noted"), sql.indexOf("drop table if exists pg_temp._sd_counts_before"));

  it("lists the same 17 columns in the same order inside num_nonnulls", () => {
    const inner = noted.slice(noted.indexOf("num_nonnulls(") + "num_nonnulls(".length, noted.indexOf(") > 0"));
    const columns = inner.split(",").map((c) => c.trim().replace(/^n\./, ""));
    expect(columns).toEqual([...NOTE_CONTENT_COLUMNS]);
  });

  it("treats free text as content only with a non-space character, and any aroma row as content", () => {
    expect(noted).toContain("n.taster_notes ~ '\\S'");
    expect(noted).toContain("exists (select 1 from public.wset_note_aromas a where a.note_id = n.id)");
    expect(noted).toContain("not public.wset_note_held(n.id)");
    expect(noted).toContain("n.catalog_wine_id is not null");
  });
});

describe("noteSummaryLine", () => {
  it("joins up to four distinct aroma words, case-insensitively deduped, first spelling kept", () => {
    expect(
      noteSummaryLine({
        aromaWords: ["blackcurrant", "Blackcurrant", "cedar", " vanilla ", "", "violet", "leather"],
        tasterNotes: "ignored when there are aromas",
      }),
    ).toBe("blackcurrant, cedar, vanilla, violet");
  });

  it("falls back to the free text, whitespace collapsed", () => {
    expect(noteSummaryLine({ aromaWords: [], tasterNotes: "  Firm,\n  long finish. " })).toBe("Firm, long finish.");
  });

  it("cuts long free text at a word boundary to at most 90 characters plus an ellipsis", () => {
    const text =
      "A deep ruby wine with a nose of dark cherries and a whisper of smoke that opens slowly into cedar and graphite";
    const line = noteSummaryLine({ aromaWords: [], tasterNotes: text });
    expect(line).toBe(
      "A deep ruby wine with a nose of dark cherries and a whisper of smoke that opens slowly…",
    );
    expect(line!.length).toBeLessThanOrEqual(91);
    expect(text.startsWith(line!.slice(0, -1))).toBe(true);
  });

  it("keeps free text of exactly 90 characters whole", () => {
    const text = "x".repeat(90);
    expect(noteSummaryLine({ aromaWords: [], tasterNotes: text })).toBe(text);
  });

  it("hard-cuts one unbroken word longer than 90 characters", () => {
    expect(noteSummaryLine({ aromaWords: [], tasterNotes: "y".repeat(120) })).toBe(`${"y".repeat(90)}…`);
  });

  it("drops trailing punctuation before the ellipsis", () => {
    const text = `${"word ".repeat(16)}ending, more words after the cut here and beyond`;
    expect(noteSummaryLine({ aromaWords: [], tasterNotes: text })).toBe(`${"word ".repeat(16)}ending…`);
  });

  it("is null with neither aromas nor text", () => {
    expect(noteSummaryLine({ aromaWords: [], tasterNotes: null })).toBeNull();
    expect(noteSummaryLine({ aromaWords: ["  "], tasterNotes: "   " })).toBeNull();
  });
});

describe("orderNotes", () => {
  it("orders tasted_on desc, then created_at desc, then id desc", () => {
    const rows = [
      { id: "a", tasted_on: "2026-09-01", created_at: "2026-09-01T10:00:00+00:00" },
      { id: "c", tasted_on: "2026-09-02", created_at: "2026-09-02T09:00:00+00:00" },
      { id: "b", tasted_on: "2026-09-02", created_at: "2026-09-02T09:00:00+00:00" },
      { id: "d", tasted_on: "2026-09-02", created_at: "2026-09-02T11:00:00+00:00" },
    ];
    expect(orderNotes(rows).map((r) => r.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("does not mutate its input", () => {
    const rows = [
      { id: "a", tasted_on: "2026-09-01", created_at: "x" },
      { id: "b", tasted_on: "2026-09-02", created_at: "x" },
    ];
    orderNotes(rows);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("the cap", () => {
  const rows = Array.from({ length: 7 }, (_, i) => i);

  it("shows five until expanded, then all", () => {
    expect(NOTES_SHOWN).toBe(5);
    expect(visibleNotes(rows, false)).toEqual([0, 1, 2, 3, 4]);
    expect(visibleNotes(rows, true)).toEqual(rows);
  });

  it("offers Show all only past five", () => {
    expect(showAllLabel(5)).toBeNull();
    expect(showAllLabel(6)).toBe("Show all 6 notes");
  });

  it("says the list is cut only when the fetch hit its cap of 50", () => {
    expect(NOTES_FETCHED).toBe(50);
    expect(cappedFooter(49)).toBeNull();
    expect(cappedFooter(50)).toBe("Showing the 50 most recent notes.");
  });
});

describe("badges, score and date lines", () => {
  it("badges Blind and Training, and nothing else", () => {
    expect(contextBadge("BLIND")).toBe("Blind");
    expect(contextBadge("TRAINING")).toBe("Training");
    expect(contextBadge("OPEN")).toBeNull();
    expect(contextBadge(null)).toBeNull();
  });

  it("shows the score with its band word, or Not scored", () => {
    expect(scoreLine(92)).toBe("92 · Outstanding");
    expect(scoreLine(null)).toBe("Not scored");
  });

  it("dates the read view's author line", () => {
    expect(tastedLine("2026-09-27")).toBe("Tasted 27 Sep 2026");
  });

  it("carries the spec's fixed strings", () => {
    expect(SHARED_NOTES_COPY).toEqual({
      othersHeading: "Notes from others",
      profileHeading: "Tasting notes",
      profileHeadingOwn: "Your tasting notes",
      profileEmptyOwn: "No tasting notes yet.",
      change: "Change",
      showFewer: "Show fewer",
      notScored: "Not scored",
      heldTag: "Hidden from others",
      readEyebrow: "Tasting note",
      nothingRecorded: "Nothing recorded yet.",
    });
  });
});

describe("the selects", () => {
  it("read every content column, so noteHasContent never sees a missing one as empty", () => {
    for (const select of [OTHERS_NOTE_SELECT, PROFILE_NOTE_SELECT]) {
      for (const column of [...NOTE_CONTENT_COLUMNS, "taster_notes"]) {
        expect(select.split(/[\s,()]+/)).toContain(column);
      }
    }
  });

  it("embed the author by its foreign key, and the profile's wine as an inner join", () => {
    expect(OTHERS_NOTE_SELECT).toContain("author:profiles!wset_notes_author_id_fkey(id, display_name, avatar_url)");
    expect(PROFILE_NOTE_SELECT).toContain("catalog_wine:catalog_wines!inner(");
  });
});

const raw = (over: Partial<RawOthersNote> = {}): RawOthersNote => ({
  ...EMPTY,
  id: "n1",
  author_id: "u2",
  catalog_wine_id: "w1",
  context_kind: "OPEN",
  tasted_on: "2026-09-20",
  created_at: "2026-09-20T10:00:00+00:00",
  quality_score: 90,
  aromas: [{ term: { term: "cedar" } }],
  author: { id: "u2", display_name: "Gustav", avatar_url: null },
  ...over,
});

describe("toOthersNoteRows", () => {
  it("shapes a note into a row with two separate destinations", () => {
    expect(toOthersNoteRows([raw()], "w1")).toEqual([
      {
        id: "n1",
        href: "/catalog/w1/notes/n1",
        tastedOn: "2026-09-20",
        dateLabel: "20 Sep 2026",
        badge: null,
        score: "90 · Outstanding",
        summary: "cedar",
        author: { id: "u2", name: "Gustav", avatarUrl: null, href: "/u/u2" },
      },
    ]);
  });

  it("drops empty placeholders and rows without an author, and orders newest first", () => {
    const rows = toOthersNoteRows(
      [
        raw({ id: "old", tasted_on: "2026-09-01" }),
        raw({ id: "empty", quality_score: null, aromas: [] }),
        raw({ id: "orphan", author: null }),
        raw({ id: "new", tasted_on: "2026-09-25", author: [{ id: "u3", display_name: "Ida", avatar_url: "a.png" }] }),
      ],
      "w1",
    );
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
    expect(rows[0].author).toEqual({ id: "u3", name: "Ida", avatarUrl: "a.png", href: "/u/u3" });
  });
});

describe("toProfileNoteRows", () => {
  const wine = {
    wine_name: "Grand Vin",
    vintage_kind: "YEAR" as const,
    vintage_year: 2015,
    vintage_tawny_years: null,
    image_url: "wine.jpg",
    producer: { name: "Château Margaux" },
    appellation: [{ name: "Margaux AOC" }],
  };
  const profileRaw = (over: Partial<RawProfileNote> = {}): RawProfileNote => {
    const { author: _author, ...rest } = raw();
    void _author;
    return { ...rest, catalog_wine: wine, ...over };
  };

  it("titles each row by its wine, links to the note and marks held ones", () => {
    expect(toProfileNoteRows([profileRaw({ context_kind: "BLIND" })], new Set(["n1"]))).toEqual([
      {
        id: "n1",
        href: "/catalog/w1/notes/n1",
        tastedOn: "2026-09-20",
        dateLabel: "20 Sep 2026",
        badge: "Blind",
        score: "90 · Outstanding",
        summary: "cedar",
        wineTitle: "Château Margaux Grand Vin Margaux AOC 2015",
        imageUrl: "wine.jpg",
        held: true,
      },
    ]);
  });

  it("drops a row whose wine did not come back, and empty placeholders", () => {
    const rows = toProfileNoteRows(
      [
        profileRaw({ id: "gone", catalog_wine: null }),
        profileRaw({ id: "empty", quality_score: null, aromas: null }),
        profileRaw({ id: "kept" }),
      ],
      new Set(),
    );
    expect(rows.map((r) => [r.id, r.held])).toEqual([["kept", false]]);
  });
});
```

Create `src/lib/notes/rule1-guard.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { UNREVEALED_GLASS_EDIT } from "../catalog/rule1-guard";
import {
  NOTE_RULE1_MESSAGE,
  NOTE_SAVE_REFUSAL,
  isNoteRule1Refusal,
  noteSaveRefusal,
  saveRefusalMessage,
} from "./rule1-guard";

// The notes Rule 1 guard's refusal (sharing-defaults spec 2026-09-27 S12, §5.3).

const MIGRATION = "supabase/migrations/20260927140000_sharing_defaults.sql";

describe("isNoteRule1Refusal", () => {
  it("is true for the guard's own 42501 with exactly its message", () => {
    expect(isNoteRule1Refusal({ code: "42501", message: NOTE_RULE1_MESSAGE })).toBe(true);
  });

  it("is false for RLS's own 42501", () => {
    expect(
      isNoteRule1Refusal({ code: "42501", message: 'new row violates row-level security policy for table "wset_notes"' }),
    ).toBe(false);
  });

  it("is false for the same message under another code, and for the catalog guard's sentence", () => {
    expect(isNoteRule1Refusal({ code: "P0001", message: NOTE_RULE1_MESSAGE })).toBe(false);
    expect(isNoteRule1Refusal({ code: "42501", message: UNREVEALED_GLASS_EDIT })).toBe(false);
  });

  it("is false for no error", () => {
    expect(isNoteRule1Refusal(null)).toBe(false);
    expect(isNoteRule1Refusal(undefined)).toBe(false);
    expect(isNoteRule1Refusal({})).toBe(false);
  });
});

describe("the guard's message is pinned to the migration", () => {
  // Normalised so a CRLF checkout (Windows autocrlf) matches.
  const sql = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
  const quoted = "message = '" + NOTE_RULE1_MESSAGE.replaceAll("'", "''") + "'";

  it("raises exactly this message once", () => {
    expect(sql.split(quoted).length - 1).toBe(1);
  });

  it("raises it as 42501", () => {
    expect(sql.split("errcode = '42501',\n      " + quoted).length - 1).toBe(1);
  });
});

describe("save refusals", () => {
  it("carry their sentence to the sheet", () => {
    const error = noteSaveRefusal(NOTE_RULE1_MESSAGE);
    expect(error.name).toBe(NOTE_SAVE_REFUSAL);
    expect(saveRefusalMessage(error)).toBe(NOTE_RULE1_MESSAGE);
  });

  it("leave every other error to the bare Retry save", () => {
    expect(saveRefusalMessage(new Error("fetch failed"))).toBeNull();
    expect(saveRefusalMessage("NoteSaveRefusal")).toBeNull();
    expect(saveRefusalMessage(null)).toBeNull();
  });
});
```

Update the tour's pinned sentences first (the tour step "cellar" and "community", spec §7.7) and add the refusal-wiring source test to `note-editor.test.ts`:

```diff
--- a/src/lib/first-run/tour.test.ts
+++ b/src/lib/first-run/tour.test.ts
@@ -52,19 +52,19 @@ describe("tourSteps (spec D5)", () => {
 
   it("names the header camera only where canScan is true", () => {
     expect(paragraphsOf(tourSteps({ ...BASE, canScan: true }), "cellar")).toEqual([
-      "Add bottles by scanning a label with the camera at the top — the catalog is everyone's reference, your cellar is yours and private unless you say otherwise.",
+      "Add bottles by scanning a label with the camera at the top — the catalog is everyone's reference, and other members can see your cellar unless you change it in your profile settings.",
     ]);
     expect(paragraphsOf(tourSteps({ ...BASE, canScan: false }), "cellar")).toEqual([
-      "Add bottles by searching the shared catalog — the catalog is everyone's reference, your cellar is yours and private unless you say otherwise.",
+      "Add bottles by searching the shared catalog — the catalog is everyone's reference, and other members can see your cellar unless you change it in your profile settings.",
     ]);
   });
 
   it("says add friends until friend requests ship, then send a friend request", () => {
     expect(paragraphsOf(tourSteps({ ...BASE, friendRequestsLive: false }), "community")).toEqual([
-      "Find people, add friends, share your invite link. Friends can see each other's cellars when you allow it.",
+      "Find people, add friends, share your invite link. You choose who sees your cellar and your notes: everyone, friends or only you.",
     ]);
     expect(paragraphsOf(tourSteps({ ...BASE, friendRequestsLive: true }), "community")).toEqual([
-      "Find people, send a friend request, share your invite link. Friends can see each other's cellars when you allow it.",
+      "Find people, send a friend request, share your invite link. You choose who sees your cellar and your notes: everyone, friends or only you.",
     ]);
   });
 
```

```diff
--- a/src/app/catalog/[wineId]/notes/note-editor.test.ts
+++ b/src/app/catalog/[wineId]/notes/note-editor.test.ts
@@ -41,3 +41,26 @@ describe("note-editor -> WsetSheet wine prop (A-07 regression)", () => {
     );
   });
 });
+
+// Sharing defaults spec 2026-09-27 §5.3: the notes Rule 1 guard's refusal
+// reaches the author as its sentence, not a bare "Retry save". Source
+// inspection, as above: no DOM renderer in this codebase.
+describe("the notes Rule 1 refusal reaches the sheet as a sentence", () => {
+  const noteEditorSrc = readFileSync(
+    path.join(process.cwd(), "src/app/catalog/[wineId]/notes/note-editor.tsx"),
+    "utf8",
+  );
+  const wsetSheetSrc = readFileSync(path.join(process.cwd(), "src/components/wset/wset-sheet.tsx"), "utf8");
+
+  it("NoteEditor throws the guard's refusal as a save refusal, before the generic error", () => {
+    const refusal = noteEditorSrc.indexOf("if (isNoteRule1Refusal(error)) throw noteSaveRefusal(NOTE_RULE1_MESSAGE);");
+    const generic = noteEditorSrc.indexOf("if (error) throw new Error(error.message);");
+    expect(refusal).toBeGreaterThan(-1);
+    expect(refusal).toBeLessThan(generic);
+  });
+
+  it("WsetSheet puts a save refusal's sentence in the footer's notice slot", () => {
+    expect(wsetSheetSrc).toContain("setSaveNotice(saveRefusalMessage(error));");
+    expect(wsetSheetSrc).toMatch(/<SheetFooter[\s\S]*?notice=\{\s*saveNotice \?/);
+  });
+});
```

- [ ] **Step 2: Run them and watch them fail.** `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/sharing src/lib/notes src/lib/first-run note-editor; echo "exit $?"`. Expected: FAIL — the four new files cannot resolve `./visibility`, `./notice`, `./shared-notes-view`, `./rule1-guard`; `tour.test.ts` fails on the two changed sentences; `note-editor.test.ts` fails its two new tests.

- [ ] **Step 3: Write the modules.** Create `src/lib/sharing/visibility.ts`:

```ts
// The one vocabulary of the two sharing settings (sharing-defaults spec
// 2026-09-27 S6, §7.1, §7.6): who can see your cellar and who can see your
// tasting notes, each Everyone / Friends / Only me — the database's PUBLIC /
// FRIENDS / PRIVATE. Pure: a type-only import, relative paths, so vitest
// loads it.
import type { SharingAudience } from "../supabase/database.types";

export type { SharingAudience };

/** The three audiences, widest first, as every control lists them. */
export const AUDIENCE_OPTIONS: readonly { value: SharingAudience; label: string }[] = [
  { value: "PUBLIC", label: "Everyone" },
  { value: "FRIENDS", label: "Friends" },
  { value: "PRIVATE", label: "Only me" },
];

/** True for exactly the three stored values. */
export function isSharingAudience(value: unknown): value is SharingAudience {
  return value === "PUBLIC" || value === "FRIENDS" || value === "PRIVATE";
}

/** "Everyone", "Friends" or "Only me". */
export function audienceLabel(value: SharingAudience): string {
  const option = AUDIENCE_OPTIONS.find((o) => o.value === value);
  if (!option) throw new Error(`not a sharing audience: ${String(value)}`);
  return option.label;
}

/** A refused save: the control snapped back and says what is still stored. */
export function notSavedLine(value: SharingAudience): string {
  return `Not saved. Still set to ${audienceLabel(value)}.`;
}

/** A profile write counts only when it changed exactly the viewer's one row:
    RLS answers a write to a row that is not yours with no error and no row. */
export function profileWriteSaved(result: { data: readonly unknown[] | null; error: unknown }): boolean {
  return !result.error && result.data?.length === 1;
}

/** The line under "Your tasting notes" on your own profile. */
export function ownNotesLine(value: SharingAudience): string {
  switch (value) {
    case "PUBLIC":
      return "Everyone can see these";
    case "FRIENDS":
      return "Your friends can see these";
    case "PRIVATE":
      return "Only you can see these";
  }
}

/** Every fixed string of the settings surfaces (spec §7.6), owner-approved as drafted (C3). */
export const SHARING_COPY = {
  cardTitle: "Sharing",
  sectionId: "sharing",
  settingsHref: "/profile/edit#sharing",
  cellarLabel: "Who can see your cellar",
  cellarHelp:
    "Your bottles and where you keep them. What you paid, where you bought them and your private notes stay yours.",
  notesLabel: "Who can see your tasting notes",
  notesHelp:
    "Applies to every note you write. A note on a wine in your own unrevealed flight stays hidden until the reveal.",
  cellarControlLabel: "Visible to",
} as const;
```

Create `src/lib/sharing/notice.ts`:

```ts
// The one-time sharing notice on /overview (sharing-defaults spec 2026-09-27
// S4, S15, §7.5). Its wording follows the CURRENT settings, never the flags
// alone: a variant names the cellar only while the flipped cellar is still
// Everyone, and the notes only while the notes setting is still Everyone —
// the CellarVisibilityControl rule that a label never claims a setting the
// row does not hold. Pure: a type-only import, relative paths.
import type { SharingAudience } from "../supabase/database.types";

export type SharingNoticeInput = {
  /** sharing_notices.cellar_flipped: M2 turned this cellar PRIVATE -> PUBLIC. */
  cellarFlipped: boolean;
  /** sharing_notices.notes_shared: a note with content became readable by others. */
  notesShared: boolean;
  /** profiles.cellar_visibility now. */
  cellar: SharingAudience;
  /** profiles.notes_visibility now. */
  notes: SharingAudience;
  /** sharing_notices.dismissed_at. */
  dismissedAt: string | null;
};

export type SharingNoticeCopy = { title: string; body: string; cta: string };

/** The fixed strings around the three variants. */
export const SHARING_NOTICE = {
  eyebrow: "Sharing",
  dismiss: "Got it",
  href: "/profile/edit#sharing",
} as const;

const BOTH: SharingNoticeCopy = {
  title: "Your cellar and tasting notes are now visible to everyone",
  body: "Other Blindr members can now see the bottles in your cellar and the notes you write. You choose who sees each one in your settings.",
  cta: "Change who can see them",
};
const NOTES_ONLY: SharingNoticeCopy = {
  title: "Your tasting notes are now visible to everyone",
  body: "Other Blindr members can now see the notes you write. You choose who sees them in your settings.",
  cta: "Change who can see them",
};
const CELLAR_ONLY: SharingNoticeCopy = {
  title: "Your cellar is now visible to everyone",
  body: "Other Blindr members can now see the bottles in your cellar. You choose who sees it in your settings.",
  cta: "Change who can see it",
};

/** The card's copy, or null when it must not show: dismissed, or nothing it
    would say is still true. */
export function sharingNoticeCopy(input: SharingNoticeInput): SharingNoticeCopy | null {
  if (input.dismissedAt !== null) return null;
  const cellar = input.cellarFlipped && input.cellar === "PUBLIC";
  const notes = input.notesShared && input.notes === "PUBLIC";
  if (cellar && notes) return BOTH;
  if (notes) return NOTES_ONLY;
  if (cellar) return CELLAR_ONLY;
  return null;
}

/** The per-tab storage key that keeps the card hidden for the rest of the
    visit once dismissed, even when the server write failed. */
export function sharingNoticeHiddenKey(userId: string): string {
  return `blindr:sharing-notice-hidden:${userId}`;
}
```

Create `src/lib/notes/shared-notes-view.ts`:

```ts
// What other people's notes look like wherever they show (sharing-defaults
// spec 2026-09-27 S16, §7.1-§7.3): which notes count as having content, the
// one-line summary, the order, the cap, the badges, the score line, and the
// raw PostgREST rows shaped into display rows. Pure: relative imports only,
// no React, no DB, so vitest loads it. The loaders are ./shared-notes.ts.
import { dayMonthYear } from "../cellar/format";
import { TRAINING_COPY } from "../training/copy";
import { scoreWord } from "../wset/note-summary";
import { catalogWineTitle } from "../wset/wine-title";

/** The fixed strings of the three surfaces (spec §7.2-§7.4). */
export const SHARED_NOTES_COPY = {
  othersHeading: "Notes from others",
  profileHeading: "Tasting notes",
  profileHeadingOwn: "Your tasting notes",
  profileEmptyOwn: "No tasting notes yet.",
  change: "Change",
  showFewer: "Show fewer",
  notScored: "Not scored",
  heldTag: "Hidden from others",
  readEyebrow: "Tasting note",
  nothingRecorded: "Nothing recorded yet.",
} as const;

/** Rows shown before "Show all". */
export const NOTES_SHOWN = 5;
/** Rows fetched at most, newest first. */
export const NOTES_FETCHED = 50;
/** Aroma words in a summary line at most. */
export const SUMMARY_AROMAS = 4;
/** Characters of free text in a summary line at most, before the "…". */
export const SUMMARY_MAX = 90;

/**
 * The 17 assessment columns: a note with any of them set has content. The
 * SQL twin is M2's "noted" rule (supabase/migrations/20260927150000_sharing_defaults_flip.sql);
 * shared-notes-view.test.ts pins the two lists together.
 */
export const NOTE_CONTENT_COLUMNS = [
  "clarity",
  "appearance_intensity",
  "colour_hue",
  "condition",
  "nose_intensity",
  "development",
  "sweetness",
  "acidity",
  "tannin",
  "alcohol",
  "body",
  "mousse",
  "flavour_intensity",
  "finish",
  "quality_score",
  "price_category",
  "readiness",
] as const;

export type NoteContentColumn = (typeof NOTE_CONTENT_COLUMNS)[number];
export type NoteContentRow = { [K in NoteContentColumn]: unknown } & { taster_notes: string | null };

/**
 * True when a note has something in it: an assessment, an aroma, or free
 * text with a non-space character. The empty rows "Save all to ratings"
 * writes have none of these and never show to others.
 */
export function noteHasContent(row: NoteContentRow, aromaCount: number): boolean {
  if (aromaCount > 0) return true;
  if (/\S/.test(row.taster_notes ?? "")) return true;
  return NOTE_CONTENT_COLUMNS.some((column) => row[column] !== null && row[column] !== undefined);
}

/**
 * The row's one quiet line: up to four distinct aroma words; else the free
 * text, cut at a word boundary to at most 90 characters plus "…"; else null.
 */
export function noteSummaryLine(input: { aromaWords: readonly string[]; tasterNotes: string | null }): string | null {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of input.aromaWords) {
    const word = raw.trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
    if (words.length === SUMMARY_AROMAS) break;
  }
  if (words.length > 0) return words.join(", ");

  const text = (input.tasterNotes ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length <= SUMMARY_MAX) return text;
  const window = text.slice(0, SUMMARY_MAX + 1);
  const space = window.lastIndexOf(" ");
  const head = (space > 0 ? window.slice(0, space) : text.slice(0, SUMMARY_MAX)).replace(/[\s,;:.]+$/, "");
  return `${head}…`;
}

type Orderable = { id: string; tasted_on: string; created_at: string };

function desc(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? 1 : -1;
}

/** tasted_on desc, created_at desc, id desc — the SQL order, again after filtering. */
export function orderNotes<T extends Orderable>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => desc(a.tasted_on, b.tasted_on) || desc(a.created_at, b.created_at) || desc(a.id, b.id),
  );
}

/** The rows on screen: the first five until "Show all" is pressed. */
export function visibleNotes<T>(rows: readonly T[], expanded: boolean): T[] {
  return expanded ? [...rows] : rows.slice(0, NOTES_SHOWN);
}

/** "Show all {n} notes" — only offered when more than five exist. */
export function showAllLabel(count: number): string | null {
  return count > NOTES_SHOWN ? `Show all ${count} notes` : null;
}

/** The footer under a list that hit the fetch cap. */
export function cappedFooter(fetched: number): string | null {
  return fetched >= NOTES_FETCHED ? `Showing the ${NOTES_FETCHED} most recent notes.` : null;
}

/** "Blind", "Training", or no badge (an OPEN note). */
export function contextBadge(kind: string | null): string | null {
  if (kind === "BLIND") return "Blind";
  if (kind === "TRAINING") return TRAINING_COPY.trainingBadge;
  return null;
}

/** "{n} · {band}", or "Not scored". */
export function scoreLine(score: number | null): string {
  if (score === null) return SHARED_NOTES_COPY.notScored;
  return `${score} · ${scoreWord(score, "en")}`;
}

/** "Tasted 27 Sep 2026", for the read view's author line. */
export function tastedLine(tastedOn: string): string {
  return `Tasted ${dayMonthYear(tastedOn)}`;
}

// --- Raw rows (PostgREST) -> display rows ---------------------------------

type One<T> = T | T[] | null;

function one<T>(rel: One<T> | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

const CONTENT_SELECT = [...NOTE_CONTENT_COLUMNS, "taster_notes"].join(", ");
const AROMA_EMBED = "aromas:wset_note_aromas(term:wset_aroma_terms(term))";

/** "Notes from others" on a wine page: the note, its author, its aroma words. */
export const OTHERS_NOTE_SELECT = [
  "id, author_id, catalog_wine_id, context_kind, tasted_on, created_at",
  CONTENT_SELECT,
  "author:profiles!wset_notes_author_id_fkey(id, display_name, avatar_url)",
  AROMA_EMBED,
].join(", ");

/** A profile's notes: the note, its wine (inner: a wine the reader cannot read drops the row). */
export const PROFILE_NOTE_SELECT = [
  "id, author_id, catalog_wine_id, context_kind, tasted_on, created_at",
  CONTENT_SELECT,
  "catalog_wine:catalog_wines!inner(wine_name, vintage_kind, vintage_year, vintage_tawny_years, image_url, " +
    "producer:producers(name), appellation:appellations(name))",
  AROMA_EMBED,
].join(", ");

type RawAroma = { term: One<{ term: string }> };

export type RawSharedNote = NoteContentRow & {
  id: string;
  author_id: string;
  catalog_wine_id: string | null;
  context_kind: string | null;
  tasted_on: string;
  created_at: string;
  aromas: RawAroma[] | null;
};

export type RawOthersNote = RawSharedNote & {
  author: One<{ id: string; display_name: string; avatar_url: string | null }>;
};

export type RawProfileNote = RawSharedNote & {
  catalog_wine: One<{
    wine_name: string | null;
    vintage_kind: "YEAR" | "NV" | "TAWNY";
    vintage_year: number | null;
    vintage_tawny_years: number | null;
    image_url: string | null;
    producer: One<{ name: string }>;
    appellation: One<{ name: string }>;
  }>;
};

export type SharedNoteRow = {
  id: string;
  href: string;
  tastedOn: string;
  dateLabel: string;
  badge: string | null;
  score: string;
  summary: string | null;
};

export type OthersNoteRow = SharedNoteRow & {
  author: { id: string; name: string; avatarUrl: string | null; href: string };
};

export type ProfileNoteRow = SharedNoteRow & {
  wineTitle: string;
  imageUrl: string | null;
  held: boolean;
};

function aromaWords(raw: RawSharedNote): string[] {
  return (raw.aromas ?? []).map((a) => one(a.term)?.term ?? "").filter(Boolean);
}

function sharedRow(raw: RawSharedNote, wineId: string): SharedNoteRow {
  return {
    id: raw.id,
    href: `/catalog/${wineId}/notes/${raw.id}`,
    tastedOn: raw.tasted_on,
    dateLabel: dayMonthYear(raw.tasted_on),
    badge: contextBadge(raw.context_kind),
    score: scoreLine(typeof raw.quality_score === "number" ? raw.quality_score : null),
    summary: noteSummaryLine({ aromaWords: aromaWords(raw), tasterNotes: raw.taster_notes }),
  };
}

/** The wine page's rows: notes with content and a readable author, newest first. */
export function toOthersNoteRows(raws: readonly RawOthersNote[], wineId: string): OthersNoteRow[] {
  return orderNotes(raws)
    .filter((raw) => noteHasContent(raw, raw.aromas?.length ?? 0))
    .flatMap((raw) => {
      const author = one(raw.author);
      if (!author) return [];
      return [
        {
          ...sharedRow(raw, wineId),
          author: {
            id: author.id,
            name: author.display_name,
            avatarUrl: author.avatar_url,
            href: `/u/${author.id}`,
          },
        },
      ];
    });
}

/** A profile's rows: notes with content on a wine the reader can read, newest first. */
export function toProfileNoteRows(raws: readonly RawProfileNote[], held: ReadonlySet<string>): ProfileNoteRow[] {
  return orderNotes(raws)
    .filter((raw) => noteHasContent(raw, raw.aromas?.length ?? 0))
    .flatMap((raw) => {
      const wine = one(raw.catalog_wine);
      if (!wine || !raw.catalog_wine_id) return [];
      return [
        {
          ...sharedRow(raw, raw.catalog_wine_id),
          wineTitle: catalogWineTitle({
            producerName: one(wine.producer)?.name ?? null,
            wineName: wine.wine_name,
            vintageKind: wine.vintage_kind,
            vintageYear: wine.vintage_year,
            vintageTawnyYears: wine.vintage_tawny_years,
            appellationName: one(wine.appellation)?.name ?? null,
          }),
          imageUrl: wine.image_url,
          held: held.has(raw.id),
        },
      ];
    });
}
```

Create `src/lib/notes/rule1-guard.ts`:

```ts
// The notes Rule 1 guard's refusal (sharing-defaults spec 2026-09-27 S12,
// §5.3; supabase/migrations/20260927140000_sharing_defaults.sql:
// wset_notes_rule1_guard). Pure, relative imports only (the
// src/lib/catalog/rule1-guard.ts pattern), so vitest loads it.

/** The exact message the guard raises; rule1-guard.test.ts pins it to the migration file. */
export const NOTE_RULE1_MESSAGE =
  "This wine is in one of your flights that hasn't been revealed yet. Change or delete this note after the reveal.";

/** The guard's refusal of the author's own write: 42501 with exactly that
    message. RLS's own 42501s ("new row violates row-level security policy …") are not this. */
export function isNoteRule1Refusal(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  return error?.code === "42501" && error?.message === NOTE_RULE1_MESSAGE;
}

/** The name that marks a save error the note sheet shows word for word. */
export const NOTE_SAVE_REFUSAL = "NoteSaveRefusal";

/** A save error the sheet shows as a sentence (every other error keeps the
    bare "Retry save"). */
export function noteSaveRefusal(message: string): Error {
  const error = new Error(message);
  error.name = NOTE_SAVE_REFUSAL;
  return error;
}

/** The sentence to show under the sheet's Save for a thrown save error, or null. */
export function saveRefusalMessage(error: unknown): string | null {
  return error instanceof Error && error.name === NOTE_SAVE_REFUSAL ? error.message : null;
}
```

- [ ] **Step 4: The tour copy, the refusal line and the stale comments.**

```diff
--- a/src/lib/first-run/tour.ts
+++ b/src/lib/first-run/tour.ts
@@ -78,7 +78,7 @@ export function tourSteps(opts: {
       id: "cellar",
       title: "Cellar & Catalog",
       paragraphs: [
-        `Add bottles by ${addBy} — the catalog is everyone's reference, your cellar is yours and private unless you say otherwise.`,
+        `Add bottles by ${addBy} — the catalog is everyone's reference, and other members can see your cellar unless you change it in your profile settings.`,
       ],
     },
     {
@@ -92,7 +92,7 @@ export function tourSteps(opts: {
       id: "community",
       title: "Community",
       paragraphs: [
-        `Find people, ${befriend}, share your invite link. Friends can see each other's cellars when you allow it.`,
+        `Find people, ${befriend}, share your invite link. You choose who sees your cellar and your notes: everyone, friends or only you.`,
       ],
     },
   ];
```

```diff
--- a/src/components/wset/wset-sheet.tsx
+++ b/src/components/wset/wset-sheet.tsx
@@ -65,6 +65,7 @@ import {
   useSheetSteps,
 } from "./sheet-shell";
 import { Button } from "@/components/ui/button";
+import { saveRefusalMessage } from "@/lib/notes/rule1-guard";
 import { cn } from "@/lib/utils";
 
 const CLARITY = ["CLEAR", "HAZY"] as const;
@@ -318,6 +319,10 @@ export function WsetSheet({
   // sheet is clean again, and Close exits without asking.
   const [baseline, setBaseline] = useState<WsetNoteState>(initial);
   const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
+  // A refusal the author must read (the notes Rule 1 guard, sharing-defaults
+  // spec §5.3): shown above the footer until the next save. Any other failed
+  // save keeps the bare "Retry save".
+  const [saveNotice, setSaveNotice] = useState<string | null>(null);
   const [confirmDiscard, setConfirmDiscard] = useState(false);
   const [confirmDelete, setConfirmDelete] = useState(false);
   const [deleting, setDeleting] = useState(false);
@@ -408,13 +413,15 @@ export function WsetSheet({
     // footerAction — and then onSave is required by the prop types.
     if (!onSave) return;
     setSaveState("saving");
+    setSaveNotice(null);
     try {
       await onSave(state);
       setBaseline(state);
       setSaveState("saved");
       setTimeout(() => setSaveState("idle"), 2200);
-    } catch {
+    } catch (error) {
       setSaveState("error");
+      setSaveNotice(saveRefusalMessage(error));
     }
   }, [onSave, state]);
 
@@ -722,6 +729,13 @@ export function WsetSheet({
 
       <SheetFooter
         embedded={embedded}
+        notice={
+          saveNotice ? (
+            <p role="status" className="text-[12.5px] leading-[1.45] text-rose">
+              {saveNotice}
+            </p>
+          ) : undefined
+        }
         progress={
           <SheetFooterProgress
             done={done}
```

```diff
--- a/src/app/catalog/[wineId]/notes/note-editor.tsx
+++ b/src/app/catalog/[wineId]/notes/note-editor.tsx
@@ -5,6 +5,7 @@ import { useRouter } from "next/navigation";
 import { createClient } from "@/lib/supabase/client";
 import { WsetSheet, type WsetSheetHandle } from "@/components/wset/wset-sheet";
 import { NOTES_ARCHIVE_HREF } from "@/lib/wset/note-saved";
+import { NOTE_RULE1_MESSAGE, isNoteRule1Refusal, noteSaveRefusal } from "@/lib/notes/rule1-guard";
 import { aromasToPayload, noteToPayload } from "@/lib/wset/note-state";
 import type { NoteContextKind } from "@/lib/wset/queries";
 import type {
@@ -91,6 +92,9 @@ export function NoteEditor({
           p_aromas: pAromas,
         }));
       }
+      // The notes Rule 1 guard (sharing-defaults spec §5.3): the sheet shows
+      // its sentence rather than a bare "Retry save".
+      if (isNoteRule1Refusal(error)) throw noteSaveRefusal(NOTE_RULE1_MESSAGE);
       if (error) throw new Error(error.message);
       const savedId = data as unknown as string;
       // Back-link a cellar drink to the note it produced (owner-only via RLS).
```

Comments the narrowed policy makes false (S22; `queries.ts` is the planner's addition):

```diff
--- a/src/app/taste/notes/notes-data.ts
+++ b/src/app/taste/notes/notes-data.ts
@@ -1,8 +1,9 @@
 // Everything the Tasting notes archive (/taste/notes) reads: the signed-in
 // author's own notes with their wine, their tasting glass and its tasting's
-// name, and their aroma rows, shaped into NoteArchiveRow. The notes read
-// policy is public (`using (true)`), so the author filter here is the privacy
-// boundary, never RLS. Tasting names come through the author's own membership
+// name, and their aroma rows, shaped into NoteArchiveRow. Other people's
+// notes are readable too when their authors share them (the "wset notes read"
+// policy, sharing defaults), so the author filter here is what keeps this
+// archive the author's own. Tasting names come through the author's own membership
 // under the wines / tastings read policies; a glass the author can no longer
 // read just loses its name. Not a server action: only the page calls it.
 import "server-only";
```

```diff
--- a/src/components/wset/note-modal.tsx
+++ b/src/components/wset/note-modal.tsx
@@ -25,9 +25,10 @@ type EditData = {
 // Opens a saved note as the full WSET sheet — the very editor the note page
 // uses — so a taster can review AND edit it in place: from the Tasting notes
 // archive (/taste/notes) and from a bottle's "Show note" in the cellar. Data is
-// fetched on open by note id. The notes read policy is public, so privacy is
-// the caller's job: pass only the signed-in author's own notes. NoteEditor owns
-// saving.
+// fetched on open by note id. Other people's notes can be readable too (the
+// "wset notes read" policy follows each author's sharing setting), so the
+// caller passes only the signed-in author's own notes: this is their editor.
+// NoteEditor owns saving.
 export function NoteModal({
   noteId,
   wineId,
```

```diff
--- a/src/app/tastings/[id]/open-board.tsx
+++ b/src/app/tastings/[id]/open-board.tsx
@@ -19,8 +19,9 @@ type Row = {
 
 // The group Taste & Rate board: nothing hidden. Every wine shows each
 // participant's score, its average and rater count, ranked by average. Scores
-// come from wset_notes joined on tasting_wine_id (public-read RLS makes them
-// visible across participants) — no new tables. Anyone JOINED can rate any
+// come from wset_notes joined on tasting_wine_id; the "wset notes read" policy
+// shows each participant only the scores their authors share with them (an
+// Only-me taster's score leaves the board) — no new tables. Anyone JOINED can rate any
 // wine at any time; not everyone has to rate everything.
 export function OpenBoard({
   tastingId,
```

```diff
--- a/src/app/tastings/[id]/play/play-experience.tsx
+++ b/src/app/tastings/[id]/play/play-experience.tsx
@@ -289,7 +289,7 @@ export async function PlayExperience({
   // this wine"'s "Your note · {d} of {t} assessed" (it reopens the note
   // instead of starting a blank one). A still-hidden note is only readable
   // by its author under the "wset notes read" policy, but a RESOLVED note
-  // (identity set at the reveal) is readable by anyone once resolved — so an
+  // (identity set at the reveal) is readable by whoever its author shares with — so an
   // explicit author filter is required here to keep this "my own note only".
   const { data: myGlassNotes } = await supabase
     .from("wset_notes")
```

```diff
--- a/src/lib/cellar/lot-sheet.ts
+++ b/src/lib/cellar/lot-sheet.ts
@@ -148,8 +148,9 @@ export async function getLotSheet(
   }
 
   // 4. D7: the spread from the wine's own scored notes plus the viewer's
-  // friendships. A note with an identity is readable by every signed-in user
-  // (`"wset_notes read"`), so this needs no view widening and no migration.
+  // friendships. "wset notes read" returns only the notes each author shares
+  // with this viewer (a held note never), so the spread follows every friend's
+  // own notes setting.
   const { data: spreadData } = await supabase
     .from("wset_notes")
     .select("quality_score, author_id")
```

```diff
--- a/src/lib/wset/queries.ts
+++ b/src/lib/wset/queries.ts
@@ -295,7 +295,8 @@ export async function fetchHiddenNoteState(
 export type WineDescriptor = { term: string; origin: string | null; mentions: number };
 
 // The community's most-mentioned aromas/flavours for a wine, drawn from the
-// public catalog_wine_descriptors view (all notes, any author).
+// catalog_wine_descriptors view (security_invoker: only the notes this viewer
+// may read, sharing defaults S9).
 export async function fetchWineDescriptors(
   supabase: SupabaseClient<Database>,
   wineId: string,
@@ -354,8 +355,9 @@ export type WineStructureDimension = {
   n: number;
 };
 
-// Community-averaged nose/palate structure for a wine (SECURITY DEFINER RPC;
-// aggregates the ordinal SAT fields across all authors). Returned in WSET order
+// Community-averaged nose/palate structure for a wine (SECURITY INVOKER RPC
+// since sharing defaults: averages the ordinal SAT fields over the notes this
+// viewer may read). Returned in WSET order
 // nose -> finish; dimensions with no data are already omitted server-side.
 export async function fetchWineStructure(
   supabase: SupabaseClient<Database>,
```

- [ ] **Step 5: Run them and watch them pass.** `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/sharing src/lib/notes src/lib/first-run note-editor src/components/wset; echo "exit $?"` → exit 0: visibility 10, notice 8, shared-notes-view 29, rule1-guard 8, tour unchanged in count, note-editor 4, and `sheet-markup.test.tsx` passing **without** `-u`.

- [ ] **Step 6: Gates.** tsc exit 0. Full vitest: **B_files + 4 / B_tests + 57**. `cd /c/Users/Public/repos/blindtastingapp-training && npx eslint src/lib/sharing src/lib/notes src/lib/first-run src/components/wset/wset-sheet.tsx src/components/wset/note-modal.tsx "src/app/catalog/[wineId]/notes" src/app/taste/notes/notes-data.ts "src/app/tastings/[id]/open-board.tsx" "src/app/tastings/[id]/play/play-experience.tsx" src/lib/cellar/lot-sheet.ts src/lib/wset/queries.ts; echo "eslint exit $?"` → 0.

- [ ] **Step 7: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/sharing src/lib/notes src/lib/first-run/tour.ts src/lib/first-run/tour.test.ts src/components/wset/wset-sheet.tsx "src/app/catalog/[wineId]/notes/note-editor.tsx" "src/app/catalog/[wineId]/notes/note-editor.test.ts" src/app/taste/notes/notes-data.ts src/components/wset/note-modal.tsx "src/app/tastings/[id]/open-board.tsx" "src/app/tastings/[id]/play/play-experience.tsx" src/lib/cellar/lot-sheet.ts src/lib/wset/queries.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "$(cat <<'EOF'
feat(sharing): audience vocabulary, notice copy, shared-note helpers, the notes rule-1 refusal line

Spec 2026-09-27-sharing-defaults §5.3, §7.1, §7.5, §7.7, S22. Pure modules
for every rule and string; the note sheet shows the guard's sentence; the
tour and the comments stop saying cellars and notes are private/public.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Settings — one `VisibilitySelect`, the Sharing card, `/cellar`

**Files:**
- Create: `src/components/sharing/visibility-select.tsx`, `src/components/sharing/visibility-select.test.tsx`
- Create: `src/components/scroll-to-hash.tsx`
- Modify: `src/app/cellar/cellar-visibility-control.tsx` (becomes a thin use of `VisibilitySelect`), `src/app/cellar/page.tsx`, `src/app/profile/edit/page.tsx`

**Interfaces:**
- Consumes: `AUDIENCE_OPTIONS`, `isSharingAudience`, `notSavedLine`, `profileWriteSaved`, `SHARING_COPY`, `type SharingAudience` (Task 3); `profiles.notes_visibility` and its grant (Task 1).
- Produces: `type SharingColumn = "cellar_visibility" | "notes_visibility"`; `VisibilitySelect({ userId: string; column: SharingColumn; current: SharingAudience; label: string; help?: string; variant?: "field" | "inline" })`; `ScrollToHash({ id: string })`; `CellarVisibilityControl({ userId: string; current: SharingAudience })`; a `Card` with `id="sharing"` on `/profile/edit`, second, after "Edit profile" and before "Appearance".

- [ ] **Step 1: Write the failing test.** Create `src/components/sharing/visibility-select.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VisibilitySelect } from "./visibility-select";

// The first paint of the one sharing control (sharing-defaults spec
// 2026-09-27 S6, S18, §7.6). renderToStaticMarkup runs in node: no DOM, no
// Supabase call (the client is only created on change).

const HELP = "Applies to every note you write.";

describe("VisibilitySelect", () => {
  it("lists Everyone, Friends, Only me in that order, with the stored value selected", () => {
    const html = renderToStaticMarkup(
      <VisibilitySelect userId="u1" column="notes_visibility" current="FRIENDS" label="Who can see your tasting notes" />,
    );
    const options = [...html.matchAll(/<option value="([A-Z]+)"( selected="")?>([^<]+)<\/option>/g)].map((m) => [
      m[1],
      Boolean(m[2]),
      m[3],
    ]);
    expect(options).toEqual([
      ["PUBLIC", false, "Everyone"],
      ["FRIENDS", true, "Friends"],
      ["PRIVATE", false, "Only me"],
    ]);
  });

  it("labels the select and describes it by its help line (field)", () => {
    const html = renderToStaticMarkup(
      <VisibilitySelect userId="u1" column="notes_visibility" current="PUBLIC" label="Who can see your tasting notes" help={HELP} />,
    );
    const selectId = /<select id="([^"]+)"/.exec(html)?.[1];
    const helpId = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(selectId).toBeTruthy();
    expect(html).toContain(`<label for="${selectId}" class="text-sm font-medium">Who can see your tasting notes</label>`);
    expect(html).toContain(`<p id="${helpId}" class="text-xs leading-relaxed text-muted-foreground">${HELP}</p>`);
  });

  it("is a 44px tap target on touch at every width", () => {
    const html = renderToStaticMarkup(
      <VisibilitySelect userId="u1" column="cellar_visibility" current="PUBLIC" label="Visible to" variant="inline" />,
    );
    expect(html).toMatch(/<select[^>]*class="[^"]*\bmin-h-11\b/);
    expect(html).toContain(">Visible to</label>");
    expect(html).not.toContain("aria-describedby");
  });

  it("shows no failure line on first paint", () => {
    const html = renderToStaticMarkup(
      <VisibilitySelect userId="u1" column="cellar_visibility" current="PRIVATE" label="Who can see your cellar" help="h" />,
    );
    expect(html).not.toContain("Not saved");
    expect(html).not.toContain('role="status"');
  });
});
```

- [ ] **Step 2: Run it.** `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/components/sharing; echo "exit $?"` → FAIL (cannot resolve `./visibility-select`).

- [ ] **Step 3: Write the control and the hash helper.** Create `src/components/sharing/visibility-select.tsx`:

```tsx
"use client";

import { useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  AUDIENCE_OPTIONS,
  isSharingAudience,
  notSavedLine,
  profileWriteSaved,
  type SharingAudience,
} from "@/lib/sharing/visibility";
import { cn } from "@/lib/utils";

export type SharingColumn = "cellar_visibility" | "notes_visibility";

/**
 * One sharing setting — who can see your cellar, or your tasting notes —
 * as Everyone / Friends / Only me (sharing-defaults spec 2026-09-27 S6, S18,
 * §7.6). Writes the signed-in person's own profile row as the viewer, under
 * the column grant and "profiles update own". The select never claims a
 * setting the row does not hold: a refused write, or one that matched no row
 * (a session that is no longer this person's), snaps back to what was stored
 * and says so (the old CellarVisibilityControl rule).
 *
 * `variant="inline"` is /cellar's compact "Visible to [select]" row;
 * `variant="field"` is the Sharing card's labelled field with a help line.
 */
export function VisibilitySelect({
  userId,
  column,
  current,
  label,
  help,
  variant = "field",
}: {
  userId: string;
  column: SharingColumn;
  current: SharingAudience;
  label: string;
  help?: string;
  variant?: "field" | "inline";
}) {
  const [value, setValue] = useState<SharingAudience>(current);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const selectId = useId();
  const helpId = useId();

  async function change(next: SharingAudience) {
    const previous = value;
    setValue(next);
    setSaving(true);
    setFailed(false);
    const supabase = createClient();
    const values = column === "cellar_visibility" ? { cellar_visibility: next } : { notes_visibility: next };
    const result = await supabase.from("profiles").update(values).eq("id", userId).select("id");
    if (!profileWriteSaved(result)) {
      setValue(previous);
      setFailed(true);
    }
    setSaving(false);
  }

  const select = (
    <select
      id={selectId}
      value={value}
      aria-describedby={help ? helpId : undefined}
      onChange={(e) => {
        if (isSharingAudience(e.target.value)) void change(e.target.value);
      }}
      disabled={saving}
      className={cn(
        "min-h-11 rounded-md border border-border bg-background px-2 text-sm text-foreground md:pointer-fine:min-h-9",
        variant === "field" ? "w-full" : undefined,
      )}
    >
      {AUDIENCE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  const status = failed ? (
    <span role="status" className="text-xs text-destructive">
      {notSavedLine(value)}
    </span>
  ) : null;

  if (variant === "inline") {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
        <label htmlFor={selectId}>{label}</label>
        {select}
        {status}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium">
        {label}
      </label>
      {select}
      {help ? (
        <p id={helpId} className="text-xs leading-relaxed text-muted-foreground">
          {help}
        </p>
      ) : null}
      {status}
    </div>
  );
}
```

Create `src/components/scroll-to-hash.tsx`:

```tsx
"use client";

import { useEffect } from "react";

/**
 * Brings `#id` into view once the page has mounted, when the URL's hash names
 * it. The window never scrolls in this app (AppShell's content column does),
 * and a hash link that lands while the page is still streaming in may find no
 * element yet; scrollIntoView moves whichever ancestor scrolls. The target
 * carries a scroll-margin for the sticky app header.
 */
export function ScrollToHash({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [id]);
  return null;
}
```

- [ ] **Step 4: Use it.** Replace the whole of `src/app/cellar/cellar-visibility-control.tsx` with:

```tsx
import { VisibilitySelect } from "@/components/sharing/visibility-select";
import { SHARING_COPY, type SharingAudience } from "@/lib/sharing/visibility";

// Owner-only control on /cellar: who may view the cellar, in the same words
// and through the same component as the Sharing card on /profile/edit
// (sharing-defaults spec 2026-09-27 S6, S18). VisibilitySelect keeps the rule
// this control introduced: a failed write snaps back and says what is stored.
export function CellarVisibilityControl({
  userId,
  current,
}: {
  userId: string;
  current: SharingAudience;
}) {
  return (
    <VisibilitySelect
      userId={userId}
      column="cellar_visibility"
      current={current}
      label={SHARING_COPY.cellarControlLabel}
      variant="inline"
    />
  );
}
```

`/cellar` renders no control when the profile read fails (it used to fall back to `"PRIVATE"`):

```diff
--- a/src/app/cellar/page.tsx
+++ b/src/app/cellar/page.tsx
@@ -30,12 +30,13 @@ export default async function CellarPage({
   } = await supabase.auth.getUser();
   if (!user) redirect("/login");
 
+  // A failed read renders no control: falling back to a value would claim a
+  // setting the row may not hold (sharing-defaults spec §7.6).
   const { data: profile } = await supabase
     .from("profiles")
     .select("cellar_visibility")
     .eq("id", user.id)
     .maybeSingle();
-  const visibility = profile?.cellar_visibility ?? "PRIVATE";
 
   const rows = await getCellarBottles(supabase, user.id, user.id, { readOnly: false });
   const stats = headerStats(rows);
@@ -72,7 +73,9 @@ export default async function CellarPage({
                 Add a bottle
               </AddWineButton>
             </div>
-            <CellarVisibilityControl userId={user.id} current={visibility} />
+            {profile ? (
+              <CellarVisibilityControl userId={user.id} current={profile.cellar_visibility} />
+            ) : null}
           </div>
         }
       />
```

The Sharing card on `/profile/edit`:

```diff
--- a/src/app/profile/edit/page.tsx
+++ b/src/app/profile/edit/page.tsx
@@ -1,6 +1,9 @@
 import { redirect } from "next/navigation";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { AppHeader } from "@/components/app-header";
+import { ScrollToHash } from "@/components/scroll-to-hash";
+import { VisibilitySelect } from "@/components/sharing/visibility-select";
+import { SHARING_COPY } from "@/lib/sharing/visibility";
 import { createClient } from "@/lib/supabase/server";
 import { getProfileFavourites, loadFavouriteRegionOptions } from "@/lib/profile-favourites";
 import { AvatarUploader } from "./avatar-uploader";
@@ -22,7 +25,7 @@ export default async function EditProfilePage() {
   const [{ data: profile }, favourites, regionOptions] = await Promise.all([
     supabase
       .from("profiles")
-      .select("display_name, bio, avatar_url, location, phone")
+      .select("display_name, bio, avatar_url, location, phone, cellar_visibility, notes_visibility")
       .eq("id", user.id)
       .single(),
     getProfileFavourites(supabase, user.id),
@@ -57,6 +60,36 @@ export default async function EditProfilePage() {
           </CardContent>
         </Card>
 
+        {/* Sharing (sharing-defaults spec §7.6, S18): who can see your cellar
+            and your tasting notes. Each select saves on its own, like
+            /cellar's. Rendered only with the stored values in hand, so it
+            never shows a setting the row does not hold. #sharing is the
+            Overview notice's and the profile's "Change" target. */}
+        {profile ? (
+          <Card id={SHARING_COPY.sectionId} className="scroll-mt-20">
+            <CardHeader>
+              <CardTitle>{SHARING_COPY.cardTitle}</CardTitle>
+            </CardHeader>
+            <CardContent className="flex flex-col gap-5">
+              <VisibilitySelect
+                userId={user.id}
+                column="cellar_visibility"
+                current={profile.cellar_visibility}
+                label={SHARING_COPY.cellarLabel}
+                help={SHARING_COPY.cellarHelp}
+              />
+              <VisibilitySelect
+                userId={user.id}
+                column="notes_visibility"
+                current={profile.notes_visibility}
+                label={SHARING_COPY.notesLabel}
+                help={SHARING_COPY.notesHelp}
+              />
+              <ScrollToHash id={SHARING_COPY.sectionId} />
+            </CardContent>
+          </Card>
+        ) : null}
+
         {/* Its own card, not a row in the profile form: the theme is a device
             preference kept in this browser, not a column on the profile, and
             putting it inside a form that saves to the server would imply it
```

- [ ] **Step 5: Run it.** `npx vitest run src/components/sharing` → 4 passed.

- [ ] **Step 6: Gates.** tsc exit 0. Full vitest **B_files + 5 / B_tests + 61**. `npx eslint src/components/sharing src/components/scroll-to-hash.tsx src/app/cellar/page.tsx src/app/cellar/cellar-visibility-control.tsx src/app/profile/edit/page.tsx; echo "eslint exit $?"` → 0.

- [ ] **Step 7: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/components/sharing src/components/scroll-to-hash.tsx src/app/cellar/cellar-visibility-control.tsx src/app/cellar/page.tsx src/app/profile/edit/page.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "$(cat <<'EOF'
feat(sharing): Sharing card on /profile/edit; one VisibilitySelect for the cellar and the notes

Spec 2026-09-27-sharing-defaults S6, S18, §7.6. Everyone / Friends / Only me
everywhere; a refused or zero-row write snaps back and says what is stored;
/cellar no longer claims PRIVATE when its profile read fails.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wine page "Notes from others" and the "Hidden from others" tag

**Files:**
- Create: `src/lib/notes/shared-notes.ts`, `src/lib/notes/shared-notes.test.ts`
- Create: `src/app/catalog/[wineId]/others-notes.tsx`, `src/app/catalog/[wineId]/others-notes.test.tsx`
- Modify: `src/app/catalog/[wineId]/page.tsx`, `src/app/catalog/[wineId]/your-notes.tsx`

**Interfaces:**
- Consumes: `OTHERS_NOTE_SELECT`, `NOTES_FETCHED`, `toOthersNoteRows`, `type OthersNoteRow`, `type RawOthersNote`, `SHARED_NOTES_COPY`, `visibleNotes`, `showAllLabel`, `cappedFooter` (Task 3); RPC `wset_my_held_notes` (Task 1).
- Produces: `type SharedNotesResult<Row> = { rows: Row[]; fetched: number }`; `getOthersNotesForWine(supabase: SupabaseClient<Database>, wineId: string, viewerId: string): Promise<SharedNotesResult<OthersNoteRow> | null>`; `getMyHeldNoteIds(supabase, noteIds: readonly string[]): Promise<Set<string>>`; `OthersNotes({ rows: OthersNoteRow[]; fetched: number })`; `YourNoteRow.held: boolean`.

- [ ] **Step 1: Write the failing tests.** Create `src/lib/notes/shared-notes.test.ts`:

```ts
// The shared-notes loaders with the Supabase client replaced by a recording
// fake: no network, no database. What they ask for is the contract the
// "wset notes read" policy then narrows (sharing-defaults spec §7.2, §7.3).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getMyHeldNoteIds, getOthersNotesForWine } from "./shared-notes";
import { OTHERS_NOTE_SELECT } from "./shared-notes-view";

type Result = { data: unknown; error: { code?: string; message: string } | null };

function fakeClient(read: Result, rpc: Result = { data: [], error: null }) {
  const calls: unknown[][] = [];
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "neq", "not", "order"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return chain;
    };
  }
  chain.limit = async (...args: unknown[]) => {
    calls.push(["limit", ...args]);
    return read;
  };
  const client = {
    from: (table: string) => {
      calls.push(["from", table]);
      return chain;
    },
    rpc: async (fn: string, args: unknown) => {
      calls.push(["rpc", fn, args]);
      return rpc;
    },
  };
  return { client: client as never, calls };
}

const EMPTY_CONTENT = {
  clarity: null,
  appearance_intensity: null,
  colour_hue: null,
  condition: null,
  nose_intensity: null,
  development: null,
  sweetness: null,
  acidity: null,
  tannin: null,
  alcohol: null,
  body: null,
  mousse: null,
  flavour_intensity: null,
  finish: null,
  price_category: null,
  readiness: null,
  taster_notes: "",
};

const note = (id: string, over: Record<string, unknown> = {}) => ({
  ...EMPTY_CONTENT,
  id,
  author_id: "u2",
  catalog_wine_id: "w1",
  context_kind: "OPEN",
  tasted_on: "2026-09-20",
  created_at: "2026-09-20T10:00:00+00:00",
  quality_score: 88,
  aromas: [],
  author: { id: "u2", display_name: "Gustav", avatar_url: null },
  catalog_wine: {
    wine_name: "Grand Vin",
    vintage_kind: "YEAR",
    vintage_year: 2015,
    vintage_tawny_years: null,
    image_url: null,
    producer: { name: "Château Margaux" },
    appellation: { name: "Margaux AOC" },
  },
  ...over,
});

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getOthersNotesForWine", () => {
  it("reads this wine's notes by everyone but the viewer, newest first, at most 50", async () => {
    const { client, calls } = fakeClient({ data: [note("n1")], error: null });
    const result = await getOthersNotesForWine(client, "w1", "me");
    expect(calls).toEqual([
      ["from", "wset_notes"],
      ["select", OTHERS_NOTE_SELECT],
      ["eq", "catalog_wine_id", "w1"],
      ["neq", "author_id", "me"],
      ["order", "tasted_on", { ascending: false }],
      ["order", "created_at", { ascending: false }],
      ["order", "id", { ascending: false }],
      ["limit", 50],
    ]);
    expect(result?.fetched).toBe(1);
    expect(result?.rows.map((r) => [r.id, r.author.name, r.score])).toEqual([["n1", "Gustav", "88 · Very good"]]);
  });

  it("counts every fetched row toward the cap, even the empty ones it hides", async () => {
    const { client } = fakeClient({ data: [note("n1"), note("empty", { quality_score: null })], error: null });
    const result = await getOthersNotesForWine(client, "w1", "me");
    expect(result).toMatchObject({ fetched: 2 });
    expect(result?.rows.map((r) => r.id)).toEqual(["n1"]);
  });

  it("answers null on a failed read, never an empty list", async () => {
    const { client } = fakeClient({ data: null, error: { code: "42P01", message: "boom" } });
    await expect(getOthersNotesForWine(client, "w1", "me")).resolves.toBeNull();
  });
});

describe("getMyHeldNoteIds", () => {
  it("asks nothing for no ids", async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await expect(getMyHeldNoteIds(client, [])).resolves.toEqual(new Set());
    expect(calls).toEqual([]);
  });

  it("tags nothing when the read fails", async () => {
    const { client } = fakeClient({ data: null, error: null }, { data: null, error: { message: "boom" } });
    await expect(getMyHeldNoteIds(client, ["n1"])).resolves.toEqual(new Set());
  });
});
```

Create `src/app/catalog/[wineId]/others-notes.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OthersNoteRow } from "../../../lib/notes/shared-notes-view";
import { OthersNotes } from "./others-notes";

// The first paint of "Notes from others" (sharing-defaults spec 2026-09-27 §7.2).

const row = (i: number): OthersNoteRow => ({
  id: `n${i}`,
  href: `/catalog/w1/notes/n${i}`,
  tastedOn: "2026-09-20",
  dateLabel: "20 Sep 2026",
  badge: i === 0 ? "Blind" : null,
  score: "90 · Outstanding",
  summary: i === 0 ? "cedar, violet" : null,
  author: { id: `u${i}`, name: `Taster ${i}`, avatarUrl: null, href: `/u/u${i}` },
});

describe("OthersNotes", () => {
  it("shows five rows, each two sibling links, and offers the rest", () => {
    const html = renderToStaticMarkup(<OthersNotes rows={[0, 1, 2, 3, 4, 5, 6].map(row)} fetched={7} />);
    const items = html.split("<li").slice(1);
    expect(items).toHaveLength(5);
    for (const item of items) {
      const anchors = item.match(/<a /g) ?? [];
      expect(anchors).toHaveLength(2);
      // Siblings: the first link closes before the second opens.
      expect(item.indexOf("</a>")).toBeLessThan(item.lastIndexOf("<a "));
    }
    expect(html).toContain('href="/u/u0"');
    expect(html).toContain('href="/catalog/w1/notes/n0"');
    expect(html).toContain(">Show all 7 notes</button>");
    expect(html).not.toContain("most recent notes");
  });

  it("carries the badge, the score, the summary and a 44px tap target on both links", () => {
    const html = renderToStaticMarkup(<OthersNotes rows={[row(0)]} fetched={1} />);
    expect(html).toContain(">Blind</span>");
    expect(html).toContain(">90 · Outstanding</span>");
    expect(html).toContain(">cedar, violet</span>");
    expect((html.match(/<a [^>]*class="[^"]*\bmin-h-11\b/g) ?? []).length).toBe(2);
    expect(html).not.toContain("Show all");
  });

  it("says the list is cut when the fetch hit its cap", () => {
    const html = renderToStaticMarkup(<OthersNotes rows={[row(0)]} fetched={50} />);
    expect(html).toContain("Showing the 50 most recent notes.");
  });
});
```

- [ ] **Step 2: Run them.** `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run shared-notes.test others-notes; echo "exit $?"` → FAIL (modules missing).

- [ ] **Step 3: Write the loader and the list.** Create `src/lib/notes/shared-notes.ts`:

```ts
// The reads behind other people's notes (sharing-defaults spec 2026-09-27
// S16, S19, §7.2, §7.3). Every read runs as the viewer, so the "wset notes
// read" policy decides what comes back: the author's setting, the Rule 1
// hold and the pour link, and the reader's own "catalog read". The shaping is
// pure, in ./shared-notes-view.ts. A failed read returns null and the caller
// hides the section: never a claim that someone has no notes.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  NOTES_FETCHED,
  OTHERS_NOTE_SELECT,
  toOthersNoteRows,
  type OthersNoteRow,
  type RawOthersNote,
} from "./shared-notes-view";

type Client = SupabaseClient<Database>;

export type SharedNotesResult<Row> = { rows: Row[]; fetched: number };

/** "Notes from others" on a wine's page: everyone's but the viewer's, newest first, at most 50. */
export async function getOthersNotesForWine(
  supabase: Client,
  wineId: string,
  viewerId: string,
): Promise<SharedNotesResult<OthersNoteRow> | null> {
  const { data, error } = await supabase
    .from("wset_notes")
    .select(OTHERS_NOTE_SELECT)
    .eq("catalog_wine_id", wineId)
    .neq("author_id", viewerId)
    .order("tasted_on", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(NOTES_FETCHED);
  if (error) {
    console.error("[shared-notes] others' notes read failed", error.code, error.message);
    return null;
  }
  const raws = (data ?? []) as unknown as RawOthersNote[];
  return { rows: toOthersNoteRows(raws, wineId), fetched: raws.length };
}

/** Which of these are the viewer's own notes others cannot read yet (S19).
    Informational only: a failed read tags nothing. */
export async function getMyHeldNoteIds(supabase: Client, noteIds: readonly string[]): Promise<Set<string>> {
  if (noteIds.length === 0) return new Set();
  const { data, error } = await supabase.rpc("wset_my_held_notes", { p_note_ids: [...noteIds] });
  if (error) {
    console.error("[shared-notes] held-notes read failed", error.code, error.message);
    return new Set();
  }
  return new Set(data ?? []);
}
```

Create `src/app/catalog/[wineId]/others-notes.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  SHARED_NOTES_COPY,
  cappedFooter,
  showAllLabel,
  visibleNotes,
  type OthersNoteRow,
} from "@/lib/notes/shared-notes-view";

/**
 * "Notes from others" on a wine's catalog page (sharing-defaults spec
 * 2026-09-27 S3, S16, §7.2): other people's notes the viewer may read,
 * newest first. Each row is two sibling links, never nested — the author to
 * their profile, the rest to the note's read view. Five show; "Show all"
 * expands in place. The page renders nothing when there are no rows.
 */
export function OthersNotes({ rows, fetched }: { rows: OthersNoteRow[]; fetched: number }) {
  const [expanded, setExpanded] = useState(false);
  const more = showAllLabel(rows.length);
  const footer = cappedFooter(fetched);

  return (
    <section aria-labelledby="others-notes" className="flex flex-col gap-2">
      <h2 id="others-notes" className="text-sm font-medium">
        {SHARED_NOTES_COPY.othersHeading}
      </h2>
      <ul className="flex flex-col gap-2">
        {visibleNotes(rows, expanded).map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-1 rounded-lg border border-border p-1.5 sm:flex-row sm:items-stretch sm:gap-3"
          >
            <Link
              href={row.author.href}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-md px-1.5 text-sm font-medium hover:bg-muted sm:w-44"
            >
              {row.author.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.author.avatarUrl}
                  alt=""
                  className="size-8 shrink-0 rounded-full object-cover ring-1 ring-border"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs"
                >
                  {row.author.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="truncate">{row.author.name}</span>
            </Link>
            <Link
              href={row.href}
              className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md px-1.5 hover:bg-muted"
            >
              <span className="flex items-center gap-2 text-sm">
                <span className="tabular-nums">{row.dateLabel}</span>
                {row.badge ? (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    {row.badge}
                  </Badge>
                ) : null}
                <span className="ml-auto shrink-0 font-medium tabular-nums">{row.score}</span>
              </span>
              {row.summary ? (
                <span className="truncate text-xs text-muted-foreground">{row.summary}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {more ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="min-h-11 self-start rounded-md px-1.5 text-sm font-medium text-primary hover:underline md:pointer-fine:min-h-0"
        >
          {expanded ? SHARED_NOTES_COPY.showFewer : more}
        </button>
      ) : null}
      {footer ? <p className="text-xs text-muted-foreground">{footer}</p> : null}
    </section>
  );
}
```

- [ ] **Step 4: Wire the page and the tag.** "Notes from others" sits directly after "Your notes" and is hidden when empty or when the read failed:

```diff
--- a/src/app/catalog/[wineId]/page.tsx
+++ b/src/app/catalog/[wineId]/page.tsx
@@ -25,6 +25,8 @@ import { WineStructure } from "./wine-structure";
 import { WineAdminControls } from "./wine-admin-controls";
 import { CellarStrip } from "./cellar-strip";
 import { YourNotes } from "./your-notes";
+import { OthersNotes } from "./others-notes";
+import { getMyHeldNoteIds, getOthersNotesForWine } from "@/lib/notes/shared-notes";
 import { getOwnLotsForWine } from "@/lib/cellar/own-lots";
 import { fmtAvg, plural } from "@/lib/cellar/format";
 import { countWord } from "@/lib/count-words";
@@ -65,6 +67,7 @@ export default async function CatalogWinePage({
     { data: usageRows },
     ownLots,
     photoRows,
+    others,
   ] = await Promise.all([
     supabase
       .from("wset_notes")
@@ -81,7 +84,15 @@ export default async function CatalogWinePage({
     supabase.rpc("catalog_wine_usage", { p_id: wineId }),
     getOwnLotsForWine(supabase, user.id, wineId),
     fetchWinePhotos(supabase, wineId, user.id),
+    // "Notes from others" (sharing-defaults spec §7.2): the policy decides
+    // whose notes come back; null on a failed read hides the section.
+    getOthersNotesForWine(supabase, wineId, user.id),
   ]);
+  // Your own notes others cannot read yet carry "Hidden from others" (S19).
+  const heldIds = await getMyHeldNoteIds(
+    supabase,
+    (myNotes ?? []).map((n) => n.id),
+  );
 
   const title = catalogWineTitle(wine);
   const grapes = formatBlend(blend);
@@ -354,9 +365,14 @@ export default async function CatalogWinePage({
             tastedOn: n.tasted_on,
             score: n.quality_score,
             contextKind: n.context_kind,
+            held: heldIds.has(n.id),
           }))}
         />
       </div>
+
+      {others && others.rows.length > 0 ? (
+        <OthersNotes rows={others.rows} fetched={others.fetched} />
+      ) : null}
     </div>
   );
 }
```

```diff
--- a/src/app/catalog/[wineId]/your-notes.tsx
+++ b/src/app/catalog/[wineId]/your-notes.tsx
@@ -6,12 +6,15 @@ import { Badge } from "@/components/ui/badge";
 import { NoteModal } from "@/components/wset/note-modal";
 import { dayMonthYear } from "@/lib/cellar/format";
 import { TRAINING_COPY } from "@/lib/training/copy";
+import { SHARED_NOTES_COPY } from "@/lib/notes/shared-notes-view";
 
 export type YourNoteRow = {
   id: string;
   tastedOn: string;
   score: number | null;
   contextKind: string | null;
+  /** Others cannot read it yet: a Rule 1 hold or a masked pour (sharing-defaults S19). */
+  held: boolean;
 };
 
 /**
@@ -59,6 +62,9 @@ export function YourNotes({
                     {TRAINING_COPY.trainingBadge}
                   </Badge>
                 ) : null}
+                {n.held ? (
+                  <span className="text-xs text-muted-foreground">{SHARED_NOTES_COPY.heldTag}</span>
+                ) : null}
               </span>
               <span className="font-medium">
                 {n.score != null ? `${n.score} pts` : "unscored"}
```

- [ ] **Step 5: Run them.** `npx vitest run shared-notes.test others-notes` → 8 passed (5 + 3).

- [ ] **Step 6: Gates.** tsc exit 0. Full vitest **B_files + 7 / B_tests + 69**. `npx eslint src/lib/notes "src/app/catalog/[wineId]/page.tsx" "src/app/catalog/[wineId]/your-notes.tsx" "src/app/catalog/[wineId]/others-notes.tsx" "src/app/catalog/[wineId]/others-notes.test.tsx"; echo "eslint exit $?"` → 0.

- [ ] **Step 7: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/notes/shared-notes.ts src/lib/notes/shared-notes.test.ts "src/app/catalog/[wineId]/others-notes.tsx" "src/app/catalog/[wineId]/others-notes.test.tsx" "src/app/catalog/[wineId]/page.tsx" "src/app/catalog/[wineId]/your-notes.tsx" && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "$(cat <<'EOF'
feat(catalog): Notes from others on a wine's page; own held notes marked Hidden from others

Spec 2026-09-27-sharing-defaults S3, S16, S19, §7.2. Read as the viewer, so
the notes policy decides; two sibling links per row; five, then Show all.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Profile "Tasting notes"

**Files:**
- Create: `src/app/u/[id]/profile-notes.tsx`, `src/app/u/[id]/profile-notes.test.tsx`
- Modify: `src/lib/notes/shared-notes.ts`, `src/lib/notes/shared-notes.test.ts`, `src/app/u/[id]/page.tsx`

**Interfaces:**
- Consumes: `PROFILE_NOTE_SELECT`, `toProfileNoteRows`, `type ProfileNoteRow`, `type RawProfileNote`, `SHARED_NOTES_COPY`, `visibleNotes`, `showAllLabel`, `cappedFooter` (Task 3); `ownNotesLine`, `SHARING_COPY.settingsHref` (Task 3); `getMyHeldNoteIds`, `SharedNotesResult` (Task 5); `HatchThumb`, `Eyebrow` (existing).
- Produces: `getProfileNotes(supabase, profileId: string, { own }: { own: boolean }): Promise<SharedNotesResult<ProfileNoteRow> | null>`; `ProfileNotes({ rows: ProfileNoteRow[]; fetched: number; own: { line: string; changeHref: string } | null })`.

- [ ] **Step 1: Write the failing tests.** Add the `getProfileNotes` tests to `src/lib/notes/shared-notes.test.ts`:

```diff
--- a/src/lib/notes/shared-notes.test.ts
+++ b/src/lib/notes/shared-notes.test.ts
@@ -5,8 +5,8 @@ import { beforeEach, describe, expect, it, vi } from "vitest";
 
 vi.mock("server-only", () => ({}));
 
-import { getMyHeldNoteIds, getOthersNotesForWine } from "./shared-notes";
-import { OTHERS_NOTE_SELECT } from "./shared-notes-view";
+import { getMyHeldNoteIds, getOthersNotesForWine, getProfileNotes } from "./shared-notes";
+import { OTHERS_NOTE_SELECT, PROFILE_NOTE_SELECT } from "./shared-notes-view";
 
 type Result = { data: unknown; error: { code?: string; message: string } | null };
 
@@ -114,6 +114,33 @@ describe("getOthersNotesForWine", () => {
   });
 });
 
+describe("getProfileNotes", () => {
+  it("reads the person's identified notes and asks which are held only on their own profile", async () => {
+    const own = fakeClient({ data: [note("n1"), note("n2")], error: null }, { data: ["n2"], error: null });
+    const result = await getProfileNotes(own.client, "u2", { own: true });
+    expect(own.calls.slice(0, 4)).toEqual([
+      ["from", "wset_notes"],
+      ["select", PROFILE_NOTE_SELECT],
+      ["eq", "author_id", "u2"],
+      ["not", "catalog_wine_id", "is", null],
+    ]);
+    expect(own.calls).toContainEqual(["rpc", "wset_my_held_notes", { p_note_ids: ["n1", "n2"] }]);
+    expect(result?.rows.map((r) => [r.id, r.held])).toEqual([
+      ["n2", true],
+      ["n1", false],
+    ]);
+
+    const other = fakeClient({ data: [note("n1")], error: null });
+    await getProfileNotes(other.client, "u2", { own: false });
+    expect(other.calls.some((c) => c[0] === "rpc")).toBe(false);
+  });
+
+  it("answers null on a failed read", async () => {
+    const { client } = fakeClient({ data: null, error: { message: "boom" } });
+    await expect(getProfileNotes(client, "u2", { own: true })).resolves.toBeNull();
+  });
+});
+
 describe("getMyHeldNoteIds", () => {
   it("asks nothing for no ids", async () => {
     const { client, calls } = fakeClient({ data: null, error: null });
```

Create `src/app/u/[id]/profile-notes.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProfileNoteRow } from "../../../lib/notes/shared-notes-view";
import { ProfileNotes } from "./profile-notes";

// The first paint of a profile's "Tasting notes" (sharing-defaults spec 2026-09-27 §7.3).

const row = (i: number, held = false): ProfileNoteRow => ({
  id: `n${i}`,
  href: `/catalog/w${i}/notes/n${i}`,
  tastedOn: "2026-09-20",
  dateLabel: "20 Sep 2026",
  badge: null,
  score: "Not scored",
  summary: null,
  wineTitle: `Wine ${i}`,
  imageUrl: null,
  held,
});

const OWN = { line: "Everyone can see these", changeHref: "/profile/edit#sharing" };

describe("ProfileNotes", () => {
  it("on someone else's profile: 'Tasting notes', one link per row, no line, no held tag", () => {
    const html = renderToStaticMarkup(<ProfileNotes rows={[row(1)]} fetched={1} own={null} />);
    expect(html).toContain(">Tasting notes</span>");
    expect(html).not.toContain("Your tasting notes");
    expect(html).not.toContain("can see these");
    expect(html.split("<li").slice(1)[0].match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="/catalog/w1/notes/n1"');
    expect(html).toContain(">Wine 1</span>");
    expect(html).not.toContain("Hidden from others");
  });

  it("on your own: the heading, who can see them, a Change link to the Sharing card, and held tags", () => {
    const html = renderToStaticMarkup(<ProfileNotes rows={[row(1, true), row(2)]} fetched={2} own={OWN} />);
    expect(html).toContain(">Your tasting notes</span>");
    expect(html).toContain("Everyone can see these ·");
    expect(html).toContain('href="/profile/edit#sharing"');
    expect(html).toContain(">Change</a>");
    expect(html.match(/Hidden from others/g)).toHaveLength(1);
  });

  it("says so when your own list is empty", () => {
    const html = renderToStaticMarkup(<ProfileNotes rows={[]} fetched={0} own={OWN} />);
    expect(html).toContain("No tasting notes yet.");
    expect(html).not.toContain("<ul");
  });

  it("shows five until Show all, and 44px row links", () => {
    const html = renderToStaticMarkup(<ProfileNotes rows={[1, 2, 3, 4, 5, 6].map((i) => row(i))} fetched={6} own={null} />);
    expect(html.split("<li").length - 1).toBe(5);
    expect(html).toContain(">Show all 6 notes</button>");
    expect((html.match(/<a [^>]*class="[^"]*\bmin-h-11\b/g) ?? []).length).toBe(5);
  });
});
```

- [ ] **Step 2: Run them.** `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run shared-notes.test profile-notes; echo "exit $?"` → FAIL (`getProfileNotes` is not exported; `./profile-notes` missing).

- [ ] **Step 3: Write the loader and the section.** Add `getProfileNotes` to `src/lib/notes/shared-notes.ts`:

```diff
--- a/src/lib/notes/shared-notes.ts
+++ b/src/lib/notes/shared-notes.ts
@@ -10,9 +10,13 @@ import type { Database } from "@/lib/supabase/database.types";
 import {
   NOTES_FETCHED,
   OTHERS_NOTE_SELECT,
+  PROFILE_NOTE_SELECT,
   toOthersNoteRows,
+  toProfileNoteRows,
   type OthersNoteRow,
+  type ProfileNoteRow,
   type RawOthersNote,
+  type RawProfileNote,
 } from "./shared-notes-view";
 
 type Client = SupabaseClient<Database>;
@@ -42,6 +46,30 @@ export async function getOthersNotesForWine(
   return { rows: toOthersNoteRows(raws, wineId), fetched: raws.length };
 }
 
+/** A person's identified notes as the viewer may read them; `own` adds the held tags. */
+export async function getProfileNotes(
+  supabase: Client,
+  profileId: string,
+  { own }: { own: boolean },
+): Promise<SharedNotesResult<ProfileNoteRow> | null> {
+  const { data, error } = await supabase
+    .from("wset_notes")
+    .select(PROFILE_NOTE_SELECT)
+    .eq("author_id", profileId)
+    .not("catalog_wine_id", "is", null)
+    .order("tasted_on", { ascending: false })
+    .order("created_at", { ascending: false })
+    .order("id", { ascending: false })
+    .limit(NOTES_FETCHED);
+  if (error) {
+    console.error("[shared-notes] profile notes read failed", error.code, error.message);
+    return null;
+  }
+  const raws = (data ?? []) as unknown as RawProfileNote[];
+  const held = own ? await getMyHeldNoteIds(supabase, raws.map((r) => r.id)) : new Set<string>();
+  return { rows: toProfileNoteRows(raws, held), fetched: raws.length };
+}
+
 /** Which of these are the viewer's own notes others cannot read yet (S19).
     Informational only: a failed read tags nothing. */
 export async function getMyHeldNoteIds(supabase: Client, noteIds: readonly string[]): Promise<Set<string>> {
```

Create `src/app/u/[id]/profile-notes.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/overview/eyebrow";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import {
  SHARED_NOTES_COPY,
  cappedFooter,
  showAllLabel,
  visibleNotes,
  type ProfileNoteRow,
} from "@/lib/notes/shared-notes-view";

/**
 * `/u/[id]`'s "Tasting notes" (sharing-defaults spec 2026-09-27 S3, §7.3):
 * the person's notes the viewer may read, newest first, each one link to the
 * note. On your own profile the heading says so, a line says who can see them
 * with a "Change" link to the Sharing card, held notes carry "Hidden from
 * others", and an empty list says so. On someone else's the page renders
 * nothing when there are no rows, so "private" and "none" look the same.
 */
export function ProfileNotes({
  rows,
  fetched,
  own,
}: {
  rows: ProfileNoteRow[];
  fetched: number;
  /** Your own profile: who can see these, and where to change it. */
  own: { line: string; changeHref: string } | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const more = showAllLabel(rows.length);
  const footer = cappedFooter(fetched);

  return (
    <section aria-labelledby="profile-notes" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="profile-notes">
          <Eyebrow size="lg">{own ? SHARED_NOTES_COPY.profileHeadingOwn : SHARED_NOTES_COPY.profileHeading}</Eyebrow>
        </h2>
        {own ? (
          <p className="text-sm text-muted-foreground">
            {own.line} ·{" "}
            <Link href={own.changeHref} className="font-medium text-primary hover:underline">
              {SHARED_NOTES_COPY.change}
            </Link>
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{SHARED_NOTES_COPY.profileEmptyOwn}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleNotes(rows, expanded).map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                className="flex min-h-11 items-center gap-3 rounded-xl border border-border p-2.5 transition-colors hover:bg-muted/30"
              >
                <HatchThumb src={row.imageUrl} width={32} height={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{row.wineTitle}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="tabular-nums">{row.dateLabel}</span>
                    {row.badge ? (
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        {row.badge}
                      </Badge>
                    ) : null}
                    {row.held ? <span>{SHARED_NOTES_COPY.heldTag}</span> : null}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{row.score}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {more ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="min-h-11 self-start rounded-md text-sm font-medium text-primary hover:underline md:pointer-fine:min-h-0"
        >
          {expanded ? SHARED_NOTES_COPY.showFewer : more}
        </button>
      ) : null}
      {footer ? <p className="text-xs text-muted-foreground">{footer}</p> : null}
    </section>
  );
}
```

- [ ] **Step 4: Wire the profile page.** After the tastings list and outside the stats empty state; someone else's section hides when nothing is readable; a deleted profile's page returns earlier and never reaches it:

```diff
--- a/src/app/u/[id]/page.tsx
+++ b/src/app/u/[id]/page.tsx
@@ -26,6 +26,9 @@ import {
 import { ProfileHeader } from "./profile-header";
 import { ProfileStatCards } from "./profile-stat-cards";
 import { ProfileTastings } from "./profile-tastings";
+import { ProfileNotes } from "./profile-notes";
+import { getProfileNotes } from "@/lib/notes/shared-notes";
+import { SHARING_COPY, ownNotesLine } from "@/lib/sharing/visibility";
 
 export default async function ProfilePage({
   params,
@@ -48,7 +51,7 @@ export default async function ProfilePage({
     supabase
       .from("profiles")
       .select(
-        "id, display_name, bio, avatar_url, location, created_at, deleted_at",
+        "id, display_name, bio, avatar_url, location, created_at, deleted_at, notes_visibility",
       )
       .eq("id", id)
       .maybeSingle(),
@@ -101,7 +104,7 @@ export default async function ProfilePage({
   // request the viewer sent, the request waiting on the viewer) and the
   // cellar gate are only meaningful for someone else's profile; stats and
   // favourites run either way. All in parallel.
-  const [friendshipResult, outgoingResult, incomingResult, cellarResult, stats, favourites] =
+  const [friendshipResult, outgoingResult, incomingResult, cellarResult, stats, favourites, notes] =
     await Promise.all([
       isOwnProfile
         ? Promise.resolve(null)
@@ -131,6 +134,9 @@ export default async function ProfilePage({
       getProfileStats(profile.id),
       // Null on a failed read: the chips then simply do not render (D11).
       getProfileFavourites(supabase, profile.id),
+      // "Tasting notes" (sharing-defaults spec §7.3): as the viewer, so the
+      // policy decides; null on a failed read hides the section.
+      getProfileNotes(supabase, profile.id, { own: isOwnProfile }),
     ]);
   const friendState = relationship({
     friend: Boolean(friendshipResult?.data),
@@ -214,6 +220,21 @@ export default async function ProfilePage({
             {rows.length > 0 ? <ProfileTastings rows={rows} footer={footer} /> : null}
           </>
         )}
+
+        {/* After the tastings, and outside the stats empty state: notes are
+            not guesses. Someone else's section hides when nothing is readable,
+            so "private" and "no notes" look the same. */}
+        {notes && (isOwnProfile || notes.rows.length > 0) ? (
+          <ProfileNotes
+            rows={notes.rows}
+            fetched={notes.fetched}
+            own={
+              isOwnProfile
+                ? { line: ownNotesLine(profile.notes_visibility), changeHref: SHARING_COPY.settingsHref }
+                : null
+            }
+          />
+        ) : null}
       </div>
     </div>
   );
```

- [ ] **Step 5: Run them.** `npx vitest run shared-notes.test profile-notes` → 11 passed (7 + 4).

- [ ] **Step 6: Gates.** tsc exit 0. Full vitest **B_files + 8 / B_tests + 75**. `npx eslint src/lib/notes "src/app/u/[id]/page.tsx" "src/app/u/[id]/profile-notes.tsx" "src/app/u/[id]/profile-notes.test.tsx"; echo "eslint exit $?"` → 0.

- [ ] **Step 7: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/notes/shared-notes.ts src/lib/notes/shared-notes.test.ts "src/app/u/[id]/profile-notes.tsx" "src/app/u/[id]/profile-notes.test.tsx" "src/app/u/[id]/page.tsx" && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "$(cat <<'EOF'
feat(profile): Tasting notes on /u/[id]

Spec 2026-09-27-sharing-defaults S3, §7.3. Someone else's list hides when
nothing is readable; your own says who can see it, links to the Sharing
card and tags held notes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The read-only note view

**Files:**
- Create: `src/lib/wset/note-captions.ts`
- Create: `src/lib/notes/note-read.ts`, `src/lib/notes/note-read.test.ts`
- Create: `src/app/catalog/[wineId]/notes/[noteId]/note-read-view.tsx`, `src/app/catalog/[wineId]/notes/[noteId]/note-read-view.test.tsx`
- Modify: `src/components/wset/wset-sheet.tsx` (import `NOTE_CAPTIONS` instead of defining it), `src/app/catalog/[wineId]/notes/[noteId]/page.tsx`

**Interfaces:**
- Consumes: `composeLiveNote` (`src/lib/wset/live-note.mjs`), `labelsFor`, `makeT`, `noteConnectors`, `translateBand` (`src/lib/wset/i18n.ts`), `qualityBand`, `fetchNoteView` and `fetchCatalogWine`/`catalogWineTitle` (`src/lib/wset/queries.ts`), `contextBadge`, `scoreLine`, `tastedLine`, `SHARED_NOTES_COPY` (Task 3).
- Produces: `src/lib/wset/note-captions.ts`: `type NoteSectionKey`, `NOTE_CAPTIONS: readonly { key: NoteSectionKey; uiKey: string }[]`; `src/lib/notes/note-read.ts`: `type NoteReadSection = { caption: string; prose: string }`, `noteReadSections(state: WsetNoteState, termLabels: ReadonlyMap<string, string>): NoteReadSection[]`, `type NoteRouteMode = "not-found" | "editor" | "read"`, `noteRouteMode(input: { wineFound: boolean; note: { author_id: string; catalog_wine_id: string | null } | null; wineId: string; viewerId: string }): NoteRouteMode`; `NoteReadView(props: NoteReadViewProps)`.

- [ ] **Step 1: Write the failing tests.** Create `src/lib/notes/note-read.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { labelsFor, noteConnectors } from "../wset/i18n";
import { composeLiveNote } from "../wset/live-note.mjs";
import { emptyNoteState } from "../wset/note-state";
import { noteReadSections, noteRouteMode } from "./note-read";

// The read-only note view's prose (sharing-defaults spec 2026-09-27 S17, §7.4).

const TERMS = new Map([
  ["t-cedar", "cedar"],
  ["t-cherry", "black cherry"],
]);

describe("noteReadSections", () => {
  it("is empty for a note with nothing recorded", () => {
    expect(noteReadSections(emptyNoteState(), TERMS)).toEqual([]);
  });

  it("names and orders the sections as the live note does, skipping empty ones", () => {
    const state = {
      ...emptyNoteState(),
      clarity: "CLEAR" as const,
      noseTermIds: ["t-cedar"],
      qualityScore: 91,
      tasterNotes: "Firm and long.",
    };
    const sections = noteReadSections(state, TERMS);
    expect(sections.map((s) => s.caption)).toEqual(["Appearance", "Nose", "Conclusions", "Taster"]);
    const composed = composeLiveNote(state, TERMS, labelsFor("en"), noteConnectors("en"));
    expect(sections.map((s) => s.prose)).toEqual([
      composed.appearance,
      composed.nose,
      composed.conclusions,
      composed.taster,
    ]);
    expect(sections[1].prose).toContain("cedar");
    expect(sections[3].prose).toContain("Firm and long.");
  });
});

describe("noteRouteMode", () => {
  const note = { author_id: "author", catalog_wine_id: "w1" };
  const base = { wineFound: true, note, wineId: "w1", viewerId: "author" };

  it("gives the author the editor and anyone else the read view", () => {
    expect(noteRouteMode(base)).toBe("editor");
    expect(noteRouteMode({ ...base, viewerId: "someone" })).toBe("read");
  });

  it("answers not found alike for a hidden or missing note, another wine's note, and an unreadable wine", () => {
    expect(noteRouteMode({ ...base, note: null, viewerId: "someone" })).toBe("not-found");
    expect(noteRouteMode({ ...base, note: { ...note, catalog_wine_id: "w2" } })).toBe("not-found");
    expect(noteRouteMode({ ...base, note: { ...note, catalog_wine_id: null } })).toBe("not-found");
    expect(noteRouteMode({ ...base, wineFound: false })).toBe("not-found");
  });
});
```

Create `src/app/catalog/[wineId]/notes/[noteId]/note-read-view.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoteReadView, type NoteReadViewProps } from "./note-read-view";

// Someone else's note, read-only (sharing-defaults spec 2026-09-27 S17, §7.4).

const PROPS: NoteReadViewProps = {
  wineId: "w1",
  wineTitle: "Château Margaux Grand Vin 2015",
  author: { id: "u2", name: "Gustav", avatarUrl: null },
  tastedLine: "Tasted 20 Sep 2026",
  badge: "Blind",
  score: "91 · Outstanding",
  sections: [
    { caption: "Appearance", prose: "Clear, deep ruby." },
    { caption: "Taster", prose: "Firm and long." },
  ],
};

describe("NoteReadView", () => {
  it("shows the wine, the author, the date, the badge, the score and the prose in order", () => {
    const html = renderToStaticMarkup(<NoteReadView {...PROPS} />);
    expect(html).toContain(">Tasting note</span>");
    expect(html).toContain('<a class="hover:underline" href="/catalog/w1">Château Margaux Grand Vin 2015</a>');
    expect(html).toContain('href="/u/u2"');
    expect(html).toContain("Gustav</a>");
    expect(html).toContain("<span>· Tasted 20 Sep 2026</span>");
    expect(html).toContain(">Blind</span>");
    expect(html).toContain(">91 · Outstanding</p>");
    expect(html.indexOf("Clear, deep ruby.")).toBeLessThan(html.indexOf("Firm and long."));
  });

  it("never offers an edit, delete or share control", () => {
    const html = renderToStaticMarkup(<NoteReadView {...PROPS} />);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
    expect(html.match(/<a /g)).toHaveLength(2);
  });

  it("says so when nothing was recorded", () => {
    const html = renderToStaticMarkup(<NoteReadView {...PROPS} sections={[]} score="Not scored" />);
    expect(html).toContain("Nothing recorded yet.");
    expect(html).toContain(">Not scored</p>");
  });
});
```

- [ ] **Step 2: Run them.** `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run note-read; echo "exit $?"` → FAIL (modules missing).

- [ ] **Step 3: Move `NOTE_CAPTIONS` out of the sheet, and write the helpers and the view.** Create `src/lib/wset/note-captions.ts`:

```ts
// The live-note section keys in the order the note reads, paired with the
// UI-dict key that names each one (./i18n's makeT). Shared by the WSET sheet's
// live note and the read-only note view (sharing-defaults spec §7.4), so the
// two can never order or name a section differently. Pure: a type-only import.
import type { composeLiveNote } from "./live-note.mjs";

export type NoteSectionKey = keyof ReturnType<typeof composeLiveNote>;

export const NOTE_CAPTIONS: readonly { key: NoteSectionKey; uiKey: string }[] = [
  { key: "appearance", uiKey: "appearance" },
  { key: "nose", uiKey: "nose" },
  { key: "palate", uiKey: "palate" },
  { key: "conclusions", uiKey: "conclusions" },
  { key: "taster", uiKey: "taster" },
];
```

```diff
--- a/src/components/wset/wset-sheet.tsx
+++ b/src/components/wset/wset-sheet.tsx
@@ -42,6 +42,7 @@ import {
 } from "@/lib/wset/i18n";
 import { useWsetLang } from "@/lib/wset/wset-lang";
 import { composeLiveNote } from "@/lib/wset/live-note.mjs";
+import { NOTE_CAPTIONS } from "@/lib/wset/note-captions";
 import { qualityBand } from "@/lib/wset/quality-curve.mjs";
 import { SnapSlider } from "./snap-slider";
 import { PillGroup } from "./pill-group";
@@ -76,15 +77,6 @@ const MOUSSE = ["DELICATE", "CREAMY", "AGGRESSIVE"] as const;
 const PRICE = ["INEXPENSIVE", "MID_PRICED", "HIGH_PRICED", "PREMIUM", "DONT_KNOW"] as const;
 const READINESS = ["NEEDS_TIME", "READY_CAN_IMPROVE", "READY_WONT_IMPROVE", "TOO_OLD"] as const;
 
-// The live-note section keys, paired with the UI-dict key that names each one.
-const NOTE_CAPTIONS: { key: keyof ReturnType<typeof composeLiveNote>; uiKey: string }[] = [
-  { key: "appearance", uiKey: "appearance" },
-  { key: "nose", uiKey: "nose" },
-  { key: "palate", uiKey: "palate" },
-  { key: "conclusions", uiKey: "conclusions" },
-  { key: "taster", uiKey: "taster" },
-];
-
 type SectionId = "appearance" | "nose" | "palate" | "conclusions";
 const SECTION_ORDER: readonly SectionId[] = ["appearance", "nose", "palate", "conclusions"];
 // On the note page a switched-to section scrolls in under the app header plus
```

Create `src/lib/notes/note-read.ts`:

```ts
// A saved note as prose, for the read-only note view (sharing-defaults spec
// 2026-09-27 S17, §7.4): composeLiveNote over the note's state, in English,
// section by section in NOTE_CAPTIONS order, the same words and order as the
// live note its author saw while writing it. Empty sections are left out.
// Pure: relative imports only, so vitest loads it.
import { labelsFor, makeT, noteConnectors, translateBand } from "../wset/i18n";
import { composeLiveNote } from "../wset/live-note.mjs";
import { NOTE_CAPTIONS } from "../wset/note-captions";
import { qualityBand } from "../wset/quality-curve.mjs";
import type { WsetNoteState } from "../wset/types";

export type NoteReadSection = { caption: string; prose: string };

export function noteReadSections(
  state: WsetNoteState,
  termLabels: ReadonlyMap<string, string>,
): NoteReadSection[] {
  const t = makeT("en");
  const composed = composeLiveNote(state, termLabels, labelsFor("en"), {
    ...noteConnectors("en"),
    band: (score: number) => translateBand(qualityBand(score), "en"),
  });
  return NOTE_CAPTIONS.flatMap(({ key, uiKey }) => {
    const prose = composed[key];
    return typeof prose === "string" && prose ? [{ caption: t(uiKey), prose }] : [];
  });
}

export type NoteRouteMode = "not-found" | "editor" | "read";

/**
 * What `/catalog/[wineId]/notes/[noteId]` renders (spec S17, §7.4). The note
 * row comes back only when the "wset notes read" policy admits the viewer,
 * so a hidden note, a missing id, a note on another wine and a wine the
 * viewer cannot read all get the same answer: not found. The author gets the
 * editor; anyone else the read view.
 */
export function noteRouteMode(input: {
  wineFound: boolean;
  note: { author_id: string; catalog_wine_id: string | null } | null;
  wineId: string;
  viewerId: string;
}): NoteRouteMode {
  if (!input.wineFound || !input.note || input.note.catalog_wine_id !== input.wineId) return "not-found";
  return input.note.author_id === input.viewerId ? "editor" : "read";
}
```

Create `src/app/catalog/[wineId]/notes/[noteId]/note-read-view.tsx`:

```tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/overview/eyebrow";
import { SHARED_NOTES_COPY } from "@/lib/notes/shared-notes-view";
import type { NoteReadSection } from "@/lib/notes/note-read";

export type NoteReadViewProps = {
  wineId: string;
  wineTitle: string;
  author: { id: string; name: string; avatarUrl: string | null };
  /** "Tasted 27 Sep 2026". */
  tastedLine: string;
  /** "Blind", "Training", or none. */
  badge: string | null;
  /** "91 · Outstanding", or "Not scored". */
  score: string;
  sections: NoteReadSection[];
};

/**
 * Someone else's note, read-only (sharing-defaults spec 2026-09-27 S17,
 * §7.4): the wine, who tasted it and when, the score, and the note's composed
 * prose section by section. A server component — nothing but these strings
 * reaches the browser. It never shows the tasting, the glass, or any edit,
 * delete or share control.
 */
export function NoteReadView({ wineId, wineTitle, author, tastedLine, badge, score, sections }: NoteReadViewProps) {
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-col gap-2">
        <Eyebrow size="lg">{SHARED_NOTES_COPY.readEyebrow}</Eyebrow>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          <Link href={`/catalog/${wineId}`} className="hover:underline">
            {wineTitle}
          </Link>
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <Link
            href={`/u/${author.id}`}
            className="inline-flex min-h-11 items-center gap-2 font-medium text-foreground hover:underline md:pointer-fine:min-h-0"
          >
            {author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={author.avatarUrl} alt="" className="size-6 rounded-full object-cover ring-1 ring-border" />
            ) : (
              <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-secondary text-[11px]">
                {author.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            {author.name}
          </Link>
          <span>· {tastedLine}</span>
          {badge ? (
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {badge}
            </Badge>
          ) : null}
        </p>
      </header>

      <p className="font-heading text-2xl font-semibold tabular-nums">{score}</p>

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">{SHARED_NOTES_COPY.nothingRecorded}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {sections.map((section) => (
            <section key={section.caption}>
              <h2>
                <Eyebrow>{section.caption}</Eyebrow>
              </h2>
              <p className="mt-1 font-heading text-[15px] leading-relaxed italic">{section.prose}</p>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 4: Branch the route.** The author keeps the editor, unchanged; anyone the policy admits gets the read view; everything else is `notFound()`:

```diff
--- a/src/app/catalog/[wineId]/notes/[noteId]/page.tsx
+++ b/src/app/catalog/[wineId]/notes/[noteId]/page.tsx
@@ -1,9 +1,12 @@
 import { notFound, redirect } from "next/navigation";
 import { createClient } from "@/lib/supabase/server";
-import { fetchCatalogWine, catalogWineTitle } from "@/lib/wset/queries";
+import { fetchCatalogWine, catalogWineTitle, fetchNoteView } from "@/lib/wset/queries";
 import { noteStateFromRow } from "@/lib/wset/note-state";
 import type { AromaTerm } from "@/lib/wset/types";
+import { noteReadSections, noteRouteMode } from "@/lib/notes/note-read";
+import { contextBadge, scoreLine, tastedLine } from "@/lib/notes/shared-notes-view";
 import { NoteEditor } from "../note-editor";
+import { NoteReadView } from "./note-read-view";
 
 export default async function EditNotePage({
   params,
@@ -17,18 +20,35 @@ export default async function EditNotePage({
   } = await supabase.auth.getUser();
   if (!user) redirect("/login");
 
-  const wine = await fetchCatalogWine(supabase, wineId);
-  if (!wine) notFound();
+  const [wine, { data: note }] = await Promise.all([
+    fetchCatalogWine(supabase, wineId),
+    supabase.from("wset_notes").select("*").eq("id", noteId).maybeSingle(),
+  ]);
+  // The "wset notes read" policy decides who reads a note (sharing-defaults
+  // spec S8, S17): its author always; anyone else only an identified note
+  // whose author shares with them and that is not held. A note it hides gets
+  // the same answer as one that does not exist.
+  const mode = noteRouteMode({ wineFound: Boolean(wine), note, wineId, viewerId: user.id });
+  if (mode === "not-found" || !wine || !note) notFound();
 
-  const { data: note } = await supabase
-    .from("wset_notes")
-    .select("*")
-    .eq("id", noteId)
-    .maybeSingle();
-  // Only the author edits a note (RLS also blocks the write); others reach it
-  // read-only via the wine's aggregate, not this editor.
-  if (!note || note.author_id !== user.id || note.catalog_wine_id !== wineId) {
-    notFound();
+  // Anyone but the author: a server-rendered read view, never the editor.
+  if (mode === "read") {
+    const [view, { data: author }] = await Promise.all([
+      fetchNoteView(supabase, noteId),
+      supabase.from("profiles").select("id, display_name, avatar_url").eq("id", note.author_id).maybeSingle(),
+    ]);
+    if (!view || !author) notFound();
+    return (
+      <NoteReadView
+        wineId={wineId}
+        wineTitle={catalogWineTitle(wine)}
+        author={{ id: author.id, name: author.display_name, avatarUrl: author.avatar_url }}
+        tastedLine={tastedLine(view.tastedOn)}
+        badge={contextBadge(view.contextKind)}
+        score={scoreLine(view.state.qualityScore)}
+        sections={noteReadSections(view.state, view.termLabels)}
+      />
+    );
   }
 
   const { data: aromaRows } = await supabase
```

- [ ] **Step 5: Run them.** `npx vitest run note-read src/components/wset` → note-read 4, note-read-view 3, and the wset suites (including `sheet-markup.test.tsx`, no `-u`) pass.

- [ ] **Step 6: Gates.** tsc exit 0. Full vitest **B_files + 10 / B_tests + 82**. `npx eslint src/lib/wset/note-captions.ts src/lib/notes src/components/wset/wset-sheet.tsx "src/app/catalog/[wineId]/notes"; echo "eslint exit $?"` → 0.

- [ ] **Step 7: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/wset/note-captions.ts src/lib/notes/note-read.ts src/lib/notes/note-read.test.ts "src/app/catalog/[wineId]/notes/[noteId]/note-read-view.tsx" "src/app/catalog/[wineId]/notes/[noteId]/note-read-view.test.tsx" "src/app/catalog/[wineId]/notes/[noteId]/page.tsx" src/components/wset/wset-sheet.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "$(cat <<'EOF'
feat(notes): read-only note view for anyone but the author

Spec 2026-09-27-sharing-defaults S17, §7.4. Server-rendered from the note's
composed prose in the sheet's own section order; a note the policy hides is
not found, like a missing id.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The one-time notice on `/overview`, and the CLAUDE.md bullet

**Files:**
- Create: `src/lib/sharing/actions.ts`, `src/lib/sharing/actions.test.ts`
- Create: `src/app/overview/sharing-notice.tsx`, `src/app/overview/sharing-notice.test.tsx`
- Modify: `src/app/overview/page.tsx`, `CLAUDE.md`

**Interfaces:**
- Consumes: `sharingNoticeCopy`, `SHARING_NOTICE`, `sharingNoticeHiddenKey`, `type SharingNoticeCopy` (Task 3); `readFlag`, `writeFlag` (`src/lib/safe-storage.ts`); `sharing_notices` and its grants (Task 1, rows from M2).
- Produces: `dismissSharingNotice(): Promise<boolean>` (`"use server"`, the file's only export); `SharingNotice({ userId: string; copy: SharingNoticeCopy })`, rendered as the first child of `/overview`'s `<main>` at every width.

- [ ] **Step 1: Write the failing tests.** Create `src/lib/sharing/actions.test.ts`:

```ts
// The sharing notice's dismissal (spec S15), with the Supabase server client
// replaced by a recording fake: no network, no cookies, no database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  userId: "user-1" as string | null,
  refuse: false,
  writes: [] as { table: string; values: Record<string, unknown>; column: string; value: unknown }[],
}));

vi.mock("../supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: fake.userId ? { id: fake.userId } : null }, error: null }),
    },
    from: (table: string) => ({
      update: (values: Record<string, unknown>) => ({
        eq: async (column: string, value: unknown) => {
          fake.writes.push({ table, values, column, value });
          return { error: fake.refuse ? { message: "permission denied for table sharing_notices" } : null };
        },
      }),
    }),
  }),
}));

import { dismissSharingNotice } from "./actions";

beforeEach(() => {
  fake.userId = "user-1";
  fake.refuse = false;
  fake.writes.length = 0;
});

describe("dismissSharingNotice", () => {
  it("stamps dismissed_at on the signed-in person's own notice, and nothing else", async () => {
    const before = Date.now();
    await expect(dismissSharingNotice()).resolves.toBe(true);
    expect(fake.writes).toHaveLength(1);
    const [write] = fake.writes;
    expect(write.table).toBe("sharing_notices");
    expect([write.column, write.value]).toEqual(["user_id", "user-1"]);
    expect(Object.keys(write.values)).toEqual(["dismissed_at"]);
    const at = Date.parse(String(write.values.dismissed_at));
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it("writes nothing and answers false when signed out", async () => {
    fake.userId = null;
    await expect(dismissSharingNotice()).resolves.toBe(false);
    expect(fake.writes).toHaveLength(0);
  });

  it("answers false, without throwing, when the write is refused", async () => {
    fake.refuse = true;
    await expect(dismissSharingNotice()).resolves.toBe(false);
  });
});
```

Create `src/app/overview/sharing-notice.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The server action is never called on first paint; the mock keeps the
// server client's imports (next/headers) out of this node test.
vi.mock("@/lib/sharing/actions", () => ({ dismissSharingNotice: vi.fn(async () => true) }));

import { sharingNoticeCopy } from "../../lib/sharing/notice";
import { SharingNotice } from "./sharing-notice";

// The Overview notice's first paint (sharing-defaults spec 2026-09-27 §7.5).

const copy = sharingNoticeCopy({
  cellarFlipped: true,
  notesShared: true,
  cellar: "PUBLIC",
  notes: "PUBLIC",
  dismissedAt: null,
})!;

describe("SharingNotice", () => {
  it("shows the eyebrow, the copy, the settings link and Got it", () => {
    const html = renderToStaticMarkup(<SharingNotice userId="u1" copy={copy} />);
    expect(html).toContain(">Sharing</span>");
    expect(html).toContain(`>${copy.title}</h2>`);
    expect(html).toContain(`>${copy.body}</p>`);
    expect(html).toMatch(/<a [^>]*href="\/profile\/edit#sharing"[^>]*>Change who can see them<\/a>/);
    expect(html).toContain(">Got it</button>");
  });

  it("gives both actions a 44px tap target on touch", () => {
    const html = renderToStaticMarkup(<SharingNotice userId="u1" copy={copy} />);
    expect((html.match(/class="[^"]*\bmin-h-11\b[^"]*"/g) ?? []).length).toBe(2);
  });

  it("is a quiet bordered card, not the bordeaux banner", () => {
    const html = renderToStaticMarkup(<SharingNotice userId="u1" copy={copy} />);
    expect(html).toContain("border-border bg-card");
    expect(html).not.toContain("bg-primary");
  });
});
```

- [ ] **Step 2: Run them.** `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/sharing/actions sharing-notice; echo "exit $?"` → FAIL (modules missing).

- [ ] **Step 3: Write the action and the card.** Create `src/lib/sharing/actions.ts`:

```ts
"use server";

// The one client write of the sharing notice (sharing-defaults spec
// 2026-09-27 S14, S15, §7.5): the signed-in person stamps dismissed_at on
// their own sharing_notices row, under the column grant and "sharing notices
// dismiss own". A "use server" module exports async functions only
// (CLAUDE.md); the copy and every rule live in ./notice.ts.
//
// Relative import, not "@/lib/supabase/server": actions.test.ts replaces the
// client with vi.mock.
import { createClient } from "../supabase/server";

/** "Got it" and the settings link on /overview's notice. False when signed
    out or refused; the card stays hidden for the visit either way. */
export async function dismissSharingNotice(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase
    .from("sharing_notices")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("user_id", user.id);
  return !error;
}
```

Create `src/app/overview/sharing-notice.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { dismissSharingNotice } from "@/lib/sharing/actions";
import { SHARING_NOTICE, sharingNoticeHiddenKey, type SharingNoticeCopy } from "@/lib/sharing/notice";
import { readFlag, writeFlag } from "@/lib/safe-storage";

const noopSubscribe = () => () => {};
const tabStorage = () => window.sessionStorage;

/**
 * The one-time sharing notice (sharing-defaults spec 2026-09-27 S4, S15,
 * §7.5): a quiet bordered card, first in /overview's <main> at every width.
 * `copy` arrives already chosen by sharingNoticeCopy from the current
 * settings. "Got it" hides it at once; the settings link navigates away.
 * Both stamp dismissed_at through dismissSharingNotice, so it never shows
 * again on any device, and both set a per-tab flag, so a failed write (or a
 * back navigation to a cached page) keeps it hidden for the rest of the visit.
 */
export function SharingNotice({ userId, copy }: { userId: string; copy: SharingNoticeCopy }) {
  const key = sharingNoticeHiddenKey(userId);
  const hiddenThisVisit = useSyncExternalStore(noopSubscribe, () => readFlag(tabStorage, key), () => false);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || hiddenThisVisit) return null;

  function remember() {
    writeFlag(tabStorage, key);
    void dismissSharingNotice();
  }

  return (
    <section
      aria-labelledby="sharing-notice-title"
      className="flex flex-col gap-2 rounded-[13px] border border-border bg-card p-[16px_18px]"
    >
      <Eyebrow size="sm">{SHARING_NOTICE.eyebrow}</Eyebrow>
      <h2 id="sharing-notice-title" className="font-heading text-lg leading-snug font-semibold">
        {copy.title}
      </h2>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Link
          href={SHARING_NOTICE.href}
          onClick={remember}
          className="inline-flex min-h-11 items-center rounded-[9px] border border-border bg-background px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted md:pointer-fine:min-h-9"
        >
          {copy.cta}
        </Link>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            remember();
          }}
          className="inline-flex min-h-11 items-center rounded-[9px] px-4 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground md:pointer-fine:min-h-9"
        >
          {SHARING_NOTICE.dismiss}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire `/overview`.** The profile select gains both settings; the viewer's own `sharing_notices` row is read with `.maybeSingle()`; a read error means no card:

```diff
--- a/src/app/overview/page.tsx
+++ b/src/app/overview/page.tsx
@@ -14,6 +14,8 @@ import { TastingsCard } from "./tastings-card";
 import { RatingsCard } from "./ratings-card";
 import { CellarCard } from "./cellar-card";
 import { QuickActions } from "./quick-actions";
+import { SharingNotice } from "./sharing-notice";
+import { sharingNoticeCopy } from "@/lib/sharing/notice";
 
 // The logged-in landing page: the live / next-up banner, the three subject
 // cards in the redesign's fixed order (Blind tastings → Ratings → Cellar) and
@@ -29,10 +31,10 @@ export default async function OverviewPage() {
   } = await supabase.auth.getUser();
   if (!user) redirect("/login");
 
-  const [{ data: profile }, data, invitation, active] = await Promise.all([
+  const [{ data: profile }, data, invitation, active, notice] = await Promise.all([
     supabase
       .from("profiles")
-      .select("display_name, avatar_url")
+      .select("display_name, avatar_url, cellar_visibility, notes_visibility")
       .eq("id", user.id)
       .maybeSingle(),
     getOverviewData(user.id),
@@ -43,8 +45,28 @@ export default async function OverviewPage() {
     // The header strip's own read — a cache() hit with AppHeader's in this
     // request, so both see the same snapshot (active-tasting banner §7).
     readActiveTastings(user.id),
+    // The one-time sharing notice (sharing-defaults spec §7.5): the viewer's
+    // own row, if M2 wrote one. A read error means no card.
+    supabase
+      .from("sharing_notices")
+      .select("cellar_flipped, notes_shared, dismissed_at")
+      .eq("user_id", user.id)
+      .maybeSingle(),
   ]);
 
+  // Worded from the current settings, never the flags alone (S15); null when
+  // dismissed, when nothing it would say still holds, or when a read failed.
+  const sharingCopy =
+    profile && notice.data && !notice.error
+      ? sharingNoticeCopy({
+          cellarFlipped: notice.data.cellar_flipped,
+          notesShared: notice.data.notes_shared,
+          cellar: profile.cellar_visibility,
+          notes: profile.notes_visibility,
+          dismissedAt: notice.data.dismissed_at,
+        })
+      : null;
+
   // D8: when the strip under the top bar already names this banner's tasting
   // (on /overview it always shows the first item), the Overview does not
   // draw a second way back to it. A failed read gives [] → "banner", as
@@ -70,6 +92,8 @@ export default async function OverviewPage() {
         title="Overview"
       />
       <main className="flex flex-1 flex-col gap-[22px] p-[22px_26px_26px] max-md:gap-[11px] max-md:p-[11px_14px_14px]">
+        {/* First, at every width, above the invitation card (spec S15). */}
+        {sharingCopy ? <SharingNotice userId={user.id} copy={sharingCopy} /> : null}
         {/* The invitation card (S5b): laptop only — the Blind tastings card
             below keeps its own invitation rows for phones and for any other
             pending invitation this one doesn't cover (Does bullet, last
```

- [ ] **Step 5: CLAUDE.md** (the grant count in the Account deletion bullet, and a new "Sharing defaults" bullet after it; Rollout R6 adds the live date):

```diff
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -559,16 +559,70 @@ a raw subquery, regardless of which two tables look involved at a glance.
   tasting CLOSED without ever starting keeps DRAFT visibility. Never go back
   to a bare `status <> 'DRAFT'` or `status = 'CLOSED'` test for "started" —
   that hands every candidate card of never-revealed glasses to the JOINED
-  guests. Client UPDATE on `profiles` is a column grant on ten columns
+  guests. Client UPDATE on `profiles` is a column grant on eleven columns
   (display_name, bio, avatar_url, location, phone, favorite_wine_type,
-  cellar_visibility, preferred_currency, last_seen_at, and since
-  20260925010000 tour_seen_at — see "First-run tour"); before it, any member
+  cellar_visibility, preferred_currency, last_seen_at, since 20260925010000
+  tour_seen_at — see "First-run tour" — and since 20260927140000
+  notes_visibility — see "Sharing defaults"); before it, any member
   could set their own `role` to ADMIN. Roles change only through
   `admin_set_user_role`. A link guard refuses new friendships or seats
   pointing at a deleted profile. Every people listing filters
   `.is("deleted_at", null)`. Never pass `shouldSoftDelete` to
   `admin.deleteUser`: the hard delete is what frees the email for a new
   signup. A dashboard delete leaves the avatar file behind (spec §7 R5).
+- **Sharing defaults** (2026-09-27, spec
+  `docs/superpowers/specs/2026-09-27-sharing-defaults-design.md`; M1
+  `20260927140000_sharing_defaults.sql`, then the app deploy, then M2
+  `20260927150000_sharing_defaults_flip.sql`). Cellars and tasting notes are
+  visible to everyone unless the person changes it. Two settings share the
+  `cellar_visibility` enum and one vocabulary, Everyone / Friends / Only me
+  (`src/lib/sharing/visibility.ts`; one `VisibilitySelect` on `/profile/edit`'s
+  Sharing card, `#sharing`, and on `/cellar`): `profiles.cellar_visibility`
+  (M2 turned every non-deleted PRIVATE into PUBLIC and made PUBLIC the
+  default) and `profiles.notes_visibility` (default PUBLIC; governs every
+  note the person writes). `can_view_notes(author)` is `can_view_cellar`'s
+  friend rule byte for byte, plus "never a deleted author". "wset notes read"
+  admits the author, or anyone when the note names a catalog wine AND
+  `can_view_notes(author)` AND `not wset_note_held(id)` AND the wine passes
+  the reader's own "catalog read". **Never add a `catalog_wines_unidentified`
+  check to that policy**: `can_read_unidentified_wine` is SECURITY INVOKER
+  over `wset_notes` and it would recurse — unidentified-wine notes are simply
+  author-only. Rule 1, three parts: a note that gains an identity while its
+  author adds an unrevealed glass of that wine is held (`wset_note_holds`,
+  internal; written by `wset_notes_hold_on_identity` from the author's own
+  glasses; only that glass's reveal releases it — a removed glass or a
+  deleted or CLOSED tasting keeps it held for good, the `flight_holds` rule);
+  a note linked through its author's own `cellar_consumptions.wset_note_id`
+  to a pour `catalog_wine_masked_pours` still masks is hidden too
+  (`wset_note_held`); and `wset_notes_rule1_guard` refuses the adder's update
+  or delete of a note others see on that wine, and any move onto it (42501,
+  `src/lib/notes/rule1-guard.ts`; the note sheet shows the sentence). Never
+  hold an existing note when a glass is keyed: that is the vanish oracle.
+  Community figures follow the reader: `catalog_wine_ratings` and
+  `catalog_wine_descriptors` (invoker views) and `catalog_wine_structure`
+  (SECURITY INVOKER since M1); `catalog_wine_usage.note_count` leaves out
+  held notes. `shared_cellar_lots` returns `lot_note`, `price_per_bottle` and
+  `purchase_source` as null to anyone but the owner. Other people's notes
+  show on a wine's page ("Notes from others") and on `/u/[id]` ("Tasting
+  notes"), through `src/lib/notes/shared-notes.ts`; the author's own held
+  notes carry "Hidden from others" (`wset_my_held_notes`). A non-author
+  opening `/catalog/[wineId]/notes/[noteId]` gets a server-rendered read view
+  (`noteRouteMode`), and a note the policy hides is `notFound()` like a
+  missing id. The one-time notice lives in owner-only `sharing_notices`
+  (never a column on `profiles`, which every member reads — it would publish
+  who used to be private), filled once by M2; `/overview` words it from the
+  current settings (`sharingNoticeCopy`) and `dismissSharingNotice` stamps
+  `dismissed_at`. Grants: `sharing_notices` SELECT + UPDATE(dismissed_at) on
+  the own row; `wset_note_holds` nothing; `can_view_notes` authenticated +
+  service_role; `wset_note_held` and `wset_my_held_notes` authenticated only;
+  the internal helper `catalog_wine_unrevealed_glasses_of` and the four
+  trigger functions owner-only. Rollback SQL lives in
+  `scripts/sharing-defaults/` (`rollback-m2.sql`, `rollback-m1.sql`, run by
+  `run-sql.mjs` with `--dry` first), never under `supabase/migrations`.
+  Accepted residuals (spec §11): a host's fresh cellar lot or cellar scan of
+  tonight's bottle is now seen by every guest (O1, offered as a follow-up);
+  a curator merge can move a note others see onto a wine in its author's
+  unrevealed glass (R3); `get_app_stats().notes_created` counts every note.
 - The tasting-invite UI (`tastings/new/invite-field.tsx`) is NOT a
   comma/newline-separated textarea — participants are added one at a time
   (typed email + "Add", or picked from a friends combobox), rendered as
```

- [ ] **Step 6: Run them.** `npx vitest run src/lib/sharing sharing-notice` → actions 3, sharing-notice 3 (and visibility, notice still pass).

- [ ] **Step 7: Gates.** tsc exit 0. Full vitest **B_files + 12 / B_tests + 88**. `npx eslint src/lib/sharing src/app/overview; echo "eslint exit $?"` → 0.

- [ ] **Step 8: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/sharing/actions.ts src/lib/sharing/actions.test.ts src/app/overview/sharing-notice.tsx src/app/overview/sharing-notice.test.tsx src/app/overview/page.tsx CLAUDE.md && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "$(cat <<'EOF'
feat(overview): one-time sharing notice; CLAUDE.md sharing defaults

Spec 2026-09-27-sharing-defaults S4, S14, S15, §7.5, §10.2 step 5. Worded
from the current settings; Got it and the settings link both stamp
dismissed_at on the viewer's own row; hidden for the visit if that fails.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Rollout (main session)

**MAIN SESSION ONLY.** C2: the owner authorised pushes and applies for this work; §10.2's order holds, every apply is dry-run first, one production-touching command per Bash call with a plain description (auto-mode classifier). `<scratchpad>` is `C:\Users\chris\AppData\Local\Temp\claude\C--Users-Public-repos-blindtastingapp\af0a834e-4dbb-4957-b632-9e9d3890ff65\scratchpad`. `M1=supabase/migrations/20260927140000_sharing_defaults.sql`, `M2=supabase/migrations/20260927150000_sharing_defaults_flip.sql`.

**Note on the dry runs:** each DB-suite test applies M1 inside its own transaction on production, which takes ACCESS EXCLUSIVE locks on `profiles` and `wset_notes` (and trigger locks on `wines`, index locks on `cellar_consumptions`) for that test's lifetime (well under a second each); M2's tests also flip the live PRIVATE cellars and write the notices inside theirs. Everything rolls back, but app requests queue behind the locks for that moment: run R1 at a quiet hour, in one go.

- [ ] **R1: Dry-run every suite.**
  1. `cd /c/Users/Public/repos/blindtastingapp-training && SHARING_DEFAULTS_APPLY=supabase/migrations/20260927140000_sharing_defaults.sql,supabase/migrations/20260927150000_sharing_defaults_flip.sql node --env-file=.env.local --test --test-reporter=tap --test-reporter-destination=stdout scripts/sharing-defaults.test.mjs` → 30 pass, 0 skip, 0 fail.
  2. The same `SHARING_DEFAULTS_APPLY=… node --env-file=.env.local --test …` for `scripts/tour-seen.test.mjs`, `scripts/catalog-wine-structure.test.mjs`, `scripts/wset-notes.test.mjs`, `scripts/catalog-manage.test.mjs`, `scripts/cellar-social.test.mjs` → all pass (they apply M1 only).
  3. `TRAINING_ROOM_APPLY=supabase/migrations/20260927140000_sharing_defaults.sql node --env-file=.env.local --test scripts/training-room.test.mjs` and `FRIEND_REQUESTS_APPLY=supabase/migrations/20260927140000_sharing_defaults.sql node --env-file=.env.local --test scripts/friend-requests.test.mjs` → pass (friend-requests' lockdown test skips by design); `node --test scripts/live-note.test.mjs` → pass.
  4. **If M1's post-state raises `"wset notes read" is not spec §4.3's policy: r {authenticated} …`**, Postgres printed the new policy differently from the pinned text (the one pin not read back from a dry run). Put the printed text, exactly as the exception prints it, into M1's post-state check 1 (it includes the leading `r {authenticated} `), and the same text without that leading `r {authenticated} ` into M2's pre-state policy check; commit as `fix(db): pin the notes read policy as Postgres prints it` with the identity and trailer; re-run R1. No other failure is expected; any other failure stops the rollout.
- [ ] **R2: M1.** `node --env-file=.env.local <scratchpad>/apply-migration.mjs supabase/migrations/20260927140000_sharing_defaults.sql --dry` → `DRY RUN OK`. Then the same without `--dry` → `APPLIED` with its history row. (The applier prints no NOTICEs; the same-transaction post-state is the check.) Smoke the deployed (old) app on prod: a wine page with notes, the catalog list, saving a note, your own cellar, someone's shared cellar, `/taste/notes`.
- [ ] **R3: The app.** Push the branch to master per the deploy authorization; wait for `gh api repos/christianolin/blindtastingapp/commits/<fullSHA>/status` to read `success`; smoke on https://blindrapp.vercel.app: B1, B2, B4, B5, B6, B7, B9 (no notice rows yet, so no card anywhere). The minutes until R4 are R9's window: keep them short.
- [ ] **R4: M2.** First read the audience read-only (M1 is live, so `wset_note_held` exists):

```sql
with flipped as (
  select id from profiles where deleted_at is null and cellar_visibility = 'PRIVATE'
), noted as (
  select distinct n.author_id as id
    from wset_notes n
    join profiles p on p.id = n.author_id and p.deleted_at is null
   where n.catalog_wine_id is not null
     and not public.wset_note_held(n.id)
     and (num_nonnulls(n.clarity, n.appearance_intensity, n.colour_hue, n.condition, n.nose_intensity,
                       n.development, n.sweetness, n.acidity, n.tannin, n.alcohol, n.body, n.mousse,
                       n.flavour_intensity, n.finish, n.quality_score, n.price_category, n.readiness) > 0
          or n.taster_notes ~ '\S'
          or exists (select 1 from wset_note_aromas a where a.note_id = n.id))
)
select (select count(*) from flipped) as flipped, (select count(*) from noted) as noted,
       (select count(*) from (select id from flipped union select id from noted) u) as notices;
```

  2026-09-27 this read 34 / 5 / 36; signups since then move it (R12). If it is wildly different, stop and read live. Then `node --env-file=.env.local <scratchpad>/apply-migration.mjs supabase/migrations/20260927150000_sharing_defaults_flip.sql --dry` → `DRY RUN OK`, then apply without `--dry`; afterwards `select count(*), count(*) filter (where cellar_flipped), count(*) filter (where notes_shared) from sharing_notices` matches the audience read. Smoke B3 and B8. Find a demo account with a notice for B3 read-only: `select p.email, s.cellar_flipped, s.notes_shared from sharing_notices s join profiles p on p.id = s.user_id where p.email like 'demo.%@blindr.invalid'`.
- [ ] **R5: Suites against live.** Re-run `scripts/sharing-defaults.test.mjs` with no APPLY → 27 pass, 3 skip (the M1 back-fill test and two M2 tests; "an account made after M2…" runs in its live mode). Re-run the §9.3 suites with no APPLY → pass.
- [ ] **R6: CLAUDE.md.** In the "Sharing defaults" bullet change `(2026-09-27, spec` to `(2026-09-27, applied live <date> with the owner's go-ahead, spec`; commit `docs: sharing defaults are live` with the identity and trailer; push.

**Browser checklist** (prod; a 375 px phone and a laptop; light and dark; sessions only from `node --env-file=.env.local <scratchpad>/mint.mjs https://blindrapp.vercel.app <path> demo.<name>@blindr.invalid`, run from this worktree, never a typed password; front the Browser pane tab and re-navigate before each check):
- **B1** `/profile/edit`: the Sharing card is second; both selects save (reload keeps them); forcing a failure (sign the tab into a second demo account, then change the first tab's select) snaps back with "Not saved. Still set to …"; `/cellar`'s "Visible to" shows the same value in the same words.
- **B2** `/profile/edit#sharing` and the profile's "Change" link bring the card into view under the sticky header.
- **B3** An affected account's `/overview`: the card is first in `<main>` at both widths; "Got it" hides it; reload and a second browser never show it again; on another affected account the link dismisses it and lands on the card; an unaffected or brand-new account never sees it.
- **B4** A wine with others' notes: rows with two links (author → profile, rest → note), badges, score line, summary, "Show all {n} notes"/"Show fewer", hidden when empty; each phone row link ≥ 44 px tall.
- **B5** `/u/<someone>`: "Tasting notes" (hidden when none readable); your own profile: "Your tasting notes", the line, "Change", "No tasting notes yet." when empty.
- **B6** Someone else's note opens the read view (no edit, delete or share control); an Only-me note's URL → the app's own (styled) not-found page, exactly as for a made-up id.
- **B7** Two demo accounts: Everyone visible; Only me not; Friends only once the friend request is accepted (send, check, accept, check).
- **B8** A throwaway LIVE tasting between two demo accounts: the host writes a note on the poured wine → the guest does not see it on the host's profile, the wine page or the community figures; the host's own row says "Hidden from others"; editing the host's older note on that wine shows the guard's sentence under Save; after the reveal everything appears. Reveal the glass before deleting the throwaway tasting: the reveal releases the hold, while deleting an unrevealed tasting keeps the note hidden for good (R2).
- **B9** Someone else's cellar page: `read_network_requests` on the RSC payload shows no `lot_note`, `price_per_bottle` or `purchase_source` values (they are null).

**Rollback** (spec §10.3; `--dry` first, the owner told first):
- The app: `git revert` the merge and push; the old app works against M1 and against M1+M2.
- M2: `node --env-file=.env.local scripts/sharing-defaults/run-sql.mjs scripts/sharing-defaults/rollback-m2.sql --dry`, then without `--dry`. Re-privatizes every flipped cellar still PUBLIC, including anyone who chose PUBLIC after the notice (R10).
- M1 (only after the app revert and M2's rollback): `node --env-file=.env.local scripts/sharing-defaults/run-sql.mjs scripts/sharing-defaults/rollback-m1.sql --dry`, then without. People's notes settings are lost; the indexes stay.
