"use client";

import { useMemo, useState } from "react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { CardEmptyRow } from "@/components/overview/subject-card";
import { NoteModal } from "@/components/wset/note-modal";
import { cn } from "@/lib/utils";
import { makeT } from "@/lib/wset/i18n";
import { NotesFilterChips, NotesSearchField } from "./notes-filters";
import {
  NOTES_LANG,
  PAGE_SIZE,
  dayLabel,
  filterCounts,
  groupByMonth,
  matchesFilter,
  matchesQuery,
  sectionsLabel,
  showMoreCount,
  sortNewestFirst,
  type NoteArchiveRow,
  type NoteFilter,
  type NoteSectionFlag,
} from "./notes-search";

const t = makeT(NOTES_LANG);

const EMPTY: Record<NoteFilter, string> = {
  all: t("no_notes_line"),
  complete: t("empty_complete"),
  unfinished: t("empty_unfinished"),
  from_tastings: t("empty_from_tastings"),
};

const LIST_CARD =
  "overflow-hidden rounded-[12px] border border-border-strong bg-card max-md:rounded-[11px]";

// The four section bars, binary (critic MISSED-13): bordeaux when every
// assessment in the section is done, muted otherwise — a section at 2 of 3
// reads "not finished". 22×5 on desktop, 17×4 on phones.
function SectionBars({
  sections,
  className,
}: {
  sections: readonly NoteSectionFlag[];
  className?: string;
}) {
  return (
    <span className={cn("flex shrink-0 gap-[3px]", className)} aria-hidden>
      {sections.map((section) => (
        <span
          key={section.labelKey}
          className={cn(
            "h-[5px] w-[22px] rounded-full max-md:h-1 max-md:w-[17px]",
            section.complete ? "bg-primary" : "bg-muted",
          )}
        />
      ))}
    </span>
  );
}

// Once per page, beside the first month heading, on desktop (T7); the phone
// mock carries none. Every row also reads its bars out to a screen reader.
function BarsLegend() {
  return (
    <span
      className="flex shrink-0 items-center gap-[9px] text-[11px] text-muted-foreground max-md:hidden"
      aria-hidden
    >
      <span className="flex items-center gap-1">
        <span className="h-[5px] w-[22px] rounded-full bg-primary" />
        {t("section_done")}
      </span>
      <span className="flex items-center gap-1">
        <span className="h-[5px] w-[22px] rounded-full bg-muted" />
        {t("not_finished")}
      </span>
    </span>
  );
}

/**
 * One note: label thumb (hatch fallback), wine title, the day, the tasting
 * chip, the four section bars, the score in Cormorant and a chevron into the
 * note view. A note with no catalog wine has no note view to open, so its row
 * is plain text with no chevron. On desktop the chip names the tasting; on
 * phones the meta line says "· from a tasting" and the bars sit under it.
 */
function NoteRowView({ row, onOpen }: { row: NoteArchiveRow; onOpen: (() => void) | null }) {
  const describedBy = `note-${row.id}-meta note-${row.id}-bars note-${row.id}-score`;
  const inner = (
    <>
      <HatchThumb src={row.imageUrl} width={36} height={48} className="max-md:hidden" />
      <HatchThumb src={row.imageUrl} width={28} height={38} className="md:hidden" />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="line-clamp-2 text-[14px] leading-[1.25] font-semibold max-md:text-[12.5px]">
          {row.title}
        </span>
        <span
          id={`note-${row.id}-meta`}
          className="flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground max-md:gap-1 max-md:text-[10.5px]"
        >
          <span className="shrink-0">{dayLabel(row.tastedOn, NOTES_LANG)}</span>
          {row.tastingWineId !== null ? (
            <>
              <span className="truncate md:hidden">· {t("from_a_tasting")}</span>
              <span className="truncate rounded-full border border-border bg-background px-2 py-px text-[10.5px] max-md:hidden">
                <span className="sr-only">{t("from_a_tasting")}: </span>
                {row.tastingName ?? t("from_a_tasting")}
              </span>
            </>
          ) : null}
        </span>
        <SectionBars sections={row.sections} className="md:hidden" />
      </span>
      <SectionBars sections={row.sections} className="max-md:hidden" />
      <span id={`note-${row.id}-bars`} className="sr-only">
        {sectionsLabel(t, row.sections)}
      </span>
      <span className="w-11 shrink-0 text-right font-heading text-[21px] leading-none font-semibold text-primary lining-nums tabular-nums max-md:w-auto max-md:min-w-6 max-md:text-[19px]">
        <span id={`note-${row.id}-score`} className="sr-only">
          {row.score !== null ? t("score_points", { n: row.score }) : t("not_scored")}
        </span>
        <span aria-hidden className={cn(row.score === null && "text-placeholder")}>
          {row.score ?? "—"}
        </span>
      </span>
      <span
        className={cn("w-2 text-[15px] leading-none text-placeholder", !onOpen && "invisible")}
        aria-hidden
      >
        ›
      </span>
    </>
  );
  const rowClass =
    "flex w-full items-center gap-[14px] p-[13px_16px] text-left text-foreground max-md:gap-2.5 max-md:p-[10px_12px]";
  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("open_note_on", { wine: row.title })}
      aria-describedby={describedBy}
      className={cn(
        rowClass,
        "transition-colors hover:bg-background focus-visible:bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
      )}
    >
      {inner}
    </button>
  ) : (
    <div className={rowClass}>{inner}</div>
  );
}

/**
 * The archive under the header: search, chips, the notes grouped by month and
 * "Show N more". Everything filters on the client over the author's full list
 * (the author's notes are bounded). Search narrows first and the chip counts
 * follow it; the header stats above always describe every note. A row opens
 * the note in the shared NoteModal, whose save refreshes the page's rows.
 */
export function NotesList({
  rows,
  currentYear,
}: {
  rows: NoteArchiveRow[];
  currentYear: number;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [open, setOpen] = useState<{ noteId: string; wineId: string } | null>(null);

  const sorted = useMemo(() => sortNewestFirst(rows), [rows]);
  const matched = useMemo(() => sorted.filter((row) => matchesQuery(row, query)), [sorted, query]);
  const counts = useMemo(() => filterCounts(matched), [matched]);
  const filtered = useMemo(
    () => matched.filter((row) => matchesFilter(row, filter)),
    [matched, filter],
  );
  const visible = filtered.slice(0, shown);
  const groups = groupByMonth(visible, NOTES_LANG, currentYear);
  const more = showMoreCount(filtered.length, visible.length);
  const trimmed = query.trim();

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-border px-6 py-14 text-center">
        <p className="font-heading text-xl font-semibold">{t("no_notes_title")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t("no_notes_hint")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <NotesSearchField
        query={query}
        onQueryChange={(next) => {
          setQuery(next);
          setShown(PAGE_SIZE);
        }}
      />
      <NotesFilterChips
        active={filter}
        counts={counts}
        onSelect={(next) => {
          setFilter(next);
          setShown(PAGE_SIZE);
        }}
      />

      {groups.length === 0 ? (
        <div className={LIST_CARD}>
          <CardEmptyRow>
            {trimmed !== "" ? t("no_notes_match", { q: trimmed }) : EMPTY[filter]}
          </CardEmptyRow>
        </div>
      ) : (
        groups.map((group, i) => (
          <section
            key={group.key}
            aria-labelledby={`notes-month-${group.key}`}
            className="flex flex-col gap-[9px] md:gap-2.5"
          >
            <div className="flex items-center gap-2.5 pt-0.5">
              <h2 id={`notes-month-${group.key}`} className="leading-none">
                <Eyebrow size="sm">{group.label}</Eyebrow>
              </h2>
              <span aria-hidden className="h-px flex-1 bg-border max-md:hidden" />
              {i === 0 ? <BarsLegend /> : null}
            </div>
            <ul className={LIST_CARD}>
              {group.rows.map((row) => (
                <li key={row.id} className="border-b border-border-light last:border-b-0">
                  <NoteRowView
                    row={row}
                    onOpen={
                      row.catalogWineId !== null
                        ? () => setOpen({ noteId: row.id, wineId: row.catalogWineId as string })
                        : null
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {more > 0 ? (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE_SIZE)}
          className="flex min-h-11 w-full items-center justify-center rounded-[10px] border border-border bg-card text-[12.5px] font-semibold text-primary transition-colors hover:border-gold hover:bg-background"
        >
          {t("show_n_more", { n: more })}
        </button>
      ) : null}

      {open ? (
        <NoteModal noteId={open.noteId} wineId={open.wineId} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}
