"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { NoteModal } from "@/components/wset/note-modal";
import { dayMonthYear } from "@/lib/cellar/format";

export type YourNoteRow = {
  id: string;
  tastedOn: string;
  score: number | null;
  contextKind: string | null;
};

/**
 * "Your notes" on a wine's catalog page (CC-C2, spec §6.2 item 5): the
 * viewer's own notes on this wine, newest first, each opening the full
 * `NoteModal` editor rather than navigating to its own page.
 */
export function YourNotes({
  wineId,
  notes,
}: {
  wineId: string;
  notes: YourNoteRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<{ noteId: string } | null>(null);

  if (notes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You haven&apos;t tasted this wine yet.
      </p>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {notes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => setOpen({ noteId: n.id })}
              className="flex min-h-11 w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
            >
              <span className="flex items-center gap-2">
                {dayMonthYear(n.tastedOn)}
                {n.contextKind === "BLIND" ? (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    Blind
                  </Badge>
                ) : null}
              </span>
              <span className="font-medium">
                {n.score != null ? `${n.score} pts` : "unscored"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <NoteModal
          noteId={open.noteId}
          wineId={wineId}
          onClose={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
