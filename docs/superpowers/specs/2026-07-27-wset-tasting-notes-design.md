# WSET Tasting Notes ("Cellar") — Design, iteration 1

Date: 2026-07-27 · Status: approved for implementation · **Expected to be
revisited after real use** (see "Revisit after trying it").

## Context & goals

Blindr broadens from blind-tasting-only to wine tasting & review using the
WSET Level 3 Systematic Approach to Tasting (SAT), with the WSET quality
category replaced by a weighted 100-point (Parker-style) score. Two end
goals drive the design:

1. **A trustworthy ratings database** — every score is backed by a full
   structured SAT note, unlike single-tap platforms.
2. **(Future, out of scope here)** a *blind-tasting training room*: the app
   reads a filled SAT form and suggests grapes/regions. Iteration 1 only has
   to make that possible: every input is a predetermined, enumerated value,
   and the aroma vocabulary is a first-class joinable table. The knowledge
   map will later surface "standard wine" archetype SAT profiles per
   appellation feeding those suggestions.

The visual/interaction source of truth is the owner-approved Claude Design
prototype handoff (`WSET Tasting Sheet` README): four sections
(Appearance / Nose / Palate / Conclusions), snapping sliders, aroma pill
picker, weighted 100-point slider, live composed tasting note. It is
re-implemented natively in the app's stack — no prototype code is ported.
The prototype's flight/session rail is **not** in scope (demo scaffolding).

## Scope

- In: shared wine catalog, the SAT note form + persistence, per-wine average
  score at lookup, `/cellar` pages, schema hook for linking catalog wines to
  blind-tasting wines.
- Out: the training room (B), blind-link UI, sessions/flights, bottle sizes
  beyond a 750 ml default, descriptor roll-ups ("what people find"),
  non-authenticated access.

## Data model

New tables (4) plus one FK on an existing table. All follow the app's
established conventions: uuid PKs, RLS on, insert-only reference data,
enum-typed vocabulary, idempotent migrations with final-state asserts.

### `catalog_wines` — the shared wine entity

One row per real-world wine; global, user-contributed, insert-only (no
update/delete — edits would silently break links and aggregation, same
rationale as the existing reference tables). Any authenticated user may add.

- Blind-compatible identity (reuses the existing reference tables, mirroring
  `wine_answers`): `country_id`, `region_id`, `appellation_id`,
  `primary_grape_id`, `secondary_grape_id?`, `producer_id`,
  `type_designation_id?`, `vintage_kind` (`YEAR|NV|TAWNY`), `vintage_year?`,
  `vintage_tawny_years?` + the same vintage-shape check constraint.
- WSET-intrinsic: `colour wine_colour`, `style wine_style`, `cuvee text?`
  (WSET-only — never part of blind matching, since cuvée cannot be guessed
  blind), `bottle_size_ml int not null default 750` (sizes are future work).
- Provenance: `created_by -> profiles`, `created_at`.

### `wset_notes` — one tasting event

`catalog_wine_id`, `author_id -> profiles`, `tasted_on date`, scale enums
(all nullable — partial notes save) incl. `colour_hue`, `observations
wset_observation[]`, `faults wset_fault[]`, `quality_score smallint? check
50..100`, `price_category?`, `readiness?`, `taster_notes text`,
`created_at`, `updated_at`. **No
unique constraint** on (wine, author): re-tastings are history, kept
forever; averages are computed at lookup.

### `wset_aroma_terms` — the seeded SAT lexicon

`family wset_aroma_family` (FRUIT, FLORAL, SPICE, VEGETAL_OAK, OTHER),
`group_name text` (Citrus, Green fruit, … Ripeness), `term text unique`,
`sort_order`. Seeded in-migration from the handoff lexicon — exactly 90
terms (28 fruit, 5 floral, 9 spice, 24 vegetal & oak, 24 other).
Insert-only. This table is the future join point for term → grape/region
mappings (training room, map archetypes).

### `wset_note_aromas` — note ↔ term join

PK `(note_id, term_id)`, plus `sensed_on_nose bool`, `sensed_on_palate
bool` (at least one true, check-constrained). "Copy from nose" is a UI
convenience that sets the palate flag on existing rows.

### Blind-tasting link

`wines.catalog_wine_id uuid null references catalog_wines(id)` — the
existing per-tasting wine can point at a catalog wine (set at/after reveal).
Schema only in iteration 1; the linking UI comes later. Optional forever:
a blind answer (no cuvée) may legitimately match several catalog wines.

### Enums (exact WSET Level 3 labels — canonical wording, not the prototype's)

- `wine_colour`: WHITE, ROSE, RED · `wine_style`: STILL, SPARKLING, FORTIFIED
- `wset_clarity`: CLEAR, HAZY (WSET-canonical; prototype said "dull")
- `wset_condition`: CLEAN, UNCLEAN
- `wset_appearance_intensity`: PALE, MEDIUM_MINUS, MEDIUM, MEDIUM_PLUS, DEEP
- `wset_intensity` (nose + flavour): LIGHT, MEDIUM_MINUS, MEDIUM,
  MEDIUM_PLUS, PRONOUNCED
- `wset_development`: YOUTHFUL, DEVELOPING, FULLY_DEVELOPED, TIRED_PAST_BEST
- `wset_sweetness`: DRY, OFF_DRY, MEDIUM_DRY, MEDIUM, MEDIUM_SWEET, SWEET,
  LUSCIOUS
- `wset_level` (acidity, tannin, alcohol): LOW, MEDIUM_MINUS, MEDIUM,
  MEDIUM_PLUS, HIGH — fortified alcohol is UI-restricted to LOW/MEDIUM/HIGH
- `wset_body`: LIGHT, MEDIUM_MINUS, MEDIUM, MEDIUM_PLUS, FULL
- `wset_finish`: SHORT, MEDIUM_MINUS, MEDIUM, MEDIUM_PLUS, LONG
- `wset_mousse`: DELICATE, CREAMY, AGGRESSIVE
- `wset_colour_hue`: LEMON_GREEN, LEMON, GOLD, AMBER, BROWN (white) ·
  PINK, SALMON, ORANGE (rosé) · PURPLE, RUBY, GARNET, TAWNY (red; BROWN is
  shared) — observed per note (`wset_notes.colour_hue`); a trigger
  validates the hue belongs to the wine's `colour` (cross-table, so it
  cannot be a plain check constraint)
- `wset_observation`: LEGS_TEARS, DEPOSIT, PETILLANCE, RIM_VARIATION,
  TINTS_HIGHLIGHTS · `wset_fault`: OXIDISED, OUT_OF_CONDITION, CORK_TAINT,
  OTHER
- `wset_price_category`: INEXPENSIVE, MID_PRICED, HIGH_PRICED, PREMIUM
- `wset_readiness`: NEEDS_TIME, READY_CAN_IMPROVE, READY_WONT_IMPROVE,
  TOO_OLD
- `wset_aroma_family`: FRUIT, FLORAL, SPICE, VEGETAL_OAK, OTHER

### RLS

- `catalog_wines`, `wset_aroma_terms`: select + insert to authenticated;
  no update/delete (the app's reference-table pattern).
- `wset_notes`: select to all authenticated (public ratings model);
  insert/update/delete only where `author_id = auth.uid()`.
- `wset_note_aromas`: all writes gated on owning the parent note; reads
  follow the note's readability.

### Aggregation

`catalog_wine_ratings` view: per wine, `avg(quality_score)` and note count
over all notes with a score (nulls excluded). All historical notes count —
simple average in iteration 1. The view is the single lookup point so a
future change (latest-per-user, weighting, descriptor roll-ups) happens in
one place.

## Routes & navigation

App Router, server components with client islands, existing auth guard.

- `/cellar` — catalog list: search/browse wines with avg score + note
  count; "Add a wine". Nav gains a "Cellar" entry.
- `/cellar/new` — add-a-wine form; every reference field uses the existing
  `ReferenceCombobox` incl. its inline "add new option" flow. Best-effort
  dedup: same producer + cuvée + vintage + colour ⇒ surface the existing
  wine as a suggestion (warning, never a hard block). On save → wine page.
- `/cellar/[wineId]` — identity header, aggregate rating, the viewer's
  notes (history of re-tastings), "New tasting note" action, space reserved
  for the future "what people find" summary.
- `/cellar/[wineId]/notes/new`, `/cellar/[wineId]/notes/[noteId]` — the
  SAT sheet (create/edit own note; other users' notes are read-only data
  in iteration 1, surfaced only via the aggregate).

## Components (native rebuild of the handoff, high fidelity)

- `SnapSlider` — snapping graded slider: ghost unset state, stop dots,
  two-row staggered labels, pointer-capture drag, click-to-set.
- `WineColourControl` — White/Rosé/Red segmented control + gradient hue
  slider (hue stops per colour) → `colour` + `colour_hue`.
- `PillGroup` — single/multi pills (clarity, condition, observations,
  faults, mousse, price, readiness; unclean ⇒ fault pills reveal).
- `AromaPicker` — family tabs with count badges, captioned groups,
  multi-select pills, selected-summary strip with per-chip remove + clear;
  palate instance adds "Copy from nose" (union). Backed by
  `wset_aroma_terms`; independent nose/palate tab state.
- `QualitySlider` — weighted 100-point slider; band labels
  (96–100 Extraordinary … 50–59 Unacceptable); the non-linear position
  mapping (50→0%, 80→20%, 85→40%, 90→70%, 95→90%, 100→100%, piecewise
  linear both directions) lives in a pure `quality-curve` module.
- `LiveTastingNote` — italic per-section prose composed from state
  (client-derived; not persisted in iteration 1).
- `SectionNav` — sticky rail: 4 sections, done/total counts, scroll-spy,
  smooth scroll via `window.scrollTo` offsets (not `scrollIntoView`).
- `WsetSheet` — orchestrator: owns note state, renders the four section
  cards + rail + save.

Wine-type conditioning comes from the `catalog_wines` row: SPARKLING ⇒
mousse required and counted; FORTIFIED ⇒ 3-stop alcohol scale; `colour` ⇒
hue stops. Styling maps the handoff's tokens onto the app's existing
Tailwind/shadcn theme (burgundy/gold/cream, Playfair + Instrument Sans)
rather than hardcoding hex values.

## Data flow

- **Save**: one `save_wset_note` RPC, **security invoker** (RLS applies),
  upserting the `wset_notes` row and replacing its `wset_note_aromas`
  atomically. Explicit "Save note" button with the "Saved ✓" flash — no
  autosave in iteration 1. After save the page refreshes so the wine's
  average reflects the note.
- **Load**: the note editor is a server component fetching the note +
  aromas + the wine + the full `wset_aroma_terms` seed, passed to the
  `WsetSheet` client island. `/cellar` and `/cellar/[wineId]` read
  `catalog_wine_ratings`.
- **Add-a-wine**: plain insert (plus any inline reference-row additions via
  the combobox flow), then redirect to the wine page.

## Validation

- **DB-enforced** (cannot be bypassed): enum types reject off-vocabulary
  values; `quality_score` between 50 and 100; the vintage-shape check;
  `colour_hue` must belong to the wine's `colour` (trigger); note-aroma
  rows require nose or palate sensed; RLS ownership.
- **App-enforced**: progress "N of M rated" per the handoff — Appearance 3
  (clarity, intensity, colour), Nose 4 (condition, intensity, development,
  ≥1 aroma), Palate 8 (+ mousse ⇒ 9 for sparkling), Conclusions 3 (score,
  price, readiness); observations, faults and free text never count.
  Partial notes always save.

## Error handling

- Save failure: keep local state, show a retryable error; nothing is lost.
- Foreign note/wine ids: 404 via the standard not-found flow.
- Concurrent edits of the same note (two tabs): last write wins.
- RLS denials surface as save errors, never silent drops.

## Testing

Node test scripts against the pooled DB (the map suites' pattern), plus
pure-function tests with no DB:

- `scripts/wset-notes.test.mjs` — schema + RLS: insert-only catalog;
  public-read/owner-write notes; ownership-gated aroma rows; every check
  constraint rejects a bad row; `save_wset_note` atomicity + owner gating.
- Aroma seed — pinned term count (90), family/group structure, uniqueness.
- Aggregation — `catalog_wine_ratings` avg/count across multiple users and
  re-tastings; null scores excluded.
- `quality-curve.test.mjs` — breakpoint round-trips (50→0%, 80→20%,
  85→40%, 90→70%, 95→90%, 100→100%), integer rounding, monotonicity.
- `live-note.test.mjs` — prose composition per section.

## Delivery

Timestamped migrations continuing the current block, idempotent with
final-state asserts, applied dry-then-live via the local applier; the aroma
lexicon seeds in-migration; `npx tsc --noEmit` green; per `AGENTS.md`, read
`node_modules/next/dist/docs` before writing Next.js code. Implementation is
phased so a usable slice ships early (schema + seed + add-a-wine + core
sheet + save) before polish (live note, curve feel, conditioning edge
cases, aggregate display).

## Revisit after trying it (explicitly unsettled)

Iteration 1 is a foundation to bang on, not a final word. Marked for
revisit once real notes exist:

- Required-field/progress rules (what counts as "rated").
- Aggregation policy: simple average now; maybe latest-per-user or
  confidence weighting later.
- Dedup strictness when adding wines.
- Explicit save vs autosave; mobile ergonomics of the sheet.
- The "what people find" descriptor roll-up on wine pages.
- The blind-tasting ↔ catalog linking UI (schema ships now).
- Bottle sizes beyond the 750 ml default.

WSET SAT attribution: keep the in-app line "Follows the WSET Level 3
Systematic Approach to Tasting Wine."
