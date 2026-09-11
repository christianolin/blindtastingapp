import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// The section-link pill ("History ›", "All notes ›"): bordered, rounded-full,
// bordeaux text, gold border + white fill on hover. `tone` picks the resting
// fill — parchment on the Overview card headers, raised parchment on the stats
// page's section rows.
export function LinkPill({
  href,
  children,
  size = "sm",
  tone = "background",
  className,
}: {
  href: string;
  children: ReactNode;
  size?: "sm" | "md";
  tone?: "background" | "card";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        // On phones an invisible ::after pad stretches the hit area to the
        // 44px tap-target floor without making the 24px pill itself taller.
        "relative inline-flex shrink-0 items-center gap-[5px] rounded-full border border-border font-semibold whitespace-nowrap text-primary transition-colors hover:border-gold hover:bg-white max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-2.5 max-md:after:content-['']",
        tone === "card" ? "bg-card" : "bg-background",
        size === "sm"
          ? "px-[11px] py-[5px] text-[11.5px] max-md:px-[9px] max-md:py-1 max-md:text-[10.5px]"
          : "px-[13px] py-1.5 text-[12px]",
        className,
      )}
    >
      {children}
      <span className="text-[13px] leading-none" aria-hidden>
        ›
      </span>
    </Link>
  );
}
