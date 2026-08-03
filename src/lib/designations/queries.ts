import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type DesignationSystemRow = {
  id: string;
  key: string;
  name: string;
  appellationSystem: string | null;
  description: string;
  displayGroup: string | null;
  typeDesignationId: string | null;
};

export type DesignationMemberRow = {
  id: string;
  name: string;
  tier: string | null;
  tierRank: number | null;
  commune: string | null;
  memberKind: string;
  winePlaceId: string | null;
  canonicalKey: string | null;
  placeName: string | null;
};

export type SubregionCount = { subregion: string; canonicalKey: string; count: number };

export type DesignationSystemDetail = {
  system: DesignationSystemRow;
  members: DesignationMemberRow[];
  hasPlaces: boolean;
  subregions: SubregionCount[];
  visibleKeys: string[];
};

export type DirectoryGroup = {
  group: string;
  systems: { key: string; name: string; memberCount: number }[];
};

export type GlossaryCategory = {
  category: string;
  slug: string;
  terms: { id: string; name: string; description: string | null }[];
};

// Accent/case-insensitive slug used for glossary category routes.
export function categorySlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Pure: group place-linked members under their nearest SUBREGION ancestor by
// walking wine_places.primary_parent_id. `places` is the region subtree.
// Returns counts (desc) plus the SUBREGION canonical keys, for map visibleKeys.
export function groupBySubregion(
  members: { winePlaceId: string | null }[],
  places: {
    id: string;
    primary_parent_id: string | null;
    kind: string;
    name: string;
    canonical_key: string;
  }[],
): { subregions: SubregionCount[]; subregionKeys: string[] } {
  const byId = new Map(places.map((p) => [p.id, p]));
  const counts = new Map<string, { name: string; key: string; count: number }>();
  for (const m of members) {
    let node = m.winePlaceId ? byId.get(m.winePlaceId) : undefined;
    while (node && node.kind !== "SUBREGION") {
      node = node.primary_parent_id ? byId.get(node.primary_parent_id) : undefined;
    }
    if (!node) continue;
    const entry =
      counts.get(node.id) ?? { name: node.name, key: node.canonical_key, count: 0 };
    entry.count += 1;
    counts.set(node.id, entry);
  }
  const subregions = [...counts.values()]
    .map((e) => ({ subregion: e.name, canonicalKey: e.key, count: e.count }))
    .sort((a, b) => b.count - a.count || a.subregion.localeCompare(b.subregion));
  return { subregions, subregionKeys: subregions.map((s) => s.canonicalKey) };
}

export async function getDesignationSystem(
  supabase: Client,
  key: string,
): Promise<DesignationSystemDetail | null> {
  const { data: sys } = await supabase
    .from("wine_designations")
    .select(
      "id, key, name, appellation_system, description, display_group, type_designation_id",
    )
    .eq("key", key)
    .maybeSingle();
  if (!sys) return null;

  const { data: memberRows } = await supabase
    .from("wine_designation_members")
    .select("id, name, tier, tier_rank, commune, member_kind, wine_place_id")
    .eq("designation_id", sys.id)
    .order("tier_rank", { ascending: true })
    .order("sort_order", { ascending: true });
  const rows = memberRows ?? [];

  const placeIds = [
    ...new Set(rows.map((r) => r.wine_place_id).filter((id): id is string => !!id)),
  ];
  const placeById = new Map<string, { name: string; canonical_key: string }>();
  if (placeIds.length > 0) {
    const { data: places } = await supabase
      .from("wine_places")
      .select("id, name, canonical_key")
      .in("id", placeIds);
    for (const p of places ?? []) placeById.set(p.id, p);
  }

  const members: DesignationMemberRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    tier: r.tier == null ? null : String(r.tier),
    tierRank: r.tier_rank,
    commune: r.commune,
    memberKind: r.member_kind,
    winePlaceId: r.wine_place_id,
    canonicalKey: r.wine_place_id
      ? placeById.get(r.wine_place_id)?.canonical_key ?? null
      : null,
    placeName: r.wine_place_id ? placeById.get(r.wine_place_id)?.name ?? null : null,
  }));
  const hasPlaces = members.some((m) => m.winePlaceId);

  let subregions: SubregionCount[] = [];
  let visibleKeys: string[] = [];
  if (hasPlaces) {
    const memberKeys = members
      .map((m) => m.canonicalKey)
      .filter((k): k is string => !!k);
    const regionPrefix = (memberKeys[0] ?? "").split(".").slice(0, 2).join(".");
    if (regionPrefix) {
      const { data: subtree } = await supabase
        .from("wine_places")
        .select("id, primary_parent_id, kind, name, canonical_key")
        .like("canonical_key", `${regionPrefix}%`);
      const grouped = groupBySubregion(
        members.map((m) => ({ winePlaceId: m.winePlaceId })),
        subtree ?? [],
      );
      subregions = grouped.subregions;
      visibleKeys = [regionPrefix, ...grouped.subregionKeys, ...memberKeys];
    } else {
      visibleKeys = memberKeys;
    }
  }

  return {
    system: {
      id: sys.id,
      key: sys.key,
      name: sys.name,
      appellationSystem: sys.appellation_system,
      description: sys.description,
      displayGroup: sys.display_group,
      typeDesignationId: sys.type_designation_id,
    },
    members,
    hasPlaces,
    subregions,
    visibleKeys,
  };
}

export async function listDesignationTopics(supabase: Client): Promise<{
  groups: DirectoryGroup[];
  glossary: { category: string; slug: string; count: number }[];
}> {
  const { data: systems } = await supabase
    .from("wine_designations")
    .select("id, key, name, display_group, sort_order")
    .order("display_group", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });
  const { data: members } = await supabase
    .from("wine_designation_members")
    .select("designation_id");
  const countById = new Map<string, number>();
  for (const m of members ?? [])
    countById.set(m.designation_id, (countById.get(m.designation_id) ?? 0) + 1);

  const groups: DirectoryGroup[] = [];
  for (const s of systems ?? []) {
    const memberCount = countById.get(s.id) ?? 0;
    if (memberCount === 0) continue; // hide empty systems (spec: no seeding)
    const groupName = s.display_group ?? "Other";
    let g = groups.find((x) => x.group === groupName);
    if (!g) {
      g = { group: groupName, systems: [] };
      groups.push(g);
    }
    g.systems.push({ key: s.key, name: s.name, memberCount });
  }

  const { data: cats } = await supabase
    .from("type_designations")
    .select("category")
    .eq("is_active", true);
  const catCounts = new Map<string, number>();
  for (const c of cats ?? []) {
    if (!c.category) continue;
    catCounts.set(c.category, (catCounts.get(c.category) ?? 0) + 1);
  }
  const glossary = [...catCounts.entries()]
    .map(([category, count]) => ({ category, slug: categorySlug(category), count }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return { groups, glossary };
}

export async function getGlossaryCategory(
  supabase: Client,
  slug: string,
): Promise<GlossaryCategory | null> {
  const { data } = await supabase
    .from("type_designations")
    .select("id, name, description, category")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const rows = (data ?? []).filter(
    (r) => r.category && categorySlug(r.category) === slug,
  );
  if (rows.length === 0) return null;
  return {
    category: rows[0].category as string,
    slug,
    terms: rows.map((r) => ({ id: r.id, name: r.name, description: r.description })),
  };
}
