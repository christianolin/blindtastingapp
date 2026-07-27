# WSET Tasting Notes ("Cellar") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship iteration 1 of the Cellar: a shared wine catalog plus a WSET
Level 3 SAT tasting-note sheet (100-point quality), persisted structured-only,
with per-wine average ratings.

**Architecture:** Four new tables (`catalog_wines`, `wset_notes`,
`wset_aroma_terms`, `wset_note_aromas`) + `wines.catalog_wine_id`, all enum-
typed with RLS, a `save_wset_note` security-invoker RPC and a
`catalog_wine_ratings` view; Next.js App Router pages under `/cellar` with a
client `WsetSheet` island built from small controls (SnapSlider, PillGroup,
WineColourControl, AromaPicker, QualitySlider, SectionNav, LiveTastingNote).

**Tech Stack:** Next.js 16 (App Router, RSC + client islands), Supabase
(Postgres, RLS, RPC), Tailwind/shadcn, node:test for DB + pure-module tests.

**Spec:** `docs/superpowers/specs/2026-07-27-wset-tasting-notes-design.md`
(authoritative for vocabulary, RLS and behavior). Visual fidelity source:
`C:\Users\ChristianDahlOlin\Desktop\WSET Wine Tasting Interface\design_handoff_wset_tasting_sheet\README.md`.

## Global Constraints

- Migrations: timestamped `supabase/migrations/20260829193000+`, idempotent,
  final-state asserts, applied via
  `node scripts/scratch-apply.mjs --file <f> --mode dry` then `--mode live`
  (env: `DB_PASSWORD` + `DB_PORT` come from the owner's local environment —
  never write credentials into the repo; scratch-apply.mjs itself stays
  untracked + gitignored).
- Editor gremlin: any file > ~3.5 KB must be written in chunks
  (Write part 1, Edit-append the rest) and Read-verified before use.
- WSET wording is canonical (CLEAR/HAZY, not clear/dull). Keep the
  attribution line "Follows the WSET Level 3 Systematic Approach to Tasting
  Wine." on the sheet.
- All UI text/enum labels render lowercase WSET terms ("medium(+)",
  "tired / past best") mapped from the enum values.
- `npx tsc --noEmit` green before every commit that touches TS.
- Per `AGENTS.md`: read the relevant guide in `node_modules/next/dist/docs/`
  before writing Next.js route/page code.
- DB tests follow the map suites' pattern (node:test + pg over the pooled
  connection, pinned counts, withRollback for negative RLS probes — copy the
  harness shape from `scripts/wine-place-context.test.mjs`).
- No prototype code is ported; the handoff README is a spec, not a source.

## File Structure

- `supabase/migrations/20260829193000_cellar_catalog.sql` — enums (wine_colour,
  wine_style) + `catalog_wines` + `wines.catalog_wine_id` + RLS.
- `supabase/migrations/20260829194000_wset_notes.sql` — all `wset_*` enums,
  `wset_notes`, `wset_note_aromas`, hue↔colour trigger, RLS.
- `supabase/migrations/20260829195000_wset_aroma_seed.sql` — `wset_aroma_terms`
  + the 89-term seed + RLS.
- `supabase/migrations/20260829196000_wset_save_rpc.sql` — `save_wset_note`
  RPC + `catalog_wine_ratings` view + grants.
- `scripts/wset-notes.test.mjs` — DB suite (schema, RLS, seed, RPC, view).
- `src/lib/wset/vocab.ts` — enum⇄label maps, scale stop orders, hue sets per
  colour, progress rules (single source for the sheet + composer).
- `src/lib/wset/quality-curve.mjs` (+ `.d.ts`) + `scripts/quality-curve.test.mjs`
  — pure score⇄track-% mapping (plain ESM so node tests import it directly).
- `src/lib/wset/live-note.mjs` (+ `.d.ts`) + `scripts/live-note.test.mjs` —
  pure prose composer from note state (same pattern).
- `src/lib/wset/types.ts` — `WsetNoteState`, `CatalogWine` TS types.
- `src/lib/supabase/database.types.ts` — extended with new tables/enums/RPC
  (follow the file's existing generated structure).
- `src/components/wset/snap-slider.tsx`, `pill-group.tsx`,
  `wine-colour-control.tsx`, `aroma-picker.tsx`, `quality-slider.tsx`,
  `section-nav.tsx`, `live-tasting-note.tsx`, `wset-sheet.tsx`.
- `src/app/cellar/page.tsx` (+ `cellar-list.tsx`), `src/app/cellar/new/page.tsx`
  (+ `new-wine-form.tsx`), `src/app/cellar/[wineId]/page.tsx`,
  `src/app/cellar/[wineId]/notes/new/page.tsx`,
  `src/app/cellar/[wineId]/notes/[noteId]/page.tsx`.
- Modify: the main nav component (add "Cellar" entry; locate via grep for the
  existing "Knowledge" nav label).

---

### Task 1: Migration — cellar catalog (`catalog_wines` + blind link)

**Files:**
- Create: `supabase/migrations/20260829193000_cellar_catalog.sql`
- Create: `scripts/wset-notes.test.mjs` (harness + first tests)

**Interfaces:**
- Produces: table `catalog_wines(id, country_id, region_id, appellation_id,
  primary_grape_id, secondary_grape_id?, producer_id, type_designation_id?,
  vintage_kind vintage_kind, vintage_year?, vintage_tawny_years?,
  colour wine_colour, style wine_style, cuvee?, bottle_size_ml int default
  750, created_by, created_at)`; enums `wine_colour('WHITE','ROSE','RED')`,
  `wine_style('STILL','SPARKLING','FORTIFIED')`; column
  `wines.catalog_wine_id uuid null references catalog_wines(id)`.

- [ ] **Step 1: Write the migration.** DDL, in order: the two enums
  (guard with `if not exists` via `do $$` + `pg_type` lookup); the table with
  every FK `references ... on delete restrict`, the `wine_answers` vintage-
  shape check copied verbatim, `bottle_size_ml int not null default 750`,
  `created_by uuid not null references profiles(id)`, `created_at
  timestamptz not null default now()`; `alter table wines add column if not
  exists catalog_wine_id uuid references catalog_wines(id) on delete set
  null;`; `alter table catalog_wines enable row level security;` policies
  `"catalog read" for select to authenticated using (true)` and
  `"catalog insert" for insert to authenticated with check (created_by =
  auth.uid())` (no update/delete policies — that IS the immutability); final-
  state asserts (table exists, policies count = 2, wines column present).
- [ ] **Step 2: Dry-run.** `node scripts/scratch-apply.mjs --file
  supabase/migrations/20260829193000_cellar_catalog.sql --mode dry` →
  `DRY-OK`. Fix until clean, then `--mode live` → `LIVE-APPLIED`.
- [ ] **Step 3: Start the DB test file.** Copy the client/harness shape from
  `scripts/wine-place-context.test.mjs` (pg Client on pgConfig, before/after
  hooks, `withRollback`). Tests: (a) insert a catalog wine as the pooled role
  with existing reference ids (query one id each from countries/regions/
  appellations/grapes/producers inside the test) → succeeds, `bottle_size_ml`
  = 750 when omitted; (b) `update catalog_wines set cuvee='x'` under `set
  local role authenticated` inside `withRollback` → rejected (no policy);
  (c) bad vintage shape (`vintage_kind='YEAR'`, `vintage_year=null`) →
  check-constraint error; (d) `wines.catalog_wine_id` accepts null and a real
  id.
- [ ] **Step 4: Run.** `node --test scripts/wset-notes.test.mjs` → all pass.
- [ ] **Step 5: Commit** migration + test file:
  `git add supabase/migrations/20260829193000_cellar_catalog.sql
  scripts/wset-notes.test.mjs && git commit -m "cellar: catalog wines table
  + blind-tasting link"`.

### Task 2: Migration — `wset_notes` + aromas join + hue trigger

**Files:**
- Create: `supabase/migrations/20260829194000_wset_notes.sql`
- Modify: `scripts/wset-notes.test.mjs` (add note/RLS/trigger tests)

**Interfaces:**
- Produces: enums `wset_clarity('CLEAR','HAZY')`,
  `wset_condition('CLEAN','UNCLEAN')`, `wset_appearance_intensity('PALE',
  'MEDIUM_MINUS','MEDIUM','MEDIUM_PLUS','DEEP')`, `wset_intensity('LIGHT',
  'MEDIUM_MINUS','MEDIUM','MEDIUM_PLUS','PRONOUNCED')`,
  `wset_development('YOUTHFUL','DEVELOPING','FULLY_DEVELOPED',
  'TIRED_PAST_BEST')`, `wset_sweetness('DRY','OFF_DRY','MEDIUM_DRY',
  'MEDIUM','MEDIUM_SWEET','SWEET','LUSCIOUS')`, `wset_level('LOW',
  'MEDIUM_MINUS','MEDIUM','MEDIUM_PLUS','HIGH')`, `wset_body('LIGHT',
  'MEDIUM_MINUS','MEDIUM','MEDIUM_PLUS','FULL')`, `wset_finish('SHORT',
  'MEDIUM_MINUS','MEDIUM','MEDIUM_PLUS','LONG')`, `wset_mousse('DELICATE',
  'CREAMY','AGGRESSIVE')`, `wset_colour_hue('LEMON_GREEN','LEMON','GOLD',
  'AMBER','BROWN','PINK','SALMON','ORANGE','PURPLE','RUBY','GARNET',
  'TAWNY')`, `wset_observation('LEGS_TEARS','DEPOSIT','PETILLANCE',
  'RIM_VARIATION','TINTS_HIGHLIGHTS')`, `wset_fault('OXIDISED',
  'OUT_OF_CONDITION','CORK_TAINT','OTHER')`, `wset_price_category(
  'INEXPENSIVE','MID_PRICED','HIGH_PRICED','PREMIUM')`, `wset_readiness(
  'NEEDS_TIME','READY_CAN_IMPROVE','READY_WONT_IMPROVE','TOO_OLD')`.
- Produces: `wset_notes(id, catalog_wine_id, author_id, tasted_on date
  default current_date, clarity?, appearance_intensity?, colour_hue?,
  observations wset_observation[] default '{}', condition?, faults
  wset_fault[] default '{}', nose_intensity wset_intensity?, development?,
  sweetness?, acidity wset_level?, tannin wset_level?, alcohol wset_level?,
  body?, mousse?, flavour_intensity wset_intensity?, finish?, quality_score
  smallint? check (50..100), price_category?, readiness?, taster_notes text
  not null default '', created_at, updated_at + set_updated_at trigger)`;
  `wset_note_aromas(note_id, term_id, sensed_on_nose bool not null default
  false, sensed_on_palate bool not null default false, pk(note_id, term_id),
  check (sensed_on_nose or sensed_on_palate))` — `term_id` FK is added in
  Task 3 (terms table lands there; create the column now without FK and add
  the constraint in 195000).
- Produces: trigger `wset_notes_hue_matches_colour` — before insert/update,
  when `colour_hue` non-null, looks up the wine's `colour` and raises unless
  hue ∈ (WHITE: LEMON_GREEN, LEMON, GOLD, AMBER, BROWN · ROSE: PINK, SALMON,
  ORANGE · RED: PURPLE, RUBY, GARNET, TAWNY, BROWN).

- [ ] **Step 1: Write the migration** (chunked writes). Enums first (guarded),
  then `wset_notes` (RLS: select using(true) to authenticated; insert with
  check `author_id = auth.uid()`; update/delete using+check the same), the
  `set_updated_at` trigger reusing the existing function, `wset_note_aromas`
  (RLS: select using(true); all writes with check/using `exists (select 1
  from wset_notes n where n.id = note_id and n.author_id = auth.uid())`),
  the hue trigger function + trigger, final-state asserts (policy counts,
  trigger exists).
- [ ] **Step 2: Dry → live** via scratch-apply as in Task 1.
- [ ] **Step 3: Extend tests.** (a) authenticated-role insert of own note →
  ok; (b) insert with `author_id` = another profile id → RLS rejection;
  (c) select another author's note under authenticated role → visible
  (public read); (d) update another author's note → 0 rows affected;
  (e) `quality_score = 49` and `= 101` → check errors; (f) hue trigger: RED
  wine + `colour_hue='PINK'` → raises; `'RUBY'` → ok; (g) note-aroma row
  with both sensed flags false → check error.
- [ ] **Step 4: Run** `node --test scripts/wset-notes.test.mjs` → pass.
- [ ] **Step 5: Commit** — `git commit -m "cellar: wset note schema, hue
  trigger, rls"`.

### Task 3: Migration — aroma lexicon table + 89-term seed

**Files:**
- Create: `supabase/migrations/20260829195000_wset_aroma_seed.sql`
- Modify: `scripts/wset-notes.test.mjs` (seed tests)

**Interfaces:**
- Produces: enum `wset_aroma_family('FRUIT','FLORAL','SPICE','VEGETAL_OAK',
  'OTHER')`; table `wset_aroma_terms(id uuid pk, family wset_aroma_family,
  group_name text, term text unique, sort_order int)`; FK
  `wset_note_aromas.term_id -> wset_aroma_terms(id)` (deferred from Task 2).
- Seed (family · group · terms, in this exact order; `sort_order` = overall
  position 1..89):
  - FRUIT · Citrus: grapefruit, lemon, lime
  - FRUIT · Green fruit: green apple, red apple, gooseberry, pear
  - FRUIT · Stone fruit: apricot, peach
  - FRUIT · Red fruit: raspberry, red cherry, plum, redcurrant, strawberry
  - FRUIT · Black fruit: blackberry, black cherry, blackcurrant
  - FRUIT · Tropical: banana, kiwi, lychee, mango, melon, passion fruit,
    pineapple
  - FRUIT · Dried fruit: fig, prune, raisin, sultana
  - FLORAL · Blossom: elderflower, orange blossom
  - FLORAL · Flowers: perfume, rose, violet
  - SPICE · Sweet: cinnamon, cloves, ginger, nutmeg, vanilla
  - SPICE · Pungent: black pepper, white pepper, liquorice, juniper
  - VEGETAL_OAK · Fresh: asparagus, green bell pepper, mushroom
  - VEGETAL_OAK · Cooked: cabbage, tinned vegetables, black olive
  - VEGETAL_OAK · Herbaceous: eucalyptus, grass, hay, mint, blackcurrant
    leaf, wet leaves
  - VEGETAL_OAK · Kernel: almond, coconut, hazelnut, walnut, chocolate,
    coffee
  - VEGETAL_OAK · Oak: cedar, medicinal, resinous, smoke, tobacco
  - OTHER · Animal: leather, wet wool, meaty
  - OTHER · Autolytic: yeast, biscuit, bread, toast
  - OTHER · Dairy: butter, cheese, cream, yoghurt
  - OTHER · Mineral: earth, petrol, rubber, tar, stony / steely
  - OTHER · Ripeness: caramel, candy, honey, jam, marmalade, treacle,
    cooked / baked, stewed

- [ ] **Step 1: Write the migration** (chunked): enum + table + RLS (select/
  insert to authenticated, no update/delete), one
  `insert ... select ... from (values ...) where not exists` seed using the
  list above verbatim (lowercase terms), then
  `alter table wset_note_aromas add constraint wset_note_aromas_term_fk
  foreign key (term_id) references wset_aroma_terms(id)` (guarded), then
  final-state asserts: total = 89 and per-family counts 28/5/9/23/24 —
  raise on mismatch.
- [ ] **Step 2: Dry → live** via scratch-apply.
- [ ] **Step 3: Seed tests.** Pin: count(*) = 89; per-family deepEqual
  {FRUIT:28, FLORAL:5, SPICE:9, VEGETAL_OAK:23, OTHER:24}; distinct
  group_name count = 21; term uniqueness (insert duplicate 'lemon' under
  authenticated → unique violation); a note-aroma row with a real term id +
  sensed_on_nose → inserts.
- [ ] **Step 4: Run** the suite → pass.
- [ ] **Step 5: Commit** — `git commit -m "cellar: wset aroma lexicon (89
  terms)"`.

### Task 4: Migration — `save_wset_note` RPC + ratings view

**Files:**
- Create: `supabase/migrations/20260829196000_wset_save_rpc.sql`
- Modify: `scripts/wset-notes.test.mjs` (RPC + aggregation tests)

**Interfaces:**
- Produces: `save_wset_note(p_note jsonb, p_aromas jsonb) returns uuid`,
  **security invoker**, `search_path = public`. `p_note` keys: `id?` (null ⇒
  insert), `catalog_wine_id`, `tasted_on?`, every scale/array/conclusion
  column by exact column name. `p_aromas`: array of
  `{term_id, sensed_on_nose, sensed_on_palate}`. Behavior: upsert the note
  (insert sets `author_id = auth.uid()`; update only touches the caller's
  row — RLS enforces), then `delete from wset_note_aromas where note_id = v_id`
  + insert the new rows; returns the note id. One transaction by nature
  (single function call).
- Produces: view `catalog_wine_ratings(catalog_wine_id, avg_score numeric,
  note_count int)` — `security_invoker = true`, over notes with
  `quality_score is not null`; grant select to authenticated.

- [ ] **Step 1: Write the migration**: the function (plpgsql; jsonb→column
  extraction with explicit casts per enum; `coalesce((p_note->>'id')::uuid,
  gen_random_uuid())` insert-or-update branch on existence of the caller's
  row), `grant execute ... to authenticated`, the view with
  `with (security_invoker = true)`, final-state asserts (function + view
  exist).
- [ ] **Step 2: Dry → live** via scratch-apply.
- [ ] **Step 3: Tests.** (a) RPC insert as authenticated user A → returns id;
  note + aroma rows present; (b) RPC update of the same id changes scalars
  and REPLACES aromas (old term gone, new present); (c) user B calling with
  A's note id → error/no-op (0 rows), A's note unchanged; (d) view: A scores
  90, B scores 80 on the same wine → avg 85.0, count 2; a third scoreless
  note doesn't change it; re-tasting by A (second note, 70) → avg 80, count
  3 (all history counts).
- [ ] **Step 4: Run** the suite → pass.
- [ ] **Step 5: Commit** — `git commit -m "cellar: save rpc + ratings view"`.

### Task 5: Vocab + note-state types (pure TS)

**Files:**
- Create: `src/lib/wset/types.ts`, `src/lib/wset/vocab.ts`

**Interfaces:**
- Produces (`types.ts`): `type WsetNoteState = { id: string | null;
  tastedOn: string; clarity: Clarity | null; appearanceIntensity: …;
  colourHue: …; observations: Observation[]; condition: …; faults: Fault[];
  noseIntensity: …; development: …; sweetness: …; acidity: …; tannin: …;
  alcohol: …; body: …; mousse: …; flavourIntensity: …; finish: …;
  qualityScore: number | null; priceCategory: …; readiness: …;
  tasterNotes: string; noseTermIds: string[]; palateTermIds: string[] }`
  (each enum type is a string-literal union matching the DB enum values
  exactly); `type CatalogWine` mirroring the table row + joined display
  names; `type AromaTerm = { id, family, groupName, term, sortOrder }`.
- Produces (`vocab.ts`): `LABELS: Record<string,string>` mapping every enum
  value to its lowercase WSET label (`MEDIUM_PLUS → "medium(+)"`,
  `TIRED_PAST_BEST → "tired / past best"`, `LEGS_TEARS → "legs / tears"` …);
  ordered stop arrays per scale (`APPEARANCE_INTENSITY_STOPS`,
  `INTENSITY_STOPS`, `SWEETNESS_STOPS`, `LEVEL_STOPS`,
  `FORTIFIED_ALCOHOL_STOPS = ['LOW','MEDIUM','HIGH']`, `BODY_STOPS`,
  `FINISH_STOPS`, `DEVELOPMENT_STOPS`); `HUES_BY_COLOUR: Record<'WHITE'|
  'ROSE'|'RED', Hue[]>` (WHITE: LEMON_GREEN…BROWN · ROSE: PINK,SALMON,
  ORANGE · RED: PURPLE,RUBY,GARNET,TAWNY,BROWN) + `HUE_HEX` swatch colours
  from the handoff; `sectionProgress(state, style) → { appearance: [n,3],
  nose: [n,4], palate: [n, style==='SPARKLING' ? 9 : 8], conclusions:
  [n,3] }` with the spec's required-field lists (observations/faults/free
  text never count; nose needs ≥1 nose term; palate needs ≥1 palate term).
- [ ] **Step 1:** Write both files (chunked). No React imports — pure data.
- [ ] **Step 2:** `npx tsc --noEmit` → green. Commit: `git commit -m
  "cellar: wset vocab + note state types"`.

### Task 6: Quality curve (pure module, TDD)

**Files:**
- Create: `scripts/quality-curve.test.mjs`, `src/lib/wset/quality-curve.mjs`,
  `src/lib/wset/quality-curve.d.ts`

**Interfaces:**
- Produces: `scoreToPct(score: number): number` (50→0, 80→20, 85→40, 90→70,
  95→90, 100→100; piecewise-linear; clamps to [50,100]),
  `pctToScore(pct: number): number` (inverse, integer-rounded, clamps),
  `qualityBand(score: number): string` (96–100 Extraordinary · 90–95
  Outstanding · 85–89 Very good · 80–84 Above average · 70–79 Average ·
  60–69 Below average · 50–59 Unacceptable).
- Implementation pattern (one source, node-testable, typed): the logic
  lives in plain ESM at `src/lib/wset/quality-curve.mjs` with a sibling
  `src/lib/wset/quality-curve.d.ts` declaring the three signatures; app
  code imports `@/lib/wset/quality-curve.mjs`; the node test imports it by
  relative path (`../src/lib/wset/quality-curve.mjs`). No build step, no
  duplication. (Task 7 uses the same pattern for the composer.)

- [ ] **Step 1: Failing test** (`scripts/quality-curve.test.mjs`):

```js
import test from "node:test";
import assert from "node:assert/strict";
import { scoreToPct, pctToScore, qualityBand } from "../src/lib/wset/quality-curve.mjs";

test("breakpoints map exactly, both directions", () => {
  const pairs = [[50,0],[80,20],[85,40],[90,70],[95,90],[100,100]];
  for (const [s,p] of pairs) {
    assert.equal(scoreToPct(s), p);
    assert.equal(pctToScore(p), s);
  }
});
test("round-trips and monotonic", () => {
  let prev = -1;
  for (let s = 50; s <= 100; s++) {
    const pct = scoreToPct(s);
    assert.ok(pct > prev); prev = pct;
    assert.equal(pctToScore(pct), s);
  }
});
test("bands", () => {
  assert.equal(qualityBand(97), "Extraordinary");
  assert.equal(qualityBand(90), "Outstanding");
  assert.equal(qualityBand(89), "Very good");
  assert.equal(qualityBand(84), "Above average");
  assert.equal(qualityBand(79), "Average");
  assert.equal(qualityBand(69), "Below average");
  assert.equal(qualityBand(59), "Unacceptable");
});
```

- [ ] **Step 2:** `node --test scripts/quality-curve.test.mjs` → FAIL
  (module not found).
- [ ] **Step 3: Implement** `src/lib/wset/quality-curve.mjs`:

```js
const BREAKS = [[50,0],[80,20],[85,40],[90,70],[95,90],[100,100]];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export function scoreToPct(score) {
  const s = clamp(score, 50, 100);
  for (let i = 1; i < BREAKS.length; i++) {
    const [s0, p0] = BREAKS[i - 1];
    const [s1, p1] = BREAKS[i];
    if (s <= s1) return p0 + ((s - s0) / (s1 - s0)) * (p1 - p0);
  }
  return 100;
}
export function pctToScore(pct) {
  const p = clamp(pct, 0, 100);
  for (let i = 1; i < BREAKS.length; i++) {
    const [s0, p0] = BREAKS[i - 1];
    const [s1, p1] = BREAKS[i];
    if (p <= p1) return Math.round(s0 + ((p - p0) / (p1 - p0)) * (s1 - s0));
  }
  return 100;
}
export function qualityBand(score) {
  if (score >= 96) return "Extraordinary";
  if (score >= 90) return "Outstanding";
  if (score >= 85) return "Very good";
  if (score >= 80) return "Above average";
  if (score >= 70) return "Average";
  if (score >= 60) return "Below average";
  return "Unacceptable";
}
```

  Then `src/lib/wset/quality-curve.d.ts` declaring the three signatures
  (`export function scoreToPct(score: number): number;` etc.).
- [ ] **Step 4:** Test passes; `npx tsc --noEmit` green.
- [ ] **Step 5: Commit** — `git commit -m "cellar: weighted quality curve"`.

### Task 7: Live note composer (pure, TDD)

**Files:**
- Create: `scripts/live-note.test.mjs`, `src/lib/wset/live-note.mjs`,
  `src/lib/wset/live-note.d.ts` (same pattern as Task 6; the test imports
  `../src/lib/wset/live-note.mjs`).

**Interfaces:**
- Produces: `composeLiveNote(state, termLabelById: Map<string,string>) →
  { appearance?: string; nose?: string; palate?: string;
  conclusions?: string }` — sections omitted when empty. Rules (handoff):
  terms joined with ", "; aroma lists appended after " — "; observations
  after "; "; labels via Task 5's `LABELS` (the mjs takes a labels object
  parameter to stay dependency-free); conclusions renders
  `"89 points (very good)"` using `qualityBand(...).toLowerCase()`.
- [ ] **Step 1: Failing test** with two concrete cases: (a) appearance-only
  state → `{ appearance: "Clear, medium(+) intensity, ruby; legs / tears." }`;
  (b) full state (the handoff's Wine #1) asserting all four sections,
  including nose `"Clean, medium(+) intensity, developing — blackcurrant,
  black cherry, plum, violet, black pepper, cedar, vanilla."` and
  conclusions `"89 points (very good)."`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** implement. **Step 4:** pass +
  tsc green. **Step 5: Commit** `git commit -m "cellar: live tasting note
  composer"`.

### Task 8: Database types

**Files:**
- Modify: `src/lib/supabase/database.types.ts`

- [ ] **Step 1:** Read the file's structure (generated Supabase shape), then
  extend `Tables` with `catalog_wines`, `wset_notes`, `wset_aroma_terms`,
  `wset_note_aromas` (Row/Insert/Update), `Views` with
  `catalog_wine_ratings`, `Functions` with `save_wset_note`, `Enums` with
  every new enum — names/columns exactly as the migrations define them, and
  `wines.Row` gains `catalog_wine_id: string | null`.
- [ ] **Step 2:** `npx tsc --noEmit` green. Commit:
  `git commit -m "cellar: database types for wset tables"`.

### Task 9: SnapSlider + PillGroup

**Files:**
- Create: `src/components/wset/snap-slider.tsx`,
  `src/components/wset/pill-group.tsx`

**Interfaces:**
- `SnapSlider<T extends string>({ stops: readonly T[], value: T | null,
  onChange: (v: T | null) => void, labels: Record<string,string>,
  staggered?: boolean })` — track + fill + stop dots + 22px thumb; **unset
  ghost state** (no fill, dashed centered thumb) when `value === null`;
  pointer-capture drag snapping to nearest stop; dots and labels clickable;
  ≥4 stops ⇒ two-row staggered labels (odd indices lower). Handoff
  "snapping drag-slider" section is the pixel spec; colors map to the app
  theme tokens.
- `PillGroup<T extends string>({ options: readonly T[], labels, value,
  onChange, multi?: boolean })` — single-select (second click deselects to
  null) or multi (`value: T[]`, toggles). Selected = burgundy fill/cream
  text; unselected = cream fill/border. No fault/observation specifics here
  — callers compose.
- [ ] **Step 1:** Read `node_modules/next/dist/docs` client-component notes
  if not already done this session; implement both as `"use client"`
  components (chunked writes), no external deps beyond React + Tailwind.
- [ ] **Step 2:** `npx tsc --noEmit` green.
- [ ] **Step 3: Commit** — `git commit -m "cellar: snap slider + pill group"`.

### Task 10: WineColourControl + QualitySlider

**Files:**
- Create: `src/components/wset/wine-colour-control.tsx`,
  `src/components/wset/quality-slider.tsx`

**Interfaces:**
- `WineColourControl({ colour: 'WHITE'|'ROSE'|'RED', hue: Hue | null,
  onChange: (hue: Hue | null) => void })` — colour comes from the wine
  (read-only display of the three-way segment with the active one marked;
  switching colours is NOT possible here in iteration 1 since colour is
  wine identity), gradient track across `HUES_BY_COLOUR[colour]` with
  swatch circles + filled thumb; uses `HUE_HEX` from vocab.
- `QualitySlider({ score: number | null, onChange: (s: number | null) =>
  void })` — Playfair score readout + `qualityBand` label; track position
  via `scoreToPct`/`pctToScore` (import `@/lib/wset/quality-curve.mjs`);
  gold fill/thumb; tick + clickable labels at 50/70/80/85/90/95/100 (85
  gold); knee tick at 40%; explainer line under the slider verbatim from
  the handoff.
- [ ] **Step 1:** Implement (chunked). **Step 2:** tsc green.
- [ ] **Step 3: Commit** — `git commit -m "cellar: colour + quality
  sliders"`.

### Task 11: AromaPicker

**Files:**
- Create: `src/components/wset/aroma-picker.tsx`

**Interfaces:**
- `AromaPicker({ terms: AromaTerm[], selectedIds: string[], onChange:
  (ids: string[]) => void, copyFrom?: { label: string, ids: string[] } })` —
  family tabs (FRUIT, FLORAL, SPICE, VEGETAL_OAK, OTHER; labels "Fruit",
  "Floral", "Spice", "Vegetal & oak", "Other") with per-family selected-
  count badges; groups rendered as caption + wrapped pills in `sort_order`;
  multi-select toggle; selected-summary strip (chips with ×, "clear");
  `copyFrom` renders the ghost "Copy from nose" button (visible only when
  `copyFrom.ids.length > 0`) which unions those ids in. Tab state internal,
  defaults to FRUIT.
- [ ] **Step 1:** Implement (chunked). **Step 2:** tsc green.
- [ ] **Step 3: Commit** — `git commit -m "cellar: aroma picker"`.

### Task 12: SectionNav + LiveTastingNote + WsetSheet

**Files:**
- Create: `src/components/wset/section-nav.tsx`,
  `src/components/wset/live-tasting-note.tsx`,
  `src/components/wset/wset-sheet.tsx`

**Interfaces:**
- `SectionNav({ sections: { id, numeral, name, done, total }[], activeId,
  onJump(id) })` — sticky rail card; `onJump` smooth-scrolls via
  `window.scrollTo({ top: el.offsetTop - 84, behavior: 'smooth' })` (NOT
  scrollIntoView); scroll-spy owned by WsetSheet.
- `LiveTastingNote({ sections: { caption, prose }[] })` — renders the gold
  "TASTING NOTE · LIVE" card; italic Playfair prose; empty state "Slide and
  select — your note writes itself."
- `WsetSheet({ wine: CatalogWine, terms: AromaTerm[], initial:
  WsetNoteState, onSave: (state: WsetNoteState) => Promise<void> })` — owns
  the whole note state; renders the four section cards wiring every control
  from Tasks 9–11 per the spec's field list; conditioning: `wine.style ===
  'SPARKLING'` ⇒ mousse row required (progress 9) with "required —
  sparkling" hint, else hint "sparkling only"; `'FORTIFIED'` ⇒ alcohol uses
  `FORTIFIED_ALCOHOL_STOPS`; `condition === 'UNCLEAN'` reveals the FAULT
  pill row; palate aroma picker gets `copyFrom` = nose selection; progress
  counts from `sectionProgress`; save button flashes "Saved ✓" for 2.2 s on
  resolve, shows a retryable error state on reject (state kept). Top bar:
  wine name, "N of M rated", Save; attribution footnote line.
- [ ] **Step 1:** Implement the three files (wset-sheet will need several
  chunked writes; verify with Read after).
- [ ] **Step 2:** tsc green.
- [ ] **Step 3: Commit** — `git commit -m "cellar: wset sheet + rail"`.

### Task 13: Routes + nav

**Files:**
- Create: `src/app/cellar/page.tsx`, `src/app/cellar/cellar-list.tsx`,
  `src/app/cellar/new/page.tsx`, `src/app/cellar/new/new-wine-form.tsx`,
  `src/app/cellar/[wineId]/page.tsx`,
  `src/app/cellar/[wineId]/notes/new/page.tsx`,
  `src/app/cellar/[wineId]/notes/[noteId]/page.tsx`
- Modify: the main nav component (grep for the "Knowledge" label; add
  "Cellar" beside it, same styling)

**Interfaces:**
- Consumes: `WsetSheet`, `sectionProgress`, `save_wset_note` RPC,
  `catalog_wine_ratings` view, `ReferenceCombobox`
  (`src/components/reference-combobox.tsx`) with its existing props.
- Produces: server helper `fetchCatalogWine(supabase, wineId):
  Promise<CatalogWine | null>` in `src/lib/wset/queries.ts` (joins the
  reference names + the ratings row), used by all three wine-scoped pages.

- [ ] **Step 1: `/cellar`** — server page (auth-guarded like `/dashboard`):
  list from `catalog_wines` joined to `catalog_wine_ratings` + producer/
  appellation names, ordered by recently added; each row links to the wine
  page showing name (producer + cuvée + vintage), colour/style badges, avg
  score (1 decimal) + note count or "no notes yet"; "Add a wine" button →
  `/cellar/new`. Client `cellar-list.tsx` only handles a text filter over
  the loaded rows (no server search in iteration 1).
- [ ] **Step 2: `/cellar/new`** — client form: `ReferenceCombobox` fields
  (country, region, appellation, primary/secondary grape, producer,
  type designation) with the existing add-new-option flow; colour + style
  pill groups; cuvée text; vintage kind (YEAR/NV/TAWNY) + year/tawny inputs
  mirroring the blind wine form's vintage UI
  (`src/app/tastings/[id]/wines/new/wine-form.tsx` is the reference).
  Dedup: before insert, query for an existing wine with same producer_id +
  cuvee (case-insensitive) + vintage + colour; if found show "Looks like
  this wine exists — open it instead?" with a link, plus "add anyway".
  Insert sets `created_by`; redirect to `/cellar/[id]`.
- [ ] **Step 3: `/cellar/[wineId]`** — identity header (names via
  `fetchCatalogWine`), aggregate (avg + count), the signed-in user's notes
  for this wine (date + score + link), "New tasting note" button. Reserved
  (empty) section commented for the future "what people find".
- [ ] **Step 4: note pages** — `notes/new` creates a fresh
  `WsetNoteState` (all null/empty, tastedOn = today) and `notes/[noteId]`
  loads an existing own note (404 via `notFound()` when missing or not
  the author's); both render `WsetSheet` with `onSave` calling
  `supabase.rpc('save_wset_note', { p_note, p_aromas })` (map camelCase
  state → column keys; aromas from noseTermIds/palateTermIds union with
  flags), then `router.replace` to the note id (new) and `router.refresh()`.
- [ ] **Step 5: nav** — add the Cellar entry.
- [ ] **Step 6:** tsc green; manual smoke: add a wine, fill a note, save,
  reload — values persist; average shows on the wine + list pages.
- [ ] **Step 7: Commit** — `git commit -m "cellar: routes, add-wine flow,
  note pages, nav"`.

### Task 14: Full verification + push

- [ ] **Step 1:** `node --test scripts/wset-notes.test.mjs
  scripts/quality-curve.test.mjs scripts/live-note.test.mjs` → all pass.
- [ ] **Step 2:** Existing suites still green: `node --test
  scripts/world-wine-map-foundation.test.mjs
  scripts/wine-place-context.test.mjs scripts/designation-members.test.mjs`
  (the new tables must not disturb pinned counts — they touch none).
- [ ] **Step 3:** `npx tsc --noEmit` green; `git status` clean except
  `scripts/scratch-apply.mjs`.
- [ ] **Step 4:** Push: `git push origin master` (Vercel deploys; no tiles
  run needed — the Cellar doesn't touch the map).
- [ ] **Step 5:** Report to the owner with the try-it list and the spec's
  "Revisit after trying it" items.
