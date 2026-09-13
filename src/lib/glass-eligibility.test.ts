import { describe, expect, it } from "vitest";
import {
  eligibleForGlass,
  joinedAfterReveal,
  type EligibilityGlass,
  type EligibilityParticipant,
} from "./glass-eligibility";

const p = (over: Partial<EligibilityParticipant> = {}): EligibilityParticipant => ({
  id: "p1", userId: "u1", status: "JOINED", joinedAt: "2026-09-13T19:30:00Z", ...over,
});
const g = (over: Partial<EligibilityGlass> = {}): EligibilityGlass => ({
  contributorParticipantId: null, isRevealed: false, revealedAt: null, ...over,
});
const hostProvides = { wineSource: "HOST_PROVIDES", hostId: "host" } as const;
const byo = { wineSource: "PARTICIPANT_CONTRIBUTED", hostId: "host" } as const;

describe("eligibleForGlass (B4)", () => {
  it("a JOINED guest is eligible, a late joiner included", () => {
    expect(eligibleForGlass(p(), g(), hostProvides)).toBe(true);
    expect(eligibleForGlass(
      p({ joinedAt: "2026-09-13T21:00:00Z" }),
      g({ isRevealed: true, revealedAt: "2026-09-13T20:00:00Z" }),
      hostProvides,
    )).toBe(true);
  });
  it("never INVITED or DECLINED, never the contributor, never the host-provides host", () => {
    expect(eligibleForGlass(p({ status: "INVITED" }), g(), hostProvides)).toBe(false);
    expect(eligibleForGlass(p({ status: "DECLINED" }), g(), hostProvides)).toBe(false);
    expect(eligibleForGlass(p(), g({ contributorParticipantId: "p1" }), byo)).toBe(false);
    expect(eligibleForGlass(p({ userId: "host" }), g(), hostProvides)).toBe(false);
    expect(eligibleForGlass(p({ userId: "host" }), g({ contributorParticipantId: "p9" }), byo)).toBe(true);
  });
});

describe("joinedAfterReveal", () => {
  const revealed = g({ isRevealed: true, revealedAt: "2026-09-13T20:00:00Z" });
  it("only with both stamps and the join after the reveal", () => {
    expect(joinedAfterReveal(p({ joinedAt: "2026-09-13T21:00:00Z" }), revealed)).toBe(true);
    expect(joinedAfterReveal(p({ joinedAt: "2026-09-13T19:00:00Z" }), revealed)).toBe(false);
    expect(joinedAfterReveal(p({ joinedAt: null }), revealed)).toBe(false);
    expect(joinedAfterReveal(p({ joinedAt: "2026-09-13T21:00:00Z" }), g({ isRevealed: true, revealedAt: null }))).toBe(false);
    expect(joinedAfterReveal(p({ joinedAt: "2026-09-13T21:00:00Z" }), g())).toBe(false);
  });
});
