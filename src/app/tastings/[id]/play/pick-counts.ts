// "you guess this often" (S9; spec §8.3 item 8; ledger B7). Counted from the
// viewer's own `guesses` rows across all their tastings — ids only, their own
// rows under RLS. Vintage is not counted. Pure — no React, no Supabase.
import type { GuessRow, LadderField } from "./ladder-types";

export type PickCounts = Partial<Record<LadderField, Record<string, number>>>;

/** A row reads "you guess this often" once the viewer has picked it this many times. */
export const OFTEN_THRESHOLD = 3;

type PickRow = Pick<
  GuessRow,
  | "country_id"
  | "region_id"
  | "appellation_id"
  | "primary_grape_id"
  | "secondary_grape_id"
  | "producer_id"
  | "type_designation_id"
>;

/** Each counted ladder field and the column it reads. */
const COUNTED: readonly (readonly [LadderField, keyof PickRow])[] = [
  ["country", "country_id"],
  ["region", "region_id"],
  ["appellation", "appellation_id"],
  ["primary_grape", "primary_grape_id"],
  ["secondary_grape", "secondary_grape_id"],
  ["producer", "producer_id"],
  ["type_designation", "type_designation_id"],
];

function has(counts: Record<string, number>, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(counts, id);
}

/** Per field, how many of the rows picked each id. A field nobody picked is absent. */
export function buildPickCounts(rows: readonly PickRow[]): PickCounts {
  const counts: PickCounts = {};
  for (const row of rows) {
    for (const [field, column] of COUNTED) {
      const id = row[column];
      if (typeof id !== "string" || id === "") continue;
      const byId = (counts[field] ??= {});
      byId[id] = has(byId, id) ? byId[id] + 1 : 1;
    }
  }
  return counts;
}

export function oftenPicked(counts: Record<string, number> | undefined, id: string): boolean {
  return counts !== undefined && has(counts, id) && counts[id] >= OFTEN_THRESHOLD;
}
