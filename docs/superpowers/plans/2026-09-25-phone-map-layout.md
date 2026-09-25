# Wine map on the phone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Below `md` (768 px), `/knowledge/map` becomes one fixed screen that never scrolls. It has the header, one toolbar row, the map filling the rest, and a bottom sheet with Explore and Details tabs. Tablets and desktop render exactly what they render today.

**Architecture:**
- `max-md:` utilities shape the phone layout. The map gets a definite height from a flex chain that starts at AppShell's `h-dvh` column.
- A `useIsPhone()` hook only decides which elements exist. An element that is md+ only becomes `null` in place, so the map's React parent chain is the same at every width and crossing `md` never remounts MapLibre.
- A pure `sheetReducer` drives the new `MapBottomSheet` (closed, half, full).
- A `MapOptionsSheet` dialog holds the One country | All countries switch on phones.
- Everything ships in one production deploy.

**Tech Stack:** Next.js 16.2 App Router, React 19.2, TypeScript, Tailwind CSS 4.3, shadcn on base-ui (`src/components/ui/dialog.tsx`, `button.tsx`, `card.tsx`), MapLibre GL 5.24 via react-map-gl 8.1, lucide-react, vitest 3.2 (`environment: "node"`, no DOM).

**Spec:** `docs/superpowers/specs/2026-09-25-phone-map-layout-design.md`

## Global Constraints

- **Where to work.** Only in the worktree `C:\Users\Public\repos\blindtastingapp-map` on branch `phone-map`. Start every shell command with `cd /c/Users/Public/repos/blindtastingapp-map && ...`, because the working directory resets after each call.
  - Never touch `C:\Users\Public\repos\blindtastingapp`. That is the owner's checkout, with an uncommitted `package.json` the owner owns.
  - Never update the local `master` ref.
- **Commits.** Use the repository identity, and end the message with the attribution line:
  `GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "<message>" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"`.
  - `git add` only the files the task names. Never use `git add -A`.
  - Nothing is pushed before Task 10.
- **Line endings.** `core.autocrlf=true`, and every existing file this plan edits is CRLF in the working copy (`src/**` and `CLAUDE.md`).
  - Edit existing files with the Edit tool, which matches either ending.
  - Task 8's one script detects `\r\n` itself.
  - New files may be written with LF. Git normalises them, and the "LF will be replaced by CRLF" warning is expected.
  - `git diff --stat` must never show a whole file rewritten.
- **Checks.**
  - Tests: `npx vitest run <path>` for one file, `npx vitest run` for all. The base (9dafd08) has 178 files and 3654 tests. This plan adds two test files.
  - Types: `npx tsc --noEmit`. Lint: `npx eslint <files>`.
  - Vitest runs in `node` with no DOM. Pure logic is covered by vitest. Components are checked by types, lint, the build, and Task 10's browser run.
- **Production is live with daily users.** Everything ships in the single deploy in Task 10, and only the main session pushes. An implementer subagent stops before Task 10.
- **Tablets (md–xl) and desktop (xl+) render exactly what they do today (D7).** Four rules apply in every existing file:
  1. An existing className only gains `max-md:`-prefixed utilities. The one exception is page.tsx, where a `md:` utility reproduces today's md+ value.
  2. An element phones must not have becomes `null` IN PLACE when `isPhone`, so its JSX slot is kept. It also carries `max-md:hidden`, so the server-rendered first paint on a phone never shows it.
  3. An element only phones have renders only when `isPhone`.
  4. A prop that differs on phones is written `isPhone ? phoneValue : <today's value>`.
- **What counts as a phone.** `(width < 48rem)`, in CSS and JS alike. That is exactly what Tailwind v4's `max-md:` compiles to, and `src/app/globals.css` overrides no breakpoint.
- **Nothing new is persisted or put in the URL (D6).** There is no new localStorage, sessionStorage or safe-storage key and no new URL parameter. The sheet state and the options-sheet state reset on every load. `wine-map-lang` and the One|All flags behave as today.
- **Map rules.**
  - Never pass a changing `mapStyle` to `<Map>`.
  - The map loads only through `next/dynamic` with `ssr: false`.
  - TileWineMap's props stay as they are, except the value passed to `onSelect` on phones.
- **Files that stay untouched.**
  - `src/lib/wine-map/detail-status.ts` (the status copy) and `src/lib/wine-map/detail-mode.ts` (the One|All rules and keys).
  - `src/components/app-shell.tsx`. Its "the content column is the scroll container" rule stays for every page.
  - `src/components/app-header.tsx`. Its existing `title` prop is used as is.
- **Scroll rules.** The country chips keep their `scrollTo` rule, and they only render from md. The tree keeps its nearest-scrollable-ancestor walk and never uses `scrollIntoView`.
- **Tap targets.** Every control this plan adds, or moves into the phone toolbar or sheets, is at least 44 px tall (D9).
- **Out of bounds.** No new dependency, no migration, no Anthropic API call, and no MapLibre upgrade.

## Review Focus

- **A flown place under the half sheet.**
  - The cause: tree picks and `?place=` links fit the place to the WHOLE canvas (`cameraForBounds`, padding 48), and TileWineMap is otherwise off limits in this spec. At 375x812, the canvas centre (y ≈ 463) therefore sits about 57 px below the half sheet's top edge (y = 406).
  - What a person expects: to see the place they just picked.
  - Pinned by the measurement in Task 10 Step 5 (camera centre against sheet top, with a screenshot).
  - If a picked appellation is wholly hidden, stop and report. Camera padding is the follow-up, and it needs the owner.
- **The active-tasting strip is present, or appears on a poll.**
  - Expected: the strip takes its own height, the map shrinks by exactly that, the column still never scrolls, and the bar stays at the bottom.
  - Pinned by Task 7's flex-only height chain (no calc) and Task 10 Step 7 (an injected 80 px strip).
- **Crossing md after the map has mounted** (a rotated phone, a resized window).
  - Expected: the tablet layout, or the phone layout on the way back, with the SAME MapLibre instance and the camera where it was. Full view and the options sheet are closed.
  - Pinned by Task 8's slot-preserving nulls and render-time adjustments, and by Task 10 Step 8 (a marker on `window.__wineMap` survives two resizes).
- **Escape inside a dialog or popover stacked on the open sheet** (a grape's GrapeModal, a typical wine's ArchetypeModal, the grape Filter popover).
  - Expected: Escape closes only the top layer, and the sheet stays where it was.
  - Pinned by Task 4's `contains(target)` guard and Task 10 Step 5.
- **A drag against a tap on the sheet bar.** The cases: a 10 px jitter on a tab, a swipe that starts on a tab and ends off the bar, and a keyboard Enter after a swipe.
  - Expected: a jitter is a tap. A swipe snaps the sheet and never also toggles a tab. A keyboard click is never swallowed.
  - Pinned by Task 1's threshold tests, Task 4's window-level `pointerup` and its `detail === 0` rule, and Task 10 Step 5.

---

## File Structure

New:
- `src/lib/wine-map/sheet-state.ts` (+ `sheet-state.test.ts`) — the bottom sheet's pure state: `SheetState`, `SheetEvent`, `sheetReducer`, `initialSheet`, `isSheetDrag`.
- `src/lib/use-is-phone.ts` (+ `use-is-phone.test.ts`) — `PHONE_QUERY`, the pure `phoneStore`, and the `useIsPhone` hook.
- `src/app/knowledge/map/map-bottom-sheet.tsx` — the phone sheet: the bar (handle, tabs, title, chevron), two tab panels, the drag and Escape handling.
- `src/app/knowledge/map/map-options-sheet.tsx` — a phone bottom Dialog around `MapDetailControls`.

Modified:
- `src/app/knowledge/map/wine-map-tree.tsx` — the optional props `active` and `rootsCollapsed`, plus `max-md:` sizes.
- `src/app/knowledge/map/map-detail-controls.tsx` — the Retry button is 44 px below md.
- `src/app/knowledge/map/tile-wine-map.tsx` — the legend and attribution offsets below md, nothing else.
- `src/app/knowledge/map/page.tsx` — the header title, a heading hidden below md, and the page wrapper.
- `src/app/knowledge/map/tile-wine-map-explorer.tsx` — the phone layout.
- `CLAUDE.md` — the wine-map bullets.

## The height chain (spec D3)

At every level below, the height is definite, which is what the two earlier "map collapsed to zero" bugs lacked.

**Why there is no `--app-header-h` and no calc.**
- The header is 53 px: `py-2.5` gives 10 + 10, the burger, scan and bell buttons are `size-8` (32), and `border-b` adds 1.
- But `ActiveTastingBanner` renders directly under the header on this page whenever the viewer is in an eligible tasting. It is about 53–95 px tall, and it can appear or disappear on a poll.
- Spec D1's `h-[calc(100dvh-var(--app-header-h))]` would overflow the column by the strip's height, and the page would scroll.
- So everything below the header is a flex chain, and the strip simply takes its share. The 53 px appears in this plan only as the expected value in Task 10's checks.

| # | Element (file) | Classes that decide the height below md | Height at 375x812, no strip |
|---|---|---|---|
| 0 | AppShell frame (`app-shell.tsx`, untouched) | `flex h-dvh overflow-hidden` | 812 |
| 1 | AppShell content column (untouched) | `flex h-full min-w-0 flex-1 flex-col overflow-y-auto` | 812, never overflows on this page |
| 2 | page root `div` (`page.tsx`) | `flex flex-1 flex-col max-md:min-h-0 max-md:overflow-hidden` | 812 |
| 2a | `<header>` (untouched) | sticky, `py-2.5`, 32 px buttons, `border-b` | 53 |
| 2b | `ActiveTastingBanner` (untouched) | `flex shrink-0 …`, or nothing | 0 |
| 3 | `data-map-page` wrapper (`page.tsx`) | `flex w-full flex-1 flex-col max-md:min-h-0 max-md:overflow-hidden md:gap-6 md:p-8` | 759 |
| 3a | heading block (`page.tsx`) | `hidden md:block` | 0 |
| 4 | explorer outer `div` (explorer) | `flex flex-col gap-4 max-md:relative max-md:min-h-0 max-md:flex-1 max-md:gap-0 max-md:overflow-hidden`. This is the sheet's containing block. | 759 |
| 5 | explorer row `div` | today's classes + `max-md:min-h-0 max-md:flex-1 max-md:gap-0` | 759 |
| 6 | map `Card` | `order-1 min-w-0 flex-1 overflow-hidden` + `max-md:min-h-0 max-md:gap-0 max-md:rounded-none max-md:bg-transparent max-md:py-0 max-md:ring-0` | 759 |
| 7 | map `CardContent` | `pt-4` + `max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col max-md:px-0 max-md:pt-0` | 759 |
| 7a | toolbar row (the filter row) | `… max-md:mb-0 max-md:shrink-0 max-md:flex-nowrap max-md:px-3 max-md:py-1.5`. The tallest child is the Local/English group: 44 px buttons + `p-0.5` + border. | 62 |
| 8 | map wrapper `div` | `h-[70vh] min-h-[420px]` + `max-md:h-auto max-md:min-h-0 max-md:flex-1` | 697 |
| 9 | `MapErrorBoundary` → TileWineMap `relative h-full … border`. Also at this level: the dynamic placeholder (+ `max-md:h-full max-md:min-h-0`), the manifest skeleton `h-full`, and `MapUnavailableCard` `h-full`. | `h-full` | 697 (canvas 373x695) |
| — | `MapBottomSheet` (absolute in level 4) | `absolute inset-x-0 bottom-0 z-30`, plus `h-14` (closed), `h-[50dvh]` (half) or `h-full` (full) | bar 56, over the map's bottom edge |

At 375x667 the numbers are: wrapper 552, canvas 373x550, and the closed bar's top at y = 611.

## Interface Contracts

```ts
// src/lib/wine-map/sheet-state.ts (Task 1)
export type SheetSnap = "closed" | "half" | "full";
export type SheetTab = "explore" | "details";
export type SheetState = { readonly snap: SheetSnap; readonly tab: SheetTab };
export type SheetEvent =
  | { type: "tab"; tab: SheetTab }
  | { type: "toggle" }
  | { type: "close" }
  | { type: "mapTap" }
  | { type: "treePick" }
  | { type: "deepLink" }
  | { type: "drag"; dy: number };
export const SHEET_DRAG_THRESHOLD: 32;
export const CLOSED_SHEET: SheetState;   // { snap: "closed", tab: "explore" }
export const DETAILS_HALF: SheetState;   // { snap: "half", tab: "details" }
export function initialSheet(initialPlaceKey: string | null): SheetState;
export function isSheetDrag(dy: number): boolean;
export function sheetReducer(state: SheetState, event: SheetEvent): SheetState;

// src/lib/use-is-phone.ts (Task 2)
export const PHONE_QUERY = "(width < 48rem)";
export type MediaQueryListLike = { readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void };
export type MatchMediaLike = (query: string) => MediaQueryListLike;
export type PhoneStore = { subscribe(onChange: () => void): () => void; getSnapshot(): boolean };
export function phoneStore(matchMedia: MatchMediaLike | null): PhoneStore;
export function useIsPhone(): boolean;

// src/app/knowledge/map/wine-map-tree.tsx (Task 3): two new optional props
//   active?: boolean          // default true
//   rootsCollapsed?: boolean  // default false

// src/app/knowledge/map/map-bottom-sheet.tsx (Task 4)
export function MapBottomSheet(props: {
  sheet: SheetState; onEvent: (event: SheetEvent) => void; title: string;
  detailsKey: string | null; explore: ReactNode; details: ReactNode;
}): JSX.Element;

// src/app/knowledge/map/map-options-sheet.tsx (Task 5)
export function MapOptionsSheet(props: {
  open: boolean; onOpenChange: (open: boolean) => void;
  mode: DetailMode; onModeChange: (mode: DetailMode) => void;
  status: DetailStatus; onRetry: () => void;
}): JSX.Element;
```

---

### Task 1: The sheet's pure state (`sheet-state.ts`)

**Files:**
- Create: `src/lib/wine-map/sheet-state.ts`
- Test: `src/lib/wine-map/sheet-state.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: everything under `sheet-state.ts` in Interface Contracts. Task 4 imports `isSheetDrag`, `SheetEvent`, `SheetState` and `SheetTab`. Task 8 imports `initialSheet` and `sheetReducer`.

- [ ] **Step 1: Write the failing test.** Create `src/lib/wine-map/sheet-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CLOSED_SHEET,
  DETAILS_HALF,
  SHEET_DRAG_THRESHOLD,
  initialSheet,
  isSheetDrag,
  sheetReducer,
  type SheetState,
} from "./sheet-state";

// The phone map's bottom sheet (spec 2026-09-25 §1 D4, §3).
const at = (snap: SheetState["snap"], tab: SheetState["tab"]): SheetState => ({
  snap,
  tab,
});

describe("initialSheet", () => {
  it("starts closed on Explore without a deep link", () => {
    expect(initialSheet(null)).toEqual(at("closed", "explore"));
    expect(CLOSED_SHEET).toEqual(at("closed", "explore"));
  });

  it("starts on Details at half for a ?place= load", () => {
    expect(initialSheet("france.bourgogne")).toEqual(at("half", "details"));
    expect(DETAILS_HALF).toEqual(at("half", "details"));
  });
});

describe("sheetReducer: tabs", () => {
  it("a tab opens half on that tab when closed", () => {
    expect(sheetReducer(at("closed", "explore"), { type: "tab", tab: "details" })).toEqual(at("half", "details"));
    expect(sheetReducer(at("closed", "details"), { type: "tab", tab: "explore" })).toEqual(at("half", "explore"));
    expect(sheetReducer(at("closed", "explore"), { type: "tab", tab: "explore" })).toEqual(at("half", "explore"));
  });

  it("the shown tab again closes, keeping the tab", () => {
    expect(sheetReducer(at("half", "details"), { type: "tab", tab: "details" })).toEqual(at("closed", "details"));
    expect(sheetReducer(at("full", "explore"), { type: "tab", tab: "explore" })).toEqual(at("closed", "explore"));
  });

  it("the other tab switches, keeping the snap", () => {
    expect(sheetReducer(at("half", "explore"), { type: "tab", tab: "details" })).toEqual(at("half", "details"));
    expect(sheetReducer(at("full", "details"), { type: "tab", tab: "explore" })).toEqual(at("full", "explore"));
  });
});

describe("sheetReducer: chevron and Escape", () => {
  it("the chevron opens half on the current tab and closes an open sheet", () => {
    expect(sheetReducer(at("closed", "details"), { type: "toggle" })).toEqual(at("half", "details"));
    expect(sheetReducer(at("half", "explore"), { type: "toggle" })).toEqual(at("closed", "explore"));
    expect(sheetReducer(at("full", "details"), { type: "toggle" })).toEqual(at("closed", "details"));
  });

  it("Escape closes and keeps the tab; an already closed sheet is the same object", () => {
    expect(sheetReducer(at("half", "details"), { type: "close" })).toEqual(at("closed", "details"));
    expect(sheetReducer(at("full", "explore"), { type: "close" })).toEqual(at("closed", "explore"));
    const closed = at("closed", "explore");
    expect(sheetReducer(closed, { type: "close" })).toBe(closed);
  });
});

describe("sheetReducer: a selection opens Details at half", () => {
  for (const type of ["mapTap", "treePick", "deepLink"] as const) {
    it(`${type}, from every state`, () => {
      for (const state of [
        at("closed", "explore"),
        at("closed", "details"),
        at("half", "explore"),
        at("full", "explore"),
        at("full", "details"),
      ]) {
        expect(sheetReducer(state, { type })).toEqual(at("half", "details"));
      }
    });
  }

  it("a map tap while Details already shows at half is the same object", () => {
    // select() returns early for the place already selected; the sheet still
    // gets the event, and this is what it does with it.
    const shown = at("half", "details");
    expect(sheetReducer(shown, { type: "mapTap" })).toBe(shown);
  });
});

describe("sheetReducer: the drag handle", () => {
  it("up goes full from closed and half, keeping the tab", () => {
    expect(sheetReducer(at("closed", "explore"), { type: "drag", dy: -120 })).toEqual(at("full", "explore"));
    expect(sheetReducer(at("half", "details"), { type: "drag", dy: -40 })).toEqual(at("full", "details"));
  });

  it("down closes from half and full, keeping the tab", () => {
    expect(sheetReducer(at("half", "details"), { type: "drag", dy: 200 })).toEqual(at("closed", "details"));
    expect(sheetReducer(at("full", "explore"), { type: "drag", dy: 40 })).toEqual(at("closed", "explore"));
  });

  it("counts from exactly the threshold", () => {
    expect(sheetReducer(at("half", "explore"), { type: "drag", dy: -SHEET_DRAG_THRESHOLD })).toEqual(at("full", "explore"));
    expect(sheetReducer(at("half", "explore"), { type: "drag", dy: SHEET_DRAG_THRESHOLD })).toEqual(at("closed", "explore"));
  });

  it("a jitter under the threshold is a tap: the same object", () => {
    const half = at("half", "details");
    expect(sheetReducer(half, { type: "drag", dy: SHEET_DRAG_THRESHOLD - 1 })).toBe(half);
    expect(sheetReducer(half, { type: "drag", dy: -(SHEET_DRAG_THRESHOLD - 1) })).toBe(half);
    expect(sheetReducer(half, { type: "drag", dy: 0 })).toBe(half);
  });

  it("down on a closed sheet and up on a full one change nothing", () => {
    const closed = at("closed", "explore");
    expect(sheetReducer(closed, { type: "drag", dy: 80 })).toBe(closed);
    const full = at("full", "details");
    expect(sheetReducer(full, { type: "drag", dy: -80 })).toBe(full);
  });
});

describe("isSheetDrag", () => {
  it("is a drag from 32 px of travel either way", () => {
    expect(SHEET_DRAG_THRESHOLD).toBe(32);
    expect(isSheetDrag(0)).toBe(false);
    expect(isSheetDrag(31)).toBe(false);
    expect(isSheetDrag(-31)).toBe(false);
    expect(isSheetDrag(32)).toBe(true);
    expect(isSheetDrag(-32)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**
  - Run: `cd /c/Users/Public/repos/blindtastingapp-map && npx vitest run src/lib/wine-map/sheet-state.test.ts`
  - Expected: FAIL with `Failed to resolve import "./sheet-state"`.

- [ ] **Step 3: Implement.** Create `src/lib/wine-map/sheet-state.ts`:

```ts
// The phone wine map's bottom sheet (spec 2026-09-25 §1 D4): which snap it sits
// at and which tab it shows. A pure reducer, so every transition is pinned by
// sheet-state.test.ts; map-bottom-sheet.tsx only draws the state and reports
// events. Nothing here is persisted or put in the URL (D6): the explorer starts
// it afresh on every load, from initialSheet.

export type SheetSnap = "closed" | "half" | "full";
export type SheetTab = "explore" | "details";
export type SheetState = { readonly snap: SheetSnap; readonly tab: SheetTab };

export type SheetEvent =
  /** A tab button. Closed: opens half on that tab. Open on that tab: closes.
      Open on the other tab: switches, keeping the snap. */
  | { type: "tab"; tab: SheetTab }
  /** The bar's chevron: closed opens half on the current tab; open closes. */
  | { type: "toggle" }
  /** Escape while focus is inside the sheet. */
  | { type: "close" }
  /** A tap on the map that selected a place (TileWineMap's source "map"). */
  | { type: "mapTap" }
  /** A place picked in the Explore tree. */
  | { type: "treePick" }
  /** A ?place= navigation while the page is open (deepLinkAction's select). */
  | { type: "deepLink" }
  /** The bar dragged `dy` CSS px from pointerdown to pointerup; negative is
      up. */
  | { type: "drag"; dy: number };

/** A gesture on the bar is a drag, not a tap, from this many px of travel. */
export const SHEET_DRAG_THRESHOLD = 32;

/** A load without ?place=: the bar only, the tree behind the Explore tab. */
export const CLOSED_SHEET: SheetState = { snap: "closed", tab: "explore" };

/** Where every selection lands on a phone: the details, the map still above. */
export const DETAILS_HALF: SheetState = { snap: "half", tab: "details" };

/** The first state. A load with ?place= is a deep link, so it opens on
    Details at half; any other load starts closed. */
export function initialSheet(initialPlaceKey: string | null): SheetState {
  return initialPlaceKey ? DETAILS_HALF : CLOSED_SHEET;
}

/** Whether a bar gesture that travelled `dy` px counts as a drag. */
export function isSheetDrag(dy: number): boolean {
  return Math.abs(dy) >= SHEET_DRAG_THRESHOLD;
}

// The same object back when nothing changes, so React skips the re-render.
function settle(state: SheetState, next: SheetState): SheetState {
  return state.snap === next.snap && state.tab === next.tab ? state : next;
}

export function sheetReducer(state: SheetState, event: SheetEvent): SheetState {
  switch (event.type) {
    case "tab":
      if (state.snap === "closed") return { snap: "half", tab: event.tab };
      if (state.tab === event.tab) return { snap: "closed", tab: state.tab };
      return { snap: state.snap, tab: event.tab };
    case "toggle":
      return { snap: state.snap === "closed" ? "half" : "closed", tab: state.tab };
    case "close":
      return settle(state, { snap: "closed", tab: state.tab });
    case "mapTap":
    case "treePick":
    case "deepLink":
      return settle(state, DETAILS_HALF);
    case "drag":
      if (!isSheetDrag(event.dy)) return state;
      return settle(state, { snap: event.dy < 0 ? "full" : "closed", tab: state.tab });
  }
}
```

- [ ] **Step 4: Run it and watch it pass.**
  - Run: `cd /c/Users/Public/repos/blindtastingapp-map && npx vitest run src/lib/wine-map/sheet-state.test.ts && npx tsc --noEmit && npx eslint src/lib/wine-map/sheet-state.ts src/lib/wine-map/sheet-state.test.ts`
  - Expected: every test passes, and tsc and eslint print nothing.

- [ ] **Step 5: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-map && git add src/lib/wine-map/sheet-state.ts src/lib/wine-map/sheet-state.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): sheet state for the phone map's bottom sheet" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `useIsPhone` (`src/lib/use-is-phone.ts`)

**Files:**
- Create: `src/lib/use-is-phone.ts`
- Test: `src/lib/use-is-phone.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `useIsPhone(): boolean`, which Task 8 uses. The pure half is `PHONE_QUERY`, `phoneStore`, `MatchMediaLike`, `MediaQueryListLike` and `PhoneStore`.

**How it is tested.** Vitest has no DOM here. So the part that talks to `matchMedia` is a pure factory, `phoneStore(matchMedia)`, tested with a fake list: its queries, its `change` listeners, and its `matches`. `useIsPhone` is three lines of `useSyncExternalStore` over that store. Its browser behaviour is checked in Task 10 Steps 4 and 8: the layout at 375, and the live switch when the pane is resized.

- [ ] **Step 1: Write the failing test.** Create `src/lib/use-is-phone.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PHONE_QUERY, phoneStore, type MatchMediaLike } from "./use-is-phone";

// A matchMedia stand-in: records every query, holds the change listeners, and
// lets a test flip `matches` the way a resize or a rotation would.
function fakeMedia(initial: boolean) {
  let matches = initial;
  const queries: string[] = [];
  const listeners = new Set<() => void>();
  const matchMedia: MatchMediaLike = (query) => {
    queries.push(query);
    return {
      get matches() {
        return matches;
      },
      addEventListener: (_type, listener) => {
        listeners.add(listener);
      },
      removeEventListener: (_type, listener) => {
        listeners.delete(listener);
      },
    };
  };
  const change = (next: boolean) => {
    matches = next;
    for (const listener of [...listeners]) listener();
  };
  return { matchMedia, queries, listeners, change };
}

describe("phoneStore", () => {
  it("asks for exactly what Tailwind's max-md: compiles to", () => {
    expect(PHONE_QUERY).toBe("(width < 48rem)");
    const media = fakeMedia(true);
    phoneStore(media.matchMedia).getSnapshot();
    expect(media.queries).toEqual([PHONE_QUERY]);
  });

  it("reads the list's matches and follows a change", () => {
    const media = fakeMedia(true);
    const store = phoneStore(media.matchMedia);
    expect(store.getSnapshot()).toBe(true);
    media.change(false);
    expect(store.getSnapshot()).toBe(false);
  });

  it("notifies a subscriber on change until it unsubscribes", () => {
    const media = fakeMedia(false);
    const store = phoneStore(media.matchMedia);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    expect(media.listeners.size).toBe(1);
    media.change(true);
    expect(calls).toBe(1);
    unsubscribe();
    expect(media.listeners.size).toBe(0);
    media.change(false);
    expect(calls).toBe(1);
  });

  it("creates one MediaQueryList for every read and subscription", () => {
    const media = fakeMedia(false);
    const store = phoneStore(media.matchMedia);
    store.getSnapshot();
    const off = store.subscribe(() => {});
    store.getSnapshot();
    off();
    expect(media.queries).toHaveLength(1);
  });

  it("without matchMedia it is never a phone, and subscribing is a no-op", () => {
    const store = phoneStore(null);
    expect(store.getSnapshot()).toBe(false);
    const off = store.subscribe(() => {
      throw new Error("never called");
    });
    expect(() => off()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it and watch it fail.**
  - Run: `cd /c/Users/Public/repos/blindtastingapp-map && npx vitest run src/lib/use-is-phone.test.ts`
  - Expected: FAIL with `Failed to resolve import "./use-is-phone"`.

- [ ] **Step 3: Implement.** Create `src/lib/use-is-phone.ts`:

```ts
"use client";

// Phones are below Tailwind's md breakpoint (spec 2026-09-25 §1 D7). The wine
// map shapes its phone layout with `max-md:` classes and asks this hook only
// which elements should exist. PHONE_QUERY is the exact condition `max-md:`
// compiles to in Tailwind v4 (`@media (width < 48rem)`; globals.css overrides
// no breakpoint), so the CSS and this hook agree at every width, including a
// fractional one between 767 and 768 CSS px, where `(max-width: 767px)` would
// not.
//
// Same hydration shape as the map's Local/English and One|All stores:
// useSyncExternalStore with false as the server snapshot, so SSR and hydration
// render the md+ elements and a phone switches right after. `phoneStore` is
// pure and unit-tested with a fake matchMedia (use-is-phone.test.ts);
// `useIsPhone` is the browser half.
import { useSyncExternalStore } from "react";

export const PHONE_QUERY = "(width < 48rem)";

export type MediaQueryListLike = {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
};

export type MatchMediaLike = (query: string) => MediaQueryListLike;

export type PhoneStore = {
  subscribe(onChange: () => void): () => void;
  getSnapshot(): boolean;
};

/** A store over PHONE_QUERY. The list is created on first use and kept, so
    every read and every subscription share one MediaQueryList. Without
    matchMedia it reads as not-a-phone and never changes. */
export function phoneStore(matchMedia: MatchMediaLike | null): PhoneStore {
  let list: MediaQueryListLike | null | undefined;
  const media = () => {
    if (list === undefined) list = matchMedia ? matchMedia(PHONE_QUERY) : null;
    return list;
  };
  return {
    subscribe(onChange) {
      const current = media();
      if (!current) return () => {};
      current.addEventListener("change", onChange);
      return () => current.removeEventListener("change", onChange);
    },
    getSnapshot: () => media()?.matches ?? false,
  };
}

// Built on the first client call, never during SSR (there is no window there).
let browserStore: PhoneStore | null = null;
function store(): PhoneStore {
  if (!browserStore) {
    browserStore = phoneStore(
      typeof window.matchMedia === "function" ? window.matchMedia.bind(window) : null,
    );
  }
  return browserStore;
}
const subscribe = (onChange: () => void) => store().subscribe(onChange);
const getSnapshot = () => store().getSnapshot();
const getServerSnapshot = () => false;

/** True below md. False on the server and during hydration. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

- [ ] **Step 4: Run it and watch it pass.**
  - Run: `cd /c/Users/Public/repos/blindtastingapp-map && npx vitest run src/lib/use-is-phone.test.ts && npx tsc --noEmit && npx eslint src/lib/use-is-phone.ts src/lib/use-is-phone.test.ts`
  - Expected: five tests pass, and tsc and eslint print nothing.
  - If tsc rejects `window.matchMedia.bind(window)` as a `MatchMediaLike`, write `window.matchMedia.bind(window) as MatchMediaLike` instead. The DOM's `MediaQueryList` has overloaded listener methods, and the method-syntax types above are written to accept it. Only cast if tsc says otherwise.

- [ ] **Step 5: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-map && git add src/lib/use-is-phone.ts src/lib/use-is-phone.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): useIsPhone, the max-md media query as a hook" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Phone-only options on the tree (`wine-map-tree.tsx`)

**Files:**
- Modify: `src/app/knowledge/map/wine-map-tree.tsx`:
  - the props, lines 18-40;
  - the scroll effect, lines 129-154;
  - the default collapse, lines 181 and 216-218;
  - the row markup, lines 223-261;
  - the search row, lines 273-302.

**Interfaces:**
- Consumes: nothing.
- Produces: two optional `WineMapTree` props, which Task 8 passes only on phones:
  - `active?: boolean` (default `true`);
  - `rootsCollapsed?: boolean` (default `false`).
- The desktop card passes neither prop, so its behaviour and markup at md+ are unchanged.

Why each part is here:
- **`active`.** On a phone the tree sits in a tab that is hidden while Details shows. A map tap selects a place while the tree is hidden, and a hidden list has no layout to scroll. So the selected row has to be revealed again when the tab is shown.
- **`rootsCollapsed`.** The spec says "Countries start collapsed" and calls that "already the case", but it is not. Today tier-0 countries open one level: `?? node.tier >= 1`. The owner asked for the hierarchy to "start collapsed like a menu", so phones open on the plain list of countries.
- **The 44 px sizes (D9).** The tree's rows, search box and level buttons become 44 px tall below md.
- **The 16 px search field.** iOS Safari zooms the whole page into any focused input smaller than 16 px, which would undo the fixed screen.

No unit test: every change is markup, or a default-value branch the browser run pins (Task 10 Step 5: Explore opens on countries only, and the selected row is revealed).

- [ ] **Step 1: Add the props.** Edit old:

```tsx
  filterKeys = null,
  english = false,
  onPrefetch,
}: {
```

  New:

```tsx
  filterKeys = null,
  english = false,
  onPrefetch,
  active = true,
  rootsCollapsed = false,
}: {
```

  Then edit old:

```tsx
  onPrefetch?: PlacePrefetchHandlers;
}) {
```

  New:

```tsx
  onPrefetch?: PlacePrefetchHandlers;
  /** Phones: false while the tree's tab is hidden (the map's bottom sheet on
      Details). A hidden list cannot scroll, so turning true reveals the
      selected row again. Defaults to true: the desktop card is always shown. */
  active?: boolean;
  /** Phones: countries start collapsed too, so the list opens as a menu of
      countries (spec 2026-09-25 D4). Defaults to false: on desktop countries
      open one level, as before. */
  rootsCollapsed?: boolean;
}) {
```

- [ ] **Step 2: Gate the scroll effect on `active`.** Edit old:

```tsx
  useEffect(() => {
    const row = selectedRowRef.current;
    if (!row) return;
```

  New:

```tsx
  useEffect(() => {
    // A hidden tab has no layout to scroll; this runs again once it is shown.
    if (!active) return;
    const row = selectedRowRef.current;
    if (!row) return;
```

  Then edit old `  }, [selectedKey]);` (the only occurrence) to new `  }, [selectedKey, active]);`.

- [ ] **Step 3: The default collapse.**
  - Edit old `      const isCollapsed = collapsed[node.key] ?? node.tier >= 1;` → new `      const isCollapsed = collapsed[node.key] ?? (node.tier >= 1 || rootsCollapsed);`.
  - Edit old `      : (collapsed[node.key] ?? node.tier >= 1);` → new `      : (collapsed[node.key] ?? (node.tier >= 1 || rootsCollapsed));`.

- [ ] **Step 4: 44 px rows below md.** Four edits:
  - Old `` className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-sm ${ `` → new `` className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-sm max-md:min-h-11 max-md:py-0 ${ ``.
  - Old `              className="shrink-0 text-muted-foreground hover:text-foreground"` → new `              className="shrink-0 text-muted-foreground hover:text-foreground max-md:flex max-md:h-11 max-md:w-7 max-md:items-center max-md:justify-center"`.
  - Old `            <span className="w-3.5 shrink-0" />` → new `            <span className="w-3.5 shrink-0 max-md:w-7" />`.
  - Old `            className="truncate text-left"` → new `            className="truncate text-left max-md:min-h-11 max-md:min-w-0 max-md:flex-1"`.

- [ ] **Step 5: The search row below md.**
  - Old `        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border px-2 py-1.5">` → new `        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border px-2 py-1.5 max-md:min-h-11">`.
  - Old `            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"` → new `            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground max-md:text-base"`.
  - The two level buttons share one class string. Use the Edit tool with `replace_all: true`:
    - old `          className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"`
    - new `          className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40 max-md:flex max-md:size-11 max-md:items-center max-md:justify-center"`
  - Add a comment line right above the `<input` element:

```tsx
          {/* 16 px below md: iOS zooms the whole page into a smaller focused
              field, which would undo the phone map's fixed screen. */}
```

- [ ] **Step 6: Check.**
  - Run: `cd /c/Users/Public/repos/blindtastingapp-map && npx tsc --noEmit && npx eslint src/app/knowledge/map/wine-map-tree.tsx && git diff --stat`
  - Expected: tsc and eslint are clean, and only `wine-map-tree.tsx` changed.
  - Run `git diff src/app/knowledge/map/wine-map-tree.tsx`. Every changed class string keeps its old tokens and only adds `max-md:` ones.

- [ ] **Step 7: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-map && git add src/app/knowledge/map/wine-map-tree.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): phone-only tree options (active, rootsCollapsed, 44 px rows)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The bottom sheet (`map-bottom-sheet.tsx`)

**Files:**
- Create: `src/app/knowledge/map/map-bottom-sheet.tsx`

**Interfaces:**
- Consumes:
  - `isSheetDrag`, `SheetEvent`, `SheetState` and `SheetTab` (Task 1);
  - `rovingIndex(key, index, count, "horizontal")` from `@/lib/wine-map/country-chips` (existing);
  - `cn` from `@/lib/utils`.
- Produces: `MapBottomSheet({ sheet, onEvent, title, detailsKey, explore, details })`, which only Task 8 renders.

Design points the code carries (spec D4, D9):
- **Heights.** Closed is `h-14` (56 px). Half is `h-[50dvh]`. Full is `h-full` of the explorer's `relative` phone column, which puts its top at the header's (or the strip's) bottom.
- **Not modal.** There is no backdrop and no focus trap, and the map keeps responding.
- **The whole bar is the drag handle.**
  - `pointerdown` on the bar records the Y position, and a window-level `pointerup` measures `dy`, so the finger may leave the bar.
  - The reducer decides the snap, with no live follow.
  - A drag swallows the click it would end in. A keyboard click (`detail === 0`) is never swallowed.
  - The bar has `touch-none`, so the browser never claims the gesture.
- **Escape** closes only while focus is inside the sheet's own DOM. A GrapeModal or ArchetypeModal is portaled out of it, and its Escape stays its own.
- **Tabs** are a `tablist` with `aria-selected`, using manual activation: arrow keys move focus, and a tap, Enter or Space chooses.
- **Both panels stay mounted.** A hidden panel uses the `hidden` attribute, which Tailwind's preflight makes `display: none !important`. So the tree's search and expansion survive tab switches.
- **Scroll containers.**
  - Explore is `overflow-hidden` and gives the tree a definite height. The tree's own `<ul class="min-h-0 flex-1 overflow-y-auto">` scrolls under a pinned search box, and `wine-map-tree.tsx`'s nearest-scrollable-ancestor walk finds that list.
  - Details is itself the scroller (`overflow-y-auto overscroll-contain`), and it scrolls back to its top on a new place.

No unit test: the transitions are Task 1's reducer, and the rest is markup and event wiring. Task 10 Step 5 checks every gesture in the browser.

- [ ] **Step 1: Create `src/app/knowledge/map/map-bottom-sheet.tsx`:**

```tsx
"use client";

// The phone wine map's bottom sheet (spec 2026-09-25 §1 D4). Below md the map
// page is one fixed screen, and this sheet holds what used to stack under the
// map: the hierarchy (Explore) and the place details (Details). Closed, it is a
// 56 px bar over the map's bottom edge; half (50dvh) leaves the map visible and
// interactive above it; full reaches the header. It is not modal: the map keeps
// responding behind it. The explorer owns the state
// (lib/wine-map/sheet-state.ts); this component draws it and reports taps,
// drags and Escape.
//
// Scroll containers: the Explore panel does not scroll itself. It gives the
// tree a definite height, so the tree's own list scrolls under a pinned search
// box, and wine-map-tree.tsx's nearest-scrollable-ancestor walk finds that
// list. The Details panel is itself the scroller. Nothing here scrolls the page.
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { rovingIndex } from "@/lib/wine-map/country-chips";
import {
  isSheetDrag,
  type SheetEvent,
  type SheetState,
  type SheetTab,
} from "@/lib/wine-map/sheet-state";

const TABS: readonly { value: SheetTab; label: string }[] = [
  { value: "explore", label: "Explore" },
  { value: "details", label: "Details" },
];

const SNAP_HEIGHT: Record<SheetState["snap"], string> = {
  closed: "h-14",
  half: "h-[50dvh]",
  full: "h-full",
};

// The focus ring the map's radios use (map-detail-controls.tsx).
const FOCUS_RING =
  "outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function MapBottomSheet({
  sheet,
  onEvent,
  title,
  detailsKey,
  explore,
  details,
}: {
  sheet: SheetState;
  onEvent: (event: SheetEvent) => void;
  /** The bar's label: the place whose details are showing, or a prompt. */
  title: string;
  /** The selected place. A new one scrolls Details back to its top. */
  detailsKey: string | null;
  explore: ReactNode;
  details: ReactNode;
}) {
  const baseId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Set when a gesture on the bar was a drag, so the click it ends in (on a
  // tab or the chevron) is swallowed instead of also toggling.
  const swallowClickRef = useRef(false);
  const stopDragRef = useRef<(() => void) | null>(null);
  const open = sheet.snap !== "closed";

  // A drag still in progress when the sheet unmounts (the viewport crossed md)
  // must not leave window listeners behind.
  useEffect(() => () => stopDragRef.current?.(), []);

  // A new place starts at the top of Details: a Nearby chip tapped at the end
  // of one place's details swaps in the next, which should not open at its end.
  useEffect(() => {
    const panel = detailsRef.current;
    if (panel) panel.scrollTop = 0;
  }, [detailsKey]);

  // The whole bar is the drag handle. A drag is measured from pointerdown to
  // pointerup on the window (the finger may leave the bar), with no live
  // follow: the reducer snaps on the distance alone.
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    stopDragRef.current?.();
    swallowClickRef.current = false;
    const startY = event.clientY;
    function stop() {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", stop);
      stopDragRef.current = null;
    }
    function finish(up: PointerEvent) {
      stop();
      const dy = up.clientY - startY;
      if (!isSheetDrag(dy)) return;
      swallowClickRef.current = true;
      onEvent({ type: "drag", dy });
    }
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", stop);
    stopDragRef.current = stop;
  };
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    // detail 0 is a keyboard click (Enter or Space), which no drag produced.
    if (!swallowClickRef.current || event.detail === 0) return;
    swallowClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const focusShownTab = () => {
    const index = TABS.findIndex((tab) => tab.value === sheet.tab);
    tabRefs.current[index]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || !open) return;
    // A dialog opened from inside the sheet (a grape, a typical wine) is
    // portaled out of this element, but its events still bubble here through
    // React's tree. Its Escape is its own.
    const target = event.target;
    if (!(target instanceof Node) || !sectionRef.current?.contains(target)) return;
    event.preventDefault();
    onEvent({ type: "close" });
    focusShownTab();
  };
  // Manual activation: arrows move focus between the two tabs; a tap, Enter or
  // Space chooses.
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = rovingIndex(event.key, index, TABS.length, "horizontal");
    if (next === null) return;
    event.preventDefault();
    tabRefs.current[next]?.focus();
  };

  return (
    <section
      ref={sectionRef}
      aria-label="Map panels"
      onKeyDown={onKeyDown}
      className={cn(
        "absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-2xl border-t border-border bg-card text-card-foreground shadow-[0_-8px_24px_rgba(0,0,0,0.10)] transition-[height] duration-200 ease-out motion-reduce:transition-none md:hidden",
        SNAP_HEIGHT[sheet.snap],
      )}
    >
      <div
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
        className="relative flex h-14 shrink-0 touch-none items-end gap-1 px-2 pb-1 select-none"
      >
        <span
          aria-hidden
          className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/40"
        />
        <div role="tablist" aria-label="Panels" className="flex shrink-0 items-center gap-1">
          {TABS.map((tab, index) => {
            const selected = sheet.tab === tab.value;
            const shown = open && selected;
            return (
              <button
                key={tab.value}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${tab.value}`}
                aria-controls={`${baseId}-panel-${tab.value}`}
                aria-selected={selected}
                aria-expanded={shown}
                tabIndex={selected ? 0 : -1}
                onClick={() => onEvent({ type: "tab", tab: tab.value })}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={cn(
                  "h-11 rounded-md px-3 text-sm transition-colors",
                  FOCUS_RING,
                  // As the map's radios: shape and weight as well as colour,
                  // since bordeaux on the dark card is only 1.3:1.
                  shown
                    ? "bg-primary font-semibold text-primary-foreground ring-2 ring-foreground ring-inset"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <span className="flex h-11 min-w-0 flex-1 items-center px-1">
          <span className="truncate text-sm font-medium">{title}</span>
        </span>
        <button
          type="button"
          aria-label={open ? "Close panel" : "Open panel"}
          aria-expanded={open}
          onClick={() => onEvent({ type: "toggle" })}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <ChevronUp
            aria-hidden
            className={cn(
              "size-5 transition-transform motion-reduce:transition-none",
              open ? "rotate-180" : "",
            )}
          />
        </button>
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel-explore`}
        aria-labelledby={`${baseId}-tab-explore`}
        hidden={!open || sheet.tab !== "explore"}
        className="min-h-0 flex-1 overflow-hidden px-3 pt-1 pb-3"
      >
        {explore}
      </div>
      <div
        ref={detailsRef}
        role="tabpanel"
        id={`${baseId}-panel-details`}
        aria-labelledby={`${baseId}-tab-details`}
        hidden={!open || sheet.tab !== "details"}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-1 pb-4"
      >
        {details}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Check.**
  - Run: `cd /c/Users/Public/repos/blindtastingapp-map && npx tsc --noEmit && npx eslint src/app/knowledge/map/map-bottom-sheet.tsx`
  - Expected: both clean. Nothing imports the file yet; Task 8 does.

- [ ] **Step 3: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-map && git add src/app/knowledge/map/map-bottom-sheet.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): the phone map's bottom sheet" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The Map options sheet (`map-options-sheet.tsx`)

**Files:**
- Create: `src/app/knowledge/map/map-options-sheet.tsx`
- Modify: `src/app/knowledge/map/map-detail-controls.tsx:95`, the Retry button's class.

**Interfaces:**
- Consumes:
  - `MapDetailControls({ mode, onModeChange, status, onRetry })` (existing, unchanged API);
  - `Dialog`, `DialogClose`, `DialogContent` and `DialogTitle` from `@/components/ui/dialog`;
  - `Button` from `@/components/ui/button`;
  - `type DetailMode` from `@/lib/wine-map/detail-mode`;
  - `type DetailStatus` from `@/lib/wine-map/detail-status`.
- Produces: `MapOptionsSheet({ open, onOpenChange, mode, onModeChange, status, onRetry })`, which only Task 8 renders.

What the sheet does (spec D2, D9):
- It holds the One country | All countries radiogroup, its status line and its Retry, all through `MapDetailControls` unchanged. That keeps the copy, the keys, the radio pattern and the All radio's `aria-describedby`.
- The Dialog's popup mounts only while it is open. Phones render no other `MapDetailControls`, so the `role="status"` region exists only here: one region, never two.
- The bottom-sheet idiom is the one `src/app/cellar/drink-sheet.tsx` already ships. `sm:max-w-none` is needed as well, because a phone may be 640–767 px wide, where `DialogContent`'s own `sm:max-w-sm` would apply.

- [ ] **Step 1: Create `src/app/knowledge/map/map-options-sheet.tsx`:**

```tsx
"use client";

// The phone's Map options sheet (spec 2026-09-25 §1 D2). Below md the map's
// toolbar is one row, so the One country | All countries switch and its status
// line move here, behind the toolbar's "Map options" button. MapDetailControls
// comes as is: the radiogroup, the All radio's aria-describedby and the one
// role="status" region, which exists only while this sheet is open, so the
// All warning is read next to the switch that causes it. The copy is
// detail-status.ts's, untouched.
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DetailMode } from "@/lib/wine-map/detail-mode";
import type { DetailStatus } from "@/lib/wine-map/detail-status";
import { MapDetailControls } from "./map-detail-controls";

export function MapOptionsSheet({
  open,
  onOpenChange,
  mode,
  onModeChange,
  status,
  onRetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: DetailMode;
  onModeChange: (mode: DetailMode) => void;
  status: DetailStatus;
  /** Re-requests the place tree when the status offers a Retry. */
  onRetry: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="inset-x-0 top-auto bottom-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-3 rounded-t-2xl rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-none"
      >
        <div className="flex items-center justify-between gap-2">
          <DialogTitle>Map options</DialogTitle>
          <DialogClose
            render={<Button variant="ghost" size="icon-lg" className="size-11" />}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>
        <MapDetailControls
          mode={mode}
          onModeChange={onModeChange}
          status={status}
          onRetry={onRetry}
        />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: The Retry button is 44 px below md.** In `src/app/knowledge/map/map-detail-controls.tsx`, edit:
  - old `            className="shrink-0 rounded-full border border-border px-2.5 py-0.5 font-medium text-muted-foreground transition-colors hover:text-foreground"`
  - new `            className="shrink-0 rounded-full border border-border px-2.5 py-0.5 font-medium text-muted-foreground transition-colors hover:text-foreground max-md:min-h-11"`
  - Nothing else in that file changes. The radios are already `min-h-11 … md:min-h-0`.

- [ ] **Step 3: Check.**
  - Run: `cd /c/Users/Public/repos/blindtastingapp-map && npx tsc --noEmit && npx eslint src/app/knowledge/map/map-options-sheet.tsx src/app/knowledge/map/map-detail-controls.tsx && npx vitest run src/lib/wine-map/detail-status.test.ts`
  - Expected: clean, and the status copy tests still pass (the copy was not touched).

- [ ] **Step 4: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-map && git add src/app/knowledge/map/map-options-sheet.tsx src/app/knowledge/map/map-detail-controls.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): the phone Map options sheet" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Legend and attribution clear the phone sheet bar (`tile-wine-map.tsx`)

**Files:**
- Modify: `src/app/knowledge/map/tile-wine-map.tsx`:
  - the component's `return (` and its container `div`, lines 1453-1454;
  - the legend container, line 1827.

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new. Below md the legend sits at `bottom: 4rem`, and MapLibre's bottom-right corner at `bottom: 54px`.

Spec D5 says nothing else in this file changes: the zoom/compass group stays top-left and Full view stays lg-only.

- **The legend.** It is our own element, so `max-md:bottom-16` beats its `bottom-2` in the same layer.
- **The attribution.** Its position comes from `maplibre-gl.css`: `.maplibregl-ctrl-bottom-right { bottom: 0 }`, imported unlayered at the top of this file. Tailwind utilities live in `@layer utilities`, and an unlayered declaration beats every layered one whatever its specificity (the same trap the note in `globals.css` describes). So the utility must be `!important`: the trailing `!`, which `src/components/ui/command.tsx` already uses (`h-8!`).
- **The arithmetic.** The corner at 54 px, plus the control's own `margin: 0 10px 10px 0`, puts the "i" 64 px up, level with the legend and 8 px clear of the 56 px bar.

- [ ] **Step 1: The attribution corner.** Edit old:

```tsx
  return (
    <div className="relative h-full overflow-hidden rounded-lg border">
```

  New:

```tsx
  // Phones: the explorer's bottom sheet bar (56 px) lies over the map's bottom
  // edge, so MapLibre's bottom-right corner (the compact attribution) is lifted
  // to 54 px; with the control's own 10 px margin the "i" sits at 64 px, level
  // with the legend. The trailing `!` is required: maplibre-gl.css is
  // unlayered, and an unlayered rule beats every layered Tailwind utility
  // whatever its specificity (see the note in globals.css).
  return (
    <div className="relative h-full overflow-hidden rounded-lg border max-md:[&_.maplibregl-ctrl-bottom-right]:bottom-[54px]!">
```

- [ ] **Step 2: The legend.** Edit old:

```tsx
      <div className="absolute bottom-2 left-2 max-w-[75%] rounded-md border border-border bg-background/85 text-[11px] leading-tight text-muted-foreground backdrop-blur-sm">
```

  New:

```tsx
      {/* Phones: above the explorer's 56 px sheet bar (spec 2026-09-25 D5). */}
      <div className="absolute bottom-2 left-2 max-w-[75%] rounded-md border border-border bg-background/85 text-[11px] leading-tight text-muted-foreground backdrop-blur-sm max-md:bottom-16">
```

- [ ] **Step 3: Check that the CSS compiles as intended.**
  - Run: `cd /c/Users/Public/repos/blindtastingapp-map && npx tsc --noEmit && npx eslint src/app/knowledge/map/tile-wine-map.tsx && npx vitest run src/app/knowledge/map && npx next build && grep -rhoE "maplibregl-ctrl-bottom-right\{bottom:54px[^}]*\}" .next/static --include=*.css`
    - The grep is recursive, because Next 16's Turbopack build may put CSS under `.next/static/chunks/` rather than `.next/static/css/`.
    - MapLibre's own rule is `{bottom:0;right:0}`, so it cannot match.
  - Expected:
    - tsc, eslint and the map folder's tests are clean, and the build succeeds.
    - The grep prints `maplibregl-ctrl-bottom-right{bottom:54px!important}`. That is the tail of our rule, inside `@media (width<48rem)`.
  - If it prints `bottom:54px` without `!important`, or nothing at all, the class did not compile as written. Fix it before committing.

- [ ] **Step 4: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-map && git add src/app/knowledge/map/tile-wine-map.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): legend and attribution clear the phone sheet bar" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The map page is one fixed screen on phones (`page.tsx`)

**Files:**
- Modify: `src/app/knowledge/map/page.tsx:35-66`.

**Interfaces:**
- Consumes: `AppHeader`'s existing `title?: string` prop (`src/components/app-header.tsx:40`). It renders `md:hidden` next to the burger, so md+ is unchanged.
- Produces:
  - the page root, `max-md:min-h-0 max-md:overflow-hidden`;
  - the `data-map-page` wrapper (levels 2 and 3 of the height chain), which Task 10's checks select;
  - a heading that is hidden below md.

What md+ looks like after the change:
- The wrapper was `gap-6 p-6 sm:p-8`. From 768 px that has always meant `gap-6 p-8`, so `md:gap-6 md:p-8` renders exactly the same there.
- Below md it is `p-0 gap-0`. That includes 640–767 px, which is phone width in this spec.
- The heading's `hidden md:block` is `block` from md, which is what a plain `div` was.

Intermediate state: until Task 8 lands, a phone shows the old stacked explorer clipped to the screen, and the tree and details are unreachable. Nothing deploys before Task 10.

- [ ] **Step 1: The page root.** Edit old:

```tsx
  return (
    <div className="flex flex-1 flex-col">
```

  New:

```tsx
  return (
    // Phones: exactly AppShell's column tall, never taller (see the wrapper).
    <div className="flex flex-1 flex-col max-md:min-h-0 max-md:overflow-hidden">
```

- [ ] **Step 2: The title, the wrapper and the heading.** Edit old:

```tsx
      <AppHeader />
      <div className="flex w-full flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
```

  New:

```tsx
      <AppHeader title="Wine map" />
      {/* Phones (below md; spec 2026-09-25 D1, D3): one fixed screen. This
          wrapper is exactly what is left under the header, and under the
          active-tasting strip when there is one, and it never scrolls, so a
          drag on the map is always the map's. The height is a flex chain, not
          a calc: AppShell's column is h-dvh, and this page's root and this
          wrapper are flex-1 min-h-0 inside it, so a strip that appears simply
          takes its share (a calc(100dvh - header) would overflow by the
          strip). AppShell itself is untouched. From md it is laid out exactly
          as before: sm:p-8 has always applied there. */}
      <div
        data-map-page=""
        className="flex w-full flex-1 flex-col max-md:min-h-0 max-md:overflow-hidden md:gap-6 md:p-8"
      >
        <div className="hidden md:block">
```

  Leave the `h1`, the subtitle and `<TileWineMapExplorer initialPlaceKey={place ?? null} />` exactly as they are.

- [ ] **Step 3: Check.**
  - Run: `cd /c/Users/Public/repos/blindtastingapp-map && npx tsc --noEmit && npx eslint src/app/knowledge/map/page.tsx && git diff --stat`
  - Expected: clean, and only `page.tsx` changed.

- [ ] **Step 4: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-map && git add src/app/knowledge/map/page.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): the map page is one fixed screen on phones" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The explorer's phone layout (`tile-wine-map-explorer.tsx`)

**Files:**
- Modify: `src/app/knowledge/map/tile-wine-map-explorer.tsx` (1,087 lines at base). The line numbers below are from the base; use the quoted anchors.
  - the lucide import (13-23) and the imports after line 86;
  - the dynamic placeholder (94);
  - the phone state after the Full view Escape effect (321);
  - the map and tree selection wrappers after `select` (498);
  - the deep-link branch (540-541);
  - `sheetTitle`, `renderTree` and `detailsBody` after `const article` (638-641);
  - the outer div (644-649), the row (652), the tree slot (659-661 and 687-716);
  - the map Card (733-744) and the filter row (749-803);
  - the controls block (808-821) and the map wrapper (826-831);
  - TileWineMap's `onSelect` (846);
  - the details Card (871-874 and 935-1059);
  - the spacer (1075-1077) and the new phone sheets.

**Interfaces:**
- Consumes:
  - `useIsPhone()` (Task 2);
  - `initialSheet` and `sheetReducer` (Task 1);
  - `MapBottomSheet({ sheet, onEvent, title, detailsKey, explore, details })` (Task 4);
  - `MapOptionsSheet({ open, onOpenChange, mode, onModeChange, status, onRetry })` (Task 5);
  - `WineMapTree`'s new `active` and `rootsCollapsed` props (Task 3).
- Produces: the phone layout. No export changes.

This task follows the four "Tablets and desktop" rules in Global Constraints. The existing file already adjusts state during render (the deep link, lines 531-543); the two new render-time adjustments use the same pattern. No unit test: the rules it wires are Task 1's reducer. Types, lint, the build and Task 10's browser run check the rest.

- [ ] **Step 1: Imports and the dynamic placeholder.**
  - Edit old:

```tsx
  Layers,
  PanelLeftClose,
```

  New:

```tsx
  Layers,
  ListFilter,
  PanelLeftClose,
```

  - Edit old:

```tsx
  PanelRightOpen,
  Sparkles,
```

  New:

```tsx
  PanelRightOpen,
  SlidersHorizontal,
  Sparkles,
```

  - Edit old `import { Card, CardContent } from "@/components/ui/card";` → new:

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
```

  - Edit old `import { ArchetypeModal } from "@/components/wset/archetype-modal";` → new:

```tsx
import { ArchetypeModal } from "@/components/wset/archetype-modal";
import { useIsPhone } from "@/lib/use-is-phone";
import { initialSheet, sheetReducer } from "@/lib/wine-map/sheet-state";
import { MapBottomSheet } from "./map-bottom-sheet";
import { MapOptionsSheet } from "./map-options-sheet";
```

  - Edit old `      <div className="h-[70vh] min-h-[420px] animate-pulse rounded-lg border bg-muted" />` → new `      <div className="h-[70vh] min-h-[420px] animate-pulse rounded-lg border bg-muted max-md:h-full max-md:min-h-0" />`.

- [ ] **Step 2: The phone state.** Edit old:

```tsx
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);
```

  New:

```tsx
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Phones (below md; spec 2026-09-25) get one fixed screen: a toolbar row,
  // the map filling the rest, and a bottom sheet holding the hierarchy and the
  // details. `max-md:` classes shape it; `isPhone` only decides which elements
  // exist. An element phones must not have is replaced by null IN PLACE, so
  // the map's parent chain is the same at every width and crossing md (a
  // rotated phone) never remounts MapLibre; it also carries `max-md:hidden`,
  // because the server snapshot is false and SSR renders the md+ elements. The
  // tree and the details each render in exactly one place.
  const isPhone = useIsPhone();
  // The sheet's snap and tab (lib/wine-map/sheet-state). Never persisted and
  // never in the URL: a load with ?place= starts on Details at half.
  const [sheet, dispatchSheet] = useReducer(
    sheetReducer,
    initialPlaceKey,
    initialSheet,
  );
  // The phone's Map options sheet: the One|All switch and its status line.
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Full view is lg-only and Map options phone-only. A viewport that crosses
  // md leaves whichever it can no longer show (Full view below md would have
  // no way out). Adjusted during render, like the deep link below.
  if (isPhone && expanded) setExpanded(false);
  if (!isPhone && optionsOpen) setOptionsOpen(false);
```

- [ ] **Step 3: The map and tree selection wrappers.** Edit old:

```tsx
    [applyCachedSelection, selectedKey, supabase],
  );
```

  New:

```tsx
    [applyCachedSelection, selectedKey, supabase],
  );

  // Phones (spec D4): a tap on the map that selects a place, and a pick in the
  // Explore tree, open Details at half. The sheet opens even when select()
  // returns early (the place was already selected): the tap asked to read it.
  // Nearby and Labelling chips inside Details call plain select() and swap the
  // content in place. The ?debugPerf=1 probe's scripted selections use the
  // "map" source too, so a probe run on a phone opens Details like a real tap.
  const selectFromMap = useCallback(
    (key: string, source: "map" | "ui" = "ui") => {
      select(key, source);
      if (source === "map") dispatchSheet({ type: "mapTap" });
    },
    [select],
  );
  const pickFromTree = useCallback(
    (key: string) => {
      select(key);
      dispatchSheet({ type: "treePick" });
    },
    [select],
  );
```

- [ ] **Step 4: A deep link opens Details.** Edit old:

```tsx
      setSelectedKey(deepLink.select);
      setChipFocus(null);
```

  New:

```tsx
      setSelectedKey(deepLink.select);
      setChipFocus(null);
      // Phones: a link to a place opens its details (spec D4). The camera
      // flies as before; the sheet lies over the map and never resizes it.
      dispatchSheet({ type: "deepLink" });
```

- [ ] **Step 5: Build the tree body, the details body and the bar title once.** Edit old:

```tsx
  const article =
    context?.article && context.article.editorial_status !== "PLACEHOLDER"
      ? context.article
      : null;
```

  New (the `article` lines kept, then three new constants):

```tsx
  const article =
    context?.article && context.article.editorial_status !== "PLACEHOLDER"
      ? context.article
      : null;

  // The phone sheet bar's label: the place whose details are showing.
  const sheetTitle =
    context && context.place.key === selectedKey
      ? english
        ? englishName(context.place.name)
        : context.place.name
      : selectedKey && contextState === "loading"
        ? "Loading…"
        : "Explore the map";

  // The hierarchy's body. The md+ tree card and the phone sheet's Explore tab
  // both render it, and only one of them exists at a time. `phone` carries the
  // phone tree's options: countries start collapsed like a menu, and the
  // selected row is revealed each time the tab is shown.
  const renderTree = (
    onPick: (key: string) => void,
    phone?: { active: boolean },
  ) =>
    treeLoad.state === "failed" ? (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border text-center"
      >
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load the place list.
        </p>
        <button
          type="button"
          onClick={() => dispatchTree({ type: "retry" })}
          className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Retry
        </button>
      </div>
    ) : tree === null ? (
      <div className="h-full animate-pulse rounded-md bg-muted" />
    ) : (
      <WineMapTree
        roots={tree}
        selectedKey={selectedKey}
        onSelect={onPick}
        filterKeys={visibleKeys}
        english={english}
        onPrefetch={prefetch}
        active={phone?.active}
        rootsCollapsed={phone !== undefined}
      />
    );

  // The place details. The md+ details card and the phone sheet's Details tab
  // both render this same body, and only one of them exists at a time.
  const detailsBody = !selectedKey ? (
    <p className="text-sm text-muted-foreground">
      Pick a region on the map or in the hierarchy to explore it.
    </p>
  ) : contextState === "loading" ? (
    <p className="text-sm text-muted-foreground">Loading…</p>
  ) : contextState === "error" ? (
    <p className="text-sm text-muted-foreground">
      Details are unavailable right now. Try another place or reload.
    </p>
  ) : contextState === "missing" || !context ? (
    <p className="text-sm text-muted-foreground">
      That place isn&apos;t on the map yet.
    </p>
  ) : (
    <>
      <div>
        <Badge variant="secondary" className="mb-1.5">
          {KIND_LABELS[context.place.kind] ?? context.place.kind}
        </Badge>
        <h2 className="font-heading text-xl font-semibold">
          {english ? englishName(context.place.name) : context.place.name}
        </h2>
      </div>
      {archetypes.length > 0 ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wine className="size-3.5" />
            Typical wine
          </p>
          <div className="flex flex-col gap-1.5">
            {archetypes.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setOpenArchetype(a)}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-muted/60"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Wine
                    className="size-4 shrink-0"
                    style={{ color: WINE_COLOUR_HEX[a.colour] ?? "#8A8A85" }}
                  />
                  <span className="truncate">{a.name}</span>
                </span>
                <span className="text-muted-foreground">→</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {article ? (
        <>
          {article.description ? (
            <p className="text-sm text-muted-foreground">
              {article.description}
            </p>
          ) : null}
          <dl className="flex flex-col gap-2 text-sm">
            {article.climate ? (
              <div className="flex gap-2">
                <Thermometer className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Climate
                  </dt>
                  <dd>{article.climate}</dd>
                </div>
              </div>
            ) : null}
            {article.soils ? (
              <div className="flex gap-2">
                <Layers className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Soils
                  </dt>
                  <dd>{article.soils}</dd>
                </div>
              </div>
            ) : null}
            {article.grape_varieties && context.grapes.length === 0 ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Main grape varieties
                </dt>
                <dd>{article.grape_varieties}</dd>
              </div>
            ) : null}
            {article.wine_styles && context.styles.length === 0 ? (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Wine styles
                </dt>
                <dd>{article.wine_styles}</dd>
              </div>
            ) : null}
          </dl>
          {article.key_facts.length > 0 ? (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="size-3.5" />
                Key facts
              </p>
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {article.key_facts.map((fact, i) => (
                  <li key={i}>{fact}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Profile being curated — check back soon.
        </p>
      )}
      <KnowledgeSections
        context={context}
        onSelect={select}
        styleRows={styleRows}
        onPrefetch={prefetch}
      />
    </>
  );
```

  The fragment inside `detailsBody` is today's lines 951-1057, verbatim apart from indentation. Compare it against the original before Step 6 deletes the original.

- [ ] **Step 6: Replace the two inline bodies with the shared ones.** This script is CRLF-aware. It refuses to run unless each start line is unique and each end is found:

```bash
cd /c/Users/Public/repos/blindtastingapp-map && node - <<'EOF'
const fs = require("fs");
const file = "src/app/knowledge/map/tile-wine-map-explorer.tsx";
let src = fs.readFileSync(file, "utf8");
const nl = src.includes("\r\n") ? "\r\n" : "\n";
// Removes the block from `first` through `last` (the `last` line directly
// followed by `after`) and puts `call` in its place.
function moveOut({ first, last, after, call }) {
  const head = first + nl;
  const start = src.indexOf(head);
  if (start < 0 || src.indexOf(head, start + 1) >= 0) {
    throw new Error("first line missing or not unique: " + first);
  }
  const end = src.indexOf(last + nl + after, start);
  if (end < 0) throw new Error("block end not found after: " + first);
  src = src.slice(0, start) + call + nl + src.slice(end + last.length + nl.length);
}
moveOut({
  first: '                {treeLoad.state === "failed" ? (',
  last: "                )}",
  after: "              </div>" + nl + "            </CardContent>",
  call: "                {renderTree(select)}",
});
moveOut({
  first: "            {!selectedKey ? (",
  last: "            )}",
  after: "            </div>" + nl + "          </CardContent>",
  call: "            {detailsBody}",
});
fs.writeFileSync(file, src);
console.log("moved both blocks");
EOF
grep -n "renderTree(select)\|{detailsBody}\|Pick a region on the map\|<WineMapTree" src/app/knowledge/map/tile-wine-map-explorer.tsx
```

  Expected: the script prints `moved both blocks`, and grep prints exactly four lines:
  - `{renderTree(select)}` inside the tree card;
  - `{detailsBody}` inside the details card;
  - one `Pick a region on the map` (inside `detailsBody`);
  - one `<WineMapTree` (inside `renderTree`).

- [ ] **Step 7: The column chain, the row and the tree slot.**
  - Edit old:

```tsx
          ? "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background p-4"
          : "flex flex-col gap-4"
```

  New:

```tsx
          ? "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background p-4"
          : // Phones: the screen under the header. Relative, so the bottom
            // sheet sits inside it; flex-1 min-h-0 carries the page's definite
            // height on down to the map (the height chain, spec D3).
            "flex flex-col gap-4 max-md:relative max-md:min-h-0 max-md:flex-1 max-md:gap-0 max-md:overflow-hidden"
```

  - Edit old `` className={`flex flex-col gap-4 xl:flex-row xl:items-stretch ${ `` → new `` className={`flex flex-col gap-4 max-md:min-h-0 max-md:flex-1 max-md:gap-0 xl:flex-row xl:items-stretch ${ ``.
  - Edit old:

```tsx
        {treeOpen ? (
          <Card
            className={`order-3 xl:order-1 xl:w-[280px] xl:shrink-0 ${
```

  New:

```tsx
        {/* Phones: the tree lives in the bottom sheet's Explore tab. */}
        {isPhone ? null : treeOpen ? (
          <Card
            className={`order-3 max-md:hidden xl:order-1 xl:w-[280px] xl:shrink-0 ${
```

- [ ] **Step 8: The map Card and its content.**
  - Edit old:

```tsx
            // shrinking below lg and sizes from the map's fixed height.
            expanded
              ? "order-1 min-w-0 shrink-0 overflow-hidden xl:order-2 xl:flex-1 xl:shrink"
              : "order-1 min-w-0 flex-1 overflow-hidden xl:order-2"
```

  New:

```tsx
            // shrinking below lg and sizes from the map's fixed height.
            // Phones: no card chrome, and flex-1 min-h-0 so the map fills the
            // screen under the toolbar (the height chain, spec D3).
            expanded
              ? "order-1 min-w-0 shrink-0 overflow-hidden xl:order-2 xl:flex-1 xl:shrink"
              : "order-1 min-w-0 flex-1 overflow-hidden max-md:min-h-0 max-md:gap-0 max-md:rounded-none max-md:bg-transparent max-md:py-0 max-md:ring-0 xl:order-2"
```

  - Edit old `` className={`pt-4 ${expanded ? "flex h-full min-h-0 flex-col" : ""}`} `` → new `` className={`pt-4 max-md:flex max-md:min-h-0 max-md:flex-1 max-md:flex-col max-md:px-0 max-md:pt-0 ${expanded ? "flex h-full min-h-0 flex-col" : ""}`} ``.

- [ ] **Step 9: The filter row becomes the phone toolbar.**
  - Edit old:

```tsx
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Filter
              </span>
              <div className="w-64 max-w-full">
```

  New:

```tsx
            {/* Phones: this row is the whole toolbar (spec D2): one line of
                44 px targets, the grape Filter, Local|English, Map options. */}
            <div className="mb-2 flex flex-wrap items-center gap-2 max-md:mb-0 max-md:shrink-0 max-md:flex-nowrap max-md:px-3 max-md:py-1.5">
              {isPhone ? (
                <ListFilter aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              ) : null}
              <span className="text-xs font-medium text-muted-foreground max-md:sr-only">
                Filter
              </span>
              <div className="w-64 max-w-full max-md:w-auto max-md:min-w-0 max-md:flex-1">
```

  - Edit old:

```tsx
                  placeholder={
                    grapeOptions.length === 0
                      ? "Loading grapes…"
                      : "Grape — only places using it"
                  }
                  disabled={grapeOptions.length === 0}
                  allowClear
                />
```

  New:

```tsx
                  placeholder={
                    grapeOptions.length === 0
                      ? "Loading grapes…"
                      : isPhone
                        ? "Grape"
                        : "Grape — only places using it"
                  }
                  disabled={grapeOptions.length === 0}
                  allowClear
                  triggerClassName={isPhone ? "h-11" : undefined}
                />
```

  - Edit old `              {visibleKeys ? (` → new:

```tsx
              {/* Phones keep the toolbar to one line; the map itself shows
                  what the filter keeps. */}
              {visibleKeys && !isPhone ? (
```

  - Edit old `              <div className="ml-auto flex items-center rounded-md border border-border p-0.5 text-xs">` → new `              <div className="ml-auto flex items-center rounded-md border border-border p-0.5 text-xs max-md:shrink-0">`.
  - The Local and English buttons share one class string. Use the Edit tool with `replace_all: true`:
    - old `                    "rounded px-2 py-1 font-medium transition-colors",`
    - new `                    "rounded px-2 py-1 font-medium transition-colors max-md:min-h-11",`
  - Edit old:

```tsx
                  English
                </button>
              </div>
            </div>
```

  New:

```tsx
                  English
                </button>
              </div>
              {isPhone ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  aria-label="Map options"
                  aria-haspopup="dialog"
                  aria-expanded={optionsOpen}
                  onClick={() => setOptionsOpen(true)}
                  className="size-11 shrink-0"
                >
                  <SlidersHorizontal />
                </Button>
              ) : null}
            </div>
```

- [ ] **Step 10: The controls block, the map wrapper and the map's `onSelect`.**
  - Edit old:

```tsx
            <div className="mb-3 flex shrink-0 flex-col gap-2">
              <MapDetailControls
                mode={detail}
                onModeChange={setDetail}
                status={detailLine}
                onRetry={() => dispatchTree({ type: "retry" })}
              />
              <CountryChips
                chips={chips}
                markedKey={markedChip}
                loading={treeLoad.state === "loading"}
                onChoose={chooseChip}
              />
            </div>
```

  New:

```tsx
            {/* Phones: no chips, and the switch with its status line lives in
                the Map options sheet (one role="status" region, never two). */}
            {isPhone ? null : (
              <div className="mb-3 flex shrink-0 flex-col gap-2 max-md:hidden">
                <MapDetailControls
                  mode={detail}
                  onModeChange={setDetail}
                  status={detailLine}
                  onRetry={() => dispatchTree({ type: "retry" })}
                />
                <CountryChips
                  chips={chips}
                  markedKey={markedChip}
                  loading={treeLoad.state === "loading"}
                  onChoose={chooseChip}
                />
              </div>
            )}
```

  - Edit old:

```tsx
                  ? "h-[calc(100dvh-12rem)] xl:h-auto xl:min-h-0 xl:flex-1"
                  : "h-[70vh] min-h-[420px]"
```

  New:

```tsx
                  ? "h-[calc(100dvh-12rem)] xl:h-auto xl:min-h-0 xl:flex-1"
                  : // Phones: the rest of the screen. A definite height from
                    // the page's flex chain, never a percentage of an
                    // indefinite parent (the "map collapsed to zero" trap).
                    "h-[70vh] min-h-[420px] max-md:h-auto max-md:min-h-0 max-md:flex-1"
```

  - Edit old:

```tsx
                  onSelect={select}
                  visibleKeys={visibleKeys}
```

  New:

```tsx
                  onSelect={isPhone ? selectFromMap : select}
                  visibleKeys={visibleKeys}
```

- [ ] **Step 11: The details Card, the spacer and the phone sheets.**
  - Edit old:

```tsx
        {detailsOpen ? (
        <Card
          className={cn(
            "xl:order-3 xl:w-[320px] xl:shrink-0",
```

  New:

```tsx
        {/* Phones: the details live in the bottom sheet's Details tab. */}
        {detailsOpen && !isPhone ? (
        <Card
          className={cn(
            "max-md:hidden xl:order-3 xl:w-[320px] xl:shrink-0",
```

  - Edit old:

```tsx
      {/* Reserve room so the frozen mobile sheet's bar never hides the last
          of the page content beneath it. */}
      <div aria-hidden className="h-20 xl:hidden" />
```

  New:

```tsx
      {/* Reserve room so the frozen mobile sheet's bar never hides the last
          of the page content beneath it. Tablets only: a phone has no page to
          scroll, and its sheet bar lies over the map. */}
      {isPhone ? null : <div aria-hidden className="h-20 max-md:hidden xl:hidden" />}
      {isPhone ? (
        <MapBottomSheet
          sheet={sheet}
          onEvent={dispatchSheet}
          title={sheetTitle}
          detailsKey={selectedKey}
          explore={
            <div className="h-full">
              {renderTree(pickFromTree, {
                active: sheet.snap !== "closed" && sheet.tab === "explore",
              })}
            </div>
          }
          details={detailsBody}
        />
      ) : null}
      {isPhone ? (
        <MapOptionsSheet
          open={optionsOpen}
          onOpenChange={setOptionsOpen}
          mode={detail}
          onModeChange={setDetail}
          status={detailLine}
          onRetry={() => dispatchTree({ type: "retry" })}
        />
      ) : null}
```

- [ ] **Step 12: Types, lint, the full suite and the build.**
  - Run: `cd /c/Users/Public/repos/blindtastingapp-map && npx tsc --noEmit && npx eslint src/app/knowledge/map/tile-wine-map-explorer.tsx && npx vitest run && npx next build`
  - Expected: tsc and eslint clean; vitest 180 files, 0 failures (base 178 plus Tasks 1 and 2); the build succeeds.
  - An eslint `react-hooks` finding on the two render-time adjustments means they were written unconditionally. They must stay inside their `if`s, like the deep link's.

- [ ] **Step 13: Audit the md+ output against the Global Constraints rules.**
  - Run: `cd /c/Users/Public/repos/blindtastingapp-map && git diff src/app/knowledge/map/tile-wine-map-explorer.tsx | grep '^-' | grep -v '^---'`
  - Every removed line must be one of these:
    - a className line whose replacement keeps every old token and adds only `max-md:` tokens;
    - `{treeOpen ? (`, `{detailsOpen ? (`, `{visibleKeys ? (` or the spacer line (each now gated on `isPhone`);
    - the `: "Grape — only places using it"` placeholder branch;
    - `onSelect={select}` on the TileWineMap;
    - the controls block (re-indented inside `isPhone ? null :`);
    - the two moved bodies (tree lines 688-715 and details lines 935-1059), now in `renderTree` and `detailsBody`.
  - Nothing else may be removed. Fix anything else before committing.

- [ ] **Step 14: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-map && git add src/app/knowledge/map/tile-wine-map-explorer.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): the phone layout of the wine map explorer" -m "Toolbar row, a definite-height map, and a bottom sheet with Explore and Details tabs below md; tablets and desktop render as before." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`:
  - the "One country | All countries" bullet, lines 1543-1552;
  - a new top-level bullet inserted directly before `- **Wine Map dark mode** (2026-09-19, spec`, at line 1643.

**Interfaces:**
- Consumes: nothing. Produces: documentation only.

- [ ] **Step 1: The toolbar sentence.** Edit old:

```md
  - **One country | All countries** (owner, 2026-09-23). Nothing new sits on
    the map canvas. Two toolbar rows sit under the filter bar:
```

  New:

```md
  - **One country | All countries** (owner, 2026-09-23). Nothing new sits on
    the map canvas. From md, two toolbar rows sit under the filter bar (phones
    reach the switch through the Map options sheet instead and get no chips;
    see "Wine map on the phone" below):
```

  Then edit old:

```md
      a grape filter. They scroll with the scroller's own `scrollTo`, never
      `scrollIntoView`, because the page column is itself a scroll container.
```

  New:

```md
      a grape filter. They scroll with the scroller's own `scrollTo`, never
      `scrollIntoView`, because the page column is itself a scroll container
      (md and up; phones render no chips).
```

- [ ] **Step 2: The new bullet.** Insert this block immediately before the line `- **Wine Map dark mode** (2026-09-19, spec`, and keep that line:

```md
- **Wine map on the phone** (2026-09-25; spec
  `docs/superpowers/specs/2026-09-25-phone-map-layout-design.md`, plan
  `docs/superpowers/plans/2026-09-25-phone-map-layout.md`). Owner: on the
  phone you want to pinch the map, not scroll the page. Below md
  (`(width < 48rem)`, exactly what `max-md:` compiles to) `/knowledge/map` is
  one fixed screen: the header (titled "Wine map"; the page heading is
  `hidden md:block`), the active-tasting strip when there is one, one toolbar
  row (grape Filter, Local|English, a "Map options" button), the map filling
  the rest, and a bottom sheet over the map's bottom edge. The page never
  scrolls; only the sheet's panels do. Tablets (md–xl) and desktop are
  unchanged.
  - **The height is a flex chain from AppShell's `h-dvh` column, never a
    calc.** The page root and the `data-map-page` wrapper are flex-1
    `max-md:min-h-0 max-md:overflow-hidden` columns; the explorer column, its
    row, the map Card and its CardContent are each `max-md:min-h-0
    max-md:flex-1`; the map wrapper is `max-md:min-h-0 max-md:flex-1` and
    TileWineMap stays `h-full`. Every level has a definite size, which is
    what the two earlier "map collapsed to zero" bugs lacked. A
    `calc(100dvh - header)` would overflow by the strip whenever the strip
    shows (it can appear on a poll); the flex chain gives the strip its
    share. AppShell's "the content column is the scroll container" rule is
    untouched: on phones this page just never overflows that column.
  - **CSS shapes it, `useIsPhone()` decides what exists**
    (`src/lib/use-is-phone.ts`: `useSyncExternalStore`, server snapshot
    false). In the explorer an existing class string only gains `max-md:`
    utilities; an element phones must not have is `null` IN PLACE when
    `isPhone` (its slot kept, so the map's React parent chain is the same at
    every width and crossing md, e.g. a rotated phone, never remounts
    MapLibre) and also carries `max-md:hidden`, so the server-rendered first
    paint never shows it; a phone-only element renders only when `isPhone`.
    The tree body and the details body are built once (`renderTree`,
    `detailsBody`) and rendered in exactly one place. Keep all four rules for
    any new explorer element.
  - **The sheet** (`map-bottom-sheet.tsx`; its state is the pure
    `sheetReducer` in `src/lib/wine-map/sheet-state.ts`). Closed: a 56 px bar
    (drag handle, Explore | Details tabs, the place name or "Explore the
    map", a chevron). Half: `50dvh`, the map interactive above. Full: up to
    the header. Not modal. A tab opens half on it, and the shown tab again
    closes. A map tap (TileWineMap's source "map", which the `?debugPerf=1`
    probe's scripted selects also use), a tree pick and a `?place=` link open
    Details at half; a load with `?place=` starts there. Nearby and Labelling
    chips swap Details in place, and Details scrolls back to its top on a new
    place. The chevron, Escape or a swipe down closes; Escape counts only
    while focus is inside the sheet, so a portaled GrapeModal's Escape stays
    its own. A swipe up goes full. A swipe is ≥ 32 px between pointerdown
    and a window-level pointerup, and the click it would end in is swallowed
    (a keyboard click, `detail === 0`, never is). Nothing is persisted or put
    in the URL. Both panels stay mounted while hidden, so the tree's search
    and expansion survive tab switches.
  - **Scroll containers in the sheet.** Explore: the tree's own `<ul>` (the
    panel gives `WineMapTree` a definite height, so the search box stays
    pinned); its nearest-scrollable-ancestor walk finds that list, never the
    page. Details: the panel itself. `WineMapTree`'s phone-only props are
    `active` (false while its tab is hidden; turning true re-reveals the
    selected row, which a hidden list cannot scroll to) and `rootsCollapsed`
    (the phone list opens as the list of countries, like a menu). Below md
    its rows, search box and level buttons are 44 px, and its search field is
    16 px (iOS zooms the whole page into a smaller focused field).
  - **Map options** (`map-options-sheet.tsx`): a phone bottom Dialog holding
    `MapDetailControls` unchanged. Phones render neither the toolbar's
    switch and status row nor the chips, so the `role="status"` region
    exists only inside this sheet while it is open: one region, never two.
  - **Canvas offsets** (`tile-wine-map.tsx`). The Legend is
    `max-md:bottom-16`, and MapLibre's bottom-right corner (the compact
    attribution) is lifted by
    `max-md:[&_.maplibregl-ctrl-bottom-right]:bottom-[54px]!`. The `!` is
    required: maplibre-gl.css is unlayered, and an unlayered rule beats every
    layered Tailwind utility whatever its specificity.
  - **Known.** Tree picks and deep links still fit the place to the whole
    canvas (padding 48), so under the half sheet the flown place's centre
    sits below the sheet's top edge; camera padding for the sheet would be a
    TileWineMap change this spec left out. On a hard load the server renders
    the md+ elements (hidden below md by `max-md:hidden`), and a phone swaps
    in its toolbar button and sheet right after hydration; an in-app link
    mounts straight into the phone layout. In the Browser pane, resize and
    then reload: `useIsPhone` follows a live resize, but the legend's open
    state is decided once at mount.
```

- [ ] **Step 3: Check.**
  - Run: `cd /c/Users/Public/repos/blindtastingapp-map && git diff --stat CLAUDE.md`
  - Expected: `CLAUDE.md` is the only file changed, with about 80 insertions and 3 deletions.
  - Skim `git diff CLAUDE.md`. The new bullet sits right before "Wine Map dark mode", indented like its neighbours.

- [ ] **Step 4: Commit.**

```bash
cd /c/Users/Public/repos/blindtastingapp-map && git add CLAUDE.md && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "docs: the phone wine map in CLAUDE.md" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Verification and production deploy (main session only)

**Files:**
- Evidence: JSON and screenshots go to the session scratchpad, written `$SCRATCH` below. Every command block sets it:
  `SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad`.
- Modify: `CLAUDE.md`, the "Wine map on the phone" bullet (Step 11, the measured numbers).
- Push: remote `master`, fast-forwarded to the branch head.

**Interfaces:**
- Consumes:
  - everything Tasks 1-9 built;
  - `$SCRATCH/mint.mjs <origin> <next>`, which prints a signed-in demo URL with no password;
  - `?debugClick=1`, which exposes `window.__wineMap` (assigned in the map's `onLoad`, so a remount assigns a new object);
  - `?debugPerf=1`: the probe's Run test and Copy results.
- Produces: the production deploy.

Run only by the main session. An implementer subagent stops before this task. Keep the Browser pane visible throughout: a hidden pane never hydrates (CLAUDE.md dev gotcha).

**Two helper snippets.** Steps 4-8 use them through the Browser pane's `javascript_tool`.

`PHONE` measures the phone layout:

```js
(() => {
  const wrap = document.querySelector("[data-map-page]");
  const column = wrap.parentElement.parentElement; // wrapper → page root → AppShell's column
  const rect = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) };
  };
  const sheet = document.querySelector('section[aria-label="Map panels"]');
  const legend = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Legend");
  return JSON.stringify({
    viewport: [innerWidth, innerHeight],
    columnScroll: [column.scrollHeight, column.clientHeight, column.scrollTop],
    page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    header: rect(document.querySelector("header")),
    toolbar: rect(document.querySelector('button[aria-label="Map options"]')?.parentElement),
    canvas: rect(document.querySelector(".maplibregl-canvas")),
    sheet: rect(sheet),
    shownTab: document.querySelector('[role="tab"][aria-expanded="true"]')?.textContent ?? null,
    legendFromBottom: legend ? Math.round(innerHeight - legend.parentElement.getBoundingClientRect().bottom) : null,
    attribution: getComputedStyle(document.querySelector(".maplibregl-ctrl-bottom-right")).bottom,
    headingShown: document.querySelector("h1")?.offsetParent !== null,
    chips: Boolean(document.querySelector('[role="toolbar"][aria-label="Countries"]')),
    statusInPage: wrap.querySelectorAll('[role="status"]').length,
    under44: [...wrap.querySelectorAll('button, [role="tab"]')]
      .filter((el) => el.offsetParent !== null && !el.closest(".maplibregl-ctrl") && el.textContent.trim() !== "Legend" && !el.closest('[role="tabpanel"][id$="panel-details"]'))
      .map((el) => [el.getAttribute("aria-label") || el.textContent.trim().slice(0, 24), Math.round(el.getBoundingClientRect().height)])
      .filter(([, h]) => h < 44),
  });
})()
```

`DESK` records the md+ layout, for comparing against the live site:

```js
(() => {
  const box = (el) => {
    const b = el.getBoundingClientRect();
    return [b.top, b.left, b.width, b.height].map((v) => Math.round(v));
  };
  const all = (selector) => [...document.querySelectorAll(selector)].map(box);
  const column = document.querySelector("h1").closest(".overflow-y-auto");
  return JSON.stringify({
    viewport: [innerWidth, innerHeight],
    column: [column.scrollHeight, column.clientHeight],
    header: all("header"),
    h1: all("h1"),
    cards: all('[data-slot="card"]'),
    canvas: all(".maplibregl-canvas"),
    detail: all('[role="radiogroup"][aria-label="Map detail"]'),
    chips: all('[role="toolbar"][aria-label="Countries"]'),
    search: all('input[type="search"]'),
    phoneOnly: document.querySelectorAll('section[aria-label="Map panels"], button[aria-label="Map options"]').length,
  });
})()
```

- [ ] **Step 1: Branch gate.**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-map
git fetch origin
git status --short
git log --oneline origin/master..HEAD
git rev-parse origin/master > "$SCRATCH/phone-map-pre-deploy.txt"
npx vitest run
npx tsc --noEmit
npx eslint src/lib/wine-map/sheet-state.ts src/lib/wine-map/sheet-state.test.ts src/lib/use-is-phone.ts src/lib/use-is-phone.test.ts src/app/knowledge/map/wine-map-tree.tsx src/app/knowledge/map/map-bottom-sheet.tsx src/app/knowledge/map/map-options-sheet.tsx src/app/knowledge/map/map-detail-controls.tsx src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/page.tsx src/app/knowledge/map/tile-wine-map-explorer.tsx
npx next build
```

  Expected:
  - `git status` shows no modified tracked file.
  - `git log` lists the spec, the plan and Tasks 1-9.
  - vitest reports 180 files and 0 failures.
  - tsc and eslint are clean, and `next build` succeeds.

- [ ] **Step 2: Baselines from the live site, BEFORE the deploy.**
  - Run `node "$SCRATCH/mint.mjs" https://blindrapp.vercel.app "/knowledge/map?debugClick=1"` and open the printed URL.
  - At 1440x900 and at 768x1024 (`resize_window`, then reload), wait for idle and run `DESK`. Save the results as `$SCRATCH/phone-live-desk-1440.json` and `$SCRATCH/phone-live-desk-768.json`.
  - Repeat both sizes with `&place=france.bourgogne.cote-de-nuits.vosne-romanee.la-tache`, saving `-place` variants.
  - At 1440x900 in light, screenshot the eight reference views (Phase 2's set), each reached with `window.__wineMap.jumpTo({ center, zoom })` and idle:
    - France `[2.4, 46.6]` z5.5
    - Bourgogne `[4.84, 47.05]` z9
    - Vosne-Romanée `[4.955, 47.16]` z13, loaded with the `la-tache` place above
    - Colmar `[7.36, 48.08]` z9
    - Mosel `[7.07, 49.92]` z12
    - Champagne `[3.95, 49.04]` z10
    - Toscana `[11.25, 43.35]` z8
    - Baden `[8.2, 48.6]` z6
  - Use Phase 2's snapshot and hash tooling in `$SCRATCH` (`parity.mts`, `snap-*`) if convenient.

- [ ] **Step 3: The local production server and a session.**
  - Start the worktree's `start` launch configuration with `preview_start` (`npm run start`, port 3000).
  - `.claude/launch.json` is tracked. If port 3000 is taken, add a temporary `start-3100` entry (`"runtimeArgs": ["run", "start", "--", "-p", "3100"]`, port 3100) and run `git checkout -- .claude/launch.json` after this task. Never commit it.
  - Write the origin you used as `ORIGIN` below.
  - Run `node "$SCRATCH/mint.mjs" "$ORIGIN" "/knowledge/map?debugClick=1"` and open the URL.
  - Set `resize_window` to the `mobile` preset (375x812), then reload.

- [ ] **Step 4: The phone screen at 375x812, light.** On a load without `?place=`, wait for idle and run `PHONE`. Expected:
  - `viewport [375,812]`; `columnScroll [812,812,0]`, so the column never scrolls; `page [375,812]`.
  - `header {top 0, bottom 53}`.
  - `toolbar {top 53, bottom 115, height 62}`: one line holding the Filter icon, the combobox ("Grape"), Local|English and the options button.
  - `canvas {top 116, bottom 811, width 373, height 695}`.
  - `sheet {top 756, bottom 812, height 56}` and `shownTab null`.
  - `legendFromBottom 64`; `attribution "54px"`.
  - `headingShown false`; `chips false`; `statusInPage 0`; `under44 []`.
  - The header shows "Wine map" next to the burger, and the page shows no "Knowledge Explorer".
  - Swipe the page body above the map: nothing scrolls. Run `PHONE` again; `columnScroll[2]` is still 0.
  - If the canvas height is 0 or the column scrolls, stop: the height chain is broken. Compare each level against the table in "The height chain" with `getBoundingClientRect()`.

- [ ] **Step 5: Phone interactions at 375x812, light.**
  1. **Map tap opens Details.** Jump to France z5.5 (`window.__wineMap.jumpTo({ center: [2.4, 46.6], zoom: 5.5 })`), wait for idle, then find Bordeaux's screen point:

```js
(() => { const c = document.querySelector(".maplibregl-canvas").getBoundingClientRect(); const p = window.__wineMap.project([-0.58, 44.84]); return [Math.round(c.left + p.x), Math.round(c.top + p.y)]; })()
```

     `left_click` there. Expected from `PHONE`:
     - `sheet.top 406` (half) and `shownTab "Details"`;
     - the bar's title is the place's name;
     - the Details panel shows its badge, name and article.

  2. **The map still responds above the half sheet.** Note `window.__wineMap.getCenter()`, `left_click_drag` from (187, 250) to (100, 250), and read the centre again. It moved, and `columnScroll[2]` is still 0.
  3. **Explore.**
     - Tap **Explore**: `shownTab "Explore"`.
     - On a fresh load without `?place=`, the visible rows are the countries only. Every root row's chevron reads "Expand …".
     - Scroll the list (`document.querySelector('[id$="panel-explore"] ul').scrollTop = 300`). The column's `scrollTop` stays 0.
  4. **A tree pick flies and opens Details.**
     - Expand France and tap **Bourgogne** (or **Burgundy** in English).
     - Expected: the camera flies, the sheet is half on Details, and the title is the place.
     - After idle, measure the flown place against the sheet:

```js
(() => { const c = document.querySelector(".maplibregl-canvas").getBoundingClientRect(); const s = document.querySelector('section[aria-label="Map panels"]').getBoundingClientRect(); return { centreY: Math.round(c.top + c.height / 2), sheetTop: Math.round(s.top) }; })()
```

     - Expected about `{ centreY: 463, sheetTop: 406 }`. Screenshot it, and record how much of Bourgogne's outline shows above the sheet.
     - Repeat with a small place, **Pauillac**. If its outline is wholly hidden under the sheet, stop and report to the owner before deploying (Review Focus 1).
  5. **Tabs and the chevron.**
     - Tap **Details** (the shown tab): closed, `sheet.top 756`.
     - Tap **Explore**: half on Explore. Tap **Details**: half on Details.
     - The chevron closes the sheet. The chevron again opens half on Details.
  6. **Drags.** Read the tab centres whenever the bar moves:

```js
Object.fromEntries([...document.querySelectorAll('[role="tab"]')].map((t) => { const b = t.getBoundingClientRect(); return [t.textContent, [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]]; }))
```

     - Open half on Details. Then `left_click_drag` from (300, 430), on the half bar's title (the bar spans 406–462), to (300, 150): full, with `sheet.top 53`.
     - `left_click_drag` from (300, 80), on the full bar, to (300, 700): closed, with `sheet.top 756`.
     - A 10 px jitter on the closed bar: `left_click_drag` from the Details tab's centre to 10 px below it. It counts as a tap and opens half on Details.
     - Close it with the chevron. Then swipe from the Explore tab's centre (on the closed bar) up to y 200. Expected: full, and the shown tab is still Details, so the swipe did not also switch the tab.
     - Close with the chevron again.
  7. **Escape.**
     - Open half on Details and put focus inside the sheet with `document.querySelector('[role="tab"][aria-selected="true"]').focus()`. Press `Escape`: the sheet closes, and `document.activeElement.getAttribute("role")` is `"tab"`.
     - Escape counts only while focus is inside the sheet. With focus on the map or the page it does nothing, by design.
     - Open it again. Open a grape (a Grapes button in Details) and press `Escape`: only the GrapeModal closes, and the sheet stays at half.
     - Tap a **Typical wine** row, then press `Escape`: only the ArchetypeModal closes.
  8. **Nearby.**
     - Open `/knowledge/map?debugClick=1&place=france.bourgogne.cote-de-nuits.vosne-romanee` (a hard load).
     - Expected: the sheet starts half on Details with "Vosne-Romanée" as the title, and the camera flies there.
     - Scroll Details to its end and tap a Nearby chip. The sheet stays half on Details, the content swaps, and the Details panel's `scrollTop` is 0.
  9. **The grape filter.**
     - Tap the Filter combobox and pick **Pinot Noir**. The map filters, no "N places" badge appears, and the toolbar is still one 62 px line.
     - Clear it.
     - If the page zooms when the search field focuses, note it for the owner. iOS zooms into any input under 16 px, and the shared `CommandInput` is `text-sm` app-wide, which is out of this spec.
  10. **Map options.**
      - Tap **Map options**. A bottom sheet opens holding "One country" and "All countries" and the status line.
      - `document.querySelectorAll('[role="dialog"] [role="status"]').length === 1`, and `PHONE`'s `statusInPage` is 0.
      - The radios and the close button are at least 44 px tall.
      - Tap **All countries**: the status reads "Subregions for all countries. Uses more resources and can cause lag.", and `localStorage.getItem("wine-map-all-countries")` is set.
      - Tap **One country**, then close with X: the dialog is gone.
      - Nothing new appears in `localStorage`: `Object.keys(localStorage).filter((k) => k.startsWith("wine-map"))` lists only keys that existed before.
      - The URL carries only `?place=` (and the debug flags).

- [ ] **Step 6: 375x667, then dark at both sizes.**
  - `resize_window` 375x667, reload, and repeat Step 4. Expected: `canvas {top 116, bottom 666, height 550}` and `sheet {top 611}`; `columnScroll` equal; `under44 []`.
  - Repeat Step 5 items 1, 3, 6 and 10.
  - Then run `localStorage.setItem("blindr-theme", "dark")`, reload, and repeat Step 4 plus Step 5 items 1 and 10 at both sizes.
  - In dark, the shown tab and the checked radio are clearly told apart by their ring and weight.
  - Reset with `localStorage.setItem("blindr-theme", "light")`.

- [ ] **Step 7: The active-tasting strip (D1, D3).** At 375x812, inject a stand-in strip where `ActiveTastingBanner` renders, then run `PHONE`:

```js
(() => { const fake = document.createElement("section"); fake.id = "fake-strip"; fake.style.cssText = "height:80px;flex-shrink:0;background:#c3a25b"; document.querySelector("header").after(fake); return "ok"; })()
```

  Expected:
  - `columnScroll` is still equal and 0;
  - `toolbar.top 133`;
  - `canvas.height 615`, 80 less than before;
  - `sheet.bottom 812`.
  - A full sheet now tops out at 133.

  Then run `document.getElementById("fake-strip").remove()`.

- [ ] **Step 8: Crossing md without a remount (Review Focus 3).**
  - At 375x812 with `?debugClick=1`, run `window.__wineMap.__phoneMark = 1` and note `window.__wineMap.getCenter()`.
  - `resize_window` 812x375, with no reload. Expected:
    - the tablet layout: the tree card, the fixed Details bar, and the One|All row with chips;
    - no `section[aria-label="Map panels"]`;
    - `window.__wineMap.__phoneMark === 1` and the same centre.
  - `resize_window` back to 375x812, with no reload. Expected: the phone layout, the mark still 1, and the same centre.
  - Then reload at 375x812. Full view is lg-only, so it cannot be entered here.
  - Open Map options, then resize to 812x375. The dialog disappears, and on the way back it stays closed.

- [ ] **Step 9: Performance at 375x812 (D8).**
  - Open `/knowledge/map?debugPerf=1`. The probe sits inside the map, top-left, below the zoom control; its top must be at or below the toolbar's bottom (115).
  - Run 3 cold runs in One country: reload, idle, **Run test**, **Copy results**. Save them as `$SCRATCH/phone-one-375-<n>.json`.
  - Then tap **All countries** in Map options, jump to France z6, idle, and do 3 runs saved as `$SCRATCH/phone-all-375-<n>.json`.
  - The probe's Select rows use the map source, so each opens Details at half during the run. That is the real cost of a tap. Close the sheet or use **Copy results** to read the rows.
  - Expected: 0 long tasks on every row in every run. A long task on any row stops the deploy; report the row and its JSON.
  - Set **One country** again at the end.

- [ ] **Step 10: md+ parity (D7).**
  - On the local build at 1440x900 and 768x1024, reload and run `DESK` (and the `-place` variants). Each JSON must equal Step 2's live one field for field, with `phoneOnly 0`.
  - Screenshot the eight views at 1440 light. They match Step 2's.
  - At 1440, open Full view and back. Its layout matches the live one.
  - Any difference stops the deploy.

- [ ] **Step 11: The measured numbers in CLAUDE.md.** Add a sub-bullet `- **Measured** (production build, 2026-09-25).` at the end of the "Wine map on the phone" bullet. Quote:
  - Step 4's canvas at 375x812 and Step 6's at 375x667;
  - Step 5 item 4's `centreY` / `sheetTop` and what showed of Bourgogne and of Pauillac;
  - Step 9's long-task counts and worst frames (One and All, 3 runs each).

  Replace the "Known" sentence's "sits below the sheet's top edge" with the measured offset. Then commit:

```bash
cd /c/Users/Public/repos/blindtastingapp-map && git add CLAUDE.md && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "docs: measured phone map numbers in CLAUDE.md" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 12: Deploy.**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-map
git fetch origin
test "$(git rev-parse origin/master)" = "$(cat "$SCRATCH/phone-map-pre-deploy.txt")" && echo "master unchanged since Step 1"
git push origin phone-map:master
```

  Expected:
  - The script prints "master unchanged since Step 1".
  - The push is a fast-forward (`<old>..<new>  phone-map -> master`).
  - If the test prints nothing, or the push is rejected, `master` moved. Stop, and bring the owner in.
  - Never update the local `master` ref.

  Then wait for Vercel's production deployment of `$(git rev-parse HEAD)` to be Ready. Either check the dashboard, or run:
  - `gh api "repos/christianolin/blindtastingapp/deployments?sha=$(git rev-parse HEAD)" --jq '.[0].id'`, then
  - `gh api "repos/christianolin/blindtastingapp/deployments/<that id>/statuses" --jq '.[0].state'`, which should read `success`.

- [ ] **Step 13: Smoke test on the live site at 375x812.**
  - Run `node "$SCRATCH/mint.mjs" https://blindrapp.vercel.app "/knowledge/map?debugClick=1"`, open the URL, and use the `mobile` preset (then reload).
  - Expected:
    - `PHONE` matches Step 4;
    - a Bordeaux tap opens Details at half;
    - Explore shows the countries;
    - Map options switches One|All with its status line;
    - `?place=france.bourgogne.cote-de-nuits.vosne-romanee` opens half on Details.
  - At 1440x900, `DESK` equals Step 2's live baseline.
  - Read the console errors. Nothing new should appear. The single stale "useAddWine must be used within <AddWineProvider>" after a hash login is known and does not count.

- [ ] **Step 14: Only if Step 13 failed, revert as one commit and push.**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-map
git revert --no-commit "$(cat "$SCRATCH/phone-map-pre-deploy.txt")"..HEAD
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "revert: wine map phone layout" -m "Production smoke test failed; the previous map page is restored while it is diagnosed on the branch." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push origin phone-map:master
```

  Then repeat Step 13's first check on the live site: the old stacked page is back. Tell the owner which check failed. Re-landing means reverting this revert on the branch.

- [ ] **Step 15: The owner's iPhone check (morning).** Ask the owner to open the live `/knowledge/map` from the drawer (Learn → Wine map) and check:
  - pinching and panning move only the map, and the page never scrolls or zooms;
  - a region tap opens Details at half with the map still pinchable above;
  - Explore opens as the country list and scrolls inside the sheet;
  - a swipe on the bar goes full and back down;
  - Map options switches One|All.

  Also ask them to note anything about:
  - how much of a picked place stays visible above the half sheet;
  - the keyboard covering Explore's results while typing in its search;
  - the grape search zooming the page.

  Each of these is a follow-up that needs their call.
