import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { GuessForm, type ExistingGuess } from "./guess-form";
import { RevealButton } from "./reveal-button";

const CATEGORY_LABELS: Record<string, string> = {
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  primary_grape: "Primary grape",
  secondary_grape: "Secondary grape",
  producer: "Producer",
  type_designation: "Type designation",
  vintage: "Vintage",
};

export default async function PlayPage({
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

  const isHost = tasting.host_id === user.id;

  const { data: myParticipant } = await supabase
    .from("tasting_participants")
    .select("id")
    .eq("tasting_id", tastingId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!myParticipant) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-8">
        <p>You&apos;re not a participant in this tasting.</p>
      </div>
    );
  }

  const [
    { data: wines },
    { data: countries },
    { data: regions },
    { data: appellations },
    { data: grapes },
    { data: producers },
    { data: typeDesignations },
  ] = await Promise.all([
    supabase
      .from("wines")
      .select("id, position, is_revealed, contributor_participant_id")
      .eq("tasting_id", tastingId)
      .order("position"),
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("regions").select("id, name, country_id").order("name"),
    supabase.from("appellations").select("id, name, region_id").order("name"),
    supabase.from("grapes").select("id, name").order("name"),
    supabase.from("producers").select("id, name").order("name"),
    supabase.from("type_designations").select("id, name").order("name"),
  ]);

  const nameById = new Map<string, string>();
  for (const list of [
    countries,
    regions,
    appellations,
    grapes,
    producers,
    typeDesignations,
  ]) {
    for (const row of list ?? []) nameById.set(row.id, row.name);
  }

  const wineIds = (wines ?? []).map((w) => w.id);
  const { data: myGuesses } = await supabase
    .from("guesses")
    .select("*")
    .eq("participant_id", myParticipant.id)
    .in("wine_id", wineIds.length > 0 ? wineIds : [""]);
  const myGuessByWineId = new Map((myGuesses ?? []).map((g) => [g.wine_id, g]));

  const revealedWineIds = (wines ?? [])
    .filter((w) => w.is_revealed)
    .map((w) => w.id);
  const { data: revealedAnswers } =
    revealedWineIds.length > 0
      ? await supabase
          .from("wine_answers")
          .select("*")
          .in("wine_id", revealedWineIds)
      : { data: [] };
  const answerByWineId = new Map((revealedAnswers ?? []).map((a) => [a.wine_id, a]));

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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <Link
          href={`/tastings/${tastingId}`}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Back to tasting
        </Link>
        <Link
          href={`/tastings/${tastingId}/results`}
          className="text-sm underline underline-offset-4"
        >
          View results →
        </Link>
      </div>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        {tasting.name}
      </h1>

      {(wines ?? []).length === 0 ? (
        <p className="text-muted-foreground">No wines added yet.</p>
      ) : null}

      {(wines ?? []).map((wine) => {
        const isMine = wine.contributor_participant_id === myParticipant.id;
        const answer = answerByWineId.get(wine.id);
        const guess = myGuessByWineId.get(wine.id);

        return (
          <Card key={wine.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Wine {wine.position}
                <div className="flex items-center gap-2">
                  <Badge variant={wine.is_revealed ? "default" : "outline"}>
                    {wine.is_revealed ? "Revealed" : "Hidden"}
                  </Badge>
                  {isHost && !wine.is_revealed ? (
                    <RevealButton tastingId={tastingId} wineId={wine.id} />
                  ) : null}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {wine.is_revealed && answer ? (
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="mb-1 text-sm font-medium">Answer</h3>
                    <p className="text-sm text-muted-foreground">
                      {nameById.get(answer.country_id)} ·{" "}
                      {nameById.get(answer.region_id)} ·{" "}
                      {nameById.get(answer.appellation_id)}
                      <br />
                      {nameById.get(answer.primary_grape_id)}
                      {answer.secondary_grape_id
                        ? ` / ${nameById.get(answer.secondary_grape_id)}`
                        : ""}
                      {" — "}
                      {nameById.get(answer.producer_id)}
                      {answer.type_designation_id
                        ? ` (${nameById.get(answer.type_designation_id)})`
                        : ""}
                      {" — "}
                      {vintageLabel(answer)}
                    </p>
                  </div>
                  {guess ? (
                    <div>
                      <h3 className="mb-1 text-sm font-medium">
                        Your guess — {guess.total_points ?? 0} points
                      </h3>
                      <table className="w-full text-sm">
                        <tbody>
                          {(
                            [
                              ["country", guess.country_points],
                              ["region", guess.region_points],
                              ["appellation", guess.appellation_points],
                              ["primary_grape", guess.primary_grape_points],
                              ["secondary_grape", guess.secondary_grape_points],
                              ["producer", guess.producer_points],
                              ["type_designation", guess.type_designation_points],
                              ["vintage", guess.vintage_points],
                            ] as const
                          ).map(([key, points]) => (
                            <tr key={key} className="border-b last:border-0">
                              <td className="py-1 text-muted-foreground">
                                {CATEGORY_LABELS[key]}
                              </td>
                              <td className="py-1 text-right">
                                {points === null ? "—" : points}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      You didn&apos;t submit a guess for this wine.
                    </p>
                  )}
                </div>
              ) : isMine ? (
                <p className="text-sm text-muted-foreground">
                  This is your wine — nothing to guess.
                </p>
              ) : (
                <GuessForm
                  tastingId={tastingId}
                  wineId={wine.id}
                  countries={countries ?? []}
                  regions={regions ?? []}
                  appellations={appellations ?? []}
                  grapes={grapes ?? []}
                  producers={producers ?? []}
                  typeDesignations={typeDesignations ?? []}
                  existingGuess={(guess as ExistingGuess | undefined) ?? null}
                />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
