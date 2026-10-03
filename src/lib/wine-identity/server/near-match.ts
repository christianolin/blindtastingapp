import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import {
  isSameIdentity,
  nearMatchQuery,
  nearMatchRows,
  type NearMatchCandidate,
  type NearMatches,
  type ProducerSuggestion,
} from "../near-match";
import type { WineIdentityDraft } from "../types";

/** Candidates read per check; the prompt shows NEAR_MATCH_SHOWN of them. */
const CANDIDATE_LIMIT = 20;
/** "Did you mean …?" offers at most this many producers. */
const PRODUCER_LIMIT = 3;

/**
 * "Already in the catalog?" for a draft that is about to become a new catalog
 * wine (owner, 2026-10-03), or null when there is nothing to ask:
 * - the wines come from `catalog_wine_near_matches` (20261003100000): SECURITY
 *   INVOKER, never a blind_pending or merged row, so no hidden glass's identity
 *   can reach the prompt (rule 1), and nothing here widens the accepted F12
 *   residual;
 * - when one of them is this very wine, the add links to it on its own
 *   (`find_or_create_catalog_wine`'s folded lookup), so nothing is asked;
 * - a producer typed or read as a new name also gets "Did you mean …?" from
 *   `similar_producers` (region first).
 * Throws on a database error; the caller fails open.
 */
export async function loadNearMatches(
  supabase: SupabaseClient<Database>,
  draft: WineIdentityDraft,
): Promise<NearMatches | null> {
  const query = nearMatchQuery(draft);
  if (query === null) return null;

  const pendingProducer = draft.producer?.kind === "pending";
  const [wines, producers] = await Promise.all([
    supabase.rpc("catalog_wine_near_matches", {
      p_producer_id: query.producerId,
      p_producer_name: query.producerName,
      p_region_id: query.regionId,
      p_wine_name: query.wineName,
      p_limit: CANDIDATE_LIMIT,
    }),
    pendingProducer
      ? supabase.rpc("similar_producers", { p_name: query.producerName, p_region_id: query.regionId, p_limit: PRODUCER_LIMIT })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (wines.error) throw new Error(`catalog_wine_near_matches failed: ${wines.error.message}`);
  if (producers.error) throw new Error(`similar_producers failed: ${producers.error.message}`);

  const candidates: NearMatchCandidate[] = (wines.data ?? []).map((row) => ({
    id: row.id,
    producerId: row.producer_id,
    producerName: row.producer_name,
    wineName: row.wine_name,
    vintage: { kind: row.vintage_kind, year: row.vintage_year, tawnyYears: row.vintage_tawny_years },
    colour: row.colour,
    style: row.style,
    countryId: row.country_id,
    regionId: row.region_id,
    appellationId: row.appellation_id,
    appellationName: row.appellation_name,
    primaryGrapeId: row.primary_grape_id,
    primaryGrapeName: row.primary_grape_name,
    producerStrength: Number(row.producer_strength),
    nameScore: Number(row.name_score),
  }));
  if (candidates.some((c) => isSameIdentity(draft, c))) return null;

  const suggestions: ProducerSuggestion[] = (producers.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    regionName: row.region_name,
    inRegion: row.in_region,
    wineCount: Number(row.wine_count),
  }));
  const rows = nearMatchRows(draft, candidates) ?? [];
  if (rows.length === 0 && suggestions.length === 0) return null;
  return { wines: rows, producers: suggestions };
}
