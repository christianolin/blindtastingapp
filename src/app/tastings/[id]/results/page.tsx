import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Crown, Medal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { makeWineLabeler } from "@/lib/wine-label";
import { cn } from "@/lib/utils";

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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <Link
        href={`/tastings/${tastingId}`}
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Back to tasting
      </Link>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        {tasting.name} — results
      </h1>

      <Card className="overflow-hidden py-0">
        <CardHeader className="border-b border-border/70 bg-gradient-to-br from-primary/8 to-transparent py-4">
          <CardTitle className="font-heading text-xl">Leaderboard</CardTitle>
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
                  <span className="flex-1 font-medium">{row.name}</span>
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
          <Card key={wine.id}>
            <CardHeader>
              <CardTitle className="text-lg">{wineLabel(wine)}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {answer.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={answer.image_url as string}
                  alt=""
                  className="max-h-64 rounded-lg object-cover"
                />
              ) : null}
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="mb-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  The wine
                </p>
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

              {wineGuesses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No one guessed this wine.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {wineGuesses.map((g) => {
                    return (
                      <div
                        key={g.id}
                        className="rounded-lg border border-border/70 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-medium">
                            {displayNameByParticipantId.get(g.participant_id) ??
                              "Unknown"}
                          </span>
                          <span className="font-heading text-base font-semibold tabular-nums">
                            {isSemiBlind
                              ? g.total_points
                                ? "✓ correct"
                                : "✗ wrong"
                              : `${g.total_points ?? 0} pts`}
                          </span>
                        </div>
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
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
