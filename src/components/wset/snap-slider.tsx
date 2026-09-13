"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

/** How far (CSS px) a finger or pen travels before a scale decides slide vs scroll. */
export const SLIDE_SLOP = 6;

/** A press on a slider's hit layer: undecided, sliding the value, or the page scrolling. */
export type SlideState = "pending" | "slide" | "scroll";

/** A mouse commits on press; a finger or a pen waits to see which way it moves. */
export function initialSlideState(pointerType: string): SlideState {
  return pointerType === "mouse" ? "slide" : "pending";
}

/**
 * Decide once, then stick. Sideways past the slop is a slide; up or down (or a
 * diagonal tie) past it is the page scrolling — the browser takes that pan
 * under `touch-action: pan-y` and fires pointercancel, so nothing is written.
 */
export function nextSlideState(
  state: SlideState,
  dx: number,
  dy: number,
  slop = SLIDE_SLOP,
): SlideState {
  if (state !== "pending") return state;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax <= slop && ay <= slop) return "pending";
  return ax > ay ? "slide" : "scroll";
}

/**
 * Whether lifting the pointer writes a value: a tap (still undecided) or a
 * sideways lift no move was reported for. A slide has already written as it
 * moved, and a scroll never writes.
 */
export function releaseWrites(
  state: SlideState,
  dx: number,
  dy: number,
  slop = SLIDE_SLOP,
): boolean {
  return state === "pending" && nextSlideState(state, dx, dy, slop) !== "scroll";
}

/**
 * Pointer handlers for a slider's hit layer (SnapSlider and QualitySlider). A
 * mouse sets the nearest value on press and drags from there. A finger or a pen
 * waits for intent, so a swipe that starts on a scale still scrolls the note
 * and never rates the row by accident: a tap sets the value on lift, and a
 * sideways drag follows the finger once it passes the slop.
 */
export function useSlideGesture(setFromClientX: (clientX: number) => void) {
  const press = useRef<{ id: number; x0: number; y0: number; state: SlideState } | null>(null);
  const forget = (e: ReactPointerEvent<HTMLElement>) => {
    if (press.current?.id === e.pointerId) press.current = null;
  };
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const state = initialSlideState(e.pointerType);
      press.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, state };
      if (state === "slide") setFromClientX(e.clientX);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const p = press.current;
      if (!p || p.id !== e.pointerId) return;
      p.state = nextSlideState(p.state, e.clientX - p.x0, e.clientY - p.y0);
      if (p.state === "slide") setFromClientX(e.clientX);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const p = press.current;
      if (!p || p.id !== e.pointerId) return;
      press.current = null;
      if (releaseWrites(p.state, e.clientX - p.x0, e.clientY - p.y0)) setFromClientX(e.clientX);
    },
    // The browser took the touch for a scroll, or capture went elsewhere.
    onPointerCancel: forget,
    onLostPointerCapture: forget,
  };
}

// A snapping graded slider for the WSET scales. Value is one of `stops` or null
// (the unrated ghost state). Pointer-capture drag snaps to the nearest stop.
// Read-only `range` mode draws a low→high band (both end-caps) instead of a
// single thumb — used to visualise an archetype's typical range.
//
// The pointer lives on an invisible 44px hit layer over the 6px track (reaching
// past both ends by the thumb's radius), not on the track itself, so a finger
// that lands a few pixels off the line still presses the scale — rated or
// unrated. A mouse sets the nearest stop on press; a finger waits for intent
// (useSlideGesture): a tap sets it on lift, a sideways drag follows once past
// the slop, and an up/down swipe is left to the browser (touch-action: pan-y)
// so the note still scrolls. The thumb stays pointer-events none and is never
// pre-rendered: the thumb appears where the first value lands. The stop dots
// stay buttons under the layer for keyboard and screen-reader users.
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
  const gesture = useSlideGesture(setFromClientX);

  const showLabelRow = range !== null;
  return (
    // Interactive scales frame the track with just the endpoint labels
    // (Low ○──●──○ High) at every width — the chosen value reads at the row
    // title. Only the read-only range mode (archetype view) keeps the full
    // per-stop label row on desktop: there the labels ARE the content.
    <div
      className={showLabelRow ? "px-0 sm:px-[46px]" : "px-0"}
      style={{ userSelect: "none", touchAction: "pan-y" }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={showLabelRow ? "sm:hidden" : undefined}
          style={{ fontSize: 10.5, fontWeight: 500, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}
        >
          {labels[stops[0]] ?? stops[0]}
        </span>
        <div className="min-w-0 flex-1">
          <div style={{ position: "relative" }}>
            <div
              ref={trackRef}
              style={{
                position: "relative",
                height: 6,
                borderRadius: 3,
                background: "var(--secondary)",
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
                    background: "var(--primary)",
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
                    background: "var(--primary)",
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
                      background: reached ? "var(--primary)" : "var(--muted)",
                      border: reached ? "none" : "1px solid var(--border-strong)",
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
                      background: "var(--primary)",
                      border: "3px solid var(--card)",
                      boxShadow: "0 1px 4px rgba(42,33,30,0.3)",
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
                    background: "var(--primary)",
                    border: "3px solid var(--card)",
                    boxShadow: "0 1px 5px rgba(42,33,30,0.35)",
                  }}
                />
              ) : null}
            </div>
            {interactive ? (
              // The hit layer: a sibling of the track (so the unrated fade
              // never reaches it), 44px tall and centred on the line, 11px past
              // each end so the first and last stops take a thumb-wide press.
              // pan-y lets a vertical swipe that starts here scroll the note.
              <div
                aria-hidden
                data-slot="slider-hit"
                {...gesture}
                style={{
                  position: "absolute",
                  left: -11,
                  right: -11,
                  top: "50%",
                  height: 44,
                  transform: "translateY(-50%)",
                  zIndex: 1,
                  cursor: "pointer",
                  touchAction: "pan-y",
                }}
              />
            ) : null}
          </div>
        </div>
        <span
          className={showLabelRow ? "sm:hidden" : undefined}
          style={{ fontSize: 10.5, fontWeight: 500, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}
        >
          {labels[stops[n - 1]] ?? stops[n - 1]}
        </span>
      </div>
      <div className={showLabelRow ? "max-sm:hidden" : "hidden"} style={{ position: "relative", height: useStagger ? 32 : 18, marginTop: 8 }}>
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
                color: active ? "var(--foreground)" : "var(--placeholder)",
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
