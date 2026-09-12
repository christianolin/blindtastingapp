"use client";

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
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gold-deep)", display: "inline-block" }} />
        <span style={{ fontSize: 9.5, letterSpacing: "0.13em", textTransform: "uppercase", fontWeight: 600, color: "var(--gold-dark)" }}>
          {heading}
        </span>
      </div>
      {sections.length === 0 ? (
        <p className="font-heading" style={{ fontStyle: "italic", fontSize: 13.5, color: "var(--muted-foreground)" }}>
          {emptyText}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sections.map((s) => (
            <div key={s.caption}>
              <p style={{ fontSize: 9.5, letterSpacing: "0.13em", textTransform: "uppercase", fontWeight: 600, color: "var(--gold-dark)", marginBottom: 2 }}>
                {s.caption}
              </p>
              <p className="font-heading" style={{ fontStyle: "italic", fontSize: 13.5, lineHeight: 1.6, color: "var(--foreground)" }}>
                {s.prose}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
