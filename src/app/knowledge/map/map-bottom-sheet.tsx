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
