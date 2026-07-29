# Plan — P3: Catalog pillar + wine hub

Execution: **concise + inline**, TDD where there's a DB/logic surface.
Base: backbone P1+P2 shipped; latest migration `20260829208000`. Next: `209000`.

## Decisions from ground truth
- `wset_notes` + `wset_note_aromas` are **public-read** → the descriptor ("what people
  find") aggregate can be a **security-invoker view**.
- `guesses` read is RLS-scoped (own / revealed / host) → cross-tasting guess accuracy
  needs a **SECURITY DEFINER RPC** that returns **only aggregate counts**. It counts
  **revealed wines + scored guesses only** (an unrevealed tasting must not leak/spoil).
  "Correct" for a field = `<field>_points > 0`.
- Route: move `/cellar/*` → `/catalog/*`; nav "Cellar" → "Catalog"; **temporary**
  redirects (the personal Cellar pillar reclaims `/cellar` in P6).

## Tasks
1. **Aggregates migration `209000` + tests**
   - View `catalog_wine_descriptors` (security_invoker):
     `(catalog_wine_id, term_id, term, origin, mentions)` from
     `wset_note_aromas ⋈ wset_notes ⋈ wset_aroma_terms`, grouped per wine+term.
   - RPC `catalog_wine_guess_stats(p_catalog_wine_id uuid)` (security definer, stable):
     `appearances` (distinct revealed tastings), `guess_count`, and per-field
     `*_correct` counts over scored guesses on revealed appearances.
   - Idempotent + final-state asserts. Tests in `wine-backbone.test.mjs`:
     descriptor counts aggregate across notes; guess-stats correct per field and
     **excludes** unrevealed wines and unscored guesses.
2. **Types**: add the view Row + the RPC signature to `database.types.ts`.
3. **Route move**: `git mv src/app/cellar src/app/catalog`; rename
   `cellar-list.tsx` → `catalog-list.tsx` (`CellarList` → `CatalogList`); replace
   `/cellar` → `/catalog` strings and the "Cellar" heading/label; nav entry
   Cellar→Catalog; `next.config` temporary redirects `/cellar(/*)` → `/catalog(/*)`.
4. **Hub page** (`catalog/[wineId]/page.tsx`): add **"What people find"** (top
   descriptors as chips) and **"Blind-tasting track record"** (appearances + per-field
   guess %) sections; add query helpers to `src/lib/wset/queries.ts`.
5. **Verify**: `tsc --noEmit` + `wine-backbone.test.mjs` + `wset-notes.test.mjs`;
   clean tree; commit; push.

## Out of scope (later phases)
Community notes-with-authors list (P6), Taste/Community nav renames (P4/P6),
add-wine catalog picker + merge UI (P5), global search (P7).
