"use client";

import { useCallback, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  scoreToPct,
  pctToScore,
  qualityBand,
} from "@/lib/wset/quality-curve.mjs";
import { makeT, translateBand, type WsetLang } from "@/lib/wset/i18n";
import { cn } from "@/lib/utils";
import { useSlideGesture } from "./snap-slider";

const TICKS = [50, 70, 80, 85, 90, 95, 100];

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
export function QualitySlider({
  score,
  onChange,
  lang = "en",
}: {
  score: number | null;
  onChange: (score: number | null) => void;
  lang?: WsetLang;
}) {
  const t = makeT(lang);
  const trackRef = useRef<HTMLDivElement>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const whyId = useId();

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
      onChange(pctToScore(pct));
    },
    [onChange],
  );
  const gesture = useSlideGesture(setFromClientX);

  const pos = score === null ? null : scoreToPct(score);

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
          {score === null ? "—" : score}
        </span>
        {score !== null ? (
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
            {pos !== null && pos > 0 ? (
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
            {TICKS.map((tick) => (
              <button
                key={tick}
                type="button"
                aria-label={`${t("score")} ${tick}`}
                onClick={() => onChange(tick)}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: `${scoreToPct(tick)}%`,
                  transform: "translate(-50%, -50%)",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  padding: 0,
                  cursor: "pointer",
                  background: pos !== null && scoreToPct(tick) <= pos ? "var(--gold-deep)" : "var(--muted)",
                  border: "1px solid var(--border-strong)",
                }}
              />
            ))}
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
          </div>
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
        </div>
        <div style={{ position: "relative", zIndex: 2, height: 18, marginTop: 8, pointerEvents: "none" }}>
          {TICKS.map((tick) => (
            <button
              key={tick}
              type="button"
              onClick={() => onChange(tick)}
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
