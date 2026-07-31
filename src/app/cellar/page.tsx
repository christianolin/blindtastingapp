import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { catalogWineTitle } from "@/lib/wset/queries";
import { Tabs } from "@/components/ui/tabs";
import { PageHeader } from "@/components/patterns/page-header";
import { StatStrip, StatTile } from "@/components/patterns/stat-tile";
import { Wine, Boxes, Coins, FileUp, CalendarCheck, FileText } from "lucide-react";
import { BottlesList, type LotGroup, type LotRow } from "./bottles-list";
import { MyNotesList, type NoteRow } from "./my-notes-list";
import { HistoryList, type HistoryRow } from "./history-list";
import { StatsPanel } from "./stats-panel";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
      "id, bottle_size_ml, quantity, price_per_bottle, currency, drink_from, drink_to, storage_location, catalog_wine_id, " +
        "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, producer:producers(name), appellation:appellations(name), region:regions(name), country:countries(name))",
    )
    .gt("quantity", 0)
    .order("created_at", { ascending: false });

  const groupsMap = new Map<string, LotGroup>();
  const currentYear = new Date().getUTCFullYear();
  let totalBottles = 0;
  let totalValue = 0;
  let hasValue = false;
  let readyBottles = 0;
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
    if (
      row.drink_from != null &&
      currentYear >= row.drink_from &&
      (row.drink_to == null || currentYear <= row.drink_to)
    ) {
      readyBottles += row.quantity;
    }
    if (lot.pricePerBottle != null && row.currency === preferredCurrency) {
      totalValue += row.quantity * lot.pricePerBottle;
      hasValue = true;
    }
    let group = groupsMap.get(row.catalog_wine_id);
    if (!group) {
      group = {
        catalogWineId: row.catalog_wine_id,
        title: embedTitle(unwrap(row.catalog_wines)),
        subtitle: embedSubtitle(unwrap(row.catalog_wines)),
        totalQuantity: 0,
        lots: [],
      };
      groupsMap.set(row.catalog_wine_id, group);
    }
    group.lots.push(lot);
    group.totalQuantity += row.quantity;
  }
  const groups = [...groupsMap.values()];

  const { count: notesCount } = await supabase
    .from("wset_notes")
    .select("id", { count: "exact", head: true })
    .eq("author_id", user.id);

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

  let history: HistoryRow[] = [];
  if (tab === "history") {
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
  if (tab === "stats") {
    const { data: statRows } = await supabase
      .from("cellar_lots")
      .select(
        "quantity, purchased_quantity, price_per_bottle, currency, purchased_on, drink_from, drink_to, catalog_wine_id, " +
          "catalog_wines(colour, vintage_kind, vintage_year, country:countries(name), region:regions(name))",
      );
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
              <Link
                href="/cellar/new"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Add a wine
              </Link>
            </div>
            <CellarVisibilityControl userId={user.id} current={visibility} />
          </div>
        }
      />

      <StatStrip className="sm:grid-cols-3 lg:grid-cols-5">
        <StatTile icon={Boxes} tint="amber" value={groups.length} label="wines" />
        <StatTile icon={Wine} tint="rose" value={totalBottles} label="bottles" />
        <StatTile
          icon={Coins}
          tint="gold"
          value={hasValue ? Math.round(totalValue).toLocaleString() : "—"}
          label={`${preferredCurrency} value`}
        />
        <StatTile
          icon={CalendarCheck}
          tint="green"
          value={readyBottles}
          label="ready to drink"
          sub="in your window"
        />
        <StatTile
          icon={FileText}
          tint="purple"
          value={notesCount ?? 0}
          label="notes written"
        />
      </StatStrip>

      <Tabs
        variant="underline"
        activeKey={tab}
        items={[
          { key: "bottles", label: "Bottles", href: "/cellar" },
          { key: "notes", label: "My notes", href: "/cellar?tab=notes" },
          { key: "history", label: "History", href: "/cellar?tab=history" },
          { key: "stats", label: "Stats", href: "/cellar?tab=stats" },
        ]}
      />

      {tab === "bottles" ? (
        <BottlesList groups={groups} />
      ) : tab === "notes" ? (
        <MyNotesList notes={notes} />
      ) : tab === "history" ? (
        <HistoryList rows={history} />
      ) : stats ? (
        <StatsPanel stats={stats} />
      ) : null}
    </div>
  );
}
