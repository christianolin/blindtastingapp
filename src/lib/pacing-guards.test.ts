import { describe, expect, it } from "vitest";
import { CURRENT_GLASS_ONLY, PAUSED_REFUSAL } from "./console-copy";
import { revealStepRefusal, skipPlan } from "./pacing-guards";
import type { PointerGlass } from "./pour-pointer";

const g = (id: string, isRevealed = false, revealStep = 0): PointerGlass => ({ id, isRevealed, revealStep });
const flight = [g("a", true), g("b"), g("c"), g("d")];

describe("revealStepRefusal (B6)", () => {
  it("guided LIVE: only the glass pouring now", () => {
    expect(revealStepRefusal({ guided: true, paused: false, glasses: flight, pointer: "c", wineId: "c" })).toBeNull();
    expect(revealStepRefusal({ guided: true, paused: false, glasses: flight, pointer: "c", wineId: "b" })).toBe(CURRENT_GLASS_ONLY);
    expect(revealStepRefusal({ guided: true, paused: false, glasses: flight, pointer: null, wineId: "b" })).toBeNull();
  });
  it("free order reveals any glass; a pause refuses every one", () => {
    expect(revealStepRefusal({ guided: false, paused: false, glasses: flight, pointer: "c", wineId: "d" })).toBeNull();
    expect(revealStepRefusal({ guided: false, paused: true, glasses: flight, pointer: null, wineId: "b" })).toBe(PAUSED_REFUSAL);
  });
});

describe("skipPlan (B6)", () => {
  const base = { status: "IN_PROGRESS", paused: false, glasses: flight, pointer: null, revealMode: "BLIND" } as const;
  it("from the current glass to the next unrevealed one, compare-and-set on the pointer it read", () => {
    expect(skipPlan({ ...base, fromWineId: "b" })).toEqual({ targetId: "c", expectPointer: null });
    expect(skipPlan({ ...base, pointer: "d", fromWineId: "d" })).toEqual({ targetId: "b", expectPointer: "d" });
  });
  it("refuses a stale glass, a glass past step 0, a paused or a not-running tasting", () => {
    expect(skipPlan({ ...base, fromWineId: "c" })).toHaveProperty("error");
    expect(skipPlan({ ...base, glasses: [g("a", true), g("b", false, 1), g("c")], fromWineId: "b" })).toHaveProperty("error");
    expect(skipPlan({ ...base, paused: true, fromWineId: "b" })).toEqual({ error: PAUSED_REFUSAL });
    expect(skipPlan({ ...base, status: "DRAFT", fromWineId: "b" })).toHaveProperty("error");
  });
  it("nothing to skip to when the current glass is the only unrevealed one", () => {
    expect(skipPlan({ ...base, glasses: [g("a", true), g("b")], fromWineId: "b" })).toBeNull();
  });
  it("a semi-blind Skip never wraps back over glasses already open for matching (refinement 23)", () => {
    expect(skipPlan({ ...base, revealMode: "SEMI_BLIND", pointer: "d", fromWineId: "d" })).toBeNull();
  });
  it("a semi-blind Skip still guards on the pointer once current has wrapped behind it", () => {
    // d was skipped to (pointer = d) then revealed via revealFull, which
    // isn't pointer-gated — current wraps back to a even though the pointer
    // is still d. b lies before the pointer, so it must stay hidden as a
    // Skip target even though it's after the wrapped current.
    expect(
      skipPlan({
        ...base,
        revealMode: "SEMI_BLIND",
        glasses: [g("a"), g("b"), g("c"), g("d", true)],
        pointer: "d",
        fromWineId: "a",
      }),
    ).toBeNull();
  });
  it("a forward semi-blind Skip still offers the next glass", () => {
    expect(skipPlan({ ...base, revealMode: "SEMI_BLIND", fromWineId: "b" })).toEqual({
      targetId: "c",
      expectPointer: null,
    });
  });
});
