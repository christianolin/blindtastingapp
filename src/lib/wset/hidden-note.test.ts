import { describe, expect, it } from "vitest";
import { HIDDEN_NOTE_HINT, canNoteHiddenGlass, hiddenNoteTitle, hueGroupsFor } from "./hidden-note";
import { makeT, uiStrings } from "./i18n";

describe("hidden-glass notes (B8)", () => {
  it("offered to eligible guessers on an unrevealed glass of a running tasting", () => {
    expect(canNoteHiddenGlass({ status: "IN_PROGRESS", isRevealed: false, eligible: true })).toBe(true);
    expect(canNoteHiddenGlass({ status: "OPEN", isRevealed: false, eligible: true })).toBe(true);
    expect(canNoteHiddenGlass({ status: "IN_PROGRESS", isRevealed: true, eligible: true })).toBe(false);
    expect(canNoteHiddenGlass({ status: "IN_PROGRESS", isRevealed: false, eligible: false })).toBe(false);
    expect(canNoteHiddenGlass({ status: "DRAFT", isRevealed: false, eligible: true })).toBe(false);
    expect(canNoteHiddenGlass({ status: "CLOSED", isRevealed: false, eligible: true })).toBe(false);
  });
  it("the title", () => {
    expect(hiddenNoteTitle("Nebbiolo vs Sangiovese", "Glass 3")).toBe("Nebbiolo vs Sangiovese · Glass 3");
  });
  it("hue groups: the wine's own family, or every family when unknown", () => {
    expect(hueGroupsFor("RED")).toEqual([{ family: "RED", hues: ["PURPLE", "RUBY", "GARNET", "TAWNY", "BROWN"] }]);
    expect(hueGroupsFor(null).map((g) => g.family)).toEqual(["WHITE", "ROSE", "RED"]);
  });
  it("the hint exists in English and Danish", () => {
    expect(makeT("en")(HIDDEN_NOTE_HINT)).toBe("Only you can read this until the glass is revealed. Then it attaches to the wine.");
    expect(uiStrings("da")[HIDDEN_NOTE_HINT]).toBe("Kun du kan læse den, indtil glasset afsløres. Så knyttes den til vinen.");
  });
});
