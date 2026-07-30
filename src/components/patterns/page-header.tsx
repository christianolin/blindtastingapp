import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Cormorant H1 + subtitle + right-aligned actions — the top of every pillar page.
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="page-header"
      className={cn("flex flex-wrap items-start justify-between gap-3", className)}
    >
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
