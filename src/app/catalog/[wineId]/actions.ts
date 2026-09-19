"use server";

import { revalidatePath } from "next/cache";
import { isUnrevealedGlassRefusal, UNREVEALED_GLASS_PHOTO } from "@/lib/catalog/rule1-guard";
import { createClient } from "@/lib/supabase/server";

// Set (or clear) a catalog wine's shared bottle photo. RLS limits the write to the
// wine's creator or a curator; a denied update touches 0 rows, so we surface that.
// Rule 1: the database also refuses the adder of a still-unrevealed glass of this
// wine (catalog_wines_rule1_guard, 20260919213300 — attach_catalog_wine_photo's
// step 7), so a direct POST of this action can never change a poured wine's photo.
export async function setCatalogWineImage(
  wineId: string,
  imageUrl: string | null,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("catalog_wines")
    .update({ image_url: imageUrl })
    .eq("id", wineId)
    .select("id");
  if (error) {
    // Rule 1: the database refuses the adder of a still-unrevealed glass of this
    // wine (catalog_wines_rule1_guard, attach_catalog_wine_photo's step 7); nobody
    // else is refused for linkage.
    if (isUnrevealedGlassRefusal(error)) return { error: UNREVEALED_GLASS_PHOTO };
    return { error: error.message };
  }
  if (!data || data.length === 0) {
    return { error: "Only the wine's creator or a curator can set its photo." };
  }
  revalidatePath(`/catalog/${wineId}`);
  revalidatePath("/catalog");
  return { ok: true };
}
