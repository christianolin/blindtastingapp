"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { fetchCatalogWine, catalogWineTitle } from "@/lib/wset/queries";
import { emptyNoteState } from "@/lib/wset/note-state";
import type {
  AromaTerm,
  WineColour,
  WineStyle,
  WsetNoteState,
} from "@/lib/wset/types";
import { NoteEditor } from "@/app/catalog/[wineId]/notes/note-editor";

type Data = {
  wine: { colour: WineColour; style: WineStyle };
  title: string;
  terms: AromaTerm[];
  initial: WsetNoteState;
};

// Taste & Rate opens the WSET note as a popup — full-screen on phones, a centred
// card on desktop — instead of navigating to the /catalog note page. It renders
// the very same editor the note route uses, so save/discard behave identically;
// the wine + aroma vocabulary are fetched on open.
export function NewNoteModal({
  wineId,
  onClose,
}: {
  wineId: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Data | null | "loading">("loading");

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
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="inset-0 block max-w-none translate-x-0 translate-y-0 gap-0 overflow-x-hidden overflow-y-auto rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[90vh] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:gap-4 sm:rounded-xl"
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
            embedded
            onClose={onClose}
            onSaved={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
