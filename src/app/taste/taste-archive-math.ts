// Pure rules for the All tastings page (/taste; ledger R5, map TASTE-03..23):
// which memberships a filter chip shows and how many, the pin-and-sort order,
// the header stats line, the words on every row and my placing. No Next or
// Supabase import — vitest's node environment loads this through relative
// imports, and `taste-archive-data.ts` feeds it RLS-readable rows. Every word
// comes from src/lib/wset/i18n.ts's makeT dictionaries (EN + DA): callers pass
// the `t` they made, so this module holds no copy of its own.
import { isRunningStatus } from "../../lib/overview-math";
import { ordinal, rankRows } from "../../lib/stats-math";
import {
  EYEBROW_SEPARATOR,
  glassesSoFarPhrase,
  joinEyebrow,
  modeWord,
  statusWord,
  timingWord,
  type ParticipantStatus,
  type RevealMode,
  type TastingStatus,
  type TimingMode,
} from "../../lib/tasting-eyebrow";
import { startLandsOnConsole } from "../../lib/tasting-lifecycle-copy";
import type { WineSourceMode } from "../../lib/supabase/database.types";
import type { WsetLang, makeT } from "../../lib/wset/i18n";

/** Rows revealed per "Show N more" (the handoff's "Show 8 more"). */
export const PAGE_SIZE = 8;

export type ArchiveFilter = "all" | "hosting" | "attending" | "finished";

export const ARCHIVE_FILTERS: readonly ArchiveFilter[] = [
  "all",
  "hosting",
  "attending",
  "finished",
];

/** A tasting I am a non-declined member of, with everything a row needs. */
export type ArchiveTasting = {
  id: string;
  name: string;
  hostId: string;
  /** The host's display name; null when their profile is not readable (rows print `hostNameOf`). */
  hostName: string | null;
  hostAvatarUrl: string | null;
  /** host_id is me. */
  hosting: boolean;
  /** INVITED rows belong to the invitation band, JOINED rows to the list. */
  myStatus: ParticipantStatus;
  myParticipantId: string;
  status: TastingStatus;
  timingMode: TimingMode;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
  scheduledAt: string | null;
  createdAt: string;
  imageUrl: string | null;
  /** Glasses so far — never a planned total (none exists). */
  glassCount: number;
  /** 1-based index of the first not-yet-revealed glass (the count once all are). */
  currentGlass: number;
  /** The people tasting: see `countTasters`. */
  tasterCount: number;
  /** Glasses I can guess: the flight minus my own bottle(s). */
  guessableCount: number;
  /** Of those, the ones I have locked or been scored on. */
  guessedCount: number;
  /**
   * "Newest first" key: my latest scored guess in the tasting, else the
   * schedule, else creation — the Overview's finishedAtOf rule (there is no
   * closed_at column).
   */
  activityAt: string;
};

export type ArchivePlacement = {
  rank: number;
  competitors: number;
  points: number;
  /** Set for semi-blind tastings: the glasses I could match. */
  matchedOf?: number;
};

export type ArchiveStats = { tastings: number; finished: number; glasses: number };

/** A translator from makeT, bound to the page's language. */
export type ArchiveT = ReturnType<typeof makeT>;

/**
 * The page's language. Pinned to English: every other page of the app is
 * English-only and the words this page borrows (tasting-eyebrow.ts's status
 * and mode words, relative-day.ts, stats-math's ordinals, shortDate's month
 * names) have no Danish yet, so following the note sheet's localStorage
 * toggle would render a half-translated page. Its own words already have
 * Danish in makeT's dictionaries; flip this once the app grows an app-level
 * language.
 */
export const ARCHIVE_LANG: WsetLang = "en";

// --- Filters -----------------------------------------------------------------

/** `?tab=` → chip; `history` stays an alias of Finished so old pills land. */
export function parseFilter(tab: string | null | undefined): ArchiveFilter {
  if (tab === "history") return "finished";
  return (ARCHIVE_FILTERS as readonly string[]).includes(tab ?? "")
    ? (tab as ArchiveFilter)
    : "all";
}

/** All is the clean /taste URL; the other chips carry `?tab=`. */
export function filterHref(filter: ArchiveFilter): string {
  return filter === "all" ? "/taste" : `/taste?tab=${filter}`;
}

/**
 * Non-exclusive chips over one list: All = every non-declined membership
 * (invitations included), Hosting = I host it (any status), Attending =
 * JOINED and not the host (any status), Finished = CLOSED in either role.
 */
export function matchesFilter(t: ArchiveTasting, filter: ArchiveFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "hosting":
      return t.hosting;
    case "attending":
      return t.myStatus === "JOINED" && !t.hosting;
    case "finished":
      return t.status === "CLOSED";
  }
}

export function archiveCounts(tastings: readonly ArchiveTasting[]): Record<ArchiveFilter, number> {
  const count = (filter: ArchiveFilter) => tastings.filter((t) => matchesFilter(t, filter)).length;
  return {
    all: count("all"),
    hosting: count("hosting"),
    attending: count("attending"),
    finished: count("finished"),
  };
}

/**
 * The line under an empty chip. All counts invitations but its list leaves
 * them to the band, so an All list that is empty while invitations wait says
 * where they went. The other chips keep their own line: an invitation is never
 * hosting, attending or finished.
 */
export function emptyLineKey(filter: ArchiveFilter, invitationCount: number): string {
  if (filter === "all" && invitationCount > 0) return "empty_all_invited";
  return `empty_${filter}`;
}

/**
 * The header stats (ledger R5): every non-declined membership, the finished
 * (CLOSED) ones, and my scored guesses across all of them.
 */
export function archiveStats(tastings: readonly ArchiveTasting[], scoredGuesses: number): ArchiveStats {
  return {
    tastings: tastings.length,
    finished: tastings.filter((t) => t.status === "CLOSED").length,
    glasses: scoredGuesses,
  };
}

// --- The competition -----------------------------------------------------------

/**
 * One person in a tasting's competition: JOINED, and not the host of a
 * host-provides tasting, who set the answers and does not guess — the
 * StandingsPanel rule. A bring-your-own host guesses the other bottles.
 */
export function isCompetitor(
  person: { userId: string; status: ParticipantStatus | undefined },
  hostId: string,
  wineSource: WineSourceMode,
): boolean {
  return person.status === "JOINED" && !(wineSource === "HOST_PROVIDES" && person.userId === hostId);
}

/** The people tasting ("7 tasting", "7 tasters"): the competitors, so the count matches the placing's field. */
export function countTasters(
  participants: ReadonlyArray<{ userId: string; status: ParticipantStatus }>,
  hostId: string,
  wineSource: WineSourceMode,
): number {
  return participants.filter((p) => isCompetitor(p, hostId, wineSource)).length;
}

/** The leaderboard fields a placing needs (a subset of tasting-leaderboard's LeaderboardRow). */
export type BoardRow = { participantId: string; userId: string; total: number; totalWines: number };

/**
 * My placing in one tasting: dense rank among the competitors through the
 * shared `rankRows`, my points, and for a semi-blind tasting the glasses I
 * could match. Null when I did not compete, or the tasting has no leaderboard
 * (OPEN).
 */
export function placementFrom(
  board: readonly BoardRow[],
  statusByParticipantId: ReadonlyMap<string, ParticipantStatus>,
  tasting: { hostId: string; wineSource: WineSourceMode; revealMode: RevealMode },
  userId: string,
): ArchivePlacement | null {
  if (tasting.revealMode === "OPEN") return null;
  const competitors = board.filter((r) =>
    isCompetitor(
      { userId: r.userId, status: statusByParticipantId.get(r.participantId) },
      tasting.hostId,
      tasting.wineSource,
    ),
  );
  const mine = rankRows(competitors, (r) => r.total).find((r) => r.row.userId === userId);
  if (!mine) return null;
  return {
    rank: mine.rank,
    competitors: competitors.length,
    points: mine.row.total,
    ...(tasting.revealMode === "SEMI_BLIND" ? { matchedOf: mine.row.totalWines } : {}),
  };
}

/** The host of a host-provides tasting: they set the answers, so they neither guess nor place. */
function setTheAnswers(row: ArchiveTasting): boolean {
  return row.hosting && row.wineSource === "HOST_PROVIDES";
}

// --- Order -------------------------------------------------------------------

const isRunning = (t: ArchiveTasting) => isRunningStatus(t.status);

/**
 * The list under the chips: invitations are left to the band; every running
 * tasting I have joined pins to the top (LIVE before self-paced, newest
 * first); everything else follows newest first by `activityAt`.
 */
export function listRows(tastings: readonly ArchiveTasting[], filter: ArchiveFilter): ArchiveTasting[] {
  const rows = tastings.filter((t) => t.myStatus !== "INVITED" && matchesFilter(t, filter));
  const pinned = rows
    .filter(isRunning)
    .sort(
      (a, b) =>
        (a.timingMode === "LIVE" ? 0 : 1) - (b.timingMode === "LIVE" ? 0 : 1) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  const rest = rows
    .filter((t) => !isRunning(t))
    .sort((a, b) => b.activityAt.localeCompare(a.activityAt) || b.createdAt.localeCompare(a.createdAt));
  return [...pinned, ...rest];
}

/**
 * The invitation band's rows: my INVITED memberships, soonest schedule first
 * and the unscheduled ones after it (newest created first) — the order the
 * Overview lists invitations in.
 */
export function invitationsOf(tastings: readonly ArchiveTasting[]): ArchiveTasting[] {
  return tastings
    .filter((t) => t.myStatus === "INVITED")
    .sort((a, b) => {
      if (a.scheduledAt && b.scheduledAt) return a.scheduledAt.localeCompare(b.scheduledAt);
      if (a.scheduledAt) return -1;
      if (b.scheduledAt) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

/**
 * Whether the page polls: only while a live tasting I have joined is in
 * progress, the one row whose "glass N of M" moves without me acting. A
 * self-paced row's "k of n guessed" moves only when I guess, which revalidates
 * the page anyway, and a legacy OPEN tasting can sit open indefinitely.
 */
export function hasLivePoll(tastings: readonly ArchiveTasting[]): boolean {
  return tastings.some(
    (t) => t.status === "IN_PROGRESS" && t.timingMode === "LIVE" && t.myStatus === "JOINED",
  );
}

/** Everything the page renders, assembled by taste-archive-data.ts. */
export type TasteArchive = {
  myId: string;
  /** Every non-declined membership (an INVITED row to a CLOSED tasting is dropped). */
  tastings: ArchiveTasting[];
  stats: ArchiveStats;
};

/** How many more rows the next "Show N more" would reveal. */
export function showMoreCount(total: number, shown: number): number {
  return Math.max(0, Math.min(PAGE_SIZE, total - shown));
}

/**
 * The placings still to load for the rows on screen: rows that want one, have
 * no answer yet (a loaded null counts as an answer) and no request in flight
 * — at most one page, in list order, so the leaderboard RPC fan-out stays
 * bounded to what "Show N more" or a chip change just revealed.
 */
export function missingPlacementIds(
  rows: readonly ArchiveTasting[],
  known: Readonly<Record<string, unknown>>,
  pending: ReadonlySet<string>,
): string[] {
  return rows
    .filter((row) => wantsPlacement(row) && !(row.id in known) && !pending.has(row.id))
    .slice(0, PAGE_SIZE)
    .map((row) => row.id);
}

/** The placings the server loads: the rows that want one on the chip's first visible page, and no further. */
export function firstPagePlacementIds(tastings: readonly ArchiveTasting[], filter: ArchiveFilter): string[] {
  return missingPlacementIds(listRows(tastings, filter).slice(0, PAGE_SIZE), {}, new Set());
}

// --- Words -------------------------------------------------------------------

/** The middle-dot separator every meta line uses (tasting-eyebrow's). */
export const SEPARATOR = EYEBROW_SEPARATOR;

/** "{n} tastings · {f} finished · {g} glasses guessed". */
export function statsLine(t: ArchiveT, s: ArchiveStats): string {
  return joinEyebrow([
    s.tastings === 1 ? t("tastings_one") : t("tastings_many", { n: s.tastings }),
    t("finished_count", { n: s.finished }),
    s.glasses === 1 ? t("glasses_guessed_one") : t("glasses_guessed_many", { n: s.glasses }),
  ]);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "{d Mon}" for a finished tasting — the Overview's rule: day granularity in
 * UTC so server and client text agree (LocalDateTime is for schedules). The
 * month names are English, like the Overview's, while the page is pinned to
 * English (see ARCHIVE_LANG).
 */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * The flight so far as a meta-line part: "6 glasses so far", or "no glasses
 * yet". It never opens a line on this page, so the empty case is lower-case —
 * tasting-eyebrow's "No glasses yet" is capitalised for the lobby eyebrow.
 */
export function glassesPhrase(t: ArchiveT, count: number): string {
  return count > 0 ? glassesSoFarPhrase(count) : t("no_glasses_yet_mid");
}

/** A meta-line part: a word, or a schedule the row renders with LocalDateTime. */
export type MetaPart = string | { date: string };

export type RowCopy = {
  kind: "running" | "finished" | "draft";
  /** The status chip on a running row: "Live", "In progress · self-paced". */
  chip?: string;
  /** The phone's shorter chip: "Live", "In progress". */
  phoneChip?: string;
  meta: MetaPart[];
  phoneMeta: MetaPart[];
  /** The gold pill on a running row. */
  action?: { label: string; phoneLabel: string };
  href: string;
};

/**
 * The host's name as the rows print it: their display name, or the
 * dictionary's "Someone" when their profile row is missing or unreadable.
 */
export function hostNameOf(t: ArchiveT, row: ArchiveTasting): string {
  return row.hostName ?? t("someone");
}

function hostClause(t: ArchiveT, row: ArchiveTasting): string {
  return row.hosting ? t("you_are_hosting") : t("host_is_hosting", { host: hostNameOf(t, row) });
}

/** The words on one list row, desktop and phone variants. */
export function rowCopy(t: ArchiveT, row: ArchiveTasting): RowCopy {
  const lobby = `/tastings/${row.id}`;
  const mode = modeWord(row.revealMode);

  if (isRunning(row)) {
    const live = row.timingMode === "LIVE";
    // A host who set the answers has no glass to guess: their progress is
    // the flight so far and their action opens the tasting; everyone else's
    // self-paced progress is "k of n guessed".
    const guesses = !setTheAnswers(row);
    const progress = live
      ? row.glassCount > 0
        ? t("glass_n_of_m_so_far", { n: row.currentGlass, m: row.glassCount })
        : glassesPhrase(t, 0)
      : guesses && row.guessableCount > 0
        ? t("k_of_n_guessed", { k: row.guessedCount, n: row.guessableCount })
        : glassesPhrase(t, row.glassCount);
    const phoneProgress = live
      ? row.glassCount > 0
        ? t("glass_n_of_m", { n: row.currentGlass, m: row.glassCount })
        : glassesPhrase(t, 0)
      : progress;
    const status = statusWord(row.status, row.timingMode);
    // "Back to the table" takes the host of a live, blind, host-provides
    // tasting to the console, where Start landed them; everyone else, and
    // every other kind of tasting, goes to the lobby.
    const console =
      row.hosting &&
      startLandsOnConsole({
        timingMode: row.timingMode,
        revealMode: row.revealMode,
        wineSource: row.wineSource,
      });
    return {
      kind: "running",
      // The timing word would only repeat "Live", so it joins the self-paced
      // status alone; the phone chip keeps just the status word.
      chip: live ? status : joinEyebrow([status, timingWord(row.timingMode)]),
      phoneChip: status,
      meta: [hostClause(t, row), mode, progress, t("n_tasting", { n: row.tasterCount })].filter(
        (p) => p !== "",
      ),
      phoneMeta: [row.hosting ? t("hosting") : hostNameOf(t, row), phoneProgress],
      action: live
        ? { label: t("back_to_the_table"), phoneLabel: t("back") }
        : guesses
          ? { label: t("continue_guessing"), phoneLabel: t("continue") }
          : { label: t("open_the_tasting"), phoneLabel: t("open") },
      href: console ? `${lobby}/host` : lobby,
    };
  }

  if (row.status === "CLOSED") {
    const day = shortDate(row.activityAt);
    // A host who set the answers reads "You hosted" as the row's value
    // (placementCopy), so the meta does not say it a second time.
    const hosted = row.hosting
      ? setTheAnswers(row)
        ? ""
        : t("you_hosted")
      : t("host_hosted", { host: hostNameOf(t, row) });
    return {
      kind: "finished",
      meta: [
        day,
        mode,
        hosted,
        row.tasterCount === 1 ? t("tasters_one") : t("tasters_many", { n: row.tasterCount }),
      ].filter((p) => p !== ""),
      phoneMeta: [day, row.hosting ? t("you") : hostNameOf(t, row), mode].filter((p) => p !== ""),
      href: lobby,
    };
  }

  const who = row.hosting ? t("hosting") : t("hosted_by", { host: hostNameOf(t, row) });
  const date: MetaPart[] = row.scheduledAt ? [{ date: row.scheduledAt }] : [];
  return {
    kind: "draft",
    meta: [who, ...date, glassesPhrase(t, row.glassCount)],
    phoneMeta: [row.hosting ? t("hosting") : hostNameOf(t, row), ...date],
    href: lobby,
  };
}

/**
 * Which rows need a placing fetched: finished tastings with a leaderboard
 * (not OPEN) where I competed — the host of a host-provides tasting set the
 * answers and reads "You hosted" without one.
 */
export function wantsPlacement(row: ArchiveTasting): boolean {
  return row.status === "CLOSED" && row.revealMode !== "OPEN" && !setTheAnswers(row);
}

/**
 * How an invitation's schedule reads (ledger R5: "invitationDayPhrase |
 * LocalDateTime"), by calendar days from now: within a week either side the
 * relative phrase ("tomorrow", "in 3 days", "2 days ago"), with the local
 * time added for yesterday / today / tomorrow, where it is the part that
 * matters ("tomorrow 20:00"); further out, or unreadable, the full local date.
 */
export function invitationWhen(days: number): { form: "relative" | "full"; withTime: boolean } {
  if (!Number.isFinite(days) || Math.abs(days) > 6) return { form: "full", withTime: false };
  return { form: "relative", withTime: Math.abs(days) <= 1 };
}

export type PlacementCopy = {
  /** "2nd" — or "You hosted" for the host of a host-provides tasting. */
  rank: string;
  /** "21 pts" / "4 of 4 matched"; absent for "You hosted". */
  detail?: string;
  /** The phone's shorter second line: "21 pts" / "4 of 4". */
  phoneDetail?: string;
  /** First place draws in gold, any other placing in bordeaux, "You hosted" as a quiet label (T1/T1b). */
  tone: "first" | "placed" | "hosted";
};

/**
 * The right-hand value of a finished row. A host who provided the wines never
 * competed (B10: "You hosted", no personal placing); a bring-your-own host
 * did. Semi-blind counts matches, not points. Null when the viewer was not a
 * competitor (or the placing has not loaded).
 */
export function placementCopy(
  t: ArchiveT,
  row: ArchiveTasting,
  placement: ArchivePlacement | null,
): PlacementCopy | null {
  if (setTheAnswers(row)) return { rank: t("you_hosted_cap"), tone: "hosted" };
  if (!placement) return null;
  const rank = ordinal(placement.rank);
  const tone = placement.rank === 1 ? "first" : "placed";
  if (row.revealMode === "SEMI_BLIND") {
    const vars = { k: placement.points, n: placement.matchedOf ?? placement.points };
    return { rank, detail: t("k_of_n_matched", vars), phoneDetail: t("k_of_n", vars), tone };
  }
  const pts = t("n_pts", { n: placement.points });
  return { rank, detail: pts, phoneDetail: pts, tone };
}
