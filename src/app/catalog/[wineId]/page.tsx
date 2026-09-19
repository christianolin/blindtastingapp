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
import { PhotoStrip } from "./photo-strip";
import { fetchWinePhotos } from "@/lib/catalog-photos/queries";
import { stripPhotos } from "@/lib/catalog-photos/strip";
import { CountryFlag } from "@/components/country-flag";
import { Eyebrow } from "@/components/overview/eyebrow";
import { MapPin } from "lucide-react";
import { WineStructure } from "./wine-structure";
import { WineAdminControls } from "./wine-admin-controls";
import { CellarStrip } from "./cellar-strip";
import { YourNotes } from "./your-notes";
import { getOwnLotsForWine } from "@/lib/cellar/own-lots";
import { fmtAvg, plural } from "@/lib/cellar/format";
import { countWord } from "@/lib/count-words";

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

  // Blind-tasting privacy: a wine that exists only as an unrevealed tasting
  // answer is hidden from the catalog until it's revealed in the tasting.
  const { data: blindRow } = await supabase
    .from("catalog_wines")
    .select("blind_pending, created_by")
    .eq("id", wineId)
    .maybeSingle();
  if (blindRow?.blind_pending) notFound();

  const [
    { data: myNotes },
    descriptors,
    guessStats,
    blend,
    structure,
    { data: profile },
    { data: usageRows },
    ownLots,
    photoRows,
  ] = await Promise.all([
    supabase
      .from("wset_notes")
      .select("id, tasted_on, quality_score, context_kind")
      .eq("catalog_wine_id", wineId)
      .eq("author_id", user.id)
      .order("tasted_on", { ascending: false })
      .order("created_at", { ascending: false }),
    fetchWineDescriptors(supabase, wineId),
    fetchWineGuessStats(supabase, wineId),
    fetchWineBlend(supabase, wineId),
    fetchWineStructure(supabase, wineId),
    supabase.from("profiles").select("role, is_curator").eq("id", user.id).maybeSingle(),
    supabase.rpc("catalog_wine_usage", { p_id: wineId }),
    getOwnLotsForWine(supabase, user.id, wineId),
    fetchWinePhotos(supabase, wineId, user.id),
  ]);

  const title = catalogWineTitle(wine);
  const grapes = formatBlend(blend);

  // The identity facts grid (CC-C2, spec §6.2 item 1): grape blend, wine
  // style and alcohol, each only when the wine has it. The FastCork-era
  // serve-at and decant facts are retired (the columns stay, unread). No price
  // shown here or anywhere else on this page (D4).
  const facts: { label: string; node: React.ReactNode }[] = [];
  if (grapes) facts.push({ label: "Grape blend", node: grapes });
  if (wine.colour || wine.style) {
    facts.push({
      label: "Wine style",
      node: (
        <div className="flex flex-wrap gap-1.5">
          {wine.colour ? <Badge variant="secondary">{cap(wine.colour)}</Badge> : null}
          {wine.style ? <Badge variant="secondary">{cap(wine.style)}</Badge> : null}
        </div>
      ),
    });
  }
  if (wine.alcoholPercent != null) {
    facts.push({ label: "Alcohol", node: `${wine.alcoholPercent}%` });
  }

  const isManager =
    profile?.role === "ADMIN" || profile?.role === "CONTRIBUTOR";
  // Who may replace the main photo: mirrors the "catalog update" policy
  // (the creator, or a curator). Everyone else's upload joins the strip.
  const canSetMain = blindRow?.created_by === user.id || profile?.is_curator === true;
  const strip = stripPhotos(photoRows, wine.imageUrl);
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
            <WineImage wineId={wineId} initialUrl={wine.imageUrl} canSetMain={canSetMain} />
            <PhotoStrip
              wineTitle={title}
              photos={strip.photos}
              hasMain={!!wine.imageUrl}
              viewerId={user.id}
            />
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
                wine.appellationPlaceKey ? (
                  <Link
                    href={`/knowledge/map?place=${encodeURIComponent(wine.appellationPlaceKey)}`}
                  >
                    <Badge variant="secondary" className="gap-1">
                      <MapPin className="size-3" />
                      {wine.appellationName}
                    </Badge>
                  </Link>
                ) : (
                  <Badge variant="secondary">{wine.appellationName}</Badge>
                )
              ) : null}
            </div>
            {facts.length > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                {facts.map((f) => (
                  <div key={f.label}>
                    <Eyebrow>{f.label}</Eyebrow>
                    <div className="mt-0.5 text-sm">{f.node}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <Card className="lg:self-start">
          <CardContent className="flex flex-col gap-4 pt-6">
            {wine.avgScore != null ? (
              <div>
                <p className="font-heading text-4xl font-semibold tabular-nums">
                  {fmtAvg(wine.avgScore)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {qualityBand(Math.round(wine.avgScore))} · community rating
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No ratings yet — be the first.
              </p>
            )}
            <div className="grid grid-cols-3 gap-3 border-t border-border pt-4">
              <div>
                <p className="font-heading text-lg font-semibold tabular-nums">
                  {wine.noteCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="max-md:hidden">tasting notes</span>
                  <span className="md:hidden">notes</span>
                </p>
              </div>
              <div>
                <p className="font-heading text-lg font-semibold tabular-nums">
                  {guessStats?.appearances ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="max-md:hidden">blind tastings</span>
                  <span className="md:hidden">blind</span>
                </p>
              </div>
              <div>
                <p className="font-heading text-lg font-semibold tabular-nums">
                  {usage.holders}
                </p>
                <p className="text-xs text-muted-foreground">cellars</p>
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
              Write a tasting note
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

      {/* The gold cellar strip (CC-C2, spec §6.2 item 3): only when the
          viewer owns the wine — the join between the shared catalog record
          and the viewer's own bottles of it. */}
      {ownLots.length > 0 ? (
        <CellarStrip
          wineId={wineId}
          title={title}
          lots={ownLots}
          community={{ avg: wine.avgScore, count: wine.noteCount }}
        />
      ) : null}

      {/* The wine's one catalog text: the label reader's short factual
          description, or a curator's edit of it. Every wine shows the same
          shape — the FastCork-era profile sections are retired. */}
      {wine.description?.trim() ? (
        <div>
          <p className="mb-2 text-sm font-medium">About this wine</p>
          <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
            {wine.description}
          </p>
        </div>
      ) : null}

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
          <p className="mt-2 text-xs text-muted-foreground">
            Counted across the {plural(wine.noteCount, "note", "notes")}. The
            number is how many people said it.
          </p>
        </div>
      ) : null}

      <WineStructure rows={structure} />

      {guessStats && guessStats.appearances > 0 ? (
        <div>
          <p className="mb-2 text-sm font-medium">Poured blind</p>
          <Card>
            <CardContent className="pt-6">
              <p className="mb-3 text-sm">
                <span className="font-medium">
                  {countWord(guessStats.appearances, { capital: true })}{" "}
                  {guessStats.appearances === 1 ? "tasting" : "tastings"}
                </span>
                {guessStats.guessCount > 0
                  ? ` · ${guessStats.guessCount} scored ${
                      guessStats.guessCount === 1 ? "guess" : "guesses"
                    }`
                  : ""}
                . How often people got each attribute:
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
        <YourNotes
          wineId={wineId}
          notes={(myNotes ?? []).map((n) => ({
            id: n.id,
            tastedOn: n.tasted_on,
            score: n.quality_score,
            contextKind: n.context_kind,
          }))}
        />
      </div>
    </div>
  );
}
