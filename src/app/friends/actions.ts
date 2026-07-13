"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function addFriend(friendId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  await supabase
    .from("friendships")
    .insert({ user_id: user.id, friend_id: friendId });

  revalidatePath("/friends");
  revalidatePath("/people");
  revalidatePath(`/u/${friendId}`);
}

export async function removeFriend(friendId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  await supabase
    .from("friendships")
    .delete()
    .eq("user_id", user.id)
    .eq("friend_id", friendId);

  revalidatePath("/friends");
  revalidatePath("/people");
  revalidatePath(`/u/${friendId}`);
}
