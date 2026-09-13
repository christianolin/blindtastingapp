import { describe, expect, it } from "vitest";
import {
  LIST_BODY, LIST_FOOTNOTE, LOCK_ONLY_THIS, NOT_POURED, POOL_SWAP_NOTE, REVEALED_WINE_REFUSAL, YOUR_BOTTLE,
  beforeStartLine, boardEyebrow, candidateLabel, chooseFirst, emptyRowText, footerLine, listEyebrow, listTitle,
  THE_BOTTLES, THE_GLASSES, listOpensAtStart, lockedHolderLabel, matchRefusalSentence, matchedPill, pendingLine,
  poolHelperLines, poolNoteLines, revealResult, revealedRowText, stillUnassigned, unassignedHeading,
} from "./semi-blind-copy";
import type { CandidateCard } from "./semi-blind-candidates";

const c = (key: string, producer: string, grape: string | null, wineName: string | null = null): CandidateCard => ({
  key, producer, wineName, vintage: { kind: "YEAR", year: 2016, tawnyYears: null }, vintageLabel: "2016", appellation: null, grape,
});

describe("the list (SB1)", () => {
  it("copy", () => {
    expect(listEyebrow("Christian")).toBe("Semi-blind · Christian is hosting");
    expect(listTitle(6)).toBe("Tonight's six wines");
    expect(listTitle(12)).toBe("Tonight's 12 wines");
    expect(listOpensAtStart("Christian")).toBe("The list of tonight's wines opens when Christian starts.");
    expect(LIST_BODY).toBe("These are the bottles on the table. You will not be told which glass is which — that is what you work out.");
    expect(LIST_FOOTNOTE).toBe("Listed alphabetically by producer. Never in pouring order — position in this list would otherwise be the answer.");
    expect(beforeStartLine("Christian")).toBe("Glass 1 is poured when Christian starts.");
    expect(pendingLine(0)).toBeNull();
    expect(pendingLine(1)).toBe("1 wine still being added");
    expect(pendingLine(2)).toBe("2 wines still being added");
  });
});

describe("the board (SB2, SB3)", () => {
  it("header, rows, footer, refusals", () => {
    expect(boardEyebrow({ phone: true, host: "Christian", pouredGlass: 3 })).toBe("Semi-blind · glass 3 poured");
    expect(boardEyebrow({ phone: false, host: "Christian", pouredGlass: 3 })).toBe("Live · semi-blind · Christian is hosting");
    expect(matchedPill(3, 6)).toBe("3 of 6 matched");
    expect(THE_GLASSES).toBe("The glasses");
    expect(THE_BOTTLES).toBe("The bottles");
    expect(stillUnassigned(4)).toBe("4 still unassigned");
    expect(unassignedHeading(3)).toBe("Still unassigned · 3 wines");
    expect(unassignedHeading(1)).toBe("Still unassigned · 1 wine");
    expect(emptyRowText({ phone: true })).toBe("Tap to choose");
    expect(emptyRowText({ phone: false })).toBe("Drop a wine here, or click to choose");
    expect(NOT_POURED).toBe("Not poured yet");
    expect(YOUR_BOTTLE).toBe("Your bottle");
    expect(lockedHolderLabel(2)).toBe("Glass 2 · locked");
    expect(revealedRowText({ glass: 2, producer: "Vietti", vintageLabel: "2017" })).toBe("Glass 2 was Vietti 2017");
    expect(footerLine("Christian", { phone: true })).toBe("Change anything until Christian reveals. Nothing is scored before then.");
    expect(footerLine("Christian", { phone: false })).toBe(
      "Every assignment stays changeable until Christian reveals that glass. Locking a glass only closes that one.",
    );
    expect(LOCK_ONLY_THIS).toBe("Locking only this glass. The rest stay open.");
    expect(chooseFirst(3)).toBe("Choose a wine for glass 3 first.");
    expect(REVEALED_WINE_REFUSAL).toBe("That wine has been revealed.");
    expect(candidateLabel(c("k", "Vietti", null, "Barolo Castiglione"))).toBe("Vietti, Barolo Castiglione 2016");
    expect(candidateLabel(c("k", "Vietti", null))).toBe("Vietti 2016");
  });
  it("the pool helper names a grape only when two cards share it", () => {
    expect(POOL_SWAP_NOTE).toBe("Assigning one that sits on another glass swaps the two; revealed wines leave the list entirely.");
    expect(poolHelperLines([c("a", "A", "Nebbiolo"), c("b", "B", "Nebbiolo"), c("d", "D", "Sangiovese")])).toEqual([
      "Producer alone is not enough — two of these are Nebbiolo, so the wine and the vintage have to be on the label too.",
      POOL_SWAP_NOTE,
    ]);
    expect(poolHelperLines([c("a", "A", "Nebbiolo"), c("d", "D", "Sangiovese")])).toEqual([POOL_SWAP_NOTE]);
  });
});

describe("matchRefusalSentence (BT-S2)", () => {
  const ctx = {
    glassNumberOf: (id: string) => (id === "w2" ? 2 : null),
    candidateKey: "k1",
    revealedKeys: new Set(["k9"]),
    lockedIn: "LOCKED-IN",
  };
  it("maps each refusal", () => {
    expect(matchRefusalSentence({ message: "glass locked", detail: "w2" }, ctx)).toBe("Glass 2 · locked");
    expect(matchRefusalSentence({ message: "glass locked", detail: "gone" }, ctx)).toBe("Glass locked.");
    expect(matchRefusalSentence({ message: "that wine is not in your pool" }, { ...ctx, candidateKey: "k9" })).toBe(REVEALED_WINE_REFUSAL);
    expect(matchRefusalSentence({ message: "that wine is not in your pool" }, ctx)).toBe("That wine is not in your pool.");
    expect(matchRefusalSentence({ message: "this glass is locked in" }, ctx)).toBe("LOCKED-IN");
    expect(matchRefusalSentence({ message: "matching is closed" }, ctx)).toBe("Matching is closed.");
  });
});

describe("the reveal (SB4)", () => {
  it("result lines and the pool note", () => {
    expect(revealResult({ hit: true, pickLabel: null, mine: 2, revealed: 3 })).toEqual({ title: "You had it", detail: "+1 · 2 of 3 so far" });
    expect(revealResult({ hit: false, pickLabel: "Vietti, Barolo Castiglione", mine: 1, revealed: 3 }))
      .toEqual({ title: "You said Vietti, Barolo Castiglione", detail: "0 · 1 of 3 so far" });
    expect(revealResult({ hit: false, pickLabel: null, mine: 1, revealed: 3 }))
      .toEqual({ title: "You did not match this glass", detail: "0 · 1 of 3 so far" }); // (plan copy)
    expect(poolNoteLines([c("a", "A", "Nebbiolo"), c("b", "B", "Nebbiolo")])).toEqual([
      "Two Nebbiolo wines still in the pool.",
      "Wines already revealed are gone from the list — that is why a late glass is easier than an early one.",
    ]);
    expect(poolNoteLines([c("a", "A", "Nebbiolo")])).toEqual([
      "Wines already revealed are gone from the list — that is why a late glass is easier than an early one.",
    ]);
  });
});

// Beyond the plan's cases.
describe("edges", () => {
  const ctx = { glassNumberOf: (id: string) => (id === "w2" ? 2 : null), candidateKey: "k1", revealedKeys: new Set<string>(), lockedIn: "LOCKED-IN" };
  it("a PostgrestError's `details` names the locked holder; other RPC sentences are capitalised once", () => {
    expect(matchRefusalSentence({ message: "glass locked", details: "w2" }, ctx)).toBe("Glass 2 · locked");
    expect(matchRefusalSentence({ message: "you cannot match this glass" }, ctx)).toBe("You cannot match this glass.");
    expect(matchRefusalSentence({ message: "Matching is closed." }, ctx)).toBe("Matching is closed.");
  });
  it("one wine, and a phone board with no pour pointer", () => {
    expect(listTitle(1)).toBe("Tonight's one wine");
    expect(boardEyebrow({ phone: true, host: "Christian", pouredGlass: null })).toBe("Semi-blind · Christian is hosting");
  });
  it("the shared grape: folded names group, ties go to the folded name", () => {
    expect(poolHelperLines([c("a", "A", "Sangiovese"), c("b", "B", "Nebbiolo"), c("d", "D", "Sangiovese"), c("e", "E", "nebbiolo")])[0])
      .toBe("Producer alone is not enough — two of these are Nebbiolo, so the wine and the vintage have to be on the label too.");
    expect(poolNoteLines([c("a", "A", "Mencía"), c("b", "B", "Mencia"), c("d", "D", "Mencía")])[0]).toBe("Three Mencía wines still in the pool.");
  });
  it("labels drop missing parts", () => {
    expect(candidateLabel({ producer: "Vietti", wineName: "Barolo", vintageLabel: "" })).toBe("Vietti, Barolo");
    expect(revealedRowText({ glass: 4, producer: "Vietti", vintageLabel: "" })).toBe("Glass 4 was Vietti");
  });
});
