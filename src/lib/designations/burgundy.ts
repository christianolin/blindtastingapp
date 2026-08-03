import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// The full Burgundy quality ladder for the interactive pyramid, read from the
// wine_places tree (france.bourgogne.<subregion>.<village>[.premier-cru.<climat>]).
// Each tier's vineyards are grouped by sub-region → village so a tier can expand
// in place. Grand Cru = grand_cru appellations; Premier Cru = the 1er-cru climats
// (excluding the per-village container node); Village = communal appellations.
export type BurgundyVineyard = { name: string; canonicalKey: string };
export type BurgundyVillageGroup = { village: string; vineyards: BurgundyVineyard[] };
export type BurgundySubregionGroup = {
  subregion: string;
  subregionKey: string;
  villages: BurgundyVillageGroup[];
};
export type BurgundyTier = {
  key: "grand_cru" | "premier_cru" | "village" | "regional";
  label: string;
  count: number;
  subregions: BurgundySubregionGroup[];
};
export type BurgundyHierarchy = { tiers: BurgundyTier[] };

type Row = {
  canonical_key: string;
  name: string;
  appellation_level: string | null;
  kind: string;
};

const titleCase = (slug: string) =>
  slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

export async function getBurgundyHierarchy(
  supabase: SupabaseClient<Database>,
): Promise<BurgundyHierarchy> {
  // Paginated: bourgogne is ~780 rows today and climat coverage may grow.
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("wine_places")
      .select("canonical_key, name, appellation_level, kind")
      .like("canonical_key", "france.bourgogne%")
      .order("canonical_key")
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    rows.push(...(data as Row[]));
    if (data.length < PAGE) break;
  }

  const nameByKey = new Map(rows.map((r) => [r.canonical_key, r.name]));
  const subName = (sub: string) =>
    nameByKey.get(`france.bourgogne.${sub}`) ?? titleCase(sub);
  const villageName = (sub: string, vil: string) =>
    nameByKey.get(`france.bourgogne.${sub}.${vil}`) ?? titleCase(vil);

  // Group matching rows into subregion → village → vineyards, first-seen order.
  function group(
    predicate: (r: Row, seg: string[]) => boolean,
    byVillage: boolean,
  ): { subregions: BurgundySubregionGroup[]; count: number } {
    const subs = new Map<string, Map<string, BurgundyVineyard[]>>();
    let count = 0;
    for (const r of rows) {
      const seg = r.canonical_key.split(".");
      if (!predicate(r, seg)) continue;
      const sub = seg[2];
      if (!sub) continue;
      const vil = byVillage ? seg[3] ?? "" : "";
      if (!subs.has(sub)) subs.set(sub, new Map());
      const villages = subs.get(sub)!;
      if (!villages.has(vil)) villages.set(vil, []);
      villages.get(vil)!.push({ name: r.name, canonicalKey: r.canonical_key });
      count += 1;
    }
    const subregions: BurgundySubregionGroup[] = [...subs.entries()].map(
      ([sub, villages]) => ({
        subregion: subName(sub),
        subregionKey: `france.bourgogne.${sub}`,
        villages: [...villages.entries()].map(([vil, vineyards]) => ({
          village: vil ? villageName(sub, vil) : "",
          vineyards,
        })),
      }),
    );
    return { subregions, count };
  }

  const grand = group(
    (r) => r.appellation_level === "grand_cru" && r.kind === "APPELLATION",
    true,
  );
  const premier = group(
    (r, seg) =>
      r.appellation_level === "premier_cru" &&
      r.kind === "SITE" &&
      seg.length > 5,
    true,
  );
  const village = group((r) => r.appellation_level === "communal", false);

  const tiers: BurgundyTier[] = [
    { key: "grand_cru", label: "Grand Cru", count: grand.count, subregions: grand.subregions },
    { key: "premier_cru", label: "Premier Cru", count: premier.count, subregions: premier.subregions },
    { key: "village", label: "Village", count: village.count, subregions: village.subregions },
    { key: "regional", label: "Regional", count: 0, subregions: [] },
  ];
  return { tiers };
}
