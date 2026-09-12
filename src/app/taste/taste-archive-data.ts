// Everything the All tastings page (/taste) reads, assembled for the signed-in
// user from rows they can already read under RLS plus the SECURITY DEFINER
// get_tasting_leaderboard RPC — no elevated client, no new migrations.
//
// A server-only module, not a "use server" one. Next dispatches Server Actions
// one at a time per client and exposes each as a POST entry point
// (node_modules/next/dist/docs/01-app/02-guides/server-actions.md, "Sequential
// dispatch" and "Security"), so a loader only the server needs is not exported
// as one: the page calls `getTasteArchive` and `readPlacements` directly, and
// the single action the client list needs, `loadPlacements` in
// taste-archive-actions.ts, is a thin wrapper over `readPlacements`. Both
// functions derive the user from the session (the per-request cached
// getCurrentUser, so the page and its reads share one auth round trip), never
// from an argument, and return only what the rows print.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getTastingLeaderboard } from "@/lib/tasting-leaderboard";
import { getCurrentUser } from "@/lib/tasting-request-cache";
import type { ParticipantStatus } from "@/lib/supabase/database.types";
import {
  PAGE_SIZE,
  archiveStats,
  countTasters,
  placementFrom,
  type ArchivePlacement,
  type ArchiveTasting,
  type TasteArchive,
} from "./taste-archive-math";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgREST answers at most 1000 rows per request, and a long `in.(…)` list
// can outgrow a request URL, so every read keyed by a personal history goes
// in id chunks, page by page, in a stable order. One chunk and one page for
// almost everyone.
const ROW_PAGE = 1000;
const ID_CHUNK = 100;

type PageOf<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

async function readAll<T>(page: (from: number, to: number) => PageOf<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += ROW_PAGE) {
    const { data, error } = await page(from, from + ROW_PAGE - 1);
    if (error) {
      // Degrade to what has been read, but never silently.
      console.error("All tastings: a read failed", error);
      break;
    }
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < ROW_PAGE) break;
  }
  return out;
}

async function readAllIn<T>(
  ids: readonly string[],
  page: (chunk: string[], from: number, to: number) => PageOf<T>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    out.push(...(await readAll((from, to) => page(chunk, from, to))));
  }
  return out;
}

const EMPTY: TasteArchive = {
  myId: "",
  tastings: [],
  stats: { tastings: 0, finished: 0, glasses: 0 },
};

export async function getTasteArchive(): Promise<TasteArchive> {
  const user = await getCurrentUser();
  if (!user) return EMPTY;
  const userId = user.id;
  const supabase = await createClient();

  // Round 1 — my memberships. Declined ones are not part of my history.
  const mine = await readAll((from, to) =>
    supabase
      .from("tasting_participants")
      .select("id, tasting_id, status")
      .eq("user_id", userId)
      .neq("status", "DECLINED")
      .order("id")
      .range(from, to),
  );
  const tastingIds = [...new Set(mine.map((p) => p.tasting_id))];
  const myParticipantIds = mine.map((p) => p.id);
  const myRowByTastingId = new Map(mine.map((p) => [p.tasting_id, p]));

  // Round 2 — everything keyed by those ids, in parallel.
  const [tastingRows, participants, wines, guesses] = await Promise.all([
    readAllIn(tastingIds, (chunk, from, to) =>
      supabase
        .from("tastings")
        .select("id, name, host_id, timing_mode, wine_source, reveal_mode, status, scheduled_at, created_at, image_url")
        .in("id", chunk)
        .order("id")
        .range(from, to),
    ),
    readAllIn(tastingIds, (chunk, from, to) =>
      supabase
        .from("tasting_participants")
        .select("id, tasting_id, user_id, status")
        .in("tasting_id", chunk)
        .order("id")
        .range(from, to),
    ),
    readAllIn(tastingIds, (chunk, from, to) =>
      supabase
        .from("wines")
        .select("id, tasting_id, position, is_revealed, contributor_participant_id")
        .in("tasting_id", chunk)
        .order("id")
        .range(from, to),
    ),
    readAllIn(myParticipantIds, (chunk, from, to) =>
      supabase
        .from("guesses")
        .select("wine_id, participant_id, scored_at, locked_at")
        .in("participant_id", chunk)
        .order("id")
        .range(from, to),
    ),
  ]);

  const tastings = tastingRows.filter((t) => {
    const me = myRowByTastingId.get(t.id);
    // An invitation to a tasting that has already finished can no longer be
    // accepted (respondToInvite refuses it) and was never part of my history.
    return me !== undefined && !(me.status === "INVITED" && t.status === "CLOSED");
  });

  const peopleByTastingId = new Map<string, { userId: string; status: ParticipantStatus }[]>();
  for (const p of participants) {
    const list = peopleByTastingId.get(p.tasting_id) ?? [];
    list.push({ userId: p.user_id, status: p.status });
    peopleByTastingId.set(p.tasting_id, list);
  }

  const winesByTastingId = new Map<string, typeof wines>();
  for (const w of wines) {
    const list = winesByTastingId.get(w.tasting_id) ?? [];
    list.push(w);
    winesByTastingId.set(w.tasting_id, list);
  }
  for (const list of winesByTastingId.values()) list.sort((a, b) => a.position - b.position);

  // My guesses: "guessed" is locked or scored (an autosaved draft is neither);
  // the latest scored_at per tasting is the Overview's finishedAtOf key.
  const tastingIdByParticipantId = new Map(mine.map((p) => [p.id, p.tasting_id]));
  const guessedWineIds = new Set<string>();
  const lastScoredAtByTastingId = new Map<string, string>();
  let scoredGuesses = 0;
  for (const g of guesses) {
    if (g.locked_at || g.scored_at) guessedWineIds.add(g.wine_id);
    if (!g.scored_at) continue;
    scoredGuesses++;
    const tastingId = tastingIdByParticipantId.get(g.participant_id);
    if (!tastingId) continue;
    const prev = lastScoredAtByTastingId.get(tastingId);
    if (!prev || g.scored_at.localeCompare(prev) > 0) lastScoredAtByTastingId.set(tastingId, g.scored_at);
  }

  // Round 3 — the hosts' names and avatars.
  const hostIds = [...new Set(tastings.map((t) => t.host_id))];
  const hostRows = await readAllIn(hostIds, (chunk, from, to) =>
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", chunk)
      .order("id")
      .range(from, to),
  );
  const hostById = new Map(hostRows.map((h) => [h.id, h]));

  const rows: ArchiveTasting[] = tastings.map((t) => {
    const me = myRowByTastingId.get(t.id)!;
    const flight = winesByTastingId.get(t.id) ?? [];
    const firstHidden = flight.findIndex((w) => !w.is_revealed);
    const guessable = flight.filter((w) => w.contributor_participant_id !== me.id);
    const host = hostById.get(t.host_id);
    return {
      id: t.id,
      name: t.name,
      hostId: t.host_id,
      // The "Someone" fallback is copy, so the rows apply it (hostNameOf).
      hostName: host?.display_name ?? null,
      hostAvatarUrl: host?.avatar_url ?? null,
      hosting: t.host_id === userId,
      myStatus: me.status,
      myParticipantId: me.id,
      status: t.status,
      timingMode: t.timing_mode,
      revealMode: t.reveal_mode,
      wineSource: t.wine_source,
      scheduledAt: t.scheduled_at,
      createdAt: t.created_at,
      imageUrl: t.image_url,
      glassCount: flight.length,
      currentGlass: firstHidden === -1 ? flight.length : firstHidden + 1,
      tasterCount: countTasters(peopleByTastingId.get(t.id) ?? [], t.host_id, t.wine_source),
      guessableCount: guessable.length,
      guessedCount: guessable.filter((w) => guessedWineIds.has(w.id)).length,
      activityAt: lastScoredAtByTastingId.get(t.id) ?? t.scheduled_at ?? t.created_at,
    };
  });

  return { myId: userId, tastings: rows, stats: archiveStats(rows, scoredGuesses) };
}

/**
 * My placing in each of up to one page of tastings (see `placementFrom`).
 * The ids may come straight from a client, so they are checked as UUIDs and
 * capped at one page before any read. Null where I was not a competitor, the
 * tasting is not readable, or it has no leaderboard (OPEN).
 */
export async function readPlacements(
  tastingIds: readonly string[],
): Promise<Record<string, ArchivePlacement | null>> {
  const ids = [
    ...new Set(
      (Array.isArray(tastingIds) ? tastingIds : []).filter(
        (id): id is string => typeof id === "string" && UUID.test(id),
      ),
    ),
  ].slice(0, PAGE_SIZE);
  const result: Record<string, ArchivePlacement | null> = {};
  if (ids.length === 0) return result;

  const user = await getCurrentUser();
  if (!user) return result;
  const supabase = await createClient();

  const [{ data: tastingRows }, { data: participantRows }, boards] = await Promise.all([
    supabase.from("tastings").select("id, host_id, wine_source, reveal_mode").in("id", ids),
    supabase.from("tasting_participants").select("id, status").in("tasting_id", ids),
    Promise.all(ids.map((id) => getTastingLeaderboard(id))),
  ]);
  const tastingById = new Map((tastingRows ?? []).map((t) => [t.id, t]));
  const statusByParticipantId = new Map((participantRows ?? []).map((p) => [p.id, p.status]));

  ids.forEach((id, i) => {
    const tasting = tastingById.get(id);
    result[id] = tasting
      ? placementFrom(
          boards[i],
          statusByParticipantId,
          { hostId: tasting.host_id, wineSource: tasting.wine_source, revealMode: tasting.reveal_mode },
          user.id,
        )
      : null;
  });
  return result;
}
