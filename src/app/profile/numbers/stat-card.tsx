import type { ReactNode } from "react";
import { Eyebrow } from "@/components/overview/eyebrow";
import type { BarTone } from "@/components/overview/accuracy-rows";
import { cn } from "@/lib/utils";

/**
 * The Your numbers chart card: bordered raised parchment, 16/18 padding
 * (14/16 on phones), a mono eyebrow first, then the chart. `empty` swaps the
 * body for a one-line muted note so a card with no data still shows what it
 * would hold instead of an empty plot.
 */
export function StatCard({
  title,
  empty,
  children,
  className,
}: {
  title: string;
  empty?: string | null;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border-strong bg-card p-[16px_18px] max-md:p-[14px_16px]",
        className,
      )}
    >
      <Eyebrow size="sm">{title}</Eyebrow>
      {empty ? (
        <p className="text-[12.5px] text-muted-foreground italic">{empty}</p>
      ) : (
        children
      )}
    </section>
  );
}

/** The three-up card grid: 2-up under 1100px, 1-up under 820px. */
export function StatCardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-[18px] min-[820px]:grid-cols-2 min-[1100px]:grid-cols-3">
      {children}
    </div>
  );
}

/**
 * The rule-topped footer block under a chart (best score / trend, oldest /
 * median vintage, added / opened).
 */
export function StatFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-[5px] border-t border-border-light pt-[11px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One "label … value" footer row: muted label left, bold value right. */
export function StatFooterRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <span className="flex items-baseline justify-between gap-3 text-[12px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right font-semibold tabular-nums",
          valueClassName,
        )}
      >
        {value}
      </span>
    </span>
  );
}

// Tone for a bar drawn relative to the best row (its share of the maximum):
// at least 70% bordeaux, at least 45% gold, below that rose. Used for "Where
// you taste best" and the top-grape rows, whose widths are relative to the
// top entry rather than a hit rate.
export function toneForShare(pct: number): BarTone {
  if (pct >= 70) return "primary";
  if (pct >= 45) return "gold";
  return "rose";
}
