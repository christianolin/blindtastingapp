import { notFound, redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { RevealSync } from "@/components/reveal-sync";
import { createClient } from "@/lib/supabase/server";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { getTastingLeaderboard } from "@/lib/tasting-leaderboard";
import {
  getCurrentUser,
  getParticipantRows,
  getReferenceOptions,
  getTastingRow,
  getWineRows,
} from "@/lib/tasting-request-cache";
import { makeWineLabeler } from "@/lib/wine-label";
import type { Database } from "@/lib/supabase/database.types";
import type { UnrevealedGlass } from "@/lib/tasting-lifecycle-copy";
import { revealRefusal, type IncompleteGlass } from "@/lib/wine-identity/incomplete";
import { listIncompleteGlasses } from "@/lib/wine-identity/server/incomplete-glasses";
import {
  HostConsole,
  type ConsoleData,
  type ConsoleGlass,
  type ConsoleStep,
  type StepKey,
} from "./console";

type WineAnswer = Database["public"]["Tables"]["wine_answers"]["Row"];
type Guess = Database["public"]["Tables"]["guesses"]["Row"];

// Chip / button labels per in-play step. The order and the optional steps
// mirror the in_play_steps SQL helper (country → region → appellation? →
// grapes → producer → type_designation? → vintage): only the appellation and
// the designation are ever optional. Producer and vintage are always steps,
// and live `wine_answers.producer_id` and `vintage_kind` are NOT NULL (the
// optional-producer migration never ran live — blind-tasting ledger amendment
// 10), so a step with nothing on record is a defensive case; the note under
// the reveal button then says the step scores nobody rather than promising a
// value that is not there.
const STEP_LABEL: Record<StepKey, string> = {
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  grapes: "Grape",
  producer: "Producer",
  type_designation: "Designation",
  vintage: "Vintage",
};

function inPlaySteps(answer: WineAnswer): StepKey[] {
  return [
    "country",
    "region",
    ...(answer.appellation_id ? (["appellation"] as const) : []),
    "grapes",
    "producer",
    ...(answer.type_designation_id ? (["type_designation"] as const) : []),
    "vintage",
  ];
}

function vintageLabel(a: {
  vintage_kind: string | null;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
}) {
  if (a.vintage_kind === "YEAR") return a.vintage_year ? String(a.vintage_year) : null;
  if (a.vintage_kind === "NV") return "NV";
  if (a.vintage_kind === "TAWNY")
    return a.vintage_tawny_years ? `${a.vintage_tawny_years}yr tawny` : "Tawny";
  return null;
}

/**
 * The host console (handoff 6i): a dark, one-button surface for the person
 * pouring. Host-only — everyone else is sent back to the tasting page — and
 * only once the tasting has started. All the host-only reads (the current
 * glass's answer key, every guess on it) happen here under the host's own
 * RLS and are rendered only into this route; the participant play surface
 * never receives them. Product rule on top of RLS: a bring-your-own bottle's
 * identity stays hidden from the host until it is revealed.
 */
export default async function HostConsolePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tastingId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const tasting = await getTastingRow(tastingId);
  if (!tasting) notFound();
  if (tasting.host_id !== user.id || tasting.status === "DRAFT") {
    redirect(`/tastings/${tastingId}`);
  }

  const supabase = await createClient();
  const [
    participants,
    wines,
    reference,
    leaderboard,
    { data: guessStatus },
    incompleteGlasses,
  ] = await Promise.all([
    getParticipantRows(tastingId),
    getWineRows(tastingId),
    getReferenceOptions(),
    getTastingLeaderboard(tastingId),
    supabase.rpc("tasting_guess_status", { p_tasting_id: tastingId }),
    // Every glass with no answer key yet (spec §C.8). It can't be revealed, so
    // the console shows the refusal instead of reveal chips. A failed read
    // costs only that notice: revealNextCategory and revealFull run the same
    // check server-side and refuse there.
    listIncompleteGlasses(supabase, tastingId).catch((e: unknown) => {
      console.warn(
        `incomplete glasses for tasting ${tastingId}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return [] as IncompleteGlass[];
    }),
  ]);

  const userIds = participants.map((p) => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", userIds.length > 0 ? userIds : [""]);
  const profileByUserId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const nameByParticipantId = new Map(
    participants.map((p) => [
      p.id,
      profileByUserId.get(p.user_id)?.display_name ??
        profileByUserId.get(p.user_id)?.email ??
        "Someone",
    ]),
  );

  const isSemiBlind = tasting.reveal_mode === "SEMI_BLIND";
  const hostProvides = tasting.wine_source === "HOST_PROVIDES";
  // Guided pacing is LIVE-only (spec §D.1 #1; create-1, play-1, reveal-2): a
  // stored flag on a self-paced tasting is ignored on read, here as everywhere
  // else, so there is no step reveal to drive.
  const guidedLive =
    tasting.timing_mode === "LIVE" && tasting.sequential_guessing && !isSemiBlind;
  const finished = tasting.status === "CLOSED";
  const wineLabel = makeWineLabeler(wines, tasting.wine_source, nameByParticipantId);

  // The current glass is derived, never chosen: the lowest-position wine not
  // yet revealed. The previous glass is the one revealed just before it — the
  // console dwells on it after a full reveal until the host moves on.
  const currentIndex = wines.findIndex((w) => !w.is_revealed);
  const currentWine = currentIndex >= 0 ? wines[currentIndex] : null;
  const revealedBefore = wines
    .slice(0, currentIndex >= 0 ? currentIndex : wines.length)
    .filter((w) => w.is_revealed);
  const previousWine =
    revealedBefore.length > 0 ? revealedBefore[revealedBefore.length - 1] : null;
  const glassWines = [previousWine, currentWine].filter(
    (w): w is NonNullable<typeof w> => w !== null,
  );
  const glassWineIds = glassWines.map((w) => w.id);

  // Host-only reads for the two glasses on the console: the answer keys and
  // every guess. RLS lets the host read both for their own tasting; nothing
  // here leaves this route.
  const [{ data: answers }, { data: guesses }, { data: designations }] =
    await Promise.all([
      glassWineIds.length > 0
        ? supabase.from("wine_answers").select("*").in("wine_id", glassWineIds)
        : Promise.resolve({ data: [] as WineAnswer[] }),
      glassWineIds.length > 0
        ? supabase.from("guesses").select("*").in("wine_id", glassWineIds)
        : Promise.resolve({ data: [] as Guess[] }),
      supabase.from("type_designations").select("id, name"),
    ]);
  const answerByWineId = new Map((answers ?? []).map((a) => [a.wine_id, a]));
  const guessesByWineId = new Map<string, Guess[]>();
  for (const g of guesses ?? []) {
    const list = guessesByWineId.get(g.wine_id) ?? [];
    list.push(g);
    guessesByWineId.set(g.wine_id, list);
  }

  const nameById = new Map<string, string>();
  for (const list of [reference.countries, reference.regions, reference.grapes, designations ?? []]) {
    for (const row of list) nameById.set(row.id, row.name);
  }
  const looked = await lookupAppellationAndProducerNames({
    appellationIds: [
      ...(answers ?? []).map((a) => a.appellation_id),
      ...(guesses ?? []).map((g) => g.appellation_id),
    ],
    producerIds: (answers ?? []).map((a) => a.producer_id),
  });
  for (const [id, n] of looked) nameById.set(id, n);
  const name = (id: string | null) => (id ? (nameById.get(id) ?? null) : null);

  // The catalog wine behind an answer carries the wine's own name
  // ("Barbaresco", "Clos de la Roche") — the title reads producer, name,
  // vintage like the handoff. Best effort: a missing row just drops the name.
  const catalogIds = [
    ...new Set(
      (answers ?? [])
        .map((a) => a.catalog_wine_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: catalogRows } =
    catalogIds.length > 0
      ? await supabase.from("catalog_wines").select("id, wine_name").in("id", catalogIds)
      : { data: [] as { id: string; wine_name: string | null }[] };
  const wineNameByCatalogId = new Map(
    (catalogRows ?? []).map((c) => [c.id, c.wine_name]),
  );

  const lockedByWineId = new Map<string, Set<string>>();
  for (const row of guessStatus ?? []) {
    if (!row.locked) continue;
    const set = lockedByWineId.get(row.wine_id) ?? new Set<string>();
    set.add(row.participant_id);
    lockedByWineId.set(row.wine_id, set);
  }
  const joined = participants.filter((p) => p.status === "JOINED");
  const hostParticipant = participants.find((p) => p.user_id === tasting.host_id);
  // Who is expected to guess a glass: joined people minus whoever brought the
  // bottle, minus the host when the host set every answer.
  const eligibleFor = (wine: { contributor_participant_id: string | null }) =>
    joined.filter(
      (p) =>
        p.id !== wine.contributor_participant_id &&
        !(hostProvides && p.user_id === tasting.host_id),
    );

  function buildGlass(wine: (typeof wines)[number], index: number): ConsoleGlass {
    const answer = answerByWineId.get(wine.id) ?? null;
    // An incomplete glass has no answer key at all, so there is nothing to
    // reveal: no chips, and the refusal sentence in their place (spec §C.8).
    const refusal = revealRefusal(incompleteGlasses, wine.id);
    const answerSteps: StepKey[] =
      isSemiBlind || !answer || refusal ? [] : inPlaySteps(answer);
    const revealStep = wine.is_revealed ? answerSteps.length : wine.reveal_step;
    // reveal-1 (spec §D.3 #4): in bring-your-own the host guesses this glass
    // too, and which optional steps a wine has is itself answer-key knowledge.
    // Until the first step is revealed — which freezes every guess — such a
    // host sees only the generic first step, never the answer-derived list.
    // Never an empty list: that would drop "Reveal the country" for
    // "Reveal the whole glass".
    const hostGuesses =
      !hostProvides &&
      !isSemiBlind &&
      wine.contributor_participant_id !== hostParticipant?.id;
    const hideAnswerSteps =
      hostGuesses && !refusal && !wine.is_revealed && revealStep === 0;
    const stepKeys: StepKey[] = hideAnswerSteps ? ["country"] : answerSteps;
    const revealedKeys = new Set(stepKeys.slice(0, revealStep));
    const categoryVisible = (key: StepKey) =>
      hostProvides || wine.is_revealed || revealedKeys.has(key);
    const steps: ConsoleStep[] = stepKeys.map((key, i) => {
      // "Nothing on record" is a fact about the answer key, so in bring-your-own
      // it is only surfaced once the category is revealed — same gate as facts.
      const missing = Boolean(
        (key === "producer" && answer && !answer.producer_id) ||
          (key === "vintage" && answer && !answer.vintage_kind),
      );
      return {
        key,
        label: STEP_LABEL[key],
        missing: missing && categoryVisible(key),
        state: i < revealStep ? "revealed" : i === revealStep ? "next" : "pending",
      };
    });
    const nextStep = steps.find((s) => s.state === "next") ?? null;

    // Identity: the host set a host-provided wine, so it is theirs to see;
    // a bring-your-own bottle only once it is revealed.
    const showIdentity = answer !== null && (hostProvides || wine.is_revealed);
    const contributorLabel = wine.contributor_participant_id ? wineLabel(wine) : null;
    let title = contributorLabel ?? `Glass ${index + 1}`;
    let meta: string | null = null;
    if (showIdentity && answer) {
      const producer = name(answer.producer_id);
      const wineName = answer.catalog_wine_id
        ? (wineNameByCatalogId.get(answer.catalog_wine_id) ?? null)
        : null;
      const identity = [producer, wineName, vintageLabel(answer)]
        .filter(Boolean)
        .join(", ");
      title = identity || title;
      meta = [
        name(answer.appellation_id),
        name(answer.region_id),
        name(answer.country_id),
        [name(answer.primary_grape_id), name(answer.secondary_grape_id)]
          .filter(Boolean)
          .join(" / ") || null,
        name(answer.type_designation_id),
      ]
        .filter(Boolean)
        .join(" · ");
    }

    const eligible = eligibleFor(wine);
    const eligibleIds = new Set(eligible.map((p) => p.id));
    const lockedSet = lockedByWineId.get(wine.id) ?? new Set<string>();
    // A scored row is frozen by the existing rule (reveal_next_category stamps
    // scored_at at the first step), so it counts as locked even if the taster
    // never pressed Lock in.
    const scoredIds = new Set(
      (guessesByWineId.get(wine.id) ?? [])
        .filter((g) => g.scored_at !== null)
        .map((g) => g.participant_id),
    );
    const isLocked = (pid: string) => lockedSet.has(pid) || scoredIds.has(pid);
    const lockedCount = eligible.filter((p) => isLocked(p.id)).length;
    const notLockedNames = eligible
      .filter((p) => !isLocked(p.id))
      .map((p) => nameByParticipantId.get(p.id) ?? "Someone");

    // "This glass" facts, from the host-readable guesses. In bring-your-own
    // a category is only summarised once it has been revealed — the host is
    // a guesser there too and must not learn the answer through a count.
    const facts: ConsoleGlass["facts"] = [];
    const glassGuesses = (guessesByWineId.get(wine.id) ?? []).filter((g) =>
      eligibleIds.has(g.participant_id),
    );
    if (answer && isSemiBlind) {
      if (categoryVisible("country")) {
        const matched = glassGuesses.filter((g) => g.guessed_wine_id === wine.id).length;
        facts.push({ label: "Matched this glass", value: `${matched} of ${eligible.length}` });
      }
    } else if (answer) {
      if (categoryVisible("grapes")) {
        const got = glassGuesses.filter(
          (g) => g.primary_grape_id === answer.primary_grape_id,
        ).length;
        facts.push({ label: "Got the grape", value: `${got} of ${eligible.length}` });
      }
      if (answer.appellation_id && categoryVisible("appellation")) {
        const got = glassGuesses.filter(
          (g) => g.appellation_id === answer.appellation_id,
        ).length;
        facts.push({ label: "Got the appellation", value: `${got} of ${eligible.length}` });
        const tally = new Map<string, number>();
        for (const g of glassGuesses) {
          if (g.appellation_id) tally.set(g.appellation_id, (tally.get(g.appellation_id) ?? 0) + 1);
        }
        let best: { id: string; n: number } | null = null;
        for (const [id, n] of tally) if (!best || n > best.n) best = { id, n };
        const mostSaid = best ? name(best.id) : null;
        if (mostSaid) facts.push({ label: "Most said", value: mostSaid });
      }
    }

    return {
      wineId: wine.id,
      number: index + 1,
      isRevealed: wine.is_revealed,
      revealStep,
      title,
      meta,
      privateIdentity: showIdentity && !wine.is_revealed,
      steps,
      nextStep,
      locked: lockedCount,
      eligible: eligible.length,
      notLockedNames,
      facts,
      refusal,
    };
  }

  const current = currentWine ? buildGlass(currentWine, currentIndex) : null;
  const previous = previousWine
    ? buildGlass(previousWine, wines.findIndex((w) => w.id === previousWine.id))
    : null;

  // Standings: joined competitors only (the host who set the answers is not
  // one), ranked by the leaderboard RPC's spoiler-safe totals.
  const statusByParticipantId = new Map(participants.map((p) => [p.id, p.status]));
  const standings = leaderboard
    .filter(
      (r) =>
        statusByParticipantId.get(r.participantId) === "JOINED" &&
        !(hostProvides && r.userId === tasting.host_id),
    )
    .map((r) => ({
      participantId: r.participantId,
      name: r.name,
      total: r.total,
      totalWines: r.totalWines,
      lastRoundPoints: r.lastRoundPoints,
    }));
  const revealedCount = wines.filter((w) => w.is_revealed).length;
  const glassesSoFar =
    revealedCount > 0 ? `after glass ${revealedCount}` : "nothing revealed yet";
  // reveal-7 (spec §D.3 #3): a per-wine leaderboard only moves when a whole
  // glass is revealed, so naming the last category would date the standings to
  // a reveal they have not caught up with yet.
  const lastRevealedStep =
    current && current.revealStep > 0 ? current.steps[current.revealStep - 1] : null;
  const standingsAfter =
    tasting.leaderboard_reveal === "PER_WINE"
      ? glassesSoFar
      : lastRevealedStep
        ? `after the ${STEP_LABEL[lastRevealedStep.key].toLowerCase()}`
        : glassesSoFar;

  // Glasses whose answers ending the tasting would leave hidden (reveal-4),
  // numbered by list order like every other glass number; a glass part-way
  // through a step reveal is "half".
  const unrevealedGlasses: UnrevealedGlass[] = [];
  wines.forEach((w, i) => {
    if (!w.is_revealed) {
      unrevealedGlasses.push({
        glass: i + 1,
        state: w.reveal_step > 0 ? "half" : "hidden",
      });
    }
  });

  const data: ConsoleData = {
    tastingId,
    tastingName: tasting.name,
    revealMode: tasting.reveal_mode,
    wineSource: tasting.wine_source,
    timingMode: tasting.timing_mode,
    guidedLive,
    isSemiBlind,
    finished,
    wineCount: wines.length,
    revealedCount,
    current,
    previous,
    standings,
    standingsAfter,
    unrevealedGlasses,
  };

  const watermark = wines.reduce(
    (sum, w) => sum + (w.reveal_step ?? 0) + (w.is_revealed ? 1000 : 0),
    0,
  );

  return (
    <>
      {tasting.timing_mode === "LIVE" ? (
        <RevealSync tastingId={tastingId} watermark={watermark} />
      ) : (
        <AutoRefresh />
      )}
      <HostConsole data={data} />
    </>
  );
}
