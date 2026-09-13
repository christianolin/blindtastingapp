import { describe, expect, it } from "vitest";
import {
  INTRO_SENTENCE, LOCKED_EDIT_REFUSAL, OFTEN_SUFFIX, VINTAGE_EMPTY, VINTAGE_LABEL,
  everythingElseHeading, formatCount, introHeading, laptopEyebrow, lockButtonText, lockFooterText,
  lockedCountShort, lockedInRosterHeading, phoneLadderTitle, rankChipLabel, searchPlaceholder, shortlistHeading,
  stakeLine, standingsAfterHeading, waitingTail,
} from "./ladder-copy";

describe("ladder copy (S8, S8b)", () => {
  it("intro, stake, vintage", () => {
    expect(introHeading(3)).toBe("What is in glass 3?");
    expect(INTRO_SENTENCE).toBe("Each row saves as you answer it. Skip anything you cannot call.");
    expect(stakeLine(10, { phone: false })).toBe("10 / 30 at stake");
    expect(stakeLine(10, { phone: true })).toBe("10 / 30 pts at stake");
    expect(VINTAGE_LABEL).toBe("Vintage · 1 pt if a year out");
    expect(VINTAGE_EMPTY).toBe("Year, NV or tawny — or skip");
  });
  it("rank chip (PLAY-07)", () => {
    expect(rankChipLabel({ rank: 2, tied: false, competitors: 7, points: 14 }, { phone: false })).toBe("2nd of 7 · 14 pts");
    expect(rankChipLabel({ rank: 2, tied: false, competitors: 7, points: 14 }, { phone: true })).toBe("2nd · 14 pts");
    expect(rankChipLabel({ rank: 2, tied: true, competitors: 7, points: 14 }, { phone: false })).toBe("=2nd of 7 · 14 pts");
  });
  it("lock, eyebrow and the rail", () => {
    expect(lockButtonText(3)).toBe("Lock in glass 3");
    expect(lockFooterText({ phone: false })).toBe("Saved as you go. Locking stops edits and tells the table you are ready.");
    expect(lockFooterText({ phone: true })).toBe("Saved as you go. Locking stops edits and shows the others you are ready.");
    expect(LOCKED_EDIT_REFUSAL).toBe("Change it first — this glass is locked in.");
    expect(laptopEyebrow("Christian")).toBe("Live · Christian is hosting");
    expect(phoneLadderTitle("Nebbiolo vs Sangiovese", "BLIND")).toBe("Nebbiolo vs Sangiovese · blind");
    expect(lockedCountShort(5, 7)).toBe("5 of 7 locked");
    expect(standingsAfterHeading(2)).toBe("Standings after glass 2");
    expect(lockedInRosterHeading(5, 7)).toBe("5 of 7 locked in");
  });
});

describe("picker copy (S9)", () => {
  it("counts and placeholders", () => {
    expect([formatCount(57), formatCount(1240), formatCount(33741)]).toEqual(["57", "1,240", "33,741"]);
    expect(searchPlaceholder("primary_grape", 1240, { phone: true })).toBe("Search 1,240 grapes");
    expect(searchPlaceholder("primary_grape", 1240, { phone: false })).toBe("Type to search all 1,240 grapes");
    expect(searchPlaceholder("producer", 33741, { phone: true })).toBe("Search 33,741 producers");
    expect(searchPlaceholder("appellation", 3282, { phone: false })).toBe("Type to search all 3,282 appellations");
    expect(everythingElseHeading(1240)).toBe("Everything else · all 1,240");
    expect(OFTEN_SUFFIX).toBe(" · you guess this often");
    expect(shortlistHeading("Piedmont")).toBe("Common grapes in Piedmont");
  });
});

describe("waiting (S10, S10b)", () => {
  it("the tail", () => {
    expect(waitingTail(null)).toBe("The reveal starts when everyone is in — or when the host moves on.");
    expect(waitingTail("Christian")).toBe("The reveal starts when everyone is in, or when Christian moves on.");
  });
  it("a blank host name reads as the host", () => {
    expect(waitingTail("  ")).toBe("The reveal starts when everyone is in — or when the host moves on.");
  });
});

describe("edges", () => {
  it("one point is singular, as the picker pill already says (plan copy)", () => {
    expect(rankChipLabel({ rank: 1, tied: false, competitors: 7, points: 1 }, { phone: true })).toBe("1st · 1 pt");
    expect(rankChipLabel({ rank: 11, tied: true, competitors: 12, points: 0 }, { phone: false })).toBe("=11th of 12 · 0 pts");
  });
  it("every field names its own noun", () => {
    const fields = ["country", "region", "appellation", "primary_grape", "secondary_grape", "producer", "type_designation", "vintage"] as const;
    expect(fields.map((f) => searchPlaceholder(f, 128, { phone: true }))).toEqual([
      "Search 128 countries", "Search 128 regions", "Search 128 appellations", "Search 128 grapes",
      "Search 128 grapes", "Search 128 producers", "Search 128 designations", "Search 128 vintages",
    ]);
  });
  it("the phone title follows the mode word", () => {
    expect(phoneLadderTitle("Nebbiolo vs Sangiovese", "SEMI_BLIND")).toBe("Nebbiolo vs Sangiovese · semi-blind");
    expect(phoneLadderTitle("Nebbiolo vs Sangiovese", "OPEN")).toBe("Nebbiolo vs Sangiovese");
  });
});
