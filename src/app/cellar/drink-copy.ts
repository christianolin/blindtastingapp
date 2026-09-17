// Copy and pure date/count helpers for the drink sheet (CC-U5, spec §5.6,
// D2). Pure: the only runtime imports are the other pure modules
// (`../../lib/cellar/format`, `../../lib/count-words`) — no `server-only`,
// no Supabase client, no browser API, no `@/` alias (vitest has no alias).
import { fmtAvg, plural } from "../../lib/cellar/format";
import { countWord } from "../../lib/count-words";

export type DrinkReason = "DRANK" | "GIFTED" | "LOST" | "OTHER";

export const REASONS: readonly DrinkReason[] = ["DRANK", "GIFTED", "LOST", "OTHER"];

export const REASON_LABELS: Record<DrinkReason, string> = {
  DRANK: "Drank",
  GIFTED: "Gifted",
  LOST: "Lost",
  OTHER: "Other",
};

// The verb `confirmLabel` uses for each reason ("Drink one bottle", "Gift
// one bottle", "Write off one bottle", "Take out one bottle").
const REASON_VERBS: Record<DrinkReason, string> = {
  DRANK: "Drink",
  GIFTED: "Gift",
  LOST: "Write off",
  OTHER: "Take out",
};

export type WhenChoice = "today" | "yesterday" | "date";

export const WHEN_LABELS: Record<WhenChoice, string> = {
  today: "Today",
  yesterday: "Yesterday",
  date: "Pick a date",
};

/** `d` as a local `YYYY-MM-DD` string — the viewer's own clock, not UTC. */
export function isoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today/yesterday are computed from `now` (the caller's clock at submit
 * time); "date" passes `picked` straight through. */
export function dateFor(choice: WhenChoice, picked: string, now: Date): string {
  if (choice === "today") return isoDate(now);
  if (choice === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return isoDate(yesterday);
  }
  return picked;
}

/** What is left of the lot after taking `n` of `quantity` out. */
export function leftLine(
  quantity: number,
  n: number,
): { of: string; left: string; after: string } {
  return {
    of: `of ${quantity} ·`,
    left: `${quantity - n} left`,
    after: "after this",
  };
}

function bottleWord(n: number): string {
  return n === 1 ? "bottle" : "bottles";
}

/** "Drink one bottle" / "Drink two bottles" / "Drink 12 bottles" / "Gift one
 * bottle" / "Write off one bottle" / "Take out three bottles" — the reason's
 * verb plus the count (spelled out to ten, numerals above) plus "bottle(s)". */
export function confirmLabel(reason: DrinkReason, n: number): string {
  return `${REASON_VERBS[reason]} ${countWord(n)} ${bottleWord(n)}`;
}

/** "3 in the cellar · rack B · community 92.6 from 33 notes" — the place
 * part only when set, the community part only when there is at least one
 * note. */
export function subtitleLine(o: {
  quantity: number;
  place: string | null;
  community: { avg: number | null; count: number };
}): string {
  const parts = [`${o.quantity} in the cellar`];
  if (o.place) parts.push(o.place);
  if (o.community.count > 0) {
    parts.push(`community ${fmtAvg(o.community.avg)} from ${plural(o.community.count, "note", "notes")}`);
  }
  return parts.join(" · ");
}

/** "{name} — live now" for the occasion chip that offers a live tasting's
 * name. */
export function liveChipLabel(name: string): string {
  return `${name} — live now`;
}

export const TITLE = "Take it out of the cellar";
export const HOW_MANY = "How many";
export const WHAT_HAPPENED = "What happened to it";
export const WHEN = "When";
export const WHAT_FOR = "What for";
export const OPTIONAL = "optional";
export const WHAT_FOR_PLACEHOLDER = "Sunday lamb, someone’s birthday…";
export const NOTE_AFTER = "Write a note about it after";
export const NOTE_AFTER_SUB = " — opens the tasting note with this wine filled in.";
export const LOGGED_NOTE = "Logged, not deleted. It stays in History.";
export const CANCEL = "Cancel";
