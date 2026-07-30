"use client";

import type { WineColour, WineStyle } from "@/lib/wset/types";
import {
  LABELS,
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
};

const cap = (s: string) => s[0] + s.slice(1).toLowerCase();

function rangeLabel(r: Range | undefined): string {
  if (!r) return "—";
  return r[0] === r[1]
    ? LABELS[r[0]] ?? r[0]
    : `${LABELS[r[0]] ?? r[0]} → ${LABELS[r[1]] ?? r[1]}`;
}

// Read-only band on the same slider used in the editable sheet.
function RangeSlider({ stops, range }: { stops: readonly string[]; range: Range | undefined }) {
  if (!range) return <p style={{ fontSize: 12, color: WSET.muted2 }}>Varies</p>;
  return (
    <SnapSlider
      stops={stops}
      labels={LABELS}
      value={null}
      range={range as readonly [string, string]}
      readOnly
    />
  );
}

// The map's "a typical wine from here" — the WSET sheet's look, read-only, with
// each scale drawn as its low→high band.
export function ArchetypeSheet({ a }: { a: ArchetypeView }) {
  const sat = a.sat;
  const hueStops = HUES_BY_COLOUR[a.colour] as readonly string[];
  const alcStops = a.style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS;
  const q =
    a.qualityLow != null && a.qualityHigh != null
      ? `${a.qualityLow}–${a.qualityHigh} · ${qualityBand(a.qualityHigh)}`
      : "—";

  return (
    <div style={{ color: WSET.body }}>
      <div style={{ marginBottom: 16 }}>
        <span className="font-heading" style={{ fontSize: 18, fontWeight: 700, color: WSET.ink }}>
          {a.name}
        </span>
        <p style={{ fontSize: 12.5, color: WSET.muted, marginTop: 2 }}>
          {a.placeName} · {cap(a.colour)} · {cap(a.style)}
          {a.grapes ? ` · ${a.grapes}` : ""} — typical profile
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <SectionCard id="appearance" numeral="I" title="Appearance" rated="typical">
          <Row label="Intensity" sub={rangeLabel(sat.appearanceIntensity)}>
            <RangeSlider stops={APPEARANCE_INTENSITY_STOPS} range={sat.appearanceIntensity} />
          </Row>
          <Row label="Colour" sub={rangeLabel(sat.colourHue)}>
            <RangeSlider stops={hueStops} range={sat.colourHue} />
          </Row>
        </SectionCard>

        <SectionCard id="nose" numeral="II" title="Nose" rated="typical">
          <Row label="Intensity" sub={rangeLabel(sat.noseIntensity)}>
            <RangeSlider stops={INTENSITY_STOPS} range={sat.noseIntensity} />
          </Row>
          <Row label="Development" sub={rangeLabel(sat.development)}>
            <RangeSlider stops={DEVELOPMENT_STOPS} range={sat.development} />
          </Row>
          <Row wide label="Aroma characteristics" sub="typical">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {a.aromas.map((t) => (
                <span
                  key={t}
                  style={{
                    borderRadius: 999,
                    padding: "2px 9px",
                    fontSize: 11.5,
                    background: WSET.burgundy,
                    color: WSET.creamText,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </Row>
        </SectionCard>

        <SectionCard id="palate" numeral="III" title="Palate" rated="typical">
          <Row label="Sweetness" sub={rangeLabel(sat.sweetness)}>
            <RangeSlider stops={SWEETNESS_STOPS} range={sat.sweetness} />
          </Row>
          <Row label="Acidity" sub={rangeLabel(sat.acidity)}>
            <RangeSlider stops={LEVEL_STOPS} range={sat.acidity} />
          </Row>
          <Row label="Tannin" sub={rangeLabel(sat.tannin)}>
            <RangeSlider stops={LEVEL_STOPS} range={sat.tannin} />
          </Row>
          {a.style === "SPARKLING" && sat.mousse ? (
            <Row label="Mousse" sub="sparkling">
              <span style={{ fontSize: 13, color: WSET.ink }}>{rangeLabel(sat.mousse)}</span>
            </Row>
          ) : null}
          <Row label="Alcohol" sub={rangeLabel(sat.alcohol)}>
            <RangeSlider stops={alcStops} range={sat.alcohol} />
          </Row>
          <Row label="Body" sub={rangeLabel(sat.body)}>
            <RangeSlider stops={BODY_STOPS} range={sat.body} />
          </Row>
          <Row label="Flavour intensity" sub={rangeLabel(sat.flavourIntensity)}>
            <RangeSlider stops={INTENSITY_STOPS} range={sat.flavourIntensity} />
          </Row>
          <Row label="Finish" sub={rangeLabel(sat.finish)}>
            <RangeSlider stops={FINISH_STOPS} range={sat.finish} />
          </Row>
        </SectionCard>

        <SectionCard id="conclusions" numeral="IV" title="Conclusions" rated="typical">
          <Row label="Quality" sub="typical range">
            <span style={{ fontSize: 13, fontWeight: 600, color: WSET.ink }}>{q}</span>
          </Row>
          {a.description ? (
            <Row wide label="In a nutshell">
              <p style={{ fontSize: 13, lineHeight: 1.6, color: WSET.body }}>{a.description}</p>
            </Row>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}
