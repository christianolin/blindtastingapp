"use server";

import { createClient } from "@/lib/supabase/server";
import type { ReferenceOption } from "@/components/reference-combobox";

export async function createCountry(name: string): Promise<ReferenceOption> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("countries").insert({ name }).select("id, name").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createGrape(name: string): Promise<ReferenceOption> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("grapes").insert({ name }).select("id, name").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createRegion(countryId: string, name: string): Promise<ReferenceOption> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("regions")
    .insert({ country_id: countryId, name })
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createAppellation(regionId: string, name: string): Promise<ReferenceOption> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appellations")
    .insert({ region_id: regionId, name })
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createProducer(
  name: string,
  regionId: string | null,
): Promise<ReferenceOption> {
  const supabase = await createClient();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Producer name is required.");
  // Reuse an exact-name match if one already exists, so re-adding a known
  // producer never spawns a duplicate row.
  const existing = await supabase
    .from("producers")
    .select("id, name")
    .eq("name", trimmed)
    .maybeSingle();
  if (existing.data) return existing.data;
  const { data, error } = await supabase
    .from("producers")
    .insert({ name: trimmed, region_id: regionId })
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export type NewCatalogWine = {
  countryId: string;
  regionId: string;
  appellationId: string;
  primaryGrapeId: string;
  secondaryGrapeId: string | null;
  grapes?: { grapeId: string; percentage: number | null }[];
  producerId: string;
  typeDesignationId: string | null;
  colour: "WHITE" | "ROSE" | "RED" | "ORANGE";
  style: "STILL" | "SPARKLING" | "FORTIFIED" | "SWEET";
  wineName: string | null;
  vintageKind: "YEAR" | "NV" | "TAWNY";
  vintageYear: number | null;
  vintageTawnyYears: number | null;
  imageUrl?: string | null;
};

export async function createCatalogWine(input: NewCatalogWine): Promise<{ id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to add a wine.");
  const { data, error } = await supabase
    .from("catalog_wines")
    .insert({
      country_id: input.countryId,
      region_id: input.regionId,
      appellation_id: input.appellationId,
      primary_grape_id: input.primaryGrapeId,
      secondary_grape_id: input.secondaryGrapeId,
      producer_id: input.producerId,
      type_designation_id: input.typeDesignationId,
      colour: input.colour,
      style: input.style,
      wine_name: input.wineName,
      vintage_kind: input.vintageKind,
      vintage_year: input.vintageYear,
      vintage_tawny_years: input.vintageTawnyYears,
      image_url: input.imageUrl ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = data.id;
  if (input.grapes && input.grapes.length > 0) {
    await supabase.from("catalog_wine_grapes").delete().eq("catalog_wine_id", id);
    const { error: grapeError } = await supabase.from("catalog_wine_grapes").insert(
      input.grapes.map((g, i) => ({
        catalog_wine_id: id,
        grape_id: g.grapeId,
        percentage: g.percentage,
        sort_order: i,
      })),
    );
    if (grapeError) throw new Error(grapeError.message);
  }
  return { id };
}

// Curator/creator edit of an existing catalog wine. RLS ("catalog update")
// gates who may write; the audit trigger records before/after. Because cellars
// reference the wine by id, this edit updates everyone's cellar view.
export async function updateCatalogWine(
  id: string,
  input: NewCatalogWine,
): Promise<{ id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to edit a wine.");
  const { error } = await supabase
    .from("catalog_wines")
    .update({
      country_id: input.countryId,
      region_id: input.regionId,
      appellation_id: input.appellationId,
      primary_grape_id: input.primaryGrapeId,
      secondary_grape_id: input.secondaryGrapeId,
      producer_id: input.producerId,
      type_designation_id: input.typeDesignationId,
      colour: input.colour,
      style: input.style,
      wine_name: input.wineName,
      vintage_kind: input.vintageKind,
      vintage_year: input.vintageYear,
      vintage_tawny_years: input.vintageTawnyYears,
      image_url: input.imageUrl ?? null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  // Re-sync the grape blend (mirrors create: replace the set).
  await supabase.from("catalog_wine_grapes").delete().eq("catalog_wine_id", id);
  if (input.grapes && input.grapes.length > 0) {
    const { error: grapeError } = await supabase.from("catalog_wine_grapes").insert(
      input.grapes.map((g, i) => ({
        catalog_wine_id: id,
        grape_id: g.grapeId,
        percentage: g.percentage,
        sort_order: i,
      })),
    );
    if (grapeError) throw new Error(grapeError.message);
  }
  return { id };
}
