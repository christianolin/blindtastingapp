"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { handHostingRefusal } from "@/lib/lobby-copy";

// Hand hosting to a JOINED participant (spec §12.3 item 2, §12.4; ledger B11;
// Q4; plan task BT-K1). `transfer_tasting_host` is the floor: host only,
// DRAFT only, the target must be a JOINED participant, and it refuses while
// any glass is host-added or the host still owns an unfinished identity
// draft or cellar pour intent in the tasting (spec §12.4 "Security
// reasoning"). This action only confirms a session and hands the RPC's
// error back through the sheet's copy.

/**
 * `handHosting(tastingId, newHostUserId)` — spec §12.3 item 2. On success the
 * former host stays JOINED and the tasting's `host_id` moves, so both the
 * tasting page (now shows the guest lobby to the former host, the host lobby
 * to the new one) and the two dashboards that split "Hosting" from
 * "Attending" need a fresh read.
 */
export async function handHosting(
  tastingId: string,
  newHostUserId: string,
): Promise<{ error: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.rpc("transfer_tasting_host", {
    p_tasting_id: tastingId,
    p_new_host_user_id: newHostUserId,
  });
  if (error) return { error: handHostingRefusal(error.message) };

  revalidatePath(`/tastings/${tastingId}`);
  revalidatePath("/overview");
  revalidatePath("/taste");
  return null;
}
