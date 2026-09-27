"use client";

import type { AromaTerm, WineColour, WineStyle } from "@/lib/wset/types";
import { qualityBand } from "@/lib/wset/quality-curve.mjs";
import {
  archetypeScale,
  type ArchetypeAnswers,
  type ArchetypeScale,
} from "@/lib/wset/archetype-scale";
import { SnapSlider } from "./snap-slider";
import { QualitySlider } from "./quality-slider";
import { AromaPicker } from "./aroma-picker";
import { Row, SectionCard } from "./wset-sheet";
import { AromaIcon } from "./aroma-icon";
import { useWsetLang } from "@/lib/wset/wset-lang";
import {
  makeT,
  labelsFor,
  translateTerm,
  translateBand,
  type WsetLang,
} from "@/lib/wset/i18n";

type Range = [string, string];

export type { ArchetypeAnswers };

export type ArchetypeView = {
  name: string;
  colour: WineColour;
  style: WineStyle;
  /** The map place's name; null when the archetype has none (training-room D9). */
  placeName: string | null;
  /** "Pauillac · Bordeaux, France · Cabernet Sauvignon, Merlot" (D11), so no
      appellation is a bare word. */
  lineage: string;
  grapes: string;
  description: string | null;
  qualityLow: number | null;
  qualityHigh: number | null;
  sat: Record<string, Range | undefined>;
  aromas: string[];
  flavours: string[];
};

/** The four WSET sections an archetype is drawn in. */
export type ArchetypeSection = "appearance" | "nose" | "palate" | "conclusions";

/** A chosen aroma and whether it is a signature (training-room D5). */
export type SignedTerm = { termId: string; signature: boolean };

/** Makes the sheet the admin typical-wine editor's four WSET sections. The
    Library, the map and the training room pass none. `a` still carries the
    colour, style, ranges and quality being edited. */
export type ArchetypeSheetEdit = {
  /** The section on screen; the other three stay mounted, hidden. null: none
      (the editor's own Wine tab is showing). */
  section: ArchetypeSection | null;
  /** The scales edited and the ladder each is edited on (profile-rules'
      scalesFor). A scale not here is not drawn. */
  ladders: Partial<Record<ArchetypeScale, readonly string[]>>;
  terms: AromaTerm[];
  nose: readonly SignedTerm[];
  palate: readonly SignedTerm[];
  /** null clears the range. */
  onRange: (key: ArchetypeScale, range: Range | null) => void;
  /** null clears the quality range. */
  onQuality: (range: [number, number] | null) => void;
  onAromas: (kind: "nose" | "palate", ids: string[]) => void;
  onSignature: (kind: "nose" | "palate", termId: string) => void;
  /** Admin copy (English): the aroma rows' sub line and the ★ button's name. */
  signatureHint: string;
  signatureLabel: (term: string) => string;
};

const cap = (s: string) => s[0] + s.slice(1).toLowerCase();

// Read-only band on the same slider used in the editable sheet, with the
// taster's answer (if any) drawn on it. Module-level (not declared inside
// ArchetypeSheet's render) so React keeps one component identity across
// renders — the react-hooks/static-components rule.
function RangeSlider({
  stops,
  range,
  value,
  labels,
  variesText,
}: {
  stops: readonly string[];
  range: Range | undefined;
  value: string | null;
  labels: Record<string, string>;
  variesText: string;
}) {
  if (!range)
    return <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{variesText}</p>;
  return (
    <SnapSlider
      stops={stops}
      labels={labels}
      value={value}
      range={range as readonly [string, string]}
      readOnly
    />
  );
}

// Read-only aroma / flavour pills, shared by the Nose and Palate sections.
// The icon keeps the English term (its identity); the text is translated.
function AromaPills({ terms, lang }: { terms: string[]; lang: WsetLang }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {terms.map((term) => (
        <span
          key={term}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            borderRadius: 999,
            padding: "4px 11px",
            fontSize: 12.5,
            background: "var(--primary)",
            color: "var(--primary-foreground)",
          }}
        >
          <AromaIcon term={term} family="" size={17} />
          {translateTerm(term, lang)}
        </span>
      ))}
    </div>
  );
}

// The editor's "clear" at the end of a range row's title. Its 44px touch strip
// is a ::before (no layout change), so setting or clearing a band never moves
// the slider under the finger; a laptop pointer gets the word alone.
function ClearRange({ text, rowLabel, onClear }: { text: string; rowLabel: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={`${text}: ${rowLabel}`}
      className="relative text-[11.5px] font-semibold text-muted-foreground before:absolute before:-inset-x-2.5 before:top-1/2 before:h-11 before:-translate-y-1/2 hover:text-foreground md:pointer-fine:before:hidden"
    >
      {text}
    </button>
  );
}

// The map's "a typical wine from here" — the WSET sheet's look, read-only, with
// each scale drawn as its low→high band. Language follows the shared sheet
// toggle; `L`/`lang` are passed down to the read-only helpers explicitly.
//
// Training room (spec §3.3, §7.2): `answers` draws the taster's answers on the
// ranges ("you: high" beside each band), and `idPrefix` keeps the four section
// ids unique on a page that also renders WsetSheet's own sections.
//
// Admin (`edit`, plan 2026-09-26-archetype-editor-sheet): the same four
// sections and rows, each band an editable slider on the editor's ladder with
// its words as the row's value and a "clear"; the aroma rows are the note
// form's picker with a ★ per chosen term; quality is the note's quality slider
// as a range. No header (the editor's bar has the name), no description row
// (the editor's Wine tab has it), and one section on screen at a time.
export function ArchetypeSheet({
  a,
  answers,
  idPrefix = "",
  edit,
}: {
  a: ArchetypeView;
  answers?: ArchetypeAnswers;
  idPrefix?: string;
  edit?: ArchetypeSheetEdit;
}) {
  const { lang } = useWsetLang();
  const t = makeT(lang);
  const L = labelsFor(lang);
  const varies = t("varies");

  // A low→high band as words, in the active language.
  const rangeLabel = (r: Range | undefined): string => {
    if (!r) return "—";
    return r[0] === r[1]
      ? L[r[0]] ?? r[0]
      : `${L[r[0]] ?? r[0]} → ${L[r[1]] ?? r[1]}`;
  };
  const answerOf = (key: ArchetypeScale): string | null => answers?.[key] ?? null;
  // The row's sub line: the typical band, then the taster's answer if any.
  const sub = (key: ArchetypeScale): string => {
    const base = rangeLabel(archetypeScale(key, a).range);
    const value = answerOf(key);
    return value ? `${base} · ${t("your_answer", { value: L[value] ?? value })}` : base;
  };
  const band = (key: ArchetypeScale) => {
    const s = archetypeScale(key, a);
    return <RangeSlider stops={s.stops} range={s.range} value={answerOf(key)} labels={L} variesText={varies} />;
  };

  // One scale's row. Read-only: the band's words under the title and the band
  // drawn, or "Varies". Editing: the words as the row's value (or "Varies"
  // under the title while unset), a clear, and the slider on the edit ladder.
  const scaleRow = (key: ArchetypeScale, label: string) => {
    if (!edit) {
      return (
        <Row label={label} sub={sub(key)}>
          {band(key)}
        </Row>
      );
    }
    const stops = edit.ladders[key];
    if (!stops) return null;
    const range = a.sat[key];
    return (
      <Row
        label={label}
        value={range ? rangeLabel(range) : undefined}
        sub={range ? undefined : varies}
        action={range ? <ClearRange text={t("clear")} rowLabel={label} onClear={() => edit.onRange(key, null)} /> : undefined}
      >
        <SnapSlider
          stops={stops}
          labels={L}
          value={null}
          range={range ?? null}
          onRangeChange={(r) => edit.onRange(key, r)}
        />
      </Row>
    );
  };

  // The aroma rows while editing: the note form's picker, a ★ per chosen term.
  const aromaRow = (kind: "nose" | "palate") => {
    if (!edit) return null;
    const links = edit[kind];
    const ids = links.map((l) => l.termId);
    const title = kind === "nose" ? t("aroma_characteristics") : t("flavour_characteristics");
    return (
      <Row wide label={title} sub={edit.signatureHint}>
        <AromaPicker
          terms={edit.terms}
          selectedIds={ids}
          onChange={(next) => edit.onAromas(kind, next)}
          copyFrom={kind === "palate" ? { label: t("copy_from_nose"), ids: edit.nose.map((l) => l.termId) } : undefined}
          colour={a.colour}
          sheetTitle={title}
          lang={lang}
          signature={{
            ids: links.filter((l) => l.signature).map((l) => l.termId),
            onToggle: (termId) => edit.onSignature(kind, termId),
            label: edit.signatureLabel,
          }}
        />
      </Row>
    );
  };

  // While editing, one section on screen at a time; read-only, all four.
  const hiddenUnless = (section: ArchetypeSection) =>
    edit && edit.section !== section ? "hidden" : undefined;

  const quality =
    a.qualityLow != null && a.qualityHigh != null ? ([a.qualityLow, a.qualityHigh] as [number, number]) : null;
  const q = quality ? `${quality[0]}–${quality[1]} · ${translateBand(qualityBand(quality[1]), lang)}` : "—";
  // D11: the lineage names where it is from and its grapes; a view without
  // one falls back to the place and the grapes.
  const where = a.lineage || [a.placeName, a.grapes].filter(Boolean).join(" · ");

  const sections = (
    <>
      <SectionCard
        id={`${idPrefix}appearance`}
        numeral="I"
        title={t("appearance")}
        rated={t("typical")}
        className={hiddenUnless("appearance")}
      >
        {scaleRow("appearanceIntensity", t("intensity"))}
        {scaleRow("colourHue", t("colour"))}
      </SectionCard>

      <SectionCard
        id={`${idPrefix}nose`}
        numeral="II"
        title={t("nose")}
        rated={t("typical")}
        className={hiddenUnless("nose")}
      >
        {scaleRow("noseIntensity", t("intensity"))}
        {scaleRow("development", t("development"))}
        {edit ? (
          aromaRow("nose")
        ) : a.aromas.length > 0 ? (
          <Row wide label={t("aroma_characteristics")} sub={t("typical")}>
            <AromaPills terms={a.aromas} lang={lang} />
          </Row>
        ) : null}
      </SectionCard>

      <SectionCard
        id={`${idPrefix}palate`}
        numeral="III"
        title={t("palate")}
        rated={t("typical")}
        className={hiddenUnless("palate")}
      >
        {scaleRow("sweetness", t("sweetness"))}
        {scaleRow("acidity", t("acidity"))}
        {scaleRow("tannin", t("tannin"))}
        {edit ? (
          scaleRow("mousse", t("mousse"))
        ) : a.style === "SPARKLING" && a.sat.mousse ? (
          <Row label={t("mousse")} sub={t("sparkling")}>
            <span style={{ fontSize: 13, color: "var(--foreground)" }}>{sub("mousse")}</span>
          </Row>
        ) : null}
        {scaleRow("alcohol", t("alcohol"))}
        {scaleRow("body", t("body"))}
        {scaleRow("flavourIntensity", t("flavour_intensity"))}
        {edit ? (
          aromaRow("palate")
        ) : a.flavours.length > 0 ? (
          <Row wide label={t("flavour_characteristics")} sub={t("typical")}>
            <AromaPills terms={a.flavours} lang={lang} />
          </Row>
        ) : null}
        {scaleRow("finish", t("finish"))}
      </SectionCard>

      <SectionCard
        id={`${idPrefix}conclusions`}
        numeral="IV"
        title={t("conclusions")}
        rated={t("typical")}
        className={hiddenUnless("conclusions")}
      >
        {edit ? (
          <Row
            label={t("quality")}
            sub={t("typical_range")}
            action={
              quality ? (
                <ClearRange text={t("clear")} rowLabel={t("quality")} onClear={() => edit.onQuality(null)} />
              ) : undefined
            }
          >
            <QualitySlider range={quality} onRangeChange={(r) => edit.onQuality(r)} lang={lang} />
          </Row>
        ) : (
          <Row label={t("quality")} sub={t("typical_range")}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{q}</span>
          </Row>
        )}
        {!edit && a.description ? (
          <Row wide label={t("in_a_nutshell")}>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--foreground)" }}>{a.description}</p>
          </Row>
        ) : null}
      </SectionCard>
    </>
  );

  // The editor lays the four cards straight into its own sheet column.
  if (edit) return sections;

  return (
    <div style={{ color: "var(--foreground)" }}>
      <div style={{ marginBottom: 16 }}>
        <span className="font-heading" style={{ fontSize: 18, fontWeight: 700, color: "var(--foreground)" }}>
          {a.name}
        </span>
        <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", marginTop: 2 }}>
          {where ? `${where} · ` : ""}
          {cap(L[a.colour] ?? a.colour)} · {cap(L[a.style] ?? a.style)} — {t("typical_profile")}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>{sections}</div>
    </div>
  );
}
