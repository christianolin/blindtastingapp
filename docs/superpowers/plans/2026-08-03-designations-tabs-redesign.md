# Designations → Single Tabbed Page + Interactive Burgundy Pyramid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Replace the multi-route Designations section with ONE `/knowledge/designations` page whose classification/glossary sub-pages are **client-side tabs** that switch instantly (no navigation), including an **interactive Burgundy quality pyramid** (click a tier → expand all its vineyards grouped by sub-region → village), and make all of it searchable both in-page and from the global top-bar search.

**Architecture:** The server component loads every tab's data once and hands it to a client `DesignationsTabs` component that renders the active tab from props (instant switch, `?tab=` kept in sync via `history.replaceState`, wrapping tab bar). Tab membership is a static, editable config. Burgundy uses a new `getBurgundyHierarchy` query over `wine_places`. Global search is extended via a SQL migration.

**Tech Stack:** Next.js 16 (RSC + one client tab shell), React 19, TypeScript, Supabase Postgres (typed), Tailwind.

## Global Constraints

- **Instant tabs:** switching a tab must NOT trigger a server navigation or refetch. All tab data is loaded once server-side and rendered client-side; only `?tab=` in the URL updates (shallow, `history.replaceState`).
- **Verify:** `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit` (no output, exit 0) + manual QA. Commit per task. No UI test runner — do not add one.
- **Auth guard, page shell, Tabs primitive** conventions as in the prior plan (`docs/superpowers/plans/2026-08-03-designations-library-restructure.md` Global Constraints). Query helpers: `supabase: SupabaseClient<Database>`.
- **DB migration** (global search only): applied via `node scripts/scratch-apply.mjs --file <p> --mode dry|live` with `$env:DB_PASSWORD`; next version `20260829260000+`; same-transaction guards; dry-run before live.
- **`git push`** prints "RemoteException" on stderr but succeeds (check the ref line).

## Tab taxonomy (config — `src/lib/designations/tabs.ts`)

Each tab = `{ slug, label, kind, systemKeys?, glossaryTerms? }`. `kind` ∈ `overview | burgundy | systems | glossary | champagne`. Editable; order = display order.

| slug | label | kind | content |
|---|---|---|---|
| overview | Overview | overview | editorial (why/variation) |
| burgundy | Burgundy | burgundy | interactive pyramid (getBurgundyHierarchy) |
| bordeaux | Bordeaux | systems | systems: medoc-1855, sauternes-1855, saint-emilion-grand-cru-classe, graves-cru-classe, cru-bourgeois-medoc; glossary: Grand Cru Classé, Premier Grand Cru Classé, Cru Bourgeois, Cru Artisan, Cru Exceptionnel |
| alsace | Alsace | systems | systems: alsace-grand-cru; glossary: Vendange Tardive, Sélection de Grains Nobles |
| champagne | Champagne | champagne | Échelle des Crus from wine_places (france.champagne GC + 1er villages) |
| germany | Germany | glossary | Kabinett, Spätlese, Auslese, Beerenauslese (BA), Trockenbeerenauslese (TBA), Eiswein, Grosses Gewächs (GG), Erste Lage, 1. Lage, Gutswein, Ortswein, Trocken, Halbtrocken, Feinherb |
| austria | Austria | glossary | Smaragd, Federspiel, Steinfeder |
| ageing | Ageing | glossary | Crianza, Reserva, Gran Reserva, Riserva, Superiore, Novello, Late Bottled Vintage (LBV), Vintage Port, Colheita |
| fortified | Fortified | glossary | Fino, Manzanilla, Amontillado, Oloroso, Palo Cortado, Pedro Ximénez, Ruby, Tawny |
| sparkling | Sparkling dosage | glossary | Brut Nature, Extra Brut, Brut, Extra Dry, Sec, Demi-Sec, Doux |

(Generic "Grand Cru"/"Premier Cru" glossary terms are covered by the Burgundy pyramid and omitted from a tab.)

## File Structure

**Create:**
- `src/lib/designations/tabs.ts` — the tab config above + a `glossaryTermTab(name)` reverse lookup.
- `src/lib/designations/burgundy.ts` — `getBurgundyHierarchy(supabase)` → tiers with vineyards grouped by sub-region → village.
- `src/app/knowledge/designations/designations-tabs.tsx` — client tab shell (instant switch, wrapping bar, `?tab=` sync, in-page search).
- `src/app/knowledge/designations/burgundy-pyramid.tsx` — client interactive pyramid (click tier → expand grouped vineyards).
- `src/app/knowledge/designations/tab-panels.tsx` — presentational renderers per tab kind (systems tiered list, glossary term list, champagne, overview).
- `supabase/migrations/20260829260000_global_search_designations.sql` — extend global search.

**Modify:**
- `src/app/knowledge/designations/page.tsx` — becomes the data loader + `<DesignationsTabs>`.
- `src/lib/designations/queries.ts` — add `getAllSystemsForTabs`, `getGlossaryAll`; keep `getDesignationSystem`/`groupBySubregion`.
- `src/lib/designations/content.ts` — pyramid tiers gain no ageing; keep.
- global search results component/types — surface designation hits (link to `?tab=`).

**Delete (replaced by tabs, with redirects):**
- `src/app/knowledge/designations/[key]/*` and `src/app/knowledge/designations/glossary/[category]/*` → thin redirect pages to `/knowledge/designations?tab=<slug>`.

**Task order:** T1 tabs config → T2 burgundy query → T3 systems/glossary queries → T4 tab-panels → T5 burgundy-pyramid → T6 designations-tabs shell + page → T7 in-page search → T8 redirects + delete old routes + apex/hero fixes → T9 global-search migration + UI → T10 ship + QA.

---
