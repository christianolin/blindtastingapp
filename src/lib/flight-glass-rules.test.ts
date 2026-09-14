import { describe, expect, it } from "vitest";
import {
  ALREADY_REVEALED,
  GLASS_STEP_STARTED,
  LATER_GLASS_SEEN,
  NOT_ADDER,
  SEEN_GLASS_REORDER_REFUSAL,
  SEMI_BLIND_FLIGHT_FIXED,
  TASTING_CLOSED,
  crossesSeenGlass,
  dropIndex,
  glassEditRefusal,
  glassRemoveRefusal,
  glassSwapRefusal,
  moveRefusalSentence,
  reorderIds,
  semiBlindAddRefusal,
  semiBlindFlightFixed,
  type FlightGlassState,
} from "./flight-glass-rules";

const base: FlightGlassState = {
  tastingStatus: "DRAFT",
  revealMode: "BLIND",
  isRevealed: false,
  revealStep: 0,
  viewerIsAdder: true,
  viewerIsHost: true,
  laterGlassSeen: false,
};

describe("refusal strings (F10's wording)", () => {
  it("keeps the shipped sentences", () => {
    expect(TASTING_CLOSED).toBe("This tasting is finished — reopen it to add wines.");
    expect(ALREADY_REVEALED).toBe("This wine has already been revealed.");
    expect(NOT_ADDER).toBe("Only the person who added this glass can edit it.");
    expect(GLASS_STEP_STARTED).toBe("This glass's reveal has started — it can't be changed now.");
  });
});

describe("glassEditRefusal — every status × revealed × step × adder × host", () => {
  for (const tastingStatus of ["DRAFT", "IN_PROGRESS", "OPEN", "CLOSED"] as const)
    for (const isRevealed of [false, true])
      for (const revealStep of [0, 2])
        for (const viewerIsAdder of [false, true])
          for (const viewerIsHost of [false, true]) {
            const s: FlightGlassState = { ...base, tastingStatus, isRevealed, revealStep, viewerIsAdder, viewerIsHost };
            const expected =
              tastingStatus === "CLOSED" ? TASTING_CLOSED
              : isRevealed ? ALREADY_REVEALED
              : revealStep > 0 ? GLASS_STEP_STARTED
              : !viewerIsAdder ? NOT_ADDER
              : null;
            it(`${JSON.stringify(s)} → ${expected}`, () => expect(glassEditRefusal(s)).toBe(expected));
          }
});

// Not in the plan's block: spec §3.5 asks for the matrix above "for Edit and for
// Remove", and Swap and adding get the same so every refusal order is pinned.
// Anything but DRAFT has started, legacy OPEN rows included (the database's
// `status <> 'DRAFT'`).
const everyGlassState: FlightGlassState[] = [];
for (const revealMode of ["BLIND", "SEMI_BLIND", "OPEN"] as const)
  for (const tastingStatus of ["DRAFT", "IN_PROGRESS", "OPEN", "CLOSED"] as const)
    for (const isRevealed of [false, true])
      for (const revealStep of [0, 2])
        for (const viewerIsAdder of [false, true])
          for (const viewerIsHost of [false, true])
            for (const laterGlassSeen of [false, true])
              everyGlassState.push({ tastingStatus, revealMode, isRevealed, revealStep, viewerIsAdder, viewerIsHost, laterGlassSeen });

/** Edit's answer once CLOSED is ruled out. */
const editWindowRefusal = (s: FlightGlassState) =>
  s.isRevealed ? ALREADY_REVEALED
  : s.revealStep > 0 ? GLASS_STEP_STARTED
  : !s.viewerIsAdder ? NOT_ADDER
  : null;
const semiBlindStarted = (t: Pick<FlightGlassState, "revealMode" | "tastingStatus">) =>
  t.revealMode === "SEMI_BLIND" && t.tastingStatus !== "DRAFT";

describe("glassRemoveRefusal — every mode × status × revealed × step × adder × host × later glass", () => {
  for (const s of everyGlassState) {
    // An OPEN (Taste & rate) board is exempt from the later-glass rule.
    const laterGlassRule = s.laterGlassSeen && s.revealMode !== "OPEN" ? LATER_GLASS_SEEN : null;
    const expected =
      s.tastingStatus === "CLOSED" ? TASTING_CLOSED
      : semiBlindStarted(s) ? SEMI_BLIND_FLIGHT_FIXED
      : s.tastingStatus === "DRAFT" && s.viewerIsHost ? laterGlassRule
      : (editWindowRefusal(s) ?? laterGlassRule);
    it(`${JSON.stringify(s)} → ${expected}`, () => expect(glassRemoveRefusal(s)).toBe(expected));
  }
});

describe("glassSwapRefusal — every mode × status × revealed × step × adder × host × later glass", () => {
  for (const s of everyGlassState) {
    const expected =
      s.tastingStatus === "CLOSED" ? TASTING_CLOSED
      : semiBlindStarted(s) ? SEMI_BLIND_FLIGHT_FIXED
      : editWindowRefusal(s);
    it(`${JSON.stringify(s)} → ${expected}`, () => expect(glassSwapRefusal(s)).toBe(expected));
  }
});

describe("semiBlindAddRefusal — every mode × status", () => {
  for (const revealMode of ["BLIND", "SEMI_BLIND", "OPEN"] as const)
    for (const tastingStatus of ["DRAFT", "IN_PROGRESS", "OPEN", "CLOSED"] as const) {
      const t = { revealMode, tastingStatus };
      const expected = semiBlindStarted(t) ? SEMI_BLIND_FLIGHT_FIXED : null;
      it(`${JSON.stringify(t)} → ${expected}`, () => expect(semiBlindAddRefusal(t)).toBe(expected));
    }
});

describe("glassRemoveRefusal", () => {
  it("the host clears any glass while the tasting is a draft", () => {
    expect(glassRemoveRefusal({ ...base, viewerIsAdder: false })).toBeNull();
  });
  it("after Start only the adder, before the first step", () => {
    const running = { ...base, tastingStatus: "IN_PROGRESS" as const };
    expect(glassRemoveRefusal({ ...running, viewerIsAdder: false })).toBe(NOT_ADDER);
    expect(glassRemoveRefusal({ ...running, viewerIsHost: false })).toBeNull();
    expect(glassRemoveRefusal({ ...running, revealStep: 1 })).toBe(GLASS_STEP_STARTED);
  });
  it("never on a finished tasting", () => {
    expect(glassRemoveRefusal({ ...base, tastingStatus: "CLOSED" })).toBe(TASTING_CLOSED);
  });
  it("never while a later glass has been seen (removing would change its number)", () => {
    expect(glassRemoveRefusal({ ...base, tastingStatus: "IN_PROGRESS", laterGlassSeen: true })).toBe(LATER_GLASS_SEEN);
  });
  // Not in the plan's block: pins can_remove_flight_glass's OPEN exemption
  // (spec §3.4, "OPEN boards are exempt: every glass there is revealed"), and
  // that Edit still refuses a revealed OPEN glass as F10's editRefusal does.
  it("an OPEN board is exempt from the later-glass rule; its revealed glasses stay unedited", () => {
    const openDraft = { ...base, revealMode: "OPEN" as const, isRevealed: true, viewerIsAdder: false, laterGlassSeen: true };
    expect(glassRemoveRefusal(openDraft)).toBeNull();
    expect(glassRemoveRefusal({ ...base, laterGlassSeen: true })).toBe(LATER_GLASS_SEEN);
    expect(glassEditRefusal({ ...openDraft, viewerIsAdder: true })).toBe(ALREADY_REVEALED);
  });
});

describe("a semi-blind flight is fixed at Start (Q7)", () => {
  const semi = { ...base, revealMode: "SEMI_BLIND" as const };
  const running = { ...semi, tastingStatus: "IN_PROGRESS" as const };
  it("Swap, Remove and adding refuse after Start; Edit stays", () => {
    expect(glassSwapRefusal(running)).toBe(SEMI_BLIND_FLIGHT_FIXED);
    expect(glassRemoveRefusal(running)).toBe(SEMI_BLIND_FLIGHT_FIXED);
    expect(semiBlindAddRefusal(running)).toBe(SEMI_BLIND_FLIGHT_FIXED);
    expect(glassEditRefusal(running)).toBeNull();
  });
  // Not in the plan's block: a legacy OPEN row has started as well.
  it("a legacy OPEN status counts as started (the database's status <> 'DRAFT')", () => {
    const legacy = { ...semi, tastingStatus: "OPEN" as const };
    expect(glassSwapRefusal(legacy)).toBe(SEMI_BLIND_FLIGHT_FIXED);
    expect(glassRemoveRefusal(legacy)).toBe(SEMI_BLIND_FLIGHT_FIXED);
    expect(semiBlindAddRefusal(legacy)).toBe(SEMI_BLIND_FLIGHT_FIXED);
    expect(glassEditRefusal(legacy)).toBeNull();
  });
  it("everything stays open in DRAFT, and blind flights are untouched", () => {
    expect(glassSwapRefusal(semi)).toBeNull();
    expect(glassRemoveRefusal(semi)).toBeNull();
    expect(semiBlindAddRefusal(semi)).toBeNull();
    expect(semiBlindAddRefusal({ ...base, tastingStatus: "IN_PROGRESS" })).toBeNull();
    expect(glassSwapRefusal({ ...base, tastingStatus: "IN_PROGRESS" })).toBeNull();
  });
  it("otherwise Swap follows Edit", () => {
    expect(glassSwapRefusal({ ...base, tastingStatus: "IN_PROGRESS", revealStep: 1 })).toBe(GLASS_STEP_STARTED);
    expect(glassSwapRefusal({ ...base, viewerIsAdder: false })).toBe(NOT_ADDER);
  });
});

describe("reorderIds and crossesSeenGlass (mirror move_flight_glass)", () => {
  it("moves a glass to a 1-based place", () => {
    expect(reorderIds(["a", "b", "c", "d"], "d", 2)).toEqual(["a", "d", "b", "c"]);
    expect(reorderIds(["a", "b", "c"], "a", 3)).toEqual(["b", "c", "a"]);
    expect(reorderIds(["a", "b", "c"], "b", 2)).toEqual(["a", "b", "c"]);
  });
  it("null for an unknown glass or a place outside the flight", () => {
    expect(reorderIds(["a", "b"], "z", 1)).toBeNull();
    expect(reorderIds(["a", "b"], "a", 0)).toBeNull();
    expect(reorderIds(["a", "b"], "a", 3)).toBeNull();
  });
  it("true only when a seen glass would change its number", () => {
    expect(crossesSeenGlass(["a", "b", "c"], ["b", "a", "c"], new Set(["a"]))).toBe(true);
    expect(crossesSeenGlass(["a", "b", "c"], ["a", "c", "b"], new Set(["a"]))).toBe(false);
  });
});

// BT-V3 A-19: M6 decision 5 (move_flight_glass after Start), mirrored for the
// optimistic list so a move the RPC refuses never swaps on screen first.
describe("crossesSeenGlass after Start (M6 decision 5)", () => {
  const ids = ["a", "b", "c", "d"];
  const none = new Set<string>();
  // d from place 4 to place 2: the range is places 2..4 (b, c, d), both ends included.
  const dUp = reorderIds(ids, "d", 2)!;

  it("a started semi-blind flight moves nothing", () => {
    expect(crossesSeenGlass(ids, dUp, none, { started: true, semiBlindFlightFixed: true })).toBe(true);
    expect(crossesSeenGlass(ids, ["b", "a", "c", "d"], none, { started: true, semiBlindFlightFixed: true })).toBe(true);
  });

  it("a guessed glass anywhere in the range refuses, both ends included", () => {
    for (const g of ["b", "c", "d"]) {
      expect(crossesSeenGlass(ids, dUp, none, { started: true, guessed: new Set([g]) }), g).toBe(true);
    }
  });

  it("a guessed or seen glass outside the range does not", () => {
    expect(crossesSeenGlass(ids, dUp, new Set(["a"]), { started: true, guessed: new Set(["a"]) })).toBe(false);
    const aDown = reorderIds(ids, "a", 2)!; // range a, b
    expect(crossesSeenGlass(ids, aDown, new Set(["d"]), { started: true, guessed: new Set(["c", "d"]) })).toBe(false);
  });

  it("the range includes the place the glass lands on", () => {
    const aToThree = reorderIds(ids, "a", 3)!; // ["b", "c", "a", "d"]: range a, b, c
    expect(crossesSeenGlass(ids, aToThree, none, { started: true, guessed: new Set(["c"]) })).toBe(true);
    expect(crossesSeenGlass(ids, aToThree, none, { started: true, guessed: new Set(["d"]) })).toBe(false);
  });

  it("before Start a guess does not hold a glass's number; a seen glass always does", () => {
    expect(crossesSeenGlass(ids, dUp, none, { started: false, guessed: new Set(["b"]) })).toBe(false);
    expect(crossesSeenGlass(ids, dUp, new Set(["c"]), { started: false })).toBe(true);
    expect(crossesSeenGlass(ids, dUp, new Set(["c"]))).toBe(true);
  });

  it("an unchanged order refuses nothing (the list never sends it)", () => {
    expect(crossesSeenGlass(ids, [...ids], new Set(ids), { started: true, semiBlindFlightFixed: true, guessed: new Set(ids) })).toBe(false);
  });
});

describe("semiBlindFlightFixed — every mode × status", () => {
  for (const revealMode of ["BLIND", "SEMI_BLIND", "OPEN"] as const)
    for (const tastingStatus of ["DRAFT", "IN_PROGRESS", "OPEN", "CLOSED"] as const) {
      const t = { revealMode, tastingStatus };
      it(`${JSON.stringify(t)} → ${semiBlindStarted(t)}`, () => expect(semiBlindFlightFixed(t)).toBe(semiBlindStarted(t)));
    }
});

describe("moveRefusalSentence (M6's move_flight_glass sentences → lobby copy)", () => {
  it("keeps the seen-glass sentence", () => {
    expect(SEEN_GLASS_REORDER_REFUSAL).toBe("A glass the table has already seen cannot change its number.");
  });
  it("maps the started semi-blind refusal to the spec's fixed-flight copy", () => {
    expect(moveRefusalSentence("a semi-blind flight is fixed once the tasting has started")).toBe(SEMI_BLIND_FLIGHT_FIXED);
  });
  it("maps both numbering refusals to the seen-glass sentence", () => {
    expect(moveRefusalSentence("a glass the table has already seen cannot change its number")).toBe(SEEN_GLASS_REORDER_REFUSAL);
    expect(
      moveRefusalSentence("a glass that has been guessed or seen cannot change its number once the tasting has started"),
    ).toBe(SEEN_GLASS_REORDER_REFUSAL);
  });
  it("tolerates case, surrounding space and a closing period", () => {
    expect(moveRefusalSentence("  A semi-blind flight is fixed once the tasting has started. ")).toBe(SEMI_BLIND_FLIGHT_FIXED);
  });
  it("null for any other sentence, which the action shows as the RPC wrote it", () => {
    expect(moveRefusalSentence("only the host can reorder the flight")).toBeNull();
    expect(moveRefusalSentence("no such place in the flight")).toBeNull();
    expect(moveRefusalSentence("")).toBeNull();
  });
});

describe("dropIndex (drag handles)", () => {
  const rows = [{ top: 0, height: 40 }, { top: 40, height: 40 }, { top: 80, height: 40 }];
  it("one place per row midpoint above the pointer, within the flight", () => {
    expect(dropIndex(rows, -10)).toBe(1);
    expect(dropIndex(rows, 19)).toBe(1);
    expect(dropIndex(rows, 21)).toBe(2);
    expect(dropIndex(rows, 61)).toBe(3);
    expect(dropIndex(rows, 500)).toBe(3);
    expect(dropIndex([], 10)).toBe(1);
  });
  it("the drag recipe: every row, with the dragged row's rect as { top: pointerY, height: 0 }", () => {
    expect(dropIndex([{ top: 61, height: 0 }, rows[1], rows[2]], 61)).toBe(2); // row 1 dragged down past row 2
    expect(dropIndex([{ top: 500, height: 0 }, rows[1], rows[2]], 500)).toBe(3); // row 1 dragged below the flight
    expect(dropIndex([rows[0], rows[1], { top: 21, height: 0 }], 21)).toBe(2); // row 3 dragged up past row 1
  });
  it("with the recipe, the glass lands after exactly the other rows whose midpoints are above the pointer", () => {
    const ids = ["a", "b", "c"];
    const above = (i: number, pointerY: number) => rows[i].top + rows[i].height / 2 < pointerY;
    for (let dragged = 0; dragged < ids.length; dragged++) {
      for (let pointerY = -20; pointerY <= 140; pointerY++) {
        const rects = rows.map((row, i) => (i === dragged ? { top: pointerY, height: 0 } : row));
        const others = ids.map((_, i) => i).filter((i) => i !== dragged);
        expect(reorderIds(ids, ids[dragged], dropIndex(rects, pointerY)), `drag ${ids[dragged]} to y=${pointerY}`).toEqual([
          ...others.filter((i) => above(i, pointerY)).map((i) => ids[i]),
          ids[dragged],
          ...others.filter((i) => !above(i, pointerY)).map((i) => ids[i]),
        ]);
      }
    }
  });
});
