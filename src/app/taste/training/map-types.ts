// The training room's likelihood map, as seen from outside its dynamic chunk
// (training-room-map spec RM11, RM18): the props TrainingMap takes, what a
// tap on a dot (or a "Closest on the map" button) asks the room to open, and
// the loading placeholder's box. Types and constants only: the candidates panel,
// the phone sheet and the map slot import this without pulling MapLibre, the
// basemap or the palette into the room's first load (RM24).
import type { ComponentType, ReactNode, RefObject } from "react";
import type { RankedCandidate, TrainingCandidate } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";

/** A point on screen, for base-ui's Positioner (floating-ui's VirtualElement). */
export type VirtualAnchor = {
  getBoundingClientRect(): DOMRect;
  contextElement?: Element;
};

/** What a dot, a spot's button or an unmapped name opens (RM18, RM25): on the
    laptop column the map's own popover, in the phone sheet the sheet's view. */
export type MapOpenRequest = {
  /** The wines there, once each, in ranking order: one opens its detail, more a chooser. */
  ids: string[];
  /** The dot's point on screen, or the button pressed. */
  anchor: Element | VirtualAnchor;
  /** Where focus goes back on close: the map container (tabIndex -1), or the button pressed. */
  returnFocus: HTMLElement;
};

/** The laptop column, or the phone and tablet sheet. */
export type TrainingMapLayout = "column" | "sheet";

export type TrainingMapProps = {
  ranked: readonly RankedCandidate[];
  layout: TrainingMapLayout;
  /** The laptop column only: what the map's own popover renders with. */
  popover?: { ui: MapPopoverUi; note: WsetNoteState };
  /** The sheet only: the wines whose detail or chooser the sheet shows, whose
      dots wear the gold ring (the column's map rings what its popover shows). */
  selectedIds?: readonly string[];
  /** The sheet only: a dot or button asks the sheet to show a detail or chooser. */
  onOpen?: (request: MapOpenRequest) => void;
  /** A lost WebGL context, or a map that could not start (with its error):
      the room goes back to List (RM22) — unless the error is MapLibre's own
      lazily loaded chunk failing (a stale tab after a deploy, a flaky
      connection), where a retry would hit the same rejected import, so the
      room says to reload the page instead. */
  onStopped: (error?: unknown) => void;
};

/** candidates-panel.tsx's DetailPopover: the laptop column's one popover shell. */
export type DetailPopoverProps = {
  /** Where it points; null: closed. */
  anchor: Element | VirtualAnchor | null;
  /** The list row it belongs to (its own press toggles it); null for the map. */
  ownerRow: HTMLElement | null;
  /** Where focus goes back on close (fine pointer): the row, the map container or the button pressed. */
  returnFocus: HTMLElement | null;
  label: string | undefined;
  /** For a swap inside the popup that keeps focus in it (the map's chooser). */
  popupRef?: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  children: ReactNode;
};

/**
 * The list's own popover shell, chooser rows and detail, HANDED to the map by
 * the laptop column rather than imported by the map's chunk (map-popover.tsx):
 * a static import there made the bundler split the room's first-load chunks
 * to share them with the chunk, which cost the first load more than the map's
 * popover code it moved out (spec §12's budget). Same components, one copy.
 */
export type MapPopoverUi = {
  Popover: ComponentType<DetailPopoverProps>;
  Chooser: ComponentType<{ wines: RankedCandidate[]; onChoose: (id: string) => void }>;
  Detail: ComponentType<{ candidate: TrainingCandidate; note: WsetNoteState }>;
};

/** The loading placeholder's box: training-map.tsx's MAP_BOX by breakpoint,
    since the column is lg+ and the sheet below lg. Keep the two in step. */
export const MAP_BOX_ANY = "w-full max-lg:min-h-[240px] max-lg:flex-1 lg:h-[clamp(240px,calc(100dvh-380px),520px)]";
