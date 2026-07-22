import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsiblePanel } from "@/components/collapsible-panel";
import { createClient } from "@/lib/supabase/server";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { makeWineLabeler } from "@/lib/wine-label";
import { AutoRefresh } from "@/components/auto-refresh";
import { cn } from "@/lib/utils";
import { GuessForm, type ExistingGuess } from "./guess-form";
import { MatchGuessForm, type MatchGlass } from "./match-guess-form";
import { RevealButton } from "./reveal-button";

/**
 * The whole guess-and-reveal-and-results experience for a tasting, as an
 * embeddable server component. Rendered inline on the tasting main page (so
 * everything lives on one page) and also by the standalone /play route. Shows,
 * per wine: a status badge + (host) reveal button, your guess form while it's
 * open, the readiness footer (who's guessed), and once revealed the answer
 * plus EVERY participant's per-category breakdown.
 *
 * Assumes the caller only renders it for a JOINED participant of a started
 * tasting; it still guards, rendering a short inline message otherwise.
 */
export async function PlayExperience({ tastingId }: { tastingId: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: tasting } = await supabase
    .from("tastings")
    .select("*")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) return null;

  const isHost = tasting.host_id === user.id;
  const isSemiBlind = tasting.reveal_mode === "SEMI_BLIND";
  // The host who provided all the wines set the answers — they host, they
  // don't guess. (In bring-your-own the host guesses everyone else's bottles.)
  const hostProvidesHost = tasting.wine_source === "HOST_PROVIDES" && isHost;

  const { data: myParticipant } = await supabase
    .from("tasting_participants")
    .select("id, status")
    .eq("tasting_id", tastingId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!myParticipant || myParticipant.status !== "JOINED") return null;
  const finished = tasting.status === "CLOSED";
  if (tasting.status === "DRAFT") return null;

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
    supabase
      .from("type_designations")
      .select("id, name, category, country_id")
      .eq("is_active", true)
      .order("sort_order"),
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
    producer_id: string | null;
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
      ` — ${answer.producer_id ? (nameById.get(answer.producer_id) ?? "—") : "Producer unknown"}` +
      `${answer.type_designation_id ? ` (${nameById.get(answer.type_designation_id)})` : ""}` +
      ` — ${vintageLabel(answer)}`
    );
  }
  const name = (id: string | null) => (id ? (nameById.get(id) ?? "—") : "—");

  const wineIds = (wines ?? []).map((w) => w.id);
  const { data: myGuesses } = await supabase
    .from("guesses")
    .select("*")
    .eq("participant_id", myParticipant.id)
    .in("wine_id", wineIds.length > 0 ? wineIds : [""]);
  const myGuessByWineId = new Map((myGuesses ?? []).map((g) => [g.wine_id, g]));

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
  const eligibleGuessers = (wine: { contributor_participant_id: string | null }) =>
    joinedParticipants.filter(
      (p) =>
        p.id !== wine.contributor_participant_id &&
        !(
          tasting.wine_source === "HOST_PROVIDES" &&
          p.user_id === tasting.host_id
        ),
    );

  const wineTitle = makeWineLabeler(
    wines ?? [],
    tasting.wine_source,
    nameByParticipantId,
  );

  const resolvedForMe = (wineId: string, isRevealed: boolean) =>
    isRevealed || Boolean(myGuessByWineId.get(wineId)?.scored_at);

  const sequential = tasting.sequential_guessing && !isSemiBlind;
  const currentWineId = sequential
    ? ((wines ?? []).find((w) => !w.is_revealed)?.id ?? null)
    : null;

  const revealedWineIds = (wines ?? [])
    .filter((w) => w.is_revealed)
    .map((w) => w.id);

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

  const { data: allAnswers } = isSemiBlind
    ? await supabase
        .from("wine_answers")
        .select("*")
        .in("wine_id", wineIds.length > 0 ? wineIds : [""])
    : { data: [] };
  const candidateByWineId = new Map((allAnswers ?? []).map((a) => [a.wine_id, a]));
  for (const a of allAnswers ?? []) {
    if (!answerByWineId.has(a.wine_id)) answerByWineId.set(a.wine_id, a);
  }

  // Everyone's guesses on revealed wines (RLS opens them once revealed) — for
  // the per-participant breakdown shown after reveal.
  const { data: allRevealedGuesses } = await supabase
    .from("guesses")
    .select("*")
    .in("wine_id", revealedWineIds.length > 0 ? revealedWineIds : [""]);
  type Guess = NonNullable<typeof allRevealedGuesses>[number];
  const revealedGuessesByWineId = new Map<string, Guess[]>();
  for (const g of allRevealedGuesses ?? []) {
    const arr = revealedGuessesByWineId.get(g.wine_id) ?? [];
    arr.push(g);
    revealedGuessesByWineId.set(g.wine_id, arr);
  }

  const lookedUpNames = await lookupAppellationAndProducerNames({
    appellationIds: [
      ...(resolvedAnswers ?? []).map((a) => a.appellation_id),
      ...(allAnswers ?? []).map((a) => a.appellation_id),
      ...(allRevealedGuesses ?? []).map((g) => g.appellation_id),
      ...(myGuesses ?? []).map((g) => g.appellation_id),
    ],
    producerIds: [
      ...(resolvedAnswers ?? []).map((a) => a.producer_id),
      ...(allAnswers ?? []).map((a) => a.producer_id),
      ...(allRevealedGuesses ?? []).map((g) => g.producer_id),
      ...(myGuesses ?? []).map((g) => g.producer_id),
    ],
  });
  for (const [id, n] of lookedUpNames) nameById.set(id, n);

  const candidates = (allAnswers ?? [])
    .map((a) => ({ id: a.wine_id, name: describeAnswer(a) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const breakdown = (g: Guess) => {
    const rows: { key: string; guessed: string; points: number }[] = [];
    const push = (key: string, guessed: string, points: number | null) => {
      if (points === null) return;
      rows.push({ key, guessed, points });
    };
    push("country", name(g.country_id), g.country_points);
    push("region", name(g.region_id), g.region_points);
    push("appellation", name(g.appellation_id), g.appellation_points);
    push("primary_grape", name(g.primary_grape_id), g.primary_grape_points);
    push("secondary_grape", name(g.secondary_grape_id), g.secondary_grape_points);
    push("producer", name(g.producer_id), g.producer_points);
    push("type_designation", name(g.type_designation_id), g.type_designation_points);
    push("vintage", vintageLabel(g), g.vintage_points);
    return rows;
  };

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh />

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
                        <span key={p.id} className={ready ? "text-[#3f5b42]" : ""}>
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

        if (!resolved && !isMine && isSemiBlind) return null;

        const statusBadge = wine.is_revealed
          ? { label: "Revealed", variant: "default" as const }
          : resolved
            ? { label: "Your result", variant: "default" as const }
            : isMine
              ? { label: "Your wine", variant: "outline" as const }
              : hostProvidesHost
                ? { label: "Hidden", variant: "outline" as const }
                : hasGuessed
                  ? { label: "Guessed", variant: "secondary" as const }
                  : { label: "Not guessed", variant: "outline" as const };

        const everyone = wine.is_revealed
          ? (revealedGuessesByWineId.get(wine.id) ?? [])
              .slice()
              .sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0))
          : [];

        return (
          <Card key={wine.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{wineTitle(wine)}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                  {isHost && !wine.is_revealed && !finished ? (
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

                  {/* Once globally revealed, show everyone's result; otherwise
                      (immediate async) just mine. */}
                  {wine.is_revealed ? (
                    everyone.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No one guessed this wine.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {everyone.map((g) => (
                          <div
                            key={g.id}
                            className="rounded-lg border border-border/70 p-2.5"
                          >
                            <div className="mb-1.5 flex items-center justify-between">
                              <span className="text-sm font-medium">
                                {nameByParticipantId.get(g.participant_id)}
                                {g.participant_id === myParticipant.id
                                  ? " (you)"
                                  : ""}
                              </span>
                              <span className="font-heading text-sm font-semibold tabular-nums">
                                {isSemiBlind
                                  ? g.total_points
                                    ? "✓"
                                    : "✗"
                                  : `${g.total_points ?? 0} pts`}
                              </span>
                            </div>
                            {isSemiBlind ? (
                              <p className="text-xs text-muted-foreground">
                                {g.guessed_wine_id
                                  ? `guessed ${
                                      candidateByWineId.get(g.guessed_wine_id)
                                        ? describeAnswer(
                                            candidateByWineId.get(
                                              g.guessed_wine_id,
                                            )!,
                                          )
                                        : "another wine"
                                    }`
                                  : "no match"}
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {breakdown(g).map((c) => (
                                  <span
                                    key={c.key}
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs",
                                      c.points > 0
                                        ? "bg-[#3f5b42]/12 text-[#3f5b42]"
                                        : "bg-destructive/10 text-destructive",
                                    )}
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
                        ))}
                      </div>
                    )
                  ) : guess ? (
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
                      <div className="flex flex-wrap gap-1">
                        <span className="mr-1 text-sm font-medium">
                          Your result — {guess.total_points ?? 0} pts:
                        </span>
                        {breakdown(guess).map((c) => (
                          <span
                            key={c.key}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs",
                              c.points > 0
                                ? "bg-[#3f5b42]/12 text-[#3f5b42]"
                                : "bg-destructive/10 text-destructive",
                            )}
                          >
                            {c.guessed}
                            <span className="font-semibold tabular-nums">
                              {c.points > 0 ? `+${c.points}` : "✗"}
                            </span>
                          </span>
                        ))}
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
              ) : hostProvidesHost ? (
                <p className="text-sm text-muted-foreground">
                  You set the wines — you&apos;re hosting, not guessing.
                </p>
              ) : finished ? (
                <p className="text-sm text-muted-foreground">
                  This tasting is finished — guessing is closed.
                </p>
              ) : isSemiBlind ? null : sequential && wine.id !== currentWineId ? (
                <p className="text-sm text-muted-foreground">
                  🔒 One wine at a time — this opens once the earlier wines have
                  been revealed.
                </p>
              ) : (
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
                      initialProducerLabel={
                        guess?.producer_id
                          ? (nameById.get(guess.producer_id) ?? null)
                          : null
                      }
                    />
                  </CollapsiblePanel>
                </div>
              )}

              {!wine.is_revealed && !finished
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
                                {ready ? "✓" : "○"} {nameByParticipantId.get(p.id)}
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

      {isSemiBlind && !hostProvidesHost && !finished
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

      <Link
        href={`/tastings/${tastingId}/results`}
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        Full results & leaderboard →
      </Link>
    </div>
  );
}
