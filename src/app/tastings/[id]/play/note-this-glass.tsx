"use client";

// "Note this glass" (BT-N2; spec §9.3 item 1; ledger B8) — the entry point
// that reverses CLAUDE.md's old "No WSET note can be written while a glass is
// locked": a taster may write a WSET note on a still-hidden glass, locked or
// not, private to its author until the glass is revealed (`NewNoteModal`'s
// "hidden-glass" target, BT-N1). Mounted three places, one per `layout`:
//   - "phone"  — locked-in.tsx's S10 waiting card, under "While you wait",
//     with the long sub-line.
//   - "laptop" — locked-in.tsx's S10b left column, the short sub-line.
//   - "link"   — guess-ladder.tsx's open ladder, a plain text link under the
//     lock button on both widths ("locked or not").
// Eligibility (`canNoteHiddenGlass`) and the viewer's own already-started
// note, if any, are computed once per glass by play-experience.tsx and
// handed down as `NoteThisGlassData` — this component only renders and opens
// the sheet.
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { NewNoteModal } from "@/components/new-note-modal";

// (spec copy, §9.3 item 1)
export const NOTE_THIS_GLASS = "Note this glass";
export const NOTE_THIS_GLASS_SUB =
  "What you smell and taste, and what you would give it — it attaches to the wine at the reveal";
export const NOTE_THIS_GLASS_SUB_LAPTOP = "Attaches to the wine at the reveal";

/** The viewer's own already-started hidden note on this glass, if any —
 *  reopens it instead of a blank sheet (spec §9.3 item 1). */
export type NoteThisGlassExisting = { noteId: string; assessed: string };

/** What play-experience.tsx computes once per glass and hands to every mount
 *  of this row — everything `NewNoteModal`'s hidden-glass target needs, plus
 *  the viewer's own note state. Null (computed by the caller via
 *  `canNoteHiddenGlass`) means this row is not offered at all. */
export type NoteThisGlassData = {
  tastingWineId: string;
  tastingName: string;
  glassLabel: string;
  existing: NoteThisGlassExisting | null;
};

export function NoteThisGlass({
  tastingWineId,
  tastingName,
  glassLabel,
  existing,
  layout,
}: NoteThisGlassData & { layout: "phone" | "laptop" | "link" }) {
  const [open, setOpen] = useState(false);
  const title = existing ? `Your note · ${existing.assessed}` : NOTE_THIS_GLASS;

  const sheet = open ? (
    <NewNoteModal
      target={{
        kind: "hidden-glass",
        tastingWineId,
        tastingName,
        glassLabel,
        noteId: existing?.noteId,
      }}
      onClose={() => setOpen(false)}
    />
  ) : null;

  if (layout === "link") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 w-full text-center text-[12.5px] font-semibold text-primary underline-offset-2 hover:underline"
        >
          {title}
        </button>
        {sheet}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center gap-[10px] rounded-[12px] border border-console-foreground/14 bg-console-card p-[13px_14px] text-left text-[13.5px] transition-colors hover:border-gold-light/60"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span>{title}</span>
          {existing ? null : (
            <span className="text-[11.5px] text-console-ink">
              {layout === "phone" ? NOTE_THIS_GLASS_SUB : NOTE_THIS_GLASS_SUB_LAPTOP}
            </span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-gold-light" aria-hidden />
      </button>
      {sheet}
    </>
  );
}
