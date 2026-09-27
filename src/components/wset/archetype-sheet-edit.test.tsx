import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AromaTerm } from "../../lib/wset/types";
import { ArchetypeSheet, type ArchetypeSheetEdit, type ArchetypeView } from "./archetype-sheet";

// The archetype sheet's editable mode (the admin typical-wine editor), first
// paint. Its read-only mode is pinned byte for byte by sheet-markup.test.tsx.

const noop = () => {};
const count = (html: string, needle: string) => html.split(needle).length - 1;
const HIDDEN_CARD = 'class="scroll-mt-[118px] sm:scroll-mt-0 hidden"';
const SHOWN_CARD = 'class="scroll-mt-[118px] sm:scroll-mt-0"';

const TERMS: AromaTerm[] = [
  { id: "t-blackcurrant", family: "FRUIT", origin: "PRIMARY", groupName: "Black fruit", term: "blackcurrant", sortOrder: 1 },
  { id: "t-lemon", family: "FRUIT", origin: "PRIMARY", groupName: "Citrus fruit", term: "lemon", sortOrder: 2 },
];

const WHITE_SPARKLING: ArchetypeView = {
  name: "A typical Champagne",
  colour: "WHITE",
  style: "SPARKLING",
  placeName: null,
  lineage: "",
  grapes: "",
  description: "Chalky and taut.",
  qualityLow: 88,
  qualityHigh: 94,
  sat: { acidity: ["HIGH", "HIGH"], mousse: ["DELICATE", "CREAMY"] },
  aromas: [],
  flavours: [],
};

const LADDERS: ArchetypeSheetEdit["ladders"] = {
  appearanceIntensity: ["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"],
  colourHue: ["LEMON_GREEN", "LEMON", "GOLD", "AMBER", "BROWN"],
  noseIntensity: ["LIGHT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "PRONOUNCED"],
  development: ["YOUTHFUL", "DEVELOPING", "FULLY_DEVELOPED", "TIRED_PAST_BEST"],
  sweetness: ["DRY", "OFF_DRY", "MEDIUM_DRY", "MEDIUM", "MEDIUM_SWEET", "SWEET", "LUSCIOUS"],
  acidity: ["LOW", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "HIGH"],
  tannin: ["LOW", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "HIGH"],
  alcohol: ["LOW", "MEDIUM", "HIGH"],
  body: ["LIGHT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "FULL"],
  flavourIntensity: ["LIGHT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "PRONOUNCED"],
  finish: ["SHORT", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "LONG"],
  mousse: ["DELICATE", "CREAMY", "AGGRESSIVE"],
};

function edit(overrides: Partial<ArchetypeSheetEdit> = {}): ArchetypeSheetEdit {
  return {
    section: "palate",
    ladders: LADDERS,
    terms: TERMS,
    nose: [{ termId: "t-blackcurrant", signature: true }],
    palate: [{ termId: "t-lemon", signature: false }],
    onRange: noop,
    onQuality: noop,
    onAromas: noop,
    onSignature: noop,
    signatureHint: "Signature terms — an exact hit earns a bonus",
    signatureLabel: (term) => `Signature term: ${term}`,
    ...overrides,
  };
}

describe("ArchetypeSheet, editable", () => {
  it("shows only the chosen section; the others stay mounted, hidden", () => {
    const html = renderToStaticMarkup(<ArchetypeSheet a={WHITE_SPARKLING} edit={edit()} />);
    expect(count(html, HIDDEN_CARD)).toBe(3);
    expect(count(html, SHOWN_CARD)).toBe(1);
    expect(html).toContain(`<section id="palate" ${SHOWN_CARD}`);
  });

  it("hides all four while the editor's own Wine tab is showing", () => {
    const html = renderToStaticMarkup(<ArchetypeSheet a={WHITE_SPARKLING} edit={edit({ section: null })} />);
    expect(count(html, HIDDEN_CARD)).toBe(4);
  });

  it("draws no header and no description row: the editor's bar and Wine tab have them", () => {
    const html = renderToStaticMarkup(<ArchetypeSheet a={WHITE_SPARKLING} edit={edit()} />);
    expect(html).not.toContain("A typical Champagne");
    expect(html).not.toContain("typical profile");
    expect(html).not.toContain("In a nutshell");
    expect(html).not.toContain("Chalky and taut.");
  });

  it("gives every edited scale a live slider, and a clear to each set range and the quality", () => {
    const html = renderToStaticMarkup(<ArchetypeSheet a={WHITE_SPARKLING} edit={edit()} />);
    // Twelve scales on sparkling, each with a hit layer, plus the quality slider's.
    expect(count(html, 'data-slot="slider-hit"')).toBe(13);
    // acidity, mousse and the quality range are set.
    expect(count(html, 'aria-label="clear: ')).toBe(3);
    expect(html).toContain('aria-label="clear: Mousse"');
    expect(html).toContain("88–94");
  });

  it("skips a scale the editor does not edit (mousse off sparkling)", () => {
    const still: ArchetypeSheetEdit["ladders"] = { ...LADDERS };
    delete still.mousse;
    const html = renderToStaticMarkup(
      <ArchetypeSheet a={{ ...WHITE_SPARKLING, style: "STILL" }} edit={edit({ ladders: still })} />,
    );
    expect(html).not.toContain(">Mousse<");
    expect(count(html, 'data-slot="slider-hit"')).toBe(12);
  });

  it("a saved range with a bound off the edit ladder shows its words and a clear, and draws no band", () => {
    // MEDIUM_PLUS is on the fortified alcohol ladder only (a batch row, or a
    // style changed outside this editor).
    const html = renderToStaticMarkup(
      <ArchetypeSheet
        a={{ ...WHITE_SPARKLING, sat: { alcohol: ["MEDIUM_PLUS", "HIGH"] } }}
        edit={edit({ section: "palate" })}
      />,
    );
    expect(html).toContain("medium(+) → high");
    expect(html).toContain('aria-label="clear: Alcohol"');
    // No 16px band caps on any scale (the quality slider's caps are 18px).
    expect(count(html, "width:16px")).toBe(0);
  });

  it("keeps an aroma the picker now hides for this colour chosen, visible and starred", () => {
    // blackcurrant is a red-fruit term: the white picker hides it from its
    // groups, but a chosen term stays in the Selected strip with its star.
    const html = renderToStaticMarkup(<ArchetypeSheet a={WHITE_SPARKLING} edit={edit({ section: "nose" })} />);
    expect(html).toContain('aria-label="Signature term: blackcurrant"');
    expect(html).toContain("blackcurrant ×");
  });

  it("marks each chosen aroma's signature with a pressed star", () => {
    const html = renderToStaticMarkup(<ArchetypeSheet a={WHITE_SPARKLING} edit={edit()} />);
    expect(html).toContain('aria-pressed="true" aria-label="Signature term: blackcurrant"');
    expect(html).toContain('aria-pressed="false" aria-label="Signature term: lemon"');
    expect(html).toContain("Signature terms — an exact hit earns a bonus");
  });
});
