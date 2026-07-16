import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsiblePanel } from "@/components/collapsible-panel";
import { LinkLoadingHint } from "@/components/link-loading-hint";
import { createClient } from "@/lib/supabase/server";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { GuessForm, type ExistingGuess } from "./guess-form";
import { MatchGuessForm, type MatchGlass } from "./match-guess-form";
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
  const isSemiBlind = tasting.reveal_mode === "SEMI_BLIND";

  const { data: myParticipant } = await supabase
    .from("tasting_participants")
    .select("id, status")
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

  if (tasting.status === "DRAFT") {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-8">
        <p className="text-muted-foreground">
          This tasting hasn&apos;t started yet.
        </p>
        <Link
          href={`/tastings/${tastingId}`}
          className="text-sm underline underline-offset-4"
        >
          ← Back to tasting
        </Link>
      </div>
    );
  }

  if (myParticipant.status !== "JOINED") {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-8">
        <p className="text-muted-foreground">
          Accept your invitation before guessing.
        </p>
        <Link
          href={`/tastings/${tastingId}`}
          className="text-sm underline underline-offset-4"
        >
          ← Go to the tasting to respond
        </Link>
      </div>
    );
  }

  const [
    { data: wines },
    { data: countries },
    { data: regions },
    { data: grapes },
    { data: typeDesignations },
  ] = await Promise.all([
    supabase
      .from("wines")
      .select("id, position, is_revealed, contributor_participant_id")
      .eq("tasting_id", tastingId)
      .order("position"),
    supabase.from("countries").select("id, name").order("name"),
    supabase.from("regions").select("id, name, country_id").order("name"),
    supabase.from("grapes").select("id, name").order("name"),
    supabase.from("type_designations").select("id, name").order("name"),
  ]);

  const nameById = new Map<string, string>();
  for (const list of [countries, regions, grapes, typeDesignations]) {
    for (const row of list ?? []) nameById.set(row.id, row.name);
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

  function describeAnswer(answer: {
    country_id: string;
    region_id: string;
    appellation_id: string | null;
    primary_grape_id: string;
    secondary_grape_id: string | null;
    producer_id: string;
    type_designation_id: string | null;
    vintage_kind: string | null;
    vintage_year: number | null;
    vintage_tawny_years: number | null;
  }) {
    return (
      `${nameById.get(answer.country_id)} · ${nameById.get(answer.region_id)}` +
      `${answer.appellation_id ? ` · ${nameById.get(answer.appellation_id)}` : ""}` +
      ` — ${nameById.get(answer.primary_grape_id)}` +
      `${answer.secondary_grape_id ? ` / ${nameById.get(answer.secondary_grape_id)}` : ""}` +
      ` — ${nameById.get(answer.producer_id)}` +
      `${answer.type_designation_id ? ` (${nameById.get(answer.type_designation_id)})` : ""}` +
      ` — ${vintageLabel(answer)}`
    );
  }

  const wineIds = (wines ?? []).map((w) => w.id);
  const { data: myGuesses } = await supabase
    .from("guesses")
    .select("*")
    .eq("participant_id", myParticipant.id)
    .in("wine_id", wineIds.length > 0 ? wineIds : [""]);
  const myGuessByWineId = new Map((myGuesses ?? []).map((g) => [g.wine_id, g]));

  // Everyone can see WHO has guessed each wine (not the guesses themselves) so
  // the host knows when to reveal and everyone sees who's still thinking.
  const [{ data: participantRows }, { data: guessStatus }] = await Promise.all([
    supabase
      .from("tasting_participants")
      .select("id, user_id, status")
      .eq("tasting_id", tastingId),
    supabase.rpc("tasting_guess_status", { p_tasting_id: tastingId }),
  ]);
  const pUserIds = (participantRows ?? []).map((p) => p.user_id);
  const { data: pProfiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", pUserIds.length > 0 ? pUserIds : [""]);
  const profileByUserId = new Map((pProfiles ?? []).map((p) => [p.id, p]));
  const nameByParticipantId = new Map(
    (participantRows ?? []).map((p) => [
      p.id,
      profileByUserId.get(p.user_id)?.display_name ??
        profileByUserId.get(p.user_id)?.email ??
        "Someone",
    ]),
  );
  const guessersByWineId = new Map<string, Set<string>>();
  for (const row of guessStatus ?? []) {
    const set = guessersByWineId.get(row.wine_id) ?? new Set<string>();
    set.add(row.participant_id);
    guessersByWineId.set(row.wine_id, set);
  }
  const joinedParticipants = (participantRows ?? []).filter(
    (p) => p.status === "JOINED",
  );
  // Who's expected to guess a given wine: joined participants, minus its
  // contributor (you don't guess your own bottle) and minus the host when the
  // host provided the wines (they set the answers).
  const eligibleGuessers = (wine: {
    contributor_participant_id: string | null;
  }) =>
    joinedParticipants.filter(
      (p) =>
        p.id !== wine.contributor_participant_id &&
        !(tasting.wine_source === "HOST_PROVIDES" && p.user_id === tasting.host_id),
    );

  // In bring-your-own tastings a wine is known by its contributor, not a
  // number ("Gustav's wine" rather than "Wine 2").
  const wineTitle = (wine: {
    position: number;
    contributor_participant_id: string | null;
  }) =>
    tasting.wine_source === "PARTICIPANT_CONTRIBUTED" &&
    wine.contributor_participant_id
      ? `${nameByParticipantId.get(wine.contributor_participant_id) ?? "Someone"}'s wine`
      : `Wine ${wine.position}`;

  // A wine's answer is visible to me once it's globally revealed OR my own
  // guess for it has been scored (immediate-reveal async). The wine_answers
  // RLS grants both.
  const resolvedForMe = (wineId: string, isRevealed: boolean) =>
    isRevealed || Boolean(myGuessByWineId.get(wineId)?.scored_at);

  const answerWineIds = [
    ...new Set(
      (wines ?? [])
        .filter((w) => resolvedForMe(w.id, w.is_revealed))
        .map((w) => w.id),
    ),
  ];
  const { data: resolvedAnswers } =
    answerWineIds.length > 0
      ? await supabase.from("wine_answers").select("*").in("wine_id", answerWineIds)
      : { data: [] };
  const answerByWineId = new Map(
    (resolvedAnswers ?? []).map((a) => [a.wine_id, a]),
  );

  // In semi-blind mode every wine's answer key is visible up front, as the
  // pool of candidates participants match glasses against.
  const { data: allAnswers } = isSemiBlind
    ? await supabase
        .from("wine_answers")
        .select("*")
        .in("wine_id", wineIds.length > 0 ? wineIds : [""])
    : { data: [] };
  const candidateByWineId = new Map((allAnswers ?? []).map((a) => [a.wine_id, a]));
  // Semi-blind answers are all readable, so a resolved glass can show its own.
  for (const a of allAnswers ?? []) {
    if (!answerByWineId.has(a.wine_id)) answerByWineId.set(a.wine_id, a);
  }

  const answersNeedingNames = [...(resolvedAnswers ?? []), ...(allAnswers ?? [])];
  const guessesNeedingNames = myGuesses ?? [];
  const lookedUpNames = await lookupAppellationAndProducerNames({
    appellationIds: [
      ...answersNeedingNames.map((a) => a.appellation_id),
      ...guessesNeedingNames.map((g) => g.appellation_id),
    ],
    producerIds: [
      ...answersNeedingNames.map((a) => a.producer_id),
      ...guessesNeedingNames.map((g) => g.producer_id),
    ],
  });
  for (const [id, name] of lookedUpNames) nameById.set(id, name);

  const candidates = (allAnswers ?? [])
    .map((a) => ({ id: a.wine_id, name: describeAnswer(a) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <Link
          href={`/tastings/${tastingId}`}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Back to tasting
        </Link>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`/tastings/${tastingId}/results`} />}
          className="gap-1.5"
        >
          <Trophy className="size-4 text-gold-deep" />
          Results
          <LinkLoadingHint />
        </Button>
      </div>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        {tasting.name}
      </h1>

      {isSemiBlind && candidates.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>The wines in this tasting</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              {`These are the ${candidates.length} wines being poured — you just don't know which glass is which. Match each glass below.`}
            </p>
            <ul className="flex flex-col gap-1.5 text-sm">
              {candidates.map((c) => (
                <li key={c.id}>{c.name}</li>
              ))}
            </ul>

            {/* Who's submitted their matches (semi-blind is one batch, so
                readiness is per-person, not per-glass). */}
            {(() => {
              const eligible = joinedParticipants.filter(
                (p) =>
                  !(
                    tasting.wine_source === "HOST_PROVIDES" &&
                    p.user_id === tasting.host_id
                  ),
              );
              if (eligible.length === 0) return null;
              const submitted = new Set<string>();
              for (const set of guessersByWineId.values())
                for (const pid of set) submitted.add(pid);
              const readyCount = eligible.filter((p) =>
                submitted.has(p.id),
              ).length;
              return (
                <div className="mt-4 border-t pt-3">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    {readyCount}/{eligible.length} submitted their matches
                  </p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {eligible.map((p) => {
                      const ready = submitted.has(p.id);
                      return (
                        <span
                          key={p.id}
                          className={ready ? "text-[#3f5b42]" : ""}
                        >
                          {ready ? "✓" : "○"} {nameByParticipantId.get(p.id)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      ) : null}

      {(wines ?? []).length === 0 ? (
        <p className="text-muted-foreground">No wines added yet.</p>
      ) : null}

      {(wines ?? []).map((wine) => {
        const isMine = wine.contributor_participant_id === myParticipant.id;
        const answer = answerByWineId.get(wine.id);
        const guess = myGuessByWineId.get(wine.id);
        const guessedCandidate = guess?.guessed_wine_id
          ? candidateByWineId.get(guess.guessed_wine_id)
          : null;
        const resolved = resolvedForMe(wine.id, wine.is_revealed);
        const hasGuessed = isSemiBlind
          ? Boolean(guess?.guessed_wine_id)
          : Boolean(guess);

        // Semi-blind matching is one combined form below, not per-wine — a
        // glass only gets its own card once it's resolved for me (revealed or
        // my match scored); otherwise it lives in the batch form.
        if (!resolved && !isMine && isSemiBlind) return null;

        const statusBadge = wine.is_revealed
          ? { label: "Revealed", variant: "default" as const }
          : resolved
            ? { label: "Your result", variant: "default" as const }
            : isMine
              ? { label: "Your wine", variant: "outline" as const }
              : hasGuessed
                ? { label: "Guessed", variant: "secondary" as const }
                : { label: "Not guessed", variant: "outline" as const };

        return (
          <Card key={wine.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{wineTitle(wine)}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                  {isHost && !wine.is_revealed ? (
                    <RevealButton tastingId={tastingId} wineId={wine.id} />
                  ) : null}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {resolved && answer ? (
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="mb-1 text-sm font-medium">Answer</h3>
                    {answer.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={answer.image_url}
                        alt=""
                        className="mb-2 max-h-64 rounded-lg object-cover"
                      />
                    ) : null}
                    <p className="text-sm text-muted-foreground">
                      {describeAnswer(answer)}
                    </p>
                  </div>
                  {guess ? (
                    isSemiBlind ? (
                      <div>
                        <h3 className="mb-1 text-sm font-medium">
                          {guess.total_points
                            ? "✓ Correct match"
                            : "✗ Wrong match"}
                        </h3>
                        {guessedCandidate ? (
                          <p className="text-sm text-muted-foreground">
                            You guessed: {describeAnswer(guessedCandidate)}
                          </p>
                        ) : null}
                      </div>
                    ) : (
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
                    )
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
              ) : isSemiBlind ? null : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted-foreground">
                    {hasGuessed
                      ? "You've guessed this wine. You can still edit until it's revealed."
                      : "You haven't guessed this wine yet."}
                  </p>
                  <CollapsiblePanel
                    label={hasGuessed ? "Edit your guess" : "Guess this wine"}
                    variant={hasGuessed ? "outline" : "default"}
                  >
                    <GuessForm
                      tastingId={tastingId}
                      wineId={wine.id}
                      countries={countries ?? []}
                      regions={regions ?? []}
                      grapes={grapes ?? []}
                      typeDesignations={typeDesignations ?? []}
                      existingGuess={(guess as ExistingGuess | undefined) ?? null}
                      initialAppellationLabel={
                        guess?.appellation_id
                          ? (nameById.get(guess.appellation_id) ?? null)
                          : null
                      }
                      initialProducerLabel={
                        guess?.producer_id
                          ? (nameById.get(guess.producer_id) ?? null)
                          : null
                      }
                    />
                  </CollapsiblePanel>
                </div>
              )}

              {/* Readiness: who's guessed this wine (visible to everyone, so
                  the host knows when to reveal). Only while still hidden. */}
              {!wine.is_revealed
                ? (() => {
                    const eligible = eligibleGuessers(wine);
                    if (eligible.length === 0) return null;
                    const guessers = guessersByWineId.get(wine.id) ?? new Set();
                    const readyCount = eligible.filter((p) =>
                      guessers.has(p.id),
                    ).length;
                    return (
                      <div className="mt-4 border-t pt-3">
                        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                          {readyCount}/{eligible.length} ready to reveal
                        </p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {eligible.map((p) => {
                            const ready = guessers.has(p.id);
                            return (
                              <span
                                key={p.id}
                                className={ready ? "text-[#3f5b42]" : ""}
                              >
                                {ready ? "✓" : "○"}{" "}
                                {nameByParticipantId.get(p.id)}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()
                : null}
            </CardContent>
          </Card>
        );
      })}

      {isSemiBlind
        ? (() => {
            const glasses: MatchGlass[] = (wines ?? [])
              .filter(
                (w) =>
                  !resolvedForMe(w.id, w.is_revealed) &&
                  w.contributor_participant_id !== myParticipant.id,
              )
              .map((w) => ({
                wineId: w.id,
                position: w.position,
                existingGuessedWineId:
                  myGuessByWineId.get(w.id)?.guessed_wine_id ?? null,
              }));
            return glasses.length > 0 ? (
              <MatchGuessForm
                tastingId={tastingId}
                glasses={glasses}
                candidates={candidates}
              />
            ) : null;
          })()
        : null}
    </div>
  );
}
