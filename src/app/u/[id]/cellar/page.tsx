import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { catalogWineTitle } from "@/lib/wset/queries";
import { BottlesList, type LotGroup, type LotRow } from "@/app/cellar/bottles-list";

type Rel = { name: string } | { name: string }[] | null;
function relName(rel: Rel): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}
function unwrap<T>(rel: T | T[] | null): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

type CatalogEmbed = {
  wine_name: string | null;
  vintage_kind: "YEAR" | "NV" | "TAWNY";
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  producer: Rel;
  appellation: Rel;
};

export default async function UserCellarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (id === user.id) redirect("/cellar");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", id)
    .maybeSingle();
  if (!profile) notFound();

  const { data: canView } = await supabase.rpc("can_view_cellar", { p_owner: id });

  const groups: LotGroup[] = [];
  if (canView) {
    const { data: lotRows } = await supabase
      .from("cellar_lots")
      .select(
        "id, bottle_size_ml, quantity, price_per_bottle, currency, drink_from, drink_to, storage_location, catalog_wine_id, " +
          "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, producer:producers(name), appellation:appellations(name))",
      )
      .eq("owner_id", id)
      .gt("quantity", 0)
      .order("created_at", { ascending: false });
    const map = new Map<string, LotGroup>();
    for (const row of (lotRows ?? []) as unknown as Array<{
      id: string;
      bottle_size_ml: number;
      quantity: number;
      price_per_bottle: number | null;
      currency: string;
      drink_from: number | null;
      drink_to: number | null;
      storage_location: string | null;
      catalog_wine_id: string;
      catalog_wines: CatalogEmbed | CatalogEmbed[] | null;
    }>) {
      const c = unwrap(row.catalog_wines);
      const lot: LotRow = {
        id: row.id,
        bottleSizeMl: row.bottle_size_ml,
        quantity: row.quantity,
        pricePerBottle: row.price_per_bottle == null ? null : Number(row.price_per_bottle),
        currency: row.currency,
        drinkFrom: row.drink_from,
        drinkTo: row.drink_to,
        storageLocation: row.storage_location,
      };
      let group = map.get(row.catalog_wine_id);
      if (!group) {
        group = {
          catalogWineId: row.catalog_wine_id,
          title: c
            ? catalogWineTitle({
                producerName: relName(c.producer),
                wineName: c.wine_name,
                vintageKind: c.vintage_kind,
                vintageYear: c.vintage_year,
                vintageTawnyYears: c.vintage_tawny_years,
                appellationName: relName(c.appellation),
              })
            : "Untitled wine",
          totalQuantity: 0,
          lots: [],
        };
        map.set(row.catalog_wine_id, group);
      }
      group.lots.push(lot);
      group.totalQuantity += row.quantity;
    }
    for (const g of map.values()) groups.push(g);
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-6">
        <h1 className="font-heading text-2xl font-semibold">
          {profile.display_name}&apos;s cellar
        </h1>
        {!canView ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
            <p className="font-heading text-lg font-medium">
              This cellar is private
            </p>
            <p className="text-sm text-muted-foreground">
              {profile.display_name} hasn&apos;t shared their cellar with you.
            </p>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
            <p className="font-heading text-lg font-medium">No bottles to show</p>
          </div>
        ) : (
          <BottlesList groups={groups} readOnly />
        )}
      </div>
    </div>
  );
}
