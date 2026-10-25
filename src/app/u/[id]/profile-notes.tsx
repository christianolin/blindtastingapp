"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/overview/eyebrow";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { NoteModal } from "@/components/wset/note-modal";
import {
  SHARED_NOTES_COPY,
  cappedFooter,
  opensInSheet,
  readNoteByline,
  showAllLabel,
  visibleNotes,
  type ProfileNoteRow,
} from "@/lib/notes/shared-notes-view";

/**
 * `/u/[id]`'s "Tasting notes" (sharing-defaults spec 2026-09-27 S3, §7.3;
 * every note public since 2026-10-25): the person's notes, newest first, each
 * a link to the note. A plain click opens the note in the WSET sheet —
 * read-only on someone else's profile, your own editor on yours. On your own
 * profile the heading says so, a line says everyone can read them, held notes
 * carry "Hidden from others" (Rule 1: a note on a wine in your own unrevealed
 * flight), and an empty list says so. On someone else's the page renders
 * nothing when there are no rows.
 */
export function ProfileNotes({
  rows,
  capped,
  own,
  authorName,
}: {
  rows: ProfileNoteRow[];
  /** The list was cut at the cap (capNotes): say so under it. */
  capped: boolean;
  /** Your own profile. */
  own: boolean;
  /** The profile's display name, for the read-only sheet's eyebrow. */
  authorName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<ProfileNoteRow | null>(null);
  const more = showAllLabel(rows.length);
  const footer = cappedFooter(capped);

  return (
    <section aria-labelledby="profile-notes" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="profile-notes">
          <Eyebrow size="lg">{own ? SHARED_NOTES_COPY.profileHeadingOwn : SHARED_NOTES_COPY.profileHeading}</Eyebrow>
        </h2>
        {own ? <p className="text-sm text-muted-foreground">{SHARED_NOTES_COPY.ownPublicLine}</p> : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{SHARED_NOTES_COPY.profileEmptyOwn}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleNotes(rows, expanded).map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                onClick={(e) => {
                  if (!opensInSheet(e)) return;
                  e.preventDefault();
                  setOpen(row);
                }}
                className="flex min-h-11 items-center gap-3 rounded-xl border border-border p-2.5 transition-colors hover:bg-muted/30"
              >
                <HatchThumb src={row.imageUrl} width={32} height={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{row.wineTitle}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="tabular-nums">{row.dateLabel}</span>
                    {row.badge ? (
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        {row.badge}
                      </Badge>
                    ) : null}
                    {row.held ? <span>{SHARED_NOTES_COPY.heldTag}</span> : null}
                  </span>
                </span>
                {/* The band under the number, as ProfileTastings' cards: a
                    one-line "88 · Above average" left a 375px phone's title
                    about 18 characters. */}
                <span className="shrink-0 text-right text-sm">
                  <span className="font-semibold tabular-nums">{row.scoreValue}</span>
                  {row.scoreBand ? (
                    <span className="block text-xs text-muted-foreground">{row.scoreBand}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {more ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="min-h-11 self-start rounded-md text-sm font-medium text-primary hover:underline md:pointer-fine:min-h-0"
        >
          {expanded ? SHARED_NOTES_COPY.showFewer : more}
        </button>
      ) : null}
      {footer ? <p className="text-xs text-muted-foreground">{footer}</p> : null}
      {open ? (
        <NoteModal
          noteId={open.id}
          wineId={open.wineId}
          readOnly={own ? undefined : { byline: readNoteByline(authorName, open.tastedOn) }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </section>
  );
}
