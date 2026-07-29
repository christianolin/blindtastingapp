# Wine Backbone & Information-Architecture Foundation — Design

**Status:** Approved design (2026-07-29). Iteration 1 — the foundation that later
feature specs (archetypes, training room, label OCR, cellar holdings, community
stats) build on. Expected to be refined as those land.

**Project:** Blindr (blind wine-tasting app) — Next.js 16 + Supabase; `master`
auto-deploys to Vercel.

## 1. Purpose & context

Blindr began as a blind-tasting scorer and has since grown a WSET Level-4 tasting
sheet, a knowledge map (1,192 mapped French wine places), a grape library and a
type-designations reference. The features work individually but feel disjointed,
and there is **no single source of truth for "a wine"**: `wine_answers` (the
blind-tasting correct answers) and `catalog_wines` (the subject of WSET notes)
independently describe the same real-world wines.

This release restructures the app around **one canonical wine identity** plus a
clear information architecture, so future features plug into a shared backbone
instead of bolting on parallel data. Per the owner: don't be afraid to change the
data model radically where it earns its keep.

**Scope of THIS release:** the backbone **and** the IA restructure, shipped
together as one foundation. Everything else is deferred to its own spec.

### Success criteria
- Every blind-tasting wine and every tasting note resolves to exactly one
  `catalog_wines` row.
- A catalog wine's page shows its notes, the blind tastings it appeared in (and
  what people guessed right), and — later — who holds it, all from joins.
- Editing a catalog wine (creator or curator) **never** changes a past tasting's
  correct answer or its scores.
- The app presents five coherent pillars plus a global search, and no existing
  feature regresses.

### Non-goals (this release)
Archetypes & map pre-fill; training room; map-in-guessing; grape↔map filter;
label OCR; cellar bottle holdings; grape lineage tree; recommendations;
type-designations redesign; LWIN import. Columns/hooks that *enable* these are in
scope where cheap; the features are not.

## 2. The model: three layers, five pillars

Every object in the app is one of three kinds. Conflating them is the root of the
current disjointedness.

- **Reference** — *kinds* of wine (knowledge true regardless of bottles):
  `wine_places`, grapes, appellations, designations, future **archetypes**.
- **Identity** — *actual* wines, one row per real-world wine: `catalog_wines`.
- **Event** — *what people did*, always about one identity: tasting notes, blind
  tastings, training attempts, future cellar holdings.

`catalog_wines` is the hub: every event points at it, so its page can report
"tasted in 3 blind tastings (68% guessed the region), 7 notes averaging 89, held
by 4 people" from the schema rather than bespoke code.

**Pillars (top nav):**
- **Taste** (event) — modes: open note · blind · semi-blind · training room (later).
- **Catalog** (identity) — shared wine database + wine hub pages.
- **Cellar** (event, personal) — my notes now; my bottles later.
- **Knowledge** (reference) — map, grapes, designations, archetypes (later), rules.
- **Community** (event, social) — people, friends, activity, stats.

Plus a header **global search** (outside the pillars) and the logo → home/activity.
This also fixes the naming discomfort: today's `/cellar` is really *catalog +
notes* under the wrong name — it splits into shared **Catalog** and personal
**Cellar**.

## 3. Backbone data model

### 3.1 The redundancy and the security trap
`wine_answers` and `catalog_wines` carry the same descriptive FKs (country,
region, appellation, primary/secondary grape, producer, type-designation,
vintage). That duplication *is* the "no source of truth" problem, in one table
pair.

`wines.catalog_wine_id` already exists (nullable, unused) — but on the **wrong
table**. `wines` is readable by every joined participant, so a mandatory FK there
would let a participant follow it to the answer **before reveal**. `wine_answers`
is a separate table precisely because Postgres RLS is row-level and cannot hide
columns pre-reveal.

### 3.2 The fix — protected link + frozen snapshot
- Add **`wine_answers.catalog_wine_id`** → `catalog_wines`, **mandatory**;
  inherits the existing pre-reveal RLS. **Drop `wines.catalog_wine_id`.**
- `wine_answers` **keeps** its descriptive FK columns, redefined as a **frozen
  snapshot** copied from the chosen catalog wine when the wine is added to the
  tasting. Scores are always computed against the snapshot, never the live
  catalog, so a later catalog edit or merge can never change a past result.

Rationale: creators *and curators* may edit catalog wines. The snapshot guarantees
a curator fixing an appellation in 2027 cannot silently rewrite what was correct
in a 2026 championship. Link powers the hub; snapshot preserves history; a merge
can't corrupt a past result.

### 3.3 Curation, merge, creation
- **`profiles.is_curator`** boolean. `catalog_wines` becomes updatable by
  **creator or curator** (RLS), with an **edit audit** table
  (`catalog_wine_edits`: actor, timestamp, before→after).
- **Merge** RPC: repoint `wset_notes`, `wine_answers.catalog_wine_id` and future
  cellar rows from duplicate → canonical, then tombstone the loser
  (`catalog_wines.merged_into`). Snapshots are untouched, so history survives a
  merge.
- **Search-first creation:** the create UI must search existing catalog wines
  before allowing a new row. Mandatory linking multiplies duplicate pressure, so
  this is the main defence; plus a best-effort dedupe warning on
  producer+cuvée+vintage+colour.

### 3.4 External identifiers (LWIN)
Add `catalog_wines.lwin_code` (text, nullable) + `external_source` enum
(`MANUAL`/`LWIN`/…). **Columns only — no import.** Caveat: LWIN is Liv-ex's
identifier and commercially licensed, not open data; verify licensing before any
import feature is designed.

### 3.5 Notes ↔ tastings link
Add **`wset_notes.context_kind`** (`OPEN`/`BLIND`/`TRAINING`, default `OPEN`) plus
nullable **`wset_notes.tasting_wine_id`** → `wines`. This makes the Taste modes
one record type, lets the hub show "written blind", and is the hook the training
room reuses — avoiding a parallel note table.

## 4. App surface

### 4.1 Route map
| Now | Becomes | Note |
|---|---|---|
| `/cellar`, `/cellar/[id]`, `/cellar/new` | `/catalog`, `/catalog/[id]`, `/catalog/new` | shared wines + **wine hub** |
| `/cellar/[id]/notes/*` | `/catalog/[id]/notes/*` | note lives with its wine |
| — | `/cellar` | **my** notes now, my bottles later |
| `/dashboard` | `/taste` | mode cards + my tastings |
| `/tastings/*` | unchanged | reached via Taste |
| `/knowledge/*` | unchanged | + archetypes later |
| `/people`, `/friends` | `/community` | |
| — | `/` | home / activity |

Old paths keep working via redirects so shared links don't break.

### 4.2 Nav & search
- Pillars: **Taste · Catalog · Cellar · Knowledge · Community** — extend
  `NAV_LINKS` in `src/components/app-nav.tsx` (already drives desktop + mobile
  drawer).
- **Global search v1:** wines, places, grapes, producers via Postgres
  trigram/FTS — one RPC + a header box. People deferred (privacy nuance).

### 4.3 Semi-blind & note context
- **Semi-blind is a tasting setting, not a mode:** which answer fields are
  disclosed up front (e.g. country shown, rest hidden). Reuses the existing
  reveal machinery — no second code path.
- The blind play flow writes a `wset_notes` row with `context_kind=BLIND` +
  `tasting_wine_id` when a taster uses the SAT sheet during a tasting. The
  training room later extends the same shape.

### 4.4 The load-bearing UX risk
Mandatory catalog linking adds a search-or-create step to
**add-wine-to-a-tasting** — the flow used live, mid-tasting, on a phone. It must
not get slower: the catalog picker must double as the inline creator (type a
producer → create inline → keep going), close to what `wine-form.tsx` already
does. Highest-risk surface; prototype it before the rest of the pillar work.

## 5. Foundation release — phases

Each phase ships green (tests pass, `tsc` clean) and is independently deployable.

- **P1 — Backbone schema:** curation columns (`is_curator`, `catalog_wine_edits`
  audit, `lwin_code`, `external_source`, `merged_into`),
  `wine_answers.catalog_wine_id` (nullable first) with snapshot semantics
  documented, `wset_notes.context_kind`/`tasting_wine_id`, merge RPC, RLS updates.
  Migrations + DB tests.
- **P2 — Backfill & enforce:** for every existing `wine_answers` row,
  find-or-create a `catalog_wines` row from its snapshot and link; then set
  `catalog_wine_id` NOT NULL. Idempotent migration with final-state asserts.
- **P3 — Catalog pillar:** `/catalog/*` routes; the **wine hub page** (identity
  header, aggregate rating, notes, blind-tasting appearances + "what people
  guessed right"); notes moved under `/catalog/[id]/notes`; old-path redirects.
- **P4 — Taste pillar:** `/taste` mode cards; `/dashboard`→`/taste`; semi-blind
  setting on tasting create/edit; note-context wired into the blind play flow.
- **P5 — Add-wine catalog link:** the mandatory search-or-create picker in the
  tasting add/edit flow (the risky UX); dedupe warning; minimal curator merge UI.
- **P6 — Cellar & Community:** `/cellar` = my notes; `/people`+`/friends` →
  `/community`; nav to the five pillars.
- **P7 — Global search:** RPC + header box across wines/places/grapes/producers.

Ordering: schema + backfill de-risk everything; the catalog hub is the visible
payoff; the risky add-wine picker sits mid-way with the schema already proven.

## 6. Data migration (existing rows)
- Existing `wine_answers` predate the catalog → **backfill** (P2), find-or-create
  keyed on the full snapshot FK tuple. Identical answers across tastings collapse
  to one catalog wine (first dedupe win).
- Existing `catalog_wines` (from WSET notes) already conform; new columns get
  defaults.
- `wines.catalog_wine_id` is unused (nullable, no data) → safe to drop.
- Backfill runs live via `scripts/scratch-apply.mjs` (dry→live) with final-state
  asserts: every `wine_answers` linked; catalog count delta = distinct new tuples.

## 7. Testing
- **DB suites** (`node --test` on the pooled DB, pinned counts — existing
  pattern): participants cannot reach `catalog_wine_id`/the catalog before
  reveal; **snapshot immutability** (editing a catalog wine leaves the
  `wine_answers` snapshot and past scores unchanged); merge repoints
  notes/answers and preserves snapshots; backfill final-state.
- **Pure modules:** search-ranking helper; any score/aggregate helpers.
- **Type/route:** `tsc --noEmit` clean; redirects resolve; nav active-state.
- **Manual smoke:** add-wine-to-tasting on a mobile viewport (the risk flow);
  wine hub renders appearances.

## 8. Risks & open questions
- **R1 (highest):** add-wine picker latency mid-tasting. Mitigation: inline-create
  picker, prototype in P5, keep create to one screen.
- **R2:** duplicate catalog wines from mandatory linking. Mitigation: search-first
  + dedupe warning + curator merge.
- **R3:** backfill collapsing distinct wines that share an identical blind answer.
  The snapshot tuple includes producer, so a collision is the same identity at
  answer-granularity — acceptable; curators can split later. **Confirm OK.**
- **Open:** exact semi-blind disclosable-field set (settle in P4). First curator
  bootstrap = the owner, set by a direct DB flag.

## 9. Deferred (each its own spec, rough priority)
Archetypes (SAT ranges per map place, labelled e.g. "typical Châteauneuf-du-Pape")
→ training room (match a user's blind SAT note to archetype ranges → suggest
grapes/regions → map back to the championship guess fields) → map-in-guessing
(pick region/appellation from the map, host-toggleable) → grape↔map filter &
links → label OCR (cf. fastcork.com) → cellar bottle holdings → classified-château
map layer → grape lineage tree → WSET standard styles & food pairings per area →
style-based recommendations. The Reference/Identity/Event split is what lets these
share the backbone rather than re-implement it.

