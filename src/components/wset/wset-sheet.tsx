"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { WsetNoteState, WineColour, WineStyle, AromaTerm } from "@/lib/wset/types";
import {
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
import {
  labelsFor,
  makeT,
  translateTerm,
  translateBand,
  noteConnectors,
} from "@/lib/wset/i18n";
import { useWsetLang } from "@/lib/wset/wset-lang";
import { composeLiveNote } from "@/lib/wset/live-note.mjs";
import { qualityBand } from "@/lib/wset/quality-curve.mjs";
import { SnapSlider } from "./snap-slider";
import { PillGroup } from "./pill-group";
import { WineColourControl } from "./wine-colour-control";
import { AromaPicker } from "./aroma-picker";
import { QualitySlider } from "./quality-slider";
import { type SectionNavItem } from "./section-nav";
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

// The live-note section keys, paired with the UI-dict key that names each one.
const NOTE_CAPTIONS: { key: keyof ReturnType<typeof composeLiveNote>; uiKey: string }[] = [
  { key: "appearance", uiKey: "appearance" },
  { key: "nose", uiKey: "nose" },
  { key: "palate", uiKey: "palate" },
  { key: "conclusions", uiKey: "conclusions" },
  { key: "taster", uiKey: "taster" },
];

// The selected value's display label (in the active language), or nothing. An
// empty control already says "not set" — spelling it out on every unrated row
// was pure noise.
function valueLabel(value: string | null, labels: Record<string, string>): string | undefined {
  return value ? labels[value] ?? value : undefined;
}

export function Row({
  label: rowLabel,
  sub,
  value,
  children,
  wide,
}: {
  label: string;
  sub?: string;
  /** The chosen value, shown emphasised beside the title: "Acidity · high". */
  value?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const heading = (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: WSET.ink }}>{rowLabel}</span>
        {value !== undefined ? (
          <>
            <span aria-hidden style={{ fontSize: 12, color: WSET.muted2 }}>
              ·
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: WSET.burgundy }}>{value}</span>
          </>
        ) : null}
      </div>
      {sub !== undefined ? (
        <div style={{ fontSize: 11.5, color: WSET.muted2, marginTop: 2 }}>{sub}</div>
      ) : null}
    </div>
  );
  if (wide) {
    return (
      <div style={{ padding: "16px 0", borderTop: `1px solid ${WSET.hairline}` }}>
        <div style={{ marginBottom: 12 }}>{heading}</div>
        {children}
      </div>
    );
  }
  return (
    <div className="wset-row">
      {heading}
      <div>{children}</div>
    </div>
  );
}

// Two related attributes side by side on desktop (Sweetness | Acidity),
// stacked on phones — the worksheet density comes from here, not from
// shrinking anything.
export function RowPair({ children }: { children: React.ReactNode }) {
  return <div className="wset-pair">{children}</div>;
}

export function SectionCard({
  id,
  numeral,
  title,
  rated,
  className,
  children,
}: {
  id: string;
  numeral: string;
  title: string;
  rated: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      // scroll-mt clears the taller mobile sticky bar (header + section tabs)
      // when a section is scrolled into view on switch.
      className={cn("scroll-mt-[118px] sm:scroll-mt-0", className)}
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

type SectionId = "appearance" | "nose" | "palate" | "conclusions";

export function WsetSheet({
  wine,
  title,
  terms,
  initial,
  onSave,
  onDiscard,
  onDelete,
  embedded = false,
}: {
  wine: { colour: WineColour; style: WineStyle };
  title: string;
  terms: AromaTerm[];
  initial: WsetNoteState;
  onSave: (state: WsetNoteState) => Promise<void>;
  /** Exit without saving; renders a Discard button (confirms when dirty). */
  onDiscard?: () => void;
  /** Delete this saved note permanently (confirms first). Only passed for
      notes that already exist; the caller owns navigation afterwards. */
  onDelete?: () => Promise<void> | void;
  // In a dialog: single column (no scroll-spy rail), header sticks to the
  // popup top instead of below the app header.
  embedded?: boolean;
}) {
  const { lang, setLang } = useWsetLang();
  const L = labelsFor(lang);
  const t = makeT(lang);
  const [state, setState] = useState<WsetNoteState>(initial);
  // What the note looked like when last saved (or opened). Dirtiness compares
  // against THIS, not the mount-time initial — after a successful save the
  // sheet is clean again, and Discard turns into a plain Close.
  const [baseline, setBaseline] = useState<WsetNoteState>(initial);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // One WSET section on screen at a time, at every breakpoint — the tabs in
  // the sticky bar switch between them. (Was phone-only; the owner extended
  // it to tablet/desktop, which retired the scroll-spy rail.)
  const [mobileSection, setMobileSection] = useState<SectionId>("appearance");
  const [menuOpen, setMenuOpen] = useState(false);
  // In the modal the sections scroll INSIDE this container while the header
  // bar stays put — switching section resets it to the top instead of
  // yanking the whole dialog around.
  const scrollRef = useRef<HTMLDivElement>(null);
  const dirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(baseline),
    [state, baseline],
  );

  const set = useCallback(
    <K extends keyof WsetNoteState>(key: K, value: WsetNoteState[K]) =>
      setState((s) => ({ ...s, [key]: value })),
    [],
  );

  // The live note reads in the active language: term labels are translated, and
  // the prose stitching gets Danish scale words + the Danish quality band.
  const termLabels = useMemo(
    () => new Map(terms.map((tm) => [tm.id, translateTerm(tm.term, lang)])),
    [terms, lang],
  );
  const prog = useMemo(() => sectionProgress(state, wine.style), [state, wine.style]);

  const noteSections = useMemo(() => {
    const composed = composeLiveNote(state, termLabels, L, {
      ...noteConnectors(lang),
      band: (s: number) => translateBand(qualityBand(s), lang),
    });
    return NOTE_CAPTIONS.flatMap(({ key, uiKey }) =>
      composed[key] ? [{ caption: t(uiKey), prose: composed[key] as string }] : [],
    );
  }, [state, termLabels, L, lang, t]);

  const navItems: SectionNavItem[] = [
    { id: "appearance", numeral: "I", name: t("appearance"), done: prog.appearance[0], total: prog.appearance[1] },
    { id: "nose", numeral: "II", name: t("nose"), done: prog.nose[0], total: prog.nose[1] },
    { id: "palate", numeral: "III", name: t("palate"), done: prog.palate[0], total: prog.palate[1] },
    { id: "conclusions", numeral: "IV", name: t("conclusions"), done: prog.conclusions[0], total: prog.conclusions[1] },
  ];
  const done = navItems.reduce((n, s) => n + s.done, 0);
  const total = navItems.reduce((n, s) => n + s.total, 0);

  const handleSave = useCallback(async () => {
    setSaveState("saving");
    try {
      await onSave(state);
      setBaseline(state);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2200);
    } catch {
      setSaveState("error");
    }
  }, [onSave, state]);

  const saveLabel =
    saveState === "saving" ? t("saving")
    : saveState === "saved" ? t("saved")
    : saveState === "error" ? t("retry_save")
    : t("save_note");
  const saveLabelShort =
    saveState === "saving" ? t("saving")
    : saveState === "saved" ? t("saved")
    : saveState === "error" ? t("retry")
    : t("save");

  const discard = useCallback(() => {
    if (dirty) setConfirmDiscard(true);
    else onDiscard?.();
  }, [dirty, onDiscard]);

  return (
    <div
      className={cn(
        "wset-sheet min-w-0",
        embedded && "flex min-h-0 flex-1 flex-col",
      )}
      style={{ color: WSET.body }}
    >
      <div
        className={cn(
          "sticky z-30 mb-4 py-2.5 sm:py-3",
          // Full-bleed on phones so the bar spans the whole screen like a real
          // app header. A modal is a full-screen box with a known p-4, so a
          // plain -mx-4 reaches the edges without any viewport math (the 50vw
          // calc misbehaves inside the fixed, scrolling modal); the note page,
          // whose nesting/padding is unknown, uses the viewport calc.
          // In the modal the bar must own the very top: the dialog's p-4 left
          // a gap the content scrolled past, so the "sticky" header looked
          // detached. Negative margins cancel that padding on every side and
          // the top corners take over the dialog's own radius.
          embedded
            ? "-mx-4 -mt-4 px-4 sm:rounded-t-xl sm:px-6"
            : "max-sm:mx-[calc(50%-50vw)] max-sm:px-4 sm:px-1",
        )}
        style={{
          top: embedded ? 0 : 56,
          // Solid card-cream in the modal so nothing ghosts through; the page
          // keeps the translucent blur since content scrolls under it there.
          background: embedded ? WSET.cream : "rgba(247,239,224,0.94)",
          backdropFilter: embedded ? undefined : "blur(8px)",
          borderBottom: `1px solid ${WSET.border}`,
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className="font-heading min-w-0 flex-1 truncate text-[15px] font-bold sm:text-base"
            style={{ color: WSET.ink }}
          >
            {title}
          </span>
          <span
            className="text-[11.5px] sm:text-[12.5px]"
            style={{ color: WSET.muted, whiteSpace: "nowrap" }}
          >
            {t("assessed_of", { done, total })}
          </span>
          {/* EN/DA toggle — mirrors the map's; the sheet language is shared and
              persisted, so it also drives the read-only archetype view. */}
          <div className="flex items-center rounded-md border p-0.5 text-[11px]" style={{ borderColor: WSET.border }}>
            {(["en", "da"] as const).map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => setLang(lng)}
                aria-pressed={lang === lng}
                className="rounded px-1.5 py-0.5 font-medium"
                style={{
                  background: lang === lng ? WSET.burgundy : "transparent",
                  color: lang === lng ? WSET.creamText : WSET.muted,
                }}
              >
                {lng.toUpperCase()}
              </button>
            ))}
          </div>
          {onDiscard ? (
            // With unsaved changes this is Discard (confirms); once the note
            // is clean — freshly opened or just saved — it is a plain Close.
            // Desktop always shows it; phones show Close in the bar but tuck
            // the rarer Discard into the ⋯ menu.
            <button
              type="button"
              className={dirty ? "max-sm:hidden" : undefined}
              onClick={discard}
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
              {dirty ? t("discard") : t("close")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={saveState === "saving"}
            className="px-3.5 py-1.5 sm:px-4 sm:py-2"
            style={{
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              background: saveState === "saved" ? WSET.gold : WSET.burgundy,
              color: WSET.creamText,
              whiteSpace: "nowrap",
            }}
          >
            <span className="sm:hidden">{saveLabelShort}</span>
            <span className="max-sm:hidden">{saveLabel}</span>
          </button>
          {onDelete || (onDiscard && dirty) ? (
            // The ⋯ menu: on phones it holds Discard (while dirty) and Delete;
            // desktop only needs it for Delete — Discard sits in the bar there.
            <div className={cn("relative", !onDelete && "sm:hidden")}>
              <button
                type="button"
                aria-label={t("more_actions")}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  border: `1px solid ${WSET.border}`,
                  background: "transparent",
                  color: WSET.muted,
                  fontSize: 16,
                  lineHeight: 1,
                  cursor: "pointer",
                }}
              >
                ⋯
              </button>
              {menuOpen ? (
                <>
                  <div
                    aria-hidden
                    onClick={() => setMenuOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 40 }}
                  />
                  <div
                    role="menu"
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 6px)",
                      zIndex: 41,
                      minWidth: 150,
                      padding: 5,
                      background: WSET.cream,
                      border: `1px solid ${WSET.border}`,
                      borderRadius: 12,
                      boxShadow: "0 8px 28px rgba(70,25,40,0.18)",
                    }}
                  >
                    {onDiscard && dirty ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="sm:hidden"
                        onClick={() => {
                          setMenuOpen(false);
                          discard();
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "9px 12px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          border: "none",
                          background: "none",
                          color: WSET.ink,
                          cursor: "pointer",
                        }}
                      >
                        {t("discard_changes")}
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          setDeleteError(null);
                          setConfirmDelete(true);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "9px 12px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          border: "none",
                          background: "none",
                          color: WSET.faultRed,
                          cursor: "pointer",
                        }}
                      >
                        {t("delete_note")}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        {/* Section chips: on phones they switch the visible section; in the
            desktop modal (which has no scroll-spy rail) they double as the
            sheet's table of contents and scroll to the section. */}
        <div className="mt-2 gap-1 max-sm:grid max-sm:grid-cols-4 sm:flex sm:gap-2">
          {navItems.map((s) => {
            const active = s.id === mobileSection;
            const complete = s.total > 0 && s.done >= s.total;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setMobileSection(s.id as SectionId);
                  // After the hidden card mounts: in the modal just reset the
                  // inner scroll; on the page line the card up under the bar.
                  requestAnimationFrame(() => {
                    if (scrollRef.current && embedded) {
                      scrollRef.current.scrollTo({ top: 0 });
                    } else {
                      document.getElementById(s.id)?.scrollIntoView();
                    }
                  });
                }}
                className="rounded-[10px] px-0.5 py-[5px] sm:inline-flex sm:items-baseline sm:gap-1.5 sm:px-3 sm:py-1.5"
                style={{
                  border: "none",
                  cursor: "pointer",
                  background: active ? WSET.burgundy : "#F3EAD6",
                }}
              >
                <span
                  className="block sm:inline"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: active ? WSET.creamText : WSET.ink,
                  }}
                >
                  {s.id === "conclusions" ? t("conclusion_short") : s.name}
                </span>
                <span
                  className="block sm:inline"
                  style={{
                    fontSize: 9.5,
                    fontWeight: 600,
                    color: active ? WSET.creamText : complete ? WSET.gold : WSET.faint,
                  }}
                >
                  {complete ? "✓" : `${s.done}/${s.total}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          // grid-cols-1 (=minmax(0,1fr)) so the single column can't be
          // inflated past the container by a card's intrinsic content width —
          // the section boxes stay within the modal's padding on phones.
          "grid grid-cols-1 items-start gap-6",
          !embedded && "lg:grid-cols-[264px_minmax(0,1fr)]",
          // The modal scrolls HERE, under the anchored header bar.
          embedded && "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4",
        )}
      >
        {embedded ? null : (
        <aside className="sticky top-[114px] hidden flex-col gap-4 lg:flex">
          <LiveTastingNote sections={noteSections} heading={t("tasting_note_live")} emptyText={t("note_empty")} />
          <p style={{ fontSize: 10.5, color: WSET.faint }}>
            {t("footer_wset")}
          </p>
        </aside>
        )}

        <div className="min-w-0" style={{ display: "flex", flexDirection: "column", gap: "var(--wset-gap,18px)" }}>
          <SectionCard id="appearance" numeral="I" title={t("appearance")} rated={t("assessed_of", { done: prog.appearance[0], total: prog.appearance[1] })} className={cn(mobileSection !== "appearance" && "hidden", embedded ? "sm:scroll-mt-[104px]" : "sm:scroll-mt-[150px]")}>
            <RowPair>
              <Row label={t("clarity")} value={valueLabel(state.clarity, L)}>
                <PillGroup options={CLARITY} labels={L} value={state.clarity} onChange={(v) => set("clarity", v)} />
              </Row>
              <Row label={t("intensity")} value={valueLabel(state.appearanceIntensity, L)}>
                <SnapSlider stops={APPEARANCE_INTENSITY_STOPS} labels={L} value={state.appearanceIntensity} onChange={(v) => set("appearanceIntensity", v)} />
              </Row>
            </RowPair>
            <Row label={t("colour")} value={valueLabel(state.colourHue, L)}>
              <WineColourControl colour={wine.colour} hue={state.colourHue} onChange={(v) => set("colourHue", v)} labels={L} lang={lang} />
            </Row>
            <Row label={t("other_observations")} sub={t("optional")}>
              <PillGroup multi options={OBSERVATIONS} labels={L} value={state.observations} onChange={(v) => set("observations", v)} />
            </Row>
          </SectionCard>

          <SectionCard id="nose" numeral="II" title={t("nose")} rated={t("assessed_of", { done: prog.nose[0], total: prog.nose[1] })} className={cn(mobileSection !== "nose" && "hidden", embedded ? "sm:scroll-mt-[104px]" : "sm:scroll-mt-[150px]")}>
            <RowPair>
              <Row label={t("condition")} value={valueLabel(state.condition, L)}>
                <PillGroup options={CONDITION} labels={L} value={state.condition} onChange={(v) => set("condition", v)} />
              </Row>
              <Row label={t("intensity")} value={valueLabel(state.noseIntensity, L)}>
                <SnapSlider stops={INTENSITY_STOPS} labels={L} value={state.noseIntensity} onChange={(v) => set("noseIntensity", v)} />
              </Row>
            </RowPair>
            {state.condition === "UNCLEAN" ? (
              <Row label={t("fault")} sub={t("whats_wrong")}>
                <PillGroup multi options={FAULTS} labels={L} value={state.faults} onChange={(v) => set("faults", v)} />
              </Row>
            ) : null}
            <Row label={t("development")} value={valueLabel(state.development, L)}>
              <SnapSlider stops={DEVELOPMENT_STOPS} labels={L} value={state.development} onChange={(v) => set("development", v)} />
            </Row>
            <Row wide label={t("aroma_characteristics")} sub={t("select_all")}>
              <AromaPicker terms={terms} selectedIds={state.noseTermIds} onChange={(ids) => set("noseTermIds", ids)} colour={wine.colour} sheetTitle={t("aroma_characteristics")} lang={lang} />
            </Row>
          </SectionCard>
          <SectionCard id="palate" numeral="III" title={t("palate")} rated={t("assessed_of", { done: prog.palate[0], total: prog.palate[1] })} className={cn(mobileSection !== "palate" && "hidden", embedded ? "sm:scroll-mt-[104px]" : "sm:scroll-mt-[150px]")}>
            <RowPair>
              <Row label={t("sweetness")} value={valueLabel(state.sweetness, L)}>
                <SnapSlider stops={SWEETNESS_STOPS} labels={L} value={state.sweetness} onChange={(v) => set("sweetness", v)} />
              </Row>
              <Row label={t("acidity")} value={valueLabel(state.acidity, L)}>
                <SnapSlider stops={LEVEL_STOPS} labels={L} value={state.acidity} onChange={(v) => set("acidity", v)} />
              </Row>
            </RowPair>
            <RowPair>
              <Row label={t("tannin")} value={valueLabel(state.tannin, L)}>
                <SnapSlider stops={LEVEL_STOPS} labels={L} value={state.tannin} onChange={(v) => set("tannin", v)} />
              </Row>
              <Row label={t("tannin_nature")} sub={t("optional")}>
                <PillGroup multi options={TANNIN_NATURE} labels={L} value={state.tanninNature} onChange={(v) => set("tanninNature", v)} />
              </Row>
            </RowPair>
            <RowPair>
              <Row label={t("alcohol")} value={valueLabel(state.alcohol, L)}>
                <SnapSlider
                  stops={wine.style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS}
                  labels={L}
                  value={state.alcohol}
                  onChange={(v) => set("alcohol", v)}
                />
              </Row>
              <Row label={t("body")} value={valueLabel(state.body, L)}>
                <SnapSlider stops={BODY_STOPS} labels={L} value={state.body} onChange={(v) => set("body", v)} />
              </Row>
            </RowPair>
            {wine.style === "SPARKLING" ? (
              <RowPair>
                <Row label={t("mousse")} value={valueLabel(state.mousse, L)} sub={state.mousse ? undefined : t("required_sparkling")}>
                  <PillGroup options={MOUSSE} labels={L} value={state.mousse} onChange={(v) => set("mousse", v)} />
                </Row>
                <Row label={t("flavour_intensity")} value={valueLabel(state.flavourIntensity, L)}>
                  <SnapSlider stops={INTENSITY_STOPS} labels={L} value={state.flavourIntensity} onChange={(v) => set("flavourIntensity", v)} />
                </Row>
              </RowPair>
            ) : (
              <Row label={t("flavour_intensity")} value={valueLabel(state.flavourIntensity, L)}>
                <SnapSlider stops={INTENSITY_STOPS} labels={L} value={state.flavourIntensity} onChange={(v) => set("flavourIntensity", v)} />
              </Row>
            )}
            <Row wide label={t("flavour_characteristics")} sub={t("taste_not_smell")}>
              <AromaPicker
                terms={terms}
                selectedIds={state.palateTermIds}
                onChange={(ids) => set("palateTermIds", ids)}
                copyFrom={{ label: t("copy_from_nose"), ids: state.noseTermIds }}
                colour={wine.colour}
                sheetTitle={t("flavour_characteristics")}
                lang={lang}
              />
            </Row>
            <Row label={t("finish")} value={valueLabel(state.finish, L)}>
              <SnapSlider stops={FINISH_STOPS} labels={L} value={state.finish} onChange={(v) => set("finish", v)} />
            </Row>
          </SectionCard>

          <SectionCard id="conclusions" numeral="IV" title={t("conclusions")} rated={t("assessed_of", { done: prog.conclusions[0], total: prog.conclusions[1] })} className={cn(mobileSection !== "conclusions" && "hidden", embedded ? "sm:scroll-mt-[104px]" : "sm:scroll-mt-[150px]")}>
            <Row label={t("point_score")} sub={t("hundred_scale")}>
              <QualitySlider score={state.qualityScore} onChange={(v) => set("qualityScore", v)} lang={lang} />
            </Row>
            <RowPair>
              <Row label={t("price_category")} value={valueLabel(state.priceCategory, L)}>
                <PillGroup options={PRICE} labels={L} value={state.priceCategory} onChange={(v) => set("priceCategory", v)} />
              </Row>
              <Row label={t("readiness")} value={valueLabel(state.readiness, L)}>
                <PillGroup options={READINESS} labels={L} value={state.readiness} onChange={(v) => set("readiness", v)} />
              </Row>
            </RowPair>
            <Row label={t("tasters_notes")} sub={t("free_text")}>
              <textarea
                value={state.tasterNotes}
                onChange={(e) => set("tasterNotes", e.target.value)}
                placeholder={t("notes_placeholder")}
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
              {t("discard_q")}
            </h3>
            <p style={{ fontSize: 13, color: WSET.muted, lineHeight: 1.5, marginBottom: 18 }}>
              {t("discard_body")}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                style={{ borderRadius: 999, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${WSET.border}`, background: "transparent", color: WSET.ink }}
              >
                {t("keep_editing")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDiscard(false);
                  onDiscard?.();
                }}
                style={{ borderRadius: 999, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: WSET.burgundy, color: WSET.creamText }}
              >
                {t("discard")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmDelete ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => (deleting ? null : setConfirmDelete(false))}
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
              {t("delete_q")}
            </h3>
            <p style={{ fontSize: 13, color: WSET.muted, lineHeight: 1.5, marginBottom: deleteError ? 8 : 18 }}>
              {t("delete_body")}
            </p>
            {deleteError ? (
              <p style={{ fontSize: 12.5, color: WSET.faultRed, marginBottom: 14 }}>{deleteError}</p>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
                style={{ borderRadius: 999, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${WSET.border}`, background: "transparent", color: WSET.ink }}
              >
                {t("keep_note")}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  setDeleteError(null);
                  try {
                    await onDelete?.();
                    // The caller navigates away / closes on success.
                  } catch (error) {
                    setDeleting(false);
                    setDeleteError(
                      error instanceof Error && error.message
                        ? error.message
                        : t("delete_error"),
                    );
                  }
                }}
                style={{ borderRadius: 999, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: deleting ? "default" : "pointer", border: "none", background: WSET.faultRed, color: WSET.creamText, opacity: deleting ? 0.7 : 1 }}
              >
                {deleting ? t("deleting") : t("delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
