"use server";

import { createClient } from "@/lib/supabase/server";
import type { ProducerSummary } from "./by-hand-logic";
import { escapeLike, findSelfNamedAppellation } from "./self-named-appellation";

/** PostgREST silently caps one read at 1000 rows. */
const PAGE_SIZE = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// ---------------------------------------------------------------------------
// Reference lists and "Just the region" (spec §C.5 A7, §D.4 #8)
// ---------------------------------------------------------------------------

/** The small reference tables the by-hand form picks from, loaded once per sheet
    open and kept by the sheet (spec §C.5 A7 "Data"). */
export type ByHandReferences = {
  countries: { id: string; name: string }[];
  regions: { id: string; name: string; countryId: string }[];
  grapes: { id: string; name: string }[];
  typeDesignations: { id: string; name: string; category: string | null; countryId: string | null }[];
};

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/** Every row of an ordered query, in 1000-row pages, so a table past the cap is
    never silently truncated. A failed read is logged and the list reads as empty. */
async function readList<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`by-hand references: ${what} read failed`, { message: error.message });
      return [];
    }
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
}

/**
 * Countries, regions and grapes by name, and the active type designations in
 * their `sort_order` (CLAUDE.md), so the picker's groups keep their order. The
 * appellation and producer tables are never read whole: the form searches them.
 */
export async function loadByHandReferences(): Promise<ByHandReferences> {
  const supabase = await createClient();
  const [countries, regions, grapes, typeDesignations] = await Promise.all([
    readList("countries", (from, to) =>
      supabase.from("countries").select("id, name").order("name").order("id").range(from, to)),
    readList("regions", (from, to) =>
      supabase.from("regions").select("id, name, country_id").order("name").order("id").range(from, to)),
    readList("grapes", (from, to) =>
      supabase.from("grapes").select("id, name").order("name").order("id").range(from, to)),
    readList("type designations", (from, to) =>
      supabase
        .from("type_designations")
        .select("id, name, category, country_id")
        .eq("is_active", true)
        .order("sort_order")
        .order("id")
        .range(from, to)),
  ]);
  return {
    countries: countries.map((c) => ({ id: c.id, name: c.name })),
    regions: regions.map((r) => ({ id: r.id, name: r.name, countryId: r.country_id })),
    grapes: grapes.map((g) => ({ id: g.id, name: g.name })),
    typeDesignations: typeDesignations.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      countryId: t.country_id,
    })),
  };
}

/**
 * The region's self-named appellation, behind "Just the region" (RC5, byhand-5).
 * The self-named row carries the region's exact name plus at most a designation
 * suffix (20260713180000; scripts/add-appellation-designations.mjs), so a prefix
 * query finds every candidate: the region's appellations whose name starts with
 * the region's own name (`%` and `_` escaped), ordered by name and read in 1000-row
 * pages until a short one. Null when the region has none, or the read fails.
 */
export async function regionSelfNamedAppellation(
  regionId: string,
  regionName: string,
): Promise<{ id: string; name: string } | null> {
  if (typeof regionId !== "string" || !UUID.test(regionId)) return null;
  const name = typeof regionName === "string" ? regionName.trim() : "";
  if (!name) return null;

  const supabase = await createClient();
  const pattern = `${escapeLike(name)}%`;
  try {
    return await findSelfNamedAppellation({ id: regionId, name }, async (from, to) => {
      const { data, error } = await supabase
        .from("appellations")
        .select("id, name")
        .eq("region_id", regionId)
        .ilike("name", pattern)
        .order("name")
        .range(from, to);
      if (error) throw new Error(error.message);
      return data ?? [];
    });
  } catch (error) {
    console.error("regionSelfNamedAppellation failed", {
      regionId,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
