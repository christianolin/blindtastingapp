"use client";

import { createContext, useContext, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  NOTES_ARCHIVE_HREF,
  NOTE_SAVED_COPY,
  noteSavedAttachSentence,
  noteSavedLine,
  noteSavedOutcome,
  type NoteSavedAction,
  type NoteSavedReport,
} from "@/lib/wset/note-saved";

// "Note saved" (Taste & Rate ledger R6; handoff T6 desktop, T6b phone): the
// provider-level step after NewNoteModal saves. AddWineProvider supplies the
// step through this context and mounts the sheet, so every path that opens
// NewNoteModal (Taste & rate, the catalog list, the tasting board) gets the
// same ending without its caller doing anything. Every decision (when it
// shows, the flag, the copy, what each action does) is pure, in
// lib/wset/note-saved.ts.

/** Reports a save to the provider, which decides whether the confirmation shows. */
export type NoteSavedStep = (report: NoteSavedReport) => void;

export const NoteSavedStepContext = createContext<NoteSavedStep | null>(null);

/** The provider's after-save step; null outside AddWineProvider, where nothing follows a save. */
export function useNoteSavedStep(): NoteSavedStep | null {
  return useContext(NoteSavedStepContext);
}

// The bordeaux primary of the 2026-09 surfaces (radius 9–11 and the ink
// under-shadow), from tokens only: the shadow is the ink at 18%, the hover the
// primary deepened with the ink.
const PRIMARY_BUTTON =
  "bg-primary text-primary-foreground shadow-[0_2px_0_0_color-mix(in_srgb,var(--foreground)_18%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_80%,var(--foreground))]";

const FOCUS_RING = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** The element when it is laid out, i.e. not inside the hidden breakpoint's block. */
function laidOut(el: HTMLElement | null): HTMLElement | null {
  return el && el.getClientRects().length > 0 ? el : null;
}

export function NoteSavedSheet({
  report,
  onClose,
}: {
  report: NoteSavedReport;
  /** Closes the confirmation; `remember` writes "Don't show this again". */
  onClose: (remember: boolean) => void;
}) {
  // The desktop checkbox. Whichever way the confirmation closes honours it.
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const deskDoneRef = useRef<HTMLButtonElement>(null);
  const phoneDoneRef = useRef<HTMLButtonElement>(null);

  // Every action closes. See all notes also navigates, through its Link to
  // NOTES_ARCHIVE_HREF (the outcome's href).
  const act = (action: NoteSavedAction) =>
    onClose(noteSavedOutcome(action, dontShowAgain).remember);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) act("dismiss");
      }}
    >
      <DialogContent
        showCloseButton={false}
        // Focus starts on Done, in whichever layout is on screen.
        initialFocus={() => laidOut(deskDoneRef.current) ?? laidOut(phoneDoneRef.current) ?? true}
        className={cn(
          // Phone (T6b): a sheet from the bottom, over the note just closed.
          "top-auto bottom-0 left-0 flex w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-[22px_22px_0_0] bg-card p-0 text-foreground ring-0 max-sm:data-open:zoom-in-100 max-sm:data-open:slide-in-from-bottom-8",
          // Desktop (T6): a centred 700px card.
          "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[calc(100vw-3rem)] sm:max-w-[700px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[16px] sm:border sm:border-border-strong sm:shadow-[0_30px_60px_-28px_color-mix(in_srgb,var(--foreground)_50%,transparent)]",
        )}
      >
        <div className="flex flex-col gap-[14px] px-4 pt-[14px] pb-4 sm:gap-4 sm:px-6 sm:py-[22px]">
          <span aria-hidden className="h-1 w-[38px] self-center rounded-full bg-border sm:hidden" />
          <div className="flex items-start gap-[13px]">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground sm:size-[38px]"
            >
              <Check className="size-[17px]" strokeWidth={2.4} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <DialogTitle className="text-[21px] leading-[1.1] font-semibold sm:text-[25px]">
                {NOTE_SAVED_COPY.heading}
              </DialogTitle>
              <DialogDescription className="text-[12.5px] text-muted-foreground sm:text-[13px]">
                {noteSavedLine(report)}
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-start gap-[11px] rounded-[11px] border border-gold bg-background px-[14px] py-[13px]">
            <BookOpen aria-hidden className="mt-px size-[17px] shrink-0 text-primary" strokeWidth={1.75} />
            <p className="flex-1 text-[12.5px] leading-[1.55] text-ink-photo sm:text-[13px]">
              {NOTE_SAVED_COPY.whereLead}
              <strong className="font-semibold">{NOTE_SAVED_COPY.whereStrong}</strong>
              {NOTE_SAVED_COPY.whereTail} {noteSavedAttachSentence(report.attachment)}
            </p>
          </div>
        </div>

        {/* Desktop footer (T6): the checkbox left, See all notes and Done right. */}
        <div className="flex items-center gap-3 border-t border-border bg-background px-6 py-[14px] max-sm:hidden">
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground pointer-coarse:min-h-11">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="size-4 accent-primary"
            />
            {NOTE_SAVED_COPY.dontShow}
          </label>
          <div className="ml-auto flex items-center gap-[9px]">
            <Link
              href={NOTES_ARCHIVE_HREF}
              onClick={() => act("see-all")}
              className={cn(
                "inline-flex items-center rounded-[9px] border border-border bg-card px-4 py-[10px] text-[13px] font-semibold text-primary transition-colors hover:bg-muted pointer-coarse:min-h-11",
                FOCUS_RING,
              )}
            >
              {NOTE_SAVED_COPY.seeAll}
            </Link>
            <button
              ref={deskDoneRef}
              type="button"
              onClick={() => act("done")}
              className={cn(
                "inline-flex items-center rounded-[9px] px-5 py-[11px] text-[13.5px] font-semibold pointer-coarse:min-h-11",
                PRIMARY_BUTTON,
                FOCUS_RING,
              )}
            >
              {NOTE_SAVED_COPY.done}
            </button>
          </div>
        </div>

        {/* Phone footer (T6b): Done, See all notes, Don't show this again —
            stacked, each at least 44px tall. */}
        <div className="flex flex-col border-t border-border bg-background px-4 pt-[11px] pb-[max(18px,env(safe-area-inset-bottom))] sm:hidden">
          <button
            ref={phoneDoneRef}
            type="button"
            onClick={() => act("done")}
            className={cn(
              "flex min-h-12 items-center justify-center rounded-[11px] p-[14px] text-[15.5px] font-semibold",
              PRIMARY_BUTTON,
              FOCUS_RING,
            )}
          >
            {NOTE_SAVED_COPY.done}
          </button>
          <Link
            href={NOTES_ARCHIVE_HREF}
            onClick={() => act("see-all")}
            className={cn(
              "mt-1 flex min-h-11 items-center justify-center rounded-[11px] text-[13px] font-semibold text-primary",
              FOCUS_RING,
            )}
          >
            {NOTE_SAVED_COPY.seeAll}
          </Link>
          <button
            type="button"
            onClick={() => act("dont-show")}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-[11px] text-[11.5px] text-muted-foreground",
              FOCUS_RING,
            )}
          >
            {NOTE_SAVED_COPY.dontShow}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
