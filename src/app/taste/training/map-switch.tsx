"use client";

// The candidates column's List | Map tablist (training-room-map spec RM19,
// RM25), written here rather than borrowed: RangeControl has the look but no
// keyboard handling. role="tablist" with an aria-label; each tab role="tab"
// with aria-selected, aria-controls naming its tabpanel, and a roving
// tabIndex (0 on the selected tab, -1 on the other). ArrowLeft/ArrowRight
// move AND select (two tabs: either arrow flips), Home/End go to the ends.
// Pointing at or focusing Map warms its code and the basemap (RM24).
// No state of its own and no browser storage: TrainingRoom owns the choice.
import { TRAINING_COPY } from "@/lib/training/copy";
import { cn } from "@/lib/utils";
import type { CandidatesView } from "./room-map-state";

// 44 px on touch, compact on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";

const VIEWS: readonly CandidatesView[] = ["list", "map"];

/** The tab a key moves to and selects; null for any other key. */
export function nextTab(key: string, current: CandidatesView): CandidatesView | null {
  if (key === "Home") return "list";
  if (key === "End") return "map";
  if (key === "ArrowLeft" || key === "ArrowRight") return current === "list" ? "map" : "list";
  return null;
}

/** The tab's and its panel's element ids under one per-instance base (useId):
    the laptop column and the phone sheet can both be in the DOM at once. */
export function tabId(base: string, view: CandidatesView): string {
  return `${base}-tab-${view}`;
}
export function panelId(base: string, view: CandidatesView): string {
  return `${base}-panel-${view}`;
}

export function MapSwitch({
  idBase,
  view,
  onSelect,
  onWarm,
  className,
}: {
  idBase: string;
  view: CandidatesView;
  onSelect: (view: CandidatesView) => void;
  onWarm: () => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={TRAINING_COPY.viewsLabel}
      className={cn("flex shrink-0 gap-[3px] rounded-[9px] bg-muted p-[3px]", className)}
    >
      {VIEWS.map((v) => {
        const selected = v === view;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            id={tabId(idBase, v)}
            aria-selected={selected}
            aria-controls={panelId(idBase, v)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(v)}
            onKeyDown={(e) => {
              const next = nextTab(e.key, view);
              if (!next) return;
              e.preventDefault();
              onSelect(next);
              document.getElementById(tabId(idBase, next))?.focus();
            }}
            onPointerEnter={v === "map" ? onWarm : undefined}
            onFocus={v === "map" ? onWarm : undefined}
            className={cn(
              "rounded-[7px] px-3 text-[12.5px] transition-colors focus-visible:outline-2 focus-visible:outline-ring md:pointer-fine:py-1",
              TAP,
              selected
                ? "bg-card font-semibold text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v === "list" ? TRAINING_COPY.listTab : TRAINING_COPY.mapTab}
          </button>
        );
      })}
    </div>
  );
}
