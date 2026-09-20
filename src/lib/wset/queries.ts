import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { WineColour, WineStyle, WsetNoteState } from "@/lib/wset/types";
import type { VintageKind } from "@/lib/supabase/database.types";
import { noteStateFromRow } from "@/lib/wset/note-state";
import { catalogWineTitle } from "@/lib/wset/wine-title";
import type { ArchetypeListItem } from "@/lib/wset/archetype-rows";
import { fetchArchetypesForPlace } from "@/lib/wset/archetype-query";
import { fetchArchetype } from "@/lib/wset/archetype-detail";

export type CellarWine = {
  id: string;
  colour: WineColour | null;
  style: WineStyle | null;
  wineName: string | null;
  description: string | null;
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
  /** Alcohol by volume as printed on the label (the label reader or Manage
      wine). `description` above is the wine's one catalog text ("About this
      wine"); the FastCork-era profile columns are no longer read. */
  alcoholPercent: number | null;
  avgScore: number | null;
  noteCount: number;
};

const SELECT =
  "id, appellation_id, colour, style, wine_name, description, image_url, vintage_kind, vintage_year, vintage_tawny_years, " +
  "alcohol_percent, " +
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
    description: (row.description as string | null) ?? null,
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
    alcoholPercent:
      row.alcohol_percent == null ? null : Number(row.alcohol_percent),
    avgScore,
    noteCount,
  };
}

// The title builder lives in the pure ./wine-title module so vitest can load it;
// re-exported here so its many importers keep importing it from queries.
export { catalogWineTitle };

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
  // Null before a hidden glass's reveal (blind-tasting B8) — the wine header
  // then falls back to "Untitled wine" the same way a deleted wine would.
  catalogWineId: string | null;
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
    note.catalog_wine_id
      ? supabase
          .from("catalog_wines")
          .select(
            "wine_name, vintage_kind, vintage_year, vintage_tawny_years, colour, " +
              "producer:producers(name), appellation:appellations(name), " +
              "region:regions(name), country:countries(name)",
          )
          .eq("id", note.catalog_wine_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
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

/**
 * A hidden-glass note's saved state, for reopening it before the glass is
 * revealed (blind-tasting B8) — plus whichever identity it has resolved to
 * since it was last opened, if any. A note left open across a reveal (or one
 * that raced it and attached on write, M5x2) is no longer identity-less by
 * the time someone reopens it; the caller uses `catalogWineId`/
 * `unidentifiedWineId` to open it as a resolved note instead of the
 * still-hidden editor (BT-N1 hand-off, spec §9.4/§9.5) — a hidden editor's
 * unknown-colour fallback only fits a note that is genuinely still hidden.
 */
export async function fetchHiddenNoteState(
  supabase: SupabaseClient<Database>,
  noteId: string,
): Promise<{
  state: WsetNoteState;
  catalogWineId: string | null;
  unidentifiedWineId: string | null;
} | null> {
  const [{ data: note }, { data: aromaRows }] = await Promise.all([
    supabase.from("wset_notes").select("*").eq("id", noteId).maybeSingle(),
    supabase
      .from("wset_note_aromas")
      .select("term_id, sensed_on_nose, sensed_on_palate")
      .eq("note_id", noteId),
  ]);
  if (!note) return null;
  return {
    state: noteStateFromRow(note, aromaRows ?? []),
    catalogWineId: note.catalog_wine_id,
    unidentifiedWineId: note.unidentified_wine_id,
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

// The list item type and its row mapper live in the pure ./archetype-rows
// module (vitest can load it; this file cannot be imported without the `@/`
// alias). Re-exported here so every existing importer is unchanged.
export type { ArchetypeListItem };

// The one-archetype detail query lives in the pure ./archetype-detail module
// (vitest can load it; this file cannot be imported without the `@/` alias).
// Re-exported so every existing importer is unchanged.
export { fetchArchetype };

// The one-request archetypes-for-a-place query lives in the pure
// ./archetype-query module (vitest can load it; this file cannot be imported
// without the `@/` alias). Re-exported so every existing importer is unchanged.
export { fetchArchetypesForPlace };
