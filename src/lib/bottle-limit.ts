import type { TastingStatus, WineSourceMode } from "@/lib/supabase/database.types";

// Bottles per person (owner request 2026-10-25): a bring-your-own tasting's
// optional cap on how many glasses each participant contributes. Stored as
// `tastings.bottles_per_person` (1-3, null = unlimited) and enforced in the
// database by the `wines_bottles_per_person_limit` BEFORE INSERT trigger
// (20261025120000). Host-added glasses never count. Lowering the limit never
// removes a bottle, it only blocks new ones. Pure: every wording rule and the
// "are the counts uneven" test live here so vitest covers them.

export type BottleLimit = 1 | 2 | 3 | null;

/** The picker's choices, in order: 1 · 2 · 3 · Unlimited. */
export const BOTTLE_LIMIT_OPTIONS: readonly BottleLimit[] = [1, 2, 3, null];

/** Anything that isn't 1, 2 or 3 reads as unlimited. */
export function parseBottleLimit(raw: unknown): BottleLimit {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  return n === 1 || n === 2 || n === 3 ? n : null;
}

/** The value stored on the tasting: only bring-your-own carries a limit. */
export function bottleLimitColumn(wineSource: WineSourceMode, limit: BottleLimit): BottleLimit {
  return wineSource === "PARTICIPANT_CONTRIBUTED" ? limit : null;
}

export function bottleLimitOptionLabel(limit: BottleLimit): string {
  return limit === null ? "Unlimited" : String(limit);
}

/** The lobby's line, e.g. "1 bottle each"; null when unlimited. */
export function bottleLimitEachLine(limit: BottleLimit): string | null {
  if (limit === null) return null;
  return limit === 1 ? "1 bottle each" : `Up to ${limit} bottles each`;
}

/** True once `mine` contributor glasses reach the limit (or exceed a lowered one). */
export function atBottleLimit(limit: BottleLimit, mine: number): boolean {
  return limit !== null && mine >= limit;
}

function yourBottles(limit: number): string {
  return limit === 1 ? "your bottle" : `your ${limit} bottles`;
}

/** Shown in place of the add action once a participant is at the limit. */
export function atLimitLine(limit: number): string {
  return `You've added ${yourBottles(limit)}`;
}

/** The server's refusal of an add past the limit. */
export function bottleLimitRefusal(limit: number): string {
  const each = limit === 1 ? "1 bottle each" : `up to ${limit} bottles each`;
  return `You've already added ${yourBottles(limit)} — this tasting is ${each}.`;
}

/** The start of the trigger's message (SQLSTATE 23514). */
export const BOTTLE_LIMIT_DB_MARKER = "bottle limit reached";

export function isBottleLimitDbError(message: string | null | undefined): boolean {
  return typeof message === "string" && message.includes(BOTTLE_LIMIT_DB_MARKER);
}

/** The trigger's raw error as friendly copy; any other message passes through. */
export function friendlyBottleLimitError(message: string, limit: BottleLimit): string {
  if (!isBottleLimitDbError(message)) return message;
  return limit === null
    ? "You've already added as many bottles as this tasting allows."
    : bottleLimitRefusal(limit);
}

export const BOTTLE_LIMIT_LOCKED_CLOSED =
  "This tasting has ended — bottles per person can't change any more.";

/** Changeable in DRAFT and while running; refused only once CLOSED. */
export function bottleLimitSettingRefusal(input: {
  status: TastingStatus;
  before: BottleLimit;
  after: BottleLimit;
}): string | null {
  if (input.status === "CLOSED" && input.before !== input.after) return BOTTLE_LIMIT_LOCKED_CLOSED;
  return null;
}

/** Under the picker whenever the choice allows unequal counts (2, 3, Unlimited). */
export function unequalBottlesHint(limit: BottleLimit): string | null {
  if (limit === 1) return null;
  return "You never guess your own bottles, so if people bring different numbers, total points aren't directly comparable. 1 bottle each keeps it fair.";
}

/**
 * Do people's contributed-bottle counts differ? `counts` holds one entry per
 * JOINED participant. Before Start only people who have brought something
 * are compared (the lobby already says who is still to add theirs); once
 * started, someone who brought nothing guesses every glass, so a zero counts.
 */
export function unevenBottleCounts(counts: readonly number[], opts: { started: boolean }): boolean {
  const compared = opts.started ? counts : counts.filter((c) => c > 0);
  return new Set(compared).size > 1;
}

/** The standings' per-person glass denominators (`totalWines`) differ. */
export function unevenGlassCounts(denominators: readonly number[]): boolean {
  return new Set(denominators).size > 1;
}

/** The notice beside the lobby list and the standings when counts differ. */
export function unevenCountsNotice(opts: { pointToCounts: boolean }): string {
  const base =
    "Not everyone brought the same number of bottles. You never guess your own, so some people had more glasses to guess — totals aren't directly comparable.";
  return opts.pointToCounts
    ? `${base} The second number in each X/Y is how many glasses that person could guess.`
    : base;
}

type ContributedGlass = { contributor_participant_id: string | null; added_by_host: boolean };

/** Glasses one participant contributed (host-added glasses never count). */
export function contributedCount(
  wines: readonly ContributedGlass[],
  participantId: string | null | undefined,
): number {
  if (!participantId) return 0;
  return wines.filter((w) => !w.added_by_host && w.contributor_participant_id === participantId).length;
}

/** One count per participant id, in the order given (for `unevenBottleCounts`). */
export function contributionCounts(
  wines: readonly ContributedGlass[],
  participantIds: readonly string[],
): number[] {
  return participantIds.map((id) => contributedCount(wines, id));
}

/** The viewer is a bring-your-own contributor already at the tasting's limit. */
export function viewerAtBottleLimit(
  tasting: { wine_source: WineSourceMode; bottles_per_person: number | null },
  wines: readonly ContributedGlass[],
  participantId: string | null | undefined,
): boolean {
  if (tasting.wine_source !== "PARTICIPANT_CONTRIBUTED") return false;
  return atBottleLimit(parseBottleLimit(tasting.bottles_per_person), contributedCount(wines, participantId));
}
