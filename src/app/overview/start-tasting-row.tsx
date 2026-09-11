import { EyeOff } from "lucide-react";
import { ActionButtonClient } from "@/components/overview/action-button-client";

// The banner slot when nothing is live and nothing is scheduled: a single
// parchment row — "No tasting on the calendar" with the gold "Start a
// tasting" launcher on the right (full width on phones). Never an empty
// bordeaux block, and never a heading-plus-blurb banner: the spec calls for
// one row.
export function StartTastingRow() {
  return (
    <section
      aria-label="No tasting on the calendar"
      className="flex flex-wrap items-center justify-between gap-6 rounded-[13px] border border-border-strong bg-card p-[18px_22px] max-md:shrink-0 max-md:flex-col max-md:items-stretch max-md:gap-3 max-md:rounded-xl max-md:p-[11px_14px]"
    >
      <p className="min-w-0 flex-1 text-[13.5px] font-semibold text-foreground max-md:text-[12.5px]">
        No tasting on the calendar
      </p>
      <ActionButtonClient
        launch="taste-blind"
        variant="gold"
        className="w-auto px-[22px] max-md:w-full"
      >
        <EyeOff />
        Start a tasting
      </ActionButtonClient>
    </section>
  );
}
