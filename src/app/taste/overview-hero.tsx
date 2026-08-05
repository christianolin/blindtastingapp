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
    <section className="relative -mx-6 -mt-6 bg-background sm:ml-0 sm:-mr-8 sm:-mt-8">
      {/* The photo runs past the hero's bottom edge so the whole base of the
          bottles stays in frame; the explainer cards below deliberately overlap
          its lower part (they're `relative`, so they paint over this layer). */}
      <div className="pointer-events-none absolute inset-0 sm:-bottom-24 sm:left-auto sm:w-[62%] lg:w-[56%]">
        <img
          src="/hero/romanee.webp"
          alt=""
          aria-hidden
          className="size-full object-cover object-[center_84%] mix-blend-multiply [filter:sepia(0.3)_saturate(0.85)_brightness(1.05)]"
        />
        {/* Dissolve the photo's edges into the page — no straight lines. The
            left fade ramps evenly (rather than dropping off fast) so there's no
            visible seam, and clears before the label at ~40% across. The bottom
            fade is short: it only has to soften the spill below the hero. */}
        {/* Phone: the photo sits behind the whole hero as a background, so it
            needs an even veil to keep the copy legible rather than a side fade. */}
        <div className="absolute inset-0 bg-background/75 sm:hidden" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-background from-0% via-background/55 via-16% to-transparent to-36% sm:block" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
      </div>
      <div className="relative flex max-w-2xl flex-col justify-center gap-5 px-6 py-8 sm:min-h-[500px] sm:gap-6 sm:pl-0 sm:pr-6 sm:py-12">
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* The character cap keeps the title in tidy stacked lines while the
              photo is beside it; from xl there's room to run it on one line. */}
          <h1 className="max-w-[10ch] font-heading text-[2rem] font-semibold leading-[1.05] tracking-tight sm:max-w-[15ch] sm:text-5xl xl:max-w-none">
            Understand what&apos;s in the glass.
          </h1>
          <p className="max-w-lg text-[0.82rem] leading-relaxed text-muted-foreground sm:max-w-xl sm:text-sm xl:max-w-2xl">
            We believe wine deserves more than a quick score. By giving people a
            structured way to observe, describe, compare and learn, Blindr helps
            curious drinkers develop their palate, appreciate complexity and build
            real wine knowledge over time.
          </p>
          <p className="max-w-lg text-[0.82rem] font-medium leading-relaxed sm:max-w-xl sm:text-sm xl:max-w-2xl">
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
