import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  sortable?: boolean;
  cell: (row: T) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
};

export type SortState = { key: string; dir: "asc" | "desc" };

// Generic, server-safe table: sortable headers render as Links (via
// `sortHrefFor`) so it works inside server components with `?sort=` URLs.
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sort,
  sortHrefFor,
  renderActions,
  footer,
  emptyLabel = "No results.",
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort?: SortState;
  sortHrefFor?: (key: string, dir: "asc" | "desc") => string;
  renderActions?: (row: T) => ReactNode;
  footer?: ReactNode;
  emptyLabel?: string;
  className?: string;
}) {
  return (
    <div
      data-slot="data-table"
      className={cn("overflow-hidden rounded-xl border border-border", className)}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
              {columns.map((c) => {
                const isSorted = sort?.key === c.key;
                const nextDir: "asc" | "desc" =
                  isSorted && sort?.dir === "asc" ? "desc" : "asc";
                const inner = (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      c.align === "right" && "flex-row-reverse",
                    )}
                  >
                    {c.header}
                    {c.sortable ? (
                      isSorted ? (
                        sort?.dir === "asc" ? (
                          <ArrowUp className="size-3.5" />
                        ) : (
                          <ArrowDown className="size-3.5" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3.5 opacity-40" />
                      )
                    ) : null}
                  </span>
                );
                return (
                  <th
                    key={c.key}
                    className={cn(
                      "px-4 py-3 font-medium",
                      c.align === "right" && "text-right",
                      c.headerClassName,
                    )}
                  >
                    {c.sortable && sortHrefFor ? (
                      <Link
                        href={sortHrefFor(c.key, nextDir)}
                        className="hover:text-foreground"
                      >
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </th>
                );
              })}
              {renderActions ? <th className="w-10 px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-4 py-3 align-middle",
                      c.align === "right" && "text-right",
                      c.cellClassName,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
                {renderActions ? (
                  <td className="px-4 py-3 text-right align-middle">
                    {renderActions(row)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : null}
      {footer ? <div className="border-t border-border p-3">{footer}</div> : null}
    </div>
  );
}

// Two-line cell with an optional thumbnail — the wine / producer primary cell.
export function TableCellStack({
  thumb,
  primary,
  secondary,
}: {
  thumb?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {thumb ? <span className="shrink-0">{thumb}</span> : null}
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{primary}</span>
        {secondary ? (
          <span className="block truncate text-xs text-muted-foreground">
            {secondary}
          </span>
        ) : null}
      </span>
    </div>
  );
}
