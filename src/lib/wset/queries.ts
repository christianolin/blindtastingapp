import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { WineColour, WineStyle, WsetNoteState } from "@/lib/wset/types";
import type { VintageKind } from "@/lib/supabase/database.types";
import { noteStateFromRow } from "@/lib/wset/note-state";
import type { ArchetypeView } from "@/components/wset/archetype-sheet";

export type CellarWine = {
  id: string;
  colour: WineColour | null;
  style: WineStyle | null;
  wineName: string | null;
  imageUrl: string | null;
  vintageKind: VintageKind;
  vintageYear: number | null;
  vintageTawnyYears: number | null;
  producerName: string | null;
  countryName: string | null;
  regionName: string | null;
  appellationName: string | null;
  appellationPlaceKey?: string | null;
  primaryGrapeName: string | null;
  secondaryGrapeName: string | null;
  typeDesignationName: string | null;
  avgScore: number | null;
  noteCount: number;
};

const SELECT =
  "id, appellation_id, colour, style, wine_name, image_url, vintage_kind, vintage_year, vintage_tawny_years, " +
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
    imageUrl: (row.image_url as string | null) ?? null,
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

export type BlendGrape = { name: string; percentage: number | null };

// A wine's full grape blend, ordered by percentage (desc) when any is set, else
// by sort_order — the same rule the derived primary/secondary columns use.
export async function fetchWineBlend(
  supabase: SupabaseClient<Database>,
  wineId: string,
): Promise<BlendGrape[]> {
  const { data } = await supabase
    .from("catalog_wine_grapes")
    .select("percentage, sort_order, grapes(name)")
    .eq("catalog_wine_id", wineId)
    .order("sort_order");
  const rows = (
    (data ?? []) as unknown as Array<{
      percentage: number | null;
      sort_order: number;
      grapes: { name: string } | { name: string }[] | null;
    }>
  ).map((r) => {
    const g = r.grapes;
    const name = Array.isArray(g) ? (g[0]?.name ?? "") : (g?.name ?? "");
    return { name, percentage: r.percentage == null ? null : Number(r.percentage) };
  });
  const anyPct = rows.some((r) => r.percentage != null);
  return anyPct
    ? rows.sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1))
    : rows;
}

// "87% Cabernet Sauvignon, 8% Merlot, 5% Petit Verdot" — or a plain comma list
// when no percentages are recorded.
export function formatBlend(grapes: BlendGrape[]): string {
  return grapes
    .map((g) => (g.percentage != null ? `${g.percentage}% ${g.name}` : g.name))
    .join(", ");
}

// The map place (canonical key) linked to a wine's appellation, if any — powers
// the "view on the map" deep-link. Separate, individually-failing lookups so a
// miss never breaks the wine page.
async function appellationMapKey(
  supabase: SupabaseClient<Database>,
  appellationId: string | null,
): Promise<string | null> {
  if (!appellationId) return null;
  const { data: ap } = await supabase
    .from("appellations")
    .select("wine_place_id")
    .eq("id", appellationId)
    .maybeSingle();
  const placeId = ap?.wine_place_id ?? null;
  if (!placeId) return null;
  const { data: pl } = await supabase
    .from("wine_places")
    .select("canonical_key")
    .eq("id", placeId)
    .maybeSingle();
  return pl?.canonical_key ?? null;
}

export async function fetchCatalogWine(
  supabase: SupabaseClient<Database>,
  wineId: string,
): Promise<CellarWine | null> {
  const { data } = await supabase.from("catalog_wines").select(SELECT).eq("id", wineId).maybeSingle();
  if (!data) return null;
  const row = data as unknown as Record<string, unknown>;
  const [{ data: rating }, appellationPlaceKey] = await Promise.all([
    supabase
      .from("catalog_wine_ratings")
      .select("avg_score, note_count")
      .eq("catalog_wine_id", wineId)
      .maybeSingle(),
    appellationMapKey(supabase, (row.appellation_id as string | null) ?? null),
  ]);
  return {
    ...shape(row, rating ? Number(rating.avg_score) : null, rating?.note_count ?? 0),
    appellationPlaceKey,
  };
}

// --- Saved-note read view (Cellar "My notes" popup) -------------------------

export type NoteContextKind = "OPEN" | "BLIND" | "TRAINING";

// Everything the read-only note popup needs: the wine's display title + origin,
// the full rated state, and a term-id -> label map so composeLiveNote can turn
// the note into prose without loading the whole aroma vocabulary.
export type NoteView = {
  id: string;
  catalogWineId: string;
  title: string;
  subtitle: string | null;
  colour: WineColour | null;
  contextKind: NoteContextKind;
  tastedOn: string;
  state: WsetNoteState;
  termLabels: Map<string, string>;
};

// Loaded lazily when a note is opened (client-side; RLS scopes it to the
// author): note row + wine header + aroma-term labels in a few round-trips.
export async function fetchNoteView(
  supabase: SupabaseClient<Database>,
  noteId: string,
): Promise<NoteView | null> {
  const { data: note } = await supabase
    .from("wset_notes")
    .select("*")
    .eq("id", noteId)
    .maybeSingle();
  if (!note) return null;
  const [wineRes, aromaRes] = await Promise.all([
    supabase
      .from("catalog_wines")
      .select(
        "wine_name, vintage_kind, vintage_year, vintage_tawny_years, colour, " +
          "producer:producers(name), appellation:appellations(name), " +
          "region:regions(name), country:countries(name)",
      )
      .eq("id", note.catalog_wine_id)
      .maybeSingle(),
    supabase
      .from("wset_note_aromas")
      .select("term_id, sensed_on_nose, sensed_on_palate")
      .eq("note_id", noteId),
  ]);

  const aromaRows = (aromaRes.data ?? []) as Array<{
    term_id: string;
    sensed_on_nose: boolean;
    sensed_on_palate: boolean;
  }>;

  const termLabels = new Map<string, string>();
  const termIds = aromaRows.map((a) => a.term_id);
  if (termIds.length > 0) {
    const { data: termRows } = await supabase
      .from("wset_aroma_terms")
      .select("id, term")
      .in("id", termIds);
    for (const t of termRows ?? []) termLabels.set(t.id, t.term);
  }

  const wine = wineRes.data as Record<string, unknown> | null;
  const title = wine
    ? catalogWineTitle({
        producerName: name(wine.producer),
        wineName: (wine.wine_name as string | null) ?? null,
        vintageKind: wine.vintage_kind as VintageKind,
        vintageYear: (wine.vintage_year as number | null) ?? null,
        vintageTawnyYears: (wine.vintage_tawny_years as number | null) ?? null,
        appellationName: name(wine.appellation),
      })
    : "Untitled wine";
  const subtitle = wine
    ? [name(wine.region), name(wine.country)].filter(Boolean).join(" · ") || null
    : null;

  return {
    id: note.id,
    catalogWineId: note.catalog_wine_id,
    title,
    subtitle,
    colour: (wine?.colour as WineColour | null) ?? null,
    contextKind: note.context_kind as NoteContextKind,
    tastedOn: note.tasted_on,
    state: noteStateFromRow(note, aromaRows),
    termLabels,
  };
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

export type WineStructureDimension = {
  dimension: string;
  avgIndex: number;
  maxIndex: number;
  n: number;
};

// Community-averaged nose/palate structure for a wine (SECURITY DEFINER RPC;
// aggregates the ordinal SAT fields across all authors). Returned in WSET order
// nose -> finish; dimensions with no data are already omitted server-side.
export async function fetchWineStructure(
  supabase: SupabaseClient<Database>,
  wineId: string,
): Promise<WineStructureDimension[]> {
  const { data } = await supabase.rpc("catalog_wine_structure", {
    p_catalog_wine_id: wineId,
  });
  return (data ?? []).map((r) => ({
    dimension: r.dimension as string,
    avgIndex: Number(r.avg_index),
    maxIndex: Number(r.max_index),
    n: Number(r.n),
  }));
}

// --- Wine-style archetypes (A) ----------------------------------------------

export type ArchetypeListItem = {
  id: string;
  name: string;
  colour: WineColour;
  style: WineStyle;
};

// A single "typical wine from here" reference profile, assembled for the
// read-only ArchetypeSheet. Place name, grape names and aroma terms are looked
// up separately (small reference set) to sidestep embed-relationship typing.
export async function fetchArchetype(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<ArchetypeView | null> {
  const { data: row } = await supabase
    .from("wine_archetypes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row) return null;

  const grapeIds = [row.primary_grape_id, row.secondary_grape_id].filter(
    (v): v is string => Boolean(v),
  );
  const [placeRes, grapesRes, linkRes] = await Promise.all([
    supabase.from("wine_places").select("name").eq("id", row.wine_place_id).maybeSingle(),
    grapeIds.length
      ? supabase.from("grapes").select("id, name").in("id", grapeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase.from("wine_archetype_aromas").select("term_id, kind").eq("archetype_id", id),
  ]);

  const grapeName = new Map((grapesRes.data ?? []).map((g) => [g.id, g.name] as const));
  const grapes = [row.primary_grape_id, row.secondary_grape_id]
    .map((gid) => (gid ? grapeName.get(gid) : null))
    .filter((v): v is string => Boolean(v))
    .join(" · ");

  const links = linkRes.data ?? [];
  const noseIds = links.filter((l) => l.kind === "NOSE").map((l) => l.term_id);
  const palateIds = links.filter((l) => l.kind === "PALATE").map((l) => l.term_id);
  const allIds = Array.from(new Set([...noseIds, ...palateIds]));
  const termById = new Map<string, { term: string; sort_order: number }>();
  if (allIds.length > 0) {
    const { data: terms } = await supabase
      .from("wset_aroma_terms")
      .select("id, term, sort_order")
      .in("id", allIds);
    for (const t of terms ?? []) termById.set(t.id, { term: t.term, sort_order: t.sort_order });
  }
  const sortedTerms = (ids: string[]) =>
    ids
      .map((tid) => termById.get(tid))
      .filter((t): t is { term: string; sort_order: number } => Boolean(t))
      .sort((x, y) => x.sort_order - y.sort_order)
      .map((t) => t.term);

  return {
    name: row.name,
    colour: row.colour,
    style: row.style,
    placeName: placeRes.data?.name ?? "",
    grapes,
    description: row.description,
    qualityLow: row.quality_low,
    qualityHigh: row.quality_high,
    sat: row.sat,
    aromas: sortedTerms(noseIds),
    flavours: sortedTerms(palateIds),
  };
}

// The archetypes hung off a map place (canonical key), curated order — powers
// the map's "typical wines from here" deep-links.
export async function fetchArchetypesForPlace(
  supabase: SupabaseClient<Database>,
  canonicalKey: string,
): Promise<ArchetypeListItem[]> {
  const { data: place } = await supabase
    .from("wine_places")
    .select("id")
    .eq("canonical_key", canonicalKey)
    .maybeSingle();
  if (!place) return [];
  const { data: placements } = await supabase
    .from("wine_archetype_placements")
    .select("archetype_id, sort_order")
    .eq("wine_place_id", place.id)
    .order("sort_order");
  const ids = (placements ?? []).map((p) => p.archetype_id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("wine_archetypes")
    .select("id, name, colour, style")
    .in("id", ids);
  const byId = new Map((data ?? []).map((r) => [r.id, r] as const));
  // Preserve the placement order (admin-controlled per place).
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({ id: r.id, name: r.name, colour: r.colour, style: r.style }));
}
