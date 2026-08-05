import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronDown, Crown, Medal, Wine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { makeWineLabeler } from "@/lib/wine-label";
import { cn } from "@/lib/utils";
import { CountryFlag } from "@/components/country-flag";
import { Badge } from "@/components/ui/badge";
import { LocalDateTime } from "@/components/local-date-time";

const CATEGORY_MAX: Record<string, number> = {
  country: 2,
  region: 3,
  appellation: 5,
  primary_grape: 8,
  secondary_grape: 2,
  producer: 6,
  type_designation: 2,
  vintage: 2,
};

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tastingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: tasting } = await supabase
    .from("tastings")
    .select("*")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) {
    notFound();
  }
  const isSemiBlind = tasting.reveal_mode === "SEMI_BLIND";

  const [
    { data: participants },
    { data: wines },
    { data: countries },
    { data: regions },
    { data: grapes },
    { data: typeDesignations },
  ] = await Promise.all([
    supabase
      .from("tasting_participants")
      .select("id, user_id")
      .eq("tasting_id", tastingId),
    supabase
      .from("wines")
      .select("id, position, is_revealed, contributor_participant_id")
      .eq("tasting_id", tastingId)
      .order("position"),
    supabase.from("countries").select("id, name"),
    supabase.from("regions").select("id, name"),
    supabase.from("grapes").select("id, name"),
    supabase.from("type_designations").select("id, name"),
  ]);

  const nameById = new Map<string, string>();
  for (const list of [countries, regions, grapes, typeDesignations]) {
    for (const row of list ?? []) nameById.set(row.id, row.name);
  }

  const userIds = (participants ?? []).map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const displayNameByUserId = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name]),
  );
  const displayNameByParticipantId = new Map(
    (participants ?? []).map((p) => [
      p.id,
      displayNameByUserId.get(p.user_id) ?? "Unknown",
    ]),
  );

  const revealedWines = (wines ?? []).filter((w) => w.is_revealed);
  const revealedWineIds = revealedWines.map((w) => w.id);

  const { data: answers } =
    revealedWineIds.length > 0
      ? await supabase.from("wine_answers").select("*").in("wine_id", revealedWineIds)
      : { data: [] };
  const { data: guesses } =
    revealedWineIds.length > 0
      ? await supabase.from("guesses").select("*").in("wine_id", revealedWineIds)
      : { data: [] };
  const answerByWineId = new Map((answers ?? []).map((a) => [a.wine_id, a]));

  // A wine picked from the catalog carries no photo on its own answer row, so
  // fall back to the linked catalog entry's label photo.
  const catalogIdsNeedingImage = [
    ...new Set(
      (answers ?? [])
        .filter((a) => !a.image_url && a.catalog_wine_id)
        .map((a) => a.catalog_wine_id as string),
    ),
  ];
  const { data: catalogImages } =
    catalogIdsNeedingImage.length > 0
      ? await supabase
          .from("catalog_wines")
          .select("id, image_url")
          .in("id", catalogIdsNeedingImage)
      : { data: [] };
  const catalogImageById = new Map(
    (catalogImages ?? []).map((c) => [c.id, c.image_url]),
  );

  // Names for appellations/producers referenced by either the answers or any
  // participant's guess (so we can show what each person guessed, not just an
  // id).
  const lookedUpNames = await lookupAppellationAndProducerNames({
    appellationIds: [
      ...(answers ?? []).map((a) => a.appellation_id as string | null),
      ...(guesses ?? []).map((g) => g.appellation_id as string | null),
    ],
    producerIds: [
      ...(answers ?? []).map((a) => a.producer_id as string | null),
      ...(guesses ?? []).map((g) => g.producer_id as string | null),
    ],
  });
  for (const [id, name] of lookedUpNames) nameById.set(id, name);

  const nameByParticipantId = new Map(
    (participants ?? []).map((p) => [
      p.id,
      displayNameByUserId.get(p.user_id) ?? "Unknown",
    ]),
  );
  const wineLabel = makeWineLabeler(
    (wines ?? []) as {
      id: string;
      position: number;
      contributor_participant_id: string | null;
    }[],
    tasting.wine_source,
    nameByParticipantId,
  );

  const totalByParticipantId = new Map<string, number>();
  for (const g of guesses ?? []) {
    totalByParticipantId.set(
      g.participant_id as string,
      (totalByParticipantId.get(g.participant_id as string) ?? 0) +
        ((g.total_points as number | null) ?? 0),
    );
  }

  const leaderboard = (participants ?? [])
    .map((p) => ({
      participantId: p.id,
      name: displayNameByParticipantId.get(p.id) ?? "Unknown",
      total: totalByParticipantId.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.total - a.total);

  function name(id: string | null) {
    return id ? (nameById.get(id) ?? "—") : "—";
  }
  function vintageLabel(row: {
    vintage_kind: string | null;
    vintage_year: number | null;
    vintage_tawny_years: number | null;
  }) {
    if (row.vintage_kind === "YEAR") return String(row.vintage_year ?? "—");
    if (row.vintage_kind === "NV") return "NV";
    if (row.vintage_kind === "TAWNY")
      return `${row.vintage_tawny_years ?? "?"} years tawny`;
    return "—";
  }

  // Per-guess category breakdown: [{label, guessed, points, max}]. Skips
  // not-applicable categories (points null — no secondary grape / type /
  // appellation on the wine, or a semi-blind guess with no category scoring).
  type Guess = NonNullable<typeof guesses>[number];
  function breakdown(g: Guess) {
    const rows: {
      key: string;
      label: string;
      guessed: string;
      points: number;
      max: number;
    }[] = [];
    const push = (
      key: string,
      label: string,
      guessed: string,
      points: number | null,
    ) => {
      if (points === null) return;
      rows.push({ key, label, guessed, points, max: CATEGORY_MAX[key] });
    };
    push("country", "Country", name(g.country_id), g.country_points);
    push("region", "Region", name(g.region_id), g.region_points);
    push("appellation", "Appellation", name(g.appellation_id), g.appellation_points);
    push("primary_grape", "Grape", name(g.primary_grape_id), g.primary_grape_points);
    push(
      "secondary_grape",
      "2nd grape",
      name(g.secondary_grape_id),
      g.secondary_grape_points,
    );
    push("producer", "Producer", name(g.producer_id), g.producer_points);
    push(
      "type_designation",
      "Type",
      name(g.type_designation_id),
      g.type_designation_points,
    );
    push("vintage", "Vintage", vintageLabel(g), g.vintage_points);
    return rows;
  }

  const wineCount = (wines ?? []).length;
  const participantCount = (participants ?? []).length;
  const maxTotal = leaderboard[0]?.total ?? 0;
  const progressPct = Math.round(
    (revealedWines.length / Math.max(1, wineCount)) * 100,
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6 sm:p-8">
      {tasting.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tasting.image_url}
          alt=""
          className="aspect-[3/1] w-full rounded-xl object-cover"
        />
      ) : null}

      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {tasting.name}
        </h1>
        {tasting.description ? (
          <p className="mt-1.5 text-muted-foreground">{tasting.description}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Badge>Completed</Badge>
          <span className="text-muted-foreground">
            {wineCount} {wineCount === 1 ? "wine" : "wines"} · {participantCount}{" "}
            {participantCount === 1 ? "participant" : "participants"}
            {tasting.scheduled_at ? (
              <>
                {" · "}
                <LocalDateTime iso={tasting.scheduled_at} />
              </>
            ) : null}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {tasting.timing_mode === "LIVE" ? "Live session" : "Self-paced"} ·{" "}
          {tasting.wine_source === "HOST_PROVIDES"
            ? "Host-selected wines"
            : "Everyone brings wines"}{" "}
          ·{" "}
          <Link
            href="/rules"
            className="text-primary transition-colors hover:text-primary/80"
          >
            {tasting.reveal_mode === "SEMI_BLIND"
              ? "Semi-blind scoring"
              : "Danish Championship scoring"}
          </Link>
        </p>
      </div>

      {revealedWines.length > 0 ? (
        <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-transparent px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-heading text-sm font-semibold">Completed</span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {progressPct}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(wines ?? []).map((w, i) => (
              <a
                key={w.id}
                href={`#wine-${w.id}`}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  w.is_revealed
                    ? "border-primary/30 bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    w.is_revealed ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                />
                Wine {i + 1}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border/70 bg-gradient-to-br from-primary/8 to-transparent py-4">
          <CardTitle className="font-heading text-xl">Standings</CardTitle>
          <Badge variant="secondary">Final</Badge>
        </CardHeader>
        <CardContent className="p-3">
          {revealedWines.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              No wines revealed yet.
            </p>
          ) : (
            <ol className="flex flex-col gap-1">
              {leaderboard.map((row, i) => (
                <li
                  key={row.participantId}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2",
                    i === 0 && "bg-gold/10",
                  )}
                >
                  <span className="flex w-6 justify-center">
                    {i === 0 ? (
                      <Crown className="size-4 text-gold-deep" />
                    ) : i < 3 ? (
                      <Medal className="size-4 text-muted-foreground" />
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {i + 1}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.name}</span>
                    {!isSemiBlind ? (
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-gold-deep"
                          style={{
                            width: `${maxTotal > 0 ? (row.total / maxTotal) * 100 : 0}%`,
                          }}
                        />
                      </span>
                    ) : null}
                  </span>
                  <span className="font-heading text-lg font-semibold tabular-nums">
                    {isSemiBlind
                      ? `${row.total}/${revealedWines.length}`
                      : row.total}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {revealedWines.map((wine) => {
        const answer = answerByWineId.get(wine.id);
        const wineGuesses = (guesses ?? [])
          .filter((g) => g.wine_id === wine.id)
          .sort(
            (a, b) => (b.total_points ?? 0) - (a.total_points ?? 0),
          );
        if (!answer) return null;
        return (
          <Card key={wine.id} id={`wine-${wine.id}`} className="scroll-mt-6">
            <CardHeader>
              <CardTitle className="text-lg">{wineLabel(wine)} results</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                {/* Label photo as a left thumbnail (blank bottle when there is
                    none), matching the cellar and catalog rows. */}
                {(answer.image_url as string | null) ??
                (answer.catalog_wine_id
                  ? catalogImageById.get(answer.catalog_wine_id as string)
                  : null) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={
                      (answer.image_url as string | null) ??
                      (catalogImageById.get(
                        answer.catalog_wine_id as string,
                      ) as string)
                    }
                    alt=""
                    className="size-16 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : (
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                    <Wine className="size-6" />
                  </span>
                )}
                <div className="min-w-0 flex-1 rounded-lg bg-muted/50 p-3 text-sm">
                <p className="mb-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  The wine
                </p>
                {answer.country_id ? <CountryFlag name={name(answer.country_id as string)} className="mr-1" /> : null}
                {name(answer.country_id as string)} ·{" "}
                {name(answer.region_id as string)}
                {answer.appellation_id
                  ? ` · ${name(answer.appellation_id as string)}`
                  : ""}
                <br />
                {name(answer.primary_grape_id as string)}
                {answer.secondary_grape_id
                  ? ` / ${name(answer.secondary_grape_id as string)}`
                  : ""}
                {" — "}
                {name(answer.producer_id as string)}
                {answer.type_designation_id
                  ? ` (${name(answer.type_designation_id as string)})`
                  : ""}
                {" — "}
                {vintageLabel(
                  answer as unknown as {
                    vintage_kind: string | null;
                    vintage_year: number | null;
                    vintage_tawny_years: number | null;
                  },
                )}
                </div>
              </div>

              {answer.catalog_wine_id ? (
                <Link
                  href={`/catalog/${answer.catalog_wine_id}/notes/new?blindWine=${wine.id}`}
                  className="self-start text-sm font-medium text-primary transition-colors hover:text-primary/80"
                >
                  Write a tasting note for this wine →
                </Link>
              ) : null}

              {wineGuesses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No one guessed this wine.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {wineGuesses.map((g) => {
                    return (
                      // Native disclosure per player: the summary row (name +
                      // score) always shows; tapping it expands the category
                      // breakdown. Collapsed by default so a wine reads as a
                      // compact list of final scores.
                      <details
                        key={g.id}
                        className="group rounded-lg border border-border/70"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 [&::-webkit-details-marker]:hidden">
                          <span className="font-medium">
                            {displayNameByParticipantId.get(g.participant_id) ??
                              "Unknown"}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="font-heading text-base font-semibold tabular-nums">
                              {isSemiBlind
                                ? g.total_points
                                  ? "✓ correct"
                                  : "✗ wrong"
                                : `${g.total_points ?? 0} pts`}
                            </span>
                            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                          </span>
                        </summary>
                        <div className="px-3 pb-3">
                        {isSemiBlind ? (
                          <p className="text-sm text-muted-foreground">
                            {g.guessed_wine_id
                              ? `Guessed: ${
                                  answerByWineId.get(g.guessed_wine_id)
                                    ? [
                                        name(
                                          answerByWineId.get(g.guessed_wine_id)!
                                            .country_id as string,
                                        ),
                                        name(
                                          answerByWineId.get(g.guessed_wine_id)!
                                            .producer_id as string,
                                        ),
                                      ].join(" · ")
                                    : "another wine"
                                }`
                              : "No match submitted"}
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {breakdown(g).map((c) => (
                              <span
                                key={c.key}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                                  c.points > 0
                                    ? "bg-[#3f5b42]/12 text-[#3f5b42]"
                                    : "bg-destructive/10 text-destructive",
                                )}
                                title={c.label}
                              >
                                {c.guessed}
                                <span className="font-semibold tabular-nums">
                                  {c.points > 0 ? `+${c.points}` : "✗"}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <div className="pt-2 text-center">
        <Link
          href={`/tastings/${tastingId}`}
          className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          ← Back to tasting overview
        </Link>
      </div>
    </div>
  );
}
