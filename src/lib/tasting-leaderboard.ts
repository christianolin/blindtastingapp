import { createClient } from "@/lib/supabase/server";
import { ownWineCounts } from "@/lib/tasting-leaderboard-math";

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

// Shared by the results page and the standings panel.
//
// Scores come from the get_tasting_leaderboard RPC rather than from a direct
// read of `guesses`, and that is load-bearing. The guesses SELECT policy only
// admits your own row until a wine is FULLY revealed, so a direct read made
// every other player's total sit frozen through a progressive reveal while
// your own climbed. The RPC is SECURITY DEFINER and returns aggregates only —
// no guessed value crosses the boundary, so nothing unrevealed leaks.
//
// The profile join and the out-of arithmetic stay here: `wines` and
// `tasting_participants` are readable under RLS, so they need no elevated
// rights, and the definer surface stays as small as it can be.
export async function getTastingLeaderboard(
  tastingId: string,
): Promise<LeaderboardRow[]> {
  const supabase = await createClient();

  const [{ data: participants }, { data: wines }, { data: scores }] =
    await Promise.all([
      supabase
        .from("tasting_participants")
        .select("id, user_id")
        .eq("tasting_id", tastingId),
      supabase
        .from("wines")
        .select("contributor_participant_id")
        .eq("tasting_id", tastingId),
      supabase.rpc("get_tasting_leaderboard", { p_tasting_id: tastingId }),
    ]);

  const userIds = (participants ?? []).map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const profileByUserId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const totalWines = (wines ?? []).length;
  const ownWines = ownWineCounts(wines ?? []);
  const scoreByParticipantId = new Map(
    (scores ?? []).map((s) => [s.participant_id, s]),
  );

  return (participants ?? [])
    .map((p) => {
      const profile = profileByUserId.get(p.user_id);
      const score = scoreByParticipantId.get(p.id);
      return {
        participantId: p.id,
        userId: p.user_id,
        name: profile?.display_name ?? "Unknown",
        avatarUrl: profile?.avatar_url ?? null,
        total: score?.total ?? 0,
        winesScored: score?.wines_scored ?? 0,
        totalWines: totalWines - (ownWines.get(p.id) ?? 0),
        lastRoundPoints: score?.last_round_points ?? null,
      };
    })
    .sort((a, b) => b.total - a.total);
}
