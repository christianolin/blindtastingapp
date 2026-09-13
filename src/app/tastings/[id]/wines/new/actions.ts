"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createCountry as createCatalogCountry,
  createRegion as createCatalogRegion,
} from "@/app/catalog/new/actions";
// The write helpers (and find-or-create) live in a server-only module, NOT
// here: every export of this "use server" file becomes a POST-reachable
// action, and those helpers trust a caller-supplied client + user id. Only
// real actions (each resolving auth itself) are exported from this file.
import {
  findOrCreate,
  findOrCreateProducer,
  type ReferenceOption,
} from "./tasting-wine-writes";

// The reference creators behind WineIdentityFields and the add-wine sheet's
// by-hand form. Every wine write goes through tasting-wine-writes.ts and the one
// write path in src/lib/wine-identity/server/write.ts (D2); the legacy FormData
// actions and the answer-key form they served are gone (spec §2.1 row 8).

/** A country, found or created, with its "None" region and "None" appellation
    (byhand-5, spec §D.4 #8). One implementation, shared with the catalog page. */
export async function createCountry(name: string): Promise<ReferenceOption> {
  return createCatalogCountry(name);
}

export async function createGrape(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  return findOrCreate(
    () => supabase.from("grapes").select("id, name").eq("name", trimmed).maybeSingle(),
    () => supabase.from("grapes").insert({ name: trimmed }).select("id, name").single(),
  );
}

/** A producer through `find_or_create_producer` (spec §B.7): a name that folds
    equal to an existing producer reuses it, so no duplicate is created. */
export async function createProducer(regionId: string | null, name: string) {
  const supabase = await createClient();
  return findOrCreateProducer(supabase, regionId, name);
}

export async function createTypeDesignation(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  return findOrCreate(
    () =>
      supabase
        .from("type_designations")
        .select("id, name")
        .eq("name", trimmed)
        .maybeSingle(),
    () =>
      supabase
        .from("type_designations")
        .insert({ name: trimmed })
        .select("id, name")
        .single(),
  );
}

/** A region, found or created, always with its self-named appellation, so "Just
    the region" is a real choice for it (byhand-5, spec §D.4 #8). One
    implementation, shared with the catalog page. */
export async function createRegion(countryId: string, name: string): Promise<ReferenceOption> {
  return createCatalogRegion(countryId, name);
}

export async function createAppellation(regionId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const supabase = await createClient();
  return findOrCreate(
    () =>
      supabase
        .from("appellations")
        .select("id, name")
        .eq("region_id", regionId)
        .eq("name", trimmed)
        .maybeSingle(),
    () =>
      supabase
        .from("appellations")
        .insert({ region_id: regionId, name: trimmed })
        .select("id, name")
        .single(),
  );
}
