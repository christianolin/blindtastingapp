import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { fetchCatalogWine, catalogWineTitle } from "@/lib/wset/queries";
import { qualityBand } from "@/lib/wset/quality-curve.mjs";

export default async function CellarWinePage({
  params,
}: {
  params: Promise<{ wineId: string }>;
}) {
  const { wineId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const wine = await fetchCatalogWine(supabase, wineId);
  if (!wine) notFound();

  const { data: myNotes } = await supabase
    .from("wset_notes")
    .select("id, tasted_on, quality_score")
    .eq("catalog_wine_id", wineId)
    .eq("author_id", user.id)
    .order("tasted_on", { ascending: false });

  const title = catalogWineTitle(wine);
  const grapes = [wine.primaryGrapeName, wine.secondaryGrapeName].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-6">
      <Link href="/cellar" className="text-sm text-muted-foreground underline underline-offset-4">
        ← Cellar
      </Link>

      <div>
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          <Badge variant="secondary">{wine.colour[0] + wine.colour.slice(1).toLowerCase()}</Badge>
          <Badge variant="secondary">{wine.style[0] + wine.style.slice(1).toLowerCase()}</Badge>
        </div>
        <h1 className="font-heading text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {[wine.regionName, wine.countryName].filter(Boolean).join(", ")}
          {grapes ? ` — ${grapes}` : ""}
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between pt-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Community rating</p>
            {wine.avgScore != null ? (
              <p className="font-heading text-xl font-semibold">
                {wine.avgScore.toFixed(1)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {qualityBand(Math.round(wine.avgScore))} · {wine.noteCount}{" "}
                  {wine.noteCount === 1 ? "note" : "notes"}
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No ratings yet — be the first.</p>
            )}
          </div>
          <Link
            href={`/cellar/${wineId}/notes/new`}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            New tasting note
          </Link>
        </CardContent>
      </Card>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Your notes</p>
        {myNotes && myNotes.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {myNotes.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/cellar/${wineId}/notes/${n.id}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  <span>{n.tasted_on}</span>
                  <span className="font-medium">
                    {n.quality_score != null ? `${n.quality_score} pts` : "unscored"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            You haven&apos;t tasted this wine yet.
          </p>
        )}
      </div>

      {/* Reserved: a "what people find" descriptor summary across all notes
          (spec revisit item) will render here. */}
    </div>
  );
}
