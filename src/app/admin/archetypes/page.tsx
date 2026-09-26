import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadByHandReferences } from "@/components/add-wine/by-hand-actions";
import { requireContributor } from "@/lib/auth/roles";
import type { Database } from "@/lib/supabase/database.types";
import type { AromaTerm } from "@/lib/wset/types";
import { PlacementEditor, type ArchetypeAdmin } from "./placement-editor";
import type { EditorReferences } from "./profile-rules";

export const metadata = { title: "Typical wines · Admin · Blindr" };

type AromaLinkRow = { archetype_id: string; term_id: string; kind: "NOSE" | "PALATE"; signature: boolean };

// PostgREST answers at most 1000 rows per request; the training room's first
// batch alone brings the aroma links close to that, so they are read in pages.
async function readAromaLinks(supabase: SupabaseClient<Database>): Promise<AromaLinkRow[]> {
  const rows: AromaLinkRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("wine_archetype_aromas")
      .select("archetype_id, term_id, kind, signature")
      .order("archetype_id")
      .order("term_id")
      .order("kind")
      .range(from, from + 999);
    if (error) throw new Error(`Typical wines: the aroma read failed (${error.message})`);
    const page = (data ?? []) as AromaLinkRow[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export default async function ArchetypesAdminPage() {
  const { supabase } = await requireContributor();

  const [
    { data: archetypes },
    { data: placements },
    aromaLinks,
    { data: termRows },
    { data: designationLinks },
    references,
  ] = await Promise.all([
    supabase
      .from("wine_archetypes")
      .select(
        "id, name, colour, style, description, quality_low, quality_high, sat, country_id, region_id, appellation_id, typical_age_low, typical_age_high, wine_place_id",
      )
      .order("sort_order"),
    supabase
      .from("wine_archetype_placements")
      .select("archetype_id, wine_place_id, sort_order")
      .order("sort_order"),
    readAromaLinks(supabase),
    supabase
      .from("wset_aroma_terms")
      .select("id, family, origin, group_name, term, sort_order")
      .order("sort_order"),
    supabase.from("wine_archetype_designations").select("archetype_id, type_designation_id"),
    loadByHandReferences(),
  ]);

  const rows = archetypes ?? [];

  const placeIds = Array.from(
    new Set([
      ...(placements ?? []).map((p) => p.wine_place_id),
      ...rows.map((a) => a.wine_place_id).filter((id): id is string => id !== null),
    ]),
  );
  const placeById = new Map<string, { name: string; kind: string; canonicalKey: string }>();
  if (placeIds.length > 0) {
    const { data: places } = await supabase
      .from("wine_places")
      .select("id, name, kind, canonical_key")
      .in("id", placeIds);
    for (const p of places ?? []) {
      placeById.set(p.id, { name: p.name, kind: p.kind as string, canonicalKey: p.canonical_key });
    }
  }

  const appellationIds = Array.from(new Set(rows.map((a) => a.appellation_id)));
  const appellationName = new Map<string, string>();
  if (appellationIds.length > 0) {
    const { data: appellations } = await supabase
      .from("appellations")
      .select("id, name")
      .in("id", appellationIds);
    for (const a of appellations ?? []) appellationName.set(a.id, a.name);
  }

  const terms: AromaTerm[] = (termRows ?? []).map((t) => ({
    id: t.id,
    family: t.family,
    origin: t.origin,
    groupName: t.group_name,
    term: t.term,
    sortOrder: t.sort_order,
  }));

  const items: ArchetypeAdmin[] = rows.map((a) => ({
    id: a.id,
    name: a.name,
    colour: a.colour,
    style: a.style,
    description: a.description,
    qualityLow: a.quality_low,
    qualityHigh: a.quality_high,
    sat: a.sat,
    nose: aromaLinks
      .filter((l) => l.archetype_id === a.id && l.kind === "NOSE")
      .map((l) => ({ termId: l.term_id, signature: l.signature })),
    palate: aromaLinks
      .filter((l) => l.archetype_id === a.id && l.kind === "PALATE")
      .map((l) => ({ termId: l.term_id, signature: l.signature })),
    countryId: a.country_id,
    regionId: a.region_id,
    appellationId: a.appellation_id,
    appellationName: appellationName.get(a.appellation_id) ?? null,
    designationIds: (designationLinks ?? [])
      .filter((d) => d.archetype_id === a.id)
      .map((d) => d.type_designation_id),
    typicalAgeLow: a.typical_age_low,
    typicalAgeHigh: a.typical_age_high,
    winePlaceId: a.wine_place_id,
    winePlaceName: a.wine_place_id ? (placeById.get(a.wine_place_id)?.name ?? null) : null,
    placements: (placements ?? [])
      .filter((pl) => pl.archetype_id === a.id)
      .map((pl) => {
        const info = placeById.get(pl.wine_place_id);
        return {
          placeId: pl.wine_place_id,
          name: info?.name ?? "(unknown place)",
          kind: info?.kind ?? "",
          canonicalKey: info?.canonicalKey ?? "",
          sortOrder: pl.sort_order,
        };
      }),
  }));

  const editorReferences: EditorReferences = {
    countries: references.countries,
    regions: references.regions,
    typeDesignations: references.typeDesignations.map(({ id, name, category }) => ({ id, name, category })),
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">Typical wines</h1>
        <p className="mt-2 text-muted-foreground">
          Edit each typical wine&apos;s tasting-sheet profile — where it scores (country, region,
          appellation), designations, typical age, appearance, nose, palate and quality ranges plus
          aromas and their signature terms — and choose which map places surface it.
        </p>
      </div>
      <PlacementEditor archetypes={items} terms={terms} references={editorReferences} />
    </div>
  );
}
