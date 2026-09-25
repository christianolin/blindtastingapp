"use server";

import { createClient } from "@/lib/supabase/server";
import {
  mergeNotifications,
  type FriendRequestNotification,
  type PendingNotification,
  type TastingInviteNotification,
} from "@/lib/notification-items";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Everything waiting on the current user, for the header's notifications
// bell: pending tasting invitations, then friend requests (friend-requests
// spec §3.6). A "use server" action (not just a plain helper) so the
// client-side bell can call it directly on a poll interval, not only on the
// initial server render — otherwise a new invite only appeared after a full
// page reload. The item types live in src/lib/notification-items.ts: this
// module exports only async functions.
export async function getPendingInvites(): Promise<PendingNotification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [tastings, friends] = await Promise.all([
    pendingTastingInvites(supabase, user.id),
    pendingFriendRequests(supabase, user.id),
  ]);
  return mergeNotifications(tastings, friends);
}

// A finished (CLOSED) tasting can no longer be accepted (spec §D.4 #5), so
// its leftover invite is not a notification.
async function pendingTastingInvites(
  supabase: Supabase,
  userId: string,
): Promise<TastingInviteNotification[]> {
  const { data: invitedRows } = await supabase
    .from("tasting_participants")
    .select("tasting_id")
    .eq("user_id", userId)
    .eq("status", "INVITED");
  const invitedIds = (invitedRows ?? []).map((r) => r.tasting_id);
  if (invitedIds.length === 0) return [];

  const { data: tastings } = await supabase
    .from("tastings")
    .select("id, name, host_id, status")
    .in("id", invitedIds);
  const open = (tastings ?? []).filter((t) => t.status !== "CLOSED");
  if (open.length === 0) return [];

  const hostIds = [...new Set(open.map((t) => t.host_id))];
  const { data: hosts } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", hostIds);
  const hostNameById = new Map((hosts ?? []).map((h) => [h.id, h.display_name]));

  return open.map((t) => ({
    kind: "tasting" as const,
    tastingId: t.id,
    tastingName: t.name,
    hostName: hostNameById.get(t.host_id) ?? "Someone",
  }));
}

// Requests waiting on the user ("friend_requests read own"), with the
// requester's directory name and avatar. A deleted requester is left out
// (account deletion removes their requests anyway), and a failed read is an
// empty list, never a broken bell.
async function pendingFriendRequests(
  supabase: Supabase,
  userId: string,
): Promise<FriendRequestNotification[]> {
  const { data: requests } = await supabase
    .from("friend_requests")
    .select("requester_id, created_at")
    .eq("recipient_id", userId);
  if (!requests || requests.length === 0) return [];

  const { data: people } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in(
      "id",
      requests.map((r) => r.requester_id),
    )
    .is("deleted_at", null);
  const byId = new Map((people ?? []).map((p) => [p.id, p]));

  return requests.flatMap((r) => {
    const person = byId.get(r.requester_id);
    return person
      ? [
          {
            kind: "friend" as const,
            requesterId: person.id,
            requesterName: person.display_name,
            avatarUrl: person.avatar_url,
            createdAt: r.created_at,
          },
        ]
      : [];
  });
}
