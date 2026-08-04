import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getBurgundyHierarchy, type BurgundyHierarchy } from "./burgundy";

// Everything the single tabbed Designations page needs, loaded once server-side
// and handed to the client tab shell so switching tabs is instant (no refetch).
export type TabSystemMember = {
  name: string;
  tier: string | null;
  tierRank: number | null;
  commune: string | null;
  localNote: string | null;
  appellationKey: string | null;
  appellationName: string | null;
};
export type TabSystem = { key: string; name: string; members: TabSystemMember[] };
export type TabGlossaryTerm = { name: string; description: string | null };
export type DesignationsPageData = {
  systems: TabSystem[];
  glossary: TabGlossaryTerm[];
  burgundy: BurgundyHierarchy;
};

export async function getDesignationsPageData(
  supabase: SupabaseClient<Database>,
): Promise<DesignationsPageData> {
  const [{ data: sys }, { data: mem }, { data: gloss }, burgundy] =
    await Promise.all([
      supabase.from("wine_designations").select("id, key, name").order("sort_order"),
      supabase
        .from("wine_designation_members")
        .select(
          "designation_id, name, tier, tier_rank, commune, local_note, appellation_wine_place_id",
        )
        .order("tier_rank", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabase
        .from("type_designations")
        .select("name, description")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      getBurgundyHierarchy(supabase),
    ]);

  const apIds = [
    ...new Set(
      (mem ?? [])
        .map((m) => m.appellation_wine_place_id)
        .filter((v): v is string => !!v),
    ),
  ];
  const placeById = new Map<string, { name: string; canonicalKey: string }>();
  if (apIds.length > 0) {
    const { data: places } = await supabase
      .from("wine_places")
      .select("id, name, canonical_key")
      .in("id", apIds);
    for (const p of places ?? [])
      placeById.set(p.id, { name: p.name, canonicalKey: p.canonical_key });
  }

  const keyById = new Map((sys ?? []).map((s) => [s.id, s.key]));
  const membersByKey = new Map<string, TabSystemMember[]>();
  for (const m of mem ?? []) {
    const key = keyById.get(m.designation_id);
    if (!key) continue;
    const ap = m.appellation_wine_place_id
      ? placeById.get(m.appellation_wine_place_id)
      : undefined;
    const list = membersByKey.get(key) ?? [];
    list.push({
      name: m.name,
      tier: m.tier == null ? null : String(m.tier),
      tierRank: m.tier_rank,
      commune: m.commune,
      localNote: m.local_note,
      appellationKey: ap?.canonicalKey ?? null,
      appellationName: ap?.name ?? null,
    });
    membersByKey.set(key, list);
  }

  const systems: TabSystem[] = (sys ?? []).map((s) => ({
    key: s.key,
    name: s.name,
    members: membersByKey.get(s.key) ?? [],
  }));
  const glossary: TabGlossaryTerm[] = (gloss ?? []).map((g) => ({
    name: g.name,
    description: g.description,
  }));

  return { systems, glossary, burgundy };
}
