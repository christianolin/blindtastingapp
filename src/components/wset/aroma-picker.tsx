"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { AromaTerm, AromaOrigin, WineColour } from "@/lib/wset/types";
import { aromaVisibleFor } from "@/lib/wset/vocab";
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
//
// Phones don't get the whole vocabulary inline — the tasting sheet shows only
// the selected chips plus "+ Add", which opens a bottom sheet where the
// clusters stack vertically and collapse (ones holding selections stay open).
export function AromaPicker({
  terms,
  selectedIds,
  onChange,
  copyFrom,
  colour,
  sheetTitle = "Aromas & flavours",
}: {
  terms: AromaTerm[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  copyFrom?: { label: string; ids: string[] };
  colour?: WineColour | null;
  /** Heading of the mobile bottom-sheet picker. */
  sheetTitle?: string;
}) {
  const [activeOrigin, setActiveOrigin] = useState<AromaOrigin>("PRIMARY");
  const [sheetOpen, setSheetOpen] = useState(false);
  // While the sheet is up the page behind must not scroll — an un-locked body
  // drags a "fixed" sheet around with it on iOS.
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);
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
      .filter((t) => t.origin === activeOrigin && aromaVisibleFor(colour, t.groupName, t.term))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const out: { name: string; items: AromaTerm[] }[] = [];
    for (const t of inOrigin) {
      const last = out[out.length - 1];
      if (last && last.name === t.groupName) last.items.push(t);
      else out.push({ name: t.groupName, items: [t] });
    }
    return out;
  }, [terms, activeOrigin, colour]);

  const toggle = (id: string) => {
    if (selected.has(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  // "Copy from nose" only while it would actually add something — once every
  // nose term is here the button would be a silent no-op, so it leaves.
  const copyRemaining = copyFrom
    ? copyFrom.ids.filter((id) => !selected.has(id)).length
    : 0;
  const copyAll = () =>
    copyFrom && onChange([...new Set([...selectedIds, ...copyFrom.ids])]);

  return (
    <div>
      {/* Phones: selection summary + Add. The vocabulary itself lives in the
          bottom sheet so the tasting note stays compact. */}
      <div className="sm:hidden">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
          {selectedIds.map((id) => {
            const term = byId.get(id);
            if (!term) return null;
            return (
              <button
                key={id}
                type="button"
                aria-label={`Remove ${term.term}`}
                onClick={() => toggle(id)}
                style={{
                  borderRadius: 999,
                  padding: "4px 11px",
                  fontSize: 12,
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
            onClick={() => setSheetOpen(true)}
            style={{
              borderRadius: 999,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              background: "transparent",
              border: `1.5px dashed ${WSET.dotBorder}`,
              color: "#7A5F35",
            }}
          >
            + Add
          </button>
          {copyRemaining > 0 ? (
            <button
              type="button"
              onClick={copyAll}
              style={{
                borderRadius: 999,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                background: "transparent",
                border: `1px solid ${WSET.pillBorder}`,
                color: "#7A5F35",
              }}
            >
              {copyFrom!.label}
            </button>
          ) : null}
        </div>
      </div>

      <div className="max-sm:hidden">
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
        <div key={group.name} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, marginBottom: 5, alignItems: "start" }}>
          <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, color: WSET.gold, paddingTop: 3, whiteSpace: "nowrap" }}>
            {group.name === "Deliberately oxidised" ? "Oxidative" : group.name}
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

      {copyFrom && copyRemaining > 0 ? (
        <button
          type="button"
          onClick={copyAll}
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
                textDecoration: "none",
              }}
            >
              clear
            </button>
          </div>
        </div>
      ) : null}
      </div>

      {/* Portalled to <body>: any transformed/filtered ancestor turns
          position:fixed into position:absolute-within-it, which is exactly the
          "sheet scrolls away with the page" bug. */}
      {sheetOpen ? createPortal(
        <div
          className="sm:hidden"
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, zIndex: 70 }}
        >
          <div
            onClick={() => setSheetOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(30,10,17,0.45)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: "88dvh",
              display: "flex",
              flexDirection: "column",
              background: WSET.cream,
              borderRadius: "20px 20px 0 0",
              boxShadow: "0 -12px 40px rgba(70,25,40,0.3)",
            }}
          >
            <div style={{ padding: "12px 16px 0", borderBottom: `1px solid ${WSET.hairline}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  className="font-heading"
                  style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, color: WSET.ink }}
                >
                  {sheetTitle}
                </span>
                <span style={{ fontSize: 11.5, color: WSET.muted2, whiteSpace: "nowrap" }}>
                  {selectedIds.length} selected
                </span>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  style={{
                    borderRadius: 999,
                    padding: "7px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "none",
                    background: WSET.burgundy,
                    color: WSET.creamText,
                  }}
                >
                  Done
                </button>
              </div>
              {/* Origin tabs: names only here — the active tab's meaning sits
                  once below, instead of six concepts in one cramped row. */}
              <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
                {ORIGINS.map(({ origin, label }) => {
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
                        fontSize: 13.5,
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
            </div>
            <div style={{ padding: "8px 16px 0", fontSize: 11, color: WSET.muted2 }}>
              {(() => {
                const c = ORIGINS.find((o) => o.origin === activeOrigin)!.caption;
                return c.charAt(0).toUpperCase() + c.slice(1);
              })()}
            </div>
            {copyFrom && copyRemaining > 0 ? (
              <div style={{ padding: "8px 16px 0" }}>
                <button
                  type="button"
                  onClick={copyAll}
                  style={{
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
              </div>
            ) : null}
            <div
              style={{
                overflowY: "auto",
                overscrollBehavior: "contain",
                padding: "4px 16px 28px",
              }}
            >
              {/* Every cluster open, name above its chips — scanning beats
                  tapping categories open one by one. */}
              {groups.map((group) => (
                <div key={group.name} style={{ paddingTop: 10, borderBottom: `1px solid ${WSET.hairline}` }}>
                  <div
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      fontWeight: 600,
                      color: WSET.gold,
                      marginBottom: 8,
                    }}
                  >
                    {group.name === "Deliberately oxidised" ? "Oxidative" : group.name}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingBottom: 12 }}>
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
                            padding: "6px 13px",
                            fontSize: 12.5,
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
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
