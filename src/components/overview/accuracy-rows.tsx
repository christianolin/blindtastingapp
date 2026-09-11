import { cn } from "@/lib/utils";

export type BarTone = "primary" | "gold" | "rose";

const TONE: Record<BarTone, string> = {
  primary: "bg-primary",
  gold: "bg-gold",
  rose: "bg-rose",
};

// The handoff's rule for hit-rate bars: at least 50% bordeaux, 30–49% gold,
// below that rose.
export function toneForPct(pct: number): BarTone {
  if (pct >= 50) return "primary";
  if (pct >= 30) return "gold";
  return "rose";
}

/**
 * Label / track / value rows ("What you get right", "Where you taste best").
 * `pct` drives the bar width (0–100); `value` is the text shown on the right
 * (defaults to `{pct}%`). Tone defaults to the hit-rate rule; pass one per row
 * to colour by something else (a share of the best, say).
 */
export function AccuracyRows({
  rows,
  trackHeight = 7,
  labelWidth = 72,
  valueWidth = 30,
  className,
}: {
  rows: { label: string; pct: number; value?: string; tone?: BarTone }[];
  trackHeight?: 6 | 7;
  labelWidth?: number;
  valueWidth?: number | "auto";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-[9px] max-md:gap-2", className)}>
      {rows.map((r) => {
        const pct = Math.max(0, Math.min(100, r.pct));
        const tone = r.tone ?? toneForPct(pct);
        const value = r.value ?? `${Math.round(pct)}%`;
        return (
          <span
            key={r.label}
            className="flex items-center gap-[9px] text-[11.5px]"
            title={`${r.label}: ${value}`}
          >
            <span
              className="shrink-0 truncate text-muted-foreground"
              style={{ width: labelWidth }}
            >
              {r.label}
            </span>
            <span
              className="block flex-1 overflow-hidden rounded-full bg-muted"
              style={{ height: trackHeight }}
            >
              <span
                className={cn("block h-full rounded-full", TONE[tone])}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span
              className={cn(
                "shrink-0 text-muted-foreground tabular-nums",
                valueWidth !== "auto" && "text-right",
              )}
              style={valueWidth === "auto" ? undefined : { width: valueWidth }}
            >
              {value}
            </span>
          </span>
        );
      })}
    </div>
  );
}
