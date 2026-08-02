"use server";

import { createClient } from "@/lib/supabase/server";
import { extractLabel, type ExtractedLabel } from "@/lib/label-scan/extract";

export type ScanMatch = { id: string; name: string };
export type ScanResult = { extracted: ExtractedLabel; matches: ScanMatch[] };

// Read a wine label (Claude vision) and find catalog matches for it. The Scan
// popup uploads the photo to storage and passes the resulting public URL here.
export async function identifyWineFromLabel(
  imageUrl: string,
): Promise<ScanResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to scan a label.");

  const extracted = await extractLabel(imageUrl);

  const query = [extracted.producer, extracted.wineName, extracted.appellation]
    .filter(Boolean)
    .join(" ")
    .trim();

  let matches: ScanMatch[] = [];
  if (query.length >= 2) {
    const { data } = await supabase.rpc("search_catalog_wines", {
      p_query: query,
      p_limit: 5,
    });
    matches = (
      (data ?? []) as Array<{
        id: string;
        wine_name: string;
        producer: string;
        appellation: string;
        vintage_kind: string;
        vintage_year: number | null;
        vintage_tawny_years: number | null;
      }>
    ).map((w) => {
      const vintage =
        w.vintage_kind === "YEAR"
          ? w.vintage_year
            ? String(w.vintage_year)
            : ""
          : w.vintage_kind === "TAWNY"
            ? w.vintage_tawny_years
              ? `${w.vintage_tawny_years}yo`
              : "Tawny"
            : "NV";
      const name = [w.producer, w.wine_name, w.appellation, vintage]
        .filter(Boolean)
        .join(" ");
      return { id: w.id, name: name || "Untitled wine" };
    });
  }

  return { extracted, matches };
}
