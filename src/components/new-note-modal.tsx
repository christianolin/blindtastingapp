"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { fetchCatalogWine, catalogWineTitle } from "@/lib/wset/queries";
import { emptyNoteState } from "@/lib/wset/note-state";
import { noteSavedReport } from "@/lib/wset/note-saved";
import type { NoteSummary } from "@/lib/wset/note-summary";
import type {
  AromaTerm,
  WineColour,
  WineStyle,
  WsetNoteState,
} from "@/lib/wset/types";
import { NoteEditor } from "@/app/catalog/[wineId]/notes/note-editor";
import { useNoteSavedStep } from "@/components/note-saved-sheet";
import type { WsetSheetHandle } from "@/components/wset/wset-sheet";

type Data = {
  wine: { colour: WineColour; style: WineStyle };
  title: string;
  terms: AromaTerm[];
  initial: WsetNoteState;
};

/** What a save hands back (Taste & Rate ledger R6): the note's id and its summary. */
export type NoteSaved = { savedId: string; summary: NoteSummary };

// Taste & Rate opens the WSET note as a popup — full-screen on phones, a centred
// card on desktop — instead of navigating to the /catalog note page. It renders
// the very same editor the note route uses, so save/discard behave identically;
// the wine + aroma vocabulary are fetched on open. After a save it reports to
// the provider's after-save step (R6), which shows "Note saved" as this modal
// closes — on every path that opens it, after the first save of a new note.
export function NewNoteModal({
  wineId,
  onClose,
  cellarConsume = null,
  tastingWineId = null,
  contextKind = null,
  onSaved,
}: {
  wineId: string;
  onClose: () => void;
  cellarConsume?: { lotId: string } | null;
  /** Attaches the note to a tasting wine (group Taste & Rate scoring). */
  tastingWineId?: string | null;
  contextKind?: string | null;
  /** Extra work after save (e.g. refresh the tasting board), handed the saved
      note's id and summary; the modal closes afterwards. */
  onSaved?: (saved: NoteSaved) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null | "loading">("loading");
  const sheetRef = useRef<WsetSheetHandle>(null);
  const reportNoteSaved = useNoteSavedStep();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [wine, termRes] = await Promise.all([
        fetchCatalogWine(supabase, wineId),
        supabase
          .from("wset_aroma_terms")
          .select("id, family, origin, group_name, term, sort_order")
          .order("sort_order"),
      ]);
      if (cancelled) return;
      if (!wine) {
        setData(null);
        return;
      }
      const terms: AromaTerm[] = (termRes.data ?? []).map((t) => ({
        id: t.id,
        family: t.family,
        origin: t.origin,
        groupName: t.group_name,
        term: t.term,
        sortOrder: t.sort_order,
      }));
      setData({
        wine: { colour: wine.colour ?? "RED", style: wine.style ?? "STILL" },
        title: catalogWineTitle(wine),
        terms,
        initial: emptyNoteState(),
      });
    })().catch(() => {
      if (!cancelled) setData(null);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, wineId]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return;
        // Escape and the backdrop take the sheet's own close path (the Discard
        // confirm while dirty); before the sheet mounts there is nothing to lose.
        if (sheetRef.current) sheetRef.current.requestClose();
        else onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        // Wider on big screens: the sheet reads small on a desktop monitor, so
        // the dialog takes more of the viewport (capped) and the .wset-sheet
        // desktop scale in globals.css enlarges its type to match.
        className="inset-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[92vh] sm:max-h-[92vh] sm:w-[calc(100vw-3rem)] sm:max-w-[1100px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:gap-4 sm:rounded-[16px] lg:max-w-[1400px]"
      >
        <DialogTitle className="sr-only">Tasting note</DialogTitle>
        {data === "loading" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : !data ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load this wine right now.
          </p>
        ) : (
          <NoteEditor
            wineId={wineId}
            wine={data.wine}
            title={data.title}
            terms={data.terms}
            initial={data.initial}
            contextKind={contextKind}
            tastingWineId={tastingWineId}
            embedded
            sheetRef={sheetRef}
            onClose={onClose}
            onSaved={async (savedId, saved) => {
              // A cellar bottle is drawn down only now that the note is saved.
              if (cellarConsume && savedId) {
                await supabase.rpc("consume_cellar_lot", {
                  p: {
                    lot_id: cellarConsume.lotId,
                    quantity: 1,
                    reason: "DRANK",
                    wset_note_id: savedId,
                  },
                });
              }
              if (savedId) {
                const report = noteSavedReport({
                  savedId,
                  saved,
                  style: data.wine.style,
                  title: data.title,
                  catalogWineId: wineId,
                });
                onSaved?.({ savedId, summary: report.summary });
                // The provider-level step: "Note saved" takes this modal's
                // place as it closes, unless it is an edit or was dismissed.
                reportNoteSaved?.(report);
              }
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
