import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { WineColour, WineStyle } from "@/lib/wset/types";
import type { VintageKind } from "@/lib/supabase/database.types";

export type CellarWine = {
  id: string;
  colour: WineColour;
  style: WineStyle;
  cuvee: string | null;
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
  "id, colour, style, cuvee, vintage_kind, vintage_year, vintage_tawny_years, " +
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
    colour: row.colour as WineColour,
    style: row.style as WineStyle,
    cuvee: (row.cuvee as string | null) ?? null,
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

export function catalogWineTitle(wine: {
  producerName: string | null;
  cuvee: string | null;
  vintageKind: VintageKind;
  vintageYear: number | null;
  vintageTawnyYears: number | null;
  appellationName: string | null;
}): string {
  const vintage =
    wine.vintageKind === "YEAR" ? (wine.vintageYear ? String(wine.vintageYear) : null)
    : wine.vintageKind === "TAWNY" ? (wine.vintageTawnyYears ? `${wine.vintageTawnyYears}yo` : "Tawny")
    : "NV";
  return (
    [wine.producerName, wine.cuvee, wine.appellationName, vintage]
      .filter(Boolean)
      .join(" ") || "Untitled wine"
  );
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
