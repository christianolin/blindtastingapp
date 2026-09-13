import { describe, expect, it } from "vitest";
import {
  buildSetupFormData,
  defaultSetup,
  flowApplies,
  leaderboardApplies,
  localToIso,
  nameSuggestions,
  readySummary,
  rulesHint,
  rulesSummary,
  rulesSummaryShort,
  WINE_SOURCE_LOCKED,
  type SetupValues,
} from "./setup-copy";

const base: SetupValues = { ...defaultSetup("BLIND") };

describe("rulesSummary", () => {
  it("blind live guided: flow · standings · scoring", () => {
    expect(rulesSummary(base)).toBe(
      "Guided · standings after each attribute · Danish Championship scoring",
    );
    expect(rulesSummary({ ...base, leaderboardReveal: "PER_WINE" })).toBe(
      "Guided · standings after the full wine · Danish Championship scoring",
    );
  });

  it("blind live free: no standings part (create-8)", () => {
    expect(
      rulesSummary({ ...base, flow: "FREE", leaderboardReveal: "PER_WINE" }),
    ).toBe("Free · Danish Championship scoring");
  });

  it("semi-blind: one point per glass", () => {
    expect(rulesSummary({ ...base, revealMode: "SEMI_BLIND" })).toBe(
      "Semi-blind · one point per glass",
    );
  });

  it("self-paced drops flow and standings, appends the results policy (create-1)", () => {
    expect(rulesSummary({ ...base, timingMode: "ASYNC" })).toBe(
      "Danish Championship scoring · results after everyone has guessed",
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

  it("guided, standings per wine", () => {
    expect(rulesSummaryShort({ ...base, leaderboardReveal: "PER_WINE" })).toBe(
      "Guided · per wine",
    );
  });

  it("free flow drops the standings word (create-8)", () => {
    expect(rulesSummaryShort({ ...base, flow: "FREE", leaderboardReveal: "PER_WINE" })).toBe(
      "Free",
    );
  });

  it("semi-blind: one point per glass", () => {
    expect(rulesSummaryShort({ ...base, revealMode: "SEMI_BLIND" })).toBe(
      "Semi-blind · 1 pt per glass",
    );
  });

  it("self-paced keeps only the results policy (create-1)", () => {
    expect(rulesSummaryShort({ ...base, timingMode: "ASYNC" })).toBe(
      "results after all",
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

  it("live free says free", () => {
    expect(
      readySummary({
        setup: { ...base, flow: "FREE" },
        wineCount: 0,
        invitedCount: 1,
        dateText: null,
      }),
    ).toEqual(["Blind", "live", "free", "0 wines so far", "no date", "1 invited", "add more as you pour"]);
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

describe("Guided pacing and the leaderboard only for Live + Guided (create-1, create-8)", () => {
  const live = defaultSetup("BLIND");
  it("keeps the LIVE + Guided defaults", () => {
    expect(rulesSummary(live)).toBe("Guided · standings after each attribute · Danish Championship scoring");
    expect(rulesSummaryShort(live)).toBe("Guided · per attribute");
  });
  it("self-paced drops Guided/Free and every standings wording", () => {
    const selfPaced = { ...live, timingMode: "ASYNC" as const };
    for (const s of [rulesSummary(selfPaced), rulesSummaryShort(selfPaced)]) expect(s).not.toMatch(/Guided|Free|standings|per attribute|per wine/);
  });
  it("LIVE + Free drops the standings wording", () => {
    const free = { ...live, flow: "FREE" as const };
    expect(rulesSummary(free)).not.toMatch(/standings/);
    expect(rulesSummaryShort(free)).not.toMatch(/per attribute|per wine/);
  });
  it("readySummary omits guided/free for self-paced, and shows the invited count (play-1, create-7)", () => {
    expect(readySummary({ setup: live, wineCount: 2, invitedCount: 3, dateText: null })).toEqual(["Blind", "live", "guided", "2 wines so far", "no date", "3 invited", "add more as you pour"]);
    expect(readySummary({ setup: { ...live, timingMode: "ASYNC" }, wineCount: 1, invitedCount: 0, dateText: null })).toEqual(["Blind", "self-paced", "1 wine so far", "no date", "0 invited", "add more as you pour"]);
  });
});

// The one condition each setting renders under, shared by the form and the
// summaries (spec §D.1 #1 and #5).
describe("flowApplies / leaderboardApplies", () => {
  it("the Flow setting exists only for blind LIVE tastings", () => {
    expect(flowApplies(base)).toBe(true);
    expect(flowApplies({ ...base, flow: "FREE" })).toBe(true);
    expect(flowApplies({ ...base, timingMode: "ASYNC" })).toBe(false);
    expect(flowApplies({ ...base, revealMode: "SEMI_BLIND" })).toBe(false);
  });

  it("the Leaderboard setting exists only for blind LIVE Guided tastings", () => {
    expect(leaderboardApplies(base)).toBe(true);
    expect(leaderboardApplies({ ...base, flow: "FREE" })).toBe(false);
    expect(leaderboardApplies({ ...base, timingMode: "ASYNC" })).toBe(false);
    expect(leaderboardApplies({ ...base, revealMode: "SEMI_BLIND" })).toBe(false);
  });
});

// The collapsed rules card's desktop hint (handoff 6a).
describe("rulesHint (create-1, create-8)", () => {
  const guided =
    "Guided means everyone tastes the same glass at once and you drive the reveal. Fine for almost every tasting — open this only if you want free order or a quieter leaderboard.";

  it("LIVE + Guided keeps the handoff's line", () => {
    expect(rulesHint(base)).toBe(guided);
  });

  it("LIVE + Free stops promising a quieter leaderboard", () => {
    const hint = rulesHint({ ...base, flow: "FREE" });
    expect(hint).toBe(
      "Guided means everyone tastes the same glass at once and you drive the reveal. Fine for almost every tasting — open this only if you want free order.",
    );
    expect(hint).not.toMatch(/leaderboard/);
  });

  it("no hint for self-paced or semi-blind", () => {
    expect(rulesHint({ ...base, timingMode: "ASYNC" })).toBeNull();
    expect(rulesHint({ ...base, revealMode: "SEMI_BLIND" })).toBeNull();
  });
});

describe("WINE_SOURCE_LOCKED (create-4)", () => {
  it("is the server refusal and the form hint, word for word", () => {
    expect(WINE_SOURCE_LOCKED).toBe(
      "Remove the wines first — who brings the wines can't change once the flight has bottles.",
    );
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

describe("defaultSetup", () => {
  it("starts without a cover photo", () => {
    expect(defaultSetup("BLIND").imageUrl).toBeNull();
    expect(defaultSetup("SEMI_BLIND").imageUrl).toBeNull();
  });
});

describe("buildSetupFormData", () => {
  it("posts the cover photo URL as image_url", () => {
    const url =
      "https://example.supabase.co/storage/v1/object/public/tasting-images/user-1/cover.jpg";
    const fd = buildSetupFormData({ ...base, name: "Cover", imageUrl: url });
    expect(fd.get("image_url")).toBe(url);
  });

  it("posts a blank image_url when there is no photo (the action reads it as null)", () => {
    expect(buildSetupFormData({ ...base, name: "No cover" }).get("image_url")).toBe("");
  });

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
