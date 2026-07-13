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

export type ProfileStatsSummary = {
  winesGuessed: number;
  tastingsAttended: number;
  totalPoints: number;
  maxPossiblePoints: number;
  averagePoints: number;
  categoryAccuracy: Record<CategoryKey, { correct: number; applicable: number }>;
  vintagePartialCredit: number;
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

function tallyGuess(acc: ProfileStatsSummary, g: ScoredGuessRow) {
  acc.winesGuessed++;
  acc.totalPoints += g.total_points ?? 0;

  const always: [CategoryKey, number | null][] = [
    ["country", g.country_points],
    ["region", g.region_points],
    ["primary_grape", g.primary_grape_points],
    ["producer", g.producer_points],
  ];
  for (const [key, points] of always) {
    acc.categoryAccuracy[key].applicable++;
    acc.maxPossiblePoints += CATEGORY_MAX_POINTS[key];
    if (points === CATEGORY_MAX_POINTS[key]) acc.categoryAccuracy[key].correct++;
  }

  const optional: [CategoryKey, number | null][] = [
    ["appellation", g.appellation_points],
    ["secondary_grape", g.secondary_grape_points],
    ["type_designation", g.type_designation_points],
  ];
  for (const [key, points] of optional) {
    if (points === null) continue;
    acc.categoryAccuracy[key].applicable++;
    acc.maxPossiblePoints += CATEGORY_MAX_POINTS[key];
    if (points === CATEGORY_MAX_POINTS[key]) acc.categoryAccuracy[key].correct++;
  }

  acc.categoryAccuracy.vintage.applicable++;
  acc.maxPossiblePoints += CATEGORY_MAX_POINTS.vintage;
  if (g.vintage_points === 2) acc.categoryAccuracy.vintage.correct++;
  else if (g.vintage_points === 1) acc.vintagePartialCredit++;
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
