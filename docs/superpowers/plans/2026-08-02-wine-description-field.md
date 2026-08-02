# Wine Description Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editable free-text `description` to catalog wines — fillable by anyone when adding a wine, editable afterward by the creator and curators, and shown on the wine page.

**Architecture:** A new nullable `catalog_wines.description` column, governed by the *existing* "catalog update" RLS (creator OR `is_curator`) and the existing `catalog_wine_edits` audit trigger — no new policy. The field is threaded through the create/update/add-cellar-lot server actions and their forms, and rendered on the wine hub page.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), React 19, Supabase (Postgres + RLS), TypeScript, Tailwind v4.

## Global Constraints

- **This is NOT the Next.js you know** — before writing any Next-specific code, read the relevant guide in `node_modules/next/dist/docs/` (see `AGENTS.md`).
- `npx tsc --noEmit` must pass after each task. Clear a stale `.next` first: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue`.
- Migrations run with `node scripts/scratch-apply.mjs --file <path> --mode dry|live` from the **repo root** (Bash defaults to home — pass the repo as workdir) with `DB_PASSWORD` in env. Next free migration number: **`20260829258000`**.
- DB tests use the existing harness: `node --test scripts/<name>.test.mjs`. RLS denial surfaces as Postgres error code **`42501`**. Model new tests on `scripts/wset-notes.test.mjs` (`withRollback` + `set local role authenticated`).
- No TS/UI unit-test runner exists in this repo, so UI/action tasks are verified by `tsc --noEmit` + a manual check (the repo's real loop). Only DB behavior gets automated tests.
- Commit after each task. Pushing `master` auto-deploys to Vercel. (`git push` prints a `RemoteException` on stderr but still succeeds — check `EXIT=0` and the `->` ref line.)
- `cn` uses tailwind-merge (later classes win). PowerShell paths with `[wineId]` need a `:(literal)` git pathspec.

---

### Task 1: Migration — add `catalog_wines.description`

**Files:**
- Create: `supabase/migrations/20260829258000_catalog_wine_description.sql`

**Interfaces:**
- Produces: a nullable `text` column `catalog_wines.description`. No RLS/trigger changes (rides the existing "catalog update" policy + `catalog_wine_edits` audit).

- [ ] **Step 1: Write the migration**

```sql
-- Free-text description for catalog wines. Anyone can set it when they add a
-- wine (they are the creator); afterwards the creator and curators can edit it,
-- via the existing "catalog update" RLS + catalog_wine_edits audit trigger — so
-- this is a plain additive column, no policy change. Idempotent.
alter table catalog_wines add column if not exists description text;
```

- [ ] **Step 2: Dry-run the migration**

Run (from repo root, `DB_PASSWORD` in env):
```
node scripts/scratch-apply.mjs --file supabase/migrations/20260829258000_catalog_wine_description.sql --mode dry
```
Expected: `DRY-OK 20260829258000 catalog_wine_description`.

- [ ] **Step 3: Apply live**

Run:
```
node scripts/scratch-apply.mjs --file supabase/migrations/20260829258000_catalog_wine_description.sql --mode live
```
Expected: `LIVE-APPLIED 20260829258000 catalog_wine_description`.

- [ ] **Step 4: Verify the column exists (smoke test)**

Because the column is additive and governed by already-tested RLS, verification is a column-existence check rather than a new RLS test. Add `scripts/catalog-wine-description.test.mjs`, modeled on `scripts/wset-notes.test.mjs` for its connection/`withRollback` helpers:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { withRollback } from "./_db.mjs"; // same helper wset-notes.test.mjs uses

test("catalog_wines.description column exists and round-trips", async () => {
  await withRollback(async (client) => {
    const col = await client.query(
      `select data_type from information_schema.columns
        where table_name = 'catalog_wines' and column_name = 'description'`,
    );
    assert.equal(col.rows[0]?.data_type, "text");
  });
});
```
> If `wset-notes.test.mjs` imports its helper under a different name/path, match that import exactly.

- [ ] **Step 5: Run the test**

Run:
```
node --test scripts/catalog-wine-description.test.mjs
```
Expected: `pass 1`.

- [ ] **Step 6: Commit**

```
git add supabase/migrations/20260829258000_catalog_wine_description.sql scripts/catalog-wine-description.test.mjs
git commit -m "Catalog: add wine description column (additive, existing RLS)"
```

---

### Task 2: Catalog server actions accept & persist `description`

**Files:**
- Modify: `src/app/catalog/new/actions.ts`

**Interfaces:**
- Produces: `NewCatalogWine.description?: string | null` (optional, so existing callers keep compiling); `createCatalogWine` and `updateCatalogWine` write `catalog_wines.description`.

- [ ] **Step 1: Add `description` to the `NewCatalogWine` type**

In `src/app/catalog/new/actions.ts`, inside the `NewCatalogWine` type, immediately after the `wineName: string | null;` line, add:

```ts
  description?: string | null;
```

(Optional on purpose — the form supplies it in Task 3; keeping it optional means `tsc` stays green after this task alone.)

- [ ] **Step 2: Persist on create**

In `createCatalogWine`, in the `.from("catalog_wines").insert({ ... })` object, after `wine_name: input.wineName,` add:

```ts
      description: input.description ?? null,
```

- [ ] **Step 3: Persist on update**

In `updateCatalogWine`, in the `.from("catalog_wines").update({ ... })` object, after `wine_name: input.wineName,` add:

```ts
      description: input.description ?? null,
```

- [ ] **Step 4: Type-check**

Run:
```
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit
```
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```
git add src/app/catalog/new/actions.ts
git commit -m "Catalog actions: persist wine description on create/update"
```

---

### Task 3: Catalog Add/Edit form — Description field

`NewWineForm` is dual-mode (create + edit via `initialWine`), and the curator Edit modal renders it, so this one task covers add **and** edit for the catalog.

**Files:**
- Modify: `src/app/catalog/new/new-wine-form.tsx`
- Modify: `src/app/catalog/[wineId]/edit-wine-modal.tsx`

**Interfaces:**
- Consumes: `NewCatalogWine.description` (Task 2).
- Produces: `WineFormInitial.description: string | null`; the form's payload now carries `description`.

- [ ] **Step 1: Add `description` to `WineFormInitial`**

In `new-wine-form.tsx`, in the `WineFormInitial` type, after `wineName: string;` add:

```ts
  description: string | null;
```

- [ ] **Step 2: Add form state**

Near the other identity `useState`s (just after the `wineName` state), add:

```ts
  const [description, setDescription] = useState(initialWine?.description ?? "");
```

- [ ] **Step 3: Add the textarea to the Identity fieldset**

In the Identity `<fieldset>`, immediately after the "Wine name (optional)" field block, add:

```tsx
          <div className="flex flex-col gap-2">
            <Label htmlFor="wine_description">Description (optional)</Label>
            <textarea
              id="wine_description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Background on the wine — style, vineyard, story…"
              className="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
```

- [ ] **Step 4: Include `description` in the submit payload**

In `submit()`, in the `payload` object (after `wineName: wineName.trim() || null,`), add:

```ts
        description: description.trim() || null,
```

- [ ] **Step 5: Load `description` in the Edit modal**

In `src/app/catalog/[wineId]/edit-wine-modal.tsx`: add `description` to the `catalog_wines` select used to build the wine, and set it on the `initialWine` object passed to `<NewWineForm>`:

```ts
      description: wine.description ?? null,
```

(Match the existing field-mapping style in that file. If the fetch uses `select("*")`, no select change is needed — only the `initialWine` mapping.)

- [ ] **Step 6: Type-check**

Run:
```
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit
```
Expected: exit 0.

- [ ] **Step 7: Manual check**

`git push` (deploys). On the deploy: Catalog → Add a wine → confirm the Description textarea appears and saves; open a wine → Edit (as creator/curator) → confirm the existing description loads and edits save.

- [ ] **Step 8: Commit**

```
git add src/app/catalog/new/new-wine-form.tsx "src/app/catalog/[wineId]/edit-wine-modal.tsx"
git commit -m "Catalog form: Description field (add + curator edit)"
```
