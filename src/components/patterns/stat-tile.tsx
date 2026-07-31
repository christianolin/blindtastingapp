import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/ui/tooltip";

// Soft tinted icon chips — what makes the stat rows feel alive in the prototypes.
const TINTS = {
  muted: "bg-muted text-muted-foreground",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  gold: "bg-gold/15 text-gold-deep",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  green: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
} as const;

export function StatStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="stat-strip"
      className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}
    >
      {children}
    </div>
  );
}

export function StatTile({
  icon: Icon,
  value,
  label,
  sub,
  hint,
  tint = "muted",
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  value: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
  hint?: ReactNode;
  tint?: keyof typeof TINTS;
  className?: string;
}) {
  return (
    <div
      data-slot="stat-tile"
      className={cn(
        "flex items-center gap-2.5 rounded-xl border border-border bg-card p-3 sm:gap-3 sm:p-4",
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-10",
            TINTS[tint],
          )}
        >
          <Icon className="size-4 sm:size-5" />
        </span>
      ) : null}
      <div className="min-w-0">
        <div className="font-heading text-lg leading-none font-semibold tabular-nums sm:text-2xl">
          {value}
        </div>
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          {label}
          {hint ? <InfoTip content={hint} /> : null}
        </div>
        {sub ? <div className="text-xs text-muted-foreground/80">{sub}</div> : null}
      </div>
    </div>
  );
}
