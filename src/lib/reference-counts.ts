// Reference-table sizes for the 6f picker's "Search {n} …" placeholder and
// its "Everything else · all {n}" heading (S9; spec §8.3 item 8). One call
// per request (React.cache, the same pattern tasting-request-cache.ts uses):
// countries, regions and grapes reuse the getReferenceOptions() read every
// ladder already shares; appellations, producers and active type
// designations are counted server-side with
// select("id", { count: "exact", head: true }) — never their rows, the same
// rule CLAUDE.md gives appellations/producers everywhere else. Vintage
// counts vintageOptions' own year list, the guess ladder's own source of
// truth for pickable vintages.
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getReferenceOptions } from "@/lib/tasting-request-cache";
import { vintageOptions } from "@/app/tastings/[id]/play/guess-write";
import type { LadderField } from "@/app/tastings/[id]/play/ladder-types";

/** One count per ladder field; secondary_grape shares primary_grape's count
 *  (both pick from the same `grapes` table). */
export type ReferenceCounts = Record<LadderField, number>;

export const getReferenceCounts = cache(async (): Promise<ReferenceCounts> => {
  const supabase = await createClient();
  const [{ countries, regions, grapes }, appellations, producers, typeDesignations] =
    await Promise.all([
      getReferenceOptions(),
      supabase.from("appellations").select("id", { count: "exact", head: true }),
      supabase.from("producers").select("id", { count: "exact", head: true }),
      supabase
        .from("type_designations")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
    ]);
  const grapeCount = grapes.length;
  return {
    country: countries.length,
    region: regions.length,
    appellation: appellations.count ?? 0,
    primary_grape: grapeCount,
    secondary_grape: grapeCount,
    producer: producers.count ?? 0,
    type_designation: typeDesignations.count ?? 0,
    vintage: vintageOptions(new Date()).years.length,
  };
});
