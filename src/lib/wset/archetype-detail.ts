// A single "typical wine from here" reference profile, assembled for the
// read-only ArchetypeSheet the wine map opens from its "Typical wine" list.
// Place name, grape names and aroma terms are looked up separately (a small
// reference set) to sidestep embed-relationship typing.
//
// Its own module, with type-only `@/` imports, so vitest (node, no path alias)
// can load it; ./queries re-exports it for every existing importer. Same split
// as ./archetype-query, and for the same reason.
//
// Spec: docs/superpowers/specs/2026-09-20-wine-map-data-latency.md §12.7.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ArchetypeView } from "@/components/wset/archetype-sheet";

export async function fetchArchetype(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<ArchetypeView | null> {
  // The aroma links are keyed by the id this function was CALLED with, not by
  // anything on the archetype row, so they never needed to wait for it. Starting
  // them here instead of in the round below lets the aroma TERMS — which do
  // depend on them — resolve a whole network round trip sooner: the sheet opens
  // in two rounds rather than three, at ~340 ms of round trip each on the
  // production trace. Nothing about any query itself changes.
  const linkPromise = supabase
    .from("wine_archetype_aromas")
    .select("term_id, kind")
    .eq("archetype_id", id);

  const { data: row } = await supabase
    .from("wine_archetypes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!row) {
    // Settle the request that is already out, so an unknown id leaves no
    // floating promise behind.
    await linkPromise;
    return null;
  }

  const grapeIds = [row.primary_grape_id, row.secondary_grape_id].filter(
    (v): v is string => Boolean(v),
  );
  const [placeRes, grapesRes, linkRes] = await Promise.all([
    supabase.from("wine_places").select("name").eq("id", row.wine_place_id).maybeSingle(),
    grapeIds.length
      ? supabase.from("grapes").select("id, name").in("id", grapeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    linkPromise,
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
