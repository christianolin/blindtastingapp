# First-run tour ("Get started") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every signed-in person a six-step "Get started" sheet once per ACCOUNT (not per device), to new accounts and to every existing account once after release, with "Show the tour again" on `/profile/edit`.

**Architecture:** One nullable column, `profiles.tour_seen_at`, added to the client UPDATE column grant, is the flag (null = show). `AppShell` (rendered by the ROOT layout) already reads the viewer's profile; it now also selects `tour_seen_at` and `location`, and mounts a client `TourProvider` around every signed-in page. Because the root layout never re-renders on a soft navigation, the provider decides on the client — from the server prop, this visit's state (`fresh` / `dismissed` / `replay`) and `usePathname()` — whether `TourSheet` is open. `TourSheet` is one base-ui `Dialog` (bottom sheet below `md`, centred 480 px card from `md`). Dismissal calls one `"use server"` action; `/profile/edit`'s reset clears the column and reopens through the provider's context. Every rule and every string is pure in `src/lib/first-run/tour.ts`.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript (strict), `@base-ui/react` 1.6.0 Dialog through the shadcn wrapper `src/components/ui/dialog.tsx`, Tailwind v4, lucide-react 1.24.0, Supabase (`@supabase/ssr` 0.12; Postgres RLS + column grants), vitest 3 (`environment: "node"`, no DOM, no `@/` alias), `node:test` + `pg` for the live DB suite.

**Spec:** `docs/superpowers/specs/2026-09-25-first-run-tour-design.md`

## Global Constraints

- Work only in the worktree `C:\Users\Public\repos\blindtastingapp-tour` on branch `first-run-tour`. Start EVERY shell command with `cd /c/Users/Public/repos/blindtastingapp-tour && ...` (the shell's cwd resets between calls). Never touch `C:\Users\Public\repos\blindtastingapp` (the owner's checkout; it has an uncommitted `package.json` the owner owns) — not even to read its `.env.local`; this worktree has its own.
- Commit with the repository identity, adding only the files the task names (never `git add -A`):
  `GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "<subject>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`.
- `core.autocrlf=true`: existing working-tree files are CRLF. Edit them in place (the Edit tool keeps their endings); never re-save a whole existing file with different line endings. A new file written with LF is fine; git's "LF will be replaced by CRLF" warning is expected.
- Commands: one test file `npx vitest run <path>`; all `npx vitest run`; types `npx tsc --noEmit`; lint `npx eslint <files>`; the live DB suite `node --env-file=.env.local --test scripts/tour-seen.test.mjs` (every test rolls back).
- vitest runs in `environment: "node"` with no `@/` alias: tests import the module under test RELATIVELY, and any module a test loads must not value-import `@/…` (type-only imports are fine). Components cannot be unit-tested here; the main session checks them in the browser (Tasks 10 and 12).
- Implementer subagents never write to the live database, never run `supabase db push`, never push. Tasks 9–14 are main session only.
- A `"use server"` file exports only async functions — no types, no constants, no re-exports (CLAUDE.md, 2026-09-18). Copy and rules live in the plain module `src/lib/first-run/tour.ts`.
- `src/lib/supabase/database.types.ts` is hand-written: the `profiles` Row/Insert/Update change lands in the SAME commit as the migration (Task 1); every table keeps `Relationships: []`.
- Base UI (not Radix): no `asChild`; `Button` rendering a `Link` gets `render={<Link …/>}` AND `nativeButton={false}`; a plain `Button` keeps the default.
- No `setState` inside `useEffect` (`react-hooks/set-state-in-effect` is on). "Opens after mount" is done with the repo's hydration idiom: `useSyncExternalStore(subscribeNoop, () => true, () => false)` (as `field-picker.tsx` does).
- Tokens only (`bg-card`, `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-border`, `bg-border-strong`, `bg-primary`, `text-primary-foreground`, `dark:bg-primary-ink`, `ring-foreground/10`, `ring-ring/50`), never a raw hex; everything must read correctly under `.dark`. The app is light by default.
- User-visible strings are exactly `TOUR_COPY`, `tourStepLabel()` and `tourSteps()` from Task 3 (spec D5 copy, owner approval pending). No other string in the tour or the card.
- Excluded paths, exactly (spec D4): `/auth/*`, `/login*`, `/signup*`, `/invite/*`, `/j/*`, `/tastings` and everything under it, and `/profile/edit`.
- `FRIEND_REQUESTS_LIVE` is `false` in this release. The main session flips it to `true` in the friend-requests deploy (Task 14); nobody else changes it.
- Production is live with daily users. After the deploy EVERY existing user sees the tour once on their next page load. The migration MUST be live before the app deploy: `AppShell` selects `tour_seen_at`, and against a database without the column that whole profile read fails, which blanks every user's sidebar name and avatar and drops manager nav.
- No new dependencies, no Anthropic API calls, no change to `scrub_deleted_account`, `handle_new_user` or any RLS policy.

## Review Focus

- **A missing or failed profile read** (query error, a profile row that is not there, or the app reaching a database without the column). Expected: nobody is shown the tour because of an error — a person who already dismissed it never sees it again from a hiccup — and the app is never deployed before the column exists. Pinned: Task 3 `tourSeenFromProfile(null) === true` (and `undefined`); Task 11 Step 2's hard gate reads the live column before any push.
- **A dismissal whose write fails** (offline, expired session, deleted profile, the action rejecting). Expected: the sheet closes and stays closed for every soft navigation in this visit; it may return after a reload. Pinned: Task 3 `tourShouldOpen` "dismissed" rows (seen and unseen, several paths); Task 4 tests that a refused write and a signed-out call both return `false` without throwing; Task 6's provider swallows a rejected action.
- **Soft navigation across excluded and allowed paths** (join link → tasting → Overview; `/profile/edit` → Show the tour again → `/overview`), with a root layout that never re-renders. Expected: it opens on the first allowed page, never inside a tasting, and a replay waits until the person has left `/profile/edit`. Pinned: Task 3 `tourShouldOpen` sequences; Task 10 Step 6 in the browser.
- **Path shapes** (trailing slash, `/login/forgot`, a bare `/tastings`, `/profile/edit/`, `/profile/numbers`, `/u/<id>/tastings/<id>`, a query or hash, `null`/empty). Expected: only the spec's exclusions hide it. Pinned: Task 3 `tourVisibleOn` tables.
- **The step list changing under an open sheet** (`useCanScan()` resolving from `null` after the sheet opened; `profileBare` flipping on a router refresh while the last step shows). Expected: never an out-of-range step, never a crash, the camera clause only when `canScan` is exactly `true`. Pinned: Task 3 `clampStep`, `tourFooter` and `tourSteps` tests; Task 5 uses `useCanScan() === true` and `clampStep`.

---

## File Structure

New:
- `supabase/migrations/20260925010000_tour_seen.sql` — the column, the grant, pre/post-state asserts.
- `scripts/tour-seen.test.mjs` — live `node:test` suite (rollback-only): own-row write, other-row refusal, anon refusal, the exact ten-column grant.
- `src/lib/first-run/tour.ts` — pure: step ids, steps + copy, `tourVisibleOn`, `tourShouldOpen`, `tourFooter`, `clampStep`, `isProfileBare`, `tourSeenFromProfile`, `TOUR_COPY`, hrefs, `FRIEND_REQUESTS_LIVE`.
- `src/lib/first-run/tour.test.ts`
- `src/lib/first-run/actions.ts` — `"use server"`: `markTourSeen()`, `resetTour()`.
- `src/lib/first-run/actions.test.ts`
- `src/components/first-run/tour-sheet.tsx` — client: the Dialog, step state, dots, buttons.
- `src/components/first-run/tour-provider.tsx` — client: open/closed state, `useTourReplay()`.
- `src/app/profile/edit/show-tour-again-button.tsx` — client: the reset button.

Modified:
- `src/lib/supabase/database.types.ts` — `profiles` Row/Insert/Update.
- `src/components/app-shell.tsx` — select the extra columns, mount `TourProvider`.
- `src/app/profile/edit/page.tsx` — the "Getting started" card.
- `CLAUDE.md` — the "First-run tour" bullet and the ten-column grant.

## Interface Contracts (shared across tasks)

```ts
// src/lib/first-run/tour.ts (Task 3) — plain module, no "use client"
export const FRIEND_REQUESTS_LIVE = false;
export const TOUR_STEP_IDS = ["welcome", "taste", "cellar", "learn", "community", "profile"] as const;
export type TourStepId = (typeof TOUR_STEP_IDS)[number];
export type TourStep = { id: TourStepId; title: string; paragraphs: readonly string[] };
export const TOUR_COPY: {
  readonly back: "Back"; readonly next: "Next"; readonly done: "Done"; readonly skip: "Skip tour";
  readonly setUp: "Set up my profile"; readonly later: "Later";
  readonly cardTitle: "Getting started"; readonly showAgain: "Show the tour again";
};
export const TOUR_SETUP_HREF = "/profile/edit";
export const TOUR_REPLAY_HREF = "/overview";
export function tourStepLabel(position: number, total: number): string;          // "Step 2 of 6"
export function tourSteps(opts: { canScan: boolean; profileBare: boolean; friendRequestsLive: boolean }): TourStep[];
export function tourVisibleOn(pathname: string | null | undefined): boolean;
export type TourVisit = "fresh" | "dismissed" | "replay";
export function tourShouldOpen(input: {
  hydrated: boolean; tourSeen: boolean; visit: TourVisit; pathname: string | null | undefined;
}): boolean;
export function clampStep(index: number, count: number): number;
export type TourFooter = { back: boolean; skip: boolean; primary: "next" | "done" | "profile" };
export function tourFooter(steps: readonly TourStep[], index: number): TourFooter;
export function isProfileBare(profile: { avatarUrl: string | null; location: string | null }): boolean;
export function tourSeenFromProfile(profile: { tour_seen_at: string | null } | null | undefined): boolean;

// src/lib/first-run/actions.ts (Task 4) — "use server"
export async function markTourSeen(): Promise<boolean>;   // tour_seen_at = now (ISO) for the signed-in person
export async function resetTour(): Promise<boolean>;      // tour_seen_at = null for the signed-in person

// src/components/first-run/tour-sheet.tsx (Task 5) — "use client"
export function TourSheet(props: { profileBare: boolean; onFinish: () => void }): JSX.Element;

// src/components/first-run/tour-provider.tsx (Task 6) — "use client"
export function useTourReplay(): () => void;              // no-op outside the provider
export function TourProvider(props: { tourSeen: boolean; profileBare: boolean; children: React.ReactNode }): JSX.Element;

// src/app/profile/edit/show-tour-again-button.tsx (Task 7) — "use client"
export function ShowTourAgainButton(): JSX.Element;
```

---

### Task 1: Migration `20260925010000_tour_seen.sql` + `database.types.ts`

**Files:**
- Create: `supabase/migrations/20260925010000_tour_seen.sql`
- Modify: `src/lib/supabase/database.types.ts` (the `profiles` block, currently lines 331–386)

**Interfaces:**
- Consumes: nothing.
- Produces: `profiles.tour_seen_at timestamptz null` (live after Task 9), in the `authenticated` UPDATE column grant; `Database["public"]["Tables"]["profiles"]` Row `tour_seen_at: string | null`, Insert `tour_seen_at?: string | null`, Update `tour_seen_at?: string | null` (via `Partial`).

This task writes SQL only; nothing here connects to the database. The file's own pre/post-state blocks are its test, and they run when the main session applies it in Task 9; Task 2's suite then checks the behaviour.

- [ ] **Step 1: Confirm the version slot is free and nothing else touches the grant**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && ls supabase/migrations | tail -3 && ls supabase/migrations | grep -c 20260925010000; grep -ln "grant update (" supabase/migrations/*.sql | xargs grep -ln "public.profiles"`
Expected: the tail ends with `20260920090000_wine_place_neighbours.sql`; the count is `0`; the grep prints only `supabase/migrations/20260919101300_account_deletion.sql`. If anything else prints, stop and report it: the pre-state below would be wrong.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260925010000_tour_seen.sql` with exactly:

```sql
-- tour_seen: the per-account "has seen the first-run tour" stamp.
--
-- Spec: docs/superpowers/specs/2026-09-25-first-run-tour-design.md (D1, D2,
-- §2, §4). Owner decisions 2026-09-24: a getting-started tour shown once per
-- PERSON, not per device or IP, to new accounts and to every existing account
-- once after release, with a way to see it again from /profile/edit.
--
-- Written against the profiles state the last two migrations that set or
-- pinned its client grants leave behind (20260919101300 account deletion,
-- step 4; 20260919141700 profile favourites, pre-state 2 and post-state 7),
-- re-read on live by the main session before applying (plan Task 9 Step 2):
-- * RLS on, not forced; exactly two policies: "profiles read" (SELECT,
--   authenticated, true) and "profiles update own" (UPDATE, authenticated,
--   id = auth.uid() in both USING and WITH CHECK).
-- * No table-level UPDATE for anon or authenticated; authenticated holds
--   UPDATE on exactly nine columns (display_name, bio, avatar_url, location,
--   phone, favorite_wine_type, cellar_visibility, preferred_currency,
--   last_seen_at); no other role holds a column privilege; service_role keeps
--   table-level UPDATE.
-- * profiles_deleted_guard (BEFORE INSERT OR UPDATE) refuses every client
--   write to a deleted profile, so a deleted account cannot stamp or clear
--   the new column either.
--
-- What this migration does:
-- 1. profiles.tour_seen_at timestamptz, nullable, no default. Null means
--    "show the tour"; every existing profile starts null, so everyone sees it
--    once (D1), and handle_new_user (md5-pinned by 20260919101300) needs no
--    change for new accounts.
-- 2. grant update (tour_seen_at) on public.profiles to authenticated: the app
--    stamps and clears it as the signed-in person (markTourSeen / resetTour in
--    src/lib/first-run/actions.ts) through "profiles update own". No new
--    policy, function or trigger.
--
-- Deliberately left alone: scrub_deleted_account (the stamp is not personal
-- data, D1); "profiles read" already covers the column for every member, as
-- it does last_seen_at. Additive: the deployed app never selects the column,
-- so this applies BEFORE the app deploy (spec §4). The app that selects it in
-- AppShell must not ship until this is live.

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. The column does not exist yet.
  if exists (select 1 from pg_attribute a
             where a.attrelid = 'public.profiles'::regclass and a.attname = 'tour_seen_at' and not a.attisdropped) then
    raise exception 'profiles.tour_seen_at already exists; re-read live before applying';
  end if;

  -- 2. RLS on, not forced, and exactly the two policies.
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.profiles'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'profiles row level security is not enabled, or is forced';
  end if;
  select string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd, case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.profiles'::regclass;
  if v_text is distinct from
       'profiles read r permissive {authenticated} true -; '
       || 'profiles update own w permissive {authenticated} (id = auth.uid()) (id = auth.uid())' then
    raise exception 'profiles policies differ from the state this file was written against: %', v_text;
  end if;

  -- 3. The nine-column client UPDATE grant, and nothing wider.
  if has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'anon or authenticated holds table-level UPDATE on profiles';
  end if;
  select string_agg(format('%s:%s', a.attname, x.privilege_type), ',' order by a.attname::text collate "C", x.privilege_type collate "C")
    into v_text
  from pg_attribute a, aclexplode(a.attacl) x
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE,'
       || 'last_seen_at:UPDATE,location:UPDATE,phone:UPDATE,preferred_currency:UPDATE' then
    raise exception 'profiles column privileges differ from the nine-column grant: %', coalesce(v_text, '-');
  end if;
  if exists (select 1 from pg_attribute a, aclexplode(a.attacl) x
             where a.attrelid = 'public.profiles'::regclass and x.grantee <> 'authenticated'::regrole) then
    raise exception 'a role other than authenticated holds a column privilege on profiles';
  end if;

  -- 4. The deleted-account guard is in place (it covers the new column too).
  if not exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'profiles_deleted_guard'
                   and t.tgenabled = 'O' and t.tgfoid = 'public.profiles_deleted_guard()'::regprocedure) then
    raise exception 'profiles_deleted_guard is missing or disabled';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The change (spec §2).
-- ---------------------------------------------------------------------------
alter table public.profiles add column tour_seen_at timestamptz;

comment on column public.profiles.tour_seen_at is
  'First-run tour dismissed at (spec 2026-09-25-first-run-tour-design D1). Null = show the tour on the next signed-in page. Written only by the signed-in person (markTourSeen / resetTour).';

grant update (tour_seen_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_bad text;
  v_total bigint;
  v_stamped bigint;
begin
  -- 1. The column: timestamptz, nullable, no default; null on every row.
  if not exists (select 1 from pg_attribute a
                 where a.attrelid = 'public.profiles'::regclass and a.attname = 'tour_seen_at' and not a.attisdropped
                   and a.atttypid = 'timestamptz'::regtype and not a.attnotnull and not a.atthasdef) then
    raise exception 'profiles.tour_seen_at is not a nullable timestamptz without a default';
  end if;
  select count(*), count(p.tour_seen_at) into v_total, v_stamped from public.profiles p;
  if v_stamped <> 0 then
    raise exception 'profiles.tour_seen_at is already set on % rows', v_stamped;
  end if;

  -- 2. RLS and the two policies unchanged.
  select string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd, case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.profiles'::regclass;
  if v_text is distinct from
       'profiles read r permissive {authenticated} true -; '
       || 'profiles update own w permissive {authenticated} (id = auth.uid()) (id = auth.uid())'
     or not exists (select 1 from pg_class c
                    where c.oid = 'public.profiles'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'profiles policies or RLS changed: %', v_text;
  end if;

  -- 3. Grants: no table-level UPDATE for anon or authenticated; authenticated
  --    UPDATE on exactly the ten client columns; anon on none; no other
  --    column grantee; the columns no client writes stay unwritable;
  --    authenticated keeps SELECT and service_role keeps UPDATE.
  if has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'anon or authenticated holds table-level UPDATE on profiles';
  end if;
  if has_any_column_privilege('anon', 'public.profiles', 'UPDATE') then
    raise exception 'anon holds UPDATE on a profiles column';
  end if;
  select string_agg(format('%s:%s', a.attname, x.privilege_type), ',' order by a.attname::text collate "C", x.privilege_type collate "C")
    into v_text
  from pg_attribute a, aclexplode(a.attacl) x
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE,'
       || 'last_seen_at:UPDATE,location:UPDATE,phone:UPDATE,preferred_currency:UPDATE,tour_seen_at:UPDATE' then
    raise exception 'profiles column privileges are %, expected UPDATE on exactly the ten client columns', coalesce(v_text, '-');
  end if;
  if exists (select 1 from pg_attribute a, aclexplode(a.attacl) x
             where a.attrelid = 'public.profiles'::regclass and x.grantee <> 'authenticated'::regrole) then
    raise exception 'a role other than authenticated holds a column privilege on profiles';
  end if;
  select string_agg(s.col, ', ') into v_bad
  from unnest(array['id', 'email', 'created_at', 'is_curator', 'role', 'deleted_at']) as s (col)
  where has_column_privilege('authenticated', 'public.profiles', s.col, 'UPDATE');
  if v_bad is not null then
    raise exception 'authenticated can update profiles columns no client writes: %', v_bad;
  end if;
  if not has_table_privilege('authenticated', 'public.profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.profiles', 'UPDATE') then
    raise exception 'authenticated lost SELECT or service_role lost UPDATE on profiles';
  end if;

  -- 4. The deleted-account guard still covers every client write.
  if not exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'profiles_deleted_guard'
                   and t.tgenabled = 'O' and t.tgfoid = 'public.profiles_deleted_guard()'::regprocedure) then
    raise exception 'profiles_deleted_guard is missing or disabled';
  end if;

  raise notice 'tour_seen: % profiles, every tour_seen_at null; client UPDATE is now ten columns', v_total;
end $$;
```

- [ ] **Step 3: Update `database.types.ts`**

In `src/lib/supabase/database.types.ts`, three edits inside `profiles`:

Row — replace

```ts
          last_seen_at: string | null;
          created_at: string;
          // Account deletion (20260919101300): stamped once by
```

with

```ts
          last_seen_at: string | null;
          // First-run tour (20260925010000, spec 2026-09-25 D1): null = show
          // the tour. Stamped by markTourSeen, cleared by resetTour
          // (src/lib/first-run/actions.ts); in the client UPDATE grant.
          tour_seen_at: string | null;
          created_at: string;
          // Account deletion (20260919101300): stamped once by
```

Insert — replace

```ts
          last_seen_at?: string | null;
          created_at?: string;
        };
        Update: Partial<{
```

with

```ts
          last_seen_at?: string | null;
          tour_seen_at?: string | null;
          created_at?: string;
        };
        Update: Partial<{
```

Update — replace

```ts
          last_seen_at: string | null;
          created_at: string;
        }>;
```

with

```ts
          last_seen_at: string | null;
          tour_seen_at: string | null;
          created_at: string;
        }>;
```

- [ ] **Step 4: Type-check and whitespace**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && npx tsc --noEmit && git diff --check`
Expected: both print nothing and exit 0.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-tour && git add supabase/migrations/20260925010000_tour_seen.sql src/lib/supabase/database.types.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(db): profiles.tour_seen_at for the first-run tour (not applied)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Live DB suite `scripts/tour-seen.test.mjs`

**Files:**
- Create: `scripts/tour-seen.test.mjs`

**Interfaces:**
- Consumes: Task 1's column and grant (live only after Task 9); `pgConfig()` from `scripts/wine-map-tiles/lib.mjs` (reads `DB_PASSWORD`; pooler `aws-0-eu-central-1.pooler.supabase.com:6543`).
- Produces: `node --env-file=.env.local --test scripts/tour-seen.test.mjs` — 5 tests; Task 9 Step 6 runs it green.

Pattern: `scripts/cellar-social.test.mjs` (one `pg` client, every test inside `begin … rollback`, the caller simulated with `set local role` plus `request.jwt.claims`). This is the only database access an implementer makes, and it never commits.

- [ ] **Step 1: Write the suite**

Create `scripts/tour-seen.test.mjs`:

```js
// First-run tour DB suite (spec docs/superpowers/specs/2026-09-25-first-run-tour-design.md
// D1, §3): profiles.tour_seen_at is written by the signed-in person through the
// ten-column client UPDATE grant and "profiles update own" — never on someone
// else's row, never by anon — and the grant did not widen past it. Every test
// runs inside a transaction that is rolled back. Passes only once
// 20260925010000_tour_seen is live; before that four tests fail (the column
// does not exist, the grant is still nine columns) and one passes.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const client = new pg.Client(pgConfig());
before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

async function withRollback(cb) {
  await client.query("begin");
  try {
    return await cb();
  } finally {
    await client.query("rollback");
  }
}
async function asUser(id) {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: id, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
}
async function asAnon() {
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: "anon" }),
  ]);
  await client.query("set local role anon");
}
// Two profiles that are not deleted: profiles_deleted_guard refuses every
// client write to a deleted one, which would mask what these tests check.
async function twoProfiles() {
  const r = await client.query("select id from profiles where deleted_at is null order by id limit 2");
  assert.equal(r.rowCount, 2, "need 2 live profiles");
  return [r.rows[0].id, r.rows[1].id];
}
// Owner-role (RLS-bypassing) read of one profile's stamp.
async function seenAt(id) {
  await client.query("reset role");
  return (await client.query("select tour_seen_at from profiles where id = $1", [id])).rows[0].tour_seen_at;
}

test("a signed-in person stamps and clears their own tour_seen_at", async () => {
  await withRollback(async () => {
    const [a] = await twoProfiles();
    await asUser(a);
    const stamped = await client.query(
      "update profiles set tour_seen_at = now() where id = $1 returning tour_seen_at",
      [a],
    );
    assert.equal(stamped.rowCount, 1);
    assert.ok(stamped.rows[0].tour_seen_at instanceof Date, "stamped with a time");
    const cleared = await client.query(
      "update profiles set tour_seen_at = null where id = $1 returning tour_seen_at",
      [a],
    );
    assert.equal(cleared.rowCount, 1);
    assert.equal(cleared.rows[0].tour_seen_at, null, "Show the tour again clears it");
  });
});

test("nobody writes another person's tour_seen_at", async () => {
  await withRollback(async () => {
    const [a, b] = await twoProfiles();
    const before = await seenAt(b);
    await asUser(a);
    const r = await client.query("update profiles set tour_seen_at = now() where id = $1", [b]);
    assert.equal(r.rowCount, 0, '"profiles update own" filters another person\'s row');
    assert.deepEqual(await seenAt(b), before, "their stamp is untouched");
  });
});

test("anon cannot write tour_seen_at", async () => {
  await withRollback(async () => {
    const [a] = await twoProfiles();
    await asAnon();
    await assert.rejects(
      client.query("update profiles set tour_seen_at = now() where id = $1", [a]),
      (e) => e.code === "42501",
      "permission denied: anon holds no UPDATE on profiles",
    );
  });
});

test("the client UPDATE grant is exactly the ten columns", async () => {
  const r = await client.query(
    `select string_agg(format('%s:%s', a.attname, x.privilege_type), ','
              order by a.attname::text collate "C", x.privilege_type collate "C") as acl
       from pg_attribute a, aclexplode(a.attacl) x
      where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped`,
  );
  assert.equal(
    r.rows[0].acl,
    "avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE," +
      "last_seen_at:UPDATE,location:UPDATE,phone:UPDATE,preferred_currency:UPDATE,tour_seen_at:UPDATE",
  );
});

test("the grant did not widen: role and deleted_at stay unwritable", async () => {
  for (const sql of [
    "update profiles set role = 'ADMIN' where id = $1",
    "update profiles set deleted_at = now() where id = $1",
  ]) {
    await withRollback(async () => {
      const [a] = await twoProfiles();
      await asUser(a);
      await assert.rejects(client.query(sql, [a]), (e) => e.code === "42501", sql);
    });
  }
});
```

- [ ] **Step 2: Run it before the migration is live (expected to fail)**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && node --env-file=.env.local --test scripts/tour-seen.test.mjs`
Expected: `# tests 5`, `# pass 1`, `# fail 4`. The four failures read `column "tour_seen_at" does not exist` (code 42703), or, for the grant test, an `AssertionError` showing the nine-column list. The passing test is "the grant did not widen". If you instead see a connection or `DB_PASSWORD is required` error, stop and report it; do not change `pgConfig`.

- [ ] **Step 3: Lint**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && npx eslint scripts/tour-seen.test.mjs`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-tour && git add scripts/tour-seen.test.mjs && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "test(db): tour_seen_at live suite (green once 20260925010000 is applied)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Pure rules and copy — `src/lib/first-run/tour.ts`

**Files:**
- Create: `src/lib/first-run/tour.ts`
- Test: `src/lib/first-run/tour.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every export listed under `src/lib/first-run/tour.ts` in Interface Contracts, with exactly those names and types. Tasks 5, 6 and 7 import them.

- [ ] **Step 1: Write the failing test**

Create `src/lib/first-run/tour.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  FRIEND_REQUESTS_LIVE,
  TOUR_COPY,
  TOUR_REPLAY_HREF,
  TOUR_SETUP_HREF,
  TOUR_STEP_IDS,
  clampStep,
  isProfileBare,
  tourFooter,
  tourSeenFromProfile,
  tourShouldOpen,
  tourStepLabel,
  tourSteps,
  tourVisibleOn,
  type TourStep,
  type TourVisit,
} from "./tour";

const BASE = { canScan: false, profileBare: false, friendRequestsLive: false };
const paragraphsOf = (steps: TourStep[], id: string) => steps.find((s) => s.id === id)?.paragraphs;

describe("tourSteps (spec D5)", () => {
  it("five steps in order for a filled-in profile", () => {
    expect(tourSteps(BASE).map((s) => s.id)).toEqual(["welcome", "taste", "cellar", "learn", "community"]);
  });

  it("adds Make it yours last, and only for a bare profile", () => {
    const steps = tourSteps({ ...BASE, profileBare: true });
    expect(steps.map((s) => s.id)).toEqual([...TOUR_STEP_IDS]);
    expect(steps[5]).toEqual({
      id: "profile",
      title: "Make it yours",
      paragraphs: ["Add a photo and your city so friends recognise you; pick your favourite regions."],
    });
  });

  it("keeps the titles and copy word for word", () => {
    const steps = tourSteps(BASE);
    expect(steps.map((s) => s.title)).toEqual(["Welcome to Blindr", "Taste", "Cellar & Catalog", "Learn", "Community"]);
    expect(paragraphsOf(steps, "welcome")).toEqual([
      "Blind tastings with friends, scored the way the Danish championship scores them; notes on every wine you drink; your cellar; and a map of the wine world. This takes a minute.",
    ]);
    expect(paragraphsOf(steps, "taste")).toEqual([
      "Taste Blind: start a tasting, live around one table or self-paced, invite friends, everyone guesses country, region, grape, producer and vintage, the host reveals glass by glass, points per category.",
      "Taste & Rate: a WSET-style note on any wine, no game.",
    ]);
    expect(paragraphsOf(steps, "learn")).toEqual([
      "The wine map: pinch into a country for its regions and appellations; the Library explains designations and grapes.",
    ]);
  });

  it("names the header camera only where canScan is true", () => {
    expect(paragraphsOf(tourSteps({ ...BASE, canScan: true }), "cellar")).toEqual([
      "Add bottles by scanning a label with the camera at the top — the catalog is everyone's reference, your cellar is yours and private unless you say otherwise.",
    ]);
    expect(paragraphsOf(tourSteps({ ...BASE, canScan: false }), "cellar")).toEqual([
      "Add bottles by searching the shared catalog — the catalog is everyone's reference, your cellar is yours and private unless you say otherwise.",
    ]);
  });

  it("says add friends until friend requests ship, then send a friend request", () => {
    expect(paragraphsOf(tourSteps({ ...BASE, friendRequestsLive: false }), "community")).toEqual([
      "Find people, add friends, share your invite link. Friends can see each other's cellars when you allow it.",
    ]);
    expect(paragraphsOf(tourSteps({ ...BASE, friendRequestsLive: true }), "community")).toEqual([
      "Find people, send a friend request, share your invite link. Friends can see each other's cellars when you allow it.",
    ]);
  });

  it("the camera and friend variants never change the step count", () => {
    for (const canScan of [true, false]) {
      for (const friendRequestsLive of [true, false]) {
        expect(tourSteps({ canScan, profileBare: false, friendRequestsLive })).toHaveLength(5);
        expect(tourSteps({ canScan, profileBare: true, friendRequestsLive })).toHaveLength(6);
      }
    }
  });

  it("friend requests are not live in this release", () => {
    // The main session flips this together with FRIEND_REQUESTS_LIVE in the
    // friend-requests deploy (first-run tour plan Task 14).
    expect(FRIEND_REQUESTS_LIVE).toBe(false);
  });
});

describe("tourVisibleOn (spec D4)", () => {
  it.each([
    "/",
    "/overview",
    "/overview/",
    "/taste",
    "/taste/notes",
    "/catalog",
    "/cellar",
    "/cellar/history",
    "/knowledge/map",
    "/knowledge/designations",
    "/community",
    "/about",
    "/rules",
    "/profile/numbers",
    "/u/abc",
    "/u/abc/tastings/def",
  ])("shows on %s", (path) => {
    expect(tourVisibleOn(path)).toBe(true);
  });

  it.each([
    "/auth",
    "/auth/set-password",
    "/auth/confirm-hash",
    "/auth/callback",
    "/login",
    "/login/forgot",
    "/signup",
    "/invite/ABCDEFGHJK",
    "/invite/ABCDEFGHJK/accept",
    "/j/ABCDEF2345",
    "/tastings",
    "/tastings/new",
    "/tastings/abc",
    "/tastings/abc/host",
    "/tastings/abc/play",
    "/tastings/abc/results",
    "/profile/edit",
    "/profile/edit/",
  ])("never on %s", (path) => {
    expect(tourVisibleOn(path)).toBe(false);
  });

  it("ignores a query or a hash", () => {
    expect(tourVisibleOn("/overview?range=year")).toBe(true);
    expect(tourVisibleOn("/tastings/abc?addWine=byhand")).toBe(false);
    expect(tourVisibleOn("/profile/edit#top")).toBe(false);
  });

  it("no path, no tour", () => {
    expect(tourVisibleOn(null)).toBe(false);
    expect(tourVisibleOn(undefined)).toBe(false);
    expect(tourVisibleOn("")).toBe(false);
  });
});

describe("tourShouldOpen (spec D2, D4, D7)", () => {
  const open = (visit: TourVisit, tourSeen: boolean, pathname: string, hydrated = true) =>
    tourShouldOpen({ hydrated, tourSeen, visit, pathname });

  it("never before hydration (no server render, no flash)", () => {
    expect(open("fresh", false, "/overview", false)).toBe(false);
    expect(open("replay", true, "/overview", false)).toBe(false);
  });

  it("opens for an account that has not seen it, on an allowed page", () => {
    expect(open("fresh", false, "/overview")).toBe(true);
    expect(open("fresh", false, "/taste")).toBe(true);
  });

  it("stays shut for an account that has seen it", () => {
    expect(open("fresh", true, "/overview")).toBe(false);
  });

  it("waits out the join link and the tasting, then opens on the next allowed page", () => {
    expect(open("fresh", false, "/j/ABCDEF2345")).toBe(false);
    expect(open("fresh", false, "/tastings/abc")).toBe(false);
    expect(open("fresh", false, "/overview")).toBe(true);
  });

  it("once dismissed, stays shut for the visit whatever the write did", () => {
    for (const path of ["/overview", "/taste", "/catalog"]) {
      expect(open("dismissed", false, path)).toBe(false);
      expect(open("dismissed", true, path)).toBe(false);
    }
  });

  it("a replay waits until /profile/edit is left, then opens even for a seen account", () => {
    expect(open("replay", true, "/profile/edit")).toBe(false);
    expect(open("replay", true, "/overview")).toBe(true);
    expect(open("replay", false, "/overview")).toBe(true);
    expect(open("replay", true, "/tastings/abc")).toBe(false);
  });

  it("no path, no tour", () => {
    expect(tourShouldOpen({ hydrated: true, tourSeen: false, visit: "fresh", pathname: null })).toBe(false);
  });
});

describe("tourFooter and clampStep (spec D3, D5)", () => {
  const five = tourSteps(BASE);
  const six = tourSteps({ ...BASE, profileBare: true });

  it("first step: Next and Skip tour, no Back", () => {
    expect(tourFooter(five, 0)).toEqual({ back: false, skip: true, primary: "next" });
  });

  it("a middle step: Back, Next and Skip tour", () => {
    expect(tourFooter(five, 2)).toEqual({ back: true, skip: true, primary: "next" });
  });

  it("last step of five: Back and Done, no Skip tour", () => {
    expect(tourFooter(five, 4)).toEqual({ back: true, skip: false, primary: "done" });
  });

  it("last step of six (Make it yours): Back and the profile pair, no Skip tour", () => {
    expect(tourFooter(six, 5)).toEqual({ back: true, skip: false, primary: "profile" });
    expect(tourFooter(six, 4)).toEqual({ back: true, skip: true, primary: "next" });
  });

  it("an index past a shrunken list lands on its last step", () => {
    expect(tourFooter(five, 5)).toEqual({ back: true, skip: false, primary: "done" });
  });

  it("clampStep keeps the index inside the list", () => {
    expect(clampStep(0, 5)).toBe(0);
    expect(clampStep(2, 5)).toBe(2);
    expect(clampStep(5, 5)).toBe(4);
    expect(clampStep(9, 6)).toBe(5);
    expect(clampStep(-1, 5)).toBe(0);
    expect(clampStep(3, 0)).toBe(0);
  });
});

describe("isProfileBare (spec D5 step 6)", () => {
  it("bare only with neither a photo nor a location", () => {
    expect(isProfileBare({ avatarUrl: null, location: null })).toBe(true);
    expect(isProfileBare({ avatarUrl: "https://x/a.jpg", location: null })).toBe(false);
    expect(isProfileBare({ avatarUrl: null, location: "Copenhagen" })).toBe(false);
    expect(isProfileBare({ avatarUrl: "https://x/a.jpg", location: "Copenhagen" })).toBe(false);
  });

  it("blank strings count as missing", () => {
    expect(isProfileBare({ avatarUrl: "", location: "  " })).toBe(true);
  });
});

describe("tourSeenFromProfile (spec D1)", () => {
  it("null stamp means not seen", () => {
    expect(tourSeenFromProfile({ tour_seen_at: null })).toBe(false);
  });

  it("any stamp means seen", () => {
    expect(tourSeenFromProfile({ tour_seen_at: "2026-09-25T08:00:00+00:00" })).toBe(true);
  });

  it("a missing or failed profile read counts as seen, never as a reason to show it", () => {
    expect(tourSeenFromProfile(null)).toBe(true);
    expect(tourSeenFromProfile(undefined)).toBe(true);
  });
});

describe("copy constants", () => {
  it("buttons, links and the step label, exactly", () => {
    expect(TOUR_COPY).toEqual({
      back: "Back",
      next: "Next",
      done: "Done",
      skip: "Skip tour",
      setUp: "Set up my profile",
      later: "Later",
      cardTitle: "Getting started",
      showAgain: "Show the tour again",
    });
    expect(TOUR_SETUP_HREF).toBe("/profile/edit");
    expect(TOUR_REPLAY_HREF).toBe("/overview");
    expect(tourStepLabel(2, 6)).toBe("Step 2 of 6");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && npx vitest run src/lib/first-run/tour.test.ts`
Expected: FAIL — `Failed to load url ./tour` (or "Cannot find module './tour'").

- [ ] **Step 3: Write the implementation**

Create `src/lib/first-run/tour.ts`:

```ts
// First-run tour (spec docs/superpowers/specs/2026-09-25-first-run-tour-design.md).
// Everything the tour decides, as pure functions and constants: the steps and
// their copy (D5), where it may open (D4), whether it is open in this visit
// (D2, D7), the footer each step gets (D3), and the two facts AppShell derives
// from the profile row (D1, D5 step 6). The components under
// src/components/first-run/ only wire these; the per-account flag is
// profiles.tour_seen_at (20260925010000), written by ./actions.ts.
//
// A plain module, no "use client": AppShell (a server component) imports
// `tourSeenFromProfile` and `isProfileBare`, and a value imported from a
// client module across the server boundary becomes a client reference.

/** Step 5's friend sentence. False until the friend-requests release ships;
    the main session flips it to true in that release's deploy (spec D5). */
export const FRIEND_REQUESTS_LIVE = false;

export const TOUR_STEP_IDS = ["welcome", "taste", "cellar", "learn", "community", "profile"] as const;
export type TourStepId = (typeof TOUR_STEP_IDS)[number];

export type TourStep = {
  id: TourStepId;
  title: string;
  /** One or two paragraphs, rendered in order. */
  paragraphs: readonly string[];
};

/** Every other user-visible string of the tour and of its reset card. */
export const TOUR_COPY = {
  back: "Back",
  next: "Next",
  done: "Done",
  skip: "Skip tour",
  setUp: "Set up my profile",
  later: "Later",
  cardTitle: "Getting started",
  showAgain: "Show the tour again",
} as const;

/** Where "Set up my profile" goes (D5 step 6). */
export const TOUR_SETUP_HREF = "/profile/edit";
/** Where "Show the tour again" sends the person, and the tour opens (D2). */
export const TOUR_REPLAY_HREF = "/overview";

/** The screen-reader position line under the dots. */
export function tourStepLabel(position: number, total: number): string {
  return `Step ${position} of ${total}`;
}

/** The steps, in order (D5). The camera clause only where the device can
    scan (coarse pointer AND a camera, `useCanScan`); "Make it yours" only for
    a bare profile; the friend sentence follows FRIEND_REQUESTS_LIVE. */
export function tourSteps(opts: {
  canScan: boolean;
  profileBare: boolean;
  friendRequestsLive: boolean;
}): TourStep[] {
  const addBy = opts.canScan
    ? "scanning a label with the camera at the top"
    : "searching the shared catalog";
  const befriend = opts.friendRequestsLive ? "send a friend request" : "add friends";
  const steps: TourStep[] = [
    {
      id: "welcome",
      title: "Welcome to Blindr",
      paragraphs: [
        "Blind tastings with friends, scored the way the Danish championship scores them; notes on every wine you drink; your cellar; and a map of the wine world. This takes a minute.",
      ],
    },
    {
      id: "taste",
      title: "Taste",
      paragraphs: [
        "Taste Blind: start a tasting, live around one table or self-paced, invite friends, everyone guesses country, region, grape, producer and vintage, the host reveals glass by glass, points per category.",
        "Taste & Rate: a WSET-style note on any wine, no game.",
      ],
    },
    {
      id: "cellar",
      title: "Cellar & Catalog",
      paragraphs: [
        `Add bottles by ${addBy} — the catalog is everyone's reference, your cellar is yours and private unless you say otherwise.`,
      ],
    },
    {
      id: "learn",
      title: "Learn",
      paragraphs: [
        "The wine map: pinch into a country for its regions and appellations; the Library explains designations and grapes.",
      ],
    },
    {
      id: "community",
      title: "Community",
      paragraphs: [
        `Find people, ${befriend}, share your invite link. Friends can see each other's cellars when you allow it.`,
      ],
    },
  ];
  if (opts.profileBare) {
    steps.push({
      id: "profile",
      title: "Make it yours",
      paragraphs: ["Add a photo and your city so friends recognise you; pick your favourite regions."],
    });
  }
  return steps;
}

// D4: never on the sign-in paths, an invite or join link, anywhere inside a
// tasting (a join-link newcomer sees it on their first page after it), or on
// /profile/edit while the person is already there. First path segment only.
const EXCLUDED_SEGMENTS = new Set(["auth", "invite", "j", "tastings"]);
const EXCLUDED_PREFIXES = ["login", "signup"];

export function tourVisibleOn(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.split(/[?#]/, 1)[0];
  const segments = path.split("/").filter(Boolean);
  const first = segments[0] ?? "";
  if (EXCLUDED_SEGMENTS.has(first)) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => first.startsWith(prefix))) return false;
  if (first === "profile" && segments[1] === "edit") return false;
  return true;
}

/** This visit's tour state, held by TourProvider: "fresh" until something
    happens; "dismissed" once any dismissal ran (whatever its write did);
    "replay" once "Show the tour again" asked for it. */
export type TourVisit = "fresh" | "dismissed" | "replay";

/** Whether the sheet is open. The server's `tourSeen` is the value at the
    last full render of the root layout, which a soft navigation does not
    re-render — so this decides on the client, from that prop, the visit and
    the current path. Nothing before hydration (D7). */
export function tourShouldOpen(input: {
  hydrated: boolean;
  tourSeen: boolean;
  visit: TourVisit;
  pathname: string | null | undefined;
}): boolean {
  if (!input.hydrated || input.visit === "dismissed") return false;
  if (!tourVisibleOn(input.pathname)) return false;
  return input.visit === "replay" || !input.tourSeen;
}

/** Keeps a step index inside a list that may have shrunk under it. */
export function clampStep(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}

export type TourFooter = { back: boolean; skip: boolean; primary: "next" | "done" | "profile" };

/** The footer of the step at `index` (D3, D5). Skip tour on every step but
    the last, where Done — or Later / Set up my profile — already ends it. */
export function tourFooter(steps: readonly TourStep[], index: number): TourFooter {
  const at = clampStep(index, steps.length);
  const last = at === steps.length - 1;
  if (!last) return { back: at > 0, skip: true, primary: "next" };
  return { back: at > 0, skip: false, primary: steps[at]?.id === "profile" ? "profile" : "done" };
}

/** D5 step 6: a profile is bare with no photo AND no location (blank counts as none). */
export function isProfileBare(profile: { avatarUrl: string | null; location: string | null }): boolean {
  return !profile.avatarUrl?.trim() && !profile.location?.trim();
}

/** D1: null = show the tour. A missing or failed profile read counts as seen,
    so an error never shows the tour again to someone who dismissed it. */
export function tourSeenFromProfile(profile: { tour_seen_at: string | null } | null | undefined): boolean {
  return profile ? profile.tour_seen_at !== null : true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && npx vitest run src/lib/first-run/tour.test.ts`
Expected: PASS, every test green, 0 failures.

- [ ] **Step 5: Lint**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && npx eslint src/lib/first-run/tour.ts src/lib/first-run/tour.test.ts`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-tour && git add src/lib/first-run/tour.ts src/lib/first-run/tour.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(tour): pure first-run tour rules and copy" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Server actions `markTourSeen` / `resetTour`

**Files:**
- Create: `src/lib/first-run/actions.ts`
- Test: `src/lib/first-run/actions.test.ts`

**Interfaces:**
- Consumes: `createClient()` from `src/lib/supabase/server.ts` (async; returns the cookie-bound Supabase server client); Task 1's `tour_seen_at` in `database.types.ts`.
- Produces: `markTourSeen(): Promise<boolean>` and `resetTour(): Promise<boolean>` — `true` when the row write was accepted, `false` when signed out or refused. Never throw for a refused write.

The actions import the server client RELATIVELY (`../supabase/server`) so the test can replace it with `vi.mock`: vitest here has no `@/` alias. There is no RPC: the column is in the client grant and `"profiles update own"` is the row gate (spec §2).

- [ ] **Step 1: Write the failing test**

Create `src/lib/first-run/actions.test.ts`:

```ts
// The two first-run tour writes (spec D2), with the Supabase server client
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
          return { error: fake.refuse ? { message: "permission denied for table profiles" } : null };
        },
      }),
    }),
  }),
}));

import { markTourSeen, resetTour } from "./actions";

beforeEach(() => {
  fake.userId = "user-1";
  fake.refuse = false;
  fake.writes.length = 0;
});

describe("markTourSeen (D2)", () => {
  it("stamps the signed-in person's own profile with the current time, and nothing else", async () => {
    const before = Date.now();
    await expect(markTourSeen()).resolves.toBe(true);
    expect(fake.writes).toHaveLength(1);
    const [write] = fake.writes;
    expect(write.table).toBe("profiles");
    expect([write.column, write.value]).toEqual(["id", "user-1"]);
    expect(Object.keys(write.values)).toEqual(["tour_seen_at"]);
    const at = Date.parse(String(write.values.tour_seen_at));
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it("writes nothing and answers false when signed out", async () => {
    fake.userId = null;
    await expect(markTourSeen()).resolves.toBe(false);
    expect(fake.writes).toHaveLength(0);
  });

  it("answers false, without throwing, when the write is refused", async () => {
    fake.refuse = true;
    await expect(markTourSeen()).resolves.toBe(false);
  });
});

describe("resetTour (D2)", () => {
  it("clears the signed-in person's stamp to null", async () => {
    await expect(resetTour()).resolves.toBe(true);
    expect(fake.writes).toEqual([
      { table: "profiles", values: { tour_seen_at: null }, column: "id", value: "user-1" },
    ]);
  });

  it("writes nothing and answers false when signed out", async () => {
    fake.userId = null;
    await expect(resetTour()).resolves.toBe(false);
    expect(fake.writes).toHaveLength(0);
  });

  it("answers false, without throwing, when the write is refused", async () => {
    fake.refuse = true;
    await expect(resetTour()).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && npx vitest run src/lib/first-run/actions.test.ts`
Expected: FAIL — `Failed to load url ./actions` (or "Cannot find module './actions'").

- [ ] **Step 3: Write the implementation**

Create `src/lib/first-run/actions.ts`:

```ts
"use server";

// First-run tour writes (spec docs/superpowers/specs/2026-09-25-first-run-tour-design.md
// D2). Both write profiles.tour_seen_at as the signed-in person: the column is
// in the client UPDATE grant (20260925010000) and "profiles update own" is the
// row gate, so no RPC is needed. A "use server" module exports async functions
// only (CLAUDE.md) — the copy and every rule live in ./tour.ts.
//
// Relative import, not "@/lib/supabase/server": actions.test.ts replaces the
// client with vi.mock, and vitest here has no "@/" alias.
import { createClient } from "../supabase/server";

/** Skip tour, Done, Later, Set up my profile, the X and Escape. False when
    signed out or refused; the caller keeps the tour closed for the visit
    either way, so a failure only means it may show again on a later visit. */
export async function markTourSeen(): Promise<boolean> {
  return writeTourSeenAt(new Date().toISOString());
}

/** "Show the tour again" on /profile/edit: null means show it again. */
export async function resetTour(): Promise<boolean> {
  return writeTourSeenAt(null);
}

async function writeTourSeenAt(value: string | null): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase
    .from("profiles")
    .update({ tour_seen_at: value })
    .eq("id", user.id);
  return !error;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && npx vitest run src/lib/first-run/actions.test.ts`
Expected: PASS, 6 tests, 0 failures.

- [ ] **Step 5: Type-check and lint**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && npx tsc --noEmit && npx eslint src/lib/first-run/actions.ts src/lib/first-run/actions.test.ts`
Expected: no output. (A tsc error on `tour_seen_at` means Task 1's `database.types.ts` edit is missing — do not work around it.)

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-tour && git add src/lib/first-run/actions.ts src/lib/first-run/actions.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(tour): markTourSeen and resetTour server actions" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The sheet — `TourSheet`

**Files:**
- Create: `src/components/first-run/tour-sheet.tsx`

**Interfaces:**
- Consumes: from `@/lib/first-run/tour` — `FRIEND_REQUESTS_LIVE`, `TOUR_COPY`, `TOUR_SETUP_HREF`, `clampStep`, `tourFooter`, `tourStepLabel`, `tourSteps`, `type TourStepId`; `useCanScan(): boolean | null` from `@/components/add-wine/use-can-scan`; `Dialog`, `DialogContent`, `DialogTitle`, `DialogDescription` from `@/components/ui/dialog`; `Button` from `@/components/ui/button`; `cn` from `@/lib/utils`.
- Produces: `TourSheet({ profileBare, onFinish }: { profileBare: boolean; onFinish: () => void })`. The parent mounts it ONLY while the tour is open (so each open starts at step 1) and unmounts it when `onFinish` runs.

Idioms reused, read them if unsure: `src/components/note-saved-sheet.tsx` (a `DialogContent` restyled into a phone bottom sheet with `top-auto bottom-0 left-0 … translate-x-0 translate-y-0 … max-sm:data-open:slide-in-from-bottom-8`, and a `Link` that closes on click); `src/app/tastings/[id]/play/field-picker.tsx` lines 412–436 (the drag-handle pill, `max-h-[88dvh]`, `rounded-t-[22px]`, 480 px from `md`); `src/components/ui/popover.tsx` lines 54–62 (no focus move on touch); `src/app/profile/edit/delete-account-section.tsx` line 54 (the 44 px `TAP` class). The base-ui `Dialog` root accepts `disablePointerDismissal`; `DialogContent` passes `initialFocus`/`finalFocus` to `Dialog.Popup` (base-ui 1.6.0: `initialFocus?: boolean | RefObject | ((openType) => boolean | HTMLElement | null | void)`). A programmatic open reports no pointer type, so the fine-pointer test is `window.matchMedia("(pointer: fine)")`.

No unit test is possible for a component here (vitest has no DOM); every rule it uses is tested in Task 3, and the main session checks it in the browser (Task 10).

- [ ] **Step 1: Write the component**

Create `src/components/first-run/tour-sheet.tsx`:

```tsx
"use client";

// The first-run tour sheet (spec docs/superpowers/specs/2026-09-25-first-run-tour-design.md
// D3, D5, D8). One base-ui Dialog: a bottom sheet on phones (rounded top,
// drag-handle pill, at most 88dvh — the field-picker idiom) and a centred
// 480 px card from `md`. TourProvider mounts it only while the tour is open,
// so every open starts at step 1. The steps, the copy and the footer come
// from src/lib/first-run/tour.ts; this file only lays them out.
//
// Dismissal (D2): Skip tour, Done, Later, "Set up my profile", the X and
// Escape all call `onFinish`. An outside tap does nothing
// (`disablePointerDismissal`): the tour shows once per account, and a stray
// tap on the dimmed page should not use that once up.
//
// Focus (D8): moves to Next on a fine pointer only. On touch nothing moves on
// open — the Popover rule (src/components/ui/popover.tsx): a just-opened popup
// taking focus on a phone yanked the page. base-ui's default "first tabbable"
// would have been Skip tour, one Enter away from ending the tour.
//
// Tokens only, so the portal follows `.dark` like every other surface.
import { useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { Boxes, GraduationCap, Sparkles, UserRound, Users, Wine } from "lucide-react";
import { useCanScan } from "@/components/add-wine/use-can-scan";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  FRIEND_REQUESTS_LIVE,
  TOUR_COPY,
  TOUR_SETUP_HREF,
  clampStep,
  tourFooter,
  tourStepLabel,
  tourSteps,
  type TourStepId,
} from "@/lib/first-run/tour";
import { cn } from "@/lib/utils";

// The sidebar's pillar icons where a step is a pillar (app-sidebar.tsx ICONS).
const STEP_ICONS: Record<TourStepId, ComponentType<{ className?: string }>> = {
  welcome: Sparkles,
  taste: Wine,
  cellar: Boxes,
  learn: GraduationCap,
  community: Users,
  profile: UserRound,
};

// 44 px tap targets on touch, the control's own height on a laptop pointer
// (delete-account-section.tsx's TAP).
const TAP = "min-h-11 md:pointer-fine:min-h-0";

// Below md: a sheet from the bottom, overriding DialogContent's centred
// defaults the way note-saved-sheet.tsx does (tailwind-merge drops the
// defaults these replace).
const PHONE =
  "top-auto bottom-0 left-0 flex max-h-[88dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-[22px_22px_0_0] bg-card p-0 text-foreground ring-0 sm:max-w-none max-md:data-open:zoom-in-100 max-md:data-open:slide-in-from-bottom-8";

// md and up: a centred 480 px card.
const CARD =
  "md:top-1/2 md:bottom-auto md:left-1/2 md:max-h-[80vh] md:w-[480px] md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:ring-1 md:ring-foreground/10 md:shadow-[0_30px_60px_-28px_color-mix(in_srgb,var(--foreground)_50%,transparent)]";

function finePointer(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
}

export function TourSheet({
  profileBare,
  onFinish,
}: {
  profileBare: boolean;
  /** Every way the tour ends (D2). The parent stamps the flag and unmounts this. */
  onFinish: () => void;
}) {
  // `null` until detection resolves: the catalog wording until then (D5 step 3).
  const canScan = useCanScan() === true;
  const steps = tourSteps({ canScan, profileBare, friendRequestsLive: FRIEND_REQUESTS_LIVE });
  const [index, setIndex] = useState(0);
  // The list can shrink under an open sheet (a refresh that fills the profile).
  const at = clampStep(index, steps.length);
  const step = steps[at];
  const footer = tourFooter(steps, at);
  const Icon = STEP_ICONS[step.id];
  const nextRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(next) => {
        // The X (close-press) and Escape (escape-key).
        if (!next) onFinish();
      }}
    >
      <DialogContent
        initialFocus={() => (finePointer() ? (nextRef.current ?? true) : false)}
        finalFocus={false}
        className={cn(PHONE, CARD)}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pt-3 pb-5 md:gap-4 md:px-7 md:pt-7 md:pb-6">
          <span aria-hidden className="h-1 w-[38px] shrink-0 self-center rounded-full bg-border md:hidden" />
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <Icon className="size-5" />
          </span>
          <DialogTitle className="text-[22px] leading-tight font-semibold md:text-[26px]">
            {step.title}
          </DialogTitle>
          <DialogDescription
            render={<div />}
            className="flex flex-col gap-2 text-[14px] leading-relaxed text-muted-foreground md:text-[14.5px]"
          >
            {step.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </DialogDescription>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-background px-5 pt-3 pb-[max(18px,env(safe-area-inset-bottom))] md:px-7 md:pb-4">
          <div className="flex min-h-11 items-center gap-3 md:pointer-fine:min-h-8">
            <div aria-hidden className="flex items-center gap-1.5">
              {steps.map((s, i) => (
                <span
                  key={s.id}
                  className={cn(
                    "h-1.5 rounded-full transition-[width,background-color] duration-200",
                    i === at ? "w-4 bg-primary dark:bg-primary-ink" : "w-1.5 bg-border-strong",
                  )}
                />
              ))}
            </div>
            <span className="sr-only" aria-live="polite">
              {tourStepLabel(at + 1, steps.length)}
            </span>
            {footer.skip ? (
              <button
                type="button"
                onClick={onFinish}
                className={cn(
                  "ml-auto inline-flex items-center rounded-md px-1 text-[12.5px] font-semibold text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                  TAP,
                )}
              >
                {TOUR_COPY.skip}
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {footer.back ? (
              <Button type="button" variant="outline" className={TAP} onClick={() => setIndex(at - 1)}>
                {TOUR_COPY.back}
              </Button>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {footer.primary === "next" ? (
                <Button ref={nextRef} type="button" className={cn(TAP, "px-4")} onClick={() => setIndex(at + 1)}>
                  {TOUR_COPY.next}
                </Button>
              ) : footer.primary === "done" ? (
                <Button type="button" className={cn(TAP, "px-4")} onClick={onFinish}>
                  {TOUR_COPY.done}
                </Button>
              ) : (
                <>
                  <Button type="button" variant="ghost" className={TAP} onClick={onFinish}>
                    {TOUR_COPY.later}
                  </Button>
                  {/* Button renders a Link here, so nativeButton={false}
                      (CLAUDE.md, Base UI). The click stamps the flag; the
                      Link navigates. */}
                  <Button
                    render={<Link href={TOUR_SETUP_HREF} />}
                    nativeButton={false}
                    className={cn(TAP, "px-4")}
                    onClick={onFinish}
                  >
                    {TOUR_COPY.setUp}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 3: Lint**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && npx eslint src/components/first-run/tour-sheet.tsx`
Expected: no output. If `react-hooks/refs` flags `nextRef.current` inside `initialFocus`, note that `note-saved-sheet.tsx` line 82 reads refs inside the same prop and passes; compare the two before changing anything.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-tour && git add src/components/first-run/tour-sheet.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(tour): the first-run tour sheet" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `TourProvider` and the `AppShell` wiring

**Files:**
- Create: `src/components/first-run/tour-provider.tsx`
- Modify: `src/components/app-shell.tsx` (imports at lines 1–4; the profile select at lines 16–21; the returned tree at lines 23–45)

**Interfaces:**
- Consumes: `TourSheet` (Task 5); `markTourSeen` (Task 4); `tourShouldOpen`, `type TourVisit`, `tourSeenFromProfile`, `isProfileBare` (Task 3).
- Produces: `TourProvider({ tourSeen, profileBare, children })` and `useTourReplay(): () => void` (Task 7 uses it). `AppShell` mounts `TourProvider` once, around every signed-in page.

Why a provider and not a bare `<TourSheet>`: `AppShell` is rendered by the ROOT layout (`src/app/layout.tsx` line 68), and a root layout does not re-render on a soft navigation. So (a) the page a person reaches first may be excluded (`/tastings/<id>`), and the tour must open when they later move to `/overview` client-side — `usePathname()` drives that; and (b) "Show the tour again" on `/profile/edit` must reopen it in the same visit, which the server prop alone cannot do — the context's `replay()` does. The spec's "opens in a `useEffect`" is met with the hydration idiom instead (server snapshot `false`), because `react-hooks/set-state-in-effect` forbids setting state in an effect.

- [ ] **Step 1: Write the provider**

Create `src/components/first-run/tour-provider.tsx`:

```tsx
"use client";

// First-run tour state (spec docs/superpowers/specs/2026-09-25-first-run-tour-design.md
// D2, D4, D6, D7). AppShell mounts this once, around every signed-in page.
// AppShell lives in the ROOT layout, which a soft navigation does not
// re-render, so `tourSeen` is the value at the last full render and whether
// the sheet is open is decided here, from that prop, this visit's state and
// the current path (`tourShouldOpen`, pure and tested in
// src/lib/first-run/tour.ts):
// - "fresh": opens on the first allowed page while the account has not seen it
//   (a join-link newcomer lands in a tasting, excluded, and sees it on the
//   first page after);
// - "dismissed": shut for the rest of the visit, whatever the write did (D2);
// - "replay": /profile/edit's "Show the tour again" asked for it.
// Nothing renders before hydration (server snapshot false): no server flash,
// no hydration mismatch, and no setState in an effect. No polling (D6): the
// only request is the one dismissal write.
import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { markTourSeen } from "@/lib/first-run/actions";
import { tourShouldOpen, type TourVisit } from "@/lib/first-run/tour";
import { TourSheet } from "./tour-sheet";

const TourReplayContext = createContext<() => void>(() => {});

/** Opens the tour again on the next allowed page; the caller navigates there.
    A no-op outside TourProvider (signed out, AppShell renders no provider). */
export function useTourReplay(): () => void {
  return useContext(TourReplayContext);
}

function subscribeNoop() {
  return () => {};
}

export function TourProvider({
  tourSeen,
  profileBare,
  children,
}: {
  tourSeen: boolean;
  profileBare: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const [visit, setVisit] = useState<TourVisit>("fresh");
  const open = tourShouldOpen({ hydrated, tourSeen, visit, pathname });

  const replay = useCallback(() => setVisit("replay"), []);
  const finish = useCallback(() => {
    setVisit("dismissed");
    // One write per dismissal (D2). A refused or failed write only means the
    // tour may show again on a later visit; this visit stays shut in state.
    void markTourSeen().catch(() => false);
  }, []);

  return (
    <TourReplayContext.Provider value={replay}>
      {children}
      {open ? <TourSheet profileBare={profileBare} onFinish={finish} /> : null}
    </TourReplayContext.Provider>
  );
}
```

- [ ] **Step 2: Wire it into `AppShell`**

In `src/components/app-shell.tsx`:

Replace the imports

```tsx
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { AddWineProvider } from "@/components/add-wine-context";
import { TasteLauncherProvider } from "@/components/taste-launcher-context";
```

with

```tsx
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { AddWineProvider } from "@/components/add-wine-context";
import { TasteLauncherProvider } from "@/components/taste-launcher-context";
import { TourProvider } from "@/components/first-run/tour-provider";
import { isProfileBare, tourSeenFromProfile } from "@/lib/first-run/tour";
```

Replace

```tsx
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle();
  const isManager = profile?.role === "ADMIN" || profile?.role === "CONTRIBUTOR";
```

with

```tsx
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, role, location, tour_seen_at")
    .eq("id", user.id)
    .maybeSingle();
  const isManager = profile?.role === "ADMIN" || profile?.role === "CONTRIBUTOR";
  // First-run tour (spec 2026-09-25 D1, D5, D6): the flag rides on this one
  // profile read — no extra request. A failed read counts as seen, so an
  // error never shows the tour again to someone who dismissed it.
  const tourSeen = tourSeenFromProfile(profile);
  const profileBare = isProfileBare({
    avatarUrl: profile?.avatar_url ?? null,
    location: profile?.location ?? null,
  });
```

Replace the returned tree

```tsx
  return (
    <AddWineProvider userId={user.id}>
      <TasteLauncherProvider userId={user.id}>
        {/* The window never scrolls: the content column is the scroll
            container. That's the only arrangement iPad Safari can't defeat —
            both sticky and fixed sidebars drifted with its collapsing
            browser chrome. */}
        <div className="flex h-dvh overflow-hidden">
          <AppSidebar
            isManager={isManager}
            user={{
              id: user.id,
              name: profile?.display_name ?? user.email ?? "",
              avatarUrl: profile?.avatar_url ?? null,
            }}
          />
          <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
            {children}
          </div>
        </div>
      </TasteLauncherProvider>
    </AddWineProvider>
  );
```

with

```tsx
  return (
    <AddWineProvider userId={user.id}>
      <TasteLauncherProvider userId={user.id}>
        {/* Around the whole shell: /profile/edit's "Show the tour again"
            reaches it through useTourReplay(). */}
        <TourProvider tourSeen={tourSeen} profileBare={profileBare}>
          {/* The window never scrolls: the content column is the scroll
              container. That's the only arrangement iPad Safari can't defeat —
              both sticky and fixed sidebars drifted with its collapsing
              browser chrome. */}
          <div className="flex h-dvh overflow-hidden">
            <AppSidebar
              isManager={isManager}
              user={{
                id: user.id,
                name: profile?.display_name ?? user.email ?? "",
                avatarUrl: profile?.avatar_url ?? null,
              }}
            />
            <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
              {children}
            </div>
          </div>
        </TourProvider>
      </TasteLauncherProvider>
    </AddWineProvider>
  );
```

- [ ] **Step 3: Type-check, lint, and the whole unit suite**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && npx tsc --noEmit && npx eslint src/components/first-run/tour-provider.tsx src/components/app-shell.tsx && npx vitest run`
Expected: tsc and eslint print nothing; vitest reports 0 failures.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-tour && git add src/components/first-run/tour-provider.tsx src/components/app-shell.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(tour): mount the first-run tour in AppShell" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: "Getting started" card on `/profile/edit`

**Files:**
- Create: `src/app/profile/edit/show-tour-again-button.tsx`
- Modify: `src/app/profile/edit/page.tsx` (imports at lines 1–9; insert a card between the Appearance card, lines 58–69, and `<DeleteAccountSection />`, line 73)

**Interfaces:**
- Consumes: `useTourReplay()` (Task 6); `resetTour()` (Task 4); `TOUR_COPY`, `TOUR_REPLAY_HREF` (Task 3).
- Produces: `ShowTourAgainButton()`; the card on `/profile/edit`.

The card follows the Appearance card (its own `Card`, not a row of the profile form). The button clears the column, then reopens the tour from the provider's state and sends the person to `/overview`, where it opens. It reopens even if the write failed: they asked to see it, and the next dismissal stamps it again.

- [ ] **Step 1: Write the button**

Create `src/app/profile/edit/show-tour-again-button.tsx`:

```tsx
"use client";

// "Show the tour again" (first-run tour spec D2), on /profile/edit's Getting
// started card. Clears profiles.tour_seen_at, then opens the tour from
// TourProvider's state and sends the person to /overview, where it shows.
// TourProvider lives in the root layout, which a soft navigation does not
// re-render, so the cleared column alone would not reopen it this visit. It
// reopens even if the write failed: the person asked to see it, and their
// next dismissal stamps it again.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTourReplay } from "@/components/first-run/tour-provider";
import { Button } from "@/components/ui/button";
import { resetTour } from "@/lib/first-run/actions";
import { TOUR_COPY, TOUR_REPLAY_HREF } from "@/lib/first-run/tour";

export function ShowTourAgainButton() {
  const replay = useTourReplay();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      className="min-h-11 md:pointer-fine:min-h-0"
      onClick={() =>
        startTransition(async () => {
          await resetTour().catch(() => false);
          replay();
          router.push(TOUR_REPLAY_HREF);
        })
      }
    >
      {TOUR_COPY.showAgain}
    </Button>
  );
}
```

- [ ] **Step 2: Add the card to the page**

In `src/app/profile/edit/page.tsx`, replace

```tsx
import { DeleteAccountSection } from "./delete-account-section";
import { ThemeToggle } from "@/components/theme-toggle";
```

with

```tsx
import { DeleteAccountSection } from "./delete-account-section";
import { ShowTourAgainButton } from "./show-tour-again-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { TOUR_COPY } from "@/lib/first-run/tour";
```

and replace

```tsx
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>

        {/* Last, and its own card: it acts on the whole account, not on a
```

with

```tsx
          <CardContent>
            <ThemeToggle />
          </CardContent>
        </Card>

        {/* Its own card, like Appearance: it replays the first-run tour
            (spec 2026-09-25 D2), not a field of the profile form. */}
        <Card>
          <CardHeader>
            <CardTitle>{TOUR_COPY.cardTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ShowTourAgainButton />
          </CardContent>
        </Card>

        {/* Last, and its own card: it acts on the whole account, not on a
```

- [ ] **Step 3: Type-check and lint**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && npx tsc --noEmit && npx eslint src/app/profile/edit/show-tour-again-button.tsx src/app/profile/edit/page.tsx`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-tour && git add src/app/profile/edit/show-tour-again-button.tsx src/app/profile/edit/page.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(tour): Show the tour again on /profile/edit" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` — the Account deletion bullet (around line 475), the Favourite regions bullet (around line 1135), and a new top-level bullet inserted directly before the line `- Tasting lifecycle: a new tasting is created \`DRAFT\` ("not started"), NOT` (around line 823, right after the Active-tasting banner bullet).

**Interfaces:**
- Consumes: the names from Tasks 1–7.
- Produces: documentation only.

- [ ] **Step 1: The grant is ten columns now (Account deletion bullet)**

Replace

```
  guests. Client UPDATE on `profiles` is a column grant on nine columns
  (display_name, bio, avatar_url, location, phone, favorite_wine_type,
  cellar_visibility, preferred_currency, last_seen_at); before it, any member
```

with

```
  guests. Client UPDATE on `profiles` is a column grant on ten columns
  (display_name, bio, avatar_url, location, phone, favorite_wine_type,
  cellar_visibility, preferred_currency, last_seen_at, and since
  20260925010000 tour_seen_at — see "First-run tour"); before it, any member
```

- [ ] **Step 2: The Favourite regions bullet**

Replace

```
  `database.types.ts`'s Row and in the nine-column `profiles` UPDATE grant,
```

with

```
  `database.types.ts`'s Row and in the `profiles` client UPDATE grant,
```

- [ ] **Step 3: The new bullet**

Insert, directly before the line that starts `- Tasting lifecycle: a new tasting is created`:

```
- **First-run tour** (2026-09-25, spec
  `docs/superpowers/specs/2026-09-25-first-run-tour-design.md`, migration
  `20260925010000_tour_seen.sql`). A six-step "Get started" sheet
  (`TourSheet`, `src/components/first-run/tour-sheet.tsx`: one base-ui
  `Dialog`, a bottom sheet below `md`, a centred 480 px card from `md`) shown
  ONCE PER ACCOUNT. The flag is `profiles.tour_seen_at` (null = show), in the
  client UPDATE column grant, readable by every member like `last_seen_at`,
  and deliberately NOT scrubbed by `scrub_deleted_account` (not personal
  data). Per account, not per device, because the complaint was "the same
  person keeps getting them": a localStorage flag repeats on every device and
  private window, and `user_metadata` is neither readable in the server
  render without an Auth call nor queryable. Every profile was null at
  release, so every existing user saw it once. `TourProvider`
  (`tour-provider.tsx`) is mounted once by `AppShell`, which selects
  `tour_seen_at`, `avatar_url` and `location` on its one profile read (no
  polling; a failed read counts as seen, `tourSeenFromProfile`). AppShell is
  in the ROOT layout, which never re-renders on a soft navigation, so "open
  or not" is client state (`fresh` / `dismissed` / `replay`) over
  `usePathname()` (`tourShouldOpen`), opened after hydration, not the server
  prop alone. Never on `/auth/*`, `/login*`, `/signup*`, `/invite/*`, `/j/*`,
  `/tastings` and below, or `/profile/edit` (`tourVisibleOn`): a self-serve
  newcomer sees it on `/taste`, an invited one on `/overview`, a join-link
  newcomer on their first page after the tasting. Skip tour, Done, Later,
  "Set up my profile", the X and Escape all dismiss through the
  `"use server"` `markTourSeen()` (`src/lib/first-run/actions.ts`); an
  outside tap does not (`disablePointerDismissal`); a failed write keeps it
  shut for the visit only. Focus moves in on a fine pointer only (the Popover
  touch rule). `/profile/edit`'s "Getting started" card → "Show the tour
  again" (`resetTour()` sets null, then `useTourReplay()` and
  `router.push("/overview")`). Steps, copy and exclusions are pure in
  `src/lib/first-run/tour.ts` (vitest): the Cellar & Catalog step names the
  header camera only when `useCanScan()` is true; "Make it yours" shows only
  for a bare profile (no avatar AND no location); the Community sentence says
  "add friends" until `FRIEND_REQUESTS_LIVE` is flipped to true in the
  friend-requests deploy (main session). DB suite:
  `scripts/tour-seen.test.mjs`.
```

- [ ] **Step 4: Check**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && grep -n "nine-column\|nine columns" CLAUDE.md; grep -c "First-run tour" CLAUDE.md; git diff --check`
Expected: the first grep prints nothing; the count is `2` (the new bullet and the Account deletion cross-reference); `git diff --check` prints nothing.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-tour && git add CLAUDE.md && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "docs: the first-run tour in CLAUDE.md" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Main session only (Tasks 9–14)

An implementer subagent stops after Task 8. Every block below sets `SCRATCH`, because shell state does not persist between calls:
`SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad`.

### Task 9: Apply the migration live

**Files:**
- No repository change. Scratch files: `$SCRATCH/tour-live-check.mjs`, and only if needed `$SCRATCH/apply-tour-seen.mjs`.

**Interfaces:**
- Consumes: Task 1's file; Task 2's suite; `DATABASE_URL` (session pooler, `aws-0-eu-central-1.pooler.supabase.com:5432`) and `DB_PASSWORD` from the worktree's `.env.local`.
- Produces: `profiles.tour_seen_at` live, the ten-column grant live, the `20260925010000` version row; the read-only checker Tasks 10–12 reuse.

Additive and invisible to the deployed app, so it may run at any time before Task 11's push.

- [ ] **Step 1: Write the read-only checker**

Write `$SCRATCH/tour-live-check.mjs`:

```js
// Read-only live checks for the first-run tour (plan 2026-09-25 Tasks 9-12).
// Every query runs inside `begin read only` and ends in rollback.
// Usage (from the worktree): node --env-file=.env.local <this> pre|post|demo|seen <email>|tasting <email>
import { createRequire } from "node:module";

const WT = "C:/Users/Public/repos/blindtastingapp-tour";
const require = createRequire(`${WT}/package.json`);
const pg = require("pg");
const { pgConfig } = await import(`file:///${WT}/scripts/wine-map-tiles/lib.mjs`);

const [mode, arg] = process.argv.slice(2);
const client = new pg.Client(pgConfig());
await client.connect();
try {
  await client.query("begin read only");
  if (mode === "pre" || mode === "post") {
    const col = await client.query(
      `select format_type(a.atttypid, a.atttypmod) as type, a.attnotnull, a.atthasdef
         from pg_attribute a
        where a.attrelid = 'public.profiles'::regclass and a.attname = 'tour_seen_at' and not a.attisdropped`,
    );
    const acl = await client.query(
      `select string_agg(format('%s:%s', a.attname, x.privilege_type), ','
                order by a.attname::text collate "C", x.privilege_type collate "C") as acl
         from pg_attribute a, aclexplode(a.attacl) x
        where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped`,
    );
    const mig = await client.query(
      "select version from supabase_migrations.schema_migrations order by version desc limit 3",
    );
    const n = await client.query("select count(*)::int as total from profiles");
    const out = { column: col.rows[0] ?? null, acl: acl.rows[0].acl, latest: mig.rows.map((r) => r.version), profiles: n.rows[0].total };
    if (mode === "post" && col.rows[0]) {
      out.stamped = (await client.query("select count(tour_seen_at)::int as n from profiles")).rows[0].n;
    }
    console.log(JSON.stringify(out, null, 2));
  } else if (mode === "demo") {
    const r = await client.query(
      `select id, email, avatar_url is null as no_avatar, location is null as no_location
         from profiles where email like 'demo.%@blindr.invalid' and deleted_at is null order by email`,
    );
    console.table(r.rows);
  } else if (mode === "seen") {
    const r = await client.query("select email, tour_seen_at from profiles where email = $1", [arg]);
    console.log(JSON.stringify(r.rows));
  } else if (mode === "tasting") {
    const r = await client.query(
      `select t.id, t.name, t.status from tastings t
         join tasting_participants tp on tp.tasting_id = t.id
         join profiles p on p.id = tp.user_id
        where p.email = $1 order by t.created_at desc limit 3`,
      [arg],
    );
    console.table(r.rows);
  } else {
    throw new Error("mode: pre | post | demo | seen <email> | tasting <email>");
  }
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}
```

- [ ] **Step 2: Pre-check live**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-tour && git status --short && node --env-file=.env.local "$SCRATCH/tour-live-check.mjs" pre
```

Expected: `git status` clean apart from untracked files; `"column": null`; `acl` is exactly the nine-column string of the migration's pre-state; `latest` does not contain `20260925010000`. Anything else: stop and re-read live before applying.

- [ ] **Step 3: Dry run**

```bash
cd /c/Users/Public/repos/blindtastingapp-tour && DB_URL="$(node --env-file=.env.local -e 'process.stdout.write(process.env.DATABASE_URL ?? "")')" && test -n "$DB_URL" && npx supabase db push --db-url "$DB_URL" --dry-run
```

Expected: it would push exactly one file, `20260925010000_tour_seen.sql`. Never print `$DB_URL`.
- If it lists any other file, or fails with "Remote migration versions not found in local migrations directory" (live carries versions this folder lacks, e.g. the live-only `20260829265003`), do NOT run `supabase migration repair` and do NOT pass `--include-all`: go to Step 4b.

- [ ] **Step 4a: Apply with `db push` (only when Step 3 listed exactly our file)**

```bash
cd /c/Users/Public/repos/blindtastingapp-tour && DB_URL="$(node --env-file=.env.local -e 'process.stdout.write(process.env.DATABASE_URL ?? "")')" && npx supabase db push --db-url "$DB_URL" --yes
```

Expected: `Applying migration 20260925010000_tour_seen.sql...`, the NOTICE `tour_seen: <n> profiles, every tour_seen_at null; client UPDATE is now ten columns`, then `Finished supabase db push.` If this CLI rejects `--yes` ("unknown flag"), run the same command without `--yes`, piping `printf 'y\n' |` into it. Any `raise exception` text means the transaction rolled back: stop, report it, and do not retry blindly.

- [ ] **Step 4b: Fallback — apply in one transaction with `pg` (only when Step 3 refused)**

Write `$SCRATCH/apply-tour-seen.mjs`:

```js
// Applies supabase/migrations/20260925010000_tour_seen.sql in ONE transaction
// and records its version row, for when `supabase db push` refuses on
// migration-history drift (plan 2026-09-25 Task 9 Step 4b).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const WT = "C:/Users/Public/repos/blindtastingapp-tour";
const require = createRequire(`${WT}/package.json`);
const pg = require("pg");
const { pgConfig } = await import(`file:///${WT}/scripts/wine-map-tiles/lib.mjs`);

const VERSION = "20260925010000";
const NAME = "tour_seen";
const sql = readFileSync(`${WT}/supabase/migrations/${VERSION}_${NAME}.sql`, "utf8").replace(/\r\n/g, "\n");
const client = new pg.Client(pgConfig());
client.on("notice", (n) => console.log("NOTICE:", n.message));
await client.connect();
try {
  await client.query("begin");
  const done = await client.query("select 1 from supabase_migrations.schema_migrations where version = $1", [VERSION]);
  if (done.rowCount) throw new Error(`${VERSION} is already recorded; nothing applied`);
  await client.query(sql);
  const cols = (
    await client.query(
      "select column_name from information_schema.columns where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'",
    )
  ).rows.map((r) => r.column_name);
  const names = ["version"];
  const values = [VERSION];
  if (cols.includes("name")) {
    names.push("name");
    values.push(NAME);
  }
  if (cols.includes("statements")) {
    names.push("statements");
    values.push([sql]);
  }
  await client.query(
    `insert into supabase_migrations.schema_migrations (${names.join(", ")}) values (${names.map((_, i) => `$${i + 1}`).join(", ")})`,
    values,
  );
  await client.query("commit");
  console.log(`LIVE-APPLIED ${VERSION} ${NAME}`);
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error("ROLLED BACK:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
```

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && node --env-file=.env.local "$SCRATCH/apply-tour-seen.mjs"` (with `SCRATCH` set as above).
Expected: the NOTICE line, then `LIVE-APPLIED 20260925010000 tour_seen`. `ROLLED BACK: …` means nothing changed: stop and report.

- [ ] **Step 5: Post-check live**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && node --env-file=.env.local "$SCRATCH/tour-live-check.mjs" post` (with `SCRATCH` set).
Expected: `"column": { "type": "timestamp with time zone", "attnotnull": false, "atthasdef": false }`; `acl` ends `…,preferred_currency:UPDATE,tour_seen_at:UPDATE`; `latest` starts with `20260925010000`; `"stamped": 0`.

- [ ] **Step 6: The live DB suite goes green**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && node --env-file=.env.local --test scripts/tour-seen.test.mjs`
Expected: `# tests 5`, `# pass 5`, `# fail 0`.

---

### Task 10: Branch gates and local browser verification

**Files:**
- No repository change. Scratch: `$SCRATCH/mint-tour.mjs`.

**Interfaces:**
- Consumes: Tasks 1–9 (the column must be live: the local build talks to the live Supabase project).
- Produces: pass/fail for spec §3's browser list on a local production build.

- [ ] **Step 1: Gates**

```bash
cd /c/Users/Public/repos/blindtastingapp-tour && git status --short && npx vitest run && npx tsc --noEmit && npx eslint src/lib/first-run/tour.ts src/lib/first-run/tour.test.ts src/lib/first-run/actions.ts src/lib/first-run/actions.test.ts src/components/first-run/tour-sheet.tsx src/components/first-run/tour-provider.tsx src/components/app-shell.tsx src/app/profile/edit/show-tour-again-button.tsx src/app/profile/edit/page.tsx src/lib/supabase/database.types.ts scripts/tour-seen.test.mjs && npx next build
```

Expected: no modified tracked files; vitest 0 failures (two more test files than at `origin/master`); tsc and eslint silent; the build succeeds.

- [ ] **Step 2: A session minter for this worktree, and the demo account**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
sed 's#repos/blindtastingapp"#repos/blindtastingapp-tour"#' "$SCRATCH/mint.mjs" > "$SCRATCH/mint-tour.mjs" && grep -n 'const repo' "$SCRATCH/mint-tour.mjs"
cd /c/Users/Public/repos/blindtastingapp-tour && node --env-file=.env.local "$SCRATCH/tour-live-check.mjs" demo
```

Expected: `const repo = "C:/Users/Public/repos/blindtastingapp-tour";` and a table of demo profiles. Pick `DEMO` = the first email with `no_avatar` AND `no_location` true (it gets the sixth step); if none is bare, the first email (five steps; the sixth is then covered by Task 3's tests only — note it in the report). Use that email wherever `$DEMO` appears below. Then `node --env-file=.env.local "$SCRATCH/tour-live-check.mjs" tasting "$DEMO"` and note one tasting id as `$TASTING` (if none, use `/tastings/new` wherever `/tastings/$TASTING` appears).

- [ ] **Step 3: Start the production build and sign in**
  - Start the `start` launch configuration of THIS worktree (`.claude/launch.json`: `npm run start`, port 3000). If the session's working directory is the owner's checkout, do not use its launch configuration; instead run `cd /c/Users/Public/repos/blindtastingapp-tour && npx next start -p 3000` with Bash `run_in_background`, and open `http://localhost:3000` with `preview_start`'s `url`.
  - Keep the Browser pane visible (a hidden pane never hydrates — CLAUDE.md).
  - `node "$SCRATCH/mint-tour.mjs" http://localhost:3000 /overview "$DEMO"` and open the printed URL; once on `/overview`, reload once (after a hash login the first shell is the logged-out one — CLAUDE.md).

- [ ] **Step 4: Laptop — first open, steps, Escape** (desktop preset)
  - The tour is open on `/overview`: `document.querySelector('[data-slot="dialog-content"]') !== null`; the title reads "Welcome to Blindr"; the card is 480 px wide (`getBoundingClientRect().width`) and centred; `document.activeElement.textContent === "Next"`.
  - Next through every step; each title and paragraph matches Task 3's `tourSteps` word for word; the Cellar & Catalog step reads "searching the shared catalog" (a laptop has no coarse pointer); Community reads "add friends"; the dots advance; Back returns one step; Skip tour shows on every step but the last; the last step shows Done (five steps) or Later + Set up my profile (six).
  - Click the dimmed page outside the card (e.g. 20, 20): the tour stays open.
  - Press Escape: it closes. `node --env-file=.env.local "$SCRATCH/tour-live-check.mjs" seen "$DEMO"` shows a `tour_seen_at` time.
  - Reload `/overview`, then visit `/taste` and `/catalog`: no tour.

- [ ] **Step 5: Show the tour again, Skip tour**
  - Open `/profile/edit`: a "Getting started" card sits between Appearance and Delete account, with "Show the tour again".
  - Click it: the page goes to `/overview` and the tour opens at step 1. While it is open, `seen "$DEMO"` shows `tour_seen_at: null`.
  - Click Skip tour: it closes, and `seen "$DEMO"` shows a time again.

- [ ] **Step 6: Never inside a tasting; opens on the next page**
  - `/profile/edit` → Show the tour again → the tour opens on `/overview`. Without dismissing it, hard-load `http://localhost:3000/tastings/$TASTING` with the navigate tool.
  - On the tasting page: no `[data-slot="dialog-content"]` from the tour (the flag is null, but the path is excluded).
  - Click Overview in the sidebar (a soft navigation): the tour opens. Close it with the X: `seen "$DEMO"` shows a time.

- [ ] **Step 7: Phone sheet** (`resize_window` preset `mobile`, 375×812, then reload)
  - `/profile/edit` (through the drawer or a hard load) → Show the tour again → on `/overview` the sheet rises from the bottom: `getComputedStyle(document.querySelector('[data-slot="dialog-content"]')).bottom === "0px"`, the drag-handle pill shows, `document.documentElement.scrollWidth <= window.innerWidth`, and the buttons are at least 44 px tall.
  - Focus: if `matchMedia('(pointer: fine)').matches` is false in this emulation, `document.activeElement === document.body` (nothing moved on open); if it is true, record that the emulation reports a fine pointer.
  - Step to the end. With a bare `$DEMO`, "Make it yours" shows Later and Set up my profile; tap Set up my profile: the page is `/profile/edit` and `seen "$DEMO"` shows a time. Otherwise tap Done.
  - Reset with `resize_window` preset `desktop`.

- [ ] **Step 8: Dark mode**
  - `/profile/edit` → Appearance → Dark → Show the tour again. On `/overview`, screenshot the card: text, the icon disc, the active dot (`dark:bg-primary-ink`), the inactive dots and the footer read clearly on the dark card. Done. Switch Appearance back to Light.

- [ ] **Step 9: Console**
  - `read_console_messages` with `onlyErrors`: nothing new since the session started, apart from the one known stale "useAddWine must be used within <AddWineProvider>" after the hash login.

---

### Task 11: Push to master

**Files:**
- No repository change unless a rebase is needed. Scratch: `$SCRATCH/tour-pre-deploy.txt`.

**Interfaces:**
- Consumes: Task 10's green gates; Task 9's live column.
- Produces: the production deploy.

- [ ] **Step 1: Branch state**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-tour && git fetch origin && git status --short && git log --oneline origin/master..HEAD && (git merge-base --is-ancestor origin/master HEAD && echo "fast-forward ok" || echo "master moved")
```

Expected: the log lists the spec commit, the plan commit and Tasks 1–8's commits; "fast-forward ok".
- If it prints "master moved": `git rebase origin/master`. Resolve a conflict only in `CLAUDE.md` or `src/lib/supabase/database.types.ts`, and only by keeping both sides; for any other conflict, `git rebase --abort` and bring the owner in. After a rebase, re-run Task 10 Step 1 in full before continuing.

- [ ] **Step 2: Hard gate — the column is live**

Run: `cd /c/Users/Public/repos/blindtastingapp-tour && node --env-file=.env.local "$SCRATCH/tour-live-check.mjs" post` (with `SCRATCH` set).
Expected: `"column"` is not null and `acl` ends with `tour_seen_at:UPDATE`. If the column is missing, STOP: pushing now would blank every user's sidebar name (AppShell's profile read would fail).

- [ ] **Step 3: Push**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-tour && git fetch origin && git rev-parse origin/master > "$SCRATCH/tour-pre-deploy.txt" && git merge-base --is-ancestor origin/master HEAD && git push origin first-run-tour:master
```

Expected: the push reports a fast-forward (`<old>..<new>  first-run-tour -> master`). A rejection means master moved: go back to Step 1. Never update the local `master` ref (it is checked out in the owner's checkout).

- [ ] **Step 4: Wait for the production deployment**

Wait until Vercel shows the deployment of `$(git rev-parse HEAD)` as Ready: `gh api "repos/christianolin/blindtastingapp/deployments?sha=$(git rev-parse HEAD)" --jq '.[0].id'`, then `gh api "repos/christianolin/blindtastingapp/deployments/<that id>/statuses" --jq '.[0].state'` reads `success` (or check the Vercel dashboard).

---

### Task 12: Live smoke test

**Files:** none.

**Interfaces:**
- Consumes: the Ready production deployment; `$SCRATCH/mint-tour.mjs`, `$SCRATCH/tour-live-check.mjs`, `$DEMO`, `$TASTING` from Task 10.
- Produces: pass/fail, and the note to the owner.

The demo account was stamped in Task 10, so the live check starts from Show the tour again.

- [ ] **Step 1: Sign in on the live site**
  - `node "$SCRATCH/mint-tour.mjs" https://blindrapp.vercel.app /profile/edit "$DEMO"`; open the printed URL; reload once on `/profile/edit`.
  - The Getting started card shows. No tour on `/profile/edit`.

- [ ] **Step 2: The tour on the live site**
  - Show the tour again → `/overview` opens the tour at step 1; step through to the end; Done (or Set up my profile).
  - `seen "$DEMO"` shows a time; reload `/overview`: no tour.
  - Show the tour again, then hard-load `https://blindrapp.vercel.app/tastings/$TASTING`: no tour; click Overview in the sidebar: it opens; Skip tour.
  - At `resize_window` preset `mobile`, one open from Show the tour again: the bottom sheet, no horizontal scroll; close with Skip tour; back to preset `desktop`.
  - Console: no new errors apart from the known stale "useAddWine" line.

- [ ] **Step 3: Tell the owner**
  - Every existing user sees the tour once on their next page load (spec §4), the owner included.
  - The step copy is spec D5's provisional copy and still needs the owner's approval; the Taste step's Live vs self-paced clause reads "live around one table or self-paced".
  - The Community step says "add friends" until the friend-requests deploy flips `FRIEND_REQUESTS_LIVE` (Task 14).
  - If Task 10 Step 2 found no bare demo profile, say the sixth step was checked by unit tests only.

---

### Task 13: Revert plan (only if Task 12 failed)

**Files:** the revert commit only.

**Interfaces:**
- Consumes: the pushed history.
- Produces: production without the tour; the column stays.

The migration is NOT reverted: it is additive, nothing else reads the column, and removing its file would leave live with a version this folder lacks. `database.types.ts`, the DB suite and CLAUDE.md stay too. Only the two commits that make the tour reachable are reverted.

- [ ] **Step 1: Revert the wiring and the card, and push**

```bash
cd /c/Users/Public/repos/blindtastingapp-tour && git status --short && git fetch origin && git merge --ff-only origin/master && WIRE="$(git log --format=%H --grep='^feat(tour): mount the first-run tour in AppShell$' -n 1)" && CARD="$(git log --format=%H --grep='^feat(tour): Show the tour again on /profile/edit$' -n 1)" && test -n "$WIRE" && test -n "$CARD" && git revert --no-commit "$CARD" "$WIRE" && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "revert: unmount the first-run tour" -m "Production smoke test failed; the tour is unmounted while it is diagnosed. profiles.tour_seen_at stays (additive, unread)." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && git push origin HEAD:master
```

Expected: `git status` prints nothing (commit or stash nothing — if it prints anything, stop and look); `git merge --ff-only` brings the branch level with the pushed `master` (it refuses if they diverged: then stop and bring the owner in); the push is a fast-forward. Nothing here touches the owner's checkout.

- [ ] **Step 2: Confirm and report**
  - Wait for the revert's deployment to be Ready (Task 11 Step 4's check, with the revert's SHA).
  - Sign in on the live site as `$DEMO` (`node "$SCRATCH/mint-tour.mjs" https://blindrapp.vercel.app /overview "$DEMO"`, reload once): no tour sheet on `/overview`, and `/profile/edit` has no "Getting started" card.
  - Tell the owner which check failed. Re-landing means reverting this revert on the branch.

---

### Task 14: Flip `FRIEND_REQUESTS_LIVE` (later, in the friend-requests deploy)

**Files:**
- Modify: `src/lib/first-run/tour.ts` (the `FRIEND_REQUESTS_LIVE` line), `src/lib/first-run/tour.test.ts` (the "friend requests are not live in this release" test), `CLAUDE.md` (the First-run tour bullet's friend sentence).

**Interfaces:**
- Consumes: the friend-requests release, in the same deploy that makes requests live.
- Produces: the Community step reads "Find people, send a friend request, share your invite link. …".

- [ ] **Step 1: Flip the constant and its test**

In `src/lib/first-run/tour.ts` replace `export const FRIEND_REQUESTS_LIVE = false;` with `export const FRIEND_REQUESTS_LIVE = true;`. In `src/lib/first-run/tour.test.ts` replace

```ts
  it("friend requests are not live in this release", () => {
    // The main session flips this together with FRIEND_REQUESTS_LIVE in the
    // friend-requests deploy (first-run tour plan Task 14).
    expect(FRIEND_REQUESTS_LIVE).toBe(false);
  });
```

with

```ts
  it("friend requests are live", () => {
    // Flipped in the friend-requests deploy (first-run tour plan Task 14).
    expect(FRIEND_REQUESTS_LIVE).toBe(true);
  });
```

- [ ] **Step 2: CLAUDE.md**

In the First-run tour bullet replace

```
  for a bare profile (no avatar AND no location); the Community sentence says
  "add friends" until `FRIEND_REQUESTS_LIVE` is flipped to true in the
  friend-requests deploy (main session). DB suite:
```

with

```
  for a bare profile (no avatar AND no location); the Community sentence says
  "send a friend request" since the friend-requests deploy flipped
  `FRIEND_REQUESTS_LIVE` to true. DB suite:
```

- [ ] **Step 3: Test and commit with the friend-requests work**

Run: `npx vitest run src/lib/first-run/tour.test.ts` (from the friend-requests worktree, prefixed with its own `cd`) → PASS. Commit the three files with the friend-requests release, using the Global Constraints identity and the subject `feat(tour): the Community step names friend requests`.
