import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

const THROTTLE_MS = 5 * 60 * 1000;

// Fire-and-forget: bump last_seen_at at most once every 5 minutes so navigation
// stays cheap, and never throw — a failed touch must not break a page render.
export async function touchLastSeen(
  supabase: SupabaseClient<Database>,
  userId: string,
  lastSeenAt: string | null,
): Promise<void> {
  if (lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < THROTTLE_MS) {
    return;
  }
  try {
    await supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", userId);
  } catch {
    // ignore
  }
}
