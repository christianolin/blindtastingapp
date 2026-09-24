"use client";

// The Map detail switch and its status line (spec 2026-09-23 §7.1). It is one
// tap between One country and All countries, and it lives in the toolbar, not
// on the map canvas. The status line says in words what the map is doing. It
// keeps a two-line height whatever it says, so the map below never moves when
// the text changes after a gesture.
import { useId, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { rovingIndex } from "@/lib/wine-map/country-chips";
import type { DetailMode } from "@/lib/wine-map/detail-mode";
import { DETAIL_WARNING, type DetailStatus } from "@/lib/wine-map/detail-status";

const OPTIONS: readonly { value: DetailMode; label: string }[] = [
  { value: "one", label: "One country" },
  { value: "all", label: "All countries" },
];

export function MapDetailControls({
  mode,
  onModeChange,
  status,
  onRetry,
}: {
  mode: DetailMode;
  onModeChange: (mode: DetailMode) => void;
  status: DetailStatus;
  /** Re-requests the place tree when the status offers a Retry. */
  onRetry: () => void;
}) {
  const warningId = useId();
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  // The WAI-ARIA radio group pattern. Only the checked radio is in the tab
  // order. Arrows move focus AND choose, wrapping. Home/End jump.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = rovingIndex(event.key, index, OPTIONS.length, "both");
    if (next === null) return;
    event.preventDefault();
    radios.current[next]?.focus();
    onModeChange(OPTIONS[next].value);
  };
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
      <div
        role="radiogroup"
        aria-label="Map detail"
        className="flex shrink-0 items-center rounded-md border border-border p-0.5 text-xs"
      >
        {OPTIONS.map((option, index) => {
          const checked = option.value === mode;
          return (
            <button
              key={option.value}
              ref={(element) => {
                radios.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              aria-describedby={option.value === "all" ? warningId : undefined}
              title={option.value === "all" ? DETAIL_WARNING : undefined}
              onClick={() => onModeChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "min-h-11 rounded px-2 py-1 transition-colors md:min-h-0",
                // Shape as well as colour. Bordeaux on the dark card is only
                // 1.3:1, so in dark mode the ring (foreground, ~14.7:1 in both
                // themes) and the weight mark the choice.
                checked
                  ? "bg-primary font-semibold text-primary-foreground ring-2 ring-inset ring-foreground"
                  : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {/* Always in the DOM. The All radio's description has to exist while One
          is checked, which is exactly when it is read. */}
      <span id={warningId} className="sr-only">
        {DETAIL_WARNING}
      </span>
      <div className="flex min-h-8 flex-1 basis-56 items-center gap-2 text-xs leading-4 text-muted-foreground">
        <p role="status" aria-live="polite">
          {status.text}
        </p>
        {status.retry ? (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-full border border-border px-2.5 py-0.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
