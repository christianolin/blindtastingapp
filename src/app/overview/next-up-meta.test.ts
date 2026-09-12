import { describe, expect, it } from "vitest";
import { nextUpGlassCount, nextUpMeta } from "./next-up-meta";

describe("nextUpGlassCount", () => {
  it("is the flight's wine count: the next glass number minus one", () => {
    expect(nextUpGlassCount(1)).toBe(0);
    expect(nextUpGlassCount(2)).toBe(1);
    expect(nextUpGlassCount(7)).toBe(6);
  });

  it("never goes below zero, even for a malformed position", () => {
    expect(nextUpGlassCount(0)).toBe(0);
    expect(nextUpGlassCount(-4)).toBe(0);
    expect(nextUpGlassCount(Number.NaN)).toBe(0);
    expect(nextUpGlassCount(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("drops a fractional part rather than rounding up", () => {
    expect(nextUpGlassCount(3.9)).toBe(2);
  });
});

describe("nextUpMeta", () => {
  it("says you are hosting, then that the flight is still empty", () => {
    expect(nextUpMeta({ hosting: true, hostName: "Ada", nextWinePosition: 1 })).toBe(
      "You're hosting · No glasses yet",
    );
  });

  it("names the host when someone else is hosting", () => {
    expect(
      nextUpMeta({ hosting: false, hostName: "Gustav", nextWinePosition: 2 }),
    ).toBe("Hosted by Gustav · 1 glass so far");
  });

  it("counts several glasses", () => {
    expect(
      nextUpMeta({ hosting: false, hostName: "Gustav", nextWinePosition: 5 }),
    ).toBe("Hosted by Gustav · 4 glasses so far");
  });

  it("never names the host while you are the host", () => {
    expect(
      nextUpMeta({ hosting: true, hostName: "Gustav", nextWinePosition: 3 }),
    ).toBe("You're hosting · 2 glasses so far");
  });

  it("adds '{k} in' only when a joined count is supplied", () => {
    expect(
      nextUpMeta({ hosting: true, hostName: "Ada", nextWinePosition: 4, joinedCount: 5 }),
    ).toBe("You're hosting · 3 glasses so far · 5 in");
    expect(
      nextUpMeta({ hosting: true, hostName: "Ada", nextWinePosition: 4, joinedCount: null }),
    ).toBe("You're hosting · 3 glasses so far");
    expect(
      nextUpMeta({ hosting: true, hostName: "Ada", nextWinePosition: 4, joinedCount: 0 }),
    ).toBe("You're hosting · 3 glasses so far");
  });
});
