"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { fetchCatalogWine, catalogWineTitle } from "@/lib/wset/queries";
import { noteStateFromRow } from "@/lib/wset/note-state";
import type {
  AromaTerm,
  WineColour,
  WineStyle,
  WsetNoteState,
} from "@/lib/wset/types";
import { NoteEditor } from "@/app/catalog/[wineId]/notes/note-editor";
import type { WsetSheetHandle } from "@/components/wset/wset-sheet";

type EditData = {
  wine: { colour: WineColour; style: WineStyle };
  title: string;
  terms: AromaTerm[];
  initial: WsetNoteState;
};

// Opens a saved note as the full WSET sheet — the very editor the note page
// uses — so a taster can review AND edit it in place: from the Tasting notes
// archive (/taste/notes) and from a bottle's "Show note" in the cellar. Data is
// fetched on open by note id. The notes read policy is public, so privacy is
// the caller's job: pass only the signed-in author's own notes. NoteEditor owns
// saving.
export function NoteModal({
  noteId,
  wineId,
  onClose,
}: {
  noteId: string;
  wineId: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<EditData | null | "loading">("loading");
  const sheetRef = useRef<WsetSheetHandle>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [wine, noteRes, aromaRes, termRes] = await Promise.all([
        fetchCatalogWine(supabase, wineId),
        supabase.from("wset_notes").select("*").eq("id", noteId).maybeSingle(),
        supabase
          .from("wset_note_aromas")
          .select("term_id, sensed_on_nose, sensed_on_palate")
          .eq("note_id", noteId),
        supabase
          .from("wset_aroma_terms")
          .select("id, family, origin, group_name, term, sort_order")
          .order("sort_order"),
      ]);
      if (cancelled) return;
      if (!wine || !noteRes.data) {
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
        initial: noteStateFromRow(noteRes.data, aromaRes.data ?? []),
      });
    })().catch(() => {
      if (!cancelled) setData(null);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, noteId, wineId]);

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
        className="inset-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[92vh] sm:max-h-[92vh] sm:max-w-[1100px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:gap-4 sm:rounded-[16px]"
      >
        <DialogTitle className="sr-only">Tasting note</DialogTitle>
        {data === "loading" ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Loading note…
          </p>
        ) : !data ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Couldn&apos;t load this note right now.
          </p>
        ) : (
          <NoteEditor
            wineId={wineId}
            wine={data.wine}
            title={data.title}
            terms={data.terms}
            initial={data.initial}
            onClose={onClose}
            embedded
            sheetRef={sheetRef}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
