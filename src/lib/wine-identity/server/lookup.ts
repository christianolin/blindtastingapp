import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { NATIONAL_TIER_REGION_NAMES, appellationSearchPattern, type RefLookup } from "../resolve";

// The read resolver's reference lookup, backed by the caller's Supabase client
// (spec §B.5). One instance per request. Every method is memoised on that
// instance, so the resolver and the confirm screen's names share the same reads.
//
// Data access (CLAUDE.md, RC5): nothing here reads a whole `appellations` or
// `producers` table. Appellations come through the `search_appellations` RPC or
// by id, producers through `find_producer_by_folded_name` and then by id. Every
// database error throws, so a failed read is never mistaken for "no such row".

/** The per-country no-geographic-indication pair (20260829263700), used only
    when the country has no national-tier region. */
const NONE_NAME = "None";

/** PostgREST silently caps one read at 1000 rows. */
const PAGE_SIZE = 1000;

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

export function serverLookup(supabase: SupabaseClient<Database>): RefLookup {
  const cache = new Map<string, Promise<unknown>>();

  function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key);
    if (hit) return hit as Promise<T>;
    const pending = load();
    cache.set(key, pending);
    // A failed read is not remembered: the next call asks again.
    pending.catch(() => cache.delete(key));
    return pending;
  }

  return {
    countries: () =>
      memo("countries", async () => {
        const { data, error } = await supabase.from("countries").select("id, name").order("name");
        check(error, "countries");
        return data ?? [];
      }),

    regionsInCountry: (countryId) =>
      memo(`regionsInCountry:${countryId}`, async () => {
        const { data, error } = await supabase
          .from("regions")
          .select("id, name")
          .eq("country_id", countryId)
          .order("name");
        check(error, "regionsInCountry");
        return data ?? [];
      }),

    // Always the `%`-joined pattern, never the bare words: the RPC folds accents
    // but not punctuation, so each `%` stands in for a hyphen, an apostrophe or a
    // space in the stored name (spec §B.5).
    searchAppellations: (words, regionId) => {
      const pattern = appellationSearchPattern(words);
      return memo(`searchAppellations:${regionId ?? ""}:${pattern}`, async () => {
        if (pattern === "") return [];
        const { data, error } = await supabase.rpc("search_appellations", {
          p_query: pattern,
          p_region_id: regionId,
        });
        check(error, "search_appellations");
        return data ?? [];
      });
    },

    appellationsByIds: (ids) => {
      const unique = [...new Set(ids.filter((id) => id !== ""))];
      return memo(`appellationsByIds:${unique.join(",")}`, async () => {
        if (unique.length === 0) return [];
        const { data: apps, error } = await supabase
          .from("appellations")
          .select("id, name, region_id")
          .in("id", unique);
        check(error, "appellationsByIds");
        const rows = apps ?? [];
        if (rows.length === 0) return [];

        const { data: regions, error: regionError } = await supabase
          .from("regions")
          .select("id, country_id")
          .in("id", [...new Set(rows.map((row) => row.region_id))]);
        check(regionError, "appellationsByIds regions");

        const countryOf = new Map((regions ?? []).map((region) => [region.id, region.country_id] as const));
        const byId = new Map(rows.map((row) => [row.id, row] as const));
        return unique.flatMap((id) => {
          const row = byId.get(id);
          const countryId = row ? countryOf.get(row.region_id) : undefined;
          return row && countryId ? [{ id: row.id, name: row.name, regionId: row.region_id, countryId }] : [];
        });
      });
    },

    // Step 7.5's self-named fallback (owner rule 2026-09-14). One region's own
    // rows, paged like `grapes()` below — a region can hold more than PAGE_SIZE
    // appellations is not expected, but this must never silently truncate.
    appellationsInRegion: (regionId) =>
      memo(`appellationsInRegion:${regionId}`, async () => {
        const all: { id: string; name: string }[] = [];
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error } = await supabase
            .from("appellations")
            .select("id, name")
            .eq("region_id", regionId)
            .order("name")
            .order("id")
            .range(from, from + PAGE_SIZE - 1);
          check(error, "appellationsInRegion");
          const page = data ?? [];
          all.push(...page);
          if (page.length < PAGE_SIZE) return all;
        }
      }),

    // The country's national-tier region (France: "Vin de France", 20260829212000)
    // with its same-named appellation; the None pair only when there is none.
    noGeographicIndication: (countryId) =>
      memo(`noGeographicIndication:${countryId}`, async () => {
        const names = [...NATIONAL_TIER_REGION_NAMES, NONE_NAME];
        const { data: regions, error } = await supabase
          .from("regions")
          .select("id, name")
          .eq("country_id", countryId)
          .in("name", names);
        check(error, "noGeographicIndication regions");

        for (const name of names) {
          const region = (regions ?? []).find((row) => row.name === name);
          if (!region) continue;
          const { data: appellation, error: appellationError } = await supabase
            .from("appellations")
            .select("id")
            .eq("region_id", region.id)
            .eq("name", region.name)
            .maybeSingle();
          check(appellationError, "noGeographicIndication appellation");
          if (appellation) return { regionId: region.id, appellationId: appellation.id };
        }
        return null;
      }),

    producerByFoldedName: (name, regionId) =>
      memo(`producerByFoldedName:${regionId ?? ""}:${name}`, async () => {
        const { data: id, error } = await supabase.rpc("find_producer_by_folded_name", {
          p_name: name,
          p_region_id: regionId,
        });
        check(error, "find_producer_by_folded_name");
        if (!id) return null;
        const { data: row, error: rowError } = await supabase
          .from("producers")
          .select("id, name, region_id")
          .eq("id", id)
          .maybeSingle();
        check(rowError, "producerByFoldedName producer");
        return row ? { id: row.id, name: row.name, regionId: row.region_id } : null;
      }),

    regionById: (id) =>
      memo(`regionById:${id}`, async () => {
        const { data, error } = await supabase
          .from("regions")
          .select("id, name, country_id")
          .eq("id", id)
          .maybeSingle();
        check(error, "regionById");
        return data ? { id: data.id, name: data.name, countryId: data.country_id } : null;
      }),

    // A small table, read in pages anyway so a cap can never drop a grape.
    grapes: () =>
      memo("grapes", async () => {
        const all: { id: string; name: string }[] = [];
        for (let from = 0; ; from += PAGE_SIZE) {
          const { data, error } = await supabase
            .from("grapes")
            .select("id, name")
            .order("name")
            .order("id")
            .range(from, from + PAGE_SIZE - 1);
          check(error, "grapes");
          const page = data ?? [];
          all.push(...page);
          if (page.length < PAGE_SIZE) return all;
        }
      }),

    typeDesignations: () =>
      memo("typeDesignations", async () => {
        const { data, error } = await supabase
          .from("type_designations")
          .select("id, name, country_id")
          .eq("is_active", true)
          .order("sort_order");
        check(error, "typeDesignations");
        return (data ?? []).map((row) => ({ id: row.id, name: row.name, countryId: row.country_id }));
      }),
  };
}
