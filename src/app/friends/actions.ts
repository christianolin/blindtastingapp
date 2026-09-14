"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FriendResult = { error: string } | { ok: true };

export async function addFriend(friendId: string): Promise<FriendResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("friendships")
    .insert({ user_id: user.id, friend_id: friendId });
  // Already friends is the outcome the caller wanted, not a failure
  // (same reading as addPlacement's 23505).
  if (error && error.code !== "23505") return { error: error.message };

  revalidatePath("/community");
  revalidatePath(`/u/${friendId}`);
  return { ok: true };
}

export async function removeFriend(friendId: string): Promise<FriendResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("user_id", user.id)
    .eq("friend_id", friendId);
  if (error) return { error: error.message };

  revalidatePath("/community");
  revalidatePath(`/u/${friendId}`);
  return { ok: true };
}
