"use client";

// "What it could be" — the laptop column (lg+, spec §3.3; region-guess
// addendum R3): the top five regions, Show all N regions in place, the capped
// ones last under "Unlikely from what you've said". A region row expands in
// place to its typical wines (the top region starts expanded); a wine row
// opens its profile in a popover anchored to it, and pressed again closes it;
// on a fine pointer focus moves into the popover and, closed with Escape,
// comes back to the row (the Popover touch rule: never on touch).
// An open region's first row links to the MAP region its wines sit in
// (training-room-map spec RM8), never inside the region row's own <button>.
// CandidateRow, RegionGroups and ShowAllRegions are shared with the phone sheet.
// With the likelihood map on (training-room-map spec RM19), a List | Map
// tablist sits beside the heading: the list stays mounted (hidden) under Map,
// so its open regions and Show all come back as they were, and the map
// mounts only while Map is open, and only here at lg+ (the phone sheet owns
// it below lg). A dot, a spot's button or an unmapped name opens the SAME
// popover a row does (CandidateDetailPopover), anchored to the dot.
// Tokens only: the bars are --primary, a capped row --muted-foreground.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Eyebrow } from "@/components/overview/eyebrow";
import { finePointer } from "@/lib/fine-pointer";
import {
  TRAINING_COPY,
  chooserTitle,
  groupSubLine,
  lineageLine,
  percentLabel,
  regionLabel,
  shortName,
  showAllRegionsLine,
} from "@/lib/training/copy";
import {
  findMember,
  groupExpanded,
  regionPanelView,
  toggleGroup,
  type ExpandState,
  type RegionPanelView,
} from "@/lib/training/groups";
import { detailReturnsFocus, pressOnOwningRow } from "@/lib/training/panel";
import type { RankedCandidate, RegionGroup } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";
import { cn } from "@/lib/utils";
import { ArchetypeDetail } from "./archetype-detail";
import { MapFallback } from "./map-fallback";
import { GroupMapLink } from "./map-link";
import { MapSwitch, panelId, tabId } from "./map-switch";
import type { VirtualAnchor } from "./map-types";
import { RoomMapSlot } from "./room-map-slot";
import type { RoomMap } from "./room-map-state";
import { LG_QUERY, useMedia } from "./use-media";

// 44 px on touch, the row's own height on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";

function ClosenessBar({ value, capped, label }: { value: number; capped: boolean; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={label}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <span
          className={cn("block h-full rounded-full", capped ? "bg-muted-foreground" : "bg-primary")}
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="w-11 shrink-0 text-right text-[12px] font-semibold tabular-nums">{percentLabel(value)}</span>
    </span>
  );
}

export function CandidateRow({
  r,
  onOpen,
  expanded,
}: {
  r: RankedCandidate;
  onOpen: (anchor: HTMLElement) => void;
  /** Set where the row opens a popover (the laptop column): whether its
      popover is the open one. The phone sheet swaps its own content instead. */
  expanded?: boolean;
}) {
  const capped = r.capped !== null;
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      aria-haspopup={expanded === undefined ? undefined : "dialog"}
      aria-expanded={expanded}
      className={cn(
        "flex w-full flex-col gap-1 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
        TAP,
      )}
    >
      <span className={cn("text-[13.5px] leading-tight font-semibold", capped && "text-muted-foreground")}>
        {r.candidate.name}
      </span>
      <span className="text-[11.5px] leading-snug text-muted-foreground">{lineageLine(r.candidate)}</span>
      {r.closeness !== null ? (
        <ClosenessBar value={r.closeness} capped={capped} label={shortName(r.candidate.name)} />
      ) : null}
      {r.explanation ? (
        <span className="text-[11.5px] leading-snug text-muted-foreground">{r.explanation}</span>
      ) : null}
    </button>
  );
}

// A region: "Bourgogne, France", "best: Chablis Premier Cru" once there are
// numbers, and the region's bar. It opens and closes its typical wines.
function RegionRow({ group, expanded, onToggle }: { group: RegionGroup; expanded: boolean; onToggle: () => void }) {
  const capped = group.capped !== null;
  const sub = groupSubLine(group);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        "flex w-full flex-col gap-1 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
        TAP,
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn("min-w-0 flex-1 text-[14px] leading-tight font-semibold", capped && "text-muted-foreground")}
        >
          {regionLabel(group)}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      </span>
      {sub ? <span className="text-[11.5px] leading-snug text-muted-foreground">{sub}</span> : null}
      {group.closeness !== null ? (
        <ClosenessBar value={group.closeness} capped={capped} label={regionLabel(group)} />
      ) : null}
    </button>
  );
}

export function RegionGroups({
  view,
  expand,
  onToggle,
  onOpen,
  openId,
}: {
  view: RegionPanelView;
  /** The group rows opened or closed by hand (the owner keeps it, so it
      survives the phone sheet swapping to a wine and back). */
  expand: ExpandState;
  onToggle: (key: string) => void;
  onOpen: (id: string, anchor: HTMLElement) => void;
  /** The laptop column only: the wine whose popover is open (null: none). */
  openId?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      {view.sections.map((section) => (
        <div key={section.key} className="flex flex-col">
          {section.heading ? (
            <Eyebrow size="sm" className="block px-3 pt-2 pb-1">
              {section.heading}
            </Eyebrow>
          ) : null}
          <ul className="flex flex-col">
            {section.groups.map((group) => {
              const expanded = groupExpanded(group.key, view.topKey, expand);
              return (
                <li key={group.key} className="flex flex-col">
                  <RegionRow group={group} expanded={expanded} onToggle={() => onToggle(group.key)} />
                  {expanded ? (
                    <ul className="ml-3 flex flex-col border-l border-border-light pl-1">
                      <li className="flex flex-col">
                        <GroupMapLink region={group.mapRegion} />
                      </li>
                      {group.members.map((r) => (
                        <li key={r.candidate.id}>
                          <CandidateRow
                            r={r}
                            onOpen={(anchor) => onOpen(r.candidate.id, anchor)}
                            expanded={openId === undefined ? undefined : openId === r.candidate.id}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** "Show all {n} regions", while some are hidden. */
export function ShowAllRegions({ view, onShowAll }: { view: RegionPanelView; onShowAll: () => void }) {
  if (view.hidden === 0) return null;
  return (
    <button
      type="button"
      onClick={onShowAll}
      className={cn(
        "mx-1 mb-1 flex items-center justify-center rounded-[10px] border border-border bg-background py-2 text-[12.5px] font-semibold text-primary transition-colors hover:border-gold",
        TAP,
      )}
    >
      {showAllRegionsLine(view.total)}
    </button>
  );
}

/** What the laptop popover shows and where it is anchored (training-room-map
    spec RM18): a list row's wine, or what the map opened — a dot, a spot's
    "Closest on the map" button or an unmapped name — which is one wine's
    detail, or a chooser of the wines at one spot until one is chosen. */
export type PopoverTarget =
  | { kind: "row"; id: string; anchor: HTMLElement }
  | {
      kind: "map";
      ids: string[];
      chosen: string | null;
      anchor: Element | VirtualAnchor;
      returnFocus: HTMLElement;
    };

/** The wine a target shows in full; null while it is a chooser. */
export function targetDetailId(target: PopoverTarget): string | null {
  if (target.kind === "row") return target.id;
  return target.chosen ?? (target.ids.length === 1 ? target.ids[0] : null);
}

/** The dots that wear the gold ring: what the map opened, while it is open. */
export function selectedMapIds(target: PopoverTarget | null): string[] {
  if (!target || target.kind !== "map") return [];
  return target.chosen ? [target.chosen] : target.ids;
}

/** A target the current view can still show: a row's popover needs the list,
    a map's needs the map (the other view's anchor is hidden or gone). */
export function visibleTarget(target: PopoverTarget | null, mapView: boolean): PopoverTarget | null {
  if (!target) return null;
  return (target.kind === "map") === mapView ? target : null;
}

/** What survives a change of the view, of the map's mount (it stopped, or a
    retry remounted it) or of the lg breakpoint: a row's popover while the
    list is the view, and never a map's — its anchor is a point on a map that
    is gone or new, so kept it would come back at the screen's corner. */
export function targetAfterMapChange(target: PopoverTarget | null, mapView: boolean): PopoverTarget | null {
  return target?.kind === "row" && !mapView ? target : null;
}

/** "{n} wines here": the wines a tap hit, as the list's own rows, best first (RM18). */
export function MapChooser({ wines, onChoose }: { wines: RankedCandidate[]; onChoose: (id: string) => void }) {
  return (
    <ul className="flex flex-col">
      {wines.map((r) => (
        <li key={r.candidate.id}>
          <CandidateRow r={r} onOpen={() => onChoose(r.candidate.id)} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The laptop column's one popover (extracted for training-room-map spec
 * RM18): a list row's detail anchored to the row, as before, or what the map
 * opened, anchored to the dot's point (a virtual element) or the button
 * pressed. A row's own press toggles it (pressOnOwningRow); a map target has
 * no row, so any press outside closes it. On a fine pointer focus moves in,
 * and on close goes back to the row, the map container (tabIndex -1) or the
 * button — never to <body>.
 */
export function CandidateDetailPopover({
  target,
  lookup,
  note,
  onChoose,
  onBack,
  onClose,
}: {
  target: PopoverTarget | null;
  lookup: (id: string) => RankedCandidate | null;
  note: WsetNoteState;
  /** A chooser row: show that wine. */
  onChoose: (id: string) => void;
  /** Back from a chosen wine to its chooser. */
  onBack: () => void;
  onClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  // Why it last closed, and what it belonged to: kept outside `target`, which
  // is already null by the time the focus goes back.
  const closeReason = useRef<string | null>(null);
  const owner = useRef<{ row: HTMLElement | null; returnFocus: HTMLElement | null }>({ row: null, returnFocus: null });
  useEffect(() => {
    if (!target) return;
    closeReason.current = null;
    owner.current =
      target.kind === "row"
        ? { row: target.anchor, returnFocus: target.anchor }
        : { row: null, returnFocus: target.returnFocus };
  }, [target]);

  const detailId = target ? targetDetailId(target) : null;
  const detail = detailId ? lookup(detailId) : null;
  const chooser =
    target && target.kind === "map" && detailId === null
      ? target.ids.map(lookup).filter((r): r is RankedCandidate => r !== null)
      : null;
  const canGoBack = target?.kind === "map" && target.chosen !== null && target.ids.length > 1;
  // After a swap inside the popup, keep focus in it (fine pointer only).
  const refocus = () => {
    if (finePointer()) requestAnimationFrame(() => popupRef.current?.focus());
  };

  return (
    <PopoverPrimitive.Root
      open={detail !== null || chooser !== null}
      onOpenChange={(next, details) => {
        if (next) return;
        // A press on the owning row is the row's to handle: its click, which
        // follows, closes the popover (the panel's onOpen).
        const pressed = details.event?.target;
        if (pressOnOwningRow(details.reason, owner.current.row, pressed instanceof Node ? pressed : null)) {
          details.cancel();
          return;
        }
        closeReason.current = details.reason;
        onClose();
      }}
      modal={false}
    >
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={target?.anchor ?? null}
          positionMethod="fixed"
          side="left"
          align="start"
          sideOffset={12}
          collisionPadding={16}
          className="z-50"
        >
          <PopoverPrimitive.Popup
            ref={popupRef}
            aria-label={chooser ? chooserTitle(chooser.length) : detail ? detail.candidate.name : undefined}
            initialFocus={() => (finePointer() ? popupRef.current : false)}
            finalFocus={() =>
              detailReturnsFocus(closeReason.current, finePointer()) ? (owner.current.returnFocus ?? false) : false
            }
            className="max-h-[80vh] w-[560px] overflow-y-auto overscroll-contain rounded-2xl bg-background p-4 shadow-lg ring-1 ring-foreground/10 outline-hidden"
          >
            {chooser ? (
              <div className="flex flex-col gap-2">
                <p className="px-3 font-heading text-[17px] font-semibold">{chooserTitle(chooser.length)}</p>
                <MapChooser
                  wines={chooser}
                  onChoose={(id) => {
                    onChoose(id);
                    refocus();
                  }}
                />
              </div>
            ) : detail ? (
              <div className="flex flex-col gap-2">
                {canGoBack ? (
                  <button
                    type="button"
                    aria-label={TRAINING_COPY.back}
                    onClick={() => {
                      onBack();
                      refocus();
                    }}
                    className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring md:pointer-fine:size-8"
                  >
                    <ArrowLeft aria-hidden className="size-5" />
                  </button>
                ) : null}
                <ArchetypeDetail candidate={detail.candidate} note={note} />
              </div>
            ) : null}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function CandidatesPanel({
  groups,
  ranked,
  note,
  roomMap,
}: {
  groups: RegionGroup[];
  ranked: RankedCandidate[];
  note: WsetNoteState;
  /** The List | Map switch's state (training-room-map spec RM19); null when
      NEXT_PUBLIC_TRAINING_MAP=0, and the column is exactly R1's. */
  roomMap: RoomMap | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expand, setExpand] = useState<ExpandState>({});
  const [target, setTarget] = useState<PopoverTarget | null>(null);
  const idBase = useId();
  // Only the laptop column mounts the map here: below lg this aside is
  // display:none and the phone sheet owns the map (one WebGL context).
  const wide = useMedia(LG_QUERY, false);
  const view = regionPanelView(groups, showAll);
  const byId = useMemo(() => new Map(ranked.map((r) => [r.candidate.id, r] as const)), [ranked]);
  const lookup = (id: string) => byId.get(id) ?? findMember(groups, id);
  const mapView = roomMap?.state.view === "map";
  // A change of view, of the map's mount (a stop, a retry's remount) or of lg
  // drops what the new state cannot show, during render (React's "adjust
  // state on a prop change"), so a stopped map's popover never reopens,
  // anchored to a map that is gone, when Map is chosen again.
  const mapKey = `${mapView}:${wide}:${roomMap?.state.attempt ?? 0}`;
  const [seenMapKey, setSeenMapKey] = useState(mapKey);
  if (seenMapKey !== mapKey) {
    setSeenMapKey(mapKey);
    setTarget((t) => targetAfterMapChange(t, mapView));
  }
  const shown = visibleTarget(target, mapView);
  const openRowId = shown?.kind === "row" ? shown.id : null;

  const list = (
    <>
      {view.before && !mapView ? (
        <p className="px-3 text-[12.5px] text-muted-foreground">{TRAINING_COPY.beforeAnswers}</p>
      ) : null}
      <RegionGroups
        view={view}
        expand={expand}
        onToggle={(key) => setExpand((e) => toggleGroup(e, key, view.topKey))}
        openId={openRowId}
        onOpen={(id, anchor) => {
          // The open popover's own row toggles it closed, as a trigger would.
          if (openRowId === id) {
            setTarget(null);
            return;
          }
          setTarget({ kind: "row", id, anchor });
        }}
      />
      <ShowAllRegions view={view} onShowAll={() => setShowAll(true)} />
    </>
  );

  return (
    <section
      aria-labelledby="training-candidates"
      className="flex flex-col gap-2 rounded-[12px] border border-border bg-card p-2"
    >
      {roomMap ? (
        <>
          <div className="flex items-center gap-2 px-3 pt-2">
            <h2 id="training-candidates" className="min-w-0 flex-1 font-heading text-[19px] font-semibold">
              {TRAINING_COPY.candidatesHeading}
            </h2>
            <MapSwitch
              idBase={idBase}
              view={roomMap.state.view}
              onSelect={(v) => roomMap.dispatch({ type: "select", view: v })}
              onWarm={roomMap.warm}
            />
          </div>
          <div
            role="tabpanel"
            id={panelId(idBase, "list")}
            aria-labelledby={tabId(idBase, "list")}
            hidden={mapView}
            className="flex flex-col gap-2"
          >
            {roomMap.state.fault === "stopped" ? (
              <div className="px-1">
                <MapFallback kind="stopped" onRetry={() => roomMap.dispatch({ type: "retry" })} />
              </div>
            ) : null}
            {list}
          </div>
          <div
            role="tabpanel"
            id={panelId(idBase, "map")}
            aria-labelledby={tabId(idBase, "map")}
            hidden={!mapView}
            className="flex flex-col gap-2 px-1 pb-1"
          >
            {mapView && wide ? (
              <RoomMapSlot
                roomMap={roomMap}
                ranked={ranked}
                layout="column"
                selectedIds={selectedMapIds(shown)}
                onOpen={(request) =>
                  setTarget({ kind: "map", chosen: null, ...request })
                }
                // Any camera move: the dot's point would drift under the popover.
                onMoveStart={() => setTarget((t) => (t?.kind === "map" ? null : t))}
              />
            ) : null}
          </div>
        </>
      ) : (
        <>
          <h2 id="training-candidates" className="px-3 pt-2 font-heading text-[19px] font-semibold">
            {TRAINING_COPY.candidatesHeading}
          </h2>
          {list}
        </>
      )}

      <CandidateDetailPopover
        target={shown}
        lookup={lookup}
        note={note}
        onChoose={(id) => setTarget((t) => (t?.kind === "map" ? { ...t, chosen: id } : t))}
        onBack={() => setTarget((t) => (t?.kind === "map" ? { ...t, chosen: null } : t))}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}
