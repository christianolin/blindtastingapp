import { createClient } from "@/lib/supabase/server";

export type LeaderboardRow = { participantId: string; name: string; total: number };

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
    .select("id, display_name")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const nameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

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
  for (const g of guesses ?? []) {
    totalByParticipantId.set(
      g.participant_id,
      (totalByParticipantId.get(g.participant_id) ?? 0) + (g.total_points ?? 0),
    );
  }

  return (participants ?? [])
    .map((p) => ({
      participantId: p.id,
      name: nameByUserId.get(p.user_id) ?? "Unknown",
      total: totalByParticipantId.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.total - a.total);
}
