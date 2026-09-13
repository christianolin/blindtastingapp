import { describe, expect, it } from "vitest";
import {
  FIELD_POINTS,
  LADDER_ORDER,
  MAX_POINTS,
  OPTIONAL_FIELDS,
  flightSegments,
  isFieldAnswered,
  nextUnanswered,
  pointsAtStake,
  grapeSecondaryLine,
  rankDelta,
  type GuessRow,
} from "./guess-ladder-math";

const EMPTY: GuessRow = {
  country_id: null,
  region_id: null,
  appellation_id: null,
  primary_grape_id: null,
  secondary_grape_id: null,
  producer_id: null,
  type_designation_id: null,
  vintage_kind: null,
  vintage_year: null,
  vintage_tawny_years: null,
};

describe("FIELD_POINTS", () => {
  it("lists the six ladder rows in order with the real VM/DM values", () => {
    expect(FIELD_POINTS.map((f) => [f.field, f.points])).toEqual([
      ["country", 2],
      ["region", 3],
      ["appellation", 5],
      ["primary_grape", 8],
      ["producer", 6],
      ["vintage", 2],
      ["secondary_grape", 2],
      ["type_designation", 2],
    ]);
    expect(LADDER_ORDER).toEqual([
      "country",
      "region",
      "appellation",
      "primary_grape",
      "producer",
      "vintage",
    ]);
    expect(OPTIONAL_FIELDS).toEqual(["secondary_grape", "type_designation"]);
    expect(MAX_POINTS).toBe(30);
  });
});

describe("isFieldAnswered", () => {
  it("treats a null id as unanswered and any id as answered", () => {
    expect(isFieldAnswered(EMPTY, "country")).toBe(false);
    expect(isFieldAnswered({ ...EMPTY, country_id: "it" }, "country")).toBe(true);
  });

  it("needs a year for YEAR, tawny years for TAWNY and nothing more for NV", () => {
    expect(isFieldAnswered({ ...EMPTY, vintage_kind: "YEAR" }, "vintage")).toBe(false);
    expect(
      isFieldAnswered({ ...EMPTY, vintage_kind: "YEAR", vintage_year: 2018 }, "vintage"),
    ).toBe(true);
    expect(isFieldAnswered({ ...EMPTY, vintage_kind: "TAWNY" }, "vintage")).toBe(false);
    expect(
      isFieldAnswered(
        { ...EMPTY, vintage_kind: "TAWNY", vintage_tawny_years: 20 },
        "vintage",
      ),
    ).toBe(true);
    expect(isFieldAnswered({ ...EMPTY, vintage_kind: "NV" }, "vintage")).toBe(true);
  });
});

describe("pointsAtStake", () => {
  it("is 0 for no guess at all", () => {
    expect(pointsAtStake(null)).toBe(0);
    expect(pointsAtStake(EMPTY)).toBe(0);
  });

  it("sums the answered required fields", () => {
    expect(
      pointsAtStake({
        ...EMPTY,
        country_id: "it",
        region_id: "piedmont",
        appellation_id: "barbaresco",
        primary_grape_id: "nebbiolo",
      }),
    ).toBe(2 + 3 + 5 + 8);
  });

  it("is 26 with every required field and reaches the 30 max only via the optional rows", () => {
    const full: GuessRow = {
      country_id: "it",
      region_id: "piedmont",
      appellation_id: "barbaresco",
      primary_grape_id: "nebbiolo",
      secondary_grape_id: null,
      producer_id: "cigliuti",
      type_designation_id: null,
      vintage_kind: "YEAR",
      vintage_year: 2018,
      vintage_tawny_years: null,
    };
    expect(pointsAtStake(full)).toBe(26);
    expect(pointsAtStake({ ...full, secondary_grape_id: "barbera" })).toBe(28);
    expect(
      pointsAtStake({ ...full, secondary_grape_id: "barbera", type_designation_id: "riserva" }),
    ).toBe(MAX_POINTS);
  });

  it("does not count a vintage kind without its year", () => {
    expect(pointsAtStake({ ...EMPTY, vintage_kind: "YEAR" })).toBe(0);
    expect(pointsAtStake({ ...EMPTY, vintage_kind: "NV" })).toBe(2);
  });
});

describe("nextUnanswered", () => {
  it("returns the first field in the given order without an answer", () => {
    expect(nextUnanswered(EMPTY, LADDER_ORDER)).toBe("country");
    expect(
      nextUnanswered({ ...EMPTY, country_id: "it", region_id: "piedmont" }, LADDER_ORDER),
    ).toBe("appellation");
  });

  it("skips ahead of the current field when asked to continue from it", () => {
    expect(nextUnanswered(EMPTY, LADDER_ORDER, "region")).toBe("appellation");
  });

  it("is null when everything in the order is answered", () => {
    expect(
      nextUnanswered(
        {
          ...EMPTY,
          country_id: "it",
          region_id: "piedmont",
          appellation_id: "barbaresco",
          primary_grape_id: "nebbiolo",
          producer_id: "cigliuti",
          vintage_kind: "NV",
        },
        LADDER_ORDER,
      ),
    ).toBeNull();
  });

  it("respects a custom order that includes the optional rows", () => {
    expect(nextUnanswered(EMPTY, ["secondary_grape", "type_designation"])).toBe(
      "secondary_grape",
    );
    expect(
      nextUnanswered({ ...EMPTY, secondary_grape_id: "x" }, ["secondary_grape", "type_designation"]),
    ).toBe("type_designation");
  });
});

describe("rankDelta", () => {
  const rows = [
    { participantId: "a", total: 22, lastRoundPoints: 8 },
    { participantId: "b", total: 20, lastRoundPoints: 2 },
    { participantId: "c", total: 15, lastRoundPoints: null },
  ];

  it("computes the rank before the last round from total minus last-round points", () => {
    // Before: a=14, b=18, c=15 → b 1st, c 2nd, a 3rd. After: a 1st, b 2nd, c 3rd.
    expect(rankDelta(rows, "a")).toEqual({ before: 3, after: 1 });
    expect(rankDelta(rows, "b")).toEqual({ before: 1, after: 2 });
    expect(rankDelta(rows, "c")).toEqual({ before: 2, after: 3 });
  });

  it("is null when the viewer is not among the rows", () => {
    expect(rankDelta(rows, "zz")).toBeNull();
  });

  it("uses dense ranking so ties share a rank", () => {
    expect(
      rankDelta(
        [
          { participantId: "a", total: 10, lastRoundPoints: 0 },
          { participantId: "b", total: 10, lastRoundPoints: 0 },
          { participantId: "c", total: 4, lastRoundPoints: 0 },
        ],
        "c",
      ),
    ).toEqual({ before: 2, after: 2 });
  });

  it("rankDelta treats a null last_round_points as no change (reveal-7)", () =>
    expect(rankDelta([{ participantId: "gustav", total: 10, lastRoundPoints: null }, { participantId: "ida", total: 12, lastRoundPoints: 6 }], "gustav")).toEqual({ before: 1, after: 2 }));
});

describe("flightSegments", () => {
  const wines = [
    { id: "w1", is_revealed: true },
    { id: "w2", is_revealed: true },
    { id: "w3", is_revealed: false },
    { id: "w4", is_revealed: false },
  ];

  it("marks revealed, current and the rest in serving order", () => {
    expect(flightSegments(wines, "w3")).toEqual(["revealed", "revealed", "current", "todo"]);
  });

  it("has no current segment when nothing is current", () => {
    expect(flightSegments(wines, null)).toEqual(["revealed", "revealed", "todo", "todo"]);
  });

  it("never marks a revealed wine as current", () => {
    expect(flightSegments(wines, "w1")).toEqual(["revealed", "revealed", "todo", "todo"]);
  });
});

describe("grapeSecondaryLine", () => {
  it("joins the linked places, a white flag and the frequent clause with a middle dot", () => {
    expect(
      grapeSecondaryLine({ places: ["Barolo", "Barbaresco"], color: "RED" }, true),
    ).toBe("Barolo, Barbaresco · you guess this often");
    expect(grapeSecondaryLine({ places: ["Gavi"], color: "WHITE" }, false)).toBe(
      "Gavi · white",
    );
    expect(grapeSecondaryLine({ places: [], color: "WHITE" }, true)).toBe(
      "white · you guess this often",
    );
  });

  it("never calls out red — the default assumption, as drawn", () => {
    expect(grapeSecondaryLine({ places: ["Dogliani", "Alba"], color: "RED" }, false)).toBe(
      "Dogliani, Alba",
    );
  });

  it("is undefined when there is nothing to say", () => {
    expect(grapeSecondaryLine({ places: [], color: null }, false)).toBeUndefined();
    expect(grapeSecondaryLine({ places: [], color: "RED" }, false)).toBeUndefined();
    expect(grapeSecondaryLine(undefined, false)).toBeUndefined();
    expect(grapeSecondaryLine(undefined, true)).toBe("you guess this often");
  });
});
