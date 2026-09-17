# Cellar and catalog redesign — Implementation Plan

Bottles, one lot, drinking it, History, The collection, the catalog list and one wine · screens C1–C7b and W1–W2b

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task is prompt-ready: give one agent the **Global Constraints**, the **Plan refinements**, the **Working Rules** and **exactly one task**, together with the spec and hand-off paths below.

**Goal:**
- Build the owner's Claude Design hand-off *Cellar and catalog · complete redesign* (screens C1–C7b, W1–W2b) as the spec settles it: the cellar leads with what you own and what it tasted like; the catalog leads with what the community has produced; the single wine page is where they meet.
- Land every owner decision D1–D4 and every default D5–D14 exactly as the spec states them. Nothing about money is displayed to anyone (D4); a person's own purchase price shows on their own lot only.
- No migration (D14). Every new read is an RLS-legal read as the viewer; every new write is an owner-scoped server action over the tables and RPCs that exist today.

**Architecture:**
- **Pure modules first.** Seven pure modules (`types`, `format`, `cellar-rows`, `storage-merge`, `rating-spread`, `history-math`, `collection-math`) land test-first in `src/lib/cellar/` so every data and UI task builds against fixed contracts. Two more (`drink-copy`, `catalog-list-math`) and one pure function (`stripSummary`) land test-first inside the tasks that use them.
- **Data modules take the Supabase client as a parameter** (`src/lib/cellar/*.ts`, the `place.ts` pattern): no `next` import, no `server-only`, typed with `import type`. Pages call `await createClient()` and pass it. Server actions live in one `"use server"` file, `src/app/cellar/lot-actions.ts`.
- **One Bottles frame, two renders.** `src/app/cellar/cellar-bottles.tsx` is the client frame (dimension strip, toolbar, list or grid, grouping, merge notice, paging, footer) and the only place the lot sheet, the drink sheet, `NoteModal` and `NewNoteModal` mount for the cellar. `/cellar` and `/u/[id]/cellar` both render it; `readOnly` is a prop, not a second frame (D12).
- **Three sub-pages, no client tabs.** `/cellar`, `/cellar/history`, `/cellar/collection` are real routes sharing `CellarSubNav`; `?tab=` redirects (D5). `/cellar/[lotId]`, `/drink` and `/edit` redirect into `/cellar?lot=…` (D6); the frame opens the sheet from those params once.
- **Removals with grep gates.** Every price, value and readiness render the code map lists goes, and CC-V1's greps prove it.

**Tech Stack:**
- Next.js 16 App Router. AGENTS.md: read the relevant guide in `node_modules/next/dist/docs/` before writing a route handler, a server action, a `redirect()` in a server component or a dynamic route.
- React 19, TypeScript, Tailwind, shadcn/ui on `@base-ui/react` (`Dialog`, `DropdownMenu`, `Popover`, `Button`, `Badge`, `Card`, `Input`, `Label`, `Progress`).
- Supabase: Postgres, RLS. No Realtime, no Storage change, no migration.
- vitest (node environment, `src/**/*.test.ts`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-17-cellar-catalog-design.md`. Each task cites the sections it implements; read them.

**Inputs** (all binding):
- The spec above (authoritative; D1–D14 are settled).
- `.superpowers/cellar-catalog/codebase-map.md` (gitignored): file:line facts about today's code, the render sites to remove (§3), the RLS as it stands (§4).
- `.superpowers/cellar-catalog/handoff-screens.md` (gitignored): the verbatim copy per screen. Every quoted string in this plan comes from it unless the "Plan copy" table says otherwise.
- `.superpowers/cellar-catalog/decisions.md` (gitignored): the owner ledger D1–D4.
- `design_handoff_cellar_catalog/` (committed): README and the `.dc.html` screens, the visual source of truth.

**Base:** `master` at `7902b68` (2026-09-17, "docs(spec): cellar and catalog redesign"). Working tree clean. No migration is written or applied by this plan.

**Id conventions:** `CC-Pn` pure modules, `CC-Dn` data and server modules, `CC-Un` cellar UI, `CC-Cn` catalog, `CC-Xn` deletions, redirects and nav, `CC-Vn` verification.

---

## Global Constraints

Every task's requirements implicitly include this section.

### Precedence and invariants

- **Precedence:** owner decisions (D1–D4) → the spec's defaults (D5–D14) → this plan's refinements → the hand-off copy and screens → the code map → code on `master`.
- **Invariants you must never plan or build against:**
  - **D4, money.** No typical price, retail price, valuation, value tile, spend figure or "coming" placeholder anywhere, for anyone. The only money rendered by this plan is `Paid · {price} {currency} a bottle` on the owner's own lot sheet, only when `price_per_bottle` is set. `catalog_wines.estimated_price` is never selected by anything this plan touches; the add-wine sheet and the CellarTracker import keep writing `price_per_bottle` untouched (D11).
  - **Drink windows** render in the lot sheet only (`drink_from`/`drink_to`, editable there). No readiness chip, no window column, no readiness bars.
  - **Privacy.** `cellar_consumptions` has no read policy beyond the owner — History and the lot's own history are owner-only surfaces and never reach `/u/[id]/cellar`. `wine_pour_intents` is owner-only and never joined onto anything another user can read; the "in tonight's flight" count is computed for the owner alone and never rendered in `readOnly`. The read-only cellar shows community ratings but never the owner's own scores, actions, sheets, history or collection links (D12).
  - **D3.** "Your score" on a wine is the viewer's MOST RECENT note (`tasted_on desc, created_at desc`), never the highest — in the cellar rows, the lot sheet, the catalog list, the wine page and the collection maths alike.
  - **D10.** `catalog_wines.region_id` and `appellation_id` are NOT NULL: no "No region on the wine" group, no fallback bucket for region or appellation.
  - **Reference tables:** never read a whole `appellations` or `producers` table (PostgREST caps at 1000 rows). Every name comes joined on the rows the page already loads.
  - **Controlled inputs** on every form and filter (the cellar frame's state must survive `router.refresh()` after an action).
  - **Repo primitives and tokens only:** `Button`, `Badge`, `Card`, `Input`, `Label`, `Dialog`, `DropdownMenu`, `Popover`, `Progress`, `PageHeader`, `StatTile`, `CountryFlag`, `Eyebrow`, `DistributionBar`, `NoteModal`, `NewNoteModal`, `AddWineButton`, `ImageUploader`, `WineImage`. No raw hex in components (`--gold-dark` for small gold text on parchment, `text-gold-deep` for the gold star, `bg-primary` for bordeaux). Light and dark both render (the `.dark` block keeps bordeaux).
  - **Sizes:** 44 px minimum tap targets on phones (`min-h-11`, `md:pointer-fine:min-h-0` where a laptop row may be tighter); no text below 10 px.
  - **Dates:** `consumed_on`, `purchased_on` and `tasted_on` are `date` columns (no zone) and are formatted by the pure `format.ts` helpers from the string. `created_at` is only ever the fallback for a lot with no purchase date, at month granularity (refinement 5). `LocalDateTime` stays the formatter for every tasting timestamp elsewhere; nothing here changes it.
  - **Icons:** lucide only, from the set the hand-off names as already imported (`Wine, Star, Search, ChevronsUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ExternalLink, NotebookPen, Pencil, Plus, List, LayoutGrid, Boxes, MapPin, CalendarCheck`) plus `MoreHorizontal`, `X`, `Minus`, `Check`, `FileUp`, `Filter` which lucide ships. Port none of the mock's hand-drawn glyphs.

### Anthropic API

- **Zero calls.** No agent and no task in this plan calls the Anthropic API, and nothing here changes the label reader. Browser verification (CC-V3) keeps `LABEL_READ_FIXTURE` set in `.env.local`.

### Tests and pure modules

- vitest runs `src/**/*.test.ts` in node with **no `@/` alias**. A module a test loads imports other modules at runtime only by relative path; `import type … from "@/…"` is fine.
- **Pure modules** never import `server-only`, a Supabase client, React or a browser API at module top level: every file under `src/lib/cellar/` except `bottles.ts`, `lot-sheet.ts`, `history.ts`, `collection.ts` and `embed.ts` (the data modules, which still import nothing from `next` and take the client as a parameter), plus `src/app/cellar/drink-copy.ts` and `src/app/catalog/catalog-list-math.ts`.
- Tests are written first (Working Rule 4). Component files get no unit tests; CC-V3's browser checks cover them.

### CLAUDE.md rules that bind here

- **Base UI:** `Button render={<Link/>}` needs `nativeButton={false}`; a `Button` passed as another component's `render` keeps the default; `Select` needs an `items` map — this plan uses native `<select>` for Group, Sort, the filter fields and the History year (the pattern the tables use today).
- **Popovers** (the Filter control): `PopoverContent` keeps `keepMounted`; focus is set synchronously inside the opening tap if a text field is focused at all (the filter popover holds selects only, so no focus call is needed).
- **`AddWineButton kind="cellar"`** stays the only "Add a bottle" launcher; `useAddWine().openAddWine("cellar", { cellarWine })` is the only "Add to cellar" path (as `record/glass-actions.tsx` uses it).
- **Semi-blind branch rule** does not apply: nothing here renders scoring.

### Deploy and push

- The main session pushes straight to `master` (no PR; `gh` is not installed) through the integrate worktree (`.superpowers/queue.md` "Push cadence"), and only a tree where each of these passes with its real exit code captured (never `cmd | tail && next`):
  1. `npx tsc --noEmit`
  2. `npm run lint -- --max-warnings=0`
  3. `npm test`
  4. `node --test scripts/wine-map-tiles/lib.test.mjs`
  5. `npm run build`
- Push each green wave. No push contains CC-X2 (the redirect routes) before CC-U3 (the frame that honours `?lot=`), so a deployed deep link never lands on a page that ignores it.
- The pre-existing `package-lock.json` diff is never committed and the working-tree file is never rewritten.

### Never build

- A racks/bins/shelves schema, a "places" table, or any structure on `storage_location` beyond grouping and the merge (D1).
- A "your highest score" anywhere (D3).
- "What it is worth — Coming", "Prices are still stored…", "Average retail price", its caveat, a value tile, a spend tile, a spend-by-year chart, a mixed-currency note (D4, spec §8).
- A "No region on the wine" group or "Fill them in" (D10).
- Any change under `src/components/add-wine/**` (D11).
- A migration, a view change, an RPC (D7, D14).
- Bulk selection, the import screens, an empty-cellar redesign beyond the existing empty state (spec §10).

---

## Plan refinements of the spec (binding; they keep the spec's names, copy and data rules)

1. **`cellar-bottles-table.tsx` is deleted, not edited.** The spec's §7 lists its value and readiness renders as removal sites; this plan replaces the whole file with `cellar-bottles.tsx` (the frame) + `bottle-list.tsx` + `bottle-grid.tsx` + `row-actions.tsx`, and moves `BottleRow` to `src/lib/cellar/types.ts` as the spec's §4 shape. The persisted view key `cellar-view` and its `readValue`/`writeValue` use carry over unchanged.
2. **The pure module set is split so it parallelises:** `types.ts` (every shared contract) and `format.ts` (titles, sizes, dates, score strings) land first (CC-P0); `cellar-rows`, `storage-merge`, `rating-spread`, `history-math`, `collection-math` follow in one wave.
3. **`mergeStorageLocations(from: readonly string[], to: string)`** — the spec's `(from, to)` with `from` a list of the exact stored spellings, so one "Merge them" tap merges every variant of a place at once.
4. **`deleteLot(lotId)` is kept** (the old `edit-lot-form.tsx` had "Delete lot"): it is the "destructive action" spec §5.5 puts in the phone ⋯ menu, and on laptops it sits at the foot of the Edit lot view — both behind the console's inline two-tap (`twoTapState`, `TWO_TAP_WINDOW_MS` from `src/lib/console-copy.ts`), never `window.confirm`.
5. **"added {Mon yyyy}" = `purchased_on ?? created_at`** at month granularity, formatted from the string by `format.ts` (a fixed month-name table, `YYYY-MM-DD` parsed from the front of the string, UTC getters for a full timestamp). No `LocalDateTime`: a `date` column has no zone, and the `created_at` fallback at month granularity can only differ within hours of a month boundary.
6. **The stepper is 44 px tall**, the repo's tap floor (the spec's 42 px rounded up; visually the same control).
7. **Grid "Show the rest" reveals every remaining card once**; the list keeps prev/next with "Page x of y". 25 rows a page, 24 cards a page.
8. **A grouped render does not page its rows**: the eight-group cap and "Show {n} more {dimension}" are the limiter; every row of a shown group renders.
9. **"No place set" is pinned last** among the where-groups (the mock draws it last).
10. **`byDecade` is ordered newest decade first with "No vintage" last** (the mock's order: 2020s, 2010s, 2000s, 1990s, No vintage), not by value; every other panel is by value.
11. **Collection panels render the existing `DistributionBar` over the top three plus "Other"** (`foldOther(items, 3)` from `src/lib/stats-math.ts` — the primitive's four-series limit; it must never cycle), then the ranked top-8 rows as "{label} · {value}".
12. **`NewNoteModal` gains `consumptionId?: string | null`**, forwarded to `NoteEditor`'s existing `consumptionId` prop. The one shared-file change outside the cellar and catalog trees (CC-U5 owns it).
13. **`?do=drink` opens the lot sheet with the drink sheet over it; `?do=edit` opens the lot sheet in edit mode.** `?lot` and `?do` are consumed once (the `SheetFromQuery` pattern: a `handled` ref keyed on their values, then `router.replace` without `do`); `?lot=` is kept in sync with `history.replaceState` while the sheet is open and removed on close.
14. **The "Write a note about it after" checkbox shows only while the reason is Drank** (the old form's rule; the mock draws Drank selected). D2's checked default holds.
15. **The catalog list keeps its 500-row load and its default sort (newest added)**, and additionally loads the viewer's owned and tasted wines by id so "In my cellar {o}" and "I have tasted {t}" filter to exactly the band's numbers.
16. **`estimated_price` leaves `fetchCatalogWine`'s select and `CellarWine.estimatedPrice` is removed** (D4 "unread"); `CatalogWineInput.estimatedPrice` stays optional in `catalog/new/actions.ts` (D13) and the form simply stops sending it.
17. **Empty-state copy is changed only where it named value** (the Bottles empty state's second line; the collection's empty state replaces the Stats panel's). The rest is kept verbatim (spec §10).
18. **`scripts/cellar-stats.test.mjs` is deleted with `stats.ts`** (it imports `computeCellarStats`; CI never ran it).
19. **History reads at most 1000 consumptions** (PostgREST's page) and the community spread at most 1000 scored notes for one wine; both are stated caps, not paging.
20. **In `readOnly` every "you have tasted" part drops** from the subtitle, the group headers and the footer, and the Yours column, the actions, the in-flight marker, the merge notice, the sub-nav and the `?lot=` handling are absent.
21. **`getLotSheet` is owner-only:** it returns null unless `cellar_lots.owner_id` is the viewer, even where `can_view_cellar` would let the row be read.
22. **History "at home" = DRANK with no tasting link; LOST and OTHER rows** count in the year's bottles and in written-up / not, but in none of the three split figures.
23. **The sub-page headings:** each cellar page keeps `PageHeader` for its name ("Cellar", "History", "The collection") and puts the hand-off's sentence pair under the sub-nav as a heading block — laptop shows both lines, the phone the second only.

### Plan copy (strings the hand-off does not supply)

| String | Where | Why |
|---|---|---|
| "Add the wines you own to see what you have and how it has been rated." | the Bottles empty state (CC-U3) | the shipped line named "value" (D4) |
| "Nothing to count yet." / "Add wines to your cellar to see where it comes from and how it has been rated." | the collection's empty state (CC-U7) | the Stats panel's named "value, drink windows" |
| "Nothing has left this lot yet." | lot sheet, "This lot so far" with no rows (CC-U4) | the mock draws three rows |
| "No window yet" | lot sheet, drink window unset (CC-U4) | the mock draws a set window |
| "How many to add" / "Add" | lot sheet, Add bottles (CC-U4) | the mock shows only the footer button |
| "Save changes" / "Cancel" / "Delete lot" / "Tap again to delete" | lot sheet, Edit lot (CC-U4) | the old form's labels plus the two-tap armed state |
| "Gift one bottle" / "Write off one bottle" / "Take out one bottle" (and the "{n} bottles" forms) | drink sheet confirm for Gifted / Lost / Other (CC-U5) | the spec says "the reason word"; the mock draws Drank only |
| "at home" · "gifted" · "lost" · "taken out" | History where-line when the occasion is empty (CC-P4) | the mock always has an occasion |
| "Lost {n}" / "Removed {n}" | History action word for LOST / OTHER (CC-P4) | the mock draws Drank and Gifted only |
| "1 filter" / "{n} filters" · "grouped by {dimension}" | Bottles footer when filtered or grouped (CC-P1) | the mock draws the unfiltered line only |
| "{n} places look like {m}." | merge notice with more than one pair (CC-P2) | the mock draws "Two places look like one." |
| "Clear all" | the chip row (CC-U1) | one tap to clear every chip |
| "Nothing to show" | Bottles when a search or filter matches no row (CC-U3) | the mock has no empty result |
| "sorted by name" · "sorted by newest added" · "sorted by oldest added" · "sorted by community rating" · "sorted by notes" · "sorted by blind tastings" · "sorted by bottles in cellars" · "sorted by region" · "sorted by country" · "sorted by vintage" | catalog page line (CC-C1) | the mock draws "sorted by community rating" only |
| "{n} bottles · {w} wines" | read-only cellar subtitle (CC-U8) | the owner's line says "you have tasted" |
| "Loading…" / "Couldn't load this lot right now." | lot sheet loading and failure (CC-U4) | as `NoteModal` |

Every string above is marked `(plan copy)` in a code comment next to it.

---

## Working Rules

1. **Ownership.** You may create, edit or delete only the files in your task's **OWNS** list. You may read anything. If the task needs a change in a file you do not own, stop and report the exact change to the orchestrator. Never make it yourself.

2. **No git writes by agents.**
   - Agents never change the index or history: no `git add`, `commit`, `stash`, `checkout -- …`, `reset`, `fetch` or `pull`.
   - The main session reviews each finished task and commits exactly its OWNS paths on `master`: `git add -- <paths> && git commit -m "feat(cellar-catalog): CC-XX — <title>"`, ending the message with the session's attribution line.
   - Files under `.superpowers/` are gitignored and never committed.

3. **Other lanes.** Nothing else is in flight on these files. A task whose OWNS names a file outside `src/app/cellar/**`, `src/lib/cellar/**`, `src/app/catalog/**`, `src/app/u/[id]/cellar/**` (`database.types.ts`, `nav-links.ts`, `new-note-modal.tsx`, `wset/queries.ts`, `scripts/cellar-stats.test.mjs`) touches only what its Does says. Never resume a parallel workflow with `resumeFromRunId`; relaunch a fresh script from git state.

4. **Tests first.** For every file in a task's **Tests** block:
   1. Write the tests.
   2. Run `npx vitest run <file>` and watch it fail for the stated reason.
   3. Implement.
   4. Run it again and watch it pass.

5. **tsc.** A bare `npx tsc --noEmit` must print nothing after your task. Parallel agents share one tree: an error in a file another running task owns is that task's. Note it and move on.

6. **Deletion rule.** Delete an export only when `rg -n "\b<name>\b" src scripts` shows no importer outside your OWNS. Otherwise keep it, marked `/** @deprecated removed in CC-XX */`; the named task deletes it (see "Scheduled deprecations").

7. **Before reporting done,** run:
   - the task's `npx vitest run …`, or `npm test` if you touched a module other tests import;
   - `npx tsc --noEmit` (must print nothing);
   - `npx eslint <your OWNS source files> --max-warnings=0`;
   - the task's Acceptance commands.

8. **Report:**
   - files changed (a subset of OWNS);
   - tests added and their pass output;
   - tsc and eslint output;
   - every stop-and-report item;
   - every plan-copy string used;
   - the spec sections and screen ids closed.

9. **Paths with brackets:** quote them in shell commands, for example `"src/app/u/[id]/cellar/page.tsx"`.

10. **Dev and browser gotchas** (CLAUDE.md):
    - A stale Turbopack 404 renders unstyled: stop the server, `rm -rf .next`, start again.
    - The browser tool sends "Enter", not "Return".
    - Mint demo sessions with `.superpowers/demo-session.mjs`; never type a password. Switching users re-mints (one cookie jar).
    - A hidden Browser pane never hydrates; keep it visible for interactive checks.
    - A folder starting with `_` under `src/app` gets no route.

## Task Fields

| Field | What it holds |
|---|---|
| **Depends on** | The tasks that must be committed first. |
| **OWNS** | The exhaustive list of files the task may create, modify or delete. |
| **Does** | Concrete bullets, with spec references. |
| **Interfaces** | Consumes: names from earlier tasks. Produces: names later tasks rely on, with signatures. |
| **Tests** | vitest code written first for pure modules and helpers with logic. |
| **Steps** | The ordered checklist. |
| **Acceptance** | Commands and results that prove it is done. |
| **Closes** | Spec sections and hand-off screen ids. |

## Task Index

| ID | Title | Depends on |
|---|---|---|
| **Pure modules** | | |
| CC-P0 | Shared types and formatting | — |
| CC-P1 | Cellar rows: dimensions, header stats, search, sort, filter, grouping, paging, footer | CC-P0 |
| CC-P2 | Storage-place merge | CC-P0 |
| CC-P3 | Rating spread | CC-P0 |
| CC-P4 | History maths | CC-P0 |
| CC-P5 | Collection maths | CC-P0 |
| **Types, deletions, redirects, nav** | | |
| CC-X1 | `catalog_wines.merged_into` in the hand-written types (D14) | — |
| CC-X2 | The `/cellar/[lotId]` redirect routes and the old forms' deletion (D6) | CC-U3 |
| CC-X3 | Nav children and the retired cellar files | CC-U3, CC-U6, CC-U7, CC-U8 |
| **Data and server** | | |
| CC-D1 | The lot embed and `getCellarBottles` | CC-P0 |
| CC-D3 | `getCellarHistory` and the tasting link (D8) | CC-P0 |
| CC-D5 | `getOwnLotsForWine` and the strip summary | CC-P0 |
| CC-D2 | `getLotSheet` and the lot server actions | CC-D1, CC-D3, CC-P3 |
| CC-D4 | `getCollectionStats` | CC-D1, CC-P5 |
| **Cellar UI** | | |
| CC-U1 | Sub-nav, dimension strip, toolbar | CC-P1 |
| CC-U2 | List rows, grid cards, row actions | CC-P0, CC-P1 |
| CC-U4 | The lot sheet | CC-D2, CC-P3 |
| CC-U5 | The drink sheet and `NewNoteModal.consumptionId` | CC-D2 |
| CC-U3 | The Bottles frame and `/cellar` | CC-U1, CC-U2, CC-U4, CC-U5, CC-D1, CC-P2 |
| CC-U6 | History | CC-D3, CC-P4, CC-U1, CC-U5 |
| CC-U7 | The collection | CC-D4, CC-P5, CC-U1 |
| CC-U8 | The read-only cellar (D12) | CC-U3 |
| **Catalog** | | |
| CC-C3 | D13: the retail-price editor and the form field go | — |
| CC-C1 | The catalog list (W1, W1b) | CC-P0 |
| CC-C2 | One wine (W2, W2b) with the cellar strip | CC-D5, CC-U5, CC-C3 |
| **Verification** | | |
| CC-V1 | Integration gate | every task above |
| CC-V2 | Adversarial review | CC-V1 |
| CC-V3 | Browser verification with a seeded cellar (main session) | CC-V2 |

---

## File structure

One responsibility per file. "→ CC-xx" is the owning task.

**Created**
- `src/lib/cellar/types.ts` — every shared contract: `BottleRow`, `BottleLot`, `BottleWine`, `CommunityRating`, `YourScore`, `GroupKey`, `Dimension`, `SortKey`, `FilterState`, `CellarView`, `HistoryRow`, `HistoryFilter`, `LotConsumption`, `LotSheetData`, `RatingSpread`, `Bar`, `CollectionStats` → CC-P0
- `src/lib/cellar/format.ts`, `format.test.ts` — titles (`bottleTitle`, `lotTitle`, `vintageLabel`), sizes, counts, in-flight line, colour words, date strings, score strings, `plural` → CC-P0
- `src/lib/cellar/cellar-rows.ts`, `cellar-rows.test.ts` — dimension counts, header stats and subtitle, search, filters and chips, sort, grouping with header lines and the cap, per-group row lines, paging, footer → CC-P1
- `src/lib/cellar/storage-merge.ts`, `storage-merge.test.ts` — place folding, near-duplicate groups, the merge notice copy → CC-P2
- `src/lib/cellar/rating-spread.ts`, `rating-spread.test.ts` — community spread from notes and friend ids, its lines → CC-P3
- `src/lib/cellar/history-math.ts`, `history-math.test.ts` — years, year totals and band, filters and labels, month buckets, row lines, "Show the rest" → CC-P4
- `src/lib/cellar/collection-math.ts`, `collection-math.test.ts` — the collection's numbers and panels → CC-P5
- `src/lib/cellar/embed.ts` — the `cellar_lots` + `catalog_wines` select string, its row type, `relName`, `bottleRowFrom` → CC-D1
- `src/lib/cellar/bottles.ts` — `getCellarBottles` → CC-D1
- `src/lib/cellar/history.ts` — `getCellarHistory`, `tastingLinksFor` (D8) → CC-D3
- `src/lib/cellar/own-lots.ts`, `own-lots.test.ts` — `getOwnLotsForWine`, `stripSummary` → CC-D5
- `src/lib/cellar/lot-sheet.ts` — `getLotSheet` → CC-D2
- `src/app/cellar/lot-actions.ts` — `"use server"`: `loadLotSheet`, `updateLot`, `addBottles`, `deleteLot`, `mergeStorageLocations`, `getLiveTastingName` → CC-D2
- `src/lib/cellar/collection.ts` — `getCollectionStats` → CC-D4
- `src/app/cellar/cellar-sub-nav.tsx` — Bottles · History · The collection → CC-U1
- `src/app/cellar/dimension-strip.tsx` — the five tiles and their caption → CC-U1
- `src/app/cellar/cellar-toolbar.tsx` — search, Group, Sort, Filter (popover + chips), view switch → CC-U1
- `src/app/cellar/bottle-list.tsx` — the list render (laptop table, phone rows, group headers) → CC-U2
- `src/app/cellar/bottle-grid.tsx` — the card render → CC-U2
- `src/app/cellar/row-actions.tsx` — Drink · Rate · ⋯ on hover → CC-U2
- `src/app/cellar/lot-sheet.tsx` — the lot sheet (view mode, Add bottles, footer, phone menu) → CC-U4
- `src/app/cellar/lot-edit-form.tsx` — the Edit lot fields, Save, Cancel, Delete lot → CC-U4
- `src/app/cellar/drink-sheet.tsx` — "Take it out of the cellar" → CC-U5
- `src/app/cellar/drink-copy.ts`, `drink-copy.test.ts` — the drink sheet's strings and date helpers → CC-U5
- `src/app/cellar/cellar-bottles.tsx` — the Bottles frame: state, derivations, merge notice, paging, footer, the sheets and modals, `?lot=` → CC-U3
- `src/app/cellar/history/page.tsx`, `src/app/cellar/history/history-view.tsx` → CC-U6
- `src/app/cellar/collection/page.tsx`, `src/app/cellar/collection/collection-view.tsx` → CC-U7
- `src/app/cellar/[lotId]/page.tsx` — redirect to `/cellar?lot=` → CC-X2
- `src/app/catalog/catalog-list-math.ts`, `catalog-list-math.test.ts` — `CatalogRow`, filters, sort, band and page lines → CC-C1
- `src/app/catalog/[wineId]/cellar-strip.tsx` — the gold strip with Drink one / Open the lot → CC-C2
- `src/app/catalog/[wineId]/your-notes.tsx` — the viewer's notes, each opening `NoteModal` → CC-C2
- `.superpowers/cellar-catalog/seed-cellar.mjs` (gitignored) — `--create | --delete` → CC-V3

**Modified**
- `src/lib/supabase/database.types.ts` — `catalog_wines.merged_into` → CC-X1
- `src/app/cellar/page.tsx` — Bottles: `?tab=` redirects, data, header, sub-nav, the frame → CC-U3
- `src/app/cellar/[lotId]/drink/page.tsx`, `src/app/cellar/[lotId]/edit/page.tsx` — redirects → CC-X2
- `src/app/u/[id]/cellar/page.tsx` — the read-only frame → CC-U8
- `src/components/nav-links.ts` — Cellar's children → CC-X3
- `src/components/new-note-modal.tsx` — `consumptionId` → CC-U5
- `src/app/catalog/page.tsx`, `src/app/catalog/catalog-list.tsx` — W1 → CC-C1
- `src/app/catalog/[wineId]/page.tsx` — W2 order, the strip, no retail price → CC-C2
- `src/lib/wset/queries.ts` — `estimated_price` out of `fetchCatalogWine` → CC-C2
- `src/app/catalog/new/new-wine-form.tsx`, `src/app/catalog/[wineId]/edit-wine-modal.tsx` — no `estimatedPrice` field → CC-C3

**Deleted**
- `src/app/cellar/[lotId]/drink/drink-form.tsx`, `src/app/cellar/[lotId]/edit/edit-lot-form.tsx`, `src/app/cellar/[lotId]/edit/wine-price-field.tsx`, `src/app/cellar/[lotId]/edit/wine-price-actions.ts` → CC-X2 (`[lotId]/drink/actions.ts` and its `consumeLot` stay)
- `src/app/cellar/cellar-tabs.tsx`, `src/app/cellar/history-list.tsx`, `src/app/cellar/stats-panel.tsx`, `src/app/cellar/stats.ts`, `src/app/cellar/cellar-summary.tsx`, `src/app/cellar/cellar-bottles-table.tsx`, `scripts/cellar-stats.test.mjs` → CC-X3

**Unchanged on purpose:** `src/app/cellar/new/**`, `src/app/cellar/import/**`, `src/app/cellar/cellar-visibility-control.tsx`, `src/app/cellar/[lotId]/drink/actions.ts`, `src/components/add-wine/**`, `src/app/catalog/new/actions.ts`, `src/app/catalog/[wineId]/wine-admin-controls.tsx`, `wine-image.tsx`, `wine-structure.tsx`, `notes/**`.

---

## Parallelism and Sequencing

### Waves

A task starts as soon as everything in its "Depends on" is committed. Tasks in one wave own disjoint files.

| Wave | Starts when | Tasks that may run at the same time |
|---|---|---|
| 0 | now | CC-P0 · CC-X1 · CC-C3 |
| 1 | CC-P0 | CC-P1 · CC-P2 · CC-P3 · CC-P4 · CC-P5 · CC-D1 · CC-D3 · CC-D5 · CC-C1 |
| 2 | CC-D1, CC-D3, CC-P3, CC-P5 | CC-D2 · CC-D4 |
| 3 | CC-P1, CC-D2 | CC-U1 · CC-U2 · CC-U4 · CC-U5 |
| 4 | CC-U1, CC-U2, CC-U4, CC-U5, CC-P2, CC-D4, CC-D5 | CC-U3 · CC-U6 · CC-U7 · CC-C2 |
| 5 | CC-U3 | CC-U8 · CC-X2 |
| 6 | CC-U8, CC-U6, CC-U7 | CC-X3 |
| 7 | every task above | CC-V1 → CC-V2 → CC-V3 |

### Two tasks may run together only when all three hold

1. Neither depends on the other, directly or transitively.
2. They are not both in one chain (P0 → P1 → U1/U2 → U3 → U8/X2 → X3; D1 → D2 → U4/U5 → U3).
3. Their OWNS lists are disjoint.

### Files more than one task edits (always sequential, in this order)

| File | Editors, in order | Why it is shared |
|---|---|---|
| `src/app/cellar/page.tsx` | CC-U3 only | rewritten once |
| `src/app/u/[id]/cellar/page.tsx` | CC-U8 only | rewritten once |
| `src/components/new-note-modal.tsx` | CC-U5 only | `consumptionId` |
| `src/lib/wset/queries.ts` | CC-C2 only | `estimated_price` out |
| `src/lib/supabase/database.types.ts` | CC-X1 only | `merged_into` |

No file has two editors; every shared name crosses tasks as an import contract below.

### Contract dependencies (no shared file, but an import or prop contract)

| Consumer | Provider | Contract |
|---|---|---|
| CC-P1…P5, CC-D1…D5, CC-U*, CC-C1, CC-C2 | CC-P0 | the types in `src/lib/cellar/types.ts`; `bottleTitle`, `lotTitle`, `vintageLabel`, `sizeLabel`, `sizeSub`, `countTimes`, `drunkLine`, `inFlightLine`, `colourWord`, `monthYear`, `dayMonthYear`, `dayMonth`, `monthLabel`, `addedMonth`, `fmtAvg`, `fmtScore`, `plural` in `format.ts` |
| CC-D2, CC-D4, CC-U3, CC-U8 | CC-D1 | `LOT_SELECT`, `LotEmbedRow`, `relName`, `bottleRowFrom` (`embed.ts`); `getCellarBottles` (`bottles.ts`) |
| CC-D2 | CC-D3 | `tastingLinksFor(supabase, ownerId, consumptionIds)` |
| CC-U4, CC-U5, CC-U3 | CC-D2 | `loadLotSheet`, `updateLot`, `addBottles`, `deleteLot`, `mergeStorageLocations`, `getLiveTastingName`, `LotFields` |
| CC-U3 | CC-U1 | `CellarSubNav`, `DimensionStrip`, `CellarToolbar` and their props |
| CC-U3 | CC-U2 | `BottleList`, `BottleGrid`, `RowActions` and their props |
| CC-U3, CC-C2 | CC-U4 / CC-U5 | `LotSheet` / `DrinkSheet` props; `DrinkLot` |
| CC-U6, CC-U3 | CC-U5 | `NewNoteModal` with `consumptionId` |
| CC-U6, CC-U7 | CC-U1 | `CellarSubNav` |
| CC-U3 | CC-P2 | `mergeGroups`, `mergeNotice` |
| CC-U4 | CC-P3 | `spreadLine`, `friendsLine`, `notesLine` |
| CC-C2 | CC-D5 | `getOwnLotsForWine`, `stripSummary`, `OwnLot` |
| CC-X2 | CC-U3 | the frame honours `?lot=` and `?do=` |
| CC-X3 | CC-U3, CC-U8 | neither page imports the retired files any more |
| CC-V3 | CC-U3, CC-U6, CC-U7, CC-C1, CC-C2 | the screens to check |

### Scheduled deprecations

| Export or file | Marked by | Deleted by |
|---|---|---|
| `src/app/cellar/cellar-bottles-table.tsx` (`CellarBottlesTable`, its `BottleRow`) | CC-U3 (stops importing it) | CC-X3 |
| `src/app/cellar/cellar-summary.tsx` (`CellarSummary`) | CC-U3, CC-U8 (stop importing it) | CC-X3 |
| `src/app/cellar/cellar-tabs.tsx`, `history-list.tsx`, `stats-panel.tsx`, `stats.ts` | CC-U3 (stops importing them) | CC-X3 |
| `src/app/cellar/[lotId]/drink/drink-form.tsx`, `edit/edit-lot-form.tsx`, `edit/wine-price-field.tsx`, `edit/wine-price-actions.ts` | — | CC-X2 (their only importers are the pages CC-X2 rewrites) |
| `CellarWine.estimatedPrice` (`src/lib/wset/queries.ts`) | — | CC-C2 (its only reader is the wine page CC-C2 rewrites) |
| `scripts/cellar-stats.test.mjs` | — | CC-X3 |

---

## Track CC-P — Pure modules (waves 0–1, parallel)

New files only. Relative runtime imports, `import type` for anything under `@/`, no `server-only`, no React, no Supabase client. Every module exports exactly the names its test imports, plus the extra constants listed under Interfaces.

---

### CC-P0 — Shared types and formatting

**Depends on:** —

**OWNS**
- create `src/lib/cellar/types.ts`
- create `src/lib/cellar/format.ts`, `src/lib/cellar/format.test.ts`

**Does** (spec §4 "bottles.ts → BottleRow", §5.2 column strings, §5.5 facts, §5.7 dates)
- `types.ts`: every contract the later tasks share. No runtime code beyond one `export const COLOUR_ORDER`, so any task can `import type` it and vitest never has to load anything else.
- `format.ts`: the display strings that every surface repeats — the row title and the lot title (refinement 1's `BottleRow` carries the raw parts, not a prebuilt title, so the catalog list can build the same "producer above the name" pair), bottle sizes, the count and drunk lines, the in-flight marker, colour words, dates from `date` strings (a fixed month table; never `toLocaleDateString`, whose short months differ by ICU version — "Sept" vs "Sep"), score strings, and `plural`.

**Interfaces — produces**
```ts
// src/lib/cellar/types.ts
export type WineColour = "WHITE" | "ROSE" | "RED" | "ORANGE";
export type WineStyle = "STILL" | "SPARKLING" | "FORTIFIED" | "SWEET";
export type VintageKind = "YEAR" | "NV" | "TAWNY";
export type ConsumptionReason = "DRANK" | "GIFTED" | "LOST" | "OTHER";
export const COLOUR_ORDER: readonly WineColour[] = ["RED", "WHITE", "ROSE", "ORANGE"];

export type BottleWine = {
  catalogWineId: string;
  /** catalogWineTitle — the search haystack and the note modals' title. */
  title: string;
  producer: string | null;
  wineName: string | null;
  vintageKind: VintageKind;
  vintageYear: number | null;
  vintageTawnyYears: number | null;
  primaryGrape: string | null;
  colour: WineColour | null;
  style: WineStyle | null;
  /** type_designations.name — "Riserva", "Grosses Gewächs". */
  designation: string | null;
  appellation: string | null;
  region: string | null;
  country: string | null;
  imageUrl: string | null;
};
export type BottleLot = {
  id: string;
  quantity: number;
  purchasedQuantity: number;
  bottleSizeMl: number;
  storageLocation: string | null;
  /** date (YYYY-MM-DD) or null */
  purchasedOn: string | null;
  purchaseSource: string | null;
  pricePerBottle: number | null;
  currency: string;
  drinkFrom: number | null;
  drinkTo: number | null;
  lotNote: string | null;
  /** timestamptz ISO */
  createdAt: string;
};
export type CommunityRating = { avg: number | null; count: number };
/** D3: the viewer's most recent scored note on the wine. */
export type YourScore = { noteId: string; score: number; tastedOn: string };
export type BottleRow = {
  lot: BottleLot;
  wine: BottleWine;
  community: CommunityRating;
  yours: YourScore | null;
  /** D9: this lot's bottles committed to a flight and not yet poured. */
  inFlight: number;
};

export type GroupKey = "none" | "where" | "country" | "region" | "appellation" | "producer" | "grape" | "vintage" | "colour";
export type Dimension = "countries" | "regions" | "producers" | "grapes" | "vintages";
export type SortKey = "bottles" | "name" | "added" | "yours" | "community";
export type FilterState = {
  country: string | null;
  region: string | null;
  colour: WineColour | null;
  grape: string | null;
  /** the vintage label ("2016", "NV") — a phone-only filter (spec §5.1) */
  vintage: string | null;
};
export type CellarView = "list" | "grid";

export type HistoryRow = {
  id: string;
  lotId: string | null;
  catalogWineId: string;
  /** lotTitle: "{producer}, {wine} {vintage}" */
  title: string;
  reason: ConsumptionReason;
  quantity: number;
  /** date */
  consumedOn: string;
  createdAt: string;
  occasion: string | null;
  note: { id: string; score: number | null } | null;
  /** D8: from wine_pour_intents.cellar_consumption_id → wines.tasting_id */
  tasting: { id: string; name: string } | null;
};
export type HistoryFilter = "all" | "drank" | "gifted" | "tasting" | "noNote";

export type LotConsumption = Pick<HistoryRow, "id" | "consumedOn" | "reason" | "quantity" | "occasion" | "note" | "tasting">;
export type RatingSpread = { avg: number | null; count: number; highest: number | null; lowest: number | null; byFriends: number };
export type LotSheetData = {
  row: BottleRow;
  yours: { noteId: string; score: number; band: string; tastedOn: string; assessed: { done: number; total: number } } | null;
  community: RatingSpread;
  history: LotConsumption[];
};

export type Bar = { label: string; value: number };
export type CollectionStats = {
  bottles: number;
  wines: number;
  tasted: number;
  toGo: number;
  yourAverage: number | null;
  communityAverage: number | null;
  best: { score: number; title: string } | null;
  countries: number;
  regions: number;
  producers: number;
  grapes: number;
  years: number;
  byRegion: Bar[];
  byProducer: Bar[];
  byGrape: Bar[];
  byColour: Bar[];
  byDecade: Bar[];
};

// src/lib/cellar/format.ts
export function vintageLabel(w: Pick<BottleWine, "vintageKind" | "vintageYear" | "vintageTawnyYears">): string; // "2016" | "" | "NV" | "20yo" | "Tawny"
export function bottleTitle(w: BottleWine, opts?: { dropVintage?: boolean }): string; // "Barolo Castiglione 2017"
export function lotTitle(w: BottleWine): string;   // "Vietti, Barolo Castiglione 2017"
export function sizeLabel(ml: number): string;     // "750 ml" | "1.5 L magnum" | "375 ml half" | "3 L double magnum" | "2 L" | "500 ml"
export function sizeSub(ml: number): string | null; // "standard" for 750, else null
export function countTimes(quantity: number): string; // "6 ×"
export function drunkLine(lot: Pick<BottleLot, "quantity" | "purchasedQuantity">): string | null; // "3 of 6 drunk"
export function isLastOne(quantity: number): boolean;
export function inFlightLine(n: number, opts?: { phone?: boolean }): string | null; // "1 bottle in tonight’s flight" / "1 in tonight’s flight"
export function colourWord(c: WineColour | null): string | null; // "Red" | "White" | "Rosé" | "Orange"
export function monthYear(dateOrIso: string): string;   // "Nov 2023"
export function dayMonthYear(date: string): string;     // "2 Aug 2026"
export function dayMonth(date: string): string;         // "11 Sep"
export function monthLabel(date: string): string;       // "September 2026"
export function addedMonth(lot: Pick<BottleLot, "purchasedOn" | "createdAt">): string; // monthYear(purchasedOn ?? createdAt)
export function fmtAvg(n: number | null): string;       // "93.4" | "—"
export function fmtScore(n: number | null): string;     // "92" | "—"
export function plural(n: number, one: string, many: string): string; // "1 bottle" / "6 bottles"
export const MONTHS_SHORT: readonly string[];  // Jan … Dec
export const MONTHS_LONG: readonly string[];   // January … December
```
Rules: `bottleTitle` = `{base} {vintage}` with `base = wineName ?? appellation ?? producer ?? "Untitled wine"`, trimmed, and exactly `"Untitled wine"` (no vintage) when every part is null; `lotTitle` = `"{producer}, {bottleTitle}"` unless the producer is null or is itself the base. Dates: parse `^(\d{4})-(\d{2})-(\d{2})` from the front of the string; when the string carries a time part (`T`), use `new Date(s)` UTC getters instead. `fmtAvg` rounds half up to one decimal; `fmtScore` to an integer.

**Tests (write first)** — `src/lib/cellar/format.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  addedMonth, bottleTitle, colourWord, countTimes, dayMonth, dayMonthYear, drunkLine, fmtAvg, fmtScore,
  inFlightLine, isLastOne, lotTitle, monthLabel, monthYear, plural, sizeLabel, sizeSub, vintageLabel,
} from "./format";
import type { BottleWine } from "./types";

const wine = (over: Partial<BottleWine> = {}): BottleWine => ({
  catalogWineId: "w1", title: "Vietti Barolo Castiglione Barolo DOCG 2017", producer: "Vietti",
  wineName: "Barolo Castiglione", vintageKind: "YEAR", vintageYear: 2017, vintageTawnyYears: null,
  primaryGrape: "Nebbiolo", colour: "RED", style: "STILL", designation: null, appellation: "Barolo DOCG",
  region: "Piedmont", country: "Italy", imageUrl: null, ...over,
});

describe("titles", () => {
  it("the row title is the name and its vintage; the producer leads the lot title", () => {
    expect(bottleTitle(wine())).toBe("Barolo Castiglione 2017");
    expect(lotTitle(wine())).toBe("Vietti, Barolo Castiglione 2017");
    expect(bottleTitle(wine(), { dropVintage: true })).toBe("Barolo Castiglione");
  });
  it("falls back to the appellation, then the producer, then Untitled wine", () => {
    expect(bottleTitle(wine({ wineName: null, vintageYear: 2018 }))).toBe("Barolo DOCG 2018");
    expect(bottleTitle(wine({ wineName: null, appellation: null }))).toBe("Vietti 2017");
    expect(lotTitle(wine({ wineName: null, appellation: null }))).toBe("Vietti 2017");
    expect(bottleTitle(wine({ wineName: null, appellation: null, producer: null }))).toBe("Untitled wine");
    expect(lotTitle(wine({ producer: null }))).toBe("Barolo Castiglione 2017");
  });
  it("vintage labels follow catalogWineTitle", () => {
    expect(vintageLabel({ vintageKind: "YEAR", vintageYear: 2016, vintageTawnyYears: null })).toBe("2016");
    expect(vintageLabel({ vintageKind: "YEAR", vintageYear: null, vintageTawnyYears: null })).toBe("");
    expect(vintageLabel({ vintageKind: "NV", vintageYear: null, vintageTawnyYears: null })).toBe("NV");
    expect(vintageLabel({ vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: 20 })).toBe("20yo");
    expect(vintageLabel({ vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: null })).toBe("Tawny");
    expect(bottleTitle(wine({ vintageKind: "NV", vintageYear: null }))).toBe("Barolo Castiglione NV");
  });
});

describe("sizes and counts", () => {
  it("names the common formats", () => {
    expect(sizeLabel(750)).toBe("750 ml");
    expect(sizeSub(750)).toBe("standard");
    expect(sizeLabel(1500)).toBe("1.5 L magnum");
    expect(sizeLabel(375)).toBe("375 ml half");
    expect(sizeLabel(3000)).toBe("3 L double magnum");
    expect(sizeLabel(2000)).toBe("2 L");
    expect(sizeLabel(500)).toBe("500 ml");
    expect(sizeSub(1500)).toBeNull();
  });
  it("count, drunk and last-one", () => {
    expect(countTimes(6)).toBe("6 ×");
    expect(drunkLine({ quantity: 3, purchasedQuantity: 6 })).toBe("3 of 6 drunk");
    expect(drunkLine({ quantity: 6, purchasedQuantity: 6 })).toBeNull();
    expect(drunkLine({ quantity: 7, purchasedQuantity: 6 })).toBeNull();
    expect(isLastOne(1)).toBe(true);
    expect(isLastOne(2)).toBe(false);
  });
  it("the in-flight marker (D9)", () => {
    expect(inFlightLine(1)).toBe("1 bottle in tonight’s flight");
    expect(inFlightLine(2)).toBe("2 bottles in tonight’s flight");
    expect(inFlightLine(1, { phone: true })).toBe("1 in tonight’s flight");
    expect(inFlightLine(0)).toBeNull();
  });
  it("colour words", () => {
    expect(colourWord("RED")).toBe("Red");
    expect(colourWord("ROSE")).toBe("Rosé");
    expect(colourWord(null)).toBeNull();
  });
});

describe("dates from date strings (no zone) and ISO timestamps (UTC)", () => {
  it("month and year", () => {
    expect(monthYear("2023-11-05")).toBe("Nov 2023");
    expect(monthYear("2023-11-30T23:30:00+00:00")).toBe("Nov 2023");
    expect(monthLabel("2026-09-11")).toBe("September 2026");
  });
  it("day forms", () => {
    expect(dayMonthYear("2026-08-02")).toBe("2 Aug 2026");
    expect(dayMonth("2026-09-11")).toBe("11 Sep");
  });
  it("added = purchased_on, else created_at", () => {
    expect(addedMonth({ purchasedOn: "2023-11-05", createdAt: "2024-01-01T00:00:00Z" })).toBe("Nov 2023");
    expect(addedMonth({ purchasedOn: null, createdAt: "2024-01-01T00:00:00Z" })).toBe("Jan 2024");
  });
});

describe("scores and plurals", () => {
  it("one decimal for an average, an integer for a score, a dash for nothing", () => {
    expect(fmtAvg(93.44)).toBe("93.4");
    expect(fmtAvg(93.45)).toBe("93.5");
    expect(fmtAvg(null)).toBe("—");
    expect(fmtScore(92)).toBe("92");
    expect(fmtScore(null)).toBe("—");
  });
  it("plural", () => {
    expect(plural(1, "bottle", "bottles")).toBe("1 bottle");
    expect(plural(6, "bottle", "bottles")).toBe("6 bottles");
    expect(plural(0, "note", "notes")).toBe("0 notes");
  });
});
```

**Steps**
- [ ] Write `types.ts` exactly as the Interfaces block (add doc comments; no runtime code beyond `COLOUR_ORDER`).
- [ ] Write `format.test.ts`; `npx vitest run src/lib/cellar/format.test.ts` — fails: module not found.
- [ ] Implement `format.ts`; run again — green.
- [ ] `npx tsc --noEmit`; `npx eslint src/lib/cellar/types.ts src/lib/cellar/format.ts src/lib/cellar/format.test.ts --max-warnings=0`.

**Acceptance:** `npx vitest run src/lib/cellar/format.test.ts` green; `rg -n 'from "@/' src/lib/cellar/types.ts src/lib/cellar/format.ts` prints nothing; `rg -n "toLocaleDateString|Intl\." src/lib/cellar/format.ts` prints nothing.

**Closes:** spec §4 (`BottleRow` shape); C1/C1b/C4 string shapes (titles, sizes, counts, dates).

---

### CC-P1 — Cellar rows: dimensions, header stats, search, sort, filter, grouping, paging, footer

**Depends on:** CC-P0

**OWNS**
- create `src/lib/cellar/cellar-rows.ts`, `src/lib/cellar/cellar-rows.test.ts`

**Does** (spec §4 "cellar-rows.ts", §5.1 dimension strip / toolbar / footer, §5.2 "Grouped: each row drops…", §5.4 grouping, §5.9 readOnly)
- Dimension counts (distinct countries, regions, producers, grapes, vintage labels) and which `GroupKey` a tile sets (`DIMENSION_GROUP`).
- Header stats (bottles = Σ quantity, wines = distinct catalog ids, tasted = distinct wines with `yours`, producers, countries) and the subtitle in its laptop, phone and read-only forms.
- Search over an accent-folded haystack (title, producer, wine name, appellation, region, country, grape, designation, storage location), the two placeholders.
- Filters: apply, count, options with bottle counts computed with the other filters applied (region options scoped to the chosen country), chips, clearing one chip (clearing the country clears the region).
- Sort: "Most bottles" (quantity desc, then title), "Name" (`bottleTitle` asc), "Added" (`createdAt` desc), "Your score" (desc, untasted last), "Community" (avg desc, unrated last).
- Grouping (`groupRows`): "none" → `[]`; groups keyed by the trimmed value; where → `NO_PLACE` for a null or blank place, pinned last (refinement 9); region groups carry `sublabel = country`; sorted by bottles desc then label asc; per-group stats (bottles, wines, tasted, regions, appellations, producers); the header line per grouping, phone and read-only forms; the eight-group cap, `visibleGroups`, `showMoreLabel` and the plural dimension words.
- `rowLines(row, group)`: what a row keeps under a grouping — producer line, title (vintage dropped under "vintage"), facts line (`grape · colour · designation`, grape dropped under "grape", colour under "colour"), place parts (appellation/region/country each `null` when the header already said it: country group drops country; region group drops region and country; appellation group drops appellation), where (`null` under "where"; else the storage location).
- Paging: `LIST_PAGE = 25`, `GRID_PAGE = 24`, `pageSlice`, `pageLabel`, `rangeLabel`.
- Footer line.

**Interfaces — produces**
```ts
// src/lib/cellar/cellar-rows.ts
import type { BottleRow, Dimension, FilterState, GroupKey, SortKey } from "./types";
export type DimensionCounts = Record<Dimension, number>;
export const DIMENSIONS: readonly Dimension[]; // countries, regions, producers, grapes, vintages
export const DIMENSION_GROUP: Record<Dimension, "country" | "region" | "producer" | "grape" | "vintage">;
export function dimensionCounts(rows: readonly BottleRow[]): DimensionCounts;
export const STRIP_CAPTION = "The shape of what you own, and the way into it — tapping one groups the list by that dimension. Nothing is grouped by default: the full list comes first.";

export type HeaderStats = { bottles: number; wines: number; tasted: number; producers: number; countries: number };
export function headerStats(rows: readonly BottleRow[]): HeaderStats;
export function headerSubtitle(s: HeaderStats, opts: { phone: boolean; readOnly: boolean }): string;

export function foldSearch(s: string): string;
export function matchesSearch(row: BottleRow, needle: string): boolean; // needle already folded; "" matches
export function searchPlaceholder(bottles: number, opts: { phone: boolean }): string;

export const EMPTY_FILTERS: FilterState;
export function applyFilters(rows: readonly BottleRow[], f: FilterState): BottleRow[];
export function filterCount(f: FilterState): number;
export type FilterOption = { value: string; label: string; count: number };
export type FilterOptions = Record<keyof FilterState, FilterOption[]>;
export function filterOptions(rows: readonly BottleRow[], f: FilterState): FilterOptions;
export type FilterChip = { key: keyof FilterState; label: string };
export function filterChips(f: FilterState): FilterChip[];
export function clearFilter(f: FilterState, key: keyof FilterState): FilterState;

export const SORT_ORDER: readonly SortKey[]; // bottles, name, added, yours, community
export const SORT_LABELS: Record<SortKey, string>; // "Most bottles", "Name", "Added", "Your score", "Community"
export function sortRows(rows: readonly BottleRow[], key: SortKey): BottleRow[];

export const GROUP_ORDER: readonly GroupKey[]; // none, where, country, region, appellation, producer, grape, vintage, colour
export const GROUP_LABELS: Record<GroupKey, string>; // "None", "Where it is", "Country", "Region", "Appellation", "Producer", "Grape", "Vintage", "Colour"
export function groupWord(g: Exclude<GroupKey, "none">, n: number): string; // "country"/"countries", "region(s)", "appellation(s)", "producer(s)", "grape(s)", "vintage(s)", "colour(s)", "place(s)"
export const NO_PLACE = "No place set";
export type GroupStats = { bottles: number; wines: number; tasted: number; regions: number; appellations: number; producers: number };
export type RowGroup = { key: string; label: string; sublabel: string | null; rows: BottleRow[]; stats: GroupStats };
export function groupRows(rows: readonly BottleRow[], g: GroupKey): RowGroup[];
export function groupHeaderLine(g: GroupKey, s: GroupStats, opts: { phone: boolean; readOnly: boolean }): string;
export const GROUP_CAP = 8;
export function visibleGroups(groups: readonly RowGroup[], expanded: boolean): { shown: RowGroup[]; hidden: number };
export function showMoreLabel(hidden: number, g: Exclude<GroupKey, "none">): string; // "Show 5 more countries"

export type RowLines = {
  producer: string | null;
  title: string;
  facts: string | null;
  place: { appellation: string | null; region: string | null; country: string | null };
  where: string | null;
};
export function rowLines(row: BottleRow, g: GroupKey): RowLines;
export function placeText(p: RowLines["place"]): string | null; // "Barbaresco DOCG · Piedmont, Italy" | "Barbaresco DOCG · Piedmont" | "Barbaresco DOCG" | "Rheinhessen, Germany" | null

export const LIST_PAGE = 25;
export const GRID_PAGE = 24;
export function pageSlice<T>(rows: readonly T[], page: number, per: number): { rows: T[]; page: number; pages: number };
export function pageLabel(page: number, pages: number): string;             // "Page 1 of 6"
export function rangeLabel(page: number, per: number, total: number): string; // "1–8 of 34"
export function footerLine(opts: { chips: readonly FilterChip[]; group: GroupKey; stats: HeaderStats; readOnly: boolean }): string;
```
Copy rules: `headerSubtitle` laptop `"{n} bottles · {w} wines · you have tasted {t} of them"`, phone `"{n} bottles · {w} wines · {t} tasted"`, read-only (either width) `"{n} bottles · {w} wines"`. `searchPlaceholder` laptop `"Wine, producer, grape or where it is"`, phone `"Search {n} bottles"`. `groupHeaderLine` laptop `"{b} bottles · {w} wines[ · {sub}] · you have tasted {t}"` where `sub` is `"{r} regions · {p} producers"` under country, `"{a} appellations · {p} producers"` under region, `"{p} producers"` under where/appellation/grape/vintage/colour, nothing under producer (singulars "1 region", "1 appellation", "1 producer", "1 wine", "1 bottle"); phone `"{b} bottles · {t} tasted"`; read-only drops the tasted part on both. `footerLine`: first segment `"All"` when no chips, else the chip labels joined `" · "`; then `"across {w} wines, {p} producers and {c} countries"` (singulars "1 wine", "1 producer", "1 country"); then `"nothing filtered, nothing grouped"`, or `"{1 filter | n filters}, {nothing grouped | grouped by {GROUP_LABELS[g] lower-cased}}"` — the two non-default forms are plan copy. `NO_PLACE` sorts last; every other group by bottles desc, then label asc (`localeCompare`). Sort ties on "Most bottles" break on `bottleTitle` asc; untasted or unrated rows keep their input order at the end of "Your score" / "Community". Filter options sort by label asc, except vintage (label desc, so the newest year is first; "NV" and tawny labels last). `placeText` drops an appellation that folds equal to the region (the self-named regional appellation, CLAUDE.md), so a Rheinhessen wine reads "Rheinhessen, Germany" as C1 draws it.

**Tests (write first)** — `src/lib/cellar/cellar-rows.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  DIMENSION_GROUP, EMPTY_FILTERS, GROUP_CAP, GROUP_LABELS, GROUP_ORDER, NO_PLACE, SORT_LABELS, STRIP_CAPTION,
  applyFilters, clearFilter, dimensionCounts, filterChips, filterCount, filterOptions, foldSearch, footerLine,
  groupHeaderLine, groupRows, headerStats, headerSubtitle, matchesSearch, pageLabel, pageSlice, placeText, rangeLabel,
  rowLines, searchPlaceholder, showMoreLabel, sortRows, visibleGroups,
} from "./cellar-rows";
import type { BottleRow } from "./types";

let seq = 0;
function row(over: {
  id?: string; wineId?: string; producer?: string | null; name?: string | null; year?: number | null; kind?: "YEAR" | "NV" | "TAWNY";
  grape?: string | null; colour?: "RED" | "WHITE" | "ROSE" | "ORANGE" | null; designation?: string | null;
  appellation?: string | null; region?: string | null; country?: string | null; qty?: number; bought?: number;
  place?: string | null; created?: string; yours?: number | null; avg?: number | null; count?: number; inFlight?: number;
} = {}): BottleRow {
  seq += 1;
  const id = over.id ?? `lot${seq}`;
  const wineId = over.wineId ?? `wine${seq}`;
  return {
    lot: {
      id, quantity: over.qty ?? 1, purchasedQuantity: over.bought ?? over.qty ?? 1, bottleSizeMl: 750,
      storageLocation: over.place === undefined ? "Cellar, rack B" : over.place, purchasedOn: null, purchaseSource: null,
      pricePerBottle: null, currency: "DKK", drinkFrom: null, drinkTo: null, lotNote: null,
      createdAt: over.created ?? `2024-01-${String(seq).padStart(2, "0")}T00:00:00Z`,
    },
    wine: {
      catalogWineId: wineId, title: `${over.producer ?? "P"} ${over.name ?? "W"}`,
      producer: over.producer === undefined ? "Vietti" : over.producer,
      wineName: over.name === undefined ? "Barolo Castiglione" : over.name,
      vintageKind: over.kind ?? "YEAR", vintageYear: over.year === undefined ? 2017 : over.year, vintageTawnyYears: null,
      primaryGrape: over.grape === undefined ? "Nebbiolo" : over.grape, colour: over.colour === undefined ? "RED" : over.colour,
      style: "STILL", designation: over.designation ?? null,
      appellation: over.appellation === undefined ? "Barolo DOCG" : over.appellation,
      region: over.region === undefined ? "Piedmont" : over.region, country: over.country === undefined ? "Italy" : over.country,
      imageUrl: null,
    },
    community: { avg: over.avg === undefined ? 92.6 : over.avg, count: over.count ?? 33 },
    yours: over.yours === undefined ? { noteId: `n${seq}`, score: 88, tastedOn: "2026-08-02" } : over.yours === null ? null : { noteId: `n${seq}`, score: over.yours, tastedOn: "2026-08-02" },
    inFlight: over.inFlight ?? 0,
  };
}

const cellar: BottleRow[] = [
  row({ id: "a", wineId: "w1", producer: "Produttori del Barbaresco", name: "Barbaresco Riserva Asili", year: 2016, designation: "Riserva", appellation: "Barbaresco DOCG", qty: 6, place: "Cellar, rack B", yours: 92, avg: 93.4, count: 41, created: "2023-11-05T00:00:00Z" }),
  row({ id: "b", wineId: "w2", producer: "Vietti", name: "Barolo Castiglione", year: 2017, qty: 3, bought: 6, place: "rack B", yours: null, avg: 92.6, created: "2024-03-01T00:00:00Z" }),
  row({ id: "c", wineId: "w3", producer: "Casa Raia", name: "Brunello di Montalcino", year: 2018, grape: "Sangiovese", appellation: "Brunello di Montalcino DOCG", region: "Tuscany", qty: 2, place: "Cellar, rack C", yours: 91, avg: 92.4, count: 28, inFlight: 1, created: "2024-03-02T00:00:00Z" }),
  row({ id: "d", wineId: "w4", producer: "Weingut Keller", name: "Riesling Grosses Gewächs", year: 2018, grape: "Riesling", colour: "WHITE", designation: "Grosses Gewächs", appellation: "Rheinhessen", region: "Rheinhessen", country: "Germany", qty: 4, place: "Cellar, rack A", yours: 93, avg: 94.2, count: 36, created: "2024-06-01T00:00:00Z" }),
  row({ id: "e", wineId: "w5", producer: "Passopisciaro", name: "Etna Rosso", year: 2020, grape: "Nerello Mascalese", appellation: "Etna DOC", region: "Sicily", qty: 1, place: "Kitchen rack", yours: null, avg: 89.7, count: 12, created: "2026-01-01T00:00:00Z" }),
  row({ id: "f", wineId: "w6", producer: "Vietti", name: "Barolo Castiglione", year: 2015, qty: 2, place: null, yours: null, avg: null, count: 0, created: "2022-09-01T00:00:00Z" }),
];

describe("dimensions and header", () => {
  it("counts distinct countries, regions, producers, grapes and vintages", () => {
    expect(dimensionCounts(cellar)).toEqual({ countries: 2, regions: 4, producers: 5, grapes: 4, vintages: 5 });
    expect(DIMENSION_GROUP.countries).toBe("country");
    expect(DIMENSION_GROUP.vintages).toBe("vintage");
    expect(STRIP_CAPTION.startsWith("The shape of what you own")).toBe(true);
  });
  it("header stats and subtitle in three forms", () => {
    const s = headerStats(cellar);
    expect(s).toEqual({ bottles: 18, wines: 6, tasted: 3, producers: 5, countries: 2 });
    expect(headerSubtitle(s, { phone: false, readOnly: false })).toBe("18 bottles · 6 wines · you have tasted 3 of them");
    expect(headerSubtitle(s, { phone: true, readOnly: false })).toBe("18 bottles · 6 wines · 3 tasted");
    expect(headerSubtitle(s, { phone: false, readOnly: true })).toBe("18 bottles · 6 wines");
    expect(headerSubtitle({ ...s, bottles: 1, wines: 1, tasted: 1 }, { phone: false, readOnly: false })).toBe("1 bottle · 1 wine · you have tasted 1 of them");
  });
});

describe("search", () => {
  it("folds accents and matches the whole identity plus the place", () => {
    expect(foldSearch("Gewürztraminer")).toBe("gewurztraminer");
    expect(matchesSearch(cellar[3], foldSearch("gewachs"))).toBe(true);
    expect(matchesSearch(cellar[0], foldSearch("rack b"))).toBe(true);
    expect(matchesSearch(cellar[0], foldSearch("riserva"))).toBe(true);
    expect(matchesSearch(cellar[0], foldSearch("sangiovese"))).toBe(false);
    expect(matchesSearch(cellar[0], "")).toBe(true);
  });
  it("placeholders", () => {
    expect(searchPlaceholder(142, { phone: false })).toBe("Wine, producer, grape or where it is");
    expect(searchPlaceholder(142, { phone: true })).toBe("Search 142 bottles");
  });
});

describe("filters", () => {
  it("applies each key and counts the set ones", () => {
    expect(applyFilters(cellar, { ...EMPTY_FILTERS, country: "Italy" }).map((r) => r.lot.id)).toEqual(["a", "b", "c", "e", "f"]);
    expect(applyFilters(cellar, { ...EMPTY_FILTERS, region: "Tuscany" }).map((r) => r.lot.id)).toEqual(["c"]);
    expect(applyFilters(cellar, { ...EMPTY_FILTERS, colour: "WHITE" }).map((r) => r.lot.id)).toEqual(["d"]);
    expect(applyFilters(cellar, { ...EMPTY_FILTERS, grape: "Nebbiolo" }).map((r) => r.lot.id)).toEqual(["a", "b", "f"]);
    expect(applyFilters(cellar, { ...EMPTY_FILTERS, vintage: "2018" }).map((r) => r.lot.id)).toEqual(["c", "d"]);
    expect(filterCount({ ...EMPTY_FILTERS, country: "Italy", grape: "Nebbiolo" })).toBe(2);
  });
  it("options carry bottle counts under the other filters, regions scoped to the country", () => {
    const o = filterOptions(cellar, { ...EMPTY_FILTERS, country: "Italy" });
    expect(o.region.map((x) => [x.label, x.count])).toEqual([["Piedmont", 11], ["Sicily", 1], ["Tuscany", 2]]);
    expect(o.country.map((x) => [x.label, x.count])).toEqual([["Germany", 4], ["Italy", 14]]);
    expect(o.colour.map((x) => x.label)).toEqual(["Red"]);
    expect(o.grape.map((x) => x.label)).toEqual(["Nebbiolo", "Nerello Mascalese", "Sangiovese"]);
    expect(o.vintage.map((x) => x.label)).toEqual(["2020", "2018", "2017", "2016", "2015"]);
  });
  it("chips and clearing (the country clears its region)", () => {
    const f = { ...EMPTY_FILTERS, country: "Italy", region: "Piedmont", colour: "RED" as const };
    expect(filterChips(f)).toEqual([{ key: "country", label: "Italy" }, { key: "region", label: "Piedmont" }, { key: "colour", label: "Red" }]);
    expect(clearFilter(f, "country")).toEqual({ ...EMPTY_FILTERS, colour: "RED" });
    expect(clearFilter(f, "colour")).toEqual({ ...EMPTY_FILTERS, country: "Italy", region: "Piedmont" });
  });
});

describe("sort", () => {
  it("most bottles, name, added, your score, community — untasted and unrated last", () => {
    expect(sortRows(cellar, "bottles").map((r) => r.lot.id)).toEqual(["a", "d", "b", "f", "c", "e"]);
    expect(sortRows(cellar, "name").map((r) => r.lot.id)).toEqual(["a", "f", "b", "c", "e", "d"]);
    expect(sortRows(cellar, "added").map((r) => r.lot.id)).toEqual(["e", "d", "c", "b", "a", "f"]);
    expect(sortRows(cellar, "yours").map((r) => r.lot.id)).toEqual(["d", "a", "c", "b", "e", "f"]);
    expect(sortRows(cellar, "community").map((r) => r.lot.id)).toEqual(["d", "a", "b", "c", "e", "f"]);
    expect(SORT_LABELS.bottles).toBe("Most bottles");
  });
});

describe("grouping", () => {
  it("none groups nothing; the dropdown order and labels are the mock's", () => {
    expect(groupRows(cellar, "none")).toEqual([]);
    expect(GROUP_ORDER).toEqual(["none", "where", "country", "region", "appellation", "producer", "grape", "vintage", "colour"]);
    expect(GROUP_LABELS.where).toBe("Where it is");
  });
  it("where: exact spellings are separate groups, No place set is last", () => {
    const g = groupRows(cellar, "where");
    expect(g.map((x) => x.label)).toEqual(["Cellar, rack B", "Cellar, rack A", "rack B", "Cellar, rack C", "Kitchen rack", NO_PLACE]);
    expect(g[0].stats).toEqual({ bottles: 6, wines: 1, tasted: 1, regions: 1, appellations: 1, producers: 1 });
    expect(g[5].rows.map((r) => r.lot.id)).toEqual(["f"]);
  });
  it("country headers count regions and producers; region headers name the country and count appellations", () => {
    const c = groupRows(cellar, "country");
    expect(c.map((x) => [x.label, x.sublabel])).toEqual([["Italy", null], ["Germany", null]]);
    expect(groupHeaderLine("country", c[0].stats, { phone: false, readOnly: false })).toBe("14 bottles · 5 wines · 3 regions · 4 producers · you have tasted 2");
    const r = groupRows(cellar, "region");
    expect(r[0].label).toBe("Piedmont");
    expect(r[0].sublabel).toBe("Italy");
    expect(groupHeaderLine("region", r[0].stats, { phone: false, readOnly: false })).toBe("11 bottles · 3 wines · 2 appellations · 2 producers · you have tasted 1");
    expect(groupHeaderLine("region", { ...r[0].stats, appellations: 1 }, { phone: false, readOnly: false })).toBe("11 bottles · 3 wines · 1 appellation · 2 producers · you have tasted 1");
    expect(groupHeaderLine("producer", r[0].stats, { phone: false, readOnly: false })).toBe("11 bottles · 3 wines · you have tasted 1");
    expect(groupHeaderLine("where", r[0].stats, { phone: true, readOnly: false })).toBe("11 bottles · 1 tasted");
    expect(groupHeaderLine("where", r[0].stats, { phone: false, readOnly: true })).toBe("11 bottles · 3 wines · 2 producers");
  });
  it("vintage and colour group by label; producer by name", () => {
    expect(groupRows(cellar, "vintage").map((x) => x.label)).toEqual(["2016", "2018", "2017", "2015", "2020"]);
    expect(groupRows(cellar, "colour").map((x) => x.label)).toEqual(["Red", "White"]);
    expect(groupRows(cellar, "producer")[0].label).toBe("Produttori del Barbaresco");
  });
  it("caps at eight groups with a show-more line", () => {
    const many = Array.from({ length: 11 }, (_, i) => row({ country: `Country ${i}`, qty: 11 - i }));
    const groups = groupRows(many, "country");
    expect(groups).toHaveLength(11);
    expect(visibleGroups(groups, false).shown).toHaveLength(GROUP_CAP);
    expect(visibleGroups(groups, false).hidden).toBe(3);
    expect(visibleGroups(groups, true).hidden).toBe(0);
    expect(showMoreLabel(3, "country")).toBe("Show 3 more countries");
    expect(showMoreLabel(1, "region")).toBe("Show 1 more region");
    expect(showMoreLabel(5, "where")).toBe("Show 5 more places");
  });
});

describe("what a row keeps under each grouping", () => {
  const a = cellar[0];
  it("ungrouped keeps everything", () => {
    const l = rowLines(a, "none");
    expect(l.producer).toBe("Produttori del Barbaresco");
    expect(l.title).toBe("Barbaresco Riserva Asili 2016");
    expect(l.facts).toBe("Nebbiolo · Red · Riserva");
    expect(placeText(l.place)).toBe("Barbaresco DOCG · Piedmont, Italy");
    expect(l.where).toBe("Cellar, rack B");
  });
  it("drops what the header said", () => {
    expect(placeText(rowLines(a, "country").place)).toBe("Barbaresco DOCG · Piedmont");
    expect(placeText(rowLines(a, "region").place)).toBe("Barbaresco DOCG");
    expect(placeText(rowLines(a, "appellation").place)).toBe("Piedmont, Italy");
    expect(rowLines(a, "producer").producer).toBeNull();
    expect(rowLines(a, "grape").facts).toBe("Red · Riserva");
    expect(rowLines(a, "colour").facts).toBe("Nebbiolo · Riserva");
    expect(rowLines(a, "vintage").title).toBe("Barbaresco Riserva Asili");
    expect(rowLines(a, "where").where).toBeNull();
    expect(rowLines(cellar[5], "none").where).toBeNull();
  });
  it("a wine with no designation has a two-part facts line; a self-named appellation is not said twice", () => {
    expect(rowLines(cellar[1], "none").facts).toBe("Nebbiolo · Red");
    expect(placeText(rowLines(cellar[3], "none").place)).toBe("Rheinhessen, Germany");
  });
});

describe("paging and footer", () => {
  it("slices, clamps and labels", () => {
    const rows = Array.from({ length: 34 }, (_, i) => i);
    expect(pageSlice(rows, 1, 24).rows).toHaveLength(24);
    expect(pageSlice(rows, 2, 24)).toEqual({ rows: rows.slice(24), page: 2, pages: 2 });
    expect(pageSlice(rows, 9, 24).page).toBe(2);
    expect(pageSlice([], 1, 25)).toEqual({ rows: [], page: 1, pages: 1 });
    expect(pageLabel(1, 6)).toBe("Page 1 of 6");
    expect(rangeLabel(1, 8, 34)).toBe("1–8 of 34");
    expect(rangeLabel(2, 25, 30)).toBe("26–30 of 30");
  });
  it("the footer names the filters, the shape and the grouping", () => {
    const stats = { bottles: 142, wines: 96, tasted: 61, producers: 48, countries: 11 };
    expect(footerLine({ chips: [], group: "none", stats, readOnly: false })).toBe("All · across 96 wines, 48 producers and 11 countries · nothing filtered, nothing grouped");
    expect(footerLine({ chips: [{ key: "country", label: "Italy" }], group: "region", stats: { ...stats, countries: 1 }, readOnly: false })).toBe("Italy · across 96 wines, 48 producers and 1 country · 1 filter, grouped by region");
    expect(footerLine({ chips: [{ key: "country", label: "Italy" }, { key: "colour", label: "Red" }], group: "none", stats, readOnly: false })).toBe("Italy · Red · across 96 wines, 48 producers and 11 countries · 2 filters, nothing grouped");
  });
});
```

**Steps**
- [ ] Write the test; `npx vitest run src/lib/cellar/cellar-rows.test.ts` — fails: module not found.
- [ ] Implement `cellar-rows.ts` (runtime imports: `./format` only; `import type` from `./types`).
- [ ] Run again — green. `npx tsc --noEmit`; `npx eslint src/lib/cellar/cellar-rows.ts src/lib/cellar/cellar-rows.test.ts --max-warnings=0`.

**Acceptance:** the test file is green; `rg -n 'from "@/' src/lib/cellar/cellar-rows.ts` prints nothing; `rg -n "No region on the wine|Fill them in|Unknown" src/lib/cellar/cellar-rows.ts` prints nothing (D10).

**Closes:** spec §4 (`cellar-rows.ts`), §5.1 (dimension strip counts, toolbar copy, footer), §5.2 (grouped row lines), §5.4 (grouping, headers, cap), §5.9 (read-only header forms); screens C1, C1b, C3, C3b, C3c, C3d (the maths and copy).

---

### CC-P2 — Storage-place merge

**Depends on:** CC-P0

**OWNS**
- create `src/lib/cellar/storage-merge.ts`, `src/lib/cellar/storage-merge.test.ts`

**Does** (spec D1, §4 "storage-merge.ts", §5.4 "Near-duplicate places")
- `foldPlace`: trim, collapse internal whitespace to one space, lower-case (no accent folding — "Kælder" and "Kaelder" are different words the owner typed; D1 keeps the field honest).
- `mergeGroups`: over the owner's lots, group the distinct stored spellings whose fold is equal; a group is only returned when it has two or more spellings; the suggested `target` is the spelling holding the most bottles (tie → the most lots, tie → the spelling that sorts first); `variants` lists every spelling, the target first, the rest by bottles desc.
- `mergeNotice`: the C3 notice copy, interpolating the first group's two most-used spellings; `null` when there is nothing to merge.

**Interfaces — produces**
```ts
// src/lib/cellar/storage-merge.ts
export function foldPlace(s: string): string;
export type PlaceVariant = { spelling: string; bottles: number; lots: number };
export type MergeGroup = { target: string; variants: PlaceVariant[] };
export function mergeGroups(lots: readonly { storageLocation: string | null; quantity: number }[]): MergeGroup[];
export function mergeNotice(groups: readonly MergeGroup[]): { title: string; body: string; button: string } | null;
```
Copy: `title` is `"Two places look like one."` when exactly one group of exactly two spellings, otherwise `"{N} places look like {M}."` with N = the total number of spellings across groups and M = the number of groups, both through `countWord(n, { capital: … })` from `src/lib/count-words.ts` (relative import `../count-words`; N capitalised) — plan copy. `body` is `"“{a}” and “{b}” are separate groups because the field is free text. Grouping is where that becomes visible, so it is also where it should be fixable."` with `a`, `b` the first group's first two variants (curly quotes as the mock). `button` is `"Merge them"`.

**Tests (write first)** — `src/lib/cellar/storage-merge.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { foldPlace, mergeGroups, mergeNotice } from "./storage-merge";

const lot = (storageLocation: string | null, quantity: number) => ({ storageLocation, quantity });

describe("foldPlace", () => {
  it("trims, collapses whitespace and ignores case, but keeps accents", () => {
    expect(foldPlace("  Rack  B ")).toBe("rack b");
    expect(foldPlace("rack B")).toBe("rack b");
    expect(foldPlace("Kælder")).toBe("kælder");
    expect(foldPlace("Kaelder")).not.toBe(foldPlace("Kælder"));
  });
});

describe("mergeGroups", () => {
  it("returns nothing when every place is spelt one way", () => {
    expect(mergeGroups([lot("Rack A", 2), lot("Rack B", 3), lot(null, 1)])).toEqual([]);
  });
  it("groups spellings that fold equal and suggests the most-used one", () => {
    const g = mergeGroups([lot("rack B", 3), lot("Rack B", 6), lot("Rack B", 2), lot("rack  b", 1), lot("Rack A", 4)]);
    expect(g).toHaveLength(1);
    expect(g[0].target).toBe("Rack B");
    expect(g[0].variants).toEqual([
      { spelling: "Rack B", bottles: 8, lots: 2 },
      { spelling: "rack B", bottles: 3, lots: 1 },
      { spelling: "rack  b", bottles: 1, lots: 1 },
    ]);
  });
  it("breaks a bottle tie on lot count, then on spelling", () => {
    expect(mergeGroups([lot("kitchen", 4), lot("Kitchen", 2), lot("Kitchen", 2)])[0].target).toBe("Kitchen");
    expect(mergeGroups([lot("floor", 2), lot("Floor", 2)])[0].target).toBe("Floor");
  });
  it("ignores blank places", () => {
    expect(mergeGroups([lot("", 1), lot("   ", 1), lot(null, 1)])).toEqual([]);
  });
});

describe("mergeNotice", () => {
  it("is the C3 notice for one pair", () => {
    const n = mergeNotice(mergeGroups([lot("rack B", 3), lot("Rack B", 6)]));
    expect(n).toEqual({
      title: "Two places look like one.",
      body: "“Rack B” and “rack B” are separate groups because the field is free text. Grouping is where that becomes visible, so it is also where it should be fixable.",
      button: "Merge them",
    });
  });
  it("counts spellings and groups beyond one pair (plan copy)", () => {
    const n = mergeNotice(mergeGroups([lot("rack B", 3), lot("Rack B", 6), lot("rack  b", 1), lot("kitchen", 1), lot("Kitchen", 1)]));
    expect(n?.title).toBe("Five places look like two.");
  });
  it("is null with nothing to merge", () => {
    expect(mergeNotice([])).toBeNull();
  });
});
```

**Steps**
- [ ] Write the test; run it — fails: module not found.
- [ ] Implement; run — green; tsc; eslint.

**Acceptance:** `npx vitest run src/lib/cellar/storage-merge.test.ts` green; `rg -n 'from "@/' src/lib/cellar/storage-merge.ts` prints nothing.

**Closes:** D1; spec §4 (`storage-merge.ts`), §5.4 (the notice); screen C3 (the merge notice).

---

### CC-P3 — Rating spread

**Depends on:** CC-P0

**OWNS**
- create `src/lib/cellar/rating-spread.ts`, `src/lib/cellar/rating-spread.test.ts`

**Does** (spec D7, §4 "rating-spread.ts", §5.5 "Community rating")
- `ratingSpread(notes, friendIds)`: over a wine's scored notes (unscored ones are ignored): `avg` (mean, rounded to one decimal), `count`, `highest`, `lowest`, `byFriends` (notes whose author is in `friendIds`; the viewer is never in their own friend set, so their own notes never count as "by friends").
- The three lines the sheet renders: `notesLine` ("33 notes"), `spreadLine` (laptop `"33 notes · highest 97 · lowest 86"`, phone `"33 notes · 86 to 97"`; with one note, `"1 note · 88"` on both — plan-free: it is the same sentence with equal ends collapsed), `friendsLine` (`"4 by friends"` / `"1 by a friend"`, `null` when 0).

**Interfaces — produces**
```ts
// src/lib/cellar/rating-spread.ts
import type { RatingSpread } from "./types";
export type ScoredNote = { score: number | null; authorId: string };
export function ratingSpread(notes: readonly ScoredNote[], friendIds: ReadonlySet<string>): RatingSpread;
export function notesLine(s: RatingSpread): string;
export function spreadLine(s: RatingSpread, opts: { phone: boolean }): string | null; // null when count is 0
export function friendsLine(s: RatingSpread): string | null;
```

**Tests (write first)** — `src/lib/cellar/rating-spread.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { friendsLine, notesLine, ratingSpread, spreadLine } from "./rating-spread";

const notes = [
  { score: 97, authorId: "a" },
  { score: 86, authorId: "b" },
  { score: 92, authorId: "c" },
  { score: 95, authorId: "b" },
  { score: null, authorId: "d" },
];

describe("ratingSpread", () => {
  it("averages the scored notes and finds the ends and the friends", () => {
    expect(ratingSpread(notes, new Set(["b", "d"]))).toEqual({ avg: 92.5, count: 4, highest: 97, lowest: 86, byFriends: 2 });
  });
  it("is empty with no scored notes", () => {
    expect(ratingSpread([{ score: null, authorId: "a" }], new Set())).toEqual({ avg: null, count: 0, highest: null, lowest: null, byFriends: 0 });
  });
  it("rounds the average to one decimal", () => {
    expect(ratingSpread([{ score: 90, authorId: "a" }, { score: 91, authorId: "b" }, { score: 91, authorId: "c" }], new Set()).avg).toBe(90.7);
  });
});

describe("lines", () => {
  const s = ratingSpread(notes, new Set(["b"]));
  it("notes, spread on both widths, friends", () => {
    expect(notesLine(s)).toBe("4 notes");
    expect(spreadLine(s, { phone: false })).toBe("4 notes · highest 97 · lowest 86");
    expect(spreadLine(s, { phone: true })).toBe("4 notes · 86 to 97");
    expect(friendsLine(s)).toBe("2 by friends");
    expect(friendsLine({ ...s, byFriends: 1 })).toBe("1 by a friend");
    expect(friendsLine({ ...s, byFriends: 0 })).toBeNull();
  });
  it("one note collapses the ends", () => {
    const one = ratingSpread([{ score: 88, authorId: "a" }], new Set());
    expect(spreadLine(one, { phone: false })).toBe("1 note · 88");
    expect(spreadLine(one, { phone: true })).toBe("1 note · 88");
    expect(spreadLine(ratingSpread([], new Set()), { phone: false })).toBeNull();
  });
});
```

**Steps**
- [ ] Write the test; run — fails; implement; run — green; tsc; eslint.

**Acceptance:** the test file is green; `rg -n 'from "@/' src/lib/cellar/rating-spread.ts` prints nothing.

**Closes:** D7; spec §4 (`rating-spread.ts`), §5.5 (community card lines); screens C4, C4b (Community rating).

---

### CC-P4 — History maths

**Depends on:** CC-P0

**OWNS**
- create `src/lib/cellar/history-math.ts`, `src/lib/cellar/history-math.test.ts`

**Does** (spec §4 "history-math.ts", §5.7)
- Years present (desc). Year totals: bottles (Σ quantity), at a tasting (rows with a `tasting`), at home (DRANK rows without one), gifted (GIFTED), written up / not (rows with / without a note) — refinement 22.
- The five filters with bottle counts and their labels on both widths; month buckets newest first (rows within by `consumedOn` desc, `createdAt` desc) with their line; the year band's three lines on both widths; the row's where-line, action word and date; "Show the rest of {year}" past 25 rows.

**Interfaces — produces**
```ts
// src/lib/cellar/history-math.ts
import type { HistoryFilter, HistoryRow } from "./types";
export function yearsPresent(rows: readonly HistoryRow[]): number[];
export function rowsInYear(rows: readonly HistoryRow[], year: number): HistoryRow[];
export type YearTotals = { bottles: number; atTasting: number; atHome: number; gifted: number; writtenUp: number; notWrittenUp: number };
export function yearTotals(rows: readonly HistoryRow[]): YearTotals; // over rows already in the year
export function yearBand(t: YearTotals, year: number, opts: { phone: boolean }): { headline: string; split: string; notes: string };
export const HISTORY_FILTERS: readonly HistoryFilter[]; // all, drank, gifted, tasting, noNote
export function filterRows(rows: readonly HistoryRow[], f: HistoryFilter): HistoryRow[];
export function filterCounts(rows: readonly HistoryRow[]): Record<HistoryFilter, number>; // bottles
export function filterLabel(f: HistoryFilter, count: number, opts: { phone: boolean }): string;
export type MonthBucket = { key: string; label: string; bottles: number; writtenUp: number; rows: HistoryRow[] };
export function monthBuckets(rows: readonly HistoryRow[]): MonthBucket[];
export function monthLine(b: MonthBucket, opts: { phone: boolean }): string;
export type WhereLine = { kind: "tasting"; tastingId: string; name: string } | { kind: "text"; text: string };
export function whereLine(row: HistoryRow, opts: { phone: boolean }): WhereLine;
export function actionWord(row: HistoryRow): string; // "Drank 1" | "Gifted 2" | "Lost 1" | "Removed 1"
export const HISTORY_PAGE = 25;
export function visibleBuckets(buckets: readonly MonthBucket[], expanded: boolean): { buckets: MonthBucket[]; hiddenRows: number };
export function showRestLabel(year: number): string; // "Show the rest of 2026"
```
Copy: `yearBand` laptop `headline "{n} bottles in {year}"`, `split "{a} at a tasting · {h} at home · {g} gifted"`, `notes "{w} you wrote up · {u} you did not"`; phone `headline "{n}"`, `split "{a} at a tasting · {h} at home · {g} gifted"`, `notes "bottles · {w} written up"`. `filterLabel` laptop: `"Everything {n}"`, `"Drank {n}"`, `"Gifted {n}"`, `"At a tasting {n}"`, `"Without a note {n}"`; phone: `"All {n}"`, `"Drank {n}"`, `"Gifted {n}"`, `"Tastings {n}"`, `"No note {n}"`. `monthLine` laptop `"{n} bottles · {w} written up"`, phone `"{n} bottles"` (singular "1 bottle"). `whereLine`: a tasting → `{ kind: "tasting" }` (the component renders "poured at {link}" on laptops and "at {link}" on phones); DRANK without one → `"at home · {occasion}"` or `"at home"`; GIFTED → `"to {occasion}"` or `"gifted"`; LOST → `"lost · {occasion}"` or `"lost"`; OTHER → `"{occasion}"` or `"taken out"` (the empty-occasion words are plan copy). `filterRows`: `tasting` = rows with a tasting; `noNote` = rows without a note. `visibleBuckets` cuts after the bucket in which the 25th row falls is exceeded: it keeps whole buckets while the running row count is ≤ 25, then truncates the next bucket's rows to reach exactly 25 and drops the rest; `hiddenRows` is the count dropped.

**Tests (write first)** — `src/lib/cellar/history-math.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  HISTORY_FILTERS, HISTORY_PAGE, actionWord, filterCounts, filterLabel, filterRows, monthBuckets, monthLine,
  rowsInYear, showRestLabel, visibleBuckets, whereLine, yearBand, yearTotals, yearsPresent,
} from "./history-math";
import type { HistoryRow } from "./types";

let seq = 0;
function row(over: Partial<HistoryRow> & { on: string }): HistoryRow {
  seq += 1;
  return {
    id: `c${seq}`, lotId: "lot1", catalogWineId: "w1", title: "Vietti, Barolo Castiglione 2017", reason: "DRANK", quantity: 1,
    consumedOn: over.on, createdAt: `${over.on}T12:00:00Z`, occasion: null, note: null, tasting: null, ...over,
  };
}
const t = { id: "t1", name: "Nebbiolo vs Sangiovese" };
const rows: HistoryRow[] = [
  row({ on: "2026-09-11", occasion: "Nebbiolo vs Sangiovese", tasting: t, note: { id: "n1", score: 85 } }),
  row({ on: "2026-09-09", occasion: "Tuesday dinner", note: { id: "n2", score: 91 } }),
  row({ on: "2026-09-04", occasion: "Loire whites, six ways", tasting: { id: "t2", name: "Loire whites, six ways" }, quantity: 2, note: { id: "n3", score: 88 } }),
  row({ on: "2026-09-02", reason: "GIFTED", occasion: "Anders, for the move" }),
  row({ on: "2026-08-21", tasting: { id: "t3", name: "Rhône, north and south" }, note: { id: "n4", score: 90 } }),
  row({ on: "2026-08-02", occasion: "Sunday lamb" }),
  row({ on: "2026-08-01", reason: "LOST" }),
  row({ on: "2025-05-11", reason: "GIFTED", occasion: "Maja" }),
];

describe("years and totals", () => {
  it("lists years newest first and totals a year", () => {
    expect(yearsPresent(rows)).toEqual([2026, 2025]);
    const y = rowsInYear(rows, 2026);
    expect(y).toHaveLength(7);
    expect(yearTotals(y)).toEqual({ bottles: 8, atTasting: 4, atHome: 2, gifted: 1, writtenUp: 5, notWrittenUp: 3 });
  });
  it("the band on both widths", () => {
    const t26 = yearTotals(rowsInYear(rows, 2026));
    expect(yearBand(t26, 2026, { phone: false })).toEqual({ headline: "8 bottles in 2026", split: "4 at a tasting · 2 at home · 1 gifted", notes: "5 you wrote up · 3 you did not" });
    expect(yearBand(t26, 2026, { phone: true })).toEqual({ headline: "8", split: "4 at a tasting · 2 at home · 1 gifted", notes: "bottles · 5 written up" });
  });
});

describe("filters", () => {
  const y = rowsInYear(rows, 2026);
  it("five filters, counted in bottles", () => {
    expect(HISTORY_FILTERS).toEqual(["all", "drank", "gifted", "tasting", "noNote"]);
    expect(filterCounts(y)).toEqual({ all: 8, drank: 6, gifted: 1, tasting: 4, noNote: 3 });
    expect(filterRows(y, "tasting").map((r) => r.consumedOn)).toEqual(["2026-09-11", "2026-09-04", "2026-08-21"]);
    expect(filterRows(y, "noNote").map((r) => r.consumedOn)).toEqual(["2026-09-02", "2026-08-02", "2026-08-01"]);
    expect(filterRows(y, "gifted")).toHaveLength(1);
  });
  it("labels on both widths", () => {
    expect(filterLabel("all", 64, { phone: false })).toBe("Everything 64");
    expect(filterLabel("tasting", 41, { phone: false })).toBe("At a tasting 41");
    expect(filterLabel("noNote", 22, { phone: false })).toBe("Without a note 22");
    expect(filterLabel("all", 64, { phone: true })).toBe("All 64");
    expect(filterLabel("tasting", 41, { phone: true })).toBe("Tastings 41");
    expect(filterLabel("noNote", 22, { phone: true })).toBe("No note 22");
    expect(filterLabel("drank", 59, { phone: true })).toBe("Drank 59");
  });
});

describe("months and rows", () => {
  const b = monthBuckets(rowsInYear(rows, 2026));
  it("buckets newest first with subtotals", () => {
    expect(b.map((x) => [x.key, x.label, x.bottles, x.writtenUp])).toEqual([["2026-09", "September 2026", 5, 4], ["2026-08", "August 2026", 3, 1]]);
    expect(b[0].rows.map((r) => r.consumedOn)).toEqual(["2026-09-11", "2026-09-09", "2026-09-04", "2026-09-02"]);
    expect(monthLine(b[0], { phone: false })).toBe("5 bottles · 4 written up");
    expect(monthLine(b[0], { phone: true })).toBe("5 bottles");
  });
  it("where each bottle went", () => {
    expect(whereLine(rows[0], { phone: false })).toEqual({ kind: "tasting", tastingId: "t1", name: "Nebbiolo vs Sangiovese" });
    expect(whereLine(rows[1], { phone: false })).toEqual({ kind: "text", text: "at home · Tuesday dinner" });
    expect(whereLine(rows[3], { phone: false })).toEqual({ kind: "text", text: "to Anders, for the move" });
    expect(whereLine(rows[5], { phone: true })).toEqual({ kind: "text", text: "at home · Sunday lamb" });
    expect(whereLine(rows[6], { phone: false })).toEqual({ kind: "text", text: "lost" });
    expect(whereLine(row({ on: "2026-01-01", reason: "OTHER" }), { phone: false })).toEqual({ kind: "text", text: "taken out" });
    expect(whereLine(row({ on: "2026-01-01", reason: "GIFTED" }), { phone: false })).toEqual({ kind: "text", text: "gifted" });
  });
  it("action words", () => {
    expect(actionWord(rows[0])).toBe("Drank 1");
    expect(actionWord(rows[2])).toBe("Drank 2");
    expect(actionWord(rows[3])).toBe("Gifted 1");
    expect(actionWord(rows[6])).toBe("Lost 1");
    expect(actionWord(row({ on: "2026-01-01", reason: "OTHER", quantity: 3 }))).toBe("Removed 3");
  });
});

describe("show the rest", () => {
  it("keeps 25 rows, then hides the rest until expanded", () => {
    const many = Array.from({ length: 40 }, (_, i) => row({ on: `2026-${i < 20 ? "09" : "08"}-${String(28 - (i % 20)).padStart(2, "0")}` }));
    const b = monthBuckets(many);
    const cut = visibleBuckets(b, false);
    expect(cut.buckets.reduce((n, x) => n + x.rows.length, 0)).toBe(HISTORY_PAGE);
    expect(cut.buckets[1].rows).toHaveLength(5);
    expect(cut.hiddenRows).toBe(15);
    expect(visibleBuckets(b, true).hiddenRows).toBe(0);
    expect(showRestLabel(2026)).toBe("Show the rest of 2026");
  });
});
```

**Steps**
- [ ] Write the test; run — fails; implement (runtime imports: `./format` for `monthLabel`); run — green; tsc; eslint.

**Acceptance:** the test file is green; `rg -n 'from "@/' src/lib/cellar/history-math.ts` prints nothing.

**Closes:** spec §4 (`history-math.ts`), §5.7; screens C6, C6b (the maths and copy).

---

### CC-P5 — Collection maths

**Depends on:** CC-P0

**OWNS**
- create `src/lib/cellar/collection-math.ts`, `src/lib/cellar/collection-math.test.ts`

**Does** (spec §4 "collection-math.ts", §5.8)
- `collectionStats(rows)`: bottles, distinct wines, tasted (distinct wines with `yours`), `toGo`, `yourAverage` and `communityAverage` on the same wines (each distinct wine with both `yours` and a community average contributes its most-recent score and its average; both means to one decimal; `null` when no such wine), `best` (the highest community average among owned wines, its `lotTitle`; ties → the first in row order), the distinct counts for the eyebrows (countries, regions, producers, grapes, years = distinct vintage years), and the five panels as `Bar[]`: `byRegion`, `byProducer`, `byGrape`, `byColour` (value = bottles, sorted by value desc then label, top 8 — `COLLECTION_TOP`), `byDecade` (`"2020s"`… by `vintageYear`, `"No vintage"` for NV/tawny/unknown; ordered newest decade first, "No vintage" last — refinement 10).
- The headline and eyebrow strings on both widths.

**Interfaces — produces**
```ts
// src/lib/cellar/collection-math.ts
import type { BottleRow, CollectionStats } from "./types";
export const COLLECTION_TOP = 8;
export function collectionStats(rows: readonly BottleRow[]): CollectionStats;
export function decadeLabel(w: Pick<BottleRow["wine"], "vintageKind" | "vintageYear">): string;
export const COLLECTION_CAPTION = "What is in it, and how it has been rated. Your tasting record lives in"; // the component appends the "Your numbers" link
export function bottlesTile(s: CollectionStats, opts: { phone: boolean }): { value: string; sub: string };   // laptop: "142" / "across 96 wines"; phone: "142" / "bottles · 96 wines"
export function tastedTile(s: CollectionStats, opts: { phone: boolean }): { label: string; value: string; sub: string }; // laptop: "You have tasted" / "61" / "of the 96 · 35 to go"; phone: "tasted" / "61" / "35 to go"
export function averageTile(s: CollectionStats, opts: { phone: boolean }): { label: string; value: string; sub: string }; // laptop: "Your average" / "90.2" / "community 91.4 on the same wines"; phone: "your average" / "90.2" / "community: 91.4"
export function bestTile(s: CollectionStats): { label: string; value: string; sub: string }; // "Best you own" / "96.1" / "Quintarelli, Amarone 2015"
export function panelEyebrow(panel: "region" | "producer" | "grape" | "colour" | "decade", s: CollectionStats): string | null; // "11 countries · 34 regions" | "48 producers" | "22 grapes" | null | "18 years"
export const PANEL_TITLES: Record<"region" | "producer" | "grape" | "colour" | "decade", { laptop: string; phone: string }>; // "Where it comes from", "Producers you are deep in"/"Deep in", "Grapes", "Colour", "Vintages"
```
With no comparable wine `averageTile` reads `value "—"` and `sub "no wine with both scores yet"` (plan copy); `bestTile` with no rated wine reads `value "—"` and `sub "nothing rated yet"` (plan copy) — add both to the Plan copy table on landing.

**Tests (write first)** — `src/lib/cellar/collection-math.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { COLLECTION_TOP, averageTile, bestTile, bottlesTile, collectionStats, decadeLabel, panelEyebrow, tastedTile } from "./collection-math";
import type { BottleRow } from "./types";

let seq = 0;
function row(o: { wineId?: string; producer?: string; name?: string; year?: number | null; kind?: "YEAR" | "NV" | "TAWNY"; grape?: string; colour?: "RED" | "WHITE" | "ROSE" | "ORANGE"; region?: string; country?: string; qty?: number; yours?: number | null; avg?: number | null }): BottleRow {
  seq += 1;
  return {
    lot: { id: `l${seq}`, quantity: o.qty ?? 1, purchasedQuantity: o.qty ?? 1, bottleSizeMl: 750, storageLocation: null, purchasedOn: null, purchaseSource: null, pricePerBottle: null, currency: "DKK", drinkFrom: null, drinkTo: null, lotNote: null, createdAt: "2024-01-01T00:00:00Z" },
    wine: { catalogWineId: o.wineId ?? `w${seq}`, title: "", producer: o.producer ?? "Vietti", wineName: o.name ?? "Barolo", vintageKind: o.kind ?? "YEAR", vintageYear: o.year === undefined ? 2017 : o.year, vintageTawnyYears: null, primaryGrape: o.grape ?? "Nebbiolo", colour: o.colour ?? "RED", style: "STILL", designation: null, appellation: "Barolo DOCG", region: o.region ?? "Piedmont", country: o.country ?? "Italy", imageUrl: null },
    community: { avg: o.avg === undefined ? 92 : o.avg, count: o.avg == null ? 0 : 10 },
    yours: o.yours === undefined || o.yours === null ? null : { noteId: `n${seq}`, score: o.yours, tastedOn: "2026-01-01" },
    inFlight: 0,
  };
}

const rows = [
  row({ wineId: "a", producer: "Quintarelli", name: "Amarone", year: 2015, region: "Veneto", qty: 2, yours: 95, avg: 96.1 }),
  row({ wineId: "b", producer: "Vietti", year: 2017, qty: 3, yours: null, avg: 92.6 }),
  row({ wineId: "b", producer: "Vietti", year: 2017, qty: 1, yours: null, avg: 92.6 }),
  row({ wineId: "c", producer: "Keller", name: "GG", year: 2018, grape: "Riesling", colour: "WHITE", region: "Rheinhessen", country: "Germany", qty: 4, yours: 93, avg: 94.2 }),
  row({ wineId: "d", producer: "Fontodi", name: "Flaccianello", year: 2019, grape: "Sangiovese", region: "Tuscany", qty: 2, yours: 88, avg: null }),
  row({ wineId: "e", producer: "Krug", name: "Grande Cuvée", kind: "NV", year: null, grape: "Chardonnay", colour: "WHITE", region: "Champagne", country: "France", qty: 1, yours: null, avg: 95 }),
  row({ wineId: "f", producer: "Vietti", name: "Barbera", year: 2001, grape: "Barbera", qty: 1, yours: 84, avg: 86 }),
];

describe("collectionStats", () => {
  const s = collectionStats(rows);
  it("counts bottles, wines, tasted and the distinct dimensions", () => {
    expect(s.bottles).toBe(14);
    expect(s.wines).toBe(6);
    expect(s.tasted).toBe(4);
    expect(s.toGo).toBe(2);
    expect([s.countries, s.regions, s.producers, s.grapes, s.years]).toEqual([3, 5, 5, 5, 5]);
  });
  it("compares your average with the community's on the same wines only", () => {
    // a (95 vs 96.1), c (93 vs 94.2), f (84 vs 86); d has no community average, b and e no note of yours
    expect(s.yourAverage).toBe(90.7);
    expect(s.communityAverage).toBe(92.1);
  });
  it("names the best you own", () => {
    expect(s.best).toEqual({ score: 96.1, title: "Quintarelli, Amarone 2015" });
  });
  it("panels by bottles, decades newest first with No vintage last", () => {
    expect(s.byRegion).toEqual([{ label: "Piedmont", value: 5 }, { label: "Rheinhessen", value: 4 }, { label: "Tuscany", value: 2 }, { label: "Veneto", value: 2 }, { label: "Champagne", value: 1 }]);
    expect(s.byProducer[0]).toEqual({ label: "Vietti", value: 5 });
    expect(s.byGrape[0]).toEqual({ label: "Nebbiolo", value: 6 });
    expect(s.byColour).toEqual([{ label: "Red", value: 9 }, { label: "White", value: 5 }]);
    expect(s.byDecade).toEqual([{ label: "2010s", value: 12 }, { label: "2000s", value: 1 }, { label: "No vintage", value: 1 }]);
    expect(decadeLabel({ vintageKind: "TAWNY", vintageYear: null })).toBe("No vintage");
  });
  it("caps every value panel at eight", () => {
    const many = Array.from({ length: 12 }, (_, i) => row({ producer: `P${i}`, qty: 12 - i }));
    expect(collectionStats(many).byProducer).toHaveLength(COLLECTION_TOP);
  });
  it("is empty-safe", () => {
    const e = collectionStats([]);
    expect(e.bottles).toBe(0);
    expect(e.yourAverage).toBeNull();
    expect(e.best).toBeNull();
    expect(e.byDecade).toEqual([]);
  });
});

describe("tiles and eyebrows", () => {
  const s = collectionStats(rows);
  it("headline tiles on both widths", () => {
    expect(bottlesTile(s, { phone: false })).toEqual({ value: "14", sub: "across 6 wines" });
    expect(bottlesTile(s, { phone: true })).toEqual({ value: "14", sub: "bottles · 6 wines" });
    expect(tastedTile(s, { phone: false })).toEqual({ label: "You have tasted", value: "4", sub: "of the 6 · 2 to go" });
    expect(tastedTile(s, { phone: true })).toEqual({ label: "tasted", value: "4", sub: "2 to go" });
    expect(averageTile(s, { phone: false })).toEqual({ label: "Your average", value: "90.7", sub: "community 92.1 on the same wines" });
    expect(averageTile(s, { phone: true })).toEqual({ label: "your average", value: "90.7", sub: "community: 92.1" });
    expect(bestTile(s)).toEqual({ label: "Best you own", value: "96.1", sub: "Quintarelli, Amarone 2015" });
  });
  it("eyebrows", () => {
    expect(panelEyebrow("region", s)).toBe("3 countries · 5 regions");
    expect(panelEyebrow("producer", s)).toBe("5 producers");
    expect(panelEyebrow("grape", s)).toBe("5 grapes");
    expect(panelEyebrow("colour", s)).toBeNull();
    expect(panelEyebrow("decade", s)).toBe("5 years");
  });
});
```

**Steps**
- [ ] Write the test; run — fails; implement (runtime imports: `./format` for `lotTitle`, `fmtAvg`, `colourWord`, `plural`); run — green; tsc; eslint.

**Acceptance:** the test file is green; `rg -n 'from "@/' src/lib/cellar/collection-math.ts` prints nothing; `rg -n "value|spend|worth|readiness" -i src/lib/cellar/collection-math.ts` matches only `Bar.value` uses (inspect — no money, no readiness).

**Closes:** spec §4 (`collection-math.ts`), §5.8; screens C7, C7b (the maths and copy; the value panel is not built, D4).

---

## Track CC-X — Types, deletions, redirects, nav

### CC-X1 — `catalog_wines.merged_into` in the hand-written types (D14)

**Depends on:** —

**OWNS**
- modify `src/lib/supabase/database.types.ts` (the `catalog_wines` entry only)

**Does** (spec D14; code map §4)
- Add `merged_into: string | null;` to `catalog_wines.Row` and `merged_into?: string | null;` to `catalog_wines.Insert` (Update derives from Insert), with a one-line comment naming `20260829203000_catalog_curation.sql`. `Relationships: []` and `Views: {}` stay as they are.
- Touch nothing else: the existing callers that filter `merged_into` through an untyped `.filter(...)` keep working (their comments become stale, which CC-V2 lists as optional cleanup, never a failure).

**Interfaces — produces:** `Database["public"]["Tables"]["catalog_wines"]["Row"]["merged_into"]: string | null`.

**Tests:** none (types only).

**Steps**
- [ ] Edit the two entries; `npx tsc --noEmit` prints nothing; `npx eslint src/lib/supabase/database.types.ts --max-warnings=0`.

**Acceptance:** `rg -n "merged_into" src/lib/supabase/database.types.ts` prints two lines (Row and Insert) plus the comment.

**Closes:** D14.

---

### CC-X2 — The `/cellar/[lotId]` redirect routes and the old forms' deletion (D6)

**Depends on:** CC-U3 (the frame honours `?lot=` and `?do=` — never ship a redirect into a page that ignores it)

**OWNS**
- create `src/app/cellar/[lotId]/page.tsx`
- modify `src/app/cellar/[lotId]/drink/page.tsx`, `src/app/cellar/[lotId]/edit/page.tsx`
- delete `src/app/cellar/[lotId]/drink/drink-form.tsx`, `src/app/cellar/[lotId]/edit/edit-lot-form.tsx`, `src/app/cellar/[lotId]/edit/wine-price-field.tsx`, `src/app/cellar/[lotId]/edit/wine-price-actions.ts`

**Does** (spec D6, D13, §3 route table, §7 deleted files)
- Read `node_modules/next/dist/docs/` on `redirect` in a server component first (AGENTS.md).
- Each of the three pages becomes a server component with no data read: `const { lotId } = await params;` then `redirect(...)`. A `lotId` that is not a UUID (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) redirects to `/cellar` alone, so a crafted path never reaches the frame's query parser.
  - `/cellar/[lotId]` → `/cellar?lot=<id>`
  - `/cellar/[lotId]/drink` → `/cellar?lot=<id>&do=drink`
  - `/cellar/[lotId]/edit` → `/cellar?lot=<id>&do=edit`
- The auth gate stays with `/cellar` (the frame's page redirects a signed-out visitor to `/login`), so these routes read nothing and leak nothing.
- Delete the four files. `src/app/cellar/[lotId]/drink/actions.ts` (`consumeLot`, `ConsumeInput`) stays untouched — CC-U5 imports it.

**Interfaces:** none produced. Consumes the frame's `?lot=`/`?do=` contract (CC-U3).

**Tests:** none (redirects only).

**Steps**
- [ ] Write the three pages; delete the four files.
- [ ] `npx tsc --noEmit` prints nothing (the deleted files had no importer left — `rg -n "drink-form|edit-lot-form|wine-price-field|wine-price-actions|EditLotForm|DrinkForm|WinePriceField|updateWineEstimatedPrice" src` prints nothing).
- [ ] `npx eslint "src/app/cellar/[lotId]/page.tsx" "src/app/cellar/[lotId]/drink/page.tsx" "src/app/cellar/[lotId]/edit/page.tsx" --max-warnings=0`.

**Acceptance:** the grep above prints nothing; `ls "src/app/cellar/[lotId]/drink"` lists `actions.ts` and `page.tsx` only; `ls "src/app/cellar/[lotId]/edit"` lists `page.tsx` only; `rg -n "redirect\(" "src/app/cellar/[lotId]"` shows three redirects to `/cellar?lot=`.

**Closes:** D6 (the routes), D13 (`wine-price-field.tsx`, `wine-price-actions.ts`), spec §7 (four deleted files).

---

### CC-X3 — Nav children and the retired cellar files

**Depends on:** CC-U3, CC-U6, CC-U7, CC-U8

**OWNS**
- modify `src/components/nav-links.ts`
- delete `src/app/cellar/cellar-tabs.tsx`, `src/app/cellar/history-list.tsx`, `src/app/cellar/stats-panel.tsx`, `src/app/cellar/stats.ts`, `src/app/cellar/cellar-summary.tsx`, `src/app/cellar/cellar-bottles-table.tsx`, `scripts/cellar-stats.test.mjs`

**Does** (spec §3 "Sidebar", §7 deleted files; refinements 1, 18)
- `NAV_LINKS`'s Cellar entry: `children` becomes, in order, `{ href: "/cellar", label: "Bottles" }`, `{ href: "/cellar/history", label: "History" }`, `{ href: "/cellar/collection", label: "The collection" }`, `{ href: "/cellar/new", label: "Add a bottle", modal: "cellar" }`. The `match` stays `["/cellar"]`; the sidebar's own active rule (a child at the pillar's href is active only on an exact match; the others on prefix) already lights Bottles at `/cellar` and History at `/cellar/history` — verify by reading `src/components/app-sidebar.tsx:333-337` and `src/components/mobile-nav.tsx:129-140`, change neither.
- Delete the seven files. Before deleting each, `rg -n "<basename without extension>" src scripts` must show no importer (CC-U3 and CC-U8 stopped importing them; `scripts/cellar-stats.test.mjs` is the only importer of `stats.ts` and goes with it).

**Interfaces:** none.

**Tests:** none.

**Steps**
- [ ] Edit `nav-links.ts`; delete the files; `npx tsc --noEmit`; `npm test` (the deleted table's `BottleRow` had no test); `npx eslint src/components/nav-links.ts --max-warnings=0`.

**Acceptance:** `rg -n "Cellar Inventory|cellar-bottles-table|cellar-summary|cellar-tabs|history-list|stats-panel|computeCellarStats|CellarSummary|CellarTabs|CellarBottlesTable|StatsPanel|HistoryList" src scripts` prints nothing; `rg -n '"/cellar/history"|"/cellar/collection"|label: "Bottles"' src/components/nav-links.ts` prints three lines; `ls src/app/cellar` lists no `cellar-tabs.tsx`, `history-list.tsx`, `stats-panel.tsx`, `stats.ts`, `cellar-summary.tsx`, `cellar-bottles-table.tsx`.

**Closes:** spec §3 (sidebar), §7 (the remaining deleted files); D5 (the three sub-pages reachable from the sidebar).

---

## Track CC-D — Data and server modules

Data modules under `src/lib/cellar/` take `supabase: SupabaseClient<Database>` (typed with `import type` from `@supabase/supabase-js` and `@/lib/supabase/database.types`) and a user id; they import nothing from `next`. Every read is an ordinary RLS read as the viewer. Server actions live in `src/app/cellar/lot-actions.ts` (`"use server"`), call `createClient()` from `@/lib/supabase/server`, check `auth.getUser()` and return `{ error }` objects, never throw to the client.

---

### CC-D1 — The lot embed and `getCellarBottles`

**Depends on:** CC-P0

**OWNS**
- create `src/lib/cellar/embed.ts`
- create `src/lib/cellar/bottles.ts`

**Does** (spec §4 "bottles.ts"; D3, D9, D12)
- `embed.ts`: the one select string for a cellar lot with its wine identity (`LOT_SELECT`, below), the row type PostgREST returns for it, `relName` (the array-or-object embed unwrap every page repeats today), and `bottleRowFrom` which shapes `BottleLot` and `BottleWine` (title through `catalogWineTitle` from `@/lib/wset/wine-title` — a pure module, so the import is a runtime import of a pure file; `vintageLabel` is not stored, the row keeps the three vintage parts).
- `bottles.ts`: `getCellarBottles(supabase, ownerId, viewerId, { readOnly })`:
  1. `cellar_lots` with `LOT_SELECT`, `.eq("owner_id", ownerId).gt("quantity", 0).order("created_at", { ascending: false })` — RLS: `"cellar own select"` (`owner_id = auth.uid() or can_view_cellar(owner_id)`), so a friend's or public cellar reads here too.
  2. `catalog_wine_ratings` (view, security invoker) `.select("catalog_wine_id, avg_score, note_count").in("catalog_wine_id", ids)` in chunks of 200 ids — `avg_score` arrives as a numeric string, `Number()` it.
  3. Skipped when `readOnly`: the viewer's notes — `wset_notes.select("id, catalog_wine_id, quality_score, tasted_on, created_at").eq("author_id", viewerId).not("quality_score", "is", null).in("catalog_wine_id", ids).order("tasted_on", { ascending: false }).order("created_at", { ascending: false })`, chunked the same way; the first row per wine is `yours` (D3). Identity-less hidden-glass notes never match an `.in("catalog_wine_id", …)` filter, so no extra clause is needed.
  4. Skipped when `readOnly`: `wine_pour_intents.select("cellar_lot_id").eq("owner_id", ownerId).is("cellar_consumption_id", null).in("cellar_lot_id", lotIds)` → `inFlight` = the count per lot (D9). RLS: `"wine_pour_intents own select"`.
  5. Return `BottleRow[]` in the lots' order. In `readOnly`, `yours` is `null` and `inFlight` is `0` on every row; nothing about the owner's notes, pour intents, consumptions or history is read.

**Interfaces — produces**
```ts
// src/lib/cellar/embed.ts
export const LOT_SELECT =
  "id, owner_id, catalog_wine_id, bottle_size_ml, quantity, purchased_quantity, price_per_bottle, currency, " +
  "purchased_on, purchase_source, drink_from, drink_to, storage_location, lot_note, created_at, " +
  "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, colour, style, image_url, " +
  "producer:producers(name), appellation:appellations(name), region:regions(name), country:countries(name), " +
  "primary_grape:grapes!catalog_wines_primary_grape_id_fkey(name), type_designation:type_designations(name))";
export type Rel = { name: string } | { name: string }[] | null;
export type CatalogEmbed = {
  wine_name: string | null; vintage_kind: VintageKind; vintage_year: number | null; vintage_tawny_years: number | null;
  colour: WineColour | null; style: WineStyle | null; image_url: string | null;
  producer: Rel; appellation: Rel; region: Rel; country: Rel; primary_grape: Rel; type_designation: Rel;
};
export type LotEmbedRow = {
  id: string; owner_id: string; catalog_wine_id: string; bottle_size_ml: number; quantity: number; purchased_quantity: number;
  price_per_bottle: number | string | null; currency: string; purchased_on: string | null; purchase_source: string | null;
  drink_from: number | null; drink_to: number | null; storage_location: string | null; lot_note: string | null; created_at: string;
  catalog_wines: CatalogEmbed | CatalogEmbed[] | null;
};
export function relName(rel: unknown): string | null;
export function unwrapEmbed<T>(rel: T | T[] | null): T | null;
export function lotFrom(r: LotEmbedRow): BottleLot;
export function wineFrom(catalogWineId: string, c: CatalogEmbed | null): BottleWine;
export function bottleRowFrom(r: LotEmbedRow, extras: { community: CommunityRating; yours: YourScore | null; inFlight: number }): BottleRow;

// src/lib/cellar/bottles.ts
export type CellarBottlesOptions = { readOnly: boolean };
export async function getCellarBottles(
  supabase: SupabaseClient<Database>, ownerId: string, viewerId: string, opts: CellarBottlesOptions,
): Promise<BottleRow[]>;
export function chunk<T>(items: readonly T[], size: number): T[][]; // 200 ids per PostgREST `.in`
```

**Tests:** none (data module; the pure shaping is exercised by CC-P1's fixtures and CC-V3's browser pass). `bottleRowFrom` must not be given logic beyond field mapping and `Number()` coercion.

**Steps**
- [ ] Write `embed.ts`, then `bottles.ts`; `npx tsc --noEmit`; `npx eslint src/lib/cellar/embed.ts src/lib/cellar/bottles.ts --max-warnings=0`.

**Acceptance:** `rg -n "estimated_price|drink_now|readiness" src/lib/cellar/embed.ts src/lib/cellar/bottles.ts` prints nothing; `rg -n 'from "next' src/lib/cellar/embed.ts src/lib/cellar/bottles.ts` prints nothing; `rg -n "wine_pour_intents|wset_notes" src/lib/cellar/bottles.ts` shows both reads inside an `if (!opts.readOnly)` branch (inspect).

**Closes:** spec §4 (`bottles.ts`), D3 (the cellar rows), D9, D12 (the data half).

---

### CC-D3 — `getCellarHistory` and the tasting link (D8)

**Depends on:** CC-P0

**OWNS**
- create `src/lib/cellar/history.ts`

**Does** (spec §4 "history.ts", D8; §5.7 "No money")
- `tastingLinksFor(supabase, ownerId, consumptionIds)`: `wine_pour_intents.select("wine_id, cellar_consumption_id").eq("owner_id", ownerId).in("cellar_consumption_id", ids)` (owner-only RLS) → `wines.select("id, tasting_id").in("id", wineIds)` (the owner added those glasses, so `"wines read"` admits them as host or participant; a glass since deleted simply drops out) → `tastings.select("id, name").in("id", tastingIds)` → `Map<consumptionId, { id, name }>`. Never matches `occasion` text.
- `getCellarHistory(supabase, ownerId)`: `cellar_consumptions.select("id, lot_id, catalog_wine_id, quantity, reason, consumed_on, occasion, wset_note_id, created_at, catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, producer:producers(name), appellation:appellations(name))").eq("owner_id", ownerId).order("consumed_on", { ascending: false }).order("created_at", { ascending: false }).limit(1000)` (refinement 19; RLS is owner-only regardless of the `.eq`); then `wset_notes.select("id, quality_score").in("id", noteIds)` for the scores (the viewer's own notes; chunked); then `tastingLinksFor`. Title through `lotTitle(wineFrom(...))` — a `BottleWine` built from the embed with `primaryGrape`, `colour`, `style`, `designation`, `region`, `country`, `imageUrl` null (the history row only needs the title). Returns `HistoryRow[]`.

**Interfaces — produces**
```ts
// src/lib/cellar/history.ts
export async function tastingLinksFor(
  supabase: SupabaseClient<Database>, ownerId: string, consumptionIds: readonly string[],
): Promise<Map<string, { id: string; name: string }>>;
export async function getCellarHistory(supabase: SupabaseClient<Database>, ownerId: string): Promise<HistoryRow[]>;
```

**Tests:** none (data module; `history-math.test.ts` covers the maths on `HistoryRow`).

**Steps**
- [ ] Write `history.ts`; `npx tsc --noEmit`; `npx eslint src/lib/cellar/history.ts --max-warnings=0`.

**Acceptance:** `rg -n "occasion" src/lib/cellar/history.ts` matches only the select string and the row mapping, never a comparison (inspect); `rg -n "price|value" src/lib/cellar/history.ts` prints nothing.

**Closes:** spec §4 (`history.ts`), D8.

---

### CC-D5 — `getOwnLotsForWine` and the strip summary

**Depends on:** CC-P0

**OWNS**
- create `src/lib/cellar/own-lots.ts`, `src/lib/cellar/own-lots.test.ts`

**Does** (spec §4 "catalog/[wineId]/page.tsx adds getOwnLotsForWine", §6.2 item 3)
- `getOwnLotsForWine(supabase, viewerId, wineId)`: `cellar_lots.select("id, quantity, purchased_quantity, storage_location, purchased_on, created_at").eq("owner_id", viewerId).eq("catalog_wine_id", wineId).gt("quantity", 0).order("created_at", { ascending: true })`.
- `stripSummary(lots)` (pure, exported from the same file, which imports only `./format` at runtime and types otherwise — vitest can load it): `bottles` = Σ quantity; `place` = the storage location holding most bottles (tie → the oldest lot's; null when none is set); `drunk` = Σ (purchased − quantity) and `bought` = Σ purchased; `addedMonth` = `addedMonth` of the oldest lot; `lotsWord` = `"one lot"` or `"{n} lots"` (`countWord` from `../count-words`); `firstLotId` = the oldest lot's id (the strip's Drink one and Open the lot target — spec §6.2 "the first lot"); null when there are no lots.
- `stripLine(s)`: `"{place} · {drunk} of {bought} drunk · added {Mon yyyy} · {lotsWord}"` on laptops with the drunk part only when `drunk > 0` and the place only when set; the phone form drops the lots word (W2b).

**Interfaces — produces**
```ts
// src/lib/cellar/own-lots.ts
export type OwnLot = { id: string; quantity: number; purchasedQuantity: number; storageLocation: string | null; purchasedOn: string | null; createdAt: string };
export async function getOwnLotsForWine(supabase: SupabaseClient<Database>, viewerId: string, wineId: string): Promise<OwnLot[]>;
export type StripSummary = { bottles: number; place: string | null; drunk: number; bought: number; addedMonth: string; lotsWord: string; firstLotId: string };
export function stripSummary(lots: readonly OwnLot[]): StripSummary | null;
export function stripTitle(s: StripSummary): string; // "You own 3 bottles" / "You own 1 bottle"
export function stripLine(s: StripSummary, opts: { phone: boolean }): string;
```

**Tests (write first)** — `src/lib/cellar/own-lots.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { stripLine, stripSummary, stripTitle, type OwnLot } from "./own-lots";

const lot = (o: Partial<OwnLot> & { id: string }): OwnLot => ({
  quantity: 1, purchasedQuantity: 1, storageLocation: null, purchasedOn: null, createdAt: "2024-01-01T00:00:00Z", ...o,
});

describe("stripSummary", () => {
  it("one lot: the W2 strip", () => {
    const s = stripSummary([lot({ id: "a", quantity: 3, purchasedQuantity: 6, storageLocation: "Cellar, rack B", purchasedOn: "2023-11-05" })]);
    expect(s).toEqual({ bottles: 3, place: "Cellar, rack B", drunk: 3, bought: 6, addedMonth: "Nov 2023", lotsWord: "one lot", firstLotId: "a" });
    expect(stripTitle(s!)).toBe("You own 3 bottles");
    expect(stripLine(s!, { phone: false })).toBe("Cellar, rack B · 3 of 6 drunk · added Nov 2023 · one lot");
    expect(stripLine(s!, { phone: true })).toBe("Cellar, rack B · 3 of 6 drunk · added Nov 2023");
  });
  it("several lots: the dominant place, summed counts, the oldest lot's month and id", () => {
    const s = stripSummary([
      lot({ id: "old", quantity: 1, purchasedQuantity: 1, storageLocation: "Kitchen", purchasedOn: "2022-03-01", createdAt: "2022-03-01T00:00:00Z" }),
      lot({ id: "new", quantity: 4, purchasedQuantity: 4, storageLocation: "Rack A", createdAt: "2024-06-01T00:00:00Z" }),
    ]);
    expect(s).toEqual({ bottles: 5, place: "Rack A", drunk: 0, bought: 5, addedMonth: "Mar 2022", lotsWord: "two lots", firstLotId: "old" });
    expect(stripLine(s!, { phone: false })).toBe("Rack A · added Mar 2022 · two lots");
  });
  it("no place, one bottle", () => {
    const s = stripSummary([lot({ id: "a" })]);
    expect(s?.place).toBeNull();
    expect(stripTitle(s!)).toBe("You own 1 bottle");
    expect(stripLine(s!, { phone: false })).toBe("added Jan 2024 · one lot");
  });
  it("null with no lots", () => {
    expect(stripSummary([])).toBeNull();
  });
});
```

**Steps**
- [ ] Write the test; run — fails; implement; run — green; tsc; eslint.

**Acceptance:** the test is green; `rg -n 'from "next' src/lib/cellar/own-lots.ts` prints nothing.

**Closes:** spec §4 (`getOwnLotsForWine`), §6.2 item 3 (the strip's data and line).

---

### CC-D2 — `getLotSheet` and the lot server actions

**Depends on:** CC-D1, CC-D3, CC-P3

**OWNS**
- create `src/lib/cellar/lot-sheet.ts`
- create `src/app/cellar/lot-actions.ts`

**Does** (spec §4 "lot-sheet.ts", "Server actions in src/app/cellar/lot-actions.ts"; D3, D7, D8; refinements 3, 4, 21)
- `getLotSheet(supabase, lotId, viewerId)` (refinement 21: owner-only):
  1. The lot: `cellar_lots.select(LOT_SELECT).eq("id", lotId).maybeSingle()`; return `null` unless `owner_id === viewerId`.
  2. Community rating for the row: `catalog_wine_ratings` for that wine.
  3. Yours (D3): `wset_notes.select("*").eq("author_id", viewerId).eq("catalog_wine_id", wineId).not("quality_score", "is", null).order("tasted_on", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle()`; its aromas `wset_note_aromas.select("term_id, sensed_on_nose, sensed_on_palate").eq("note_id", id)`; `assessed` = `summarizeNoteRow(row as WsetNoteRow, aromas, wine.style)` from `@/lib/wset/note-summary` (`done`, `total`); `band` = `qualityBand(score)` from `@/lib/wset/quality-curve.mjs`.
  4. Community spread (D7): `wset_notes.select("quality_score, author_id").eq("catalog_wine_id", wineId).not("quality_score", "is", null).limit(1000)` (identified notes are readable by every signed-in user) and `friendships.select("friend_id").eq("user_id", viewerId)` → `ratingSpread(notes, friendIds)`.
  5. History: `cellar_consumptions.select("id, consumed_on, reason, quantity, occasion, wset_note_id, created_at").eq("lot_id", lotId).order("consumed_on", { ascending: false }).order("created_at", { ascending: false })`; scores via `wset_notes.select("id, quality_score").in("id", …)`; tastings via `tastingLinksFor` (D8).
  6. `inFlight` for the row: `wine_pour_intents` with `cellar_lot_id = lotId` and `cellar_consumption_id is null`, counted.
  7. Return `LotSheetData`.
- `lot-actions.ts` (`"use server"`; every action `auth.getUser()` first and returns `{ error: "You must be signed in." }` without one):
  - `loadLotSheet(lotId)` → `getLotSheet(supabase, lotId, user.id)`; a non-UUID id → `null`.
  - `updateLot(lotId, fields)`: validate — `quantity` an integer ≥ 0; `bottleSizeMl` one of 375, 750, 1500, 3000 or any integer 50–20000; `pricePerBottle` null or a finite number ≥ 0; `currency` three letters, upper-cased (default "DKK"); `purchasedOn` null or `YYYY-MM-DD`; `drinkFrom`/`drinkTo` null or integers 1900–2100 with `drinkTo ≥ drinkFrom` when both ("Drink-to year can't be before drink-from." — the old form's message); strings trimmed, empty → null. Write `cellar_lots.update({...}).eq("id", lotId).eq("owner_id", user.id)`; on success `revalidatePath("/cellar")` and return `null`.
  - `addBottles(lotId, n)`: `n` an integer 1–999; delegate to `increaseCellarLotQuantity(lotId, n)` from `@/app/cellar/new/actions` (it already adds to both `quantity` and `purchased_quantity` and checks the owner); map a thrown error to `{ error }`.
  - `deleteLot(lotId)`: `cellar_lots.delete().eq("id", lotId).eq("owner_id", user.id)`; `revalidatePath("/cellar")`.
  - `mergeStorageLocations(from, to)` (refinement 3): `from` non-empty, every entry a non-blank string, `to` non-blank; `cellar_lots.update({ storage_location: to }).eq("owner_id", user.id).in("storage_location", from).select("id")` → `{ merged: rows.length }`; `revalidatePath("/cellar")`.
  - `getLiveTastingName()`: `tasting_participants.select("tasting_id").eq("user_id", user.id).eq("status", "JOINED")` → ids; then two reads on `tastings` with `.select("id, name, created_at").eq("status", "IN_PROGRESS").eq("timing_mode", "LIVE")` — one `.eq("host_id", user.id)`, one `.in("id", ids)` (skipped when empty) — merged, newest `created_at` first; `null` when none.

**Interfaces — produces**
```ts
// src/lib/cellar/lot-sheet.ts
export async function getLotSheet(supabase: SupabaseClient<Database>, lotId: string, viewerId: string): Promise<LotSheetData | null>;

// src/app/cellar/lot-actions.ts  ("use server")
export type LotFields = {
  quantity: number; bottleSizeMl: number; pricePerBottle: number | null; currency: string; purchasedOn: string | null;
  purchaseSource: string | null; drinkFrom: number | null; drinkTo: number | null; storageLocation: string | null; lotNote: string | null;
};
export async function loadLotSheet(lotId: string): Promise<LotSheetData | null>;
export async function updateLot(lotId: string, fields: LotFields): Promise<{ error: string } | null>;
export async function addBottles(lotId: string, n: number): Promise<{ error: string } | null>;
export async function deleteLot(lotId: string): Promise<{ error: string } | null>;
export async function mergeStorageLocations(from: readonly string[], to: string): Promise<{ error: string } | { merged: number }>;
export async function getLiveTastingName(): Promise<{ id: string; name: string } | null>;
```

**Tests:** none new (`rating-spread.test.ts` covers the spread; the validation rules are exercised in CC-V3). Keep every validation in one small `validateLotFields(fields): { error: string } | LotFields` function inside `lot-actions.ts` so CC-V2 can read it in one place.

**Steps**
- [ ] Write `lot-sheet.ts`, then `lot-actions.ts`; `npx tsc --noEmit`; `npx eslint src/lib/cellar/lot-sheet.ts src/app/cellar/lot-actions.ts --max-warnings=0`.

**Acceptance:** `rg -n '"use server"' src/app/cellar/lot-actions.ts` matches line 1; `rg -n "owner_id" src/app/cellar/lot-actions.ts` shows every write scoped by `.eq("owner_id", user.id)` (inspect); `rg -n "estimated_price" src/lib/cellar/lot-sheet.ts src/app/cellar/lot-actions.ts` prints nothing; `rg -n "occasion" src/lib/cellar/lot-sheet.ts` shows no comparison (D8).

**Closes:** spec §4 (`lot-sheet.ts`, the server actions), D3 (the sheet), D7, D8 (the lot's history), D1 (the merge write).

---

### CC-D4 — `getCollectionStats`

**Depends on:** CC-D1, CC-P5

**OWNS**
- create `src/lib/cellar/collection.ts`

**Does** (spec §4 "collection.ts")
- `getCollectionStats(supabase, ownerId)` = `collectionStats(await getCellarBottles(supabase, ownerId, ownerId, { readOnly: false }))`. The owner's own rows, so `yours` is populated (the "tasted" and "your average" numbers need it). Nothing else is read.

**Interfaces — produces**
```ts
// src/lib/cellar/collection.ts
export async function getCollectionStats(supabase: SupabaseClient<Database>, ownerId: string): Promise<CollectionStats>;
```

**Tests:** none (`collection-math.test.ts` covers the maths).

**Steps**
- [ ] Write it; `npx tsc --noEmit`; `npx eslint src/lib/cellar/collection.ts --max-warnings=0`.

**Acceptance:** `rg -n "from\(" src/lib/cellar/collection.ts` prints nothing (no direct read of its own).

**Closes:** spec §4 (`collection.ts`).

---

## Track CC-U — The cellar UI

Every UI task: `"use client"` where it holds state; controlled inputs only; theme tokens only (no hex); 44 px tap targets on phones (`min-h-11`, `md:pointer-fine:min-h-0` where a laptop control may be shorter); light and dark both (run the page in both themes before reporting done — the theme menu, or `resize_window colorScheme` in the Browser pane); copy verbatim from `handoff-screens.md` unless the Plan copy table says otherwise, with `(plan copy)` comments where it does. "Phone" is below `md` (Tailwind `max-md:`), "laptop" is `md` and up; the list's table appears at `lg` and up (the current breakpoint). Lucide icons only.

---

### CC-U1 — Sub-nav, dimension strip, toolbar

**Depends on:** CC-P1

**OWNS**
- create `src/app/cellar/cellar-sub-nav.tsx`
- create `src/app/cellar/dimension-strip.tsx`
- create `src/app/cellar/cellar-toolbar.tsx`

**Does** (spec §3 "The three cellar pages share a sub-nav row", §5.1 dimension strip and toolbar)

**`CellarSubNav`** (server-safe, no hooks)
```ts
export function CellarSubNav({ current }: { current: "bottles" | "history" | "collection" }): React.JSX.Element;
```
- A `<nav aria-label="Cellar sections">` row (`flex flex-wrap gap-2`) of three `Link`s: "Bottles" → `/cellar`, "History" → `/cellar/history`, "The collection" → `/cellar/collection`. Each `inline-flex min-h-11 items-center rounded-[9px] border px-3 text-sm font-medium md:pointer-fine:min-h-9`; the current one `border-primary bg-primary text-primary-foreground` with `aria-current="page"`, the others `border-border text-muted-foreground hover:bg-muted hover:text-foreground`.

**`DimensionStrip`** (client)
```ts
export function DimensionStrip({ counts, active, onPick, readOnly }: {
  counts: DimensionCounts; active: GroupKey; onPick: (g: GroupKey) => void; readOnly: boolean;
}): React.JSX.Element;
```
- `grid grid-cols-4 gap-2 md:grid-cols-5 md:gap-3`; five tiles from `DIMENSIONS` in order; the `vintages` tile `max-md:hidden` (phone: four across; vintage lives inside Filter). Each tile a `<button type="button" aria-pressed={active === DIMENSION_GROUP[d]}>` with `min-h-11 md:pointer-fine:min-h-0 rounded-xl border bg-card p-2.5 text-left md:p-4`; inside, the count in `font-heading text-2xl font-semibold tabular-nums md:text-3xl` and the label `tileLabel(d)` in `text-xs text-muted-foreground`; the active tile `border-primary ring-1 ring-primary`, the rest `border-border hover:border-border-strong`. Tap: `onPick(active === DIMENSION_GROUP[d] ? "none" : DIMENSION_GROUP[d])`.
- Under the grid, laptop only (`max-md:hidden`), `STRIP_CAPTION` in `text-[12.5px] leading-[1.5] text-muted-foreground`, with "groups the list" wrapped in `<span className="font-semibold text-foreground">` as the mock emphasises it.
- `readOnly` changes nothing visual; the tiles still group (spec §5.9 "grouping work").

**`CellarToolbar`** (client)
```ts
export type ToolbarProps = {
  search: string; onSearch: (q: string) => void; placeholder: string;
  group: GroupKey; onGroup: (g: GroupKey) => void;
  sort: SortKey; onSort: (s: SortKey) => void;
  filters: FilterState; onFilters: (f: FilterState) => void; options: FilterOptions;
  view: CellarView; onView: (v: CellarView) => void;
};
export function CellarToolbar(props: ToolbarProps): React.JSX.Element;
```
- Row 1 (`flex flex-wrap items-center gap-2`):
  - Search: `Input` (`type="search"`, `value={search}`, `onChange` → `onSearch`), a `Search` icon absolutely at the left, `min-w-56 flex-1 pl-9 min-h-11 md:pointer-fine:min-h-9`, `aria-label="Search bottles"`, `placeholder={placeholder}`.
  - Group: a labelled native `<select aria-label="Group">` — the visible label "Group" in `text-sm text-muted-foreground` before it (phone: the label hides, the select shows the current `GROUP_LABELS` value) — options `GROUP_ORDER` with `GROUP_LABELS`; `value={group}`; class `h-11 md:pointer-fine:h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground`.
  - Sort: the same shape, label "Sort", options `SORT_ORDER` with `SORT_LABELS`.
  - Filter: a `Popover` (`@/components/ui/popover`, whose content keeps `keepMounted`) whose trigger is a `Button variant="outline"` reading "Filter" with, when `filterCount(filters) > 0`, a `Badge` after it showing the count (`aria-label="{n} filters set"`). The content (`w-72 p-3 flex flex-col gap-3`) holds four labelled native selects — "Country", "Region", "Colour", "Grape" — from `options.country/region/colour/grape`, each option text `"{label} · {count}"` and an empty first option "Any"; and a fifth, "Vintage", `md:hidden`, from `options.vintage`. Changing country sets `{ ...filters, country, region: null }`; the others set their key. No text field, so no focus call.
  - The view switch, pushed right (`ml-auto`): two icon buttons in one bordered group (`List` "List view", `LayoutGrid` "Bottle view"), `aria-pressed`, `size-11 md:pointer-fine:size-9`, the active one `bg-primary text-primary-foreground`.
- Row 2, only when `filterChips(filters).length > 0`: the chips (`flex flex-wrap gap-2`): each a `<button type="button">` `inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-card px-3 text-sm md:pointer-fine:min-h-8` reading `{label}` with an `X` icon (`aria-label="Remove {label}"`), tap → `onFilters(clearFilter(filters, key))`; last, a ghost `Button` "Clear all" (plan copy) → `onFilters(EMPTY_FILTERS)`.

**Interfaces — consumes:** CC-P1's `DIMENSIONS`, `DIMENSION_GROUP`, `tileLabel`, `STRIP_CAPTION`, `GROUP_ORDER`, `GROUP_LABELS`, `SORT_ORDER`, `SORT_LABELS`, `filterCount`, `filterChips`, `clearFilter`, `EMPTY_FILTERS`, and the types.

**Tests:** none (components).

**Steps**
- [ ] `CellarSubNav`; `DimensionStrip`; `CellarToolbar`; `npx tsc --noEmit`; `npx eslint src/app/cellar/cellar-sub-nav.tsx src/app/cellar/dimension-strip.tsx src/app/cellar/cellar-toolbar.tsx --max-warnings=0`.

**Acceptance:** tsc and eslint clean; `rg -n "#[0-9a-fA-F]{6}\b" src/app/cellar/cellar-sub-nav.tsx src/app/cellar/dimension-strip.tsx src/app/cellar/cellar-toolbar.tsx` prints nothing; `rg -n "defaultValue|uncontrolled" src/app/cellar/cellar-toolbar.tsx` prints nothing.

**Closes:** spec §3 (sub-nav), §5.1 (dimension strip, toolbar); screens C1, C1b, C3 (the "Group" dropdown), C3b ("Group ▾").

---

### CC-U2 — List rows, grid cards, row actions

**Depends on:** CC-P0, CC-P1

**OWNS**
- create `src/app/cellar/bottle-list.tsx`
- create `src/app/cellar/bottle-grid.tsx`
- create `src/app/cellar/row-actions.tsx`

**Does** (spec §5.2, §5.3, §5.4 headers and phone sticky headers, §5.9)

Shared callbacks (both renders):
```ts
export type RowCallbacks = {
  onOpenLot: (lotId: string, mode?: "view" | "edit") => void; // phone tap on a row/card; ⋯ "Open the lot" / "Edit lot"
  onDrink: (lotId: string) => void;                            // Drink / Drink one
  onRate: (wineId: string) => void;                            // Rate / Rate it / Note (NewNoteModal on the wine)
  onOpenNote: (noteId: string, wineId: string) => void;        // your score → NoteModal
};
export type SectionHeader = { label: string; sublabel: string | null; line: { phone: string; laptop: string } };
export type Section = { key: string; header: SectionHeader | null; rows: BottleRow[] };
```
The frame hands both renders `sections: Section[]` — one section with `header: null` when ungrouped, else one per shown group with its `groupHeaderLine` computed for both widths; the component renders `line.phone` under `md:hidden` and `line.laptop` under `max-md:hidden`. Both types are exported from `row-actions.tsx` so the list, the grid and the frame import one definition.

**`RowActions`** (`row-actions.tsx`, client)
```ts
export function RowActions({ lotId, wineId, readOnly, compact, cb }: { lotId: string; wineId: string; readOnly: boolean; compact?: boolean; cb: RowCallbacks }): React.JSX.Element | null;
```
- `null` when `readOnly`. Otherwise `flex items-center gap-1.5`: `Button size="sm"` "Drink" (grid: "Drink one") → `cb.onDrink(lotId)`; `Button size="sm" variant="outline"` "Rate" (grid: "Note") → `cb.onRate(wineId)`; a `DropdownMenu` whose trigger is `Button size="icon-sm" variant="ghost" aria-label="More"` with `MoreHorizontal`, items "Open the lot" → `cb.onOpenLot(lotId)`, "Open in catalog" (a `Link` to `/catalog/{wineId}` through the item's `render`), "Edit lot" → `cb.onOpenLot(lotId, "edit")`.
- The parent row/card shows it on hover and focus: the wrapper gets `opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-md:hidden` — laptop only; on phones the row itself opens the sheet.

**`BottleList`** (`bottle-list.tsx`, client)
```ts
export function BottleList({ sections, group, readOnly, cb }: { sections: Section[]; group: GroupKey; readOnly: boolean; cb: RowCallbacks }): React.JSX.Element;
```
Laptop table (`hidden lg:block`, `rounded-xl border border-border`, `<table className="w-full table-fixed text-sm">`, `colgroup`: Wine (auto), Bottles `w-[7rem]`, Where `w-[11rem]`, Ratings `w-[9rem]`):
- `thead`: "Wine", "Bottles", "Where", and for Ratings the two-word header `Yours · Community` with "Yours" in `text-primary` and "Community" in `text-gold-dark` (readOnly: "Community" alone). Header text `text-xs tracking-wide text-muted-foreground`.
- A group header row (when `section.header`): one `<td colSpan={4}>` carrying `label` in `font-heading text-base font-semibold` (+ ` · {sublabel}` in `text-muted-foreground` for a region), then `line.laptop` in `text-xs text-muted-foreground`; background `bg-muted/40`.
- A row per bottle (`group` class, `border-b border-border align-top hover:bg-muted/30`), from `const l = rowLines(row, group)`:
  - Wine: `l.producer` (`text-xs text-muted-foreground`, omitted when null); the title as a `Link` to `/catalog/{wineId}` in `font-medium text-foreground`; `l.facts` (`text-xs text-muted-foreground`); the place line: `<CountryFlag name={l.place.country ?? row.wine.country} />` before the region only when `l.place.region` is shown, then `placeText(l.place)` — the flag stays even under a country grouping (the mock prints "Piedmont" plain only because flags were not worth drawing); omitted entirely when `placeText` is null. Below, when `row.inFlight > 0`, `inFlightLine(row.inFlight)` in `text-xs font-medium text-gold-dark`.
  - Bottles: `countTimes(quantity)` in `tabular-nums`; below it, one of: `drunkLine(lot)` (`text-xs text-muted-foreground`) when purchased > quantity; `"last one"` (`text-xs text-gold-dark`) when quantity is 1; else `sizeLabel(bottleSizeMl)` (`text-xs text-muted-foreground`) — the mock shows "750 ml" on a plain row, "3 of 6 drunk" on a part-drunk one, "last one" on the last bottle, "1.5 L magnum" on a magnum: size shows when neither of the other two applies, and a magnum's size shows in the Where cell's second line instead when one does.
  - Where: `l.where` (`truncate`; a dash when null and ungrouped; nothing under "where"); second line `"added {addedMonth(lot)}"` in `text-xs text-muted-foreground`.
  - Ratings: a flex row: Yours — when `row.yours`, a `<button type="button">` in `font-semibold text-primary tabular-nums` reading `fmtScore(score)` → `cb.onOpenNote(noteId, wineId)`; when untasted and not readOnly, a `<button>` "Rate it" in `text-xs text-muted-foreground underline-offset-2 hover:underline` → `cb.onRate(wineId)`; readOnly untasted shows nothing. Community — `<Star className="size-3.5 text-gold-deep" />` then `fmtAvg(avg)` in `font-semibold text-gold-dark tabular-nums`; a dash in `text-muted-foreground` when `avg` is null. Under readOnly the Yours half is absent.
  - `RowActions` floats at the row's right inside the Ratings cell (`absolute right-2 top-1/2 -translate-y-1/2` on a `relative` cell) so no column is reserved for it.
Phone rows (`lg:hidden`, `flex flex-col gap-2`):
- Group header (when `section.header`): `sticky top-0 z-10 bg-background/95 backdrop-blur py-2` with `label` (+ sublabel) and `line.phone`.
- Each row a `<button type="button" className="group flex min-h-11 w-full items-start gap-3 rounded-xl border border-border p-3 text-left">` → `cb.onOpenLot(lotId)` (readOnly: a `Link` to `/catalog/{wineId}` instead). Content: `l.producer`; the title (`font-medium`); `l.facts`; flag + `placeText(l.place)`; the count line `"{countTimes} {sizeLabel} · {where}"` with the drunk line in place of the size when it applies (`"3 × · 3 of 6 drunk · rack B"`) — C1b; `inFlightLine(n, { phone: true })` in `text-gold-dark`; right column: yours (`text-primary font-semibold`) over community (`text-gold-dark font-semibold`), a dash for either that is missing. Under a grouping, C3b's compact form: title, then `"{producer} · {countTimes}"`, then the two scores (with "Rate" in place of a missing yours) — implement as: when `group !== "none"` the phone row shows `l.title`, `"{l.producer ?? row.wine.producer} · {countTimes}"` and the score column only.
- Empty sections render nothing; the frame handles the empty state.

**`BottleGrid`** (`bottle-grid.tsx`, client)
```ts
export function BottleGrid({ sections, group, readOnly, cb }: { sections: Section[]; group: GroupKey; readOnly: boolean; cb: RowCallbacks }): React.JSX.Element;
```
- Per section, an optional header (same content as the list's, `sticky top-0` on phones) then `grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4`.
- Card (`group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card`): the image panel `flex h-48 items-end justify-center p-3 sm:h-56` with the `.hatch` utility as the empty fallback (`<Wine />` centred over it) and `<img loading="lazy" className="h-full w-auto max-w-[80%] object-contain drop-shadow-md">` when `imageUrl`; the corner badge (`absolute left-2 top-2`, `Badge variant="secondary"`): `"Tonight"` when `inFlight > 0` (gold: `bg-gold/15 text-gold-dark`), else `"last one"` when quantity is 1, else `"{n} bottles"` — phone: `"Tonight"`, else the bare number (C2b).
- Text: the title (`font-medium leading-tight truncate`); `"{producer} · {storage}"` (laptop; storage omitted when null; C2 shows the size instead of the place for a magnum — `"{producer} · 1.5 L"`: when `bottleSizeMl !== 750` the second part is `sizeLabel` without its word, i.e. "1.5 L"); phone: producer only.
- Foot (laptop, `flex items-end justify-between border-t border-border p-3`): left "Yours" eyebrow over `fmtScore` (bordeaux) and `monthYear(tastedOn)` (`text-xs text-muted-foreground`) — or a "Rate it" button when untasted and not readOnly; right `fmtAvg(avg)` (gold, with the star) over `"{n} notes"` (`plural(count, "note", "notes")`). Phone foot: one line `"{yours} yours · {avg}"` with "Rate it" for a missing yours.
- Hover action row (laptop, `max-md:hidden`, `opacity-0 group-hover:opacity-100 focus-within:opacity-100`): `RowActions compact` ("Drink one", "Note", ⋯).
- The whole card is a `<button>` on phones → `cb.onOpenLot(lotId)`; on laptops the image and title `Link` to `/catalog/{wineId}` and the action row carries the actions. readOnly: the whole card links to the catalog page at every width.

**Interfaces — consumes:** CC-P0's `format.ts`, CC-P1's `rowLines`, `placeText`; `CountryFlag`, `Badge`, `Button`, `DropdownMenu*`.

**Tests:** none (components).

**Steps**
- [ ] `row-actions.tsx`; `bottle-list.tsx`; `bottle-grid.tsx`; tsc; eslint on the three.

**Acceptance:** tsc and eslint clean; `rg -n "drinkFrom|drinkTo|readiness|valuePerBottle|price" src/app/cellar/bottle-list.tsx src/app/cellar/bottle-grid.tsx src/app/cellar/row-actions.tsx` prints nothing; `rg -n "#[0-9a-fA-F]{6}\b" <the three>` prints nothing; `rg -n "min-h-11" src/app/cellar/bottle-list.tsx src/app/cellar/bottle-grid.tsx` matches (phone rows and cards).

**Closes:** spec §5.2, §5.3, §5.4 (the rendered headers), §5.9 (row/card readOnly); screens C1, C1b, C2, C2b, C3, C3b, C3c, C3d.

---

### CC-U4 — The lot sheet

**Depends on:** CC-D2, CC-P3

**OWNS**
- create `src/app/cellar/lot-sheet.tsx`
- create `src/app/cellar/lot-edit-form.tsx`

**Does** (spec §5.5, D6; refinements 4, 12, 13)

**`LotSheet`** (client)
```ts
export type LotSheetProps = {
  lotId: string | null;                   // null = closed
  initialMode: "view" | "edit";
  onClose: () => void;
  onDrink: (row: BottleRow) => void;      // the frame opens DrinkSheet over this sheet
  onRate: (wineId: string, consumptionId: string | null) => void; // NewNoteModal; consumptionId links a past drink's note
  onOpenNote: (noteId: string, wineId: string) => void;            // NoteModal
  onChanged: () => void;                  // after update / add / delete: the frame router.refresh()es
  reloadKey: number;                      // bump to reload after a drink logged over the sheet
};
export function LotSheet(props: LotSheetProps): React.JSX.Element | null;
```
- State: `data: LotSheetData | null | "loading" | "failed"`, `mode: "view" | "edit"`, `adding: boolean`, `addCount: string` ("1"), `pending`, `error`, `menuOpen` (phone ⋯). `useEffect` on `[lotId, reloadKey]`: `loadLotSheet(lotId)` → data (cancelled flag as `NoteModal`). `mode` resets to `initialMode` whenever `lotId` changes.
- `Dialog open={lotId !== null} onOpenChange={(o) => { if (!o) props.onClose(); }}` with `DialogContent showCloseButton={false}` classed like `tasting-settings-sheet.tsx` (`inset-0 … rounded-none p-0` on phones; `sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[88vh] sm:w-[calc(100vw-3rem)] sm:max-w-[640px] … sm:rounded-2xl`), `bg-card text-foreground`, `flex flex-col`. Escape and the backdrop close (the Dialog's own behaviour). Body scrolls (`min-h-0 flex-1 overflow-y-auto overscroll-contain`) under a fixed footer.
- **Header** (`shrink-0 border-b border-border p-[12px_16px] md:p-[20px_24px_16px]`): `Eyebrow` "In your cellar"; `DialogTitle` `lotTitle(row.wine)` (`font-heading text-[20px] md:text-[27px]`); the line `[primaryGrape, colourWord(colour), appellation, region and country as "{region}, {country}"].filter(Boolean).join(" · ")` in `text-sm text-muted-foreground`; a `Link` to `/catalog/{wineId}` reading "Catalog →"; a close `X` button (`size-11`, `aria-label="Close"`).
- **Two score cards** (`grid grid-cols-2 gap-3` at every width; each `rounded-xl border border-border bg-background p-3`):
  - "Your note" (`Eyebrow`): with `data.yours` — the score `font-heading text-3xl text-primary`, the band (`text-sm`), the line `"Written {dayMonthYear(tastedOn)} · {done} of {total} assessed"` (`max-md:hidden`) / `"{dayMonthYear} · {done} of {total}"` (`md:hidden`) in `text-xs text-muted-foreground`; a `Button variant="outline" size="sm"` "Open the note" → `onOpenNote`, then ` or ` and a link-styled button "write another" → `onRate(wineId, null)` (laptop only, `max-md:hidden`). Untasted: a dash and a `Button size="sm"` "Rate it" → `onRate(wineId, null)`.
  - "Community rating": `fmtAvg(avg)` in `font-heading text-3xl text-gold-dark`; `spreadLine(community, { phone })` rendered twice (`max-md:hidden` / `md:hidden`); a `Link` "Read them" to `/catalog/{wineId}`; `friendsLine(community)` (`max-md:hidden`, `text-xs text-muted-foreground`) when not null. With no notes: "No notes yet" is NOT plan copy — render the dash and "Read them" only.
- **Facts grid** (`grid grid-cols-2 gap-3 sm:grid-cols-4`; each fact an `Eyebrow` label, a `font-medium` value, a `text-xs text-muted-foreground` sub):
  - Bottles: `"{quantity} left"` / `"of {purchasedQuantity} bought"`.
  - Size: `sizeLabel` / `sizeSub` ("standard" for 750, else nothing).
  - Where: `storageLocation ?? "No place set"` / "free text — group by it".
  - Added: `addedMonth(lot)` / `"from {purchaseSource}"` when set.
  - Paid (only when `pricePerBottle != null`): `"{price} {currency} a bottle"` (price via `toLocaleString()` with at most two decimals) / nothing. Nothing else about money anywhere in the sheet (D4).
- **"This lot so far"** (`Eyebrow`): `data.history` newest first, each `flex items-baseline gap-2 text-sm`: `dayMonthYear(consumedOn)` (`text-muted-foreground tabular-nums`), then the sentence — DRANK with a tasting: `"Drank {n} at "` + a `Link` to `/tastings/{id}` reading the tasting's name; DRANK: `"Drank {n} · {occasion}"` (or just `"Drank {n}"`); GIFTED: `"Gifted {n} · {occasion}"`; LOST: `"Lost {n}"` (+ ` · {occasion}`); OTHER: `"Removed {n}"` (+ ` · {occasion}`) — the LOST/OTHER words match CC-P4's `actionWord`; then `" · "` and either a `<button>` `"note {score}"` → `onOpenNote(note.id, wineId)` (or `"note"` alone when the note has no score) or `"no note"` in `text-muted-foreground` followed by a `Button variant="ghost" size="xs"` "+ Note" → `onRate(wineId, consumption.id)`. Empty: "Nothing has left this lot yet." (plan copy).
- **Lot note**: `Eyebrow` "Your note on this lot." then `lotNote` in `text-sm whitespace-pre-line` (an em dash when null), and a `Button variant="ghost" size="sm"` "Edit" → `setMode("edit")`.
- **Drink window** (`flex items-center gap-2 text-sm`): `Eyebrow` "Drink window"; `"{drinkFrom}–{drinkTo}"` (`?` for a missing end; both null → "No window yet", plan copy); `"· yours, and shown only here"` in `text-muted-foreground`; an "Edit" ghost button → `setMode("edit")` (the form focuses "Drink from" — pass `focus: "drinkFrom"`). This is the only place a drink window renders anywhere (Global Constraints).
- **Add bottles** (inline, when `adding`): a row `"How many to add"` (plan copy) with a 44 px stepper (`Minus` / value / `Plus`, `min 1`) bound to `addCount`, and a `Button` "Add" → `addBottles(lotId, n)` → on `null`: `setAdding(false)`, bump reload, `onChanged()`; on `{ error }`: show it under the row (`role="alert"`, `text-destructive`).
- **Footer** (`shrink-0 border-t border-border bg-background p-[11px_16px] pb-[max(22px,env(safe-area-inset-bottom))] md:p-[16px_24px]`):
  - Laptop (`max-md:hidden`, `flex justify-end gap-2`): `Button variant="outline"` "Edit lot" → `setMode("edit")`; `Button variant="outline"` "Add bottles" → `setAdding(true)`; `Button` "Drink one" → `onDrink(row)` (disabled while `quantity === 0`).
  - Phone (`md:hidden`, `flex gap-2`): `Button className="min-h-11 flex-1"` "Drink one"; `Button variant="outline" className="min-h-11 flex-1"` "Open the note" (when `yours`) or "Rate it"; a `DropdownMenu` (`Button variant="outline" size="icon-lg" aria-label="More"` with `MoreHorizontal`) holding "Add bottles" → `setAdding(true)` (the row appears in the body; scroll it into view), "Edit lot" → `setMode("edit")`, and "Delete lot" as the two-tap: the first tap arms it and the item re-labels "Tap again to delete" (plan copy) for `TWO_TAP_WINDOW_MS`; the second calls `deleteLot(lotId)` → `onChanged()` then `onClose()`. Menu items `min-h-11`.
- **Edit mode**: the body is replaced by `<LotEditForm …/>` (below); the footer by its own Save/Cancel; the header keeps the title with the eyebrow reading "Edit lot".
- Loading: "Loading…" centred; failure: "Couldn't load this lot right now." (both plan copy, as `NoteModal`'s).

**`LotEditForm`** (`lot-edit-form.tsx`, client)
```ts
export function LotEditForm({ lotId, initial, focus, onSaved, onCancel, onDeleted }: {
  lotId: string; initial: LotFields; focus?: "drinkFrom" | null; onSaved: () => void; onCancel: () => void; onDeleted: () => void;
}): React.JSX.Element;
```
- Controlled string state per field (`quantity`, `bottleSize` as a `<select>` of 375 / 750 / 1500 / 3000 labelled "375 ml half" / "750 ml" / "1.5 L magnum" / "3 L double magnum" via `sizeLabel`, plus the current value when it is none of those; `price`; `currency`; `purchasedOn` (`type="date"`); `purchaseSource`; `drinkFrom`; `drinkTo`; `storageLocation`; `lotNote` as a `Textarea`), each with a `Label` — "Bottles", "Format", "Price / bottle", "Currency", "Purchased", "Source", "Drink from", "Drink to", "Storage location", "Private note" (the old form's labels, kept). Two-column grid as the old form. `focus === "drinkFrom"` sets `autoFocus` on that input — this is a plain form inside an already-open dialog, not a combobox, so the synchronous-focus rule for popovers does not apply.
- Save → `updateLot(lotId, fields)` (numbers parsed here; empty → null); `{ error }` renders `role="alert"`; `null` → `onSaved()`. Cancel → `onCancel()`. Under the fields, laptop only (`max-md:hidden`; the phone has the menu): `Button variant="destructive"` "Delete lot" → the two-tap ("Tap again to delete"), then `deleteLot(lotId)` → `onDeleted()`.
- Footer (rendered by `LotSheet` when in edit mode, from this form via a `formId` and `<form id>`): `Button variant="outline"` "Cancel", `Button type="submit" form={formId}` "Save changes".

**Interfaces — consumes:** CC-D2's actions and `LotFields`; CC-P3's lines; CC-P0's format; `qualityBand` is already in `LotSheetData.yours.band`; `Dialog*`, `Eyebrow`, `Button`, `Input`, `Label`, `Textarea`, `DropdownMenu*`, `twoTapState`/`TWO_TAP_WINDOW_MS` from `@/lib/console-copy`.

**Tests:** none (components; CC-V3 walks every state).

**Steps**
- [ ] `lot-edit-form.tsx`; `lot-sheet.tsx`; tsc; eslint on both; open the sheet in both themes at 375 and 1280 once CC-U3 lands (CC-U3's step), not here.

**Acceptance:** tsc and eslint clean; `rg -n "window\.confirm" src/app/cellar/lot-sheet.tsx src/app/cellar/lot-edit-form.tsx` prints nothing; `rg -n "estimated|retail|value" src/app/cellar/lot-sheet.tsx` prints nothing; `rg -n "drinkFrom" src/app/cellar/lot-sheet.tsx src/app/cellar/lot-edit-form.tsx` matches (the one place); `rg -n "Paid" src/app/cellar/lot-sheet.tsx` shows it inside a `pricePerBottle != null` branch (inspect).

**Closes:** spec §5.5, D6 (the sheet half), D3/D7/D8 (rendered); screens C4, C4b.

---

### CC-U5 — The drink sheet and `NewNoteModal.consumptionId`

**Depends on:** CC-D2

**OWNS**
- create `src/app/cellar/drink-sheet.tsx`
- create `src/app/cellar/drink-copy.ts`, `src/app/cellar/drink-copy.test.ts`
- modify `src/components/new-note-modal.tsx` (add and forward `consumptionId` only)

**Does** (spec §5.6, D2; refinements 6, 12, 14)

**`drink-copy.ts`** (pure; runtime import only `../../lib/cellar/format` and `../../lib/count-words`)
```ts
export type DrinkReason = "DRANK" | "GIFTED" | "LOST" | "OTHER";
export const REASONS: readonly DrinkReason[];                       // DRANK, GIFTED, LOST, OTHER
export const REASON_LABELS: Record<DrinkReason, string>;           // "Drank", "Gifted", "Lost", "Other"
export type WhenChoice = "today" | "yesterday" | "date";
export const WHEN_LABELS: Record<WhenChoice, string>;              // "Today", "Yesterday", "Pick a date"
export function isoDate(d: Date): string;                          // local YYYY-MM-DD
export function dateFor(choice: WhenChoice, picked: string, now: Date): string; // today/yesterday from `now`, else `picked`
export function leftLine(quantity: number, n: number): { of: string; left: string; after: string }; // "of 3 ·", "2 left", "after this"
export function confirmLabel(reason: DrinkReason, n: number): string; // "Drink one bottle", "Drink two bottles", "Gift one bottle", "Write off one bottle", "Take out one bottle"
export function subtitleLine(o: { quantity: number; place: string | null; community: { avg: number | null; count: number } }): string;
  // "3 in the cellar · rack B · community 92.6 from 33 notes" — the place part only when set; the community part only when count > 0
export function liveChipLabel(name: string): string;               // "{name} — live now"
export const TITLE = "Take it out of the cellar";
export const HOW_MANY = "How many";
export const WHAT_HAPPENED = "What happened to it";
export const WHEN = "When";
export const WHAT_FOR = "What for";
export const OPTIONAL = "optional";
export const WHAT_FOR_PLACEHOLDER = "Sunday lamb, someone’s birthday…";
export const NOTE_AFTER = "Write a note about it after";
export const NOTE_AFTER_SUB = " — opens the tasting note with this wine filled in.";
export const LOGGED_NOTE = "Logged, not deleted. It stays in History.";
export const CANCEL = "Cancel";
```

**Tests (write first)** — `src/app/cellar/drink-copy.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { REASONS, confirmLabel, dateFor, isoDate, leftLine, liveChipLabel, subtitleLine } from "./drink-copy";

describe("drink-copy", () => {
  it("confirm names the count and the reason word", () => {
    expect(confirmLabel("DRANK", 1)).toBe("Drink one bottle");
    expect(confirmLabel("DRANK", 2)).toBe("Drink two bottles");
    expect(confirmLabel("DRANK", 12)).toBe("Drink 12 bottles");
    expect(confirmLabel("GIFTED", 1)).toBe("Gift one bottle");
    expect(confirmLabel("LOST", 1)).toBe("Write off one bottle");
    expect(confirmLabel("OTHER", 3)).toBe("Take out three bottles");
    expect(REASONS).toEqual(["DRANK", "GIFTED", "LOST", "OTHER"]);
  });
  it("what is left after this", () => {
    expect(leftLine(3, 1)).toEqual({ of: "of 3 ·", left: "2 left", after: "after this" });
    expect(leftLine(3, 3)).toEqual({ of: "of 3 ·", left: "0 left", after: "after this" });
  });
  it("the subtitle drops what is missing", () => {
    expect(subtitleLine({ quantity: 3, place: "rack B", community: { avg: 92.6, count: 33 } })).toBe("3 in the cellar · rack B · community 92.6 from 33 notes");
    expect(subtitleLine({ quantity: 1, place: null, community: { avg: null, count: 0 } })).toBe("1 in the cellar");
    expect(subtitleLine({ quantity: 2, place: null, community: { avg: 88, count: 1 } })).toBe("2 in the cellar · community 88.0 from 1 note");
  });
  it("dates are local and relative to now", () => {
    const now = new Date(2026, 8, 17, 23, 30); // 17 Sep 2026, local
    expect(isoDate(now)).toBe("2026-09-17");
    expect(dateFor("today", "", now)).toBe("2026-09-17");
    expect(dateFor("yesterday", "", now)).toBe("2026-09-16");
    expect(dateFor("date", "2026-09-01", now)).toBe("2026-09-01");
  });
  it("the live chip", () => {
    expect(liveChipLabel("Nebbiolo vs Sangiovese")).toBe("Nebbiolo vs Sangiovese — live now");
  });
});
```

**`DrinkSheet`** (client)
```ts
export type DrinkLot = { lotId: string; wineId: string; title: string; quantity: number; place: string | null; community: { avg: number | null; count: number } };
export function DrinkSheet({ lot, onClose, onDone }: {
  lot: DrinkLot | null;                                       // null = closed
  onClose: () => void;
  onDone: (r: { consumptionId: string; openNote: boolean; wineId: string }) => void; // the frame opens NewNoteModal when openNote
}): React.JSX.Element | null;
```
- State: `qty` (number, 1), `reason` ("DRANK"), `when` ("today"), `picked` (`isoDate(new Date())`), `occasion` (""), `alsoNote` (true — D2), `pending`, `error`, `live: { id; name } | null`. On open (`lot` becomes non-null): reset state; `getLiveTastingName()` → `live`.
- `Dialog` + `DialogContent showCloseButton={false}`: phone — a bottom sheet: `inset-x-0 bottom-0 top-auto translate-x-0 translate-y-0 max-w-none rounded-t-2xl rounded-b-none p-0 max-h-[92vh]`; `sm:` — centred: `sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-w-[480px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl`. Escape / backdrop → `onClose`.
- Body (`flex flex-col gap-4 p-4 md:p-6`):
  - `DialogTitle` `TITLE`; the subtitle `lot.title` (`font-medium`); `subtitleLine(lot)` (`text-sm text-muted-foreground`).
  - `HOW_MANY` (`Eyebrow`): the stepper — `Button variant="outline" size="icon-lg"` with `Minus` (`aria-label="Fewer"`), the number (`font-heading text-2xl tabular-nums w-10 text-center`), `Plus` (`aria-label="More"`); each control `min-h-11 min-w-11` (refinement 6); `qty` clamped to 1…`lot.quantity`; beside it `leftLine(lot.quantity, qty)` as `of` (`text-muted-foreground`), `left` (`font-medium`), `after` (`text-muted-foreground`).
  - `WHAT_HAPPENED`: four `<button type="button" aria-pressed>` chips in a row, `REASON_LABELS`, `min-h-11 flex-1 rounded-[9px] border`, the pressed one `border-primary bg-primary text-primary-foreground`.
  - `WHEN`: three chips `WHEN_LABELS` the same way; when `when === "date"`, an `Input type="date" value={picked} aria-label="Date"` appears beneath.
  - `WHAT_FOR` + `OPTIONAL` (`text-xs text-muted-foreground`): `Input value={occasion} placeholder={WHAT_FOR_PLACEHOLDER}`; when `live`, a chip button beneath reading `liveChipLabel(live.name)` (`rounded-full border border-gold bg-gold/10 px-3 min-h-11 md:pointer-fine:min-h-8`) → `setOccasion(live.name)`.
  - When `reason === "DRANK"` (refinement 14): a `<label className="flex items-start gap-2 text-sm">` with `<input type="checkbox" checked={alsoNote} className="mt-0.5 size-4">`, `NOTE_AFTER` in `font-medium` and `NOTE_AFTER_SUB` in `text-muted-foreground`.
  - `error` as `role="alert"`.
- Footer (`flex items-center justify-between gap-3 border-t border-border p-4 pb-[max(16px,env(safe-area-inset-bottom))]`): `LOGGED_NOTE` (`text-xs text-muted-foreground`, laptop `max-md:hidden`; on phones it goes under the confirm button, `md:hidden`); `Button variant="ghost"` `CANCEL` → `onClose`; `Button` `confirmLabel(reason, qty)` (`min-h-11`) → submit.
- Submit: `consumeLot({ lotId, quantity: qty, consumedOn: dateFor(when, picked, new Date()), reason, occasion: occasion.trim() || null })` from `@/app/cellar/[lotId]/drink/actions`; on success `onDone({ consumptionId: id, openNote: alsoNote && reason === "DRANK", wineId })`; a thrown error → `error` = its message.

**`new-note-modal.tsx`**: add `consumptionId?: string | null` (default `null`) to the props, documented "a cellar drink this note is written for — `NoteEditor` back-links `cellar_consumptions.wset_note_id` on save", and pass `consumptionId={consumptionId}` to `<NoteEditor>`. Nothing else changes.

**Interfaces — consumes:** `consumeLot` (existing), CC-D2's `getLiveTastingName`. **Produces:** `DrinkSheet`, `DrinkLot`; `NewNoteModal({ …, consumptionId })`.

**Steps**
- [ ] `drink-copy.test.ts`; run — fails; `drink-copy.ts`; run — green.
- [ ] `drink-sheet.tsx`; the `new-note-modal.tsx` prop; tsc; eslint on the four files.

**Acceptance:** the test is green; `rg -n "consumptionId" src/components/new-note-modal.tsx` shows the prop and the forward; `rg -n 'from "@/' src/app/cellar/drink-copy.ts` prints nothing; `rg -n "window\.confirm|router\.push" src/app/cellar/drink-sheet.tsx` prints nothing.

**Closes:** spec §5.6, D2; screens C5, C5b.

---

### CC-U3 — The Bottles frame and `/cellar`

**Depends on:** CC-U1, CC-U2, CC-U4, CC-U5, CC-D1, CC-P2

**OWNS**
- create `src/app/cellar/cellar-bottles.tsx`
- modify `src/app/cellar/page.tsx`

**Does** (spec §3 routes, §5.1 frame, §5.4 merge notice, §5.9 readOnly, D5, D6; refinements 7, 8, 13, 17, 20)

**`page.tsx`** (server)
- `searchParams: Promise<{ tab?: string; lot?: string; do?: string }>`. `tab === "notes"` → `redirect("/taste/notes")`; `"history"` → `redirect("/cellar/history")`; `"stats"` → `redirect("/cellar/collection")` (D5). Any other `tab` is ignored.
- Auth (`redirect("/login")`), profile `select("cellar_visibility")` for the visibility control, `rows = await getCellarBottles(supabase, user.id, user.id, { readOnly: false })`, `stats = headerStats(rows)`.
- Render (`mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:p-6`):
  - `PageHeader title="Cellar"` with `subtitle` = two spans, `headerSubtitle(stats, { phone: false, readOnly: false })` under `max-md:hidden` and the phone form under `md:hidden`; `actions` = the existing `Link` to `/cellar/import` (label "Import CSV", `FileUp` icon; `min-h-11 md:pointer-fine:min-h-9`), the existing `AddWineButton kind="cellar"` ("Add a bottle", `Plus`), and `CellarVisibilityControl` beneath them (the existing component, unchanged).
  - `<CellarSubNav current="bottles" />`.
  - `<CellarBottles rows={rows} readOnly={false} />`.
- Imports nothing from the retired files (`cellar-tabs`, `cellar-summary`, `history-list`, `stats-panel`, `stats`, `cellar-bottles-table`).

**`CellarBottles`** (client; the frame)
```ts
export function CellarBottles({ rows, readOnly }: { rows: BottleRow[]; readOnly: boolean }): React.JSX.Element;
```
- State: `q` (""), `group: GroupKey` ("none"), `sort: SortKey` ("bottles"), `filters` (`EMPTY_FILTERS`), `view: CellarView` (lazy initializer: `readValue(() => window.localStorage, "cellar-view") === "grid" ? "grid" : "list"`, `"list"` on the server — the shipped pattern), `page` (1), `gridRest` (false), `groupsExpanded` (false), `openLot: { lotId: string; mode: "view" | "edit" } | null`, `drink: DrinkLot | null`, `note: { noteId: string; wineId: string } | null`, `rate: { wineId: string; consumptionId: string | null } | null`, `lotReload` (0), `merging` (false). Every input is controlled.
- Derivations (`useMemo`): `counts = dimensionCounts(rows)`; `filtered = applyFilters(rows, filters).filter(r => matchesSearch(r, foldSearch(q.trim())))`; `sorted = sortRows(filtered, sort)`; `options = filterOptions(rows, filters)`; `chips = filterChips(filters)`; `footStats = headerStats(filtered)`; when `group !== "none"`: `groups = groupRows(sorted, group)`, `{ shown, hidden } = visibleGroups(groups, groupsExpanded)`, `sections = shown.map(g => ({ key: g.key, header: { label: g.label, sublabel: g.sublabel, line: { phone: groupHeaderLine(group, g.stats, { phone: true, readOnly }), laptop: groupHeaderLine(group, g.stats, { phone: false, readOnly }) } }, rows: g.rows }))` — no row paging (refinement 8); when ungrouped: list → `pageSlice(sorted, page, LIST_PAGE)`; grid → `gridRest ? sorted : sorted.slice(0, GRID_PAGE)` (refinement 7); one section with `header: null`.
- Layout, top to bottom (`flex flex-col gap-4`):
  1. `<DimensionStrip counts active={group} onPick={g => { setGroup(g); setPage(1); setGroupsExpanded(false); }} readOnly />`.
  2. `<CellarToolbar …>` with `placeholder = searchPlaceholder(headerStats(rows).bottles, { phone })`, where `phone = useMediaQuery("(max-width: 767px)")` from `@/components/add-wine/use-camera` (an exported hook; importing it is not an add-wine change) — an `Input` has one placeholder, so the frame picks the width's string. Every toolbar setter resets `page` to 1 and `gridRest` to false.
  3. The merge notice (only when `group === "where"` and `!readOnly` and `mergeNotice(mergeGroups(rows.map(r => r.lot)))` is not null): a `Card` (`border-gold/40 bg-gold/10`) with the `title` in `font-heading font-semibold`, the `body` in `text-sm text-muted-foreground`, and a `Button` reading `button` ("Merge them") → for every merge group `mergeStorageLocations(variants.slice(1).map(v => v.spelling), target)` sequentially; then `router.refresh()`; `merging` disables the button; an error renders as `role="alert"`.
  4. The render: `view === "list" ? <BottleList sections group readOnly cb /> : <BottleGrid …/>`; when `sorted.length === 0` and `rows.length > 0`: a dashed card "Nothing to show" (plan copy) with a "Clear all" ghost button when chips or `q` are set.
  5. When grouped and `hidden > 0`: `Button variant="outline"` `showMoreLabel(hidden, group)` → `setGroupsExpanded(true)`.
  6. Footer (`flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground`): `footerLine({ chips, group, stats: footStats, readOnly })` left; right, ungrouped list: `pageLabel(page, pages)` between `ChevronLeft`/`ChevronRight` icon buttons (`aria-label="Previous page"` / `"Next page"`, `size-11 md:pointer-fine:size-8`, disabled at the ends; changing page scrolls the list top into view as today); ungrouped grid: `rangeLabel(1, shownCount, sorted.length)` + ` · 24 a page` + a `Button variant="ghost"` "Show the rest" when `!gridRest && sorted.length > GRID_PAGE`.
- Empty cellar (`rows.length === 0`): keep the shipped dashed block — title "Your cellar is empty" (readOnly: "No bottles to show"), second line "Add the wines you own to see what you have and how it has been rated." (plan copy, owner only), the `AddWineButton kind="cellar"` "Add a bottle" (owner only) — and render nothing else (no strip, no toolbar).
- Callbacks (`cb: RowCallbacks`): `onOpenLot(lotId, mode = "view")` → `setOpenLot({ lotId, mode })`; `onDrink(lotId)` → `setDrink(drinkLotFrom(row))` where `drinkLotFrom = (r) => ({ lotId: r.lot.id, wineId: r.wine.catalogWineId, title: lotTitle(r.wine), quantity: r.lot.quantity, place: r.lot.storageLocation, community: r.community })`; `onRate(wineId)` → `setRate({ wineId, consumptionId: null })`; `onOpenNote(noteId, wineId)` → `setNote({ noteId, wineId })`. In `readOnly` the callbacks are never reached (CC-U2 hides the actions and links rows to the catalog).
- Mounted at the end (owner only — none of these mount when `readOnly`):
  - `<LotSheet lotId={openLot?.lotId ?? null} initialMode={openLot?.mode ?? "view"} reloadKey={lotReload} onClose={() => setOpenLot(null)} onDrink={row => setDrink(drinkLotFrom(row))} onRate={(wineId, consumptionId) => setRate({ wineId, consumptionId })} onOpenNote={(noteId, wineId) => setNote({ noteId, wineId })} onChanged={() => router.refresh()} />`.
  - `<DrinkSheet lot={drink} onClose={() => setDrink(null)} onDone={r => { setDrink(null); setLotReload(k => k + 1); router.refresh(); if (r.openNote) setRate({ wineId: r.wineId, consumptionId: r.consumptionId }); }} />` — the drink sheet stacks over the lot sheet when both are open (two Dialogs; the later one is on top).
  - `note ? <NoteModal noteId wineId onClose={() => { setNote(null); router.refresh(); }} /> : null`.
  - `rate ? <NewNoteModal wineId={rate.wineId} consumptionId={rate.consumptionId} onClose={() => { setRate(null); setLotReload(k => k + 1); router.refresh(); }} /> : null`.
- `?lot=` and `?do=` (owner only; refinement 13): `useSearchParams` / `usePathname` / `useRouter`; a `handled = useRef<string | null>(null)`; `useEffect` on `[lot, doParam]`: when both are null, clear `handled` and return; the key `${lot}|${doParam}`; if already handled, return; if `lot` names a row in `rows` (`rows.some(r => r.lot.id === lot)`): `setOpenLot({ lotId: lot, mode: doParam === "edit" ? "edit" : "view" })`, and when `doParam === "drink"` also `setDrink(drinkLotFrom(row))`; then `router.replace(pathname + (rest ? `?${rest}` : ""), { scroll: false })` with `do` removed but `lot` kept. A `lot` not in `rows` drops both params without opening anything.
- Keeping `?lot=` in sync: `useEffect` on `[openLot?.lotId]`: `const url = new URL(window.location.href); if (openLot) url.searchParams.set("lot", openLot.lotId); else url.searchParams.delete("lot"); window.history.replaceState(window.history.state, "", url.pathname + url.search);` — `replaceState` (the old `cellar-tabs.tsx` pattern), never `router.replace`, so nothing re-renders and the filters, the sort, the page and the scroll position survive (D6).
- View persistence: `chooseView(v)` sets the state and `writeValue(() => window.localStorage, "cellar-view", v)` (unchanged key).

**Interfaces — consumes:** everything CC-U1, CC-U2, CC-U4, CC-U5, CC-P1, CC-P2 produce; `getCellarBottles` (CC-D1); `mergeStorageLocations` (CC-D2); `readValue`/`writeValue` (`@/lib/safe-storage`); `useMediaQuery` (`@/components/add-wine/use-camera`).

**Tests:** none (the frame is a component; every derivation it calls is tested in CC-P1/P2).

**Steps**
- [ ] `cellar-bottles.tsx`; rewrite `page.tsx`; `npx tsc --noEmit`; `npx eslint src/app/cellar/cellar-bottles.tsx src/app/cellar/page.tsx --max-warnings=0`.
- [ ] Run the dev server and open `/cellar` signed in (a demo session via `.superpowers/demo-session.mjs demo.isabelle@blindr.invalid /cellar`) at 375 px and 1280 px, light and dark: the strip, the toolbar, a grouping, the lot sheet from a row and from `/cellar?lot=<id>`, `?lot=<id>&do=drink`, `?lot=<id>&do=edit`; report what you saw (CC-V3 repeats this with the seeded cellar).

**Acceptance:** tsc and eslint clean; `rg -n "cellar-tabs|cellar-summary|history-list|stats-panel|from \"./stats\"|cellar-bottles-table" src/app/cellar/page.tsx src/app/cellar/cellar-bottles.tsx` prints nothing; `rg -n "history\.replaceState" src/app/cellar/cellar-bottles.tsx` matches once; `rg -n 'tab === "notes"|"/taste/notes"|"/cellar/history"|"/cellar/collection"' src/app/cellar/page.tsx` shows the three redirects; `rg -n "readOnly" src/app/cellar/cellar-bottles.tsx` shows the sheets, the merge notice and the query handling all gated on `!readOnly` (inspect).

**Closes:** spec §3 (`/cellar`, `?tab=`), §5.1, §5.4 (the merge notice), D5, D6 (the frame half), D1 (the merge tap); screens C1, C1b, C2, C2b, C3, C3b, C3c, C3d (assembled).

---

### CC-U6 — History

**Depends on:** CC-D3, CC-P4, CC-U1, CC-U5

**OWNS**
- create `src/app/cellar/history/page.tsx`
- create `src/app/cellar/history/history-view.tsx`

**Does** (spec §5.7, D5, D8; refinements 12, 22, 23)

**`page.tsx`** (server): auth; `rows = await getCellarHistory(supabase, user.id)`; render the same shell as `/cellar` (`max-w-6xl … gap-4`): `PageHeader title="History"`; `<CellarSubNav current="history" />`; the heading block — laptop (`max-md:hidden`): `<h2 className="font-heading text-2xl font-semibold">Every bottle that has left your cellar</h2>` and `<p className="text-sm text-muted-foreground">Always private, even when your cellar is not</p>`; phone (`md:hidden`): the second line only; then `<HistoryView rows={rows} />`. The cellar layout already provides `AppHeader`.

**`HistoryView`** (client)
```ts
export function HistoryView({ rows }: { rows: HistoryRow[] }): React.JSX.Element;
```
- State: `year` (the newest of `yearsPresent(rows)`, or null when there are none), `filter: HistoryFilter` ("all"), `expanded` (false), `note: { noteId; wineId } | null`, `rate: { wineId; consumptionId } | null`.
- Empty (`rows.length === 0`): the shipped dashed block — "Nothing drunk yet" / "When you drink or remove a bottle it shows up here." — unchanged.
- Derivations: `inYear = rowsInYear(rows, year)`; `totals = yearTotals(inYear)`; `counts = filterCounts(inYear)`; `shown = filterRows(inYear, filter)`; `buckets = monthBuckets(shown)`; `{ buckets: visible, hiddenRows } = visibleBuckets(buckets, expanded)`.
- Layout (`flex flex-col gap-4`):
  1. The year band (a `Card`, `p-4 md:p-5`): from `yearBand(totals, year, { phone })` rendered twice (`max-md:hidden` / `md:hidden`): laptop — `headline` split so the number is `font-heading text-4xl tabular-nums` and "bottles in {year}" `text-muted-foreground`; `split` and `notes` as two lines with the numbers `font-semibold text-foreground`; phone — `headline` (the bare number, `font-heading text-3xl`) + `notes` ("bottles · 42 written up") on one line, `split` beneath. At the band's right (laptop) / in the phone header row: a native `<select aria-label="Year" value={year}>` labelled "Year" (`text-sm text-muted-foreground` label, laptop only) listing `yearsPresent(rows)`; the phone shows the select alone, reading "2026 ▾" by the browser's own chevron. Changing the year resets `filter` to "all" and `expanded` to false.
  2. The filter chips (`flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap`): one `<button type="button" aria-pressed>` per `HISTORY_FILTERS`, reading `filterLabel(f, counts[f], { phone })` (both widths via two spans), `min-h-11 md:pointer-fine:min-h-8 shrink-0 rounded-full border px-3 text-sm`, the pressed one `border-primary bg-primary text-primary-foreground`.
  3. The months: per visible bucket a header `sticky top-0 z-10 bg-background/95 backdrop-blur py-2` with `label` (`font-heading text-base font-semibold`) and `monthLine(b, { phone })` (`text-xs text-muted-foreground`, both widths via spans); then the rows, each `grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 rounded-xl border border-border p-3` (laptop `md:grid-cols-[1fr_8rem_5rem_4rem]`): the title as a `Link` to `/catalog/{catalogWineId}` (`font-medium`); the where-line from `whereLine(row, { phone })`: `kind === "tasting"` → laptop `"poured at "` + a `Link` to `/tastings/{tastingId}` reading the name (`text-primary`), phone `"at "` + the link; `kind === "text"` → the text (`text-sm text-muted-foreground`); `actionWord(row)` and `dayMonth(consumedOn)` (`text-sm tabular-nums text-muted-foreground`; phone: `"{actionWord} · {dayMonth}"` on one line); the note cell: `row.note?.score != null` → a `<button>` with `fmtScore(score)` (`font-semibold text-primary`) and a `text-[10px] text-muted-foreground` "your note" beneath → `setNote({ noteId: note.id, wineId })`; a note with no score → the same button reading "your note"; no note → `Button variant="ghost" size="sm"` "+ Note" → `setRate({ wineId: catalogWineId, consumptionId: row.id })`. Every tap target `min-h-11` on phones.
  4. When `hiddenRows > 0`: `Button variant="outline"` `showRestLabel(year)` → `setExpanded(true)`.
  5. Nothing about money anywhere (spec §5.7 "No money").
- Modals: `note ? <NoteModal … onClose={() => { setNote(null); router.refresh(); }} />`; `rate ? <NewNoteModal wineId={rate.wineId} consumptionId={rate.consumptionId} onClose={() => { setRate(null); router.refresh(); }} />`.

**Interfaces — consumes:** CC-D3's `getCellarHistory`; CC-P4's helpers; CC-P0's `dayMonth`, `fmtScore`; CC-U1's `CellarSubNav`; CC-U5's `NewNoteModal` with `consumptionId`; `NoteModal`.

**Tests:** none (component; `history-math.test.ts` covers the maths).

**Steps**
- [ ] `history/page.tsx`; `history/history-view.tsx`; tsc; eslint on both; open `/cellar/history` at both widths, both themes; report.

**Acceptance:** tsc and eslint clean; `rg -n "occasion" src/app/cellar/history/history-view.tsx` prints nothing (the where-line comes from CC-P4, which never links on occasion text); `rg -n "price|DKK|value" src/app/cellar/history/*.tsx` prints nothing; `rg -n "consumptionId" src/app/cellar/history/history-view.tsx` matches.

**Closes:** spec §5.7, D5 (`/cellar/history`), D8 (rendered); screens C6, C6b.

---

### CC-U7 — The collection

**Depends on:** CC-D4, CC-P5, CC-U1

**OWNS**
- create `src/app/cellar/collection/page.tsx`
- create `src/app/cellar/collection/collection-view.tsx`

**Does** (spec §5.8, D4, D5; refinements 10, 11, 17, 23)

**`page.tsx`** (server): auth; `stats = await getCollectionStats(supabase, user.id)`; the shell: `PageHeader title="The collection"`; `<CellarSubNav current="collection" />`; the caption (`text-sm text-muted-foreground`, both widths): `COLLECTION_CAPTION` + " " + `<Link href="/profile/numbers" className="text-primary underline-offset-2 hover:underline">Your numbers</Link>`; then `<CollectionView stats={stats} />`.

**`CollectionView`** (server component — no state, no `"use client"`)
```ts
export function CollectionView({ stats }: { stats: CollectionStats }): React.JSX.Element;
```
- Empty (`stats.bottles === 0`): the dashed block "Nothing to count yet." / "Add wines to your cellar to see where it comes from and how it has been rated." (both plan copy).
- Headline (`grid grid-cols-2 gap-3 md:grid-cols-4`): four `Card`s (`p-4`), each an optional `Eyebrow` label, the value in `font-heading text-3xl font-semibold tabular-nums` and the sub in `text-xs text-muted-foreground`, from `bottlesTile`, `tastedTile`, `averageTile` (each rendered for both widths via `max-md:hidden` / `md:hidden` spans) and `bestTile`. The bottles tile's laptop label is the number alone with "across 96 wines" beneath (the mock); the phone form reads "142 / bottles · 96 wines".
- Panels (`grid gap-4 md:grid-cols-2`; each a `Card` `p-4 flex flex-col gap-3`): in order region, producer, grape, colour, decade — title from `PANEL_TITLES[panel]` (`font-heading text-base font-semibold`; laptop / phone variants via spans), the eyebrow `panelEyebrow(panel, stats)` (`Eyebrow`) when not null, then `<DistributionBar items={…} />` (refinement 11) — for region, producer, grape and colour the items are `foldOther(bars.map(b => ({ label: b.label, count: b.value })), 3)` (`foldOther` from `@/lib/stats-math`, which sorts by count and appends "Other"); for decade the items are the first three of `byDecade` in their own order (newest first) plus `{ label: "Other", count: Σ the rest }` when any remain, built by hand so the bar reads chronologically — then the ranked rows: `bars.map(b => <div className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{label}</span><span className="tabular-nums text-muted-foreground">{value}</span></div>)`, in `bars`' own order. A panel with no bars is omitted.
- No readiness, no value, no spend, no "Coming" panel (D4, spec §8).

**Interfaces — consumes:** CC-D4's `getCollectionStats`; CC-P5's tiles, eyebrows, titles; `DistributionBar` (`@/components/overview/distribution-bar`), `foldOther`, `Eyebrow`, `Card`.

**Tests:** none (component; `collection-math.test.ts` covers the maths).

**Steps**
- [ ] `collection/page.tsx`; `collection/collection-view.tsx`; tsc; eslint on both; open `/cellar/collection` at both widths, both themes; report.

**Acceptance:** tsc and eslint clean; `rg -n "Coming|worth|readiness|spend|value tile|DKK" -i src/app/cellar/collection/*.tsx` prints nothing except `Bar.value` reads (inspect); `rg -n "DistributionBar" src/app/cellar/collection/collection-view.tsx` matches; `rg -n '"/profile/numbers"' src/app/cellar/collection/page.tsx` matches.

**Closes:** spec §5.8, D5 (`/cellar/collection`), spec §8's C7 exception; screens C7, C7b.

---

### CC-U8 — The read-only cellar (D12)

**Depends on:** CC-U3

**OWNS**
- modify `src/app/u/[id]/cellar/page.tsx`

**Does** (spec §5.9, D12; refinement 20)
- Keep: the `AppHeader`, the `id === user.id` redirect to `/cellar`, the profile read (`display_name` only — `preferred_currency` is no longer needed), `notFound()` on a missing profile, the `can_view_cellar` RPC gate and its "This cellar is private" block (copy unchanged).
- Replace the inline lot query, the `CellarSummary` and the `CellarBottlesTable` with `rows = canView ? await getCellarBottles(supabase, id, user.id, { readOnly: true }) : []` and `<CellarBottles rows={rows} readOnly />`.
- `PageHeader title={`${displayName}’s cellar`}` with `subtitle = headerSubtitle(headerStats(rows), { phone: false, readOnly: true })` ("{n} bottles · {w} wines", plan copy; the shipped "drink windows and value" line goes). No sub-nav, no visibility control, no add button, no History or collection link (D12).
- Nothing in this page reads notes, consumptions, pour intents or prices.

**Interfaces — consumes:** CC-D1's `getCellarBottles`; CC-U3's `CellarBottles`; CC-P1's `headerStats`, `headerSubtitle`.

**Tests:** none.

**Steps**
- [ ] Rewrite the page; tsc; eslint; open `/u/<demo.marcus id>/cellar` as demo.isabelle (after setting marcus's visibility to PUBLIC through the seed — CC-V3) at both widths; report.

**Acceptance:** tsc and eslint clean; `rg -n "CellarSummary|CellarBottlesTable|estimated_price|price_per_bottle|drink_from|preferred_currency|wset_notes|cellar_consumptions|wine_pour_intents" "src/app/u/[id]/cellar/page.tsx"` prints nothing; `rg -n "readOnly" "src/app/u/[id]/cellar/page.tsx"` matches.

**Closes:** spec §5.9, D12; the hand-off's "someone else's cellar read-only".

---

## Track CC-C — The catalog

### CC-C3 — D13: the retail-price editor and the form field go

**Depends on:** —

**OWNS**
- modify `src/app/catalog/new/new-wine-form.tsx`
- modify `src/app/catalog/[wineId]/edit-wine-modal.tsx`

**Does** (spec D13, §7)
- `new-wine-form.tsx`: remove the `estimatedPrice` field from the `initialWine` type (line 54), its `useState` (126–128), the `estimatedPrice` key from the `CatalogWineInput` it submits (196) and the "Average retail price (DKK)" block (330–343). `CatalogWineInput.estimatedPrice` stays optional in `catalog/new/actions.ts` (not owned, not touched): omitting it means `updateCatalogWine`'s `input.estimatedPrice !== undefined` guard never runs and `createCatalogWine`'s `priceOrNull(undefined)` writes null exactly as an empty field did — the columns stay, unread (D4).
- `edit-wine-modal.tsx`: drop `estimated_price` from its select string (line 50) and the `estimatedPrice:` line from the `initialWine` it builds (120–121).
- Nothing else in either file changes (the profile fields, the blend editor, the image stay).

**Interfaces:** `NewWineForm`'s `initialWine` no longer has `estimatedPrice`.

**Tests:** none (form only).

**Steps**
- [ ] Edit both files; `npx tsc --noEmit`; `npx eslint src/app/catalog/new/new-wine-form.tsx "src/app/catalog/[wineId]/edit-wine-modal.tsx" --max-warnings=0`.

**Acceptance:** `rg -n "estimatedPrice|estimated_price|retail price" src/app/catalog/new/new-wine-form.tsx "src/app/catalog/[wineId]/edit-wine-modal.tsx"` prints nothing; `rg -n "estimatedPrice" src/app/catalog/new/actions.ts` still matches (the type stays).

**Closes:** D13 (the form half); spec §7 (`new-wine-form.tsx`).

---

### CC-C1 — The catalog list (W1, W1b)

**Depends on:** CC-P0

**OWNS**
- create `src/app/catalog/catalog-list-math.ts`, `src/app/catalog/catalog-list-math.test.ts`
- modify `src/app/catalog/page.tsx`
- modify `src/app/catalog/catalog-list.tsx`

**Does** (spec §4 "Catalog: catalog/page.tsx adds…", §6.1, D3; refinement 15)

**`catalog-list-math.ts`** (pure; runtime imports only `../../lib/cellar/format`)
```ts
export type CatalogRow = {
  id: string;
  producer: string | null;
  /** bottleTitle: the name and its vintage */
  name: string;
  /** catalogWineTitle: search haystack and the note modal's title */
  title: string;
  colour: WineColour | null;
  style: WineStyle | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  grapes: string[];
  designation: string | null;
  vintage: string;
  imageUrl: string | null;
  avgScore: number | null;
  noteCount: number;
  appearances: number;
  /** community holdings (catalog_wine_holdings) — kept for the "bottles" sort */
  cellarBottles: number;
  /** D3: the viewer's most recent score */
  yours: number | null;
  /** the viewer's bottles of it */
  owned: number;
  addedAt: string;
};
export type CatalogFilter = "all" | "cellar" | "tasted";
export const CATALOG_FILTERS: readonly CatalogFilter[];
export type CatalogSortKey = "title" | "region" | "country" | "vintage" | "avgScore" | "noteCount" | "appearances" | "bottles" | "added";
export type CatalogSort = { key: CatalogSortKey; dir: "asc" | "desc" };
export const DEFAULT_SORT: CatalogSort;                     // { key: "added", dir: "desc" } (refinement 15)
export const CATALOG_PAGE = 25;
export function applyCatalogFilter(rows: readonly CatalogRow[], f: CatalogFilter): CatalogRow[];
export function catalogFilterCounts(rows: readonly CatalogRow[]): Record<CatalogFilter, number>; // all: rows; cellar: owned > 0; tasted: yours != null
export function catalogFilterLabel(f: CatalogFilter, count: number, opts: { phone: boolean }): string; // "Everything" | "In my cellar 96" | "I have tasted 61" ; phone "Tasted 61"
export function matchesCatalogSearch(row: CatalogRow, needle: string): boolean; // title, producer, appellation, region, country, grapes
export const CATALOG_SEARCH_PLACEHOLDER = "Wine, producer, appellation or grape";
export const CATALOG_SEARCH_PLACEHOLDER_PHONE = "Wine, producer, appellation, grape";
export function sortCatalog(rows: readonly CatalogRow[], s: CatalogSort): CatalogRow[];
export const CATALOG_SORT_OPTIONS: readonly { value: string; label: string; sort: CatalogSort }[];
  // "title:asc" Wine A–Z · "added:desc" Added (newest) · "added:asc" Added (oldest) · "avgScore:desc" Community rating · "noteCount:desc" Notes · "appearances:desc" Blind tastings · "bottles:desc" Bottles in cellars
export function sortedByWord(s: CatalogSort): string; // "community rating" | "newest added" | "oldest added" | "name" | "notes" | "blind tastings" | "bottles in cellars" | "region" | "country" | "vintage"
export function catalogPageLine(page: number, per: number, total: number, s: CatalogSort): string; // "1–25 of 8,412 · sorted by community rating"
export type CatalogBand = { wines: number; notes: number; average: number | null; yourNotes: number; owned: number };
export function bandAverage(ratings: readonly { avg: number | null; count: number }[]): number | null; // weighted by count, one decimal
export function bandParts(b: CatalogBand): { wines: string; notes: string; average: string | null };   // "8,412" / "3,106" / "90.4" (toLocaleString("en-US"))
export function bandLinePhone(b: CatalogBand): string;   // "8,412 wines · 3,106 notes shared"
export function yourLine(b: CatalogBand): { notes: string; owned: string }; // { "61", "96" } for "You have notes on {t} · you own {o}"
export function ownedBadge(n: number): string | null;   // "2 owned" | null
export function factsLine(r: CatalogRow): string | null; // "Nebbiolo · Red · Riserva" (first grape, colour word, designation)
export function phoneFactsLine(r: CatalogRow): string | null; // "Nebbiolo · Barolo DOCG · Piedmont" (first grape, appellation, region); when the appellation folds equal to the region (the self-named regional appellation): "Riesling · Rheinhessen, Germany"
```
`sortCatalog` keeps today's comparators (`avgScore`/`noteCount`/`appearances`/`bottles` numeric, `vintage`/`region`/`country`/`title` `localeCompare`, `added` on `addedAt`) with `dir`; null scores sort last in either direction.

**Tests (write first)** — `src/app/catalog/catalog-list-math.test.ts`
```ts
import { describe, expect, it } from "vitest";
import {
  CATALOG_FILTERS, CATALOG_PAGE, DEFAULT_SORT, applyCatalogFilter, bandAverage, bandLinePhone, bandParts, catalogFilterCounts,
  catalogFilterLabel, catalogPageLine, factsLine, matchesCatalogSearch, ownedBadge, phoneFactsLine, sortCatalog, sortedByWord, yourLine,
  type CatalogRow,
} from "./catalog-list-math";

let seq = 0;
const row = (o: Partial<CatalogRow> = {}): CatalogRow => {
  seq += 1;
  return {
    id: `w${seq}`, producer: "Vietti", name: "Barolo Castiglione 2017", title: "Vietti Barolo Castiglione Barolo DOCG 2017",
    colour: "RED", style: "STILL", country: "Italy", region: "Piedmont", appellation: "Barolo DOCG", grapes: ["Nebbiolo"],
    designation: null, vintage: "2017", imageUrl: null, avgScore: 92.6, noteCount: 33, appearances: 6, cellarBottles: 34,
    yours: null, owned: 0, addedAt: `2026-01-${String(seq).padStart(2, "0")}T00:00:00Z`, ...o,
  };
};
const rows = [
  row({ id: "a", avgScore: 95.8, noteCount: 58, yours: 96, owned: 2 }),
  row({ id: "b", avgScore: 96.1, noteCount: 52, yours: 95, owned: 0, designation: "Classico" }),
  row({ id: "c", avgScore: null, noteCount: 0, yours: null, owned: 4, country: "Germany", region: "Rheinhessen", appellation: "Rheinhessen", grapes: ["Riesling"], colour: "WHITE" }),
  row({ id: "d", avgScore: 94.8, noteCount: 29, yours: null, owned: 0 }),
];

describe("filters", () => {
  it("three filters with counts and labels", () => {
    expect(CATALOG_FILTERS).toEqual(["all", "cellar", "tasted"]);
    expect(catalogFilterCounts(rows)).toEqual({ all: 4, cellar: 2, tasted: 2 });
    expect(applyCatalogFilter(rows, "cellar").map((r) => r.id)).toEqual(["a", "c"]);
    expect(applyCatalogFilter(rows, "tasted").map((r) => r.id)).toEqual(["a", "b"]);
    expect(catalogFilterLabel("all", 4, { phone: false })).toBe("Everything");
    expect(catalogFilterLabel("cellar", 96, { phone: false })).toBe("In my cellar 96");
    expect(catalogFilterLabel("tasted", 61, { phone: false })).toBe("I have tasted 61");
    expect(catalogFilterLabel("tasted", 61, { phone: true })).toBe("Tasted 61");
  });
  it("search covers the identity", () => {
    expect(matchesCatalogSearch(rows[2], "riesling")).toBe(true);
    expect(matchesCatalogSearch(rows[2], "rheinhessen")).toBe(true);
    expect(matchesCatalogSearch(rows[0], "riesling")).toBe(false);
  });
});

describe("sort and paging", () => {
  it("defaults to newest added; community rating puts unrated last", () => {
    expect(DEFAULT_SORT).toEqual({ key: "added", dir: "desc" });
    expect(sortCatalog(rows, { key: "avgScore", dir: "desc" }).map((r) => r.id)).toEqual(["b", "a", "d", "c"]);
    expect(sortCatalog(rows, { key: "avgScore", dir: "asc" }).map((r) => r.id)).toEqual(["d", "a", "b", "c"]);
    expect(sortCatalog(rows, DEFAULT_SORT).map((r) => r.id)).toEqual(["d", "c", "b", "a"]);
    expect(sortedByWord({ key: "avgScore", dir: "desc" })).toBe("community rating");
    expect(sortedByWord(DEFAULT_SORT)).toBe("newest added");
    expect(CATALOG_PAGE).toBe(25);
    expect(catalogPageLine(1, 25, 8412, { key: "avgScore", dir: "desc" })).toBe("1–25 of 8,412 · sorted by community rating");
    expect(catalogPageLine(2, 25, 30, DEFAULT_SORT)).toBe("26–30 of 30 · sorted by newest added");
  });
});

describe("band and row strings", () => {
  it("weighted average and the band parts", () => {
    expect(bandAverage([{ avg: 90, count: 3 }, { avg: 94, count: 1 }, { avg: null, count: 0 }])).toBe(91);
    expect(bandAverage([])).toBeNull();
    const b = { wines: 8412, notes: 3106, average: 90.4, yourNotes: 61, owned: 96 };
    expect(bandParts(b)).toEqual({ wines: "8,412", notes: "3,106", average: "90.4" });
    expect(bandLinePhone(b)).toBe("8,412 wines · 3,106 notes shared");
    expect(yourLine(b)).toEqual({ notes: "61", owned: "96" });
    expect(bandParts({ ...b, average: null }).average).toBeNull();
  });
  it("owned badge and facts lines", () => {
    expect(ownedBadge(2)).toBe("2 owned");
    expect(ownedBadge(0)).toBeNull();
    expect(factsLine(rows[1])).toBe("Nebbiolo · Red · Classico");
    expect(factsLine(rows[0])).toBe("Nebbiolo · Red");
    expect(phoneFactsLine(rows[0])).toBe("Nebbiolo · Barolo DOCG · Piedmont");
    expect(phoneFactsLine(rows[2])).toBe("Riesling · Rheinhessen, Germany");
  });
});
```

**`page.tsx`** (server)
- Reads, in parallel where independent: (1) the newest 500 `catalog_wines` as today, with `type_designation:type_designations(name)` added to the select; (2) the viewer's lots — `cellar_lots.select("catalog_wine_id, quantity").eq("owner_id", user.id).gt("quantity", 0)`; (3) the viewer's scored notes — `wset_notes.select("catalog_wine_id, quality_score, tasted_on, created_at").eq("author_id", user.id).not("quality_score", "is", null).not("catalog_wine_id", "is", null).order("tasted_on", { ascending: false }).order("created_at", { ascending: false })` → the first per wine (D3) and the distinct set `tastedIds`; (4) `catalog_wine_ratings` (all rows, as today); (5) the exact wine count (as today). Then (6) the viewer's owned ∪ tasted wine ids not among the 500: `catalog_wines` by `.in("id", chunk)` (200 a chunk), same select, `.is("merged_into", null).eq("blind_pending", false)` — merged into the list (refinement 15); (7) grapes, `catalog_wine_appearances`, `catalog_wine_holdings` for the merged id list, as today.
- Rows: `CatalogRow` with `producer`, `name = bottleTitle(wine)` (a `BottleWine` built from the embed), `title = catalogWineTitle`, `designation`, `yours`, `owned` (Σ quantity of the viewer's lots for the wine), the rest as today.
- Band: `{ wines: totalWines, notes: Σ note_count, average: bandAverage(ratings), yourNotes: tastedIds.size, owned: distinct owned wine ids }`.
- Render: `PageHeader title="Catalog" subtitle="The shared wine database, built by everyone tasting"` with the existing `AddWineButton kind="catalog"` ("Add a wine"); the band; `<CatalogList rows band />`. The four `StatTile`-style boxes and their "countries" stat go (the mock's band replaces them); the `countryRows` query goes with them.
- The band (laptop, `max-md:hidden`, `flex flex-wrap items-baseline gap-x-6 gap-y-2`): three number+label pairs from `bandParts` — the number `font-heading text-2xl font-semibold tabular-nums`, the label `text-sm text-muted-foreground`: "wines", "tasting notes shared", "average across all of them" (the last pair omitted when `average` is null); then, `ml-auto`, "You have notes on " `{notes}` " · you own " `{owned}` (numbers `font-semibold text-foreground`). Phone (`md:hidden`): `bandLinePhone(band)` in `text-sm text-muted-foreground`.

**`catalog-list.tsx`** (client)
```ts
export function CatalogList({ rows, band }: { rows: CatalogRow[]; band: CatalogBand }): React.JSX.Element;
```
- State: `q`, `filter: CatalogFilter` ("all"), `sort: CatalogSort` (`DEFAULT_SORT`), `page`, `noteWineId: string | null`. `const { openAddWine } = useAddWine()`.
- Toolbar (`flex flex-wrap items-center gap-2`): search `Input` (`pl-9`, the `Search` icon; `placeholder` by width through `useMediaQuery("(max-width: 767px)")` from `@/components/add-wine/use-camera`); a native `<select aria-label="Sort">` over `CATALOG_SORT_OPTIONS` labelled "Sort" (laptop label `text-sm text-muted-foreground`); the filter chips — one `<button aria-pressed>` per `CATALOG_FILTERS` reading `catalogFilterLabel(f, counts[f], { phone })` (`min-h-11 md:pointer-fine:min-h-8 rounded-full border px-3 text-sm`, pressed `border-primary bg-primary text-primary-foreground`) — the laptop also shows "Filter" as a `text-sm text-muted-foreground` label before them. Every change resets `page`.
- Derivations: `filtered = sortCatalog(applyCatalogFilter(rows, filter).filter(r => matchesCatalogSearch(r, fold(q))), sort)`; `pageRows` by `CATALOG_PAGE`.
- Laptop table (`hidden xl:block`; `table-fixed text-sm`; columns Wine · Where it is from (`w-[13rem]`) · Notes (`w-[6rem]`) · Blind (`w-[4.5rem]`) · Yours (`w-[7rem]`)):
  - Wine: `producer` (`text-xs text-muted-foreground`); the `name` as a `Link` to `/catalog/{id}` (`font-medium`); `factsLine(r)`; `appellation` (`text-xs text-muted-foreground`).
  - Where it is from: `region` then a second line `<CountryFlag /> {country}`.
  - Notes: `fmtAvg(avgScore)` in `font-semibold text-gold-dark tabular-nums` with the `Star`; `noteCount` beneath (`text-xs text-muted-foreground`); a dash when unrated.
  - Blind: `appearances` (`tabular-nums text-muted-foreground`).
  - Yours: `fmtScore(yours)` in `font-semibold text-primary` (a dash when null); beneath, `ownedBadge(owned)` as a `Badge` (`bg-gold/15 text-gold-dark`) when not null.
  - Hover actions (`absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-within:opacity-100` inside the Yours cell, `relative`): `Button size="sm" variant="outline"` "Open" (`render={<Link href=…/>}` + `nativeButton={false}`), `Button size="sm" variant="outline"` "Rate it" → `setNoteWineId(id)`, `Button size="sm"` "Add to cellar" → `openAddWine("cellar", { cellarWine: { id, label: title } })`.
- Phone rows (`xl:hidden`; each a `Link` to `/catalog/{id}`, `flex min-h-11 items-start gap-3 rounded-xl border border-border p-3`): left — `producer`, `name` (`font-medium`), `phoneFactsLine(r)`; right (`text-right shrink-0`) — `fmtAvg` (gold, star) over `"{noteCount} notes"`, then `fmtScore(yours)` (bordeaux) and the owned `Badge` when owned (W1b).
- Footer (`flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground`): `catalogPageLine(page, CATALOG_PAGE, filtered.length, sort)` left; the prev/next pager with `pageLabel`-style "Page x of y" right (`size-11 md:pointer-fine:size-8` buttons).
- Empty: "No wines in the catalog yet." / "No wines match those filters." (both shipped copy, kept).
- `noteWineId ? <NewNoteModal wineId={noteWineId} onClose={() => setNoteWineId(null)} /> : null`.
- No price column, no "Added" column, no "Bottles in cellars" column (the community holdings stay a sort key only).

**Interfaces — consumes:** CC-P0's `bottleTitle`, `fmtAvg`, `fmtScore`, `colourWord`; `catalogWineTitle`; `useAddWine`; `NewNoteModal`; `CountryFlag`; `Badge`; `Button`.

**Steps**
- [ ] `catalog-list-math.test.ts`; run — fails; `catalog-list-math.ts`; run — green.
- [ ] `page.tsx`; `catalog-list.tsx`; tsc; eslint on the four; open `/catalog` at both widths, both themes; report.

**Acceptance:** the test is green; `rg -n 'from "@/' src/app/catalog/catalog-list-math.ts` prints nothing; `rg -n "estimated|price|countries" src/app/catalog/page.tsx src/app/catalog/catalog-list.tsx` prints nothing; `rg -n "type_designations\(name\)" src/app/catalog/page.tsx` matches; `rg -n "quality_score > |Math\.max" src/app/catalog/page.tsx` prints nothing (D3: most recent, never highest).

**Closes:** spec §4 (catalog list data), §6.1, D3 (the list); screens W1, W1b.

---

### CC-C2 — One wine (W2, W2b) with the cellar strip

**Depends on:** CC-D5, CC-U5, CC-C3

**OWNS**
- modify `src/app/catalog/[wineId]/page.tsx`
- create `src/app/catalog/[wineId]/cellar-strip.tsx`
- create `src/app/catalog/[wineId]/your-notes.tsx`
- modify `src/lib/wset/queries.ts` (`estimated_price` out of `SELECT` and `estimatedPrice` out of `CellarWine`/`shape` only)

**Does** (spec §4 "catalog/[wineId]/page.tsx adds getOwnLotsForWine", §6.2, D3, D4, §8's W2 exception; refinement 16)

**`queries.ts`**: delete `estimated_price` from `SELECT`, the `estimatedPrice` field from `CellarWine` and its line in `shape`. Nothing else in the file changes (every other export is untouched).

**`page.tsx`** (server) — the same reads as today minus nothing, plus `ownLots = await getOwnLotsForWine(supabase, user.id, wineId)`; `myNotes` keeps `tasted_on desc` and additionally `.order("created_at", { ascending: false })`. Render order (spec §6.2), inside the existing `max-w-5xl` shell:
1. The breadcrumb as today.
2. **Identity** (`grid gap-6 lg:grid-cols-3`; left `lg:col-span-2` with `WineImage` in its `sm:w-48` column and the text beside it): the `h1` title; the place badges — country (with `CountryFlag`), region, appellation; the appellation badge becomes a `Link` to `/knowledge/map?place=…` when `appellationPlaceKey` is set (a `MapPin` icon inside; the separate "View … on the map" link goes); a facts grid (`grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3`), each an `Eyebrow`-style label and a value, only when set: "Grape blend" `formatBlend(blend)`; colour · style as two `Badge`s under "Wine style"; "Alcohol" `{n}%`; "Serve at" `{min}–{max} °C`; "Decant" `{n} min` / "Not needed" for 0 — the serving facts move into this grid (the trailing small-print line goes). Phone: the same grid two across (W2b's "Nebbiolo 100% · 14.5% · decant 60 min" reads the same facts in a row: render the grid; it wraps).
3. **The community card** (the right column `Card`, `lg:self-start`): `fmtAvg(avgScore)` in `font-heading text-4xl` + `"{qualityBand(Math.round(avgScore))} · community rating"` (or "No ratings yet — be the first." kept when null); a `grid grid-cols-3 gap-3 border-t pt-4`: `noteCount` "tasting notes", `guessStats.appearances` "blind tastings", `usage.holders` "cellars" (phone labels "notes" / "blind" / "cellars"); the line `In {holders} cellars · {bottles} bottles` (singulars as today; "Not in anyone's cellar yet" kept when 0); the `Link` to `/catalog/{wineId}/notes/new` now reading "Write a tasting note"; `WineAdminControls` stays where it is. **No "Average retail price", no caveat** (D4, spec §8).
4. **The gold strip** (`<CellarStrip …/>`, only when `ownLots.length > 0`): a client component (below), rendered full-width under the identity/card grid.
5. **The profile sections** (`profileSections` as today: The producer, Aroma, Tasting notes, Food pairing) — without the serving-facts line (moved up); the legacy `description` fallback stays.
6. **What people find**: the descriptor chips as today, then a caption `"Counted across the {noteCount} notes. The number is how many people said it."` (`text-xs text-muted-foreground`; singular "1 note").
7. **Structure, averaged**: `WineStructure` as today (its own title reads "Structure, averaged" — check `wine-structure.tsx`; if its heading is different, leave the component alone and set the section title in the page).
8. **Poured blind**: title "Poured blind"; the sentence `"{countWord(appearances, { capital: true })} tastings · {guessCount} scored guesses. How often people got each attribute:"` (singular "tasting"/"guess"; `countWord` from `@/lib/count-words`), then the `Progress` rows as today; "No scored guesses yet." kept.
9. **Your notes** (`<YourNotes …/>`): the viewer's notes newest first, each `dayMonthYear(tasted_on)` · a "Blind" `Badge` when `context_kind === "BLIND"` · `"{score} pts"` (or "unscored"); tapping opens `NoteModal` (client). "You haven't tasted this wine yet." kept.

**`CellarStrip`** (client)
```ts
export function CellarStrip({ wineId, title, lots, community }: {
  wineId: string; title: string; lots: OwnLot[]; community: { avg: number | null; count: number };
}): React.JSX.Element | null;
```
- `const s = stripSummary(lots)`; null → `null`. A `Card` `border-gold/40 bg-gold/10 p-4 md:p-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between`: left — `stripTitle(s)` in `font-heading text-lg font-semibold`, `stripLine(s, { phone })` (both widths via spans) in `text-sm text-muted-foreground`; right (`flex gap-2`) — `Button className="min-h-11 md:pointer-fine:min-h-9"` "Drink one" → `setDrink({ lotId: s.firstLotId, wineId, title, quantity: lots.find(l => l.id === s.firstLotId)!.quantity, place: s.place, community })`; `Button variant="outline" render={<Link href={`/cellar?lot=${s.firstLotId}`} />} nativeButton={false}` "Open the lot".
- Mounts `<DrinkSheet lot={drink} onClose={() => setDrink(null)} onDone={r => { setDrink(null); router.refresh(); if (r.openNote) setRate({ wineId, consumptionId: r.consumptionId }); }} />` and `rate ? <NewNoteModal wineId consumptionId onClose={() => { setRate(null); router.refresh(); }} /> : null`.

**`YourNotes`** (client)
```ts
export function YourNotes({ wineId, notes }: { wineId: string; notes: { id: string; tastedOn: string; score: number | null; contextKind: string | null }[] }): React.JSX.Element;
```
- A `<ul>` of `<button type="button" className="flex min-h-11 w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">` rows: left `dayMonthYear(tastedOn)` + the Blind badge; right `"{score} pts"` in `font-medium` (or "unscored"); tap → `setOpen({ noteId: id })` → `<NoteModal noteId wineId onClose={() => { setOpen(null); router.refresh(); }} />`. Empty → the kept sentence.

**Interfaces — consumes:** CC-D5's `getOwnLotsForWine`, `stripSummary`, `stripTitle`, `stripLine`, `OwnLot`; CC-U5's `DrinkSheet`, `DrinkLot`, `NewNoteModal` with `consumptionId`; CC-P0's `fmtAvg`, `dayMonthYear`; `qualityBand`; `countWord`; `NoteModal`.

**Tests:** none new (`own-lots.test.ts` covers the strip's line).

**Steps**
- [ ] `queries.ts` edit; `cellar-strip.tsx`; `your-notes.tsx`; rewrite `page.tsx`; tsc; eslint on the four; open a wine the demo user owns and one they do not, at both widths, both themes; report.

**Acceptance:** tsc and eslint clean; `rg -n "estimated_price|estimatedPrice|retail|kr\b" "src/app/catalog/[wineId]/page.tsx" src/lib/wset/queries.ts` prints nothing; `rg -n "getOwnLotsForWine|CellarStrip|YourNotes" "src/app/catalog/[wineId]/page.tsx"` matches all three; `rg -n "Write a tasting note|Poured blind|Counted across the" "src/app/catalog/[wineId]/page.tsx"` matches all three; `rg -n '"/cellar\?lot='` "src/app/catalog/[wineId]/cellar-strip.tsx"` matches.

**Closes:** spec §4 (the strip's data), §6.2, D4 (W2), D3 (rendered order), spec §8's W2 exception, refinement 16; screens W2, W2b.

---

## Track CC-V — Integration gate, review, verification

### CC-V1 — Integration gate

**Depends on:** every CC task above (CC-P0…P5, CC-X1…X3, CC-D1…D5, CC-U1…U8, CC-C1…C3)

**OWNS:** none (read-only; reports in the session)

**Steps**
- [ ] Run, capturing each exit code (redirect to a log and check `$?`; never `cmd | tail && next`): `npx tsc --noEmit`; `npm run lint -- --max-warnings=0`; `npm test` (the nine new test files — `format`, `cellar-rows`, `storage-merge`, `rating-spread`, `history-math`, `collection-math`, `own-lots`, `drink-copy`, `catalog-list-math` — appear and pass); `node --test scripts/wine-map-tiles/lib.test.mjs`; `npm run build` (read the relevant `node_modules/next/dist/docs/` guide before fixing a build failure).
- [ ] Grep gates (spec §11). Each must print nothing unless stated otherwise:
  1. **No typical price, valuation or spend anywhere (D4):** `rg -n "estimated_price|estimatedPrice" src --glob '!src/lib/supabase/database.types.ts' --glob '!src/app/catalog/new/actions.ts'`
  2. `rg -n "totalValue|valuePerBottle|lotValue|est\. value|spendByYear|mixedCurrency|Average retail price|What it is worth|Coming\b" src`
  3. **No readiness:** `rg -n "readiness\(|ReadinessChip|windowLabel|Drink-window readiness|Ready now|Past peak|Drink soon|Too young|Past window" src`
  4. **Drink windows in the lot sheet and the writers only:** `rg -n "drink_from|drinkFrom|drink_to|drinkTo" src --glob '!src/lib/supabase/database.types.ts' --glob '!src/components/add-wine/**' --glob '!src/app/cellar/new/**' --glob '!src/app/cellar/import/**' --glob '!src/lib/cellar/**' --glob '!src/app/cellar/lot-sheet.tsx' --glob '!src/app/cellar/lot-edit-form.tsx' --glob '!src/app/cellar/lot-actions.ts'` — every hit is a failure; also inspect that the hits inside `src/lib/cellar/**` are the `BottleLot` fields and the select strings only.
  5. **Retired files and names gone:** `rg -n "cellar-bottles-table|cellar-summary|cellar-tabs|history-list|stats-panel|computeCellarStats|CellarSummary|CellarTabs|CellarBottlesTable|StatsPanel|HistoryList|EditLotForm|DrinkForm|WinePriceField|updateWineEstimatedPrice|Cellar Inventory" src scripts`; and `ls src/app/cellar/cellar-tabs.tsx src/app/cellar/history-list.tsx src/app/cellar/stats-panel.tsx src/app/cellar/stats.ts src/app/cellar/cellar-summary.tsx src/app/cellar/cellar-bottles-table.tsx "src/app/cellar/[lotId]/drink/drink-form.tsx" "src/app/cellar/[lotId]/edit/edit-lot-form.tsx" "src/app/cellar/[lotId]/edit/wine-price-field.tsx" "src/app/cellar/[lotId]/edit/wine-price-actions.ts" scripts/cellar-stats.test.mjs` — every path must be missing.
  6. **D3, never the highest:** `rg -n "quality_score > prev|bestNote|bestScore|bestNoteId|highest score" src` (the community spread's `highest` field is spelt `highest:` in `rating-spread.ts`, which the pattern does not match).
  7. **No `?tab=` links left:** `rg -n 'cellar\?tab=' src` — the only permitted hits are the parser lines in `src/app/cellar/page.tsx` (inspect).
  8. **D10:** `rg -n "No region on the wine|Fill them in" src`.
  9. **D6 routes:** `rg -n "redirect\(" "src/app/cellar/[lotId]"` prints three lines, each to `/cellar?lot=`.
  10. **D14:** `rg -n "merged_into" src/lib/supabase/database.types.ts` matches.
  11. **Pure-module imports** — every hit must be an `import type` line (inspect): `rg -n 'from "@/' src/lib/cellar/types.ts src/lib/cellar/format.ts src/lib/cellar/cellar-rows.ts src/lib/cellar/storage-merge.ts src/lib/cellar/rating-spread.ts src/lib/cellar/history-math.ts src/lib/cellar/collection-math.ts src/lib/cellar/own-lots.ts src/app/cellar/drink-copy.ts src/app/catalog/catalog-list-math.ts`
  12. `rg -n "server-only|from \"next" <the same files> src/lib/cellar/embed.ts src/lib/cellar/bottles.ts src/lib/cellar/history.ts src/lib/cellar/lot-sheet.ts src/lib/cellar/collection.ts`
  13. **Bounded reference reads:** `rg -n '\.from\("(appellations|producers)"\)' src/lib/cellar src/app/cellar src/app/catalog "src/app/u/[id]/cellar"`
  14. **Tokens only:** `rg -n "#[0-9a-fA-F]{6}\b|bg-white|text-black" src/lib/cellar src/app/cellar src/app/catalog "src/app/u/[id]/cellar"`
  15. **No `window.confirm`:** `rg -n "window\.confirm\(" src/app/cellar src/app/catalog "src/app/u/[id]/cellar"`
  16. **Privacy:** `rg -n "cellar_consumptions|wine_pour_intents|wset_notes" "src/app/u/[id]/cellar/page.tsx"`; and `rg -n "readOnly" src/lib/cellar/bottles.ts` shows the notes and pour-intent reads gated (inspect).
  17. **D11, the add-wine sheet untouched:** `git log --format=%H --grep='^feat(cellar-catalog)' | xargs -I{} git show --stat --format= {} -- src/components/add-wine` prints nothing.
  18. **The label reader untouched:** the same over `src/lib/label-scan`; **the lockfile untouched:** the same over `package-lock.json`.
  19. **No migration:** `git log --format=%H --grep='^feat(cellar-catalog)' | xargs -I{} git show --stat --format= {} -- supabase/migrations` prints nothing.
  20. **Nav:** `rg -n '"/cellar/history"|"/cellar/collection"|label: "Bottles"' src/components/nav-links.ts` prints three lines.
  21. **Plan copy marked:** `rg -n "plan copy" src/app/cellar src/lib/cellar src/app/catalog "src/app/u/[id]/cellar"` — every string in the Plan copy table appears with its comment (inspect against the table).
- [ ] List every failure as a CC-V2/V3 item, naming its owning task from the OWNS lists.

**Acceptance:** every command is green, or its failures are listed with owners.

### CC-V2 — Adversarial review

**Depends on:** CC-V1

**OWNS:** none (read-only)

Four reviewers in parallel. Each receives the spec, the code map, the hand-off text, the decisions ledger, CLAUDE.md, AGENTS.md, this plan and the cellar-catalog commits' diffs (`git log -p --grep='^feat(cellar-catalog)' 7902b68..HEAD`) limited to its scope, and reports findings as `{ file:line, severity: high|medium|low, claim broken, reproduction, owning task }`.

1. **Money and windows (D4, D11, D13).** No price, value, spend, valuation, "coming" or retail line reaches any render for anyone; `Paid` shows only on the owner's own lot sheet and only when set; `estimated_price` is selected nowhere outside the untouched write path; the add-wine sheet's files are byte-identical to `7902b68`; drink windows render in the lot sheet only.
2. **Privacy and RLS.** `cellar_consumptions`, `wine_pour_intents`, `friendships` and the viewer's notes are read only for the owner/viewer and never reach `/u/[id]/cellar`; `getLotSheet` refuses a lot the viewer does not own; every write in `lot-actions.ts` is scoped by `owner_id = auth.uid()`; the merge touches the owner's lots only; `getLiveTastingName` reads tastings the viewer is host or JOINED of; the community spread and `catalog_wine_ratings` expose only what every signed-in user can already read (identified notes); the tasting link (D8) comes from the pour intent, never from occasion text.
3. **Hand-off fidelity and D-ledger.** C1–C7b and W1–W2b copy verbatim at 375 px and 1280 px from the code (two forms rendered where the mock differs by width); the Plan copy table is complete and nothing else was invented; D1 (free text + merge), D2 (checked default), D3 (most recent everywhere, including the catalog list and the wine page's order), D5 (three routes, three redirects), D6 (sheet from a row and from the three routes; `?lot=` stays in sync), D9 (in-flight = intents with a null consumption), D10 (no fallback group), D12 (read-only frame: no Yours, no actions, no sheet, no marker, no sub-nav), D14 (types only).
4. **Cross-cutting.** Controlled inputs on every form and filter; tokens only; 44 px targets on every phone control (rows, cards, chips, stepper, menu items, pager); light and dark render; no `window.confirm`; producers and appellations never preloaded; pure modules import by relative path only and load in vitest; the retired files and names are gone; the scheduled deprecations are deleted; the `?tab=` redirects; the grid holds 24 and "Show the rest"; the list 25 and "Page x of y"; the eight-group cap; the merge notice only under "Where it is"; `NewNoteModal.consumptionId` reaches `NoteEditor`.

**Output:** one consolidated list; the main session accepts or rejects each finding with a reason, groups the accepted ones by file, runs one fix agent per disjoint group (a failing test first for a pure module), re-runs CC-V1 until green, and commits each group.

### CC-V3 — Browser verification with a seeded cellar (main session)

**Depends on:** CC-V2 (fixes committed, CC-V1 green)

**OWNS**
- create `.superpowers/cellar-catalog/seed-cellar.mjs` (gitignored) and its record file `.superpowers/cellar-catalog/seed-cellar.json`

**The seed script** — `node .superpowers/cellar-catalog/seed-cellar.mjs --create | --delete` (reads `.env.local` the way `.superpowers/blind-tasting/probes/browser-fixture.mjs` does; the service-role client for every write; `--create` refuses to run while `seed-cellar.json` exists; `--delete` removes only the ids the record file names, verifying each row's marker before deleting, then unlinks the record).
- **Owner:** `demo.isabelle@blindr.invalid` (found through `auth.admin.listUsers`, as `.superpowers/demo-cellar.mjs` does). **Friends:** `demo.marcus` and `demo.priya` (their ids likewise).
- **Catalog wines (6):** pick complete, non-`blind_pending`, un-merged catalog wines already linked to a revealed glass (the `pickCatalogWines` rule of `browser-fixture.mjs`, reading `wines` → `wine_answers` → `catalog_wines` with the service role and filtering `merged_into === null && blind_pending === false && producer_id && primary_grape_id && region_id && appellation_id && colour && style && vintage_kind`), six distinct producers, at least one with `colour = 'WHITE'` when available; record their ids.
- **Lots (8):** every lot `owner_id = isabelle`, `currency = "DKK"`, `lot_note = "zz cellar check"` (the marker), inserted straight into `cellar_lots` (the service role bypasses RLS; `add_cellar_lot` needs `auth.uid()`):
  1. wine 1: `quantity 3, purchased_quantity 6, storage_location "Rack B", purchased_on "2023-11-05", purchase_source "Vinmonopolet", price_per_bottle 430, drink_from 2025, drink_to 2035` — the lot the mock's C4 is drawn from (3 of 6 drunk; a Paid line; a window).
  2. wine 1 again: `quantity 2, purchased_quantity 2, storage_location "rack B"` — the merge pair (D1).
  3. wine 2: `quantity 6, purchased_quantity 6, storage_location "Rack B", purchased_on "2024-03-01"`.
  4. wine 3: `quantity 1, purchased_quantity 1, storage_location "Kitchen rack"` — "last one".
  5. wine 4: `quantity 12, purchased_quantity 12, bottle_size_ml 1500, storage_location "Floor crate"` — the magnum.
  6. wine 5: `quantity 4, purchased_quantity 4, storage_location "Rack A"`.
  7. wine 6: `quantity 2, purchased_quantity 2, storage_location null` — "No place set".
  8. wine 3 again: `quantity 2, purchased_quantity 2, storage_location "Rack C"` — a second lot of one wine (the strip's "two lots").
- **Notes** (inserted into `wset_notes` with the service role; `context_kind "OPEN"`, `taster_notes ""`, `observations []`, `faults []`, `tannin_nature []`, `colour_hue null`): by isabelle on wine 1 — two notes, `tasted_on "2026-08-02"` score 86 and `tasted_on "2026-09-04"` score 88 (D3: the row must show 88); by isabelle on wine 3 — one note, score 91; by marcus on wine 1 — 97; by priya on wine 1 — 92; by marcus on wine 2 — 93; by priya on wine 3 — 90. Record every note id.
- **Friendships:** `friendships` rows `isabelle → marcus` and `isabelle → priya` (created only when absent; only the created ones are recorded and deleted).
- **The tasting for D8** — a throwaway CLOSED tasting the way `browser-fixture.mjs`'s `createTasting` builds one, but with the service role: `tastings` insert `{ name: "zz cellar check · Loire whites, six ways", host_id: isabelle, timing_mode "LIVE", wine_source "HOST_PROVIDES", reveal_mode "BLIND", status "IN_PROGRESS", sequential_guessing false, leaderboard_reveal "PER_ATTRIBUTE", async_reveal_policy "AFTER_ALL" }`; the host's `tasting_participants` row (JOINED); one `wines` row (position 1, no contributor, `added_via "CATALOG"`) with its `wine_answers` copied from wine 1 (`catalog_wine_id` set); then `tastings.update({ status: "CLOSED" })`. Then the consumption **at a tasting**: `cellar_consumptions` insert `{ owner_id: isabelle, lot_id: lot 1, catalog_wine_id: wine 1, quantity 1, reason "DRANK", consumed_on "2026-09-04", occasion: the tasting's name, wset_note_id: isabelle's 88 note }`, and `wine_pour_intents` insert `{ wine_id: the glass, owner_id: isabelle, cellar_lot_id: lot 1, consume_on_start true, cellar_consumption_id: that consumption }` (the service role bypasses the no-update policy by inserting the row complete).
- **The other consumptions** on lot 1: **at home** `{ quantity 1, reason "DRANK", consumed_on "2026-08-02", occasion "Sunday lamb", wset_note_id: null }`; **gifted** `{ quantity 1, reason "GIFTED", consumed_on "2025-05-11", occasion "to Maja" }`. (Three consumptions; `purchased_quantity 6 − quantity 3 = 3` matches.)
- **In tonight's flight (D9):** a second throwaway tasting `"zz cellar check · tonight"`, `status "DRAFT"`, host isabelle, one glass on wine 3 with its `wine_answers`, and a `wine_pour_intents` row `{ cellar_lot_id: lot 4, consume_on_start true, cellar_consumption_id: null }` — lot 4 shows "1 bottle in tonight’s flight" / "Tonight".
- **Read-only:** set `profiles.cellar_visibility = 'PUBLIC'` on marcus (recording the previous value for `--delete` to restore) and give marcus two lots (marker `"zz cellar check"`) on wines 2 and 5.
- **Record file:** every created id by table, the friendship rows created, marcus's previous visibility. **`--delete`:** `cellar_consumptions` (by id), `wine_pour_intents` (by wine id; cascade also covers them), the two tastings (`name` must start with `"zz cellar check"`), `wset_notes` (by id), `cellar_lots` (by id, `lot_note = "zz cellar check"`), the created `friendships`, restore marcus's visibility; print each table's deleted count; unlink the record.

**Setup (once)**
- The integrate worktree's dev server against the live database; `LABEL_READ_FIXTURE` set; the Browser pane visible for interactive checks.
- `node .superpowers/cellar-catalog/seed-cellar.mjs --create`; sessions via `.superpowers/demo-session.mjs demo.isabelle@blindr.invalid /cellar` (owner) and, for the read-only check, `demo.marcus@blindr.invalid` is the owner viewed while signed in as isabelle (`/u/<marcus id>/cellar`).
- Two viewports for every check: the `mobile` preset (375×812) and a 1280 px `desktop`; both themes (the in-app theme menu). Also: no horizontal overflow at 375 px; every phone control ≥ 44 px; no text below 10 px.

**Screens** (each at 375 and 1280, light and dark; take a screenshot of each)
- [ ] **C1 / C1b — Bottles, list:** the header subtitle "32 bottles · 6 wines · you have tasted 2 of them" (lots 1–8: 3+2+6+1+12+4+2+2; isabelle's notes are on wines 1 and 3) / phone "32 bottles · 6 wines · 2 tasted"; the five tiles (four on the phone); the row of lot 1 reads "3 ×" + "3 of 6 drunk", "Rack B" + "added Nov 2023", yours 88 (D3, not 86) in bordeaux, community 90.8 in gold (86, 88, 97, 92 → 90.75 → "90.8"); lot 4 "last one" and the gold in-flight marker; lot 5 "1.5 L magnum"; lot 7 a dash under Where; hover actions on a laptop row; tapping a phone row opens the sheet.
- [ ] **C2 / C2b — Bottles, grid:** the switch persists across a reload; corner badges "3 bottles", "last one", "Tonight" (lot 4), "12 bottles"; the foot "Yours 88 Sep 2026 | 90.8 4 notes"; "Rate it" on an untasted card; hover row "Drink one · Note · ⋯".
- [ ] **C3 / C3b — grouped by Where it is:** groups "Rack B" (lot 1 + lot 3 = 9 bottles) and "rack B" (2) separate; "Floor crate", "Rack A", "Kitchen rack", "Rack C", then "No place set" last; the notice "Two places look like one." with “Rack B” and “rack B”; "Merge them" → the two groups become one and the notice disappears; phone headers stick while scrolling.
- [ ] **C3c / C3d — grouped by Country and by Region:** the header lines with regions/appellations/producers counts; region headers "· {country}"; rows drop the parts the header said; no "No region on the wine".
- [ ] **C4 / C4b — the lot sheet** for lot 1, opened from the row, from `/cellar/<lot 1 id>` (redirect → `?lot=`), from `/cellar/<id>/edit` (edit mode) and from `/cellar/<id>/drink` (drink sheet over it): eyebrow "In your cellar"; "Your note · 88 · Very good · Written 4 Sep 2026 · {done} of 18 assessed"; "Community rating · 90.8 · 4 notes · highest 97 · lowest 86" (phone "4 notes · 86 to 97") and "2 by friends"; Bottles "3 left / of 6 bought"; Size "750 ml / standard"; Where "Rack B / free text — group by it"; Added "Nov 2023 / from Vinmonopolet"; "Paid · 430 DKK a bottle"; "This lot so far": "4 Sep 2026 · Drank 1 at [zz cellar check · Loire whites, six ways] · note 88", "2 Aug 2026 · Drank 1 · Sunday lamb · no note + Note", "11 May 2025 · Gifted 1 · to Maja"; the drink window "2025–2035 · yours, and shown only here"; Edit lot round-trips a storage change; Add bottles 2 → "5 left / of 8 bought"; the phone ⋯ menu; Escape and the backdrop close; `?lot=` in the URL while open, gone after close, filters intact.
- [ ] **C5 / C5b — drinking:** from the row's Drink and from the sheet's Drink one: "Take it out of the cellar", the subtitle "3 in the cellar · Rack B · community 90.8 from 4 notes", the stepper "of 3 · 2 left after this", Today/Yesterday/Pick a date, "Write a note about it after" checked → "Drink one bottle" → the note editor opens on the wine; save a minimal note (score 80) → the row reads "2 ×", the History row shows 80 and the lot's history "note 80". Then a second drink with the box unchecked → the sheet closes and the row reads "1 ×" and "last one". (Both test notes are deleted through the editor's Delete before `--delete`; the consumptions go with the seed.)
- [ ] **C6 / C6b — History** (checked after the two test drinks, today being 2026-09-17): the 2026 band "4 bottles in 2026" · "1 at a tasting · 3 at home · 0 gifted" · "2 you wrote up · 2 you did not" (the seeded tasting row with its 88 note, the seeded "Sunday lamb" row without one, the test drink with the 80 note, the test drink without) — phone "4" / "bottles · 2 written up"; the year select offers 2026 and 2025, and 2025 reads "1 bottle in 2025" (singular) · "0 at a tasting · 0 at home · 1 gifted"; the five filters read "Everything 4 · Drank 4 · Gifted 0 · At a tasting 1 · Without a note 2" (phone "All 4 · Drank 4 · Gifted 0 · Tastings 1 · No note 2"); September and August headers with subtotals ("September 2026 · 3 bottles · 2 written up", "August 2026 · 1 bottle · 0 written up"); "poured at [zz cellar check · Loire whites, six ways]" as a link to the closed tasting; "at home · Sunday lamb"; "to Maja" under 2025; "+ Note" on the "Sunday lamb" row opens the editor with the consumption linked (the row shows the score after saving; delete it afterwards); "Show the rest of 2026" does not appear with fewer than 26 rows.
- [ ] **C7 / C7b — The collection** (before the test drinks, or with their two bottles subtracted): "32 / across 6 wines"; "You have tasted 2 / of the 6 · 4 to go"; "Your average 89.5" (88 and 91) with "community 90.6 on the same wines" (90.75 and 90.5); "Best you own 90.8 · {wine 1's lot title}" unless another seeded wine's live community average is higher (then that one); the five panels with their eyebrows ("3 countries · … regions" per the picked wines) and bars; no value panel, no "Coming".
- [ ] **W1 / W1b — the catalog:** the band; "In my cellar 6" and "I have tasted 2" filters; rows with community rating + count, blind count, yours (88 on wine 1) and "5 owned" (lots 1+2) / "3 owned" (lots 4+8 on wine 3); hover "Open · Rate it · Add to cellar" (the sheet opens on the lot step).
- [ ] **W2 / W2b — one wine** (wine 1, owned; wine 2's page as marcus's-only wine is not owned by isabelle): the identity grid with serve/decant/alcohol where set; the community card with "Outstanding · community rating" or the band for 90.8; "In {n} cellars · {b} bottles"; the gold strip "You own 5 bottles · Rack B · 3 of 6 drunk · added Nov 2023 · two lots" — the place is the dominant one (Rack B holds 3 vs rack B 2 → "Rack B"; after the merge check both are "Rack B", 5); "Drink one" opens the drink sheet on the oldest lot; "Open the lot" → `/cellar?lot=<lot 1>`; "Your notes" lists 4 Sep 2026 · 88 pts and 2 Aug 2026 · 86 pts, each opening `NoteModal`; no retail price line anywhere; the un-owned wine shows no strip.
- [ ] **Read-only:** `/u/<marcus id>/cellar` as isabelle: "{n} bottles · {w} wines", the dimension strip, grouping works, community ratings show, no Yours column, no actions, no sheet on tap (the row links to the catalog), no in-flight marker, no sub-nav, no History/collection links; set marcus back to PRIVATE (through the seed's `--delete`) and confirm "This cellar is private".
- [ ] **Nav:** the sidebar's Cellar children read Bottles · History · The collection · Add a bottle, the current one lit on each of the three pages; the phone drawer the same; `/cellar?tab=history`, `?tab=stats`, `?tab=notes` redirect.
- [ ] `node .superpowers/cellar-catalog/seed-cellar.mjs --delete`; confirm isabelle's cellar and History are back to their pre-seed state (compare the bottle count and the History row count taken before `--create`).

**Failures:** each becomes a fix in the owning task's files through the CC-V2 procedure; re-run the affected check.

**Report:** pass/fail per screen with the screenshots, the seed's printed ids and the deletion counts, plus the owner report: the Plan copy table, refinements 1–23, and any spec item that could not be built as written.

---

## Appendix A — Hand-off screens → tasks

| Screen | Built by |
|---|---|
| C0 (diagnosis) | — (no UI) |
| C1 | CC-P0, CC-P1 (maths/copy), CC-U1 (strip, toolbar), CC-U2 (rows), CC-U3 (frame, footer, header) |
| C1b | CC-P1, CC-U1 (four tiles, "Search {n} bottles"), CC-U2 (phone rows), CC-U3 |
| C2 | CC-U2 (cards), CC-U3 (24 a page, "Show the rest") |
| C2b | CC-U2 (phone cards), CC-U3 |
| C3 | CC-P1 (grouping), CC-P2 (merge), CC-U2 (headers), CC-U3 (dropdown wiring, notice) |
| C3b | CC-P1 (phone header line), CC-U2 (sticky headers) |
| C3c | CC-P1 (country headers, row lines), CC-U2 |
| C3d | CC-P1 (region headers with country, row lines, "Show n more regions"), CC-U2; the "No region on the wine" group is not built (D10) |
| C4 | CC-P3 (spread lines), CC-D2 (data, actions), CC-U4 (sheet), CC-X2 (routes) |
| C4b | CC-U4 (phone footer and menu) |
| C5 | CC-U5 (sheet, copy), CC-D2 (`getLiveTastingName`) |
| C5b | CC-U5 (bottom sheet, 44 px stepper) |
| C6 | CC-P4 (maths/copy), CC-D3 (data, D8), CC-U6 |
| C6b | CC-P4 (phone labels), CC-U6 |
| C7 | CC-P5 (maths/copy), CC-D4, CC-U7; the value panel is not built (D4) |
| C7b | CC-P5, CC-U7; the value placeholder is not built (D4) |
| W1 | CC-C1 |
| W1b | CC-C1 |
| W2 | CC-D5 (strip data), CC-C2, CC-U5 (the drink sheet it opens); the retail price is not built (D4) |
| W2b | CC-C2 |

## Appendix B — Spec sections → tasks

| Spec | Tasks |
|---|---|
| §2 D1 | CC-P2, CC-D2 (`mergeStorageLocations`), CC-U3 |
| §2 D2 | CC-U5 |
| §2 D3 | CC-D1, CC-D2, CC-C1, CC-C2, CC-P5 (the collection's "your average") |
| §2 D4 | CC-U2, CC-U3, CC-U4 (Paid only), CC-U7, CC-U8, CC-C2, CC-C3, CC-V1 gates 1–3 |
| §2 D5 | CC-U3 (`?tab=`), CC-U6, CC-U7, CC-X3 |
| §2 D6 | CC-U3, CC-U4, CC-X2 |
| §2 D7 | CC-P3, CC-D2 |
| §2 D8 | CC-D3, CC-D2, CC-U4, CC-U6 |
| §2 D9 | CC-D1, CC-P0 (`inFlightLine`), CC-U2 |
| §2 D10 | CC-P1 (no fallback), CC-V1 gate 8 |
| §2 D11 | CC-V1 gate 17 (nothing touches the sheet) |
| §2 D12 | CC-D1 (`readOnly`), CC-U3, CC-U8 |
| §2 D13 | CC-X2, CC-C3 |
| §2 D14 | CC-X1 |
| §3 routes and navigation | CC-U3, CC-U6, CC-U7, CC-X2, CC-U8, CC-C1, CC-C2, CC-X3, CC-U1 (`CellarSubNav`) |
| §4 data | CC-P0 (`BottleRow`), CC-D1, CC-D2, CC-D3, CC-D4, CC-D5, CC-C1 (catalog reads), CC-P1–P5 |
| §5.1 | CC-P1, CC-U1, CC-U3 |
| §5.2 | CC-P0, CC-P1, CC-U2 |
| §5.3 | CC-U2, CC-U3 |
| §5.4 | CC-P1, CC-P2, CC-U2, CC-U3 |
| §5.5 | CC-P3, CC-D2, CC-U4 |
| §5.6 | CC-D2 (`getLiveTastingName`), CC-U5 |
| §5.7 | CC-P4, CC-D3, CC-U6 |
| §5.8 | CC-P5, CC-D4, CC-U7 |
| §5.9 | CC-P1 (read-only forms), CC-D1, CC-U8 |
| §6.1 | CC-C1 |
| §6.2 | CC-D5, CC-C2 |
| §7 removals | CC-X2, CC-X3, CC-C2 (retail price), CC-C3, CC-U8 (summary), CC-V1 gates 1–5 |
| §8 copy | every UI task; the two D4 exceptions in CC-U7 and CC-C2; the Plan copy table |
| §9 design system | Global Constraints; CC-V1 gates 13–15; CC-V2 reviewer 4 |
| §10 non-goals | Global Constraints "Never build" |
| §11 verification | CC-V1, CC-V2, CC-V3 |

## Appendix C — What this plan could not take from the spec as written

- **Spec §5.8 "each `{ label, value }[]`, sorted by value"** for `byDecade`: the mock orders decades chronologically (2020s, 2010s, 2000s, 1990s, No vintage); refinement 10 follows the mock. If the owner wants value order for decades too, CC-P5's `byDecade` sort is a one-line change and its test's expectation flips.
- **Spec §5.8 "Bars via the existing `DistributionBar` pattern"**: that primitive holds four series in a fixed order and must never cycle (CLAUDE.md), so eight ranked bars cannot go through it directly; refinement 11 renders the top three plus "Other" through it and the ranked rows beneath.
- **Spec §5.6 "42 px stepper"**: built at the repo's 44 px floor (refinement 6).
- **Spec §4 `mergeStorageLocations(from, to)`**: `from` is a list (refinement 3) so one tap merges every spelling; the semantics are the spec's.
- **The hand-off's "Six tastings · 34 scored guesses"** capitalised count word and "Nebbiolo 100%" blend order: the count word is built with `countWord`; the blend keeps `formatBlend`'s existing "100% Nebbiolo" order (spec §6.2 names `formatBlend`).
