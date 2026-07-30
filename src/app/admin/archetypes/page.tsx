import Link from "next/link";
import { requireAdmin } from "@/lib/auth/roles";
import { PlacementEditor, type ArchetypeAdmin } from "./placement-editor";

export const metadata = { title: "Typical-wine placements · Admin · Blindr" };

export default async function ArchetypePlacementsPage() {
  const { supabase } = await requireAdmin();

  const [{ data: archetypes }, { data: placements }] = await Promise.all([
    supabase
      .from("wine_archetypes")
      .select("id, name, colour, style")
      .order("sort_order"),
    supabase
      .from("wine_archetype_placements")
      .select("archetype_id, wine_place_id, sort_order")
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

  const items: ArchetypeAdmin[] = (archetypes ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    colour: a.colour,
    style: a.style,
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
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Admin
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
          Typical-wine placements
        </h1>
        <p className="mt-2 text-muted-foreground">
          Each typical wine appears on the map places listed under it. Add a place
          to surface the wine there; remove to hide it.
        </p>
      </div>
      <PlacementEditor archetypes={items} />
    </div>
  );
}
