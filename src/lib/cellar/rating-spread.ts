// Community rating spread for the lot sheet (CC-P3, D7). Pure: no
// `server-only`, no Supabase client. Computed over a wine's scored notes —
// an unscored note (`score: null`) never counts toward `avg`, the ends or
// `byFriends`. The viewer is never in their own friend set, so their own
// notes never count as "by friends" (that is the caller's job, not this
// module's).
import type { RatingSpread } from "./types";
import { plural } from "./format";

export type ScoredNote = { score: number | null; authorId: string };

/** Rounds to one decimal the same way `format.ts`'s `fmtAvg` does — nudged
 * by `Number.EPSILON` first so a true decimal `.x5` rounds half up instead
 * of falling to the binary float representation's rounding-down quirk. */
function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

export function ratingSpread(
  notes: readonly ScoredNote[],
  friendIds: ReadonlySet<string>,
): RatingSpread {
  const scores = notes
    .filter((n): n is ScoredNote & { score: number } => n.score != null)
    .map((n) => n.score);
  if (scores.length === 0) {
    return { avg: null, count: 0, highest: null, lowest: null, byFriends: 0 };
  }
  const sum = scores.reduce((a, b) => a + b, 0);
  const byFriends = notes.filter(
    (n) => n.score != null && friendIds.has(n.authorId),
  ).length;
  return {
    avg: round1(sum / scores.length),
    count: scores.length,
    highest: Math.max(...scores),
    lowest: Math.min(...scores),
    byFriends,
  };
}

export function notesLine(s: RatingSpread): string {
  return plural(s.count, "note", "notes");
}

export function spreadLine(
  s: RatingSpread,
  opts: { phone: boolean },
): string | null {
  if (s.count === 0 || s.highest == null || s.lowest == null) return null;
  const base = notesLine(s);
  if (s.highest === s.lowest) return `${base} · ${s.highest}`;
  return opts.phone
    ? `${base} · ${s.lowest} to ${s.highest}`
    : `${base} · highest ${s.highest} · lowest ${s.lowest}`;
}

export function friendsLine(s: RatingSpread): string | null {
  if (s.byFriends <= 0) return null;
  return s.byFriends === 1 ? "1 by a friend" : `${s.byFriends} by friends`;
}
