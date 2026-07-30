"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isContributor } from "@/lib/auth/roles";
import type { WineColour, WineStyle } from "@/lib/wset/types";

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

export type ArchetypeProfileInput = {
  name: string;
  colour: WineColour;
  style: WineStyle;
  description: string | null;
  qualityLow: number | null;
  qualityHigh: number | null;
  sat: { [key: string]: [string, string] };
  noseTermIds: string[];
  palateTermIds: string[];
};

// Save an archetype's tasting-sheet profile (SAT ranges, quality, aromas). RLS
// gates the writes to curators (contributor + admin); the app check mirrors it.
export async function updateArchetype(
  archetypeId: string,
  input: ArchetypeProfileInput,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await ensureContributor();
  if (!supabase) return { error: "You don't have permission." };

  const { error: upErr } = await supabase
    .from("wine_archetypes")
    .update({
      name: input.name,
      colour: input.colour,
      style: input.style,
      description: input.description,
      sat: input.sat,
      quality_low: input.qualityLow,
      quality_high: input.qualityHigh,
    })
    .eq("id", archetypeId);
  if (upErr) return { error: upErr.message };

  const { error: delErr } = await supabase
    .from("wine_archetype_aromas")
    .delete()
    .eq("archetype_id", archetypeId);
  if (delErr) return { error: delErr.message };

  const rows = [
    ...input.noseTermIds.map((term_id) => ({ archetype_id: archetypeId, term_id, kind: "NOSE" as const })),
    ...input.palateTermIds.map((term_id) => ({ archetype_id: archetypeId, term_id, kind: "PALATE" as const })),
  ];
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("wine_archetype_aromas").insert(rows);
    if (insErr) return { error: insErr.message };
  }

  revalidatePath("/admin/archetypes");
  return { ok: true };
}
