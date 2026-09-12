import { describe, expect, it } from "vitest";
import { endTastingConfirm, notRevealedEyebrow, startLandsOnConsole } from "./tasting-lifecycle-copy";

describe("startLandsOnConsole (reveal-5)", () => {
  it.each([
    [{ timingMode: "LIVE", revealMode: "BLIND", wineSource: "HOST_PROVIDES" }, true],
    [{ timingMode: "LIVE", revealMode: "BLIND", wineSource: "PARTICIPANT_CONTRIBUTED" }, false],
    [{ timingMode: "LIVE", revealMode: "SEMI_BLIND", wineSource: "HOST_PROVIDES" }, false],
    [{ timingMode: "ASYNC", revealMode: "BLIND", wineSource: "HOST_PROVIDES" }, false],
  ] as const)("%j → %s", (t, v) => expect(startLandsOnConsole(t)).toBe(v));
});

describe("endTastingConfirm (reveal-4)", () => {
  const tail = "You can reopen it from the tasting page.";
  it.each([
    [[], `End the tasting? ${tail}`],
    [[{ glass: 6, state: "hidden" }], `Glass 6 hasn't been revealed — its answer stays hidden. ${tail}`],
    [[{ glass: 5, state: "half" }], `Glass 5 is half revealed — its answer stays hidden. ${tail}`],
    [[{ glass: 5, state: "half" }, { glass: 6, state: "hidden" }], `Glass 5 is half revealed and glass 6 hasn't been revealed — their answers stay hidden. ${tail}`],
    [[{ glass: 6, state: "hidden" }, { glass: 7, state: "hidden" }], `Glasses 6 and 7 haven't been revealed — their answers stay hidden. ${tail}`],
    [[{ glass: 2, state: "half" }, { glass: 3, state: "half" }, { glass: 4, state: "hidden" }, { glass: 5, state: "hidden" }, { glass: 6, state: "hidden" }],
      `Glasses 2 and 3 are half revealed and glasses 4, 5 and 6 haven't been revealed — their answers stay hidden. ${tail}`],
  ] as const)("%j", (glasses, text) => expect(endTastingConfirm(glasses)).toBe(text));
  it("never says it can't be undone", () => expect(endTastingConfirm([{ glass: 1, state: "hidden" }])).not.toMatch(/can't be undone/));
  it("eyebrow", () => expect(notRevealedEyebrow(5, 6)).toBe("Not revealed · glass 5 of 6"));
});
