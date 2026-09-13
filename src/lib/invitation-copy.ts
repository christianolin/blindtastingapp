// Copy for a guest before the tasting starts (ledger B3; spec §4.3 items 2–5;
// map GUEST-05…GUEST-33): the invitation on a phone (S5), the invitation card
// on the laptop Overview (S5b), and the joined guest waiting for Start (S6,
// S6b). The signed-in `/j/[code]` invitation reuses the same strings (BT-G3).
//
// Pure: no React, Next or Supabase. Runtime imports are relative only (vitest
// has no `@/` alias). Dates and day phrases ("in 2 days", "Thursday 19:00")
// are formatted by the caller — on the client, in the viewer's zone — and
// passed in.
//
// The numbers follow two rules:
// - Point values come from guess-ladder-math's FIELD_POINTS and the ceiling
//   from its MAX_POINTS, so the invitation can never disagree with the ladder
//   (GUEST-13).
// - Never a per-flight maximum and never a planned glass count: the host may
//   pour more, and a glass without an appellation, a secondary grape or a type
//   designation is worth less than the ceiling — hence "up to" (GUEST-12,
//   GUEST-07).

import { FIELD_POINTS, MAX_POINTS, type LadderField } from "./guess-ladder-math";
import { flowWord, glassesSoFarPhrase, joinEyebrow, modeWord } from "./tasting-eyebrow";
import type {
  AsyncRevealPolicy,
  RevealMode,
  TimingMode,
  WineLeaderboardReveal,
} from "./supabase/database.types";

export const OVERVIEW_EYEBROW = "Overview · what's happening now";
export const INVITATION_TITLE = "Invitation";
export const HOW_IT_IS_SCORED = "How it is scored";
export const BRING_A_GLASS = "Bring a glass. Everything else happens on your phone.";
export const I_AM_IN = "I am in";
export const CANT_MAKE_IT = "Can't make it";
export const SIGN_IN_TO_SAY_YES = "Sign in to say yes";
export const YOU_ARE_IN = "You are in";
export const LEAVE_TASTING = "Leave the tasting";
export const WHILE_YOU_WAIT = "While you wait";
export const WHILE_YOU_WAIT_LAPTOP = "While you wait · both open Learn";
export const ADD_TO_CALENDAR = "Add to your calendar";

/** The two Learn rows (S6); S6b sets them side by side with the shorter subs. */
export const LEARN_LINKS: readonly { title: string; sub: string; subLaptop: string; href: string }[] = [
  {
    title: "The map",
    sub: "Regions and appellations, in Learn",
    subLaptop: "Regions and appellations",
    href: "/knowledge/map",
  },
  {
    title: "Knowledge",
    sub: "Grapes, styles and vintages, in Learn",
    subLaptop: "Grapes, styles, vintages",
    href: "/knowledge",
  },
];

/** S5's row names, keyed by ladder field. "Grape" is the primary grape. */
const ROW_LABELS: Partial<Record<LadderField, string>> = {
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  primary_grape: "Grape",
  producer: "Producer",
  vintage: "Vintage",
};

/**
 * "How it is scored": the six rows every blind glass has, in ladder order. The
 * two optional fields (secondary grape, type designation) are not rows here —
 * they score only when a wine has them, and saying which wines do would leak
 * the flight (rule 1).
 */
export const SCORING_ROWS: readonly { label: string; points: number }[] = FIELD_POINTS.filter(
  (f) => !f.optional,
).map((f) => {
  const label = ROW_LABELS[f.field];
  if (label === undefined) throw new Error(`invitation-copy: no row label for "${f.field}"`);
  return { label, points: f.points };
});

/** "up to 30 points a glass" — a ceiling, never a flight total. */
const UP_TO_A_GLASS = `up to ${MAX_POINTS} points a glass`;
const ONE_POINT_A_MATCH = "one point for each glass you match";
const MAY_POUR_MORE = "may pour more — the count is whatever is in the flight tonight.";

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A count as a whole, non-negative number (bad input reads as 0). */
function wholeCount(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * The host's record under their name: "12 tastings hosted · 18.4 average".
 * The average is left out when there is none (null: no scored guesses yet),
 * which also makes `hostRecordLine(n, null)` S5b's "{n} tastings hosted".
 */
export function hostRecordLine(hostedCount: number, averagePoints: number | null): string {
  const n = wholeCount(hostedCount);
  const hosted = `${n} ${n === 1 ? "tasting" : "tastings"} hosted`;
  const average =
    averagePoints !== null && Number.isFinite(averagePoints)
      ? `${averagePoints.toFixed(1)} average`
      : null;
  return joinEyebrow([hosted, average]);
}

/** "{host} invited you" */
export function invitedYouLine(host: string): string {
  return `${host} invited you`;
}

/** Names listed before the rest collapse into "and {n} more". */
const NAMES_SHOWN = 3;

/**
 * Who has already said yes: "Gustav is in", "Gustav and Anders are in",
 * "Gustav, Anders and Sofie are in", and past three "Gustav, Anders, Sofie and
 * 2 more are in". Null when nobody has, so the line is left out. The caller
 * passes JOINED names without the viewer and the host, earliest first.
 */
export function joinedNamesLine(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is in`;
  const listed = names.length > NAMES_SHOWN ? names.slice(0, NAMES_SHOWN) : names.slice(0, -1);
  const last =
    names.length > NAMES_SHOWN ? `${names.length - NAMES_SHOWN} more` : names[names.length - 1];
  return `${listed.join(", ")} and ${last} are in`;
}

/** The mode chip: "Blind" or "Semi-blind"; nothing for the not-yet-offered open mode. */
export function modeChip(revealMode: RevealMode): string {
  return capitalise(modeWord(revealMode));
}

/**
 * The scoring line on the Overview card (S5b), after the joined names:
 * "Up to 30 points a glass, Danish Championship rules" or "One point for each
 * glass you match".
 */
export function overviewScoringLine(revealMode: RevealMode): string {
  switch (revealMode) {
    case "BLIND":
      return `${capitalise(UP_TO_A_GLASS)}, Danish Championship rules`;
    case "SEMI_BLIND":
      return capitalise(ONE_POINT_A_MATCH);
    case "OPEN":
      return "";
  }
}

/** The sentence under "How it is scored" (S5), naming the host who may pour more. */
export function scoringSentence(revealMode: RevealMode, host: string): string {
  const line = overviewScoringLine(revealMode);
  return line === "" ? "" : `${line}. ${host} ${MAY_POUR_MORE}`;
}

/** "Invitation · 2 days away", or "Invitation" when the tasting is unscheduled. */
export function invitationCardEyebrow(dayPhrase: string | null): string {
  return joinEyebrow([INVITATION_TITLE, dayPhrase]);
}

export type TonightInput = {
  revealMode: RevealMode;
  timingMode: TimingMode;
  sequentialGuessing: boolean;
  leaderboardReveal: WineLeaderboardReveal;
  asyncRevealPolicy: AsyncRevealPolicy;
  glassCount: number;
  host: string;
};

/**
 * How the evening runs: S6's Tonight card, S6b's explanation paragraph. A
 * semi-blind guest before Start also gets the "list opens when {host} starts"
 * line, which the semi-blind copy owns. Nothing for the open mode, which has
 * no scoring.
 */
export function tonightLines(input: TonightInput): string[] {
  const { revealMode, timingMode, host } = input;
  if (revealMode === "OPEN") return [];
  if (revealMode === "SEMI_BLIND") {
    return [`Match each glass to a wine on the list — ${ONE_POINT_A_MATCH}.`];
  }
  if (timingMode === "ASYNC") {
    return [
      `Guess at your own pace — ${UP_TO_A_GLASS}.`,
      input.asyncRevealPolicy === "IMMEDIATE"
        ? "You see each answer as soon as you submit."
        : "Answers show once everyone has guessed.",
    ];
  }
  if (flowWord(input) !== "Guided") {
    return [`Guess the glasses in any order — ${UP_TO_A_GLASS}.`];
  }
  // Glasses so far, never a planned count; the six things are the ladder rows.
  const count = wholeCount(input.glassCount);
  const poured =
    count > 0
      ? `${glassesSoFarPhrase(count)}, poured one at a time.`
      : "Glasses are poured one at a time.";
  return [
    `${poured} Guess six things about each — ${UP_TO_A_GLASS}.`,
    input.leaderboardReveal === "PER_WINE"
      ? `${host} reveals each glass once it is done.`
      : `${host} reveals one attribute at a time, so the table finds out together.`,
  ];
}

/** The waiting block (S6): the heading, then what Start opens. */
export function waitingLines(timingMode: TimingMode, host: string): string[] {
  const heading = `Waiting for ${host} to pour`;
  switch (timingMode) {
    case "LIVE":
      return [heading, "Glass 1 opens for everyone at the same moment."];
    case "ASYNC":
      return [heading, `Every glass opens when ${host} starts.`];
  }
}

/**
 * "At the table · 5 of 7", with "arrived" on the phone. Arrived means said
 * yes: JOINED (the host included) out of JOINED + INVITED; declined people
 * are not counted (GUEST-27).
 */
export function atTheTableLabel(joined: number, invited: number, opts: { phone: boolean }): string {
  const arrived = wholeCount(joined);
  const label = `At the table · ${arrived} of ${arrived + wholeCount(invited)}`;
  return opts.phone ? `${label} arrived` : label;
}

/** "{host} is hosting · blind", with " · guided" on a laptop when the flow is Guided. */
export function guestEyebrow(
  t: { host: string; revealMode: RevealMode; guided: boolean },
  opts: { phone: boolean },
): string {
  return joinEyebrow([
    `${t.host} is hosting`,
    modeWord(t.revealMode),
    t.guided && !opts.phone ? "guided" : null,
  ]);
}
