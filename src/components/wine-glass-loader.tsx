import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Blindr's loading indicator — a wine glass filling up, drawn in the same
 * stroke style as the logo's glass (`src/components/logo.tsx`). The glass
 * outline inherits `currentColor`; the wine defaults to the brand gold so
 * it stays visible on both parchment pages and Bordeaux buttons.
 *
 * Square 64×64 viewBox on purpose: Button's base styles force any inline
 * svg without a `size-` class to a square `size-4`, so a square drawing
 * never gets distorted there.
 */
export function WineGlassLoader({
  size = 48,
  wineColor = "var(--gold)",
  className,
}: {
  size?: number;
  wineColor?: string;
  className?: string;
}) {
  const clipId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <defs>
        <clipPath id={clipId}>
          <path d="M19.5 9.5 C19 24 26.5 31 32 31 C37.5 31 45 24 44.5 9.5 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect
          x="16"
          y="7"
          width="32"
          height="26"
          fill={wineColor}
          className="animate-wine-fill"
        />
      </g>
      <g
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 7 C16 25 25 33 32 33 C39 33 48 25 47 7 Z" />
        <line x1="32" y1="33" x2="32" y2="51" />
        <line x1="22" y1="55" x2="42" y2="55" />
      </g>
    </svg>
  );
}

/** Full-area centered loader for route `loading.tsx` files. */
export function PageLoader({ label = "Pouring…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-rise-in flex flex-1 flex-col items-center justify-center gap-4 p-16 text-primary"
    >
      <WineGlassLoader size={48} />
      <p className="font-heading text-lg italic text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
