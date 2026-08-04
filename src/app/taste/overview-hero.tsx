import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StartTastingMenu } from "./start-tasting-menu";

// The overview's mission hero: mission copy + the two primary actions on the
// left, the Romanee-Conti 1945 photo bleeding in from the right and fading
// into the page background (no card border — it reads as the page itself).
export function OverviewHero() {
  return (
    <section className="relative isolate overflow-hidden rounded-2xl">
      {/* Photo bleeding in from the right, fading into the page background so
          there's no seam between it and the page. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[80%] sm:w-[64%]">
        <img
          src="/hero/romanee.webp"
          alt=""
          aria-hidden
          className="h-full w-full object-cover object-[center_35%]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
      </div>
      <div className="relative flex min-h-[420px] max-w-2xl flex-col justify-center gap-6 py-12 pr-6 sm:min-h-[480px] sm:py-16">
        <div className="flex flex-col gap-5">
          <h1 className="font-heading text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
            Understand what&apos;s in the glass.
          </h1>
          <p className="max-w-xl text-[0.975rem] leading-relaxed text-muted-foreground">
            We believe wine deserves more than a quick score. By giving people a
            structured way to observe, describe, compare and learn, Blindr helps
            curious drinkers develop their palate, appreciate complexity and build
            real wine knowledge over time.
          </p>
          <p className="max-w-xl text-[0.975rem] font-medium leading-relaxed">
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
            className="h-11 px-5 text-[0.95rem]"
            render={<Link href="/knowledge/map" />}
          >
            Explore &amp; learn
          </Button>
        </div>
      </div>
    </section>
  );
}
