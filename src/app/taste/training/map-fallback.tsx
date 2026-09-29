"use client";

// The likelihood map's states that are not the map (training-room-map spec
// RM20, RM22), outside its dynamic chunk so they show when the chunk itself
// failed. One line and one button each:
// - "stopped": a lost WebGL context, or a map that could not start — the list
//   has every wine, and "Try the map again" remounts it;
// - "reload": its code could not load (a stale tab after a deploy, usually) —
//   only a page reload helps, which is safe for the note because the draft is
//   written on every change (D13), and it reloads only on the viewer's tap;
// - "upright": a phone on its side, where 88dvh leaves a map under 200 px —
//   "Show the list" goes back to List.
// And the placeholder while the chunk loads. No hooks, no portal, so the
// markup test renders them.
import { TRAINING_COPY } from "@/lib/training/copy";
import { cn } from "@/lib/utils";
import { MAP_BOX_ANY } from "./map-types";

const LINES = {
  stopped: [TRAINING_COPY.mapStopped, TRAINING_COPY.mapRetry],
  reload: [TRAINING_COPY.mapNeedsReload, TRAINING_COPY.mapReload],
  upright: [TRAINING_COPY.mapUpright, TRAINING_COPY.showList],
} as const;

export function MapFallback({
  kind,
  onAction,
}: {
  kind: keyof typeof LINES;
  /** "stopped": retry; "upright": show the list. "reload" reloads the page itself. */
  onAction?: () => void;
}) {
  const [line, action] = LINES[kind];
  const act = kind === "reload" ? () => window.location.reload() : onAction;
  return (
    <div
      role={kind === "reload" ? "alert" : kind === "stopped" ? "status" : undefined}
      className={cn(
        "flex flex-col gap-2 rounded-[10px] border border-border-light bg-muted/40 px-3 py-3 text-[12.5px]",
        kind === "upright" && "m-2",
      )}
    >
      <p>{line}</p>
      {act ? (
        <button
          type="button"
          onClick={act}
          // 44 px on touch, the row's own height on a laptop pointer.
          className="inline-flex min-h-11 items-center justify-center self-start rounded-[10px] border border-border bg-background px-3 py-1.5 text-[12.5px] font-semibold text-primary transition-colors hover:border-gold focus-visible:outline-2 focus-visible:outline-ring md:pointer-fine:min-h-0"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

/** Where the map will be, while its code and style load. */
export function MapLoading() {
  return <div aria-hidden className={cn("animate-pulse rounded-[10px] bg-muted", MAP_BOX_ANY)} />;
}
