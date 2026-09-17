// History maths (CC-P4): year totals, filters, month buckets and per-row
// copy for the History surface (spec §5.7, §4 "history-math.ts"). Pure: no
// Supabase client, no browser API. Every count here is in BOTTLES (the sum
// of `quantity`), not rows — a two-bottle consumption counts as two.
import { monthLabel, plural } from "./format";
import type { ConsumptionReason, HistoryFilter, HistoryRow } from "./types";

function yearOf(dateOrIso: string): number {
  return Number(dateOrIso.slice(0, 4));
}

export function yearsPresent(rows: readonly HistoryRow[]): number[] {
  const years = new Set<number>();
  for (const r of rows) years.add(yearOf(r.consumedOn));
  return Array.from(years).sort((a, b) => b - a);
}

export function rowsInYear(
  rows: readonly HistoryRow[],
  year: number,
): HistoryRow[] {
  return rows.filter((r) => yearOf(r.consumedOn) === year);
}

export type YearTotals = {
  bottles: number;
  atTasting: number;
  atHome: number;
  gifted: number;
  writtenUp: number;
  notWrittenUp: number;
};

/** Over rows already narrowed to one year (`rowsInYear`). */
export function yearTotals(rows: readonly HistoryRow[]): YearTotals {
  let bottles = 0;
  let atTasting = 0;
  let atHome = 0;
  let gifted = 0;
  let writtenUp = 0;
  let notWrittenUp = 0;
  for (const r of rows) {
    bottles += r.quantity;
    if (r.note) writtenUp += r.quantity;
    else notWrittenUp += r.quantity;
    if (r.tasting) atTasting += r.quantity;
    else if (r.reason === "DRANK") atHome += r.quantity;
    if (r.reason === "GIFTED") gifted += r.quantity;
  }
  return { bottles, atTasting, atHome, gifted, writtenUp, notWrittenUp };
}

export function yearBand(
  t: YearTotals,
  year: number,
  opts: { phone: boolean },
): { headline: string; split: string; notes: string } {
  const split = `${t.atTasting} at a tasting · ${t.atHome} at home · ${t.gifted} gifted`;
  if (opts.phone) {
    return {
      headline: `${t.bottles}`,
      split,
      notes: `bottles · ${t.writtenUp} written up`,
    };
  }
  return {
    headline: `${t.bottles} bottles in ${year}`,
    split,
    notes: `${t.writtenUp} you wrote up · ${t.notWrittenUp} you did not`,
  };
}

export const HISTORY_FILTERS: readonly HistoryFilter[] = [
  "all",
  "drank",
  "gifted",
  "tasting",
  "noNote",
];

export function filterRows(
  rows: readonly HistoryRow[],
  f: HistoryFilter,
): HistoryRow[] {
  switch (f) {
    case "all":
      return [...rows];
    case "drank":
      return rows.filter((r) => r.reason === "DRANK");
    case "gifted":
      return rows.filter((r) => r.reason === "GIFTED");
    case "tasting":
      return rows.filter((r) => r.tasting != null);
    case "noNote":
      return rows.filter((r) => r.note == null);
    default:
      return [...rows];
  }
}

/** Bottle counts (not row counts) per filter. */
export function filterCounts(
  rows: readonly HistoryRow[],
): Record<HistoryFilter, number> {
  const counts: Record<HistoryFilter, number> = {
    all: 0,
    drank: 0,
    gifted: 0,
    tasting: 0,
    noNote: 0,
  };
  for (const f of HISTORY_FILTERS) {
    counts[f] = filterRows(rows, f).reduce((n, r) => n + r.quantity, 0);
  }
  return counts;
}

const FILTER_LABELS_LAPTOP: Record<HistoryFilter, string> = {
  all: "Everything",
  drank: "Drank",
  gifted: "Gifted",
  tasting: "At a tasting",
  noNote: "Without a note",
};
const FILTER_LABELS_PHONE: Record<HistoryFilter, string> = {
  all: "All",
  drank: "Drank",
  gifted: "Gifted",
  tasting: "Tastings",
  noNote: "No note",
};

export function filterLabel(
  f: HistoryFilter,
  count: number,
  opts: { phone: boolean },
): string {
  const label = opts.phone ? FILTER_LABELS_PHONE[f] : FILTER_LABELS_LAPTOP[f];
  return `${label} ${count}`;
}

export type MonthBucket = {
  key: string;
  label: string;
  bottles: number;
  writtenUp: number;
  rows: HistoryRow[];
};

function compareRowsDesc(a: HistoryRow, b: HistoryRow): number {
  if (a.consumedOn !== b.consumedOn) {
    return a.consumedOn < b.consumedOn ? 1 : -1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? 1 : -1;
  }
  return 0;
}

/** Newest month first; rows within a bucket sorted `consumedOn` desc, then
 * `createdAt` desc. */
export function monthBuckets(rows: readonly HistoryRow[]): MonthBucket[] {
  const groups = new Map<string, HistoryRow[]>();
  for (const r of rows) {
    const key = r.consumedOn.slice(0, 7); // "YYYY-MM"
    const existing = groups.get(key);
    if (existing) existing.push(r);
    else groups.set(key, [r]);
  }
  const keys = Array.from(groups.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return keys.map((key) => {
    const groupRows = [...groups.get(key)!].sort(compareRowsDesc);
    let bottles = 0;
    let writtenUp = 0;
    for (const r of groupRows) {
      bottles += r.quantity;
      if (r.note) writtenUp += r.quantity;
    }
    return { key, label: monthLabel(`${key}-01`), bottles, writtenUp, rows: groupRows };
  });
}

export function monthLine(b: MonthBucket, opts: { phone: boolean }): string {
  const bottles = plural(b.bottles, "bottle", "bottles");
  if (opts.phone) return bottles;
  return `${bottles} · ${b.writtenUp} written up`;
}

export type WhereLine =
  | { kind: "tasting"; tastingId: string; name: string }
  | { kind: "text"; text: string };

/** The phone-vs-laptop prefix for a tasting row ("poured at" vs "at") is the
 * rendering component's job, not this function's — see spec §5.7/§4. The
 * text-kind strings below are the same on both widths, so `opts` is unused
 * here; it stays on the signature for parity with the rest of this module. */
export function whereLine(row: HistoryRow, opts: { phone: boolean }): WhereLine {
  void opts;
  if (row.tasting) {
    return { kind: "tasting", tastingId: row.tasting.id, name: row.tasting.name };
  }
  switch (row.reason) {
    case "DRANK":
      return { kind: "text", text: row.occasion ? `at home · ${row.occasion}` : "at home" };
    case "GIFTED":
      return { kind: "text", text: row.occasion ? `to ${row.occasion}` : "gifted" };
    case "LOST":
      return { kind: "text", text: row.occasion ? `lost · ${row.occasion}` : "lost" };
    case "OTHER":
    default:
      return { kind: "text", text: row.occasion ?? "taken out" };
  }
}

const ACTION_WORDS: Record<ConsumptionReason, string> = {
  DRANK: "Drank",
  GIFTED: "Gifted",
  LOST: "Lost",
  OTHER: "Removed",
};

export function actionWord(row: HistoryRow): string {
  return `${ACTION_WORDS[row.reason]} ${row.quantity}`;
}

export const HISTORY_PAGE = 25;

/** Keeps whole buckets while the running row count stays at or below
 * `HISTORY_PAGE`, truncates the bucket that crosses it to land on exactly
 * `HISTORY_PAGE`, and drops everything after — a bucket's own `bottles`/
 * `writtenUp` subtotals are left as the true month totals, not recomputed
 * over the truncated rows. */
export function visibleBuckets(
  buckets: readonly MonthBucket[],
  expanded: boolean,
): { buckets: MonthBucket[]; hiddenRows: number } {
  const totalRows = buckets.reduce((n, b) => n + b.rows.length, 0);
  if (expanded) return { buckets: [...buckets], hiddenRows: 0 };
  const result: MonthBucket[] = [];
  let running = 0;
  for (const b of buckets) {
    if (running >= HISTORY_PAGE) break;
    const remaining = HISTORY_PAGE - running;
    if (b.rows.length <= remaining) {
      result.push(b);
      running += b.rows.length;
    } else {
      if (remaining > 0) {
        result.push({ ...b, rows: b.rows.slice(0, remaining) });
        running += remaining;
      }
      break;
    }
  }
  return { buckets: result, hiddenRows: totalRows - running };
}

export function showRestLabel(year: number): string {
  return `Show the rest of ${year}`;
}
