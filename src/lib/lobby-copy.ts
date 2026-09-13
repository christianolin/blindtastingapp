// Copy for the lobby (S4, S4b), editing a glass (S4c: Swap and Remove), the
// Tasting settings sheet (S4d) and hand hosting (B11) — spec §3.3 items 1, 3,
// 7, 8, 9, 11–13; §5.3 items 1, 3; §12.3. Every string is the spec's unless a
// comment marks it (plan copy).
//
// The eyebrow words come from ./tasting-eyebrow. The date is a slot the caller
// fills with LocalDateTime, because dates format in the viewer's zone.
//
// Pure: relative imports only, so vitest loads it without the `@/` alias.

import {
  modeWord,
  participantsPhrase,
  statusWord,
  timingWord,
  type ParticipantStatus,
  type RevealMode,
  type TastingStatus,
  type TimingMode,
} from "./tasting-eyebrow";

function wholeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function nonEmpty(parts: readonly string[]): string[] {
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

// ── Lobby (S4, S4b) ─────────────────────────────────────────────────────────

/**
 * Who is at the table (LOBBY-17). Joined and Invited are listed and counted,
 * exactly as `participantsPhrase` counts them for the eyebrow; Declined
 * collapses to one "{n} declined" line and is not counted.
 */
export function participantsSummary(rows: readonly { status: ParticipantStatus }[]): {
  count: number;
  declined: number;
  declinedLine: string | null;
} {
  let count = 0;
  let declined = 0;
  for (const row of rows) {
    if (row.status === "JOINED" || row.status === "INVITED") count += 1;
    else if (row.status === "DECLINED") declined += 1;
  }
  return { count, declined, declinedLine: declined > 0 ? `${declined} declined` : null };
}

/**
 * The lobby eyebrow around its date slot (LOBBY-01, LOBBY-23; spec §3.3 item
 * 1); the caller renders `before · <date> · after`.
 * - Laptop: status · mode · timing, then the participants. The timing word goes
 *   once the tasting is running ("Live · blind", never "Live · blind · live").
 * - Phone: status · mode, then the date alone.
 * Empty words (the not-yet-offered OPEN mode) are dropped.
 */
export function lobbyEyebrowParts(
  t: {
    status: TastingStatus;
    timingMode: TimingMode;
    revealMode: RevealMode;
    participants: readonly { status: ParticipantStatus }[];
  },
  opts: { phone: boolean },
): { before: string[]; after: string[] } {
  const status = statusWord(t.status, t.timingMode);
  const mode = modeWord(t.revealMode);
  if (opts.phone) return { before: nonEmpty([status, mode]), after: [] };
  const timing = t.status === "IN_PROGRESS" ? "" : timingWord(t.timingMode);
  return {
    before: nonEmpty([status, mode, timing]),
    after: [participantsPhrase(t.participants)],
  };
}

/** The host-provides host's Wines card caption: the flight so far, never a planned count (B2). */
export function winesCaption(count: number, opts: { phone: boolean }): string {
  const n = wholeCount(count);
  return opts.phone ? `${n} so far · hidden` : `${n} so far · only you can see them`;
}

/** Under the host's inline gold Start button (spec §3.3 item 7). */
export const START_CAPTION =
  "Starting opens guessing for everyone. You can keep adding wines after it starts — the flight grows as you pour.";

/** Under the Participants card (spec copy; the handoff's sentence named the removed cogwheel). */
export const PARTICIPANTS_FOOTER = "More invites live in Tasting settings.";

/**
 * "brings wine {N}" after a bring-your-own contributor who has added a bottle
 * (LOBBY-19): N is the list-order number of their first glass. Null before they
 * have added one.
 */
export function bringsWineLine(firstGlass: number | null): string | null {
  if (firstGlass === null || !Number.isInteger(firstGlass) || firstGlass < 1) return null;
  return `brings wine ${firstGlass}`;
}

// ── Edit a wine (S4c) ───────────────────────────────────────────────────────

/**
 * What a removal takes with it, stated inline before the tap (spec §3.3 item
 * 12): "3 guesses on this glass go with it", "3 guesses and 2 private notes on
 * this glass go with it". Nothing when both counts are 0.
 */
export function removalImpactLine(guesses: number, privateNotes: number): string | null {
  const g = wholeCount(guesses);
  const n = wholeCount(privateNotes);
  const parts: string[] = [];
  if (g > 0) parts.push(g === 1 ? "1 guess" : `${g} guesses`);
  // With no guesses this is the notes-only form of the spec's sentence (plan
  // copy): "1 private note on this glass goes with it" / "{m} private notes on
  // this glass go with it".
  if (n > 0) parts.push(n === 1 ? "1 private note" : `${n} private notes`);
  if (parts.length === 0) return null;
  const verb = g + n === 1 ? "goes" : "go";
  return `${parts.join(" and ")} on this glass ${verb} with it`;
}

/**
 * The edit form's Swap and Remove rows, and the swap sheet's header and primary
 * button (spec §3.3 items 9, 11). `glass` is the glass's list-order number.
 */
export function swapCopy(glass: number): {
  row: string;
  rowSub: string;
  header: string;
  primary: string;
  remove: string;
} {
  return {
    row: "Swap for another bottle",
    rowSub: `Keeps position ${glass} and any guesses already made`,
    header: `Swap glass ${glass}`,
    primary: `Swap into glass ${glass}`,
    remove: "Remove from the flight",
  };
}

// ── Tasting settings (S4d) ──────────────────────────────────────────────────

/** Delete the tasting as an inline two-tap, replacing `window.confirm`. */
export function deleteTastingLabel(state: "idle" | "armed"): string {
  return state === "armed" ? "Tap again to delete it for everyone" : "Delete the tasting";
}

/** "Host controls · not started yet" in DRAFT; "Host controls · started" once started ("first pour" = Start). */
export function settingsEyebrow(status: TastingStatus): string {
  return status === "DRAFT" ? "Host controls · not started yet" : "Host controls · started";
}

export const SETTINGS_TITLE = "Tasting settings";

export const SETTINGS_FOOTER_DRAFT =
  "Once the first glass is poured, mode and scoring lock. Everything else stays editable.";

export const SETTINGS_FOOTER_STARTED =
  "The tasting has started — mode, timing, rules and who brings the wines are locked. Name, description, photo, time and place stay editable.";

/** Beside the mode tiles while DRAFT. */
export const MODE_STILL_CHANGEABLE = "still changeable — nothing has been poured";

/** The heading over Manage invitations, Hand hosting and Delete. */
export const ONLY_ONCE_EXISTS = "Only once a tasting exists";

export const MANAGE_INVITATIONS = "Manage invitations";

// ── Hand hosting (B11) ──────────────────────────────────────────────────────

/** The settings row; DRAFT only, hidden otherwise. */
export const HAND_HOSTING_ROW = "Hand hosting to someone";

/** The inner view once a JOINED participant is chosen (spec §12.3 item 1). */
export function handHostingCopy(name: string): { title: string; line: string; button: string } {
  const who = name.trim();
  return {
    title: "Choose who hosts",
    line: `${who} becomes the host. You stay at the table as a guest.`,
    button: `Make ${who} host`,
  };
}

// `transfer_tasting_host`'s exception messages (spec §12.4) and their sentences
// (§12.3 item 2).
const HAND_HOSTING_REFUSALS: readonly (readonly [raised: string, sentence: string])[] = [
  ["only the host can hand hosting over", "Only the host can hand hosting over."],
  ["hosting can only change before the tasting starts", "Hosting can only change before the tasting starts."],
  ["only someone who has joined can host", "Only someone who has joined can host."],
  [
    "remove the glasses you added first",
    "Remove the glasses you added first — the new host would inherit their answers.",
  ],
  [
    "finish or remove your unfinished glasses and cellar bottles first",
    "Finish or remove your unfinished glasses and cellar bottles first.",
  ],
];

// (plan copy) The spec names an unknown message but gives it no sentence.
const HAND_HOSTING_FAILED = "Hosting could not be handed over.";

/** The sentence for a failed `transfer_tasting_host` call, from the RPC's error message. */
export function handHostingRefusal(message: string): string {
  const folded = message.trim().toLowerCase();
  const hit = HAND_HOSTING_REFUSALS.find(([raised]) => folded.includes(raised));
  return hit ? hit[1] : HAND_HOSTING_FAILED;
}

// ── Invitations stay open until the end (B4) ────────────────────────────────

/** `inviteToTasting`'s refusal on a CLOSED tasting (spec §5.3 item 1). */
export const INVITES_CLOSE_WHEN_ENDED = "Invites close when the tasting ends.";

/** `JoinLinkRow`'s hint, in step 3 and in Manage invitations (spec §5.3 item 3). */
export const LINK_WORKS_UNTIL_END = "Works until the tasting ends.";
