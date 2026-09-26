"use client";

// Below lg: the full ranked list as the app's bottom sheet (spec §3.3, §8) —
// the tour sheet's idiom: one base-ui Dialog, rounded top, drag pill, at most
// 88dvh, the PHONE classes as max-lg: variants and a centred card from lg
// (never seen: the column takes over there). A row swaps the sheet's content
// to that candidate's profile with a back arrow — no stacked sheets. ✕, Escape
// and the backdrop close it; focus moves in, and back to the strip on close,
// on a fine pointer only (the Popover touch rule). The list body is the only
// nested scroller (§8).
import { useState, type RefObject } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { finePointer } from "@/lib/fine-pointer";
import { TRAINING_COPY } from "@/lib/training/copy";
import { panelView } from "@/lib/training/panel";
import type { RankedCandidate } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";
import { cn } from "@/lib/utils";
import { ArchetypeDetail } from "./archetype-detail";
import { CandidateGroups } from "./candidates-panel";

// Overrides DialogContent's centred defaults below lg (tailwind-merge keeps the
// variants beside the defaults; a variant wins where it applies). max-w needs
// `!` to beat the default `sm:max-w-sm` between sm and lg.
const PHONE =
  "flex flex-col gap-0 overflow-hidden bg-card p-0 text-foreground max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:max-h-[88dvh] max-lg:w-full max-lg:max-w-none! max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-[22px_22px_0_0] max-lg:ring-0 max-lg:data-open:zoom-in-100 max-lg:data-open:slide-in-from-bottom-8";
const CARD = "lg:max-h-[80vh] lg:w-[480px] lg:max-w-[calc(100vw-2rem)] lg:rounded-2xl";

export function CandidatesSheet({
  open,
  onOpenChange,
  ranked,
  note,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ranked: RankedCandidate[];
  note: WsetNoteState;
  /** The strip that opened the sheet: focus goes back to it on close (fine pointer only). */
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? (ranked.find((r) => r.candidate.id === detailId) ?? null) : null;
  const view = panelView(ranked, true);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setDetailId(null);
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        initialFocus={() => finePointer()}
        finalFocus={() => (finePointer() ? (returnFocusRef?.current ?? false) : false)}
        className={cn(PHONE, CARD)}
      >
        <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 pt-3 pb-3">
          <span aria-hidden className="h-1 w-[38px] self-center rounded-full bg-border lg:hidden" />
          <div className="flex items-center gap-1">
            {detail ? (
              <button
                type="button"
                aria-label={TRAINING_COPY.back}
                onClick={() => setDetailId(null)}
                className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <ArrowLeft aria-hidden className="size-5" />
              </button>
            ) : null}
            <DialogTitle className="min-w-0 flex-1 font-heading text-[20px] leading-tight font-semibold">
              {detail ? detail.candidate.name : TRAINING_COPY.candidatesHeading}
            </DialogTitle>
            {/* 44 px on touch, a compact 32 px on a laptop pointer. */}
            <DialogClose
              aria-label={TRAINING_COPY.close}
              className="-mr-2 inline-flex size-8 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted md:pointer-fine:min-h-0 md:pointer-fine:min-w-0"
            >
              <X aria-hidden className="size-5" />
            </DialogClose>
          </div>
          {!detail && view.before ? (
            <DialogDescription className="text-[12.5px] text-muted-foreground">
              {TRAINING_COPY.beforeAnswers}
            </DialogDescription>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2 pb-[max(16px,env(safe-area-inset-bottom))]">
          {detail ? (
            <div className="px-2">
              <ArchetypeDetail candidate={detail.candidate} note={note} />
            </div>
          ) : (
            <CandidateGroups view={view} onOpen={(id) => setDetailId(id)} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
