import { ChevronDown, Wine } from "lucide-react";
import { AnswerFacts, type AnswerFact } from "../answer-facts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsiblePanel } from "@/components/collapsible-panel";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getReferenceOptions,
  getTastingRow,
  getWineRows,
} from "@/lib/tasting-request-cache";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { makeWineLabeler } from "@/lib/wine-label";
import { getTastingLeaderboard } from "@/lib/tasting-leaderboard";
import { shortlistGrapesForRegion } from "@/lib/grape-shortlist";
import { flightSegments, pointsAtStake } from "@/lib/guess-ladder-math";
import { competitorRank } from "@/lib/stats-math";
import { AutoRefresh } from "@/components/auto-refresh";
import { RevealSync } from "@/components/reveal-sync";
import { cn } from "@/lib/utils";
import type { GrapeShortlist, GuessRow, RankChip } from "./ladder-types";
import { GlassStage, type LockedInPerson } from "./locked-in";
import { MatchLadder, type MatchCandidate, type MatchGlass } from "./match-ladder";
import { RevealButton } from "./reveal-button";
import { RevealControls } from "./reveal-controls";
import { RevealView, type RevealStanding } from "./reveal-view";

// One aligned row per scored attribute — the correct value, the taster's
// guess, and the points — so the score reads as an auditable result sheet
// instead of a loose row of chips. Colour is paired with an icon + text.
function AttributeSheet({
  rows,
}: {
  rows: {
    label: string;
    correct: string;
    guessed: string | null;
    points: number;
  }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      {rows.map((r) => {
        const got = r.points > 0;
        const missed = r.guessed !== null && r.points === 0;
        return (
          <div
            key={r.label}
            className="flex items-baseline gap-2 border-t border-border/50 px-3 py-1.5 text-sm first:border-t-0"
          >
            <span className="w-24 shrink-0 text-xs text-muted-foreground">
              {r.label}
            </span>
            <span className="min-w-0 flex-1">
              {r.correct}
              {r.guessed !== r.correct ? (
                <span className="text-muted-foreground">
                  {" · you: "}
                  {r.guessed ?? "not answered"}
                </span>
              ) : null}
            </span>
            <span
              className={cn(
                "flex shrink-0 items-center gap-1 tabular-nums",
                got
                  ? "text-[#3f5b42]"
                  : missed
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              <span aria-hidden>{got ? "✓" : missed ? "✕" : "—"}</span>
              {r.points > 0 ? `+${r.points}` : "0"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// The columns the ladder edits, picked off a full guesses row so only plain
// data crosses into the client components.
function toGuessRow(g: {
  country_id: string | null;
  region_id: string | null;
  appellation_id: string | null;
  primary_grape_id: string | null;
  secondary_grape_id: string | null;
  producer_id: string | null;
  type_designation_id: string | null;
  vintage_kind: GuessRow["vintage_kind"];
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  locked_at: string | null;
  scored_at: string | null;
}): GuessRow {
  return {
    country_id: g.country_id,
    region_id: g.region_id,
    appellation_id: g.appellation_id,
    primary_grape_id: g.primary_grape_id,
    secondary_grape_id: g.secondary_grape_id,
    producer_id: g.producer_id,
    type_designation_id: g.type_designation_id,
    vintage_kind: g.vintage_kind,
    vintage_year: g.vintage_year,
    vintage_tawny_years: g.vintage_tawny_years,
    locked_at: g.locked_at,
    scored_at: g.scored_at,
  };
}

/**
 * The whole guess-and-reveal-and-results experience for a tasting, as an
 * embeddable server component. Rendered inline on the tasting main page (so
 * everything lives on one page) and also by the standalone /play route.
 * Shows, per wine, one of: the 6e guess ladder (autosaving, "Lock in"), the
 * 6g locked-in wait, the 6h participant reveal while the host steps through
 * the categories, or — once resolved — the answer plus EVERY participant's
 * per-category breakdown. Semi-blind glasses go through the match ladder.
 *
 * Readiness keys off `locked` (tasting_guess_status.locked): a draft row
 * that has only been autosaved is "in progress", not "guessed".
 *
 * Assumes the caller only renders it for a JOINED participant of a started
 * tasting; it still guards, rendering nothing otherwise.
 */
export async function PlayExperience({
  tastingId,
  embedded = false,
}: {
  tastingId: string;
  embedded?: boolean;
}) {
  const supabase = await createClient();
  // Shared with the enclosing tasting page and StandingsPanel via the
  // per-request cache, so when this renders embedded these cost nothing.
  const user = await getCurrentUser();
  if (!user) return null;

  const tasting = await getTastingRow(tastingId);
  if (!tasting) return null;

  const isHost = tasting.host_id === user.id;
  const isSemiBlind = tasting.reveal_mode === "SEMI_BLIND";
  const guidedLive =
    tasting.timing_mode === "LIVE" &&
    tasting.sequential_guessing &&
    !isSemiBlind;
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

  const [wines, reference, { data: typeDesignations }] = await Promise.all([
    getWineRows(tastingId),
    getReferenceOptions(),
    supabase
      .from("type_designations")
      .select("id, name, category, country_id")
      .eq("is_active", true)
      .order("sort_order"),
  ]);
  const { countries, regions, grapes } = reference;

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

  type AnswerLike = {
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
  };

  function describeAnswer(answer: AnswerLike) {
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

  // The same answer as a picker row for the semi-blind match ladder: the
  // producer + vintage as the name, origin and grapes as the sub line.
  function candidateOption(a: { wine_id: string } & AnswerLike): MatchCandidate {
    return {
      id: a.wine_id,
      name: `${a.producer_id ? name(a.producer_id) : "Producer unknown"} · ${vintageLabel(a)}`,
      sub:
        `${name(a.country_id)} · ${name(a.region_id)}` +
        `${a.appellation_id ? ` · ${name(a.appellation_id)}` : ""}` +
        ` — ${name(a.primary_grape_id)}` +
        `${a.secondary_grape_id ? ` / ${name(a.secondary_grape_id)}` : ""}` +
        `${a.type_designation_id ? ` (${name(a.type_designation_id)})` : ""}`,
    };
  }

  // Same answer, as labelled columns for the post-reveal card.
  function answerFacts(answer: AnswerLike): AnswerFact[] {
    const grapes = [answer.primary_grape_id, answer.secondary_grape_id]
      .filter(Boolean)
      .map((id) => name(id as string))
      .join(" / ");
    return [
      { label: "Country", value: name(answer.country_id) },
      { label: "Region", value: name(answer.region_id) },
      ...(answer.appellation_id
        ? [{ label: "Appellation", value: name(answer.appellation_id) }]
        : []),
      {
        label: answer.secondary_grape_id ? "Grapes" : "Grape",
        value: grapes,
      },
      {
        label: "Producer",
        value: answer.producer_id ? name(answer.producer_id) : "Unknown",
      },
      ...(answer.type_designation_id
        ? [{ label: "Designation", value: name(answer.type_designation_id) }]
        : []),
      { label: "Vintage", value: vintageLabel(answer) },
    ];
  }

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
  // Per wine: who has a guess row, and whether it is locked. A row that
  // exists but is not locked is an autosaved draft — "in progress".
  const statusByWineId = new Map<string, Map<string, boolean>>();
  for (const row of guessStatus ?? []) {
    const m = statusByWineId.get(row.wine_id) ?? new Map<string, boolean>();
    m.set(row.participant_id, Boolean(row.locked));
    statusByWineId.set(row.wine_id, m);
  }
  const joinedParticipants = (participantRows ?? []).filter(
    (p) => p.status === "JOINED",
  );
  const isHostProvidesHostRow = (p: { user_id: string }) =>
    tasting.wine_source === "HOST_PROVIDES" && p.user_id === tasting.host_id;
  const eligibleGuessers = (wine: { contributor_participant_id: string | null }) =>
    joinedParticipants.filter(
      (p) => p.id !== wine.contributor_participant_id && !isHostProvidesHostRow(p),
    );
  const lockedFor = (wineId: string, participantId: string) =>
    statusByWineId.get(wineId)?.get(participantId) === true;
  const hasRowFor = (wineId: string, participantId: string) =>
    statusByWineId.get(wineId)?.has(participantId) === true;

  const wineTitle = makeWineLabeler(
    wines ?? [],
    tasting.wine_source,
    nameByParticipantId,
  );
  // "Glass 3" in the ladders (the handoff's word), the contributor label in
  // bring-your-own.
  const glassLabel = (wine: Parameters<typeof wineTitle>[0], index: number) =>
    tasting.wine_source === "HOST_PROVIDES" ? `Glass ${index + 1}` : wineTitle(wine);

  const resolvedForMe = (wineId: string, isRevealed: boolean) =>
    isRevealed || Boolean(myGuessByWineId.get(wineId)?.scored_at);

  const sequential = tasting.sequential_guessing && !isSemiBlind;
  const currentWineId = sequential
    ? ((wines ?? []).find((w) => !w.is_revealed)?.id ?? null)
    : null;

  const revealedWineIds = (wines ?? [])
    .filter((w) => w.is_revealed)
    .map((w) => w.id);

  // Progress: overall reveal progress drives the bar; in guided (sequential)
  // mode we also surface which wine is live as "Wine N of M".
  const totalWines = (wines ?? []).length;
  const revealedCount = revealedWineIds.length;
  const progressPct = totalWines > 0 ? Math.round((revealedCount / totalWines) * 100) : 0;
  const currentWinePosition = currentWineId
    ? ((wines ?? []).find((w) => w.id === currentWineId)?.position ?? null)
    : null;

  // The one wine the player should focus on now: the guided current wine, or
  // (free mode) the first wine they can still guess. Its card gets the
  // "Now tasting" spotlight; everything else reads as secondary.
  const activeWineId =
    isSemiBlind || finished
      ? null
      : sequential
        ? currentWineId
        : ((wines ?? []).find(
            (w) =>
              !w.is_revealed &&
              !resolvedForMe(w.id, w.is_revealed) &&
              !myGuessByWineId.get(w.id)?.locked_at &&
              w.contributor_participant_id !== myParticipant.id &&
              !(tasting.wine_source === "HOST_PROVIDES" && isHost),
          )?.id ?? null);

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

  // A wine picked from the catalog carries no photo on its own answer row, so
  // fall back to the linked catalog entry's label photo.
  const catalogIdsNeedingImage = [
    ...new Set(
      [...answerByWineId.values()]
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
  const matchCandidates: MatchCandidate[] = (allAnswers ?? [])
    .map(candidateOption)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Standings: rank chip on the ladder / locked-in header, the rank delta on
  // the reveal, and the standalone leaderboard. Reuses getTastingLeaderboard
  // so partial per-attribute reveals count exactly as on the main page — not
  // just fully revealed wines. Fetched once any reveal has started.
  const revealStarted = (wines ?? []).some(
    (w) => w.is_revealed || (w.reveal_step ?? 0) > 0,
  );
  const joinedUserId = new Map(joinedParticipants.map((p) => [p.id, p.user_id]));
  const standings: RevealStanding[] =
    !isSemiBlind && revealStarted
      ? (await getTastingLeaderboard(tastingId))
          .filter(
            (r) =>
              joinedUserId.has(r.participantId) &&
              !isHostProvidesHostRow({ user_id: joinedUserId.get(r.participantId)! }),
          )
          .map((r) => ({
            participantId: r.participantId,
            name: nameByParticipantId.get(r.participantId) ?? r.name,
            isMe: r.participantId === myParticipant.id,
            total: r.total,
            lastRoundPoints: r.lastRoundPoints,
          }))
      : [];
  const myRank = competitorRank(standings, myParticipant.id);
  const rankChip: RankChip | null =
    myRank && standings.length > 0
      ? {
          rank: myRank.rank,
          points: standings.find((s) => s.isMe)?.total ?? 0,
        }
      : null;
  const leaderboard = !embedded
    ? standings.map((s) => ({
        participantId: s.participantId,
        name: s.name,
        isMe: s.isMe,
        total: s.total,
        delta: s.lastRoundPoints ?? 0,
      }))
    : [];
  // The 6g "Standings after glass N" row scrolls to the standings when this
  // surface renders them — the tasting page's rail (embedded) or the
  // standalone leaderboard below (blind /play) — else it opens /results.
  const standingsHref =
    embedded || !isSemiBlind ? "#standings" : `/tastings/${tastingId}/results`;

  // Which glasses can carry a ladder — drives the two server-side ladder
  // inputs below (grape shortlist, "you guess this often"). Locked glasses
  // are included: "Change it" reopens the ladder client-side, and its props
  // must already be right when it does.
  const ladderWines = (wines ?? []).filter(
    (w) =>
      !isSemiBlind &&
      !finished &&
      !hostProvidesHost &&
      !w.is_revealed &&
      !resolvedForMe(w.id, w.is_revealed) &&
      w.contributor_participant_id !== myParticipant.id &&
      (!sequential || w.id === currentWineId),
  );

  // "you guess this often": grapes I have guessed at least twice across all
  // my own guesses (my rows are always readable; nobody else's are touched).
  let frequentGrapeIds: string[] = [];
  const shortlistByWineId = new Map<string, GrapeShortlist>();
  if (ladderWines.length > 0) {
    const { data: myParticipations } = await supabase
      .from("tasting_participants")
      .select("id")
      .eq("user_id", user.id);
    const myParticipantIds = (myParticipations ?? []).map((p) => p.id);
    const [{ data: myAllGuesses }, ...shortlists] = await Promise.all([
      supabase
        .from("guesses")
        .select("primary_grape_id, secondary_grape_id")
        .in("participant_id", myParticipantIds.length > 0 ? myParticipantIds : [""]),
      ...ladderWines.map(async (w) => {
        const regionId = myGuessByWineId.get(w.id)?.region_id ?? null;
        return [w.id, regionId ? await shortlistGrapesForRegion(regionId) : null] as const;
      }),
    ]);
    const counts = new Map<string, number>();
    for (const g of myAllGuesses ?? []) {
      for (const id of [g.primary_grape_id, g.secondary_grape_id]) {
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    frequentGrapeIds = [...counts.entries()].filter(([, n]) => n >= 2).map(([id]) => id);
    for (const [wineId, shortlist] of shortlists) {
      if (shortlist) shortlistByWineId.set(wineId, shortlist);
    }
  }

  // Correct value + the taster's guess + points, per scored attribute. null
  // points mean the category isn't in play for this wine, so it's skipped.
  const scoredRows = (answer: AnswerLike, g: Guess) => {
    const rows: {
      label: string;
      correct: string;
      guessed: string | null;
      points: number;
    }[] = [];
    const add = (
      label: string,
      correctId: string | null,
      guessedId: string | null,
      points: number | null,
    ) => {
      if (points === null) return;
      rows.push({
        label,
        correct: name(correctId),
        guessed: guessedId != null ? name(guessedId) : null,
        points,
      });
    };
    add("Country", answer.country_id, g.country_id, g.country_points);
    add("Region", answer.region_id, g.region_id, g.region_points);
    add(
      "Appellation",
      answer.appellation_id,
      g.appellation_id,
      g.appellation_points,
    );
    add(
      "Primary grape",
      answer.primary_grape_id,
      g.primary_grape_id,
      g.primary_grape_points,
    );
    add(
      "Secondary grape",
      answer.secondary_grape_id,
      g.secondary_grape_id,
      g.secondary_grape_points,
    );
    add("Producer", answer.producer_id, g.producer_id, g.producer_points);
    add(
      "Designation",
      answer.type_designation_id,
      g.type_designation_id,
      g.type_designation_points,
    );
    if (g.vintage_points !== null) {
      rows.push({
        label: "Vintage",
        correct: vintageLabel(answer),
        guessed: g.vintage_kind != null ? vintageLabel(g) : null,
        points: g.vintage_points,
      });
    }
    return rows;
  };

  // The 6g "What you said" chips from my own row — "no producer" muted when
  // a category was skipped; the two optional rows only when answered.
  const answerChips = (g: GuessRow) => {
    const chip = (label: string, value: string | null) =>
      value ? { text: value } : { text: `no ${label}`, muted: true };
    const chips = [
      chip("country", g.country_id ? name(g.country_id) : null),
      chip("region", g.region_id ? name(g.region_id) : null),
      chip("appellation", g.appellation_id ? name(g.appellation_id) : null),
      chip("grape", g.primary_grape_id ? name(g.primary_grape_id) : null),
    ];
    if (g.secondary_grape_id) chips.push({ text: name(g.secondary_grape_id) });
    chips.push(chip("producer", g.producer_id ? name(g.producer_id) : null));
    if (g.type_designation_id) chips.push({ text: name(g.type_designation_id) });
    chips.push(chip("vintage", g.vintage_kind ? vintageLabel(g) : null));
    return chips;
  };

  // The people chips for a glass's 6g state: me first, then the rest.
  const peopleFor = (
    eligible: { id: string }[],
    isLocked: (participantId: string) => boolean,
  ): LockedInPerson[] =>
    eligible
      .map((p) => ({
        id: p.id,
        name: nameByParticipantId.get(p.id) ?? "Someone",
        isMe: p.id === myParticipant.id,
        state: isLocked(p.id) ? ("locked" as const) : ("deciding" as const),
      }))
      .sort((a, b) => Number(b.isMe) - Number(a.isMe));

  return (
    <div className="flex flex-col gap-6">
      {tasting.timing_mode === "LIVE" ? (
        <RevealSync
          tastingId={tastingId}
          // Sum of every wine's reveal step: changes on each advance, so it
          // marks the moment refreshed content actually committed.
          watermark={(wines ?? []).reduce(
            (n, w) => n + (w.reveal_step ?? 0) + (w.is_revealed ? 1000 : 0),
            0,
          )}
        />
      ) : (
        <AutoRefresh />
      )}

      {/* Always-visible progress so players know where they are in the flight.
          Suppressed when embedded — the tasting page shows it in the left rail. */}
      {!embedded && totalWines > 0 ? (
        <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-heading text-lg font-semibold">
              {finished
                ? "Tasting finished"
                : sequential && currentWinePosition
                  ? `Wine ${currentWinePosition} of ${totalWines}`
                  : `${revealedCount} of ${totalWines} revealed`}
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {progressPct}%
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Live leaderboard — updates on every reveal, with the points each
          taster gained on the last wine so the standings feel alive.
          Suppressed when embedded — the tasting page shows standings in the
          right rail. The id is the "Standings" link target from Locked in. */}
      {!embedded && !isSemiBlind && leaderboard.length > 0 ? (
        <div id="standings" className="scroll-mt-24 rounded-xl border">
          <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
            <span className="font-heading text-sm font-semibold">Leaderboard</span>
            <span className="text-xs text-muted-foreground">
              {revealedCount > 0
                ? `after ${revealedCount} of ${totalWines}`
                : "live"}
            </span>
          </div>
          <ol className="flex flex-col">
            {leaderboard.map((row, i) => (
              <li
                key={row.participantId}
                className={cn(
                  "flex items-center gap-3 px-4 py-2",
                  i > 0 && "border-t border-border/60",
                  row.isMe && "bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    i === 0
                      ? "bg-gold/20 text-gold-deep"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {row.name}
                  {row.isMe ? (
                    <span className="text-muted-foreground"> (you)</span>
                  ) : null}
                </span>
                {row.delta > 0 ? (
                  <span className="rounded-full bg-[#3f5b42]/12 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-[#3f5b42]">
                    +{row.delta}
                  </span>
                ) : null}
                <span className="w-12 text-right font-heading text-sm font-semibold tabular-nums">
                  {row.total}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

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
              const eligible = joinedParticipants.filter((p) => !isHostProvidesHostRow(p));
              if (eligible.length === 0) return null;
              // Submitted = locked in on at least one glass (the batch locks
              // every glass at once); a draft row is not a submission.
              const submitted = new Set<string>();
              for (const m of statusByWineId.values())
                for (const [pid, locked] of m) if (locked) submitted.add(pid);
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

      {(wines ?? []).map((wine, index) => {
        const isMine = wine.contributor_participant_id === myParticipant.id;
        const answer = answerByWineId.get(wine.id);
        const guess = myGuessByWineId.get(wine.id);
        const guessedCandidate = guess?.guessed_wine_id
          ? candidateByWineId.get(guess.guessed_wine_id)
          : null;
        const resolved = resolvedForMe(wine.id, wine.is_revealed);
        const locked = Boolean(guess?.locked_at);
        // A draft (autosaved, unlocked) row is "in progress", not "guessed".
        const hasDraft = isSemiBlind ? Boolean(guess?.guessed_wine_id) : Boolean(guess);
        const glassNumber = index + 1;

        if (!resolved && !isMine && isSemiBlind) return null;

        const statusBadge = wine.is_revealed
          ? { label: "Revealed", variant: "default" as const }
          : resolved
            ? { label: "Your result", variant: "default" as const }
            : isMine
              ? { label: "Your wine", variant: "outline" as const }
              : hostProvidesHost
                ? { label: "Hidden", variant: "outline" as const }
                : locked
                  ? { label: "Guessed", variant: "secondary" as const }
                  : hasDraft
                    ? { label: "In progress", variant: "outline" as const }
                    : { label: "Not guessed", variant: "outline" as const };

        const everyone = wine.is_revealed
          ? (revealedGuessesByWineId.get(wine.id) ?? [])
              .slice()
              .sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0))
          : [];

        const isActive = wine.id === activeWineId;
        const eligible = eligibleGuessers(wine);
        const lockedCount = eligible.filter((p) => lockedFor(wine.id, p.id)).length;

        // Which body this card gets. The three "live" states (6h reveal, 6g
        // locked in, 6e ladder) are full-bleed sections in their own palette;
        // everything else is ordinary card content.
        const revealing =
          guidedLive && !wine.is_revealed && (wine.reveal_step ?? 0) > 0;
        const canGuessNow =
          !revealing &&
          !(resolved && answer) &&
          !isMine &&
          !hostProvidesHost &&
          !finished &&
          !isSemiBlind &&
          !(sequential && wine.id !== currentWineId);
        const fullBleed = revealing || (canGuessNow && (locked || isActive || sequential));
        // The ladder states describe the glass themselves; the card header
        // only stays for bring-your-own titles ("Gustav's wine") and for the
        // host's reveal controls.
        const hostControls = isHost && !wine.is_revealed && !finished;
        const showHeader = !fullBleed || hostControls || tasting.wine_source !== "HOST_PROVIDES";

        const ladderRow = guess ? toGuessRow(guess) : null;
        const stage = canGuessNow ? (
          <GlassStage
            initialLocked={locked}
            ladder={{
              tastingId,
              wineId: wine.id,
              tastingName: tasting.name,
              glassNumber,
              glassCount: totalWines,
              rankChip,
              segments: flightSegments(wines ?? [], sequential ? currentWineId : wine.id),
              lockedCount,
              eligibleCount: eligible.length,
              countries: countries ?? [],
              regions: regions ?? [],
              grapes: grapes ?? [],
              typeDesignations: typeDesignations ?? [],
              initialGuess: ladderRow,
              initialLabels: {
                producer: guess?.producer_id ? nameById.get(guess.producer_id) : undefined,
                appellation: guess?.appellation_id
                  ? nameById.get(guess.appellation_id)
                  : undefined,
              },
              frequentGrapeIds,
              shortlist: shortlistByWineId.get(wine.id) ?? null,
            }}
            lockedIn={{
              tastingId,
              wineIds: [wine.id],
              eyebrow: tasting.name,
              title: `${glassLabel(wine, index)} · locked in`,
              rankChip,
              people: peopleFor(eligible, (pid) => lockedFor(wine.id, pid)),
              lockedCount,
              eligibleCount: eligible.length,
              chips: ladderRow ? answerChips(ladderRow) : [],
              stakeLine: `${pointsAtStake(ladderRow)} pts at stake`,
              standingsLabel:
                glassNumber > 1 ? `Standings after glass ${glassNumber - 1}` : "See the standings",
              standingsHref,
            }}
          />
        ) : null;

        // Guided guessing: the ladder only renders for the current glass;
        // the others are collapsed rows until the reveal advances to them.
        // The host keeps the card (reveal controls live in its header).
        if (
          sequential &&
          wine.id !== currentWineId &&
          !resolved &&
          !isMine &&
          !hostProvidesHost &&
          !finished &&
          !isHost
        ) {
          return (
            <div
              key={wine.id}
              id={`wine-${wine.id}`}
              className="flex min-h-[44px] scroll-mt-24 items-center rounded-[12px] border border-dashed border-border-light bg-card px-[16px] text-[13.5px] text-muted-foreground"
            >
              {glassLabel(wine, index)} · opens after the reveal
            </div>
          );
        }

        return (
          <Card
            key={wine.id}
            id={`wine-${wine.id}`}
            className={cn(
              "scroll-mt-24",
              isActive && "border-primary/50 shadow-md ring-1 ring-primary/30",
              !isActive && !wine.is_revealed && !resolved && !fullBleed && "opacity-80",
            )}
          >
            {showHeader ? (
              <CardHeader>
                {isActive ? (
                  <span className="mb-1 w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                    Now tasting
                  </span>
                ) : null}
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{wineTitle(wine)}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                    {/* Guided live tastings get progressive controls (reveal one
                        attribute at a time or skip to full); everything else the
                        plain full-reveal button. */}
                    {hostControls ? (
                      guidedLive ? (
                        <RevealControls
                          wineId={wine.id}
                          revealStep={wine.reveal_step ?? 0}
                          started={(wine.reveal_step ?? 0) > 0}
                        />
                      ) : (
                        <RevealButton tastingId={tastingId} wineId={wine.id} />
                      )
                    ) : null}
                  </div>
                </CardTitle>
              </CardHeader>
            ) : null}

            {fullBleed ? (
              <div className={showHeader ? "-mb-4" : "-my-4"}>
                {revealing ? (
                  <RevealView
                    wineId={wine.id}
                    glassNumber={glassNumber}
                    myParticipantId={myParticipant.id}
                    myGuess={ladderRow}
                    names={nameById}
                    standings={standings}
                    spectator={isMine || hostProvidesHost}
                  />
                ) : (
                  stage
                )}
              </div>
            ) : (
              <CardContent>
                {resolved && answer ? (
                  <div className="flex flex-col gap-4">
                    <div>
                      <h3 className="mb-1.5 text-sm font-medium">Answer</h3>
                      {/* Label photo as a left thumbnail (blank bottle when there
                          is none), matching the cellar and catalog rows. */}
                      <div className="flex items-start gap-3">
                        {answer.image_url ??
                        (answer.catalog_wine_id
                          ? catalogImageById.get(answer.catalog_wine_id)
                          : null) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={
                              answer.image_url ??
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
                        <div className="min-w-0 flex-1">
                          <AnswerFacts facts={answerFacts(answer)} />
                        </div>
                      </div>
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
                            // Native disclosure per player: the name+score row
                            // is the summary; tap to expand the attribute
                            // sheet. Collapsed by default so a revealed wine
                            // reads as a compact list of final scores.
                            <details
                              key={g.id}
                              className="group rounded-lg border border-border/70"
                            >
                              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-2.5 [&::-webkit-details-marker]:hidden">
                                <span className="text-sm font-medium">
                                  {nameByParticipantId.get(g.participant_id)}
                                  {g.participant_id === myParticipant.id
                                    ? " (you)"
                                    : ""}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <span className="font-heading text-sm font-semibold tabular-nums">
                                    {isSemiBlind
                                      ? g.total_points
                                        ? "✓"
                                        : "✗"
                                      : `${g.total_points ?? 0} pts`}
                                  </span>
                                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                                </span>
                              </summary>
                              <div className="px-2.5 pb-2.5">
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
                                  <AttributeSheet rows={scoredRows(answer, g)} />
                                )}
                              </div>
                            </details>
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
                        <div className="flex flex-col gap-1.5">
                          <p className="text-sm font-medium">
                            Your result — {guess.total_points ?? 0} pts
                          </p>
                          <AttributeSheet rows={scoredRows(answer, guess)} />
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
                  // Only the bring-your-own host reaches this (participants
                  // get the collapsed row above): same line, inside the card
                  // that carries their reveal controls.
                  <p className="text-[13.5px] text-muted-foreground">
                    {glassLabel(wine, index)} · opens after the reveal
                  </p>
                ) : (
                  // Free mode, not the spotlighted glass: the ladder waits
                  // behind a button so one glass at a time is expanded.
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                      {hasDraft
                        ? "You've started this wine. You can keep editing until you lock it in."
                        : "You haven't guessed this wine yet."}
                    </p>
                    <CollapsiblePanel
                      label={hasDraft ? "Edit your guess" : "Guess this wine"}
                      variant={hasDraft ? "outline" : "default"}
                    >
                      <div className="overflow-hidden rounded-lg border border-border">
                        {stage}
                      </div>
                    </CollapsiblePanel>
                  </div>
                )}

                {/* Readiness: locked = ✓, an autosaved draft = ○ in progress,
                    nothing yet = ○. The ladder/locked-in states carry their
                    own count, so this only follows ordinary card content. */}
                {!wine.is_revealed && !finished
                  ? (() => {
                      if (eligible.length === 0) return null;
                      const pendingNames = eligible
                        .filter((p) => !lockedFor(wine.id, p.id))
                        .map((p) => nameByParticipantId.get(p.id) ?? "Someone");
                      const allReady = pendingNames.length === 0;
                      // Name who we're still waiting on (up to two) rather than a
                      // bare count — it feels like a live room, not a form.
                      const waitingLine = allReady
                        ? "Everyone's ready to reveal"
                        : pendingNames.length <= 2
                          ? `Waiting for ${pendingNames.join(" and ")}…`
                          : `${lockedCount} of ${eligible.length} locked in`;
                      return (
                        <div className="mt-4 border-t pt-3">
                          <p
                            className={cn(
                              "mb-1.5 text-xs font-medium",
                              allReady ? "text-[#3f5b42]" : "text-muted-foreground",
                            )}
                          >
                            {allReady ? "✓ " : ""}
                            {waitingLine}
                          </p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {eligible.map((p) => {
                              const ready = lockedFor(wine.id, p.id);
                              const draft = !ready && hasRowFor(wine.id, p.id);
                              return (
                                <span
                                  key={p.id}
                                  className={ready ? "text-[#3f5b42]" : ""}
                                >
                                  {ready ? "✓" : "○"} {nameByParticipantId.get(p.id)}
                                  {draft ? " · in progress" : ""}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()
                  : null}
              </CardContent>
            )}
          </Card>
        );
      })}

      {isSemiBlind && !hostProvidesHost && !finished
        ? (() => {
            const glasses: MatchGlass[] = (wines ?? [])
              .map((w, i) => ({ w, i }))
              .filter(
                ({ w }) =>
                  !resolvedForMe(w.id, w.is_revealed) &&
                  w.contributor_participant_id !== myParticipant.id,
              )
              .map(({ w, i }) => ({
                wineId: w.id,
                label: glassLabel(w, i),
                existingGuessedWineId:
                  myGuessByWineId.get(w.id)?.guessed_wine_id ?? null,
              }));
            if (glasses.length === 0) return null;
            const eligible = joinedParticipants.filter((p) => !isHostProvidesHostRow(p));
            const lockedAnywhere = (pid: string) =>
              [...statusByWineId.values()].some((m) => m.get(pid) === true);
            const allLocked = glasses.every((g) =>
              Boolean(myGuessByWineId.get(g.wineId)?.locked_at),
            );
            return (
              <Card id="match-glasses" className="scroll-mt-24">
                <div className="-my-4">
                  <MatchLadder
                    tastingId={tastingId}
                    tastingName={tasting.name}
                    glasses={glasses}
                    candidates={matchCandidates}
                    initialLocked={allLocked}
                    lockedIn={{
                      tastingId,
                      eyebrow: tasting.name,
                      title: "Locked in",
                      rankChip: null,
                      people: peopleFor(eligible, lockedAnywhere),
                      lockedCount: eligible.filter((p) => lockedAnywhere(p.id)).length,
                      eligibleCount: eligible.length,
                      standingsLabel: "See the standings",
                      standingsHref,
                    }}
                  />
                </div>
              </Card>
            );
          })()
        : null}
    </div>
  );
}
