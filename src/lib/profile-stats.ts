import { createClient } from "@/lib/supabase/server";

export type CategoryKey =
  | "country"
  | "region"
  | "appellation"
  | "primary_grape"
  | "secondary_grape"
  | "producer"
  | "type_designation"
  | "vintage";

const CATEGORY_MAX_POINTS: Record<CategoryKey, number> = {
  country: 2,
  region: 3,
  appellation: 5,
  primary_grape: 8,
  secondary_grape: 2,
  producer: 6,
  type_designation: 2,
  vintage: 2,
};

export type OriginStat = { id: string; name: string; count: number };

export type CategoryStrength = {
  key: CategoryKey;
  correct: number;
  applicable: number;
  pct: number;
};

export type ProfileStatsSummary = {
  winesGuessed: number;
  tastingsAttended: number;
  totalPoints: number;
  maxPossiblePoints: number;
  averagePoints: number;
  categoryAccuracy: Record<CategoryKey, { correct: number; applicable: number }>;
  vintagePartialCredit: number;
  // What they've tasted most (from the actual wine, not the guess) and which
  // category they're most accurate at guessing (min sample size applied so a
  // single lucky guess doesn't read as a "strength").
  topCountries: OriginStat[];
  topRegions: OriginStat[];
  topGrapes: OriginStat[];
  bestCategory: CategoryStrength | null;
};

export type TastingHistoryEntry = {
  tastingId: string;
  tastingName: string;
  hostName: string;
  winesRevealed: number;
  pointsEarned: number;
};

type ScoredGuessRow = {
  wine_id: string;
  country_points: number | null;
  region_points: number | null;
  appellation_points: number | null;
  primary_grape_points: number | null;
  secondary_grape_points: number | null;
  producer_points: number | null;
  type_designation_points: number | null;
  vintage_points: number | null;
  total_points: number | null;
};

function emptyAccuracy(): Record<CategoryKey, { correct: number; applicable: number }> {
  return {
    country: { correct: 0, applicable: 0 },
    region: { correct: 0, applicable: 0 },
    appellation: { correct: 0, applicable: 0 },
    primary_grape: { correct: 0, applicable: 0 },
    secondary_grape: { correct: 0, applicable: 0 },
    producer: { correct: 0, applicable: 0 },
    type_designation: { correct: 0, applicable: 0 },
    vintage: { correct: 0, applicable: 0 },
  };
}

// A semi-blind guess is scored as a plain match/no-match (see
// reveal_wine's SEMI_BLIND branch) and has every category column set to
// null — "not applicable", not "guessed and got it wrong". All eight
// categories are tallied through this one loop so that null always means
// skip, rather than country/region/primary_grape/producer (previously
// "always applicable") getting silently counted as wrong for every
// semi-blind guess.
function tallyGuess(acc: ProfileStatsSummary, g: ScoredGuessRow) {
  acc.winesGuessed++;
  acc.totalPoints += g.total_points ?? 0;

  const categories: [CategoryKey, number | null][] = [
    ["country", g.country_points],
    ["region", g.region_points],
    ["appellation", g.appellation_points],
    ["primary_grape", g.primary_grape_points],
    ["secondary_grape", g.secondary_grape_points],
    ["producer", g.producer_points],
    ["type_designation", g.type_designation_points],
  ];
  for (const [key, points] of categories) {
    if (points === null) continue;
    acc.categoryAccuracy[key].applicable++;
    acc.maxPossiblePoints += CATEGORY_MAX_POINTS[key];
    if (points === CATEGORY_MAX_POINTS[key]) acc.categoryAccuracy[key].correct++;
  }

  if (g.vintage_points !== null) {
    acc.categoryAccuracy.vintage.applicable++;
    acc.maxPossiblePoints += CATEGORY_MAX_POINTS.vintage;
    if (g.vintage_points === 2) acc.categoryAccuracy.vintage.correct++;
    else if (g.vintage_points === 1) acc.vintagePartialCredit++;
  }
}

/**
 * A person's cross-tasting stats: wines guessed, points, per-category
 * accuracy, plus which tastings they've attended. Only ever counts
 * revealed/scored guesses (scored_at set), so nothing still-hidden ever
 * leaks through — matches the "revealed = public" RLS rule added for
 * tastings/tasting_participants/wines.
 */
export async function getProfileStats(profileId: string): Promise<{
  summary: ProfileStatsSummary;
  tastings: TastingHistoryEntry[];
}> {
  const supabase = await createClient();

  const { data: participantRows } = await supabase
    .from("tasting_participants")
    .select("id, tasting_id")
    .eq("user_id", profileId);
  const participantIds = (participantRows ?? []).map((p) => p.id);
  const tastingIdByParticipantId = new Map(
    (participantRows ?? []).map((p) => [p.id, p.tasting_id]),
  );

  const summary: ProfileStatsSummary = {
    winesGuessed: 0,
    tastingsAttended: 0,
    totalPoints: 0,
    maxPossiblePoints: 0,
    averagePoints: 0,
    categoryAccuracy: emptyAccuracy(),
    vintagePartialCredit: 0,
    topCountries: [],
    topRegions: [],
    topGrapes: [],
    bestCategory: null,
  };

  if (participantIds.length === 0) {
    return { summary, tastings: [] };
  }

  const { data: guesses } = await supabase
    .from("guesses")
    .select(
      "participant_id, wine_id, country_points, region_points, appellation_points, primary_grape_points, secondary_grape_points, producer_points, type_designation_points, vintage_points, total_points",
    )
    .in("participant_id", participantIds)
    .not("scored_at", "is", null);

  for (const g of guesses ?? []) tallyGuess(summary, g);
  summary.averagePoints = summary.winesGuessed > 0 ? summary.totalPoints / summary.winesGuessed : 0;

  // "What have they tasted most" — from the actual wine (wine_answers), not
  // their guess, since a scored guess means they tasted that glass regardless
  // of whether they guessed it right.
  const wineIds = [...new Set((guesses ?? []).map((g) => g.wine_id))];
  if (wineIds.length > 0) {
    const { data: answers } = await supabase
      .from("wine_answers")
      .select("wine_id, country_id, region_id, primary_grape_id")
      .in("wine_id", wineIds);

    const countryCounts = new Map<string, number>();
    const regionCounts = new Map<string, number>();
    const grapeCounts = new Map<string, number>();
    for (const a of answers ?? []) {
      countryCounts.set(a.country_id, (countryCounts.get(a.country_id) ?? 0) + 1);
      regionCounts.set(a.region_id, (regionCounts.get(a.region_id) ?? 0) + 1);
      grapeCounts.set(
        a.primary_grape_id,
        (grapeCounts.get(a.primary_grape_id) ?? 0) + 1,
      );
    }

    const [{ data: countries }, { data: regions }, { data: grapes }] =
      await Promise.all([
        supabase
          .from("countries")
          .select("id, name")
          .in("id", [...countryCounts.keys()]),
        supabase
          .from("regions")
          .select("id, name")
          .in("id", [...regionCounts.keys()]),
        supabase
          .from("grapes")
          .select("id, name")
          .in("id", [...grapeCounts.keys()]),
      ]);

    const topN = (
      counts: Map<string, number>,
      names: { id: string; name: string }[] | null,
    ): OriginStat[] => {
      const nameById = new Map((names ?? []).map((n) => [n.id, n.name]));
      return [...counts.entries()]
        .map(([id, count]) => ({ id, name: nameById.get(id) ?? "Unknown", count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    };

    summary.topCountries = topN(countryCounts, countries);
    summary.topRegions = topN(regionCounts, regions);
    summary.topGrapes = topN(grapeCounts, grapes);
  }

  // Strongest category: highest accuracy among categories with enough sample
  // size that one lucky guess doesn't read as a "strength".
  const MIN_SAMPLE = 3;
  let best: CategoryStrength | null = null;
  for (const key of Object.keys(summary.categoryAccuracy) as CategoryKey[]) {
    const { correct, applicable } = summary.categoryAccuracy[key];
    if (applicable < MIN_SAMPLE) continue;
    const pct = correct / applicable;
    if (!best || pct > best.pct || (pct === best.pct && applicable > best.applicable)) {
      best = { key, correct, applicable, pct };
    }
  }
  summary.bestCategory = best;

  const pointsByTastingId = new Map<string, number>();
  const winesByTastingId = new Map<string, number>();
  for (const g of guesses ?? []) {
    const tastingId = tastingIdByParticipantId.get(g.participant_id);
    if (!tastingId) continue;
    pointsByTastingId.set(tastingId, (pointsByTastingId.get(tastingId) ?? 0) + (g.total_points ?? 0));
    winesByTastingId.set(tastingId, (winesByTastingId.get(tastingId) ?? 0) + 1);
  }

  const tastingIds = [...winesByTastingId.keys()];
  summary.tastingsAttended = tastingIds.length;
  if (tastingIds.length === 0) {
    return { summary, tastings: [] };
  }

  const { data: tastingRows } = await supabase
    .from("tastings")
    .select("id, name, host_id")
    .in("id", tastingIds);

  const hostIds = [...new Set((tastingRows ?? []).map((t) => t.host_id))];
  const { data: hostProfiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", hostIds.length > 0 ? hostIds : [""]);
  const hostNameById = new Map((hostProfiles ?? []).map((p) => [p.id, p.display_name]));

  const tastings: TastingHistoryEntry[] = (tastingRows ?? [])
    .map((t) => ({
      tastingId: t.id,
      tastingName: t.name,
      hostName: hostNameById.get(t.host_id) ?? "Unknown",
      winesRevealed: winesByTastingId.get(t.id) ?? 0,
      pointsEarned: pointsByTastingId.get(t.id) ?? 0,
    }))
    .sort((a, b) => a.tastingName.localeCompare(b.tastingName));

  return { summary, tastings };
}

export type BulkProfileSummary = {
  tastingsAttended: number;
  winesGuessed: number;
  averagePoints: number;
};

/**
 * Lightweight per-profile stats for a whole list of people at once (the
 * People directory) — batched across all requested profile ids rather than
 * calling getProfileStats in a loop, since that would be an N+1 query fan-out
 * on a page that can list every user in the app.
 */
export async function getBulkProfileSummaries(
  profileIds: string[],
): Promise<Map<string, BulkProfileSummary>> {
  const result = new Map<string, BulkProfileSummary>();
  if (profileIds.length === 0) return result;

  const supabase = await createClient();

  const { data: participantRows } = await supabase
    .from("tasting_participants")
    .select("id, user_id, tasting_id")
    .in("user_id", profileIds);
  if (!participantRows || participantRows.length === 0) return result;

  const participantIds = participantRows.map((p) => p.id);
  const userIdByParticipantId = new Map(
    participantRows.map((p) => [p.id, p.user_id]),
  );

  const { data: guesses } = await supabase
    .from("guesses")
    .select("participant_id, total_points")
    .in("participant_id", participantIds)
    .not("scored_at", "is", null);

  const tastingIdsByUser = new Map<string, Set<string>>();
  const winesByUser = new Map<string, number>();
  const pointsByUser = new Map<string, number>();
  const tastingIdByParticipantId = new Map(
    participantRows.map((p) => [p.id, p.tasting_id]),
  );

  for (const g of guesses ?? []) {
    const userId = userIdByParticipantId.get(g.participant_id);
    if (!userId) continue;
    winesByUser.set(userId, (winesByUser.get(userId) ?? 0) + 1);
    pointsByUser.set(
      userId,
      (pointsByUser.get(userId) ?? 0) + (g.total_points ?? 0),
    );
    const tastingId = tastingIdByParticipantId.get(g.participant_id);
    if (tastingId) {
      const set = tastingIdsByUser.get(userId) ?? new Set<string>();
      set.add(tastingId);
      tastingIdsByUser.set(userId, set);
    }
  }

  for (const userId of profileIds) {
    const winesGuessed = winesByUser.get(userId) ?? 0;
    const totalPoints = pointsByUser.get(userId) ?? 0;
    result.set(userId, {
      tastingsAttended: tastingIdsByUser.get(userId)?.size ?? 0,
      winesGuessed,
      averagePoints: winesGuessed > 0 ? totalPoints / winesGuessed : 0,
    });
  }

  return result;
}
