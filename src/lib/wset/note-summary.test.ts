import { describe, expect, it } from "vitest";
import { makeT } from "./i18n";
import { emptyNoteState } from "./note-state";
import {
  SECTION_KEYS,
  assessedOf,
  isComplete,
  noteTotal,
  scoreWord,
  summarizeNoteRow,
  summarizeNoteState,
  type WsetNoteAromaRow,
  type WsetNoteRow,
} from "./note-summary";

// A saved wset_notes row with nothing rated — the shape the archive reads.
function blankRow(overrides: Partial<WsetNoteRow> = {}): WsetNoteRow {
  return {
    id: "note-1",
    catalog_wine_id: "wine-1",
    context_kind: "OPEN",
    tasting_wine_id: null,
    author_id: "user-1",
    tasted_on: "2026-09-11",
    clarity: null,
    appearance_intensity: null,
    colour_hue: null,
    observations: [],
    condition: null,
    faults: [],
    nose_intensity: null,
    development: null,
    sweetness: null,
    acidity: null,
    tannin: null,
    tannin_nature: [],
    alcohol: null,
    body: null,
    mousse: null,
    flavour_intensity: null,
    finish: null,
    quality_score: null,
    price_category: null,
    readiness: null,
    taster_notes: "",
    created_at: "2026-09-11T18:00:00Z",
    updated_at: "2026-09-11T18:00:00Z",
    ...overrides,
  };
}

// Every scale rated (mousse left null: it only counts for sparkling wines).
const RATED: Partial<WsetNoteRow> = {
  clarity: "CLEAR",
  appearance_intensity: "MEDIUM_PLUS",
  colour_hue: "GARNET",
  condition: "CLEAN",
  nose_intensity: "PRONOUNCED",
  development: "DEVELOPING",
  sweetness: "DRY",
  acidity: "HIGH",
  tannin: "MEDIUM_PLUS",
  alcohol: "MEDIUM",
  body: "FULL",
  flavour_intensity: "PRONOUNCED",
  finish: "LONG",
  quality_score: 91,
  price_category: "PREMIUM",
  readiness: "READY_CAN_IMPROVE",
};

// One term on nose and palate, one on the nose only.
const AROMAS: WsetNoteAromaRow[] = [
  { term_id: "t-cherry", sensed_on_nose: true, sensed_on_palate: true },
  { term_id: "t-tar", sensed_on_nose: true, sensed_on_palate: false },
];

const doneTotals = (s: ReturnType<typeof summarizeNoteRow>) =>
  s.sections.map((x) => [x.done, x.total]);

describe("summarizeNoteRow", () => {
  it("an empty still note: four sections, 0 of 18, not complete, no score", () => {
    const s = summarizeNoteRow(blankRow(), [], "STILL");
    expect(s.sections.map((x) => x.key)).toEqual([...SECTION_KEYS]);
    expect(doneTotals(s)).toEqual([
      [0, 3],
      [0, 4],
      [0, 8],
      [0, 3],
    ]);
    expect(s.sections.every((x) => !x.complete)).toBe(true);
    expect(s.done).toBe(0);
    expect(s.total).toBe(18);
    expect(s.complete).toBe(false);
    expect(s.score).toBeNull();
  });

  it("an empty sparkling note counts mousse: 0 of 19", () => {
    const s = summarizeNoteRow(blankRow(), [], "SPARKLING");
    expect(doneTotals(s)).toEqual([
      [0, 3],
      [0, 4],
      [0, 9],
      [0, 3],
    ]);
    expect(s.total).toBe(19);
  });

  it("a complete still note: every section done, 18 of 18, score kept", () => {
    const s = summarizeNoteRow(blankRow(RATED), AROMAS, "STILL");
    expect(doneTotals(s)).toEqual([
      [3, 3],
      [4, 4],
      [8, 8],
      [3, 3],
    ]);
    expect(s.sections.every((x) => x.complete)).toBe(true);
    expect(s.done).toBe(18);
    expect(s.total).toBe(18);
    expect(s.complete).toBe(true);
    expect(s.score).toBe(91);
  });

  it("a complete sparkling note needs mousse too: 19 of 19", () => {
    const s = summarizeNoteRow(
      blankRow({ ...RATED, mousse: "CREAMY" }),
      AROMAS,
      "SPARKLING",
    );
    expect(s.sections[2]).toMatchObject({ key: "palate", done: 9, total: 9, complete: true });
    expect(s.done).toBe(19);
    expect(s.total).toBe(19);
    expect(s.complete).toBe(true);
  });

  it("a sparkling note without mousse is 18 of 19 and not complete", () => {
    const s = summarizeNoteRow(blankRow(RATED), AROMAS, "SPARKLING");
    expect(s.sections[2]).toMatchObject({ key: "palate", done: 8, total: 9, complete: false });
    expect(s.done).toBe(18);
    expect(s.complete).toBe(false);
  });

  it("a partial note: appearance done, nose short of an aroma, palate half, score only", () => {
    const row = blankRow({
      clarity: "CLEAR",
      appearance_intensity: "MEDIUM",
      colour_hue: "RUBY",
      condition: "CLEAN",
      nose_intensity: "MEDIUM_PLUS",
      development: "YOUTHFUL",
      sweetness: "DRY",
      acidity: "MEDIUM_PLUS",
      tannin: "MEDIUM",
      body: "MEDIUM",
      quality_score: 85,
    });
    // A palate-only term counts for the palate (4 scales + 1 term = 5) but
    // not as a nose term, so the nose stays one short.
    const s = summarizeNoteRow(
      row,
      [{ term_id: "t-plum", sensed_on_nose: false, sensed_on_palate: true }],
      "STILL",
    );
    expect(doneTotals(s)).toEqual([
      [3, 3],
      [3, 4],
      [5, 8],
      [1, 3],
    ]);
    expect(s.sections.map((x) => x.complete)).toEqual([true, false, false, false]);
    expect(s.done).toBe(12);
    expect(s.total).toBe(18);
    expect(s.complete).toBe(false);
    expect(s.score).toBe(85);
  });

  it("observations, faults, tannin nature and free text never count", () => {
    const s = summarizeNoteRow(
      blankRow({
        observations: ["LEGS_TEARS"],
        faults: ["OXIDISED"],
        tannin_nature: ["RIPE"],
        taster_notes: "Long, savoury.",
      }),
      [],
      "STILL",
    );
    expect(s.done).toBe(0);
  });

  it("an unknown style (a note with no catalog wine) counts as still", () => {
    const s = summarizeNoteRow(blankRow(), [], null);
    expect(s.total).toBe(18);
    expect(s.sections[2].total).toBe(8);
  });

  it("carries a label key per section that makeT renders in EN and DA", () => {
    const s = summarizeNoteRow(blankRow(), [], "STILL");
    const en = makeT("en");
    const da = makeT("da");
    expect(s.sections.map((x) => en(x.labelKey))).toEqual([
      "Appearance",
      "Nose",
      "Palate",
      "Conclusion",
    ]);
    expect(s.sections.map((x) => da(x.labelKey))).toEqual([
      "Udseende",
      "Duft",
      "Smag",
      "Konklusion",
    ]);
  });
});

describe("summarizeNoteState", () => {
  it("matches the row summary for a blank sheet", () => {
    const fromState = summarizeNoteState(emptyNoteState(), "STILL");
    const fromRow = summarizeNoteRow(blankRow(), [], "STILL");
    expect(fromState.sections).toEqual(fromRow.sections);
    expect(fromState.done).toBe(0);
    expect(fromState.total).toBe(18);
    expect(fromState.complete).toBe(false);
    expect(fromState.score).toBeNull();
  });

  it("reads a live sheet's score", () => {
    const s = summarizeNoteState({ ...emptyNoteState(), qualityScore: 88 }, "STILL");
    expect(s.score).toBe(88);
    expect(s.sections[3]).toMatchObject({ key: "conclusions", done: 1, total: 3 });
  });
});

describe("isComplete", () => {
  it("is true only when every section is done", () => {
    const full = summarizeNoteRow(blankRow(RATED), AROMAS, "STILL");
    expect(isComplete(full.sections)).toBe(true);
    const nearly = summarizeNoteRow(
      blankRow({ ...RATED, readiness: null }),
      AROMAS,
      "STILL",
    );
    expect(isComplete(nearly.sections)).toBe(false);
    expect(isComplete([])).toBe(false);
  });
});

describe("noteTotal", () => {
  it("is 18, or 19 for sparkling", () => {
    expect(noteTotal("STILL")).toBe(18);
    expect(noteTotal("SPARKLING")).toBe(19);
    expect(noteTotal("FORTIFIED")).toBe(18);
    expect(noteTotal("SWEET")).toBe(18);
    expect(noteTotal(null)).toBe(18);
    expect(noteTotal(undefined)).toBe(18);
  });
});

describe("assessedOf", () => {
  const s = { done: 16, total: 18 };

  it("short form '{d} of {t}' for the phone header", () => {
    expect(assessedOf(s, "en")).toBe("16 of 18");
  });

  it("short form in Danish: '16 af 18', never the English 'of'", () => {
    expect(assessedOf(s, "da")).toBe("16 af 18");
  });

  it("long form '{d} of {t} assessed' for desktop and the after-save line", () => {
    expect(assessedOf(s, "en", "long")).toBe("16 of 18 assessed");
    expect(assessedOf(s, "da", "long")).toBe("16 af 18 vurderet");
  });

  it("takes a full summary", () => {
    const full = summarizeNoteRow(blankRow(RATED), AROMAS, "SPARKLING");
    expect(assessedOf(full, "en", "long")).toBe("18 of 19 assessed");
  });
});

describe("scoreWord", () => {
  it("returns the quality band for every threshold", () => {
    expect(scoreWord(100, "en")).toBe("Extraordinary");
    expect(scoreWord(96, "en")).toBe("Extraordinary");
    expect(scoreWord(95, "en")).toBe("Outstanding");
    expect(scoreWord(90, "en")).toBe("Outstanding");
    expect(scoreWord(89, "en")).toBe("Very good");
    expect(scoreWord(85, "en")).toBe("Very good");
    expect(scoreWord(84, "en")).toBe("Above average");
    expect(scoreWord(80, "en")).toBe("Above average");
    expect(scoreWord(79, "en")).toBe("Average");
    expect(scoreWord(70, "en")).toBe("Average");
    expect(scoreWord(69, "en")).toBe("Below average");
    expect(scoreWord(60, "en")).toBe("Below average");
    expect(scoreWord(59, "en")).toBe("Unacceptable");
    expect(scoreWord(50, "en")).toBe("Unacceptable");
  });

  it("translates to Danish", () => {
    expect(scoreWord(91, "da")).toBe("Fremragende");
    expect(scoreWord(85, "da")).toBe("Meget god");
  });

  it("rounds an average to the displayed whole number first", () => {
    expect(scoreWord(89.5, "en")).toBe("Outstanding");
    expect(scoreWord(89.4, "en")).toBe("Very good");
  });

  it("is null for a note without a score", () => {
    expect(scoreWord(null, "en")).toBeNull();
    expect(scoreWord(undefined, "da")).toBeNull();
    expect(scoreWord(Number.NaN, "en")).toBeNull();
    expect(scoreWord(Number.POSITIVE_INFINITY, "en")).toBeNull();
  });
});
