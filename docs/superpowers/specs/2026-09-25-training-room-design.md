# Training room — design

Date 2026-09-25. Worktree `blindtastingapp-training`, branch `training-room`, base
`master` at `bb32a71`. Owner decisions were taken in conversation the same day; the
spec records them as D1–D22. Earlier specs reserved this feature:
`2026-07-27-wset-tasting-notes-design.md` §1 ("a blind-tasting training room: the
app reads a filled SAT form and suggests grapes/regions") and
`2026-07-29-wine-backbone-and-ia-foundation-design.md` §9 ("match a user's blind SAT
note to archetype ranges → suggest grapes/regions → map back to the championship
guess fields"). `wset_notes.context_kind` already has the value `TRAINING`
(20260829207000; 0 live rows), `wine_archetypes` was built "for the training room /
recommendations later" (20260829221000), and the nav carries a "Training Room ·
Soon" teaser (`src/components/nav-links.ts`).

## 1. Goal

Owner, verbatim: "We want to use the 'typical wines' to help the user with wine
suggestions after filling out the taste and rate form — but it's blind. So a special
place to taste and rate blind. You start with having a long list of possible wines
and each time you fill stuff in on the form, the list is narrowed." Then: "the
matching technique needs to be a bit relative — so you can kind of see 'how close'
your tasting note is to certain styles… they are also maybe not all of them equally
probabilistic"; "the typical wines are not completely set in stone, but have a little
bit of range… tannin could be medium+ or high for Bordeaux right bank… if you don't
choose exactly the same aromas it's fine — but you need to choose dark fruits";
"we could get extra points for hitting specific notes if they are very typical of
that wine"; "when you go specific for appellations like Pauillac, make sure it's
visible that it's in Bordeaux"; "we need many more typical wines in the app"; and
"go with B" (reveal and self-score), "(a)" (curated archetypes, the WSET canon),
"(1)" (live for everyone with a Preview pill), "Approach 1" (a standalone page,
matched on the device).

So: a solo practice room. You pour a glass whose label you cannot see, describe it
on the WSET form the app already has, and beside the form a **ranked** list of
typical wines re-orders live with every answer, each with a closeness percentage and
the one thing that pulls it down. At the end you name your pick (and optionally a
vintage), reveal the real bottle through the add-wine sheet, and see how close you
got — scored with the championship point table where a category can be compared —
plus a history of your sessions. The candidate pool is curated archetypes ("a typical
Pauillac") grown in batches from the WSET canon.

## 2. Decisions

- **D1 Session end = reveal and self-score (B).** A session ends by naming the real
  wine (scan or catalog search, the Taste & Rate pick) and scoring the pick against
  it. "I can't find out" is allowed: the note and an unscored attempt are kept, and
  history offers **Reveal now** later.
- **D2 Candidates are curated archetypes (a).** `wine_archetypes` is the unit; the
  pool grows by in-session curation written as data migrations (AGENTS.md: no
  Anthropic API for content). No derived candidates from place styles or grape prose.
- **D3 Ranking, never filtering.** Every archetype keeps a closeness score computed
  over the fields answered so far; the list is sorted by it. Nothing is removed;
  contradicted colour or style caps a candidate at 15 % and moves it under
  "Unlikely from what you've said".
- **D4 Soft ranges.** Each SAT scale of an archetype is a `[low, high]` range on the
  full WSET enum ladder. In range scores 1.0, one step outside 0.6, two 0.2, further
  0.
- **D5 Aromas match on groups; signatures on exact terms.** Ordinary aroma credit is
  the share of the taster's aroma *groups* the archetype also carries. An archetype's
  aroma link may be flagged `signature`; picking that exact term adds a bonus worth a
  full scale in agreement (at most two hits count). A missed signature costs nothing.
- **D6 Standalone page, matched on the device (Approach 1).** `/taste/training`; the
  pool is read once per request as the viewer; a pure TS matcher re-ranks on every
  change. No tasting, glass or guess row is involved. Hidden one-person tastings and
  server-side matching were considered and rejected (§13).
- **D7 Scoring uses the championship table where comparable, in SQL.** Country 2,
  region 3, appellation 5, primary grape 8, secondary grape 2 (only when the wine has
  one), type designation 2 (only when the wine has one), vintage 2 / ±1 year 1 / 0
  (only when a vintage was guessed). Producer is not guessable from a style and is
  left out. The values live once in `record_training_attempt` and a DB test pins them
  to `reveal_wine`'s.
- **D8 Archetypes carry their scoring identity as reference FKs** —
  `country_id`, `region_id`, `appellation_id` (the specific appellation or the
  region's own self-named one) — resolved by exact name when a batch is written,
  never at runtime.
- **D9 The map place becomes optional** on `wine_archetypes` so the pool can cover
  regions the map does not (Napa, Marlborough, Mendoza). Where a place exists the
  archetype still shows on the map as today.
- **D10 Designations and typical age.** `wine_archetype_designations` (0…n
  `type_designations` per archetype) feeds the designation category and the row's
  hint; `typical_age_low/high` (years, nullable) is a hint for the vintage guess.
- **D11 Every candidate row shows its lineage** — "Pauillac · Bordeaux, France ·
  Cabernet Sauvignon, Merlot" — and opens the archetype sheet with the description,
  so no appellation is a bare word.
- **D12 Live for everyone, badged Preview (1).** The nav child's `soon` becomes
  `preview`: a real link with a **Preview** pill in the sidebar, the phone drawer and
  the `/taste` start menu; the About tile follows. No role gate, no flag, no env.
- **D13 The draft lives on the device.** An unfinished session (note state, pick,
  started-at) is kept in browser storage through `src/lib/safe-storage.ts`, keyed by
  user id; the landing shows **Continue** while one exists. Nothing is on the server
  before the reveal — there is no answer key anywhere, because nobody knows the wine.
- **D14 One RPC writes the result.** `record_training_attempt` saves the note through
  `save_wset_note` **as the caller** (the caller's own note policies apply) and the
  `training_attempts` row as the definer, computing points in SQL, in one
  transaction. No client role can write `training_attempts`.
- **D15 The note constraint gains a TRAINING branch.** `wset_notes_one_identity`
  admits no identity when `context_kind = 'TRAINING'` and `tasting_wine_id is null`.
  Such a note is readable by its author only (the existing read policy). Every other
  shape is unchanged.
- **D16 Visibility.** A revealed training note is a normal public note on that wine,
  marked "written blind in training" wherever BLIND notes are marked. The attempt
  (pick, score, snapshot, history) is the author's alone. No leaderboard or friend
  comparison in the preview.
- **D17 The style verdict.** The real wine is mapped to its own archetype — same
  `appellation_id` and colour/style, else same `region_id`, primary grape and
  colour/style — and the result says where it stood in the taster's list, or "this
  style isn't in the pool yet".
- **D18 Points, not judgement.** Quality score, price and readiness are the taster's
  conclusions, never matched against archetypes. Clarity is excluded from matching as
  noise. Faults, observations and tannin nature are recorded but not matched.
- **D19 Bubbles and fortified are visible or evident facts the form must be able to
  state.** Appearance gains a *Bubbles: none / sparkling* toggle (switches the mousse
  row on); the alcohol row gains a fourth stop, *fortified (15 %+)*. Both act as caps
  (D3).
- **D20 English copy in the preview.** The WSET sheet's EN/DA toggle keeps working
  inside the room; room copy and archetype text are English for now.
- **D21 Batch 1 content is written in-session** by the assistant, as a reviewable
  JSON file that a generator turns into a fail-closed data migration (a grape,
  reference row or aroma term that does not resolve refuses to emit). The owner may
  adjust ranges and signatures afterwards in `/admin/archetypes`, which gains the new
  fields.
- **D22 Rollout.** Schema migration first (additive; the deployed app ignores it),
  then the app deploy with the 15 live French archetypes, then batch 1 as a data
  migration, then batch 2 the same way. App rollback is a revert; migrations stay.

## 3. Screens and flow

### 3.1 Entry
- `NavChild` gains `preview?: boolean` (replacing `soon` on this item): rendered as a
  live link with a small **Preview** pill (the existing "Soon" pill's shape and
  tokens, new word). Sidebar (`app-sidebar.tsx`), phone drawer (`mobile-nav.tsx`), and
  the `/taste` `StartTastingMenu` item all point at `/taste/training`. Taste's `match`
  already covers `/taste/*`. The About tile's "In development" line becomes "Preview".

### 3.2 Landing (`/taste/training`, no session in progress)
Eyebrow *Training room · Preview*; title *Taste blind. Then find out.*; promise line;
coverage line built from the live pool ("58 typical wines so far — France, Italy,
Spain, Germany. More each week." — countries listed in descending count, top four,
"and more" when longer); **Start a session** (real `Button`); then *Your sessions*:
a tally line and one row per attempt, newest first (§9 copy). An unfinished on-device
draft replaces Start with a **Continue your session · started 20:14** card and a quiet
*Discard* link (two-tap, `console-copy.ts`'s `twoTapState`).

### 3.3 Session
The WSET sheet (`WsetSheet`) in unknown-wine mode (`wine: { colour: null, style: null }`)
— one section at a time, as everywhere — with two small additions to the sheet
itself (§7.3): a *Bubbles* toggle in Appearance and a fourth alcohol stop; and three
new props: `onChange` (live state), `saveLabel` and `belowBar` (a slot pinned under
the sticky section bar).

**What it could be**:
- Laptop (`lg+`): a sticky right-hand column (360 px, the shape of the sheet's prose
  aside): heading, then the top five rows, then *Show all N* (expands in place, with
  the "Unlikely from what you've said" group last). A row: name in bold, lineage line,
  a closeness bar with the percentage, and one explanation line (§5.6). Tapping a row
  opens the archetype detail (`ArchetypeSheet`, read-only) in a popover with the
  taster's answers drawn on the ranges.
- Phone (below `lg`): the `belowBar` slot holds a 44 px strip — *Top match: Pauillac
  91 % · 2 more close* (or *Start describing the wine*). Tapping it opens the app's
  bottom-sheet idiom (the tour/note-saved sheet: rounded top, drag pill, `max-h-[88dvh]`)
  with the full ranked list; tapping a row swaps the sheet's content to the archetype
  detail with a back arrow (no stacked sheets). The strip re-renders on every change.
- Before any scale or aroma is answered: no percentages; the list is grouped by
  country, alphabetical, with the hint *Start describing the wine*.

**Your call** — a card under the sheet (all breakpoints), present on every section
but the sheet's footer step "Your call →" (its `saveLabel`) on Conclusions scrolls to
it: *Which wine is it?* (a picker listing the ranked candidates with their
percentages, plus *Something else…* → search every archetype by name), *Vintage
(optional)* (the guess ladder's year list, `ladder-copy`/`field-picker` idiom),
**Reveal the bottle**, and *I can't find out*.

### 3.4 Reveal
**Reveal the bottle** opens the add-wine sheet with destination
`{ kind: "note", reveal: true }` and `onNotePick`: the sheet's note flow as today
(camera on a phone, search-led on a laptop, by-hand for a wine not in the catalog),
with the reveal wording (§9), and the pick is handed back to the room instead of
opening `NewNoteModal`. The room then calls the server action `finishTrainingSession`
(→ `record_training_attempt`) with the note state, aromas, pick, vintage, the
catalog wine and the frozen top five, and renders the result. *I can't find out* calls
the same action with no wine.

### 3.5 Result
The real wine's card (label as the catalog shows it: producer, name, vintage;
lineage: appellation · region, country; grapes; designation) beside *You said
{archetype}* (+ vintage). The verdict table: one row per category that applied —
Country, Region, Appellation, Grape, Second grape, Designation, Vintage — with ✓/✗ and
points, and *14 of 22*. *Where your note pointed*: the frozen top five with the real
wine's style highlighted — *Its style was your #2 at 88 %* — or *This style isn't in
the pool yet*. Buttons: **Another glass** (clears the draft, starts a new session),
*See the note* (opens the saved note in `NoteModal`), *Done* (landing).

### 3.6 History
Rows from `training_attempts` (author-only): *24 Sep · You said Pauillac · It was
Saint-Julien · 14 of 22*; an unrevealed one *24 Sep · You said Pauillac · Not revealed
· Reveal now*. The tally line counts scored attempts: *6 of 9 right on the grape · 4
on the appellation* (grape = `primary_grape_points > 0`, appellation =
`appellation_points > 0`). **Reveal now** opens the same reveal sheet and calls the
action with `attemptId`, which updates the attempt (and the note's identity) and
scores it.

## 4. The candidate pool and the content model

### 4.1 `wine_archetypes` after this spec
| column | change |
|---|---|
| `wine_place_id` | becomes nullable (D9) |
| `country_id uuid not null → countries` | new (D8) |
| `region_id uuid not null → regions` | new |
| `appellation_id uuid not null → appellations` | new; the specific appellation or the region's self-named row |
| `typical_age_low smallint`, `typical_age_high smallint` | new, nullable, years; check `low <= high` |
| existing | `name`, `colour wine_colour`, `style wine_style`, `primary_grape_id`, `secondary_grape_id`, `description`, `sat jsonb`, `quality_low/high`, `sort_order` |

Indexes on the three new FKs. The 15 live rows are back-filled in the migration by
exact-name lookups; the migration refuses to apply if any lookup does not resolve to
exactly one row (fail-closed, same-transaction asserts):

| archetype | country / region / appellation |
|---|---|
| Vosne-Romanée, Côte de Nuits red | France / Bourgogne / Vosne-Romanée AOP, Côte de Nuits-Villages AOP or the Bourgogne regional row — the implementer resolves against the live `appellations` names under `Bourgogne` and records the choice in the migration header |
| Chablis, Petit Chablis | France / Bourgogne / Chablis AOP, Petit Chablis AOP |
| Côte de Beaune, Côte Chalonnaise, Mâconnais | France / Bourgogne / the matching AOP or the regional row |
| Champagne | France / Champagne / Champagne AOP |
| Margaux | France / Bordeaux / Margaux AOP |
| Sauternes | France / Bordeaux / Sauternes AOP |
| Sancerre | France / Loire / Sancerre AOP |
| Alsace Riesling | France / Alsace / Alsace AOP |
| Côte-Rôtie, Châteauneuf-du-Pape | France / Rhône / Côte-Rôtie AOP, Châteauneuf-du-Pape AOP |
| Bandol | France / Provence / Bandol AOP |

(Region and appellation names are the live `regions.name` / `appellations.name`
spellings, including designation suffixes such as "AOP"; the implementer reads them
and writes the exact strings into the migration.)

### 4.2 `wine_archetype_aromas`
`signature boolean not null default false` (D5). Kind stays `NOSE | PALATE`. The
group of a term is `wset_aroma_terms.group_name`; the matcher never reads term ids
for ordinary credit.

### 4.3 `wine_archetype_designations`
`(archetype_id → wine_archetypes on delete cascade, type_designation_id →
type_designations on delete cascade, primary key (archetype_id, type_designation_id))`.
RLS as `wine_archetype_aromas`: read `authenticated` `using (true)`, all for
`profiles.is_curator`.

### 4.4 Matching scales
The twelve `sat` keys stay (`clarity`, `appearanceIntensity`, `colourHue`,
`noseIntensity`, `development`, `sweetness`, `acidity`, `tannin`, `alcohol`, `body`,
`flavourIntensity`, `finish`, plus `mousse` on sparkling). Clarity is stored but
never matched (D18). A scale absent from an archetype's `sat` is skipped for that
candidate (its weight leaves both numerator and denominator) — whites may carry no
tannin range.

### 4.5 The admin editor
`/admin/archetypes` gains: country → region → appellation pickers (the answer-key
cascade: `ReferenceCombobox` for country and region, `SearchableCombobox` scoped to
the region for appellation, with the region's self-named row offered as "Just the
region"), a designations multi-pick (`TypeDesignationField`-style grouped list),
typical age (two small number inputs), a *signature* toggle on every aroma link, and
the place field becomes optional. `scalesFor` keeps writing eleven keys; `clarity`
is dropped from the editor and ignored by the matcher.

### 4.6 Reading the pool
`src/lib/training/pool.ts` (server, `cache()` per request, RLS as the viewer):
archetypes (all columns above) + aromas (`term_id, kind, signature` joined to
`wset_aroma_terms.term, group_name, family, origin`) + designations (id, name,
category) + display names (country, region, appellation, primary/secondary grape) →
`TrainingCandidate[]` (§7.1). One query per table, joined in TS; a few hundred rows.

### 4.7 Batch 1 (~75 new, on top of the 15 live)
- **Bordeaux (7):** Pauillac, Saint-Julien, Saint-Estèphe, Pessac-Léognan red,
  Pessac-Léognan white, Saint-Émilion, Pomerol.
- **Burgundy (14):** Gevrey-Chambertin, Chambolle-Musigny, Nuits-Saint-Georges,
  Pommard, Volnay, Corton, Corton-Charlemagne, Meursault, Puligny/Chassagne (Côte de
  Beaune white), Chablis Premier/Grand Cru, Pouilly-Fuissé, Bourgogne rouge,
  Bourgogne blanc, Beaujolais cru.
- **Rest of France (10):** Pouilly-Fumé, Vouvray, Muscadet, Chinon, Condrieu,
  Hermitage/Crozes-Hermitage, Gigondas, Côtes du Rhône, Alsace Gewurztraminer, Alsace
  Pinot Gris, Provence rosé, Cahors.
- **Italy (16):** Barolo, Barbaresco, Barbera d'Asti, Gavi, Amarone, Valpolicella
  Ripasso, Soave, Prosecco, Franciacorta, Chianti Classico, Brunello di Montalcino,
  Bolgheri, Montepulciano d'Abruzzo, Taurasi, Etna Rosso, Primitivo.
- **Spain & Portugal (12):** Rioja Reserva, Rioja Gran Reserva, Ribera del Duero,
  Priorat, Bierzo, Rías Baixas Albariño, Rueda Verdejo, Fino/Manzanilla, Oloroso,
  Cava, Vintage Port, Tawny Port.
- **Germany & Austria (7):** Mosel Riesling Kabinett, Mosel Riesling Spätlese,
  Rheingau Riesling trocken, Spätburgunder, Wachau Grüner Veltliner, Wachau Riesling,
  Blaufränkisch.
- **New World and others (14):** Napa Cabernet Sauvignon, Sonoma Chardonnay,
  Willamette Pinot Noir, Marlborough Sauvignon Blanc, Central Otago Pinot Noir,
  Barossa Shiraz, Coonawarra Cabernet, Clare/Eden Valley Riesling, Hunter Valley
  Semillon, Mendoza Malbec, Chilean Cabernet Sauvignon, Stellenbosch Chenin Blanc,
  Santorini Assyrtiko, Tokaji Aszú.

A wine whose country, region or appellation does not exist in the scoring tables is
added to them in the same data migration (exact-name, fail-closed — the F9 rule that
reference rows are public at once applies; they are plain reference data). A New World
archetype's `wine_place_id` is null.

### 4.8 Curation guide (for the batch files and the editor)
- Name: "A typical {place or style}" — the map's convention.
- Colour/style: `wine_colour` + `wine_style`; sparkling adds `mousse`; fortified uses
  the five-stop alcohol ladder; sweet styles set `sweetness` high.
- Ranges: the enum ladders in `src/lib/wset/vocab.ts` (`LEVEL_STOPS`, `BODY_STOPS`,
  `SWEETNESS_STOPS`, `INTENSITY_STOPS`, `FINISH_STOPS`, `DEVELOPMENT_STOPS`,
  `APPEARANCE_INTENSITY_STOPS` extended to the full five-value enum, `HUES_BY_COLOUR`
  for hue, `ALCOHOL_STOPS`/`FORTIFIED_ALCOHOL_STOPS`). Typical width: one to two
  steps ("MEDIUM_PLUS"–"HIGH"); a single value where the style is fixed (Fino:
  sweetness DRY–DRY).
- Aromas: 4–6 nose, 4–6 palate terms from `wset_aroma_terms` (exact `term` spelling
  within its `group_name`); mark 1–3 as `signature` only where the term is truly
  diagnostic (petrol, tar, gooseberry, cedar, botrytis, mousse-related brioche…).
- Designations: only ones the label would carry (Reserva on Rioja Reserva; Grand Cru
  on Corton; Kabinett/Spätlese; Brut on Champagne/Cava; Vintage/Tawny on Port).
- Typical age: the years from vintage at which the style is usually met.
- Description: 2–3 sentences on what gives it away, no praise.
- Quality range: 50–100, as today; not matched.

## 5. The matcher (`src/lib/training/match.ts`, pure)

### 5.1 Inputs
`rankCandidates(note: WsetNoteState, extras: { bubbles: boolean | null; fortified: boolean }, pool: TrainingCandidate[], lexicon: AromaLexicon): RankedCandidate[]`
where `lexicon` maps `term_id → { group, term }`.

### 5.2 Ladders and distance
Each scale has an ordered ladder (full enum): appearance intensity PALE…DEEP (5),
hue within the note's colour family (`HUES_BY_COLOUR`), intensity LIGHT…PRONOUNCED,
development YOUTHFUL…TIRED_PAST_BEST, sweetness DRY…LUSCIOUS, level LOW…HIGH (acidity,
tannin, alcohol), body LIGHT…FULL, finish SHORT…LONG, mousse DELICATE…AGGRESSIVE. For
an answered scale with archetype range `[lo, hi]`: `d = 0` if `lo ≤ v ≤ hi`, else the
number of ladder steps from `v` to the nearer bound. Step score `s(d)`: 1.0, 0.6, 0.2,
then 0.

### 5.3 Weights
| scale | weight |
|---|---|
| sweetness, tannin, acidity | 1.5 |
| body | 1.2 |
| alcohol, colourHue, mousse (sparkling only) | 1.0 |
| noseIntensity, flavourIntensity, finish | 0.8 |
| development, appearanceIntensity | 0.6 |
| aromas (group recall) | 2.0 |
| signature bonus | +1.0 per exact hit, max 2 |
| clarity | 0 (not matched) |

### 5.4 Closeness
Over the scales the taster has answered *and* the archetype carries:
`closeness = round(100 × (Σ wᵢ·s(dᵢ) + w_a·a + b) / (Σ wᵢ + w_a·[aromas answered] + b_max·[aromas answered]))`,
where `a` is aroma group recall (§5.5), `b` the signature bonus actually earned and
`b_max` the bonus available (min(2, signature count) × 1.0) — so a candidate with no
signatures is not penalised relative to one with. With no answered scale and no
aroma, closeness is `null` (the list shows no percentages). Alcohol: the fortified
stop counts as `HIGH` on the five-stop ladder for matching and sets the fortified
cap.

### 5.5 Aromas
`G_note` = the set of `group_name`s of the taster's nose ∪ palate term ids; `G_arch`
= the archetype's aroma groups (nose ∪ palate). `a = |G_note ∩ G_arch| / |G_note|`
(0 when `G_note` is empty; then aromas are "not answered"). Signature hits: taster's
term ids ∩ the archetype's `signature` term ids; each hit +1.0, max 2.

### 5.6 Caps
`colourFromHue(note.colourHue)` (BROWN → null, no cap) ≠ archetype colour → cap;
`bubbles === true` and style ≠ SPARKLING → cap; `bubbles === false` and style ===
SPARKLING → cap; `fortified === true` and style ≠ FORTIFIED → cap; `fortified ===
false` (an unfortified alcohol stop chosen) and style === FORTIFIED → cap. A capped
candidate's closeness is `min(closeness, 15)` and it is grouped under "Unlikely from
what you've said" with the cap reason.

### 5.7 Explanation
For each candidate the scale with the largest weighted loss `wᵢ·(1 − s(dᵢ))` gives
the line: `"{scale label} {higher|lower} than typical"` (direction from which bound
was exceeded); if the largest loss is the aroma term: `"no {missing group} noted"`
for the archetype's group with the most terms that the taster did not pick; if a
signature hit exists and losses are small: `"✓ {term} — a signature"`. Pure function
`explain(ranked): string`, English, pinned by tests.

### 5.8 Order and snapshot
Sort by closeness desc (nulls: alphabetical by country then name), capped last, ties
by name. `snapshotTopFive(ranked)` → `{ archetypeId, closeness, rank }[]` (at most
five, uncapped first) — frozen into the attempt at reveal.

## 6. Reveal, scoring and persistence

### 6.1 `training_attempts`
```
id uuid pk default gen_random_uuid()
author_id uuid not null references profiles(id) on delete cascade
note_id uuid not null unique references wset_notes(id) on delete cascade
picked_archetype_id uuid references wine_archetypes(id) on delete set null
guessed_vintage_year smallint check (between 1900 and 2100)
actual_catalog_wine_id uuid references catalog_wines(id) on delete set null
actual_archetype_id uuid references wine_archetypes(id) on delete set null
candidates_snapshot jsonb not null default '[]'   -- [{archetype_id, closeness, rank}]
country_points smallint, region_points smallint, appellation_points smallint,
primary_grape_points smallint, secondary_grape_points smallint,
type_designation_points smallint, vintage_points smallint   -- null = did not apply / not scored
total_points smallint, possible_points smallint, scored_at timestamptz
created_at timestamptz not null default now()
check ((actual_catalog_wine_id is null) = (scored_at is null))
```
RLS: `select` for `authenticated` where `author_id = auth.uid()`; **no** insert /
update / delete policy and the table-level INSERT/UPDATE/DELETE grants revoked from
`anon` and `authenticated`. Index on `(author_id, created_at desc)`.

### 6.2 `record_training_attempt(p_note jsonb, p_aromas jsonb, p_attempt jsonb) returns jsonb`
SECURITY DEFINER, `set search_path = public`, EXECUTE `authenticated` only (revoke from
PUBLIC, anon, service_role). `p_attempt`: `{ attempt_id?, picked_archetype_id?,
guessed_vintage_year?, actual_catalog_wine_id?, candidates_snapshot }`.
1. `auth.uid()` must be set; else 42501.
2. Note: `p_note.context_kind` is forced to `'TRAINING'`, `tasting_wine_id` to null,
   `catalog_wine_id` to `actual_catalog_wine_id` (may be null); `v_note_id :=
   save_wset_note(p_note, p_aromas)` — SECURITY INVOKER, so it runs under the
   caller's own policies (a new note inserts; a re-reveal passes the existing note's
   `id` and the RPC never removes an identity the note already has).
3. Attempt: insert (or, when `attempt_id` is given, update the caller's own row,
   refusing 42501 otherwise) with the pick, vintage and snapshot.
4. If `actual_catalog_wine_id` is set: read the wine's identity (as definer;
   `catalog read` may hide a `blind_pending` row from the caller — the score is still
   computed, the client shows "a wine you can't see yet" if it cannot read the wine),
   read the picked archetype's FKs, grapes and designations (null pick → every point 0
   where applicable), compute:
   - country 2 / region 3 / appellation 5 / primary grape 8 by FK equality;
   - secondary grape 2 when the wine has one, else null;
   - type designation 2 when the wine has one and it is among the archetype's
     designations, 0 when the wine has one and it is not, null when the wine has none;
   - vintage: null when no guess; else 2 if `wine.vintage_kind = 'YEAR'` and equal, 1
     if off by exactly one year, 0 otherwise (NV/TAWNY wines: 0 unless the guess is
     null);
   - `possible_points` = sum of the maxima of the non-null categories; `total_points`
     = sum of points; `scored_at = now()`;
   - `actual_archetype_id` per D17.
5. Returns `{ attempt_id, note_id, points: {...}, total, possible, actual_archetype_id }`.

A DB test asserts the seven maxima equal the constants in `reveal_wine`'s body
(read from `pg_get_functiondef`), so the engines cannot drift.

### 6.3 `wset_notes_one_identity`
Recreated as: `num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1 OR
(num_nonnulls(...) = 0 AND tasting_wine_id IS NOT NULL AND context_kind = 'BLIND') OR
(num_nonnulls(...) = 0 AND tasting_wine_id IS NULL AND context_kind = 'TRAINING')`.
The insert/update policies need no change (their identity checks apply only with a
glass). The read policy already makes an identity-less note author-only.

### 6.4 `scrub_deleted_account`
Recreated from its live body (20260925003000) with one added statement: `delete from
public.training_attempts where author_id = p_user_id;` (before the notes are deleted;
the cascade would do it, explicit is clearer). Pre-state assert on the live md5.

### 6.5 Server actions (`src/app/taste/training/actions.ts`, `"use server"`)
- `finishTrainingSession(input: FinishInput): Promise<FinishResult>` → the RPC;
  revalidates `/taste/training`.
- `revealTrainingAttempt(attemptId, catalogWineId, noteState, aromas)` → the same RPC
  with `attempt_id`.
- `discardTrainingSession()` is client-only (device storage); no action.

## 7. Interfaces

### 7.1 Types (`src/lib/training/types.ts`, plain module)
```ts
export type Range = [string, string];
export type TrainingCandidate = {
  id: string; name: string; description: string | null;
  colour: WineColour; style: WineStyle;
  country: { id: string; name: string }; region: { id: string; name: string };
  appellation: { id: string; name: string; isRegional: boolean };
  primaryGrape: { id: string; name: string } | null; secondaryGrape: { id: string; name: string } | null;
  designations: { id: string; name: string }[];
  typicalAge: [number, number] | null;
  sat: Record<string, Range | undefined>;
  aromas: { termId: string; term: string; group: string; kind: "NOSE" | "PALATE"; signature: boolean }[];
  placeCanonicalKey: string | null;
  qualityLow: number | null; qualityHigh: number | null;
};
export type RankedCandidate = {
  candidate: TrainingCandidate; closeness: number | null;
  capped: null | "colour" | "bubbles" | "fortified";
  explanation: string | null; signatureHits: string[];
};
export type CandidateSnapshot = { archetypeId: string; closeness: number | null; rank: number }[];
export type TrainingDraft = { userId: string; startedAt: string; note: WsetNoteState; bubbles: boolean | null; fortified: boolean; pickedArchetypeId: string | null; guessedVintageYear: number | null };
export type AttemptRow = { id: string; createdAt: string; picked: { id: string; name: string } | null; guessedVintageYear: number | null; actual: { catalogWineId: string; label: string | null } | null; actualArchetype: { id: string; name: string } | null; points: Record<PointCategory, number | null>; total: number | null; possible: number | null; snapshot: CandidateSnapshot };
export type PointCategory = "country" | "region" | "appellation" | "primaryGrape" | "secondaryGrape" | "typeDesignation" | "vintage";
```

### 7.2 Modules
- `src/lib/training/match.ts` — `rankCandidates`, `explain`, `snapshotTopFive`,
  `ladderFor(scale, colour)`, `stepScore(d)`, `WEIGHTS` (pure; tests
  `match.test.ts`).
- `src/lib/training/pool.ts` — `readTrainingPool(supabase)` (server), `poolCoverageLine(candidates)` (pure, `pool-copy.ts`).
- `src/lib/training/draft.ts` — device draft read/write/clear via `safe-storage`.
- `src/lib/training/history-math.ts` — `tallyLine(rows)`, `attemptRowCopy(row)` (pure).
- `src/lib/training/copy.ts` — every string in §9 (pure, `copy.test.ts`).
- `src/app/taste/training/page.tsx` (server: pool + history + user), `training-room.tsx`
  (client: landing / session / result states), `candidates-panel.tsx` (laptop
  column), `candidates-strip.tsx` + `candidates-sheet.tsx` (phone), `your-call.tsx`,
  `result-view.tsx`, `history-list.tsx`, `actions.ts`.
- `src/components/wset/wset-sheet.tsx` — new props `onChange?`, `saveLabel?`,
  `belowBar?`, `bubbles?: { value: boolean | null; onChange(v): void }`,
  `fortifiedStop?: boolean` (renders the fourth alcohol stop; when picked the sheet
  reports `alcohol: "HIGH"` and `onFortified(true)`).
- `src/components/add-wine/types.ts` — `AddWineDestination` note variant gains
  `reveal?: true`; `AddWineOpenOptions.onNotePick?: (pick: NotePick) => void`;
  `matrix.ts` `noteMatrix` reads `reveal` for the eyebrow/title/row action (§9).
- `src/components/add-wine-context.tsx` — `pickNote` calls `onNotePick` when set
  instead of opening `NewNoteModal`.
- `src/components/nav-links.ts` — `NavChild.preview?: boolean`; sidebar, drawer and
  start menu render the pill and a live link.
- `src/app/admin/archetypes/*` — the editor fields of §4.5; `actions.ts` writes them.
- `scripts/training/gen-archetype-batch-migration.mjs` — JSON → data migration,
  fail-closed; `data/training/archetypes-batch-1.json`.
- Migrations: `20260925120000_training_room.sql` (schema, §4.1–4.3, §6.1–6.4, the
  15-row back-fill), `20260925130000_archetypes_batch_1.sql` (generated).
- DB suite: `scripts/training-room.test.mjs` (rolled back).

## 8. Layout details
- Page skeleton as every pillar page: `<AppHeader title="Training room" />` then
  `<main>`; the content column is the scroll container; no nested scroller except
  the candidates sheet body on phones.
- Laptop: `grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6`; the column is `sticky
  top-[72px] self-start`.
- Phone: the sheet's sticky bar (top 56) + the 44 px strip in `belowBar`; the
  candidates sheet is the tour-sheet Dialog idiom (PHONE classes), non-modal is not
  required; Escape and the backdrop close it; focus rules as the Popover rule
  (nothing steals focus on touch).
- Tokens only; light default, `.dark` follows the app; closeness bar in
  `--primary`, capped rows in `--muted-foreground`.
- Every tap target ≥ 44 px on touch (`min-h-11 md:pointer-fine:min-h-0`).
- All form values are React state (the room has no AutoRefresh, but the rule holds).

## 9. Copy (`src/lib/training/copy.ts`)
| key | text |
|---|---|
| nav label / pill | Training Room / Preview |
| eyebrow | Training room · Preview |
| title | Taste blind. Then find out. |
| promise | Pour a glass whose label you can't see. Describe it, watch the list tell you what it could be, then reveal the bottle. |
| coverage | {n} typical wines so far — {countries}. More each week. |
| start / continue / discard | Start a session / Continue your session · started {time} / Discard |
| candidates heading | What it could be |
| before answers | Start describing the wine |
| strip | Top match: {name} {pct} % · {k} more close  (k = others within 10 points; "· 1 more close"; none → just the leader) |
| unlikely group | Unlikely from what you've said |
| explanation | {Scale} higher than typical / {Scale} lower than typical / No {group} noted / ✓ {term} — a signature |
| show all | Show all {n} |
| your call | Your call / Which wine is it? / Something else… / Vintage (optional) / Reveal the bottle / I can't find out |
| reveal sheet (note matrix, reveal) | eyebrow Reveal the bottle · title Which bottle was it? · row action This is it |
| result | It was {wine} / You said {archetype}{, vintage} / {n} of {m} / Where your note pointed / Its style was your #{rank} at {pct} % / This style isn't in the pool yet / Another glass / See the note / Done |
| result rows | Country · Region · Appellation · Grape · Second grape · Designation · Vintage; ✓ / ✗ / — (did not apply) |
| history | Your sessions / {n} of {m} right on the grape · {k} on the appellation / {date} · You said {pick} · It was {wine} · {n} of {m} / Not revealed · Reveal now / You didn't pick a wine |
| note marker | written blind in training (where BLIND notes read "written blind") |
| unreadable wine | a wine you can't see yet |

## 10. Tests
- `match.test.ts`: in-range 1.0; one/two/three steps; a scale the archetype lacks is
  skipped; weights applied; closeness null before any answer; aroma group recall with
  the lexicon; signature bonus and its cap at two; `b_max` fairness; colour / bubbles
  / fortified caps at 15 % and grouping; explanation lines for each branch; sort and
  tie-break; `snapshotTopFive` shape. Fixtures: the 15 live archetypes copied from the
  seed migration, plus a synthetic white with no tannin.
- `pool-copy.test.ts`: coverage line for 0, 1, 4 and 6 countries.
- `history-math.test.ts`: tally with unscored rows; row copy for every state.
- `copy.test.ts`: the strings of §9.
- `nav-links` rendering: the preview pill is a link, the soon pill is not (pure
  helper `navChildState`).
- DB suite `scripts/training-room.test.mjs` (rolled back, pattern
  `scripts/friend-requests.test.mjs`): the constraint admits an identity-less TRAINING
  note without a glass and still refuses OPEN without identity; the RPC as a member
  (scores a known pair correctly; regional pick vs village wine gets 3 not 5; vintage
  2/1/0; secondary/designation null vs 0; possible_points), refuses another user's
  `attempt_id`, refuses anon; `training_attempts` has no client write and author-only
  read; maxima equal `reveal_wine`'s; the scrub removes attempts; the 15-row
  back-fill resolves.
- Browser (production build, phone 375×812 light+dark and laptop 1280): landing,
  a full session with a demo account (answers move the ranking; the strip and sheet;
  archetype detail; your call; reveal by catalog search; result; history row; Reveal
  now on an unrevealed attempt); the nav pill in sidebar, drawer and start menu.

## 11. Rollout
1. `20260925120000_training_room.sql` dry-run then live (additive; no deployed code
   reads the new columns). 2. App deploy (Preview pill live; 15 archetypes). 3. Batch 1
   JSON → generated migration → dry-run → live; the coverage line updates itself.
   4. Batch 2 later by the same route. Rollback: revert the app; migrations stay.
   Owner approval before each production push, as today.

## 12. Residuals and later
- No Danish for room copy or archetypes (D20).
- No friend comparison / leaderboard (D16).
- The lexicon (`wset_aroma_terms`) is insertable by any signed-in user and has
  drifted 143 → 144; the matcher keys on `group_name` so a new term in an existing
  group works, but a curator-only insert policy is a sensible hardening — not in this
  cut.
- The matcher as a hint inside real blind tastings is tempting and explicitly out.
- Derived long-tail candidates (option c) are out; the coverage line is the honest
  answer while the pool grows.
- Vintage has no knowledge source beyond `typical_age` and the note's development;
  the guess stays optional.

## 13. Rejected
- A hidden one-person tasting: the engine forbids guessing your own bottle, OPEN
  reveals everything by construction, and the session would surface as a tasting.
- Server-side matching per change: no benefit at this pool size; the matcher is pure
  and can move later.
- Derived candidates from place styles + grape prose: structure would be guessed from
  the grape alone and narrow wrongly.
- Role- or flag-gated preview: hides it from the members whose feedback it needs.
