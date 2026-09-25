// The one relationship value every friend surface derives its controls from
// (spec docs/superpowers/specs/2026-09-24-friend-requests-design.md §3.2).
// Pure, so vitest loads it directly; the only import is type-only and
// relative (vitest has no `@/` alias).
import type { SendOutcome } from "./types";

export type Relationship = "none" | "requested" | "incoming" | "friends";

/** `friends` wins, then `incoming`, then `requested`, else `none`. */
export function relationship(input: {
  friend: boolean;
  outgoing: boolean;
  incoming: boolean;
}): Relationship {
  if (input.friend) return "friends";
  if (input.incoming) return "incoming";
  if (input.outgoing) return "requested";
  return "none";
}

/** send_friend_request's text result, read defensively: anything but the two
 *  other words means a request was sent. */
export function sendOutcome(value: unknown): SendOutcome {
  return value === "accepted" || value === "friends" ? value : "requested";
}
