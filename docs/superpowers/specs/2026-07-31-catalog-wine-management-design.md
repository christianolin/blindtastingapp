# Catalog wine management — edit / delete / cellar stats

Date: 2026-07-31 · Status: Approved (design)

## Goal

Curators (role ADMIN or CONTRIBUTOR) can **edit** and **delete** catalog wines,
and everyone can see **how many people hold a wine in their cellar**. Edits
propagate to all cellars automatically — cellars reference the catalog wine by
id, they don't copy its data — which is the point: one edit fixes data for all.

## Current state (verified in migrations)

- `catalog_wines` RLS: read (all authed), insert (creator), **update (creator OR
  `is_curator`)** + audit trigger → `catalog_wine_edits`. **No delete policy.**
- `is_curator` = a `profiles` boolean mirrored from `role ∈ {ADMIN,
  CONTRIBUTOR}` by trigger; existing curator policies read it.
- **ON DELETE RESTRICT** into `catalog_wines`: `cellar_lots`, `wset_notes`,
  `wine_answers`, `cellar_consumptions`. **CASCADE**: `catalog_wine_grapes`,
  `catalog_wine_edits`.
- `cellar_lots` is **owner-only** RLS → counting other users' holdings needs a
  `SECURITY DEFINER` function.

## Decisions

1. **Edit = UI only.** The DB already allows curator update; reuse the wine form
   (shared create+edit) in an **edit popup** on the wine hub.
2. **Delete = guarded `SECURITY DEFINER delete_catalog_wine(id)`**: curator-gated,
   requires the wine to be truly unreferenced, else raises a clean error. No
   broad DELETE RLS policy.
3. **Stat** = distinct cellar holders + total bottles via `SECURITY DEFINER
   catalog_wine_usage(id)`; shown to everyone on the hub.

## Design

### DB — `supabase/migrations/20260829252000_catalog_manage.sql`

- `catalog_wine_usage(p_id uuid)` → `holders int, bottles int, lot_count int,
  note_count int, appearance_count int, consumption_count int` (SECURITY
  DEFINER, `set search_path = public`, grant authenticated). `holders` =
  distinct `cellar_lots.owner_id` with qty > 0; `bottles` = sum(qty); the
  `*_count`s gate deletion.
- `delete_catalog_wine(p_id uuid)` (SECURITY DEFINER): raise unless caller
  `is_curator`; raise if any of lot/note/appearance/consumption references
  exist; else delete (grapes + audit rows cascade). Grant authenticated.
- Final-state asserts (both functions present).

### App

- Server action `updateCatalogWine(id, input)` mirrors `createCatalogWine`
  (update the row + re-sync `catalog_wine_grapes`).
- Refactor `NewWineForm` → shared **`WineForm`**: optional `initialWine` + a
  submit handler; used by the Add popup (create) and the Edit popup.
- Wine hub (`catalog/[wineId]/page.tsx`): fetch caller `role` +
  `catalog_wine_usage`.
  - Public stat: **"In N cellars · M bottles"**.
  - Managers: **Edit** (opens edit popup) and **Delete** (enabled only when the
    wine is truly unreferenced; otherwise disabled with the reason). Delete →
    confirm → `delete_catalog_wine` → back to `/catalog`.

### Testing — `scripts/catalog-manage.test.mjs`

- `catalog_wine_usage` math (distinct holders, bottle sum).
- delete blocked when referenced (each ref type); delete OK when clean.
- non-curator denied delete; curator update allowed, member update of another's
  wine denied.

## Out of scope

- Catalog-**list** holdings badge (later). Merge tooling (already exists).
