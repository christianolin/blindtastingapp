"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The signed-in invitation's "I am in" (BT-G3, spec §4.3 item 4; ledger B3):
// joins through the same SECURITY DEFINER RPC the old silent-join page used
// (join_tasting_by_code, M4 — refuses only a CLOSED tasting, so this also
// covers a DECLINED guest rejoining, B4). `get_join_preview` already
// confirmed the code and the tasting's status to the caller before this
// button is ever shown, so an error here means the tasting closed, or the
// code stopped working, in the moment between the preview and the tap.
export async function joinByCode(code: string): Promise<{ error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/j/${code}`)}`);
  }

  const { data: tastingId, error } = await supabase.rpc("join_tasting_by_code", {
    p_code: code,
  });
  if (error || !tastingId) {
    return { error: friendlyJoinError(error?.message ?? null) };
  }
  redirect(`/tastings/${tastingId}`);
}

// The RPC raises short lower-case reasons; turn them into a sentence. The
// old refusal for a tasting that had begun is gone — M4's
// join_tasting_by_code no longer raises it (B4, Q6).
function friendlyJoinError(raw: string | null): string {
  if (!raw) return "The link didn't work. Ask the host for a fresh one.";
  if (raw.includes("no tasting has that code")) {
    return "No tasting has that code — check the link with the host.";
  }
  if (raw.includes("has finished")) return "That tasting has finished.";
  return raw.charAt(0).toUpperCase() + raw.slice(1) + (raw.endsWith(".") ? "" : ".");
}
