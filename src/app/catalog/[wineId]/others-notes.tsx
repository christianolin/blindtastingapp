"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  SHARED_NOTES_COPY,
  cappedFooter,
  showAllLabel,
  visibleNotes,
  type OthersNoteRow,
} from "@/lib/notes/shared-notes-view";

/**
 * "Notes from others" on a wine's catalog page (sharing-defaults spec
 * 2026-09-27 S3, S16, §7.2): other people's notes the viewer may read,
 * newest first. Each row is two sibling links, never nested — the author to
 * their profile, the rest to the note's read view. Five show; "Show all"
 * expands in place. The page renders nothing when there are no rows.
 */
export function OthersNotes({ rows, capped }: { rows: OthersNoteRow[]; capped: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const more = showAllLabel(rows.length);
  const footer = cappedFooter(capped);

  return (
    <section aria-labelledby="others-notes" className="flex flex-col gap-2">
      <h2 id="others-notes" className="text-sm font-medium">
        {SHARED_NOTES_COPY.othersHeading}
      </h2>
      <ul className="flex flex-col gap-2">
        {visibleNotes(rows, expanded).map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-1 rounded-lg border border-border p-1.5 sm:flex-row sm:items-stretch sm:gap-3"
          >
            <Link
              href={row.author.href}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-md px-1.5 text-sm font-medium hover:bg-muted sm:w-44"
            >
              {row.author.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.author.avatarUrl}
                  alt=""
                  className="size-8 shrink-0 rounded-full object-cover ring-1 ring-border"
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs"
                >
                  {row.author.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="truncate">{row.author.name}</span>
            </Link>
            <Link
              href={row.href}
              className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md px-1.5 hover:bg-muted"
            >
              <span className="flex items-center gap-2 text-sm">
                <span className="tabular-nums">{row.dateLabel}</span>
                {row.badge ? (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    {row.badge}
                  </Badge>
                ) : null}
                <span className="ml-auto shrink-0 font-medium tabular-nums">{row.score}</span>
              </span>
              {row.summary ? (
                <span className="truncate text-xs text-muted-foreground">{row.summary}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {more ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="min-h-11 self-start rounded-md px-1.5 text-sm font-medium text-primary hover:underline md:pointer-fine:min-h-0"
        >
          {expanded ? SHARED_NOTES_COPY.showFewer : more}
        </button>
      ) : null}
      {footer ? <p className="text-xs text-muted-foreground">{footer}</p> : null}
    </section>
  );
}
