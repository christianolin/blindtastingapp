"use client";

import { useCallback, useRef } from "react";
import {
  scoreToPct,
  pctToScore,
  qualityBand,
} from "@/lib/wset/quality-curve.mjs";
import { WSET } from "./tokens";

const TICKS = [50, 70, 80, 85, 90, 95, 100];

// The weighted 100-point quality slider (WSET quality replaced by a
// Parker-style score). Track position is non-linear via the shared
// quality-curve module: 85 sits at 40% (the gold knee), 90 at 70%, so the
// 85-92 band where most wines land gets the widest travel.
export function QualitySlider({
  score,
  onChange,
}: {
  score: number | null;
  onChange: (score: number | null) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

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

  const pos = score === null ? null : scoreToPct(score);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <span className="font-heading" style={{ fontSize: 31, fontWeight: 700, color: WSET.ink }}>
          {score === null ? "—" : score}
        </span>
        {score !== null ? (
          <span style={{ fontSize: 12, fontWeight: 600, color: WSET.gold }}>
            {qualityBand(score)}
          </span>
        ) : null}
      </div>
      <div style={{ padding: "0 46px", userSelect: "none", touchAction: "none" }}>
        <div
          ref={trackRef}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setFromClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromClientX(e.clientX);
          }}
          style={{
            position: "relative",
            height: 6,
            borderRadius: 3,
            background: WSET.track,
            cursor: "pointer",
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
                background: WSET.gold,
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
              background: WSET.gold,
            }}
          />
          {TICKS.map((t) => (
            <button
              key={t}
              type="button"
              aria-label={`Score ${t}`}
              onClick={() => onChange(t)}
              style={{
                position: "absolute",
                top: "50%",
                left: `${scoreToPct(t)}%`,
                transform: "translate(-50%, -50%)",
                width: 8,
                height: 8,
                borderRadius: "50%",
                padding: 0,
                cursor: "pointer",
                background: pos !== null && scoreToPct(t) <= pos ? WSET.gold : WSET.dotUnfilled,
                border: `1px solid ${WSET.dotBorder}`,
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
              background: pos === null ? "transparent" : WSET.gold,
              border: pos === null ? `2px dashed ${WSET.ghost}` : `3px solid ${WSET.cream}`,
              boxShadow: pos === null ? "none" : "0 1px 5px rgba(70,25,40,0.35)",
            }}
          />
        </div>
        <div style={{ position: "relative", height: 18, marginTop: 8 }}>
          {TICKS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange(t)}
              style={{
                position: "absolute",
                left: `${scoreToPct(t)}%`,
                top: 0,
                transform: "translateX(-50%)",
                fontSize: 11,
                cursor: "pointer",
                background: "none",
                border: "none",
                padding: 0,
                fontWeight: t === 85 ? 700 : 500,
                color: t === 85 ? WSET.gold : WSET.muted2,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <p style={{ marginTop: 8, fontSize: 11, color: WSET.muted2 }}>
        Weighted scale — 50–84 is compressed into the left of the bar; 85–92,
        where most good wines land, gets the widest stretch; 95+ sits in the
        rarefied right edge.
      </p>
    </div>
  );
}
