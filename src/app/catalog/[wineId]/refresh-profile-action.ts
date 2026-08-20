"use server";

import { createClient } from "@/lib/supabase/server";
import { extractLabel } from "@/lib/label-scan/extract";

// Re-read one wine's label photo and refresh ONLY its structured profile
// (winery blurb, aroma, palate, pairing, serving temperature, decant, ABV).
//
// Identity — producer, name, appellation, grapes, vintage, price — is never
// touched: those are curated, and a second read of the same bottle can easily
// disagree with itself on a cuvée name. This is the per-wine counterpart to
// scripts/backfill-fastcork-profile.mjs, for when someone uploads a better
// photo. Costs one FastCork credit per call.
//
// Authorisation is RLS's job: the UPDATE runs as the caller, so the same
// "catalog update" policy that guards Manage wine guards this.
export async function refreshWineProfile(
  wineId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "You must be signed in." };

  const { data: wine } = await supabase
    .from("catalog_wines")
    .select("image_url")
    .eq("id", wineId)
    .maybeSingle();
  if (!wine?.image_url) {
    return {
      ok: false,
      message: "This wine has no label photo to read. Upload one first.",
    };
  }

  let read;
  try {
    read = await extractLabel(wine.image_url);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "The label read failed.",
    };
  }

  // Nothing substantive came back — leave the existing profile alone rather
  // than replacing a good one with blanks.
  if (!read.wineryDescription && !read.aroma && !read.tastingNotes) {
    return { ok: false, message: "No profile could be read from that photo." };
  }

  const { error } = await supabase
    .from("catalog_wines")
    .update({
      winery_description: read.wineryDescription,
      aroma: read.aroma,
      tasting_notes: read.tastingNotes,
      food_pairing: read.foodPairing,
      serving_temp_min_c: read.servingTempC?.min ?? null,
      serving_temp_max_c: read.servingTempC?.max ?? null,
      decant_minutes: read.decantMinutes,
      alcohol_percent: read.alcoholPercent,
    })
    .eq("id", wineId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
