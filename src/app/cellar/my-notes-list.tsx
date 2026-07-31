"use client";

import { useState } from "react";
import { NoteModal } from "./note-modal";

export type NoteRow = {
  id: string;
  catalogWineId: string;
  title: string;
  subtitle: string | null;
  grapes: string | null;
  colour: "WHITE" | "ROSE" | "RED" | "ORANGE" | null;
  tastedOn: string;
  qualityScore: number | null;
  contextKind: "OPEN" | "BLIND" | "TRAINING";
};

// Colour of the little origin dot on each row — a quick visual scan cue.
const COLOUR_DOT: Record<string, string> = {
  RED: "#7B1E3A",
  WHITE: "#D9B84B",
  ROSE: "#E1969F",
  ORANGE: "#CE7B3C",
};

// Only the non-default contexts earn a badge; an "Open tasting" tag on every
// row would just be noise.
const CONTEXT_BADGE: Record<string, string> = {
  BLIND: "Blind",
  TRAINING: "Training",
};

export function MyNotesList({ notes }: { notes: NoteRow[] }) {
  const [open, setOpen] = useState<{ noteId: string; wineId: string } | null>(
    null,
  );

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="font-heading text-lg font-medium">No tasting notes yet</p>
        <p className="text-sm text-muted-foreground">
          Notes you write on the WSET sheet show up here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {notes.map((n) => {
          const badge = CONTEXT_BADGE[n.contextKind];
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => setOpen({ noteId: n.id, wineId: n.catalogWineId })}
              className="flex items-start justify-between gap-3 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:bg-muted/40"
            >
              <span className="flex min-w-0 gap-3">
                <span
                  aria-hidden
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ background: COLOUR_DOT[n.colour ?? ""] ?? "#B3A18B" }}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{n.title}</span>
                  {n.subtitle ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {n.subtitle}
                    </span>
                  ) : null}
                  {n.grapes ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {n.grapes}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="flex items-center gap-2">
                  {badge ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                      {badge}
                    </span>
                  ) : null}
                  {n.qualityScore != null ? (
                    <span className="font-heading text-lg leading-none tabular-nums">
                      {n.qualityScore}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(n.tastedOn).toLocaleDateString()}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {open ? (
        <NoteModal
          noteId={open.noteId}
          wineId={open.wineId}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
