"use client";

import { useMemo, useState } from "react";
import type { AromaTerm, AromaFamily } from "@/lib/wset/types";
import { WSET } from "./tokens";

const FAMILIES: { family: AromaFamily; label: string }[] = [
  { family: "FRUIT", label: "Fruit" },
  { family: "FLORAL", label: "Floral" },
  { family: "SPICE", label: "Spice" },
  { family: "VEGETAL_OAK", label: "Vegetal & oak" },
  { family: "OTHER", label: "Other" },
];

// Multi-select aroma/flavour picker over the seeded WSET lexicon. Family
// tabs carry a per-family selected count; the active family shows its groups
// (caption + wrapped pills in sort order); a summary strip lists every
// selection with remove/clear. The palate instance passes `copyFrom` to
// surface a "Copy from nose" button that unions the nose selections in.
export function AromaPicker({
  terms,
  selectedIds,
  onChange,
  copyFrom,
}: {
  terms: AromaTerm[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  copyFrom?: { label: string; ids: string[] };
}) {
  const [activeFamily, setActiveFamily] = useState<AromaFamily>("FRUIT");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const byId = useMemo(() => new Map(terms.map((t) => [t.id, t])), [terms]);

  const countByFamily = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of selectedIds) {
      const term = byId.get(id);
      if (term) counts[term.family] = (counts[term.family] ?? 0) + 1;
    }
    return counts;
  }, [selectedIds, byId]);

  // Groups of the active family, in sort order, caption preserved.
  const groups = useMemo(() => {
    const inFamily = terms
      .filter((t) => t.family === activeFamily)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const out: { name: string; items: AromaTerm[] }[] = [];
    for (const t of inFamily) {
      const last = out[out.length - 1];
      if (last && last.name === t.groupName) last.items.push(t);
      else out.push({ name: t.groupName, items: [t] });
    }
    return out;
  }, [terms, activeFamily]);

  const toggle = (id: string) => {
    if (selected.has(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 18, borderBottom: `1px solid ${WSET.hairline}`, marginBottom: 12 }}>
        {FAMILIES.map(({ family, label }) => {
          const active = family === activeFamily;
          const count = countByFamily[family] ?? 0;
          return (
            <button
              key={family}
              type="button"
              onClick={() => setActiveFamily(family)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "0 0 8px",
                fontSize: 13,
                cursor: "pointer",
                background: "none",
                border: "none",
                borderBottom: active ? `2px solid ${WSET.burgundy}` : "2px solid transparent",
                marginBottom: -1,
                fontWeight: active ? 600 : 500,
                color: active ? WSET.ink : WSET.muted,
              }}
            >
              {label}
              {count > 0 ? (
                <span
                  style={{
                    borderRadius: 999,
                    background: WSET.goldSoft,
                    color: WSET.pillText,
                    fontSize: 10.5,
                    fontWeight: 600,
                    padding: "1px 7px",
                  }}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {groups.map((group) => (
        <div key={group.name} style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, color: WSET.gold, paddingTop: 7 }}>
            {group.name}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {group.items.map((term) => {
              const isSel = selected.has(term.id);
              return (
                <button
                  key={term.id}
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => toggle(term.id)}
                  style={{
                    borderRadius: 999,
                    padding: "7px 14px",
                    fontSize: 12.5,
                    cursor: "pointer",
                    background: isSel ? WSET.burgundy : WSET.pillBg,
                    border: `1px solid ${WSET.pillBorder}`,
                    color: isSel ? WSET.creamText : WSET.pillText,
                    fontWeight: isSel ? 600 : 500,
                  }}
                >
                  {term.term}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {copyFrom && copyFrom.ids.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange([...new Set([...selectedIds, ...copyFrom.ids])])}
          style={{
            marginTop: 4,
            borderRadius: 999,
            padding: "5px 12px",
            fontSize: 11.5,
            fontWeight: 600,
            cursor: "pointer",
            background: "transparent",
            border: `1px solid ${WSET.pillBorder}`,
            color: "#7A5F35",
          }}
        >
          {copyFrom.label}
        </button>
      ) : null}

      {selectedIds.length > 0 ? (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${WSET.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.13em", fontWeight: 600, color: WSET.gold }}>
              Selected · {selectedIds.length}
            </span>
            {selectedIds.map((id) => {
              const term = byId.get(id);
              if (!term) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  style={{
                    borderRadius: 999,
                    padding: "3px 9px",
                    fontSize: 11.5,
                    cursor: "pointer",
                    background: WSET.burgundy,
                    border: "none",
                    color: WSET.creamText,
                  }}
                >
                  {term.term} ×
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onChange([])}
              style={{
                fontSize: 11.5,
                cursor: "pointer",
                background: "none",
                border: "none",
                color: WSET.muted,
                textDecoration: "underline dotted",
              }}
            >
              clear
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
