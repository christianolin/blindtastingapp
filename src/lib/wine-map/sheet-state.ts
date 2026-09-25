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

/** The half snap's share of the layout viewport. map-bottom-sheet.tsx draws it
    as `h-[50dvh]` (SNAP_HEIGHT.half), and dvh is the layout viewport's height,
    so the two must change together. */
export const HALF_SNAP_SHARE = 0.5;

/** The half snap's height in CSS px on a layout viewport `viewportHeight` px
    tall (`window.innerHeight`). The explorer pads the selection camera by it
    (the 2026-09-25 phone plan, ruling R1), so a picked place lands in the part
    of the map the sheet leaves visible. Computed, not measured off the sheet's
    element: a pick in the tree snaps the sheet to half in the same render that
    builds the camera target, while the element is still a 200 ms height
    transition away from that size. */
export function halfSnapHeightPx(viewportHeight: number): number {
  return Math.round(viewportHeight * HALF_SNAP_SHARE);
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
