import { describe, expect, it } from "vitest";
import { callerKnowsWine, searchShowsCatalogWine } from "./flight-knowledge";

describe("searchShowsCatalogWine (spec 2026-09-19-rule1-older-leaks D16)", () => {
  it("a public wine is listed for everyone", () => {
    expect(searchShowsCatalogWine({ blindPending: false, createdBy: "c" }, "x")).toBe(true);
    expect(searchShowsCatalogWine({ blindPending: false, createdBy: null }, "x")).toBe(true);
  });
  it("a hidden wine is listed for its creator, who reads it already", () =>
    expect(searchShowsCatalogWine({ blindPending: true, createdBy: "c" }, "c")).toBe(true));
  it("a hidden wine is never listed for anyone else", () => {
    expect(searchShowsCatalogWine({ blindPending: true, createdBy: "c" }, "x")).toBe(false);
    expect(searchShowsCatalogWine({ blindPending: true, createdBy: null }, "x")).toBe(false);
  });
});

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
