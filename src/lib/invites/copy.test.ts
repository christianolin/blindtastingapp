import { describe, expect, it } from "vitest";
import { ABOUT_LINES, EYEBROW, INVITEE_NAME_HINT, addFriendLabel, footerLine, inviteState, invitedTitle, stateCopy } from "./copy";

describe("invite copy (spec §8)", () => {
  it("owner strings, verbatim", () => {
    expect(EYEBROW).toBe("You're invited");
    expect(invitedTitle("Isabelle Moreau")).toBe("Isabelle Moreau invited you to Blindr");
    expect(addFriendLabel("Isabelle Moreau")).toBe("Add Isabelle Moreau as a friend");
  });
  it("the three About lines, in order, unchanged", () => {
    expect(ABOUT_LINES).toEqual([
      "Taste with structure, challenge yourself blind, and learn more from every bottle.",
      "We believe wine deserves more than a quick score. By giving people a structured way to observe, describe, compare and learn, Blindr helps curious drinkers develop their palate.",
      "Built for enthusiasts, committed beginners, blind tasters, collectors and professionals who want to learn more from every bottle.",
    ]);
  });
  it("validity: expired wins, then the cap", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    expect(inviteState({ expiresAt: "2026-10-18T12:00:00Z", uses: 0, maxUses: 50 }, now)).toBe("ok");
    expect(inviteState({ expiresAt: "2026-09-18T12:00:00Z", uses: 0, maxUses: 50 }, now)).toBe("expired"); // boundary: <= now
    expect(inviteState({ expiresAt: "2026-10-18T12:00:00Z", uses: 50, maxUses: 50 }, now)).toBe("exhausted");
    expect(inviteState({ expiresAt: "2026-09-01T12:00:00Z", uses: 50, maxUses: 50 }, now)).toBe("expired");
  });
  it("state copy with and without an inviter", () => {
    expect(stateCopy("expired", "Isabelle Moreau").lines).toEqual(["This invite link has expired.", "Ask Isabelle Moreau for a new one."]);
    expect(stateCopy("exhausted", null).lines).toEqual(["This invite link has been used up."]);
    expect(stateCopy("unknown", null)).toEqual({ title: "Couldn't open that invite", lines: ["No invite has that code — check the link with whoever sent it."] });
  });
  it("footer", () => {
    expect(footerLine("18 Oct 2026", 50)).toBe("Works until 18 Oct 2026 · up to 50 people");
    expect(footerLine("18 Oct 2026", 1)).toBe("Works until 18 Oct 2026 · up to 1 person");
  });
});

describe("invitee name hint (account name step spec D5, §4)", () => {
  it("owner copy, verbatim", () => {
    expect(INVITEE_NAME_HINT).toBe("They'll confirm it when they join.");
  });
});
