"use client";

import { useCallback, useRef } from "react";
import { WSET } from "./tokens";

// A snapping graded slider for the WSET scales. Value is one of `stops` or null
// (the unrated ghost state). Pointer-capture drag snaps to the nearest stop.
// Read-only `range` mode draws a low→high band (both end-caps) instead of a
// single thumb — used to visualise an archetype's typical range.
export function SnapSlider<T extends string>({
  stops,
  value,
  onChange,
  labels,
  staggered,
  range = null,
  readOnly = false,
}: {
  stops: readonly T[];
  value: T | null;
  onChange?: (value: T) => void;
  labels: Record<string, string>;
  staggered?: boolean;
  range?: readonly [T, T] | null;
  readOnly?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const n = stops.length;
  const index = value === null ? null : stops.indexOf(value);
  const useStagger = staggered ?? n >= 4;
  const pct = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);

  // Range band bounds (sorted); -1 when not in range mode.
  const rLo = range ? Math.min(stops.indexOf(range[0]), stops.indexOf(range[1])) : -1;
  const rHi = range ? Math.max(stops.indexOf(range[0]), stops.indexOf(range[1])) : -1;
  const inRange = (i: number) => range !== null && i >= rLo && i <= rHi;
  const interactive = !readOnly && !!onChange;

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || !onChange) return;
      const rect = el.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onChange(stops[Math.round(frac * (n - 1))]);
    },
    [n, onChange, stops],
  );

  return (
    <div style={{ padding: "0 46px", userSelect: "none", touchAction: "none" }}>
      <div
        ref={trackRef}
        onPointerDown={
          interactive
            ? (e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setFromClientX(e.clientX);
              }
            : undefined
        }
        onPointerMove={
          interactive
            ? (e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromClientX(e.clientX);
              }
            : undefined
        }
        style={{
          position: "relative",
          height: 6,
          borderRadius: 3,
          background: WSET.track,
          cursor: interactive ? "pointer" : "default",
          // Unrated single-value sliders fade back; range mode is always solid.
          opacity: !range && index === null ? 0.4 : 1,
          transition: "opacity 120ms",
        }}
      >
        {range !== null ? (
          <div
            style={{
              position: "absolute",
              left: `${pct(rLo)}%`,
              top: 0,
              height: 6,
              borderRadius: 3,
              background: WSET.burgundy,
              width: `${pct(rHi) - pct(rLo)}%`,
            }}
          />
        ) : index !== null && index > 0 ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              height: 6,
              borderRadius: 3,
              background: WSET.burgundy,
              width: `${pct(index)}%`,
            }}
          />
        ) : null}
        {stops.map((stop, i) => {
          const reached = range !== null ? inRange(i) : index !== null && i <= index;
          return (
            <button
              key={stop}
              type="button"
              aria-label={labels[stop] ?? stop}
              onClick={interactive ? () => onChange!(stop) : undefined}
              disabled={!interactive}
              style={{
                position: "absolute",
                top: "50%",
                left: `${pct(i)}%`,
                transform: "translate(-50%, -50%)",
                width: 8,
                height: 8,
                borderRadius: "50%",
                padding: 0,
                cursor: interactive ? "pointer" : "default",
                background: reached ? WSET.burgundy : WSET.dotUnfilled,
                border: reached ? "none" : `1px solid ${WSET.dotBorder}`,
              }}
            />
          );
        })}
        {range !== null ? (
          [rLo, rHi].map((i, k) => (
            <div
              key={k}
              aria-hidden
              style={{
                position: "absolute",
                top: "50%",
                left: `${pct(i)}%`,
                transform: "translate(-50%, -50%)",
                width: 16,
                height: 16,
                borderRadius: "50%",
                pointerEvents: "none",
                background: WSET.burgundy,
                border: `3px solid ${WSET.cream}`,
                boxShadow: "0 1px 4px rgba(70,25,40,0.3)",
              }}
            />
          ))
        ) : index !== null ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: "50%",
              left: `${pct(index)}%`,
              transform: "translate(-50%, -50%)",
              width: 22,
              height: 22,
              borderRadius: "50%",
              transition: "left 80ms",
              pointerEvents: "none",
              background: WSET.burgundy,
              border: `3px solid ${WSET.cream}`,
              boxShadow: "0 1px 5px rgba(70,25,40,0.35)",
            }}
          />
        ) : null}
      </div>
      <div style={{ position: "relative", height: useStagger ? 32 : 18, marginTop: 8 }}>
        {stops.map((stop, i) => {
          const active = range !== null ? i === rLo || i === rHi : index === i;
          const lower = useStagger && i % 2 === 1;
          return (
            <button
              key={stop}
              type="button"
              onClick={interactive ? () => onChange!(stop) : undefined}
              disabled={!interactive}
              style={{
                position: "absolute",
                left: `${pct(i)}%`,
                top: lower ? 15 : 0,
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
                fontSize: 11,
                cursor: interactive ? "pointer" : "default",
                background: "none",
                border: "none",
                padding: 0,
                fontWeight: active ? 700 : 500,
                color: active ? WSET.ink : WSET.muted2,
              }}
            >
              {labels[stop] ?? stop}
            </button>
          );
        })}
      </div>
    </div>
  );
}
