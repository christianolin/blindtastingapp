import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StartTastingMenu } from "./start-tasting-menu";

// The overview's mission hero: mission copy + the two primary actions on the
// left, a blurred Romanee-Conti 1945 photo bleeding in from the right.
export function OverviewHero() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
      {/* Blurred hero photo on the right, fading into the card on the left. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-full sm:w-3/5 lg:w-[55%]">
        <img
          src="/hero/romanee.webp"
          alt=""
          aria-hidden
          className="h-full w-full object-cover object-center blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/85 to-transparent sm:via-card/40" />
      </div>
      <div className="relative flex max-w-xl flex-col gap-6 p-6 sm:p-10">
        <div className="flex flex-col gap-4">
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            Understand what&apos;s in the glass.
          </h1>
          <p className="text-muted-foreground">
            We believe wine deserves more than a quick score. By giving people a
            structured way to observe, describe, compare and learn, Blindr helps
            curious drinkers develop their palate, appreciate complexity and build
            real wine knowledge over time.
          </p>
          <p className="font-medium">
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
