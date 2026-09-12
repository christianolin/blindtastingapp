import { describe, expect, it } from "vitest";
import {
  attributeTally,
  bestGlass,
  blindAgreedLeast,
  blindResult,
  blindScore,
  CATEGORY_ORDER,
  CATEGORY_POINTS,
  categoryMark,
  glassMarks,
  glassMaxPoints,
  inPlayCategories,
  MARK_CATEGORIES,
  revealState,
  semiBlindAgreedLeast,
  semiBlindResult,
  semiBlindScore,
  strongestAttribute,
  type AnswerFlags,
  type AttributeTally,
  type BlindGuessRow,
  type BlindResultGlass,
  type ResultCategory,
  type ResultGlass,
  type SemiBlindGuessRow,
  type ViewerGlass,
} from "./result-math";

// ---- Fixtures ----------------------------------------------------------

/** Nothing optional on the answer key: 2 + 3 + 8. */
const BARE: AnswerFlags = {
  primary_grape_id: "sangiovese",
  appellation_id: null,
  secondary_grape_id: null,
  producer_id: null,
  type_designation_id: null,
  vintage_kind: null,
};

/** The handoff's Nebbiolo-only Barbaresco: no secondary grape or designation, 26. */
const BARBARESCO: AnswerFlags = {
  primary_grape_id: "nebbiolo",
  appellation_id: "barbaresco",
  secondary_grape_id: null,
  producer_id: "produttori",
  type_designation_id: null,
  vintage_kind: "YEAR",
};

/** Everything in play: 30. */
const FULL: AnswerFlags = {
  primary_grape_id: "nebbiolo",
  appellation_id: "barolo",
  secondary_grape_id: "barbera",
  producer_id: "vietti",
  type_designation_id: "riserva",
  vintage_kind: "YEAR",
};

const GUESTS = ["p1", "p2", "p3"];

function glass(
  wineId: string,
  answer: AnswerFlags | null,
  over: Partial<BlindResultGlass> = {},
): BlindResultGlass {
  return {
    wineId,
    isRevealed: true,
    revealStep: 6,
    eligibleParticipantIds: GUESTS,
    answer,
    ...over,
  };
}

function hidden(
  wineId: string,
  revealStep = 0,
  answer: AnswerFlags | null = null,
): BlindResultGlass {
  return glass(wineId, answer, { isRevealed: false, revealStep });
}

type Points = Partial<Record<ResultCategory, number | null>>;

/** A scored blind row; total_points is the coalesce-sum reveal_wine writes. */
function row(
  wine: string,
  participant: string,
  points: Points = {},
  grape: string | null = null,
): BlindGuessRow {
  const col = (c: ResultCategory) => points[c] ?? null;
  return {
    wine_id: wine,
    participant_id: participant,
    primary_grape_id: grape,
    country_points: col("country"),
    region_points: col("region"),
    appellation_points: col("appellation"),
    primary_grape_points: col("primary_grape"),
    secondary_grape_points: col("secondary_grape"),
    producer_points: col("producer"),
    type_designation_points: col("type_designation"),
    vintage_points: col("vintage"),
    total_points: CATEGORY_ORDER.reduce((n, c) => n + (points[c] ?? 0), 0),
  };
}

/** A row where only the total (and the grape picked) matters. */
function scored(
  wine: string,
  participant: string,
  total: number,
  grape: string | null = null,
): BlindGuessRow {
  return { ...row(wine, participant, {}, grape), total_points: total };
}

const ALL_HITS: Points = {
  country: 2,
  region: 3,
  appellation: 5,
  primary_grape: 8,
  secondary_grape: 2,
  producer: 6,
  type_designation: 2,
  vintage: 2,
};

// ---- Per-glass maximum -------------------------------------------------

describe("per-glass maximum", () => {
  it("carries reveal_wine's values: 30 across all eight, 26 across the six marked", () => {
    expect(CATEGORY_ORDER.reduce((n, c) => n + CATEGORY_POINTS[c], 0)).toBe(30);
    expect(MARK_CATEGORIES.reduce((n, c) => n + CATEGORY_POINTS[c], 0)).toBe(26);
  });

  it("always has country, region and primary grape in play: 13", () => {
    expect(inPlayCategories(BARE)).toEqual(["country", "region", "primary_grape"]);
    expect(glassMaxPoints(BARE)).toBe(13);
  });

  it("has all eight in play when the answer key carries everything: 30", () => {
    expect(inPlayCategories(FULL)).toEqual([...CATEGORY_ORDER]);
    expect(glassMaxPoints(FULL)).toBe(30);
  });

  it.each([
    ["appellation_id", "appellation", 5],
    ["secondary_grape_id", "secondary_grape", 2],
    ["producer_id", "producer", 6],
    ["type_designation_id", "type_designation", 2],
    ["vintage_kind", "vintage", 2],
  ] as const)("%s on the answer key brings %s (+%i) into play", (field, category, points) => {
    const answer: AnswerFlags = { ...BARE, [field]: "x" };
    expect(inPlayCategories(answer)).toContain(category);
    expect(glassMaxPoints(answer)).toBe(13 + points);
  });

  it("counts NV and tawny as a vintage in play; only a null kind is out", () => {
    expect(glassMaxPoints({ ...BARE, vintage_kind: "NV" })).toBe(15);
    expect(glassMaxPoints({ ...BARE, vintage_kind: "TAWNY" })).toBe(15);
  });

  it("prices the Nebbiolo-only Barbaresco at 26, not a flat 30", () => {
    expect(glassMaxPoints(BARBARESCO)).toBe(26);
  });
});

describe("revealState", () => {
  it("is revealed whenever is_revealed is set, whatever the step", () => {
    expect(revealState({ isRevealed: true, revealStep: 0 })).toBe("revealed");
    expect(revealState({ isRevealed: true, revealStep: 7 })).toBe("revealed");
  });

  it("is half-revealed once a step is out but the glass is not", () => {
    expect(revealState({ isRevealed: false, revealStep: 3 })).toBe("half_revealed");
  });

  it("is unrevealed with no step out", () => {
    expect(revealState({ isRevealed: false, revealStep: 0 })).toBe("unrevealed");
  });
});

// ---- Score against the maximum ----------------------------------------

describe("blindScore", () => {
  it("scores fully revealed glasses only and names the rest in list order", () => {
    const glasses = [
      glass("g1", BARBARESCO),
      hidden("g2", 3, FULL),
      glass("g3", FULL),
      hidden("g4"),
    ];
    const rows = [
      scored("g1", "p1", 20),
      scored("g2", "p1", 13), // step points so far: must not count
      scored("g3", "p1", 22),
      scored("g4", "p1", 30), // an ASYNC IMMEDIATE own score on a glass never revealed
    ];
    expect(blindScore(glasses, rows, "p1")).toEqual({
      score: 42,
      maximum: 56,
      glasses: [
        { wineId: "g1", points: 20, max: 26, hasRow: true },
        { wineId: "g3", points: 22, max: 30, hasRow: true },
      ],
      notEligible: [],
      excluded: [
        { wineId: "g2", reason: "half_revealed" },
        { wineId: "g4", reason: "unrevealed" },
      ],
      flightMaximum: 56,
    });
  });

  it("never reads the answer key of a glass that is not fully revealed (Rule 1)", () => {
    const trap: BlindResultGlass = {
      wineId: "g2",
      isRevealed: false,
      revealStep: 2,
      eligibleParticipantIds: GUESTS,
      get answer(): AnswerFlags {
        throw new Error("read a hidden answer key");
      },
    };
    const glasses = [glass("g1", BARE), trap];
    const rows = [scored("g1", "p1", 5, "sangiovese"), scored("g2", "p1", 8)];
    expect(() => blindResult(glasses, rows, "p1")).not.toThrow();
    expect(blindScore(glasses, rows, "p1")).toMatchObject({ maximum: 13, flightMaximum: 13 });
  });

  it("counts an eligible glass without a row as 0 against its full maximum", () => {
    const summary = blindScore(
      [glass("g1", BARBARESCO), glass("g2", BARE)],
      [scored("g2", "p1", 13)],
      "p1",
    );
    expect(summary).toMatchObject({ score: 13, maximum: 39 });
    expect(summary.glasses[0]).toEqual({ wineId: "g1", points: 0, max: 26, hasRow: false });
  });

  it("keeps a contributor's own bottle out of their maximum but in the flight's", () => {
    const glasses = [
      glass("g1", BARBARESCO, { eligibleParticipantIds: ["p1", "p3"] }), // p2 brought it
      glass("g2", FULL),
    ];
    const rows = [scored("g1", "p1", 20), scored("g2", "p2", 18)];
    expect(blindScore(glasses, rows, "p2")).toMatchObject({
      score: 18,
      maximum: 30,
      notEligible: ["g1"],
      flightMaximum: 56,
    });
  });

  it("ignores a row from a participant the caller did not make eligible", () => {
    const glasses = [glass("g1", BARBARESCO, { eligibleParticipantIds: ["p1"] })];
    expect(blindScore(glasses, [scored("g1", "p2", 26)], "p2")).toMatchObject({
      score: 0,
      maximum: 0,
      glasses: [],
      notEligible: ["g1"],
    });
  });

  it("gives a HOST_PROVIDES host, absent from rows and eligibility, no score of their own", () => {
    const glasses = [glass("g1", BARBARESCO), glass("g2", BARE), hidden("g3")];
    const rows = [scored("g1", "p1", 20), scored("g2", "p2", 13)];
    expect(blindScore(glasses, rows, "host")).toEqual({
      score: 0,
      maximum: 0,
      glasses: [],
      notEligible: ["g1", "g2"],
      excluded: [{ wineId: "g3", reason: "unrevealed" }],
      flightMaximum: 39,
    });
  });

  it("treats no viewer like a viewer who could guess nothing", () => {
    expect(blindScore([glass("g1", BARE)], [scored("g1", "p1", 13)], null)).toMatchObject({
      score: 0,
      maximum: 0,
      notEligible: ["g1"],
      flightMaximum: 13,
    });
  });

  it("excludes, fail-closed, a revealed glass whose answer key could not be read", () => {
    expect(
      blindScore([glass("g1", null), glass("g2", BARE)], [scored("g1", "p1", 20)], "p1"),
    ).toMatchObject({
      score: 0,
      maximum: 13,
      excluded: [{ wineId: "g1", reason: "no_answer_key" }],
    });
  });

  it("reads a null total as 0", () => {
    const rows = [{ ...scored("g1", "p1", 0), total_points: null }];
    expect(blindScore([glass("g1", BARE)], rows, "p1").glasses).toEqual([
      { wineId: "g1", points: 0, max: 13, hasRow: true },
    ]);
  });

  it("is all zeros for an empty flight", () => {
    expect(blindScore([], [], "p1")).toEqual({
      score: 0,
      maximum: 0,
      glasses: [],
      notEligible: [],
      excluded: [],
      flightMaximum: 0,
    });
  });
});

// ---- Best glass --------------------------------------------------------

describe("bestGlass", () => {
  const g = (wineId: string, points: number, max: number): ViewerGlass => ({
    wineId,
    points,
    max,
    hasRow: true,
  });

  it("picks the highest share of each glass's own maximum, not raw points", () => {
    expect(bestGlass([g("a", 22, 30), g("b", 20, 26)])?.wineId).toBe("b");
  });

  it("compares shares exactly: 20/26 edges out 23/30", () => {
    expect(bestGlass([g("a", 20, 26), g("b", 23, 30)])?.wineId).toBe("a");
  });

  it("hands a tie to the later glass", () => {
    expect(bestGlass([g("a", 13, 26), g("b", 15, 30)])?.wineId).toBe("b");
    expect(bestGlass([g("b", 15, 30), g("a", 13, 26)])?.wineId).toBe("a");
  });

  it("is null with no counted glass, and the last glass when every share is 0", () => {
    expect(bestGlass([])).toBeNull();
    expect(bestGlass([g("a", 0, 26), g("b", 0, 13)])?.wineId).toBe("b");
  });
});

// ---- Marks -------------------------------------------------------------

describe("glassMarks", () => {
  it("marks hit, near (a vintage a year out), miss and out", () => {
    const r = row("g1", "p1", {
      country: 2,
      region: 0,
      appellation: 5,
      primary_grape: 8,
      producer: 0,
      vintage: 1,
    });
    expect(glassMarks(BARBARESCO, r)).toEqual({
      country: "hit",
      region: "miss",
      appellation: "hit",
      primary_grape: "hit",
      secondary_grape: "out",
      producer: "miss",
      type_designation: "out",
      vintage: "near",
    });
  });

  it("marks every in-play attribute a miss when there is no row", () => {
    expect(glassMarks(BARE, null)).toEqual({
      country: "miss",
      region: "miss",
      appellation: "out",
      primary_grape: "miss",
      secondary_grape: "out",
      producer: "out",
      type_designation: "out",
      vintage: "out",
    });
  });

  it("follows the answer key, not the column: a step reveal's 0 on a producer-less wine is out", () => {
    const r = row("g1", "p1", { country: 2, region: 3, primary_grape: 8, producer: 0, vintage: 0 });
    expect(categoryMark("producer", BARE, r)).toBe("out");
    expect(categoryMark("vintage", BARE, r)).toBe("out");
  });

  it("marks a null column on an in-play attribute a miss", () => {
    expect(categoryMark("appellation", BARBARESCO, row("g1", "p1", { country: 2 }))).toBe("miss");
  });
});

// ---- Strongest attribute -----------------------------------------------

describe("attributeTally", () => {
  it("counts in-play occurrences on the viewer's fully revealed glasses, a missing row as misses", () => {
    const glasses = [
      glass("g1", BARBARESCO),
      glass("g2", BARE),
      glass("g3", FULL), // p1 never guessed it
      hidden("g4", 4, FULL),
      glass("g5", BARBARESCO, { eligibleParticipantIds: ["p2", "p3"] }), // p1's own bottle
    ];
    const rows = [
      row("g1", "p1", { country: 2, region: 3, appellation: 0, primary_grape: 8, producer: 0, vintage: 1 }),
      row("g2", "p1", { country: 2, region: 0, primary_grape: 8 }),
      row("g4", "p1", ALL_HITS),
      row("g5", "p1", ALL_HITS),
    ];
    const tally = attributeTally(glasses, rows, "p1");
    expect(tally).toEqual({
      country: { hits: 2, inPlay: 3 },
      region: { hits: 1, inPlay: 3 },
      appellation: { hits: 0, inPlay: 2 },
      primary_grape: { hits: 2, inPlay: 3 },
      secondary_grape: { hits: 0, inPlay: 1 },
      producer: { hits: 0, inPlay: 2 },
      type_designation: { hits: 0, inPlay: 1 },
      vintage: { hits: 0, inPlay: 2 },
    });
    // Country and grape both 2 of 3; the grape carries more weight.
    expect(strongestAttribute(tally)).toEqual({ category: "primary_grape", hits: 2, inPlay: 3 });
  });

  it("does not count a vintage one year out as a hit", () => {
    const tally = attributeTally([glass("g1", BARBARESCO)], [row("g1", "p1", { vintage: 1 })], "p1");
    expect(tally.vintage).toEqual({ hits: 0, inPlay: 1 });
  });

  it("is all zeros for a viewer with no eligible glass, or no viewer", () => {
    const glasses = [glass("g1", FULL, { eligibleParticipantIds: ["p1"] })];
    const rows = [row("g1", "p1", ALL_HITS), row("g1", "host", ALL_HITS)];
    for (const viewer of ["host", null]) {
      const tally = attributeTally(glasses, rows, viewer);
      expect(Object.values(tally).every((t) => t.hits === 0 && t.inPlay === 0)).toBe(true);
    }
  });
});

describe("strongestAttribute", () => {
  const tally = (over: Partial<AttributeTally>): AttributeTally => ({
    country: { hits: 0, inPlay: 0 },
    region: { hits: 0, inPlay: 0 },
    appellation: { hits: 0, inPlay: 0 },
    primary_grape: { hits: 0, inPlay: 0 },
    secondary_grape: { hits: 0, inPlay: 0 },
    producer: { hits: 0, inPlay: 0 },
    type_designation: { hits: 0, inPlay: 0 },
    vintage: { hits: 0, inPlay: 0 },
    ...over,
  });

  it("picks the highest hit rate, whatever the weight", () => {
    expect(
      strongestAttribute(
        tally({ country: { hits: 3, inPlay: 3 }, primary_grape: { hits: 5, inPlay: 6 } }),
      ),
    ).toEqual({ category: "country", hits: 3, inPlay: 3 });
  });

  it("judges the rate over in-play occurrences only: 1 of 1 beats 4 of 6", () => {
    expect(
      strongestAttribute(
        tally({ appellation: { hits: 1, inPlay: 1 }, primary_grape: { hits: 4, inPlay: 6 } }),
      )?.category,
    ).toBe("appellation");
  });

  it("hands an equal rate to the higher weight", () => {
    expect(
      strongestAttribute(
        tally({
          country: { hits: 2, inPlay: 3 },
          region: { hits: 4, inPlay: 6 },
          primary_grape: { hits: 2, inPlay: 3 },
        }),
      )?.category,
    ).toBe("primary_grape");
  });

  it("hands an equal rate and weight to the earlier attribute (country before vintage)", () => {
    const t = { vintage: { hits: 1, inPlay: 2 }, country: { hits: 2, inPlay: 4 } };
    expect(strongestAttribute(tally(t))?.category).toBe("country");
  });

  it("chooses among the six marked attributes unless told otherwise", () => {
    const t = tally({ secondary_grape: { hits: 1, inPlay: 1 }, primary_grape: { hits: 4, inPlay: 6 } });
    expect(strongestAttribute(t)?.category).toBe("primary_grape");
    expect(strongestAttribute(t, CATEGORY_ORDER)?.category).toBe("secondary_grape");
  });

  it("returns the heaviest in-play attribute with 0 hits when nothing was hit", () => {
    expect(
      strongestAttribute(
        tally({
          country: { hits: 0, inPlay: 4 },
          region: { hits: 0, inPlay: 4 },
          primary_grape: { hits: 0, inPlay: 4 },
        }),
      ),
    ).toEqual({ category: "primary_grape", hits: 0, inPlay: 4 });
  });

  it("is null when nothing is in play", () => {
    expect(strongestAttribute(tally({}))).toBeNull();
    expect(strongestAttribute(tally({ secondary_grape: { hits: 1, inPlay: 1 } }))).toBeNull();
  });
});

// ---- The table agreed least on -----------------------------------------

describe("blindAgreedLeast", () => {
  it("picks the lowest mean share of each glass's own maximum", () => {
    const glasses = [glass("g1", BARE), glass("g2", FULL)];
    const rows = [
      scored("g1", "p1", 13),
      scored("g1", "p2", 0), // 13 / 26 = 0.5
      scored("g2", "p1", 14),
      scored("g2", "p2", 14), // 28 / 60 ≈ 0.47, though more raw points
    ];
    expect(blindAgreedLeast(glasses, rows)).toMatchObject({
      wineId: "g2",
      guessers: 2,
      points: 28,
      max: 30,
    });
  });

  it("hands a tie to the later glass", () => {
    const glasses = [glass("g1", BARE), glass("g2", BARBARESCO)];
    const rows = [
      scored("g1", "p1", 13),
      scored("g1", "p2", 0),
      scored("g2", "p1", 26),
      scored("g2", "p2", 0),
    ];
    expect(blindAgreedLeast(glasses, rows)?.wineId).toBe("g2");
    expect(blindAgreedLeast([...glasses].reverse(), rows)?.wineId).toBe("g1");
  });

  it("leaves out glasses that are not fully revealed, however badly they went", () => {
    const glasses = [glass("g1", BARE), hidden("g2", 3, FULL), hidden("g3")];
    const rows = [scored("g1", "p1", 10), scored("g2", "p1", 0), scored("g3", "p1", 0)];
    expect(blindAgreedLeast(glasses, rows)?.wineId).toBe("g1");
  });

  it("does not count an eligible guesser without a row as a zero", () => {
    const glasses = [glass("g1", BARE), glass("g2", BARE)];
    const rows = [
      scored("g1", "p1", 10),
      scored("g1", "p2", 10), // p3 silent: 20 / 26 ≈ 0.77 (as a zero it would be 0.51)
      scored("g2", "p1", 9),
      scored("g2", "p2", 9),
      scored("g2", "p3", 9), // 27 / 39 ≈ 0.69
    ];
    expect(blindAgreedLeast(glasses, rows)).toMatchObject({ wineId: "g2", guessers: 3 });
  });

  it("ignores rows from participants the caller did not make eligible", () => {
    const glasses = [
      glass("g1", BARE, { eligibleParticipantIds: ["p1", "p2"] }), // p3 brought it
      glass("g2", BARE),
    ];
    const rows = [
      scored("g1", "p1", 10),
      scored("g1", "p2", 10),
      scored("g1", "p3", 0), // stray: counted, it would drag g1 below g2
      scored("g1", "host", 0),
      scored("g2", "p1", 9),
      scored("g2", "p2", 9),
      scored("g2", "p3", 9),
    ];
    expect(blindAgreedLeast(glasses, rows)).toMatchObject({ wineId: "g2", guessers: 3 });
  });

  it("builds the sentence from eligible rows only, never a stray pick", () => {
    const glasses = [glass("g1", BARE, { eligibleParticipantIds: ["p1", "p2"] })]; // p3 brought it
    const rows = [
      scored("g1", "p1", 0, "nebbiolo"),
      scored("g1", "p3", 0, "merlot"), // stray: counted, Merlot would lead 2 to 1
      scored("g1", "p2", 8, "sangiovese"),
      scored("g1", "host", 0, "merlot"),
    ];
    expect(blindAgreedLeast(glasses, rows)).toEqual({
      wineId: "g1",
      guessers: 2,
      points: 8,
      max: 13,
      sentence: { kind: "said", pickId: "nebbiolo", count: 1, outOf: 2 },
    });
  });

  it("skips glasses nobody eligible guessed, and is null when that is every glass", () => {
    expect(
      blindAgreedLeast([glass("g1", BARE), glass("g2", BARE)], [scored("g2", "p1", 13)])?.wineId,
    ).toBe("g2");
    expect(blindAgreedLeast([glass("g1", BARE)], [scored("g1", "host", 0)])).toBeNull();
    expect(blindAgreedLeast([], [])).toBeNull();
  });

  describe("sentence", () => {
    const SEVEN = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
    // One glass (truth: Sangiovese), so it is the agreed-least by default.
    const sentenceFor = (picks: (string | null)[]) =>
      blindAgreedLeast(
        [glass("g1", BARE, { eligibleParticipantIds: SEVEN })],
        picks.map((grape, i) => scored("g1", SEVEN[i], grape === "sangiovese" ? 8 : 0, grape)),
      )?.sentence;

    it("names the most common wrong grape: five of seven said Nebbiolo", () => {
      const picks = ["nebbiolo", "sangiovese", "nebbiolo", "nebbiolo", "sangiovese", "nebbiolo", "nebbiolo"];
      expect(sentenceFor(picks)).toEqual({ kind: "said", pickId: "nebbiolo", count: 5, outOf: 7 });
    });

    it("counts the hits when the most common grape was right", () => {
      const picks = ["sangiovese", "nebbiolo", "sangiovese", "merlot", "sangiovese", "nebbiolo", "sangiovese"];
      expect(sentenceFor(picks)).toEqual({ kind: "got", pickId: "sangiovese", hits: 4, outOf: 7 });
    });

    it("names the wrong grape when it ties with the right one", () => {
      const picks = ["sangiovese", "sangiovese", "nebbiolo", "nebbiolo"];
      expect(sentenceFor(picks)).toEqual({ kind: "said", pickId: "nebbiolo", count: 2, outOf: 4 });
    });

    it("breaks a tie between wrong grapes by the caller's row order", () => {
      expect(sentenceFor(["merlot", "nebbiolo", "nebbiolo", "merlot", "sangiovese"])).toEqual({
        kind: "said",
        pickId: "merlot",
        count: 2,
        outOf: 5,
      });
      expect(sentenceFor(["nebbiolo", "merlot", "merlot", "nebbiolo", "sangiovese"])).toEqual({
        kind: "said",
        pickId: "nebbiolo",
        count: 2,
        outOf: 5,
      });
    });

    it("counts a row with no grape in outOf but never as a pick", () => {
      expect(sentenceFor([null, "nebbiolo", null, "nebbiolo", null])).toEqual({
        kind: "said",
        pickId: "nebbiolo",
        count: 2,
        outOf: 5,
      });
      expect(sentenceFor([null, null, null])).toEqual({ kind: "none", outOf: 3 });
    });
  });
});

// ---- The whole S12 result ----------------------------------------------

describe("blindResult", () => {
  const TWO = ["p1", "p2"];
  const glasses = [
    glass("g1", BARBARESCO, { eligibleParticipantIds: TWO }),
    glass("g2", BARE, { eligibleParticipantIds: TWO }),
    glass("g3", FULL, { eligibleParticipantIds: TWO }),
    hidden("g4"),
  ];
  const rows = [
    // g1 (26): p1 20, p2 2
    row("g1", "p1", { country: 2, region: 3, appellation: 5, primary_grape: 8, producer: 0, vintage: 2 }, "nebbiolo"),
    row("g1", "p2", { country: 2, region: 0, appellation: 0, primary_grape: 0, producer: 0, vintage: 0 }, "sangiovese"),
    // g2 (13): p1 5, p2 13
    row("g2", "p1", { country: 2, region: 3, primary_grape: 0 }, "nebbiolo"),
    row("g2", "p2", { country: 2, region: 3, primary_grape: 8 }, "sangiovese"),
    // g3 (30): p1 23, p2 2
    row(
      "g3",
      "p1",
      { country: 2, region: 3, appellation: 0, primary_grape: 8, secondary_grape: 0, producer: 6, type_designation: 2, vintage: 2 },
      "nebbiolo",
    ),
    row(
      "g3",
      "p2",
      { country: 2, region: 0, appellation: 0, primary_grape: 0, secondary_grape: 0, producer: 0, type_designation: 0, vintage: 0 },
      "sangiovese",
    ),
  ];

  it("puts the result together for a guest", () => {
    const result = blindResult(glasses, rows, "p1");
    expect(result).toMatchObject({
      score: 48,
      maximum: 69,
      flightMaximum: 69,
      notEligible: [],
      excluded: [{ wineId: "g4", reason: "unrevealed" }],
    });
    // 20/26 ≈ 0.769 edges out 23/30 ≈ 0.767.
    expect(result.bestGlass).toEqual({ wineId: "g1", points: 20, max: 26, hasRow: true });
    // Country, region and vintage are all 100%; region carries the most weight.
    expect(result.strongestAttribute).toEqual({ category: "region", hits: 3, inPlay: 3 });
    // g1 22/52 ≈ 0.423, g2 18/26 ≈ 0.692, g3 25/60 ≈ 0.417. One Nebbiolo and
    // one Sangiovese on g3: the tie names the wrong one.
    expect(result.agreedLeast).toEqual({
      wineId: "g3",
      guessers: 2,
      points: 25,
      max: 30,
      sentence: { kind: "said", pickId: "sangiovese", count: 1, outOf: 2 },
    });
  });

  it("gives a HOST_PROVIDES host the table's line but nothing of their own", () => {
    const result = blindResult(glasses, rows, "host");
    expect(result).toMatchObject({
      score: 0,
      maximum: 0,
      glasses: [],
      notEligible: ["g1", "g2", "g3"],
      flightMaximum: 69,
      bestGlass: null,
      strongestAttribute: null,
    });
    expect(result.agreedLeast?.wineId).toBe("g3");
  });
});

// ---- Semi-blind --------------------------------------------------------

describe("semi-blind", () => {
  const sGlass = (wineId: string, over: Partial<ResultGlass> = {}): ResultGlass => ({
    wineId,
    isRevealed: true,
    revealStep: 0,
    eligibleParticipantIds: GUESTS,
    ...over,
  });
  const pick = (wine: string, participant: string, guessed: string | null): SemiBlindGuessRow => ({
    wine_id: wine,
    participant_id: participant,
    guessed_wine_id: guessed,
    total_points: guessed === wine ? 1 : 0,
  });

  const flight = [
    sGlass("s1"),
    sGlass("s2", { eligibleParticipantIds: ["p1", "p2"] }), // p3 brought it
    sGlass("s3", { isRevealed: false }),
    sGlass("s4"),
  ];
  const rows = [
    pick("s1", "p1", "s1"),
    pick("s1", "p2", "s2"),
    pick("s1", "p3", "s1"), // s1: 2 of 3
    pick("s2", "p1", "s2"),
    pick("s2", "p2", "s1"),
    pick("s2", "p3", "s2"), // p3's stray row on their own bottle; s2: 1 of 2
    pick("s3", "p1", "s3"), // never revealed
    pick("s4", "p1", "s1"),
    pick("s4", "p2", "s1"),
    pick("s4", "p3", "s4"), // s4: 1 of 3
  ];

  it("is worth one per fully revealed glass and totals the matches", () => {
    expect(semiBlindScore(flight, rows, "p1")).toEqual({
      score: 2,
      maximum: 3,
      glasses: [
        { wineId: "s1", points: 1, max: 1, hasRow: true },
        { wineId: "s2", points: 1, max: 1, hasRow: true },
        { wineId: "s4", points: 0, max: 1, hasRow: true },
      ],
      notEligible: [],
      excluded: [{ wineId: "s3", reason: "unrevealed" }],
      flightMaximum: 3,
    });
    expect(semiBlindScore(flight, rows, "p3")).toMatchObject({
      score: 2,
      maximum: 2,
      notEligible: ["s2"],
    });
  });

  it("finds the lowest match rate and the candidate most picked for it", () => {
    expect(semiBlindAgreedLeast(flight, rows)).toEqual({
      wineId: "s4",
      guessers: 3,
      points: 1,
      max: 1,
      sentence: { kind: "said", pickId: "s1", count: 2, outOf: 3 },
    });
  });

  it("counts the matches when the most picked candidate was the glass itself", () => {
    const table = [pick("s1", "p1", "s1"), pick("s1", "p2", "s1"), pick("s1", "p3", "s2")];
    expect(semiBlindAgreedLeast([sGlass("s1")], table)?.sentence).toEqual({
      kind: "got",
      pickId: "s1",
      hits: 2,
      outOf: 3,
    });
  });

  it("hands an equal match rate to the later glass", () => {
    const two = [sGlass("s1"), sGlass("s2")];
    const table = [
      pick("s1", "p1", "s2"),
      pick("s1", "p2", "s1"),
      pick("s2", "p1", "s1"),
      pick("s2", "p2", "s2"),
    ];
    expect(semiBlindAgreedLeast(two, table)?.wineId).toBe("s2");
  });

  it("has no strongest attribute; the best glass is the latest match", () => {
    const result = semiBlindResult(flight, rows, "p1");
    expect(result).toMatchObject({ score: 2, maximum: 3, strongestAttribute: null });
    expect(result.bestGlass).toEqual({ wineId: "s2", points: 1, max: 1, hasRow: true });
    expect(result.agreedLeast?.wineId).toBe("s4");
  });

  it("is empty for an empty flight", () => {
    expect(semiBlindResult([], [], "p1")).toEqual({
      score: 0,
      maximum: 0,
      glasses: [],
      notEligible: [],
      excluded: [],
      flightMaximum: 0,
      bestGlass: null,
      strongestAttribute: null,
      agreedLeast: null,
    });
  });
});
