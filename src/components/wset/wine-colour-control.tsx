"use client";

import type { WineColour, ColourHue } from "@/lib/wset/types";
import { HUE_HEX, LABELS } from "@/lib/wset/vocab";
import { makeT, type WsetLang } from "@/lib/wset/i18n";
import { hueGroupsFor } from "@/lib/wset/hidden-note";

const COLOUR_KEY: Record<WineColour, string> = {
  WHITE: "colour_white",
  ORANGE: "colour_orange",
  ROSE: "colour_rose",
  RED: "colour_red",
};
const COLOURS: WineColour[] = ["WHITE", "ORANGE", "ROSE", "RED"];

/** One family's hue gradient + swatches — the reusable half of the control,
    repeated once per group when the wine's family is unknown. */
function HueSlider({
  colour,
  hues,
  hue,
  onChange,
  labels,
}: {
  colour: WineColour;
  hues: ColourHue[];
  hue: ColourHue | null;
  onChange: (hue: ColourHue | null) => void;
  labels: Record<string, string>;
}) {
  const selected = hue === null ? null : hues.indexOf(hue);
  const hexes = hues.map((h) => HUE_HEX[colour][h] ?? "var(--secondary)");
  const pct = (i: number) => (hues.length <= 1 ? 0 : (i / (hues.length - 1)) * 100);
  const gradient = `linear-gradient(to right, ${hexes.join(", ")})`;

  return (
    <div style={{ padding: "0 20px", userSelect: "none" }}>
      <div
        style={{
          position: "relative",
          height: 10,
          borderRadius: 5,
          background: gradient,
        }}
      >
        {hues.map((h, i) => {
          const isSel = selected === i;
          return (
            <button
              key={h}
              type="button"
              aria-label={labels[h] ?? h}
              aria-pressed={isSel}
              onClick={() => onChange(isSel ? null : h)}
              // A 16px swatch is far below a finger: the ::before square lifts
              // the target to 44px. Swatches sit well over 44px apart on the
              // narrowest phone, so neighbouring targets never overlap.
              className="before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2"
              style={{
                position: "absolute",
                top: "50%",
                left: `${pct(i)}%`,
                transform: `translate(-50%, -50%) scale(${isSel ? 1.25 : 1})`,
                width: 16,
                height: 16,
                borderRadius: "50%",
                padding: 0,
                cursor: "pointer",
                background: HUE_HEX[colour][h] ?? "var(--secondary)",
                border: isSel
                  ? "2px solid var(--primary)"
                  : "1px solid var(--border-strong)",
                transition: "transform 120ms",
              }}
            />
          );
        })}
      </div>
      <div style={{ position: "relative", height: 18, marginTop: 10 }}>
        {hues.map((h, i) => (
          <button
            key={h}
            type="button"
            onClick={() => onChange(selected === i ? null : h)}
            style={{
              position: "absolute",
              left: `${pct(i)}%`,
              top: 0,
              transform: "translateX(-50%)",
              whiteSpace: "nowrap",
              fontSize: 11,
              cursor: "pointer",
              background: "none",
              border: "none",
              padding: 0,
              fontWeight: selected === i ? 700 : 500,
              color: selected === i ? "var(--foreground)" : "var(--muted-foreground)",
            }}
          >
            {labels[h] ?? h}
          </button>
        ))}
      </div>
    </div>
  );
}

// Colour is normally the wine's identity (set on the catalog wine), so the
// segmented control is read-only — it shows which family this wine is, and a
// caption says so (beside the control on desktop, a sentence under it on
// phones); the hue slider below picks the observed shade within that
// family's gradient. `colour: null` is the hidden-glass case (blind-tasting
// B8): the family is not known yet, so the pills disappear and every family's
// gradient renders instead, grouped and labelled (`hueGroupsFor`) — whichever
// swatch the taster picks is kept as-is; the reveal later clears it if it
// turns out not to fit the wine actually poured. `labels` + `lang` localise
// the hue names and the colour-family names.
export function WineColourControl({
  colour,
  hue,
  onChange,
  labels = LABELS,
  lang = "en",
}: {
  colour: WineColour | null;
  hue: ColourHue | null;
  onChange: (hue: ColourHue | null) => void;
  labels?: Record<string, string>;
  lang?: WsetLang;
}) {
  const t = makeT(lang);

  if (colour === null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {hueGroupsFor(null).map((group) => (
          <div key={group.family}>
            <p
              className="mb-2 px-5 text-[11px] font-semibold"
              style={{ color: "var(--muted-foreground)" }}
            >
              {t(COLOUR_KEY[group.family])}
            </p>
            <HueSlider
              colour={group.family}
              hues={group.hues}
              hue={hue}
              onChange={onChange}
              labels={labels}
            />
          </div>
        ))}
      </div>
    );
  }

  const hues = hueGroupsFor(colour)[0].hues;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-[9px] gap-y-1.5">
        <div
          style={{
            display: "inline-flex",
            gap: 3,
            padding: 3,
            borderRadius: 999,
            background: "var(--accent)",
          }}
        >
          {COLOURS.map((c) => {
            const active = c === colour;
            return (
              <span
                key={c}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  borderRadius: 999,
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  background: active ? "var(--card)" : "transparent",
                  color: active ? "var(--foreground)" : "var(--muted-foreground)",
                  boxShadow: active ? "0 1px 2px rgba(42,33,30,0.12)" : "none",
                }}
              >
                {t(COLOUR_KEY[c])}
              </span>
            );
          })}
        </div>
        <span className="text-[11px] text-muted-foreground max-sm:hidden">
          {t("colour_readonly")}
        </span>
        <span className="basis-full text-[11px] text-muted-foreground sm:hidden">
          {t("colour_readonly_sentence")}
        </span>
      </div>

      <HueSlider colour={colour} hues={hues} hue={hue} onChange={onChange} labels={labels} />
    </div>
  );
}
