import { describe, expect, it } from "vitest";
import {
  applyAssignment, boardFromRpc, clearAssignment, glassRowState, matchedCount, poolFor,
  type Board, type BoardGlass, type BoardRow,
} from "./semi-blind-board";

const glass = (wineId: string, n: number, over: Partial<BoardGlass> = {}): BoardGlass => ({
  wineId, glass: n, isRevealed: false, revealStep: 0, ownBottle: false, ...over,
});
const row = (key: string | null, locked = false): BoardRow => ({ key, locked, scored: false, totalPoints: null });
const board = (over: Partial<Board> = {}): Board => ({
  glasses: [glass("g1", 1), glass("g2", 2), glass("g3", 3)],
  mine: {}, revealedKeyByGlass: {}, splitByGlass: {}, ownBottleKeys: [], knownKeyByGlass: {},
  ...over,
});
const card = (key: string) => ({ key });

describe("applyAssignment (B9)", () => {
  it("assigns an unheld wine", () => {
    const out = applyAssignment(board(), "g1", "k1");
    expect(out).toMatchObject({ ok: true, swappedWith: null });
    if (out.ok) expect(out.board.mine.g1.key).toBe("k1");
  });
  it("swaps with an open glass holding it", () => {
    const out = applyAssignment(board({ mine: { g1: row("k1"), g2: row("k2") } }), "g2", "k1");
    expect(out).toMatchObject({ ok: true, swappedWith: "g1" });
    if (out.ok) {
      expect(out.board.mine.g2.key).toBe("k1");
      expect(out.board.mine.g1.key).toBe("k2");
    }
  });
  it("an empty glass taking a held wine empties the holder", () => {
    const out = applyAssignment(board({ mine: { g1: row("k1") } }), "g3", "k1");
    if (!out.ok) throw new Error("expected ok");
    expect(out.board.mine.g1.key).toBeNull();
    expect(out.board.mine.g3.key).toBe("k1");
  });
  it("refuses a wine held by a locked glass, naming the glass", () => {
    expect(applyAssignment(board({ mine: { g2: row("k1", true) } }), "g1", "k1")).toEqual({ ok: false, reason: "locked-holder", holderGlass: 2 });
  });
  it("refuses revealed, own and proven wines, a locked glass and a closed glass", () => {
    expect(applyAssignment(board({ revealedKeyByGlass: { g3: "k3" } }), "g1", "k3")).toEqual({ ok: false, reason: "revealed" });
    expect(applyAssignment(board({ ownBottleKeys: ["k9"] }), "g1", "k9")).toEqual({ ok: false, reason: "not-in-pool" });
    expect(applyAssignment(board({ knownKeyByGlass: { g2: "k2" } }), "g1", "k2")).toEqual({ ok: false, reason: "not-in-pool" });
    expect(applyAssignment(board({ mine: { g1: row("k1", true) } }), "g1", "k2")).toEqual({ ok: false, reason: "glass-locked" });
    expect(applyAssignment(board({ glasses: [glass("g1", 1, { isRevealed: true })] }), "g1", "k2")).toEqual({ ok: false, reason: "glass-closed" });
  });
});

describe("clear, pool, counts", () => {
  it("clear returns the wine to the pool unless the glass is locked", () => {
    expect(clearAssignment(board({ mine: { g1: row("k1") } }), "g1").mine.g1.key).toBeNull();
    expect(clearAssignment(board({ mine: { g1: row("k1", true) } }), "g1").mine.g1.key).toBe("k1");
  });
  it("the pool leaves out assigned, revealed, own and proven wines, keeping card order", () => {
    const b = board({ mine: { g1: row("k1") }, revealedKeyByGlass: { g2: "k2" }, ownBottleKeys: ["k3"], knownKeyByGlass: { g3: "k4" } });
    expect(poolFor(["k6", "k1", "k2", "k3", "k4", "k5"].map(card), b).map((c) => c.key)).toEqual(["k6", "k5"]);
  });
  it("matched counts skip the viewer's own bottles", () => {
    const b = board({ glasses: [glass("g1", 1), glass("g2", 2, { ownBottle: true }), glass("g3", 3)], mine: { g1: row("k1") } });
    expect(matchedCount(b)).toEqual({ assigned: 1, total: 2 });
  });
});

describe("glassRowState", () => {
  const b = board({
    glasses: [glass("g1", 1, { isRevealed: true }), glass("g2", 2), glass("g3", 3), glass("g4", 4, { ownBottle: true })],
    mine: { g2: row("k2", true) },
  });
  it.each([
    ["g1", 2, "revealed"],
    ["g2", 2, "locked"],
    ["g3", 1, "not-poured"],
    ["g3", null, "open-empty"],
    ["g4", null, "own-bottle"],
  ] as const)("%s poured through %s → %s", (id, poured, state) => expect(glassRowState(b, id, poured)).toBe(state));
  it("open-assigned", () => expect(glassRowState(board({ mine: { g1: row("k1") } }), "g1", null)).toBe("open-assigned"));
});

describe("boardFromRpc", () => {
  it("maps the payload", () => {
    const b = boardFromRpc([glass("g1", 1), glass("g2", 2, { ownBottle: true })], {
      mine: [{ glass_wine_id: "g1", key: "k1", locked: true, scored: false, total_points: null }],
      revealed: [{ glass_wine_id: "g2", key: "k2" }],
      split: [{ glass_wine_id: "g2", key: "k1", count: 3 }],
      own_bottles: ["k2"],
      known: [],
    });
    expect(b.mine.g1).toEqual({ key: "k1", locked: true, scored: false, totalPoints: null });
    expect(b.revealedKeyByGlass).toEqual({ g2: "k2" });
    expect(b.splitByGlass).toEqual({ g2: [{ key: "k1", count: 3 }] });
    expect(b.ownBottleKeys).toEqual(["k2"]);
  });
  it("a null payload (not allowed to see the list) is an empty board", () => {
    expect(boardFromRpc([glass("g1", 1)], null).mine).toEqual({});
  });
});

// Beyond the plan's cases: the M9a server rules the client twin mirrors.
describe("mirroring assign_semi_blind_match / clear_semi_blind_match", () => {
  const scored = (key: string): BoardRow => ({ key, locked: true, scored: true, totalPoints: 0 });
  it("a scored row does not hold its wine: no swap, no refusal, and the wine is back in the pool", () => {
    const b = board({ mine: { g1: scored("k1") } });
    expect(applyAssignment(b, "g2", "k1")).toMatchObject({ ok: true, swappedWith: null });
    expect(poolFor([card("k1")], b).map((c) => c.key)).toEqual(["k1"]);
  });
  it("a glass with a step reveal in progress is closed", () => {
    expect(applyAssignment(board({ glasses: [glass("g1", 1, { revealStep: 1 })] }), "g1", "k1")).toEqual({ ok: false, reason: "glass-closed" });
  });
  it("re-assigning the key a glass already holds changes nothing else, and never mutates the input", () => {
    const b = board({ mine: { g1: row("k1"), g2: row("k2") } });
    const out = applyAssignment(b, "g1", "k1");
    expect(out).toMatchObject({ ok: true, swappedWith: null });
    if (out.ok) expect(out.board.mine.g2.key).toBe("k2");
    applyAssignment(b, "g2", "k1");
    expect(b.mine).toEqual({ g1: row("k1"), g2: row("k2") });
  });
  it("clearing a glass with nothing to clear returns the same board", () => {
    const b = board();
    expect(clearAssignment(b, "g1")).toBe(b);
    expect(clearAssignment(b, "gone")).toBe(b);
  });
  it("the viewer's own bottle reads as theirs even once revealed, and takes no wine", () => {
    const b = board({ glasses: [glass("g1", 1, { ownBottle: true, isRevealed: true })] });
    expect(glassRowState(b, "g1", null)).toBe("own-bottle");
    expect(applyAssignment(b, "g1", "k1")).toEqual({ ok: false, reason: "glass-closed" });
  });
  it("pacing dims only a glass the viewer has not touched", () => {
    expect(glassRowState(board({ mine: { g3: row("k3") } }), "g3", 0)).toBe("open-assigned");
  });
});
