import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { vintageLabel } from "../describe";
import { pickConfidentMatch, type CatalogCandidate, type CatalogMatch } from "../match";
import type { WineIdentityDraft } from "../types";

/** Candidates per producer (spec §B.6), ordered by id, so the read stays bounded. */
const CANDIDATE_LIMIT = 200;

function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The confirm screen's one match card (spec §B.6, D6; scan-1, scan-2), or null.
 * Candidates exist only for an existing producer, so a pending name or a bare
 * title word never anchors a match. They are that producer's live, visible
 * catalog wines: never merged away, never a hidden blind glass (`blind_pending`).
 * The decision itself is the pure `pickConfidentMatch`.
 */
export async function findConfidentMatch(
  supabase: SupabaseClient<Database>,
  draft: WineIdentityDraft,
): Promise<CatalogMatch | null> {
  const producer = draft.producer;
  if (producer?.kind !== "existing") return null;

  const { data, error } = await supabase
    .from("catalog_wines")
    .select("id, wine_name, appellation_id, colour, vintage_kind, vintage_year, vintage_tawny_years")
    .eq("producer_id", producer.id)
    .eq("blind_pending", false)
    // `merged_into` exists (20260829203000_catalog_curation) but not in the
    // hand-written database.types.ts, so it goes through postgrest's untyped
    // `filter(column: string, …)` overload.
    .filter("merged_into", "is", null)
    .order("id")
    .limit(CANDIDATE_LIMIT);
  if (error) throw new Error(`catalog match candidates failed: ${error.message}`);

  const candidates: CatalogCandidate[] = (data ?? []).map((row) => ({
    id: row.id,
    wineName: row.wine_name,
    appellationId: row.appellation_id,
    colour: row.colour,
    vintageKind: row.vintage_kind,
    vintageYear: row.vintage_year,
    vintageTawnyYears: row.vintage_tawny_years,
  }));
  const wine = pickConfidentMatch(draft, candidates);
  if (!wine) return null;

  const [title, meta] = await Promise.all([matchTitle(supabase, wine), matchMeta(supabase, wine.id)]);
  return { catalogWineId: wine.id, title, meta };
}

/** "{appellation name} {vintage}": "Barbaresco DOCG 2018". */
async function matchTitle(supabase: SupabaseClient<Database>, wine: CatalogCandidate): Promise<string> {
  const { data, error } = await supabase
    .from("appellations")
    .select("name")
    .eq("id", wine.appellationId)
    .maybeSingle();
  if (error) throw new Error(`catalog match appellation failed: ${error.message}`);
  const vintage = vintageLabel({
    kind: wine.vintageKind,
    year: wine.vintageYear,
    tawnyYears: wine.vintageTawnyYears,
    read: true,
  });
  return [data?.name, vintage].filter(Boolean).join(" ");
}

/** "★ 91 · 14 notes · in 6 cellars", leaving out the parts with nothing to say. */
async function matchMeta(supabase: SupabaseClient<Database>, catalogWineId: string): Promise<string> {
  const [ratings, holdings] = await Promise.all([
    supabase
      .from("catalog_wine_ratings")
      .select("avg_score, note_count")
      .eq("catalog_wine_id", catalogWineId)
      .maybeSingle(),
    supabase.rpc("catalog_wine_holdings", { p_ids: [catalogWineId] }),
  ]);
  // The card's facts are decoration: a failed count leaves its part out instead
  // of failing a read that has already been paid for.
  if (ratings.error) console.error("catalog match ratings failed", { message: ratings.error.message });
  if (holdings.error) console.error("catalog match holdings failed", { message: holdings.error.message });

  const parts: string[] = [];
  const average = ratings.data?.avg_score;
  if (average !== null && average !== undefined && Number.isFinite(Number(average))) {
    parts.push(`★ ${Math.round(Number(average))}`);
  }
  const notes = Number(ratings.data?.note_count ?? 0);
  if (notes > 0) parts.push(counted(notes, "note", "notes"));
  const holders = (holdings.data ?? []).find((row) => row.catalog_wine_id === catalogWineId)?.holders ?? 0;
  if (holders > 0) parts.push(`in ${counted(holders, "cellar", "cellars")}`);
  return parts.join(" · ");
}
