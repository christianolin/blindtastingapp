"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WsetNoteState, WineColour, WineStyle, AromaTerm } from "@/lib/wset/types";
import {
  LABELS,
  APPEARANCE_INTENSITY_STOPS,
  INTENSITY_STOPS,
  DEVELOPMENT_STOPS,
  SWEETNESS_STOPS,
  LEVEL_STOPS,
  TANNIN_NATURE,
  ALCOHOL_STOPS,
  FORTIFIED_ALCOHOL_STOPS,
  BODY_STOPS,
  FINISH_STOPS,
  sectionProgress,
} from "@/lib/wset/vocab";
import { composeLiveNote } from "@/lib/wset/live-note.mjs";
import { SnapSlider } from "./snap-slider";
import { PillGroup } from "./pill-group";
import { WineColourControl } from "./wine-colour-control";
import { AromaPicker } from "./aroma-picker";
import { QualitySlider } from "./quality-slider";
import { SectionNav, type SectionNavItem } from "./section-nav";
import { LiveTastingNote } from "./live-tasting-note";
import { WSET } from "./tokens";
import { cn } from "@/lib/utils";

const CLARITY = ["CLEAR", "HAZY"] as const;
const CONDITION = ["CLEAN", "UNCLEAN"] as const;
const OBSERVATIONS = ["LEGS_TEARS", "DEPOSIT", "PETILLANCE", "RIM_VARIATION", "TINTS_HIGHLIGHTS"] as const;
const FAULTS = ["OXIDISED", "OUT_OF_CONDITION", "CORK_TAINT", "OTHER"] as const;
const MOUSSE = ["DELICATE", "CREAMY", "AGGRESSIVE"] as const;
const PRICE = ["INEXPENSIVE", "MID_PRICED", "HIGH_PRICED", "PREMIUM", "DONT_KNOW"] as const;
const READINESS = ["NEEDS_TIME", "READY_CAN_IMPROVE", "READY_WONT_IMPROVE", "TOO_OLD"] as const;

const NOTE_CAPTIONS: { key: keyof ReturnType<typeof composeLiveNote>; caption: string }[] = [
  { key: "appearance", caption: "Appearance" },
  { key: "nose", caption: "Nose" },
  { key: "palate", caption: "Palate" },
  { key: "conclusions", caption: "Conclusions" },
  { key: "taster", caption: "Taster" },
];

function label(value: string | null): string {
  return value ? LABELS[value] ?? value : "not set";
}

export function Row({
  label: rowLabel,
  sub,
  children,
  wide,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (wide) {
    return (
      <div style={{ padding: "16px 0", borderTop: `1px solid ${WSET.hairline}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: WSET.ink }}>{rowLabel}</span>
          {sub !== undefined ? (
            <span style={{ fontSize: 11.5, color: WSET.muted2 }}>{sub}</span>
          ) : null}
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className="wset-row">
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: WSET.ink }}>{rowLabel}</div>
        {sub !== undefined ? (
          <div style={{ fontSize: 11.5, color: WSET.muted2, marginTop: 2 }}>{sub}</div>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SectionCard({
  id,
  numeral,
  title,
  rated,
  children,
}: {
  id: string;
  numeral: string;
  title: string;
  rated: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      style={{
        background: WSET.cream,
        border: `1px solid ${WSET.border}`,
        borderRadius: 18,
        padding: "var(--wset-card-pt,22px) var(--wset-card-px,26px) 8px",
        boxShadow: "0 1px 2px rgba(70,25,40,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          className="font-heading"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "var(--wset-numeral,30px)",
            height: "var(--wset-numeral,30px)",
            borderRadius: 8,
            fontSize: 14,
            background: WSET.burgundy,
            color: WSET.creamText,
          }}
        >
          {numeral}
        </span>
        <h2 className="font-heading" style={{ flex: 1, fontSize: "var(--wset-title,22px)", fontWeight: 700, color: WSET.ink }}>
          {title}
        </h2>
        <span style={{ fontSize: 11.5, color: WSET.muted2 }}>{rated}</span>
      </div>
      {children}
    </section>
  );
}

const SECTION_IDS = ["appearance", "nose", "palate", "conclusions"] as const;

export function WsetSheet({
  wine,
  title,
  terms,
  initial,
  onSave,
  onDiscard,
  embedded = false,
}: {
  wine: { colour: WineColour; style: WineStyle };
  title: string;
  terms: AromaTerm[];
  initial: WsetNoteState;
  onSave: (state: WsetNoteState) => Promise<void>;
  /** Exit without saving; renders a Discard button (confirms when dirty). */
  onDiscard?: () => void;
  // In a dialog: single column (no scroll-spy rail), header sticks to the
  // popup top instead of below the app header.
  embedded?: boolean;
}) {
  const [state, setState] = useState<WsetNoteState>(initial);
  const [activeId, setActiveId] = useState<string>("appearance");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(initial),
    [state, initial],
  );

  const set = useCallback(
    <K extends keyof WsetNoteState>(key: K, value: WsetNoteState[K]) =>
      setState((s) => ({ ...s, [key]: value })),
    [],
  );

  const termLabels = useMemo(() => new Map(terms.map((t) => [t.id, t.term])), [terms]);
  const prog = useMemo(() => sectionProgress(state, wine.style), [state, wine.style]);

  const noteSections = useMemo(() => {
    const composed = composeLiveNote(state, termLabels, LABELS);
    return NOTE_CAPTIONS.flatMap(({ key, caption }) =>
      composed[key] ? [{ caption, prose: composed[key] as string }] : [],
    );
  }, [state, termLabels]);

  const navItems: SectionNavItem[] = [
    { id: "appearance", numeral: "I", name: "Appearance", done: prog.appearance[0], total: prog.appearance[1] },
    { id: "nose", numeral: "II", name: "Nose", done: prog.nose[0], total: prog.nose[1] },
    { id: "palate", numeral: "III", name: "Palate", done: prog.palate[0], total: prog.palate[1] },
    { id: "conclusions", numeral: "IV", name: "Conclusions", done: prog.conclusions[0], total: prog.conclusions[1] },
  ];
  const done = navItems.reduce((n, s) => n + s.done, 0);
  const total = navItems.reduce((n, s) => n + s.total, 0);

  const jump = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 114, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    const onScroll = () => {
      let current = SECTION_IDS[0] as string;
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 150) current = id;
      }
      setActiveId(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSave = useCallback(async () => {
    setSaveState("saving");
    try {
      await onSave(state);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2200);
    } catch {
      setSaveState("error");
    }
  }, [onSave, state]);

  const saveLabel =
    saveState === "saving" ? "Saving…"
    : saveState === "saved" ? "Saved ✓"
    : saveState === "error" ? "Retry save"
    : "Save note";

  return (
    <div className="wset-sheet min-w-0" style={{ color: WSET.body }}>
      <div
        className={cn(
          "sticky z-30 mb-4 flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3",
          // Full-bleed on phones so the bar spans the whole screen like a real
          // app header. A modal is a full-screen box with a known p-4, so a
          // plain -mx-4 reaches the edges without any viewport math (the 50vw
          // calc misbehaves inside the fixed, scrolling modal); the note page,
          // whose nesting/padding is unknown, uses the viewport calc.
          embedded
            ? "max-sm:-mx-4 max-sm:px-4 max-sm:pr-4 sm:pl-1 sm:pr-1"
            : "max-sm:mx-[calc(50%-50vw)] max-sm:px-4 sm:px-1",
        )}
        style={{
          top: embedded ? 0 : 56,
          background: "rgba(247,239,224,0.94)",
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${WSET.border}`,
        }}
      >
        <span
          className="font-heading min-w-0 flex-1 truncate text-[15px] font-bold sm:text-base"
          style={{ color: WSET.ink }}
        >
          {title}
        </span>
        <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end sm:gap-2.5">
          <span style={{ fontSize: 12.5, color: WSET.muted, whiteSpace: "nowrap" }}>
            <b style={{ color: WSET.ink }}>{done}</b> of {total} assessed
          </span>
          {onDiscard ? (
            <button
              type="button"
              onClick={() => (dirty ? setConfirmDiscard(true) : onDiscard())}
              style={{
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${WSET.border}`,
                background: "transparent",
                color: WSET.muted,
                whiteSpace: "nowrap",
              }}
            >
              Discard
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={saveState === "saving"}
            style={{
              borderRadius: 999,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              background: saveState === "saved" ? WSET.gold : WSET.burgundy,
              color: WSET.creamText,
              whiteSpace: "nowrap",
            }}
          >
            {saveLabel}
          </button>
        </div>
      </div>

      <div
        className={cn(
          // grid-cols-1 (=minmax(0,1fr)) so the single column can't be
          // inflated past the container by a card's intrinsic content width —
          // the section boxes stay within the modal's padding on phones.
          "grid grid-cols-1 items-start gap-6",
          !embedded && "lg:grid-cols-[264px_minmax(0,1fr)]",
        )}
      >
        {embedded ? null : (
        <aside className="sticky top-[114px] hidden flex-col gap-4 lg:flex">
          <SectionNav sections={navItems} activeId={activeId} onJump={jump} />
          <LiveTastingNote sections={noteSections} />
          <p style={{ fontSize: 10.5, color: WSET.faint }}>
            Follows the WSET Level 4 Systematic Approach to Tasting Wine.
          </p>
        </aside>
        )}

        <div className="min-w-0" style={{ display: "flex", flexDirection: "column", gap: "var(--wset-gap,18px)" }}>
          <SectionCard id="appearance" numeral="I" title="Appearance" rated={`${prog.appearance[0]} of ${prog.appearance[1]} assessed`}>
            <Row label="Clarity" sub={label(state.clarity)}>
              <PillGroup options={CLARITY} labels={LABELS} value={state.clarity} onChange={(v) => set("clarity", v)} />
            </Row>
            <Row label="Intensity" sub={label(state.appearanceIntensity)}>
              <SnapSlider stops={APPEARANCE_INTENSITY_STOPS} labels={LABELS} value={state.appearanceIntensity} onChange={(v) => set("appearanceIntensity", v)} />
            </Row>
            <Row label="Colour" sub={label(state.colourHue)}>
              <WineColourControl colour={wine.colour} hue={state.colourHue} onChange={(v) => set("colourHue", v)} />
            </Row>
            <Row label="Other observations" sub="optional">
              <PillGroup multi options={OBSERVATIONS} labels={LABELS} value={state.observations} onChange={(v) => set("observations", v)} />
            </Row>
          </SectionCard>

          <SectionCard id="nose" numeral="II" title="Nose" rated={`${prog.nose[0]} of ${prog.nose[1]} assessed`}>
            <Row label="Condition" sub={label(state.condition)}>
              <PillGroup options={CONDITION} labels={LABELS} value={state.condition} onChange={(v) => set("condition", v)} />
            </Row>
            {state.condition === "UNCLEAN" ? (
              <Row label="Fault" sub="what's wrong">
                <PillGroup multi options={FAULTS} labels={LABELS} value={state.faults} onChange={(v) => set("faults", v)} />
              </Row>
            ) : null}
            <Row label="Intensity" sub={label(state.noseIntensity)}>
              <SnapSlider stops={INTENSITY_STOPS} labels={LABELS} value={state.noseIntensity} onChange={(v) => set("noseIntensity", v)} />
            </Row>
            <Row label="Development" sub={label(state.development)}>
              <SnapSlider stops={DEVELOPMENT_STOPS} labels={LABELS} value={state.development} onChange={(v) => set("development", v)} />
            </Row>
            <Row wide label="Aroma characteristics" sub="select all that apply">
              <AromaPicker terms={terms} selectedIds={state.noseTermIds} onChange={(ids) => set("noseTermIds", ids)} colour={wine.colour} />
            </Row>
          </SectionCard>
          <SectionCard id="palate" numeral="III" title="Palate" rated={`${prog.palate[0]} of ${prog.palate[1]} assessed`}>
            <Row label="Sweetness" sub={label(state.sweetness)}>
              <SnapSlider stops={SWEETNESS_STOPS} labels={LABELS} value={state.sweetness} onChange={(v) => set("sweetness", v)} />
            </Row>
            <Row label="Acidity" sub={label(state.acidity)}>
              <SnapSlider stops={LEVEL_STOPS} labels={LABELS} value={state.acidity} onChange={(v) => set("acidity", v)} />
            </Row>
            <Row label="Tannin" sub={label(state.tannin)}>
              <SnapSlider stops={LEVEL_STOPS} labels={LABELS} value={state.tannin} onChange={(v) => set("tannin", v)} />
            </Row>
            <Row label="Tannin nature" sub="optional">
              <PillGroup multi options={TANNIN_NATURE} labels={LABELS} value={state.tanninNature} onChange={(v) => set("tanninNature", v)} />
            </Row>
            <Row label="Alcohol" sub={label(state.alcohol)}>
              <SnapSlider
                stops={wine.style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS}
                labels={LABELS}
                value={state.alcohol}
                onChange={(v) => set("alcohol", v)}
              />
            </Row>
            <Row label="Body" sub={label(state.body)}>
              <SnapSlider stops={BODY_STOPS} labels={LABELS} value={state.body} onChange={(v) => set("body", v)} />
            </Row>
            {wine.style === "SPARKLING" ? (
              <Row label="Mousse" sub={state.mousse ? label(state.mousse) : "required — sparkling"}>
                <PillGroup options={MOUSSE} labels={LABELS} value={state.mousse} onChange={(v) => set("mousse", v)} />
              </Row>
            ) : null}
            <Row label="Flavour intensity" sub={label(state.flavourIntensity)}>
              <SnapSlider stops={INTENSITY_STOPS} labels={LABELS} value={state.flavourIntensity} onChange={(v) => set("flavourIntensity", v)} />
            </Row>
            <Row wide label="Flavour characteristics" sub="what you taste, not just smell">
              <AromaPicker
                terms={terms}
                selectedIds={state.palateTermIds}
                onChange={(ids) => set("palateTermIds", ids)}
                copyFrom={{ label: "Copy from nose", ids: state.noseTermIds }}
                colour={wine.colour}
              />
            </Row>
            <Row label="Finish" sub={label(state.finish)}>
              <SnapSlider stops={FINISH_STOPS} labels={LABELS} value={state.finish} onChange={(v) => set("finish", v)} />
            </Row>
          </SectionCard>

          <SectionCard id="conclusions" numeral="IV" title="Conclusions" rated={`${prog.conclusions[0]} of ${prog.conclusions[1]} assessed`}>
            <Row label="Point Score" sub="100-point scale">
              <QualitySlider score={state.qualityScore} onChange={(v) => set("qualityScore", v)} />
            </Row>
            <Row label="Price category" sub={label(state.priceCategory)}>
              <PillGroup options={PRICE} labels={LABELS} value={state.priceCategory} onChange={(v) => set("priceCategory", v)} />
            </Row>
            <Row label="Readiness" sub={label(state.readiness)}>
              <PillGroup options={READINESS} labels={LABELS} value={state.readiness} onChange={(v) => set("readiness", v)} />
            </Row>
            <Row label="Taster's notes" sub="free text">
              <textarea
                value={state.tasterNotes}
                onChange={(e) => set("tasterNotes", e.target.value)}
                placeholder="Anything else — structure, blind guesses, food pairings…"
                style={{
                  width: "100%",
                  minHeight: 96,
                  resize: "vertical",
                  background: WSET.insetBg,
                  border: `1px solid ${WSET.border}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: WSET.body,
                }}
              />
            </Row>
          </SectionCard>
        </div>
      </div>
      {confirmDiscard ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmDiscard(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(30,10,17,0.45)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 360,
              background: WSET.cream,
              border: `1px solid ${WSET.border}`,
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 12px 40px rgba(70,25,40,0.25)",
            }}
          >
            <h3 className="font-heading" style={{ fontSize: 17, fontWeight: 700, color: WSET.ink, marginBottom: 6 }}>
              Discard this tasting note?
            </h3>
            <p style={{ fontSize: 13, color: WSET.muted, lineHeight: 1.5, marginBottom: 18 }}>
              Your changes haven&apos;t been saved and will be lost.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                style={{ borderRadius: 999, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${WSET.border}`, background: "transparent", color: WSET.ink }}
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDiscard(false);
                  onDiscard?.();
                }}
                style={{ borderRadius: 999, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: WSET.burgundy, color: WSET.creamText }}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
