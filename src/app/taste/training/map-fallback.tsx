"use client";

// The likelihood map's states that are not the map (training-room-map spec
// RM20, RM22), outside its dynamic chunk so they show when the chunk itself
// failed: the map stopped (a lost WebGL context, or a map that could not
// start) — the list has every wine, and "Try the map again" remounts it; its
// code could not load (a stale tab after a deploy, usually) — only a page
// reload helps, which is safe for the note because the draft is written on
// every change (D13), and it reloads only on the viewer's tap; a phone on its
// side, where 88dvh leaves a map under 200 px; and the placeholder while the
// chunk loads. No hooks, no portal, so the markup test renders them.
import { TRAINING_COPY } from "@/lib/training/copy";
import { cn } from "@/lib/utils";
import { MAP_BOX_ANY } from "./map-types";

// 44 px on touch, the row's own height on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";
const ACTION = cn(
  "inline-flex items-center justify-center self-start rounded-[10px] border border-border bg-background px-3 py-1.5 text-[12.5px] font-semibold text-primary transition-colors hover:border-gold focus-visible:outline-2 focus-visible:outline-ring",
  TAP,
);
const BOX = "flex flex-col gap-2 rounded-[10px] border border-border-light bg-muted/40 px-3 py-3 text-[12.5px]";

export function MapFallback({ kind, onRetry }: { kind: "stopped" | "reload"; onRetry?: () => void }) {
  if (kind === "reload") {
    return (
      <div role="alert" className={BOX}>
        <p>{TRAINING_COPY.mapNeedsReload}</p>
        <button type="button" className={ACTION} onClick={() => window.location.reload()}>
          {TRAINING_COPY.mapReload}
        </button>
      </div>
    );
  }
  return (
    <div role="status" className={BOX}>
      <p>{TRAINING_COPY.mapStopped}</p>
      {onRetry ? (
        <button type="button" className={ACTION} onClick={onRetry}>
          {TRAINING_COPY.mapRetry}
        </button>
      ) : null}
    </div>
  );
}

/** A short screen (a phone on its side): the map would be too small to use. */
export function MapUpright({ onShowList }: { onShowList: () => void }) {
  return (
    <div className={cn(BOX, "m-2")}>
      <p>{TRAINING_COPY.mapUpright}</p>
      <button type="button" className={ACTION} onClick={onShowList}>
        {TRAINING_COPY.showList}
      </button>
    </div>
  );
}

/** Where the map will be, while its code and style load. */
export function MapLoading() {
  return <div aria-hidden className={cn("animate-pulse rounded-[10px] bg-muted", MAP_BOX_ANY)} />;
}
