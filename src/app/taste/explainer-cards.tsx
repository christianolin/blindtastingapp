import { Wine, EyeOff, BookOpen, Warehouse } from "lucide-react";

// Four static "what you can do here" explainers, framing the app's purpose
// just below the KPIs. Informational only (not links), matching the mockup.
const CARDS = [
  {
    icon: Wine,
    title: "Taste with structure",
    body: "Create thoughtful tasting notes and scores using a consistent method inspired by WSET.",
  },
  {
    icon: EyeOff,
    title: "Taste & challenge",
    body: "Host blind, semi-blind and open tastings, compare impressions and share experiences with friends and fellow wine enthusiasts.",
  },
  {
    icon: BookOpen,
    title: "Understand the wine",
    body: "Explore regions, grapes, styles, classifications and more to connect what's in the glass with its origin.",
  },
  {
    icon: Warehouse,
    title: "Build your cellar",
    body: "Organise your bottles, track your collection and keep your tasting notes in one place. Choose what to keep private and what to share.",
  },
];

export function ExplainerCards() {
  return (
    <div className="grid grid-cols-1 gap-5 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
      {CARDS.map((c) => (
        <div key={c.title} className="flex flex-col gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <c.icon className="size-5" strokeWidth={2} />
          </span>
          <span className="font-heading text-base font-medium">{c.title}</span>
          <span className="text-sm text-muted-foreground">{c.body}</span>
        </div>
      ))}
    </div>
  );
}
