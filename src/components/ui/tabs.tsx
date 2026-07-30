import Link from "next/link";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Presentational Link tabs — the app drives subsection state through `?tab=`
// URLs (server components), so these are Links, not client tab state. Replaces
// the three hand-rolled tab bars (Cellar, Community, Taste).
export type TabItem = { key: string; label: string; href: string; count?: number };

const listVariants = cva("flex", {
  variants: {
    variant: {
      underline: "gap-6 overflow-x-auto border-b border-border",
      segmented: "gap-1 rounded-lg bg-muted/60 p-1",
    },
  },
  defaultVariants: { variant: "underline" },
});

const itemVariants = cva(
  "relative flex shrink-0 items-center gap-2 text-sm font-medium transition-colors",
  {
    variants: {
      variant: {
        underline: "-mb-px border-b-2 px-0.5 pb-2.5",
        segmented: "rounded-md px-3 py-1.5",
      },
      active: { true: "", false: "" },
    },
    compoundVariants: [
      { variant: "underline", active: true, className: "border-primary text-foreground" },
      {
        variant: "underline",
        active: false,
        className: "border-transparent text-muted-foreground hover:text-foreground",
      },
      {
        variant: "segmented",
        active: true,
        className: "bg-background text-foreground shadow-sm ring-1 ring-border",
      },
      {
        variant: "segmented",
        active: false,
        className: "text-muted-foreground hover:text-foreground",
      },
    ],
    defaultVariants: { variant: "underline", active: false },
  },
);

export function Tabs({
  items,
  activeKey,
  variant = "underline",
  className,
}: {
  items: TabItem[];
  activeKey: string;
  variant?: "underline" | "segmented";
  className?: string;
}) {
  return (
    <div data-slot="tabs" className={cn(listVariants({ variant }), className)}>
      {items.map((t) => {
        const active = t.key === activeKey;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={itemVariants({ variant, active })}
          >
            {t.label}
            {t.count != null && t.count > 0 ? (
              <span
                className={cn(
                  "flex min-w-5 items-center justify-center rounded-full px-1 text-[0.7rem] tabular-nums",
                  active ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {t.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
