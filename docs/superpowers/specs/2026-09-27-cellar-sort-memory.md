# Cellar sort: newest added by default, remembered per person — design

- **Date:** 2026-09-27. Branch `cellar-sort` (worktree `blindtastingapp-friends`), base production master `a23cd16`.
- **Owner, verbatim:** "cellars should default sort by newest added, but its saved on each profile what has been sorted by last".
- **Owner's standing instruction:** design, build and deploy without a further stop ("just write the design and then implement", "you dont have to ask before pushing, get it all done").

## 1. What exists today (read from the code)

- The cellar list (`src/app/cellar/cellar-bottles.tsx`, `CellarBottles`) keeps its sort in React state: `useState<SortKey>("bottles")`. It resets to "Most bottles" on every visit, on every device.
- `SortKey` (`src/lib/cellar/types.ts`) is `"bottles" | "name" | "added" | "yours" | "community"`. `SORT_ORDER` / `SORT_LABELS` / `sortRows` live in `src/lib/cellar/cellar-rows.ts`. `"added"` already sorts newest first by `lot.createdAt`, with **no tie-break**.
- `CellarBottles` renders on the owner's `/cellar` (`src/app/cellar/page.tsx`) and read-only on someone else's `/u/[id]/cellar` (`src/app/u/[id]/cellar/page.tsx`, `readOnly`). The read-only toolbar leaves out "Your score" (`cellar-toolbar.tsx`: `sortOrder` filters `"yours"`, and `sortValue` shows `"bottles"` when the state is `"yours"`), but the rows are still sorted by the state (`sortRows(filtered, sort)`), so the select and the order can disagree.

## 2. Decisions

- **C1 Default = newest added.** When a person has never chosen a sort (or their saved value is unreadable), every cellar list opens sorted by `"added"`. Its label becomes **"Newest added"** (was "Added"; the owner's words). The other labels are unchanged.
- **C2 A deterministic "added" order.** `"added"` sorts by `lot.createdAt` descending, then by `bottleTitle` ascending, then by `lot.id` ascending. Lots written in one transaction (a CSV import) share `created_at`, so without the tie-break their order is arbitrary and can shuffle between renders.
- **C3 Saved per person, server-side, owner-only.** A new table:
  ```sql
  create table public.user_preferences (
    user_id     uuid primary key references public.profiles(id) on delete cascade,
    cellar_sort text check (cellar_sort in ('bottles','name','added','yours','community'))
  );
  ```
  - RLS on (not forced). Policies for `authenticated` only: SELECT, INSERT and UPDATE where `user_id = auth.uid()` (INSERT/UPDATE also `with check (user_id = auth.uid())`). No DELETE policy.
  - Grants: revoke all from PUBLIC, anon, authenticated; grant `select`, `insert (user_id, cellar_sort)`, `update (cellar_sort)` to `authenticated`. anon gets nothing.
  - Why not a `profiles` column: every member can read `profiles` ("profiles read" is `true`), a sort preference has no reason to be public, and the `profiles` client UPDATE grant is pinned exactly by the two migrations queued behind this one (sharing defaults, levels). A separate table touches neither.
  - The table is named for preferences in general, but this change adds only `cellar_sort` (YAGNI: no view, group or filter memory; the owner asked for the sort).
- **C4 Account deletion.** An AFTER UPDATE OF `deleted_at` trigger on `profiles`, `profiles_deleted_drop_preferences` (`WHEN (old.deleted_at is null and new.deleted_at is not null)`), deletes that person's row — the `profiles_deleted_drop_favourites` precedent. Its function is SECURITY DEFINER, `search_path = public`, EXECUTE revoked from PUBLIC, anon, authenticated and service_role. `scrub_deleted_account` is not recreated.
- **C5 Which sort a list opens with.** The server page reads the VIEWER's own row (`user_preferences`, `.maybeSingle()`, any error → no saved value) and passes it to `CellarBottles` as the initial sort. A pure resolver decides:
  - `resolveCellarSort(saved: unknown, readOnly: boolean): SortKey` — a valid `SortKey` is kept, anything else becomes `"added"`; in a read-only list `"yours"` becomes `"added"` (that option is not offered there).
  - The toolbar's select value and the rows' order both use the same effective sort (fixing today's "yours" mismatch in read-only lists: the select must never show one sort while the rows follow another).
  - The initial value comes from the server render, so there is no flash and no hydration mismatch (no localStorage, no URL parameter).
- **C6 Saving.** Every change of the Sort select, on any cellar list (own or read-only), saves the viewer's choice: a `"use server"` action `saveCellarSort(sort: SortKey): Promise<{ ok: true } | { error: string }>` in a new file (exports only async functions; shared types in a plain module), which validates the key and upserts the viewer's own row (`onConflict: "user_id"`). It does not revalidate or refresh — the list already shows the new order. A failed save keeps the on-screen choice and logs one `console.error` line (no error UI: a lost preference is not worth interrupting the person).
- **C7 Scope.** Only the sort. The list/grid view, grouping, filters, search and page stay as they are (per visit).

## 3. Tests

- **Vitest (pure, relative imports):** `resolveCellarSort` (every key, garbage, null, `"yours"` in read-only → `"added"`, `"yours"` on own → kept); `sortRows(…, "added")` tie-break (equal `createdAt` → title, then id) and newest first; `SORT_LABELS.added === "Newest added"`; `SORT_ORDER` unchanged in order and content.
- **DB suite `scripts/user-preferences.test.mjs`** (the `scripts/tour-seen.test.mjs` / `training-room.test.mjs` harness: production, each test in a transaction that always rolls back, throwaway profiles, `USER_PREFERENCES_APPLY=<migration>` applies the file inside each test for the dry run):
  1. As a user: insert own row, update it, read it back; cannot read, insert or update another user's row (0 rows / RLS error); no DELETE.
  2. The check constraint refuses an unknown key.
  3. anon: no privilege at all; `authenticated` holds exactly SELECT, INSERT(user_id, cellar_sort), UPDATE(cellar_sort).
  4. Soft-deleting a profile (`deleted_at` set) removes its row; the trigger function's EXECUTE holders are the owner only.
  5. RLS enabled and not forced; exactly the three policies.
- **Browser (main session, local production build, then prod smoke):** a demo account with no row opens `/cellar` on "Newest added"; change to "Name" → reload → still "Name"; a second tab/session shows "Name"; someone else's cellar opens on the viewer's saved sort; with "Your score" saved, someone else's cellar shows and sorts "Newest added"; phone 375 px toolbar unchanged.

## 4. Rollout

1. Migration `supabase/migrations/20260927110000_user_preferences.sql` — additive (a new table, policies, grants, one trigger on `profiles`), with same-transaction pre/post asserts in the style of `20260925120000_training_room.sql`. Dry run with the pg applier, DB suite with `USER_PREFERENCES_APPLY`, apply, suite again.
2. App deploy (the deployed app never reads the table; the new app tolerates a missing row and a failed read).
3. Rollback: revert the app; the table stays harmlessly.
4. CLAUDE.md: one bullet (the table is owner-only, why not `profiles`, the default, the resolver).
