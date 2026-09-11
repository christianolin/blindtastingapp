// Pure maths behind the Your numbers page (/profile/numbers). No Next or
// Supabase import so vitest's node environment can test every function; the
// fetcher in your-numbers.ts feeds these rows it read under RLS.
//
// Dates are compared in UTC throughout: `tasted_on` / `purchased_on` /
// `consumed_on` are plain dates ("2026-09-09", parsed as midnight UTC) and
// `scored_at` / `created_at` are timestamps, so a UTC calendar-day comparison
// treats both the same way (see stats-math's relativeTime).
import type {
  AccuracyRow,
  CountRow,
  NumbersRange,
  PointsPerTasting,
} from "@/lib/your-numbers-types";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function parse(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole days since the epoch, on the UTC calendar. */
function utcDay(d: Date): number {
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS,
  );
}

/** Months since year 0 — a comparable index for calendar months. */
function monthIndex(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** One decimal, with -0 normalised to 0. */
function round1(n: number): number {
  return Math.round(n * 10) / 10 + 0;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Whether a date falls inside the selected range: all-time always; this-year
 * is the same UTC calendar year as `now`; 90 days is today plus the 89 days
 * before it. A future-dated row (a taster ahead of UTC logging "today") is
 * still "recent", so only the lower bound is enforced for 90d.
 */
export function inRange(iso: string, range: NumbersRange, now: Date): boolean {
  if (range === "all") return true;
  const then = parse(iso);
  if (!then) return false;
  if (range === "year") return then.getUTCFullYear() === now.getUTCFullYear();
  return utcDay(now) - utcDay(then) < 90;
}

/**
 * The per-category point columns of a scored guess. A null column means the
 * category did not apply to that wine (no appellation, a semi-blind match…),
 * never "wrong" — the same rule profile-stats' tallyGuess follows.
 */
export type ScoredGuess = {
  country_points: number | null;
  region_points: number | null;
  appellation_points: number | null;
  primary_grape_points: number | null;
  producer_points: number | null;
  vintage_points: number | null;
  total_points: number | null;
};

// Row order and the "correct" rule per category: full marks for the plain
// categories (Danish Championship maxima), and any credit at all for the
// vintage row since it is labelled "±1" (exact = 2, off by one year = 1).
const ACCURACY_ROWS: {
  label: string;
  key: keyof ScoredGuess;
  correct: (points: number) => boolean;
}[] = [
  { label: "Country", key: "country_points", correct: (p) => p === 2 },
  { label: "Region", key: "region_points", correct: (p) => p === 3 },
  { label: "Appellation", key: "appellation_points", correct: (p) => p === 5 },
  { label: "Grape", key: "primary_grape_points", correct: (p) => p === 8 },
  { label: "Vintage ±1", key: "vintage_points", correct: (p) => p >= 1 },
  { label: "Producer", key: "producer_points", correct: (p) => p === 6 },
];

/** Correct / applicable per category, in the page's fixed row order. */
export function accuracyRows(guesses: ScoredGuess[]): AccuracyRow[] {
  return ACCURACY_ROWS.map(({ label, key, correct }) => {
    let applicable = 0;
    let hits = 0;
    for (const g of guesses) {
      const points = g[key];
      if (points === null) continue;
      applicable++;
      if (correct(points)) hits++;
    }
    return { label, correct: hits, applicable };
  });
}

/**
 * Points per tasting from per-guess rows: sums each tasting's points, dates
 * it by its latest scored_at, and returns the newest `limit` tastings oldest
 * → newest (pass Infinity for every tasting).
 */
export function pointsPerTasting(
  rows: { tastingId: string; name: string; points: number; scoredAt: string }[],
  limit = 8,
): PointsPerTasting[] {
  const byTasting = new Map<string, PointsPerTasting>();
  for (const r of rows) {
    const cur = byTasting.get(r.tastingId);
    if (!cur) {
      byTasting.set(r.tastingId, {
        tastingId: r.tastingId,
        name: r.name,
        points: r.points,
        scoredAt: r.scoredAt,
      });
      continue;
    }
    cur.points += r.points;
    if (Date.parse(r.scoredAt) > Date.parse(cur.scoredAt)) cur.scoredAt = r.scoredAt;
  }
  const ordered = [...byTasting.values()].sort(
    (a, b) => Date.parse(a.scoredAt) - Date.parse(b.scoredAt),
  );
  return limit > 0 ? ordered.slice(-limit) : [];
}

/**
 * Mean of the newer half minus mean of the older half (the middle value of
 * an odd count goes to the older half), one decimal. Null below four
 * tastings — two-versus-two is the least that reads as a direction.
 */
export function trend(points: number[]): { delta: number; over: number } | null {
  if (points.length < 4) return null;
  const split = Math.ceil(points.length / 2);
  return {
    delta: round1(mean(points.slice(split)) - mean(points.slice(0, split))),
    over: points.length,
  };
}

/** How often a list of finishing ranks landed 1st / 2nd / 3rd / lower. */
export function placementBuckets(ranks: number[]): {
  first: number;
  second: number;
  third: number;
  lower: number;
} {
  const out = { first: 0, second: 0, third: 0, lower: 0 };
  for (const r of ranks) {
    if (r === 1) out.first++;
    else if (r === 2) out.second++;
    else if (r === 3) out.third++;
    else out.lower++;
  }
  return out;
}

/**
 * Average points per wine by region, for regions with at least `minWines`
 * wines, best first, capped at `limit`. Ties break on more wines, then name.
 */
export function bestRegions(
  rows: { region: string; points: number }[],
  minWines = 2,
  limit = 4,
): { label: string; avgPoints: number; wines: number }[] {
  const acc = new Map<string, { sum: number; wines: number }>();
  for (const r of rows) {
    const cur = acc.get(r.region) ?? { sum: 0, wines: 0 };
    cur.sum += r.points;
    cur.wines++;
    acc.set(r.region, cur);
  }
  return [...acc.entries()]
    .filter(([, v]) => v.wines >= minWines)
    .map(([label, v]) => ({ label, avg: v.sum / v.wines, wines: v.wines }))
    .sort(
      (a, b) => b.avg - a.avg || b.wines - a.wines || a.label.localeCompare(b.label),
    )
    .slice(0, limit)
    .map(({ label, avg, wines }) => ({ label, avgPoints: round1(avg), wines }));
}

const SCORE_LABELS = ["<80", "80–84", "85–89", "90–94", "95+"];

/** Quality scores bucketed for the Score distribution chart (always 5 rows). */
export function scoreBuckets(scores: number[]): CountRow[] {
  const counts = [0, 0, 0, 0, 0];
  for (const s of scores) {
    const i = s < 80 ? 0 : s < 85 ? 1 : s < 90 ? 2 : s < 95 ? 3 : 4;
    counts[i]++;
  }
  return SCORE_LABELS.map((label, i) => ({ label, count: counts[i] }));
}

/**
 * The calendar months ending at now's month, oldest → newest, each as its
 * short English month name — the shared frame for the two time-series
 * charts. Returns the first month's index alongside so callers can place a
 * date in the frame.
 */
function monthFrame(now: Date, months: number): { start: number; labels: string[] } {
  const start = monthIndex(now) - months + 1;
  const labels = Array.from(
    { length: months },
    (_, i) => MONTHS[(((start + i) % 12) + 12) % 12],
  );
  return { start, labels };
}

/** Dates per calendar month over the last `months` months, zero-filled. */
export function monthlyCounts(dates: string[], now: Date, months = 8): CountRow[] {
  const { start, labels } = monthFrame(now, months);
  const counts = new Array<number>(months).fill(0);
  for (const iso of dates) {
    const d = parse(iso);
    if (!d) continue;
    const i = monthIndex(d) - start;
    if (i >= 0 && i < months) counts[i]++;
  }
  return labels.map((label, i) => ({ label, count: counts[i] }));
}

/**
 * Whether now's calendar month holds strictly more dates than every other
 * month on record — "your best yet" means best ever, so this tallies every
 * date, not just the months the chart shows. False with nothing this month.
 */
export function isBestMonth(dates: string[], now: Date): boolean {
  const counts = new Map<number, number>();
  for (const iso of dates) {
    const d = parse(iso);
    if (!d) continue;
    const m = monthIndex(d);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  const thisMonth = monthIndex(now);
  const thisCount = counts.get(thisMonth) ?? 0;
  return (
    thisCount > 0 &&
    [...counts].every(([m, c]) => m === thisMonth || c < thisCount)
  );
}

/** ISO week index (Monday-start, UTC): 1970-01-01 was a Thursday, so shift by 3. */
function isoWeekIndex(d: Date): number {
  return Math.floor((utcDay(d) + 3) / 7);
}

/**
 * The longest run of consecutive ISO weeks that each contain at least one
 * date. Week indices are absolute (not week-of-year), so a run across New
 * Year counts the same as any other.
 */
export function longestWeeklyStreak(dates: string[]): number {
  const weeks = [
    ...new Set(
      dates
        .map(parse)
        .filter((d): d is Date => d !== null)
        .map(isoWeekIndex),
    ),
  ].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < weeks.length; i++) {
    run = i > 0 && weeks[i] === weeks[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

const VINTAGE_LABELS = ["≤2010", "2011–14", "2015–17", "2018–20", "2021+"];

/**
 * Bottles per vintage band for the "Vintages in the rack" chart, weighted by
 * quantity. Null years (NV, tawny) are left out — the chart is about years.
 */
export function vintageBuckets(
  lots: { year: number | null; quantity: number }[],
): CountRow[] {
  const counts = [0, 0, 0, 0, 0];
  for (const lot of lots) {
    const y = lot.year;
    if (y === null) continue;
    const i = y <= 2010 ? 0 : y <= 2014 ? 1 : y <= 2017 ? 2 : y <= 2020 ? 3 : 4;
    counts[i] += lot.quantity;
  }
  return VINTAGE_LABELS.map((label, i) => ({ label, count: counts[i] }));
}

/**
 * Weighted (lower) median: the smallest value at which the cumulative weight
 * reaches half the total. Null when there is no weight at all.
 */
export function weightedMedian(
  items: { value: number; weight: number }[],
): number | null {
  const sorted = items
    .filter((i) => i.weight > 0)
    .sort((a, b) => a.value - b.value);
  const total = sorted.reduce((n, i) => n + i.weight, 0);
  if (total <= 0) return null;
  let cumulative = 0;
  for (const i of sorted) {
    cumulative += i.weight;
    if (cumulative >= total / 2) return i.value;
  }
  return sorted[sorted.length - 1].value;
}

/**
 * Bottles added and drunk per calendar month over the last `months` months,
 * oldest → newest, zero-filled, for the stacked "Bottles in, bottles out"
 * chart.
 */
export function movementsByMonth(
  added: { on: string; qty: number }[],
  removed: { on: string; qty: number }[],
  now: Date,
  months = 6,
): { label: string; added: number; drunk: number }[] {
  const { start, labels } = monthFrame(now, months);
  const rows = labels.map((label) => ({ label, added: 0, drunk: 0 }));
  const tally = (list: { on: string; qty: number }[], field: "added" | "drunk") => {
    for (const m of list) {
      const d = parse(m.on);
      if (!d) continue;
      const i = monthIndex(d) - start;
      if (i >= 0 && i < months) rows[i][field] += m.qty;
    }
  };
  tally(added, "added");
  tally(removed, "drunk");
  return rows;
}

/** The period the cellar footer rows name ("Added this year"). */
export function rangeLabel(range: NumbersRange): string {
  return range === "90d" ? "in the last 90 days" : "this year";
}

/**
 * The window the cellar footer rows sum over — the one `rangeLabel` names.
 * All-time has no period of its own, so its footer reads "this year" and
 * must count this year, not every movement ever.
 */
export function footerRange(range: NumbersRange): NumbersRange {
  return range === "90d" ? "90d" : "year";
}
