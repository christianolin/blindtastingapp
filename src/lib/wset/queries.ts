import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { WineColour, WineStyle } from "@/lib/wset/types";
import type { VintageKind } from "@/lib/supabase/database.types";

export type CellarWine = {
  id: string;
  colour: WineColour | null;
  style: WineStyle | null;
  wineName: string | null;
  vintageKind: VintageKind;
  vintageYear: number | null;
  vintageTawnyYears: number | null;
  producerName: string | null;
  countryName: string | null;
  regionName: string | null;
  appellationName: string | null;
  primaryGrapeName: string | null;
  secondaryGrapeName: string | null;
  typeDesignationName: string | null;
  avgScore: number | null;
  noteCount: number;
};

const SELECT =
  "id, colour, style, wine_name, vintage_kind, vintage_year, vintage_tawny_years, " +
  "producer:producers(name), country:countries(name), region:regions(name), " +
  "appellation:appellations(name), " +
  "primary_grape:grapes!catalog_wines_primary_grape_id_fkey(name), " +
  "secondary_grape:grapes!catalog_wines_secondary_grape_id_fkey(name), " +
  "type_designation:type_designations(name)";

// PostgREST embeds arrive as arrays or single objects depending on the client
// version; normalise to a name string.
function name(rel: unknown): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return (row as { name?: string } | undefined)?.name ?? null;
}

function shape(row: Record<string, unknown>, avgScore: number | null, noteCount: number): CellarWine {
  return {
    id: row.id as string,
    colour: (row.colour as WineColour | null) ?? null,
    style: (row.style as WineStyle | null) ?? null,
    wineName: (row.wine_name as string | null) ?? null,
    vintageKind: row.vintage_kind as VintageKind,
    vintageYear: (row.vintage_year as number | null) ?? null,
    vintageTawnyYears: (row.vintage_tawny_years as number | null) ?? null,
    producerName: name(row.producer),
    countryName: name(row.country),
    regionName: name(row.region),
    appellationName: name(row.appellation),
    primaryGrapeName: name(row.primary_grape),
    secondaryGrapeName: name(row.secondary_grape),
    typeDesignationName: name(row.type_designation),
    avgScore,
    noteCount,
  };
}

// Builds a readable title, collapsing exact repeats — a wine whose name equals its
// producer (e.g. "Château Lascombes") renders once, not twice.
export function catalogWineTitle(wine: {
  producerName: string | null;
  wineName: string | null;
  vintageKind: VintageKind;
  vintageYear: number | null;
  vintageTawnyYears: number | null;
  appellationName: string | null;
}): string {
  const vintage =
    wine.vintageKind === "YEAR" ? (wine.vintageYear ? String(wine.vintageYear) : null)
    : wine.vintageKind === "TAWNY" ? (wine.vintageTawnyYears ? `${wine.vintageTawnyYears}yo` : "Tawny")
    : "NV";
  const parts = [wine.producerName, wine.wineName, wine.appellationName, vintage].filter(
    Boolean,
  ) as string[];
  const seen = new Set<string>();
  const deduped = parts.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.join(" ") || "Untitled wine";
}

export async function fetchCatalogWine(
  supabase: SupabaseClient<Database>,
  wineId: string,
): Promise<CellarWine | null> {
  const { data } = await supabase.from("catalog_wines").select(SELECT).eq("id", wineId).maybeSingle();
  if (!data) return null;
  const { data: rating } = await supabase
    .from("catalog_wine_ratings")
    .select("avg_score, note_count")
    .eq("catalog_wine_id", wineId)
    .maybeSingle();
  return shape(
    data as unknown as Record<string, unknown>,
    rating ? Number(rating.avg_score) : null,
    rating?.note_count ?? 0,
  );
}

// --- Wine-hub aggregates (P3) -----------------------------------------------

export type WineDescriptor = { term: string; origin: string | null; mentions: number };

// The community's most-mentioned aromas/flavours for a wine, drawn from the
// public catalog_wine_descriptors view (all notes, any author).
export async function fetchWineDescriptors(
  supabase: SupabaseClient<Database>,
  wineId: string,
  limit = 14,
): Promise<WineDescriptor[]> {
  const { data } = await supabase
    .from("catalog_wine_descriptors")
    .select("term, origin, mentions")
    .eq("catalog_wine_id", wineId)
    .order("mentions", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .map((d) => ({
      term: (d.term as string | null) ?? "",
      origin: (d.origin as string | null) ?? null,
      mentions: (d.mentions as number | null) ?? 0,
    }))
    .filter((d) => d.term);
}

export type WineGuessField = { key: string; label: string; correct: number; pct: number };
export type WineGuessStats = {
  appearances: number;
  guessCount: number;
  fields: WineGuessField[];
};

// Aggregate blind-tasting track record via the SECURITY DEFINER RPC (revealed
// wines + scored guesses only). Returns per-field guess accuracy.
export async function fetchWineGuessStats(
  supabase: SupabaseClient<Database>,
  wineId: string,
): Promise<WineGuessStats | null> {
  const { data } = await supabase.rpc("catalog_wine_guess_stats", {
    p_catalog_wine_id: wineId,
  });
  const row = data?.[0];
  if (!row) return null;
  const gc = row.guess_count ?? 0;
  const pct = (n: number) => (gc > 0 ? Math.round((100 * n) / gc) : 0);
  const fields: WineGuessField[] = [
    { key: "country", label: "Country", correct: row.country_correct ?? 0 },
    { key: "region", label: "Region", correct: row.region_correct ?? 0 },
    { key: "appellation", label: "Appellation", correct: row.appellation_correct ?? 0 },
    { key: "primary_grape", label: "Grape", correct: row.primary_grape_correct ?? 0 },
    { key: "producer", label: "Producer", correct: row.producer_correct ?? 0 },
    { key: "vintage", label: "Vintage", correct: row.vintage_correct ?? 0 },
  ].map((f) => ({ ...f, pct: pct(f.correct) }));
  return { appearances: row.appearances ?? 0, guessCount: gc, fields };
}
