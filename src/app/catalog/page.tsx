import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { catalogWineTitle } from "@/lib/wset/queries";
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_curator")
    .eq("id", user.id)
    .maybeSingle();

  const [{ data: wines }, { data: ratings }, { count: totalWines }] = await Promise.all([
    supabase
      .from("catalog_wines")
      .select(
        "id, colour, style, wine_name, image_url, vintage_kind, vintage_year, vintage_tawny_years, " +
          "producer:producers(name), country:countries(name), region:regions(name), appellation:appellations(name)",
      )
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("catalog_wine_ratings").select("catalog_wine_id, avg_score, note_count"),
    supabase
      .from("catalog_wines")
      .select("id", { count: "exact", head: true })
      .is("merged_into", null),
  ]);

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

  const rows: CatalogRow[] = ((wines ?? []) as unknown as WineRow[]).map((w) => {
    const rating = ratingMap.get(w.id);
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
      imageUrl: w.image_url,
      avgScore: rating ? Number(rating.avg_score) : null,
      noteCount: rating?.note_count ?? 0,
    };
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Catalog</h1>
          <p className="text-sm text-muted-foreground">
            Taste &amp; review wines with the WSET Level 4 approach.
          </p>
          {profile?.is_curator ? (
            <Link
              href="/catalog/unidentified"
              className="text-xs text-muted-foreground underline underline-offset-4"
            >
              Unidentified bottles queue
            </Link>
          ) : null}
        </div>
        <Link
          href="/catalog/new"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Add a wine
        </Link>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm">
        <span>
          <span className="font-heading text-base font-semibold">{totalWines ?? 0}</span>{" "}
          <span className="text-muted-foreground">wines</span>
        </span>
        <span>
          <span className="font-heading text-base font-semibold">{totalNotes}</span>{" "}
          <span className="text-muted-foreground">tasting notes</span>
        </span>
        {avgScore != null ? (
          <span>
            <span className="font-heading text-base font-semibold">{avgScore}</span>{" "}
            <span className="text-muted-foreground">avg community score</span>
          </span>
        ) : null}
      </div>

      <CatalogList rows={rows} />
    </div>
  );
}
