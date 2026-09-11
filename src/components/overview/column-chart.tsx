import { cn } from "@/lib/utils";

export type ColumnTone = "oldest" | "gold" | "primary" | "rose";

const TONE: Record<ColumnTone, string> = {
  oldest: "bg-chart-oldest",
  gold: "bg-gold",
  primary: "bg-primary",
  rose: "bg-rose",
};

// Oldest → newest shading for a time series: the first quarter of the columns
// in the faded parchment, the middle in gold, the newest in bordeaux (the
// handoff's 2 / 3 / 3 split for eight columns).
export function toneByPosition(i: number, n: number): ColumnTone {
  if (n <= 1) return "primary";
  const t = (i + 1) / n;
  if (t <= 0.25) return "oldest";
  if (t <= 0.625) return "gold";
  return "primary";
}

export type ColumnChartAxis =
  | { kind: "per-column" }
  | { kind: "ends"; start: string; end: string };

/**
 * A row of equal-width columns at a fixed plot height. Counts can sit above
 * each column; the axis is either one label under each column or a two-ended
 * pair. Column heights are relative to the tallest column; a zero column shows
 * a 2px stub so the slot is still visible. Every column carries a `title`.
 */
export function ColumnChart({
  columns,
  height = 100,
  gap = 5,
  showCounts = false,
  axis,
  className,
}: {
  columns: { value: number; label?: string; tone?: ColumnTone }[];
  height?: number;
  gap?: number;
  showCounts?: boolean;
  axis?: ColumnChartAxis;
  className?: string;
}) {
  const max = Math.max(1, ...columns.map((c) => c.value));
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-end" style={{ height, gap }}>
        {columns.map((c, i) => {
          const tone = c.tone ?? toneByPosition(i, columns.length);
          const pct = (c.value / max) * 100;
          return (
            <span
              key={`${c.label ?? ""}-${i}`}
              className="flex h-full flex-1 flex-col items-center justify-end gap-[5px]"
              title={`${c.label ?? `#${i + 1}`}: ${c.value}`}
            >
              {showCounts ? (
                <span className="text-[11px] leading-none text-muted-foreground tabular-nums">
                  {c.value}
                </span>
              ) : null}
              <span
                className={cn("block w-full rounded-t-[3px]", TONE[tone])}
                style={{ height: `max(2px, ${pct}%)` }}
              />
            </span>
          );
        })}
      </div>
      {axis?.kind === "per-column" ? (
        <div
          className="flex text-center text-[10.5px] text-muted-foreground"
          style={{ gap }}
        >
          {columns.map((c, i) => (
            <span key={`${c.label ?? ""}-${i}`} className="flex-1 truncate">
              {c.label}
            </span>
          ))}
        </div>
      ) : axis?.kind === "ends" ? (
        <div className="flex justify-between text-[10.5px] text-muted-foreground">
          <span>{axis.start}</span>
          <span>{axis.end}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Two-part columns per period — `added` (bordeaux, rounded top) stacked over
 * `removed` (gold) with a 2px gap — plus the swatch legend and a two-ended
 * axis ("Apr → Sep").
 */
export function StackedColumnChart({
  columns,
  height = 100,
  gap = 5,
  legend = { added: "added", removed: "drunk" },
  className,
}: {
  columns: { label: string; added: number; removed: number }[];
  height?: number;
  gap?: number;
  legend?: { added: string; removed: string };
  className?: string;
}) {
  const max = Math.max(1, ...columns.map((c) => c.added + c.removed));
  const first = columns[0]?.label ?? "";
  const last = columns[columns.length - 1]?.label ?? "";
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-end" style={{ height, gap }}>
        {columns.map((c) => (
          <span
            key={c.label}
            className="flex h-full flex-1 flex-col justify-end gap-[2px]"
            title={`${c.label}: ${c.added} ${legend.added}, ${c.removed} ${legend.removed}`}
          >
            {c.added > 0 ? (
              <span
                className="block w-full rounded-t-[3px] bg-primary"
                style={{ height: `${(c.added / max) * 100}%` }}
              />
            ) : null}
            {c.removed > 0 ? (
              <span
                className="block w-full bg-gold"
                style={{ height: `${(c.removed / max) * 100}%` }}
              />
            ) : null}
            {c.added === 0 && c.removed === 0 ? (
              <span className="block h-[2px] w-full bg-chart-oldest" />
            ) : null}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-[5px]">
          <span className="size-[9px] rounded-[2px] bg-primary" />
          {legend.added}
        </span>
        <span className="flex items-center gap-[5px]">
          <span className="size-[9px] rounded-[2px] bg-gold" />
          {legend.removed}
        </span>
        <span className="ml-auto">
          {first} → {last}
        </span>
      </div>
    </div>
  );
}
