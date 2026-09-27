"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isContributor } from "@/lib/auth/roles";
import {
  aromaRows,
  designationRows,
  validateProfile,
  type ArchetypeProfileInput,
} from "./profile-rules";

export type PlaceHit = { id: string; name: string; kind: string; canonicalKey: string };

// Search the map hierarchy by name for the placement picker.
export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("wine_places")
    .select("id, name, kind, canonical_key")
    .ilike("name", `%${q}%`)
    .order("display_tier")
    .order("name")
    .limit(25);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind as string,
    canonicalKey: p.canonical_key,
  }));
}

async function ensureContributor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isContributor(supabase, user.id))) return null;
  return supabase;
}

export async function addPlacement(
  archetypeId: string,
  placeId: string,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await ensureContributor();
  if (!supabase) return { error: "You don't have permission." };
  const { error } = await supabase
    .from("wine_archetype_placements")
    .insert({ archetype_id: archetypeId, wine_place_id: placeId });
  if (error && error.code !== "23505") return { error: error.message };
  revalidatePath("/admin/archetypes");
  return { ok: true };
}

export async function removePlacement(
  archetypeId: string,
  placeId: string,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await ensureContributor();
  if (!supabase) return { error: "You don't have permission." };
  const { error } = await supabase
    .from("wine_archetype_placements")
    .delete()
    .eq("archetype_id", archetypeId)
    .eq("wine_place_id", placeId);
  if (error) return { error: error.message };
  revalidatePath("/admin/archetypes");
  return { ok: true };
}

// Save an archetype's profile: SAT ranges, quality, aromas with their signature
// flags, the scoring identity (country → region → appellation, primary and
// second grape), designations, typical age and the optional map place
// (training-room spec §4.5; the grapes since the sheet editor, plan
// 2026-09-26-archetype-editor-sheet). RLS gates
// every write to curators (contributor + admin); the app check mirrors it, and
// the profile is validated again here — the editor's own check is only a
// convenience.
export async function updateArchetype(
  archetypeId: string,
  input: ArchetypeProfileInput,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await ensureContributor();
  if (!supabase) return { error: "You don't have permission." };

  const invalid = validateProfile(input);
  if (invalid) return { error: invalid };

  const [{ data: region }, { data: appellation }] = await Promise.all([
    supabase.from("regions").select("country_id").eq("id", input.regionId).maybeSingle(),
    supabase.from("appellations").select("region_id").eq("id", input.appellationId).maybeSingle(),
  ]);
  if (!region || region.country_id !== input.countryId) {
    return { error: "That region is not in that country." };
  }
  if (!appellation || appellation.region_id !== input.regionId) {
    return { error: "That appellation is not in that region." };
  }

  const { error: upErr } = await supabase
    .from("wine_archetypes")
    .update({
      name: input.name.trim(),
      colour: input.colour,
      style: input.style,
      description: input.description,
      sat: input.sat,
      quality_low: input.qualityLow,
      quality_high: input.qualityHigh,
      country_id: input.countryId,
      region_id: input.regionId,
      appellation_id: input.appellationId,
      primary_grape_id: input.primaryGrapeId,
      secondary_grape_id: input.secondaryGrapeId,
      typical_age_low: input.typicalAgeLow,
      typical_age_high: input.typicalAgeHigh,
      wine_place_id: input.winePlaceId,
    })
    .eq("id", archetypeId);
  if (upErr) return { error: upErr.message };

  const { error: delErr } = await supabase
    .from("wine_archetype_aromas")
    .delete()
    .eq("archetype_id", archetypeId);
  if (delErr) return { error: delErr.message };
  const rows = aromaRows(archetypeId, input.nose, input.palate);
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("wine_archetype_aromas").insert(rows);
    if (insErr) return { error: insErr.message };
  }

  const { error: delDesErr } = await supabase
    .from("wine_archetype_designations")
    .delete()
    .eq("archetype_id", archetypeId);
  if (delDesErr) return { error: delDesErr.message };
  const designations = designationRows(archetypeId, input.designationIds);
  if (designations.length > 0) {
    const { error: insDesErr } = await supabase.from("wine_archetype_designations").insert(designations);
    if (insDesErr) return { error: insDesErr.message };
  }

  revalidatePath("/admin/archetypes");
  revalidatePath("/taste/training");
  return { ok: true };
}
