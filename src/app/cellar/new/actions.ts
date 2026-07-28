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

export type NewCatalogWine = {
  countryId: string;
  regionId: string;
  // Required for now — catalog_wines.appellation_id is NOT NULL (mirrored from
  // wine_answers). Making it optional is a tracked follow-up (needs a
  // nullable migration).
  appellationId: string;
  primaryGrapeId: string;
  secondaryGrapeId: string | null;
  producerId: string;
  typeDesignationId: string | null;
  colour: "WHITE" | "ROSE" | "RED";
  style: "STILL" | "SPARKLING" | "FORTIFIED";
  cuvee: string | null;
  vintageKind: "YEAR" | "NV" | "TAWNY";
  vintageYear: number | null;
  vintageTawnyYears: number | null;
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
      cuvee: input.cuvee,
      vintage_kind: input.vintageKind,
      vintage_year: input.vintageYear,
      vintage_tawny_years: input.vintageTawnyYears,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id };
}
