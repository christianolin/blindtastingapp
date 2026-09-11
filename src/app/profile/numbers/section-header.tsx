import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A stats section's header row: Cormorant h2, the muted summary line beside
 * it, and the link pill on the right. Sections after the first carry a top
 * rule with 22px of padding above the row — desktop only: the phone mockup
 * stacks control, headings and cards in one column at a constant 14px gap
 * with no rules, so below `md` the rule and its padding are dropped.
 */
export function SectionHeader({
  title,
  summary,
  pill,
  rule = false,
}: {
  title: string;
  summary: string;
  pill: ReactNode;
  rule?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        rule && "border-t border-border pt-[22px] max-md:border-t-0 max-md:pt-0",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5 max-md:gap-x-[9px]">
        <h2 className="font-heading text-[26px] leading-none font-semibold max-md:text-[23px]">
          {title}
        </h2>
        <p className="text-[13px] text-muted-foreground max-md:text-[12px]">
          {summary}
        </p>
      </div>
      {pill}
    </div>
  );
}
