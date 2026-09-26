"use client";

// "What it could be" — the laptop column (lg+, spec §3.3): the top five
// candidates, Show all N in place, the capped ones last under "Unlikely from
// what you've said". A row opens the candidate's profile in a popover anchored
// to it; on a fine pointer focus moves into the popover and, closed with
// Escape, comes back to the row (the Popover touch rule: never on touch).
// CandidateRow and CandidateGroups are shared with the phone sheet.
// Tokens only: the bar is --primary, a capped row --muted-foreground.
import { useRef, useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Eyebrow } from "@/components/overview/eyebrow";
import { finePointer } from "@/lib/fine-pointer";
import { TRAINING_COPY, lineageLine, percentLabel, shortName, showAllLine } from "@/lib/training/copy";
import { detailReturnsFocus, panelView, type PanelView } from "@/lib/training/panel";
import type { RankedCandidate } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";
import { cn } from "@/lib/utils";
import { ArchetypeDetail } from "./archetype-detail";

// 44 px on touch, the row's own height on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";

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
        <span className="flex items-center gap-2">
          <span
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={r.closeness}
            aria-label={shortName(r.candidate.name)}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <span
              className={cn("block h-full rounded-full", capped ? "bg-muted-foreground" : "bg-primary")}
              style={{ width: `${r.closeness}%` }}
            />
          </span>
          <span className="w-11 shrink-0 text-right text-[12px] font-semibold tabular-nums">
            {percentLabel(r.closeness)}
          </span>
        </span>
      ) : null}
      {r.explanation ? (
        <span className="text-[11.5px] leading-snug text-muted-foreground">{r.explanation}</span>
      ) : null}
    </button>
  );
}

export function CandidateGroups({
  view,
  onOpen,
  openId,
}: {
  view: PanelView;
  onOpen: (id: string, anchor: HTMLElement) => void;
  /** The laptop column only: the candidate whose popover is open (null: none). */
  openId?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      {view.groups.map((group) => (
        <div key={group.key} className="flex flex-col">
          {group.heading ? (
            <Eyebrow size="sm" className="block px-3 pt-2 pb-1">
              {group.heading}
            </Eyebrow>
          ) : null}
          <ul className="flex flex-col">
            {group.rows.map((r) => (
              <li key={r.candidate.id}>
                <CandidateRow
                  r={r}
                  onOpen={(anchor) => onOpen(r.candidate.id, anchor)}
                  expanded={openId === undefined ? undefined : openId === r.candidate.id}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function CandidatesPanel({ ranked, note }: { ranked: RankedCandidate[]; note: WsetNoteState }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const view = panelView(ranked, expanded);
  const open = detail ? (ranked.find((r) => r.candidate.id === detail.id) ?? null) : null;
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
      <CandidateGroups
        view={view}
        openId={open ? open.candidate.id : null}
        onOpen={(id, anchor) => {
          anchorRef.current = anchor;
          closeReason.current = null;
          setDetail({ id, anchor });
        }}
      />
      {view.hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            "mx-1 mb-1 flex items-center justify-center rounded-[10px] border border-border bg-background py-2 text-[12.5px] font-semibold text-primary transition-colors hover:border-gold",
            TAP,
          )}
        >
          {showAllLine(view.total)}
        </button>
      ) : null}

      <PopoverPrimitive.Root
        open={open !== null}
        onOpenChange={(next, details) => {
          if (next) return;
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
