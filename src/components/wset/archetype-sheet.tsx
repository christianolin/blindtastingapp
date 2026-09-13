"use client";

import type { WineColour, WineStyle } from "@/lib/wset/types";
import {
  APPEARANCE_INTENSITY_STOPS,
  INTENSITY_STOPS,
  DEVELOPMENT_STOPS,
  SWEETNESS_STOPS,
  LEVEL_STOPS,
  ALCOHOL_STOPS,
  FORTIFIED_ALCOHOL_STOPS,
  BODY_STOPS,
  FINISH_STOPS,
  HUES_BY_COLOUR,
} from "@/lib/wset/vocab";
import { qualityBand } from "@/lib/wset/quality-curve.mjs";
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

export type ArchetypeView = {
  name: string;
  colour: WineColour;
  style: WineStyle;
  placeName: string;
  grapes: string;
  description: string | null;
  qualityLow: number | null;
  qualityHigh: number | null;
  sat: Record<string, Range | undefined>;
  aromas: string[];
  flavours: string[];
};

const cap = (s: string) => s[0] + s.slice(1).toLowerCase();

// Read-only band on the same slider used in the editable sheet. Module-level
// (not declared inside ArchetypeSheet's render) so React keeps one component
// identity across renders — the react-hooks/static-components rule.
function RangeSlider({
  stops,
  range,
  labels,
  variesText,
}: {
  stops: readonly string[];
  range: Range | undefined;
  labels: Record<string, string>;
  variesText: string;
}) {
  if (!range)
    return <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{variesText}</p>;
  return (
    <SnapSlider
      stops={stops}
      labels={labels}
      value={null}
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
export function ArchetypeSheet({ a }: { a: ArchetypeView }) {
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

  const sat = a.sat;
  const hueStops = HUES_BY_COLOUR[a.colour] as readonly string[];
  const alcStops = a.style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS;
  const q =
    a.qualityLow != null && a.qualityHigh != null
      ? `${a.qualityLow}–${a.qualityHigh} · ${translateBand(qualityBand(a.qualityHigh), lang)}`
      : "—";

  return (
    <div style={{ color: "var(--foreground)" }}>
      <div style={{ marginBottom: 16 }}>
        <span className="font-heading" style={{ fontSize: 18, fontWeight: 700, color: "var(--foreground)" }}>
          {a.name}
        </span>
        <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", marginTop: 2 }}>
          {a.placeName} · {cap(L[a.colour] ?? a.colour)} · {cap(L[a.style] ?? a.style)}
          {a.grapes ? ` · ${a.grapes}` : ""} — {t("typical_profile")}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <SectionCard id="appearance" numeral="I" title={t("appearance")} rated={t("typical")}>
          <Row label={t("intensity")} sub={rangeLabel(sat.appearanceIntensity)}>
            <RangeSlider stops={APPEARANCE_INTENSITY_STOPS} range={sat.appearanceIntensity} labels={L} variesText={varies} />
          </Row>
          <Row label={t("colour")} sub={rangeLabel(sat.colourHue)}>
            <RangeSlider stops={hueStops} range={sat.colourHue} labels={L} variesText={varies} />
          </Row>
        </SectionCard>

        <SectionCard id="nose" numeral="II" title={t("nose")} rated={t("typical")}>
          <Row label={t("intensity")} sub={rangeLabel(sat.noseIntensity)}>
            <RangeSlider stops={INTENSITY_STOPS} range={sat.noseIntensity} labels={L} variesText={varies} />
          </Row>
          <Row label={t("development")} sub={rangeLabel(sat.development)}>
            <RangeSlider stops={DEVELOPMENT_STOPS} range={sat.development} labels={L} variesText={varies} />
          </Row>
          {a.aromas.length > 0 ? (
            <Row wide label={t("aroma_characteristics")} sub={t("typical")}>
              <AromaPills terms={a.aromas} lang={lang} />
            </Row>
          ) : null}
        </SectionCard>

        <SectionCard id="palate" numeral="III" title={t("palate")} rated={t("typical")}>
          <Row label={t("sweetness")} sub={rangeLabel(sat.sweetness)}>
            <RangeSlider stops={SWEETNESS_STOPS} range={sat.sweetness} labels={L} variesText={varies} />
          </Row>
          <Row label={t("acidity")} sub={rangeLabel(sat.acidity)}>
            <RangeSlider stops={LEVEL_STOPS} range={sat.acidity} labels={L} variesText={varies} />
          </Row>
          <Row label={t("tannin")} sub={rangeLabel(sat.tannin)}>
            <RangeSlider stops={LEVEL_STOPS} range={sat.tannin} labels={L} variesText={varies} />
          </Row>
          {a.style === "SPARKLING" && sat.mousse ? (
            <Row label={t("mousse")} sub={t("sparkling")}>
              <span style={{ fontSize: 13, color: "var(--foreground)" }}>{rangeLabel(sat.mousse)}</span>
            </Row>
          ) : null}
          <Row label={t("alcohol")} sub={rangeLabel(sat.alcohol)}>
            <RangeSlider stops={alcStops} range={sat.alcohol} labels={L} variesText={varies} />
          </Row>
          <Row label={t("body")} sub={rangeLabel(sat.body)}>
            <RangeSlider stops={BODY_STOPS} range={sat.body} labels={L} variesText={varies} />
          </Row>
          <Row label={t("flavour_intensity")} sub={rangeLabel(sat.flavourIntensity)}>
            <RangeSlider stops={INTENSITY_STOPS} range={sat.flavourIntensity} labels={L} variesText={varies} />
          </Row>
          {a.flavours.length > 0 ? (
            <Row wide label={t("flavour_characteristics")} sub={t("typical")}>
              <AromaPills terms={a.flavours} lang={lang} />
            </Row>
          ) : null}
          <Row label={t("finish")} sub={rangeLabel(sat.finish)}>
            <RangeSlider stops={FINISH_STOPS} range={sat.finish} labels={L} variesText={varies} />
          </Row>
        </SectionCard>

        <SectionCard id="conclusions" numeral="IV" title={t("conclusions")} rated={t("typical")}>
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
