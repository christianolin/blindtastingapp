# UI/UX Uplift & Backbone Additions — Design

**Status:** Approved design (2026-07-30). A multi-part program: a shared UI
component foundation, three backbone additions (grape blends, last-seen, global
search), then page-by-page visual uplift toward the owner's prototypes. Each
sub-project ships independently.

**Project:** Blindr — Next.js 16 + Supabase; `master` → Vercel.

## 1. Purpose & context

The owner produced hi-fi prototypes for Taste, Cellar, Catalog, the wine hub,
Community, Knowledge and the tasting create/play/results screens. **Key finding:
the prototypes already use the app's existing brand tokens** (`globals.css`:
bordeaux `#5c1a2b`, gold `#c3a25b`, parchment `#f5efe3`, Cormorant headings +
Manrope body). So this is a **component-level uplift, not a rebrand.**

The real gap is a **missing shared component kit**: pages hand-roll tabs (three
divergent implementations — Cellar, Community, Taste), stat bars, filter rows and
tables. The program builds the kit once, adds the few genuinely-new capabilities
the prototypes imply, then reskins pages against the kit.

## 2. Decomposition & build order

Independent sub-projects, each spec-slice → plan → build, in order:

- **A. Shared UI foundation** — primitives + app patterns. No behaviour/data
  change. Ships first; everything else consumes it.
- **B. Grape blends** — N grapes + optional percentages; derived top-two keep
  scoring untouched.
- **C. Last seen** — `profiles.last_seen_at` + throttled touch + Community display.
- **D. Global search** — Cmd/Ctrl-K command palette over wines/places/grapes/producers.
- **E. Page uplifts** — Cellar, Catalog, wine hub, Community, Taste hub,
  new-tasting, tasting play/results, Knowledge — each reskinned against A
  (+ B/C/D where relevant), shipped page-by-page.

Confirmed scope now: **A + B + C + D**; E follows page-by-page.

## 3. Sub-project A — Shared UI foundation

New primitives in `src/components/ui/` (shadcn-style, brand-tokened):
- `tabs` — underline variant (Cellar/Catalog-hub/Taste subsections) + segmented
  variant (People/Friends); URL-addressable via `?tab=`.
- `avatar` — image with initial-letter fallback + ring; size prop.
- `pagination` — numbered pages + prev/next.
- `progress` — horizontal bar (reveal %, drink readiness, spend).
- `tooltip` — the info-"i" affordances (stat definitions).
- `skeleton` — loading placeholders.
- `empty-state` — icon + title + copy + optional CTA (already repeated ~8×).

New patterns in `src/components/patterns/`:
- `page-header` — Cormorant H1 + subtitle + right-aligned actions slot.
- `stat-tile` + `stat-strip` — the icon/number/label tiles (Cellar, Catalog,
  wine hub) with optional tooltip.
- `filter-bar` — search input + dropdown filters + "Clear filters".
- `data-table` — thumbnail + two-line primary/secondary cell, sortable headers,
  row `…` menu, list/grid toggle, pagination footer.

This replaces the three tab implementations and the ad-hoc stat bars on `/cellar`
and `/catalog`. Pure consolidation — no new data, independently shippable.
Testing: `tsc` clean, existing suites green, visual parity.

## 4. Sub-project B — Grape blends

**Now:** `catalog_wines.primary_grape_id` (NOT NULL) + `secondary_grape_id`
(nullable). **Want:** N grapes with optional percentages; blind tasting uses the
top two.

**Source of truth — new `catalog_wine_grapes`:** `(id, catalog_wine_id fk on
delete cascade, grape_id fk, percentage numeric(5,2) null check
(percentage > 0 and percentage <= 100), sort_order int not null,
unique(catalog_wine_id, grape_id))`. Percentage is its own nullable column, so
both "87 / 8 / 5" and "Grenache, Syrah, Mourvèdre (no %)" work.

**Derived columns stay:** `catalog_wines.primary_grape_id` /
`secondary_grape_id` become **trigger-maintained** from `catalog_wine_grapes` —
top two by percentage when any percentage is set, else first two by `sort_order`
(nulls last). Exactly the owner's rule.

**Why derived, not dropped:** blind scoring, the frozen `wine_answers` snapshot,
`guesses`, `catalog_wine_guess_stats`, `search_catalog_wines` and
`import_cellar_lot` all read those two columns. Deriving them = **zero change to
scoring / blind play, past results untouched.** Grapes aren't part of the
identity index (producer + name + appellation + colour + vintage), so dedup is
unaffected.

**Migration:** create the table + a `recompute_catalog_wine_grapes()` trigger
(AFTER insert/update/delete on `catalog_wine_grapes`, per `catalog_wine_id`) that
rewrites the two columns; `primary_grape_id` must never go null (a wine keeps ≥1
grape row — the editor enforces it, and the trigger leaves the column unchanged
if a recompute would null it). Backfill: one/two rows per existing
`catalog_wines` from its current primary/secondary (sort_order 0/1, percentage
null). `find_or_create_catalog_wine` / `import_cellar_lot` keep setting the two
columns on insert **and** seed `catalog_wine_grapes` so new wines get blend rows.
DB tests: derive rule (percentage vs sort_order, nulls last), backfill parity,
`primary_grape_id` never null, snapshot immutability unaffected.

**UI:** a `GrapeBlendEditor` (add row → grape combobox + optional % + reorder +
remove) used by catalog add/edit and cellar add; blend display "87% Cabernet
Sauvignon, 8% Merlot, 5% Petit Verdot" (or a plain comma list when no %) on the
wine hub and catalog table. Validation: if any % is set, **warn** (don't block)
when the sum ≠ 100 — real labels are often incomplete.

**Import:** extend `import_cellar_lot` to accept an optional `grapes` array
(name + optional %); it still falls back to the single `Varietal` → one grape row.

## 5. Sub-project C — Last seen

`profiles.last_seen_at timestamptz null`. A **throttled** server touch (at most
once / 5 min per user, fire-and-forget so it never blocks a render) on
authenticated navigation — a small `touchLastSeen()` called from `AppHeader`
(which every authed page already renders), guarded by comparing `now - last_seen`
before writing. Community shows "Active today / N d ago" + a status dot (green
≤24h, else grey). RLS: `last_seen_at` is readable (profiles are already
public-read); only self can write it.

## 6. Sub-project D — Global search

`search_all(p_query text, p_limit int)` — a few unioned trigram/ILIKE queries
over `catalog_wines` (title), `wine_places` (name/canonical_key), `grapes`,
`producers`, returning `(kind, id, label, sublabel, href_key)` rows. A Cmd/Ctrl-K
**command palette** built on the existing `command.tsx` + `dialog.tsx` primitives,
mounted in `AppHeader` with a visible search box; keyboard-openable; results
grouped by kind, each linking to its page (`/catalog/[id]`,
`/knowledge/map?place=<key>`, `/knowledge/grapes?q=`, catalog filtered by
producer). Debounced (~200 ms), capped. People deferred (privacy). Trigram
indexes on the searched text columns. DB test: RPC returns expected groups and
respects the limit.

## 7. Sub-project E — Page uplifts

Reskin against A, page-by-page (each `tsc`-clean, visual parity, shipped alone):
Cellar (adopt the left section-nav; **Export** = CSV mirror of Import), Catalog
(`data-table` + `stat-strip`), wine hub (tabs Overview/Notes/Blind track
record/Community; "What people find" chips; guess-rate `progress` bars),
Community (avatar rows, mutual + last-seen, segmented People/Friends), Taste hub
(polish mode cards + Continue-tasting + tabbed lists), new-tasting (icon-labelled
field groups), tasting play/results (progress rail, wine chips, standings bars,
per-attribute reveal). New capability only where this spec names it.

## 8. Non-goals

Wine prose / Classification / First-vintage / Vineyard-area / Elevation / Soil
(owner: not needed); PDF export of results; wine galleries; "Most guessed as";
"Add to my places"; training room; a notifications backend (the header count
badge stays cosmetic until notifications exist); a dark-mode audit (tokens exist,
out of scope).

## 9. Testing

Per sub-project: DB suites (grape derive/backfill; search RPC) via `node --test`;
`tsc --noEmit`; existing suites (foundation, cellar ×4, wine-backbone, wset-notes)
stay green. UI = `tsc` + manual visual parity (no component test harness).

## 10. Risks

- **R1 (highest):** grape derived-column trigger correctness — scoring reads
  these columns. Mitigation: DB tests for the derive rule + backfill parity + a
  snapshot-immutability check; `primary_grape_id` never nulls.
- **R2:** global-search performance/relevance on the shared catalog — trigram
  indexes, cap + debounce, iterate.
- **R3:** page-uplift scope creep — strict "reskin against the kit, no new
  features" rule per page; new capability only where §7 names it.
