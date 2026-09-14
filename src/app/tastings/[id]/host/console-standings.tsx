import { rankLabel, rankRows } from "@/lib/stats-math";
import { cn } from "@/lib/utils";
import type { ConsoleData } from "./console";

/**
 * The console's ranked standings list (S7's laptop rail; S7b's "All {n}"
 * popover) — one definition so the two surfaces can never disagree about
 * ranks or ties (dense ranks: a tie shares a rank and reads "=2"). `limit`
 * shows only the top rows (the phone's inline top-two preview); omitted,
 * every competitor shows.
 */
export function ConsoleStandings({
  rows,
  isSemiBlind,
  limit,
}: {
  rows: ConsoleData["standings"];
  isSemiBlind: boolean;
  limit?: number;
}) {
  const ranked = rankRows(rows, (r) => r.total);
  const anyTied = ranked.some((r) => r.tied);
  const shown = limit ? ranked.slice(0, limit) : ranked;

  return (
    <ol className="flex flex-col gap-px">
      {shown.map(({ row, rank, tied }) => (
        <li
          key={row.participantId}
          className="flex items-baseline gap-[10px] border-b border-border-light py-[9px] last:border-b-0"
        >
          <span
            className={cn(
              "font-heading text-[16px] lining-nums tabular-nums",
              anyTied ? "w-6" : "w-4",
              rank === 1 ? "text-gold-dark" : "text-muted-foreground",
            )}
          >
            {rankLabel({ rank, tied })}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[14px]",
              rank === 1 && "font-semibold",
            )}
          >
            {row.name}
          </span>
          {row.lastRoundPoints !== null ? (
            <span className="text-[11.5px] text-muted-foreground tabular-nums">
              {isSemiBlind
                ? row.lastRoundPoints > 0
                  ? "✓"
                  : "✗"
                : `+${row.lastRoundPoints}`}
            </span>
          ) : null}
          <span
            className={cn(
              "text-[14px] text-gold-dark tabular-nums",
              rank === 1 ? "font-bold" : "font-semibold",
            )}
          >
            {isSemiBlind ? `${row.total}/${row.totalWines}` : row.total}
          </span>
        </li>
      ))}
    </ol>
  );
}
