import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The handoff draws the smallest eyebrow at 9.5px but also sets a 10px floor;
// the floor wins (the half pixel is invisible, the rule is not).
const SIZE = {
  sm: "text-[10px] tracking-[.12em]",
  md: "text-[10px] tracking-[.14em]",
  lg: "text-[10.5px] tracking-[.16em]",
} as const;

// The redesign's mono eyebrow label: uppercase, letter-spaced, ink-muted.
export function Eyebrow({
  children,
  size = "md",
  className,
}: {
  children: ReactNode;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono uppercase text-muted-foreground",
        SIZE[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
