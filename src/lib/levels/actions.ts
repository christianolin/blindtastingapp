"use server";

// The toaster's one write (spec §6.2, L7, L28): marks the ledger rows a card
// showed as seen, and clears the welcome. It never revalidates and never
// refreshes — the rows are already on screen. Only this async function is
// exported (a "use server" file's every export becomes an action); its types
// live in ./types.
import { createClient } from "@/lib/supabase/server";
import { cleanSeenIds } from "./toasts";

export async function markXpSeen(ids: number[], welcome: boolean): Promise<void> {
  const clean = cleanSeenIds(ids);
  if (clean === null) return;
  if (clean.length === 0 && welcome !== true) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_xp_seen", { p_ids: clean, p_welcome: welcome === true });
  if (error) console.error("[levels] mark_xp_seen failed", error.code, error.message);
}
