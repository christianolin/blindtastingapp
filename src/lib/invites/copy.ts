// Platform invites — owner copy, the three About lines and the validity
// states (spec §2 D1/D8/D19, §8). Pure module: no Supabase client, no
// React, no framework import, no environment read at the top level.
import type { PlatformInviteState } from "@/lib/supabase/database.types";

export type InviteState = PlatformInviteState | "unknown";

// Owner copy, verbatim (spec §8).
export const EYEBROW = "You're invited";
export const JOIN_BLINDR = "Join Blindr";
export const COPY_LINK = "Copy link";
export const SHARE = "Share";
export const SEND_BY_EMAIL = "Send by email";
export const OPEN_IN_MAIL_APP = "Open in my mail app";

// Under the invite dialog's "Their name (optional)" field (account name step
// spec D5, §4): the typed name only suggests; the invitee confirms their own
// name on the welcome step.
export const INVITEE_NAME_HINT = "They'll confirm it when they join.";

// The hero sentence, then the two "More than a score" paragraphs from
// `src/app/about/page.tsx`, quoted verbatim and in that order (spec §8).
export const ABOUT_LINES: readonly [string, string, string] = [
  "Taste with structure, challenge yourself blind, and learn more from every bottle.",
  "We believe wine deserves more than a quick score. By giving people a structured way to observe, describe, compare and learn, Blindr helps curious drinkers develop their palate.",
  "Built for enthusiasts, committed beginners, blind tasters, collectors and professionals who want to learn more from every bottle.",
];

export function invitedTitle(inviter: string): string {
  return `${inviter} invited you to Blindr`;
}

export function addFriendLabel(inviter: string): string {
  return `Add ${inviter} as a friend`;
}

/**
 * Mirrors the `get_platform_invite_preview` RPC's own rule (spec §4, D9):
 * expired wins over exhausted when both hold.
 */
export function inviteState(
  row: { expiresAt: string; uses: number; maxUses: number },
  now: Date,
): PlatformInviteState {
  if (new Date(row.expiresAt).getTime() <= now.getTime()) return "expired";
  if (row.uses >= row.maxUses) return "exhausted";
  return "ok";
}

// (plan copy) the non-ok landing/message-card lines (plan copy table).
const STATE_TITLE = "Couldn't open that invite";
const STATE_LINES: Record<Exclude<InviteState, "ok">, string> = {
  expired: "This invite link has expired.",
  exhausted: "This invite link has been used up.",
  unknown: "No invite has that code — check the link with whoever sent it.",
};

/** Title + lines for the non-ok views; `inviter` null → no "Ask … for a new one." line. */
export function stateCopy(
  state: Exclude<InviteState, "ok">,
  inviter: string | null,
): { title: string; lines: string[] } {
  const lines = [STATE_LINES[state]];
  if (inviter && (state === "expired" || state === "exhausted")) {
    lines.push(`Ask ${inviter} for a new one.`); // (plan copy)
  }
  return { title: STATE_TITLE, lines };
}

// (plan copy) the "own-link" view's pair of lines.
export const OWN_LINK_LINES: readonly [string, string] = [
  "This is your own invite link.",
  "Share it with someone who is not on Blindr yet.",
];

/** "Works until {date} · up to {n} people" — D8's defaults, shown not edited. */
export function footerLine(expiryText: string, maxUses: number): string {
  const noun = maxUses === 1 ? "person" : "people"; // (plan copy)
  return `Works until ${expiryText} · up to ${maxUses} ${noun}`;
}
