import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { getDesignationsPageData } from "@/lib/designations/page-data";
import { lineageForParts } from "@/lib/training/archetype-view";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [designations, grapesRes, linksRes, archRes] = await Promise.all([
    getDesignationsPageData(supabase),
    supabase.from("grapes").select("*").order("name"),
    supabase.from("wine_place_grapes").select("grape_id, wine_place_id"),
    supabase
      .from("wine_archetypes")
      .select(
        "id, name, colour, style, wine_place_id, country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id",
      )
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
  const distinct = (ids: (string | null)[]) =>
    [...new Set(ids.filter((v): v is string => v !== null))];
  // D9: an archetype may have no map place — only real places are looked up.
  const archPlaceIds = distinct(archRows.map((a) => a.wine_place_id));
  const countryIds = distinct(archRows.map((a) => a.country_id));
  const regionIds = distinct(archRows.map((a) => a.region_id));
  const appellationIds = distinct(archRows.map((a) => a.appellation_id));
  const noRows = { data: [] as { id: string; name: string }[] };
  const [archPlacesRes, countriesRes, regionsRes, appellationsRes] = await Promise.all([
    archPlaceIds.length > 0
      ? supabase.from("wine_places").select("id, name").in("id", archPlaceIds)
      : noRows,
    countryIds.length > 0
      ? supabase.from("countries").select("id, name").in("id", countryIds)
      : noRows,
    regionIds.length > 0
      ? supabase.from("regions").select("id, name").in("id", regionIds)
      : noRows,
    appellationIds.length > 0
      ? supabase.from("appellations").select("id, name").in("id", appellationIds)
      : noRows,
  ]);
  const nameMap = (rows: { id: string; name: string }[] | null) =>
    new Map((rows ?? []).map((r) => [r.id, r.name] as const));
  const archPlaceName = nameMap(archPlacesRes.data);
  const countryName = nameMap(countriesRes.data);
  const regionName = nameMap(regionsRes.data);
  const appellationName = nameMap(appellationsRes.data);
  // The grapes are already loaded above for the grape library.
  const grapeName = new Map(grapes.map((g) => [g.id, g.name] as const));
  const named = (id: string, names: Map<string, string>) => ({ id, name: names.get(id) ?? "" });
  const archetypes: ArchetypeCard[] = archRows.map((a) => ({
    id: a.id,
    name: a.name,
    colour: a.colour,
    style: a.style,
    placeName: a.wine_place_id ? (archPlaceName.get(a.wine_place_id) ?? "") : "",
    // D11: every card names where it is from, so no appellation is a bare word.
    lineage: lineageForParts({
      country: named(a.country_id, countryName),
      region: named(a.region_id, regionName),
      appellation: named(a.appellation_id, appellationName),
      primaryGrape: named(a.primary_grape_id, grapeName),
      secondaryGrape: a.secondary_grape_id ? named(a.secondary_grape_id, grapeName) : null,
    }),
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
