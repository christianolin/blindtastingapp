import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { catalogWineTitle } from "@/lib/wset/queries";
import { CellarList, type CellarRow } from "./cellar-list";

type Rel = { name: string } | { name: string }[] | null;
type WineRow = {
  id: string;
  colour: "WHITE" | "ROSE" | "RED";
  style: "STILL" | "SPARKLING" | "FORTIFIED";
  cuvee: string | null;
  vintage_kind: "YEAR" | "NV" | "TAWNY";
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  producer: Rel;
  appellation: Rel;
};

function relName(rel: Rel): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}

export default async function CellarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: wines } = await supabase
    .from("catalog_wines")
    .select(
      "id, colour, style, cuvee, vintage_kind, vintage_year, vintage_tawny_years, " +
        "producer:producers(name), appellation:appellations(name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: ratings } = await supabase
    .from("catalog_wine_ratings")
    .select("catalog_wine_id, avg_score, note_count");
  const ratingMap = new Map((ratings ?? []).map((r) => [r.catalog_wine_id, r]));

  const rows: CellarRow[] = ((wines ?? []) as unknown as WineRow[]).map((w) => {
    const rating = ratingMap.get(w.id);
    return {
      id: w.id,
      title: catalogWineTitle({
        producerName: relName(w.producer),
        cuvee: w.cuvee,
        vintageKind: w.vintage_kind,
        vintageYear: w.vintage_year,
        vintageTawnyYears: w.vintage_tawny_years,
        appellationName: relName(w.appellation),
      }),
      colour: w.colour,
      style: w.style,
      avgScore: rating ? Number(rating.avg_score) : null,
      noteCount: rating?.note_count ?? 0,
    };
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Cellar</h1>
          <p className="text-sm text-muted-foreground">
            Taste &amp; review wines with the WSET Level 4 approach.
          </p>
        </div>
        <Link
          href="/cellar/new"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Add a wine
        </Link>
      </div>
      <CellarList rows={rows} />
    </div>
  );
}
