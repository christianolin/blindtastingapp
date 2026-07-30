import type { ComponentType, ReactNode } from "react";

import { cn } from "@/lib/utils";

// Icon + title + copy + optional CTA — the dashed-border block repeated across
// Cellar / Catalog / Community / History etc.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center",
        className,
      )}
    >
      {Icon ? <Icon className="size-8 text-muted-foreground" /> : null}
      <div>
        <p className="font-heading text-lg font-medium">{title}</p>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
