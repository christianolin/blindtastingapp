import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { catalogWineTitle } from "@/lib/wset/queries";
import { PageHeader } from "@/components/patterns/page-header";
import { CellarSummary } from "@/app/cellar/cellar-summary";
import {
  CellarBottlesTable,
  type BottleRow,
} from "@/app/cellar/cellar-bottles-table";

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
  region?: Rel;
  country?: Rel;
  colour?: "WHITE" | "ROSE" | "RED" | "ORANGE" | null;
  image_url?: string | null;
  primary_grape?: Rel;
  secondary_grape?: Rel;
  estimated_price?: number | string | null;
  estimated_price_currency?: string | null;
};

function embedTitle(c: CatalogEmbed | null): string {
  if (!c) return "Untitled wine";
  return catalogWineTitle({
    producerName: relName(c.producer),
    wineName: c.wine_name,
    vintageKind: c.vintage_kind,
    vintageYear: c.vintage_year,
    vintageTawnyYears: c.vintage_tawny_years,
    appellationName: relName(c.appellation),
  });
}

// A friend's cellar rendered with the same inventory table as your own, but
// read-only: no Drink/Edit/More actions and no add-wine affordances. Gated by
// can_view_cellar (visibility PUBLIC/FRIENDS). Tasting notes and consumption
// history stay private to the owner, so only the Bottles view is shown.
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
    .select("display_name, preferred_currency")
    .eq("id", id)
    .maybeSingle();
  if (!profile) notFound();
  const displayName = profile.display_name ?? "This member";
  const currency = profile.preferred_currency ?? "DKK";

  const { data: canView } = await supabase.rpc("can_view_cellar", { p_owner: id });

  const bottleRows: BottleRow[] = [];
  const uniqueWines = new Set<string>();
  const regionCounts = new Map<string, number>();
  let totalBottles = 0;
  let totalValue = 0;
  let hasValue = false;
  if (canView) {
    const { data: lotRows } = await supabase
      .from("cellar_lots")
      .select(
        "id, bottle_size_ml, quantity, price_per_bottle, currency, drink_from, drink_to, storage_location, catalog_wine_id, created_at, " +
          "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, colour, image_url, estimated_price, estimated_price_currency, " +
          "producer:producers(name), appellation:appellations(name), region:regions(name), country:countries(name), " +
          "primary_grape:grapes!catalog_wines_primary_grape_id_fkey(name), " +
          "secondary_grape:grapes!catalog_wines_secondary_grape_id_fkey(name))",
      )
      .eq("owner_id", id)
      .gt("quantity", 0)
      .order("created_at", { ascending: false });
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
      created_at: string;
      catalog_wines: CatalogEmbed | CatalogEmbed[] | null;
    }>) {
      const cw = unwrap(row.catalog_wines);
      const pricePerBottle =
        row.price_per_bottle == null ? null : Number(row.price_per_bottle);
      totalBottles += row.quantity;
      uniqueWines.add(row.catalog_wine_id);
      const regionName =
        relName(cw?.region ?? null) ?? relName(cw?.country ?? null) ?? "Unknown";
      regionCounts.set(regionName, (regionCounts.get(regionName) ?? 0) + row.quantity);
      // Same estimate-first rule as the owner's own cellar page, valued in the
      // OWNER's preferred currency (it is their cellar being summed). Resolved
      // once; row cell and total share the number.
      const estimate =
        cw?.estimated_price == null ? null : Number(cw.estimated_price);
      const estimateUsable =
        estimate != null &&
        Number.isFinite(estimate) &&
        (cw?.estimated_price_currency ?? "DKK") === currency;
      const valuePerBottle = estimateUsable
        ? estimate
        : pricePerBottle != null && row.currency === currency
          ? pricePerBottle
          : null;
      if (valuePerBottle != null) {
        totalValue += row.quantity * valuePerBottle;
        hasValue = true;
      }
      bottleRows.push({
        lotId: row.id,
        catalogWineId: row.catalog_wine_id,
        title: embedTitle(cw),
        colour: cw?.colour ?? null,
        grapes: [
          relName(cw?.primary_grape ?? null),
          relName(cw?.secondary_grape ?? null),
        ].filter(Boolean) as string[],
        region: relName(cw?.region ?? null),
        country: relName(cw?.country ?? null),
        appellation: relName(cw?.appellation ?? null),
        imageUrl: cw?.image_url ?? null,
        bottleSizeMl: row.bottle_size_ml,
        quantity: row.quantity,
        drinkFrom: row.drink_from,
        drinkTo: row.drink_to,
        storageLocation: row.storage_location,
        valuePerBottle,
        addedAt: row.created_at,
        bestScore: null,
        bestNoteId: null,
      bestNoteOn: null,
      });
    }
  }
  const topRegions = [...regionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bottles]) => ({ name, bottles }));

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
        <PageHeader
          title={`${displayName}\u2019s cellar`}
          subtitle="The wines they own — bottles, drink windows and value."
        />

        {!canView ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
            <p className="font-heading text-lg font-medium">This cellar is private</p>
            <p className="text-sm text-muted-foreground">
              {displayName} hasn&apos;t shared their cellar with you.
            </p>
          </div>
        ) : (
          <>
            {bottleRows.length > 0 ? (
              <CellarSummary
                uniqueWines={uniqueWines.size}
                totalBottles={totalBottles}
                totalValue={totalValue}
                hasValue={hasValue}
                topRegions={topRegions}
                currency={currency}
              />
            ) : null}
            <CellarBottlesTable rows={bottleRows} currency={currency} readOnly />
          </>
        )}
      </div>
    </div>
  );
}
