import { describe, expect, it } from "vitest";
import { arch } from "./__fixtures__/archetypes";
import {
  CLOSE_WINDOW,
  RESULT_ROW_LABELS,
  RESULT_ROW_ORDER,
  TRAINING_COPY,
  bestLine,
  capReasonLine,
  clockTime,
  continueLine,
  coverageLine,
  groupLossLine,
  groupsLossLine,
  groupSubLine,
  hueClearedLine,
  itWasLine,
  lineageLine,
  percentLabel,
  pickSaidLine,
  regionLabel,
  resultMark,
  reasonsLine,
  resultTotalLine,
  scaleLossLine,
  sessionsLine,
  sheetTitle,
  shortDate,
  shortName,
  showAllRegionsLine,
  signatureLine,
  signaturesLine,
  stripLine,
  styleVerdictLine,
  tallyLine,
  tawnyAgeOption,
  vintageGuessLabel,
  youSaidLine,
  youSaidRegionLine,
} from "./copy";
import { groupRanking } from "./groups";
import type { CapReason, RankedCandidate } from "./types";

// Spec 2026-09-25-training-room-design.md §9: every string verbatim.

function rc(key: string, closeness: number | null, capped: CapReason | null = null): RankedCandidate {
  return { candidate: arch(key), closeness, capped, explanation: null, signatureHits: [] };
}

describe("TRAINING_COPY (spec §9, verbatim)", () => {
  it("holds every fixed string", () => {
    expect(TRAINING_COPY).toEqual({
      navLabel: "Training Room",
      previewPill: "Preview",
      appBarTitle: "Training room",
      loading: "Setting up the training room…",
      eyebrow: "Training room · Preview",
      title: "Taste blind. Then find out.",
      promise:
        "Pour a glass whose label you can't see. Describe it, watch the list tell you what it could be, then reveal the bottle.",
      coverageEmpty: "No typical wines yet — the room opens once the first batch lands.",
      start: "Start a session",
      discard: "Discard",
      discardArmed: "Tap again to discard",
      footerAction: "Your call →",
      candidatesHeading: "What it could be",
      beforeAnswers: "Start describing the wine",
      nothingFits: "Nothing fits yet — check colour and bubbles",
      unlikelyGroup: "Unlikely from what you've said",
      back: "Back",
      close: "Close",
      higherThanTypical: "higher than typical",
      lowerThanTypical: "lower than typical",
      colourDarker: "Colour darker than typical",
      colourLighter: "Colour lighter than typical",
      fitsSoFar: "Fits what you've said so far",
      capBubbles: "Bubbles noted",
      capNoBubbles: "No bubbles noted",
      capFortified: "Fortified",
      capNotFortified: "Not fortified",
      yourCall: "Your call",
      notInList: "It's not in the list",
      whichRegion: "Which region is it?",
      searchRegions: "Search regions…",
      goDeeper: "Go deeper (optional)",
      justTheRegion: "Just the region",
      grapeOptional: "Grape (optional)",
      otherGrape: "Other grape…",
      searchGrapes: "Search grapes…",
      vintageOptional: "Vintage (optional)",
      vintageYearGroup: "Year",
      vintageNvGroup: "Non-vintage",
      vintageNv: "NV",
      vintageTawnyGroup: "Tawny",
      vintageOtherAge: "Other age…",
      tawnyAgeLabel: "Tawny age (years)",
      tawnyAgePlaceholder: "e.g. 25",
      tawnyAgeCancel: "Cancel",
      tawnyAgeSet: "Set age",
      revealBottle: "Reveal the bottle",
      cantFindOut: "I can't find out",
      revealEyebrow: "Reveal the bottle",
      revealTitle: "Which bottle was it?",
      revealRowAction: "This is it",
      revealPrimary: "This is it",
      revealEnterHint: "↵ reveals the first hit",
      revealByHandPrimary: "This is it",
      revealUploadBody: "Read and matched exactly as it is on the phone, then your result shows.",
      revealCellarSubtitle: "if the bottle came from your cellar",
      noPick: "You didn't pick a wine",
      wherePointed: "Where your note pointed",
      notInPool: "This style isn't in the pool yet",
      notRevealed: "Not revealed — your note is kept. Reveal now from Your sessions.",
      anotherGlass: "Another glass",
      seeNote: "See the note",
      done: "Done",
      markHit: "✓",
      markMiss: "✗",
      markNotApplicable: "—",
      yourSessions: "Your sessions",
      notRevealedShort: "Not revealed",
      revealNow: "Reveal now",
      showMore: "Show more",
      noSessions: "No sessions yet",
      deleteSession: "Delete session",
      deleteSessionArmed: "Tap again to delete",
      deleteSessionHint: "Deleting a session also deletes its tasting note.",
      deleteSessionFailed: "Not deleted. Try again.",
      trainingBadge: "Training",
      unrevealedBadge: "Training room · not revealed",
      unreadableWine: "a wine you can't see yet",
    });
  });

  it("fills the templated lines", () => {
    expect(continueLine("20:14")).toBe("Continue your session · started 20:14");
    expect(sheetTitle("20:14")).toBe("Unknown wine · started 20:14");
    expect(itWasLine("Château Talbot 2016")).toBe("It was Château Talbot 2016");
    expect(itWasLine(null)).toBe("It was a wine you can't see yet");
    expect(resultTotalLine(14, 22)).toBe("14 of 22");
    expect(scaleLossLine("tannin", "higher")).toBe("Tannin higher than typical");
    expect(scaleLossLine("flavourIntensity", "lower")).toBe("Flavour intensity lower than typical");
    expect(scaleLossLine("colourHue", "higher")).toBe("Colour darker than typical");
    expect(scaleLossLine("colourHue", "lower")).toBe("Colour lighter than typical");
    expect(groupLossLine("Black fruit")).toBe("Black fruit isn't typical");
    expect(signatureLine("petrol")).toBe("✓ petrol — a signature");
    expect(signaturesLine("petrol", "lime")).toBe("✓ petrol and lime — signatures");
    expect(groupsLossLine(["Herbal"])).toBe("Herbal isn't typical");
    expect(groupsLossLine(["Herbal", "Red fruit"])).toBe("Herbal and red fruit aren't typical");
    expect(groupsLossLine(["Herbal", "Floral", "Oak", "Spice"])).toBe("Herbal, floral and oak aren't typical");
    expect(reasonsLine(["✓ petrol — a signature", "Tannin higher than typical"])).toBe(
      "✓ petrol — a signature · Tannin higher than typical",
    );
  });

  it("labels the seven result rows in order and marks them", () => {
    expect(RESULT_ROW_ORDER.map((c) => RESULT_ROW_LABELS[c])).toEqual([
      "Country",
      "Region",
      "Appellation",
      "Grape",
      "Second grape",
      "Designation",
      "Vintage",
    ]);
    expect(resultMark(8)).toBe("✓");
    expect(resultMark(1)).toBe("✓"); // vintage off by one year
    expect(resultMark(0)).toBe("✗");
    expect(resultMark(null)).toBe("—");
  });
});

describe("shortName", () => {
  it("strips a leading 'A typical ' in any case", () => {
    expect(shortName("A typical Pauillac")).toBe("Pauillac");
    expect(shortName("a Typical Côte de Beaune (red)")).toBe("Côte de Beaune (red)");
  });
  it("leaves any other name alone", () => {
    expect(shortName("Pauillac")).toBe("Pauillac");
    expect(shortName("Typical Pauillac")).toBe("Typical Pauillac");
    expect(shortName("Not a typical Pauillac")).toBe("Not a typical Pauillac");
  });
});

describe("coverageLine", () => {
  it("0 countries: the empty-pool sentence", () => {
    expect(coverageLine([], 0)).toBe("No typical wines yet — the room opens once the first batch lands.");
  });
  it("1 country", () => {
    expect(coverageLine([{ name: "France", count: 15 }], 15)).toBe(
      "15 typical wines so far — France. More each week.",
    );
    expect(coverageLine([{ name: "France", count: 1 }], 1)).toBe("1 typical wine so far — France. More each week.");
  });
  it("4 countries: all named, by count then name, no 'and more'", () => {
    expect(
      coverageLine(
        [
          { name: "Spain", count: 4 },
          { name: "France", count: 20 },
          { name: "Italy", count: 4 },
          { name: "Germany", count: 2 },
        ],
        30,
      ),
    ).toBe("30 typical wines so far — France, Italy, Spain and Germany. More each week.");
  });
  it("6 countries: four named and 'and more'", () => {
    expect(
      coverageLine(
        [
          { name: "Portugal", count: 3 },
          { name: "France", count: 36 },
          { name: "Austria", count: 3 },
          { name: "Italy", count: 16 },
          { name: "Germany", count: 7 },
          { name: "Spain", count: 11 },
        ],
        76,
      ),
    ).toBe("76 typical wines so far — France, Italy, Spain, Germany and more. More each week.");
  });
});

describe("stripLine", () => {
  it("uses a 10-point window", () => {
    expect(CLOSE_WINDOW).toBe(10);
  });
  it("the leader's region and the leader, plus the other uncapped wines within 10 points", () => {
    // 91 − 85 = 6 and 91 − 81 = 10 count; 91 − 80 = 11 and the capped one do not.
    const ranked = [
      rc("margaux", 91),
      rc("cote-rotie", 85),
      rc("bandol", 81),
      rc("cdp", 80),
      rc("chablis", 15, "colour"),
    ];
    expect(stripLine(ranked)).toBe("Top match: Bordeaux · Margaux 91 % · 2 more close");
  });
  it("k = 1", () => {
    expect(stripLine([rc("margaux", 91), rc("bandol", 81), rc("cdp", 70)])).toBe(
      "Top match: Bordeaux · Margaux 91 % · 1 more close",
    );
  });
  it("k = 0: just the leader", () => {
    expect(stripLine([rc("margaux", 20), rc("chablis", 15, "colour")])).toBe("Top match: Bordeaux · Margaux 20 %");
  });
  it("names the region once when the wine is the region's own name", () => {
    expect(stripLine([rc("champagne", 88)])).toBe("Top match: Champagne 88 %");
  });
  it("a tie at the top names the list's top group, not the matcher's first wine (R4 = R3's top group)", () => {
    // rankCandidates breaks the tie by wine name (Bandol first); groupRanking
    // by country, then region, so Niederösterreich leads the list.
    const ranked = [rc("bandol", 80), rc("sancerre", 80), rc("tannin-free-white", 80)];
    expect(groupRanking(ranked)[0].region.name).toBe("Niederösterreich");
    expect(stripLine(ranked)).toBe("Top match: Niederösterreich · Tannin-free White 80 % · 2 more close");
  });
  it("a tie inside the top region names that group's best, its first wine", () => {
    const ranked = [rc("vosne", 80), rc("chablis", 80)];
    expect(groupRanking(ranked)[0].best.candidate.id).toBe("arch-vosne");
    expect(stripLine(ranked)).toBe("Top match: Bourgogne · Vosne-Romanée 80 % · 1 more close");
    expect(stripLine([rc("chablis", 80), rc("vosne", 80)])).toBe(
      "Top match: Bourgogne · Chablis 80 % · 1 more close",
    );
  });
  it("a leader with no number: the pre-answer hint", () => {
    expect(stripLine([rc("margaux", null), rc("bandol", null)])).toBe("Start describing the wine");
    expect(stripLine([])).toBe("Start describing the wine");
  });
  it("every candidate capped", () => {
    expect(stripLine([rc("chablis", 15, "colour"), rc("margaux", null, "bubbles")])).toBe(
      "Nothing fits yet — check colour and bubbles",
    );
  });
});

describe("region groups (region-guess addendum R1, R3)", () => {
  it("names a region with its country, its best wine and Show all", () => {
    expect(regionLabel({ region: { name: "Bourgogne" }, country: { name: "France" } })).toBe("Bourgogne, France");
    expect(bestLine("Chablis Premier Cru")).toBe("best: Chablis Premier Cru");
    expect(showAllRegionsLine(12)).toBe("Show all 12 regions");
  });
  it("a group row's second line is its best wine, only once there are numbers", () => {
    const [bourgogne] = groupRanking([rc("vosne", 88), rc("chablis", 70)]);
    expect(groupSubLine(bourgogne)).toBe("best: Vosne-Romanée");
    const [before] = groupRanking([rc("vosne", null), rc("chablis", null)]);
    expect(groupSubLine(before)).toBeNull();
    const [capped] = groupRanking([rc("chablis", 15, "colour")]);
    expect(groupSubLine(capped)).toBe("best: Chablis");
  });
});

describe("lineageLine", () => {
  it("a specific appellation: appellation · region, country · grapes", () => {
    expect(lineageLine(arch("margaux"))).toBe("Margaux AOC · Bordeaux, France · Cabernet Sauvignon, Merlot");
    expect(lineageLine(arch("chablis"))).toBe("Chablis AOC · Bourgogne, France · Chardonnay");
  });
  it("a regional appellation drops itself", () => {
    expect(lineageLine(arch("cote-de-nuits"))).toBe("Bourgogne, France · Pinot Noir");
    expect(lineageLine(arch("champagne"))).toBe("Champagne, France · Chardonnay, Pinot Noir");
  });
});

describe("tallyLine", () => {
  it("n of m right on the grape · k on the appellation", () => {
    expect(tallyLine({ scored: 9, grapeHits: 6, appellationHits: 4 })).toBe(
      "6 of 9 right on the grape · 4 on the appellation",
    );
  });
  it("is empty before anything is scored", () => {
    expect(tallyLine({ scored: 0, grapeHits: 0, appellationHits: 0 })).toBe("");
  });
});

describe("sessionsLine", () => {
  const none = { scored: 0, grapeHits: 0, appellationHits: 0 };
  it("says No sessions yet before any attempt", () => {
    expect(sessionsLine(false, none)).toBe("No sessions yet");
  });
  it("is empty with attempts but nothing scored (the landing renders no line)", () => {
    expect(sessionsLine(true, none)).toBe("");
  });
  it("is the tally once something is scored", () => {
    expect(sessionsLine(true, { scored: 9, grapeHits: 6, appellationHits: 4 })).toBe(
      "6 of 9 right on the grape · 4 on the appellation",
    );
  });
});

describe("percentLabel", () => {
  it("writes a space before the sign, as §9 does", () => {
    expect(percentLabel(91)).toBe("91 %");
    expect(percentLabel(0)).toBe("0 %");
  });
  it("is empty without a number", () => {
    expect(percentLabel(null)).toBe("");
  });
});

describe("vintage and 'You said'", () => {
  it("words a guess as the guess ladder does", () => {
    expect(vintageGuessLabel(null)).toBeNull();
    expect(vintageGuessLabel({ kind: "YEAR", year: 2016 })).toBe("2016");
    expect(vintageGuessLabel({ kind: "NV" })).toBe("NV");
    expect(vintageGuessLabel({ kind: "TAWNY", years: 20 })).toBe("20 years tawny");
    expect(tawnyAgeOption(20)).toBe("20 years");
  });
  it("You said {shortName}{, vintage}", () => {
    expect(youSaidLine("A typical Pauillac", null)).toBe("You said Pauillac");
    expect(youSaidLine("A typical Pauillac", { kind: "YEAR", year: 2016 })).toBe("You said Pauillac, 2016");
    expect(youSaidLine("A typical Champagne", { kind: "NV" })).toBe("You said Champagne, NV");
  });
  it("You said {region} · {grape}{, vintage} for a pick that stopped at the region", () => {
    expect(youSaidRegionLine("Bourgogne", "Chardonnay", null)).toBe("You said Bourgogne · Chardonnay");
    expect(youSaidRegionLine("Bourgogne", null, null)).toBe("You said Bourgogne");
    expect(youSaidRegionLine("Bourgogne", "Pinot Noir", { kind: "YEAR", year: 2019 })).toBe(
      "You said Bourgogne · Pinot Noir, 2019",
    );
  });
  it("pickSaidLine words each kind of pick (R8)", () => {
    const none = { picked: null, pickedRegion: null, pickedGrape: null };
    const bourgogne = { id: "region-bgn", name: "Bourgogne" };
    const nv = { kind: "NV" } as const;
    expect(pickSaidLine({ ...none, picked: { id: "a", name: "A typical Chablis Premier Cru" } }, nv)).toBe(
      "You said Chablis Premier Cru, NV",
    );
    expect(pickSaidLine({ ...none, pickedRegion: bourgogne, pickedGrape: { id: "g", name: "Chardonnay" } }, null)).toBe(
      "You said Bourgogne · Chardonnay",
    );
    expect(pickSaidLine({ ...none, pickedRegion: bourgogne }, nv)).toBe("You said Bourgogne, NV");
    expect(pickSaidLine(none, nv)).toBe("You didn't pick a wine");
  });
});

describe("cap reasons", () => {
  it("colour names both colours, with the right article", () => {
    expect(capReasonLine("colour", { noteColour: "RED", candidateColour: "WHITE" })).toBe(
      "Looks like a red wine, not a white",
    );
    expect(capReasonLine("colour", { noteColour: "WHITE", candidateColour: "ROSE" })).toBe(
      "Looks like a white wine, not a rosé",
    );
    expect(capReasonLine("colour", { noteColour: "RED", candidateColour: "ORANGE" })).toBe(
      "Looks like a red wine, not an orange",
    );
    // BROWN names no colour (it caps only a rosé).
    expect(capReasonLine("colour", { noteColour: null, candidateColour: "ROSE" })).toBe(
      "Looks like a white or red wine, not a rosé",
    );
  });
  it("bubbles and fortification read the direction from the candidate's style", () => {
    expect(capReasonLine("bubbles", { noteColour: null, candidateColour: "RED", candidateStyle: "STILL" })).toBe(
      "Bubbles noted",
    );
    expect(
      capReasonLine("bubbles", { noteColour: null, candidateColour: "WHITE", candidateStyle: "SPARKLING" }),
    ).toBe("No bubbles noted");
    expect(capReasonLine("fortified", { noteColour: null, candidateColour: "RED", candidateStyle: "STILL" })).toBe(
      "Fortified",
    );
    expect(
      capReasonLine("fortified", { noteColour: null, candidateColour: "RED", candidateStyle: "FORTIFIED" }),
    ).toBe("Not fortified");
  });
});

describe("styleVerdictLine", () => {
  // The real wine's archetype beside the note's colour; only a capped verdict reads it.
  const CTX: Parameters<typeof styleVerdictLine>[1] = {
    noteColour: "RED",
    candidateColour: "RED",
    candidateStyle: "STILL",
  };
  it("rank of n at pct", () => {
    expect(styleVerdictLine({ rank: 2, n: 17, pct: 92, capped: null }, CTX)).toBe(
      "Its style was your #2 of 17 at 92 %",
    );
    expect(styleVerdictLine({ rank: 9, n: 17, pct: null, capped: null }, CTX)).toBe("Its style was your #9 of 17");
  });
  it("ruled out, with a §9 cap reason — never a bare word", () => {
    expect(
      styleVerdictLine(
        { rank: 16, n: 17, pct: 15, capped: "colour" },
        { noteColour: "RED", candidateColour: "WHITE", candidateStyle: "STILL" },
      ),
    ).toBe("You had ruled its style out (Looks like a red wine, not a white)");
    expect(
      styleVerdictLine(
        { rank: 16, n: 17, pct: 15, capped: "bubbles" },
        { noteColour: null, candidateColour: "WHITE", candidateStyle: "SPARKLING" },
      ),
    ).toBe("You had ruled its style out (No bubbles noted)");
    expect(
      styleVerdictLine(
        { rank: 17, n: 17, pct: 15, capped: "fortified" },
        { noteColour: null, candidateColour: "RED", candidateStyle: "FORTIFIED" },
      ),
    ).toBe("You had ruled its style out (Not fortified)");
  });
  it("not in the pool", () => {
    expect(styleVerdictLine(null, CTX)).toBe("This style isn't in the pool yet");
  });
});

describe("hueClearedLine", () => {
  it("names the hue as the sheet words it and the wine's colour", () => {
    expect(hueClearedLine("RUBY", "WHITE")).toBe("Your colour call (ruby) didn't fit — it was a white wine.");
    expect(hueClearedLine("LEMON_GREEN", "ORANGE")).toBe(
      "Your colour call (lemon-green) didn't fit — it was an orange wine.",
    );
  });
});

describe("dates", () => {
  it("24 Sep and 20:14 in the given zone", () => {
    expect(shortDate("2026-09-24T18:14:00.000Z", "UTC")).toBe("24 Sep");
    expect(clockTime("2026-09-24T18:14:00.000Z", "UTC")).toBe("18:14");
    expect(clockTime("2026-09-24T18:14:00.000Z", "Europe/Copenhagen")).toBe("20:14");
    // Just before midnight UTC is the next day in Copenhagen.
    expect(shortDate("2026-09-24T23:30:00.000Z", "Europe/Copenhagen")).toBe("25 Sep");
    expect(clockTime("2026-01-05T07:05:00.000Z", "UTC")).toBe("07:05");
  });
});
