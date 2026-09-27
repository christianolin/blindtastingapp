// The md-xl wine map's side column (spec 2026-09-27-desktop-map-layout-design
// §5.3, M9/M10): which of its two cards shows, Explore (the tree) or Details,
// and whether the column is open or collapsed to its 36 px strip. A pure
// reducer, so every transition is pinned by side-panel.test.ts; the explorer
// only draws the state and reports events. Both cards share one grid cell of
// a fixed size, so no transition here ever resizes the map. Nothing is
// persisted or put in the URL (M16): the explorer starts it afresh on every
// load, from initialSidePanel. The tab words match the phone sheet's
// (sheet-state.ts).

export type SidePanelTab = "explore" | "details";
export type SidePanelState = { readonly tab: SidePanelTab; readonly open: boolean };

export type SidePanelEvent =
  /** The Explore or Details switch button. Shows that card; open unchanged. */
  | { type: "tab"; tab: SidePanelTab }
  /** Any selection: a map tap, a tree pick, a deep link, a Nearby or Labelling
      chip. Shows Details but never opens a collapsed column (M10), so the
      column reopens on Details and its strip names the place meanwhile. */
  | { type: "select" }
  /** Hide panel / Show panel. Flips open; the tab is kept. */
  | { type: "toggle" };

/** The first state. A load with ?place= is a deep link, so it opens on
    Details; any other load opens on Explore. The column always starts open. */
export function initialSidePanel(initialPlaceKey: string | null): SidePanelState {
  return { tab: initialPlaceKey ? "details" : "explore", open: true };
}

// The same object back when nothing changes, so React skips the re-render.
function settle(state: SidePanelState, next: SidePanelState): SidePanelState {
  return state.tab === next.tab && state.open === next.open ? state : next;
}

export function sidePanelReducer(state: SidePanelState, event: SidePanelEvent): SidePanelState {
  switch (event.type) {
    case "tab":
      return settle(state, { tab: event.tab, open: state.open });
    case "select":
      return settle(state, { tab: "details", open: state.open });
    case "toggle":
      return { tab: state.tab, open: !state.open };
  }
}
