"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { AromaTerm, AromaOrigin, WineColour } from "@/lib/wset/types";
import { aromaVisibleFor } from "@/lib/wset/vocab";
import { AromaIcon } from "./aroma-icon";
import { PHONE_HIT_44 } from "./pill-group";
import {
  makeT,
  translateTerm,
  translateGroup,
  type WsetLang,
} from "@/lib/wset/i18n";

const ORIGINS: { origin: AromaOrigin; labelKey: string; capKey: string }[] = [
  { origin: "PRIMARY", labelKey: "origin_primary", capKey: "cap_primary" },
  { origin: "SECONDARY", labelKey: "origin_secondary", capKey: "cap_secondary" },
  { origin: "TERTIARY", labelKey: "origin_tertiary", capKey: "cap_tertiary" },
];

// The six themed tertiary sub-clusters map to their UI-dict keys so the heading
// localises. Anything not here is a real DB group name (translated separately).
const SUBGROUP_KEY: Record<string, string> = {
  "Dried & cooked fruit": "sub_dried_cooked_fruit",
  "Earth & forest": "sub_earth_forest",
  "Savoury & smoke": "sub_savoury_smoke",
  "Dried fruit": "sub_dried_fruit",
  "Nut, spice & toast": "sub_nut_spice_toast",
  "Petrol, honey & earth": "sub_petrol_honey_earth",
};

// Tertiary ageing is one big WSET bucket per wine colour — "Red wine" holds 23
// terms and "White wine" 19, which reads as an undifferentiated wall of pills.
// WSET's own lexicon doesn't subdivide them, but for scanning we do: each term
// maps to a themed sub-cluster (dried/cooked fruit vs earth & forest vs savoury
// & smoke). Presentation only — the DB group_name, the saved note and the
// colour filtering are untouched.
const TERTIARY_SUBGROUP: Record<string, string> = {
  // Red wine — dried & cooked fruit
  prune: "Dried & cooked fruit",
  raisin: "Dried & cooked fruit",
  fig: "Dried & cooked fruit",
  "cooked plum": "Dried & cooked fruit",
  "cooked cherry": "Dried & cooked fruit",
  "cooked red plum": "Dried & cooked fruit",
  "dried blackberry": "Dried & cooked fruit",
  "dried cranberry": "Dried & cooked fruit",
  "cooked blackberry": "Dried & cooked fruit",
  kirsch: "Dried & cooked fruit",
  // Red wine — earth & forest
  leather: "Earth & forest",
  earth: "Earth & forest",
  mushroom: "Earth & forest",
  "wet leaves": "Earth & forest",
  "forest floor": "Earth & forest",
  farmyard: "Earth & forest",
  vegetal: "Earth & forest",
  // Red wine — savoury & smoke
  meat: "Savoury & smoke",
  game: "Savoury & smoke",
  tobacco: "Savoury & smoke",
  savoury: "Savoury & smoke",
  tar: "Savoury & smoke",
  caramel: "Savoury & smoke",
};
const WHITE_TERTIARY_SUBGROUP: Record<string, string> = {
  // White wine — dried fruit
  "dried apricot": "Dried fruit",
  sultana: "Dried fruit",
  raisin: "Dried fruit",
  "orange marmalade": "Dried fruit",
  "dried apple": "Dried fruit",
  "dried banana": "Dried fruit",
  // White wine — nut, spice & toast
  cinnamon: "Nut, spice & toast",
  ginger: "Nut, spice & toast",
  nutmeg: "Nut, spice & toast",
  almond: "Nut, spice & toast",
  hazelnut: "Nut, spice & toast",
  nutty: "Nut, spice & toast",
  toast: "Nut, spice & toast",
  // White wine — petrol, honey & earth
  petrol: "Petrol, honey & earth",
  kerosene: "Petrol, honey & earth",
  honey: "Petrol, honey & earth",
  caramel: "Petrol, honey & earth",
  mushroom: "Petrol, honey & earth",
  hay: "Petrol, honey & earth",
};

/** The cluster heading a term renders under (subdivides the tertiary buckets). */
function splitGroupName(groupName: string, term: string): string {
  const t = term.toLowerCase();
  if (groupName === "Red wine") return TERTIARY_SUBGROUP[t] ?? groupName;
  if (groupName === "White wine") return WHITE_TERTIARY_SUBGROUP[t] ?? groupName;
  return groupName;
}

// Multi-select aroma/flavour picker over the seeded WSET lexicon. Origin tabs
// (Primary / Secondary / Tertiary — how the aroma arises) carry a per-origin
// selected count; the active tab shows its clusters (caption + wrapped pills in
// sort order); a summary strip lists every selection with remove/clear. The
// palate instance passes `copyFrom` to surface a "Copy from nose" button that
// unions the nose selections in.
//
// Phones don't get the whole vocabulary inline — the tasting sheet shows only
// "Selected · N" with a Clear, the selected chips and "+ Add", which opens a
// bottom sheet where every cluster stacks vertically. Phone chip rows are 44px
// (PHONE_HIT_44: a compact chip plus an invisible 44px strip).
export function AromaPicker({
  terms,
  selectedIds,
  onChange,
  copyFrom,
  colour,
  sheetTitle = "Aromas & flavours",
  lang = "en",
}: {
  terms: AromaTerm[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  copyFrom?: { label: string; ids: string[] };
  colour?: WineColour | null;
  /** Heading of the mobile bottom-sheet picker. */
  sheetTitle?: string;
  lang?: WsetLang;
}) {
  const t = makeT(lang);
  // A cluster heading in the active language: the six tertiary sub-clusters use
  // their UI-dict key, "Deliberately oxidised" shows as "Oxidative", everything
  // else is a real DB group name translated by the lexicon.
  const groupHeading = (name: string): string => {
    if (SUBGROUP_KEY[name]) return t(SUBGROUP_KEY[name]);
    if (name === "Deliberately oxidised") return t("oxidative");
    return translateGroup(name, lang);
  };
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
  // Escape closes the sheet, and only the sheet. Captured on window so it runs
  // before the note dialog hears the key — otherwise Escape would ask to
  // discard the whole note from underneath the open sheet.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
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

  // Clusters of the active origin, in sort order, caption preserved. Tertiary's
  // two huge WSET clusters ("Red wine" 23 terms, "White wine" 19) are subdivided
  // for readability — see splitGroupName.
  const groups = useMemo(() => {
    const inOrigin = terms
      .filter((t) => t.origin === activeOrigin && aromaVisibleFor(colour, t.groupName, t.term))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const out: { name: string; items: AromaTerm[] }[] = [];
    for (const t of inOrigin) {
      const name = splitGroupName(t.groupName, t.term);
      const found = out.find((g) => g.name === name);
      if (found) found.items.push(t);
      else out.push({ name, items: [t] });
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
        {selectedIds.length > 0 ? (
          <div className="mb-2 flex items-center gap-2">
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.13em", fontWeight: 600, color: "var(--gold-dark)" }}>
              {t("selected")} · {selectedIds.length}
            </span>
            {/* Clear's 44px strip reaches up into the row heading (nothing to
                tap there), not down into the chips below. */}
            <button
              type="button"
              onClick={() => onChange([])}
              className="relative ml-auto min-w-11 px-1 text-right text-[12px] font-semibold text-primary before:absolute before:inset-x-0 before:-bottom-1 before:h-11"
            >
              {t("clear_short")}
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2.5">
          {selectedIds.map((id) => {
            const term = byId.get(id);
            if (!term) return null;
            return (
              <button
                key={id}
                type="button"
                aria-label={t("remove", { term: translateTerm(term.term, lang) })}
                onClick={() => toggle(id)}
                className={`${PHONE_HIT_44} min-h-[34px]`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  borderRadius: 999,
                  padding: "5px 12px",
                  fontSize: 12.5,
                  cursor: "pointer",
                  background: "var(--primary)",
                  border: "none",
                  color: "var(--primary-foreground)",
                }}
              >
                  <AromaIcon term={term.term} family={term.groupName} size={17} />
                  {`${translateTerm(term.term, lang)} ×`}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={`${PHONE_HIT_44} inline-flex min-h-[34px] items-center`}
            style={{
              borderRadius: 999,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              background: "transparent",
              border: "1.5px dashed var(--border-strong)",
              color: "var(--gold-dark)",
            }}
          >
            {t("add")}
          </button>
          {copyRemaining > 0 ? (
            <button
              type="button"
              onClick={copyAll}
              className={`${PHONE_HIT_44} inline-flex min-h-[34px] items-center`}
              style={{
                borderRadius: 999,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                background: "transparent",
                border: "1px solid var(--border-strong)",
                color: "var(--gold-dark)",
              }}
            >
              {copyFrom!.label}
            </button>
          ) : null}
        </div>
      </div>

      <div className="max-sm:hidden">
      <div style={{ display: "flex", gap: 22, borderBottom: "1px solid var(--border-light)" }}>
        {ORIGINS.map(({ origin, labelKey }) => {
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
                borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
                marginBottom: -1,
                fontWeight: active ? 600 : 500,
                color: active ? "var(--foreground)" : "var(--muted-foreground)",
                textAlign: "left",
              }}
            >
              {t(labelKey)}
              {count > 0 ? (
                <span
                  style={{
                    borderRadius: 999,
                    background: "var(--accent)",
                    color: "var(--foreground)",
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

      {/* The active tab's meaning, said once — not squeezed into every tab. */}
      <div style={{ margin: "6px 0 10px", fontSize: 11, color: "var(--muted-foreground)" }}>
        {(() => {
          const c = t(ORIGINS.find((o) => o.origin === activeOrigin)!.capKey);
          return c.charAt(0).toUpperCase() + c.slice(1);
        })()}
      </div>
      {/* Descriptor grid: clusters flow into two columns, name above chips —
          the old 120px label column spent a third of the width on whitespace. */}
      <div className="sm:columns-2 sm:gap-x-10">
      {groups.map((group) => (
        <div key={group.name} className="break-inside-avoid" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600, color: "var(--gold-dark)", marginBottom: 6 }}>
            {groupHeading(group.name)}
          </div>
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
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    borderRadius: 999,
                    padding: "4px 11px",
                    fontSize: 12.5,
                    lineHeight: 1.35,
                    cursor: "pointer",
                    background: isSel ? "var(--primary)" : "var(--card)",
                    border: "1px solid var(--border-strong)",
                    color: isSel ? "var(--primary-foreground)" : "var(--foreground)",
                    fontWeight: isSel ? 600 : 500,
                  }}
                >
                  <AromaIcon term={term.term} family={term.groupName} size={17} />
                  {translateTerm(term.term, lang)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      </div>

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
            border: "1px solid var(--border-strong)",
            color: "var(--gold-dark)",
          }}
        >
          {copyFrom.label}
        </button>
      ) : null}

      {selectedIds.length > 0 ? (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.13em", fontWeight: 600, color: "var(--gold-dark)" }}>
              {t("selected")} · {selectedIds.length}
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
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    borderRadius: 999,
                    padding: "4px 11px",
                    fontSize: 12.5,
                    cursor: "pointer",
                    background: "var(--primary)",
                    border: "none",
                    color: "var(--primary-foreground)",
                  }}
                >
                  <AromaIcon term={term.term} family={term.groupName} size={17} />
                {`${translateTerm(term.term, lang)} ×`}
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
                color: "var(--muted-foreground)",
                textDecoration: "none",
              }}
            >
              {t("clear")}
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
              background: "color-mix(in srgb, var(--foreground) 45%, transparent)",
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
              background: "var(--card)",
              borderRadius: "20px 20px 0 0",
              boxShadow: "0 -12px 40px rgba(42,33,30,0.3)",
            }}
          >
            <div style={{ padding: "12px 16px 0", borderBottom: "1px solid var(--border-light)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  className="font-heading"
                  style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, color: "var(--foreground)" }}
                >
                  {sheetTitle}
                </span>
                <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                  {t("n_selected", { n: selectedIds.length })}
                </span>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className={PHONE_HIT_44}
                  style={{
                    borderRadius: 999,
                    padding: "7px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "none",
                    background: "var(--primary)",
                    color: "var(--primary-foreground)",
                  }}
                >
                  {t("done")}
                </button>
              </div>
              {/* Origin tabs: names only here — the active tab's meaning sits
                  once below, instead of six concepts in one cramped row. */}
              <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
                {ORIGINS.map(({ origin, labelKey }) => {
                  const active = origin === activeOrigin;
                  const count = countByOrigin[origin] ?? 0;
                  return (
                    <button
                      key={origin}
                      type="button"
                      onClick={() => setActiveOrigin(origin)}
                      className={PHONE_HIT_44}
                      style={{
                        display: "inline-flex",
                        alignItems: "baseline",
                        gap: 6,
                        padding: "0 0 8px",
                        fontSize: 13.5,
                        cursor: "pointer",
                        background: "none",
                        border: "none",
                        borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
                        marginBottom: -1,
                        fontWeight: active ? 600 : 500,
                        color: active ? "var(--foreground)" : "var(--muted-foreground)",
                      }}
                    >
                      {t(labelKey)}
                      {count > 0 ? (
                        <span
                          style={{
                            borderRadius: 999,
                            background: "var(--accent)",
                            color: "var(--foreground)",
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
            <div style={{ padding: "8px 16px 0", fontSize: 11, color: "var(--muted-foreground)" }}>
              {(() => {
                const c = t(ORIGINS.find((o) => o.origin === activeOrigin)!.capKey);
                return c.charAt(0).toUpperCase() + c.slice(1);
              })()}
            </div>
            {copyFrom && copyRemaining > 0 ? (
              <div style={{ padding: "8px 16px 0" }}>
                <button
                  type="button"
                  onClick={copyAll}
                  className={`${PHONE_HIT_44} inline-flex min-h-[34px] items-center`}
                  style={{
                    borderRadius: 999,
                    padding: "5px 12px",
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    background: "transparent",
                    border: "1px solid var(--border-strong)",
                    color: "var(--gold-dark)",
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
                <div key={group.name} style={{ paddingTop: 10, borderBottom: "1px solid var(--border-light)" }}>
                  <div
                    style={{
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      fontWeight: 600,
                      color: "var(--gold-dark)",
                      marginBottom: 8,
                    }}
                  >
                    {groupHeading(group.name)}
                  </div>
                  <div className="flex flex-wrap gap-x-1.5 gap-y-2.5 pb-3">
                    {group.items.map((term) => {
                      const isSel = selected.has(term.id);
                      return (
                        <button
                          key={term.id}
                          type="button"
                          aria-pressed={isSel}
                          onClick={() => toggle(term.id)}
                          className={`${PHONE_HIT_44} min-h-[34px]`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            borderRadius: 999,
                            padding: "6px 13px",
                            fontSize: 12.5,
                            lineHeight: 1.35,
                            cursor: "pointer",
                            background: isSel ? "var(--primary)" : "var(--card)",
                            border: "1px solid var(--border-strong)",
                            color: isSel ? "var(--primary-foreground)" : "var(--foreground)",
                            fontWeight: isSel ? 600 : 500,
                          }}
                        >
                          <AromaIcon term={term.term} family={term.groupName} size={18} />
                          {translateTerm(term.term, lang)}
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
