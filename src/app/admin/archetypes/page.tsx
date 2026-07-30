import Link from "next/link";
import { requireContributor } from "@/lib/auth/roles";
import type { AromaTerm } from "@/lib/wset/types";
import { PlacementEditor, type ArchetypeAdmin } from "./placement-editor";

export const metadata = { title: "Typical wines · Admin · Blindr" };

export default async function ArchetypesAdminPage() {
  const { supabase } = await requireContributor();

  const [
    { data: archetypes },
    { data: placements },
    { data: aromaLinks },
    { data: termRows },
  ] = await Promise.all([
    supabase
      .from("wine_archetypes")
      .select("id, name, colour, style, description, quality_low, quality_high, sat")
      .order("sort_order"),
    supabase
      .from("wine_archetype_placements")
      .select("archetype_id, wine_place_id, sort_order")
      .order("sort_order"),
    supabase.from("wine_archetype_aromas").select("archetype_id, term_id, kind"),
    supabase
      .from("wset_aroma_terms")
      .select("id, family, origin, group_name, term, sort_order")
      .order("sort_order"),
  ]);

  const placeIds = Array.from(
    new Set((placements ?? []).map((p) => p.wine_place_id)),
  );
  const placeById = new Map<
    string,
    { name: string; kind: string; canonicalKey: string }
  >();
  if (placeIds.length > 0) {
    const { data: places } = await supabase
      .from("wine_places")
      .select("id, name, kind, canonical_key")
      .in("id", placeIds);
    for (const p of places ?? []) {
      placeById.set(p.id, {
        name: p.name,
        kind: p.kind as string,
        canonicalKey: p.canonical_key,
      });
    }
  }

  const terms: AromaTerm[] = (termRows ?? []).map((t) => ({
    id: t.id,
    family: t.family,
    origin: t.origin,
    groupName: t.group_name,
    term: t.term,
    sortOrder: t.sort_order,
  }));

  const links = aromaLinks ?? [];
  const items: ArchetypeAdmin[] = (archetypes ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    colour: a.colour,
    style: a.style,
    description: a.description,
    qualityLow: a.quality_low,
    qualityHigh: a.quality_high,
    sat: a.sat,
    noseTermIds: links
      .filter((l) => l.archetype_id === a.id && l.kind === "NOSE")
      .map((l) => l.term_id),
    palateTermIds: links
      .filter((l) => l.archetype_id === a.id && l.kind === "PALATE")
      .map((l) => l.term_id),
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Admin
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          Typical wines
        </h1>
        <p className="mt-2 text-muted-foreground">
          Edit each typical wine&apos;s tasting-sheet profile — appearance, nose,
          palate and quality ranges plus aromas — and choose which map places
          surface it.
        </p>
      </div>
      <PlacementEditor archetypes={items} terms={terms} />
    </div>
  );
}
