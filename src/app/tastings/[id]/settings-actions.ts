"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { TastingStatus } from "@/lib/supabase/database.types";
import { getTastingPlace } from "@/app/tastings/new/place";
import { isoToLocal, type SetupValues } from "@/app/tastings/new/setup-copy";
import type { UnrevealedGlass } from "@/lib/tasting-lifecycle-copy";

// The Tasting settings sheet's one load (spec §3.3 items 13–14, S4d): every
// field TastingSettingsSheet needs on first open, in one round trip. Split
// out of ./actions.ts (plan refinement 2) so this track doesn't queue on the
// lifecycle file.

export type TastingSettings = {
  /** Handed straight to `NewTastingForm mode="settings"` — the same shape
      the create sheet's step 1 edits. */
  setup: SetupValues;
  status: TastingStatus;
  /** `settingsChangeRefusal`'s DRAFT wine-source gate. */
  wineCount: number;
  sequentialGuessing: boolean;
  /** Manage invitations' friend picker (the same list host-controls.tsx's
      running-tasting invite form has always used). */
  friends: { id: string; display_name: string; email: string }[];
  /** Glasses whose answers ending the tasting would leave hidden, in list
      order — the End confirm names them (reveal-4). */
  unrevealedGlasses: UnrevealedGlass[];
  /** JOINED participants other than the host, for Hand hosting's picker
      (spec §12.3 item 1, ledger B11, plan task BT-K1). Name/avatar only —
      `transfer_tasting_host` does its own eligibility checks. */
  joinedParticipants: { id: string; userId: string; name: string; avatarUrl: string | null }[];
};

/** Host only. A non-host or a signed-out caller gets a refusal, never a
    silent empty settings object — the sheet shows it inline and stays
    closed rather than rendering a blank form. */
export async function getTastingSettings(
  tastingId: string,
): Promise<TastingSettings | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tasting } = await supabase
    .from("tastings")
    .select(
      "id, host_id, status, name, description, image_url, scheduled_at, reveal_mode, timing_mode, wine_source, sequential_guessing, leaderboard_reveal, async_reveal_policy",
    )
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting || tasting.host_id !== user.id) {
    return { error: "Only the host can view tasting settings." };
  }

  const [{ data: wines }, place, { data: friendRows }, { data: joinedRows }] = await Promise.all([
    supabase
      .from("wines")
      .select("is_revealed, reveal_step")
      .eq("tasting_id", tastingId)
      .order("position"),
    getTastingPlace(supabase, tastingId),
    supabase.from("friendships").select("friend_id").eq("user_id", user.id),
    supabase
      .from("tasting_participants")
      .select("id, user_id")
      .eq("tasting_id", tastingId)
      .eq("status", "JOINED")
      .neq("user_id", tasting.host_id),
  ]);

  const friendIds = (friendRows ?? []).map((f) => f.friend_id);
  const { data: friendProfiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", friendIds.length > 0 ? friendIds : [""])
    .order("display_name");

  const joinedUserIds = (joinedRows ?? []).map((r) => r.user_id);
  const { data: joinedProfiles } = await supabase
    .from("profiles")
    .select("id, display_name, email, avatar_url")
    .in("id", joinedUserIds.length > 0 ? joinedUserIds : [""]);
  const joinedProfileById = new Map((joinedProfiles ?? []).map((p) => [p.id, p]));
  const joinedParticipants = (joinedRows ?? [])
    .map((r) => {
      const profile = joinedProfileById.get(r.user_id);
      return {
        id: r.id,
        userId: r.user_id,
        name: profile?.display_name ?? profile?.email ?? "Someone",
        avatarUrl: profile?.avatar_url ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows = wines ?? [];
  // Numbered by list order, not the stored position, like every other glass
  // number in the app; a glass part-way through a step reveal is "half".
  const unrevealedGlasses: UnrevealedGlass[] = [];
  rows.forEach((w, i) => {
    if (!w.is_revealed) {
      unrevealedGlasses.push({ glass: i + 1, state: w.reveal_step > 0 ? "half" : "hidden" });
    }
  });

  const setup: SetupValues = {
    name: tasting.name,
    revealMode: tasting.reveal_mode,
    timingMode: tasting.timing_mode,
    wineSource: tasting.wine_source,
    scheduledLocal: isoToLocal(tasting.scheduled_at),
    // Reconstructed the same way tastings/new/actions.ts's private
    // lockedFlowFromRow does: the column only means something while
    // flowApplies (any non-OPEN LIVE tasting) — elsewhere it is inert, so a
    // Free/Guided mismatch on a setting nobody could see never trips
    // settingsChangeRefusal.
    flow: tasting.sequential_guessing ? "GUIDED" : "FREE",
    leaderboardReveal: tasting.leaderboard_reveal,
    asyncRevealPolicy: tasting.async_reveal_policy,
    imageUrl: tasting.image_url,
    place: place ?? "",
    description: tasting.description ?? "",
  };

  return {
    setup,
    status: tasting.status,
    wineCount: rows.length,
    sequentialGuessing: tasting.sequential_guessing,
    friends: friendProfiles ?? [],
    unrevealedGlasses,
    joinedParticipants,
  };
}
