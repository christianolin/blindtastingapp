import { describe, expect, it } from "vitest";
import { LADDER_EXTRAS_NOTE, MATCH_FOOTER, lockButtonLabel, lockConfirm, lockFooter } from "./lock-copy";

const immediate = { timingMode: "ASYNC", asyncRevealPolicy: "IMMEDIATE" } as const;
describe("lock copy (play-4)", () => {
  it("labels in ASYNC + IMMEDIATE", () => {
    expect(lockButtonLabel({ ...immediate, glass: 3, match: false })).toBe("Submit glass 3 and see the answer");
    expect(lockButtonLabel({ ...immediate, glass: 3, match: true })).toBe("Submit all glasses and see the answers");
  });
  it("keeps today's copy elsewhere", () => {
    expect(lockButtonLabel({ timingMode: "LIVE", asyncRevealPolicy: "AFTER_ALL", glass: 3, match: false })).toBeNull();
    expect(lockFooter({ timingMode: "ASYNC", asyncRevealPolicy: "AFTER_ALL" })).toBeNull();
  });
  it("footer and confirms", () => {
    expect(lockFooter(immediate)).toBe("Saved as you go. Submitting scores this glass and shows you the answer — it can't be changed afterwards.");
    expect(lockConfirm({ glass: 3, blank: false })).toBe("Submit glass 3? You'll see the answer, and it can't be changed afterwards.");
    expect(lockConfirm({ glass: 3, blank: true })).toBe("You haven't answered anything — submit a blank guess for 0 points?");
  });
  it("ladder and match copy (play-5, play-7)", () => {
    expect(LADDER_EXTRAS_NOTE).toBe("Secondary grape and type designation only score if the wine has one (2 pts each). They're under More for every glass.");
    expect(MATCH_FOOTER).toBe("Every glass needs a match — a wrong match just scores 0. Locking saves every match at once and shows the others you are ready.");
  });
});
