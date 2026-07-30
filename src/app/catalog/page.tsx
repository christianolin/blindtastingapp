import Link from "next/link";
import { redirect } from "next/navigation";
import { Wine, FileText, Users, Globe, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { catalogWineTitle } from "@/lib/wset/queries";
import { PageHeader } from "@/components/patterns/page-header";
import { CatalogList, type CatalogRow } from "./catalog-list";

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
};

function relName(rel: Rel): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}

export default async function CatalogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: wines }, { data: ratings }, { count: totalWines }, { count: totalCountries }] =
    await Promise.all([
      supabase
        .from("catalog_wines")
        .select(
          "id, colour, style, wine_name, image_url, vintage_kind, vintage_year, vintage_tawny_years, " +
            "producer:producers(name), country:countries(name), region:regions(name), appellation:appellations(name)",
        )
        .is("merged_into", null)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("catalog_wine_ratings").select("catalog_wine_id, avg_score, note_count"),
      supabase
        .from("catalog_wines")
        .select("id", { count: "exact", head: true })
        .is("merged_into", null),
      supabase.from("countries").select("id", { count: "exact", head: true }),
    ]);

  const wineList = (wines ?? []) as unknown as WineRow[];
  const wineIds = wineList.map((w) => w.id);

  const { data: grapeRows } = await supabase
    .from("catalog_wine_grapes")
    .select("catalog_wine_id, percentage, sort_order, grapes(name)")
    .in("catalog_wine_id", wineIds.length ? wineIds : [""]);
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
  const avgScore =
    totalNotes > 0
      ? Math.round(
          ratingRows.reduce(
            (s, r) => s + (r.avg_score != null ? Number(r.avg_score) * (r.note_count ?? 0) : 0),
            0,
          ) / totalNotes,
        )
      : null;

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
    return {
      id: w.id,
      title: catalogWineTitle({
        producerName: relName(w.producer),
        wineName: w.wine_name,
        vintageKind: w.vintage_kind,
        vintageYear: w.vintage_year,
        vintageTawnyYears: w.vintage_tawny_years,
        appellationName: relName(w.appellation),
      }),
      colour: w.colour,
      style: w.style,
      country: relName(w.country),
      region: relName(w.region),
      appellation: relName(w.appellation),
      grapes: orderedGrapes(w.id),
      vintage,
      imageUrl: w.image_url,
      avgScore: rating ? Number(rating.avg_score) : null,
      noteCount: rating?.note_count ?? 0,
    };
  });

  const stats = [
    { icon: Wine, value: (totalWines ?? 0).toLocaleString(), label: "wines", sub: "In catalog" },
    { icon: FileText, value: totalNotes.toLocaleString(), label: "tasting notes", sub: "Shared by community" },
    { icon: Users, value: avgScore != null ? String(avgScore) : "—", label: "avg community score", sub: null },
    { icon: Globe, value: String(totalCountries ?? 0), label: "countries", sub: "Represented" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-6">
      <PageHeader
        title="Catalog"
        subtitle="Explore the shared wine database curated by the community."
        actions={
          <Link
            href="/catalog/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Add a wine <Plus className="size-4" />
          </Link>
        }
      />

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border sm:flex-row sm:divide-x sm:divide-y-0">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-1 items-center gap-3 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <s.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="font-heading text-xl leading-none font-semibold tabular-nums">
                {s.value}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
              {s.sub ? (
                <div className="text-[11px] text-muted-foreground/70">{s.sub}</div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <CatalogList rows={rows} />
    </div>
  );
}
