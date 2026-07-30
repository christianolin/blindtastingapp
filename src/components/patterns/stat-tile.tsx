import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/ui/tooltip";

// Responsive wrapper for a row of StatTiles. Default 2→4 columns; pass
// `className` (e.g. `sm:grid-cols-5`) to override for a specific page.
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
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  value: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="stat-tile"
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card p-4",
        className,
      )}
    >
      {Icon ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
      ) : null}
      <div className="min-w-0">
        <div className="font-heading text-2xl leading-none font-semibold tabular-nums">
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
