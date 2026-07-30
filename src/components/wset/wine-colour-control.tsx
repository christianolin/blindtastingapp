"use client";

import type { WineColour, ColourHue } from "@/lib/wset/types";
import { HUES_BY_COLOUR, HUE_HEX, LABELS } from "@/lib/wset/vocab";
import { WSET } from "./tokens";

const COLOUR_LABEL: Record<WineColour, string> = {
  WHITE: "White",
  ORANGE: "Orange",
  ROSE: "Rosé",
  RED: "Red",
};
const COLOURS: WineColour[] = ["WHITE", "ORANGE", "ROSE", "RED"];

// Colour is the wine's identity (set on the catalog wine), so the segmented
// control is read-only here — it shows which family this wine is. The hue
// slider below picks the observed shade within that family's gradient.
export function WineColourControl({
  colour,
  hue,
  onChange,
}: {
  colour: WineColour;
  hue: ColourHue | null;
  onChange: (hue: ColourHue | null) => void;
}) {
  const hues = HUES_BY_COLOUR[colour];
  const selected = hue === null ? null : hues.indexOf(hue);
  const hexes = hues.map((h) => HUE_HEX[colour][h] ?? WSET.track);
  const pct = (i: number) => (hues.length <= 1 ? 0 : (i / (hues.length - 1)) * 100);
  const gradient = `linear-gradient(to right, ${hexes.join(", ")})`;

  return (
    <div>
      <div
        style={{
          display: "inline-flex",
          gap: 3,
          padding: 3,
          borderRadius: 999,
          background: WSET.goldSoft,
          marginBottom: 16,
        }}
      >
        {COLOURS.map((c) => {
          const active = c === colour;
          return (
            <span
              key={c}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                borderRadius: 999,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: active ? 600 : 500,
                background: active ? WSET.cream : "transparent",
                color: active ? WSET.ink : WSET.muted2,
                boxShadow: active ? "0 1px 2px rgba(70,25,40,0.12)" : "none",
              }}
            >
              {COLOUR_LABEL[c]}
            </span>
          );
        })}
      </div>

      <div style={{ padding: "0 20px", userSelect: "none" }}>
        <div
          style={{
            position: "relative",
            height: 10,
            borderRadius: 5,
            background: gradient,
          }}
        >
          {hues.map((h, i) => {
            const isSel = selected === i;
            return (
              <button
                key={h}
                type="button"
                aria-label={LABELS[h] ?? h}
                aria-pressed={isSel}
                onClick={() => onChange(isSel ? null : h)}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: `${pct(i)}%`,
                  transform: `translate(-50%, -50%) scale(${isSel ? 1.25 : 1})`,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  padding: 0,
                  cursor: "pointer",
                  background: HUE_HEX[colour][h] ?? WSET.track,
                  border: isSel
                    ? `2px solid ${WSET.burgundy}`
                    : `1px solid ${WSET.dotBorder}`,
                  transition: "transform 120ms",
                }}
              />
            );
          })}
        </div>
        <div style={{ position: "relative", height: 18, marginTop: 10 }}>
          {hues.map((h, i) => (
            <button
              key={h}
              type="button"
              onClick={() => onChange(selected === i ? null : h)}
              style={{
                position: "absolute",
                left: `${pct(i)}%`,
                top: 0,
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
                fontSize: 11,
                cursor: "pointer",
                background: "none",
                border: "none",
                padding: 0,
                fontWeight: selected === i ? 700 : 500,
                color: selected === i ? WSET.ink : WSET.muted2,
              }}
            >
              {LABELS[h] ?? h}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
