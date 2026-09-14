import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CategoryRate } from "./record-pattern";
import { CATEGORY_ORDER, CATEGORY_POINTS, type ResultCategory } from "./result-math";

// The record's pattern-sentence data (S13, RECORD-11; spec §11.3 item 15).
// `record-pattern.ts` only compares rates the caller already has; this is
// the one place that reads them off `guesses`, so a server-only module can
// hold the query shape without leaking it into the pure comparison logic.
//
// Scoped exactly like `profile-stats.ts`'s cross-tasting stats (its own
// comment names the two reasons: `scored_at` alone would let a still-
// in-progress wine's early categories count, and the `guesses` SELECT policy
// only admits someone else's row once a wine is fully revealed — scoping to
// fully revealed wines keeps every viewer computing the same numbers from
// rows RLS already makes public). The one addition here is the 20-tasting
// cap and the CLOSED + BLIND filter (a semi-blind tasting has no per-category
// points to compare, and an IN_PROGRESS or DRAFT one is still moving).

type ScoredGuessRow = {
  wine_id: string;
  participant_id: string;
  country_points: number | null;
  region_points: number | null;
  appellation_points: number | null;
  primary_grape_points: number | null;
  secondary_grape_points: number | null;
  producer_points: number | null;
  type_designation_points: number | null;
  vintage_points: number | null;
};

const POINTS_FIELD = {
  country: "country_points",
  region: "region_points",
  appellation: "appellation_points",
  primary_grape: "primary_grape_points",
  secondary_grape: "secondary_grape_points",
  producer: "producer_points",
  type_designation: "type_designation_points",
  vintage: "vintage_points",
} as const satisfies Record<ResultCategory, keyof ScoredGuessRow>;

type RateAccumulator = Map<ResultCategory, { hits: number; inPlay: number }>;

function emptyRates(): RateAccumulator {
  return new Map(CATEGORY_ORDER.map((category) => [category, { hits: 0, inPlay: 0 }]));
}

/** A null column is "not applicable" (no secondary grape, no type designation
 *  on the wine, or — moot here since semi-blind tastings are excluded up
 *  front — a semi-blind guess), never a wrong guess; see `tallyGuess` in
 *  `profile-stats.ts`, which this mirrors per-tasting instead of pooling
 *  every tasting into one summary. */
function tally(acc: RateAccumulator, row: ScoredGuessRow) {
  for (const category of CATEGORY_ORDER) {
    const points = row[POINTS_FIELD[category]];
    if (points === null) continue;
    const rate = acc.get(category)!;
    rate.inPlay += 1;
    if (points === CATEGORY_POINTS[category]) rate.hits += 1;
  }
}

const MOST_RECENT_TASTINGS = 20;

/**
 * The viewer's per-category hit/in-play tally, one array per earlier CLOSED
 * BLIND tasting they took part in (`record-pattern.ts`'s `earlier`
 * argument), at most the 20 most recently finished. `excludeTastingId` is
 * the tasting the record itself is for — it never backs its own pattern.
 */
export async function getCategoryRatesByTasting(
  userId: string,
  excludeTastingId: string,
): Promise<CategoryRate[][]> {
  const supabase = await createClient();

  const { data: participantRows } = await supabase
    .from("tasting_participants")
    .select("id, tasting_id")
    .eq("user_id", userId)
    .neq("tasting_id", excludeTastingId);
  if (!participantRows || participantRows.length === 0) return [];

  const participantIdByTastingId = new Map(participantRows.map((p) => [p.tasting_id, p.id]));
  const tastingIds = [...participantIdByTastingId.keys()];

  const { data: tastings } = await supabase
    .from("tastings")
    .select("id, finished_at")
    .in("id", tastingIds)
    .eq("status", "CLOSED")
    .eq("reveal_mode", "BLIND")
    .order("finished_at", { ascending: false })
    .limit(MOST_RECENT_TASTINGS);
  const relevantTastingIds = (tastings ?? []).map((t) => t.id);
  if (relevantTastingIds.length === 0) return [];

  const { data: wines } = await supabase
    .from("wines")
    .select("id, tasting_id")
    .in("tasting_id", relevantTastingIds)
    .eq("is_revealed", true);
  const tastingIdByWineId = new Map((wines ?? []).map((w) => [w.id, w.tasting_id]));
  const revealedWineIds = [...tastingIdByWineId.keys()];
  if (revealedWineIds.length === 0) return relevantTastingIds.map(() => []);

  const participantIds = relevantTastingIds
    .map((id) => participantIdByTastingId.get(id))
    .filter((id): id is string => Boolean(id));

  const { data: guesses } = await supabase
    .from("guesses")
    .select(
      "wine_id, participant_id, country_points, region_points, appellation_points, primary_grape_points, secondary_grape_points, producer_points, type_designation_points, vintage_points",
    )
    .in("participant_id", participantIds)
    .in("wine_id", revealedWineIds)
    .not("scored_at", "is", null);

  const rateByTastingId = new Map<string, RateAccumulator>();
  for (const id of relevantTastingIds) rateByTastingId.set(id, emptyRates());

  for (const g of guesses ?? []) {
    const tastingId = tastingIdByWineId.get(g.wine_id);
    // Belt and suspenders: a guess only ever pairs a wine and a participant
    // from the same tasting (the pin trigger, `pin_tasting_participant_identity`),
    // but this only tallies rows that also match this viewer's own
    // participant row for that specific tasting.
    if (!tastingId || participantIdByTastingId.get(tastingId) !== g.participant_id) continue;
    tally(rateByTastingId.get(tastingId)!, g);
  }

  return relevantTastingIds.map((tastingId) =>
    CATEGORY_ORDER.map((category) => {
      const rate = rateByTastingId.get(tastingId)!.get(category)!;
      return { category, hits: rate.hits, inPlay: rate.inPlay };
    }),
  );
}
