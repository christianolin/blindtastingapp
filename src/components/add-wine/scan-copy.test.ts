import { describe, expect, it } from "vitest";
import {
  addedWhere,
  chooserEyebrow,
  confidenceChip,
  consumeLabel,
  flightHintSubtitle,
  flightNote,
  parseVintageYear,
  pendingProblemLabel,
  primaryAddLabel,
  shouldStackPending,
} from "./scan-copy";

describe("shouldStackPending", () => {
  it("stacks a 7d Fix row only for 'scan the next' on an unread vintage with no match", () => {
    expect(shouldStackPending(true, { vintagePrompt: true }, 0)).toBe(true);
  });
  it("never stacks from the primary button, a read vintage, or a catalog match", () => {
    expect(shouldStackPending(false, { vintagePrompt: true }, 0)).toBe(false);
    expect(shouldStackPending(true, { vintagePrompt: false }, 0)).toBe(false);
    expect(shouldStackPending(true, { vintagePrompt: undefined }, 0)).toBe(false);
    expect(shouldStackPending(true, { vintagePrompt: true }, 2)).toBe(false);
  });
});

describe("confidenceChip", () => {
  it("maps the three read confidences to the 7c chip copy", () => {
    expect(confidenceChip("high")).toEqual({ label: "READ OK", tone: "ok" });
    expect(confidenceChip("medium")).toEqual({ label: "CHECK THE READ", tone: "check" });
    expect(confidenceChip("low")).toEqual({ label: "HARD TO READ", tone: "hard" });
  });
});

describe("primaryAddLabel", () => {
  it("names the destination", () => {
    expect(
      primaryAddLabel({
        kind: "flight",
        tastingId: "t",
        tastingName: "Nebbiolo vs Sangiovese",
        revealMode: "BLIND",
        wineSource: "HOST_PROVIDES",
        position: 4,
      }),
    ).toBe("Add as glass 4");
    expect(primaryAddLabel({ kind: "cellar" })).toBe("Add to cellar");
    expect(primaryAddLabel({ kind: "catalog" })).toBe("Add to the catalog");
    // Taste & rate adds nothing: the pick opens the wine's note.
    expect(primaryAddLabel({ kind: "rate" })).toBe("Rate this wine");
  });
});

describe("consumeLabel", () => {
  it("draws the bottle down when poured into a flight", () => {
    expect(consumeLabel(null)).toBe("Take it out of the cellar when we pour it");
    expect(
      consumeLabel({
        kind: "flight",
        tastingId: "t",
        tastingName: "Nebbiolo vs Sangiovese",
        revealMode: "BLIND",
        wineSource: "HOST_PROVIDES",
        position: 4,
      }),
    ).toBe("Take it out of the cellar when we pour it");
  });
  it("draws it down when the note is saved for a rate pick", () => {
    expect(consumeLabel({ kind: "rate" })).toBe(
      "Take a bottle out of the cellar when I save the note",
    );
  });
});

describe("flightNote", () => {
  const flight = {
    kind: "flight" as const,
    tastingId: "t",
    tastingName: "Nebbiolo vs Sangiovese",
    revealMode: "BLIND" as const,
    wineSource: "HOST_PROVIDES" as const,
    position: 4,
  };
  it("tells the host who sees the answer, with the glass number", () => {
    expect(flightNote(flight)).toBe(
      "Only you see this until the reveal. Tasters see “glass 4”.",
    );
  });
  it("drops the glass clause for a bring-your-own bottle", () => {
    expect(flightNote({ ...flight, wineSource: "PARTICIPANT_CONTRIBUTED" })).toBe(
      "Only you see this until the reveal.",
    );
  });
  it("tells the truth for semi-blind: the candidate list is public, the glass is not", () => {
    const semi = "Tasters see this wine on the candidate list, but not which glass it is.";
    expect(flightNote({ ...flight, revealMode: "SEMI_BLIND" })).toBe(semi);
    expect(
      flightNote({
        ...flight,
        revealMode: "SEMI_BLIND",
        wineSource: "PARTICIPANT_CONTRIBUTED",
      }),
    ).toBe(semi);
  });
  it("says nothing when the wine is not hidden, or the destination is not a flight", () => {
    expect(flightNote({ ...flight, revealMode: "OPEN" })).toBeNull();
    expect(flightNote({ kind: "cellar" })).toBeNull();
    expect(flightNote({ kind: "catalog" })).toBeNull();
    expect(flightNote({ kind: "rate" })).toBeNull();
    expect(flightNote(null)).toBeNull();
  });
});

describe("chooserEyebrow / flightHintSubtitle", () => {
  it("names the source of the read", () => {
    expect(chooserEyebrow(1)).toBe("Found in the catalog");
    expect(chooserEyebrow(0)).toBe("Read from the label");
  });
  it("describes tonight's tasting", () => {
    expect(flightHintSubtitle({ tastingName: "Nebbiolo vs Sangiovese", live: true })).toBe(
      "Nebbiolo vs Sangiovese, live now",
    );
    expect(flightHintSubtitle({ tastingName: "Thursday blind", live: false })).toBe(
      "Thursday blind, next up",
    );
  });
});

describe("addedWhere / pendingProblemLabel", () => {
  it("labels a stacked row by where it landed", () => {
    expect(addedWhere({ destination: "flight", glass: 4 })).toBe("glass 4");
    expect(addedWhere({ destination: "cellar" })).toBe("in cellar");
    expect(addedWhere({ destination: "catalog" })).toBe("in the catalog");
  });
  it("names the fix a pending scan needs", () => {
    expect(pendingProblemLabel("no-vintage")).toBe("no vintage read");
    expect(pendingProblemLabel("incomplete")).toBe("needs details");
  });
});

describe("parseVintageYear", () => {
  it("accepts a plausible four-digit year", () => {
    expect(parseVintageYear("2018", 2026)).toBe(2018);
    expect(parseVintageYear(" 1961 ", 2026)).toBe(1961);
    expect(parseVintageYear("2027", 2026)).toBe(2027);
  });
  it("rejects blanks, partial years and impossible ones", () => {
    expect(parseVintageYear("", 2026)).toBeNull();
    expect(parseVintageYear("18", 2026)).toBeNull();
    expect(parseVintageYear("1850", 2026)).toBeNull();
    expect(parseVintageYear("2030", 2026)).toBeNull();
    expect(parseVintageYear("twenty", 2026)).toBeNull();
  });
});
