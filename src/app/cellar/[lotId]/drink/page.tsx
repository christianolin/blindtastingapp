import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { catalogWineTitle } from "@/lib/wset/queries";
import { DrinkForm } from "./drink-form";

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
  quantity: number;
  catalog_wine_id: string;
  catalog_wines: {
    wine_name: string | null;
    vintage_kind: "YEAR" | "NV" | "TAWNY";
    vintage_year: number | null;
    vintage_tawny_years: number | null;
    producer: Rel;
    appellation: Rel;
  } | null;
};

export default async function DrinkLotPage({
  params,
}: {
  params: Promise<{ lotId: string }>;
}) {
  const { lotId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("cellar_lots")
    .select(
      "id, quantity, catalog_wine_id, catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, producer:producers(name), appellation:appellations(name))",
    )
    .eq("id", lotId)
    .maybeSingle();

  // RLS hides other users' lots; an emptied lot can't be drunk from.
  const lot = data as unknown as LotRow | null;
  if (!lot || lot.quantity <= 0) redirect("/cellar");

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
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-6">
      <Link
        href="/cellar"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Back to cellar
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Drink {title}</CardTitle>
        </CardHeader>
        <CardContent>
          <DrinkForm
            lotId={lot.id}
            available={lot.quantity}
            wineId={lot.catalog_wine_id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
