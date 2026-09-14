import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { LocalDateTime } from "@/components/local-date-time";
import { createClient } from "@/lib/supabase/server";
import {
  eligibleForGlass,
  joinedAfterReveal,
  type EligibilityParticipant,
} from "@/lib/glass-eligibility";
import { GUESS_READ_COLUMNS } from "@/lib/guess-columns";
import { getCategoryRatesByTasting } from "@/lib/record-history";
import { patternSentence, recordPattern, type CategoryRate } from "@/lib/record-pattern";
import {
  recordRowModel,
  type RecordRow,
  type RecordRowAnswer,
  type RecordViewerRole,
} from "@/lib/record-rows";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { GLASS_BY_GLASS, legendLabels } from "@/lib/result-copy";
import {
  attributeTally,
  blindResult,
  blindTotals,
  CATEGORY_ORDER,
  glassMarks,
  MARK_CATEGORIES,
  type AnswerFlags,
  type BlindGuessRow,
  type BlindResultGlass,
  type Mark,
  type ResultCategory,
  semiBlindResult,
  semiBlindTotals,
  type SemiBlindGuessRow,
  type SemiBlindResultGlass,
} from "@/lib/result-math";
import { getSemiBlindRevealedPicks } from "@/lib/semi-blind-data";
import { ordinal, rankRows } from "@/lib/stats-math";
import { getTastingLeaderboard } from "@/lib/tasting-leaderboard";
import { RecordActionsBar } from "./record-actions-bar";

// The record (S13, S13b; spec §11.3 items 11-16; ledger B10). Rendered on the
// CLOSED running page once the result is dismissed (`finished-view.tsx`, via
// `ClosedSurface`) and at `/tastings/[id]/results` for a CLOSED tasting
// (`results/page.tsx`). Parchment, server: every string is resolved here so
// nothing about scoring crosses to a client component (mirrors
// `tasting-result.ts` / `ResultView`'s split for the result screen).
//
// The chevron/row link goes to `/tastings/{id}/results/{n}` (S13c) on every
// viewport for now — BT-R5 adds that route and the laptop in-place
// expansion (RECORD-22, not this task's to close); until it lands the link
// is inert on a laptop the same way any not-yet-built route would be.
//
// Refinement 27 ("an outsider never gets a board, not even an empty one"):
// this view never renders a leaderboard, only the viewer's OWN totals — and
// those are already null for anyone `viewerRole` leaves as "spectator", so
// there is nothing further to gate. `viewerCanSeeStandings` is not needed
// here the way it is in `running-view.tsx` / `finished-view.tsx`.

const MARK_LETTER: Readonly<
  Record<"country" | "region" | "appellation" | "primary_grape" | "producer" | "vintage", string>
> = {
  country: "C",
  region: "R",
  appellation: "A",
  primary_grape: "G",
  producer: "P",
  vintage: "V",
};

const WEIGHTS = "C 2 · R 3 · A 5 · G 8 · P 6 · V 2"; // (spec copy)
const WEIGHTS_TAIL =
  "26 across these six, and 30 a glass once a secondary grape and a type designation are in play"; // (spec copy)

const isText = (value: string | null | undefined): value is string =>
  value != null && value.trim() !== "";

function vintageLabel(row: {
  vintage_kind: string | null;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
}): string {
  if (row.vintage_kind === "YEAR") return row.vintage_year != null ? String(row.vintage_year) : "—";
  if (row.vintage_kind === "NV") return "NV";
  if (row.vintage_kind === "TAWNY") {
    return row.vintage_tawny_years != null ? `${row.vintage_tawny_years}-year tawny` : "Tawny";
  }
  return "—";
}

/** "Tonight" vs a calendar date (item 12): within the last 24 hours, in
 *  absolute duration — not a viewer-timezone calendar-day check, so no
 *  client component is needed for this half of the header. A helper (not
 *  inline in the component body) keeps the `Date.now()` read out of
 *  render's own purity check. */
function finishedRecently(finishedAt: string | null): boolean {
  if (!finishedAt) return false;
  return Date.now() - Date.parse(finishedAt) < 24 * 60 * 60 * 1000;
}

function Unavailable(): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 p-6 sm:p-8">
      <p className="text-sm text-muted-foreground">
        This tasting&apos;s record is not available yet.
      </p>
    </div>
  );
}

export async function RecordView({
  tastingId,
}: {
  tastingId: string;
}): Promise<React.JSX.Element> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <Unavailable />;

  const [{ data: tasting }, { data: participantRows }, { data: wineRows }] = await Promise.all([
    supabase
      .from("tastings")
      .select("id, name, host_id, wine_source, reveal_mode, status, started_at, finished_at")
      .eq("id", tastingId)
      .maybeSingle(),
    supabase
      .from("tasting_participants")
      .select("id, user_id, status, joined_at")
      .eq("tasting_id", tastingId),
    supabase
      .from("wines")
      .select("id, position, is_revealed, reveal_step, contributor_participant_id, revealed_at, created_at")
      .eq("tasting_id", tastingId)
      .order("position"),
  ]);
  // Every caller only mounts this once the tasting is CLOSED
  // (finished-view.tsx / results/page.tsx both check first); this is the
  // same defensive "the data moved out from under the render" guard
  // `getTastingResult` uses.
  if (!tasting || tasting.status !== "CLOSED") return <Unavailable />;

  const participants = participantRows ?? [];
  const wines = wineRows ?? [];
  const viewer = participants.find((p) => p.user_id === user.id) ?? null;
  const viewerId = viewer?.id ?? null;
  const isHost = tasting.host_id === user.id;
  const hostProvidesHost = isHost && tasting.wine_source === "HOST_PROVIDES";
  const isCompetitor = viewer?.status === "JOINED" && !hostProvidesHost;
  const tastingViewerRole: RecordViewerRole = hostProvidesHost
    ? "host-provides-host"
    : isCompetitor
      ? "competitor"
      : "spectator";
  const mode: "BLIND" | "SEMI_BLIND" = tasting.reveal_mode === "SEMI_BLIND" ? "SEMI_BLIND" : "BLIND";
  const canManage = isHost || viewer?.status === "JOINED";

  const eligibilityParticipants: EligibilityParticipant[] = participants.map((p) => ({
    id: p.id,
    userId: p.user_id,
    status: p.status,
    joinedAt: p.joined_at,
  }));
  const eligibleIdsFor = (wine: {
    contributor_participant_id: string | null;
    is_revealed: boolean;
    revealed_at: string | null;
  }): string[] =>
    eligibilityParticipants
      .filter((p) =>
        eligibleForGlass(
          p,
          {
            contributorParticipantId: wine.contributor_participant_id,
            isRevealed: wine.is_revealed,
            revealedAt: wine.revealed_at,
          },
          { wineSource: tasting.wine_source, hostId: tasting.host_id },
        ),
      )
      .map((p) => p.id);

  const revealedWineIds = wines.filter((w) => w.is_revealed).map((w) => w.id);

  const [{ data: answerRows }, { data: profileRows }] = await Promise.all([
    revealedWineIds.length > 0
      ? supabase
          .from("wine_answers")
          .select(
            "wine_id, country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years, catalog_wine_id, unidentified_wine_id, image_url",
          )
          .in("wine_id", revealedWineIds)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", participants.length > 0 ? participants.map((p) => p.user_id) : [""]),
  ]);
  const answerByWineId = new Map((answerRows ?? []).map((a) => [a.wine_id, a]));
  const displayNameByUserId = new Map((profileRows ?? []).map((p) => [p.id, p.display_name]));
  const displayNameByParticipantId = new Map(
    participants.map((p) => [p.id, displayNameByUserId.get(p.user_id) ?? "Someone"]),
  );

  // Reference names: countries/regions/grapes are small enough to preload in
  // full (CLAUDE.md); appellations and producers are looked up only for the
  // ids the record actually renders.
  const [{ data: regions }, { data: grapes }, referenceNames] = await Promise.all([
    supabase.from("regions").select("id, name"),
    supabase.from("grapes").select("id, name"),
    lookupAppellationAndProducerNames({
      appellationIds: (answerRows ?? []).map((a) => a.appellation_id),
      producerIds: (answerRows ?? []).map((a) => a.producer_id),
    }),
  ]);
  const regionNameById = new Map((regions ?? []).map((r) => [r.id, r.name]));
  const grapeNameById = new Map((grapes ?? []).map((g) => [g.id, g.name]));

  // A revealed wine's name and photo fallback live on whichever of the two
  // identity tables its answer points at (D3: a catalog match, or an
  // unidentified draft) — the same photo-fallback shape `results/page.tsx`
  // and `export.csv/route.ts` already use.
  const catalogIds = [
    ...new Set((answerRows ?? []).map((a) => a.catalog_wine_id).filter((id): id is string => Boolean(id))),
  ];
  const unidentifiedIds = [
    ...new Set(
      (answerRows ?? []).map((a) => a.unidentified_wine_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  const [{ data: catalogRows }, { data: unidentifiedRows }] = await Promise.all([
    catalogIds.length > 0
      ? supabase.from("catalog_wines").select("id, wine_name, image_url").in("id", catalogIds)
      : Promise.resolve({ data: [] as { id: string; wine_name: string | null; image_url: string | null }[] }),
    unidentifiedIds.length > 0
      ? supabase.from("catalog_wines_unidentified").select("id, wine_name").in("id", unidentifiedIds)
      : Promise.resolve({ data: [] as { id: string; wine_name: string | null }[] }),
  ]);
  const wineNameByCatalogId = new Map((catalogRows ?? []).map((c) => [c.id, c.wine_name]));
  const imageByCatalogId = new Map((catalogRows ?? []).map((c) => [c.id, c.image_url]));
  const wineNameByUnidentifiedId = new Map((unidentifiedRows ?? []).map((c) => [c.id, c.wine_name]));

  function toAnswerFlags(wineId: string): AnswerFlags | null {
    const a = answerByWineId.get(wineId);
    if (!a) return null;
    return {
      primary_grape_id: a.primary_grape_id,
      appellation_id: a.appellation_id,
      secondary_grape_id: a.secondary_grape_id,
      producer_id: a.producer_id,
      type_designation_id: a.type_designation_id,
      vintage_kind: a.vintage_kind,
    };
  }

  function toRecordAnswer(wineId: string): RecordRowAnswer | null {
    const a = answerByWineId.get(wineId);
    if (!a) return null;
    const wineName = a.catalog_wine_id
      ? (wineNameByCatalogId.get(a.catalog_wine_id) ?? null)
      : a.unidentified_wine_id
        ? (wineNameByUnidentifiedId.get(a.unidentified_wine_id) ?? null)
        : null;
    return {
      producer: a.producer_id ? (referenceNames.get(a.producer_id) ?? "—") : "—",
      wineName,
      vintage: vintageLabel(a),
      appellation: a.appellation_id ? (referenceNames.get(a.appellation_id) ?? null) : null,
      region: regionNameById.get(a.region_id) ?? "—",
      grape: [
        grapeNameById.get(a.primary_grape_id) ?? "",
        a.secondary_grape_id ? (grapeNameById.get(a.secondary_grape_id) ?? "") : null,
      ]
        .filter(isText)
        .join(" / "),
    };
  }

  function imageUrlFor(wineId: string): string | null {
    const a = answerByWineId.get(wineId);
    if (!a) return null;
    return (a.image_url as string | null) ?? (a.catalog_wine_id ? (imageByCatalogId.get(a.catalog_wine_id) ?? null) : null);
  }

  // ── Score, marks and (semi-blind) picks, exactly the maths the result uses ──

  let blindGuessRows: BlindGuessRow[] = [];
  let semiBlindPicks: Awaited<ReturnType<typeof getSemiBlindRevealedPicks>> = [];
  let score = 0;
  let maximum = 0;
  const pointsByWineId = new Map<string, number>();
  const markCategoriesByWineId = new Map<string, Record<ResultCategory, Mark>>();
  const pickLabelByWineId = new Map<string, string | null>();
  let notEligibleWineIds = new Set<string>();
  let excludedWineIds = new Set<string>();
  let currentRates: CategoryRate[] = [];
  // Every participant's sum over the fully revealed glasses they could guess
  // (OD-3 (a)); the header's placing ranks by it (see the header below).
  let finalTotals = new Map<string, number>();
  const participantIds = participants.map((p) => p.id);

  if (mode === "BLIND") {
    const { data: guessRows } =
      revealedWineIds.length > 0
        ? await supabase.from("guesses").select(GUESS_READ_COLUMNS).in("wine_id", revealedWineIds)
        : { data: [] as never[] };
    blindGuessRows = (guessRows ?? []) as unknown as BlindGuessRow[];

    const blindGlasses: BlindResultGlass[] = wines.map((w) => ({
      wineId: w.id,
      isRevealed: w.is_revealed,
      revealStep: w.reveal_step,
      eligibleParticipantIds: eligibleIdsFor(w),
      answer: toAnswerFlags(w.id),
    }));
    const result = blindResult(blindGlasses, blindGuessRows, viewerId);
    finalTotals = blindTotals(blindGlasses, blindGuessRows, participantIds);
    score = result.score;
    maximum = result.maximum;
    for (const g of result.glasses) pointsByWineId.set(g.wineId, g.points);
    notEligibleWineIds = new Set(result.notEligible);
    excludedWineIds = new Set(result.excluded.map((e) => e.wineId));

    const rowByKey = new Map(blindGuessRows.map((r) => [`${r.wine_id}:${r.participant_id}`, r]));
    if (viewerId) {
      for (const wineId of revealedWineIds) {
        const answer = toAnswerFlags(wineId);
        if (!answer) continue;
        const row = rowByKey.get(`${wineId}:${viewerId}`) ?? null;
        markCategoriesByWineId.set(wineId, glassMarks(answer, row));
      }
    }

    if (isCompetitor && viewerId) {
      const tally = attributeTally(blindGlasses, blindGuessRows, viewerId);
      currentRates = CATEGORY_ORDER.map((category) => ({
        category,
        hits: tally[category].hits,
        inPlay: tally[category].inPlay,
      }));
    }
  } else {
    const picks = await getSemiBlindRevealedPicks(tastingId);
    const eligibleSetByWineId = new Map(wines.map((w) => [w.id, new Set(eligibleIdsFor(w))]));
    semiBlindPicks = picks.filter(
      (p) => eligibleSetByWineId.get(p.glassWineId)?.has(p.participantId) ?? false,
    );

    // A glass's own key is the one an eligible correct pick carries. A
    // revealed glass nobody eligible matched has none (the board would hand
    // one only to a viewer on the list, and it would change nothing: no
    // eligible pick equals it). It still counts, its eligible rows at their
    // own 0, and its row shows the identity from `wine_answers`, never
    // "never revealed" (BT-V3 A-29; `semiBlindResult`).
    const candidateKeyByWineId = new Map<string, string>();
    for (const pick of semiBlindPicks) {
      if (pick.correct && pick.pickKey && !candidateKeyByWineId.has(pick.glassWineId)) {
        candidateKeyByWineId.set(pick.glassWineId, pick.pickKey);
      }
    }

    const semiGlasses: SemiBlindResultGlass[] = wines.map((w) => ({
      wineId: w.id,
      isRevealed: w.is_revealed,
      revealStep: w.reveal_step,
      eligibleParticipantIds: eligibleIdsFor(w),
      candidateKey: candidateKeyByWineId.get(w.id) ?? null,
    }));
    const semiRows: SemiBlindGuessRow[] = semiBlindPicks.map((p) => ({
      wine_id: p.glassWineId,
      participant_id: p.participantId,
      pick_key: p.pickKey,
      total_points: p.correct ? 1 : 0,
    }));
    const result = semiBlindResult(semiGlasses, semiRows, viewerId);
    finalTotals = semiBlindTotals(semiGlasses, semiRows, participantIds);
    score = result.score;
    maximum = result.maximum;
    for (const g of result.glasses) pointsByWineId.set(g.wineId, g.points);
    notEligibleWineIds = new Set(result.notEligible);
    excludedWineIds = new Set(result.excluded.map((e) => e.wineId));

    for (const wineId of revealedWineIds) {
      const mine = semiBlindPicks.find((p) => p.glassWineId === wineId && p.participantId === viewerId);
      pickLabelByWineId.set(wineId, mine?.pickLabel ?? null);
    }
  }

  // ── Header: date, host line, "N tasters", placing ──────────────────────────

  // The leaderboard supplies the competitors' ids only. Its running totals
  // still count a half-revealed glass's step points, so the placing ranks by
  // `finalTotals`, the same fully-revealed-only basis as "{score} of
  // {maximum}" (OD-3 (a), owner 2026-09-14; `tasting-result.ts` does the same).
  const leaderboard = await getTastingLeaderboard(tastingId);
  const statusByParticipantId = new Map(participants.map((p) => [p.id, p.status]));
  const competitors = leaderboard.filter((r) => {
    if (statusByParticipantId.get(r.participantId) !== "JOINED") return false;
    if (tasting.wine_source === "HOST_PROVIDES" && r.userId === tasting.host_id) return false;
    return true;
  });
  const ranked = rankRows(competitors, (r) => finalTotals.get(r.participantId) ?? 0);
  const mine = viewerId ? ranked.find(({ row }) => row.participantId === viewerId) : undefined;

  const hostDisplayName = displayNameByUserId.get(tasting.host_id) ?? "The host";
  const isRecent = finishedRecently(tasting.finished_at);
  const hostedBy = isHost ? "you hosted" : `${hostDisplayName} hosted`;
  const tasterWord = competitors.length === 1 ? "taster" : "tasters";

  // ── Pattern sentence (RECORD-11) ────────────────────────────────────────────

  let pattern: ReturnType<typeof recordPattern> = null;
  if (mode === "BLIND" && isCompetitor) {
    const earlier = await getCategoryRatesByTasting(user.id, tastingId);
    pattern = recordPattern(currentRates, earlier);
  }

  // ── Rows, one per glass in list order ───────────────────────────────────────

  const imageByGlassNumber = new Map<number, string | null>();
  const rows: RecordRow[] = wines.map((w, i) => {
    const glassNumber = i + 1;
    imageByGlassNumber.set(glassNumber, w.is_revealed ? imageUrlFor(w.id) : null);

    const contributorName = w.contributor_participant_id
      ? (displayNameByParticipantId.get(w.contributor_participant_id) ?? null)
      : null;
    const addedWhilePouring = Boolean(
      tasting.started_at && w.created_at && Date.parse(w.created_at) > Date.parse(tasting.started_at),
    );
    const answer = w.is_revealed && !excludedWineIds.has(w.id) ? toRecordAnswer(w.id) : null;

    const viewerParticipant = viewerId
      ? eligibilityParticipants.find((p) => p.id === viewerId)
      : undefined;
    const joinedAfter =
      isCompetitor && viewerParticipant
        ? joinedAfterReveal(viewerParticipant, {
            contributorParticipantId: w.contributor_participant_id,
            isRevealed: w.is_revealed,
            revealedAt: w.revealed_at,
          })
        : false;

    const rowRole: RecordViewerRole =
      tastingViewerRole !== "competitor"
        ? tastingViewerRole
        : notEligibleWineIds.has(w.id)
          ? "spectator"
          : "competitor";

    const marksForWine = markCategoriesByWineId.get(w.id);
    const marks: Mark[] = MARK_CATEGORIES.map((c) => marksForWine?.[c] ?? "out");

    return recordRowModel({
      glass: {
        number: glassNumber,
        isRevealed: w.is_revealed,
        contributor: contributorName,
        addedWhilePouring,
      },
      answer,
      marks,
      points: pointsByWineId.get(w.id) ?? 0,
      pickLabel: pickLabelByWineId.get(w.id) ?? null,
      mode,
      viewerRole: rowRole,
      joinedAfter,
    });
  });

  const legendPhone = legendLabels({ phone: true });
  const legendDesktop = legendLabels({ phone: false });
  const footerTail = pattern ? patternSentence(pattern) : WEIGHTS_TAIL;

  const revealedCount = revealedWineIds.length;
  const { data: existingNotes } =
    canManage && revealedWineIds.length > 0
      ? await supabase
          .from("wset_notes")
          .select("tasting_wine_id")
          .eq("author_id", user.id)
          .in("tasting_wine_id", revealedWineIds)
      : { data: [] as { tasting_wine_id: string | null }[] };
  const alreadySaved = new Set(
    (existingNotes ?? []).map((n) => n.tasting_wine_id).filter((id): id is string => Boolean(id)),
  ).size;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {isRecent ? (
              "Tonight"
            ) : (
              <LocalDateTime iso={tasting.finished_at ?? tasting.started_at ?? ""} format="day-month" />
            )}
            {" · "}
            {hostedBy}
            {" · "}
            {competitors.length} {tasterWord}
          </p>
          <h1 className="mt-1 font-heading text-2xl font-semibold sm:text-3xl">{tasting.name}</h1>
        </div>
        <div className="text-left sm:text-right">
          {tastingViewerRole === "host-provides-host" ? (
            <p className="font-heading text-xl font-semibold">You hosted</p>
          ) : tastingViewerRole === "competitor" && mine ? (
            <>
              <p className="font-heading text-2xl font-semibold text-primary">
                {score} of {maximum}
                {mode === "SEMI_BLIND" ? " matched" : ""}
              </p>
              <p className="text-sm text-muted-foreground">
                {mine.tied ? "=" : ""}
                {ordinal(mine.rank)} of {competitors.length}
              </p>
            </>
          ) : null}
        </div>
      </div>

      <Card className="overflow-hidden py-0">
        <CardHeader className="border-b border-border/70 py-4">
          <CardTitle className="font-heading text-xl">{GLASS_BY_GLASS}</CardTitle>
          {/* Laptop legend: two tiles plus the weights + tail sentence. */}
          <div className="mt-2 hidden items-center gap-4 text-xs text-muted-foreground lg:flex">
            <span className="flex items-center gap-1.5">
              <span className="inline-flex size-4 items-center justify-center rounded-[3px] bg-primary text-[10px] font-semibold text-primary-foreground">
                C
              </span>
              {legendDesktop.hit}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex size-4 items-center justify-center rounded-[3px] bg-border-light text-[10px] font-semibold text-placeholder">
                C
              </span>
              {legendDesktop.miss}
            </span>
            <span>
              {WEIGHTS} — {WEIGHTS_TAIL}
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border/60 p-0">
          {rows.map((row) => (
            <RecordGlassRow
              key={row.glass}
              row={row}
              tastingId={tastingId}
              legend={legendPhone}
              imageUrl={imageByGlassNumber.get(row.glass) ?? null}
            />
          ))}
        </CardContent>
      </Card>

      {/* Phone footer: the weights line, with the pattern sentence in place
          of the plain weights tail when one exists. */}
      <p className="text-xs text-muted-foreground lg:hidden">
        {WEIGHTS} — {footerTail}
      </p>
      {pattern ? (
        <p className="hidden text-sm text-muted-foreground lg:block">{patternSentence(pattern)}</p>
      ) : null}

      {canManage ? (
        <RecordActionsBar tastingId={tastingId} revealedCount={revealedCount} alreadySaved={alreadySaved} />
      ) : null}

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

function RecordGlassRow({
  row,
  tastingId,
  legend,
  imageUrl,
}: {
  row: RecordRow;
  tastingId: string;
  legend: { hit: string; miss: string };
  imageUrl: string | null;
}): React.JSX.Element {
  if (row.kind === "never-revealed") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground">
        <span className="w-6 shrink-0 text-right tabular-nums">{row.glass}</span>
        <span>Glass {row.glass} · never revealed</span>
      </div>
    );
  }

  if (row.kind === "joined-after") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 text-sm">
        <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{row.glass}</span>
        <span className="flex-1 text-muted-foreground">You joined after this glass</span>
        <span className="font-heading tabular-nums text-muted-foreground">0</span>
      </div>
    );
  }

  return (
    <Link
      href={`/tastings/${tastingId}/results/${row.glass}`}
      className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/40"
    >
      <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{row.glass}</span>
      <HatchThumb src={imageUrl} width={40} height={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{row.identity}</span>
        {row.meta ? (
          <span className="hidden truncate text-xs text-muted-foreground sm:block">{row.meta}</span>
        ) : null}
        {row.provenance ? (
          <span className="block truncate text-xs text-muted-foreground">{row.provenance}</span>
        ) : null}
      </span>
      {row.kind === "blind" ? (
        <span className="hidden items-center gap-1 sm:flex">
          {MARK_CATEGORIES.map((category, i) => (
            <span
              key={category}
              title={`${MARK_LETTER[category as keyof typeof MARK_LETTER]}: ${row.marks[i] === "hit" ? legend.hit : legend.miss}`}
              className={
                row.marks[i] === "hit"
                  ? "inline-flex size-5 items-center justify-center rounded-[3px] bg-primary text-[10px] font-semibold text-primary-foreground"
                  : "inline-flex size-5 items-center justify-center rounded-[3px] bg-border-light text-[10px] font-semibold text-placeholder"
              }
            >
              {MARK_LETTER[category as keyof typeof MARK_LETTER]}
            </span>
          ))}
        </span>
      ) : null}
      {row.kind === "semi-blind" ? (
        <span className="flex flex-col items-end text-xs text-muted-foreground">
          <span>{row.hit ? "✓" : "✗"}</span>
          {!row.hit && row.pickLabel ? <span>you said {row.pickLabel}</span> : null}
        </span>
      ) : null}
      {row.kind === "blind" || row.kind === "semi-blind" ? (
        <span className="shrink-0 font-heading text-base font-semibold tabular-nums">
          {row.kind === "semi-blind" ? (row.points > 0 ? "1" : "0") : row.points}
        </span>
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground lg:hidden" aria-hidden />
    </Link>
  );
}
