import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// A row of headline stats under a card title: Cormorant numeral over a small
// muted label. Desktop 27px / 11px in a left-packed row; phones 21px / 10px in
// three equal columns spanning the card, so the stats never bunch up on the
// left with empty space on the right.
export function StatTrio({
  stats,
  className,
}: {
  stats: { value: ReactNode; label: string }[];
  className?: string;
}) {
  return (
    <div className={cn("flex gap-5 max-md:grid max-md:grid-cols-3 max-md:gap-3", className)}>
      {stats.map((s) => (
        <span key={s.label} className="flex flex-col gap-0.5 max-md:gap-px">
          <span className="font-heading text-[27px] leading-none font-semibold lining-nums tabular-nums max-md:text-[21px]">
            {s.value}
          </span>
          <span className="text-[11px] text-muted-foreground max-md:text-[10px]">
            {s.label}
          </span>
        </span>
      ))}
    </div>
  );
}
