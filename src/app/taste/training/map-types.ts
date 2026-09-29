// The training room's likelihood map, as seen from outside its dynamic chunk
// (training-room-map spec RM11, RM18): the props TrainingMap takes, what a
// tap on a dot (or a "Closest on the map" button) asks the room to open, and
// the map box's size classes. Types and constants only: the candidates panel,
// the phone sheet and the map slot import this without pulling MapLibre, the
// basemap or the palette into the room's first load (RM24).
import type { RankedCandidate } from "@/lib/training/types";

/** A point on screen, for base-ui's Positioner (floating-ui's VirtualElement). */
export type VirtualAnchor = {
  getBoundingClientRect(): DOMRect;
  contextElement?: Element;
};

/** What a dot, a spot's button or an unmapped name asks the room to open (RM18, RM25). */
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
  /** The wines whose detail or chooser is open: their dots wear the gold ring. */
  selectedIds: readonly string[];
  onOpen: (request: MapOpenRequest) => void;
  /** Any camera move (a gesture or a fit): the laptop popover's anchor would drift, so it closes. */
  onMoveStart?: () => void;
  /** A lost WebGL context, or a map that could not start: the room goes back to List (RM22). */
  onStopped: () => void;
};

/** The map box (spec §6.2, §6.3): on the laptop column a height that keeps the
    whole panel inside the aside with no scroll; in the sheet whatever the
    sheet's 88dvh leaves. The loading placeholder uses the same classes by
    breakpoint, since the column is lg+ and the sheet below lg. */
export const MAP_BOX: Record<TrainingMapLayout, string> = {
  column: "h-[clamp(240px,calc(100dvh-380px),520px)] w-full",
  sheet: "min-h-0 w-full flex-1",
};
export const MAP_BOX_ANY = "w-full max-lg:min-h-0 max-lg:flex-1 lg:h-[clamp(240px,calc(100dvh-380px),520px)]";

/** A screen point inside `container`, read when the popover asks (it closes on any camera move). */
export function pointAnchor(container: HTMLElement, x: number, y: number): VirtualAnchor {
  return {
    getBoundingClientRect: () => {
      const r = container.getBoundingClientRect();
      return new DOMRect(r.left + x, r.top + y, 0, 0);
    },
    contextElement: container,
  };
}
