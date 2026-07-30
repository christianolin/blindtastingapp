import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import {
  fetchCatalogWine,
  catalogWineTitle,
  fetchWineDescriptors,
  fetchWineGuessStats,
  fetchWineBlend,
  formatBlend,
} from "@/lib/wset/queries";
import { qualityBand } from "@/lib/wset/quality-curve.mjs";
import { WineImage } from "./wine-image";

const cap = (s: string) => s[0] + s.slice(1).toLowerCase();

export default async function CatalogWinePage({
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

  const [{ data: myNotes }, descriptors, guessStats, blend] = await Promise.all([
    supabase
      .from("wset_notes")
      .select("id, tasted_on, quality_score, context_kind")
      .eq("catalog_wine_id", wineId)
      .eq("author_id", user.id)
      .order("tasted_on", { ascending: false }),
    fetchWineDescriptors(supabase, wineId),
    fetchWineGuessStats(supabase, wineId),
    fetchWineBlend(supabase, wineId),
  ]);

  const title = catalogWineTitle(wine);
  const grapes = formatBlend(blend);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-6">
      <Link href="/catalog" className="text-sm text-muted-foreground underline underline-offset-4">
        ← Catalog
      </Link>

      <div>
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {wine.colour ? <Badge variant="secondary">{cap(wine.colour)}</Badge> : null}
          {wine.style ? <Badge variant="secondary">{cap(wine.style)}</Badge> : null}
        </div>
        <h1 className="font-heading text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {[wine.regionName, wine.countryName].filter(Boolean).join(", ")}
          {grapes ? ` — ${grapes}` : ""}
        </p>
        {wine.appellationPlaceKey && wine.appellationName ? (
          <Link
            href={`/knowledge/map?place=${encodeURIComponent(wine.appellationPlaceKey)}`}
            className="mt-1 inline-block text-sm text-primary underline underline-offset-4"
          >
            View {wine.appellationName} on the map →
          </Link>
        ) : null}
      </div>

      <WineImage wineId={wineId} initialUrl={wine.imageUrl} />

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
            href={`/catalog/${wineId}/notes/new`}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            New tasting note
          </Link>
        </CardContent>
      </Card>

      {descriptors.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">What people find</p>
          <div className="flex flex-wrap gap-1.5">
            {descriptors.map((d) => (
              <span
                key={d.term}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs"
              >
                {d.term}
                {d.mentions > 1 ? <span className="text-muted-foreground">{d.mentions}</span> : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {guessStats && guessStats.appearances > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Blind-tasting track record</p>
          <Card>
            <CardContent className="pt-6">
              <p className="mb-3 text-sm">
                Poured blind in{" "}
                <span className="font-medium">
                  {guessStats.appearances} {guessStats.appearances === 1 ? "tasting" : "tastings"}
                </span>
                {guessStats.guessCount > 0
                  ? ` · ${guessStats.guessCount} scored ${
                      guessStats.guessCount === 1 ? "guess" : "guesses"
                    }`
                  : ""}
                .
              </p>
              {guessStats.guessCount > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {guessStats.fields.map((f) => (
                    <li key={f.key} className="flex items-center gap-3 text-sm">
                      <span className="w-24 shrink-0 text-muted-foreground">{f.label}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${f.pct}%` }}
                        />
                      </span>
                      <span className="w-10 shrink-0 text-right font-medium">{f.pct}%</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No scored guesses yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Your notes</p>
        {myNotes && myNotes.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {myNotes.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/catalog/${wineId}/notes/${n.id}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    {n.tasted_on}
                    {n.context_kind === "BLIND" ? (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-primary uppercase">
                        blind
                      </span>
                    ) : null}
                  </span>
                  <span className="font-medium">
                    {n.quality_score != null ? `${n.quality_score} pts` : "unscored"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">You haven&apos;t tasted this wine yet.</p>
        )}
      </div>
    </div>
  );
}
