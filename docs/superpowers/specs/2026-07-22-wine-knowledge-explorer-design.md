# Wine Knowledge Explorer — design (Phase 3K, V1)

Date: 2026-07-22
Status: approved direction (owner brief 2026-07-22); plan follows this spec.
Predecessors: Phase 1 canonical catalog, Phase 3A classification axes, Phase 3C tile map.

## Objective

Turn the Wine Map into an interactive knowledge explorer: click any country /
region / appellation and understand it **in under a minute** without leaving
the map. Knowledge is **modular and reusable** — a grape, designation or
place exists once and is referenced everywhere. V1 stays concise and
scannable; the model must absorb future depth (regulations, yields, ageing,
producers, statistics) without structural change.

## Existing foundations (reused, not duplicated)

- `grapes` is already the single grape table every tasting/scoring FK points
  at, with profile columns (description, typical_aromas/acidity/tannin/body/
  alcohol, main_regions, color RED|WHITE) and the Grape Library page.
- `wine_place_articles` holds description / climate / key_facts (+ free-text
  grape_varieties & wine_styles that V1 supersedes with structured tables).
- Classification axes: `is_appellation`, `appellation_system`,
  `appellation_level`, `wine_place_relationships` (incl. `DUAL_LABEL`,
  `REPLACES_WITHIN`).
- `get_wine_place_context` RPC + tile map UI (details panel, tree).

## Schema (V1)

1. **`grapes` additions**: `skin_color text` (the actual skin colour —
   "blue-black", "grey-pink"; the RED/WHITE enum stays for filters/scoring).
2. **`wine_place_grapes`** (place ↔ grape, the modular join):
   `wine_place_id`, `grape_id`, `role` (`PRINCIPAL`|`ACCESSORY`),
   `permitted boolean not null default true`, `share_pct numeric null`
   (approximate planted share), `local_note text null`,
   unique (wine_place_id, grape_id). Editorial status via
   `editorial_status` (`DRAFT`|`PUBLISHED`) so drafted content is reviewable.
3. **`wine_place_styles`**: `wine_place_id`, `style`
   (`RED`|`WHITE`|`ROSE`|`SPARKLING`|`SWEET`|`FORTIFIED`), `note text null`,
   `sort_order`, unique (wine_place_id, style), editorial_status.
   (Also unlocks the map's golden-for-white-GC colouring.)
4. **`wine_designations`** catalogue: `key` (e.g. `burgundy-grand-cru`),
   `name`, `appellation_system`, `description` — one entry PER SYSTEM
   (Burgundy Grand Cru ≠ Alsace Grand Cru ≠ Saint-Émilion Grand Cru).
   **`wine_place_designations`**: place ↔ designation with `local_note`.
   Seed alongside: the flagged `DUAL_LABEL` relationship edges
   (Chambertin ↔ Clos de Bèze, Charmes ↔ Mazoyères, Barsac ↔ Sauternes).
5. **`wine_place_articles`**: add `soils text null`. Existing free-text
   `grape_varieties`/`wine_styles` are deprecated (kept until content
   migrates, then dropped in a later cleanup).

RLS mirrors Phase 1: authenticated read of PUBLISHED (+ places VERIFIED);
writes stay migration/tooling-only. All tables typed in database.types.ts
with compile-time contracts.

## Context RPC v2

Extend `get_wine_place_context` (same function, additive keys):
- `grapes`: joined rows — grape id/name/color/skin_color + local role,
  permitted, share_pct, local_note (PUBLISHED only for authenticated).
- `styles`: ordered styles with notes.
- `designations`: catalogue entry + local_note for the place's designations,
  including entries inherited from `appellation_level` + system.
- `related`: parent, children (already present), plus `nearby` — up to 5
  VERIFIED places whose current boundaries are within ~10 km
  (`ST_DWithin`), excluding ancestors/descendants, ordered by distance.
- `dual_labels`: places linked by DUAL_LABEL edges (renders "may also be
  sold as …").

## UI (V1)

- **Details panel sections** (scannable, in order): Overview (description,
  climate, soils, key facts) · Wine styles (badges + notes) · Grapes
  (chips: name + share% where known; PRINCIPAL before ACCESSORY) ·
  Designations (short explanations) · Related areas (parent/children/nearby
  as select links).
- **Grape modal**: clicking a grape chip opens a dialog (no navigation):
  global profile (from `grapes`, incl. skin colour) + local block (role,
  permitted, share, local note) + "browse in Grape Library" link.
- **Grape Library page**: adds skin colour display and a "mapped areas"
  line per grape (places linking it), each clickable into the map.
- Map colouring hook: white-only styles place ⇒ gold variant for its
  grand_cru fills (automatic once styles data exists).

## Content V1 (drafted, reviewable)

- Scope: the 73 mapped places + ~20 core grapes (Pinot Noir, Chardonnay,
  Aligoté, Gamay, Cabernet Sauvignon, Cabernet Franc, Merlot, Petit Verdot,
  Malbec, Carmenère, Sémillon, Sauvignon Blanc, Muscadelle, …).
- Authorship: assistant-drafted editorial content, seeded with
  `editorial_status = 'DRAFT'`, owner flips to PUBLISHED after review
  (bulk publish migration once approved). Honest provenance: editorial,
  not sourced-official; a `sources` note field can arrive later.
- Structured facts favored over prose; every claim short.

## Out of scope (future versions; schema must not block them)

Complete regulations, blend/yield/alcohol/ageing rules, classification
systems detail, history, vineyard statistics, producer directory,
distribution charts, per-area blind-tasting tips, source citations.
Each lands as additional tables or columns beside this core.

## Risks / notes

- share_pct is approximate editorial data — nullable, never invented.
- Designation inheritance must not double-render with per-place links.
- Free-tier DB: nearby computed per-request via GiST-indexed ST_DWithin on
  73–1000 rows — cheap; revisit with materialization only if profiling says.
