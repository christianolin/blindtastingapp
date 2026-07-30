"use client";

import { WSET } from "./tokens";

// Editable low→high band over a scale's stops. Clicking a stop outside the band
// extends the nearer end to it; clicking inside moves the nearer end (shrinks).
// value null = unset ("varies"); the first click seeds a single-stop band.
export function EditableRange({
  stops,
  value,
  labels,
  onChange,
}: {
  stops: readonly string[];
  value: readonly [string, string] | null;
  labels: Record<string, string>;
  onChange: (range: [string, string]) => void;
}) {
  const n = stops.length;
  const lo = value ? stops.indexOf(value[0]) : -1;
  const hi = value ? stops.indexOf(value[1]) : -1;
  const pct = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);
  const set = value !== null && lo >= 0 && hi >= 0;

  const click = (i: number) => {
    if (!set) return onChange([stops[i], stops[i]]);
    if (i < lo) return onChange([stops[i], stops[hi]]);
    if (i > hi) return onChange([stops[lo], stops[i]]);
    if (i - lo <= hi - i) return onChange([stops[i], stops[hi]]);
    return onChange([stops[lo], stops[i]]);
  };

  return (
    <div style={{ padding: "0 40px", userSelect: "none" }}>
      <div style={{ position: "relative", height: 6, borderRadius: 3, background: WSET.track }}>
        {set ? (
          <div
            style={{
              position: "absolute",
              left: `${pct(lo)}%`,
              width: `${pct(hi) - pct(lo)}%`,
              height: 6,
              borderRadius: 3,
              background: WSET.burgundy,
            }}
          />
        ) : null}
        {stops.map((s, i) => {
          const on = set && i >= lo && i <= hi;
          return (
            <button
              key={s}
              type="button"
              aria-label={labels[s] ?? s}
              onClick={() => click(i)}
              style={{
                position: "absolute",
                top: "50%",
                left: `${pct(i)}%`,
                transform: "translate(-50%, -50%)",
                width: 14,
                height: 14,
                borderRadius: "50%",
                padding: 0,
                cursor: "pointer",
                background: on ? WSET.burgundy : WSET.dotUnfilled,
                border: on ? "none" : `1px solid ${WSET.dotBorder}`,
              }}
            />
          );
        })}
      </div>
      <div style={{ position: "relative", height: n >= 4 ? 30 : 18, marginTop: 8 }}>
        {stops.map((s, i) => {
          const active = set && (i === lo || i === hi);
          const lower = n >= 4 && i % 2 === 1;
          return (
            <button
              key={s}
              type="button"
              onClick={() => click(i)}
              style={{
                position: "absolute",
                left: `${pct(i)}%`,
                top: lower ? 14 : 0,
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
                fontSize: 10.5,
                cursor: "pointer",
                background: "none",
                border: "none",
                padding: 0,
                fontWeight: active ? 700 : 500,
                color: active ? WSET.ink : WSET.muted2,
              }}
            >
              {labels[s] ?? s}
            </button>
          );
        })}
      </div>
    </div>
  );
}
