"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendOutcome } from "@/lib/friends/relationship";
import type { FriendResult, SendFriendResult } from "@/lib/friends/types";

// Friend requests (spec docs/superpowers/specs/2026-09-24-friend-requests-design.md
// §3.1): thin wrappers over the five SECURITY DEFINER RPCs of
// 20260925003000. No action writes friend_requests or friendships directly —
// after 20260925004000 no client can. A refusal ("that account has been
// deleted", "no request to accept", …) comes back verbatim for the button to
// show. The result types live in src/lib/friends/types.ts: this "use server"
// module exports only async functions.

async function signedInClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return supabase;
}

// /community and the other person's profile always change. `header` also
// refreshes every page's server-rendered bell count (AppHeader), for the
// actions that settle a request someone is waiting on.
function refresh(other: string, header: boolean) {
  revalidatePath("/community");
  revalidatePath(`/u/${other}`);
  if (header) revalidatePath("/", "layout");
}

export async function sendFriendRequest(to: string): Promise<SendFriendResult> {
  const supabase = await signedInClient();
  const { data, error } = await supabase.rpc("send_friend_request", { p_to: to });
  if (error) return { error: error.message };
  const outcome = sendOutcome(data);
  // "accepted": the other person had asked first, so their request (which
  // may be in this viewer's bell) is gone.
  refresh(to, outcome === "accepted");
  return { ok: true, outcome };
}

export async function cancelFriendRequest(to: string): Promise<FriendResult> {
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("cancel_friend_request", { p_to: to });
  if (error) return { error: error.message };
  refresh(to, false);
  return { ok: true };
}

export async function acceptFriendRequest(from: string): Promise<FriendResult> {
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("accept_friend_request", { p_from: from });
  // Refresh even on refusal (42501 "no request to accept" — the stale-page
  // case: the request was already settled elsewhere) so the row re-renders
  // its true relationship instead of sitting on a stale Accept/Decline pair
  // until a manual reload. The refusal text still shows underneath it.
  refresh(from, true);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function declineFriendRequest(from: string): Promise<FriendResult> {
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("decline_friend_request", { p_from: from });
  refresh(from, true);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function removeFriend(other: string): Promise<FriendResult> {
  const supabase = await signedInClient();
  const { error } = await supabase.rpc("remove_friend", { p_other: other });
  if (error) return { error: error.message };
  refresh(other, false);
  return { ok: true };
}
