import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";

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
      .select("id, position, is_revealed")
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
  const answerByWineId = new Map((answers ?? []).map((a) => [a.wine_id, a]));

  const lookedUpNames = await lookupAppellationAndProducerNames({
    appellationIds: (answers ?? []).map((a) => a.appellation_id),
    producerIds: (answers ?? []).map((a) => a.producer_id),
  });
  for (const [id, name] of lookedUpNames) nameById.set(id, name);

  const { data: guesses } =
    revealedWineIds.length > 0
      ? await supabase.from("guesses").select("*").in("wine_id", revealedWineIds)
      : { data: [] };

  const totalByParticipantId = new Map<string, number>();
  for (const g of guesses ?? []) {
    totalByParticipantId.set(
      g.participant_id,
      (totalByParticipantId.get(g.participant_id) ?? 0) + (g.total_points ?? 0),
    );
  }

  const leaderboard = (participants ?? [])
    .map((p) => ({
      participantId: p.id,
      name: displayNameByParticipantId.get(p.id) ?? "Unknown",
      total: totalByParticipantId.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.total - a.total);

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
      <Link
        href={`/tastings/${tastingId}`}
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Back to tasting
      </Link>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        {tasting.name} — results
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          {revealedWines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No wines revealed yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Participant</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((row) => (
                  <TableRow key={row.participantId}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right">{row.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {revealedWines.map((wine) => {
        const answer = answerByWineId.get(wine.id);
        const wineGuesses = (guesses ?? []).filter((g) => g.wine_id === wine.id);
        if (!answer) return null;
        return (
          <Card key={wine.id}>
            <CardHeader>
              <CardTitle>Wine {wine.position}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {answer.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={answer.image_url}
                  alt=""
                  className="max-h-64 rounded-lg object-cover"
                />
              ) : null}
              <p className="text-sm text-muted-foreground">
                {nameById.get(answer.country_id)} ·{" "}
                {nameById.get(answer.region_id)}
                {answer.appellation_id ? ` · ${nameById.get(answer.appellation_id)}` : ""}
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Participant</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wineGuesses.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell>
                        {displayNameByParticipantId.get(g.participant_id) ??
                          "Unknown"}
                      </TableCell>
                      <TableCell className="text-right">
                        {g.total_points ?? 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
