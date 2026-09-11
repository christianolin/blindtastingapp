import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const SIZE = {
  sm: "text-[9.5px] tracking-[.12em]",
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
