import { describe, expect, it } from "vitest";
import { guessBlockReason } from "./guess-guards";

// Amendment 3 (blind-tasting ledger B0): no semi-blind freeze, so guess-guards.ts
// exports only guessBlockReason and the plan's freeze cases are void.
describe("guessBlockReason (play-8)", () => {
  const wine = { isRevealed: false, revealStep: 0, contributorParticipantId: null };
  it.each([
    [null, "This glass isn't in this tasting."],
    [{ ...wine, revealStep: 1 }, "The reveal for this glass has started — guessing is closed."],
    [{ ...wine, isRevealed: true }, "The reveal for this glass has started — guessing is closed."],
    [{ ...wine, contributorParticipantId: "me" }, "This is your bottle — you don't guess it."],
    [wine, null],
  ] as const)("%j → %s", (w, reason) => expect(guessBlockReason(w, "me")).toBe(reason));
});
