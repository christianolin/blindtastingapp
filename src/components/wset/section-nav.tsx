"use client";

import { WSET } from "./tokens";

export type SectionNavItem = {
  id: string;
  numeral: string;
  name: string;
  done: number;
  total: number;
};

// The sticky left-rail section index. Scroll-spy (which section is active) is
// owned by WsetSheet; this is presentational and delegates the jump so the
// sheet can compute the sticky-bar offset.
export function SectionNav({
  sections,
  activeId,
  onJump,
}: {
  sections: SectionNavItem[];
  activeId: string;
  onJump: (id: string) => void;
}) {
  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {sections.map((s) => {
        const active = s.id === activeId;
        const complete = s.done >= s.total;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onJump(s.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 10,
              textAlign: "left",
              cursor: "pointer",
              border: "none",
              background: active ? "#F3EAD6" : "transparent",
            }}
          >
            <span
              className="font-heading"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 26,
                height: 26,
                borderRadius: 7,
                fontSize: 13,
                background: active ? WSET.burgundy : "#EADFC7",
                color: active ? WSET.creamText : "#7A6753",
              }}
            >
              {s.numeral}
            </span>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: active ? WSET.ink : WSET.muted }}>
              {s.name}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: complete ? WSET.gold : WSET.faint }}>
              {s.done}/{s.total}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
