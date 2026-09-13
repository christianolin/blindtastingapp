import { describe, expect, it } from "vitest";
import {
  CONSOLE_PAUSED,
  CURRENT_GLASS_ONLY,
  NEXT_ATTRIBUTE,
  PAUSED_REFUSAL,
  nextChipLabel,
  notLockedLine,
  pausedBand,
  pouringNowEyebrow,
  revealEverythingLabel,
  skipLabel,
  skippedEyebrow,
  stepRevealApplies,
  twoTapState,
} from "./console-copy";

describe("notLockedLine (S7, S7b)", () => {
  const tail = "They are scored on whatever they have already answered — nothing at all if they have not started.";
  it("laptop", () => {
    expect(notLockedLine([], { phone: false })).toBeNull();
    expect(notLockedLine(["Maja"], { phone: false })).toBe(`Maja has not locked in. ${tail}`);
    expect(notLockedLine(["Maja", "Gustav"], { phone: false })).toBe(`Maja and Gustav have not locked in. ${tail}`);
    expect(notLockedLine(["Maja", "Gustav", "Anders"], { phone: false })).toBe(`Maja, Gustav and 1 other have not locked in. ${tail}`);
    expect(notLockedLine(["Maja", "Gustav", "Anders", "Sofie"], { phone: false })).toBe(`Maja, Gustav and 2 others have not locked in. ${tail}`);
  });
  it("phone", () => {
    expect(notLockedLine(["Maja"], { phone: true })).toBe("Maja is scored on what they have answered — nothing if they have not started.");
    expect(notLockedLine(["Maja", "Gustav"], { phone: true })).toBe("Maja and Gustav are scored on what they have answered — nothing if they have not started.");
    expect(notLockedLine(["Maja", "Gustav", "Anders"], { phone: true })).toBe(
      "Maja, Gustav and 1 other are scored on what they have answered — nothing if they have not started.",
    );
  });
});

describe("pause, skip and the pointer (B6)", () => {
  it("copy", () => {
    expect(pausedBand("Christian")).toBe("Paused · Christian has paused the tasting. You can still change and lock your guess.");
    expect(CONSOLE_PAUSED).toBe("Paused — reveals and Skip wait until you resume.");
    expect(PAUSED_REFUSAL).toBe("The tasting is paused — resume to reveal.");
    expect(CURRENT_GLASS_ONLY).toBe("Reveal the glass that is pouring now.");
    expect(NEXT_ATTRIBUTE).toBe("Reveal the next attribute");
    expect(pouringNowEyebrow(3, 6)).toBe("Pouring now · glass 3 of 6 so far");
    expect(skippedEyebrow(3)).toBe("Glass 3 was skipped · Pour it now");
    expect(skipLabel(4)).toBe("Skip to glass 4 →");
    expect(nextChipLabel(6, 2)).toBe("4 to go");
    expect(nextChipLabel(null, 0)).toBe("Next");
  });
});

describe("stepRevealApplies (Q8, REVEAL-02)", () => {
  it("only guided LIVE blind tastings reveal attribute by attribute", () => {
    expect(stepRevealApplies({ revealMode: "BLIND", timingMode: "LIVE", sequentialGuessing: true })).toBe(true);
    expect(stepRevealApplies({ revealMode: "BLIND", timingMode: "LIVE", sequentialGuessing: false })).toBe(false);
    expect(stepRevealApplies({ revealMode: "BLIND", timingMode: "ASYNC", sequentialGuessing: true })).toBe(false);
    expect(stepRevealApplies({ revealMode: "SEMI_BLIND", timingMode: "LIVE", sequentialGuessing: true })).toBe(false);
  });
});

describe("two-tap confirm", () => {
  it("arms for five seconds", () => {
    expect(twoTapState(null, 1_000)).toBe("idle");
    expect(twoTapState(1_000, 1_000)).toBe("armed");
    expect(twoTapState(1_000, 5_999)).toBe("armed");
    expect(twoTapState(1_000, 6_000)).toBe("idle");
  });
  it("labels Reveal everything", () => {
    expect(revealEverythingLabel("idle")).toBe("Reveal everything");
    expect(revealEverythingLabel("armed")).toBe("Tap again to reveal everything");
  });
});

// Edges beyond the plan's block (BT-P4): the console and RevealView lean on these.
describe("console copy edges", () => {
  it("the Next chip stays bare at step 0 even when a count is known, and never reads '0 to go'", () => {
    expect(nextChipLabel(7, 0)).toBe("Next");
    expect(nextChipLabel(6, 6)).toBe("Next");
    expect(nextChipLabel(5, 1)).toBe("4 to go");
  });
  it("a clock that runs backwards never leaves the confirm armed", () => {
    expect(twoTapState(6_000, 1_000)).toBe("idle");
  });
});
