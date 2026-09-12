import { describe, expect, it } from "vitest";
import {
  buildSetupFormData,
  defaultSetup,
  localToIso,
  nameSuggestions,
  readySummary,
  rulesSummary,
  rulesSummaryShort,
  type SetupValues,
} from "./setup-copy";

const base: SetupValues = { ...defaultSetup("BLIND") };

describe("rulesSummary", () => {
  it("blind live: flow · standings · scoring", () => {
    expect(rulesSummary(base)).toBe(
      "Guided · standings after each attribute · Danish Championship scoring",
    );
    expect(
      rulesSummary({ ...base, flow: "FREE", leaderboardReveal: "PER_WINE" }),
    ).toBe("Free · standings after the full wine · Danish Championship scoring");
  });

  it("semi-blind: one point per glass", () => {
    expect(rulesSummary({ ...base, revealMode: "SEMI_BLIND" })).toBe(
      "Semi-blind · one point per glass",
    );
  });

  it("self-paced appends the results policy", () => {
    expect(rulesSummary({ ...base, timingMode: "ASYNC" })).toBe(
      "Guided · standings after each attribute · Danish Championship scoring · results after everyone has guessed",
    );
    expect(
      rulesSummary({
        ...base,
        revealMode: "SEMI_BLIND",
        timingMode: "ASYNC",
        asyncRevealPolicy: "IMMEDIATE",
      }),
    ).toBe("Semi-blind · one point per glass · results as soon as you submit");
  });
});

// The phone rules card (handoff 6d) — short enough for one line at 390px.
describe("rulesSummaryShort", () => {
  it("default state is the handoff's exact line", () => {
    expect(rulesSummaryShort(base)).toBe("Guided · per attribute");
  });

  it("free flow, standings per wine", () => {
    expect(rulesSummaryShort({ ...base, flow: "FREE", leaderboardReveal: "PER_WINE" })).toBe(
      "Free · per wine",
    );
  });

  it("semi-blind: one point per glass", () => {
    expect(rulesSummaryShort({ ...base, revealMode: "SEMI_BLIND" })).toBe(
      "Semi-blind · 1 pt per glass",
    );
  });

  it("self-paced appends the results policy", () => {
    expect(rulesSummaryShort({ ...base, timingMode: "ASYNC" })).toBe(
      "Guided · per attribute · results after all",
    );
    expect(
      rulesSummaryShort({
        ...base,
        revealMode: "SEMI_BLIND",
        timingMode: "ASYNC",
        asyncRevealPolicy: "IMMEDIATE",
      }),
    ).toBe("Semi-blind · 1 pt per glass · results at once");
  });
});

describe("readySummary", () => {
  it("lists mode, timing, flow, wines, invited and the pour note", () => {
    expect(
      readySummary({ setup: base, wineCount: 3, invitedCount: 2, dateText: "Thu 19:00" }),
    ).toEqual([
      "Blind",
      "live",
      "guided",
      "3 wines so far",
      "Thu 19:00",
      "2 invited",
      "add more as you pour",
    ]);
  });

  it("singular wine, no date, semi-blind drops the flow word", () => {
    expect(
      readySummary({
        setup: { ...base, revealMode: "SEMI_BLIND", timingMode: "ASYNC" },
        wineCount: 1,
        invitedCount: 0,
        dateText: null,
      }),
    ).toEqual([
      "Semi-blind",
      "self-paced",
      "1 wine so far",
      "no date",
      "0 invited",
      "add more as you pour",
    ]);
  });
});

describe("nameSuggestions", () => {
  it("weekday blind, region #n, and the fixed third", () => {
    const thursday = new Date(2026, 8, 10); // Thu 10 Sep 2026
    expect(nameSuggestions(thursday, { region: "Piedmont", n: 5 })).toEqual([
      "Thursday blind",
      "Piedmont #5",
      "Six glasses, no mercy",
    ]);
  });
  it("falls back to Burgundy #1", () => {
    expect(nameSuggestions(new Date(2026, 8, 12), null)[1]).toBe("Burgundy #1");
  });
});

describe("localToIso", () => {
  it("interprets the datetime-local value in the caller's zone", () => {
    const iso = localToIso("2026-09-10T19:00");
    expect(iso).toBe(new Date(2026, 8, 10, 19, 0).toISOString());
  });
  it("blank → null, garbage → null", () => {
    expect(localToIso("")).toBeNull();
    expect(localToIso("nope")).toBeNull();
  });
});

describe("buildSetupFormData", () => {
  it("posts the action's field names, with the ISO schedule alongside the raw value", () => {
    const fd = buildSetupFormData({
      ...base,
      name: "Nebbiolo vs Sangiovese",
      scheduledLocal: "2026-09-10T19:00",
    });
    expect(fd.get("name")).toBe("Nebbiolo vs Sangiovese");
    expect(fd.get("reveal_mode")).toBe("BLIND");
    expect(fd.get("timing_mode")).toBe("LIVE");
    expect(fd.get("wine_source")).toBe("HOST_PROVIDES");
    expect(fd.get("flow")).toBe("GUIDED");
    expect(fd.get("leaderboard_reveal")).toBe("PER_ATTRIBUTE");
    expect(fd.get("async_reveal_policy")).toBe("AFTER_ALL");
    expect(fd.get("scheduled_at")).toBe("2026-09-10T19:00");
    expect(fd.get("scheduled_at_iso")).toBe(new Date(2026, 8, 10, 19, 0).toISOString());
    expect(fd.get("emails")).toBe("");
  });
});
