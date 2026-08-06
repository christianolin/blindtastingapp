import { requireUser } from "@/lib/auth/dal";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { getDesignationsPageData } from "@/lib/designations/page-data";
import { LibraryTabs } from "./library-tabs";
import type { GrapeRow } from "./grape-library";
import type { ArchetypeCard } from "../archetypes/archetype-browser";

export const metadata = { title: "Library · Blindr" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; libtab?: string }>;
}) {
  const { tab, libtab } = await searchParams;
  const supabase = await createClient();
  await requireUser();

  const [designations, grapesRes, linksRes, archRes] = await Promise.all([
    getDesignationsPageData(supabase),
    supabase.from("grapes").select("*").order("name"),
    supabase.from("wine_place_grapes").select("grape_id, wine_place_id"),
    supabase
      .from("wine_archetypes")
      .select("id, name, colour, style, wine_place_id")
      .order("sort_order"),
  ]);

  const grapes = (grapesRes.data ?? []) as GrapeRow[];

  const linkedIds = [
    ...new Set((linksRes.data ?? []).map((l) => l.wine_place_id)),
  ];
  const { data: gPlaces } =
    linkedIds.length > 0
      ? await supabase
          .from("wine_places")
          .select("id, name, canonical_key")
          .in("id", linkedIds)
      : { data: [] as { id: string; name: string; canonical_key: string }[] };
  const placeById = new Map((gPlaces ?? []).map((p) => [p.id, p]));
  const placesByGrape: Record<string, { name: string; key: string }[]> = {};
  for (const link of linksRes.data ?? []) {
    const place = placeById.get(link.wine_place_id);
    if (!place) continue;
    (placesByGrape[link.grape_id] ??= []).push({
      name: place.name,
      key: place.canonical_key,
    });
  }

  const archRows = archRes.data ?? [];
  const archPlaceIds = [...new Set(archRows.map((a) => a.wine_place_id))];
  const archPlaceName = new Map<string, string>();
  if (archPlaceIds.length > 0) {
    const { data: aps } = await supabase
      .from("wine_places")
      .select("id, name")
      .in("id", archPlaceIds);
    for (const p of aps ?? []) archPlaceName.set(p.id, p.name);
  }
  const archetypes: ArchetypeCard[] = archRows.map((a) => ({
    id: a.id,
    name: a.name,
    colour: a.colour,
    style: a.style,
    placeName: archPlaceName.get(a.wine_place_id) ?? "",
  }));

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="flex w-full max-w-[1500px] flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Library
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Everything to learn about wine — designations, grapes, typical wines
            and the rules of the game.
          </p>
        </div>
        <LibraryTabs
          designations={designations}
          grapes={grapes}
          placesByGrape={placesByGrape}
          archetypes={archetypes}
          initialTab={libtab ?? "designations"}
          initialDesignationTab={tab ?? "overview"}
        />
      </div>
    </div>
  );
}
