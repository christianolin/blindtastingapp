"use client";

// "Your sessions" (training-room spec §3.6): one line per attempt, newest
// first, twenty at a time with Show more (a (created_at, id) cursor), and
// Reveal now on an unrevealed attempt — the add-wine sheet's reveal variant,
// whose pick runs revealTrainingAttempt and opens the result. Every row can be
// deleted (owner, 2026-09-27) with the app's two-tap confirm, since the
// session's tasting note goes with it. The parent keys this list on its first
// row, so a refreshed first page starts it afresh.
import { Trash2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAddWine } from "@/components/add-wine-context";
import { Button } from "@/components/ui/button";
import { TWO_TAP_WINDOW_MS, twoTapState } from "@/lib/console-copy";
import type { HistoryPage, TrainingAttemptDetail } from "@/lib/training/action-types";
import { SAVE_REFUSED } from "@/lib/training/attempt-payload";
import { TRAINING_COPY, attemptRowLine } from "@/lib/training/copy";
import { mergeHistoryRows } from "@/lib/training/result-math";
import type { AttemptRow } from "@/lib/training/types";
import { cn } from "@/lib/utils";
import { deleteTrainingSession, loadMoreTrainingHistory, loadTrainingAttempt, revealTrainingAttempt } from "./actions";

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
  // The two-tap delete: the row whose first tap is still live, the one being
  // deleted, and the ones already gone (hidden before the refreshed page lands).
  const [armed, setArmed] = useState<{ id: string; at: number } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<string[]>([]);
  const rows = mergeHistoryRows(initial.rows, more).filter((r) => !deleted.includes(r.id));

  // An armed row falls back to idle once the window passes.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), TWO_TAP_WINDOW_MS);
    return () => clearTimeout(t);
  }, [armed]);
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

  async function remove(row: AttemptRow) {
    if (deleting) return;
    if (armed?.id !== row.id || twoTapState(armed.at, Date.now()) !== "armed") {
      setError(null);
      setArmed({ id: row.id, at: Date.now() });
      return;
    }
    setArmed(null);
    setDeleting(row.id);
    setError(null);
    try {
      const res = await deleteTrainingSession(row.id);
      if ("error" in res) setError(res.error);
      else setDeleted((d) => [...d, row.id]);
    } catch (e) {
      console.error("Training room: session not deleted", e instanceof Error ? e.message : typeof e);
      setError(TRAINING_COPY.deleteSessionFailed);
    } finally {
      setDeleting(null);
    }
  }

  if (rows.length === 0) {
    return error ? (
      <p role="alert" className="text-[13px] text-destructive">
        {error}
      </p>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="overflow-hidden rounded-[12px] border border-border-strong bg-card">
        {rows.map((row) => {
          const line = attemptRowLine(row, { timeZone });
          const isArmed = armed?.id === row.id;
          return (
            <li
              key={row.id}
              className="flex items-center gap-2 border-b border-border-light py-2.5 pr-2 pl-4 last:border-b-0"
            >
              <span className="min-w-0 flex-1 text-[13px] leading-snug">{line}</span>
              {/* While this row's delete is armed (5 s), "Reveal now" steps
                  aside: on a phone the confirm and both buttons squeezed the
                  line to a sliver. */}
              {row.actual === null && !isArmed ? (
                <Button
                  variant="outline"
                  className={cn(TAP, "shrink-0")}
                  disabled={revealing !== null || deleting === row.id}
                  onClick={() => revealNow(row)}
                >
                  {TRAINING_COPY.revealNow}
                </Button>
              ) : null}
              <Button
                variant={isArmed ? "destructive" : "ghost"}
                size={isArmed ? "default" : "icon"}
                className={cn(TAP, "shrink-0", isArmed ? "px-3" : "min-w-11 md:pointer-fine:min-w-0")}
                disabled={deleting !== null || revealing === row.id}
                aria-label={
                  isArmed ? `${TRAINING_COPY.deleteSessionArmed}: ${line}` : `${TRAINING_COPY.deleteSession}: ${line}`
                }
                title={isArmed ? undefined : TRAINING_COPY.deleteSession}
                onClick={() => void remove(row)}
              >
                {isArmed ? TRAINING_COPY.deleteSessionArmed : <Trash2 aria-hidden className="size-4" />}
              </Button>
            </li>
          );
        })}
      </ul>
      <p aria-live="polite" className="text-[13px] text-muted-foreground">
        {armed ? TRAINING_COPY.deleteSessionHint : ""}
      </p>
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
