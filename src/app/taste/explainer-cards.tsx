import Link from "next/link";
import { ArrowRight } from "lucide-react";

// "Explore Blindr": compact navigation cards named after the actual product
// areas, not benefit headlines — they demoted from the hero-adjacent explainer
// strip to a lower-page wayfinding section once "Your tastings" took its slot.
const AREAS = [
  {
    title: "Taste",
    body: "Structured notes, ratings and blind tastings.",
    href: "/taste",
    cta: "Explore tasting",
  },
  {
    title: "Learn",
    body: "Regions, grapes, styles and classifications.",
    href: "/knowledge/map",
    cta: "Explore knowledge",
  },
  {
    title: "Cellar",
    body: "Your bottles, tasting history and collection.",
    href: "/cellar",
    cta: "Open cellar",
  },
  {
    title: "Community",
    body: "Taste and share with other wine enthusiasts.",
    href: "/community",
    cta: "Community",
  },
] as const;

export function ExplainerCards() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-2xl font-medium">Explore Blindr</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {AREAS.map((a) => (
          <Link
            key={a.title}
            href={a.href}
            className="group flex flex-col gap-1 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40"
          >
            <span className="font-heading text-lg font-medium">{a.title}</span>
            <span className="text-sm text-muted-foreground">{a.body}</span>
            <span className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary">
              {a.cta}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
