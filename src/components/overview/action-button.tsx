import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ActionVariant = "gold" | "primary" | "outline";

const VARIANT: Record<ActionVariant, string> = {
  gold: "bg-gold font-bold text-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] hover:bg-gold-deep",
  primary:
    "bg-primary text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] hover:bg-[#4A1523]",
  outline:
    "border-[1.5px] border-primary bg-white text-primary shadow-[0_2px_0_0_rgba(42,33,30,.12)] hover:bg-background",
};

// The card action button's classes (full width, 44px+ tall, pressable
// shadow). Exported so the client launcher variant renders identically.
export function actionButtonClass(variant: ActionVariant, className?: string) {
  return cn(
    "flex min-h-11 w-full items-center justify-center gap-[9px] rounded-[10px] px-4 py-[13px] text-[14px] font-semibold transition-colors max-md:rounded-[9px] max-md:py-[11px] [&_svg]:size-[17px] [&_svg]:shrink-0",
    VARIANT[variant],
    className,
  );
}

// A card action that navigates.
export function ActionButton({
  href,
  variant,
  children,
  className,
}: {
  href: string;
  variant: ActionVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={actionButtonClass(variant, className)}>
      {children}
    </Link>
  );
}
