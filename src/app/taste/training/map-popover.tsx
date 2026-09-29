"use client";

// What the laptop map opens (training-room-map spec RM18, RM25): a dot, a
// spot's "Closest on the map" button or an unmapped name shows one wine's
// detail, or a chooser of the wines at one spot ("{n} wines here") until one
// is chosen, with Back to the chooser. It is the list's own popover shell
// (candidates-panel.tsx's DetailPopover) with the list's own rows and detail,
// anchored to the dot's point or the button pressed — all three HANDED in by
// the panel (`ui`, map-types.ts's MapPopoverUi), never imported here, so the
// map's chunk shares nothing heavy with the room's first load. Imported only
// by training-map.tsx, so it rides in the map's dynamic chunk and costs the
// room's first load nothing (spec §12); its state lives in the map, so it goes
// with the map whenever the map unmounts and never reopens anchored to a map
// that is gone (training-room-map-imports.test.ts pins both imports).
import { useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { finePointer } from "@/lib/fine-pointer";
import { TRAINING_COPY, chooserTitle } from "@/lib/training/copy";
import type { RankedCandidate } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";
import type { MapOpenRequest, MapPopoverUi } from "./map-types";

/** What the map opened: the request, and the wine chosen from its chooser. */
export type MapTarget = MapOpenRequest & { chosen: string | null };

/** The wine a target shows in full; null while it is a chooser. */
export function targetDetailId(target: MapTarget): string | null {
  return target.chosen ?? (target.ids.length === 1 ? target.ids[0] : null);
}

/** The dots that wear the gold ring: what the map opened, while it is open. */
export function selectedMapIds(target: MapTarget | null): string[] {
  if (!target) return [];
  return target.chosen ? [target.chosen] : target.ids;
}

export function MapDetailPopover({
  ui: { Popover, Chooser, Detail },
  target,
  lookup,
  note,
  onChoose,
  onClose,
}: {
  ui: MapPopoverUi;
  target: MapTarget | null;
  lookup: (id: string) => RankedCandidate | null;
  note: WsetNoteState;
  /** A chooser row (an id), or Back to the chooser (null). */
  onChoose: (id: string | null) => void;
  onClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const detailId = target ? targetDetailId(target) : null;
  const detail = detailId ? lookup(detailId) : null;
  const chooser =
    target && detailId === null
      ? target.ids.map(lookup).filter((r): r is RankedCandidate => r !== null)
      : null;
  const canGoBack = target !== null && target.chosen !== null && target.ids.length > 1;
  // After a swap inside the popup, keep focus in it (fine pointer only).
  const swap = (id: string | null) => {
    onChoose(id);
    if (finePointer()) requestAnimationFrame(() => popupRef.current?.focus());
  };

  return (
    <Popover
      anchor={target && (detail || chooser) ? target.anchor : null}
      ownerRow={null}
      returnFocus={target?.returnFocus ?? null}
      label={chooser ? chooserTitle(chooser.length) : detail?.candidate.name}
      popupRef={popupRef}
      onClose={onClose}
    >
      {chooser ? (
        <div className="flex flex-col gap-2">
          <p className="px-3 font-heading text-[17px] font-semibold">{chooserTitle(chooser.length)}</p>
          <Chooser wines={chooser} onChoose={swap} />
        </div>
      ) : detail ? (
        <div className="flex flex-col gap-2">
          {canGoBack ? (
            <button
              type="button"
              aria-label={TRAINING_COPY.back}
              onClick={() => swap(null)}
              className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring md:pointer-fine:size-8"
            >
              <ArrowLeft aria-hidden className="size-5" />
            </button>
          ) : null}
          <Detail candidate={detail.candidate} note={note} />
        </div>
      ) : null}
    </Popover>
  );
}
