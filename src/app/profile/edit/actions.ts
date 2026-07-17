"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EditProfileFormState = { error: string } | null;

export async function updateProfile(
  _prevState: EditProfileFormState,
  formData: FormData,
): Promise<EditProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const displayName = String(formData.get("display_name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const favoriteWineType =
    String(formData.get("favorite_wine_type") ?? "").trim() || null;

  if (!displayName) {
    return { error: "Name is required." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      bio: bio || null,
      location: location || null,
      phone: phone || null,
      favorite_wine_type: favoriteWineType,
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/u/${user.id}`);
  redirect(`/u/${user.id}`);
}
