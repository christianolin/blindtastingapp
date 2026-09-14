import { notFound, redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { RevealSync } from "@/components/reveal-sync";
import { LiveShell } from "@/components/live-shell";
import { createClient } from "@/lib/supabase/server";
import { GUESS_READ_COLUMNS, type GuessReadColumn } from "@/lib/guess-columns";
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
import { eligibleForGlass } from "@/lib/glass-eligibility";
import { glassFacts } from "@/lib/host-facts";
import { keyLabel, type RevealKey } from "@/lib/reveal-rows-math";
import { NEXT_ATTRIBUTE, nextChipLabel, stepRevealApplies } from "@/lib/console-copy";
import { currentGlass as pointerCurrentGlass, type PointerGlass } from "@/lib/pour-pointer";
import { skipPlan } from "@/lib/pacing-guards";
import { getSemiBlindBoard, getSemiBlindCandidates } from "@/lib/semi-blind-data";
import type { BoardGlass } from "@/lib/semi-blind-board";
import { candidateLabel } from "@/lib/semi-blind-copy";
import {
  HostConsole,
  type ConsoleData,
  type ConsoleGlass,
  type ConsoleStep,
} from "./console";

type WineAnswer = Database["public"]["Tables"]["wine_answers"]["Row"];
// The explicit `guesses` read list (spec §10.4 (e); BT-S5) — never "*",
// which would carry the semi-blind pick column back to a page that also
// names bring-your-own contributors, turning a match into an answer leak.
type GuessReadRow = Pick<Database["public"]["Tables"]["guesses"]["Row"], GuessReadColumn>;
type WineRow = Awaited<ReturnType<typeof getWineRows>>[number];
type ParticipantRow = Awaited<ReturnType<typeof getParticipantRows>>[number];

// The spoiler-safe progressive read shape (get_wine_reveal, BT-SQL1/M1):
// only categories <= reveal_step are ever present. Used exclusively for a
// competing bring-your-own host's glass (spec §7.3 item 7) — this is the
// ONLY answer-key-adjacent data such a host is ever handed for an unrevealed
// glass; wine_answers is never queried for one (rule 1).
type RpcReveal = {
  revealed_keys: string[];
  in_play_count: number | null;
  correct: Record<string, string | number | null>;
  guesses: {
    participant_id: string;
    values: Record<string, string | number | null>;
    points: Record<string, number | null>;
  }[];
};

function inPlaySteps(answer: WineAnswer): RevealKey[] {
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
 * identity stays hidden from the host until it is revealed — for such a
 * glass this page never queries wine_answers while it is unrevealed; the
 * chips and facts come from get_wine_reveal instead (spec §7.3 item 7).
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
  const paused = tasting.paused_at !== null;
  // Q8 (REVEAL-02): the one predicate that gates step-by-step reveal, shared
  // with the participant's RevealView — a free-order LIVE blind tasting (or
  // any ASYNC/semi-blind one) reveals whole glasses instead.
  const guidedLive = stepRevealApplies({
    revealMode: tasting.reveal_mode,
    timingMode: tasting.timing_mode,
    sequentialGuessing: tasting.sequential_guessing,
  });
  const finished = tasting.status === "CLOSED";
  const wineLabel = makeWineLabeler(wines, tasting.wine_source, nameByParticipantId);

  // The pour pointer (BT-P3/BT-H1): the current glass is never just "the
  // lowest unrevealed one" — a Skip may have moved it forward, and once that
  // skipped glass comes back around the pointer reports `wrapped`. The dwell
  // on the previously revealed glass is unchanged (client state in console.tsx).
  const pointerGlasses: PointerGlass[] = wines.map((w) => ({
    id: w.id,
    isRevealed: w.is_revealed,
    revealStep: w.reveal_step,
  }));
  const pointer = pointerCurrentGlass(pointerGlasses, tasting.current_wine_id);
  const currentIndex = pointer ? pointer.index : -1;
  const currentWine = pointer ? wines[pointer.index] : null;
  const wrapped = pointer?.wrapped ?? false;
  const revealedBefore = wines
    .slice(0, currentIndex >= 0 ? currentIndex : wines.length)
    .filter((w) => w.is_revealed);
  const previousWine =
    revealedBefore.length > 0 ? revealedBefore[revealedBefore.length - 1] : null;

  const hostParticipant = participants.find((p) => p.user_id === tasting.host_id);
  // A competing bring-your-own host: not the tasting's answer-setter, not
  // semi-blind (that branch is BT-S4/BT-S5's), and not their own bottle
  // (they wrote that answer key themselves when they added it).
  const hostGuessesFor = (wine: { contributor_participant_id: string | null }) =>
    !hostProvides && !isSemiBlind && wine.contributor_participant_id !== hostParticipant?.id;
  // Once a glass is fully revealed its answer key is public knowledge (the
  // `wine_answers` RLS already opens on `is_revealed`), so only an
  // UNREVEALED competing-host glass ever needs the RPC path.
  const needsRpc = (wine: WineRow) => hostGuessesFor(wine) && !wine.is_revealed;

  const glassWines = [previousWine, currentWine].filter(
    (w): w is NonNullable<typeof w> => w !== null,
  );
  const glassWineIds = glassWines.map((w) => w.id);
  const directWineIds = glassWines.filter((w) => !needsRpc(w)).map((w) => w.id);
  const rpcWines = glassWines.filter((w) => needsRpc(w));

  // Host-only reads for the two glasses on the console. `wine_answers` and
  // full guess content are read only for glasses the host is entitled to see
  // in full (host-provides, their own bring-your-own bottle, or semi-blind —
  // left for BT-S4/BT-S5); `guessMeta` is content-free (locked/scored
  // bookkeeping only, never a guessed value) and is read for every glass so
  // "N/M locked in" works regardless of branch.
  const [{ data: answers }, { data: guessMeta }, { data: guessContent }, { data: designations }, revealRows] =
    await Promise.all([
      directWineIds.length > 0
        ? supabase.from("wine_answers").select("*").in("wine_id", directWineIds)
        : Promise.resolve({ data: [] as WineAnswer[] }),
      glassWineIds.length > 0
        ? supabase
            .from("guesses")
            .select("wine_id, participant_id, locked_at, scored_at")
            .in("wine_id", glassWineIds)
        : Promise.resolve({
            data: [] as { wine_id: string; participant_id: string; locked_at: string | null; scored_at: string | null }[],
          }),
      directWineIds.length > 0
        ? supabase.from("guesses").select(GUESS_READ_COLUMNS).in("wine_id", directWineIds)
        : Promise.resolve({
            data: [] as GuessReadRow[],
          }),
      supabase.from("type_designations").select("id, name"),
      Promise.all(
        rpcWines.map(async (w) => {
          const { data } = await supabase.rpc("get_wine_reveal", { p_wine_id: w.id });
          return [w.id, data as RpcReveal | null] as const;
        }),
      ),
    ]);
  const revealByWineId = new Map(revealRows);
  const answerByWineId = new Map((answers ?? []).map((a) => [a.wine_id, a]));
  const guessMetaByWineId = new Map<
    string,
    { participant_id: string; scored_at: string | null }[]
  >();
  for (const g of guessMeta ?? []) {
    const list = guessMetaByWineId.get(g.wine_id) ?? [];
    list.push(g);
    guessMetaByWineId.set(g.wine_id, list);
  }
  const guessContentByWineId = new Map<string, GuessReadRow[]>();
  for (const g of guessContent ?? []) {
    const list = guessContentByWineId.get(g.wine_id) ?? [];
    list.push(g);
    guessContentByWineId.set(g.wine_id, list);
  }

  const nameById = new Map<string, string>();
  for (const list of [reference.countries, reference.regions, reference.grapes, designations ?? []]) {
    for (const row of list) nameById.set(row.id, row.name);
  }
  // Every appellation/producer id this page will render: the direct-branch
  // answers/guesses, plus every appellation id a competing-host RPC result
  // named (the truth and every guess's pick) — names are never spoiler-
  // sensitive on their own, only which id belongs to which unrevealed wine.
  const rpcAppellationIds: (string | null | undefined)[] = [];
  for (const rev of revealByWineId.values()) {
    if (!rev) continue;
    rpcAppellationIds.push(rev.correct.appellation as string | null | undefined);
    for (const g of rev.guesses) {
      rpcAppellationIds.push(g.values.appellation as string | null | undefined);
    }
  }
  const looked = await lookupAppellationAndProducerNames({
    appellationIds: [
      ...(answers ?? []).map((a) => a.appellation_id),
      ...(guessContent ?? []).map((g) => g.appellation_id),
      ...rpcAppellationIds,
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
  // Who is expected to guess a glass: JOINED, not whoever brought the
  // bottle, and not the host when the host set every answer — the one
  // shared rule (BT-P2), not an inline copy of it.
  const eligibleFor = (wine: { contributor_participant_id: string | null }) =>
    participants.filter((p: ParticipantRow) =>
      eligibleForGlass(
        { id: p.id, userId: p.user_id, status: p.status, joinedAt: null },
        { contributorParticipantId: wine.contributor_participant_id, isRevealed: false, revealedAt: null },
        { wineSource: tasting.wine_source, hostId: tasting.host_id },
      ),
    );

  // Semi-blind's "How the table split" and "Matched this glass" (spec §7.3
  // item 6) read only get_semi_blind_board/get_semi_blind_candidates, never
  // the guesses table's own picked-wine column — the RPCs speak in opaque
  // candidate keys the same as the participant board (BT-S3), so a stray
  // host-side read of that column can never reappear here.
  const boardGlasses: BoardGlass[] = wines.map((w, i) => ({
    wineId: w.id,
    glass: i + 1,
    isRevealed: w.is_revealed,
    revealStep: w.reveal_step,
    ownBottle: w.contributor_participant_id === hostParticipant?.id,
  }));
  const [semiBlindBoard, semiBlindCandidates] = isSemiBlind
    ? await Promise.all([getSemiBlindBoard(tastingId, boardGlasses), getSemiBlindCandidates(tastingId)])
    : [null, null];

  function buildGlass(wine: WineRow, index: number, isCurrent: boolean): ConsoleGlass {
    const refusal = revealRefusal(incompleteGlasses, wine.id);
    const eligible = eligibleFor(wine);
    const eligibleIds = new Set(eligible.map((p) => p.id));
    const scoredIds = new Set(
      (guessMetaByWineId.get(wine.id) ?? [])
        .filter((g) => g.scored_at !== null)
        .map((g) => g.participant_id),
    );
    // A scored row is frozen by the existing rule (reveal_next_category stamps
    // scored_at at the first step), so it counts as locked even if the taster
    // never pressed Lock in.
    const lockedSet = lockedByWineId.get(wine.id) ?? new Set<string>();
    const isLocked = (pid: string) => lockedSet.has(pid) || scoredIds.has(pid);
    const lockedCount = eligible.filter((p) => isLocked(p.id)).length;
    const notLockedNames = eligible
      .filter((p) => !isLocked(p.id))
      .map((p) => nameByParticipantId.get(p.id) ?? "Someone");

    let steps: ConsoleStep[] = [];
    let nextStep: ConsoleStep | null = null;
    let revealButtonLabel: string | null = null;
    let showIdentity = false;
    let identityTitle: string | null = null;
    let meta: string | null = null;
    let facts: { label: string; value: string }[] = [];
    let revealStep = wine.reveal_step;

    if (needsRpc(wine)) {
      // reveal-1 / spec §7.3 item 7: the true category sequence is itself
      // answer-key knowledge (whether an appellation or a designation is in
      // play), so a competing host only ever sees the categories already
      // revealed plus one dashed placeholder for whatever comes next.
      const rev = revealByWineId.get(wine.id) ?? null;
      const revealedKeys = (rev?.revealed_keys ?? []) as RevealKey[];
      revealStep = revealedKeys.length;
      steps = revealedKeys.map((key) => ({
        key,
        label: keyLabel(key),
        known: true,
        missing: false,
        state: "revealed" as const,
      }));
      if (!refusal) {
        const chip: ConsoleStep = {
          key: "next",
          label: nextChipLabel(rev?.in_play_count ?? null, revealStep),
          known: false,
          missing: false,
          state: "next",
        };
        steps = [...steps, chip];
        nextStep = chip;
        revealButtonLabel = NEXT_ATTRIBUTE;
      }
      if (rev && revealedKeys.length > 0) {
        const answerForFacts = {
          primary_grape_id: (rev.correct.primary_grape as string | undefined) ?? "",
          appellation_id: (rev.correct.appellation as string | null | undefined) ?? null,
        };
        const rows = rev.guesses.map((g) => ({
          participant_id: g.participant_id,
          primary_grape_id: (g.values.primary_grape as string | null | undefined) ?? null,
          appellation_id: (g.values.appellation as string | null | undefined) ?? null,
          // Every guess on a glass with at least one revealed category is
          // already frozen by the existing scored_at-on-first-step rule
          // (see above) — get_wine_reveal doesn't carry locked_at/scored_at
          // itself, so a truthy placeholder here is exact, not a guess.
          locked_at: null,
          scored_at: "revealed",
        }));
        facts = glassFacts({
          revealedKeys,
          answer: answerForFacts,
          rows,
          eligibleIds,
          nameOf: name,
        });
      }
      // showIdentity stays false: needsRpc is only true while unrevealed.
    } else if (isSemiBlind) {
      // T9's host-provides-early identity rule is unchanged: the host sees
      // their own answer key before the reveal (they wrote it). "How the
      // table split" and the matched count are gated on the glass actually
      // being revealed — spec §7.3 item 6, the same "nothing before, facts
      // after" rule a normal blind glass's facts already follow.
      const answer = answerByWineId.get(wine.id) ?? null;
      showIdentity = answer !== null && (hostProvides || wine.is_revealed);
      if (showIdentity && answer) {
        const producer = name(answer.producer_id);
        const wineName = answer.catalog_wine_id
          ? (wineNameByCatalogId.get(answer.catalog_wine_id) ?? null)
          : null;
        identityTitle = [producer, wineName, vintageLabel(answer)].filter(Boolean).join(", ") || null;
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
      if (wine.is_revealed && semiBlindBoard && semiBlindCandidates) {
        const trueKey = semiBlindBoard.revealedKeyByGlass[wine.id] ?? null;
        const cardByKey = new Map(semiBlindCandidates.cards.map((c) => [c.key, c]));
        const splitRows = semiBlindBoard.splitByGlass[wine.id] ?? [];
        const matched = splitRows.find((row) => row.key === trueKey)?.count ?? 0;
        facts = [
          ...splitRows.map((row) => ({
            label: candidateLabel(
              cardByKey.get(row.key) ?? { producer: null, wineName: null, vintageLabel: "" },
            ),
            value: String(row.count),
            correct: row.key === trueKey,
          })),
          { label: "Matched this glass", value: `${matched} of ${eligible.length}` },
        ];
      }
    } else {
      const answer = answerByWineId.get(wine.id) ?? null;
      const answerSteps: RevealKey[] = !answer || refusal ? [] : inPlaySteps(answer);
      revealStep = wine.is_revealed ? answerSteps.length : wine.reveal_step;
      // The answer is always known to the host in this branch (they set it,
      // or it's their own bring-your-own bottle), so "missing" needs no
      // extra visibility gate — only ever rendered for the active next step.
      const missingOf = (key: RevealKey) =>
        Boolean(
          (key === "producer" && answer && !answer.producer_id) ||
            (key === "vintage" && answer && !answer.vintage_kind),
        );
      steps = answerSteps.map((key, i) => ({
        key,
        label: keyLabel(key),
        known: true,
        missing: missingOf(key),
        state: i < revealStep ? "revealed" : i === revealStep ? "next" : "pending",
      }));
      nextStep = steps.find((s) => s.state === "next") ?? null;
      if (nextStep) revealButtonLabel = `Reveal the ${nextStep.label.toLowerCase()}`;

      showIdentity = answer !== null && (hostProvides || wine.is_revealed);
      if (showIdentity && answer) {
        const producer = name(answer.producer_id);
        const wineName = answer.catalog_wine_id
          ? (wineNameByCatalogId.get(answer.catalog_wine_id) ?? null)
          : null;
        identityTitle = [producer, wineName, vintageLabel(answer)].filter(Boolean).join(", ") || null;
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

      // "This glass" facts (spec §7.3 item 5; B0 reveal-8): counted only
      // from categories already revealed to everyone — hostProvides no
      // longer short-circuits this the way it does identity above.
      if (answer) {
        const revealedKeysList = answerSteps.slice(0, revealStep) as RevealKey[];
        const rows = (guessContentByWineId.get(wine.id) ?? []).map((g) => ({
          participant_id: g.participant_id,
          primary_grape_id: g.primary_grape_id,
          appellation_id: g.appellation_id,
          locked_at: g.locked_at,
          scored_at: g.scored_at,
        }));
        facts = glassFacts({
          revealedKeys: revealedKeysList,
          answer: { primary_grape_id: answer.primary_grape_id, appellation_id: answer.appellation_id },
          rows,
          eligibleIds,
          nameOf: name,
        });
      }
    }

    const contributorLabel = wine.contributor_participant_id ? wineLabel(wine) : null;
    const title = identityTitle ?? contributorLabel ?? `Glass ${index + 1}`;

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
      revealButtonLabel,
      locked: lockedCount,
      eligible: eligible.length,
      notLockedNames,
      facts,
      refusal,
      wrapped: isCurrent && wrapped,
    };
  }

  const current = currentWine ? buildGlass(currentWine, currentIndex, true) : null;
  const previous = previousWine
    ? buildGlass(previousWine, wines.findIndex((w) => w.id === previousWine.id), false)
    : null;

  // "Skip to glass {N} →" (BT-P3/BT-H1's skipPlan): the one rule for what
  // Skip does and when it is offered at all — null hides the button, whether
  // because there is nothing to skip to (refinement 23's no-wrap-past-the-
  // pointer rule in SEMI_BLIND) or because a reveal, a pause or the tasting's
  // own status already refuses it.
  const skipPlanResult = current
    ? skipPlan({
        status: tasting.status,
        paused,
        glasses: pointerGlasses,
        pointer: tasting.current_wine_id,
        fromWineId: current.wineId,
        revealMode: tasting.reveal_mode,
      })
    : null;
  const skipTo =
    skipPlanResult && !("error" in skipPlanResult)
      ? {
          wineId: skipPlanResult.targetId,
          glass: wines.findIndex((w) => w.id === skipPlanResult.targetId) + 1,
        }
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
        ? `after the ${lastRevealedStep.label.toLowerCase()}`
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
    paused,
    wineCount: wines.length,
    revealedCount,
    current,
    previous,
    skipTo,
    standings,
    standingsAfter,
    unrevealedGlasses,
  };

  const watermark = wines.reduce(
    (sum, w) => sum + (w.reveal_step ?? 0) + (w.is_revealed ? 1000 : 0),
    0,
  );

  return (
    <LiveShell active={tasting.status === "IN_PROGRESS"}>
      {tasting.timing_mode === "LIVE" ? (
        <RevealSync tastingId={tastingId} watermark={watermark} />
      ) : (
        <AutoRefresh />
      )}
      <HostConsole data={data} />
    </LiveShell>
  );
}
