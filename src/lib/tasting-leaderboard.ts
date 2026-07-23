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

// Shared by the results page and the standings panel. A guess's points count
// once its wine is "countable", which depends on the leaderboard-reveal toggle:
//   PER_WINE       => only once the wine is fully revealed
//   PER_ATTRIBUTE  => as soon as the reveal has started — the shared wine step
//                     (guided/live) or this guess's own step (self-paced)
// so it only ever reflects revealed-category points and never spoils a wine
// that's still hidden.
export async function getTastingLeaderboard(
  tastingId: string,
): Promise<LeaderboardRow[]> {
  const supabase = await createClient();

  const [{ data: tasting }, { data: participants }] = await Promise.all([
    supabase
      .from("tastings")
      .select("timing_mode, leaderboard_reveal")
      .eq("id", tastingId)
      .maybeSingle(),
    supabase
      .from("tasting_participants")
      .select("id, user_id")
      .eq("tasting_id", tastingId),
  ]);
  const perAttribute = tasting?.leaderboard_reveal !== "PER_WINE";
  const guided = tasting?.timing_mode === "LIVE";

  const userIds = (participants ?? []).map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const profileByUserId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const { data: wines } = await supabase
    .from("wines")
    .select("id, is_revealed, reveal_step, contributor_participant_id")
    .eq("tasting_id", tastingId);
  const totalWines = (wines ?? []).length;
  const wineById = new Map((wines ?? []).map((w) => [w.id, w]));
  const wineIds = (wines ?? []).map((w) => w.id);

  // In bring-your-own you never guess your own bottle(s), so a participant's
  // "out of" count is the total minus however many wines they contributed.
  const ownWinesByParticipant = new Map<string, number>();
  for (const w of wines ?? []) {
    if (w.contributor_participant_id) {
      ownWinesByParticipant.set(
        w.contributor_participant_id,
        (ownWinesByParticipant.get(w.contributor_participant_id) ?? 0) + 1,
      );
    }
  }

  const { data: allGuesses } =
    wineIds.length > 0
      ? await supabase
          .from("guesses")
          .select("participant_id, wine_id, total_points, scored_at, reveal_step")
          .in("wine_id", wineIds)
      : { data: [] };

  const counts = (g: {
    wine_id: string;
    reveal_step: number | null;
  }): boolean => {
    const w = wineById.get(g.wine_id);
    if (!w) return false;
    if (w.is_revealed) return true;
    if (!perAttribute) return false;
    return guided ? (w.reveal_step ?? 0) > 0 : (g.reveal_step ?? 0) > 0;
  };
  const guesses = (allGuesses ?? []).filter(counts);

  // The most recently reveal-started wine, for each participant's "points
  // gained last round" delta (scored_at is set on the first reveal step).
  let lastRoundWineId: string | null = null;
  let lastRoundScoredAt: string | null = null;
  for (const g of guesses) {
    if (!g.scored_at) continue;
    if (!lastRoundScoredAt || g.scored_at > lastRoundScoredAt) {
      lastRoundScoredAt = g.scored_at;
      lastRoundWineId = g.wine_id;
    }
  }

  const totalByParticipantId = new Map<string, number>();
  const countByParticipantId = new Map<string, number>();
  const lastRoundByParticipantId = new Map<string, number>();
  for (const g of guesses) {
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
        totalWines: totalWines - (ownWinesByParticipant.get(p.id) ?? 0),
        lastRoundPoints: lastRoundWineId
          ? (lastRoundByParticipantId.get(p.id) ?? 0)
          : null,
      };
    })
    .sort((a, b) => b.total - a.total);
}
