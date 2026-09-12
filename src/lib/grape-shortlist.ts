"use server";

// "Grown in Piedmont · from your region guess" — the grape picker's shortlist
// and the ladder's inline grape chips. Bridges the scoring `regions` table to
// the map's `wine_places` catalog: a region links directly through
// regions.wine_place_id when curated, otherwise by a case/accent-insensitive
// name match (checked against the country so "Champagne" the Fleurie lieu-dit
// never stands in for the region). The place's published grape links plus
// those of every descendant (villages, crus) make the list, PRINCIPAL grapes
// before ACCESSORY ones, most-linked first within each. Empty when the
// region maps to nothing — unmapped regions are the common case outside the
// countries the map covers, so callers must treat [] as "no chips", not an
// error. Every read is RLS-legal for a signed-in user (verified places,
// published links).
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { deaccent } from "@/lib/deaccent";
import type { GrapeShortlist } from "@/app/tastings/[id]/play/ladder-types";

const EMPTY: GrapeShortlist = { grapeIds: [], placeName: null, details: {} };

// How many linked places name a grape's secondary line ("Barolo, Barbaresco").
const MAX_PLACES_PER_GRAPE = 3;

// The kinds a scoring region can plausibly be. Sites and vineyards are never
// regions, and excluding them keeps the candidate fetch small.
const REGION_KINDS = ["COUNTRY", "MACRO_REGION", "REGION", "SUBREGION"] as const;

// Case/accent/punctuation-insensitive key for name matching.
function fold(name: string): string {
  return deaccent(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type PlaceLite = {
  id: string;
  name: string;
  kind: string;
  primary_parent_id: string | null;
};

// Walks primary_parent_id up to the COUNTRY-kind ancestor's name.
function countryNameOf(place: PlaceLite, byId: Map<string, PlaceLite>): string | null {
  let cur: PlaceLite | undefined = place;
  for (let i = 0; cur && i < 12; i++) {
    if (cur.kind === "COUNTRY") return cur.name;
    cur = cur.primary_parent_id ? byId.get(cur.primary_parent_id) : undefined;
  }
  return null;
}

const compute = cache(async (regionId: string): Promise<GrapeShortlist> => {
  if (!regionId) return EMPTY;
  const supabase = await createClient();

  const { data: region } = await supabase
    .from("regions")
    .select("id, name, wine_place_id, country_id")
    .eq("id", regionId)
    .maybeSingle();
  if (!region) return EMPTY;

  let placeId: string | null = region.wine_place_id;
  let placeName: string | null = null;

  if (placeId) {
    const { data: place } = await supabase
      .from("wine_places")
      .select("id, name")
      .eq("id", placeId)
      .maybeSingle();
    // A link to an unverified (RLS-hidden) place reads as no link.
    if (!place) placeId = null;
    else placeName = place.name;
  }

  if (!placeId) {
    // Name match, scoped to the region's country. Region-kind places are a
    // few hundred rows at most, so fold them in memory rather than fight
    // PostgREST's accent-blind ilike.
    const [{ data: country }, { data: places }, { data: aliases }] = await Promise.all([
      supabase.from("countries").select("name").eq("id", region.country_id).maybeSingle(),
      supabase
        .from("wine_places")
        .select("id, name, kind, primary_parent_id")
        .in("kind", [...REGION_KINDS]),
      supabase.from("wine_place_aliases").select("wine_place_id, name, normalized_name"),
    ]);
    const byId = new Map<string, PlaceLite>((places ?? []).map((p) => [p.id, p]));
    const wanted = fold(region.name);
    const wantedCountry = country ? fold(country.name) : null;

    const candidateIds = new Set<string>();
    for (const p of places ?? []) {
      if (p.kind !== "COUNTRY" && fold(p.name) === wanted) candidateIds.add(p.id);
    }
    for (const a of aliases ?? []) {
      if (fold(a.name) === wanted || fold(a.normalized_name) === wanted) {
        const p = byId.get(a.wine_place_id);
        if (p && p.kind !== "COUNTRY") candidateIds.add(p.id);
      }
    }
    const match = [...candidateIds]
      .map((id) => byId.get(id)!)
      .find((p) => {
        const c = countryNameOf(p, byId);
        return wantedCountry == null || c == null || fold(c) === wantedCountry;
      });
    if (!match) return EMPTY;
    placeId = match.id;
    placeName = match.name;
  }

  // The place and every descendant (primary_parent_id walk, level by level).
  // Names are kept in discovery order — shallower places first, alphabetical
  // within a level — so a grape's secondary line leads with its districts
  // and appellations, not a lone climat.
  const ids = [placeId];
  const nameById = new Map<string, string>();
  let frontier = [placeId];
  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const { data: children } = await supabase
      .from("wine_places")
      .select("id, name")
      .in("primary_parent_id", frontier)
      .order("name");
    frontier = (children ?? []).map((c) => c.id).filter((id) => !ids.includes(id));
    for (const c of children ?? []) nameById.set(c.id, c.name);
    ids.push(...frontier);
  }

  // Published grape links for all of them; chunked so a deep region
  // (Burgundy's hundreds of climats) never overflows the query string. The
  // region's own link (the top place) counts but names no sub-place — the
  // heading already says "Grown in Piedmont".
  const principal = new Map<string, number>();
  const accessory = new Map<string, number>();
  const placeIdsByGrape = new Map<string, Set<string>>();
  const CHUNK = 150;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data: links } = await supabase
      .from("wine_place_grapes")
      .select("grape_id, role, wine_place_id")
      .in("wine_place_id", ids.slice(i, i + CHUNK));
    for (const l of links ?? []) {
      const bucket = l.role === "PRINCIPAL" ? principal : accessory;
      bucket.set(l.grape_id, (bucket.get(l.grape_id) ?? 0) + 1);
      if (l.wine_place_id !== placeId) {
        const set = placeIdsByGrape.get(l.grape_id) ?? new Set<string>();
        set.add(l.wine_place_id);
        placeIdsByGrape.set(l.grape_id, set);
      }
    }
  }

  const byCount = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const grapeIds = byCount(principal);
  for (const id of byCount(accessory)) {
    if (!grapeIds.includes(id)) grapeIds.push(id);
  }
  if (grapeIds.length === 0) return { grapeIds, placeName, details: {} };

  // Colour for "Gavi · white" — one small read over the shortlist only.
  const { data: grapeRows } = await supabase
    .from("grapes")
    .select("id, color")
    .in("id", grapeIds);
  const colorById = new Map((grapeRows ?? []).map((g) => [g.id, g.color]));

  // Links arrive chunk by chunk, so the places are re-sorted into discovery
  // order (ids[] is that order) before the line is trimmed.
  const orderIndex = new Map(ids.map((id, i) => [id, i]));
  const details: GrapeShortlist["details"] = {};
  for (const id of grapeIds) {
    const places = [...(placeIdsByGrape.get(id) ?? [])]
      .sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0))
      .map((placeId) => nameById.get(placeId))
      .filter((n): n is string => Boolean(n));
    details[id] = {
      places: [...new Set(places)].slice(0, MAX_PLACES_PER_GRAPE),
      color: colorById.get(id) ?? null,
    };
  }
  return { grapeIds, placeName, details };
});

/**
 * Shortlist of grape ids grown in a scoring region (PRINCIPAL first, then
 * ACCESSORY), plus the map place name it came from. Memoised per request
 * with React cache(); callable from the ladder as a server action when the
 * region guess changes.
 */
export async function shortlistGrapesForRegion(
  regionId: string,
): Promise<GrapeShortlist> {
  return compute(regionId);
}
