import { describe, expect, it } from "vitest";
import {
  BOTTLE_LIMIT_OPTIONS,
  contributedCount,
  contributionCounts,
  atBottleLimit,
  atLimitLine,
  bottleLimitColumn,
  bottleLimitEachLine,
  bottleLimitOptionLabel,
  bottleLimitRefusal,
  bottleLimitSettingRefusal,
  bottleExactColumn,
  bottleRuleOptionLabel,
  bottleShortfalls,
  exactBottlesStartWarning,
  parseBottleExact,
  shortBottlesWarning,
  BOTTLE_LIMIT_LOCKED_CLOSED,
  friendlyBottleLimitError,
  isBottleLimitDbError,
  parseBottleLimit,
  unequalBottlesHint,
  unevenCountsNotice,
  unevenBottleCounts,
  unevenGlassCounts,
  viewerAtBottleLimit,
} from "./bottle-limit";

describe("parseBottleLimit", () => {
  it("accepts 1, 2 and 3 as numbers or strings", () => {
    expect(parseBottleLimit(1)).toBe(1);
    expect(parseBottleLimit("2")).toBe(2);
    expect(parseBottleLimit(3)).toBe(3);
  });
  it("reads anything else as unlimited (null)", () => {
    for (const v of [null, undefined, "", "0", 0, 4, "abc", 1.5, "unlimited"]) {
      expect(parseBottleLimit(v)).toBeNull();
    }
  });
});

describe("bottleLimitColumn", () => {
  it("stores the limit only for bring-your-own", () => {
    expect(bottleLimitColumn("PARTICIPANT_CONTRIBUTED", 2)).toBe(2);
    expect(bottleLimitColumn("PARTICIPANT_CONTRIBUTED", null)).toBeNull();
    expect(bottleLimitColumn("HOST_PROVIDES", 1)).toBeNull();
  });
});

describe("options and labels", () => {
  it("offers 1 · 2 · 3 · Unlimited in that order", () => {
    expect(BOTTLE_LIMIT_OPTIONS.map(bottleLimitOptionLabel)).toEqual(["1", "2", "3", "Unlimited"]);
  });
  it("names the limit for the lobby: exactly vs up to", () => {
    expect(bottleLimitEachLine(1, true)).toBe("1 bottle each");
    expect(bottleLimitEachLine(2, true)).toBe("2 bottles each");
    expect(bottleLimitEachLine(1, false)).toBe("Up to 1 bottle each");
    expect(bottleLimitEachLine(3, false)).toBe("Up to 3 bottles each");
    expect(bottleLimitEachLine(null, false)).toBeNull();
    expect(bottleLimitEachLine(null, true)).toBeNull();
  });
});

describe("atBottleLimit / atLimitLine", () => {
  it("is never at the limit when unlimited", () => {
    expect(atBottleLimit(null, 99)).toBe(false);
  });
  it("is at the limit at or above it (a lowered limit keeps old bottles)", () => {
    expect(atBottleLimit(1, 0)).toBe(false);
    expect(atBottleLimit(1, 1)).toBe(true);
    expect(atBottleLimit(2, 3)).toBe(true);
  });
  it("says what you added", () => {
    expect(atLimitLine(1)).toBe("You've added your bottle");
    expect(atLimitLine(2)).toBe("You've added your 2 bottles");
  });
});

describe("refusals", () => {
  it("explains a refused add", () => {
    expect(bottleLimitRefusal(1)).toBe(
      "You've already added your bottle — this tasting is 1 bottle each.",
    );
    expect(bottleLimitRefusal(3)).toBe(
      "You've already added your 3 bottles — this tasting is up to 3 bottles each.",
    );
  });
  it("recognises the database trigger's error", () => {
    expect(isBottleLimitDbError("bottle limit reached: 1 per person in this tasting")).toBe(true);
    expect(isBottleLimitDbError("duplicate key value")).toBe(false);
    expect(isBottleLimitDbError(null)).toBe(false);
  });
  it("maps the trigger's error to friendly copy, leaving others alone", () => {
    expect(friendlyBottleLimitError("bottle limit reached: 2 per person in this tasting", 2)).toBe(
      bottleLimitRefusal(2),
    );
    expect(friendlyBottleLimitError("bottle limit reached: 2 per person", null)).toBe(
      "You've already added as many bottles as this tasting allows.",
    );
    expect(friendlyBottleLimitError("something else", 2)).toBe("something else");
  });
  it("lets the limit change until the tasting is closed", () => {
    expect(bottleLimitSettingRefusal({ status: "DRAFT", before: null, after: 1 })).toBeNull();
    expect(bottleLimitSettingRefusal({ status: "IN_PROGRESS", before: 1, after: 2 })).toBeNull();
    expect(bottleLimitSettingRefusal({ status: "CLOSED", before: 1, after: 1 })).toBeNull();
    expect(bottleLimitSettingRefusal({ status: "CLOSED", before: 1, after: null })).toBe(
      BOTTLE_LIMIT_LOCKED_CLOSED,
    );
  });
});

describe("unequalBottlesHint", () => {
  it("is silent when everyone brings exactly N", () => {
    for (const v of [1, 2, 3] as const) expect(unequalBottlesHint(v, true)).toBeNull();
  });
  it("explains why unequal counts skew totals for up to N (1 included) and Unlimited", () => {
    for (const v of [1, 2, 3, null] as const) {
      expect(unequalBottlesHint(v, false)).toBe(
        "You never guess your own bottles, so if people bring different numbers, total points aren't directly comparable. The same number each keeps it fair.",
      );
    }
    // Unlimited has no rule: a stale exact flag is ignored.
    expect(unequalBottlesHint(null, true)).not.toBeNull();
  });
});

describe("the exactly / up to rule", () => {
  it("parses only a true-ish flag as exact", () => {
    for (const v of [true, "1", "true", "on"]) expect(parseBottleExact(v)).toBe(true);
    for (const v of [false, "", "0", null, undefined, "false"]) expect(parseBottleExact(v)).toBe(false);
  });
  it("stores exact only for bring-your-own with a limit", () => {
    expect(bottleExactColumn("PARTICIPANT_CONTRIBUTED", 1, true)).toBe(true);
    expect(bottleExactColumn("PARTICIPANT_CONTRIBUTED", 2, false)).toBe(false);
    expect(bottleExactColumn("PARTICIPANT_CONTRIBUTED", null, true)).toBe(false);
    expect(bottleExactColumn("HOST_PROVIDES", 1, true)).toBe(false);
  });
  it("labels the two choices", () => {
    expect(bottleRuleOptionLabel(1, true)).toBe("Exactly 1 each");
    expect(bottleRuleOptionLabel(1, false)).toBe("Up to 1 each");
    expect(bottleRuleOptionLabel(3, true)).toBe("Exactly 3 each");
  });
  it("refuses a rule change once closed, like the number", () => {
    expect(bottleLimitSettingRefusal({ status: "CLOSED", before: 1, after: 1, beforeExact: false, afterExact: true })).toBe(
      BOTTLE_LIMIT_LOCKED_CLOSED,
    );
    expect(bottleLimitSettingRefusal({ status: "IN_PROGRESS", before: 1, after: 1, beforeExact: false, afterExact: true })).toBeNull();
    expect(bottleLimitSettingRefusal({ status: "CLOSED", before: 2, after: 2, beforeExact: true, afterExact: true })).toBeNull();
  });
});

describe("bottleShortfalls / shortBottlesWarning", () => {
  const wines = [
    { contributor_participant_id: "a", added_by_host: false },
    { contributor_participant_id: "b", added_by_host: false },
    { contributor_participant_id: "b", added_by_host: false },
    { contributor_participant_id: null, added_by_host: true },
  ];
  const people = [
    { participantId: "a", name: "Gustav", you: false },
    { participantId: "b", name: "Ana", you: false },
    { participantId: "c", name: "Mads", you: false },
  ];
  it("lists only people short of N, in the order given, when exact", () => {
    expect(bottleShortfalls({ limit: 2, exact: true, people, wines })).toEqual([
      { name: "Gustav", you: false, missing: 1 },
      { name: "Mads", you: false, missing: 2 },
    ]);
  });
  it("is empty when the rule is up to N, or unlimited", () => {
    expect(bottleShortfalls({ limit: 2, exact: false, people, wines })).toEqual([]);
    expect(bottleShortfalls({ limit: null, exact: true, people, wines })).toEqual([]);
  });
  it("never counts a person over a lowered limit as short", () => {
    expect(bottleShortfalls({ limit: 1, exact: true, people, wines })).toEqual([
      { name: "Mads", you: false, missing: 1 },
    ]);
  });
  it("names who is short under Start", () => {
    expect(shortBottlesWarning([{ name: "Gustav", you: false, missing: 1 }])).toBe(
      "Gustav still needs to add 1 bottle.",
    );
    expect(
      shortBottlesWarning([
        { name: "Gustav", you: false, missing: 1 },
        { name: "Mads", you: false, missing: 2 },
      ]),
    ).toBe("Gustav still needs to add 1 bottle · Mads still needs to add 2 bottles.");
    expect(shortBottlesWarning([{ name: "Christian", you: true, missing: 1 }])).toBe(
      "You still need to add 1 bottle.",
    );
    expect(shortBottlesWarning([])).toBeNull();
  });
  it("puts it together for a tasting row", () => {
    expect(
      exactBottlesStartWarning({
        tasting: { wine_source: "PARTICIPANT_CONTRIBUTED", bottles_per_person: 1, bottles_exact: true },
        people,
        wines,
      }),
    ).toBe("Mads still needs to add 1 bottle.");
    expect(
      exactBottlesStartWarning({
        tasting: { wine_source: "HOST_PROVIDES", bottles_per_person: 1, bottles_exact: true },
        people,
        wines,
      }),
    ).toBeNull();
  });
});

describe("unevenBottleCounts", () => {
  it("before start, compares only people who have brought something", () => {
    expect(unevenBottleCounts([1, 1, 0], { started: false })).toBe(false);
    expect(unevenBottleCounts([2, 1, 0], { started: false })).toBe(true);
  });
  it("once started, someone who brought nothing guesses more glasses", () => {
    expect(unevenBottleCounts([1, 1, 0], { started: true })).toBe(true);
    expect(unevenBottleCounts([1, 1, 1], { started: true })).toBe(false);
  });
  it("needs at least two people to compare", () => {
    expect(unevenBottleCounts([3], { started: true })).toBe(false);
    expect(unevenBottleCounts([], { started: true })).toBe(false);
  });
});

describe("unevenGlassCounts", () => {
  it("is true when the standings' glass denominators differ", () => {
    expect(unevenGlassCounts([5, 5, 4])).toBe(true);
    expect(unevenGlassCounts([5, 5, 5])).toBe(false);
    expect(unevenGlassCounts([5])).toBe(false);
  });
});

describe("unevenCountsNotice", () => {
  it("says why totals are not comparable", () => {
    expect(unevenCountsNotice({ pointToCounts: false })).toBe(
      "Not everyone brought the same number of bottles. You never guess your own, so some people had more glasses to guess — totals aren't directly comparable.",
    );
  });
  it("points at the per-person X/Y where the standings show it", () => {
    expect(unevenCountsNotice({ pointToCounts: true })).toBe(
      "Not everyone brought the same number of bottles. You never guess your own, so some people had more glasses to guess — totals aren't directly comparable. The second number in each X/Y is how many glasses that person could guess.",
    );
  });
});

describe("contributedCount / contributionCounts", () => {
  const wines = [
    { contributor_participant_id: "a", added_by_host: false },
    { contributor_participant_id: "a", added_by_host: false },
    { contributor_participant_id: "b", added_by_host: false },
    { contributor_participant_id: null, added_by_host: true },
    // A contributor id left on a host-added glass never counts.
    { contributor_participant_id: "b", added_by_host: true },
  ];
  it("counts only that participant's contributed glasses", () => {
    expect(contributedCount(wines, "a")).toBe(2);
    expect(contributedCount(wines, "b")).toBe(1);
    expect(contributedCount(wines, null)).toBe(0);
  });
  it("lists counts per participant, zeros included", () => {
    expect(contributionCounts(wines, ["a", "b", "c"])).toEqual([2, 1, 0]);
  });
});

describe("viewerAtBottleLimit", () => {
  const wines = [{ contributor_participant_id: "a", added_by_host: false }];
  it("applies only to bring-your-own", () => {
    expect(viewerAtBottleLimit({ wine_source: "PARTICIPANT_CONTRIBUTED", bottles_per_person: 1 }, wines, "a")).toBe(true);
    expect(viewerAtBottleLimit({ wine_source: "PARTICIPANT_CONTRIBUTED", bottles_per_person: 2 }, wines, "a")).toBe(false);
    expect(viewerAtBottleLimit({ wine_source: "PARTICIPANT_CONTRIBUTED", bottles_per_person: null }, wines, "a")).toBe(false);
    expect(viewerAtBottleLimit({ wine_source: "HOST_PROVIDES", bottles_per_person: 1 }, wines, "a")).toBe(false);
  });
});
