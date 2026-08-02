import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/server";
import {
  fetchCatalogWine,
  catalogWineTitle,
  fetchWineDescriptors,
  fetchWineGuessStats,
  fetchWineBlend,
  fetchWineStructure,
  formatBlend,
} from "@/lib/wset/queries";
import { qualityBand } from "@/lib/wset/quality-curve.mjs";
import { WineImage } from "./wine-image";
import { CountryFlag } from "@/components/country-flag";
import { MapPin } from "lucide-react";
import { WineStructure } from "./wine-structure";
import { WineAdminControls } from "./wine-admin-controls";

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

  const [
    { data: myNotes },
    descriptors,
    guessStats,
    blend,
    structure,
    { data: profile },
    { data: usageRows },
  ] = await Promise.all([
    supabase
      .from("wset_notes")
      .select("id, tasted_on, quality_score, context_kind")
      .eq("catalog_wine_id", wineId)
      .eq("author_id", user.id)
      .order("tasted_on", { ascending: false }),
    fetchWineDescriptors(supabase, wineId),
    fetchWineGuessStats(supabase, wineId),
    fetchWineBlend(supabase, wineId),
    fetchWineStructure(supabase, wineId),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.rpc("catalog_wine_usage", { p_id: wineId }),
  ]);

  const title = catalogWineTitle(wine);
  const grapes = formatBlend(blend);
  const isManager =
    profile?.role === "ADMIN" || profile?.role === "CONTRIBUTOR";
  const usage = usageRows?.[0] ?? {
    holders: 0,
    bottles: 0,
    lot_count: 0,
    note_count: 0,
    appearance_count: 0,
    consumption_count: 0,
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/catalog" className="hover:text-foreground">
          Catalog
        </Link>
        {[wine.countryName, wine.regionName, wine.appellationName]
          .filter(Boolean)
          .map((x) => (
            <span key={x} className="flex items-center gap-1.5">
              <span className="opacity-50">/</span>
              {x}
            </span>
          ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-5 sm:flex-row lg:col-span-2">
          <div className="w-full sm:w-48 sm:shrink-0">
            <WineImage wineId={wineId} initialUrl={wine.imageUrl} />
          </div>
          <div className="min-w-0">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              {title}
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {wine.countryName ? (
                <Badge variant="secondary" className="gap-1">
                  <CountryFlag name={wine.countryName} />
                  {wine.countryName}
                </Badge>
              ) : null}
              {wine.regionName ? (
                <Badge variant="secondary">{wine.regionName}</Badge>
              ) : null}
              {wine.appellationName ? (
                <Badge variant="secondary">{wine.appellationName}</Badge>
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Grape blend</p>
                <p className="mt-0.5 text-sm">{grapes || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Wine style</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {wine.colour ? (
                    <Badge variant="secondary">{cap(wine.colour)}</Badge>
                  ) : null}
                  {wine.style ? (
                    <Badge variant="secondary">{cap(wine.style)}</Badge>
                  ) : null}
                </div>
              </div>
            </div>
            {wine.appellationPlaceKey && wine.appellationName ? (
              <Link
                href={`/knowledge/map?place=${encodeURIComponent(wine.appellationPlaceKey)}`}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm text-primary transition-colors hover:bg-muted"
              >
                <MapPin className="size-3.5" />
                View {wine.appellationName} on the map
              </Link>
            ) : null}
          </div>
        </div>

        <Card className="lg:self-start">
          <CardContent className="flex flex-col gap-4 pt-6">
            {wine.avgScore != null ? (
              <div>
                <p className="font-heading text-4xl font-semibold tabular-nums">
                  {wine.avgScore.toFixed(1)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {qualityBand(Math.round(wine.avgScore))} · avg community score
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No ratings yet — be the first.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
              <div>
                <p className="font-heading text-lg font-semibold tabular-nums">
                  {wine.noteCount}
                </p>
                <p className="text-xs text-muted-foreground">Tasting notes</p>
              </div>
              <div>
                <p className="font-heading text-lg font-semibold tabular-nums">
                  {guessStats?.appearances ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Blind tastings</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {usage.holders > 0
                ? `In ${usage.holders} ${usage.holders === 1 ? "cellar" : "cellars"} · ${usage.bottles} ${usage.bottles === 1 ? "bottle" : "bottles"}`
                : "Not in anyone's cellar yet"}
            </p>
            <Link
              href={`/catalog/${wineId}/notes/new`}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              New tasting note
            </Link>
            {isManager ? (
              <div className="border-t border-border pt-4">
                <WineAdminControls
                  wineId={wineId}
                  userId={user.id}
                  usage={usage}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {wine.description ? (
        <div>
          <p className="mb-2 text-sm font-medium">About this wine</p>
          <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
            {wine.description}
          </p>
        </div>
      ) : null}

      {descriptors.length > 0 || structure.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2">
          {descriptors.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium">What people find</p>
              <div className="flex flex-wrap gap-1.5">
                {descriptors.map((d) => (
                  <span
                    key={d.term}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs"
                  >
                    {d.term}
                    {d.mentions > 1 ? (
                      <span className="text-muted-foreground">{d.mentions}</span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <WineStructure rows={structure} />
        </div>
      ) : null}

      {guessStats && guessStats.appearances > 0 ? (
        <div>
          <p className="mb-2 text-sm font-medium">Blind-tasting track record</p>
          <Card>
            <CardContent className="pt-6">
              <p className="mb-3 text-sm">
                Poured blind in{" "}
                <span className="font-medium">
                  {guessStats.appearances}{" "}
                  {guessStats.appearances === 1 ? "tasting" : "tastings"}
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
                      <span className="w-24 shrink-0 text-muted-foreground">
                        {f.label}
                      </span>
                      <Progress value={f.pct} className="flex-1" />
                      <span className="w-10 shrink-0 text-right font-medium">
                        {f.pct}%
                      </span>
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
        <p className="mb-2 text-sm font-medium">Your notes</p>
        {myNotes && myNotes.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {myNotes.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/catalog/${wineId}/notes/${n.id}`}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
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
          <p className="text-sm text-muted-foreground">
            You haven&apos;t tasted this wine yet.
          </p>
        )}
      </div>
    </div>
  );
}
