import { AddWineButton } from "@/components/add-wine-button";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { catalogWineTitle } from "@/lib/wset/queries";
import { bottleTitle } from "@/lib/cellar/format";
import type { BottleWine } from "@/lib/cellar/types";
import { PageHeader } from "@/components/patterns/page-header";
import { CatalogList } from "./catalog-list";
import {
  bandAverage,
  bandLinePhone,
  bandParts,
  yourLine,
  type CatalogBand,
  type CatalogRow,
} from "./catalog-list-math";

type Rel = { name: string } | { name: string }[] | null;
type WineRow = {
  id: string;
  colour: "WHITE" | "ROSE" | "RED" | "ORANGE" | null;
  style: "STILL" | "SPARKLING" | "FORTIFIED" | "SWEET" | null;
  wine_name: string | null;
  image_url: string | null;
  vintage_kind: "YEAR" | "NV" | "TAWNY";
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  producer: Rel;
  country: Rel;
  region: Rel;
  appellation: Rel;
  type_designation: Rel;
  created_at: string;
};

// Kept identical for the primary (newest 500) read and every catch-up chunk
// (refinement 15) so an owned/tasted wine outside the 500 renders the same
// facts as one inside it.
const CATALOG_SELECT =
  "id, created_at, colour, style, wine_name, image_url, vintage_kind, vintage_year, vintage_tawny_years, " +
  "producer:producers(name), country:countries(name), region:regions(name), appellation:appellations(name), " +
  "type_designation:type_designations(name)";

const CHUNK_SIZE = 200;

const PAGE = 1000;

/** PostgREST's `max-rows` is 1000 on Supabase, so a plain `.select()` silently
 *  truncates a cellar or a note history bigger than that (a CellarTracker
 *  import reaches it easily) — and a truncated read here under-counts
 *  `band.owned`/`band.yourNotes`, drops the "{n} owned" badge, hides wines
 *  from "In my cellar", and keeps refinement 15's catch-up fetch from ever
 *  asking for them. Same loop as `getCellarBottles` (src/lib/cellar/bottles.ts). */
async function pageAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await run(from, from + PAGE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function relName(rel: Rel): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export default async function CatalogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: wines }, lots, notes, { data: ratings }, { count: totalWines }] =
    await Promise.all([
      supabase
        .from("catalog_wines")
        .select(CATALOG_SELECT)
        .is("merged_into", null)
        .eq("blind_pending", false)
        .order("created_at", { ascending: false })
        .limit(500),
      pageAll((from, to) =>
        supabase
          .from("cellar_lots")
          .select("catalog_wine_id, quantity")
          .eq("owner_id", user.id)
          .gt("quantity", 0)
          .order("id")
          .range(from, to),
      ),
      pageAll((from, to) =>
        supabase
          .from("wset_notes")
          .select("catalog_wine_id, quality_score, tasted_on, created_at")
          .eq("author_id", user.id)
          .not("quality_score", "is", null)
          .not("catalog_wine_id", "is", null)
          .order("tasted_on", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      supabase.from("catalog_wine_ratings").select("catalog_wine_id, avg_score, note_count"),
      supabase
        .from("catalog_wines")
        .select("id", { count: "exact", head: true })
        .is("merged_into", null)
        .eq("blind_pending", false),
    ]);

  const primaryList = (wines ?? []) as unknown as WineRow[];
  const primaryIds = new Set(primaryList.map((w) => w.id));

  // D3: the viewer's most recent scored note per wine — the notes arrive
  // newest first (tasted_on desc, created_at desc), so the first one seen
  // per wine id is the one that counts.
  const yoursByWine = new Map<string, number>();
  for (const n of notes) {
    if (n.catalog_wine_id == null || n.quality_score == null) continue;
    if (!yoursByWine.has(n.catalog_wine_id)) {
      yoursByWine.set(n.catalog_wine_id, Number(n.quality_score));
    }
  }
  const ownedByWine = new Map<string, number>();
  for (const l of lots) {
    ownedByWine.set(l.catalog_wine_id, (ownedByWine.get(l.catalog_wine_id) ?? 0) + l.quantity);
  }

  // Refinement 15: the viewer's own owned/tasted wines render even past the
  // newest-500 cut, so "In my cellar {o}"/"I have tasted {t}" actually
  // filter down to their real counts instead of whatever subset landed in
  // the newest 500.
  const extraIds = [...new Set([...ownedByWine.keys(), ...yoursByWine.keys()])].filter(
    (id) => !primaryIds.has(id),
  );
  const extraResults = await Promise.all(
    chunk(extraIds, CHUNK_SIZE).map((ids) =>
      supabase
        .from("catalog_wines")
        .select(CATALOG_SELECT)
        .in("id", ids)
        .is("merged_into", null)
        .eq("blind_pending", false),
    ),
  );
  const extraList = extraResults.flatMap((r) => r.data ?? []) as unknown as WineRow[];

  const wineList = [...primaryList, ...extraList];
  const wineIds = wineList.map((w) => w.id);

  const [{ data: grapeRows }, { data: appearanceRows }, { data: holdingRows }] =
    await Promise.all([
      supabase
        .from("catalog_wine_grapes")
        .select("catalog_wine_id, percentage, sort_order, grapes(name)")
        .in("catalog_wine_id", wineIds.length ? wineIds : [""]),
      supabase.rpc("catalog_wine_appearances", { p_ids: wineIds }),
      supabase.rpc("catalog_wine_holdings", { p_ids: wineIds }),
    ]);
  const appearancesByWine = new Map(
    (appearanceRows ?? []).map((r) => [r.catalog_wine_id, r.appearances]),
  );
  const bottlesByWine = new Map(
    (holdingRows ?? []).map((r) => [r.catalog_wine_id, r.bottles]),
  );
  const grapesByWine = new Map<string, { name: string; pct: number | null; sort: number }[]>();
  for (const g of (grapeRows ?? []) as unknown as Array<{
    catalog_wine_id: string;
    percentage: number | null;
    sort_order: number;
    grapes: { name: string } | { name: string }[] | null;
  }>) {
    const gg = Array.isArray(g.grapes) ? g.grapes[0] : g.grapes;
    if (!gg) continue;
    const arr = grapesByWine.get(g.catalog_wine_id) ?? [];
    arr.push({ name: gg.name, pct: g.percentage == null ? null : Number(g.percentage), sort: g.sort_order });
    grapesByWine.set(g.catalog_wine_id, arr);
  }
  const orderedGrapes = (id: string): string[] => {
    const arr = grapesByWine.get(id) ?? [];
    const anyPct = arr.some((x) => x.pct != null);
    const sorted = anyPct
      ? [...arr].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1))
      : [...arr].sort((a, b) => a.sort - b.sort);
    return sorted.map((x) => x.name);
  };

  const ratingMap = new Map((ratings ?? []).map((r) => [r.catalog_wine_id, r]));
  const ratingRows = ratings ?? [];
  const totalNotes = ratingRows.reduce((s, r) => s + (r.note_count ?? 0), 0);
  const average = bandAverage(
    ratingRows.map((r) => ({
      avg: r.avg_score != null ? Number(r.avg_score) : null,
      count: r.note_count ?? 0,
    })),
  );

  const rows: CatalogRow[] = wineList.map((w) => {
    const rating = ratingMap.get(w.id);
    const vintage =
      w.vintage_kind === "YEAR"
        ? w.vintage_year
          ? String(w.vintage_year)
          : "—"
        : w.vintage_kind === "TAWNY"
          ? w.vintage_tawny_years
            ? `${w.vintage_tawny_years}yo`
            : "Tawny"
          : "NV";
    const producer = relName(w.producer);
    const grapes = orderedGrapes(w.id);
    const wine: BottleWine = {
      catalogWineId: w.id,
      title: catalogWineTitle({
        producerName: producer,
        wineName: w.wine_name,
        vintageKind: w.vintage_kind,
        vintageYear: w.vintage_year,
        vintageTawnyYears: w.vintage_tawny_years,
        appellationName: relName(w.appellation),
      }),
      producer,
      wineName: w.wine_name,
      vintageKind: w.vintage_kind,
      vintageYear: w.vintage_year,
      vintageTawnyYears: w.vintage_tawny_years,
      primaryGrape: grapes[0] ?? null,
      colour: w.colour,
      style: w.style,
      designation: relName(w.type_designation),
      appellation: relName(w.appellation),
      region: relName(w.region),
      country: relName(w.country),
      imageUrl: w.image_url,
    };
    return {
      id: w.id,
      producer,
      name: bottleTitle(wine),
      title: wine.title,
      colour: w.colour,
      style: w.style,
      country: wine.country,
      region: wine.region,
      appellation: wine.appellation,
      grapes,
      designation: wine.designation,
      vintage,
      imageUrl: w.image_url,
      avgScore: rating ? Number(rating.avg_score) : null,
      noteCount: rating?.note_count ?? 0,
      appearances: appearancesByWine.get(w.id) ?? 0,
      cellarBottles: bottlesByWine.get(w.id) ?? 0,
      yours: yoursByWine.get(w.id) ?? null,
      owned: ownedByWine.get(w.id) ?? 0,
      addedAt: w.created_at,
    };
  });

  const band: CatalogBand = {
    wines: totalWines ?? 0,
    notes: totalNotes,
    average,
    yourNotes: yoursByWine.size,
    owned: ownedByWine.size,
  };
  const parts = bandParts(band);
  const your = yourLine(band);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-6">
      <PageHeader
        title="Catalog"
        subtitle="The shared wine database, built by everyone tasting"
        actions={
          <AddWineButton
            kind="catalog"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Add a wine <Plus className="size-4" />
          </AddWineButton>
        }
      />

      <div className="hidden flex-wrap items-baseline gap-x-6 gap-y-2 md:flex">
        <p className="flex items-baseline gap-1.5">
          <span className="font-heading text-2xl font-semibold tabular-nums">{parts.wines}</span>
          <span className="text-sm text-muted-foreground">wines</span>
        </p>
        <p className="flex items-baseline gap-1.5">
          <span className="font-heading text-2xl font-semibold tabular-nums">{parts.notes}</span>
          <span className="text-sm text-muted-foreground">tasting notes shared</span>
        </p>
        {parts.average != null ? (
          <p className="flex items-baseline gap-1.5">
            <span className="font-heading text-2xl font-semibold tabular-nums">{parts.average}</span>
            <span className="text-sm text-muted-foreground">average across all of them</span>
          </p>
        ) : null}
        <p className="ml-auto text-sm text-muted-foreground">
          You have notes on <span className="font-semibold text-foreground">{your.notes}</span> · you
          own <span className="font-semibold text-foreground">{your.owned}</span>
        </p>
      </div>
      <p className="text-sm text-muted-foreground md:hidden">{bandLinePhone(band)}</p>

      <CatalogList rows={rows} band={band} />
    </div>
  );
}
