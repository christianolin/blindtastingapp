"use client";

// Below lg: the ranked regions as the app's bottom sheet (spec §3.3, §8;
// region-guess addendum R3) — the tour sheet's idiom: one base-ui Dialog,
// rounded top, drag pill, at most 88dvh, the PHONE classes as max-lg: variants
// and a centred card from lg (never seen: the column takes over there). The
// top five regions, Show all N regions, a region row opening its typical wines
// in place (the top region starts open); a wine row swaps the sheet's content
// to that wine's profile with a back arrow — no stacked sheets — and back
// finds the list as it was left (the open regions and Show all live here, not
// in the list). ✕, Escape and the backdrop close it; focus moves in, and back
// to the strip on close, on a fine pointer only (the Popover touch rule). The
// list body is the only nested scroller (§8).
//
// The likelihood map (training-room-map spec RM18-RM20, §6.3), when the
// switch is on: List | Map tabs under the title, hidden on a detail or a
// chooser. On Map the sheet takes its full 88dvh (a map has no content height
// to size to) and the body stops scrolling, so the map owns every touch in it;
// a dot opens the chooser ("{n} wines here") or the detail with Back, in its
// own scroller OVER the kept map (invisible and inert, same size), so Back
// returns to the same camera with no new WebGL context. Closing the sheet
// unmounts the map; reopening remounts it and the tab stays Map (the choice
// lives in TrainingRoom). A phone on its side gets the upright note instead.
import { useId, useState, type RefObject } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { finePointer } from "@/lib/fine-pointer";
import { TRAINING_COPY, chooserTitle } from "@/lib/training/copy";
import { findMember, regionPanelView, toggleGroup, type ExpandState } from "@/lib/training/groups";
import type { RankedCandidate, RegionGroup } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";
import { cn } from "@/lib/utils";
import { ArchetypeDetail } from "./archetype-detail";
import { MapChooser, RegionGroups, ShowAllRegions } from "./candidates-panel";
import { MapFallback } from "./map-fallback";
import { MapSwitch, panelId, tabId } from "./map-switch";
import type { MapOpenRequest } from "./map-types";
import { RoomMapSlot } from "./room-map-slot";
import type { RoomMap } from "./room-map-state";
import { LG_QUERY, SHORT_QUERY, useMedia } from "./use-media";

// Overrides DialogContent's centred defaults below lg (tailwind-merge keeps the
// variants beside the defaults; a variant wins where it applies). max-w needs
// `!` to beat the default `sm:max-w-sm` between sm and lg.
const PHONE =
  "flex flex-col gap-0 overflow-hidden bg-card p-0 text-foreground max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:max-h-[88dvh] max-lg:w-full max-lg:max-w-none! max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-[22px_22px_0_0] max-lg:ring-0 max-lg:data-open:zoom-in-100 max-lg:data-open:slide-in-from-bottom-8";
const CARD = "lg:max-h-[80vh] lg:w-[480px] lg:max-w-[calc(100vw-2rem)] lg:rounded-2xl";
// On Map the sheet is its full height, not its content's (RM20).
const MAP_HEIGHT = "max-lg:h-[88dvh]";
const SAFE_BOTTOM = "pb-[max(16px,env(safe-area-inset-bottom))]";

export function CandidatesSheet({
  open,
  onOpenChange,
  groups,
  ranked,
  note,
  roomMap,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: RegionGroup[];
  ranked: RankedCandidate[];
  note: WsetNoteState;
  /** The List | Map switch's state (training-room-map spec RM19); null when
      NEXT_PUBLIC_TRAINING_MAP=0, and the sheet is exactly R1's. */
  roomMap: RoomMap | null;
  /** The strip that opened the sheet: focus goes back to it on close (fine pointer only). */
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  // The wines a tap on a shared spot hit, in ranking order (RM18).
  const [chooserIds, setChooserIds] = useState<string[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expand, setExpand] = useState<ExpandState>({});
  const idBase = useId();
  // The laptop column owns the map from lg (one WebGL context); a phone on
  // its side gets the upright note (RM20).
  const wide = useMedia(LG_QUERY, false);
  const short = useMedia(SHORT_QUERY, false);
  // groups is the same ranking by region, so it holds every wine the map shows.
  const lookup = (id: string) => findMember(groups, id);
  const detail = detailId ? lookup(detailId) : null;
  const chooser = chooserIds ? chooserIds.map(lookup).filter((r): r is RankedCandidate => r !== null) : null;
  const view = regionPanelView(groups, showAll);
  const mapView = roomMap?.state.view === "map";
  const overlay = detail !== null || chooser !== null;

  // One wine opens its detail; more open the chooser.
  const openFromMap = ({ ids }: MapOpenRequest) => {
    const one = ids.length === 1;
    setChooserIds(one ? null : ids);
    setDetailId(one ? ids[0] : null);
  };
  // Back: a wine chosen from a chooser returns to it; anything else to the list or map.
  const back = () => {
    if (!(detail && chooser)) setChooserIds(null);
    setDetailId(null);
  };

  const list = (
    <div className="flex flex-col gap-2">
      <RegionGroups
        view={view}
        expand={expand}
        onToggle={(key) => setExpand((e) => toggleGroup(e, key, view.topKey))}
        onOpen={(id) => setDetailId(id)}
      />
      <ShowAllRegions view={view} onShowAll={() => setShowAll(true)} />
    </div>
  );
  const overlayBody =
    chooser && !detail ? (
      <MapChooser wines={chooser} onChoose={(id) => setDetailId(id)} />
    ) : detail ? (
      <div className="px-2">
        <ArchetypeDetail candidate={detail.candidate} note={note} />
      </div>
    ) : null;

  let body;
  if (!roomMap || !mapView) {
    body = (
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2", SAFE_BOTTOM)}>
        {overlayBody ?? (
          <>
            {roomMap?.state.fault === "stopped" ? (
              <div className="px-1 pb-2">
                <MapFallback kind="stopped" onAction={() => roomMap.dispatch({ type: "retry" })} />
              </div>
            ) : null}
            {list}
          </>
        )}
      </div>
    );
  } else {
    // The map body does not scroll (RM20): the map owns every touch in it.
    body = (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain">
        <div
          inert={overlay}
          className={cn("flex min-h-0 flex-1 flex-col gap-2 px-3 pt-2", SAFE_BOTTOM, overlay && "invisible")}
        >
          {short ? (
            <MapFallback kind="upright" onAction={() => roomMap.dispatch({ type: "select", view: "list" })} />
          ) : !wide ? (
            <RoomMapSlot
              roomMap={roomMap}
              ranked={ranked}
              layout="sheet"
              selectedIds={detailId ? [detailId] : (chooserIds ?? [])}
              onOpen={openFromMap}
            />
          ) : null}
        </div>
        {overlayBody ? (
          <div className={cn("absolute inset-0 overflow-y-auto overscroll-contain bg-card px-2 pt-2", SAFE_BOTTOM)}>
            {overlayBody}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setDetailId(null);
          setChooserIds(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        initialFocus={() => finePointer()}
        finalFocus={() => (finePointer() ? (returnFocusRef?.current ?? false) : false)}
        className={cn(PHONE, CARD, roomMap && mapView && MAP_HEIGHT)}
      >
        <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 pt-3 pb-3">
          <span aria-hidden className="h-1 w-[38px] self-center rounded-full bg-border lg:hidden" />
          <div className="flex items-center gap-1">
            {overlay ? (
              <button
                type="button"
                aria-label={TRAINING_COPY.back}
                onClick={back}
                className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <ArrowLeft aria-hidden className="size-5" />
              </button>
            ) : null}
            <DialogTitle className="min-w-0 flex-1 font-heading text-[20px] leading-tight font-semibold">
              {detail
                ? detail.candidate.name
                : chooser
                  ? chooserTitle(chooser.length)
                  : TRAINING_COPY.candidatesHeading}
            </DialogTitle>
            {/* 44 px on touch, a compact 32 px on a laptop pointer. */}
            <DialogClose
              aria-label={TRAINING_COPY.close}
              className="-mr-2 inline-flex size-8 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted md:pointer-fine:min-h-0 md:pointer-fine:min-w-0"
            >
              <X aria-hidden className="size-5" />
            </DialogClose>
          </div>
          {roomMap && !overlay ? (
            <MapSwitch
              idBase={idBase}
              view={roomMap.state.view}
              onSelect={(v) => roomMap.dispatch({ type: "select", view: v })}
              onWarm={roomMap.warm}
              className="self-start"
            />
          ) : null}
          {!overlay && !mapView && view.before ? (
            <DialogDescription className="text-[12.5px] text-muted-foreground">
              {TRAINING_COPY.beforeAnswers}
            </DialogDescription>
          ) : null}
        </div>
        {roomMap ? (
          <>
            <div
              role="tabpanel"
              id={panelId(idBase, mapView ? "map" : "list")}
              aria-labelledby={tabId(idBase, mapView ? "map" : "list")}
              className="flex min-h-0 flex-1 flex-col"
            >
              {body}
            </div>
            {/* The other tab's panel, empty and hidden, so its aria-controls resolves. */}
            <div
              role="tabpanel"
              id={panelId(idBase, mapView ? "list" : "map")}
              aria-labelledby={tabId(idBase, mapView ? "list" : "map")}
              hidden
            />
          </>
        ) : (
          body
        )}
      </DialogContent>
    </Dialog>
  );
}
