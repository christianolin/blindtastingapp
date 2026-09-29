"use client";

// The likelihood map's legend (training-room-map spec §6.4), rendered only by
// training-map.tsx so it and map-palette.ts ride in the map's own chunk.
// Before any answer it says only "Start describing the wine". Otherwise: the
// ramp through the palette's four heat stops, "Less close" to "Closest"; the
// hollow ring, "Ruled out"; the line saying colours compare wines with each
// other (risk X1); the approximate-spot line while any dot is curated; and the
// typical wines with no dot at all, each a real button opening its detail
// (RM25). The swatches are the canvas's own colours — the palette's literal
// hex, as the explorer's legend does — so they always match what is drawn.
import { TRAINING_COPY } from "@/lib/training/copy";
import { MAP_COPY, unmappedLine } from "@/lib/training/map-copy";
import type { MapPalette } from "@/lib/wine-map/map-palette";
import type { TrainingCandidate } from "@/lib/training/types";
import { cn } from "@/lib/utils";

// 44 px on touch, the row's own height on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";

export function TrainingMapLegend({
  palette,
  before,
  curated,
  unmapped,
  onOpenUnmapped,
}: {
  palette: MapPalette;
  /** Nothing answered yet (panel.ts's isBeforeAnswers). */
  before: boolean;
  /** Whether any dot sits at a curated, approximate spot. */
  curated: boolean;
  unmapped: readonly TrainingCandidate[];
  onOpenUnmapped: (id: string, button: HTMLElement) => void;
}) {
  if (before) {
    return <p className="text-[12.5px] text-muted-foreground">{TRAINING_COPY.beforeAnswers}</p>;
  }
  const { stops, capped } = palette.heat;
  return (
    <div className="flex flex-col gap-1.5 text-[11.5px] text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-2">
          <span>{MAP_COPY.legendLess}</span>
          <span
            aria-hidden
            className="h-2 w-[120px] rounded-full"
            style={{
              background: `linear-gradient(to right, ${stops.join(", ")})`,
            }}
          />
          <span>{MAP_COPY.legendClosest}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full border-[1.5px]" style={{ borderColor: capped }} />
          <span>{MAP_COPY.legendRuledOut}</span>
        </span>
      </div>
      <p>{MAP_COPY.legendRelative}</p>
      {curated ? <p>{MAP_COPY.legendApprox}</p> : null}
      {unmapped.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-2">
          <span>{unmappedLine(unmapped.length)}</span>
          {unmapped.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={(e) => onOpenUnmapped(c.id, e.currentTarget)}
              className={cn(
                "rounded-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring",
                TAP,
              )}
            >
              {c.name}
            </button>
          ))}
        </p>
      ) : null}
    </div>
  );
}
