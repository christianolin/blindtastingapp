import "server-only";

import { createClient } from "@/lib/supabase/server";
import { viewerCanSeeStandings } from "@/app/tastings/[id]/view-route";
import {
  eligibleForGlass,
  type EligibilityParticipant,
} from "@/lib/glass-eligibility";
import { GUESS_READ_COLUMNS } from "@/lib/guess-columns";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import {
  agreedLeastLine,
  bestGlassLines,
  excludedLines,
  glassTitle,
  hostedLines,
  placingLines,
  shortWineName,
  strongestLines,
  type ShareInput,
} from "@/lib/result-copy";
import {
  blindResult,
  blindTotals,
  semiBlindResult,
  semiBlindTotals,
  type AnswerFlags,
  type BlindGuessRow,
  type BlindResultGlass,
  type SemiBlindGuessRow,
  type SemiBlindResultGlass,
  type TastingResult,
} from "@/lib/result-math";
import {
  getSemiBlindRevealedPicks,
  type SemiBlindRevealedPick,
} from "@/lib/semi-blind-data";
import { rankRows } from "@/lib/stats-math";
import type { RevealMode } from "@/lib/supabase/database.types";
import { getTastingLeaderboard } from "@/lib/tasting-leaderboard";

// The result's data (S12, S12b; spec §11.3 items 8-10; refinement 18, 27).
// Everything a viewer needs to render is resolved and formatted HERE, on the
// server — `ResultView` (client, for Share) only lays out ready strings, so
// nothing about scoring or copy has to cross the RSC boundary as logic.
//
// Rule 1: `wine_answers` and `guesses` are only ever read for fully revealed
// glasses (`revealedWineIds`); a hidden or half-revealed glass never has its
// row fetched, let alone its answer key looked at.
//
// Refinement 27 ("an outsider never gets a board, not even an empty one"):
// `table` is the empty array — never a partial or placeholder one — for any
// viewer `viewerCanSeeStandings` refuses (no participant row and not the
// host). Every other field (the tasting-wide "agreed least" line, the
// excluded-glasses list) is not a board and stays visible to anyone who can
// already read the page under `wines`/`tastings` RLS.

export type TastingResultView = {
  mode: RevealMode;
  viewerRole: "competitor" | "host-provides-host" | "spectator";
  tastingName: string;
  placing: { ordinal: string; line: string } | null;
  hosted: { title: string; line: string } | null;
  table: { rank: number; tied: boolean; name: string; total: number; isViewer: boolean }[];
  bestGlass: { score: string; name: string } | null;
  strongest: { title: string; detail: string; caption: string } | null;
  agreedLeast: string | null;
  excluded: string[];
  share: ShareInput;
  resultsUrl: string;
};

function toAnswerFlags(row: {
  primary_grape_id: string;
  appellation_id: string | null;
  secondary_grape_id: string | null;
  producer_id: string | null;
  type_designation_id: string | null;
  vintage_kind: string | null;
} | undefined): AnswerFlags | null {
  if (!row) return null;
  return {
    primary_grape_id: row.primary_grape_id,
    appellation_id: row.appellation_id,
    secondary_grape_id: row.secondary_grape_id,
    producer_id: row.producer_id,
    type_designation_id: row.type_designation_id,
    vintage_kind: row.vintage_kind,
  };
}

function toBlindGuessRow(row: {
  wine_id: string;
  participant_id: string;
  primary_grape_id: string | null;
  country_points: number | null;
  region_points: number | null;
  appellation_points: number | null;
  primary_grape_points: number | null;
  secondary_grape_points: number | null;
  producer_points: number | null;
  type_designation_points: number | null;
  vintage_points: number | null;
  total_points: number | null;
}): BlindGuessRow {
  return {
    wine_id: row.wine_id,
    participant_id: row.participant_id,
    primary_grape_id: row.primary_grape_id,
    country_points: row.country_points,
    region_points: row.region_points,
    appellation_points: row.appellation_points,
    primary_grape_points: row.primary_grape_points,
    secondary_grape_points: row.secondary_grape_points,
    producer_points: row.producer_points,
    type_designation_points: row.type_designation_points,
    vintage_points: row.vintage_points,
    total_points: row.total_points,
  };
}

/**
 * The result (S12, S12b). Null when the tasting does not exist or is not
 * CLOSED — the caller (`ClosedSurface`, via `finished-view.tsx`) only
 * mounts this for a CLOSED tasting, so a null here means the data moved out
 * from under the render, not a normal case.
 */
export async function getTastingResult(tastingId: string): Promise<TastingResultView | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: tasting }, { data: participantRows }, { data: wineRows }] = await Promise.all([
    supabase
      .from("tastings")
      .select("id, name, host_id, wine_source, reveal_mode, status")
      .eq("id", tastingId)
      .maybeSingle(),
    supabase
      .from("tasting_participants")
      .select("id, user_id, status, joined_at")
      .eq("tasting_id", tastingId),
    supabase
      .from("wines")
      .select("id, position, is_revealed, reveal_step, contributor_participant_id, revealed_at")
      .eq("tasting_id", tastingId)
      .order("position"),
  ]);

  if (!tasting || tasting.status !== "CLOSED") return null;

  const participants = participantRows ?? [];
  const wines = wineRows ?? [];
  const viewer = user ? (participants.find((p) => p.user_id === user.id) ?? null) : null;
  const viewerId = viewer?.id ?? null;
  const isHost = user != null && tasting.host_id === user.id;
  const hostProvidesHost = isHost && tasting.wine_source === "HOST_PROVIDES";
  const isCompetitor = viewer?.status === "JOINED" && !hostProvidesHost;
  const viewerRole: TastingResultView["viewerRole"] = hostProvidesHost
    ? "host-provides-host"
    : isCompetitor
      ? "competitor"
      : "spectator";
  const mode: RevealMode = tasting.reveal_mode === "SEMI_BLIND" ? "SEMI_BLIND" : "BLIND";

  const wineIndexById = new Map(wines.map((w, i) => [w.id, i + 1]));
  const revealedWineIds = wines.filter((w) => w.is_revealed).map((w) => w.id);

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

  const [{ data: answerRows }, { data: guessRows }, leaderboard] = await Promise.all([
    revealedWineIds.length > 0
      ? supabase
          .from("wine_answers")
          .select(
            "wine_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id, type_designation_id, vintage_kind, catalog_wine_id",
          )
          .in("wine_id", revealedWineIds)
      : Promise.resolve({ data: [] as never[] }),
    revealedWineIds.length > 0 && mode === "BLIND"
      ? supabase.from("guesses").select(GUESS_READ_COLUMNS).in("wine_id", revealedWineIds)
      : Promise.resolve({ data: [] as never[] }),
    getTastingLeaderboard(tastingId),
  ]);

  const answerByWineId = new Map((answerRows ?? []).map((a) => [a.wine_id, a]));

  let result: TastingResult;
  let semiBlindPicks: SemiBlindRevealedPick[] = [];
  // Every participant's sum over the fully revealed glasses they could guess
  // (OD-3 (a)); the placing, the table and the host's winners rank by it.
  let finalTotals: Map<string, number>;
  const participantIds = participants.map((p) => p.id);

  if (mode === "SEMI_BLIND") {
    const picks = await getSemiBlindRevealedPicks(tastingId);
    // The RPC returns every row on a revealed glass with no eligibility
    // filter (a host-provides host's blank row, a contributor's own, a
    // non-JOINED row) — the loader filters, per BT-R2/BT-R3's shared rule.
    const eligibleSetByWineId = new Map(wines.map((w) => [w.id, new Set(eligibleIdsFor(w))]));
    semiBlindPicks = picks.filter((p) => eligibleSetByWineId.get(p.glassWineId)?.has(p.participantId) ?? false);

    // A glass's own key is the one an eligible correct pick carries. A
    // revealed glass nobody eligible matched has none (the board would hand
    // one only to a viewer on the list, and it would change nothing: no
    // eligible pick equals it). It still counts, its eligible rows at their
    // own 0, and never reads "never revealed" (BT-V3 A-29; `semiBlindResult`).
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
    result = semiBlindResult(semiGlasses, semiRows, viewerId);
    finalTotals = semiBlindTotals(semiGlasses, semiRows, participantIds);
  } else {
    const blindGlasses: BlindResultGlass[] = wines.map((w) => ({
      wineId: w.id,
      isRevealed: w.is_revealed,
      revealStep: w.reveal_step,
      eligibleParticipantIds: eligibleIdsFor(w),
      answer: toAnswerFlags(answerByWineId.get(w.id)),
    }));
    const blindRows: BlindGuessRow[] = (guessRows ?? []).map(toBlindGuessRow);
    result = blindResult(blindGlasses, blindRows, viewerId);
    finalTotals = blindTotals(blindGlasses, blindRows, participantIds);
  }

  // Competitors: JOINED, minus a HOST_PROVIDES host — the same rule
  // `standings-panel.tsx` uses. The leaderboard supplies names and ids only.
  // Its running totals still count a half-revealed glass's step points, so
  // the ranking uses `finalTotals` instead: the same fully-revealed-only basis
  // as `result.score` and `result.maximum` (OD-3 (a), owner 2026-09-14), and a
  // tasting ended mid-reveal never places anyone on that glass.
  const statusByParticipantId = new Map(participants.map((p) => [p.id, p.status]));
  const competitors = leaderboard.filter((r) => {
    if (statusByParticipantId.get(r.participantId) !== "JOINED") return false;
    if (tasting.wine_source === "HOST_PROVIDES" && r.userId === tasting.host_id) return false;
    return true;
  });
  const finalTotal = (participantId: string): number => finalTotals.get(participantId) ?? 0;
  const ranked = rankRows(competitors, (r) => finalTotal(r.participantId));
  const canSeeStandings = viewerCanSeeStandings({ isHost, viewer });
  const table: TastingResultView["table"] = canSeeStandings
    ? ranked.map(({ row, rank, tied }) => ({
        rank,
        tied,
        name: row.name,
        total: finalTotal(row.participantId),
        isViewer: viewer !== null && row.participantId === viewer.id,
      }))
    : [];

  let placing: TastingResultView["placing"] = null;
  let hosted: TastingResultView["hosted"] = null;
  let share: ShareInput = { kind: "hosted", tasting: tasting.name, winners: [] };

  if (viewerRole === "competitor" && viewerId) {
    const mine = ranked.find(({ row }) => row.participantId === viewerId);
    if (mine) {
      placing = placingLines({
        mode,
        rank: mine.rank,
        tied: mine.tied,
        competitors: competitors.length,
        score: result.score,
        maximum: result.maximum,
      });
      share = {
        kind: "placed",
        mode,
        ordinal: placing.ordinal,
        competitors: competitors.length,
        tasting: tasting.name,
        score: result.score,
        maximum: result.maximum,
      };
    }
  } else if (viewerRole === "host-provides-host") {
    const winnerRows = ranked.filter(({ rank }) => rank === 1);
    hosted = hostedLines({
      winners: winnerRows.map(({ row }) => row.name),
      points: winnerRows[0] ? finalTotal(winnerRows[0].row.participantId) : 0,
      mode,
    });
    share = { kind: "hosted", tasting: tasting.name, winners: winnerRows.map(({ row }) => row.name) };
  }

  // Names for the one or two specific glasses "Best glass" and "the table
  // agreed least on" name — never the whole flight (CLAUDE.md: never
  // preload appellations/producers; look up only what you render).
  const neededWineIds = Array.from(
    new Set(
      [result.bestGlass?.wineId, result.agreedLeast?.wineId].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  );
  const titleByWineId = new Map<string, string>();
  if (neededWineIds.length > 0) {
    const neededAnswers = neededWineIds
      .map((id) => answerByWineId.get(id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a));
    const catalogIds = neededAnswers
      .map((a) => a.catalog_wine_id)
      .filter((id): id is string => Boolean(id));
    const contributorParticipantIds = neededWineIds
      .map((id) => wines.find((w) => w.id === id)?.contributor_participant_id ?? null)
      .filter((id): id is string => Boolean(id));
    const contributorUserIds = contributorParticipantIds
      .map((pid) => participants.find((p) => p.id === pid)?.user_id)
      .filter((id): id is string => Boolean(id));

    const [{ data: catalogRows }, names, { data: contributorProfiles }] = await Promise.all([
      catalogIds.length > 0
        ? supabase.from("catalog_wines").select("id, wine_name").in("id", catalogIds)
        : Promise.resolve({ data: [] as { id: string; wine_name: string | null }[] }),
      lookupAppellationAndProducerNames({
        appellationIds: neededAnswers.map((a) => a.appellation_id),
        producerIds: neededAnswers.map((a) => a.producer_id),
      }),
      contributorUserIds.length > 0
        ? supabase.from("profiles").select("id, display_name").in("id", contributorUserIds)
        : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    ]);
    const wineNameByCatalogId = new Map((catalogRows ?? []).map((c) => [c.id, c.wine_name]));
    const profileNameByUserId = new Map((contributorProfiles ?? []).map((p) => [p.id, p.display_name]));

    for (const wineId of neededWineIds) {
      const answer = answerByWineId.get(wineId);
      const shortName = answer
        ? shortWineName({
            wineName: answer.catalog_wine_id ? (wineNameByCatalogId.get(answer.catalog_wine_id) ?? null) : null,
            appellation: answer.appellation_id ? (names.get(answer.appellation_id) ?? null) : null,
            producer: answer.producer_id ? (names.get(answer.producer_id) ?? null) : null,
          })
        : "";
      const wine = wines.find((w) => w.id === wineId);
      const contributorName = wine?.contributor_participant_id
        ? (profileNameByUserId.get(
            participants.find((p) => p.id === wine.contributor_participant_id)?.user_id ?? "",
          ) ?? null)
        : null;
      titleByWineId.set(
        wineId,
        glassTitle({ wineSource: tasting.wine_source, contributor: contributorName, shortName }),
      );
    }
  }

  const bestGlass = result.bestGlass
    ? bestGlassLines({
        points: result.bestGlass.points,
        max: result.bestGlass.max,
        glass: wineIndexById.get(result.bestGlass.wineId) ?? 0,
        name: titleByWineId.get(result.bestGlass.wineId) ?? "",
      })
    : null;

  const strongest: TastingResultView["strongest"] = result.strongestAttribute
    ? strongestLines(result.strongestAttribute)
    : null;

  let agreedLeast: string | null = null;
  if (result.agreedLeast) {
    const al = result.agreedLeast;
    const pickId = al.sentence.kind === "none" ? null : al.sentence.pickId;
    let pickLabel: string | null = null;
    if (pickId) {
      if (mode === "SEMI_BLIND") {
        pickLabel = semiBlindPicks.find((p) => p.pickKey === pickId)?.pickLabel ?? null;
      } else {
        const { data: grapeRow } = await supabase
          .from("grapes")
          .select("name")
          .eq("id", pickId)
          .maybeSingle();
        pickLabel = grapeRow?.name ?? null;
      }
    }
    agreedLeast = agreedLeastLine({
      glass: wineIndexById.get(al.wineId) ?? 0,
      title: titleByWineId.get(al.wineId) ?? "",
      mode,
      sentence: al.sentence,
      pickLabel,
    });
  }

  const excluded = excludedLines(
    result.excluded.map((e) => ({ glass: wineIndexById.get(e.wineId) ?? 0, reason: e.reason })),
  );

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const resultsUrl = `${base}/tastings/${tastingId}/results`;

  return {
    mode,
    viewerRole,
    tastingName: tasting.name,
    placing,
    hosted,
    table,
    bestGlass,
    strongest,
    agreedLeast,
    excluded,
    share,
    resultsUrl,
  };
}
