import { describe, expect, it } from "vitest";
import { relationship, sendOutcome } from "./relationship";

describe("relationship", () => {
  it("is none with nothing between you", () => {
    expect(relationship({ friend: false, outgoing: false, incoming: false })).toBe("none");
  });

  it("is requested when only you asked", () => {
    expect(relationship({ friend: false, outgoing: true, incoming: false })).toBe("requested");
  });

  it("is incoming when they asked, even if you asked too (both pending at once)", () => {
    expect(relationship({ friend: false, outgoing: false, incoming: true })).toBe("incoming");
    expect(relationship({ friend: false, outgoing: true, incoming: true })).toBe("incoming");
  });

  it("is friends whenever a friendship exists, whatever is pending", () => {
    for (const outgoing of [false, true]) {
      for (const incoming of [false, true]) {
        expect(relationship({ friend: true, outgoing, incoming })).toBe("friends");
      }
    }
  });
});

describe("sendOutcome", () => {
  it("keeps the RPC's three words", () => {
    expect(sendOutcome("requested")).toBe("requested");
    expect(sendOutcome("accepted")).toBe("accepted");
    expect(sendOutcome("friends")).toBe("friends");
  });

  it("reads anything else as a sent request", () => {
    expect(sendOutcome(null)).toBe("requested");
    expect(sendOutcome("")).toBe("requested");
    expect(sendOutcome(1)).toBe("requested");
  });
});
