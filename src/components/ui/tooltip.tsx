import type { ReactNode } from "react";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

// Lightweight hover/focus tooltip (CSS group-hover) — enough for the stat "i"
// hints, and server-safe (no client Base UI dependency for a static popover).
export function Tooltip({
  content,
  children,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span data-slot="tooltip" className="group/tt relative inline-flex">
      <span tabIndex={0} className="inline-flex cursor-default outline-none">
        {children}
      </span>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden w-max max-w-64 -translate-x-1/2 rounded-md bg-popover px-2.5 py-1.5 text-xs font-normal text-popover-foreground shadow-md ring-1 ring-foreground/10 group-hover/tt:block group-focus-within/tt:block",
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}

export function InfoTip({ content }: { content: ReactNode }) {
  return (
    <Tooltip content={content}>
      <Info className="size-3.5 text-muted-foreground" />
    </Tooltip>
  );
}
