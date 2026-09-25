# Training room — design

Date 2026-09-25. Worktree `blindtastingapp-training`, branch `training-room`, base
`master` at `bb32a71`. Owner decisions were taken in conversation the same day and are
recorded as D1–D22; a three-lens critique (consistency, feasibility against the live
code and database, product completeness) was folded in the same evening — every
"since the critique" note below marks one of its fixes. Earlier specs reserved this
feature: `2026-07-27-wset-tasting-notes-design.md` §1 ("a blind-tasting training room:
the app reads a filled SAT form and suggests grapes/regions") and
`2026-07-29-wine-backbone-and-ia-foundation-design.md` §9 ("match a user's blind SAT
note to archetype ranges → suggest grapes/regions → map back to the championship
guess fields"). `wset_notes.context_kind` already has the value `TRAINING`
(20260829207000; 0 live rows), `wine_archetypes` was built "for the training room /
recommendations later" (20260829221000), and the nav carries a "Training Room · Soon"
teaser (`src/components/nav-links.ts`).

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
matched on the device). Then: "you don't have to hand me the file, just write the
design and then implement" and "you don't have to ask before pushing, get it all
done".

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
  contradicted colour, bubbles or fortification caps a candidate at 15 % and moves it
  under "Unlikely from what you've said".
- **D4 Soft ranges.** Each SAT scale of an archetype is a `[low, high]` range on the
  same stop ladder the note form renders. In range scores 1.0, one step outside 0.6,
  two 0.2, further 0.
- **D5 Aromas match on groups; signatures on exact terms.** Ordinary aroma credit is
  the share of the taster's aroma *groups* the archetype also carries. An archetype's
  aroma link may be flagged `signature`; picking that exact term adds a bonus worth a
  full scale in agreement (at most two hits count). A missed signature costs nothing
  — the bonus is added on top and closeness is capped at 100 (since the critique: the
  bonus never enters the denominator).
- **D6 Standalone page, matched on the device (Approach 1).** `/taste/training`; the
  pool is read once per request as the viewer; a pure TS matcher re-ranks on every
  change. No tasting, glass or guess row is involved. Hidden one-person tastings and
  server-side matching were considered and rejected (§13).
- **D7 Scoring uses the championship table where comparable, in SQL.** Country 2,
  region 3, appellation 5, primary grape 8, secondary grape 2 (only when the wine has
  one), type designation 2 (only when the wine has one), vintage 2 / 1 / 0 with
  `reveal_wine`'s own rule (only when a vintage was guessed; NV and tawny guesses are
  possible, since the critique). Producer is not guessable from a style and is left
  out. The values live once in `record_training_attempt` and a DB test pins them to
  `reveal_wine`'s.
- **D8 Archetypes carry their scoring identity as reference FKs** —
  `country_id`, `region_id`, `appellation_id` (the specific appellation or the
  region's own self-named one) — resolved by exact **live** name when a batch is
  written, never at runtime.
- **D9 The map place becomes optional** on `wine_archetypes` so the pool can cover
  regions the map does not (Napa, Marlborough, Mendoza). Where a place exists the
  archetype still shows on the map as today; every reader of `wine_place_id` tolerates
  null (§7.2).
- **D10 Designations and typical age.** `wine_archetype_designations` (0…n
  `type_designations` per archetype) feeds the designation category and the row's
  hint; `typical_age_low/high` (years, nullable) is a hint for the vintage guess.
- **D11 Every candidate row shows its lineage** — "Pauillac · Bordeaux, France ·
  Cabernet Sauvignon, Merlot" — and opens the archetype sheet with the description,
  so no appellation is a bare word. Copy uses the short name (`shortName`, §9);
  the full "A typical Pauillac" is the row's title only.
- **D12 Live for everyone, badged Preview (1).** The nav child's `soon` becomes
  `preview`: a real link with a **Preview** pill in the sidebar, the phone drawer and
  the `/taste` start menu; the About tile follows. No role gate, no flag, no env.
- **D13 The draft lives on the device.** An unfinished session (a `sessionKey` minted
  at Start, note state, extras, pick, vintage, started-at) is kept in browser storage
  through `src/lib/safe-storage.ts`, keyed by user id; the landing shows **Continue**
  while one exists. Nothing is on the server before the reveal — there is no answer
  key anywhere, because nobody knows the wine.
- **D14 One RPC writes the result.** `record_training_attempt` (SECURITY DEFINER)
  saves the note through `save_wset_note` — which, inside a definer, runs as the
  table owner with RLS bypassed (since the critique: not "as the caller") — so the
  RPC itself enforces what the policies would: `auth.uid()` must be set, the note's
  `context_kind` is forced to `TRAINING`, `tasting_wine_id` to null,
  `catalog_wine_id` to the revealed wine, `unidentified_wine_id` to null, a fresh
  attempt takes no client note id, and a re-reveal takes its note id from the
  caller's own `training_attempts` row. The attempt row is written in the same
  transaction with SQL-computed points. No client role can write `training_attempts`.
- **D15 The note constraint gains a TRAINING branch.** `wset_notes_one_identity`
  admits no identity when `context_kind = 'TRAINING'` and `tasting_wine_id is null`.
  Such a note is readable by its author only (the existing read policy). Every other
  shape is unchanged.
- **D16 Visibility.** A revealed training note is a normal public note on that wine,
  carrying a "Training" badge wherever BLIND notes carry their "Blind" badge (the
  ratings card already labels TRAINING "Training"). The attempt (pick, score,
  snapshot, history) is the author's alone. No leaderboard or friend comparison in
  the preview. Since the critique: a hue that does not fit the revealed wine's colour
  is dropped from the saved note (the live hue trigger would refuse it) and kept on
  the attempt so the result can say so.
- **D17 The style verdict.** The real wine is mapped to its own archetype — same
  `appellation_id` and colour/style, else same `region_id`, primary grape and
  colour/style — with an ordered tie-break (§6.2 step 4), and the result says where
  it stood in the taster's full ranking, or "this style isn't in the pool yet".
- **D18 Points, not judgement.** Quality score, price and readiness are the taster's
  conclusions, never matched against archetypes. Clarity is excluded from matching as
  noise. Faults, observations and tannin nature are recorded but not matched.
- **D19 Bubbles and fortification are facts the form must be able to state.**
  Appearance gains a *Bubbles: none / sparkling* toggle (switches the mousse row on);
  the alcohol row gains a fourth, display-only stop, *fortified (15 %+)*. Both are
  tri-state (unknown until answered) and act as caps (D3). Fortification is never
  scored as a distance: the alcohol scale is skipped whenever either side is
  fortified (§5.4).
- **D20 English copy in the preview.** The WSET sheet's EN/DA toggle keeps working
  inside the room; room copy and archetype text are English for now.
- **D21 Batch 1 content is written in-session** by the assistant, as a reviewable
  JSON file that a generator turns into a fail-closed data migration (a grape,
  reference row or aroma term that does not resolve to exactly one live row refuses to
  emit). The owner may adjust ranges and signatures afterwards in `/admin/archetypes`,
  which gains the new fields.
- **D22 Rollout.** Schema migration first (additive; the deployed app ignores it),
  then the app deploy with the 15 live French archetypes, then batch 1 as a data
  migration, then batch 2 the same way. App rollback is a revert; migrations stay.
  The owner has authorised every push of this project in advance.

## 3. Screens and flow

### 3.1 Entry
- `NavChild` gains `preview?: boolean` (replacing `soon` on this item): rendered as a
  live link with a small **Preview** pill (the existing "Soon" pill's shape and
  tokens, new word), through one shared helper `navChildState(child)` →
  `"link" | "soon" | "preview"` used by the sidebar (`app-sidebar.tsx`) and the
  phone drawer (`mobile-nav.tsx`). The `/taste` `StartTastingMenu` item is not driven
  by `NavChild`: it becomes a `DropdownMenuItem render={<Link href="/taste/training" />}`
  with the same pill, and the WSET i18n table gains `preview: "Preview"` in both
  languages (D20). Taste's `match` already covers `/taste/*`. The About tile's "In
  development" line becomes "Preview".

### 3.2 Landing (`/taste/training`, no session in progress)
Eyebrow *Training room · Preview*; title *Taste blind. Then find out.*; promise line;
coverage line built from the live pool (§9: four countries by count desc then name,
"and more" when longer; the empty-pool wording hides **Start**); **Start a session**
(real `Button`); then *Your sessions*: a tally line and one row per attempt, newest
first, twenty at a time with **Show more** (§3.6). An unfinished on-device draft
replaces Start with **Continue your session · started 20:14** and a quiet *Discard*
(two-tap, `console-copy.ts`'s `twoTapState`).

### 3.3 Session
The WSET sheet (`WsetSheet`) in unknown-wine mode (`wine: { colour: null, style: null }`),
title *Unknown wine · started 20:14*, one section at a time as everywhere, with the
additions of §7.2: a *Bubbles* toggle in Appearance, a fourth alcohol stop, live
`onChange`, a `footerAction` in place of Save, a `belowBar` slot, `aside={null}`
(the room owns the layout), and `onClose` (✕ returns to the landing and KEEPS the
draft — Discard lives on the landing only).

**Effective style.** Inside the sheet `effectiveStyle = wine.style ?? (bubbles.value
=== true ? "SPARKLING" : fortified.value === true ? "FORTIFIED" : "STILL")` drives the
mousse row (Palate), the alcohol ladder shown, and `sectionProgress` (Palate counts 9
while Bubbles is on).

**What it could be**:
- Laptop (`lg+`): the room renders a two-column grid — the sheet left, a sticky
  360 px column right: heading, the top five rows, then *Show all N* (expands in
  place, the "Unlikely from what you've said" group last). A row: full name in bold,
  lineage line, a closeness bar with the percentage, one explanation line (§5.7).
  Tapping a row opens the archetype detail (`ArchetypeSheet` with `answers`, §7.2)
  in a popover with the taster's answers drawn on the ranges.
- Below `lg`: the `belowBar` slot holds a 44 px strip — *Top match: Pauillac 91 % · 2
  more close* (§9 defines k, the capped-leader wording and the pre-answer hint).
  Tapping it opens the app's bottom-sheet idiom (the tour/note-saved sheet: rounded
  top, drag pill, `max-h-[88dvh]`, using `max-lg:` variants of its PHONE classes and
  a centred card from `lg` — which never shows, since the column takes over there)
  with the full ranked list; tapping a row swaps the sheet's content to the archetype
  detail with a back arrow (no stacked sheets). The strip re-renders on every change.
- Before any scale or aroma is answered: no percentages; the list is grouped by
  country, alphabetical, with the hint *Start describing the wine*.

**Your call** — a card under the sheet (all breakpoints). The sheet's `footerAction`
reads *Your call →* on every section and scrolls to the card. The card: *Which wine
is it?* — a picker listing the ranked candidates with their percentages, *Something
else…* (search every archetype by name) and *It's not in the list* (pick = null) —
then *Vintage (optional)* (the guess ladder's vintage picker: years, NV, tawny ages),
**Reveal the bottle** (enabled with or without a pick) and *I can't find out*.

### 3.4 Reveal
**Reveal the bottle** opens the add-wine sheet with destination
`{ kind: "note", reveal: true }` and `onNotePick`: the sheet's note flow as today
(camera on a phone, search-led on a laptop, by-hand for a wine not in the catalog)
with the reveal wording (§9), no cellar draw-down (the reveal variant hides the
consume toggle and never consumes — a bottle poured blind was opened by someone else;
residual in §12), and the pick is handed back to the room instead of opening
`NewNoteModal`. The room then calls `finishTrainingSession` (→
`record_training_attempt`) with the note payload, aromas, session key, started-at,
pick, vintage, the catalog wine and the full ranking, and renders the result. *I can't
find out* calls the same action with no wine.

### 3.5 Result
The real wine's card (label as the catalog shows it: producer, name, vintage;
lineage: appellation · region, country; grapes; designation) beside *You said
{shortName}* (+ vintage) or *You didn't pick a wine*. The verdict table: always the
seven rows — Country, Region, Appellation, Grape, Second grape, Designation, Vintage
— with ✓ / ✗ and points, or *—* when the category did not apply; then *{n} of {m}*.
If the RPC cleared the hue: *Your colour call ({hue}) didn't fit — it was a {colour}
wine.* *Where your note pointed*: the top five from the frozen ranking with the real
wine's style highlighted — *Its style was your #{rank} of {n} at {pct} %*, or *You had
ruled its style out ({cap reason})*, or *This style isn't in the pool yet*. Buttons:
**Another glass** (clears the draft, starts a new session), *See the note* (opens the
saved note in `NoteModal`; only when a wine was revealed), *Done* (landing). Without a
reveal the result reads *Not revealed — your note is kept. Reveal now from Your
sessions.* with **Another glass** and *Done*.

### 3.6 History
Rows from `training_attempts` (author-only), newest first, 20 per page with **Show
more** (cursor `created_at, id`): *24 Sep · You said Pauillac · It was Saint-Julien ·
14 of 22*; *24 Sep · You didn't pick a wine · It was … · 0 of 22*; an unrevealed one
*24 Sep · You said Pauillac · Not revealed · Reveal now*. A wine the viewer cannot
read (a hidden catalog row) shows *a wine you can't see yet*; a merged wine is
followed through `catalog_wines.merged_into` on read. The tally line counts scored
attempts over all rows (one light select): *6 of 9 right on the grape · 4 on the
appellation* (grape = `primary_grape_points > 0`, appellation = `appellation_points >
0`). **Reveal now** opens the reveal sheet and calls `revealTrainingAttempt(attemptId,
catalogWineId)`, which runs the RPC with `attempt_id`: the stored pick, vintage and
ranking are kept, only the note's identity and the score are written. Deleting a
revealed training note from `NoteModal` deletes its attempt too (cascade) — the
session leaves history; the archive and note modal show a "Training" badge, and an
unrevealed note appears in `/taste/notes` as *Training room · not revealed*, linking
to `/taste/training`.

## 4. The candidate pool and the content model

### 4.1 `wine_archetypes` after this spec
| column | change |
|---|---|
| `wine_place_id` | becomes nullable (D9) |
| `country_id uuid not null → countries` | new (D8) |
| `region_id uuid not null → regions` | new |
| `appellation_id uuid not null → appellations` | new; the specific appellation or the region's self-named row |
| `primary_grape_id` | becomes `not null` (every archetype names a grape; Sauternes is back-filled) |
| `typical_age_low smallint`, `typical_age_high smallint` | new, nullable, years; check `low <= high` |
| existing | `name`, `colour wine_colour`, `style wine_style`, `secondary_grape_id`, `description`, `sat jsonb`, `quality_low/high`, `sort_order` |

Indexes on the three new FKs. The 15 live rows are back-filled in the migration by
exact-name lookups against the **live** spellings (French appellations end in
" AOC"; four Bourgogne rows are stored without accents); the migration asserts each
lookup resolves to exactly one row and refuses otherwise. Where the live table holds a
duplicate (Bordeaux has both "Margaux" and "Margaux AOC"), the suffixed row that
`wine_answers`/`catalog_wines` reference is the one. District archetypes take the
regional row where the like-named appellation is a small, unrelated one:

| live archetype name | country / region / appellation (live strings) |
|---|---|
| A typical Vosne-Romanée | France / Bourgogne / Vosne-Romanée AOC |
| A typical Côte de Nuits red | France / Bourgogne / Bourgogne AOC (the "Cote de Nuits-Villages AOC" row is a minor appellation, not the district) |
| A typical Côte de Beaune (red) | France / Bourgogne / Bourgogne AOC (same reasoning for "Cote de Beaune AOC") |
| A typical Chablis | France / Bourgogne / Chablis AOC |
| A typical Petit Chablis | France / Bourgogne / Petit Chablis AOC |
| A typical Côte Chalonnaise | France / Bourgogne / Cote Chalonnaise AOC |
| A typical Mâconnais | France / Bourgogne / Macon AOC |
| A typical Champagne | France / Champagne / Champagne AOC |
| A typical Margaux | France / Bordeaux / Margaux AOC |
| A typical Sauternes | France / Bordeaux / Sauternes AOC; grapes back-filled: primary Sémillon, secondary Sauvignon Blanc |
| A typical Sancerre | France / Loire / Sancerre AOC |
| A typical Alsace Riesling | France / Alsace / Alsace AOC |
| A typical Côte-Rôtie | France / Rhône / Côte-Rôtie AOC |
| A typical Châteauneuf-du-Pape | France / Rhône / Châteauneuf-du-Pape AOC |
| A typical Bandol | France / Provence / Bandol AOC |

(The implementer reads the live `regions.name` for Bourgogne/Champagne/Bordeaux/
Loire/Alsace/Rhône/Provence and the live archetype `name`s first, writes the exact
strings into the migration, and the asserts guard them.)

### 4.2 `wine_archetype_aromas`
`signature boolean not null default false` (D5). Kind stays `NOSE | PALATE`. The
group of a term is `wset_aroma_terms.group_name`; the matcher never reads term ids
for ordinary credit.

### 4.3 `wine_archetype_designations`
`(archetype_id → wine_archetypes on delete cascade, type_designation_id →
type_designations on delete cascade, primary key (archetype_id, type_designation_id))`.
RLS as `wine_archetype_aromas`: read `authenticated` `using (true)`, all for
`profiles.is_curator`.

### 4.4 Matching scales and ladders
The matched `sat` keys are `appearanceIntensity`, `colourHue`, `noseIntensity`,
`development`, `sweetness`, `acidity`, `tannin`, `alcohol`, `body`,
`flavourIntensity`, `finish`, plus `mousse` on sparkling. `clarity` is stored on the
15 live rows and ignored (D18). A scale absent from an archetype's `sat` is skipped
for that candidate (its weight leaves both numerator and denominator) — whites may
carry no tannin range. Ladders (since the critique, and matching how batch 1 was
written): the **full enum order** from `src/lib/wset/types.ts` for
`appearanceIntensity` (PALE, MEDIUM_MINUS, MEDIUM, MEDIUM_PLUS, DEEP), `sweetness`
(all seven values), intensity, development, level (acidity, tannin), body, finish and
mousse; `HUES_BY_COLOUR[archetype.colour]` for hue; and `ALCOHOL_STOPS` (LOW, MEDIUM,
HIGH — three steps, so medium→high is one step) for alcohol on an unfortified
archetype. A range bound may be an enum value the note slider does not offer (an
appearance range of [MEDIUM_PLUS, DEEP] scores DEEP 1.0 and MEDIUM 0.6); the taster's
answer is placed on the same enum ladder. The generator and editor validate that every
range lies on its ladder and includes at least one value the slider can produce; a
range bound off its ladder makes the matcher skip that scale for that candidate. A
fortified archetype's `alcohol` is written on `FORTIFIED_ALCOHOL_STOPS` for the
reference sheet only (D19: never a distance). The note form itself is unchanged.

### 4.5 The admin editor
`/admin/archetypes` gains: country → region → appellation pickers (the answer-key
cascade: `ReferenceCombobox` for country and region, `SearchableCombobox` scoped to
the region for appellation, with the region's self-named row offered as "Just the
region"), a designations multi-pick (`TypeDesignationField`-style grouped list),
typical age (two small number inputs), a *signature* toggle on every aroma link (the
profile input becomes `nose: { termId, signature }[]`, `palate: …`), and the place
field becomes optional. `scalesFor` adds a `mousse` row when the style is SPARKLING
(eleven keys, twelve for sparkling); untouched keys survive a save as today.

### 4.6 Reading the pool
`src/lib/training/pool.ts` (server, `cache()` per request, RLS as the viewer):
archetypes (all columns above) + aromas (`term_id, kind, signature` joined to
`wset_aroma_terms.term, group_name, family, origin`) + designations (id, name,
category) + display names (country, region, appellation, primary/secondary grape) +
`wine_places.canonical_key` where a place exists → `TrainingCandidate[]` (§7.1). One
query per table, joined in TS; a few hundred rows. `appellation.isRegional =
justTheRegionOption(region, [appellation]) !== null` (`self-named-appellation.ts`);
the lineage line then omits the appellation ("Bourgogne, France", not "Bourgogne AOC
· Bourgogne, France"). A pure `candidateToArchetypeView(candidate)` builds the
`ArchetypeView` for the detail sheet (placeName = the lineage line).

### 4.7 Batch 1 (~80 new, on top of the 15 live)
Every entry is one archetype with one appellation. Since the critique, pairs are
split so each earns appellation points; a generic name is pinned to one appellation
(Beaujolais cru → Morgon AOC, Saint-Émilion → Saint-Émilion Grand Cru AOC, Muscadet →
Sèvre et Maine, Provence rosé → Côtes de Provence, Primitivo → Primitivo di Manduria
DOC, Spätburgunder → Baden, Blaufränkisch → Mittelburgenland DAC, Sonoma Chardonnay →
Sonoma Coast AVA, Chilean Cabernet → Maipo Valley DO), recorded in the batch file:
- **Bordeaux (7):** Pauillac, Saint-Julien, Saint-Estèphe, Pessac-Léognan red,
  Pessac-Léognan white, Saint-Émilion, Pomerol.
- **Burgundy (16):** Gevrey-Chambertin, Chambolle-Musigny, Nuits-Saint-Georges,
  Pommard, Volnay, Corton, Corton-Charlemagne, Meursault, Puligny-Montrachet,
  Chassagne-Montrachet, Chablis Premier Cru, Chablis Grand Cru, Pouilly-Fuissé,
  Bourgogne rouge, Bourgogne blanc, Beaujolais cru (Morgon AOC).
- **Rest of France (13):** Pouilly-Fumé, Vouvray, Muscadet, Chinon, Condrieu,
  Hermitage, Crozes-Hermitage, Gigondas, Côtes du Rhône, Alsace Gewurztraminer, Alsace
  Pinot Gris, Provence rosé, Cahors.
- **Italy (16):** Barolo, Barbaresco, Barbera d'Asti, Gavi, Amarone, Valpolicella
  Ripasso, Soave, Prosecco, Franciacorta, Chianti Classico, Brunello di Montalcino,
  Bolgheri, Montepulciano d'Abruzzo, Taurasi, Etna Rosso, Primitivo.
- **Spain & Portugal (13):** Rioja Reserva, Rioja Gran Reserva, Ribera del Duero,
  Priorat, Bierzo, Rías Baixas Albariño, Rueda Verdejo, Fino, Manzanilla, Oloroso,
  Cava, Vintage Port, Tawny Port.
- **Germany & Austria (7):** Mosel Riesling Kabinett, Mosel Riesling Spätlese,
  Rheingau Riesling trocken, Spätburgunder, Wachau Grüner Veltliner, Wachau Riesling,
  Blaufränkisch.
- **New World and others (15):** Napa Cabernet Sauvignon, Sonoma Chardonnay,
  Willamette Pinot Noir, Marlborough Sauvignon Blanc, Central Otago Pinot Noir,
  Barossa Shiraz, Coonawarra Cabernet, Clare Valley Riesling, Eden Valley Riesling,
  Hunter Valley Semillon, Mendoza Malbec, Chilean Cabernet Sauvignon, Stellenbosch
  Chenin Blanc, Santorini Assyrtiko, Tokaji Aszú.

Reference resolution (since the critique): the batch JSON names country, region,
appellation and grapes by their **live** spellings (suffix included); the generator
refuses to emit when a name resolves to anything but exactly one row inside its
parent. It may add an appellation under an existing region only when that region has
no candidate row at all, and a region or country only when the batch file lists it
under `missingReferenceRows` and the migration header names it — never silently. New
World archetypes score region at the level the reference table holds (state / GI
parent) by construction. A batch entry whose place has no map row has
`placeCanonicalKey: null`.

### 4.8 Curation guide (for the batch files and the editor)
- Name: "A typical {place or style}" — the map's convention; copy shows `shortName`.
- Colour/style: `wine_colour` + `wine_style`; sparkling adds `mousse`; fortified sets
  `alcohol` on the five-stop ladder (used for the reference sheet, never for
  distance — D19); sweet styles set `sweetness` high. No ORANGE archetype in batch 1.
- Ranges: on the ladders of §4.4 exactly. Typical width one to two steps
  ("MEDIUM_PLUS"–"HIGH"); a single value where the style is fixed (Fino: sweetness
  DRY–DRY).
- Aromas: 4–6 nose, 4–6 palate terms from `wset_aroma_terms` (exact `term` spelling
  within its `group_name`); mark 1–3 as `signature` only where the term is truly
  diagnostic (petrol, tar, gooseberry, cedar/pencil shavings, botrytis, brioche…).
- Designations: only ones the label would carry (Reserva on Rioja Reserva; Grand Cru
  on Corton; Kabinett/Spätlese; Brut on Champagne/Cava; Vintage/Tawny on Port).
- Typical age: the years from vintage at which the style is usually met.
- Description: 2–3 sentences on what gives it away, no praise.
- Quality range: 50–100, as today; not matched.

## 5. The matcher (`src/lib/training/match.ts`, pure)

### 5.1 Inputs
`rankCandidates(note: WsetNoteState, extras: MatchExtras, pool: TrainingCandidate[], lexicon: AromaLexicon): RankedCandidate[]`
with `MatchExtras = { bubbles: boolean | null; fortified: boolean | null }` (null =
not answered) and `lexicon` mapping `term_id → { term, group }` (built from the
`wset_aroma_terms` the page already loads for the sheet).

### 5.2 Ladders and distance
For an answered scale with archetype range `[lo, hi]` on the candidate's ladder
(§4.4): `d = 0` if `lo ≤ v ≤ hi`, else the number of ladder steps from `v` to the
nearer bound. Step score `s(d)`: 1.0, 0.6, 0.2, then 0. Hue: the ladder is
`HUES_BY_COLOUR[candidate.colour]`; when the note's hue is not on that ladder the
scale is skipped (the colour cap of §5.6 carries the disagreement). Alcohol: skipped
whenever the candidate is FORTIFIED or `extras.fortified === true`; otherwise
distance on `ALCOHOL_STOPS`.

### 5.3 Weights
| scale | weight |
|---|---|
| sweetness, tannin, acidity | 1.5 |
| body | 1.2 |
| alcohol, colourHue, mousse (sparkling only) | 1.0 |
| noseIntensity, flavourIntensity, finish | 0.8 |
| development, appearanceIntensity | 0.6 |
| aromas (group agreement) | 2.0 |
| signature bonus | +1.0 per exact hit, max 2 — a pure bonus |
| clarity | 0 (not matched) |

### 5.4 Closeness
Over the scales the taster has answered *and* the candidate carries (and that are not
skipped by §5.2): `base = (Σ wᵢ·s(dᵢ) + w_a·a) / (Σ wᵢ + w_a·[aromas count])` where
`[aromas count]` is 1 when the taster picked at least one term **and** the candidate
has at least one aroma link, else 0 (a candidate with no aromas skips the term, like
an absent scale). `closeness = min(100, round(100·base + 100·b/Σw_total))` where `b`
is the signature bonus earned (≤ 2.0) and `Σw_total` the same denominator — so a
signature hit lifts closeness by about one scale's share and never lowers anyone.
When the denominator is 0 (nothing answered that this candidate carries), closeness
is **null**: the list shows no percentage for it and it sorts after numbered
candidates. A capped candidate keeps `null` if it had `null`; otherwise
`min(closeness, 15)`.

### 5.5 Aromas
`G_note` = the set of `group_name`s of the taster's nose ∪ palate term ids; `G_arch`
= the candidate's aroma groups (nose ∪ palate). `a = |G_note ∩ G_arch| / |G_note|`.
Signature hits: taster's term ids ∩ the candidate's `signature` term ids; each +1.0,
max 2.

### 5.6 Caps (tri-state, since the critique)
- colour: `note.colourHue !== null && !HUES_BY_COLOUR[candidate.colour].includes(note.colourHue)`
  (the `wset_hue_fits_colour` rule; BROWN fits white, red and orange; an ORANGE
  archetype fits GOLD/AMBER/BROWN);
- bubbles: `extras.bubbles === true && style !== "SPARKLING"`, or
  `extras.bubbles === false && style === "SPARKLING"`;
- fortified: `extras.fortified === true && style !== "FORTIFIED"`, or
  `extras.fortified === false && style === "FORTIFIED"`.
`null` never caps. A capped candidate is grouped under "Unlikely from what you've
said" with its reason (§9), sorted by closeness within the group.

### 5.7 Explanation (`explain`, pure, `string | null`)
Null before any scale or aroma is answered for this candidate. A capped candidate
explains its cap (§9: *Looks like a white, not a red* / *Bubbles noted* / *No bubbles
noted* / *Fortified* / *Not fortified*). Otherwise the largest weighted loss
`wᵢ·(1 − s(dᵢ))` (aromas: `w_a·(1 − a)`) decides: a scale gives *{Scale} higher than
typical* / *lower than typical* (direction from the bound exceeded; hue reads
*Colour darker/lighter than typical*); aromas give *{group} isn't typical* for the
taster's group not in `G_arch` with the most picked terms. If the largest loss is
below 0.3 and a signature was hit, the line is *✓ {term} — a signature*; if the
largest loss is below 0.3 and nothing was hit, the line is *Fits what you've said so
far*.

### 5.8 Order and snapshot
Sort: uncapped with a number first by closeness desc, then uncapped `null`s
alphabetically by country then name, then capped by closeness desc (nulls last), ties
by `shortName`. `snapshotRanking(ranked)` freezes **the whole list** —
`{ archetypeId, name, closeness, rank, capped }[]` (a few KB) — into the attempt at
reveal; the result's "Where your note pointed" renders its top five and looks the real
wine's style up in it.

## 6. Reveal, scoring and persistence

### 6.1 `training_attempts`
```
id uuid pk default gen_random_uuid()
author_id uuid not null references profiles(id) on delete cascade
session_key uuid not null                       -- minted on the device at Start
note_id uuid not null unique references wset_notes(id) on delete cascade
picked_archetype_id uuid references wine_archetypes(id) on delete set null
guessed_vintage_kind vintage_kind               -- YEAR | NV | TAWNY, null = no guess
guessed_vintage_year smallint check (guessed_vintage_year between 1900 and 2100)
guessed_vintage_tawny_years smallint
actual_catalog_wine_id uuid references catalog_wines(id) on delete restrict
actual_archetype_id uuid references wine_archetypes(id) on delete set null
note_colour_hue wset_colour_hue                 -- the hue as called, kept even when cleared from the note
hue_cleared boolean not null default false
candidates_snapshot jsonb not null default '[]' -- the full ranking, §5.8
country_points smallint, region_points smallint, appellation_points smallint,
primary_grape_points smallint, secondary_grape_points smallint,
type_designation_points smallint, vintage_points smallint   -- null = did not apply / not scored
total_points smallint, possible_points smallint, scored_at timestamptz
created_at timestamptz not null default now()
unique (author_id, session_key)
check ((actual_catalog_wine_id is null) = (scored_at is null))
check (guessed_vintage_kind is null or (guessed_vintage_kind = 'YEAR') = (guessed_vintage_year is not null))
check (guessed_vintage_kind is distinct from 'TAWNY' or guessed_vintage_tawny_years is not null)
```
RLS: `select` for `authenticated` where `author_id = auth.uid()`; **no** insert /
update / delete policy and the table-level INSERT/UPDATE/DELETE grants revoked from
`anon` and `authenticated`. Index on `(author_id, created_at desc, id desc)`. A merged
catalog wine is followed on read (`merged_into`), so `merge_catalog_wines` is not
recreated.

### 6.2 `record_training_attempt(p_note jsonb, p_aromas jsonb, p_attempt jsonb) returns jsonb`
SECURITY DEFINER, `set search_path = public`, EXECUTE `authenticated` only (revoke from
PUBLIC, anon, service_role). `p_attempt`: `{ attempt_id?, session_key, started_at,
picked_archetype_id?, guessed_vintage_kind?, guessed_vintage_year?,
guessed_vintage_tawny_years?, actual_catalog_wine_id?, candidates_snapshot }`.
1. `auth.uid()` must be set; else 42501.
2. **Fresh attempt** (no `attempt_id`): if a row `(author_id, session_key)` already
   exists, return it unchanged (idempotent — a second tab or a reload never doubles a
   session). Else: `p_note.id` must be null (42501 otherwise); force
   `context_kind = 'TRAINING'`, `tasting_wine_id = null`, `unidentified_wine_id =
   null`, `catalog_wine_id = actual_catalog_wine_id`, `tasted_on = (started_at at
   time zone 'UTC')::date`; **2b** when a wine is named and
   `not wset_hue_fits_colour(p_note.colour_hue, wine.colour)`, clear
   `p_note.colour_hue` and set `hue_cleared`; `v_note_id := save_wset_note(p_note,
   p_aromas)`; insert the attempt (pick, vintage triple, snapshot, `note_colour_hue`
   = the hue as called).
3. **Re-reveal** (`attempt_id` given): load the caller's row (42501 otherwise); refuse
   when `scored_at is not null` (P0001 "already revealed"); ignore `p_note`,
   `p_aromas`, pick, vintage and snapshot entirely; `update wset_notes set
   catalog_wine_id = wine, colour_hue = case when fits then colour_hue end where id =
   attempt.note_id and num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0`;
   set `hue_cleared` accordingly.
4. **Score** (when a wine is named), reading the wine as definer (`catalog read` may
   hide a `blind_pending` row from the caller; the score is still computed): with the
   picked archetype's FKs, grapes and designations (a null pick scores 0 on every
   applicable category):
   - country 2 / region 3 / appellation 5 / primary grape 8 by FK equality;
   - secondary grape 2 when the wine has one, else null;
   - type designation 2 when the wine has one and it is among the archetype's
     designations, 0 when the wine has one and it is not, null when the wine has none;
   - vintage, `reveal_wine`'s rule: null when no guess; 2 when kinds match and (YEAR
     equal, or NV, or TAWNY with equal years); 1 when both YEAR and off by exactly one;
     else 0;
   - `possible_points` = sum of the maxima of the non-null categories;
     `total_points` = sum of points; `scored_at = now()`;
   - `actual_archetype_id` per D17 with the tie-break: same `appellation_id`, colour,
     style; else same `region_id`, `primary_grape_id`, colour, style; among ties prefer
     one whose designations contain the wine's `type_designation_id`, then the taster's
     `picked_archetype_id`, then equal `secondary_grape_id`, then lower `sort_order`,
     then `id`; `limit 1`.
5. Returns `{ attempt_id, note_id, points: { country, region, appellation,
   primary_grape, secondary_grape, type_designation, vintage }, total, possible,
   actual_archetype_id, hue_cleared }`.

A DB test asserts the seven maxima equal the constants in `reveal_wine`'s body (read
via `pg_get_functiondef`), so the engines cannot drift.

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
  revalidates `/taste/training` and `/taste/notes`.
- `revealTrainingAttempt(attemptId: string, catalogWineId: string): Promise<FinishResult>`
  → the RPC with `attempt_id` and only the wine.
- `loadMoreTrainingHistory(cursor)` → the next 20 rows.
- The draft is client-only (device storage); discarding needs no action.

## 7. Interfaces

### 7.1 Types (`src/lib/training/types.ts`, plain module)
```ts
export type Range = [string, string];
export type Named = { id: string; name: string };
export type TrainingCandidate = {
  id: string; name: string; description: string | null;
  colour: WineColour; style: WineStyle;
  country: Named; region: Named; appellation: Named & { isRegional: boolean };
  primaryGrape: Named; secondaryGrape: Named | null;
  designations: Named[];
  typicalAge: [number, number] | null;
  sat: Record<string, Range | undefined>;
  aromas: { termId: string; term: string; group: string; kind: "NOSE" | "PALATE"; signature: boolean }[];
  placeCanonicalKey: string | null;
  qualityLow: number | null; qualityHigh: number | null;
};
export type MatchExtras = { bubbles: boolean | null; fortified: boolean | null };
export type CapReason = "colour" | "bubbles" | "fortified";
export type RankedCandidate = { candidate: TrainingCandidate; closeness: number | null; capped: CapReason | null; explanation: string | null; signatureHits: string[] };
export type RankingSnapshot = { archetypeId: string; name: string; closeness: number | null; rank: number; capped: CapReason | null }[];
export type AromaLexicon = Record<string, { term: string; group: string }>;
export type VintageGuess = { kind: "YEAR"; year: number } | { kind: "NV" } | { kind: "TAWNY"; years: number } | null;
export type TrainingDraft = { userId: string; sessionKey: string; startedAt: string; note: WsetNoteState; extras: MatchExtras; pickedArchetypeId: string | null; vintage: VintageGuess };
export type PointCategory = "country" | "region" | "appellation" | "primaryGrape" | "secondaryGrape" | "typeDesignation" | "vintage";
export type AttemptRow = { id: string; createdAt: string; picked: Named | null; vintage: VintageGuess; actual: { catalogWineId: string; label: string | null; lineage: string | null } | null; actualArchetype: Named | null; hueCleared: boolean; noteColourHue: string | null; points: Record<PointCategory, number | null>; total: number | null; possible: number | null; snapshot: RankingSnapshot };
```

### 7.2 Modules and touched files
- `src/lib/training/match.ts` — `rankCandidates`, `explain`, `snapshotRanking`,
  `ladderFor(scale, candidate)`, `stepScore(d)`, `WEIGHTS`, `CAP_MAX = 15`
  (tests `match.test.ts`).
- `src/lib/training/copy.ts` — every §9 string, `shortName(name)`, `coverageLine`,
  `stripLine`, `resultTotalLine`, `tallyLine`, `attemptRowLine`, `lineageLine`
  (tests `copy.test.ts`).
- `src/lib/training/history-math.ts` — `tally(rows)`; `src/lib/training/draft.ts` —
  `readDraft`, `writeDraft`, `clearDraft`, `newSessionKey()` via `safe-storage` (adding
  a `clearValue` helper there if none exists), key `blindr-training-draft:<userId>`;
  the room listens to the `storage` event for its key and returns to the landing when
  another tab clears it.
- `src/lib/training/pool.ts` (server-only) — `readTrainingPool`, `readTrainingHistory`
  (20 + cursor, follows `merged_into`), `readTrainingTally`, `coverageCountries`,
  `candidateToArchetypeView`.
- `src/lib/wset/note-state.ts` — `noteToPayload(state, ids)` and `aromasToPayload(state)`
  extracted from `note-editor.tsx` (which now imports them) and used by the room, so
  the RPC's keys live once.
- `src/app/taste/training/page.tsx` (server), `training-room.tsx`, `candidates-panel.tsx`,
  `candidates-strip.tsx`, `candidates-sheet.tsx`, `your-call.tsx`, `result-view.tsx`,
  `history-list.tsx`, `archetype-detail.tsx`, `actions.ts`.
- `src/components/wset/wset-sheet.tsx` — new props: `onChange?(state)`;
  `footerAction?: { label: string; onClick(): void }` (replaces the Save button and its
  states at every section; `onSave` becomes optional when given); `belowBar?:
  ReactNode` (rendered INSIDE the sticky bar so it inherits stickiness; its 44 px is
  added to the section scroll margin when present); `aside?: ReactNode | null` (`null`
  suppresses the live-note aside and the sheet renders single-column); `onClose?()`
  (✕/Close without the discard confirm); `bubbles?: { value: boolean | null;
  onChange(v: boolean | null): void }` (Appearance toggle); `fortified?: { value:
  boolean | null; onChange(v: boolean | null): void }` (the alcohol row renders
  `[...ALCOHOL_STOPS, "FORTIFIED"]` as a display-only fourth stop: tapping it sets
  `alcohol: "HIGH"` and `fortified true`; any other stop sets `fortified false`;
  clearing sets null); `effectiveStyle` as §3.3.
- `src/components/wset/archetype-sheet.tsx` — `ArchetypeSheet({ a, answers?, idPrefix? })`
  passing each answer as `value` to its range slider; `ArchetypeView` gains
  `lineage: string` (D11) and tolerates a missing place. `src/lib/wset/queries.ts`
  `fetchArchetype` and the Library archetype cards (`archetype-browser.tsx`) skip the
  place lookup when `wine_place_id` is null and print the lineage. The wine map is
  unaffected (it reads `wine_archetype_placements`).
- `src/components/add-wine/types.ts` — note destination `{ kind: "note"; reveal?: true }`;
  `AddWineOpenOptions.onNotePick?: (pick: NotePick) => void`; `matrix.ts` `noteMatrix`
  reads `reveal` for every note string (§9) and hides the consume toggle; `sheet-state`
  / `use-sheet-adds` pass `consume: false` for a reveal pick;
  `add-wine-context.tsx` `pickNote` calls `onNotePick` (of the CURRENT open, ignoring a
  stale one) instead of opening `NewNoteModal`.
- `src/components/nav-links.ts` — `NavChild.preview?: boolean`; `navChildState`;
  `app-sidebar.tsx`, `mobile-nav.tsx`, `start-tasting-menu.tsx` (Link item + pill);
  `src/lib/wset/i18n.ts` `preview`; `src/app/about/page.tsx` tile.
- Notes surfaces — `your-notes.tsx` and `/taste/notes` rows: "Training" badge beside
  "Blind"; an identity-less TRAINING note's archive row reads *Training room · not
  revealed* and links to `/taste/training`.
- `src/app/admin/archetypes/*` — §4.5 fields; `actions.ts` writes them (signature on
  the aroma rows, designations, FKs, age, nullable place).
- `scripts/training/gen-archetype-batch-migration.mjs` — JSON → data migration,
  fail-closed (§4.7 resolution rule); `data/training/archetypes-batch-1.json`;
  `scripts/training/validate-archetype-batch.mjs` (read-only DB check, used by the
  generator and runnable alone).
- Migrations: `20260925120000_training_room.sql` (schema, §4.1–4.3, §6.1–6.4, the
  15-row back-fill), `20260925130000_archetypes_batch_1.sql` (generated).
- `src/lib/supabase/database.types.ts` — the new columns/tables/RPC.
- DB suite: `scripts/training-room.test.mjs` (rolled back).
- CLAUDE.md — a "Training room" bullet.

## 8. Layout details
- Page skeleton as every pillar page: `<AppHeader title="Training room" />` then
  `<main>`; the content column is the scroll container; no nested scroller except
  the candidates sheet body below `lg`.
- Laptop: `grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6`; the column is `sticky
  top-[72px] self-start`.
- Below `lg`: the sheet's sticky bar + the 44 px strip in `belowBar`; the candidates
  sheet is the tour-sheet Dialog idiom (its PHONE classes as `max-lg:` variants);
  Escape and the backdrop close it; focus rules as the Popover rule (nothing steals
  focus on touch).
- Tokens only; light default, `.dark` follows; closeness bar in `--primary`, capped
  rows in `--muted-foreground`; the bar carries `role="meter"` with
  `aria-valuenow` and a visible percentage.
- Every tap target ≥ 44 px on touch (`min-h-11 md:pointer-fine:min-h-0`).
- All form values are React state (the room has no AutoRefresh, but the rule holds).

## 9. Copy (`src/lib/training/copy.ts`)
| key | text |
|---|---|
| nav label / pill | Training Room / Preview |
| eyebrow | Training room · Preview |
| title | Taste blind. Then find out. |
| promise | Pour a glass whose label you can't see. Describe it, watch the list tell you what it could be, then reveal the bottle. |
| coverage | {n} typical wines so far — {c1}, {c2}, {c3}, {c4} and more. More each week. (fewer than five countries: list them all, no "and more"; one country: "{n} typical wines so far — {c1}. More each week.") |
| coverage, empty pool | No typical wines yet — the room opens once the first batch lands. (Start hidden) |
| start / continue / discard | Start a session / Continue your session · started {time} / Discard / Tap again to discard |
| sheet title | Unknown wine · started {time} |
| footer action | Your call → |
| candidates heading | What it could be |
| before answers | Start describing the wine |
| strip | Top match: {shortName} {pct} % · {k} more close — k = other uncapped candidates within 10 points of the leader; k = 1 → "· 1 more close"; k = 0 → just the leader; leader has no number → "Start describing the wine"; every candidate capped → Nothing fits yet — check colour and bubbles |
| unlikely group | Unlikely from what you've said |
| explanation | {Scale} higher than typical / {Scale} lower than typical / Colour darker than typical / Colour lighter than typical / {Group} isn't typical / ✓ {term} — a signature / Fits what you've said so far |
| cap reasons | Looks like a {white\|rosé\|red\|orange} wine, not a {colour} / Bubbles noted / No bubbles noted / Fortified / Not fortified |
| show all | Show all {n} |
| your call | Your call / Which wine is it? / Something else… / It's not in the list / Vintage (optional) / Reveal the bottle / I can't find out |
| reveal sheet (note matrix, reveal) | eyebrow Reveal the bottle · title Which bottle was it? · row action This is it · footer/confirm primary This is it · enter hint ↵ reveals the first hit · by-hand primary This is it |
| result | It was {wine} / You said {shortName}{, vintage} / You didn't pick a wine / {n} of {m} / Your colour call ({hue}) didn't fit — it was a {colour} wine. / Where your note pointed / Its style was your #{rank} of {n} at {pct} % / You had ruled its style out ({cap reason}) / This style isn't in the pool yet / Not revealed — your note is kept. Reveal now from Your sessions. / Another glass / See the note / Done |
| result rows | Country · Region · Appellation · Grape · Second grape · Designation · Vintage; ✓ / ✗ / — |
| history | Your sessions / {n} of {m} right on the grape · {k} on the appellation / {date} · You said {pick} · It was {wine} · {n} of {m} / {date} · You didn't pick a wine · It was {wine} · {n} of {m} / {date} · You said {pick} · Not revealed · Reveal now / Show more / No sessions yet |
| lineage | {Appellation} · {Region}, {Country} · {grapes} — regional appellation: {Region}, {Country} · {grapes} |
| shortName | strips a leading "A typical " (case-insensitive); otherwise the name |
| badges | Training (beside Blind) / Training room · not revealed |
| unreadable / gone wine | a wine you can't see yet |

## 10. Tests
- `match.test.ts`: in-range 1.0; one/two/three steps; a scale the candidate lacks is
  skipped; an off-ladder range bound is skipped; weights applied; closeness null with
  nothing answered and with only scales the candidate lacks; aroma group agreement with
  the lexicon; a candidate without aromas skips the term; signature bonus, cap at two,
  never lowers, closeness capped at 100 (worked numbers); tri-state caps (null never
  caps; ORANGE candidate uncapped on GOLD; BROWN fits white and red); a capped
  candidate never outranks an uncapped numbered one; fortified skips alcohol both ways;
  explanation lines for every branch incl. the < 0.3 rule; order and tie-break;
  `snapshotRanking` shape. Fixtures: the 15 live archetypes copied from the seed
  migration, plus a synthetic white with no tannin and a synthetic Port.
- `copy.test.ts`: every §9 string incl. coverage for 0, 1, 4 and 6 countries, the strip
  states, `shortName`, `lineageLine` regional and specific.
- `history-math.test.ts`: tally with unscored rows; row copy for every state.
- `nav-links.test.ts`: `navChildState` for link / soon / preview.
- `note-state.test.ts`: `noteToPayload` keys equal the RPC's expected keys.
- DB suite `scripts/training-room.test.mjs` (rolled back, pattern
  `scripts/friend-requests.test.mjs`): the constraint admits an identity-less TRAINING
  note without a glass and still refuses OPEN without identity; the RPC as a member:
  fresh attempt scores a known pair correctly; regional pick vs village wine gets 3 not
  5; vintage YEAR/NV/TAWNY 2/1/0; secondary/designation null vs 0; possible_points; a
  null pick scores 0s; the same `session_key` twice returns the first attempt; a RUBY
  hue revealed as a WHITE wine saves with `colour_hue` null and `hue_cleared` true;
  re-reveal scores an unscored attempt, refuses another user's `attempt_id`, refuses an
  already-scored one, ignores a foreign `p_note.id`; refuses anon; `training_attempts`
  has no client write and author-only read; maxima equal `reveal_wine`'s; D17 tie-break
  (Gran Reserva bottle → Rioja Gran Reserva); the scrub removes attempts; the 15-row
  back-fill resolves and `primary_grape_id` is non-null everywhere.
- Browser (production build, phone 375×812 light+dark and laptop 1280): landing;
  a full session with a demo account (answers move the ranking; the strip and sheet;
  archetype detail; your call incl. "It's not in the list"; reveal by catalog search;
  result incl. the hue line; history row; Reveal now on an unrevealed attempt; Another
  glass; Continue after a reload); the nav pill in sidebar, drawer and start menu; a
  TRAINING badge in `/taste/notes`.

## 11. Rollout
1. `20260925120000_training_room.sql` dry-run then live (additive; no deployed code
   reads the new columns; the nullable `wine_place_id` is safe because every live
   row keeps its place). 2. App deploy (Preview pill live; 15 archetypes). 3. Batch 1
   JSON → generated migration → dry-run → live; the coverage line updates itself.
   4. Batch 2 later by the same route. Rollback: revert the app; migrations stay.

## 12. Residuals and later
- No Danish for room copy or archetypes (D20).
- No friend comparison / leaderboard (D16).
- A bottle revealed from the cellar is not drawn down (§3.4); "Take a bottle out" can
  come back as a later option.
- The lexicon (`wset_aroma_terms`) is insertable by any signed-in user and has
  drifted 143 → 144; the matcher keys on `group_name` so a new term in an existing
  group works, but a curator-only insert policy is a sensible hardening — not in this
  cut.
- The matcher as a hint inside real blind tastings is tempting and explicitly out.
- Derived long-tail candidates (option c) are out; the coverage line is the honest
  answer while the pool grows.
- Vintage has no knowledge source beyond `typical_age` and the note's development;
  the guess stays optional.
- Deleting a revealed training note deletes its session from history (cascade) —
  accepted for the preview.

## 13. Rejected
- A hidden one-person tasting: the engine forbids guessing your own bottle, OPEN
  reveals everything by construction, and the session would surface as a tasting.
- Server-side matching per change: no benefit at this pool size; the matcher is pure
  and can move later.
- Derived candidates from place styles + grape prose: structure would be guessed from
  the grape alone and narrow wrongly.
- Role- or flag-gated preview: hides it from the members whose feedback it needs.
- Recreating `merge_catalog_wines` for attempts: a read-side follow of `merged_into`
  is enough and touches no live function.
