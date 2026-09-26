"use client";

// "Your sessions" (training-room spec §3.6): one line per attempt, newest
// first, twenty at a time with Show more (a (created_at, id) cursor), and
// Reveal now on an unrevealed attempt — the add-wine sheet's reveal variant,
// whose pick runs revealTrainingAttempt and opens the result. The parent keys
// this list on its first row, so a refreshed first page starts it afresh.
import { useState, useSyncExternalStore } from "react";
import { useAddWine } from "@/components/add-wine-context";
import { Button } from "@/components/ui/button";
import type { HistoryPage, TrainingAttemptDetail } from "@/lib/training/action-types";
import { SAVE_REFUSED } from "@/lib/training/attempt-payload";
import { TRAINING_COPY, attemptRowLine } from "@/lib/training/copy";
import { mergeHistoryRows } from "@/lib/training/result-math";
import type { AttemptRow } from "@/lib/training/types";
import { cn } from "@/lib/utils";
import { loadMoreTrainingHistory, loadTrainingAttempt, revealTrainingAttempt } from "./actions";

const TAP = "min-h-11 md:pointer-fine:min-h-0";

const noopSubscribe = () => () => {};

export function HistoryList({
  initial,
  onRevealed,
}: {
  initial: HistoryPage;
  onRevealed: (detail: TrainingAttemptDetail | null) => void;
}) {
  const { openAddWineSheet } = useAddWine();
  const [more, setMore] = useState<AttemptRow[]>([]);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = mergeHistoryRows(initial.rows, more);
  // A row's day is the viewer's (CLAUDE.md: the server's zone is not the
  // user's). The server and the hydration pass both write UTC, so they agree;
  // the client then re-renders in its own zone (undefined = the viewer's).
  const timeZone = useSyncExternalStore<string | undefined>(
    noopSubscribe,
    () => undefined,
    () => "UTC",
  );

  async function showMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const page = await loadMoreTrainingHistory(cursor);
      setMore((m) => [...m, ...page.rows]);
      setCursor(page.nextCursor);
    } catch (e) {
      // The button stays; the next tap tries the same page again.
      console.error("Training room: Show more failed", e instanceof Error ? e.message : typeof e);
    } finally {
      setLoading(false);
    }
  }

  async function revealPick(row: AttemptRow, catalogWineId: string) {
    setRevealing(row.id);
    setError(null);
    try {
      const res = await revealTrainingAttempt(row.id, catalogWineId);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      // Revealed either way: a failed read falls back to the landing, whose
      // refreshed history shows the scored row.
      onRevealed(await loadTrainingAttempt(row.id).catch(() => null));
    } catch {
      setError(SAVE_REFUSED);
    } finally {
      setRevealing(null);
    }
  }

  function revealNow(row: AttemptRow) {
    if (revealing) return;
    openAddWineSheet(
      { kind: "note", reveal: true },
      {
        onNotePick: (pick) => {
          void revealPick(row, pick.catalogWineId);
        },
      },
    );
  }

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <ul className="overflow-hidden rounded-[12px] border border-border-strong bg-card">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center gap-3 border-b border-border-light px-4 py-2.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1 text-[13px] leading-snug">{attemptRowLine(row, { timeZone })}</span>
            {row.actual === null ? (
              <Button
                variant="outline"
                className={cn(TAP, "shrink-0")}
                disabled={revealing !== null}
                onClick={() => revealNow(row)}
              >
                {TRAINING_COPY.revealNow}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {cursor ? (
        <Button variant="outline" className={cn(TAP, "w-full")} disabled={loading} onClick={() => void showMore()}>
          {TRAINING_COPY.showMore}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
