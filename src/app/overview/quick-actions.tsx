"use client";

import { Amphora, EyeOff, Wine, type LucideIcon } from "lucide-react";
import {
  useActionLauncher,
  type ActionLaunch,
} from "@/components/overview/action-button-client";
import { cn } from "@/lib/utils";
import type { OverviewBanner } from "@/lib/overview-types";

// The Overview's phone action row (phone layout revision, 2026-09-12). Below
// `md` the subject cards drop their full-width actions, which stacked into a
// wall of three buttons in three colours competing with the Next-up card, and
// these three tiles under the banner stand in for them. Each tile opens
// exactly what its card's action opens, through the same launcher hook.
// Hidden from `md` up, where the cards keep their own actions.

// Icon over label, at least 64px tall, with the card actions' press shadow;
// a pressed tile sinks one pixel into it.
const TILE =
  "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-[11px] border px-1.5 py-2.5 text-center text-[12px] leading-tight font-semibold transition-[background-color,box-shadow,translate] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&_svg]:size-5 [&_svg]:shrink-0";

// Gold mirrors the gold action (hover deepens to gold-deep); the raised
// parchment tiles take the outline action's hover to parchment.
const TONE = {
  gold: "border-gold-deep bg-gold text-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] hover:bg-gold-deep active:shadow-[0_1px_0_0_rgba(42,33,30,.18)]",
  surface:
    "border-border-strong bg-card text-primary shadow-[0_2px_0_0_rgba(42,33,30,.12)] hover:bg-background active:shadow-[0_1px_0_0_rgba(42,33,30,.12)]",
} as const;

const TILES: {
  launch: ActionLaunch;
  label: string;
  Icon: LucideIcon;
  tone: keyof typeof TONE;
}[] = [
  // TastingsCard's "Start a blind tasting".
  { launch: "taste-blind", label: "Taste blind", Icon: EyeOff, tone: "gold" },
  // RatingsCard's "Rate a wine".
  { launch: "taste-rate", label: "Rate a wine", Icon: Wine, tone: "surface" },
  // CellarCard's "Add a bottle", with its Amphora icon.
  { launch: "cellar", label: "Add a bottle", Icon: Amphora, tone: "surface" },
];

export function QuickActions({
  bannerKind,
  className,
}: {
  /** The banner rendered directly above, so the row can avoid repeating it. */
  bannerKind?: OverviewBanner["kind"];
  className?: string;
}) {
  const open = useActionLauncher();
  // With nothing scheduled, the banner above IS a full-width gold "Start a
  // tasting" opening this very sheet. A second gold block 11px underneath it,
  // same action, is exactly the wall of buttons this revision set out to
  // remove — so on that one banner the Taste-blind tile drops to the parchment
  // surface and the row carries no gold at all, leaving one gold call to
  // action on the screen. (The live banner keeps the gold tile: its gold chip
  // sits inside the bordeaux banner and goes somewhere else entirely.)
  const goldAllowed = bannerKind !== "none";
  return (
    <div
      role="group"
      aria-label="Quick actions"
      className={cn("grid grid-cols-3 gap-2 md:hidden", className)}
    >
      {TILES.map(({ launch, label, Icon, tone }) => (
        <button
          key={launch}
          type="button"
          onClick={() => open(launch)}
          className={cn(
            TILE,
            TONE[tone === "gold" && !goldAllowed ? "surface" : tone],
          )}
        >
          <Icon aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
