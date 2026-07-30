import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { catalogWineTitle } from "@/lib/wset/queries";
import { cn } from "@/lib/utils";
import { BottlesList, type LotGroup, type LotRow } from "./bottles-list";
import { MyNotesList, type NoteRow } from "./my-notes-list";

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

export default async function CellarPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "notes" ? "notes" : "bottles";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_currency")
    .eq("id", user.id)
    .maybeSingle();
  const preferredCurrency = profile?.preferred_currency ?? "DKK";

  // Lots drive both the Bottles list and the summary bar (shown on both tabs).
  const { data: lotRows } = await supabase
    .from("cellar_lots")
    .select(
      "id, bottle_size_ml, quantity, price_per_bottle, currency, drink_from, drink_to, storage_location, catalog_wine_id, " +
        "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, producer:producers(name), appellation:appellations(name))",
    )
    .order("created_at", { ascending: false });

  const groupsMap = new Map<string, LotGroup>();
  let totalBottles = 0;
  let totalValue = 0;
  let hasValue = false;
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
    totalBottles += row.quantity;
    if (lot.pricePerBottle != null && row.currency === preferredCurrency) {
      totalValue += row.quantity * lot.pricePerBottle;
      hasValue = true;
    }
    let group = groupsMap.get(row.catalog_wine_id);
    if (!group) {
      group = {
        catalogWineId: row.catalog_wine_id,
        title: embedTitle(unwrap(row.catalog_wines)),
        totalQuantity: 0,
        lots: [],
      };
      groupsMap.set(row.catalog_wine_id, group);
    }
    group.lots.push(lot);
    group.totalQuantity += row.quantity;
  }
  const groups = [...groupsMap.values()];

  let notes: NoteRow[] = [];
  if (tab === "notes") {
    const { data: noteRows } = await supabase
      .from("wset_notes")
      .select(
        "id, tasted_on, quality_score, context_kind, catalog_wine_id, " +
          "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, producer:producers(name), appellation:appellations(name))",
      )
      .eq("author_id", user.id)
      .order("tasted_on", { ascending: false });
    notes = (
      (noteRows ?? []) as unknown as Array<{
        id: string;
        tasted_on: string;
        quality_score: number | null;
        context_kind: "OPEN" | "BLIND" | "TRAINING";
        catalog_wine_id: string;
        catalog_wines: CatalogEmbed | CatalogEmbed[] | null;
      }>
    ).map((n) => ({
      id: n.id,
      catalogWineId: n.catalog_wine_id,
      title: embedTitle(unwrap(n.catalog_wines)),
      tastedOn: n.tasted_on,
      qualityScore: n.quality_score,
      contextKind: n.context_kind,
    }));
  }

  const tabClass = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm transition-colors",
      active
        ? "bg-background text-foreground shadow-sm ring-1 ring-border"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Cellar</h1>
          <p className="text-sm text-muted-foreground">
            The wines you own — bottles, drink windows and value.
          </p>
        </div>
        <Link
          href="/cellar/new"
          className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Add a wine
        </Link>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm">
        <span>
          <span className="font-heading text-base font-semibold">{totalBottles}</span>{" "}
          <span className="text-muted-foreground">bottles</span>
        </span>
        <span>
          <span className="font-heading text-base font-semibold">{groups.length}</span>{" "}
          <span className="text-muted-foreground">wines</span>
        </span>
        {hasValue ? (
          <span>
            <span className="font-heading text-base font-semibold">
              {Math.round(totalValue).toLocaleString()}
            </span>{" "}
            <span className="text-muted-foreground">{preferredCurrency} value</span>
          </span>
        ) : null}
      </div>

      <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
        <Link href="/cellar" className={tabClass(tab === "bottles")}>
          Bottles
        </Link>
        <Link href="/cellar?tab=notes" className={tabClass(tab === "notes")}>
          My notes
        </Link>
      </div>

      {tab === "bottles" ? (
        <BottlesList groups={groups} />
      ) : (
        <MyNotesList notes={notes} />
      )}
    </div>
  );
}
