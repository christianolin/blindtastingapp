"use client";

import { useState } from "react";
import { useAddWine } from "@/components/add-wine-context";
import { addToFlight, searchAddWine } from "@/components/add-wine/actions";
import type { AddWineDestination } from "@/components/add-wine/types";
import { ADD_THESE, couldntMatchHeading, pickPasteMatch, splitPastedLines } from "./paste-list";

/**
 * "Paste a list" (spec §2.3 item 7; ledger B1; map CREATE-39): a controlled
 * textarea `FlightStep` opens inline under the flight, not a nested dialog.
 * "Add these" resolves each kept line, in order, through F13's
 * `searchAddWine` — catalog group only, exactly as the step's own inline
 * search calls it — then `pickPasteMatch`. A unique catalog match adds the
 * glass the same way an inline search hit does
 * (`addToFlight(destination, { kind: "catalog", ... })`); a line that
 * resolves to none or more than one catalog row is never guessed at — it
 * stays listed under `couldntMatchHeading` with its own "By hand", which
 * opens the by-hand form on this destination. A paste never adds a silent
 * incomplete glass.
 */
export function PasteListPanel({
  destination,
  onAdded,
}: {
  destination: Extract<AddWineDestination, { kind: "flight" }>;
  onAdded: () => void;
}) {
  const { openAddWineSheet } = useAddWine();
  const [text, setText] = useState("");
  const [resolving, setResolving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);

  const lines = splitPastedLines(text);

  async function addThese() {
    if (resolving || lines.length === 0) return;
    setResolving(true);
    setUnmatched([]);
    const misses: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      setProgress({ done: i, total: lines.length });
      const line = lines[i];
      // Exactly the step's own inline search call, catalog group only —
      // cellar lots and tasted-but-uncatalogued rows are never paste targets.
      const groups = await searchAddWine(line, { tastingId: destination.tastingId });
      const candidates = groups.catalog.map((c) => ({ id: c.catalogWineId, title: c.title }));
      const catalogWineId = pickPasteMatch(line, candidates);
      const added = catalogWineId
        ? await addToFlight(destination, { kind: "catalog", catalogWineId, via: "search" })
        : null;
      if (added && "ok" in added) {
        onAdded();
      } else {
        misses.push(line);
      }
    }
    setProgress(null);
    setResolving(false);
    setUnmatched(misses);
    setText("");
  }

  return (
    <div className="flex flex-col gap-[8px] rounded-[10px] border border-dashed border-border bg-background p-[12px_14px]">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="One wine per line — a producer, wine or vintage is enough"
        rows={4}
        disabled={resolving}
        className="min-h-[88px] resize-y rounded-[8px] border border-border bg-surface-raised p-[10px_12px] text-[13px] outline-none focus:border-primary disabled:opacity-70"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void addThese()}
          disabled={resolving || lines.length === 0}
          className="flex min-h-11 items-center justify-center rounded-[8px] border border-border bg-surface-raised px-[14px] text-[12.5px] font-semibold text-primary transition-colors hover:border-gold disabled:opacity-50 md:min-h-9"
        >
          {resolving && progress ? `Adding ${progress.done + 1} of ${progress.total}…` : ADD_THESE}
        </button>
        {!resolving && lines.length > 0 ? (
          <span className="text-[11.5px] text-muted-foreground">
            {lines.length} {lines.length === 1 ? "line" : "lines"}
          </span>
        ) : null}
      </div>

      {unmatched.length > 0 ? (
        <div className="flex flex-col gap-[6px] border-t border-border-light pt-[8px]">
          <span className="text-[12px] font-semibold text-gold-dark">
            {couldntMatchHeading(unmatched.length)}
          </span>
          <ul className="flex flex-col gap-[4px]">
            {unmatched.map((line, i) => (
              <li key={`${line}-${i}`} className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
                  {line}
                </span>
                <button
                  type="button"
                  onClick={() => openAddWineSheet(destination, { start: "byhand", onAdded })}
                  className="flex min-h-11 shrink-0 items-center rounded-[6px] border border-border bg-background px-3 text-[12px] font-semibold text-primary transition-colors hover:border-gold hover:bg-surface-raised md:min-h-8 md:px-2.5"
                >
                  By hand
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
