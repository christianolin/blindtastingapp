// The server's level reads (spec §6.2, L23, L28). A server-only module, not a
// "use server" one: AppHeader, AppShell, /community and /u/[id] call these
// during render. Every reader returns null (or an empty map) on any error —
// a failed level read never breaks a page; the feed then publishes nothing and
// the rings fall back to the bare avatar. Parsing lives in ./snapshot (pure,
// vitest-covered).
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  levelsById,
  otherProfileLevel,
  ownLevelFromRow,
  ownProfileLevel,
  parseLevelSnapshot,
} from "./snapshot";
import type { LevelSnapshot, OwnLevel, ProfileLevel } from "./types";

type Client = SupabaseClient<Database>;

/** AppHeader: the viewer's level and unseen awards, one RPC per render. */
export async function readLevelSnapshot(supabase: Client, userId: string): Promise<LevelSnapshot | null> {
  const { data, error } = await supabase.rpc("get_my_level_state");
  if (error) {
    console.error("[levels] get_my_level_state failed", error.code, error.message);
    return null;
  }
  return parseLevelSnapshot(data, userId);
}

/** AppShell: the sidebar ring's first paint. */
export async function readOwnLevel(supabase: Client, userId: string): Promise<OwnLevel | null> {
  const { data, error } = await supabase
    .from("profile_levels")
    .select("xp, level")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[levels] profile_levels read failed", error.code, error.message);
    return null;
  }
  return ownLevelFromRow(data);
}

/** /community: one batched read for the listed people; missing = level 1. */
export async function readLevels(supabase: Client, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("profile_levels").select("user_id, level").in("user_id", ids);
  if (error) {
    console.error("[levels] profile_levels batch read failed", error.code, error.message);
  }
  return levelsById(ids, error ? [] : data);
}

/** /u/[id]'s card: the level, and either your own progress (every active
    achievement) or the achievements RLS lets you read of someone else's. */
export async function readProfileLevel(
  supabase: Client,
  profileId: string,
  isOwn: boolean,
): Promise<ProfileLevel | null> {
  const [levelResult, achievementsResult] = await Promise.all([
    supabase.from("profile_levels").select("xp, level").eq("user_id", profileId).maybeSingle(),
    isOwn
      ? supabase.rpc("get_my_achievement_progress")
      : supabase
          .from("profile_achievements")
          .select("achievement_key, unlocked_at, backfill")
          .eq("user_id", profileId),
  ]);
  if (levelResult.error || achievementsResult.error) {
    const e = levelResult.error ?? achievementsResult.error;
    console.error("[levels] profile level read failed", e?.code, e?.message);
    return null;
  }
  const level = ownLevelFromRow(levelResult.data);
  if (isOwn) {
    const rows = (achievementsResult.data ?? []) as Database["public"]["Functions"]["get_my_achievement_progress"]["Returns"];
    return ownProfileLevel(level, rows);
  }
  const rows = (achievementsResult.data ?? []) as {
    achievement_key: string;
    unlocked_at: string;
    backfill: boolean;
  }[];
  return otherProfileLevel(level, rows);
}
