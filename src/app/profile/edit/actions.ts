"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  FAVOURITE_PRODUCER_IDS_FIELD,
  FAVOURITE_REGION_IDS_FIELD,
  parseFavouriteIds,
  setProfileFavourites,
} from "@/lib/profile-favourites";

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

  if (!displayName) {
    return { error: "Name is required." };
  }

  // An absent field means "leave favourites alone" (D11): an old cached
  // form, or a settings page whose favourites failed to load and so posted
  // no hidden inputs at all. Only when BOTH lists are present do we replace
  // either — a half-posted form is never trusted, and the RPC always
  // replaces both sets together.
  const regionIds = parseFavouriteIds(formData.get(FAVOURITE_REGION_IDS_FIELD));
  const producerIds = parseFavouriteIds(formData.get(FAVOURITE_PRODUCER_IDS_FIELD));
  if (regionIds !== null && producerIds !== null) {
    const saved = await setProfileFavourites(supabase, regionIds, producerIds);
    if ("error" in saved) {
      return { error: saved.error };
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      bio: bio || null,
      location: location || null,
      phone: phone || null,
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/u/${user.id}`);
  redirect(`/u/${user.id}`);
}
