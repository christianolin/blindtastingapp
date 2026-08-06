import { requireUser } from "@/lib/auth/dal";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { catalogWineTitle } from "@/lib/wset/queries";
import { CellarTabs } from "./cellar-tabs";
import { PageHeader } from "@/components/patterns/page-header";
import { CellarSummary } from "./cellar-summary";
import { FileUp, Plus } from "lucide-react";
import { type BottleRow } from "./cellar-bottles-table";
import { type NoteRow } from "./my-notes-list";
import { AddWineButton } from "@/components/add-wine-button";
import { type HistoryRow } from "./history-list";
import { computeCellarStats, type StatLotRow, type CellarStats } from "./stats";
import { CellarVisibilityControl } from "./cellar-visibility-control";

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

function embedSubtitle(c: CatalogEmbed | null): string | null {
  if (!c) return null;
  return (
    [relName(c.region ?? null), relName(c.country ?? null)]
      .filter(Boolean)
      .join(" · ") || null
  );
}

export default async function CellarPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await searchParams;
  const tab =
    tabParam === "notes"
      ? "notes"
      : tabParam === "history"
        ? "history"
        : tabParam === "stats"
          ? "stats"
          : "bottles";

  const supabase = await createClient();
  const user = await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_currency, cellar_visibility")
    .eq("id", user.id)
    .maybeSingle();
  const preferredCurrency = profile?.preferred_currency ?? "DKK";
  const visibility = profile?.cellar_visibility ?? "PRIVATE";

  // Lots drive both the Bottles list and the summary bar (shown on both tabs).
  const { data: lotRows } = await supabase
    .from("cellar_lots")
    .select(
      "id, bottle_size_ml, quantity, price_per_bottle, currency, drink_from, drink_to, storage_location, catalog_wine_id, created_at, " +
        "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, colour, image_url, " +
        "producer:producers(name), appellation:appellations(name), region:regions(name), country:countries(name), " +
        "primary_grape:grapes!catalog_wines_primary_grape_id_fkey(name), " +
        "secondary_grape:grapes!catalog_wines_secondary_grape_id_fkey(name))",
    )
    .eq("owner_id", user.id)
    .gt("quantity", 0)
    .order("created_at", { ascending: false });

  // Best (highest-scored) tasting note per wine, for the Tasting note column.
  const { data: scoreRows } = await supabase
    .from("wset_notes")
    .select("id, catalog_wine_id, quality_score")
    .eq("author_id", user.id)
    .not("quality_score", "is", null);
  const bestNote = new Map<string, { id: string; score: number }>();
  for (const n of (scoreRows ?? []) as unknown as Array<{
    id: string;
    catalog_wine_id: string;
    quality_score: number;
  }>) {
    const prev = bestNote.get(n.catalog_wine_id);
    if (!prev || n.quality_score > prev.score) {
      bestNote.set(n.catalog_wine_id, { id: n.id, score: n.quality_score });
    }
  }

  const bottleRows: BottleRow[] = [];
  const uniqueWines = new Set<string>();
  const regionCounts = new Map<string, number>();
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
    if (pricePerBottle != null && row.currency === preferredCurrency) {
      totalValue += row.quantity * pricePerBottle;
      hasValue = true;
    }
    const best = bestNote.get(row.catalog_wine_id) ?? null;
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
      pricePerBottle,
      currency: row.currency,
      addedAt: row.created_at,
      bestScore: best?.score ?? null,
      bestNoteId: best?.id ?? null,
    });
  }
  const topRegions = [...regionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bottles]) => ({ name, bottles }));

  // Notes, history and stats all load up front so CellarTabs can switch
  // between them instantly, with no navigation.
  let notes: NoteRow[] = [];
  {
    const { data: noteRows } = await supabase
      .from("wset_notes")
      .select(
        "id, tasted_on, quality_score, context_kind, catalog_wine_id, " +
          "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, colour, " +
          "producer:producers(name), appellation:appellations(name), " +
          "region:regions(name), country:countries(name), " +
          "primary_grape:grapes!catalog_wines_primary_grape_id_fkey(name), " +
          "secondary_grape:grapes!catalog_wines_secondary_grape_id_fkey(name))",
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
    ).map((n) => {
      const c = unwrap(n.catalog_wines);
      return {
        id: n.id,
        catalogWineId: n.catalog_wine_id,
        title: embedTitle(c),
        subtitle: embedSubtitle(c),
        grapes:
          [relName(c?.primary_grape ?? null), relName(c?.secondary_grape ?? null)]
            .filter(Boolean)
            .join(", ") || null,
        colour: c?.colour ?? null,
        tastedOn: n.tasted_on,
        qualityScore: n.quality_score,
        contextKind: n.context_kind,
      };
    });
  }

  let history: HistoryRow[] = [];
  {
    const { data: consRows } = await supabase
      .from("cellar_consumptions")
      .select(
        "id, quantity, reason, consumed_on, occasion, wset_note_id, catalog_wine_id, " +
          "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, producer:producers(name), appellation:appellations(name))",
      )
      .order("consumed_on", { ascending: false })
      .order("created_at", { ascending: false });
    history = (
      (consRows ?? []) as unknown as Array<{
        id: string;
        quantity: number;
        reason: "DRANK" | "GIFTED" | "LOST" | "OTHER";
        consumed_on: string;
        occasion: string | null;
        wset_note_id: string | null;
        catalog_wine_id: string;
        catalog_wines: CatalogEmbed | CatalogEmbed[] | null;
      }>
    ).map((r) => ({
      id: r.id,
      title: embedTitle(unwrap(r.catalog_wines)),
      quantity: r.quantity,
      reason: r.reason,
      consumedOn: r.consumed_on,
      occasion: r.occasion,
      wsetNoteId: r.wset_note_id,
      catalogWineId: r.catalog_wine_id,
    }));
  }

  let stats: CellarStats | null = null;
  {
    const { data: statRows } = await supabase
      .from("cellar_lots")
      .select(
        "quantity, purchased_quantity, price_per_bottle, currency, purchased_on, drink_from, drink_to, catalog_wine_id, " +
          "catalog_wines(colour, vintage_kind, vintage_year, country:countries(name), region:regions(name))",
      )
      .eq("owner_id", user.id);
    const lots: StatLotRow[] = (
      (statRows ?? []) as unknown as Array<{
        quantity: number;
        purchased_quantity: number;
        price_per_bottle: number | null;
        currency: string;
        purchased_on: string | null;
        drink_from: number | null;
        drink_to: number | null;
        catalog_wine_id: string;
        catalog_wines:
          | {
              colour: string | null;
              vintage_kind: "YEAR" | "NV" | "TAWNY";
              vintage_year: number | null;
              country: Rel;
              region: Rel;
            }
          | Array<{
              colour: string | null;
              vintage_kind: "YEAR" | "NV" | "TAWNY";
              vintage_year: number | null;
              country: Rel;
              region: Rel;
            }>
          | null;
      }>
    ).map((r) => {
      const c = unwrap(r.catalog_wines);
      return {
        quantity: r.quantity,
        purchasedQuantity: r.purchased_quantity,
        pricePerBottle: r.price_per_bottle == null ? null : Number(r.price_per_bottle),
        currency: r.currency,
        purchasedOn: r.purchased_on,
        drinkFrom: r.drink_from,
        drinkTo: r.drink_to,
        catalogWineId: r.catalog_wine_id,
        colour: c?.colour ?? null,
        vintageKind: c?.vintage_kind ?? "NV",
        vintageYear: c?.vintage_year ?? null,
        regionName: relName(c?.region ?? null),
        countryName: relName(c?.country ?? null),
      };
    });
    stats = computeCellarStats(lots, preferredCurrency, new Date().getUTCFullYear());
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
      <PageHeader
        title="Cellar"
        subtitle="The wines you own — bottles, drink windows and value."
        actions={
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href="/cellar/import"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              >
                <FileUp className="size-4" />
                Import CSV from CellarTracker
              </Link>
              <AddWineButton
                kind="cellar"
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="size-4" />
                Add a wine
              </AddWineButton>
            </div>
            <CellarVisibilityControl userId={user.id} current={visibility} />
          </div>
        }
      />

      <CellarSummary
        uniqueWines={uniqueWines.size}
        totalBottles={totalBottles}
        totalValue={totalValue}
        hasValue={hasValue}
        topRegions={topRegions}
        currency={preferredCurrency}
      />

      <CellarTabs
        bottles={bottleRows}
        notes={notes}
        history={history}
        stats={stats}
        currency={preferredCurrency}
        initialTab={tab}
      />
    </div>
  );
}
