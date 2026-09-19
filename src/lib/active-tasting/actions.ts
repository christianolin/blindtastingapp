"use server";

// The active-tasting banner's poll (spec §5, D7): the client strip calls this
// every 20 s while the tab is visible and on focus, like the notifications
// bell's getPendingInvites. It takes no arguments — the user always comes from
// the session, never from the client. Only this async function is exported
// (a "use server" file's every export becomes an action).
import { createClient } from "@/lib/supabase/server";
import { readActiveTastings } from "./read";
import type { ActiveTastingSnapshot } from "./select";

/**
 * The viewer's current active tastings. Signed out is a real "nothing",
 * stamped now, so the strip goes; null (a failed read) means "keep what you
 * have" (D13).
 */
export async function pollActiveTastings(): Promise<ActiveTastingSnapshot | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], checkedAt: new Date().toISOString() };
  return readActiveTastings(user.id);
}
