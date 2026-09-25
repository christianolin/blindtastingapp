"use client";

import type { WineColour, WineStyle } from "@/lib/wset/types";
import { qualityBand } from "@/lib/wset/quality-curve.mjs";
import {
  archetypeScale,
  type ArchetypeAnswers,
  type ArchetypeScale,
} from "@/lib/wset/archetype-scale";
import { SnapSlider } from "./snap-slider";
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

// The map's "a typical wine from here" — the WSET sheet's look, read-only, with
// each scale drawn as its low→high band. Language follows the shared sheet
// toggle; `L`/`lang` are passed down to the read-only helpers explicitly.
//
// Training room (spec §3.3, §7.2): `answers` draws the taster's answers on the
// ranges ("you: high" beside each band), and `idPrefix` keeps the four section
// ids unique on a page that also renders WsetSheet's own sections.
export function ArchetypeSheet({
  a,
  answers,
  idPrefix = "",
}: {
  a: ArchetypeView;
  answers?: ArchetypeAnswers;
  idPrefix?: string;
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

  const q =
    a.qualityLow != null && a.qualityHigh != null
      ? `${a.qualityLow}–${a.qualityHigh} · ${translateBand(qualityBand(a.qualityHigh), lang)}`
      : "—";
  // D11: the lineage names where it is from and its grapes; a view without
  // one falls back to the place and the grapes.
  const where = a.lineage || [a.placeName, a.grapes].filter(Boolean).join(" · ");

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

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <SectionCard id={`${idPrefix}appearance`} numeral="I" title={t("appearance")} rated={t("typical")}>
          <Row label={t("intensity")} sub={sub("appearanceIntensity")}>
            {band("appearanceIntensity")}
          </Row>
          <Row label={t("colour")} sub={sub("colourHue")}>
            {band("colourHue")}
          </Row>
        </SectionCard>

        <SectionCard id={`${idPrefix}nose`} numeral="II" title={t("nose")} rated={t("typical")}>
          <Row label={t("intensity")} sub={sub("noseIntensity")}>
            {band("noseIntensity")}
          </Row>
          <Row label={t("development")} sub={sub("development")}>
            {band("development")}
          </Row>
          {a.aromas.length > 0 ? (
            <Row wide label={t("aroma_characteristics")} sub={t("typical")}>
              <AromaPills terms={a.aromas} lang={lang} />
            </Row>
          ) : null}
        </SectionCard>

        <SectionCard id={`${idPrefix}palate`} numeral="III" title={t("palate")} rated={t("typical")}>
          <Row label={t("sweetness")} sub={sub("sweetness")}>
            {band("sweetness")}
          </Row>
          <Row label={t("acidity")} sub={sub("acidity")}>
            {band("acidity")}
          </Row>
          <Row label={t("tannin")} sub={sub("tannin")}>
            {band("tannin")}
          </Row>
          {a.style === "SPARKLING" && a.sat.mousse ? (
            <Row label={t("mousse")} sub={t("sparkling")}>
              <span style={{ fontSize: 13, color: "var(--foreground)" }}>{sub("mousse")}</span>
            </Row>
          ) : null}
          <Row label={t("alcohol")} sub={sub("alcohol")}>
            {band("alcohol")}
          </Row>
          <Row label={t("body")} sub={sub("body")}>
            {band("body")}
          </Row>
          <Row label={t("flavour_intensity")} sub={sub("flavourIntensity")}>
            {band("flavourIntensity")}
          </Row>
          {a.flavours.length > 0 ? (
            <Row wide label={t("flavour_characteristics")} sub={t("typical")}>
              <AromaPills terms={a.flavours} lang={lang} />
            </Row>
          ) : null}
          <Row label={t("finish")} sub={sub("finish")}>
            {band("finish")}
          </Row>
        </SectionCard>

        <SectionCard id={`${idPrefix}conclusions`} numeral="IV" title={t("conclusions")} rated={t("typical")}>
          <Row label={t("quality")} sub={t("typical_range")}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{q}</span>
          </Row>
          {a.description ? (
            <Row wide label={t("in_a_nutshell")}>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--foreground)" }}>{a.description}</p>
            </Row>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}
