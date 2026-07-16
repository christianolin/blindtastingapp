"use client";

import { useLinkStatus } from "next/link";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { cn } from "@/lib/utils";

/**
 * Inline "this click registered" hint for <Link>s — a tiny wine glass that
 * fades in (after a short delay, so fast navigations never flash it) while
 * the navigation is pending. Must be rendered as a child of the Link it
 * reports on (that's how useLinkStatus finds its Link). Fixed-size and
 * always rendered so it never causes layout shift.
 */
export function LinkLoadingHint({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn("link-hint", pending && "is-pending", className)}
    >
      <WineGlassLoader size={14} wineColor="currentColor" />
    </span>
  );
}
