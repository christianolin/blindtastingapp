import { describe, expect, it } from "vitest";
import {
  INVITE_POLL_ACTIVE_MS,
  INVITE_POLL_IDLE_MS,
  invitePollIntervalMs,
} from "./notifications-poll";

describe("invitePollIntervalMs", () => {
  it("polls fast while an invitation is pending", () => {
    expect(invitePollIntervalMs([{ id: "a" }])).toBe(INVITE_POLL_ACTIVE_MS);
    expect(invitePollIntervalMs([{ id: "a" }, { id: "b" }])).toBe(INVITE_POLL_ACTIVE_MS);
  });

  it("backs off when nothing is pending", () => {
    expect(invitePollIntervalMs([])).toBe(INVITE_POLL_IDLE_MS);
  });

  it("keeps the idle cadence far slower than the active one", () => {
    // The whole point of the change: a viewer with no invitations should not
    // pay a ~1s server action every 15s on every page.
    expect(INVITE_POLL_IDLE_MS).toBeGreaterThanOrEqual(INVITE_POLL_ACTIVE_MS * 4);
  });
});
