"use client";

import { useState } from "react";
import { Wine } from "lucide-react";
import { NoteModal } from "./note-modal";

export type NoteRow = {
  id: string;
  catalogWineId: string;
  title: string;
  subtitle: string | null;
  grapes: string | null;
  colour: "WHITE" | "ROSE" | "RED" | "ORANGE" | null;
  imageUrl: string | null;
  tastedOn: string;
  qualityScore: number | null;
  contextKind: "OPEN" | "BLIND" | "TRAINING";
  /** Up to five aroma/flavour descriptors picked on the sheet. */
  aromas: string[];
  /** Structural one-liners derived from the sheet: "dry", "high acid", … */
  structure: string[];
  /** The taster's own free text, if any. */
  preview: string | null;
};

// Only the non-default contexts earn a badge; an "Open tasting" tag on every
// row would just be noise.
const CONTEXT_BADGE: Record<string, string> = {
  BLIND: "Blind tasting",
  TRAINING: "Training",
};

// A note is a wine object with an opinion attached — the card leads with the
// bottle, then shows what the note actually says (descriptors, structure,
// the taster's words) instead of just a score and a date.
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
      <div className="flex flex-col gap-2.5">
        {notes.map((n) => {
          const badge = CONTEXT_BADGE[n.contextKind];
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => setOpen({ noteId: n.id, wineId: n.catalogWineId })}
              className="flex items-stretch gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/40 sm:gap-4"
            >
              {n.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={n.imageUrl}
                  alt=""
                  className="h-24 w-16 shrink-0 self-start rounded-md border border-border object-cover"
                />
              ) : (
                <span className="flex h-24 w-16 shrink-0 items-center justify-center self-start rounded-md border border-border bg-muted text-muted-foreground">
                  <Wine className="size-6" />
                </span>
              )}

              {/* Three zones — identity | tasting summary | score+date — so the
                  wide desktop card doesn't leave its right half empty. Phones
                  stack them back into one column. */}
              <span className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:gap-6">
                <span className="flex min-w-0 flex-col sm:w-60 sm:shrink-0">
                  <span className="line-clamp-2 font-medium">{n.title}</span>
                  {n.grapes ? (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {n.grapes}
                    </span>
                  ) : null}
                  {n.subtitle ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {n.subtitle}
                    </span>
                  ) : null}
                  {badge ? (
                    <span className="mt-1.5 self-start rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
                      {badge}
                    </span>
                  ) : null}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {n.aromas.length > 0 ? (
                    <span className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                        Aromas
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {n.aromas.map((a) => (
                          <span
                            key={a}
                            className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {a}
                          </span>
                        ))}
                      </span>
                    </span>
                  ) : null}
                  {n.structure.length > 0 ? (
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                        Structure
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {n.structure.join(" · ")}
                      </span>
                    </span>
                  ) : null}
                  {n.preview ? (
                    // The taster's own words — the human part of the note, so
                    // it reads darker than the structured metadata around it.
                    <span className="mt-1 line-clamp-2 text-sm italic leading-relaxed text-foreground/80">
                      “{n.preview}”
                    </span>
                  ) : null}
                </span>

                <span className="flex shrink-0 items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0.5">
                  {n.qualityScore != null ? (
                    <span className="font-heading text-2xl leading-none tabular-nums">
                      {n.qualityScore}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        pts
                      </span>
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {new Date(n.tastedOn).toLocaleDateString()}
                  </span>
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
