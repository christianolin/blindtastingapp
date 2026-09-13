import { describe, expect, it } from "vitest";
import { currentGlass, guessOrderAllows, pouredThrough, skipTarget, type PointerGlass } from "./pour-pointer";

const g = (id: string, isRevealed = false, revealStep = 0): PointerGlass => ({ id, isRevealed, revealStep });

describe("currentGlass (B6)", () => {
  it("no pointer: the lowest unrevealed glass", () => {
    expect(currentGlass([g("a", true), g("b"), g("c")], null)).toEqual({ id: "b", index: 1, wrapped: false });
  });
  it("a pointer outside the list reads as no pointer", () => {
    expect(currentGlass([g("a"), g("b")], "gone")).toEqual({ id: "a", index: 0, wrapped: false });
  });
  it("the pointer's glass while it is unrevealed", () => {
    expect(currentGlass([g("a"), g("b"), g("c")], "c")).toEqual({ id: "c", index: 2, wrapped: false });
  });
  it("after the pointer's glass is revealed: the next unrevealed glass after it", () => {
    expect(currentGlass([g("a"), g("b"), g("c", true), g("d")], "c")).toEqual({ id: "d", index: 3, wrapped: false });
  });
  it("wraps to a skipped glass when the pointer passes the end", () => {
    expect(currentGlass([g("a"), g("b", true), g("c", true)], "c")).toEqual({ id: "a", index: 0, wrapped: true });
  });
  it("null once every glass is revealed", () => {
    expect(currentGlass([g("a", true), g("b", true)], "b")).toBeNull();
    expect(currentGlass([], null)).toBeNull();
  });
});

describe("skipTarget", () => {
  const flight = [g("a"), g("b"), g("c", true), g("d")];
  it("the next unrevealed glass after the current one, wrapping", () => {
    expect(skipTarget(flight, { index: 1 })).toEqual({ id: "d", index: 3 });
    expect(skipTarget(flight, { index: 3 })).toEqual({ id: "a", index: 0 });
  });
  it("null when the current glass is the only unrevealed one", () => {
    expect(skipTarget([g("a", true), g("b"), g("c", true)], { index: 1 })).toBeNull();
  });
});

describe("pouredThrough", () => {
  it.each([
    [[g("a"), g("b"), g("c")], null, 0],
    [[g("a", true), g("b"), g("c")], null, 1],
    [[g("a", true), g("b", false, 2), g("c"), g("d")], "d", 3],
    [[g("a", true), g("b", true)], null, 1],
    [[], null, -1],
  ] as const)("%j with pointer %s → %d", (flight, pointer, index) => expect(pouredThrough(flight, pointer)).toBe(index));
});

describe("guessOrderAllows (refinement 6)", () => {
  const flight = [g("a", true), g("b"), g("c"), g("d")];
  const guided = { timingMode: "LIVE", sequentialGuessing: true } as const;
  it("blind guided: only the glass pouring now", () => {
    expect(guessOrderAllows({ ...guided, revealMode: "BLIND", glasses: flight, pointerWineId: "c", wineId: "c" })).toBe(true);
    expect(guessOrderAllows({ ...guided, revealMode: "BLIND", glasses: flight, pointerWineId: "c", wineId: "b" })).toBe(false);
  });
  it("semi-blind guided: every glass poured so far", () => {
    expect(guessOrderAllows({ ...guided, revealMode: "SEMI_BLIND", glasses: flight, pointerWineId: "c", wineId: "b" })).toBe(true);
    expect(guessOrderAllows({ ...guided, revealMode: "SEMI_BLIND", glasses: flight, pointerWineId: "c", wineId: "d" })).toBe(false);
  });
  it("free order and self-paced: any glass", () => {
    expect(guessOrderAllows({ timingMode: "LIVE", sequentialGuessing: false, revealMode: "BLIND", glasses: flight, pointerWineId: null, wineId: "d" })).toBe(true);
    expect(guessOrderAllows({ timingMode: "ASYNC", sequentialGuessing: true, revealMode: "BLIND", glasses: flight, pointerWineId: null, wineId: "d" })).toBe(true);
  });
});

describe("guessOrderAllows (refinement 6): the edges", () => {
  const flight = [g("a", true), g("b"), g("c"), g("d")];
  const guided = { timingMode: "LIVE", sequentialGuessing: true } as const;
  it("semi-blind guided: the glass pouring now is open too, with or without a pointer", () => {
    expect(guessOrderAllows({ ...guided, revealMode: "SEMI_BLIND", glasses: flight, pointerWineId: "c", wineId: "c" })).toBe(true);
    expect(guessOrderAllows({ ...guided, revealMode: "SEMI_BLIND", glasses: [g("a"), g("b")], pointerWineId: null, wineId: "a" })).toBe(true);
  });
  it("guided: a glass outside the flight is never in order", () => {
    expect(guessOrderAllows({ ...guided, revealMode: "SEMI_BLIND", glasses: flight, pointerWineId: "c", wineId: "gone" })).toBe(false);
    expect(guessOrderAllows({ ...guided, revealMode: "BLIND", glasses: flight, pointerWineId: "c", wineId: "gone" })).toBe(false);
    expect(guessOrderAllows({ ...guided, revealMode: "BLIND", glasses: [g("a", true), g("b", true)], pointerWineId: "b", wineId: "gone" })).toBe(false);
  });
  it("blind guided with every glass revealed, and OPEN, pace nothing", () => {
    expect(guessOrderAllows({ ...guided, revealMode: "BLIND", glasses: [g("a", true), g("b", true)], pointerWineId: "b", wineId: "a" })).toBe(true);
    expect(guessOrderAllows({ ...guided, revealMode: "OPEN", glasses: [g("a"), g("b")], pointerWineId: null, wineId: "b" })).toBe(true);
  });
});

// pouredThrough follows the pointer; it stays monotone because a semi-blind
// Skip never wraps (plan refinement 23, enforced by skipPlan in BT-H1).
describe("pouredThrough: a reveal step taken", () => {
  it("counts a glass beyond the current one once a step is taken", () => {
    expect(pouredThrough([g("a"), g("b"), g("c", false, 1)], null)).toBe(2);
  });
});
