// Everything the Overview page (/overview) renders, assembled for one user in
// three round trips of parallel queries. Every number is computed from rows
// the signed-in user can already read under RLS, or from the existing
// SECURITY DEFINER RPCs (get_tasting_leaderboard, get_wine_reveal) — no
// elevated client, no new migrations. Counts are always taken from the
// fetched arrays rather than PostgREST count headers, so a filter that cannot
// be expressed server-side (distinct producers, "JOINED minus host", …) is
// never approximated.
import { createClient } from "@/lib/supabase/server";
import { getProfileStats } from "@/lib/profile-stats";
import { getTastingLeaderboard, type LeaderboardRow } from "@/lib/tasting-leaderboard";
import { catalogWineTitle } from "@/lib/wset/queries";
import { makeWineLabeler } from "@/lib/wine-label";
import { competitorRank, foldOther, percent, wineTypeLabel } from "@/lib/stats-math";
import {
  bannerStage,
  isRunningStatus,
  orderTastingRows,
  pickLiveTasting,
  pickNextTasting,
} from "@/lib/overview-math";
import type {
  CellarRecent,
  CellarTile,
  DistributionItem,
  OverviewBanner,
  OverviewCellar,
  OverviewData,
  OverviewRatings,
  OverviewTastings,
  RatingRow,
  TastingRow,
} from "@/lib/overview-types";
import type {
  ParticipantStatus,
  RevealMode,
  TastingStatus,
  TimingMode,
  VintageKind,
  WineSourceMode,
} from "@/lib/supabase/database.types";

const ROW_CAP = 5;
const FLIGHT_SLOTS = 6;
const RATING_ROWS = 5;
const CELLAR_TILES = 4;
const CELLAR_RECENT = 3;
const DISTRIBUTION_KEEP = 3;
const HOST_FALLBACK = "Someone";

type TastingRowDb = {
  id: string;
  name: string;
  host_id: string;
  timing_mode: TimingMode;
  wine_source: WineSourceMode;
  reveal_mode: RevealMode;
  status: TastingStatus;
  scheduled_at: string | null;
  created_at: string;
};

type WineRowDb = {
  id: string;
  tasting_id: string;
  position: number;
  is_revealed: boolean;
  reveal_step: number;
  contributor_participant_id: string | null;
};

type ParticipantRowDb = {
  id: string;
  tasting_id: string;
  user_id: string;
  status: ParticipantStatus;
};

/** A tasting I take part in, with my own participant row folded in. */
type MyTasting = TastingRowDb & {
  myStatus: ParticipantStatus;
  myParticipantId: string;
  hostId: string;
  myId: string;
};

// PostgREST embeds arrive as a single object or a one-element array depending
// on the client version (same normalisation as cellar/page.tsx).
type Rel = { name: string } | { name: string }[] | null;
function relName(rel: Rel | undefined): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}
function unwrap<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

type CatalogEmbed = {
  wine_name: string | null;
  vintage_kind: VintageKind;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  image_url: string | null;
  producer: Rel;
  appellation: Rel;
};

function embedTitle(c: CatalogEmbed | null): string {
  if (!c) return "Untitled wine";
  return catalogWineTitle({
    producerName: relName(c.producer),
    wineName: c.wine_name,
    vintageKind: c.vintage_kind,
    vintageYear: c.vintage_year,
    vintageTawnyYears: c.vintage_tawny_years,
    appellationName: relName(c.appellation),
  });
}

type NoteRowDb = {
  id: string;
  catalog_wine_id: string;
  tasted_on: string;
  quality_score: number | null;
  context_kind: "OPEN" | "BLIND" | "TRAINING";
  catalog_wines: CatalogEmbed | CatalogEmbed[] | null;
};

type LotEmbed = CatalogEmbed & {
  colour: string | null;
  style: string | null;
  producer_id: string | null;
  country_id: string | null;
  country: Rel;
};

type LotRowDb = {
  id: string;
  catalog_wine_id: string;
  quantity: number;
  storage_location: string | null;
  created_at: string;
  catalog_wines: LotEmbed | LotEmbed[] | null;
};

// Soonest scheduled first, unscheduled after (newest created first) — the
// order the card lists invitations and drafts in.
function bySchedule(a: TastingRowDb, b: TastingRowDb): number {
  if (a.scheduled_at && b.scheduled_at) return a.scheduled_at.localeCompare(b.scheduled_at);
  if (a.scheduled_at) return -1;
  if (b.scheduled_at) return 1;
  return b.created_at.localeCompare(a.created_at);
}

const byNewest = (a: { created_at: string }, b: { created_at: string }) =>
  b.created_at.localeCompare(a.created_at);

const byPosition = (a: { position: number }, b: { position: number }) =>
  a.position - b.position;

/**
 * The StandingsPanel competitor rule: JOINED participants, minus the host of
 * a host-provides tasting (they set the answers and don't guess).
 */
function competitorsOf(
  leaderboard: LeaderboardRow[],
  participants: ParticipantRowDb[],
  tasting: Pick<TastingRowDb, "host_id" | "wine_source">,
): LeaderboardRow[] {
  const statusById = new Map(participants.map((p) => [p.id, p.status]));
  const hostProvides = tasting.wine_source === "HOST_PROVIDES";
  return leaderboard.filter((r) => {
    if (statusById.get(r.participantId) !== "JOINED") return false;
    if (hostProvides && r.userId === tasting.host_id) return false;
    return true;
  });
}

function myStanding(
  leaderboard: LeaderboardRow[],
  participants: ParticipantRowDb[],
  tasting: MyTasting,
): { rank: number; competitors: number; points: number; matchedOf?: number } | null {
  const competitors = competitorsOf(leaderboard, participants, tasting);
  const ranked = competitorRank(
    competitors.map((r) => ({ participantId: r.participantId, total: r.total })),
    tasting.myParticipantId,
  );
  if (!ranked) return null;
  const mine = competitors.find((r) => r.participantId === tasting.myParticipantId);
  const points = mine?.total ?? 0;
  return tasting.reveal_mode === "SEMI_BLIND"
    ? { rank: ranked.rank, competitors: ranked.of, points, matchedOf: mine?.totalWines ?? 0 }
    : { rank: ranked.rank, competitors: ranked.of, points };
}

export async function getOverviewData(userId: string): Promise<OverviewData> {
  const supabase = await createClient();
  const now = new Date();

  // Round 1 — which tastings am I in at all.
  const { data: myParticipantRows } = await supabase
    .from("tasting_participants")
    .select("id, tasting_id, status")
    .eq("user_id", userId);
  const mine = myParticipantRows ?? [];
  const tastingIds = [...new Set(mine.map((p) => p.tasting_id))];
  const myParticipantIds = mine.map((p) => p.id);
  const myRowByTastingId = new Map(mine.map((p) => [p.tasting_id, p]));

  // Round 2 — everything that only depends on those ids, in parallel.
  const [
    { data: tastingRows },
    { data: wineRows },
    { data: participantRows },
    { data: myGuessRows },
    profileStats,
    { data: noteRows },
    { data: noteStatRows },
    { data: lotRows },
  ] = await Promise.all([
    supabase
      .from("tastings")
      .select(
        "id, name, host_id, timing_mode, wine_source, reveal_mode, status, scheduled_at, created_at",
      )
      .in("id", tastingIds.length ? tastingIds : [""]),
    supabase
      .from("wines")
      .select("id, tasting_id, position, is_revealed, reveal_step, contributor_participant_id")
      .in("tasting_id", tastingIds.length ? tastingIds : [""]),
    supabase
      .from("tasting_participants")
      .select("id, tasting_id, user_id, status")
      .in("tasting_id", tastingIds.length ? tastingIds : [""]),
    supabase
      .from("guesses")
      .select("wine_id, participant_id, scored_at")
      .in("participant_id", myParticipantIds.length ? myParticipantIds : [""]),
    getProfileStats(userId),
    supabase
      .from("wset_notes")
      .select(
        "id, catalog_wine_id, tasted_on, quality_score, context_kind, " +
          "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, image_url, " +
          "producer:producers(name), appellation:appellations(name))",
      )
      .eq("author_id", userId)
      .order("tasted_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(RATING_ROWS),
    // The header stats need every note, but only two columns and no joins —
    // the embedded query above is capped at the five rows the card renders.
    // (PostgREST still pages at 1000 rows; a notebook that large would need
    // .range() paging here.)
    supabase
      .from("wset_notes")
      .select("catalog_wine_id, quality_score")
      .eq("author_id", userId),
    supabase
      .from("cellar_lots")
      .select(
        "id, catalog_wine_id, quantity, storage_location, created_at, " +
          "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, image_url, colour, style, producer_id, country_id, " +
          "producer:producers(name), appellation:appellations(name), country:countries(name))",
      )
      .eq("owner_id", userId)
      .gt("quantity", 0)
      .order("created_at", { ascending: false }),
  ]);

  const tastings: MyTasting[] = ((tastingRows ?? []) as TastingRowDb[]).flatMap((t) => {
    const me = myRowByTastingId.get(t.id);
    if (!me) return [];
    return [{ ...t, myStatus: me.status, myParticipantId: me.id, hostId: t.host_id, myId: userId }];
  });
  const wines = (wineRows ?? []) as WineRowDb[];
  const participants = (participantRows ?? []) as ParticipantRowDb[];

  const winesByTastingId = new Map<string, WineRowDb[]>();
  for (const w of wines) {
    const list = winesByTastingId.get(w.tasting_id) ?? [];
    list.push(w);
    winesByTastingId.set(w.tasting_id, list);
  }
  for (const list of winesByTastingId.values()) list.sort(byPosition);
  const winesOf = (tastingId: string) => winesByTastingId.get(tastingId) ?? [];

  const participantsByTastingId = new Map<string, ParticipantRowDb[]>();
  for (const p of participants) {
    const list = participantsByTastingId.get(p.tasting_id) ?? [];
    list.push(p);
    participantsByTastingId.set(p.tasting_id, list);
  }
  const participantsOf = (tastingId: string) => participantsByTastingId.get(tastingId) ?? [];
  const joinedOf = (tastingId: string) =>
    participantsOf(tastingId).filter((p) => p.status === "JOINED");

  const myGuessedWineIds = new Set((myGuessRows ?? []).map((g) => g.wine_id));

  // There is no closed_at column, so "when it finished" is my latest scored
  // guess in that tasting (reveal_wine stamps every guess for a wine in one
  // transaction), then the schedule (the host of a host-provides tasting never
  // guesses), then creation as the last resort.
  const tastingIdByParticipantId = new Map(mine.map((p) => [p.id, p.tasting_id]));
  const lastScoredAtByTastingId = new Map<string, string>();
  for (const g of myGuessRows ?? []) {
    if (!g.scored_at) continue;
    const tastingId = tastingIdByParticipantId.get(g.participant_id);
    if (!tastingId) continue;
    const prev = lastScoredAtByTastingId.get(tastingId);
    if (!prev || g.scored_at.localeCompare(prev) > 0) {
      lastScoredAtByTastingId.set(tastingId, g.scored_at);
    }
  }
  const finishedAtOf = (t: MyTasting) =>
    lastScoredAtByTastingId.get(t.id) ?? t.scheduled_at ?? t.created_at;

  // --- Which tasting the banner shows, and which rows the card lists -------
  const liveTasting = pickLiveTasting(tastings);
  const nextTasting = liveTasting ? null : pickNextTasting(tastings, now);

  const inviteTastings = tastings
    .filter((t) => t.myStatus === "INVITED" && t.status !== "CLOSED")
    .sort(bySchedule);
  const hostingTastings = tastings
    .filter((t) => t.status === "DRAFT" && t.host_id === userId)
    .sort(bySchedule);
  const selfPacedTastings = tastings
    .filter(
      (t) =>
        t.timing_mode === "ASYNC" &&
        isRunningStatus(t.status) &&
        t.host_id !== userId &&
        t.myStatus === "JOINED",
    )
    .sort(byNewest);
  const finishedTastings = tastings
    .filter((t) => t.status === "CLOSED" && (t.host_id === userId || t.myStatus === "JOINED"))
    .sort((a, b) => finishedAtOf(b).localeCompare(finishedAtOf(a)));
  // Only the finished rows that will actually be shown need a leaderboard.
  const finishedShown = finishedTastings.slice(
    0,
    Math.max(
      0,
      ROW_CAP - inviteTastings.length - hostingTastings.length - selfPacedTastings.length,
    ),
  );

  // Round 3 — names and standings for the handful of tastings we render.
  const hostIds = new Set<string>();
  for (const t of [liveTasting, nextTasting, ...inviteTastings]) if (t) hostIds.add(t.host_id);
  const slotUserIds =
    nextTasting?.wine_source === "PARTICIPANT_CONTRIBUTED"
      ? joinedOf(nextTasting.id).map((p) => p.user_id)
      : [];
  const profileIds = [...new Set([...hostIds, ...slotUserIds])];

  const liveWines = liveTasting ? winesOf(liveTasting.id) : [];
  const liveAllRevealed = liveWines.length > 0 && liveWines.every((w) => w.is_revealed);
  const liveCurrentWine = liveWines.find((w) => !w.is_revealed) ?? null;
  const wantLiveReveal =
    liveTasting !== null && liveTasting.reveal_mode !== "OPEN" && liveCurrentWine !== null;
  const wantLiveStandings = liveTasting !== null && liveTasting.reveal_mode !== "OPEN";

  const [{ data: profileRows }, liveReveal, liveLeaderboard, finishedLeaderboards] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", profileIds.length ? profileIds : [""]),
      wantLiveReveal && liveCurrentWine
        ? supabase.rpc("get_wine_reveal", { p_wine_id: liveCurrentWine.id })
        : Promise.resolve({ data: null }),
      wantLiveStandings && liveTasting
        ? getTastingLeaderboard(liveTasting.id)
        : Promise.resolve<LeaderboardRow[]>([]),
      Promise.all(finishedShown.map((t) => getTastingLeaderboard(t.id))),
    ]);
  const nameByUserId = new Map((profileRows ?? []).map((p) => [p.id, p.display_name]));
  const hostNameOf = (t: TastingRowDb) => nameByUserId.get(t.host_id) ?? HOST_FALLBACK;

  // --- Banner ----------------------------------------------------------------
  let banner: OverviewBanner = { kind: "none" };
  if (liveTasting) {
    const revealedKeys = (
      (liveReveal.data as { revealed_keys?: string[] } | null)?.revealed_keys ?? []
    ).filter((k): k is string => typeof k === "string");
    const revealedIndex = liveWines.findIndex((w) => !w.is_revealed);
    banner = {
      kind: "live",
      tastingId: liveTasting.id,
      name: liveTasting.name,
      hosting: liveTasting.host_id === userId,
      hostName: hostNameOf(liveTasting),
      revealMode: liveTasting.reveal_mode,
      wineIndex: revealedIndex === -1 ? liveWines.length : revealedIndex + 1,
      wineCount: liveWines.length,
      stage: bannerStage(revealedKeys, liveAllRevealed, liveTasting.reveal_mode),
      standing: wantLiveStandings
        ? myStanding(liveLeaderboard, participantsOf(liveTasting.id), liveTasting)
        : null,
      peopleCount: joinedOf(liveTasting.id).length,
    };
  } else if (nextTasting) {
    const flight = winesOf(nextTasting.id);
    let slots: { label: string; filled: boolean; note?: string }[];
    if (nextTasting.wine_source === "HOST_PROVIDES") {
      // Numbered by list order (like the play/results pages), not the raw
      // stored position; pad to six so an unfinished flight shows its gaps.
      slots = flight.map((_, i) => ({ label: `Wine ${i + 1}`, filled: true, note: "set" }));
      while (slots.length < FLIGHT_SLOTS) slots.push({ label: "Empty", filled: false });
    } else {
      const joined = joinedOf(nextTasting.id);
      const nameByParticipantId = new Map(
        joined.map((p) => [p.id, nameByUserId.get(p.user_id) ?? HOST_FALLBACK]),
      );
      const label = makeWineLabeler(flight, "PARTICIPANT_CONTRIBUTED", nameByParticipantId);
      slots = joined.map((p) => {
        const theirs = flight.find((w) => w.contributor_participant_id === p.id);
        return theirs
          ? { label: label(theirs), filled: true }
          : { label: "Empty", filled: false };
      });
    }
    const hosting = nextTasting.host_id === userId;
    banner = {
      kind: "next",
      tastingId: nextTasting.id,
      name: nextTasting.name,
      hosting,
      hostName: hostNameOf(nextTasting),
      scheduledAt: nextTasting.scheduled_at,
      slots,
      canAddWine:
        (nextTasting.wine_source === "HOST_PROVIDES" && hosting) ||
        (nextTasting.wine_source === "PARTICIPANT_CONTRIBUTED" &&
          nextTasting.myStatus === "JOINED"),
      nextWinePosition: flight.length + 1,
    };
  }

  // --- Blind tastings card -----------------------------------------------------
  const inviteRows: TastingRow[] = inviteTastings.map((t) => ({
    kind: "invite",
    tastingId: t.id,
    name: t.name,
    hostName: hostNameOf(t),
    scheduledAt: t.scheduled_at,
  }));
  const hostingRows: TastingRow[] = hostingTastings.map((t) => {
    const flight = winesOf(t.id);
    let detail: string;
    if (t.wine_source === "PARTICIPANT_CONTRIBUTED") {
      // "Bottles in" counts people who have brought one, so someone bringing
      // two never reads as "4 of 3".
      const joined = joinedOf(t.id);
      const joinedIds = new Set(joined.map((p) => p.id));
      const contributed = new Set(
        flight
          .map((w) => w.contributor_participant_id)
          .filter((id): id is string => id !== null && joinedIds.has(id)),
      );
      detail = `${contributed.size} of ${joined.length} bottles in`;
    } else {
      detail = `${flight.length} ${flight.length === 1 ? "wine" : "wines"} set`;
    }
    return { kind: "hosting", tastingId: t.id, name: t.name, scheduledAt: t.scheduled_at, detail };
  });
  const selfPacedRows: TastingRow[] = selfPacedTastings.map((t) => {
    const flight = winesOf(t.id);
    // You never guess your own bottle, so it is not part of "of {total}".
    const guessable = flight.filter((w) => w.contributor_participant_id !== t.myParticipantId);
    const guessed = guessable.filter((w) => myGuessedWineIds.has(w.id)).length;
    return {
      kind: "self-paced",
      tastingId: t.id,
      name: t.name,
      detail: `Self-paced · ${guessed} of ${guessable.length} wines guessed`,
    };
  });
  const finishedRows: TastingRow[] = finishedShown.map((t, i) => {
    const standing = myStanding(finishedLeaderboards[i] ?? [], participantsOf(t.id), t);
    return {
      kind: "finished",
      tastingId: t.id,
      name: t.name,
      finishedAt: finishedAtOf(t),
      placement: standing ? { rank: standing.rank, points: standing.points } : null,
    };
  });

  const region = profileStats.summary.categoryAccuracy.region;
  const tastingsCard: OverviewTastings = {
    tastings: profileStats.summary.tastingsAttended,
    averagePoints: profileStats.summary.averagePoints,
    regionHitPct: region.applicable > 0 ? percent(region.correct, region.applicable) : null,
    rows: orderTastingRows(inviteRows, hostingRows, selfPacedRows, finishedRows, ROW_CAP),
  };

  // --- Your ratings card -------------------------------------------------------
  const notes = (noteRows ?? []) as unknown as NoteRowDb[];
  const noteStats = noteStatRows ?? [];
  const scored = noteStats.filter((n) => n.quality_score !== null);
  const ratedWineIds = new Set(scored.map((n) => n.catalog_wine_id));
  const scoreSum = scored.reduce((s, n) => s + (n.quality_score ?? 0), 0);
  const ratingRows: RatingRow[] = notes.map((n) => {
    const c = unwrap(n.catalog_wines);
    return {
      noteId: n.id,
      catalogWineId: n.catalog_wine_id,
      title: embedTitle(c),
      imageUrl: c?.image_url ?? null,
      tastedOn: n.tasted_on,
      contextKind: n.context_kind,
      score: n.quality_score,
    };
  });
  const ratings: OverviewRatings = {
    winesRated: ratedWineIds.size,
    averageScore: scored.length > 0 ? Math.round(scoreSum / scored.length) : null,
    notes: noteStats.length,
    rows: ratingRows,
  };

  // --- Your cellar card --------------------------------------------------------
  const lots = (lotRows ?? []) as unknown as LotRowDb[];
  let bottles = 0;
  const producerIds = new Set<string>();
  const countryIds = new Set<string>();
  const countryCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  for (const lot of lots) {
    const c = unwrap(lot.catalog_wines);
    bottles += lot.quantity;
    if (c?.producer_id) producerIds.add(c.producer_id);
    if (c?.country_id) countryIds.add(c.country_id);
    const country = relName(c?.country) ?? "Unknown";
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + lot.quantity);
    const type = wineTypeLabel(c?.colour ?? null, c?.style ?? null);
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + lot.quantity);
  }
  const toItems = (counts: Map<string, number>): DistributionItem[] =>
    [...counts.entries()].map(([label, count]) => ({ label, count }));
  const tileLots = lots.slice(0, CELLAR_TILES);
  const tiles: CellarTile[] = tileLots.map((lot) => {
    const c = unwrap(lot.catalog_wines);
    return {
      lotId: lot.id,
      catalogWineId: lot.catalog_wine_id,
      title: embedTitle(c),
      imageUrl: c?.image_url ?? null,
    };
  });
  // Spec: Countries = top 3 + Other; Wine type = top 4 — every type named when
  // there are four or fewer, otherwise top 3 + Other, so the bar never exceeds
  // the contract's four entries including "Other".
  const typeItems = toItems(typeCounts).filter((i) => i.count > 0);
  const recent: CellarRecent[] = lots.slice(0, CELLAR_RECENT).map((lot) => ({
    lotId: lot.id,
    catalogWineId: lot.catalog_wine_id,
    title: embedTitle(unwrap(lot.catalog_wines)),
    location: lot.storage_location,
    quantity: lot.quantity,
  }));
  const cellar: OverviewCellar = {
    bottles,
    producers: producerIds.size,
    countries: countryIds.size,
    tiles,
    remainingBottles: bottles - tileLots.reduce((s, lot) => s + lot.quantity, 0),
    byCountry: foldOther(toItems(countryCounts), DISTRIBUTION_KEEP),
    byType: foldOther(typeItems, typeItems.length <= 4 ? 4 : DISTRIBUTION_KEEP),
    recent,
  };

  return { banner, tastings: tastingsCard, ratings, cellar };
}
