"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Set (or clear) a catalog wine's shared bottle photo. RLS limits the write to the
// wine's creator or a curator; a denied update touches 0 rows, so we surface that.
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
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Only the wine's creator or a curator can set its photo." };
  }
  revalidatePath(`/catalog/${wineId}`);
  revalidatePath("/catalog");
  return { ok: true };
}
