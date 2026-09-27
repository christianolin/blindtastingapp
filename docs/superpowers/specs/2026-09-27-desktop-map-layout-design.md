# Wine map on PC: the whole map on screen — design

**Date:** 2026-09-27
**Status:** approved for build. The items marked **(owner)** (M3, M5, M7, M9, M12 and the provisional copy) are controller rulings under the owner's standing instruction ("just really try and figure out how to best optimize the space"; "just write the design and then implement"); the owner reviews them live, and each has the fallback §3 names.
**Base:** production `master` a23cd16, worktree `C:\Users\Public\repos\blindtastingapp-map`, branch `map-desktop-space`.
**Scope:** `/knowledge/map` from md (768 px) up. The app only: no migration, no database, no Anthropic API. Phones (below md) are unchanged.

## 1. The owner's words

> "when you open the map on pc, some of the map isnt visible per default. I think we should also look in to the screen "lock" feature we have on the phone - or just really try and figure out how to best optimize the space on the screen on pc"

The owner uses desktop Chrome (a window about 1675x865) and iPhone Chrome/Safari. The phone map layout is liked and must not regress.

## 2. What is wrong today

The desktop map is a fixed `h-[70vh] min-h-[420px]` box. It sits under about 280 px of chrome:

- top bar: 57 px
- `md:p-8` padding: 32 px
- the "Knowledge Explorer" h1 and subtitle: 68 px
- `md:gap-6`: 24 px
- map Card `py-4` plus CardContent `pt-4`: 32 px
- three control rows plus their gaps: about 124 px

Because the map's height ignores what sits above it, its bottom is always below the fold. The page scrolls inside AppShell's content column, and a wheel over the canvas zooms the map rather than scrolling the page.

Measured on production (a23cd16):

| Viewport | Map rect (l, t, w, h) | Hidden below the fold |
|---|---|---|
| 1366x768 | 585, 410, 381, 536 | 178 px (the control rows wrap) |
| 1660x850 | 585, 338, 675, 593 | 81 px |
| ~1675x865 (owner) | about 690x605 | about 78 px |
| 1920x1000 | 585, 338, 935, 698 | 36 px |
| 1024x768 | 109, 338, 851, 536 | 106 px, in a 1604 px page, with the tree stacked below |

Other problems found:

- At xl the Details card has no scroller, so a long article stretches the row and the page.
- The tree card is `xl:sticky xl:top-6` and slides about 33 px under the 57 px sticky header.
- At md–xl the details panel is a fixed full-viewport-width bar that covers the rail, and the tree sits below the map.
- The legend opens by default from 1024 px wide at up to 45vh.

## 3. Decisions

| # | Decision | Reason |
|---|---|---|
| M1 | From md up, lock the page to the screen with the phone's flex chain: flex-1 + min-h-0 at every level from AppShell's `h-dvh` column down to the canvas, never a `calc`. The lock applies only when the window is at least 30rem (480 px) tall, through a CSS-only custom variant. A shorter md+ window uses the same layout with a fixed 420 px workspace, and the page scrolls. | The map's height has to come from the space that is actually left. The active-tasting strip, which can appear on a poll, must take its share. A tiny window still gets a usable map. |
| M2 | AppShell and AppSidebar are untouched. The lock is page-local, the window never scrolls, and the content column stays the scroll port for every other page. | Shell rules (iPad Safari, the 2026-09-27 page-wrapper rule). This is also phone spec D1's approach. |
| M3 **(owner)** | "Knowledge Explorer" becomes the page's `h1` inside the top bar at md+, through a new opt-in `AppHeader` `heading` prop. The subtitle stays in the DOM as screen-reader-only text. | It saves 124 px of height. The owner-approved words stay visible; only the subtitle leaves the screen. Fallback (alternative A): a one-line in-page heading row with the subtitle inline costs 48 px. |
| M4 | Page padding goes from `md:p-8` to `md:p-4`, and `md:gap-6` goes. | That is 32 px of height and 32 px of width. |
| M5 **(owner)** | At md+ the map loses its Card chrome, exactly as on phones. TileWineMap keeps its 1 px rounded border. The tree and Details stay as cards. | It removes 32 px of doubled padding and 32 px of width. The map reads as the workspace and the panels as panels. |
| M6 | The three toolbar rows stay above the map (spec 2026-09-23 §7.1), but none of them can change height because of text or state. The filter row becomes `h-8` nowrap, the grape combobox shrinks instead of wrapping, the word "Filter" becomes sr-only next to the phone's ListFilter glyph, and the status line is clamped to 2 lines. Chips `mb-3` becomes `mb-2`. | A flex-sized canvas resizes, and fires `moveend` plus a shard sync, whenever a row above it changes height. |
| M7 **(owner)** | At xl there are three full-height columns and nothing is sticky: tree 240 px (280 from 2xl), map flex-1, Details 288 px (320 from 2xl). The tree's list and the Details body each scroll inside their own card. The Details body goes back to the top on every new place. | Nothing grows the page. At 1366 the map gains about 150 px of width. |
| M8 | A collapsed xl panel stays mounted (`xl:hidden`) and leaves a full-height 36 px strip. The Details strip shows the selected place's name set vertically. Focus moves between each collapse button and its strip. | Tree search, expansion and scroll survive a collapse, the current selection stays visible, and focus never falls to `body`. |
| M9 **(owner)** | md–xl (60 px rail) gets one 288 px side column with an Explore \| Details switch. Both cards share one grid cell; the inactive one is `invisible`. The column collapses to a 36 px strip. Retired: the fixed full-width Details bar and its `sheetOpen` state, the tree stacked below the map, and the `h-20` spacer. | A tree below the map and a bar over the rail cannot live on a locked screen. This mirrors the phone sheet's two tabs. |
| M10 | A selection never opens, closes or resizes a panel. At md–xl a selection only switches the tab inside a cell whose size is fixed. | `resize()` does not stop an in-flight `easeTo`, and a cache-hit selection builds its camera target in the same commit as the click. |
| M11 | No change to the camera, the map engine, the basemap or `mapStyle`. | The panels are in flow, so every fit still frames the whole canvas and the `camera-fit.test.ts` pins stay as they are. These paths were measured fine. |
| M12 **(owner)** | The legend opens by default only at `(width >= 64rem) and (height >= 56rem)`. At md+ its open height is capped at 40% of the canvas instead of 45vh. | At the owner's 865 px window it would otherwise cover about a third of the map by default. This changes the rule "open from lg". |
| M13 | Full view stays. It is the same element and the same inner chain; only the root swaps to `fixed inset-0 z-50`. The entry button stays lg+ (phone spec D5). The exit button shows whenever Full view is on. The window Escape listener ignores events already handled (`defaultPrevented`), and the tree search box's Escape clears the search first. | The code converges on one chain, a resize below lg can no longer strand the user, and Escape in the tree search no longer also exits Full view. |
| M14 | DOM order equals visual order at every md+ width. The side-column slots come before the map. The Details card has a slot before the map below xl and a slot after it at xl (`useIsWide`). The panels are labelled regions, and the page gets a `<main>` landmark. | Accessibility. The map's React parent chain and slot positions do not change. |
| M15 | Phones are unchanged. Every existing `max-md:` utility is kept verbatim. A new md+ element is `null` in place when `isPhone` and carries a hiding class for the SSR paint. The map's React parent chain is identical at every width. | The owner likes the phone layout (spec 2026-09-25 and its four slot rules). |
| M16 | Nothing new is persisted or put in the URL. Panel collapse is not remembered. `?place=` keeps working. | D6 precedent. The owner may ask for remembered panels later (see §13). |

## 4. Class chain (md and up)

### 4.1 Two custom variants in `src/app/globals.css`

Add these next to the existing `@custom-variant dark`:

```css
/* The desktop wine-map lock (spec 2026-09-27-desktop-map-layout-design).
   No JS twin: nothing in JS depends on it. */
@custom-variant map-lock {
  @media (width >= 48rem) and (height >= 30rem) { @slot; }
}
@custom-variant map-scroll {
  @media (width >= 48rem) and (height < 30rem) { @slot; }
}
```

The two ranges never overlap, and no property is set by both a `map-lock:` and a `map-scroll:` utility on the same element. So nothing depends on the order in which Tailwind emits custom variants. `map-lock:` never applies below md, so phones never see it.

### 4.2 The chain, from the top

- **AppShell column** (unchanged): `flex h-full min-w-0 flex-1 flex-col overflow-y-auto`, inside `flex h-dvh overflow-hidden`.
  - **Page root** (`page.tsx`): `flex flex-1 flex-col max-md:min-h-0 max-md:overflow-hidden map-lock:min-h-0 map-lock:overflow-hidden`
    - **AppHeader**: sticky, solid, 57 px. It now holds the md+ `h1`.
    - **ActiveTastingBanner**, when present: takes its share of the height.
    - **`<main data-map-page>`**: `flex w-full flex-1 flex-col max-md:min-h-0 max-md:overflow-hidden md:p-4 map-lock:min-h-0 map-lock:overflow-hidden`
      - `<p className="sr-only max-md:hidden">` holding the subtitle, verbatim.
      - **Explorer root**:
        - not expanded: `flex flex-col gap-4 max-md:relative max-md:min-h-0 max-md:flex-1 max-md:gap-0 max-md:overflow-hidden map-lock:min-h-0 map-lock:flex-1`
        - expanded (unchanged): `fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background p-4`
        - **Row** (one string for both modes): `flex flex-col gap-4 max-md:min-h-0 max-md:flex-1 max-md:gap-0 md:grid md:gap-x-4 md:gap-y-2 md:grid-rows-[auto_minmax(0,1fr)] xl:flex xl:flex-row xl:items-stretch map-lock:min-h-0 map-lock:flex-1 map-scroll:h-[26.25rem]`, plus `sideOpen ? "md:grid-cols-[18rem_minmax(0,1fr)]" : "md:grid-cols-[2.25rem_minmax(0,1fr)] md:pointer-coarse:grid-cols-[2.75rem_minmax(0,1fr)]"`.
          - Slot 1: side tab strip (md–xl)
          - Slot 2: tree card
          - Slot 3: tree strip (xl)
          - Slot 4: Details card, pre-map (md–xl)
          - Slot 5: **map card**, then CardContent, the toolbar rows, the map wrapper, and TileWineMap `h-full`
          - Slot 6: Details card, post-map (xl)
          - Slot 7: Details strip (xl)
        - Phones only (unchanged): MapBottomSheet, MapOptionsSheet
        - ArchetypeModal (portaled, unchanged)

The deleted `expanded ? "xl:min-h-0 xl:flex-1"` branch is now always on through `map-lock:`. The `h-20` spacer slot is deleted. It is not an ancestor of the map, so the map's parent chain is unchanged. The slot positions are fixed at compile time; each slot is either its element or `null`.

### 4.3 The map column (slot 5)

- **Map Card** (one string for both modes; the expanded branch `shrink-0 … xl:flex-1 xl:shrink` is deleted). Existing classes are kept and these are added:
  - `md:col-start-2 md:row-start-1 md:row-span-2 md:min-h-0 md:gap-0 md:overflow-visible md:rounded-none md:bg-transparent md:py-0 md:ring-0`
  - `md:overflow-visible` stops the combobox focus ring and the radios' outline from being clipped at the column edge. The grid item already has `min-w-0` and `md:min-h-0`.
- **CardContent**: the existing string plus `md:flex md:min-h-0 md:flex-1 md:flex-col md:px-0 md:pt-0`. The expanded branch is deleted.
- **Filter row**: the existing string plus `md:h-8 md:shrink-0 md:flex-nowrap`.
- **Controls block** (One|All with its status, then the chips): `mb-3` becomes `mb-2`. It stays `flex shrink-0 flex-col gap-2 max-md:hidden` and stays `null` on phones.
- **Map wrapper** (both modes):
  - becomes `max-md:h-auto max-md:min-h-0 max-md:flex-1 md:min-h-0 md:flex-1`
  - The dead base `h-[70vh] min-h-[420px]` is removed. Every `max-md:` utility stays verbatim, so the phone's computed style is identical.
  - The expanded `h-[calc(100dvh-12rem)] …` branch is deleted.
- **Dynamic loading placeholder** (explorer ~l.107):
  - becomes `animate-pulse rounded-lg border bg-muted max-md:h-full max-md:min-h-0 md:h-full md:min-h-0`
  - Same rule: the base `h-[70vh] min-h-[420px]` goes and every `max-md:` stays.
- **TileWineMap root**: unchanged, `relative h-full overflow-hidden rounded-lg border …`.

Vertical constants in the map column (fine pointer):

| Element | Height |
|---|---|
| filter row | 32 |
| `mb-2` | 8 |
| One\|All plus status (`min-h-8`) | 32, or 68 when the status wraps under the radios |
| `gap-2` | 8 |
| chips (`md:h-8`) | 32 |
| `mb-2` | 8 |
| **Total above the map** | **120** (156 when the status wraps) |

The status wraps only when the map column is narrower than about 426 px (±25), so its height depends on width alone.

## 5. Layout per breakpoint

### 5.1 Phones (below md, `(width < 48rem)`): unchanged

These stay exactly as they are today:

- the toolbar row
- the map filling the rest
- MapBottomSheet (Explore | Details; closed, half and full snaps)
- MapOptionsSheet
- the legend at `max-md:bottom-16` and the attribution at `bottom-[54px]!`
- R1 half-sheet camera padding
- the "Wine map" title in the top bar
- the absence of an `h1` on phones

Visual or DOM differences on phones:

- The ListFilter glyph is now rendered unconditionally, so the phone's server paint shows it one paint earlier; the final state is identical.
- The sr-only subtitle carries `max-md:hidden`, so phones expose exactly what they do today.
- The tree search's Escape is unchanged on phones. Only the md+ card passes `clearSearchOnEscape` to `WineMapTree`, so the phone sheet's tree has no Escape handler, as at a23cd16: the sheet's own handler closes the sheet, and its `preventDefault()` also cancels the browser's native clear of the `type=search` field (Chrome and Safari clear it only in the keydown's default action), so the query survives and reopening Explore shows the filtered list. (Review round: the first build gave every tree the handler, which wiped the query on a phone with a hardware keyboard.)
- The grape dialog's state moved from KnowledgeSections to the explorer (§14). It is portaled either way, and the sheet's Escape already ignores events from outside its own element, so a phone sees no difference.

### 5.2 xl (1280 px and up, 240 px sidebar): three columns

**Left, the tree card (slot 2).** It is always rendered at md+ as `isPhone ? null : <Card>`; it is no longer swapped for the strip.

- Card classes:
  - `order-3 max-md:hidden md:col-start-1 md:row-start-2 md:min-h-0 xl:order-1 xl:w-60 xl:shrink-0 2xl:w-[280px]`
  - plus `!treeOpen && "xl:hidden"`, `side.tab !== "explore" && "max-xl:invisible"` and `!side.open && "max-xl:hidden"`
  - Drop `xl:sticky xl:top-6 xl:self-start`.
- Also on the Card: `role="region" aria-label="Explorer"` and an `id`.
- CardContent: `flex min-h-0 flex-1 flex-col` (replaces `pt-4 h-[70vh] min-h-[420px]` and its expanded variant).
- Header row "Explorer" plus the collapse button: `mb-2 flex items-center justify-between max-xl:hidden`.
- The collapse button becomes a real target: `inline-flex size-11 items-center justify-center rounded-md md:pointer-fine:size-8`, plus the map's focus ring (below).
- Body: `min-h-0 flex-1`, then `renderTree(selectFromDesktopTree, { active: isWide ? treeOpen : side.open, clearSearchOnEscape: true })`.
- The tree's own `<ul>` is the scroller. The search box and level buttons stay pinned.

**Tree strip (slot 3).**

- `isPhone || treeOpen ? null : <button aria-label="Show hierarchy" className="order-3 hidden rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground xl:order-1 xl:flex xl:w-9 xl:items-start xl:justify-center xl:pointer-coarse:w-11" + MAP_FOCUS_RING>`
- There is no sticky. With `xl:items-stretch` it becomes a full-height 36 px strip (44 px on a coarse pointer, an iPad Pro at 1366).

**The focus ring.** Every md+ panel control (the Explore | Details switch, Hide panel, Show panel, both Collapse buttons and both xl strips) carries `MAP_FOCUS_RING` (`src/app/knowledge/map/focus-ring.ts`): `outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`, the string the phone sheet (which now imports it) and the Map detail radios use. Without it a control falls back to the UA outline, which the base layer's `outline-ring/50` turns into a ring of about 1.4:1 on the light background. Each of these controls has at least 16 px of room before a clipping box, so the 2 px outline at a 2 px offset is never cut.

**Centre, the map column (slot 5).** Flex-1, as in §4.3.

**Right, the Details card (slot 6, rendered when `!isPhone && isWide`).**

- Card classes:
  - `max-md:hidden md:col-start-1 md:row-start-2 md:min-h-0 xl:order-3 xl:w-72 xl:shrink-0 2xl:w-80`
  - plus `!detailsOpen && "xl:hidden"`, `side.tab !== "details" && "max-xl:invisible"` and `!side.open && "max-xl:hidden"`
- Also `role="region" aria-label="Details"` and an `id`.
- CardContent: `flex min-h-0 flex-1 flex-col gap-3`.
- The header row "Details" plus its collapse button stays as it is (`hidden items-center justify-between xl:flex`) and stays pinned. The collapse button is enlarged the same way as the tree's.
- Body: `<div ref={detailsScrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">{detailsBody}</div>`
  - reset with `const detailsShown = isWide ? detailsOpen : side.open;` and a layout effect on `[selectedKey, detailsShown]` that, when `detailsTopDue(detailsShown, selectedKey, detailsTopForRef.current)` (`src/lib/wine-map/details-scroll.ts`), records the key in `detailsTopForRef` and calls `scrollTo({ top: 0 })`.
  - Why not `[selectedKey]` alone (the first build): a collapsed card is `display:none`, so it has no layout box and `scrollTo` does nothing; when the box comes back, Chrome and Safari restore the offset it had. A place picked on the map while the card was collapsed then opened at the previous place's scroll. The reset now waits until the card is shown and runs once per place, so a plain collapse and reopen of the same place keeps its scroll. It is a layout effect so the reopened card never paints a frame at the restored offset. A remounted card (the xl slot move) already starts at 0.
  - The grape dialog's open grape lives in the explorer (`openGrape`, rendered as `<GrapeModal>` beside ArchetypeModal at the explorer root; KnowledgeSections takes `onOpenGrape`), so the slot move at xl never closes an open dialog.
- Deleted:
  - every `max-xl:fixed … inset-x-0 bottom-0 z-40 … shadow-[…]` class
  - the `sheetOpen` classes
  - the `xl:hidden` bar button (the "Details" eyebrow, the place name or "Click on areas to learn more", and ChevronUp)
  - `expanded ? "xl:overflow-y-auto"`

**Details strip (slot 7).**

- `` isPhone || detailsOpen ? null : <button aria-label={selectedKey ? `Show details, ${sheetTitle}` : "Show details"} className="order-2 hidden rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground xl:order-3 xl:flex xl:w-9 xl:flex-col xl:items-center xl:gap-2 xl:pointer-coarse:w-11" + MAP_FOCUS_RING> ``
- Inside: PanelRightOpen, then, while a place is selected, `<span aria-hidden className="min-h-0 flex-1 truncate text-xs [writing-mode:vertical-rl]">{sheetTitle}</span>`.
- The place name is the strip's only visible text, so it is part of the accessible name (WCAG 2.5.3 Label in Name): a speech-input user who says "click Pauillac" finds the strip, and a screen reader hears which place is selected. The span stays `aria-hidden`, since the name already carries it.

**Focus hand-offs.** Collapse moves focus to the strip, and the strip moves it back to the collapse button. Use refs plus a pending-focus ref consumed after commit, so the initial mount never steals focus.

### 5.3 md–xl (768–1279 px, 60 px rail): a side column beside the map

The row is a grid:

- side column: 18rem, or 2.25rem when collapsed (2.75rem on a coarse pointer: `md:pointer-coarse:grid-cols-[2.75rem_minmax(0,1fr)]` beside the 2.25rem class in the collapsed branch)
- map column: `minmax(0,1fr)`
- rows: `auto` (the tab strip) and `minmax(0,1fr)`
- `gap-x-4`, `gap-y-2`
- The map card spans both rows.

**Slot 1, the tab strip.**

- Classes: `isPhone ? null : <div className={cn("max-md:hidden md:col-start-1 md:row-start-1 md:flex md:items-center md:gap-1 xl:hidden", !side.open && "md:row-span-2 md:items-stretch")}>`
- **When open:**
  - A segmented pair of `aria-pressed` buttons, **Explore** and **Details** (the phone sheet's words).
  - Each button has `aria-controls` pointing at the tree card's or the Details card's id.
  - They are styled like MapDetailControls' radios: `min-h-11 rounded px-2 py-1 transition-colors md:pointer-fine:min-h-0` plus `MAP_FOCUS_RING` (§5.2).
  - The pressed state is `bg-primary font-semibold text-primary-foreground ring-2 ring-inset ring-foreground`, so dark mode is marked by shape, not just bordeaux (1.3:1).
  - In Windows forced colours (high contrast) the fill is replaced and the ring, a box-shadow, is dropped, which left only semibold against medium at 12 px. The pressed branch therefore also carries `forced-colors:underline forced-colors:decoration-2 forced-colors:underline-offset-4`: an underline in the forced text colour, chosen over an inset outline so it can never be read as the focus ring. MapDetailControls' radios and the phone sheet's tabs have the same weakness (pre-existing); they are a follow-up.
  - Next to the pair, an `ml-auto` icon button, PanelLeftClose, `aria-label="Hide panel"`, `inline-flex size-11 items-center justify-center rounded-md md:pointer-fine:size-8` plus `MAP_FOCUS_RING`.
- **When collapsed:**
  - One full-height strip button, `` aria-label={selectedKey ? `Show panel, ${sheetTitle}` : "Show panel"} ``, `flex h-full w-9 flex-col items-center gap-2 rounded-lg border border-border py-2 text-muted-foreground hover:text-foreground pointer-coarse:w-11` plus `MAP_FOCUS_RING`.
  - It is 44 px wide on a coarse pointer (iPads at 768–1279), with its grid column, so it is a real target like every other new control; a fine pointer keeps 36 px.
  - It holds PanelLeftOpen and, while a place is selected, the vertical `sheetTitle` as in slot 7, which the accessible name carries too (WCAG 2.5.3, as slot 7).

**Row 2, column 1: the tree card (slot 2) and the Details card (slot 4, `!isPhone && !isWide`) in the same cell.**

- The inactive card is `max-xl:invisible`. It keeps its box and its scroll position, but it is not painted, not hit-testable and not in the tab order.
- Switching tabs never changes the canvas size.

**The side-panel state.** `src/lib/wine-map/side-panel.ts` is pure and has its own vitest file.

- State: `{ tab: "explore" | "details", open: boolean }`
- Initial: `tab = initialPlaceKey ? "details" : "explore"`, `open = true`
- Events:
  - `tab` sets that tab.
  - `select` (a map tap, a tree pick, a deep link, a Nearby or Labelling chip) sets `details` and never changes `open`.
  - `toggle` flips `open`.

A map tap with the column collapsed does not reopen it (M10). The tab still becomes Details, so the column opens on Details and the strip shows the place's name.

**Focus.**

- A tree pick at md–xl hides the tree, so focus moves to the **Details** switch button instead of falling to `body`.
- Hide panel moves focus to Show panel, and Show panel moves it back to Hide panel.

**Wiring.**

- `onSelect` for TileWineMap is `isPhone ? selectFromMap : selectDesktop`, where `selectDesktop = (k, s) => { select(k, s); dispatchSide({ type: "select" }); }`.
- The md+ tree gets `selectFromDesktopTree` (`selectDesktop` plus the md–xl focus move).
- The render-time deep-link branch also dispatches `select`.
- The camera path is untouched: `select` still builds the camera target exactly as today.

**`useIsWide`** (new, `src/lib/use-is-wide.ts`).

- `WIDE_QUERY = "(width >= 80rem)"`, exactly what `xl:` compiles to.
- A `useSyncExternalStore` hook whose **server snapshot is `true`**.
- It is used only to choose the Details slot (4 or 6) and the tree's `active` flag. Layout is decided by CSS alone, so the first paint is correct at every width.
- At md–xl, hydration moves the Details card from slot 6 to slot 4. That remounts only the details subtree, before any interaction; the grid placement is the same, and MapLibre has not mounted yet.

### 5.4 Full view (`expanded`)

- The explorer root swaps to `fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background p-4` on the **same element**. Every inner class is identical to the locked page, so it only hides the sidebar and the top bar.
- The tree and Details stay visible and collapsible (owner, round 2, 2026-07-22).
- The render-time reset below md stays (`isPhone && expanded`).
- The Escape listener stays on `window`, bubble phase, now `if (event.key !== "Escape" || event.defaultPrevented) return;`. Base UI popovers and dialogs keep their own Escape: their document listener stops propagation.
- The entry button stays lg+. The exit button shows whenever expanded.
- No ancestor of the fixed root gains a `transform`, `filter`, `backdrop-filter`, `contain` or `will-change`.

### 5.5 Short windows (`map-scroll`: md+ and under 480 px tall, for example a landscape iPhone)

- The same structure applies.
- The row is a fixed `h-[26.25rem]` (420 px), so every panel still has a definite height and scrolls inside.
- The page root and `<main>` are not `overflow-hidden`, so the column scrolls by the difference and the sticky header works.
- At 932x430 the page is 509 px tall (79 px of scroll). The md–xl side column starts open, so the map column is 932 − 60 (rail) − 32 (`md:p-4`) − 288 (side column) − 16 (`md:gap-x-4`) = 536 px and the canvas is about **534x298** (420 − 120 − 2). With the side column collapsed it is 932 − 60 − 32 − 36 − 16 = 788, a canvas of about **786x298** on a fine pointer; a phone's coarse pointer widens the strip column to 44 px (§5.3), so about 778x298 there.
- At 844x390 (a common iPhone landscape) the page is also 509 px tall (119 px of scroll). The map column is 448 px, so the canvas is about **446x298**, right at the status-wrap edge (about 426 ± 25, §4.3); if the status wraps, the canvas is 262 tall. Collapsed: about 698x298 on a fine pointer, 690x298 on the phone's coarse one.
- (Review round: the first draft said about 834x298 at 932x430, leaving the open side column out.) If the owner finds the landscape map too narrow, the lever is a `map-scroll`-only default of a collapsed side column. It must not auto-open on selection (M10) and must not be persisted (M16).

## 6. Predicted map rects

The canvas is measured inside TileWineMap's 1 px border, as `map-measure.md` measured. Assumptions:

- no active-tasting strip
- a fine pointer
- default panels open
- no Windows scrollbar (nothing overflows)
- light or dark

The arithmetic follows the class chain, ±2 px, and ±25 px on the status-wrap threshold. At md+ when locked:

- canvas top = 194 (57 + 16 + 120 + 1)
- canvas height = H − 211, or H − 247 when the status wraps
- canvas bottom = H − 17

| Viewport | Layout | Panels | **Canvas (l, t, w, h)** | Bottom | Below fold | Today |
|---|---|---|---|---|---|---|
| **1366x768** | xl, 240 sidebar | tree 256–496, Details 1062–1350 (both 679 tall) | **513, 194, 532, 557** | 751 | **0** | 585, 410, 381, 536; 178 hidden |
| **1660x850** | 2xl | tree 256–536, Details 1324–1644 (761 tall) | **553, 194, 754, 639** | 833 | **0** | 585, 338, 675, 593; 81 hidden |
| ~1675x865 (owner) | 2xl | map column 771 | 553, 194, 769, 654 | 848 | 0 | about 78 hidden |
| **1920x1000** | 2xl | map column 1016 | **553, 194, 1014, 789** | 983 | **0** | 585, 338, 935, 698; 36 hidden |
| **1024x768** | md–xl, rail | side column 76–364 (tab strip y 73–105, cards y 113–752) | **381, 194, 626, 557** | 751 | **0** | 109, 338, 851, 536; 106 hidden, 1604 px page |
| 1024x768, side collapsed | md–xl | 36 px strip | 129, 194, 878, 557 | 751 | 0 | — |

The visible map area in px², assuming the owner's window measured the same way:

| Viewport | Today | New | Change |
|---|---|---|---|
| 1366x768 | 136k | 296k | 2.2x |
| 1660x850 | 346k | 482k | 1.4x |
| ~1675x865 | 364k | 503k | 1.4x |
| 1920x1000 | 619k | 800k | 1.3x |
| 1024x768 | 366k | 349k (panel beside), 489k (collapsed) | 0.95x, 1.3x |

At 1024 the default map is narrower than today's but entirely visible, with the panel beside it.

At 1366, collapsing panels:

| Collapsed | Canvas width |
|---|---|
| Details | 784 |
| tree | 736 |
| both | 988 |

(Both collapsed: the tree strip is at 256–292 and the Details strip at 1314–1350, so the map column runs 308–1298, 990 px, a 988 px canvas. The first draft said 1036.)

On a coarse pointer (an iPad Pro at 1366, an iPad at 768–1279) a collapsed strip and its md–xl grid column are 44 px, not 36, so every collapsed-panel width in this section is 8 px narrower per collapsed strip (for example 1024x768 side collapsed: 137, 194, 870, 557; 1366 both collapsed: 972). The default layouts above collapse nothing, so they do not change.

Extra checks, all with 0 px below the fold:

| Case | Canvas | Note |
|---|---|---|
| 1280x620 (Windows 150% on a 1080p laptop, xl) | 513, 194, 446, 409 | map column 448, status not wrapped (tight); if it wraps the height is 373 |
| 1366x657 (a real 1366x768 laptop in Chrome) | 513, 194, 532, 446 | |
| 768x1024 (iPad mini portrait) | 381, 230, 370, 777 | status wraps |
| 1180x820 (iPad Air landscape, md–xl) | 381, 194, 782, 609 | |
| Full view at 1660x850 | 313, 137, 994, 696 | sidebar and top bar hidden |
| With the active-tasting strip (S = 53–95 px) | top 194 + S, height H − 211 − S | still 0 px below the fold |

The legend, when open, is capped at 40% of the canvas: at most 223 px at 1366x768 and 316 at 1920x1000.

## 7. What happens to every control and panel (md and up)

| Piece | Today | New |
|---|---|---|
| Top bar | 57 px: search, scan, bell | 57 px. The `h1` "Knowledge Explorer" sits left of the search box: `hidden font-heading text-xl font-semibold leading-none whitespace-nowrap md:block`. |
| Active-tasting strip | pushes the page down | takes its share of the locked height, so the map gets shorter |
| `h1` "Knowledge Explorer" | text-3xl in the page, 36 px | moves into the top bar (M3); 0 px |
| Subtitle | visible, 24 px | `sr-only` in `<main>` (M3, owner) |
| Page padding | `md:p-8`, `md:gap-6` | `md:p-4` |
| Map Card chrome | ring, rounded, `py-4` + `pt-4` | stripped at md+ (M5); TileWineMap keeps its border |
| "Filter" label | visible text | `md:sr-only`; the ListFilter glyph (the phone's) shows at every width |
| Grape combobox | `w-64`; the row wraps | `w-64` that shrinks (`md:min-w-0`); its label already truncates; the row never wraps |
| "N places" badge | can wrap the row | `shrink-0`; the combobox gives up the width |
| Local \| English | `ml-auto` | unchanged, plus `md:shrink-0` |
| One country \| All countries, status, Retry | second row, `min-h-8` | unchanged component and position. The status `<p>` gains `md:line-clamp-2` (the phone's Map options sheet is unaffected). There is still exactly one `role="status"` region, and the All radio keeps its `aria-describedby`. |
| Country chips | third row, `h-8`, `mb-3` | unchanged (roving tabindex, `scrollTo`, skeleton), `mb-2`; still below the status, so "tap one below" stays true |
| Map | fixed `70vh`, cut off | flex-1 of what is left; never below the fold; a wheel over it zooms with nothing to scroll |
| NavigationControl | top-left | unchanged |
| Full view button | top-right, lg+ | entry lg+ as today; `expanded ? "block" : "hidden lg:block"`; about 44 px on `pointer-coarse:` |
| Legend | open from 1024 wide, up to 45vh | open by default only at `(width >= 64rem) and (height >= 56rem)`, decided once at mount; at md+ `md:flex md:max-h-[40%] md:flex-col` on the box and `md:max-h-none md:min-h-0` on its scroller; phones keep `max-h-[45vh]` and `max-md:bottom-16` (M12, owner) |
| Attribution | bottom-right | unchanged |
| `?debugPerf=1` probe | left-2 top-[112px] | unchanged |
| xl Explorer tree | sticky, 70vh, unmounted on collapse | full height, 240/280, own `<ul>` scroller, mounted while collapsed, full-height strip when collapsed |
| xl Details | no scroller, stretches the page | full height, 288/320, pinned header, body scrolls and resets per place, mounted while collapsed, strip shows the place name |
| md–xl tree | stacked below the map, 70vh | Explore tab of the side column |
| md–xl Details | fixed full-width bar over the rail | Details tab of the side column; bar retired |
| `h-20` spacer | md–xl | deleted |
| ArchetypeModal / GrapeModal | portaled | still portaled; GrapeModal's open grape moves from KnowledgeSections to the explorer root, beside ArchetypeModal's, so the xl slot move (§14) never closes it |
| Panel controls' focus ring | none (UA outline at 50% ring alpha) | `MAP_FOCUS_RING` on every md+ panel control (§5.2) |
| Global search results, bell dropdown | in the header | unchanged; they must still open unclipped over the locked page (checklist) |

## 8. Copy changes (verbatim)

Any new or changed wording is **provisional until the owner approves it**.

- **Moved, same words:** "Knowledge Explorer". It moves from the page body to the top bar's `h1` at md+.
- **Now screen-reader only at md+, same words:** "Explore the world of wine through places, grapes, styles and the rules that shape them."
- **Now screen-reader only at md+, same word:** "Filter".
- **New visible labels at md–xl, reusing the phone sheet's tab words:** "Explore", "Details".
- **New accessible names (provisional):** "Hide panel", "Show panel". While a place is selected the collapsed strips' names carry it, since the vertical place name is their only visible text (WCAG 2.5.3): "Show panel, {place}" and "Show details, {place}" ({place} is `sheetTitle`, the same text the strip shows). With nothing selected they are "Show panel" and "Show details".
- **Retired with the md–xl bar:** its "Details" eyebrow and the line "Click on areas to learn more".
- **Unchanged:** every `detail-status.ts` sentence, "Show hierarchy", "Collapse hierarchy", "Show details", "Collapse details", "Full view", "Exit full view", "Legend", "Grape — only places using it", "Pick a region on the map or in the hierarchy to explore it.", "Explorer", "Details".

## 9. Files to change

1. **`src/app/globals.css`**: add the `map-lock` and `map-scroll` custom variants (§4.1).
2. **`src/app/knowledge/map/page.tsx`**:
   - page root classes
   - `<AppHeader title="Wine map" heading="Knowledge Explorer" />`
   - the `data-map-page` `<div>` becomes `<main>` with `md:p-4` and the `map-lock:` classes
   - delete the `hidden md:block` heading block and add the `sr-only max-md:hidden` subtitle `<p>`
   - rewrite the phone comment ("From md it is laid out exactly as before" is no longer true)
3. **`src/components/app-header.tsx`**:
   - optional `heading?: string`, rendered as the md+ `h1` right after the phone `title` span, before the search box. The header height stays 57 px.
   - Update the doc comment ("the sidebar carries it on desktop" now has one exception).
   - Only the map page passes it; the training page is unaffected.
4. **`src/lib/use-is-phone.ts`**:
   - extract `mediaStore(query, matchMedia, fallback)`
   - `phoneStore` stays with the same signature and behaviour, and `PHONE_QUERY` is unchanged
5. **`src/lib/use-is-wide.ts`** (new): `WIDE_QUERY = "(width >= 80rem)"` and `useIsWide()` (server snapshot `true`).
6. **`src/lib/wine-map/side-panel.ts`** (new): the pure reducer from §5.3.
7. **`src/lib/wine-map/legend-default.ts`** (new): `LEGEND_OPEN_QUERY = "(width >= 64rem) and (height >= 56rem)"` and `legendStartsOpen(matchMedia)`.
8. **`src/app/knowledge/map/tile-wine-map-explorer.tsx`**:
   - The placeholder, root, row, map Card, CardContent, filter row, controls block and map wrapper, as in §4.3.
   - The seven fixed row slots (§5.2–5.3).
   - State: delete `sheetOpen`; add `side` (useReducer) and `isWide`; keep `treeOpen`, `detailsOpen` and `expanded`.
   - Add `selectDesktop` and `selectFromDesktopTree`, the deep-link dispatch, focus hand-off refs, the Details scroll ref and reset, and the Escape `defaultPrevented` guard.
   - Delete the frozen-bar markup and the `ChevronUp` import.
   - `renderTree` and `detailsBody` are still each rendered in exactly one place.
9. **`src/app/knowledge/map/tile-wine-map.tsx`** (class strings and the legend initialiser only; no handlers):
   - Full view button visibility and its coarse-pointer size
   - the legend box and scroller classes
   - `useState(() => legendStartsOpen(…))`
   - `initialViewState`, the camera paths, `mapStyle` and `swapBasemap` are untouched
10. **`src/app/knowledge/map/map-detail-controls.tsx`**: `md:line-clamp-2` on the `role="status"` `<p>`.
11. **`src/app/knowledge/map/wine-map-tree.tsx`**:
    - A `clearSearchOnEscape` prop (default false). Only when it is true (the md+ card's `renderTree` call), the search input's `onKeyDown`: on Escape with a non-empty query, `preventDefault()` and `setQuery("")`. Phones keep no handler (§5.1).
    - The selected-row reveal returns early when `row.getClientRects().length === 0`, and scrolls only the tree's own `<ul>` (a list ref), never an ancestor.
12. **`CLAUDE.md`**:
    - New "Wine map on the desktop" bullet covering:
      - the md+ flex chain and the `map-lock`/`map-scroll` variants
      - xl's three columns with internal scrollers
      - the md–xl side column and its reducer
      - the Details slot move at xl
      - Full view = the same chain with a fixed root
      - the top-bar heading
      - the legend rule
      - "no row above the map may change height"
    - Amend the phone bullet's "Tablets (md–xl) and desktop are unchanged."
    - Amend the AppHeader/title notes (the `heading` prop).
    - Amend the performance bullet's measured sizes after re-measuring.
13. **`docs/superpowers/specs/2026-09-27-desktop-map-layout-design.md`**: this document, with the owner's rulings recorded.
14. Review round (2026-09-27):
    - **`src/app/knowledge/map/focus-ring.ts`** (new): `MAP_FOCUS_RING`, imported by the explorer and `map-bottom-sheet.tsx` (whose local copy it replaces, same string).
    - **`src/lib/wine-map/details-scroll.ts`** (new): the pure `detailsTopDue(shown, selectedKey, resetFor)` behind the Details reset (§5.2).
    - **`src/app/knowledge/map/knowledge-sections.tsx`**: `GrapeModal` exported; its open grape moves to the explorer (`onOpenGrape`).

## 10. Tests

vitest runs in node only; there are no DOM, visual or e2e tests.

**New:**

- **`src/lib/use-is-wide.test.ts`**:
  - `WIDE_QUERY` is exactly `"(width >= 80rem)"`
  - the store follows a fake `matchMedia` and its `change` events
  - without `matchMedia` it reads as wide
- **`src/lib/wine-map/side-panel.test.ts`**:
  - the initial state with and without `initialPlaceKey`
  - `select` sets Details and never opens a collapsed column
  - `tab` sets that tab
  - `toggle` flips `open` and keeps the tab
- **`src/lib/wine-map/legend-default.test.ts`**:
  - the query string is pinned
  - closed without `matchMedia`, closed below either bound, open at both
- **`src/app/knowledge/map/desktop-layout.test.ts`**, a source scan in the style of `map-chrome.test.ts` and the engine test:
  - `globals.css` defines `map-lock` and `map-scroll` with the exact media strings
  - `page.tsx` and the explorer contain no `h-[70vh]`, `min-h-[420px]`, `calc(100dvh`, `xl:sticky` or `md:p-8`
  - `page.tsx` renders `<main data-map-page`
  - **phone pin**, over `page.tsx`, the explorer, `tile-wine-map.tsx`, `map-bottom-sheet.tsx`, `map-options-sheet.tsx`, `wine-map-tree.tsx` and `map-detail-controls.tsx` (drawn on phones inside Map options). Any future phone change then has to update it on purpose.
    - Per file, in source order, every class string that carries a `max-md:` utility, reduced to its `max-md:` utilities in order, equals a frozen list. Against a23cd16 every string then present keeps its `max-md:` utilities verbatim; only `max-md:hidden` strings of new and retired md+ elements differ. So a dropped utility, a utility moved to another element, or an md+ element losing its `max-md:hidden` fails, while `md:`/`map-lock:` utilities appended beside them do not.
    - The exact class strings of the phone's height chain (page root, `<main>`, explorer root, row, map Card, CardContent, filter row, map wrapper, loading placeholder), the two phone-only sheets' outer strings and the Map detail radios' mobile-first string (`min-h-11 … md:min-h-0`), which a `max-md:` scan cannot see.
    - (Review round: the first pin compared one de-duplicated set of tokens across all six files, so it missed a deleted or moved occurrence of any token that also appeared elsewhere, such as the map wrapper's `max-md:min-h-0 max-md:flex-1`.)
  - review round: the md+-only tree Escape (`clearSearchOnEscape`), the Details reset wiring, the lifted grape dialog, `MAP_FOCUS_RING` on the six panel controls, the 44 px coarse-pointer strips, the strips' accessible names and the switch's forced-colours underline.
- **`src/lib/wine-map/details-scroll.test.ts`**: `detailsTopDue` waits while the card is collapsed, resets on reopening for a place picked while collapsed, keeps the scroll for a plain collapse and reopen of the same place, and has nothing to do before any selection.

**Unchanged, and they must stay green:**

- `use-is-phone.test.ts`
- `sheet-state.test.ts`
- `camera-fit.test.ts` (including `selectionFit(undefined, h)` = `{ padding: 48, offset: [0, 0] }` and the 120 px floor)
- `detail-status.test.ts`
- `map-chrome.test.ts` (no change to `map-chrome.css`)
- `tile-wine-map-engine.test.ts` (no `onMouseMove=`/`onMouseEnter=`/`onMouseLeave=` in `tile-wine-map.tsx`; `new ShardController(`, `.onStyleRebuilt()` and `installHoverCursor(` kept)
- `country-chips.test.ts`, `deep-link.test.ts`, `scroll-container.test.ts`, `map-error-boundary.test.ts`

Also run `tsc --noEmit`, lint and `next build`.

## 11. Browser checklist (production build, before and after deploy)

**Sizes:**

- the four targets: **1366x768, 1660x850, 1920x1000, 1024x768**
- the owner's ~1675x865
- 1366x657, 1280x620, 1180x820, 768x1024, 932x430
- phone parity at 375x812 and 375x667

**On each size:**

1. **Fit.** The content column satisfies `scrollHeight === clientHeight`, except `map-scroll` at 932x430. The `.maplibregl-canvas` rect is within ±2 px of §6 (§5.5 for 932x430), and nothing is below the fold. There is no Windows scrollbar.
2. **Active-tasting strip.** Repeat with an injected 80 px strip: the canvas is 80 px shorter and still fully visible.
3. **Light and dark.**
   - The toolbar now sits on `bg-background`; the combobox, radios and chips stay legible.
   - The switch's pressed state carries the ring in dark mode.
   - Flipping the theme swaps the basemap with no remount.
4. **Full view.**
   - Enter at lg+ and exit by the button and by Escape.
   - Escape inside the open grape combobox closes only the popup.
   - Escape in the tree search with text clears only the search; with it empty, it exits.
   - Escape inside ArchetypeModal or GrapeModal closes only the modal.
   - Resize below lg while expanded: the exit button is still shown.
   - Phones (375 wide, a hardware keyboard or desktop emulation): type in Explore's search, press Escape. The sheet closes and, on reopening Explore, the query and its filtered list are still there, as at a23cd16.
5. **Long details.** Select France, then a Burgundy grand cru.
   - The Details body scrolls inside its card and the page never moves.
   - A Nearby chip swaps the place and resets the scroll to the top.
   - xl: select France, scroll Details down about 600 px, Collapse details, tap a Burgundy grand cru on the map, Show details: the grand cru opens at its heading. The same at md–xl with Hide panel and Show panel. Collapsing and reopening without a new selection keeps the scroll.
   - Open a grape's dialog, then zoom the browser across 1280 CSS px (Ctrl+ at 1366, or Ctrl− back): the dialog stays open.
6. **Tree scroll.**
   - A map tap on a deep climat reveals its row inside the tree's list, and the page never scrolls.
   - Collapse the tree (xl) or the side column (md–xl), select on the map, reopen: the row is revealed.
7. **Keyboard.**
   - Tab order matches visual order at xl and at md–xl (both tabs).
   - The Explore/Details switch works.
   - Collapse and expand hand focus to the counterpart control.
   - A tree pick at md–xl moves focus to the Details button.
   - Chips keep their roving tabindex.
   - There is exactly one `role="status"` region.
   - Every panel control (switch, Hide/Show panel, Collapse hierarchy/details, both xl strips) shows the solid 2 px focus ring in light and dark.
   - A collapsed strip's accessible name includes the selected place ("Show panel, Pauillac").
   - Windows high contrast: the pressed Explore/Details button is underlined.
   - On an iPad (coarse pointer) the collapsed strips are 44 px wide.
8. **Deep link.** Load `?place=<key>` at xl and at 1024: Details opens (the tab at md–xl) and the camera fit is correct.
9. **No remount.**
   - Tag the MapLibre instance (`window.__wineMap`).
   - Resize across 768 and 1280, and switch tabs, collapse panels and toggle Full view.
   - The same instance survives. Crossing 1280 re-renders only the Details subtree.
10. **Legend.**
    - Closed by default at 1366x768 and the owner's size; open at 1920x1000.
    - When open it never exceeds 40% of the canvas.
    - Phones: closed, at `bottom-16`.
11. **Header menus.** Global search results and the bell dropdown open unclipped on the map page.
12. **Phones.** At 375x812 and 375x667 the toolbar, sheet snaps, Map options, legend, attribution and R1 fit match today. Rotate across md.
13. **Performance.** Run the `?debugPerf=1` protocol, One and All, DPR 1 and 2, at 1366x768, ~1675x865 and 1920x1000: 0 long tasks and worst frame ≤ 34 ms. The default canvases are below the ~1400x850 Full-view reference.

## 12. Rollout

- **App only:** no migration, no database write, no environment change, no Anthropic API.
- **Order of work:**
  1. Controller rulings recorded (see Status); the owner reviews live.
  2. Implement on `map-desktop-space` (worktree off `master`).
  3. Tests, `tsc`, lint and `next build`.
  4. The §11 checklist on a local production build.
- **Deploy:** one staged push, which is a production deploy on Vercel, followed by a live smoke test at the owner's ~1675x865 in Chrome and on an iPhone (portrait and landscape).
- **Revert:** `git revert` of the one merge. Nothing else to undo.
- Record the owner's rulings in the spec and CLAUDE.md in the same change.

## 13. Considered and not adopted

- **Floating panels over a full-bleed map.** Every camera path (fit, well-framed test, chip flights and `stayIfVisible`, the centre probe, `countriesInView`, the legend scan) would need four-sided insets. It overturns §7.1 ("nothing new on the map canvas"), and the default canvas (1680x943) exceeds the measured performance envelope.
- **One toolbar row with One|All in a popover, and the tree hidden below 2xl.** It hides the switch, the status and the tree on most laptops, the "tap one below" copy would become false, and it needs right-inset camera work.
- **Merging the filter and One|All rows on wide columns.** The merged row needs about 920 px, and the owner's map column is 771. A container query would add containment to an ancestor of the map.
- **A 34rem `min-height` floor.** Replaced by the height gate, which falls back to a known scrolling layout instead of a half-locked page.
- **Full view from md.** Phone spec D5 keeps it lg+; the lock makes it less needed.
- **Collapsing the app sidebar to the rail on this page.** It is an AppShell/AppSidebar change and app-wide; it needs a separate owner decision.
- **Remembering panel collapse state.** It goes against the D6 precedent; the owner may ask. Levers to offer if 532 px of width at 1366 feels narrow: start Details collapsed at 1280–1535, or start the md–xl side column collapsed. Neither may auto-open on selection (M10).

## 14. Residual risks

- **The canvas is now flex-sized.** Anything that changes a row's height resizes MapLibre: the ResizeObserver (50 ms throttle) fires `moveend`, a shard sync and up to 33 probe queries.
  - Guarded by: the fixed `h-8` nowrap filter row, the shrinking combobox, `md:line-clamp-2` on the status, and the chips' fixed height.
  - A future status sentence longer than 2 lines at about 224 px is clipped visually; screen readers still read all of it.
  - Never CSS-animate a panel's width or the map's size.
- **The status-wrap edge.** It is about 426 px (±25) of map column. At 1280 wide (448) the row may still wrap: the canvas is then 36 px shorter, and a window resize across the edge changes the height once.
- **Width trade-offs.**
  - The 240 px tree at 1280–1535 truncates deep climat names sooner (titles keep the full name).
  - At 1024 the default map (626 px) is narrower than today's 851 px, but all of it is visible.
  - At 768 portrait the map column is 372 px.
- **The Details slot move at xl.** It remounts the Details subtree once after hydration at md–xl and on every resize across 1280 (a browser zoom step is enough: 110% on a 1366 laptop, 150% in the owner's window), so its scroll resets there. MapLibre is unaffected. Nothing in that subtree holds state worth keeping any more: the grape dialog's open grape lives in the explorer (review round), so an open GrapeModal stays open. Its return-focus target, the grape button, is remounted with the subtree, so closing the dialog after such a move may leave focus on `body`.
- **Landscape phones (≥ 48rem wide).** They move from today's scrolling tablet layout to the new md layout in `map-scroll` mode (79 px of scroll at 932x430, 119 at 844x390, a canvas about 298 px tall and, with the side column open, about 534 or 446 px wide; §5.5). Verify on the owner's iPhone.
- **iPads at md+.** Tree rows and the toolbar stay small on a coarse pointer (pre-existing). Only the new controls get 44 px, the collapsed strips included (review round).
- **Sticky header.** It is moot under the lock. The page root's `overflow-hidden` (as on phones) must not clip the header's own dropdowns (checklist item 11).
- **Dark mode.** The toolbar moves from `bg-card` to `bg-background` at md+; contrast is checked in item 3. No new canvas overlay and no backdrop-blur. `mapStyle` stays frozen.
- **Full view.** Still no focus containment (pre-existing).
- **Owner rulings.** The heading and subtitle (M3), the card chrome (M5), the panel widths (M7), the md–xl side column (M9), the legend default (M12) and the new accessible names are owner decisions. Until the owner has reviewed them live they are controller rulings, marked provisional in CLAUDE.md as well; anything the owner rejects falls back as §3 describes, and the owner's actual rulings replace that marker in both documents.
- **No DOM safety net.** Layout regressions show up only in the browser pass and the source pin test.