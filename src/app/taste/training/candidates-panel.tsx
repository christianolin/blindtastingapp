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
// Tokens only: the bars are --primary, a capped row --muted-foreground.
import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Eyebrow } from "@/components/overview/eyebrow";
import { finePointer } from "@/lib/fine-pointer";
import {
  TRAINING_COPY,
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
import { GroupMapLink } from "./map-link";

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

export function CandidatesPanel({ groups, note }: { groups: RegionGroup[]; note: WsetNoteState }) {
  const [showAll, setShowAll] = useState(false);
  const [expand, setExpand] = useState<ExpandState>({});
  const [detail, setDetail] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const view = regionPanelView(groups, showAll);
  const open = detail ? findMember(groups, detail.id) : null;
  const popupRef = useRef<HTMLDivElement>(null);
  // The row the open popover belongs to, and why it last closed: kept outside
  // `detail`, which is already null by the time the focus goes back.
  const anchorRef = useRef<HTMLElement | null>(null);
  const closeReason = useRef<string | null>(null);

  return (
    <section
      aria-labelledby="training-candidates"
      className="flex flex-col gap-2 rounded-[12px] border border-border bg-card p-2"
    >
      <h2 id="training-candidates" className="px-3 pt-2 font-heading text-[19px] font-semibold">
        {TRAINING_COPY.candidatesHeading}
      </h2>
      {view.before ? (
        <p className="px-3 text-[12.5px] text-muted-foreground">{TRAINING_COPY.beforeAnswers}</p>
      ) : null}
      <RegionGroups
        view={view}
        expand={expand}
        onToggle={(key) => setExpand((e) => toggleGroup(e, key, view.topKey))}
        openId={open ? open.candidate.id : null}
        onOpen={(id, anchor) => {
          // The open popover's own row toggles it closed, as a trigger would.
          if (detail?.id === id) {
            closeReason.current = "trigger-press";
            setDetail(null);
            return;
          }
          anchorRef.current = anchor;
          closeReason.current = null;
          setDetail({ id, anchor });
        }}
      />
      <ShowAllRegions view={view} onShowAll={() => setShowAll(true)} />

      <PopoverPrimitive.Root
        open={open !== null}
        onOpenChange={(next, details) => {
          if (next) return;
          // A press on the owning row is the row's to handle: its click, which
          // follows, closes the popover (onOpen above).
          const target = details.event?.target;
          if (pressOnOwningRow(details.reason, anchorRef.current, target instanceof Node ? target : null)) {
            details.cancel();
            return;
          }
          closeReason.current = details.reason;
          setDetail(null);
        }}
        modal={false}
      >
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            anchor={detail?.anchor ?? null}
            positionMethod="fixed"
            side="left"
            align="start"
            sideOffset={12}
            collisionPadding={16}
            className="z-50"
          >
            <PopoverPrimitive.Popup
              ref={popupRef}
              aria-label={open ? open.candidate.name : undefined}
              initialFocus={() => (finePointer() ? popupRef.current : false)}
              finalFocus={() =>
                detailReturnsFocus(closeReason.current, finePointer()) ? (anchorRef.current ?? false) : false
              }
              className="max-h-[80vh] w-[560px] overflow-y-auto overscroll-contain rounded-2xl bg-background p-4 shadow-lg ring-1 ring-foreground/10 outline-hidden"
            >
              {open ? <ArchetypeDetail candidate={open.candidate} note={note} /> : null}
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </section>
  );
}
