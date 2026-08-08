import Link from "next/link";
import { redirect } from "next/navigation";
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
import { LABELS } from "@/lib/wset/vocab";

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
      "id, bottle_size_ml, quantity, price_per_bottle, currency, drink_from, drink_to, storage_location, catalog_wine_id, created_at, " +
        "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, colour, image_url, estimated_price, estimated_price_currency, " +
        "producer:producers(name), appellation:appellations(name), region:regions(name), country:countries(name), " +
        "primary_grape:grapes!catalog_wines_primary_grape_id_fkey(name), " +
        "secondary_grape:grapes!catalog_wines_secondary_grape_id_fkey(name))",
    )
    .eq("owner_id", user.id)
    .gt("quantity", 0)
    .order("created_at", { ascending: false });

  // Best (highest-scored) tasting note per wine, for the Last note column.
  const { data: scoreRows } = await supabase
    .from("wset_notes")
    .select("id, catalog_wine_id, quality_score, tasted_on")
    .eq("author_id", user.id)
    .not("quality_score", "is", null);
  const bestNote = new Map<string, { id: string; score: number; on: string }>();
  for (const n of (scoreRows ?? []) as unknown as Array<{
    id: string;
    catalog_wine_id: string;
    quality_score: number;
    tasted_on: string;
  }>) {
    const prev = bestNote.get(n.catalog_wine_id);
    if (!prev || n.quality_score > prev.score) {
      bestNote.set(n.catalog_wine_id, {
        id: n.id,
        score: n.quality_score,
        on: n.tasted_on,
      });
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
    // Value prefers the wine's market estimate over what this lot happened to
    // cost (owner decision): purchase price is history, the estimate is worth.
    // Each candidate still has to be in the viewer's currency — no conversion.
    // Resolved ONCE here; the table renders the same number the total sums.
    const estimate =
      cw?.estimated_price == null ? null : Number(cw.estimated_price);
    const estimateUsable =
      estimate != null &&
      Number.isFinite(estimate) &&
      (cw?.estimated_price_currency ?? "DKK") === preferredCurrency;
    const valuePerBottle = estimateUsable
      ? estimate
      : pricePerBottle != null && row.currency === preferredCurrency
        ? pricePerBottle
        : null;
    if (valuePerBottle != null) {
      totalValue += row.quantity * valuePerBottle;
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
      valuePerBottle,
      addedAt: row.created_at,
      bestScore: best?.score ?? null,
      bestNoteId: best?.id ?? null,
      bestNoteOn: best?.on ?? null,
    });
  }
  // "Ready to drink": the window has opened and hasn't closed. Wines with no
  // window at all don't count — readiness unknown is not readiness.
  const thisYear = new Date().getUTCFullYear();
  const readyBottles = bottleRows.reduce(
    (n, r) =>
      (r.drinkFrom != null || r.drinkTo != null) &&
      (r.drinkFrom == null || r.drinkFrom <= thisYear) &&
      (r.drinkTo == null || thisYear <= r.drinkTo)
        ? n + r.quantity
        : n,
    0,
  );
  // Top regions moved into the Stats tab — the summary strip stays focused on
  // the four decision KPIs (own / bottles / worth / ready).
  void regionCounts;

  // Notes, history and stats all load up front so CellarTabs can switch
  // between them instantly, with no navigation.
  let notes: NoteRow[] = [];
  {
    const { data: noteRows } = await supabase
      .from("wset_notes")
      .select(
        "id, tasted_on, quality_score, context_kind, catalog_wine_id, " +
          "sweetness, acidity, tannin, body, finish, taster_notes, " +
          "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, colour, image_url, " +
          "producer:producers(name), appellation:appellations(name), " +
          "region:regions(name), country:countries(name), " +
          "primary_grape:grapes!catalog_wines_primary_grape_id_fkey(name), " +
          "secondary_grape:grapes!catalog_wines_secondary_grape_id_fkey(name))",
      )
      .eq("author_id", user.id)
      .order("tasted_on", { ascending: false });
    type NoteRowRaw = {
      id: string;
      tasted_on: string;
      quality_score: number | null;
      context_kind: "OPEN" | "BLIND" | "TRAINING";
      catalog_wine_id: string;
      sweetness: string | null;
      acidity: string | null;
      tannin: string | null;
      body: string | null;
      finish: string | null;
      taster_notes: string | null;
      catalog_wines: CatalogEmbed | CatalogEmbed[] | null;
    };
    const raw = (noteRows ?? []) as unknown as NoteRowRaw[];
    // The descriptors each note picked, so the card can show what it SAYS.
    const aromasByNote = new Map<string, string[]>();
    if (raw.length > 0) {
      const { data: aromaRows } = await supabase
        .from("wset_note_aromas")
        .select("note_id, term:wset_aroma_terms(term)")
        .in("note_id", raw.map((n) => n.id));
      for (const a of (aromaRows ?? []) as unknown as Array<{
        note_id: string;
        term: { term: string } | { term: string }[] | null;
      }>) {
        const t = unwrap(a.term)?.term;
        if (!t) continue;
        const list = aromasByNote.get(a.note_id) ?? [];
        if (list.length < 5) list.push(t);
        aromasByNote.set(a.note_id, list);
      }
    }
    const structureBits = (n: NoteRowRaw): string[] => {
      const L = (v: string | null) => (v ? (LABELS[v] ?? v) : null);
      return [
        L(n.sweetness),
        n.acidity ? `${L(n.acidity)} acid` : null,
        n.tannin ? `${L(n.tannin)} tannin` : null,
        n.body ? `${L(n.body)} body` : null,
        n.finish ? `${L(n.finish)} finish` : null,
      ].filter(Boolean) as string[];
    };
    notes = raw.map((n) => {
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
        imageUrl: c?.image_url ?? null,
        tastedOn: n.tasted_on,
        qualityScore: n.quality_score,
        contextKind: n.context_kind,
        aromas: aromasByNote.get(n.id) ?? [],
        structure: structureBits(n),
        preview: n.taster_notes?.trim() || null,
      };
    });
  }

  let history: HistoryRow[] = [];
  {
    const { data: consRows } = await supabase
      .from("cellar_consumptions")
      .select(
        "id, quantity, reason, consumed_on, occasion, wset_note_id, catalog_wine_id, " +
          "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, image_url, " +
          "producer:producers(name), appellation:appellations(name), region:regions(name), country:countries(name))",
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
    ).map((r) => {
      const c = unwrap(r.catalog_wines);
      return {
        id: r.id,
        title: embedTitle(c),
        subtitle: embedSubtitle(c),
        imageUrl: c?.image_url ?? null,
        quantity: r.quantity,
        reason: r.reason,
        consumedOn: r.consumed_on,
        occasion: r.occasion,
        wsetNoteId: r.wset_note_id,
        catalogWineId: r.catalog_wine_id,
      };
    });
  }

  let stats: CellarStats | null = null;
  {
    const { data: statRows } = await supabase
      .from("cellar_lots")
      .select(
        "quantity, purchased_quantity, price_per_bottle, currency, purchased_on, drink_from, drink_to, catalog_wine_id, " +
          "catalog_wines(colour, vintage_kind, vintage_year, estimated_price, estimated_price_currency, country:countries(name), region:regions(name))",
      )
      .eq("owner_id", user.id);
    type StatEmbed = {
      colour: string | null;
      vintage_kind: "YEAR" | "NV" | "TAWNY";
      vintage_year: number | null;
      estimated_price: number | string | null;
      estimated_price_currency: string | null;
      country: Rel;
      region: Rel;
    };
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
        catalog_wines: StatEmbed | StatEmbed[] | null;
      }>
    ).map((r) => {
      const c = unwrap(r.catalog_wines);
      return {
        quantity: r.quantity,
        purchasedQuantity: r.purchased_quantity,
        pricePerBottle: r.price_per_bottle == null ? null : Number(r.price_per_bottle),
        currency: r.currency,
        estimatedPrice:
          c?.estimated_price == null ? null : Number(c.estimated_price),
        estimatedPriceCurrency: c?.estimated_price_currency ?? "DKK",
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
        readyBottles={readyBottles}
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
