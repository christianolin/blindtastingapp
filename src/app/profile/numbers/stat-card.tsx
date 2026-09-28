import type { ReactNode } from "react";
import { Eyebrow } from "@/components/overview/eyebrow";
import type { BarTone } from "@/components/overview/accuracy-rows";
import { cn } from "@/lib/utils";

/**
 * The Your numbers chart card: bordered raised parchment, 16/18 padding
 * (14/16 on phones), a mono eyebrow first, then the chart. `empty` swaps the
 * body for a one-line muted note so a card with no data still shows what it
 * would hold instead of an empty plot.
 *
 * Optional and additive (profile achievements card spec 2026-09-28 §3.1):
 * `headingId` makes the title a real h2 that labels the section (for a card
 * with sub-headings); `action` puts a right-aligned control on the title's
 * row. With neither, the markup is exactly the plain card
 * (stat-card.test.tsx pins it).
 */
export function StatCard({
  title,
  empty,
  children,
  className,
  headingId,
  action,
}: {
  title: string;
  empty?: string | null;
  children?: ReactNode;
  className?: string;
  headingId?: string;
  action?: ReactNode;
}) {
  const eyebrow = <Eyebrow size="sm">{title}</Eyebrow>;
  const heading = headingId ? (
    <h2 id={headingId} className="leading-none">
      {eyebrow}
    </h2>
  ) : (
    eyebrow
  );
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border-strong bg-card p-[16px_18px] max-md:p-[14px_16px]",
        className,
      )}
    >
      {action ? (
        <div className="flex items-center gap-2.5">
          {heading}
          <div className="ml-auto">{action}</div>
        </div>
      ) : (
        heading
      )}
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
  labelClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  labelClassName?: string;
}) {
  return (
    <span className="flex items-baseline justify-between gap-3 text-[12px]">
      <span className={cn("shrink-0 text-muted-foreground", labelClassName)}>{label}</span>
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
