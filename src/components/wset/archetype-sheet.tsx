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
import { WSET } from "./tokens";
import { AromaIcon } from "./aroma-icon";
import { useWsetLang } from "@/lib/wset/wset-lang";
import {
  makeT,
  labelsFor,
  translateTerm,
  translateBand,
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

// The map's "a typical wine from here" — the WSET sheet's look, read-only, with
// each scale drawn as its low→high band. Language follows the shared sheet
// toggle; the helpers are closed over `L`/`lang` so every call site stays put.
export function ArchetypeSheet({ a }: { a: ArchetypeView }) {
  const { lang } = useWsetLang();
  const t = makeT(lang);
  const L = labelsFor(lang);

  // A low→high band as words, in the active language.
  const rangeLabel = (r: Range | undefined): string => {
    if (!r) return "—";
    return r[0] === r[1]
      ? L[r[0]] ?? r[0]
      : `${L[r[0]] ?? r[0]} → ${L[r[1]] ?? r[1]}`;
  };

  // Read-only band on the same slider used in the editable sheet.
  const RangeSlider = ({
    stops,
    range,
  }: {
    stops: readonly string[];
    range: Range | undefined;
  }) => {
    if (!range)
      return <p style={{ fontSize: 12, color: WSET.muted2 }}>{t("varies")}</p>;
    return (
      <SnapSlider
        stops={stops}
        labels={L}
        value={null}
        range={range as readonly [string, string]}
        readOnly
      />
    );
  };

  // Read-only aroma / flavour pills, shared by the Nose and Palate sections.
  // The icon keeps the English term (its identity); the text is translated.
  const AromaPills = ({ terms }: { terms: string[] }) => (
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
            background: WSET.burgundy,
            color: WSET.creamText,
          }}
        >
          <AromaIcon term={term} family="" size={17} />
          {translateTerm(term, lang)}
        </span>
      ))}
    </div>
  );

  const sat = a.sat;
  const hueStops = HUES_BY_COLOUR[a.colour] as readonly string[];
  const alcStops = a.style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS;
  const q =
    a.qualityLow != null && a.qualityHigh != null
      ? `${a.qualityLow}–${a.qualityHigh} · ${translateBand(qualityBand(a.qualityHigh), lang)}`
      : "—";

  return (
    <div style={{ color: WSET.body }}>
      <div style={{ marginBottom: 16 }}>
        <span className="font-heading" style={{ fontSize: 18, fontWeight: 700, color: WSET.ink }}>
          {a.name}
        </span>
        <p style={{ fontSize: 12.5, color: WSET.muted, marginTop: 2 }}>
          {a.placeName} · {cap(L[a.colour] ?? a.colour)} · {cap(L[a.style] ?? a.style)}
          {a.grapes ? ` · ${a.grapes}` : ""} — {t("typical_profile")}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <SectionCard id="appearance" numeral="I" title={t("appearance")} rated={t("typical")}>
          <Row label={t("intensity")} sub={rangeLabel(sat.appearanceIntensity)}>
            <RangeSlider stops={APPEARANCE_INTENSITY_STOPS} range={sat.appearanceIntensity} />
          </Row>
          <Row label={t("colour")} sub={rangeLabel(sat.colourHue)}>
            <RangeSlider stops={hueStops} range={sat.colourHue} />
          </Row>
        </SectionCard>

        <SectionCard id="nose" numeral="II" title={t("nose")} rated={t("typical")}>
          <Row label={t("intensity")} sub={rangeLabel(sat.noseIntensity)}>
            <RangeSlider stops={INTENSITY_STOPS} range={sat.noseIntensity} />
          </Row>
          <Row label={t("development")} sub={rangeLabel(sat.development)}>
            <RangeSlider stops={DEVELOPMENT_STOPS} range={sat.development} />
          </Row>
          {a.aromas.length > 0 ? (
            <Row wide label={t("aroma_characteristics")} sub={t("typical")}>
              <AromaPills terms={a.aromas} />
            </Row>
          ) : null}
        </SectionCard>

        <SectionCard id="palate" numeral="III" title={t("palate")} rated={t("typical")}>
          <Row label={t("sweetness")} sub={rangeLabel(sat.sweetness)}>
            <RangeSlider stops={SWEETNESS_STOPS} range={sat.sweetness} />
          </Row>
          <Row label={t("acidity")} sub={rangeLabel(sat.acidity)}>
            <RangeSlider stops={LEVEL_STOPS} range={sat.acidity} />
          </Row>
          <Row label={t("tannin")} sub={rangeLabel(sat.tannin)}>
            <RangeSlider stops={LEVEL_STOPS} range={sat.tannin} />
          </Row>
          {a.style === "SPARKLING" && sat.mousse ? (
            <Row label={t("mousse")} sub={t("sparkling")}>
              <span style={{ fontSize: 13, color: WSET.ink }}>{rangeLabel(sat.mousse)}</span>
            </Row>
          ) : null}
          <Row label={t("alcohol")} sub={rangeLabel(sat.alcohol)}>
            <RangeSlider stops={alcStops} range={sat.alcohol} />
          </Row>
          <Row label={t("body")} sub={rangeLabel(sat.body)}>
            <RangeSlider stops={BODY_STOPS} range={sat.body} />
          </Row>
          <Row label={t("flavour_intensity")} sub={rangeLabel(sat.flavourIntensity)}>
            <RangeSlider stops={INTENSITY_STOPS} range={sat.flavourIntensity} />
          </Row>
          {a.flavours.length > 0 ? (
            <Row wide label={t("flavour_characteristics")} sub={t("typical")}>
              <AromaPills terms={a.flavours} />
            </Row>
          ) : null}
          <Row label={t("finish")} sub={rangeLabel(sat.finish)}>
            <RangeSlider stops={FINISH_STOPS} range={sat.finish} />
          </Row>
        </SectionCard>

        <SectionCard id="conclusions" numeral="IV" title={t("conclusions")} rated={t("typical")}>
          <Row label={t("quality")} sub={t("typical_range")}>
            <span style={{ fontSize: 13, fontWeight: 600, color: WSET.ink }}>{q}</span>
          </Row>
          {a.description ? (
            <Row wide label={t("in_a_nutshell")}>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: WSET.body }}>{a.description}</p>
            </Row>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}
