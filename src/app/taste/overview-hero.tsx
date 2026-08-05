import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { AppStats } from "@/lib/app-stats";
import { StartTastingMenu } from "./start-tasting-menu";
import { AppStatsRow } from "./app-stats-row";

// The overview's mission hero: mission copy, the two primary actions and the
// app-wide numbers on the left; the Romanee-Conti 1945 photo bleeding past the
// page padding to the top/right edge of the screen on the right.
//
// The photo is a studio shot on a cold grey backdrop, which would otherwise sit
// on the warm page as a visible grey panel. `mix-blend-multiply` over the cream
// background plus a light sepia melts that backdrop into the page, so only the
// bottles read; the gradient then fades its left edge behind the copy.
export function OverviewHero({ stats }: { stats: AppStats }) {
  return (
    <section className="relative isolate -mr-6 -mt-6 overflow-hidden bg-background sm:-mr-8 sm:-mt-8">
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[52%] sm:block lg:w-[48%]">
        <img
          src="/hero/romanee.webp"
          alt=""
          aria-hidden
          className="size-full object-cover object-[center_30%] mix-blend-multiply [filter:sepia(0.3)_saturate(0.85)_brightness(1.05)]"
        />
        {/* Fade the photo's left and bottom edges into the page so it reads as
            a background wash rather than a pasted-in panel. */}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background to-transparent" />
      </div>
      <div className="relative flex min-h-[440px] max-w-2xl flex-col justify-center gap-6 py-10 pr-6 sm:min-h-[500px] sm:py-12">
        <div className="flex flex-col gap-4">
          <h1 className="max-w-[15ch] font-heading text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Understand what&apos;s in the glass.
          </h1>
          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
            We believe wine deserves more than a quick score. By giving people a
            structured way to observe, describe, compare and learn, Blindr helps
            curious drinkers develop their palate, appreciate complexity and build
            real wine knowledge over time.
          </p>
          <p className="max-w-lg text-sm font-medium leading-relaxed">
            We built Blindr for wine enthusiasts, committed beginners, blind
            tasters, collectors and professionals who want to learn more from every
            bottle — and share that with a community of like-minded people.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <StartTastingMenu />
          <Button
            variant="outline"
            size="lg"
            className="h-10 px-5"
            render={<Link href="/knowledge/map" />}
          >
            Explore &amp; learn
          </Button>
        </div>
        <AppStatsRow stats={stats} />
      </div>
    </section>
  );
}
