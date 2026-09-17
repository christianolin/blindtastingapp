# Handoff: the cellar and the catalog

Repo: **christianolin/blindtastingapp** (`master`) — Next.js App Router, Tailwind, shadcn/ui, Supabase.

Two surfaces, redesigned together because they are one object seen twice: the catalog is the shared record of a wine, the cellar is your bottles of it, and the single wine page is where they meet.

## The design file

`Blindr Cellar and Catalog.dc.html` — open it in a browser. It reads top to bottom: a diagnosis, then four cellar steps, then the catalog, then a summary. Every screen has a **full description above it — that description is the spec.** Several of them correct things I got wrong before reading the code; read them rather than inferring from the pictures.

| Step | Screens |
|---|---|
| Diagnosis | `C0` |
| 1 · Bottles | `C1` desktop · `C1b` phone |
| 2 · Same rows, other views | `C2` / `C2b` bottle view · `C3` / `C3b` grouped · `C3c` by country · `C3d` by region |
| 3 · Acting on a bottle | `C4` / `C4b` the lot sheet · `C5` / `C5b` drinking |
| 4 · The other sections | `C6` / `C6b` history · `C7` / `C7b` the collection |
| 5 · The catalog | `W1` / `W1b` the list · `W2` / `W2b` one wine |

**These are design references, not production code.** Rebuild with the repo's own primitives (`Button`, `Badge`, `Card`, `Input`, `Progress`, `StatTile`, `PageHeader`, `CountryFlag`, `NoteModal`, `AddWineButton`) and the tokens in `src/app/globals.css`.

**Every icon in every mock is a stand-in.** The app uses lucide-react and already has its set — `cellar-bottles-table.tsx` imports `Wine, Star, Search, ChevronsUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ExternalLink, NotebookPen, Pencil, Plus, List, LayoutGrid`; `cellar-summary.tsx` imports `Wine, Boxes, Coins, MapPin, CalendarCheck`. Port none of my paths.

---

# The three decisions behind this redesign

1. **Drink windows stop being displayed.** `drink_from`, `drink_to` and `readiness()` all stay in the schema; the window is visible and editable in **the lot sheet only**. It is self-entered and personal, so it should not own the most visible cell in 142 rows, and the readiness bars leave the stats page.
2. **Prices and valuation come off the cellar entirely** and become a stated *coming* panel. **Writes are untouched** — the add-wine sheet, the CellarTracker import and `wine-price-field` keep storing prices; nothing in the cellar reads them. `estimated_price` survives on the catalog wine page because there it is a shop reference with its caveat already written, not a valuation of your bottles.
3. **What replaces them is ownership and ratings:** the collection's dimensions as navigation, and two scores per row — yours and the community's.

---

# Part 1 — Bottles (C1, C1b)

## The frame

- **The four KPI tiles become five dimensions** — countries, regions, producers, grapes, vintages. Each is a way in: tapping one groups the list by it.
- **Default is ungrouped and unfiltered.** That is the view that can afford the most per row, so it carries: producer above the wine name, then grape · colour · designation, then appellation · region, country; and in the columns bottle size, how much of the lot is gone (or *last one*), where it is, when it came in, and both ratings.
- **One Ratings column**, two bare numbers — `92 · ★93.4`. The header says which is which (`Yours · Community`) and the colours hold after that: your score bordeaux, the community average gold behind a star. A dash means untasted. **No note count here** — it belongs where there is room to read it, on the card and on the wine page.
- **Six permanent controls become four:** search, Group (a dropdown, nine values), Sort, and one Filter carrying a count. Country, region, colour and grape live inside Filter and appear as removable chips when set.
- **Row actions move to hover** — Drink, Rate, ⋯ — so no column is reserved for buttons unused on 141 of 142 rows. The phone opens the lot sheet instead.
- The gold marker when a bottle is committed to tonight's flight; `3 of 6 drunk` from `purchased_quantity`.

## Bottle view (C2, C2b)

Both views stay and neither is secondary; they share one frame. Changes: **both scores become the card's foot**, labelled, with the note count; the count is a corner badge saying *last one* when it is; **the action row appears on hover only**; and **the page holds 24, not 8** — `perPage` is currently 8 for grid, which is a slideshow. The image corner carries no chip.

## Grouping (C3, C3b, C3c, C3d)

Group by **where it is, country, region, appellation, producer, grape, vintage, colour**. Client-side over rows already loaded. Each header carries what makes a group worth opening — bottles, distinct wines, how many you have tasted — and **each row drops whatever its header already said**, so under Italy a row shows appellation and region, under Piedmont just the appellation.

Country and region are **one control, not a hierarchy** — no nesting, no expanding twice. Narrowing Italy to Piedmont is the Filter's job.

Two specifics:
- **`storage_location` is a single free-text field.** No racks, no bins, no shelves. Grouping by place is the honest use of it; C3 surfaces near-duplicates ("rack B" vs "Rack B") and offers to merge them — the cheapest tidy-storage feature there is, with no schema change.
- **Region is nullable.** `stats.ts` already falls back `region ?? country ?? "Unknown"`. C3d gives those bottles a named group at the bottom that says what is missing and offers to fill it in, rather than hiding them in a bucket called Unknown.

---

# Part 2 — Acting on a bottle (C4, C4b, C5, C5b)

**The lot sheet replaces `/cellar/[lotId]/drink` and `/edit` as pages.** Keep the routes for deep links; render the sheet at them. Today both navigations leave the cellar and coming back loses your filter, your page and your place.

The sheet leads with **the two scores**: yours with its date and completeness and a way into the note, and the community average with its spread and how many notes came from friends — an average of 33 with an 86-to-97 range says something a single number cannot. Then the lot facts, then **the lot's own history** with the tasting each bottle was poured at as a link, then the lot note, then **the drink window** — quiet, at the bottom, editable, the one place it appears.

**Drinking (C5)** uses only fields `consume_cellar_lot` already takes: quantity, reason, date, occasion, plus the note it can link. Two things earn their place: the quantity says **what is left afterwards**, and when a tasting of yours is live **its name is offered as the occasion** — the same string the pour writes automatically.

---

# Part 3 — History and the collection (C6, C7)

**History** gains year totals (bottles, and the split between tastings, home and gifts), month grouping with subtotals, **the occasion as a link** — `draw_down_flight_cellar_lots` writes the tasting name into `occasion`, so most rows already know which evening they belong to and currently print it as dead text — and a **without a note** filter, which is the real backlog. Money is gone from here too.

State the privacy line rather than implying it: `cellar_consumptions` has no read policy beyond the owner, so a PUBLIC cellar never exposes what you drank.

**Stats becomes The collection.** Four headline numbers: bottles, distinct wines, **how many of those wines you have tasted** (61 of 96, which names the backlog), and **your average against the community's on the same wines** — the one comparison that says something about you rather than about the wine. Then the shape: regions, producers, grapes, colours, decades. Region, colour and decade already exist in `stats.ts`; **producers and grapes are new** and are the same aggregate shape as `byRegion` over data the rows already carry.

**Three sub-pages under Cellar** — Bottles, History, The collection — instead of client-side tabs, so a cellar view is linkable. `?tab=` redirects.

---

# Part 4 — The catalog (W1, W2)

## The list (W1, W1b)

Leads with what the community produced — wines, notes shared, the average across all of them — and your position in it sits quietly at the end of that line. **Four numbers per row:** community rating, the note count it rests on, times poured blind, your score, plus a gold badge when you own it.

**The note count is shown here** and not in the cellar list: there the wines are already yours, but a catalog of 8,412 is a question of trust, and 95.8 from 58 notes is not the same claim as 95.8 from 2. Sorting matches what `catalog-list.tsx` already offers: average score, note count, appearances, bottles, date added. Hover offers the three things you do with a catalog wine — open it, rate it, add it to your cellar.

## One wine (W2, W2b)

**Almost all of this page already exists; what it needs is an order.**

1. **Identity** — bottle, name, place badges, blend, and the serving facts folded into the same grid instead of trailing the page as small print.
2. **The community card** holds every number about the wine: the rating with its band, the note count, blind appearances, how many cellars hold it, the retail price with its existing caveat, and the write-a-note action.
3. **The gold cellar strip — the one genuinely new block.** When the wine is in your cellar the page says so, with rack, drunk progress and date added, and offers *Drink one* / *Open the lot*. This is the join the catalog has never made, and it is what lets one page serve a wine you have never seen and a wine you own six bottles of.
4. Then everything the community knows: the label's profile sections, descriptors with mention counts, averaged structure, and **how often people place the wine blind** — *producer 12%* is the most interesting number on the page.
5. **Your notes** close it, newest first, with the blind badge from `context_kind`.

---

# Grounding: what exists, what is missing

## Verified present — do not rebuild

- **`catalog_wine_ratings`** gives `avg_score` and `note_count` per wine; `catalog/page.tsx` already reads it. **`wset_notes` is readable by every authenticated user** — the policy is literally `using (true)`. So the community rating in the cellar is a join, not a build.
- **`catalog_wine_usage`** returns holders, bottles, lot_count, note_count, appearance_count, consumption_count. **`fetchWineGuessStats`** returns blind appearances, guess count and per-attribute % correct. **`fetchWineDescriptors`** returns terms with mention counts. **`fetchWineStructure`** returns community-averaged SAT. **`fetchWineBlend`** / `formatBlend` for the blend.
- **`qualityBand()`** in `src/lib/wset/quality-curve.mjs` returns exactly: **Extraordinary** 96+, **Outstanding** 90+, **Very good** 85+, **Above average** 80+, **Average** 70+, **Below average** 60+, **Unacceptable** below. Print those strings, capitalised as returned — do not write your own vocabulary.
- **`wine_pour_intents`** ties a cellar lot to a tasting glass, owner-only, drawn down at Start by `draw_down_flight_cellar_lots` and mid-flight by `pour_cellar_lot_into_glass`.
- `purchased_quantity` frozen at purchase; the append-only `cellar_consumptions` log and its four reasons; `readiness()`; the CellarTracker import; `can_view_cellar` and the read-only cellar; `NoteModal`; the persisted view choice via `safe-storage`.
- **`<CountryFlag>`** renders before the region on every row and card today. **It stays** — my mocks print "Piedmont, Italy" as plain text only because flags are not worth hand-drawing.

## Missing, and needed

1. **The "in tonight's flight" marker** — a join from `cellar_lots` to `wine_pour_intents`, which the page does not currently make. It matters: without it a bottle committed to tonight reads as available.
2. **Two new aggregates** — bottles by producer and by grape, both the shape of `byRegion`.
3. **The viewer's own lots for a catalog wine** — the only query W2's gold strip needs.
4. **The community spread** (highest, lowest, how many by friends) shown in C4 is more than `catalog_wine_ratings` exposes. Either widen the view or drop the spread.

## Decisions I would rather you made

1. **Does `storage_location` stay free text?** Grouping and merging make it useful with no migration. Structuring it — a places table, racks, bins, a bottle knowing its slot — is a much larger build and only pays off if your bottles really are in numbered positions. My read: keep the text, add the merge.
2. **Should drinking offer to write the note immediately,** or log the bottle and leave it to the *without a note* backlog? C5 offers it as a checked default.
3. **What "your score" is when you have several notes on a wine.** The page currently takes your **highest**. Most recent is the more honest default for a cellar; W2 shows the case — two notes, 88 blind and 86 open.
4. **Does the retail price stay on the wine page?** W2 keeps it on the reasoning above. If you would rather no price appear anywhere until valuation is designed, it comes out of that card too.

## Not drawn

The empty cellar, someone else's cellar read-only (the `readOnly` path exists and would now show community ratings but not yours), the CSV import screens, and bulk selection.

---

# Tokens

Bordeaux `#5C1A2B` / hover `#4A1523` · gold `#C3A25B` / `#B78E42` · dark gold `#6E5416` (small gold text needing contrast) · rose `#A8425A` · parchment page `#EFE7D8`, surfaces `#F5EFE3` / `#FBF7EF` / `#EDE4D1` · borders `#E0D2B4`, `#F0E6D1`, `#DCCEB0` · ink `#2A211E` · secondary ink `#5A4B3C` · muted `#7A6A52`.

**Do not use `#A79574` for anything that carries meaning** — it measures 2.7:1 on the card surface. An untasted dash, a "not set", a live stepper control: all `#7A6A52` (4.9:1).

Cormorant Garamond 600 for headings, wine names, scores and numerals; Manrope for UI; monospace uppercase eyebrows at 9–10.5px with `letter-spacing:.1–.12em`. Radii: sheet 16, cards 12–13, buttons 8–11, pills 999. Buttons carry `0 2px 0 0 rgba(42,33,30,.18)`. Set `box-sizing: border-box` globally. Mobile tap targets 44px; the quantity stepper is 42px tall for one-handed use in a dim room. Bottle images are `catalog_wines.image_url`; the hatch `repeating-linear-gradient(135deg,#EDE4D1 0 6px,#E5D9C0 6px 12px)` is the empty state.
