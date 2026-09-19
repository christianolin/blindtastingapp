"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BottleThumb } from "@/components/bottle-thumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { dayMonth, fmtScore } from "@/lib/cellar/format";
import {
  HISTORY_FILTERS,
  actionWord,
  filterCounts,
  filterLabel,
  filterRows,
  monthBuckets,
  monthLine,
  rowsInYear,
  showRestLabel,
  visibleBuckets,
  whereLine,
  yearBand,
  yearTotals,
  yearsPresent,
  type MonthBucket,
} from "@/lib/cellar/history-math";
import type { HistoryFilter, HistoryRow } from "@/lib/cellar/types";
import { NoteModal } from "@/components/wset/note-modal";
import { NewNoteModal } from "@/components/new-note-modal";

// CC-U6, spec §5.7 (screens C6, C6b); refinement 12 (consumptionId on
// NewNoteModal); refinement 22 ("at home"/LOST/OTHER counting rules live in
// history-math.ts, not here).
export function HistoryView({ rows }: { rows: HistoryRow[] }): React.JSX.Element {
  const router = useRouter();
  const years = useMemo(() => yearsPresent(rows), [rows]);
  const [year, setYear] = useState<number | null>(years[0] ?? null);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState<{ noteId: string; wineId: string } | null>(null);
  const [rate, setRate] = useState<{ wineId: string; consumptionId: string } | null>(
    null,
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="font-heading text-lg font-medium">Nothing drunk yet</p>
        <p className="text-sm text-muted-foreground">
          When you drink or remove a bottle it shows up here.
        </p>
      </div>
    );
  }

  const inYear = year == null ? [] : rowsInYear(rows, year);
  const totals = yearTotals(inYear);
  const counts = filterCounts(inYear);
  const shown = filterRows(inYear, filter);
  const buckets = monthBuckets(shown);
  const { buckets: visible, hiddenRows } = visibleBuckets(buckets, expanded);
  const bandPhone = year != null ? yearBand(totals, year, { phone: true }) : null;

  function changeYear(y: number) {
    setYear(y);
    setFilter("all");
    setExpanded(false);
  }

  const yearSelectLabel = "Year";
  function yearSelect(className?: string) {
    return (
      <select
        aria-label={yearSelectLabel}
        value={year ?? ""}
        onChange={(e) => changeYear(Number(e.target.value))}
        className={cn(
          "h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground md:pointer-fine:h-9",
          className,
        )}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 md:p-5">
        {/* Laptop band */}
        <div className="max-md:hidden flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p>
              <span className="font-heading text-4xl tabular-nums">
                {totals.bottles}
              </span>{" "}
              <span className="text-muted-foreground">bottles in {year}</span>
            </p>
            <p className="text-sm">
              <span className="font-semibold text-foreground">{totals.atTasting}</span> at a tasting{" · "}
              <span className="font-semibold text-foreground">{totals.atHome}</span> at home{" · "}
              <span className="font-semibold text-foreground">{totals.gifted}</span> gifted
            </p>
            <p className="text-sm">
              <span className="font-semibold text-foreground">{totals.writtenUp}</span> you wrote up{" · "}
              <span className="font-semibold text-foreground">{totals.notWrittenUp}</span> you did not
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-sm text-muted-foreground">{yearSelectLabel}</span>
            {yearSelect()}
          </div>
        </div>

        {/* Phone band */}
        <div className="md:hidden flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <p>
              <span className="font-heading text-3xl tabular-nums">
                {bandPhone?.headline}
              </span>{" "}
              <span className="text-sm text-muted-foreground">{bandPhone?.notes}</span>
            </p>
            {yearSelect()}
          </div>
          <p className="text-sm text-muted-foreground">{bandPhone?.split}</p>
        </div>
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
        {HISTORY_FILTERS.map((f) => {
          const pressed = f === filter;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={pressed}
              onClick={() => setFilter(f)}
              className={cn(
                "min-h-11 md:pointer-fine:min-h-8 shrink-0 rounded-full border px-3 text-sm",
                pressed
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="max-md:hidden">
                {filterLabel(f, counts[f], { phone: false })}
              </span>
              <span className="md:hidden">{filterLabel(f, counts[f], { phone: true })}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-4">
        {visible.map((bucket) => (
          <MonthSection
            key={bucket.key}
            bucket={bucket}
            onOpenNote={(n) => setNote(n)}
            onRate={(r) => setRate(r)}
          />
        ))}
      </div>

      {hiddenRows > 0 && year != null ? (
        <Button
          variant="outline"
          className="min-h-11 md:pointer-fine:min-h-9"
          onClick={() => setExpanded(true)}
        >
          {showRestLabel(year)}
        </Button>
      ) : null}

      {note ? (
        <NoteModal
          noteId={note.noteId}
          wineId={note.wineId}
          onClose={() => {
            setNote(null);
            router.refresh();
          }}
        />
      ) : null}
      {rate ? (
        <NewNoteModal
          wineId={rate.wineId}
          consumptionId={rate.consumptionId}
          onClose={() => {
            setRate(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function MonthSection({
  bucket,
  onOpenNote,
  onRate,
}: {
  bucket: MonthBucket;
  onOpenNote: (note: { noteId: string; wineId: string }) => void;
  onRate: (rate: { wineId: string; consumptionId: string }) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-2">
        <p className="font-heading text-base font-semibold">{bucket.label}</p>
        <p className="text-xs text-muted-foreground">
          <span className="max-md:hidden">{monthLine(bucket, { phone: false })}</span>
          <span className="md:hidden">{monthLine(bucket, { phone: true })}</span>
        </p>
      </div>
      {bucket.rows.map((row) => (
        <HistoryRowCard
          key={row.id}
          row={row}
          onOpenNote={onOpenNote}
          onRate={onRate}
        />
      ))}
    </div>
  );
}

function NoteCell({
  row,
  onOpenNote,
  onRate,
}: {
  row: HistoryRow;
  onOpenNote: (note: { noteId: string; wineId: string }) => void;
  onRate: (rate: { wineId: string; consumptionId: string }) => void;
}): React.JSX.Element {
  if (row.note) {
    return (
      <button
        type="button"
        onClick={() => onOpenNote({ noteId: row.note!.id, wineId: row.catalogWineId })}
        className="flex min-h-11 flex-col items-end justify-center text-right md:pointer-fine:min-h-0"
      >
        {row.note.score != null ? (
          <span className="font-semibold text-primary">{fmtScore(row.note.score)}</span>
        ) : null}
        <span className="text-[10px] text-muted-foreground">your note</span>
      </button>
    );
  }
  // A real bordered button, not a text link (owner: "i dont like
  // link-buttons"); 44 px tall on a phone, compact under a mouse.
  return (
    <Button
      variant="outline"
      size="sm"
      className="min-h-11 md:pointer-fine:min-h-0"
      onClick={() => onRate({ wineId: row.catalogWineId, consumptionId: row.id })}
    >
      + Note
    </Button>
  );
}

function HistoryRowCard({
  row,
  onOpenNote,
  onRate,
}: {
  row: HistoryRow;
  onOpenNote: (note: { noteId: string; wineId: string }) => void;
  onRate: (rate: { wineId: string; consumptionId: string }) => void;
}): React.JSX.Element {
  const where = whereLine(row, { phone: false });

  return (
    <div className="rounded-xl border border-border p-3">
      {/* Laptop row: the bottle photo leads, then the four columns as before. */}
      <div className="max-md:hidden grid grid-cols-[auto_1fr_8rem_5rem_4rem] items-start gap-x-3 gap-y-1">
        <BottleThumb src={row.imageUrl} className="h-12 w-9" />
        <Link href={`/catalog/${row.catalogWineId}`} className="font-medium">
          {row.title}
        </Link>
        <div className="text-sm text-muted-foreground">
          {where.kind === "tasting" ? (
            <>
              poured at{" "}
              <Link href={`/tastings/${where.tastingId}`} className="text-primary">
                {where.name}
              </Link>
            </>
          ) : (
            where.text
          )}
        </div>
        <div className="flex flex-col text-sm tabular-nums text-muted-foreground">
          <span>{actionWord(row)}</span>
          <span>{dayMonth(row.consumedOn)}</span>
        </div>
        <div className="justify-self-end">
          <NoteCell row={row} onOpenNote={onOpenNote} onRate={onRate} />
        </div>
      </div>

      {/* Phone row: the photo beside a text column. The title takes that
          column's full width on its own line; the note cell sits beside the
          two meta lines under it, so it never squeezes the title. */}
      <div className="md:hidden flex items-start gap-3">
        <BottleThumb src={row.imageUrl} className="h-12 w-9" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={`/catalog/${row.catalogWineId}`} className="font-medium">
            {row.title}
          </Link>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="text-sm tabular-nums text-muted-foreground">
                {actionWord(row)} · {dayMonth(row.consumedOn)}
              </div>
              <div className="text-sm text-muted-foreground">
                {where.kind === "tasting" ? (
                  <>
                    at{" "}
                    <Link href={`/tastings/${where.tastingId}`} className="text-primary">
                      {where.name}
                    </Link>
                  </>
                ) : (
                  where.text
                )}
              </div>
            </div>
            <div className="shrink-0">
              <NoteCell row={row} onOpenNote={onOpenNote} onRate={onRate} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
