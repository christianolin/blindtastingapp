import { describe, expect, it } from "vitest";
import {
  FINAL_STANDINGS, GLASS_BY_GLASS, LINK_COPIED, SEE_EVERY_WINE, agreedLeastLine, bestGlassLines, excludedLines,
  glassTitle, hostedLines, legendLabels, placingLines, resultEyebrow, shareLabel, shareText, shortWineName, strongestLines,
} from "./result-copy";

describe("the placing (S12, S12b)", () => {
  it("blind and semi-blind", () => {
    expect(placingLines({ mode: "BLIND", rank: 2, tied: false, competitors: 7, score: 93, maximum: 180 }))
      .toEqual({ ordinal: "2nd", line: "of 7 · 93 of 180 points" });
    expect(placingLines({ mode: "SEMI_BLIND", rank: 1, tied: true, competitors: 5, score: 4, maximum: 6 }))
      .toEqual({ ordinal: "=1st", line: "of 5 · 4 of 6 matched" });
    expect(resultEyebrow("Nebbiolo vs Sangiovese")).toBe("Nebbiolo vs Sangiovese · finished");
  });
  it("a host-provides host", () => {
    expect(hostedLines({ winners: ["Maja"], points: 27, mode: "BLIND" })).toEqual({ title: "You hosted", line: "Maja won with 27 points" });
    expect(hostedLines({ winners: ["Maja", "Gustav"], points: 27, mode: "BLIND" }).line).toBe("Maja and Gustav shared first with 27 points");
    expect(hostedLines({ winners: ["Maja", "Gustav", "Ida"], points: 4, mode: "SEMI_BLIND" }).line).toBe("Maja, Gustav and Ida shared first with 4 matches");
  });
});

describe("the cards", () => {
  it("best glass and strongest attribute", () => {
    expect(bestGlassLines({ points: 26, max: 30, glass: 6, name: "Le Pergole Torte" })).toEqual({ score: "26 / 30", name: "Glass 6 · Le Pergole Torte" });
    expect(strongestLines({ category: "primary_grape", hits: 4, inPlay: 6 })).toEqual({ title: "Grapes right", detail: "4 of 6", caption: "your best category" });
    expect(strongestLines({ category: "type_designation", hits: 1, inPlay: 1 }).title).toBe("Designations right");
    expect(strongestLines({ category: "secondary_grape", hits: 1, inPlay: 2 }).title).toBe("Second grapes right");
  });
});

describe("the agreed-least line", () => {
  const title = "Gustav's Brunello di Montalcino";
  it("said, got and none", () => {
    expect(agreedLeastLine({ glass: 4, title, mode: "BLIND", sentence: { kind: "said", pickId: "g", count: 5, outOf: 7 }, pickLabel: "Nebbiolo" }))
      .toBe("Glass 4 — Gustav's Brunello di Montalcino. Five of seven said Nebbiolo.");
    expect(agreedLeastLine({ glass: 4, title, mode: "BLIND", sentence: { kind: "got", pickId: "g", hits: 2, outOf: 7 }, pickLabel: "Sangiovese" }))
      .toBe("Glass 4 — Gustav's Brunello di Montalcino. Two of seven got the grape.");
    expect(agreedLeastLine({ glass: 4, title, mode: "SEMI_BLIND", sentence: { kind: "got", pickId: "k", hits: 3, outOf: 12 }, pickLabel: "x" }))
      .toBe("Glass 4 — Gustav's Brunello di Montalcino. Three of 12 got it.");
    expect(agreedLeastLine({ glass: 4, title, mode: "BLIND", sentence: { kind: "said", pickId: "g", count: 11, outOf: 12 }, pickLabel: "Nebbiolo" }))
      .toBe("Glass 4 — Gustav's Brunello di Montalcino. 11 of 12 said Nebbiolo.");
    expect(agreedLeastLine({ glass: 4, title, mode: "BLIND", sentence: { kind: "none", outOf: 7 }, pickLabel: null }))
      .toBe("Glass 4 — Gustav's Brunello di Montalcino.");
  });
  it("titles and short names", () => {
    expect(glassTitle({ wineSource: "PARTICIPANT_CONTRIBUTED", contributor: "Gustav", shortName: "Brunello di Montalcino" })).toBe(title);
    expect(glassTitle({ wineSource: "HOST_PROVIDES", contributor: null, shortName: "Le Pergole Torte" })).toBe("Le Pergole Torte");
    expect(shortWineName({ wineName: "Le Pergole Torte", appellation: "Toscana IGT", producer: "Montevertine" })).toBe("Le Pergole Torte");
    expect(shortWineName({ wineName: null, appellation: "Barbaresco DOCG", producer: "Produttori del Barbaresco" })).toBe("Barbaresco");
    expect(shortWineName({ wineName: null, appellation: "Saint-Émilion Grand Cru AOP", producer: "x" })).toBe("Saint-Émilion Grand Cru");
    expect(shortWineName({ wineName: null, appellation: null, producer: "Montevertine" })).toBe("Montevertine");
  });
});

describe("excluded glasses", () => {
  it.each([
    [[{ glass: 5, reason: "unrevealed" }], ["Glass 5 was never revealed"]],
    [[{ glass: 5, reason: "unrevealed" }, { glass: 6, reason: "no_answer_key" }], ["Glasses 5 and 6 were never revealed"]],
    [[{ glass: 4, reason: "half_revealed" }], ["Glass 4 was only partly revealed"]],
    [[{ glass: 4, reason: "unrevealed" }, { glass: 5, reason: "unrevealed" }, { glass: 6, reason: "unrevealed" }], ["Glasses 4, 5 and 6 were never revealed"]],
    [[{ glass: 3, reason: "half_revealed" }, { glass: 4, reason: "half_revealed" }, { glass: 6, reason: "unrevealed" }],
      ["Glasses 3 and 4 were only partly revealed", "Glass 6 was never revealed"]],
  ] as const)("%j", (glasses, lines) => expect(excludedLines(glasses)).toEqual(lines));
});

describe("share", () => {
  it("text and labels", () => {
    expect(shareText({ kind: "placed", mode: "BLIND", ordinal: "2nd", competitors: 7, tasting: "Nebbiolo vs Sangiovese", score: 93, maximum: 180 }))
      .toBe("2nd of 7 at Nebbiolo vs Sangiovese — 93 of 180 points");
    expect(shareText({ kind: "placed", mode: "SEMI_BLIND", ordinal: "1st", competitors: 5, tasting: "Six Nebbiolos", score: 4, maximum: 6 }))
      .toBe("1st of 5 at Six Nebbiolos — 4 of 6 matched");
    expect(shareText({ kind: "hosted", tasting: "Nebbiolo vs Sangiovese", winners: ["Maja"] })).toBe("Nebbiolo vs Sangiovese — Maja won");
    expect(shareLabel({ phone: true })).toBe("Share the result");
    expect(shareLabel({ phone: false })).toBe("Share");
    expect(LINK_COPIED).toBe("Link copied");
    expect(SEE_EVERY_WINE).toBe("See every wine");
    expect(FINAL_STANDINGS).toBe("Final standings");
    expect(GLASS_BY_GLASS).toBe("Glass by glass");
    expect(legendLabels({ phone: false })).toEqual({ hit: "you had it", miss: "you missed" });
    expect(legendLabels({ phone: true })).toEqual({ hit: "had it", miss: "missed" });
  });
});

describe("edges beyond the drawn flight", () => {
  it("one point or match reads singular; no winner leaves the line empty; tied winners share", () => {
    expect(hostedLines({ winners: ["Maja"], points: 1, mode: "BLIND" }).line).toBe("Maja won with 1 point");
    expect(hostedLines({ winners: ["Maja"], points: 1, mode: "SEMI_BLIND" }).line).toBe("Maja won with 1 match");
    expect(hostedLines({ winners: [], points: 0, mode: "BLIND" })).toEqual({ title: "You hosted", line: "" });
    expect(shareText({ kind: "hosted", tasting: "Six Nebbiolos", winners: ["Maja", "Gustav"] })).toBe("Six Nebbiolos — Maja and Gustav won");
  });
  it("names: a one-word appellation stays whole; blank parts fall through", () => {
    expect(shortWineName({ wineName: null, appellation: "Barolo", producer: "Vietti" })).toBe("Barolo");
    expect(shortWineName({ wineName: "  ", appellation: "Rioja DOCa", producer: "x" })).toBe("Rioja");
    expect(glassTitle({ wineSource: "PARTICIPANT_CONTRIBUTED", contributor: null, shortName: "Barolo" })).toBe("Barolo");
    expect(glassTitle({ wineSource: "PARTICIPANT_CONTRIBUTED", contributor: "Gustav", shortName: "" })).toBe("Gustav's wine");
    expect(agreedLeastLine({ glass: 2, title: "Fèlsina", mode: "SEMI_BLIND", sentence: { kind: "said", pickId: "k", count: 3, outOf: 5 }, pickLabel: null }))
      .toBe("Glass 2 — Fèlsina.");
  });
  it("partly revealed glasses are named before never-revealed ones, whatever the list order", () => {
    expect(excludedLines([{ glass: 2, reason: "unrevealed" }, { glass: 5, reason: "half_revealed" }]))
      .toEqual(["Glass 5 was only partly revealed", "Glass 2 was never revealed"]);
    expect(excludedLines([])).toEqual([]);
  });
});
