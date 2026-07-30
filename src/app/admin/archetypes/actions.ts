"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/roles";

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

async function ensureAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isAdmin(supabase, user.id))) return null;
  return supabase;
}

export async function addPlacement(
  archetypeId: string,
  placeId: string,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await ensureAdmin();
  if (!supabase) return { error: "Admins only." };
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
  const supabase = await ensureAdmin();
  if (!supabase) return { error: "Admins only." };
  const { error } = await supabase
    .from("wine_archetype_placements")
    .delete()
    .eq("archetype_id", archetypeId)
    .eq("wine_place_id", placeId);
  if (error) return { error: error.message };
  revalidatePath("/admin/archetypes");
  return { ok: true };
}
