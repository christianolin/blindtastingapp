"use client";

import { useCallback, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown } from "lucide-react";
import {
  scoreToPct,
  pctToScore,
  qualityBand,
} from "@/lib/wset/quality-curve.mjs";
import { labelsFor, makeT, translateBand, type WsetLang } from "@/lib/wset/i18n";
import { capKeyStep, dragBand, sameBand, scoreBand, stepBandEnd, tapBand, type Band } from "@/lib/wset/range-edit";
import { cn } from "@/lib/utils";
import { useSlideGesture } from "./snap-slider";

const TICKS = [50, 70, 80, 85, 90, 95, 100];
const SCORE_MIN = TICKS[0];
const SCORE_MAX = TICKS[TICKS.length - 1];

/** One score (the note), or a low→high score range (the admin's typical-wine editor). */
type QualitySliderProps =
  | {
      score: number | null;
      onChange: (score: number | null) => void;
      lang?: WsetLang;
      range?: undefined;
      onRangeChange?: undefined;
    }
  | {
      /** null: not set yet. */
      range: readonly [number, number] | null;
      /** Never called with an unchanged range; clearing is the caller's own control. */
      onRangeChange: (range: [number, number]) => void;
      lang?: WsetLang;
      score?: undefined;
      onChange?: undefined;
    };

// The weighted 100-point quality slider (WSET quality replaced by a
// Parker-style score). Track position is non-linear via the shared
// quality-curve module: 85 sits at 40% (the gold knee), 90 at 70%, so the
// 85-92 band where most wines land gets the widest travel.
//
// Why the scale is weighted is a collapsed "Why 100 points?" disclosure — read
// once, not four lines under the control every time. Its trigger sits at the
// right of the score line on desktop and under the scale on phones: two slots,
// one state, one keep-mounted panel under the scale. As in SnapSlider an
// invisible 44px hit layer over the 6px track owns the pointer, with the same
// press intent (useSlideGesture: a finger waits, so a swipe from the scale
// still scrolls). The score line and the tick labels sit above that layer, so
// the "Why 100 points?" pill always opens and a tap on "85" is exactly 85.
//
// Range mode (`onRangeChange`) edits a typical range on the same scale by
// range-edit.ts's rule, on whole scores: the score line reads "88–96" and the
// band word of its top, the track draws the band between two gold caps.
export function QualitySlider(props: QualitySliderProps) {
  const lang = props.lang ?? "en";
  const t = makeT(lang);
  const L = labelsFor(lang);
  const trackRef = useRef<HTMLDivElement>(null);
  // The end a range press holds still while it slides; null until the press's
  // first write.
  const anchorRef = useRef<number | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const whyId = useId();
  const onChange = props.onChange;
  const onRangeChange = props.onRangeChange;
  const score = props.onRangeChange === undefined ? props.score : null;
  const band = props.onRangeChange === undefined ? null : scoreBand(props.range);

  // A band change, reported only when it changes something.
  const commitBand = useCallback(
    (next: Band) => {
      if (onRangeChange && !sameBand(band, next)) onRangeChange([next[0], next[1]]);
    },
    [band, onRangeChange],
  );

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
      const at = pctToScore(pct);
      if (onRangeChange) {
        // The press's first write is a tap; the rest slide the end it took.
        const anchor = anchorRef.current;
        const next = anchor === null ? tapBand(band, at) : { band: dragBand(anchor, at), anchor };
        anchorRef.current = next.anchor;
        commitBand(next.band);
        return;
      }
      onChange?.(at);
    },
    [band, commitBand, onChange, onRangeChange],
  );
  const gesture = useSlideGesture(setFromClientX);
  // Each new range press starts with a tap.
  const hitHandlers = onRangeChange
    ? {
        ...gesture,
        onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
          anchorRef.current = null;
          gesture.onPointerDown(e);
        },
      }
    : gesture;
  // A tick dot or a tick label: that score, or in range mode a tap on it.
  const pickTick = (tick: number) => {
    if (onRangeChange) {
      anchorRef.current = null;
      commitBand(tapBand(band, tick).band);
      return;
    }
    onChange?.(tick);
  };

  const pos = score === null ? null : scoreToPct(score);
  const bandPct = band === null ? null : ([scoreToPct(band[0]), scoreToPct(band[1])] as const);
  const rangeMode = onRangeChange !== undefined;

  const whyTrigger = (className: string) => (
    <button
      type="button"
      aria-expanded={whyOpen}
      aria-controls={whyId}
      onClick={() => setWhyOpen((open) => !open)}
      className={cn(
        "relative inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-[5px] text-[11.5px] font-semibold text-primary hover:bg-muted",
        className,
      )}
    >
      {t("why_100")}
      <ChevronDown
        aria-hidden
        className={cn("size-3.5 transition-transform", whyOpen && "rotate-180")}
      />
    </button>
  );

  return (
    <div>
      {/* Above the hit layer (z 1), whose 44px reaches up into this line. */}
      <div className="relative z-[2] mb-2.5 flex items-baseline gap-2.5">
        <span className="font-heading text-[31px] leading-none font-semibold text-foreground tabular-nums">
          {rangeMode
            ? band === null
              ? "—"
              : band[0] === band[1]
                ? band[0]
                : `${band[0]}–${band[1]}`
            : score === null
              ? "—"
              : score}
        </span>
        {rangeMode ? (
          band !== null ? (
            <span className="text-[12px] font-semibold text-gold-dark">
              {translateBand(qualityBand(band[1]), lang)}
            </span>
          ) : null
        ) : score !== null ? (
          <span className="text-[12px] font-semibold text-gold-dark">
            {translateBand(qualityBand(score), lang)}
          </span>
        ) : null}
        {whyTrigger("ml-auto self-center max-sm:hidden")}
      </div>
      <div style={{ padding: "0 46px", userSelect: "none", touchAction: "pan-y" }}>
        <div style={{ position: "relative" }}>
          <div
            ref={trackRef}
            style={{
              position: "relative",
              height: 6,
              borderRadius: 3,
              background: "var(--secondary)",
            }}
          >
            {rangeMode ? (
              bandPct !== null ? (
                <div
                  style={{
                    position: "absolute",
                    left: `${bandPct[0]}%`,
                    top: 0,
                    height: 6,
                    borderRadius: 3,
                    background: "var(--gold)",
                    width: `${bandPct[1] - bandPct[0]}%`,
                  }}
                />
              ) : null
            ) : pos !== null && pos > 0 ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  height: 6,
                  borderRadius: 3,
                  background: "var(--gold)",
                  width: `${pos}%`,
                }}
              />
            ) : null}
            {/* knee marker at score 85 (40%) */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: "40%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: 2,
                height: 14,
                background: "var(--gold-deep)",
              }}
            />
            {TICKS.map((tick) => {
              const tickPct = scoreToPct(tick);
              const reached = rangeMode
                ? bandPct !== null && tickPct >= bandPct[0] && tickPct <= bandPct[1]
                : pos !== null && tickPct <= pos;
              return (
                <button
                  key={tick}
                  type="button"
                  aria-label={`${t("score")} ${tick}`}
                  aria-pressed={rangeMode ? reached : undefined}
                  onClick={() => pickTick(tick)}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: `${tickPct}%`,
                    transform: "translate(-50%, -50%)",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    padding: 0,
                    cursor: "pointer",
                    background: reached ? "var(--gold-deep)" : "var(--muted)",
                    border: "1px solid var(--border-strong)",
                  }}
                />
              );
            })}
            {rangeMode ? (
              band !== null && bandPct !== null ? (
                bandPct.map((p, k) => (
                  // Each cap is a keyboard slider for its end (range-edit.ts's
                  // capKeyStep/stepBandEnd): an arrow moves it one score, five
                  // with Shift, within 50–100 and never past the other end. The
                  // pointer still goes to the hit layer (pointer-events none).
                  <div
                    key={k}
                    role="slider"
                    tabIndex={0}
                    aria-label={`${t("score")}, ${k === 0 ? L.LOW : L.HIGH}`}
                    aria-valuemin={k === 0 ? SCORE_MIN : band[0]}
                    aria-valuemax={k === 0 ? band[1] : SCORE_MAX}
                    aria-valuenow={band[k]}
                    onKeyDown={(e) => {
                      const delta = capKeyStep(e.key, e.shiftKey);
                      if (delta === null) return;
                      e.preventDefault();
                      commitBand(stepBandEnd(band, k === 0 ? 0 : 1, delta, SCORE_MIN, SCORE_MAX));
                    }}
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: `${p}%`,
                      transform: "translate(-50%, -50%)",
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      pointerEvents: "none",
                      background: "var(--gold)",
                      border: "3px solid var(--card)",
                      boxShadow: "0 1px 5px rgba(42,33,30,0.35)",
                    }}
                  />
                ))
              ) : (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "40%",
                    transform: "translate(-50%, -50%)",
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    pointerEvents: "none",
                    background: "transparent",
                    border: "2px dashed var(--placeholder-soft)",
                  }}
                />
              )
            ) : (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: "50%",
                  left: `${pos === null ? 40 : pos}%`,
                  transform: "translate(-50%, -50%)",
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  transition: "left 60ms",
                  pointerEvents: "none",
                  background: pos === null ? "transparent" : "var(--gold)",
                  border: pos === null ? "2px dashed var(--placeholder-soft)" : "3px solid var(--card)",
                  boxShadow: pos === null ? "none" : "0 1px 5px rgba(42,33,30,0.35)",
                }}
              />
            )}
          </div>
          <div
            aria-hidden
            data-slot="slider-hit"
            {...hitHandlers}
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
        </div>
        <div style={{ position: "relative", zIndex: 2, height: 18, marginTop: 8, pointerEvents: "none" }}>
          {TICKS.map((tick) => (
            <button
              key={tick}
              type="button"
              onClick={() => pickTick(tick)}
              style={{
                position: "absolute",
                left: `${scoreToPct(tick)}%`,
                top: 0,
                transform: "translateX(-50%)",
                fontSize: 11,
                cursor: "pointer",
                background: "none",
                border: "none",
                padding: 0,
                pointerEvents: "auto",
                fontWeight: tick === 85 ? 700 : 500,
                color: tick === 85 ? "var(--gold-dark)" : "var(--muted-foreground)",
              }}
            >
              {tick}
            </button>
          ))}
        </div>
      </div>
      {/* The phone trigger alone gets the 44px strip: on desktop a strip would
          hang below the score line into the slider's hit layer. */}
      {whyTrigger(
        "mt-3 sm:hidden before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
      )}
      <p
        id={whyId}
        hidden={!whyOpen}
        className="mt-2.5 max-w-[68ch] text-[11.5px] leading-relaxed text-muted-foreground"
      >
        {t("quality_help")}
      </p>
    </div>
  );
}
