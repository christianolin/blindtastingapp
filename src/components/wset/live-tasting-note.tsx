"use client";

import { WSET } from "./tokens";

// The auto-composed tasting note (prose per non-empty section). Content is
// derived by lib/wset/live-note; this only renders it.
export function LiveTastingNote({
  sections,
  heading = "Tasting note · live",
  emptyText = "Slide and select — your note writes itself.",
}: {
  sections: { caption: string; prose: string }[];
  /** Localised header + empty-state copy; English defaults keep older callers. */
  heading?: string;
  emptyText?: string;
}) {
  return (
    <div style={{ background: WSET.insetBg, border: `1px solid ${WSET.border}`, borderRadius: 16, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: WSET.gold, display: "inline-block" }} />
        <span style={{ fontSize: 9.5, letterSpacing: "0.13em", textTransform: "uppercase", fontWeight: 600, color: WSET.gold }}>
          {heading}
        </span>
      </div>
      {sections.length === 0 ? (
        <p className="font-heading" style={{ fontStyle: "italic", fontSize: 13.5, color: WSET.muted2 }}>
          {emptyText}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sections.map((s) => (
            <div key={s.caption}>
              <p style={{ fontSize: 9.5, letterSpacing: "0.13em", textTransform: "uppercase", fontWeight: 600, color: WSET.gold, marginBottom: 2 }}>
                {s.caption}
              </p>
              <p className="font-heading" style={{ fontStyle: "italic", fontSize: 13.5, lineHeight: 1.6, color: WSET.note }}>
                {s.prose}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
