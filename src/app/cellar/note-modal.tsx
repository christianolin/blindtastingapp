"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { fetchNoteView, type NoteView } from "@/lib/wset/queries";
import { composeLiveNote } from "@/lib/wset/live-note.mjs";
import { qualityBand } from "@/lib/wset/quality-curve.mjs";
import { LABELS } from "@/lib/wset/vocab";

const CAPTIONS: { key: keyof ReturnType<typeof composeLiveNote>; caption: string }[] = [
  { key: "appearance", caption: "Appearance" },
  { key: "nose", caption: "Nose" },
  { key: "palate", caption: "Palate" },
  { key: "conclusions", caption: "Conclusions" },
  { key: "taster", caption: "Taster's notes" },
];

const CONTEXT_LABEL: Record<string, string> = {
  OPEN: "Open tasting",
  BLIND: "Blind",
  TRAINING: "Training",
};

// Read-only view of a saved WSET note, shown in-place from the Cellar "My
// notes" list. Only the note + wine id are carried, so the note is fetched on
// open (like ArchetypeModal) and composed into prose by the live-note engine.
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
  const [view, setView] = useState<NoteView | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    fetchNoteView(supabase, noteId)
      .then((v) => {
        if (!cancelled) setView(v ?? null);
      })
      .catch(() => {
        if (!cancelled) setView(null);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, noteId]);

  const sections = useMemo(() => {
    if (!view || view === "loading") return [];
    const composed = composeLiveNote(view.state, view.termLabels, LABELS);
    return CAPTIONS.flatMap(({ key, caption }) =>
      composed[key] ? [{ caption, prose: composed[key] as string }] : [],
    );
  }, [view]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {view === "loading" || !view ? (
          <>
            <DialogTitle className="sr-only">Tasting note</DialogTitle>
            <p className="py-10 text-center text-sm text-muted-foreground">
              {view === "loading"
                ? "Loading note…"
                : "Couldn't load this note right now."}
            </p>
          </>
        ) : (
          <div className="flex max-h-[80vh] flex-col">
            <div className="flex items-start justify-between gap-3 pr-8">
              <div className="min-w-0">
                <DialogTitle className="text-lg leading-snug">{view.title}</DialogTitle>
                {view.subtitle ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{view.subtitle}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {new Date(view.tastedOn).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide">
                    {CONTEXT_LABEL[view.contextKind] ?? view.contextKind}
                  </span>
                </div>
              </div>
              {view.state.qualityScore != null ? (
                <div className="shrink-0 text-right">
                  <div className="font-heading text-2xl leading-none tabular-nums">
                    {view.state.qualityScore}
                  </div>
                  <div className="mt-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                    {qualityBand(view.state.qualityScore)}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex-1 overflow-y-auto pr-1">
              {sections.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  This note has no ratings yet.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {sections.map((s) => (
                    <div
                      key={s.caption}
                      className="rounded-lg border border-border bg-muted/30 p-3"
                    >
                      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                        {s.caption}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed">{s.prose}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end border-t border-border pt-3">
              <Link
                href={`/catalog/${wineId}/notes/${noteId}`}
                className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Open full note
              </Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
