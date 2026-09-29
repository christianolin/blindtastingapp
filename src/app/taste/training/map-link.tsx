// The training room's links out to the wine map (training-room-map spec RM6-RM8,
// §6.1): a typical wine's detail opens the explorer on its home place, and an
// expanded region group names the MAP region its wines sit in ("Veneto on the
// wine map" under Prosecco). Both open in a new tab (owner answer O1): the
// session's open panels would not survive a same-tab visit. A wine or group
// with no map place reads "Not on the wine map yet" as plain text, never a
// link (RM7). A plain <a>, not next/link: a new tab gains nothing from the
// client router, and a prefetch of /knowledge/map on every open detail would
// cost the room for a link most sessions never follow. No hooks, no portal, so
// the markup test renders it.
import { ArrowUpRight } from "lucide-react";
import { TRAINING_COPY, placeHref, regionOnMap } from "@/lib/training/copy";
import type { MapPlaceRef } from "@/lib/training/types";
import { cn } from "@/lib/utils";

// 44 px on touch, the row's own height on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";

function NewTabLink({ href, className, children }: { href: string; className?: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={cn(
        "inline-flex items-center gap-1 self-start rounded-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring",
        TAP,
        className,
      )}
    >
      {children}
      <ArrowUpRight aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only"> {TRAINING_COPY.newTabHint}</span>
    </a>
  );
}

/** The foot of a typical wine's detail: "See it on the wine map ↗", or "Not on the wine map yet". */
export function DetailMapLink({ placeKey }: { placeKey: string | null }) {
  if (!placeKey) {
    return <p className="text-[12.5px] text-muted-foreground">{TRAINING_COPY.notOnMap}</p>;
  }
  return (
    <NewTabLink href={placeHref(placeKey)} className="text-[13px] font-semibold">
      {TRAINING_COPY.seeOnMap}
    </NewTabLink>
  );
}

/** An expanded group's first row: its map region, or "Not on the wine map yet". */
export function GroupMapLink({ region }: { region: MapPlaceRef | null }) {
  if (!region) {
    return <p className="px-3 py-1.5 text-[12px] text-muted-foreground">{TRAINING_COPY.notOnMap}</p>;
  }
  return (
    <NewTabLink href={placeHref(region.key)} className="px-3 text-[12.5px] font-semibold">
      {regionOnMap(region.name)}
    </NewTabLink>
  );
}
