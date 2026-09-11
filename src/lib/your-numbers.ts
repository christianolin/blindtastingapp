// Data assembly for the Your numbers page (/profile/numbers). Everything is
// read as the signed-in user under RLS or through the existing SECURITY
// DEFINER leaderboard RPC (via getTastingLeaderboard); the maths lives in
// your-numbers-math.ts so it can be unit-tested without a database.
import { createClient } from "@/lib/supabase/server";
import type {
  VintageKind,
  WineColour,
  WineStyle,
} from "@/lib/supabase/database.types";
import { getTastingLeaderboard } from "@/lib/tasting-leaderboard";
import { catalogWineTitle } from "@/lib/wset/queries";
import { competitorRank, foldOther, wineTypeLabel } from "@/lib/stats-math";
import type { DistributionItem } from "@/lib/overview-types";
import type {
  CountRow,
  NumbersCellar,
  NumbersRange,
  NumbersRatings,
  NumbersTastings,
  YourNumbers,
} from "@/lib/your-numbers-types";
import {
  accuracyRows,
  bestRegions,
  footerRange,
  inRange,
  isBestMonth,
  longestWeeklyStreak,
  monthlyCounts,
  movementsByMonth,
  placementBuckets,
  pointsPerTasting,
  scoreBuckets,
  trend,
  vintageBuckets,
  weightedMedian,
} from "@/lib/your-numbers-math";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// PostgREST embeds arrive as a single object or a one-element array depending
// on the client version; normalise to the name (same helpers as cellar/page).
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

function unique<T>(xs: (T | null | undefined)[]): T[] {
  return [...new Set(xs.filter((x): x is T => x !== null && x !== undefined))];
}

/** Map<label, count> → the DistributionItem[] shape foldOther wants. */
function toItems(counts: Map<string, number>): DistributionItem[] {
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

function tally(counts: Map<string, number>, label: string | null, by = 1) {
  if (!label) return;
  counts.set(label, (counts.get(label) ?? 0) + by);
}

// Up to this many finished tastings get a leaderboard call for the placement
// buckets — each is a handful of queries, so the fan-out is bounded.
const PLACEMENT_TASTINGS_CAP = 40;
const RECENT_TASTINGS = 8;

const EMPTY_TASTINGS: NumbersTastings = {
  played: 0,
  glasses: 0,
  averagePoints: 0,
  accuracy: accuracyRows([]),
  recent: [],
  best: null,
  trend: null,
  placements: { first: 0, second: 0, third: 0, lower: 0 },
  bestRegions: [],
};

/**
 * Blind-tasting numbers. Scoped exactly like getProfileStats: only wines that
 * are fully revealed (`wines.is_revealed`) in tastings I take part in, and
 * only guesses with `scored_at` set — so nothing still hidden leaks and the
 * figures are the same no matter who is looking. The range filters on the
 * guess's scored_at.
 */
async function tastingsNumbers(
  supabase: Supabase,
  participants: { id: string; tasting_id: string }[],
  range: NumbersRange,
  now: Date,
): Promise<NumbersTastings> {
  if (participants.length === 0) return EMPTY_TASTINGS;
  const participantIds = participants.map((p) => p.id);
  const tastingIdByParticipantId = new Map(
    participants.map((p) => [p.id, p.tasting_id]),
  );
  const myParticipantIdByTastingId = new Map(
    participants.map((p) => [p.tasting_id, p.id]),
  );

  const { data: wineRows } = await supabase
    .from("wines")
    .select("id, tasting_id, is_revealed")
    .in("tasting_id", unique(participants.map((p) => p.tasting_id)));
  const wines = wineRows ?? [];
  const revealedWineIds = wines.filter((w) => w.is_revealed).map((w) => w.id);
  if (revealedWineIds.length === 0) return EMPTY_TASTINGS;

  const { data: guessRows } = await supabase
    .from("guesses")
    .select(
      "wine_id, participant_id, scored_at, country_points, region_points, appellation_points, primary_grape_points, producer_points, vintage_points, total_points",
    )
    .in("participant_id", participantIds)
    .in("wine_id", revealedWineIds)
    .not("scored_at", "is", null);
  const guesses = (guessRows ?? []).flatMap((g) =>
    g.scored_at !== null && inRange(g.scored_at, range, now)
      ? [{ ...g, scored_at: g.scored_at }]
      : [],
  );
  if (guesses.length === 0) return EMPTY_TASTINGS;

  const playedTastingIds = unique(
    guesses.map((g) => tastingIdByParticipantId.get(g.participant_id)),
  );
  const guessedWineIds = unique(guesses.map((g) => g.wine_id));

  const [{ data: tastingRows }, { data: answerRows }] = await Promise.all([
    supabase
      .from("tastings")
      .select("id, name, status, host_id, wine_source, created_at")
      .in("id", playedTastingIds.length ? playedTastingIds : [""]),
    supabase
      .from("wine_answers")
      .select("wine_id, region_id")
      .in("wine_id", guessedWineIds.length ? guessedWineIds : [""]),
  ]);
  const tastings = tastingRows ?? [];
  const answers = answerRows ?? [];
  const regionIds = unique(answers.map((a) => a.region_id));
  const { data: regionRows } = await supabase
    .from("regions")
    .select("id, name")
    .in("id", regionIds.length ? regionIds : [""]);
  const regionNameById = new Map((regionRows ?? []).map((r) => [r.id, r.name]));
  const regionByWineId = new Map(
    answers.map((a) => [a.wine_id, regionNameById.get(a.region_id) ?? null]),
  );
  const tastingById = new Map(tastings.map((t) => [t.id, t]));

  // Placements: a tasting counts once it is over — CLOSED, or every wine in it
  // revealed — and it is one I have an in-range scored guess in (all of
  // `tastings` are, by construction). Newest first, capped.
  const wineTotals = new Map<string, { total: number; revealed: number }>();
  for (const w of wines) {
    const cur = wineTotals.get(w.tasting_id) ?? { total: 0, revealed: 0 };
    cur.total++;
    if (w.is_revealed) cur.revealed++;
    wineTotals.set(w.tasting_id, cur);
  }
  const placementTastings = tastings
    .filter((t) => {
      const w = wineTotals.get(t.id);
      return t.status === "CLOSED" || (w !== undefined && w.total > 0 && w.revealed === w.total);
    })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, PLACEMENT_TASTINGS_CAP);
  const placementIds = placementTastings.map((t) => t.id);
  const [{ data: statusRows }, boards] = await Promise.all([
    supabase
      .from("tasting_participants")
      .select("id, status")
      .in("tasting_id", placementIds.length ? placementIds : [""]),
    Promise.all(placementTastings.map((t) => getTastingLeaderboard(t.id))),
  ]);
  const statusByParticipantId = new Map(
    (statusRows ?? []).map((p) => [p.id, p.status]),
  );
  const ranks: number[] = [];
  placementTastings.forEach((t, i) => {
    // The StandingsPanel competitor rule: joined guessers only, minus the
    // host of a host-provides tasting (they set the answers, they don't guess).
    const hostProvides = t.wine_source === "HOST_PROVIDES";
    const competitors = boards[i]
      .filter(
        (r) =>
          statusByParticipantId.get(r.participantId) === "JOINED" &&
          !(hostProvides && r.userId === t.host_id),
      )
      .map((r) => ({ participantId: r.participantId, total: r.total }));
    const me = myParticipantIdByTastingId.get(t.id);
    const rank = me ? competitorRank(competitors, me) : null;
    if (rank) ranks.push(rank.rank);
  });

  const perGuess = guesses.map((g) => {
    const tastingId = tastingIdByParticipantId.get(g.participant_id) ?? "";
    return {
      tastingId,
      name: tastingById.get(tastingId)?.name ?? "Tasting",
      points: g.total_points ?? 0,
      scoredAt: g.scored_at,
    };
  });
  const allTastings = pointsPerTasting(perGuess, Infinity);
  const recent = allTastings.slice(-RECENT_TASTINGS);
  const best = allTastings.reduce<{ points: number; name: string } | null>(
    (acc, t) => (!acc || t.points > acc.points ? { points: t.points, name: t.name } : acc),
    null,
  );
  const totalPoints = guesses.reduce((n, g) => n + (g.total_points ?? 0), 0);

  return {
    played: playedTastingIds.length,
    glasses: guesses.length,
    averagePoints: totalPoints / guesses.length,
    accuracy: accuracyRows(guesses),
    recent,
    best,
    trend: trend(recent.map((t) => t.points)),
    placements: placementBuckets(ranks),
    bestRegions: bestRegions(
      guesses.flatMap((g) => {
        // Semi-blind guesses are scored 1/0 with every category null — a
        // different scale from the 0–30 blind total, so keep them out of the
        // per-region average (same null-means-not-applicable rule as
        // accuracyRows; country_points is always set on a blind-scored guess).
        if (g.country_points === null) return [];
        const region = regionByWineId.get(g.wine_id);
        return region ? [{ region, points: g.total_points ?? 0 }] : [];
      }),
    ),
  };
}

type NoteEmbed = {
  colour: WineColour | null;
  style: WineStyle | null;
  country: Rel;
  primary_grape: Rel;
};
type NoteRaw = {
  id: string;
  catalog_wine_id: string;
  tasted_on: string;
  quality_score: number | null;
  catalog_wines: NoteEmbed | NoteEmbed[] | null;
};

/**
 * Ratings numbers from my WSET notes. The range filters on tasted_on for
 * every figure here — counts, distributions, the per-month chart and the
 * streak — so switching the range visibly changes each card.
 */
function ratingsNumbers(notes: NoteRaw[], range: NumbersRange, now: Date): NumbersRatings {
  const inRangeNotes = notes.filter((n) => inRange(n.tasted_on, range, now));
  const scored = inRangeNotes.filter((n) => n.quality_score !== null);
  const scores = scored.map((n) => n.quality_score as number);

  const typeCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const grapeCounts = new Map<string, number>();
  for (const n of inRangeNotes) {
    const cw = unwrap(n.catalog_wines);
    tally(typeCounts, wineTypeLabel(cw?.colour ?? null, cw?.style ?? null));
    tally(countryCounts, relName(cw?.country));
    tally(grapeCounts, relName(cw?.primary_grape));
  }
  const topGrapes: CountRow[] = toItems(grapeCounts)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 4);

  const dates = inRangeNotes.map((n) => n.tasted_on);
  const perMonth = monthlyCounts(dates, now);
  const thisMonthCount = perMonth[perMonth.length - 1]?.count ?? 0;
  // "Your best yet" is best ever, so the comparison covers every in-range
  // month, not just the eight the chart shows.
  const isBest = isBestMonth(dates, now);

  return {
    winesRated: new Set(scored.map((n) => n.catalog_wine_id)).size,
    notes: inRangeNotes.length,
    averageScore:
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null,
    scoreBuckets: scoreBuckets(scores),
    byType: foldOther(toItems(typeCounts), 3),
    byCountry: foldOther(toItems(countryCounts), 3),
    topGrapes,
    perMonth,
    thisMonth: { count: thisMonthCount, isBest },
    longestStreakWeeks: longestWeeklyStreak(dates),
  };
}

type LotEmbed = {
  colour: WineColour | null;
  style: WineStyle | null;
  vintage_kind: VintageKind;
  vintage_year: number | null;
  wine_name: string | null;
  vintage_tawny_years: number | null;
  producer_id: string | null;
  country_id: string | null;
  producer: Rel;
  appellation: Rel;
  country: Rel;
  primary_grape: Rel;
};
type LotRaw = {
  id: string;
  catalog_wine_id: string;
  quantity: number;
  purchased_quantity: number;
  purchased_on: string | null;
  created_at: string;
  catalog_wines: LotEmbed | LotEmbed[] | null;
};

/**
 * Cellar numbers. Holdings (lots with bottles left) drive the counts,
 * distributions and vintages and ignore the range; the movements chart and
 * the "added / opened" footer use every lot ever purchased and every DRANK
 * consumption, dated by purchased_on ?? created_at and consumed_on. The
 * footer sums over the window its label names (footerRange) — "this year"
 * for all-time, never a lifetime total under a "this year" label.
 */
function cellarNumbers(
  lots: LotRaw[],
  consumptions: { quantity: number; consumed_on: string }[],
  range: NumbersRange,
  now: Date,
): NumbersCellar {
  const holdings = lots.filter((l) => l.quantity > 0);

  const producerIds = new Set<string>();
  const countryIds = new Set<string>();
  const countryCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const redGrapeCounts = new Map<string, number>();
  const yearLots: { year: number; quantity: number; lot: LotRaw; cw: LotEmbed }[] = [];
  let bottles = 0;
  for (const lot of holdings) {
    const cw = unwrap(lot.catalog_wines);
    bottles += lot.quantity;
    if (cw?.producer_id) producerIds.add(cw.producer_id);
    if (cw?.country_id) countryIds.add(cw.country_id);
    tally(countryCounts, relName(cw?.country), lot.quantity);
    tally(typeCounts, wineTypeLabel(cw?.colour ?? null, cw?.style ?? null), lot.quantity);
    if (cw?.colour === "RED") tally(redGrapeCounts, relName(cw.primary_grape), lot.quantity);
    if (cw && cw.vintage_kind === "YEAR" && cw.vintage_year !== null) {
      yearLots.push({ year: cw.vintage_year, quantity: lot.quantity, lot, cw });
    }
  }

  const oldestLot = yearLots.reduce<(typeof yearLots)[number] | null>(
    (acc, l) => (!acc || l.year < acc.year ? l : acc),
    null,
  );
  const oldest = oldestLot
    ? {
        title: catalogWineTitle({
          producerName: relName(oldestLot.cw.producer),
          wineName: oldestLot.cw.wine_name,
          vintageKind: oldestLot.cw.vintage_kind,
          vintageYear: oldestLot.cw.vintage_year,
          vintageTawnyYears: oldestLot.cw.vintage_tawny_years,
          appellationName: relName(oldestLot.cw.appellation),
        }),
        year: oldestLot.year,
      }
    : null;

  const added = lots.map((l) => ({
    on: l.purchased_on ?? l.created_at,
    qty: l.purchased_quantity,
  }));
  const removed = consumptions.map((c) => ({ on: c.consumed_on, qty: c.quantity }));
  const footerWindow = footerRange(range);
  const sumInRange = (list: { on: string; qty: number }[]) =>
    list.reduce((n, m) => (inRange(m.on, footerWindow, now) ? n + m.qty : n), 0);

  return {
    bottles,
    producers: producerIds.size,
    countries: countryIds.size,
    byCountry: foldOther(toItems(countryCounts), 3),
    byType: foldOther(toItems(typeCounts), 3),
    redsByGrape: foldOther(toItems(redGrapeCounts), 2),
    vintageBuckets: vintageBuckets(yearLots),
    oldest,
    medianVintage: weightedMedian(
      yearLots.map((l) => ({ value: l.year, weight: l.quantity })),
    ),
    movements: movementsByMonth(added, removed, now, 6),
    addedInRange: sumInRange(added),
    openedInRange: sumInRange(removed),
  };
}

/**
 * Everything the Your numbers page renders for one user and range. The three
 * sections are independent, so their base rows are fetched in parallel; the
 * tastings section then follows the participants → revealed wines → scored
 * guesses chain that getProfileStats established.
 */
export async function getYourNumbers(
  userId: string,
  range: NumbersRange,
): Promise<YourNumbers> {
  const supabase = await createClient();
  const now = new Date();

  const [
    { data: profile },
    { data: participantRows },
    { data: noteRows },
    { data: lotRows },
    { data: consumptionRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, created_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("tasting_participants")
      .select("id, tasting_id")
      .eq("user_id", userId),
    supabase
      .from("wset_notes")
      .select(
        "id, catalog_wine_id, tasted_on, quality_score, " +
          "catalog_wines(colour, style, country:countries(name), " +
          "primary_grape:grapes!catalog_wines_primary_grape_id_fkey(name))",
      )
      .eq("author_id", userId),
    supabase
      .from("cellar_lots")
      .select(
        "id, catalog_wine_id, quantity, purchased_quantity, purchased_on, created_at, " +
          "catalog_wines(colour, style, vintage_kind, vintage_year, wine_name, vintage_tawny_years, producer_id, country_id, " +
          "producer:producers(name), appellation:appellations(name), country:countries(name), " +
          "primary_grape:grapes!catalog_wines_primary_grape_id_fkey(name))",
      )
      .eq("owner_id", userId),
    supabase
      .from("cellar_consumptions")
      .select("quantity, consumed_on")
      .eq("owner_id", userId)
      .eq("reason", "DRANK"),
  ]);

  const tastings = await tastingsNumbers(supabase, participantRows ?? [], range, now);

  return {
    range,
    userId,
    displayName: profile?.display_name ?? "You",
    since: profile?.created_at ?? now.toISOString(),
    tastings,
    ratings: ratingsNumbers((noteRows ?? []) as unknown as NoteRaw[], range, now),
    cellar: cellarNumbers(
      (lotRows ?? []) as unknown as LotRaw[],
      consumptionRows ?? [],
      range,
      now,
    ),
  };
}
