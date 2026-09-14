"use client";

// "Rate this wine" — the Answer card's counterpart to note-this-glass.tsx's
// pre-reveal "Note this glass": once a glass is resolved for the viewer
// (globally revealed, or their own immediate-mode guess scored), the Answer
// card offers the same filled button to open a WSET note on it. Shown to
// ANY viewer who reaches the Answer card (host, contributor, host-provides
// host, an ordinary guesser) — unlike NoteThisGlass, which is only offered
// to an eligible guesser before the reveal.
//
// Opening reuses existing paths rather than inventing one (BT-R5's
// glass-actions.tsx "Rate it"):
//   - an existing note (started hidden, pre-reveal, or on a wine rated
//     after the fact) reopens through NewNoteModal's "hidden-glass" target
//     with its noteId — same as note-this-glass.tsx's `existing` branch;
//     the target's resolver follows `catalog_wine_id`/`unidentified_wine_id`
//     to render it as an ordinary resolved note, whichever this glass has.
//   - no existing note, catalog wine: the add-wine provider's note
//     destination with a `{ catalogWineId, tastingWineId }` preselect.
//   - no existing note, unidentified wine: NewNoteModal's plain
//     `unidentifiedWineId` prop, mounted directly (no catalog page/preselect
//     plumbing exists for an unidentified wine).
import { useState } from "react";
import { Wine } from "lucide-react";
import { NewNoteModal } from "@/components/new-note-modal";
import { useAddWine } from "@/components/add-wine-context";
import { actionButtonClass } from "@/components/overview/action-button";
import type { NoteThisGlassExisting } from "./note-this-glass";

export const RATE_THIS_WINE = "Rate this wine";

/** What play-experience.tsx computes once per resolved glass. Null (the
 *  glass isn't resolved for this viewer yet) means this row isn't offered. */
export type RateThisWineData = {
  tastingWineId: string;
  tastingName: string;
  glassLabel: string;
  catalogWineId: string | null;
  unidentifiedWineId: string | null;
  existing: NoteThisGlassExisting | null;
};

export function RateThisWine({
  tastingWineId,
  tastingName,
  glassLabel,
  catalogWineId,
  unidentifiedWineId,
  existing,
}: RateThisWineData) {
  const { openAddWineSheet } = useAddWine();
  const [open, setOpen] = useState(false);

  if (!existing && !catalogWineId && !unidentifiedWineId) return null;

  const title = existing ? `Your note · ${existing.assessed}` : RATE_THIS_WINE;

  const onClick = () => {
    if (!existing && catalogWineId) {
      openAddWineSheet({ kind: "note" }, { preselect: { catalogWineId, tastingWineId } });
      return;
    }
    setOpen(true);
  };

  const sheet = open ? (
    existing ? (
      <NewNoteModal
        target={{
          kind: "hidden-glass",
          tastingWineId,
          tastingName,
          glassLabel,
          noteId: existing.noteId,
        }}
        onClose={() => setOpen(false)}
      />
    ) : unidentifiedWineId ? (
      <NewNoteModal
        unidentifiedWineId={unidentifiedWineId}
        tastingWineId={tastingWineId}
        contextKind="BLIND"
        onClose={() => setOpen(false)}
      />
    ) : null
  ) : null;

  return (
    <>
      <button type="button" onClick={onClick} className={actionButtonClass("primary")}>
        <Wine aria-hidden />
        {title}
      </button>
      {sheet}
    </>
  );
}
