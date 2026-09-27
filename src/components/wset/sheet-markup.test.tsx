import { createRef, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AromaTerm, WsetNoteState } from "../../lib/wset/types";
import { ArchetypeSheet, type ArchetypeView } from "./archetype-sheet";
import { WsetSheet } from "./wset-sheet";

// The markup every existing surface of the WSET sheet family draws, pinned
// before the admin typical-wine editor started sharing these components
// (plan 2026-09-26-archetype-editor-sheet): the read-only archetype sheet
// (Library, map, training room) and the note sheet (note page, Taste & Rate
// modal, training room). Same markup, same CSS: same pixels. An intended
// change to one of these surfaces is committed with
// `npx vitest run src/components/wset/sheet-markup.test.tsx -u` and its diff
// read in review.
//
// renderToStaticMarkup runs in node (no DOM): what it pins is the first paint
// — every section is in it, the three not on screen carry `hidden`.

/** One tag per line, so a change reads as a diff. React's useId values
    (`_R_…_`) follow the component tree, not anything drawn, so they are masked. */
function markup(element: ReactElement): string {
  return renderToStaticMarkup(element).replace(/_R_[0-9a-z]+_/gi, "_R_id_").replace(/></g, ">\n<");
}

const noop = () => {};
const noopSave = async () => {};

const TERMS: AromaTerm[] = [
  { id: "t-blackcurrant", family: "FRUIT", origin: "PRIMARY", groupName: "Black fruit", term: "blackcurrant", sortOrder: 1 },
  { id: "t-lemon", family: "FRUIT", origin: "PRIMARY", groupName: "Citrus fruit", term: "lemon", sortOrder: 2 },
  { id: "t-vanilla", family: "SPICE", origin: "SECONDARY", groupName: "Oak", term: "vanilla", sortOrder: 3 },
  { id: "t-leather", family: "OTHER", origin: "TERTIARY", groupName: "Red wine", term: "leather", sortOrder: 4 },
];

const EMPTY: WsetNoteState = {
  id: null,
  tastedOn: "2026-09-26",
  clarity: null,
  appearanceIntensity: null,
  colourHue: null,
  observations: [],
  condition: null,
  faults: [],
  noseIntensity: null,
  development: null,
  sweetness: null,
  acidity: null,
  tannin: null,
  tanninNature: [],
  alcohol: null,
  body: null,
  mousse: null,
  flavourIntensity: null,
  finish: null,
  qualityScore: null,
  priceCategory: null,
  readiness: null,
  tasterNotes: "",
  noseTermIds: [],
  palateTermIds: [],
};

const NOTE: WsetNoteState = {
  ...EMPTY,
  clarity: "CLEAR",
  appearanceIntensity: "MEDIUM",
  colourHue: "RUBY",
  observations: ["LEGS_TEARS"],
  condition: "CLEAN",
  noseIntensity: "MEDIUM_PLUS",
  development: "DEVELOPING",
  sweetness: "DRY",
  acidity: "HIGH",
  tannin: "MEDIUM_PLUS",
  tanninNature: ["RIPE"],
  alcohol: "HIGH",
  body: "FULL",
  flavourIntensity: "PRONOUNCED",
  finish: "LONG",
  qualityScore: 92,
  priceCategory: "PREMIUM",
  readiness: "READY_CAN_IMPROVE",
  tasterNotes: "Firm and long.",
  noseTermIds: ["t-blackcurrant", "t-vanilla"],
  palateTermIds: ["t-blackcurrant"],
};

const RED: ArchetypeView = {
  name: "A typical Pauillac",
  colour: "RED",
  style: "STILL",
  placeName: "Pauillac",
  lineage: "Pauillac AOC · Bordeaux, France · Cabernet Sauvignon, Merlot",
  grapes: "Cabernet Sauvignon, Merlot",
  description: "Firm, cassis-led claret built to age.",
  qualityLow: 88,
  qualityHigh: 96,
  sat: {
    // Off the note's three stops: drawn on the full five-stop ladder.
    appearanceIntensity: ["MEDIUM_PLUS", "DEEP"],
    colourHue: ["RUBY", "GARNET"],
    noseIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
    development: ["YOUTHFUL", "DEVELOPING"],
    sweetness: ["DRY", "DRY"],
    acidity: ["MEDIUM_PLUS", "HIGH"],
    // High first: drawn low to high.
    tannin: ["HIGH", "MEDIUM_PLUS"],
    alcohol: ["MEDIUM", "HIGH"],
    body: ["FULL", "FULL"],
    flavourIntensity: ["MEDIUM_PLUS", "PRONOUNCED"],
    // No finish: "Varies".
  },
  aromas: ["blackcurrant", "cedar", "vanilla"],
  flavours: ["blackcurrant", "tobacco"],
};

const SPARKLING: ArchetypeView = {
  name: "A typical Champagne",
  colour: "WHITE",
  style: "SPARKLING",
  placeName: null,
  lineage: "Champagne, France · Chardonnay, Pinot Noir",
  grapes: "Chardonnay, Pinot Noir",
  description: null,
  qualityLow: null,
  qualityHigh: null,
  sat: {
    colourHue: ["LEMON", "GOLD"],
    acidity: ["HIGH", "HIGH"],
    // MEDIUM is not a note stop: the seven-stop ladder.
    sweetness: ["MEDIUM", "MEDIUM"],
    mousse: ["DELICATE", "CREAMY"],
    finish: ["MEDIUM", "LONG"],
  },
  aromas: ["lemon"],
  flavours: [],
};

const FORTIFIED: ArchetypeView = {
  name: "A typical Tawny Port",
  colour: "RED",
  style: "FORTIFIED",
  placeName: null,
  lineage: "",
  grapes: "Touriga Nacional",
  description: null,
  qualityLow: 90,
  qualityHigh: 95,
  sat: {
    alcohol: ["MEDIUM_PLUS", "HIGH"],
    sweetness: ["SWEET", "LUSCIOUS"],
    // Not a red hue at all: "Varies".
    colourHue: ["LEMON", "LEMON"],
  },
  aromas: [],
  flavours: [],
};

describe("read-only archetype sheet markup (Library, map, training room)", () => {
  it("a red with every kind of band", async () => {
    await expect(markup(<ArchetypeSheet a={RED} />)).toMatchFileSnapshot("./__snapshots__/markup/archetype-red.html");
  });

  it("a sparkling white with the taster's answers and an id prefix", async () => {
    await expect(
      markup(<ArchetypeSheet a={SPARKLING} answers={NOTE} idPrefix="archetype-x-" />),
    ).toMatchFileSnapshot("./__snapshots__/markup/archetype-sparkling-answers.html");
  });

  it("a fortified red with no aromas, no description and a band it cannot draw", async () => {
    await expect(markup(<ArchetypeSheet a={FORTIFIED} />)).toMatchFileSnapshot(
      "./__snapshots__/markup/archetype-fortified.html",
    );
  });
});

describe("WSET note sheet markup (note page, Taste & Rate modal, training room)", () => {
  it("the note page: live-note column, a filled note", async () => {
    await expect(
      markup(
        <WsetSheet
          wine={{ colour: "RED", style: "STILL" }}
          title="Château Test 2015"
          terms={TERMS}
          initial={NOTE}
          onSave={noopSave}
          onDiscard={noop}
        />,
      ),
    ).toMatchFileSnapshot("./__snapshots__/markup/wset-note-page.html");
  });

  it("the Taste & Rate modal: embedded, a saved sparkling note with Delete", async () => {
    await expect(
      markup(
        <WsetSheet
          wine={{ colour: "WHITE", style: "SPARKLING" }}
          title="Cava Brut Nature"
          terms={TERMS}
          initial={EMPTY}
          onSave={noopSave}
          onDiscard={noop}
          onDelete={noop}
          embedded
        />,
      ),
    ).toMatchFileSnapshot("./__snapshots__/markup/wset-note-modal.html");
  });

  // The room also hands the sheet a titleRef (it moves focus to the title as
  // a session opens), so the title is pinned with its tabindex="-1" too.
  it("the training room: unknown wine, title ref, footer action, strip, no column, bubbles and fortified", async () => {
    await expect(
      markup(
        <WsetSheet
          wine={{ colour: null, style: null }}
          title="Training · 20:14"
          titleRef={createRef<HTMLParagraphElement>()}
          terms={TERMS}
          initial={NOTE}
          footerAction={{ label: "Your call →", onClick: noop }}
          belowBar={<div className="h-11 lg:hidden">strip</div>}
          aside={null}
          onClose={noop}
          bubbles={{ value: true, onChange: noop }}
          fortified={{ value: null, onChange: noop }}
        />,
      ),
    ).toMatchFileSnapshot("./__snapshots__/markup/wset-training.html");
  });
});
