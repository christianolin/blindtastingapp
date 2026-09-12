"use server";

import { createClient } from "@/lib/supabase/server";
import type { ProducerSummary } from "./by-hand-logic";

/**
 * What the by-hand form's gold suggestion row says about a producer:
 * "{name} · {region}, {country} · {n} wines". Region/country come from
 * `producers.region_id` (nullable — the ~5% genuinely multi-region
 * producers have none); the count is that producer's live catalog wines —
 * blind-pending placeholders and merged-away duplicates are filtered HERE
 * (catalog_wines' select RLS is `using (true)`; hiding is app-side, the same
 * predicate the search RPC and /catalog apply). Null when the producer does
 * not exist.
 */
export async function producerSummary(
  producerId: string,
): Promise<(ProducerSummary & { name: string }) | null> {
  if (!producerId) return null;
  const supabase = await createClient();
  const { data: producer } = await supabase
    .from("producers")
    .select("id, name, region_id")
    .eq("id", producerId)
    .maybeSingle();
  if (!producer) return null;

  let regionName: string | null = null;
  let countryName: string | null = null;
  if (producer.region_id) {
    const { data: region } = await supabase
      .from("regions")
      .select("name, country_id")
      .eq("id", producer.region_id)
      .maybeSingle();
    regionName = region?.name ?? null;
    if (region?.country_id) {
      const { data: country } = await supabase
        .from("countries")
        .select("name")
        .eq("id", region.country_id)
        .maybeSingle();
      countryName = country?.name ?? null;
    }
  }

  const { count } = await supabase
    .from("catalog_wines")
    .select("id", { count: "exact", head: true })
    .eq("producer_id", producerId)
    .eq("blind_pending", false)
    // `merged_into` exists in the schema (20260829203000_catalog_curation)
    // but not yet in the hand-written database.types.ts, so it goes through
    // postgrest's untyped `filter(column: string, …)` overload rather than
    // `.is()` until the types file catches up.
    .filter("merged_into", "is", null);

  return { name: producer.name, regionName, countryName, wineCount: count ?? 0 };
}
