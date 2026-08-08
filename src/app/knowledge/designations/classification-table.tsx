"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";

export type ClassificationRow = {
  id: string;
  /** Cell values, in the same order as `columns`. */
  cells: (string | null)[];
  /** wine_places canonical key — renders the "on the map" button. */
  placeKey?: string | null;
  placeLabel?: string | null;
  /** Secondary line under the first cell. */
  note?: string | null;
};

// The searchable member table that sits to the right of a quality pyramid:
// same shape for every classification, so Bordeaux, Burgundy and Alsace read
// alike. The caller supplies already-filtered rows plus the tier selection.
export function ClassificationTable({
  columns,
  rows,
  query,
  onQueryChange,
  searchPlaceholder,
  summary,
  onClearFilter,
  mapColumnLabel = "Map",
}: {
  columns: string[];
  rows: ClassificationRow[];
  query: string;
  onQueryChange: (q: string) => void;
  searchPlaceholder: string;
  summary: string;
  onClearFilter?: () => void;
  mapColumnLabel?: string;
}) {
  const hasMap = rows.some((r) => r.placeKey);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="min-w-[180px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <span className="text-sm font-medium text-primary">{summary}</span>
        {onClearFilter ? (
          <button
            type="button"
            onClick={onClearFilter}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            Show all
          </button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card/60">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 font-medium">
                  {c}
                </th>
              ))}
              {hasMap ? (
                <th className="px-3 py-2 font-medium">{mapColumnLabel}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (hasMap ? 1 : 0)}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  No matches.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  {r.cells.map((cell, i) => (
                    <td
                      key={i}
                      className={
                        // nowrap only where there's room: on tablets the
                        // forced single-line cells inflated the table past
                        // its card and dragged the whole page sideways.
                        i === 0
                          ? "px-3 py-2"
                          : "px-3 py-2 text-muted-foreground lg:whitespace-nowrap"
                      }
                    >
                      {i === 0 ? (
                        <>
                          <span className="font-medium">{cell ?? "—"}</span>
                          {r.note ? (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {r.note}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        (cell ?? "—")
                      )}
                    </td>
                  ))}
                  {hasMap ? (
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.placeKey ? (
                        <Link
                          href={`/knowledge/map?place=${encodeURIComponent(r.placeKey)}`}
                          aria-label={`Show ${r.placeLabel ?? "place"} on the map`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm text-primary transition-colors hover:bg-muted"
                        >
                          <MapPin className="size-3.5" />
                          <span className="max-lg:hidden">
                            {r.placeLabel ?? "Map"}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
