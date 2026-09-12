// Small pure helpers shared by the Overview and Your numbers stats — kept free
// of any Next/Supabase import so vitest's node environment can test them.
import type { DistributionItem } from "@/lib/overview-types";

/**
 * Sort by count (desc), keep the top `keep`, fold the rest into an "Other"
 * entry (omitted when nothing is left). Zero counts are dropped first so an
 * empty category never takes one of the visible slots.
 */
export function foldOther(
  items: DistributionItem[],
  keep: number,
): DistributionItem[] {
  const sorted = items
    .filter((i) => i.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const head = sorted.slice(0, keep);
  const rest = sorted.slice(keep).reduce((n, i) => n + i.count, 0);
  return rest > 0 ? [...head, { label: "Other", count: rest }] : head;
}

const STYLE_LABEL: Record<string, string> = {
  SPARKLING: "Sparkling",
  FORTIFIED: "Fortified",
  SWEET: "Sweet",
};
const COLOUR_LABEL: Record<string, string> = {
  RED: "Red",
  WHITE: "White",
  ROSE: "Rosé",
  ORANGE: "Orange",
};

/**
 * The "wine type" the redesign charts group by: a non-still style wins
 * (Sparkling / Fortified / Sweet), otherwise the colour (Red / White / Rosé /
 * Orange), otherwise "Other".
 */
export function wineTypeLabel(
  colour: string | null,
  style: string | null,
): string {
  if (style && STYLE_LABEL[style]) return STYLE_LABEL[style];
  if (colour && COLOUR_LABEL[colour]) return COLOUR_LABEL[colour];
  return "Other";
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Coarse "how long ago" for row metadata: today / yesterday / N days ago /
 * N weeks ago / N months ago / N years ago. Compares calendar days in UTC so a
 * plain `tasted_on` date ("2026-09-09") reads the same as a timestamp.
 */
export function relativeTime(iso: string, now: Date): string {
  const then = new Date(iso);
  const dayOf = (d: Date) =>
    Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
  const days = Math.max(0, dayOf(now) - dayOf(then));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5 && days < 31) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return months <= 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.floor(days / 365.25);
  return years <= 1 ? "1 year ago" : `${years} years ago`;
}

/**
 * Dense ranking on total (desc): ties share a rank and the next distinct total
 * gets the following rank. Null when the viewer is not among the rows.
 */
export function competitorRank(
  rows: { participantId: string; total: number }[],
  me: string,
): { rank: number; of: number } | null {
  const mine = rows.find((r) => r.participantId === me);
  if (!mine) return null;
  const distinctAbove = new Set(
    rows.filter((r) => r.total > mine.total).map((r) => r.total),
  );
  return { rank: distinctAbove.size + 1, of: rows.length };
}

/** Rounded integer percent; 0 when the whole is empty. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((100 * part) / whole) : 0;
}

/**
 * Dense ranking for a displayed standings list (reveal-6): highest score
 * first, ties share a rank, and the next distinct score takes the following
 * rank — the same rule as `competitorRank`, so a list, a rank chip and a delta
 * pill always agree. Stable among ties: tied rows keep the order they arrived
 * in. `tied` is true when another row has the same score.
 */
export function rankRows<T>(
  rows: readonly T[],
  score: (r: T) => number,
): { row: T; rank: number; tied: boolean }[] {
  const scored = rows
    .map((row, index) => ({ row, index, value: score(row) }))
    .sort((a, b) => b.value - a.value || a.index - b.index);
  const countByValue = new Map<number, number>();
  for (const s of scored) {
    countByValue.set(s.value, (countByValue.get(s.value) ?? 0) + 1);
  }
  let rank = 0;
  let previous: number | null = null;
  return scored.map((s) => {
    if (previous === null || s.value !== previous) {
      rank += 1;
      previous = s.value;
    }
    return { row: s.row, rank, tied: (countByValue.get(s.value) ?? 0) > 1 };
  });
}

/** How a rank reads in a standings list: "=2" for a tie, otherwise "2". */
export function rankLabel({ rank, tied }: { rank: number; tied: boolean }): string {
  return tied ? `=${rank}` : String(rank);
}
