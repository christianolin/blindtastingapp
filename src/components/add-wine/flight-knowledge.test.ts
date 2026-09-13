import { describe, expect, it } from "vitest";
import { callerKnowsWine } from "./flight-knowledge";

const w = (o: Partial<Parameters<typeof callerKnowsWine>[0]> = {}) =>
  ({ hostId: "h", wineSource: "HOST_PROVIDES", isRevealed: false, contributorUserId: null, ...o }) as Parameters<typeof callerKnowsWine>[0];
describe("callerKnowsWine (sources-3, create-3)", () => {
  it("host of a host-provides tasting", () => expect(callerKnowsWine(w(), "h")).toBe(true));
  it("bring-your-own host: a guest's bottle is hidden, their own is known", () => {
    expect(callerKnowsWine(w({ wineSource: "PARTICIPANT_CONTRIBUTED", contributorUserId: "g" }), "h")).toBe(false);
    expect(callerKnowsWine(w({ wineSource: "PARTICIPANT_CONTRIBUTED", contributorUserId: "h" }), "h")).toBe(true);
  });
  it("the contributor", () => expect(callerKnowsWine(w({ wineSource: "PARTICIPANT_CONTRIBUTED", contributorUserId: "g" }), "g")).toBe(true));
  it("anyone, once revealed", () => expect(callerKnowsWine(w({ wineSource: "PARTICIPANT_CONTRIBUTED", contributorUserId: "g", isRevealed: true }), "x")).toBe(true));
  it("no semi-blind exception: a hidden candidate is not known (D10)", () =>
    expect(callerKnowsWine(w({ wineSource: "PARTICIPANT_CONTRIBUTED", contributorUserId: "g" }), "x")).toBe(false));
});
