// The active-tasting banner's rules (spec 2026-09-19-active-tasting-banner.md
// §2–§3): which of the viewer's tastings the strip under the top bar names,
// where its button goes, and on which pages it hides. Pure — relative imports
// only (vitest has no `@/` alias), and the lifecycle module it borrows from has
// only type imports.
//
// Rule 1: a candidate carries only tasting-level facts a JOINED member can
// already read (name, status, timing, mode, source, the lifecycle stamps), and
// an item only { tastingId, name, state, href }. Nothing here knows a wine.
import type {
  ParticipantStatus,
  RevealMode,
  TastingStatus,
  TimingMode,
  WineSourceMode,
} from "../supabase/database.types";
import { startLandsOnConsole } from "../tasting-lifecycle-copy";

export type ActiveTastingCandidate = {
  id: string;
  name: string;
  hostId: string;
  status: TastingStatus;
  timingMode: TimingMode;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
  startedAt: string | null;
  pausedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  /** The viewer's own tasting_participants.status for this tasting. */
  myStatus: ParticipantStatus;
};

export type ActiveTastingState = "live" | "paused" | "in-progress" | "waiting";

export type ActiveTastingItem = {
  tastingId: string;
  name: string;
  state: ActiveTastingState;
  href: string;
};

/** One read of the viewer's active tastings, stamped with the server's clock. */
export type ActiveTastingSnapshot = { items: ActiveTastingItem[]; checkedAt: string };

export type BannerView = { item: ActiveTastingItem; more: number };

export const DRAFT_AHEAD_MS = 6 * 3_600_000;
export const DRAFT_BEHIND_MS = 12 * 3_600_000;

/** A failed read (D13): stamped at the epoch so any later poll replaces it. */
export const EMPTY_SNAPSHOT: ActiveTastingSnapshot = {
  items: [],
  checkedAt: "1970-01-01T00:00:00.000Z",
};

/** Milliseconds since the epoch; null for null, NaN for garbage. */
function ms(iso: string | null): number | null {
  return iso === null ? null : Date.parse(iso);
}

/** Every timestamp the rules read must parse, so every sort key is finite. */
function timestampsParse(c: ActiveTastingCandidate): boolean {
  return [c.startedAt, c.scheduledAt, c.createdAt].every(
    (iso) => iso === null || Number.isFinite(Date.parse(iso)),
  );
}

/** A LIVE tasting's anchor: when it started, or for a legacy row its schedule, or its
    creation. No longer a window bound (owner decision 2026-09-24: a running LIVE
    tasting shows however long ago it started) — only the live/paused sort order
    still reads it. */
function liveAnchor(c: ActiveTastingCandidate): number {
  return (ms(c.startedAt) ?? ms(c.scheduledAt) ?? ms(c.createdAt)) as number;
}

/**
 * D1 + D2: the banner state for one of the viewer's tastings, or null when it
 * is not eligible. Only the viewer's own row counts — JOINED (the host's row
 * always is). A running IN_PROGRESS tasting always counts; a DRAFT one only
 * inside its window.
 */
export function activeState(
  c: ActiveTastingCandidate,
  now: Date,
): ActiveTastingState | null {
  if (c.myStatus !== "JOINED") return null;
  if (!timestampsParse(c)) return null;
  const t = now.getTime();

  if (c.status === "IN_PROGRESS") {
    if (c.timingMode === "ASYNC") return "in-progress";
    if (c.timingMode !== "LIVE") return null;
    // No time limit (owner decision 2026-09-24): a forgotten tasting is the
    // host's to end, and guests must always find their way back. Paused
    // shows too, however long ago it started.
    return c.pausedAt ? "paused" : "live";
  }

  if (c.status === "DRAFT") {
    const scheduled = ms(c.scheduledAt);
    if (scheduled !== null) {
      return scheduled >= t - DRAFT_BEHIND_MS && scheduled <= t + DRAFT_AHEAD_MS
        ? "waiting"
        : null;
    }
    return t - Date.parse(c.createdAt) <= DRAFT_BEHIND_MS ? "waiting" : null;
  }

  // CLOSED, and a legacy OPEN-status tasting, never show.
  return null;
}

/**
 * D5: the tasting page, except the host of a running tasting whose Start
 * lands on the console — that host goes back to the console. (The console
 * itself redirects a DRAFT or non-LIVE tasting to the lobby anyway.)
 */
export function activeHref(c: ActiveTastingCandidate, viewerId: string): string {
  const base = `/tastings/${c.id}`;
  return c.hostId === viewerId && c.status === "IN_PROGRESS" && startLandsOnConsole(c)
    ? `${base}/host`
    : base;
}

const STATE_RANK: Record<ActiveTastingState, number> = {
  live: 0,
  paused: 1,
  "in-progress": 2,
  waiting: 3,
};

type Ranked = { c: ActiveTastingCandidate; state: ActiveTastingState };

/** D10's tie-breaks inside one priority group; negative puts `a` first. */
function compareWithinGroup(a: Ranked, b: Ranked, now: number): number {
  const { c: x } = a;
  const { c: y } = b;
  switch (a.state) {
    case "live":
    case "paused":
      return liveAnchor(y) - liveAnchor(x);
    case "in-progress":
      return (
        (ms(y.startedAt) ?? Date.parse(y.createdAt)) -
        (ms(x.startedAt) ?? Date.parse(x.createdAt))
      );
    case "waiting": {
      const xs = ms(x.scheduledAt);
      const ys = ms(y.scheduledAt);
      if (xs !== null && ys !== null) {
        return Math.abs(xs - now) - Math.abs(ys - now) || xs - ys;
      }
      if (xs !== null) return -1;
      if (ys !== null) return 1;
      return Date.parse(y.createdAt) - Date.parse(x.createdAt);
    }
  }
}

/**
 * The eligible tastings in D3 order — live, paused, in progress, then waiting —
 * with D10's tie-breaks and `id` ascending as the last resort.
 */
export function selectActiveTastings(
  rows: ActiveTastingCandidate[],
  viewerId: string,
  now: Date,
): ActiveTastingItem[] {
  const t = now.getTime();
  const ranked: Ranked[] = [];
  for (const c of rows) {
    const state = activeState(c, now);
    if (state) ranked.push({ c, state });
  }
  ranked.sort(
    (a, b) =>
      STATE_RANK[a.state] - STATE_RANK[b.state] ||
      compareWithinGroup(a, b, t) ||
      (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0),
  );
  return ranked.map(({ c, state }) => ({
    tastingId: c.id,
    name: c.name,
    state,
    href: activeHref(c, viewerId),
  }));
}

/** `/tastings/<id>` itself or anything under it — not `/tastings/<id>0`. */
export function isOnTastingPath(pathname: string, tastingId: string): boolean {
  const base = `/tastings/${tastingId}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

const BANNER_FREE_SEGMENTS = new Set(["login", "signup", "auth", "invite"]);

/** The sign-in, auth and platform-invite pages, matched on the first segment. */
export function isBannerFreePath(pathname: string): boolean {
  return BANNER_FREE_SEGMENTS.has(pathname.split("/")[1] ?? "");
}

/**
 * D6 + D11: what the strip shows on this path — the first item, and how many
 * other qualifying tastings "+N more" stands for (never the one whose page
 * you are on). Null hides the whole strip: no items, a banner-free path, or
 * the first item's own pages.
 */
export function bannerView(
  items: ActiveTastingItem[],
  pathname: string,
): BannerView | null {
  if (isBannerFreePath(pathname)) return null;
  const [first, ...rest] = items;
  if (!first || isOnTastingPath(pathname, first.tastingId)) return null;
  return {
    item: first,
    more: rest.filter((i) => !isOnTastingPath(pathname, i.tastingId)).length,
  };
}

/**
 * D12: poll everywhere except the first item's own pages (hidden there, and
 * AutoRefresh/RevealSync re-render the header anyway) and the banner-free
 * paths. With no items it polls, so a tasting that just started still appears.
 */
export function shouldPoll(items: ActiveTastingItem[], pathname: string): boolean {
  if (isBannerFreePath(pathname)) return false;
  const first = items[0];
  return !(first && isOnTastingPath(pathname, first.tastingId));
}

/** The cadence while there is a tasting to return to: the strip's name, state
    and "+N more" can all move, so it stays live. */
export const POLL_ACTIVE_MS = 20_000;
/** The cadence when the last read found nothing. */
export const POLL_IDLE_MS = 120_000;

/**
 * D12b (2026-09-20 performance round): how often to re-read. `pollActiveTastings`
 * is a server action costing a measured ~788 ms of server time, and the banner
 * was spending it every 20 s on every page a viewer leaves open — 32 POSTs in
 * one session on /knowledge/map, for a viewer with nothing active at all.
 *
 * With no items the strip's whole job is to show nothing, and the only thing a
 * poll can discover is a tasting that has just started or been scheduled —
 * which also arrives with any page render, on focus, and on returning to the
 * tab, all of which still check at once. So back off there, and leave the live
 * cadence exactly as it was for a viewer who has one.
 */
export function pollIntervalMs(items: ActiveTastingItem[]): number {
  return items.length > 0 ? POLL_ACTIVE_MS : POLL_IDLE_MS;
}

/** D14: the newer of the server render and the last poll, by server clock; a tie goes to the render. */
export function newerSnapshot(
  server: ActiveTastingSnapshot,
  polled: ActiveTastingSnapshot | null,
): ActiveTastingSnapshot {
  if (!polled) return server;
  return Date.parse(polled.checkedAt) > Date.parse(server.checkedAt) ? polled : server;
}

const TASTING_STATUSES: readonly TastingStatus[] = ["DRAFT", "OPEN", "IN_PROGRESS", "CLOSED"];
const PARTICIPANT_STATUSES: readonly ParticipantStatus[] = ["INVITED", "JOINED", "DECLINED"];
const TIMING_MODES: readonly TimingMode[] = ["LIVE", "ASYNC"];
const REVEAL_MODES: readonly RevealMode[] = ["BLIND", "SEMI_BLIND", "OPEN"];
const WINE_SOURCES: readonly WineSourceMode[] = ["HOST_PROVIDES", "PARTICIPANT_CONTRIBUTED"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

function optionalString(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : undefined;
}

/**
 * One `tasting_participants` row with its `tastings!inner(...)` embed (§5) →
 * a candidate, or null when the row is not the expected shape. The embed is
 * untyped (every table carries `Relationships: []`), so every field is
 * checked here rather than cast. PostgREST embeds a to-one as an object; a
 * one-element array is accepted too.
 */
export function candidateFromRow(row: unknown): ActiveTastingCandidate | null {
  if (!isRecord(row)) return null;
  const embed = Array.isArray(row.tastings)
    ? row.tastings.length === 1
      ? row.tastings[0]
      : null
    : row.tastings;
  if (!isRecord(embed)) return null;

  const { id, name, host_id, created_at } = embed;
  if (typeof id !== "string" || typeof name !== "string") return null;
  if (typeof host_id !== "string" || typeof created_at !== "string") return null;
  if (!oneOf(row.status, PARTICIPANT_STATUSES)) return null;
  if (!oneOf(embed.status, TASTING_STATUSES)) return null;
  if (!oneOf(embed.timing_mode, TIMING_MODES)) return null;
  if (!oneOf(embed.reveal_mode, REVEAL_MODES)) return null;
  if (!oneOf(embed.wine_source, WINE_SOURCES)) return null;

  const startedAt = optionalString(embed.started_at);
  const pausedAt = optionalString(embed.paused_at);
  const scheduledAt = optionalString(embed.scheduled_at);
  if (startedAt === undefined || pausedAt === undefined || scheduledAt === undefined) {
    return null;
  }

  return {
    id,
    name,
    hostId: host_id,
    status: embed.status,
    timingMode: embed.timing_mode,
    revealMode: embed.reveal_mode,
    wineSource: embed.wine_source,
    startedAt,
    pausedAt,
    scheduledAt,
    createdAt: created_at,
    myStatus: row.status,
  };
}

/**
 * D8 / §7: what Overview renders in its banner slot. `overviewTastingId` is
 * its live or next-up banner's tasting (null for its "none" kind). When the
 * header strip names that same tasting — on /overview it always shows the
 * first item — Overview keeps only the flight-hint registrar. A live or
 * next-up banner never maps to the start row, so the Taste-blind tile's gold
 * rule is unchanged.
 */
export function overviewSlot(
  overviewTastingId: string | null,
  items: ActiveTastingItem[],
): "banner" | "registrar-only" | "start-row" {
  if (overviewTastingId === null) return "start-row";
  return items[0]?.tastingId === overviewTastingId ? "registrar-only" : "banner";
}
