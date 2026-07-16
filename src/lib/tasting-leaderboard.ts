import { createClient } from "@/lib/supabase/server";

export type LeaderboardRow = {
  participantId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  total: number;
  winesScored: number;
  totalWines: number;
  lastRoundPoints: number | null;
};

// Shared by the results page and the persistent sidebar — scores only
// count revealed wines, so this is safe to show mid-tasting without
// spoiling anything still hidden.
export async function getTastingLeaderboard(tastingId: string): Promise<LeaderboardRow[]> {
  const supabase = await createClient();

  const { data: participants } = await supabase
    .from("tasting_participants")
    .select("id, user_id")
    .eq("tasting_id", tastingId);

  const userIds = (participants ?? []).map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const profileByUserId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const { data: wines } = await supabase
    .from("wines")
    .select("id, is_revealed")
    .eq("tasting_id", tastingId);
  const totalWines = (wines ?? []).length;
  const revealedWineIds = (wines ?? []).filter((w) => w.is_revealed).map((w) => w.id);

  const { data: guesses } =
    revealedWineIds.length > 0
      ? await supabase
          .from("guesses")
          .select("participant_id, wine_id, total_points, scored_at")
          .in("wine_id", revealedWineIds)
      : { data: [] };

  // The most recently revealed wine, so we can show each participant's
  // "points gained last round" — reveal_wine scores every guess for a wine
  // in one transaction, so the max scored_at per wine_id groups cleanly.
  let lastRoundWineId: string | null = null;
  let lastRoundScoredAt: string | null = null;
  for (const g of guesses ?? []) {
    if (!g.scored_at) continue;
    if (!lastRoundScoredAt || g.scored_at > lastRoundScoredAt) {
      lastRoundScoredAt = g.scored_at;
      lastRoundWineId = g.wine_id;
    }
  }

  const totalByParticipantId = new Map<string, number>();
  const countByParticipantId = new Map<string, number>();
  const lastRoundByParticipantId = new Map<string, number>();
  for (const g of guesses ?? []) {
    totalByParticipantId.set(
      g.participant_id,
      (totalByParticipantId.get(g.participant_id) ?? 0) + (g.total_points ?? 0),
    );
    countByParticipantId.set(
      g.participant_id,
      (countByParticipantId.get(g.participant_id) ?? 0) + 1,
    );
    if (lastRoundWineId && g.wine_id === lastRoundWineId) {
      lastRoundByParticipantId.set(g.participant_id, g.total_points ?? 0);
    }
  }

  return (participants ?? [])
    .map((p) => {
      const profile = profileByUserId.get(p.user_id);
      return {
        participantId: p.id,
        userId: p.user_id,
        name: profile?.display_name ?? "Unknown",
        avatarUrl: profile?.avatar_url ?? null,
        total: totalByParticipantId.get(p.id) ?? 0,
        winesScored: countByParticipantId.get(p.id) ?? 0,
        totalWines,
        lastRoundPoints: lastRoundWineId ? (lastRoundByParticipantId.get(p.id) ?? 0) : null,
      };
    })
    .sort((a, b) => b.total - a.total);
}
