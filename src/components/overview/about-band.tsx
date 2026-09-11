import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Pixel stops, not percentages: the text must stay on opaque parchment at
// every width, and a percentage veil drops it onto the bottle label on narrow
// screens. `min(620px, 62%)` keeps the opaque zone from swallowing the whole
// photo on a tablet.
const VEIL =
  "linear-gradient(to right, rgba(245,239,227,.97) 0, rgba(245,239,227,.95) min(620px, 62%), rgba(245,239,227,.3) 84%, rgba(245,239,227,.08) 100%)";

/**
 * The "More than a score" photo band at the foot of the Overview and Your
 * numbers pages. The whole band is a link to /about and lifts on hover.
 */
export function AboutBand({ className }: { className?: string }) {
  return (
    <Link
      href="/about"
      className={cn(
        // shrink-0: the band sits in fixed-height flex columns (the page
        // roots); without it the column squashes the band to a sliver
        // instead of letting the page grow and scroll.
        "group relative block shrink-0 overflow-hidden border-t border-border-strong bg-muted text-foreground transition-shadow hover:shadow-[0_8px_20px_-8px_rgba(42,33,30,.5)]",
        className,
      )}
    >
      {/* romanee-sepia.webp has the handoff's sepia(.24) saturate(.9) baked
          in (see scripts/bake-hero-sepia.mjs), so no CSS filter has to be
          rasterised while the page scrolls under it. */}
      <Image
        src="/hero/romanee-sepia.webp"
        alt="A bottle of Romanée-Conti 1945"
        fill
        sizes="(min-width: 1280px) calc(100vw - 240px), (min-width: 768px) calc(100vw - 60px), 100vw"
        className="object-cover object-[center_76%]"
      />
      <div className="absolute inset-0" style={{ background: VEIL }} />
      <div className="relative flex max-w-[560px] flex-col gap-[11px] p-[30px_26px_34px] max-md:p-[22px_16px_24px]">
        <h2 className="font-heading text-[29px] leading-[1.06] font-semibold max-md:text-[24px]">
          More than a score
        </h2>
        <p className="text-[13.5px] leading-[1.6] text-ink-photo [text-wrap:pretty]">
          Wine deserves more than a number out of a hundred. Blindr gives you a
          structured way to observe, describe, compare and learn — so every
          bottle leaves you a little sharper than the last.
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-primary bg-card px-4 py-2 text-[13px] font-semibold text-primary transition-colors group-hover:bg-white">
            About Blindr
            <span className="text-[14px] leading-none" aria-hidden>
              ›
            </span>
          </span>
          <span className="text-[12px] text-ink-caption">
            Pictured: Romanée-Conti 1945
          </span>
        </div>
      </div>
    </Link>
  );
}
