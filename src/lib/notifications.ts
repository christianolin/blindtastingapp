"use server";

import { createClient } from "@/lib/supabase/server";

export type InviteNotification = {
  tastingId: string;
  tastingName: string;
  hostName: string;
};

// Pending tasting invitations for the current user, for the header's
// notifications bell. A "use server" action (not just a plain helper) so the
// client-side bell can call it directly on a poll interval, not only on the
// initial server render — otherwise a new invite only appeared after a full
// page reload.
export async function getPendingInvites(): Promise<InviteNotification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: invitedRows } = await supabase
    .from("tasting_participants")
    .select("tasting_id")
    .eq("user_id", user.id)
    .eq("status", "INVITED");
  const invitedIds = (invitedRows ?? []).map((r) => r.tasting_id);
  if (invitedIds.length === 0) return [];

  const { data: tastings } = await supabase
    .from("tastings")
    .select("id, name, host_id")
    .in("id", invitedIds);
  const hostIds = [...new Set((tastings ?? []).map((t) => t.host_id))];
  const { data: hosts } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", hostIds.length > 0 ? hostIds : [""]);
  const hostNameById = new Map((hosts ?? []).map((h) => [h.id, h.display_name]));

  return (tastings ?? []).map((t) => ({
    tastingId: t.id,
    tastingName: t.name,
    hostName: hostNameById.get(t.host_id) ?? "Someone",
  }));
}
