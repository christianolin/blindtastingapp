"use client";

import {
  DIMENSIONS,
  DIMENSION_GROUP,
  STRIP_CAPTION,
  type DimensionCounts,
} from "@/lib/cellar/cellar-rows";
import type { GroupKey } from "@/lib/cellar/types";
import { cn } from "@/lib/utils";

// (plan copy, CC-P1) — split around "groups the list" so that phrase alone
// gets the emphasis span the mock draws; the words themselves are still
// CC-P1's STRIP_CAPTION, never re-typed here.
const CAPTION_EMPHASIS = "groups the list";
const [CAPTION_BEFORE, CAPTION_AFTER] = STRIP_CAPTION.split(CAPTION_EMPHASIS);

export function DimensionStrip({
  counts,
  active,
  onPick,
  readOnly,
}: {
  counts: DimensionCounts;
  active: GroupKey;
  onPick: (g: GroupKey) => void;
  readOnly: boolean;
}): React.JSX.Element {
  return (
    // readOnly changes nothing visual here — the tiles still group in a
    // read-only cellar (spec §5.9) — but it is a real prop the frame passes,
    // so it is kept visible on the DOM rather than silently dropped.
    <div data-readonly={readOnly}>
      <div className="grid grid-cols-4 gap-2 md:grid-cols-5 md:gap-3">
        {DIMENSIONS.map((d) => {
          const group = DIMENSION_GROUP[d];
          const isActive = active === group;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={isActive}
              onClick={() => onPick(isActive ? "none" : group)}
              className={cn(
                "min-h-11 rounded-xl border bg-card p-2.5 text-left md:p-4 md:pointer-fine:min-h-0",
                d === "vintages" ? "max-md:hidden" : null,
                isActive
                  ? "border-primary ring-1 ring-primary"
                  : "border-border hover:border-border-strong",
              )}
            >
              <div className="font-heading text-2xl font-semibold tabular-nums md:text-3xl">
                {counts[d]}
              </div>
              {/* (deviation, CC-U1) — CC-P1 exports no `tileLabel(d)`; the
                  Dimension value itself already is the mock's tile word
                  ("countries", "regions", "producers", "grapes", "vintages"),
                  so it is used directly instead of a nonexistent helper. */}
              <div className="text-xs text-muted-foreground">{d}</div>
            </button>
          );
        })}
      </div>
      <p className="mt-2 max-md:hidden text-[12.5px] leading-[1.5] text-muted-foreground">
        {CAPTION_BEFORE}
        <span className="font-semibold text-foreground">{CAPTION_EMPHASIS}</span>
        {CAPTION_AFTER}
      </p>
    </div>
  );
}
