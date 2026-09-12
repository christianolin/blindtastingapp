// Words for a tasting's eyebrow and chips (ledger B2 "Header", B3; map
// LOBBY-01, GUEST-09, CREATE-10).
//
// S4 draws the lobby eyebrow as
//   "Draft · blind · live · Thursday 11 Sep 19:00 · 7 participants"
// and the invitation (S5, S5b) as chips: mode · "{n} glasses so far" · flow
// word · time. These helpers return the words; `joinEyebrow` strings them
// together and skips empty parts. The formatted date is passed in by the
// caller, because dates format on the client in the viewer's zone
// (LocalDateTime) — the server's zone is not the viewer's, so an unscheduled
// or not-yet-hydrated date is simply an empty part.

import type {
  ParticipantStatus,
  RevealMode,
  TastingStatus,
  TimingMode,
} from "./supabase/database.types";

export type { ParticipantStatus, RevealMode, TastingStatus, TimingMode };

export const EYEBROW_SEPARATOR = " · ";

/** The status word: Draft, Live / In progress, Finished, or legacy Open. */
export function statusWord(status: TastingStatus, timingMode: TimingMode): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "IN_PROGRESS":
      return timingMode === "LIVE" ? "Live" : "In progress";
    case "CLOSED":
      return "Finished";
    case "OPEN":
      return "Open";
  }
}

/**
 * The reveal mode in eyebrow case. OPEN (Taste & rate) is not offered yet,
 * so it has no word and `joinEyebrow` drops it.
 */
export function modeWord(revealMode: RevealMode): string {
  switch (revealMode) {
    case "BLIND":
      return "blind";
    case "SEMI_BLIND":
      return "semi-blind";
    case "OPEN":
      return "";
  }
}

/**
 * The timing in eyebrow case. Leave it out next to the status word "Live",
 * which already says it: a running live tasting reads "Live · semi-blind"
 * (SB3), never "Live · semi-blind · live".
 */
export function timingWord(timingMode: TimingMode): string {
  switch (timingMode) {
    case "LIVE":
      return "live";
    case "ASYNC":
      return "self-paced";
  }
}

export type FlowWord = "Guided" | "Self-paced" | "Free order";

/**
 * The flow chip. Guided means one glass at a time with the host driving the
 * reveal, which only a live, blind tasting with sequential guessing does.
 */
export function flowWord(tasting: {
  revealMode: RevealMode;
  timingMode: TimingMode;
  sequentialGuessing: boolean;
}): FlowWord {
  if (tasting.timingMode === "ASYNC") return "Self-paced";
  if (tasting.revealMode === "BLIND" && tasting.sequentialGuessing) return "Guided";
  return "Free order";
}

/** "1 participant" / "7 participants", counting JOINED and INVITED people. */
export function participantsPhrase(
  participants: ReadonlyArray<{ status: ParticipantStatus }>,
): string {
  const count = participants.filter(
    (p) => p.status === "JOINED" || p.status === "INVITED",
  ).length;
  return `${count} ${count === 1 ? "participant" : "participants"}`;
}

/**
 * The flight so far, never against a planned total — no planned count exists
 * and a host may pour more.
 */
export function glassesSoFarPhrase(count: number): string {
  const n = Number.isFinite(count) ? Math.floor(count) : 0;
  if (n <= 0) return "No glasses yet";
  return n === 1 ? "1 glass so far" : `${n} glasses so far`;
}

/** Join eyebrow parts with " · ", trimming each and skipping empty ones. */
export function joinEyebrow(parts: ReadonlyArray<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(EYEBROW_SEPARATOR);
}
