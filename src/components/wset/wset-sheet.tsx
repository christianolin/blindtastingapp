"use client";

import { useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Ellipsis, X } from "lucide-react";
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
import { PillGroup, PHONE_HIT_44 } from "./pill-group";
import { WineColourControl } from "./wine-colour-control";
import { AromaPicker } from "./aroma-picker";
import { QualitySlider } from "./quality-slider";
import { type SectionNavItem } from "./section-nav";
import { LiveTastingNote } from "./live-tasting-note";
import { Eyebrow } from "@/components/overview/eyebrow";
import { Button } from "@/components/ui/button";
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

type SectionId = "appearance" | "nose" | "palate" | "conclusions";
const SECTION_ORDER: readonly SectionId[] = ["appearance", "nose", "palate", "conclusions"];
// On the note page a switched-to section scrolls in under the app header plus
// this sheet's sticky bar (taller on phones: close, a two-line name, 44px tabs);
// the modal resets its own scroll instead.
const SECTION_SCROLL_MT = "scroll-mt-[190px] sm:scroll-mt-[160px]";

// The bordeaux primary button, as on every other 2026-09 surface: radius 9–11,
// the ink under-shadow, the one allowed hover literal.
const PRIMARY_BUTTON =
  "bg-primary text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] hover:bg-[#4A1523]";

// The selected value's display label (in the active language), or nothing. An
// empty control already says "not set" — spelling it out on every unrated row
// was pure noise.
function valueLabel(value: string | null, labels: Record<string, string>): string | undefined {
  return value ? labels[value] ?? value : undefined;
}

/** What a modal needs from the open sheet. */
export type WsetSheetHandle = {
  /** Close the way the header's Close does: an open confirm or menu is
      dismissed first; then a dirty note asks before discarding and a clean one
      exits. Modals route Escape and their backdrop through this. */
  requestClose: () => void;
};

export function Row({
  label: rowLabel,
  sub,
  value,
  children,
  wide,
}: {
  label: string;
  sub?: React.ReactNode;
  /** The chosen value, shown emphasised beside the title: "Acidity · high". */
  value?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const heading = (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{rowLabel}</span>
        {value !== undefined ? (
          <>
            <span aria-hidden style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              ·
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--primary)" }}>{value}</span>
          </>
        ) : null}
      </div>
      {sub !== undefined ? (
        <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 2 }}>{sub}</div>
      ) : null}
    </div>
  );
  if (wide) {
    return (
      <div style={{ padding: "16px 0", borderTop: "1px solid var(--border-light)" }}>
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
      // when a section is scrolled into view on switch; the note sheet passes
      // its own offsets.
      className={cn("scroll-mt-[118px] sm:scroll-mt-0", className)}
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "var(--wset-card-pt,22px) var(--wset-card-px,26px) 8px",
        boxShadow: "0 1px 2px rgba(42,33,30,0.04)",
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
            background: "var(--primary)",
            color: "var(--primary-foreground)",
          }}
        >
          {numeral}
        </span>
        <h2 className="font-heading" style={{ flex: 1, fontSize: "var(--wset-title,22px)", fontWeight: 600, color: "var(--foreground)" }}>
          {title}
        </h2>
        <span style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>{rated}</span>
      </div>
      {children}
    </section>
  );
}

export function WsetSheet({
  wine,
  title,
  terms,
  initial,
  onSave,
  onDiscard,
  onDelete,
  embedded = false,
  ref,
}: {
  /** Null colour/style is the hidden-glass case (blind-tasting B8): the
      family is not known yet. WineColourControl and AromaPicker already
      degrade to "every family" / "every group" on null; sectionProgress
      below falls back to STILL, since it has no null branch of its own. */
  wine: { colour: WineColour | null; style: WineStyle | null };
  title: string;
  terms: AromaTerm[];
  initial: WsetNoteState;
  onSave: (state: WsetNoteState) => Promise<void>;
  /** Exit without saving; renders Close (✕ on phones), which confirms a
      discard while the note has unsaved changes. */
  onDiscard?: () => void;
  /** Delete this saved note permanently (confirms first). Only passed for
      notes that already exist; the caller owns navigation afterwards. */
  onDelete?: () => Promise<void> | void;
  // In a dialog: single column (no live-note aside), header and footer pinned
  // to the popup edges while the sections scroll between them.
  embedded?: boolean;
  ref?: React.Ref<WsetSheetHandle>;
}) {
  const { lang, setLang } = useWsetLang();
  const L = labelsFor(lang);
  const t = makeT(lang);
  const [state, setState] = useState<WsetNoteState>(initial);
  // What the note looked like when last saved (or opened). Dirtiness compares
  // against THIS, not the mount-time initial — after a successful save the
  // sheet is clean again, and Close exits without asking.
  const [baseline, setBaseline] = useState<WsetNoteState>(initial);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // One WSET section on screen at a time, at every breakpoint — the tabs in
  // the sticky bar and the footer's step switch between them. (Was phone-only;
  // the owner extended it to tablet/desktop, which retired the scroll-spy rail.)
  const [mobileSection, setMobileSection] = useState<SectionId>("appearance");
  const [menuOpen, setMenuOpen] = useState(false);
  // In the modal the sections scroll INSIDE this container while the header
  // and footer stay put — switching section resets it to the top instead of
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
  const prog = useMemo(
    () => sectionProgress(state, wine.style ?? "STILL"),
    [state, wine.style],
  );

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
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;

  // A section's short name, as the tabs and the footer step print it.
  const sectionName = (id: SectionId) => (id === "conclusions" ? t("conclusion_short") : t(id));

  const goToSection = useCallback(
    (id: SectionId) => {
      setMobileSection(id);
      // After the hidden card mounts: in the modal just reset the inner
      // scroll; on the page line the card up under the bar.
      requestAnimationFrame(() => {
        if (scrollRef.current && embedded) {
          scrollRef.current.scrollTo({ top: 0 });
        } else {
          document.getElementById(id)?.scrollIntoView();
        }
      });
    },
    [embedded],
  );

  // The footer's one step, as drawn: forward while a section lies ahead, back
  // from the last one. The tabs above still jump anywhere.
  const at = SECTION_ORDER.indexOf(mobileSection);
  const step: { id: SectionId; forward: boolean } | null =
    at < SECTION_ORDER.length - 1
      ? { id: SECTION_ORDER[at + 1], forward: true }
      : at > 0
        ? { id: SECTION_ORDER[at - 1], forward: false }
        : null;

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

  const discard = useCallback(() => {
    if (dirty) setConfirmDiscard(true);
    else onDiscard?.();
  }, [dirty, onDiscard]);

  useImperativeHandle(
    ref,
    () => ({
      requestClose: () => {
        if (confirmDelete) {
          if (!deleting) setConfirmDelete(false);
          return;
        }
        if (confirmDiscard) {
          setConfirmDiscard(false);
          return;
        }
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }
        discard();
      },
    }),
    [confirmDelete, confirmDiscard, deleting, menuOpen, discard],
  );

  // Phones print just "optional"; desktop the sentence the handoff draws.
  const optionalSub = (sentence: string) => (
    <>
      <span className="sm:hidden">{t("optional")}</span>
      <span className="max-sm:hidden">{sentence}</span>
    </>
  );

  return (
    <div
      className={cn(
        "wset-sheet min-w-0",
        embedded && "flex min-h-0 flex-1 flex-col",
      )}
      style={{ color: "var(--foreground)" }}
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
            ? "-mx-4 -mt-4 px-4 sm:rounded-t-[16px] sm:px-6"
            : "max-sm:mx-[calc(50%-50vw)] max-sm:px-4 sm:px-1",
        )}
        style={{
          top: embedded ? 0 : 56,
          // Solid card-cream in the modal so nothing ghosts through; the page
          // keeps the translucent blur since content scrolls under it there.
          background: embedded ? "var(--card)" : "color-mix(in srgb, var(--background) 94%, transparent)",
          backdropFilter: embedded ? undefined : "blur(8px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Desktop: eyebrow + wine name … EN/DA · Close · ⋯.
            Phones: ✕ · wine name over the progress … EN/DA · ⋯. Save lives in
            the footer at every width. */}
        <div className="flex items-center gap-2 sm:gap-3">
          {onDiscard ? (
            <button
              type="button"
              aria-label={t("close")}
              onClick={discard}
              className="-ml-2.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted sm:hidden"
            >
              <X aria-hidden className="size-5" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <Eyebrow size="sm" className="block max-sm:hidden">
              {t("tasting_note")}
            </Eyebrow>
            <p className="font-heading text-[16px] leading-[1.2] font-semibold text-foreground max-sm:line-clamp-2 sm:mt-0.5 sm:truncate sm:text-[17px]">
              {title}
            </p>
            {/* Phones carry the progress in the bar; desktop keeps it in the
                footer, beside Save. */}
            <div className="mt-1 flex items-center gap-2 sm:hidden">
              <span aria-hidden className="h-[5px] max-w-[120px] flex-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full bg-primary" style={{ width: `${donePct}%` }} />
              </span>
              <span className="text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
                {t("assessed_short", { done, total })}
              </span>
            </div>
          </div>
          {/* EN/DA toggle — mirrors the map's; the sheet language is shared and
              persisted, so it also drives the read-only archetype view. */}
          <div className="flex shrink-0 items-center rounded-md border border-border p-0.5 text-[11px]">
            {(["en", "da"] as const).map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => setLang(lng)}
                aria-pressed={lang === lng}
                className={cn(PHONE_HIT_44, "rounded px-1.5 py-0.5 font-medium max-sm:min-w-9 max-sm:py-1")}
                style={{
                  background: lang === lng ? "var(--primary)" : "transparent",
                  color: lang === lng ? "var(--primary-foreground)" : "var(--muted-foreground)",
                }}
              >
                {lng.toUpperCase()}
              </button>
            ))}
          </div>
          {onDiscard ? (
            // Always "Close": a clean note exits, a dirty one asks first (the
            // same path Escape and the modal backdrop take).
            <button
              type="button"
              onClick={discard}
              className="shrink-0 rounded-[8px] border border-border bg-card px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground hover:bg-muted max-sm:hidden"
            >
              {t("close")}
            </button>
          ) : null}
          {onDelete ? (
            // The ⋯ menu holds Delete for a saved note — rare and destructive,
            // so it stays out of the footer's reach.
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label={t("more_actions")}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
                className="-mr-2.5 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted sm:mr-0 sm:size-[30px] sm:border sm:border-border"
              >
                <Ellipsis aria-hidden className="size-4" />
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
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      boxShadow: "0 8px 28px rgba(42,33,30,0.18)",
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setDeleteError(null);
                        setConfirmDelete(true);
                      }}
                      className="block w-full rounded-[8px] px-3 py-[9px] text-left text-[13px] font-semibold text-destructive hover:bg-muted max-sm:min-h-11"
                    >
                      {t("delete_note")}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        {/* Section tabs: one section on screen at a time; each tab carries its
            count. Phones get a 4-column grid of 44px targets. */}
        <div className="mt-2 gap-1 max-sm:grid max-sm:grid-cols-4 sm:flex sm:gap-2">
          {navItems.map((s) => {
            const active = s.id === mobileSection;
            const complete = s.total > 0 && s.done >= s.total;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={active}
                onClick={() => goToSection(s.id as SectionId)}
                className="rounded-[10px] px-0.5 py-[5px] max-sm:min-h-11 sm:inline-flex sm:items-baseline sm:gap-1.5 sm:px-3 sm:py-1.5"
                style={{
                  border: "none",
                  cursor: "pointer",
                  background: active ? "var(--primary)" : "var(--accent)",
                }}
              >
                <span
                  className="block sm:inline"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: active ? "var(--primary-foreground)" : "var(--foreground)",
                  }}
                >
                  {sectionName(s.id as SectionId)}
                </span>
                <span
                  className="block sm:inline"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: active ? "var(--primary-foreground)" : complete ? "var(--gold-dark)" : "var(--muted-foreground)",
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
          // The modal scrolls HERE, between the anchored header and footer.
          embedded && "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4",
        )}
      >
        {embedded ? null : (
        <aside className="sticky top-[114px] hidden flex-col gap-4 lg:flex">
          <LiveTastingNote sections={noteSections} heading={t("tasting_note_live")} emptyText={t("note_empty")} />
          <p style={{ fontSize: 10.5, color: "var(--placeholder)" }}>
            {t("footer_wset")}
          </p>
        </aside>
        )}

        <div className="min-w-0" style={{ display: "flex", flexDirection: "column", gap: "var(--wset-gap,18px)" }}>
          <SectionCard id="appearance" numeral="I" title={t("appearance")} rated={t("assessed_of", { done: prog.appearance[0], total: prog.appearance[1] })} className={cn(SECTION_SCROLL_MT, mobileSection !== "appearance" && "hidden")}>
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
            <Row label={t("other_observations")} sub={optionalSub(t("optional_not_counted", { total }))}>
              <PillGroup multi options={OBSERVATIONS} labels={L} value={state.observations} onChange={(v) => set("observations", v)} />
            </Row>
          </SectionCard>

          <SectionCard id="nose" numeral="II" title={t("nose")} rated={t("assessed_of", { done: prog.nose[0], total: prog.nose[1] })} className={cn(SECTION_SCROLL_MT, mobileSection !== "nose" && "hidden")}>
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
          <SectionCard id="palate" numeral="III" title={t("palate")} rated={t("assessed_of", { done: prog.palate[0], total: prog.palate[1] })} className={cn(SECTION_SCROLL_MT, mobileSection !== "palate" && "hidden")}>
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

          <SectionCard id="conclusions" numeral="IV" title={t("conclusions")} rated={t("assessed_of", { done: prog.conclusions[0], total: prog.conclusions[1] })} className={cn(SECTION_SCROLL_MT, mobileSection !== "conclusions" && "hidden")}>
            <Row label={t("score")}>
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
            <Row label={t("tasters_notes")} sub={optionalSub(t("own_words_sub"))}>
              <textarea
                value={state.tasterNotes}
                onChange={(e) => set("tasterNotes", e.target.value)}
                placeholder={t("notes_placeholder")}
                style={{
                  width: "100%",
                  minHeight: 96,
                  resize: "vertical",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "var(--foreground)",
                }}
              />
            </Row>
          </SectionCard>
        </div>
      </div>

      {/* The footer: progress (desktop) beside the section step and Save. In
          the modal it is the popup's last row, so it stays pinned while the
          sections scroll; on the note page it sticks to the viewport bottom. */}
      <div
        className={cn(
          "flex items-center gap-[9px] sm:gap-3",
          embedded
            ? "-mx-4 -mb-4 border-t border-border bg-card px-4 pt-[11px] pb-[max(11px,env(safe-area-inset-bottom))] sm:rounded-b-[16px] sm:px-6 sm:py-3"
            : "sticky bottom-0 z-30 mt-6 border-t border-border py-[11px] max-sm:mx-[calc(50%-50vw)] max-sm:px-4 max-sm:pb-[max(11px,env(safe-area-inset-bottom))] sm:px-1 sm:py-3",
        )}
        style={
          embedded
            ? undefined
            : { background: "color-mix(in srgb, var(--background) 94%, transparent)", backdropFilter: "blur(8px)" }
        }
      >
        <div className="min-w-0 max-sm:hidden">
          <div className="flex items-baseline gap-[7px]">
            <span className="font-heading text-[22px] leading-none font-semibold text-primary tabular-nums">
              {done}
            </span>
            <span className="text-[11.5px] text-muted-foreground">
              {t("of_total_assessed", { total })}
            </span>
          </div>
          <p className="mt-1 text-[10.5px] leading-[1.45] text-muted-foreground">
            {t("nothing_required")}
          </p>
        </div>
        <div className="flex flex-1 items-center gap-[9px] sm:ml-auto sm:flex-none">
          {step ? (
            <button
              type="button"
              onClick={() => goToSection(step.id)}
              className="min-h-11 rounded-[10px] border border-border bg-background p-[13px] text-[13.5px] font-semibold whitespace-nowrap text-primary hover:bg-muted max-sm:flex-1 sm:min-h-0 sm:rounded-[9px] sm:px-[15px] sm:py-[10px] sm:text-[13px]"
            >
              {step.forward ? (
                <>
                  <span className="sm:hidden">{t("next_section_short", { section: sectionName(step.id) })}</span>
                  <span className="max-sm:hidden">{t("next_section", { section: sectionName(step.id) })}</span>
                </>
              ) : (
                t("prev_section", { section: sectionName(step.id) })
              )}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={saveState === "saving"}
            className={cn(
              "min-h-11 rounded-[10px] p-[13px] text-[14px] font-semibold whitespace-nowrap shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors disabled:opacity-70 max-sm:flex-1 sm:min-h-0 sm:rounded-[9px] sm:px-[19px] sm:py-[11px] sm:text-[13.5px]",
              // Ink on the gold "Saved" fill (6.5:1), like every bg-gold button
              // in the app; parchment is only for text on bordeaux.
              saveState === "saved"
                ? "bg-gold text-foreground hover:bg-gold-deep"
                : PRIMARY_BUTTON,
            )}
          >
            {saveLabel}
          </button>
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
            background: "color-mix(in srgb, var(--foreground) 45%, transparent)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 360,
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 12px 40px rgba(42,33,30,0.25)",
            }}
          >
            <h3 className="font-heading" style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>
              {t("discard_q")}
            </h3>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: 18 }}>
              {t("discard_body")}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="rounded-[9px] border border-border bg-transparent px-4 py-[9px] text-[13px] font-semibold text-foreground hover:bg-muted max-sm:min-h-11"
              >
                {t("keep_editing")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDiscard(false);
                  onDiscard?.();
                }}
                className={cn("rounded-[9px] px-4 py-[9px] text-[13px] font-semibold max-sm:min-h-11", PRIMARY_BUTTON)}
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
            background: "color-mix(in srgb, var(--foreground) 45%, transparent)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 360,
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 12px 40px rgba(42,33,30,0.25)",
            }}
          >
            <h3 className="font-heading" style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>
              {t("delete_q")}
            </h3>
            <p style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5, marginBottom: deleteError ? 8 : 18 }}>
              {t("delete_body")}
            </p>
            {deleteError ? (
              <p style={{ fontSize: 12.5, color: "var(--rose)", marginBottom: 14 }}>{deleteError}</p>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
                className="rounded-[9px] border border-border bg-transparent px-4 py-[9px] text-[13px] font-semibold text-foreground hover:bg-muted max-sm:min-h-11"
              >
                {t("keep_note")}
              </button>
              <Button
                variant="destructive"
                className="h-auto rounded-[9px] px-4 py-[9px] text-[13px] font-semibold max-sm:min-h-11"
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
              >
                {deleting ? t("deleting") : t("delete")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
