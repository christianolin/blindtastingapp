# Cellar and catalog redesign — design

Date 2026-09-17. Hand-off: `design_handoff_cellar_catalog/` (README = summary; the `.dc.html` screen descriptions are the visual spec; the extracted text lives in `.superpowers/cellar-catalog/handoff-screens.md`). Code map: `.superpowers/cellar-catalog/codebase-map.md`. Owner decisions: `.superpowers/cellar-catalog/decisions.md`.

## 1. Goal

The catalog is the shared record of a wine; the cellar is your bottles of it; the single wine page is where they meet. The cellar leads with what you own (how many, from where, from whom, how varied) and what it tasted like (your score and the community's). Drink windows keep working but are displayed in one place only. Prices and valuations disappear from every display; a person keeps their own purchase price on their own bottles.

## 2. Decisions

Owner (2026-09-17):
- **D1** `storage_location` stays free text. Grouping by place plus a near-duplicate merge; no racks/bins schema.
- **D2** Drinking a bottle offers to write the note straight away, as a checked default.
- **D3** "Your score" on a wine is your **most recent** note, not your highest.
- **D4** No typical/retail prices and no valuations anywhere, for anyone: the catalog wine page's retail line and every value tile go, and no "coming" placeholder is shown. A person's own purchase price stays visible only to them, on their own bottle (the lot sheet). Writes are untouched: the add-wine sheet and the CellarTracker import keep storing `price_per_bottle`; `catalog_wines.estimated_price` stays in the database, unread.

Defaults chosen here (no owner question outstanding):
- **D5** Three real sub-pages under Cellar: `/cellar` (Bottles), `/cellar/history`, `/cellar/collection`. `?tab=history` redirects to `/cellar/history`, `?tab=stats` to `/cellar/collection`, `?tab=notes` to `/taste/notes` (unchanged).
- **D6** The lot sheet is a client sheet over the Bottles page, opened from a row/card (state, no navigation) and by URL: `/cellar/[lotId]`, `/cellar/[lotId]/drink` and `/cellar/[lotId]/edit` are kept as server routes that `redirect` to `/cellar?lot=<id>`, `?lot=<id>&do=drink` and `?lot=<id>&do=edit`; the Bottles page opens the sheet from those params once (like `SheetFromQuery`) and keeps `?lot=` in sync with `history.replaceState` while it is open. Filters, grouping and page survive because nothing navigates.
- **D7** The community spread (highest, lowest, how many by friends) is computed from the wine's notes plus the viewer's friendships (notes with an identity are readable by every signed-in user) in a pure helper. No view widening, no migration.
- **D8** The tasting link on a history row comes from `wine_pour_intents.cellar_consumption_id` → `wines.tasting_id` (exact, owner-readable), never from matching the `occasion` text; a row without an intent shows its occasion as plain text.
- **D9** "In tonight's flight" = the lot has a `wine_pour_intents` row with `cellar_consumption_id is null` (committed, not yet poured); the marker names the count of such bottles.
- **D10** `catalog_wines.region_id` is NOT NULL today, so the hand-off's "No region on the wine" group (C3d) cannot occur and is not built; grouping by region has no fallback bucket.
- **D11** The add-wine sheet (`src/components/add-wine/**`) is out of scope: its cellar picker keeps its own drink-window "drink now" flag and its lot step keeps the price field (a write).
- **D12** The read-only cellar (`/u/[id]/cellar`) reuses the new Bottles frame in `readOnly` mode: community ratings shown, the viewer's own score and every action hidden, no lot sheet, no value anywhere.
- **D13** The catalog's curator retail-price editor (`wine-price-field.tsx`, `wine-price-actions.ts`) and the `estimatedPrice` input on the catalog new/edit wine form are removed from the UI (they enter a cross-user typical price, which D4 drops); the columns and the `CatalogWineInput.estimatedPrice` type stay optional so nothing else breaks.
- **D14** No migration. The only schema-adjacent change is fixing the hand-written types: `catalog_wines.merged_into` is live but missing from `database.types.ts`.

## 3. Routes and navigation

| Route | Renders |
|---|---|
| `/cellar` | Bottles: header, dimension strip, toolbar, list or grid (persisted choice), grouping; the lot sheet and the drink sheet mount here |
| `/cellar/history` | History |
| `/cellar/collection` | The collection |
| `/cellar/[lotId]`, `/cellar/[lotId]/drink`, `/cellar/[lotId]/edit` | `redirect` to `/cellar?lot=…` (D6) |
| `/cellar/new`, `/cellar/import` | unchanged |
| `/u/[id]/cellar` | read-only Bottles (D12) |
| `/catalog` | the list (W1) |
| `/catalog/[wineId]` | one wine (W2) |

Sidebar (`nav-links.ts`): Cellar's children become Bottles (`/cellar`), History (`/cellar/history`), The collection (`/cellar/collection`), Add a bottle (modal). Catalog's children unchanged. The three cellar pages share a sub-nav row under `PageHeader` (three links, the current one bordeaux) so they are reachable from each other on every width.

## 4. Data (no migration)

All reads under the viewer's RLS with the server Supabase client. New server modules in `src/lib/cellar/`:

- `bottles.ts` — `getCellarBottles(ownerId, viewerId)` → `BottleRow[]`: lot (id, quantity, purchased_quantity, bottle_size_ml, storage_location, purchased_on, purchase_source, price_per_bottle, currency, drink_from, drink_to, lot_note), wine (catalog_wine_id, title via `catalogWineTitle`, producer, wine_name, vintage label, primary grape, colour, designation, appellation, region, country, image_url), community (`catalog_wine_ratings` avg_score, note_count), yours (the viewer's most recent `wset_notes` for that wine: id, quality_score, tasted_on — D3), `inFlight` (D9). Reads: `cellar_lots` with the identity joins `cellar/page.tsx` makes today, `catalog_wine_ratings` for the distinct wine ids, the viewer's notes for those wine ids ordered `tasted_on desc, created_at desc`, `wine_pour_intents` for the owner's lots (owner only; skipped in readOnly).
- `lot-sheet.ts` — `getLotSheet(lotId)` → the row above plus: yours `{ score, band: qualityBand(score), tastedOn, assessed: { done, total } }` (assessed from the note's WSET fields via the existing note-summary helper), community `{ avg, count, highest, lowest, byFriends }` (D7: `wset_notes` for the wine (`quality_score`, `author_id`); friends = the viewer's `friendships.friend_id`), history rows (`cellar_consumptions` for the lot: date, reason, quantity, occasion, note score via `wset_note_id`, tasting `{ id, name }` via D8), and the drink window. Server actions in `src/app/cellar/lot-actions.ts`: `updateLot(lotId, fields)` (quantity, bottle_size_ml, purchase price + currency, purchased_on, purchase_source, drink_from, drink_to, storage_location, lot_note — replaces the client-side `edit-lot-form.tsx` write), `addBottles(lotId, n)` (quantity and purchased_quantity both +n), `mergeStorageLocations(from, to)` (the owner's lots only), `getLiveTastingName()` (the viewer's IN_PROGRESS LIVE tasting as host or JOINED, newest; null otherwise).
- `history.ts` — `getCellarHistory(ownerId)` → every consumption with wine title, reason, quantity, date, occasion, note score, tasting link (D8), plus the years present.
- `collection.ts` — `getCollectionStats(ownerId)` → the pure `collection-math.ts` over the bottle rows: bottles, distinct wines, tasted (distinct wines with a note by the viewer), your average and the community average on the same wines (wines with both a note of yours and a community average: mean of your most-recent score vs mean of the community average), best you own (highest community average among owned, with title), `byRegion`, `byProducer`, `byGrape`, `byColour`, `byDecade` (each `{ label, value }[]`, sorted by value, top 8, with the distinct count for the section eyebrow).

Catalog:
- `catalog/page.tsx` adds: your most recent score per wine (one query of the viewer's notes, D3), your owned bottles per wine (the viewer's `cellar_lots`), the header band (wine count, sum of `note_count`, the mean of `avg_score` weighted by `note_count`, your note count, your owned count). Blind pours already come from `catalog_wine_appearances`.
- `catalog/[wineId]/page.tsx` adds `getOwnLotsForWine(wineId)` → the viewer's lots (id, quantity, purchased_quantity, storage_location, purchased_on) for the gold strip.

Pure modules (relative imports only, vitest): `src/lib/cellar/cellar-rows.ts` (dimension counts; group by where, country, region, appellation, producer, grape, vintage, colour; header stats — bottles, wines, tasted, and per grouping the "one level down" counts (country → regions and producers; region → appellations and producers; the rest → producers, except under producer); which place line each row keeps under a grouping; search; sort; filter with chip labels and counts), `storage-merge.ts` (near-duplicate groups by fold: trim, collapse whitespace, case-insensitive; the suggested target is the most-used spelling), `rating-spread.ts`, `history-math.ts` (year totals: bottles, at a tasting, at home, gifted; written up vs not; month buckets with subtotals; the five filters), `collection-math.ts`.

## 5. The cellar

### 5.1 Frame (C1, C1b)
- `PageHeader`: "Cellar" · subtitle `{n} bottles · {w} wines · you have tasted {t} of them` (phone: `{n} bottles · {w} wines · {t} tasted`); actions: Import CSV, Add a bottle (the existing `AddWineButton kind="cellar"`); the visibility line ("Private — only you" · Change) stays via `CellarVisibilityControl`.
- Sub-nav: Bottles · History · The collection.
- Dimension strip: five tiles — countries, regions, producers, grapes, vintages — counts from the rows; tapping one sets the grouping to that dimension (tapping the active one clears it). Phone: four across (vintages lives inside Filter). Laptop caption: "The shape of what you own, and the way into it — tapping one groups the list by that dimension. Nothing is grouped by default: the full list comes first."
- Toolbar: search (placeholder "Wine, producer, grape or where it is"; phone "Search {n} bottles"), Group (dropdown: None · Where it is · Country · Region · Appellation · Producer · Grape · Vintage · Colour), Sort (most bottles, name, added, your score, community), Filter (one control carrying a count; inside: country, region, colour, grape, and on phones vintage; set values render as removable chips), and the list/grid switch (persisted via `safe-storage` as today).
- Footer line: "All · across {w} wines, {p} producers and {c} countries · nothing filtered, nothing grouped" or the active filters; paging "Page x of y" (list 25 a page, grid 24 a page with "Show the rest").

### 5.2 List rows (C1, C3c, C3d)
Columns: Wine (producer above the title; then `grape · colour · designation`; then `appellation · region, country` with `<CountryFlag>` before the region), Bottles (`6 ×`, `750 ml` or `1.5 L magnum`; `3 of 6 drunk` when `purchased_quantity > quantity`; `last one` when quantity is 1; the gold marker `1 bottle in tonight's flight` per D9), Where (`storage_location`, `added {Mon yyyy}`), Ratings (`Yours · Community` header: your score in bordeaux, opening `NoteModal` on your most recent note; the community average in gold behind a star; a dash for untasted, with "Rate it"). Hover actions on the row: Drink, Rate, ⋯ (Open the lot, Open in catalog, Edit lot). No drink window, no price. Grouped: each row drops what its header already said (under a country: keeps appellation and region; under a region: keeps appellation; under a producer: no producer line, and so on).

### 5.3 Grid cards (C2, C2b)
Bottle image (hatch fallback) with the count as a corner badge ("6 bottles", "last one", "Tonight" when in flight); title; `producer · storage`; foot: Yours {score} {Mon yyyy} | community {avg} · {n} notes (or "Rate it"). Hover action row: Drink one, Note, ⋯. 24 a page. Phone: two across, count badge, title, producer, `92 yours · 93.4`. Tapping a card opens the lot sheet.

### 5.4 Grouping (C3, C3b, C3c, C3d)
Client-side over the loaded rows. Header: name (region headers add `· {country}`), `{bottles} bottles · {wines} wines · {sub} · you have tasted {t}` where `{sub}` is the level below. Phone headers stick and keep bottles and tasted. Groups sorted by bottle count; beyond eight groups a "Show {n} more {dimension}" control. Where it is: lots with no place form "No place set". Near-duplicate places (D1) show one notice above the groups: "Two places look like one." — "rack B" and "Rack B" are separate groups because the field is free text. Grouping is where that becomes visible, so it is also where it should be fixable. — "Merge them" (merges into the most-used spelling via `mergeStorageLocations`, then refreshes).

### 5.5 The lot sheet (C4, C4b)
Header eyebrow "In your cellar", title `{producer}, {wine} {vintage}`, line `{grape} · {colour} · {appellation} · {region}, {country}`, "Catalog →". Two score cards side by side on every width: **Your note** — score, `qualityBand`, `Written {d Mon yyyy} · {done} of {total} assessed`, "Open the note" (NoteModal) "or write another" (NewNoteModal on the wine; untasted: "Rate it"); **Community rating** — average, `{n} notes · highest {h} · lowest {l}` (phone `{n} notes · {l} to {h}`), "Read them" (the wine page), `{f} by friends`. Facts grid: Bottles (`{q} left` / `of {p} bought`), Size, Where (`free text — group by it`), Added (`{Mon yyyy}` / `from {source}`), and, per D4, Paid (`{price} {currency} a bottle`, only when set; nothing else about money). "This lot so far": the consumptions newest first — `{d Mon yyyy}` · `Drank {n} at {tasting link}` / `Drank {n} · {occasion}` / `Gifted {n} · {occasion}` · `note {score}` or `no note` (+ Note). Lot note with Edit. Drink window `{from}–{to} · yours, and shown only here`, editable. Footer: Drink one, Add bottles, Edit lot (phone: Drink one and Open the note; Add bottles, Edit and the destructive actions in the ⋯ menu). Edit lot switches the sheet body to the lot fields (D6's `updateLot`); Add bottles asks for a count and calls `addBottles`. Escape and backdrop close; controlled inputs.

### 5.6 Drinking (C5, C5b)
A bottom sheet (centred dialog on laptop) titled "Take it out of the cellar", subtitle `{title}`, line `{q} in the cellar · {place} · community {avg} from {n} notes`. Fields exactly `consume_cellar_lot`'s: How many (42 px stepper; `of {q} · {left} left after this`), What happened to it (Drank · Gifted · Lost · Other), When (Today · Yesterday · Pick a date), What for (optional; placeholder "Sunday lamb, someone's birthday…"; when `getLiveTastingName()` returns one, a chip "{name} — live now" fills it). "Write a note about it after — opens the tasting note with this wine filled in." checked by default (D2): after `consumeLot` succeeds, `NewNoteModal` opens on the wine with the new consumption id (the editor already links it). Confirm: "Drink one bottle" / "Drink {n} bottles" (the reason word for Gifted, Lost, Other). Footer note "Logged, not deleted. It stays in History." Cancel.

### 5.7 History (C6, C6b)
Header "Every bottle that has left your cellar" · "Always private, even when your cellar is not". Year band: `{n} bottles in {year}` · `{a} at a tasting · {h} at home · {g} gifted` · `{w} you wrote up · {u} you did not`. Year select. Filters: Everything {n} · Drank {n} · Gifted {n} · At a tasting {n} · Without a note {n}. Months as sticky headers with `{n} bottles · {w} written up`. Row: `{producer}, {wine} {vintage}` · `poured at {tasting link}` or `at home · {occasion}` or `to {occasion}` · `Drank {n}` / `Gifted {n}` · `{d Mon}` · your score (opens NoteModal) or "+ Note" (NewNoteModal with the consumption id). "Show the rest of {year}" past 25 rows. No money.

### 5.8 The collection (C7, C7b)
Caption: "What is in it, and how it has been rated. Your tasting record lives in Your numbers" (link). Four headline numbers: `{bottles}` across `{wines} wines`; You have tasted `{t}` of the `{w}` · `{w−t} to go`; Your average `{ya}` community `{ca}` on the same wines; Best you own `{score}` `{title}`. Panels: Where it comes from (`{c} countries · {r} regions`, by region), Producers you are deep in (`{p} producers`), Grapes (`{g} grapes`), Colour, Vintages (`{y} years`, by decade, plus "No vintage"). Bars via the existing `DistributionBar` pattern. No readiness, no value panel (D4).

### 5.9 Read-only cellar (D12)
`/u/[id]/cellar` renders the same frame with `readOnly`: no Yours column, no actions, no lot sheet, no in-flight marker, no history or collection links; community ratings and grouping work.

## 6. The catalog

### 6.1 The list (W1, W1b)
Header: "The shared wine database, built by everyone tasting" · Add a wine. Band: `{wines} wines` · `{notes} tasting notes shared` · `{avg} average across all of them` · "You have notes on {t} · you own {o}". Toolbar: search ("Wine, producer, appellation or grape"), Sort (existing keys), Filter: Everything · In my cellar {o} · I have tasted {t}. Columns: Wine (producer, title, `grape · colour · designation`, appellation), Where it is from (region, country with flag), Notes (average in gold with the note count under it), Blind (appearances), Yours (your most recent score; "{n} owned" gold badge when owned). Hover: Open · Rate it · Add to cellar (the add-wine sheet's cellar destination with the wine preselected, as the record page does). 25 a page; "1–25 of {n} · sorted by {sort}". Phone: the band as one line; the row keeps rating + note count, your score and the owned badge on the right. No price column.

### 6.2 One wine (W2, W2b)
Order: (1) identity — bottle image (`WineImage`), name, place badges (country · region · appellation, the appellation linking to the map), colour · style, blend (`formatBlend`), alcohol, serve at (`serving_temp_min_c`–`serving_temp_max_c` °C), decant (`decant_minutes`); each only when set; (2) community card — `{avg}` `{qualityBand} · community rating`, `{n} tasting notes`, `{b} blind tastings`, `In {holders} cellars · {bottles} bottles` (from `catalog_wine_usage`), "Write a tasting note"; no retail price (D4); (3) the gold cellar strip when the viewer owns it — "You own {q} bottles" · `{place} · {drunk} of {bought} drunk · added {Mon yyyy} · {one lot | n lots}` · Drink one (the drink sheet on the first lot) · Open the lot (`/cellar?lot=…`); (4) the profile sections that are set (The producer, Aroma, Tasting notes, Food pairing), What people find (descriptors with counts; "Counted across the {n} notes. The number is how many people said it."), Structure averaged, Poured blind (`{appearances} tastings · {guesses} scored guesses. How often people got each attribute:` with the per-attribute percentages); (5) Your notes, newest first, `{d Mon yyyy}` · Blind badge from `context_kind` · `{score} pts`, each opening `NoteModal`. Admin controls and the image uploader stay where they are.

## 7. Removals (exact sites, from the code map)
`cellar-bottles-table.tsx` value and readiness renders (grid foot, mobile card, desktop columns); `cellar-summary.tsx` value tile; `stats-panel.tsx` value/spent tiles and readiness bars (the panel is replaced by the collection); `catalog/[wineId]/page.tsx` "Average retail price"; `wine-price-field.tsx` + `wine-price-actions.ts` (deleted, D13); the `estimatedPrice` input in `new-wine-form.tsx` (D13); `u/[id]/cellar` value via the shared summary. `stats.ts`'s `value`, `spend` and `readiness` go with it (the collection maths replaces the module); the table's `readiness()` goes. Deleted files: `cellar-tabs.tsx`, `history-list.tsx`, `stats-panel.tsx`, `stats.ts`, `[lotId]/drink/drink-form.tsx` (its `actions.ts` `consumeLot` stays and is reused), `[lotId]/edit/edit-lot-form.tsx`, `wine-price-field.tsx`, `wine-price-actions.ts`, `cellar-summary.tsx` (replaced by the dimension strip).

## 8. Copy
The mock strings in `handoff-screens.md` are the copy: use them verbatim where a section above quotes them; where a number or name is interpolated, keep the sentence shape. Two exceptions per D4: the C7 "What it is worth — Coming" panel and its phone twin are not shown, and W2's "Average retail price" block and caveat are not shown.

## 9. Design system
Repo primitives only (`Button`, `Badge`, `Card`, `Input`, `StatTile`, `PageHeader`, `CountryFlag`, `NoteModal`, `NewNoteModal`, `AddWineButton`, `Dialog`, `Eyebrow`, `DistributionBar`), theme tokens only (no hex), light and dark both, 44 px tap targets on phones, controlled inputs, the lucide icons already in use. Long lists never preload `appellations` or `producers`: every name comes joined on the rows.

## 10. Non-goals
Valuation and currency (owner: later, rethought); the empty cellar beyond the existing empty state; CSV import screens; bulk selection; the add-wine sheet (D11); any migration.

## 11. Verification
`npx tsc --noEmit`, `npm run lint -- --max-warnings=0`, `npm test` (the new pure modules covered), `npm run build`; then a browser pass at 375 px and 1280 px as a demo account with a seeded throwaway cellar (lots, one consumption at a tasting, one gifted): Bottles list and grid, a grouping with a merge notice, the lot sheet from a row and from `/cellar/<lotId>`, the drink sheet through to the note, History, The collection, the catalog list filters, the wine page with and without the cellar strip, the read-only cellar; grep gates: no `estimated_price`, `totalValue`, `readiness(` or `drink_from` rendered outside the lot sheet and the add-wine sheet.
