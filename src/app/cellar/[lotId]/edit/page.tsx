import { requireUser } from "@/lib/auth/dal";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { catalogWineTitle } from "@/lib/wset/queries";
import { EditLotForm } from "./edit-lot-form";

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

type LotRow = {
  id: string;
  bottle_size_ml: number;
  quantity: number;
  price_per_bottle: number | null;
  currency: string;
  purchased_on: string | null;
  purchase_source: string | null;
  drink_from: number | null;
  drink_to: number | null;
  storage_location: string | null;
  lot_note: string | null;
  catalog_wines: {
    wine_name: string | null;
    vintage_kind: "YEAR" | "NV" | "TAWNY";
    vintage_year: number | null;
    vintage_tawny_years: number | null;
    producer: Rel;
    appellation: Rel;
  } | null;
};

export default async function EditLotPage({
  params,
}: {
  params: Promise<{ lotId: string }>;
}) {
  const { lotId } = await params;
  const supabase = await createClient();
  await requireUser();

  const { data } = await supabase
    .from("cellar_lots")
    .select(
      "id, bottle_size_ml, quantity, price_per_bottle, currency, purchased_on, purchase_source, drink_from, drink_to, storage_location, lot_note, " +
        "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, producer:producers(name), appellation:appellations(name))",
    )
    .eq("id", lotId)
    .maybeSingle();

  // RLS returns nothing for a lot that isn't the caller's, so treat as absent.
  const lot = data as unknown as LotRow | null;
  if (!lot) redirect("/cellar");

  const c = unwrap(lot.catalog_wines);
  const title = c
    ? catalogWineTitle({
        producerName: relName(c.producer),
        wineName: c.wine_name,
        vintageKind: c.vintage_kind,
        vintageYear: c.vintage_year,
        vintageTawnyYears: c.vintage_tawny_years,
        appellationName: relName(c.appellation),
      })
    : "Untitled wine";

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-6">
      <Link
        href="/cellar"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back to cellar
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <EditLotForm
            lotId={lot.id}
            initial={{
              quantity: lot.quantity,
              bottleSizeMl: lot.bottle_size_ml,
              pricePerBottle: lot.price_per_bottle,
              currency: lot.currency,
              purchasedOn: lot.purchased_on,
              purchaseSource: lot.purchase_source,
              drinkFrom: lot.drink_from,
              drinkTo: lot.drink_to,
              storageLocation: lot.storage_location,
              lotNote: lot.lot_note,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
