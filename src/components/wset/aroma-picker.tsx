"use client";

import { useMemo, useState } from "react";
import type { AromaTerm, AromaOrigin } from "@/lib/wset/types";
import { WSET } from "./tokens";

const ORIGINS: { origin: AromaOrigin; label: string; caption: string }[] = [
  { origin: "PRIMARY", label: "Primary", caption: "grape & terroir" },
  { origin: "SECONDARY", label: "Secondary", caption: "winemaking" },
  { origin: "TERTIARY", label: "Tertiary", caption: "ageing" },
];

// Multi-select aroma/flavour picker over the seeded WSET lexicon. Origin tabs
// (Primary / Secondary / Tertiary — how the aroma arises) carry a per-origin
// selected count; the active tab shows its clusters (caption + wrapped pills in
// sort order); a summary strip lists every selection with remove/clear. The
// palate instance passes `copyFrom` to surface a "Copy from nose" button that
// unions the nose selections in.
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
  const [activeOrigin, setActiveOrigin] = useState<AromaOrigin>("PRIMARY");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const byId = useMemo(() => new Map(terms.map((t) => [t.id, t])), [terms]);

  const countByOrigin = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of selectedIds) {
      const term = byId.get(id);
      if (term) counts[term.origin] = (counts[term.origin] ?? 0) + 1;
    }
    return counts;
  }, [selectedIds, byId]);

  // Clusters of the active origin, in sort order, caption preserved.
  const groups = useMemo(() => {
    const inOrigin = terms
      .filter((t) => t.origin === activeOrigin)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const out: { name: string; items: AromaTerm[] }[] = [];
    for (const t of inOrigin) {
      const last = out[out.length - 1];
      if (last && last.name === t.groupName) last.items.push(t);
      else out.push({ name: t.groupName, items: [t] });
    }
    return out;
  }, [terms, activeOrigin]);

  const toggle = (id: string) => {
    if (selected.has(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 22, borderBottom: `1px solid ${WSET.hairline}`, marginBottom: 12 }}>
        {ORIGINS.map(({ origin, label, caption }) => {
          const active = origin === activeOrigin;
          const count = countByOrigin[origin] ?? 0;
          return (
            <button
              key={origin}
              type="button"
              onClick={() => setActiveOrigin(origin)}
              style={{
                display: "inline-flex",
                alignItems: "baseline",
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
                textAlign: "left",
              }}
            >
              {label}
              <span style={{ fontSize: 10.5, fontWeight: 500, color: WSET.muted2 }}>{caption}</span>
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
        <div key={group.name} style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8, marginBottom: 5, alignItems: "start" }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, color: WSET.gold, paddingTop: 3 }}>
            {group.name}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
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
                    padding: "2px 9px",
                    fontSize: 11.5,
                    lineHeight: 1.35,
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
