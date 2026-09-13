"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// New per-concern "use server" file for the JOINED guest's own actions
// (refinement 2), split out of actions.ts so this track doesn't queue on it.

/**
 * A joined guest backs out before Start (S6; ledger B3; spec §4.3 item 5).
 * DRAFT only — once the tasting has started, M4's
 * `tasting_participants_leave_guard` trigger refuses the update for every
 * signed-in caller with "you can only leave before the tasting starts", so
 * this check is the app's own copy of that floor rather than a race against
 * it: the trigger still has the last word if Start lands between the read
 * below and the write, and its message is reused verbatim so the guest never
 * sees two different refusals for the same thing.
 *
 * Never offered to the host in the UI (`LeaveTastingButton` is only mounted
 * on the guest's own lobby, which routeTastingView never gives the host) —
 * the trigger refuses a host's own row too ("the host cannot leave their own
 * tasting"), so this action does not special-case it.
 */
export async function leaveTasting(
  tastingId: string,
): Promise<{ error: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to leave this tasting." };

  const { data: tasting } = await supabase
    .from("tastings")
    .select("status")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) return { error: "Tasting not found." };
  if (tasting.status !== "DRAFT") {
    return { error: "you can only leave before the tasting starts" };
  }

  const { error } = await supabase
    .from("tasting_participants")
    .update({ status: "DECLINED" })
    .eq("tasting_id", tastingId)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath("/overview");
  revalidatePath("/taste");
  return null;
}
