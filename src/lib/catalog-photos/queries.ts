import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isScanPath } from "@/lib/catalog-photos/strip";
import type { StripPhoto } from "@/lib/catalog-photos/types";

// The wine page's photo rows (scan photos spec §8.2), read as the viewer: RLS
// ("catalog_wine_photos read") decides what is visible — nothing of a
// blind_pending wine. The photographers' names come from a second query, not
// an embed (database.types.ts carries no FK names). Strip ordering and the
// main-photo exclusion are the pure `stripPhotos` (strip.ts).

const PHOTO_LIMIT = 200;
const UNKNOWN_NAME = "someone";

export async function fetchWinePhotos(
  supabase: SupabaseClient<Database>,
  wineId: string,
  viewerId: string,
): Promise<StripPhoto[]> {
  const { data: rows, error } = await supabase
    .from("catalog_wine_photos")
    .select("id, image_path, added_by, created_at")
    .eq("catalog_wine_id", wineId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PHOTO_LIMIT);
  if (error) {
    // A missing strip never breaks the wine page.
    console.error("catalog wine photos: read failed", { message: error.message });
    return [];
  }
  if (!rows || rows.length === 0) return [];

  const others = [...new Set(rows.map((r) => r.added_by))].filter((id) => id !== viewerId);
  const names = new Map<string, string>();
  if (others.length > 0) {
    const { data: people, error: peopleError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", others);
    if (peopleError) {
      console.error("catalog wine photos: names read failed", { message: peopleError.message });
    }
    for (const p of people ?? []) {
      const name = p.display_name.trim();
      if (name) names.set(p.id, name);
    }
  }

  const bucket = supabase.storage.from("wine-images");
  return rows.map((r) => ({
    id: r.id,
    // getPublicUrl builds the URL locally; it makes no request.
    url: bucket.getPublicUrl(r.image_path).data.publicUrl,
    imagePath: r.image_path,
    addedBy: r.added_by,
    addedByName: names.get(r.added_by) ?? UNKNOWN_NAME,
    createdAt: r.created_at,
    isScan: isScanPath(r.image_path),
  }));
}
