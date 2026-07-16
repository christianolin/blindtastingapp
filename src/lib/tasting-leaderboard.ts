import { createClient } from "@/lib/supabase/server";

export type LeaderboardRow = {
  participantId: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  total: number;
  winesScored: number;
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
  const revealedWineIds = (wines ?? []).filter((w) => w.is_revealed).map((w) => w.id);

  const { data: guesses } =
    revealedWineIds.length > 0
      ? await supabase
          .from("guesses")
          .select("participant_id, total_points")
          .in("wine_id", revealedWineIds)
      : { data: [] };

  const totalByParticipantId = new Map<string, number>();
  const countByParticipantId = new Map<string, number>();
  for (const g of guesses ?? []) {
    totalByParticipantId.set(
      g.participant_id,
      (totalByParticipantId.get(g.participant_id) ?? 0) + (g.total_points ?? 0),
    );
    countByParticipantId.set(
      g.participant_id,
      (countByParticipantId.get(g.participant_id) ?? 0) + 1,
    );
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
      };
    })
    .sort((a, b) => b.total - a.total);
}
