// The history's tally (spec §3.6): over every attempt the viewer has, the
// scored ones, how many named the right grape (primary_grape_points > 0) and
// how many the right appellation (appellation_points > 0). Pure: relative
// imports only.
import type { AttemptRow } from "./types";

export function tally(rows: readonly Pick<AttemptRow, "points" | "total">[]): {
  scored: number;
  grapeHits: number;
  appellationHits: number;
} {
  let scored = 0;
  let grapeHits = 0;
  let appellationHits = 0;
  for (const r of rows) {
    if (r.total === null) continue; // not revealed yet: not scored
    scored += 1;
    if ((r.points.primaryGrape ?? 0) > 0) grapeHits += 1;
    if ((r.points.appellation ?? 0) > 0) appellationHits += 1;
  }
  return { scored, grapeHits, appellationHits };
}
