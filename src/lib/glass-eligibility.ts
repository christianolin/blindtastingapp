// Who is expected to guess a glass, and which glasses a late joiner arrived
// too late for (ledger B4; spec §5.3 item 4). One definition for the play
// page, the host console, the ASYNC auto-reveal and the result and record
// loaders, which each carried an inline copy of the rule.
//
// Pure: no React, Next or Supabase; the only import is a type.

import type { ParticipantStatus, WineSourceMode } from "./supabase/database.types";

export type EligibilityParticipant = {
  id: string;
  userId: string;
  status: ParticipantStatus;
  joinedAt: string | null;
};

export type EligibilityGlass = {
  contributorParticipantId: string | null;
  isRevealed: boolean;
  revealedAt: string | null;
};

/**
 * Expected to guess this glass: JOINED, not the person who brought it, and not
 * the host of a host-provides tasting (the host set every answer).
 *
 * Joining late changes nothing here. A late joiner is eligible for every glass
 * and simply has no row on the ones revealed before they arrived — see
 * `joinedAfterReveal`. Readiness ("N of M locked in") is shown only for
 * unrevealed glasses, so a late joiner counts only where they can still act.
 */
export function eligibleForGlass(
  p: EligibilityParticipant,
  g: EligibilityGlass,
  t: { wineSource: WineSourceMode; hostId: string },
): boolean {
  if (p.status !== "JOINED") return false;
  if (g.contributorParticipantId === p.id) return false;
  if (t.wineSource === "HOST_PROVIDES" && p.userId === t.hostId) return false;
  return true;
}

/**
 * The glass was revealed before this participant joined: it reads "You joined
 * after this glass" and counts 0 against its maximum.
 *
 * Both stamps are needed. A glass revealed before `wines.revealed_at` existed,
 * or a participant row without `joined_at`, is never "after", so legacy
 * tastings never read it. The stamps are compared as instants rather than as
 * strings, because Postgres and ISO spell the same moment differently.
 */
export function joinedAfterReveal(p: EligibilityParticipant, g: EligibilityGlass): boolean {
  if (!g.isRevealed || g.revealedAt === null || p.joinedAt === null) return false;
  const joined = Date.parse(p.joinedAt);
  const revealed = Date.parse(g.revealedAt);
  if (Number.isNaN(joined) || Number.isNaN(revealed)) return false;
  return joined > revealed;
}
