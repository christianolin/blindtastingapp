import { describe, expect, it } from "vitest";
import {
  BRING_A_GLASS,
  LEARN_LINKS,
  OVERVIEW_EYEBROW,
  SCORING_ROWS,
  atTheTableLabel,
  guestEyebrow,
  hostRecordLine,
  invitationCardEyebrow,
  invitedYouLine,
  joinedNamesLine,
  modeChip,
  overviewScoringLine,
  scoringSentence,
  tonightLines,
  waitingLines,
} from "./invitation-copy";

describe("the host and the table (S5, S5b)", () => {
  it("host record", () => {
    expect(hostRecordLine(12, 18.4)).toBe("12 tastings hosted · 18.4 average");
    expect(hostRecordLine(3, 20)).toBe("3 tastings hosted · 20.0 average");
    expect(hostRecordLine(1, null)).toBe("1 tasting hosted");
    expect(invitedYouLine("Christian")).toBe("Christian invited you");
  });
  it.each([
    [[], null],
    [["Gustav"], "Gustav is in"],
    [["Gustav", "Anders"], "Gustav and Anders are in"],
    [["Gustav", "Anders", "Sofie"], "Gustav, Anders and Sofie are in"],
    [["Gustav", "Anders", "Sofie", "Maja", "Ida"], "Gustav, Anders, Sofie and 2 more are in"],
  ] as const)("joined names %j → %s", (names, line) => expect(joinedNamesLine(names)).toBe(line));
  it("chips and eyebrows", () => {
    expect(modeChip("BLIND")).toBe("Blind");
    expect(modeChip("SEMI_BLIND")).toBe("Semi-blind");
    expect(invitationCardEyebrow("2 days away")).toBe("Invitation · 2 days away");
    expect(invitationCardEyebrow(null)).toBe("Invitation");
    expect(OVERVIEW_EYEBROW).toBe("Overview · what's happening now");
  });
});

describe("scoring (GUEST-12, GUEST-13)", () => {
  it("six rows from FIELD_POINTS", () => {
    expect(SCORING_ROWS).toEqual([
      { label: "Country", points: 2 },
      { label: "Region", points: 3 },
      { label: "Appellation", points: 5 },
      { label: "Grape", points: 8 },
      { label: "Producer", points: 6 },
      { label: "Vintage", points: 2 },
    ]);
  });
  it("sentences", () => {
    expect(scoringSentence("BLIND", "Christian")).toBe(
      "Up to 30 points a glass, Danish Championship rules. Christian may pour more — the count is whatever is in the flight tonight.",
    );
    expect(scoringSentence("SEMI_BLIND", "Christian")).toBe(
      "One point for each glass you match. Christian may pour more — the count is whatever is in the flight tonight.",
    );
    expect(overviewScoringLine("BLIND")).toBe("Up to 30 points a glass, Danish Championship rules");
    expect(overviewScoringLine("SEMI_BLIND")).toBe("One point for each glass you match");
    expect(BRING_A_GLASS).toBe("Bring a glass. Everything else happens on your phone.");
  });
});

describe("the joined guest (S6, S6b)", () => {
  const live = {
    revealMode: "BLIND", timingMode: "LIVE", sequentialGuessing: true, leaderboardReveal: "PER_ATTRIBUTE",
    asyncRevealPolicy: "AFTER_ALL", glassCount: 4, host: "Christian",
  } as const;
  it("LIVE guided blind", () => {
    expect(tonightLines(live)).toEqual([
      "4 glasses so far, poured one at a time. Guess six things about each — up to 30 points a glass.",
      "Christian reveals one attribute at a time, so the table finds out together.",
    ]);
    expect(tonightLines({ ...live, leaderboardReveal: "PER_WINE" })[1]).toBe("Christian reveals each glass once it is done.");
    expect(tonightLines({ ...live, glassCount: 0 })[0]).toBe(
      "Glasses are poured one at a time. Guess six things about each — up to 30 points a glass.",
    );
    expect(tonightLines({ ...live, glassCount: 1 })[0]).toBe(
      "1 glass so far, poured one at a time. Guess six things about each — up to 30 points a glass.",
    );
  });
  it("LIVE free order, ASYNC, semi-blind", () => {
    expect(tonightLines({ ...live, sequentialGuessing: false })).toEqual(["Guess the glasses in any order — up to 30 points a glass."]);
    expect(tonightLines({ ...live, timingMode: "ASYNC" })).toEqual([
      "Guess at your own pace — up to 30 points a glass.",
      "Answers show once everyone has guessed.",
    ]);
    expect(tonightLines({ ...live, timingMode: "ASYNC", asyncRevealPolicy: "IMMEDIATE" })[1]).toBe("You see each answer as soon as you submit.");
    expect(tonightLines({ ...live, revealMode: "SEMI_BLIND" })).toEqual([
      "Match each glass to a wine on the list — one point for each glass you match.",
    ]);
  });
  it("waiting, the table, the eyebrow, Learn", () => {
    expect(waitingLines("LIVE", "Christian")).toEqual(["Waiting for Christian to pour", "Glass 1 opens for everyone at the same moment."]);
    expect(waitingLines("ASYNC", "Christian")).toEqual(["Waiting for Christian to pour", "Every glass opens when Christian starts."]);
    expect(atTheTableLabel(5, 2, { phone: false })).toBe("At the table · 5 of 7");
    expect(atTheTableLabel(5, 2, { phone: true })).toBe("At the table · 5 of 7 arrived");
    expect(guestEyebrow({ host: "Christian", revealMode: "BLIND", guided: true }, { phone: false })).toBe("Christian is hosting · blind · guided");
    expect(guestEyebrow({ host: "Christian", revealMode: "BLIND", guided: true }, { phone: true })).toBe("Christian is hosting · blind");
    expect(LEARN_LINKS).toEqual([
      { title: "The map", sub: "Regions and appellations, in Learn", subLaptop: "Regions and appellations", href: "/knowledge/map" },
      { title: "Knowledge", sub: "Grapes, styles and vintages, in Learn", subLaptop: "Grapes, styles, vintages", href: "/knowledge" },
    ]);
  });
});
