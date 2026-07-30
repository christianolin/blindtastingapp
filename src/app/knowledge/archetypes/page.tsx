import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { KnowledgeTabs } from "@/components/knowledge-tabs";
import { createClient } from "@/lib/supabase/server";
import { ArchetypeBrowser, type ArchetypeCard } from "./archetype-browser";

export const metadata = { title: "Typical Wines · Knowledge · Blindr" };

export default async function ArchetypesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: archetypes } = await supabase
    .from("wine_archetypes")
    .select("id, name, colour, style, wine_place_id")
    .order("sort_order");

  const placeIds = Array.from(
    new Set((archetypes ?? []).map((a) => a.wine_place_id)),
  );
  const placeName = new Map<string, string>();
  if (placeIds.length > 0) {
    const { data: places } = await supabase
      .from("wine_places")
      .select("id, name")
      .in("id", placeIds);
    for (const p of places ?? []) placeName.set(p.id, p.name);
  }

  const items: ArchetypeCard[] = (archetypes ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    colour: a.colour,
    style: a.style,
    placeName: placeName.get(a.wine_place_id) ?? "",
  }));

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="flex w-full max-w-[1500px] flex-1 flex-col gap-6 p-6 sm:p-8">
        <KnowledgeTabs />
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Typical Wines
          </h1>
          <p className="mt-2 text-muted-foreground">
            Reference profiles — a benchmark WSET tasting sheet for each classic
            style. Tap one to explore its typical appearance, nose and palate.
          </p>
        </div>
        <ArchetypeBrowser items={items} />
      </div>
    </div>
  );
}
