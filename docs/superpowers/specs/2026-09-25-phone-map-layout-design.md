# Wine map on the phone — design

Date: 2026-09-25. Owner (2026-09-24): on the phone the map is cramped and other
things are in the way; entering the map from the menu should align perfectly with
no page scrolling (you want to pinch the map, not scroll the page); the map should
stick; the hierarchy should start collapsed like a menu; the details panel needs
rethinking; the country labels above the map can go on the phone. The map itself
works well — the page around it is the problem.

Measured today at 375×812: roughly 480–500 px of header, page heading, filter row,
the One|All switch with its status line and the country chips sit above the map;
the closed Details bar covers the bottom 84 px; about 240 px of the 568 px map is
visible at first paint; the page scrolls ~1,000 px; the 600 px hierarchy card sits
below the map with its collapse control hidden because there was no way back.

## 1. Decisions (phones = below `md`, 768 px; tablets and desktop unchanged)

- **D1 A fixed screen, no page scroll.** On phones the map page is exactly the
  viewport: sticky header (+ the active-tasting strip when present), one compact
  toolbar row, the map filling the rest, and a bottom bar. The page column does not
  scroll; only the sheet body does. Achieved on this page alone (a `data-map-page`
  wrapper with `h-[calc(100dvh-var(--app-header-h))]` and `overflow-hidden` on
  phones), never by changing `AppShell` — its "the content column is the scroll
  container" rule stays for every other page. The page heading and subtitle are
  hidden on phones; the header's phone `title` slot reads "Wine map".
- **D2 One toolbar row on phones.** Left to right: the grape Filter (the existing
  combobox trigger, icon + short label, opens as today), the Local|English toggle,
  and a "Map options" button (SlidersHorizontal icon, `aria-label="Map options"`)
  that opens a small bottom sheet holding the One country | All countries
  radiogroup, its status line and Retry. The country chips are not rendered on
  phones (they stay from `md`). The status line's `role="status"` lives in the
  options sheet, so the All warning is read next to the switch that causes it. The
  One|All rules, keys and copy are untouched (`detail-status.ts`,
  `detail-mode.ts`).
- **D3 The map height is definite.** The map wrapper's phone height comes from a
  flex chain with a definite top: page wrapper (dvh) → explorer column
  (`flex min-h-0 flex-1 flex-col`) → map wrapper (`min-h-0 flex-1`), and the
  MapLibre container keeps `h-full`. From `md` the wrapper keeps today's
  `h-[70vh] min-h-[420px]` (and Full view's `h-[calc(100dvh-12rem)]`). The two
  earlier "map collapsed to zero" bugs came from flex chains WITHOUT a definite
  top; the definite dvh height is the guard, and a browser check at 375×812 and
  375×667 (iPhone SE) is required before the deploy.
- **D4 One bottom sheet, two tabs: Explore and Details.** Closed, it is a 56 px
  bar: a drag-handle pill, two tab buttons (`role="tablist"`), and the selected
  place's name (or "Explore the map") in the bar. States: `closed` (bar only),
  `half` (about 50dvh; the map stays visible and interactive above it), `full`
  (`top` at the header's bottom). Tapping a tab opens `half` on that tab; tapping
  the active tab again, the chevron, Escape or swiping the handle down closes; the
  handle dragged up goes `full`. The sheet is not modal: the map keeps responding
  behind it.
  - **Explore** = the hierarchy tree with its search box, scrolling inside the
    sheet body (`wine-map-tree.tsx`'s scroll-into-view walks to the nearest
    scrollable ancestor, which becomes the sheet body). Countries start collapsed
    (already the case). Picking a place selects it, flies the camera as today, and
    switches the sheet to Details at `half`.
  - **Details** = today's details content (badge, name, Typical wine, article,
    Key facts, KnowledgeSections incl. Nearby), scrolling inside the sheet body.
  - A map tap selects and opens Details at `half` (today it only relabels the
    closed bar). A `?place=` deep link opens Details at `half` after the fly.
  - Nearby / dual-label chips inside Details keep swapping content in place.
- **D5 Canvas controls.** The MapLibre zoom/compass group stays top-left; the
  Legend pill stays collapsed bottom-left but sits above the bar (`bottom-16`
  on phones); the compact attribution stays bottom-right above the bar. Full view
  stays `lg`-only.
- **D6 Nothing new is persisted** and nothing new enters the URL; sheet state
  resets on load. `wine-map-lang` and the One|All flags behave as today.
- **D7 Tablets (md–xl) and desktop (xl+) are unchanged** by this spec: the stacked
  column with the fixed details card stays on tablets, the three columns on
  desktop. The phone rules key on `max-md:` classes and a `useIsPhone()` hook
  (matchMedia `(max-width: 767px)`, `useSyncExternalStore`, server snapshot false)
  only where a JS decision is needed (which sheet opens on a tap).
- **D8 Performance.** The phone canvas grows from about 373×438 to about 375×560.
  Re-measure with `?debugPerf=1` on the production build at 375×812 before the
  deploy (One and All); the bar is unchanged: 0 long tasks on every probe row.
  The probe overlay must not cover the toolbar (it sits inside the map, top-left,
  as today).
- **D9 Accessibility.** Tabs are a `tablist` with `aria-selected`; the sheet has
  `aria-label="Map panels"`; every phone control is at least 44 px tall; the
  options sheet keeps the All radio's `aria-describedby`; the `role="status"`
  region moves with the status line (one region, never two).

## 2. Files

- `src/app/knowledge/map/page.tsx`: phone-only wrapper and title slot; heading
  `hidden md:block`.
- `src/app/knowledge/map/tile-wine-map-explorer.tsx`: the phone branch of the
  layout (toolbar row, options sheet, map wrapper classes, the bottom sheet with
  the tree and details as tabs, the removed 80 px spacer and the fixed details card
  on phones), selection → sheet state rules, deep-link → Details.
- New `src/app/knowledge/map/map-bottom-sheet.tsx` (closed/half/full, tabs,
  drag handle, Escape) and `src/lib/wine-map/sheet-state.ts` (pure reducer:
  `sheetReducer(state, event)` for tab taps, map tap, tree pick, deep link, close,
  drag) with tests.
- New `src/app/knowledge/map/map-options-sheet.tsx` wrapping `MapDetailControls`
  on phones; `country-chips.tsx` render gated to `md+` by the explorer.
- `src/app/knowledge/map/tile-wine-map.tsx`: legend/attribution offsets on phones
  (`max-md:bottom-16`), nothing else.
- `src/components/app-header.tsx` already has the phone `title` slot.
- CLAUDE.md: amend the wine-map bullets (the chips/status "toolbar above the map"
  sentence gets "on md+; phones get the options sheet"), a new bullet for the phone
  screen, the sheet, and the definite-height rule.

## 3. Tests

Pure: `sheetReducer` (every transition; a map tap from `closed` → `half/details`;
active-tab tap closes; deep link → `half/details`; tree pick → `half/details`).
Browser (production build, 375×812 and 375×667, light and dark): no page scroll
(`scrollHeight === clientHeight` on the column); map fills the space between the
toolbar and the bar; tap a region → Details opens at half and the map is still
pinchable above; Explore tab → tree scrolls inside; pick → fly + Details; options
sheet → One|All switch works, status text present, All warning shown while All;
the probe rows at 375 show 0 long tasks in both modes; desktop (1440) pixel parity
with the current site on the eight reference views; tablet 768 unchanged.

## 4. Rollout

One production deploy; smoke on the live site at phone size; iPhone check by the
owner in the morning (pinch vs scroll can only be judged on a real phone).

## 5. Out of scope

Tablet redesign; unifying the lg/xl/md breakpoints; rendering the RPC's
`ancestors` breadcrumb or `children` pills (new UI, not a restoration); persisting
sheet state; a chips row on phones.
