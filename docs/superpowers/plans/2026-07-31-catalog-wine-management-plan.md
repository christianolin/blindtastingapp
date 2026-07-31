# Plan — Catalog wine management (edit / delete / cellar stats)

Spec: `docs/superpowers/specs/2026-07-31-catalog-wine-management-design.md`
Date: 2026-07-31

Increments are committed + pushed individually; each is `tsc --noEmit` clean
(clear stale `.next` first). DB changes: dry-run then live via
`node scripts/scratch-apply.mjs --file <path> --mode dry|live`.

## 1. Migration `20260829252000_catalog_manage.sql`

- `catalog_wine_usage(p_id uuid) returns table(holders int, bottles int,
  lot_count int, note_count int, appearance_count int, consumption_count int)` —
  SECURITY DEFINER, `set search_path = public`, grant execute to authenticated.
- `delete_catalog_wine(p_id uuid) returns void` — SECURITY DEFINER; guard
  `is_curator`, guard zero references (lots/notes/appearances/consumptions),
  else `delete from catalog_wines where id = p_id`. Grant authenticated.
- Final-state asserts (both `pg_proc` present).
- Verify: `--mode dry` clean, then `--mode live`. Confirm next number is
  actually free first (`ls supabase/migrations | sort | tail`).

## 2. Tests `scripts/catalog-manage.test.mjs`

Model on `scripts/wset-notes.test.mjs` (withRollback + `set local role
authenticated` + jwt claims). Cases: usage math; delete blocked per ref type;
delete OK when clean; non-curator denied; curator update ok / member update of
another's wine denied (`42501`). Run `node --test scripts/catalog-manage.test.mjs`.

## 3. Server action `updateCatalogWine(id, input)`

In `src/app/catalog/new/actions.ts` (next to `createCatalogWine`). Update the
`catalog_wines` row from the same `NewCatalogWine` shape, then delete + re-insert
`catalog_wine_grapes` (mirrors create's blend sync). Returns `{ id }`.

## 4. Shared `WineForm` (create + edit)

Refactor `src/app/catalog/new/new-wine-form.tsx`:
- Accept optional `initialWine` (all fields incl. blend + names for the
  comboboxes) and a `mode`/submit strategy; keep `onCreated`/add an `onSaved`.
- Create path unchanged (Add popup). Edit path pre-fills + calls
  `updateCatalogWine`.
- `CatalogAddWineModal` keeps working (create).

## 5. Wine hub UI (`catalog/[wineId]/page.tsx`)

- Fetch caller `profiles.role` + `catalog_wine_usage(wineId)`.
- Public stat card line: **"In N cellars · M bottles"**.
- Manager controls (role ∈ {ADMIN,CONTRIBUTOR}):
  - `EditWineButton` → edit popup (loads ref data + current values → WineForm).
  - `DeleteWineButton` (client): enabled only when lot/note/appearance/
    consumption counts all 0; confirm Dialog → `supabase.rpc('delete_catalog_wine')`
    → `router.push('/catalog')`. Disabled state shows the blocking reason.

## 6. Verify + ship

`tsc --noEmit` clean; commit + push per increment for owner screenshots.
