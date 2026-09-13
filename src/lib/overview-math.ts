// Pure selection rules for the Overview page — which tasting the banner shows,
// what its stage line and words say, who may add to its flight, and how the
// Blind tastings card orders its rows. Kept free of any Next/Supabase import
// so vitest's node environment can test them (runtime imports are relative
// only: vitest has no "@/" alias); getOverviewData (overview-data.ts) feeds
// them RLS-readable rows.
import type { TastingRow } from "@/lib/overview-types";
import type {
  RevealMode,
  TastingStatus,
  TimingMode,
  WineSourceMode,
} from "@/lib/supabase/database.types";
import { semiBlindAddRefusal } from "./flight-glass-rules";
import { joinEyebrow, statusWord, timingWord } from "./tasting-eyebrow";
import { makeWineLabeler } from "./wine-label";

export type LiveCandidate = {
  id: string;
  timing_mode: string;
  status: string;
  created_at: string;
  /** My own tasting_participants.status for this tasting. */
  myStatus: string;
};

const byNewestCreated = (a: { created_at: string }, b: { created_at: string }) =>
  b.created_at.localeCompare(a.created_at);

/**
 * A tasting that has been started and not yet finished. Legacy rows created
 * before the DRAFT lifecycle carry status OPEN and count as started, the same
 * "anything ≠ DRAFT" rule the tasting page and /taste already apply (see
 * CLAUDE.md and migration 20260716120000_tasting_scheduled_at.sql).
 */
export const isRunningStatus = (status: string) =>
  status !== "DRAFT" && status !== "CLOSED";

/**
 * The tasting the live banner should show: a started (IN_PROGRESS, or legacy
 * OPEN) tasting where I am a JOINED participant (the host always is). A LIVE
 * (around-the-table) tasting beats a self-paced ASYNC one; within the same
 * timing mode the most recently created wins. Null when nothing is running
 * for me.
 */
export function pickLiveTasting<T extends LiveCandidate>(rows: T[]): T | null {
  const running = rows.filter((r) => isRunningStatus(r.status) && r.myStatus === "JOINED");
  if (running.length === 0) return null;
  const rank = (r: LiveCandidate) => (r.timing_mode === "LIVE" ? 0 : 1);
  return [...running].sort((a, b) => rank(a) - rank(b) || byNewestCreated(a, b))[0];
}

export type NextCandidate = {
  id: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  myStatus: string;
  hostId: string;
  myId: string;
};

/**
 * The "Next up" tasting when nothing is live: among DRAFT tastings I host or
 * have joined, the soonest one scheduled at or after `now`; failing that the
 * newest unscheduled one; failing that (every schedule already passed) the
 * most recently created. Null when there is no draft at all.
 */
export function pickNextTasting<T extends NextCandidate>(
  rows: T[],
  now: Date,
): T | null {
  const drafts = rows.filter(
    (r) => r.status === "DRAFT" && (r.hostId === r.myId || r.myStatus === "JOINED"),
  );
  if (drafts.length === 0) return null;

  const nowMs = now.getTime();
  const upcoming = drafts
    .filter((r) => r.scheduled_at !== null && Date.parse(r.scheduled_at) >= nowMs)
    .sort(
      (a, b) =>
        Date.parse(a.scheduled_at as string) - Date.parse(b.scheduled_at as string) ||
        byNewestCreated(a, b),
    );
  if (upcoming.length > 0) return upcoming[0];

  const unscheduled = drafts.filter((r) => r.scheduled_at === null).sort(byNewestCreated);
  if (unscheduled.length > 0) return unscheduled[0];

  return [...drafts].sort(byNewestCreated)[0];
}

// get_wine_reveal's revealed_keys → the word the banner uses for that step.
const STAGE_LABEL: Record<string, string> = {
  country: "country",
  region: "region",
  appellation: "appellation",
  grapes: "grapes",
  producer: "producer",
  type_designation: "designation",
  vintage: "vintage",
};

/**
 * The stage phrase in the live banner's meta line. OPEN (Taste & Rate)
 * tastings have no reveal stage and read "" (the page shows a different meta
 * line for them); otherwise "all revealed" once every wine is revealed,
 * "guessing open" before the first reveal step, and "{last category}
 * revealed" while a wine is mid-reveal.
 */
export function bannerStage(
  revealedKeys: string[],
  allRevealed: boolean,
  revealMode: "BLIND" | "SEMI_BLIND" | "OPEN",
): string {
  if (revealMode === "OPEN") return "";
  if (allRevealed) return "all revealed";
  if (revealedKeys.length === 0) return "guessing open";
  const last = revealedKeys[revealedKeys.length - 1];
  return `${STAGE_LABEL[last] ?? last} revealed`;
}

/**
 * The add-wine flight hint's phase for a running tasting (D12, entry-4): only
 * a LIVE tasting is "live"; a started ASYNC one is "self-paced", which the
 * sheet's subtitle reads as "in progress". A next-up draft is "next" — the
 * banner sets that one itself.
 */
export function bannerPhase(timingMode: TimingMode): "live" | "self-paced" {
  return timingMode === "LIVE" ? "live" : "self-paced";
}

export type LiveBannerCopy = {
  /** "ping" = the pulsing LiveDot; "still" = a static dot. */
  dot: "ping" | "still";
  eyebrow: string;
  cta: string;
};

/**
 * The running banner's words (spec §D.4 #2, entry-4). Only a LIVE tasting —
 * people at one table right now — reads "Live now" behind the pulsing dot and
 * sends you "Back to the table"; a self-paced one reads "In progress ·
 * self-paced" behind a still dot and sends you to "Continue guessing". `host`
 * is the host clause the banner builds ("hosted by Ida" / "you are hosting").
 */
export function liveBannerCopy(timingMode: TimingMode, host: string): LiveBannerCopy {
  if (timingMode === "LIVE") {
    return { dot: "ping", eyebrow: joinEyebrow(["Live now", host]), cta: "Back to the table" };
  }
  return {
    dot: "still",
    eyebrow: joinEyebrow([statusWord("IN_PROGRESS", timingMode), timingWord(timingMode), host]),
    cta: "Continue guessing",
  };
}

/**
 * The status label a tasting card shows for a running tasting: "Live now"
 * only for a LIVE one, otherwise "In progress" (entry-4). Null for every
 * other status, which keeps its own label.
 */
export function tastingCardStatus(status: TastingStatus, timingMode: TimingMode): string | null {
  if (status !== "IN_PROGRESS") return null;
  return timingMode === "LIVE" ? "Live now" : statusWord(status, timingMode);
}

/**
 * Who may add a wine to a tasting's flight — the same rule the server's
 * `resolveTastingAdder` enforces: the host of a host-provides tasting, or any
 * JOINED participant of a bring-your-own one, and never once a started
 * semi-blind tasting has fixed its flight (`semiBlindAddRefusal`, owner Q7) —
 * the server already refuses that add (`resolveTastingAdder`), this just
 * keeps the Overview from registering a flight hint (and a paid label scan)
 * for a glass it would only reject. The Overview registers its flight hint
 * (and offers "Add a wine") only when this holds, so the sheet never draws a
 * flight row you cannot take (D12; scan-4, sources-2, entry-3).
 */
export function canAddToFlight(t: {
  wineSource: WineSourceMode;
  hostId: string;
  myId: string;
  myStatus: string;
  revealMode: RevealMode;
  tastingStatus: TastingStatus;
}): boolean {
  if (semiBlindAddRefusal({ revealMode: t.revealMode, tastingStatus: t.tastingStatus })) {
    return false;
  }
  return t.wineSource === "HOST_PROVIDES" ? t.hostId === t.myId : t.myStatus === "JOINED";
}

/** One line of the next-up banner's flight list. */
export type FlightLine = { label: string; filled: boolean; note?: string };

/**
 * The next-up banner's flight: the real glasses, never padded to a planned
 * count (none exists, and a host may pour more — amendment 6). Host-provides
 * glasses read "Wine N · set" by list order. Bring-your-own lists every glass
 * by contributor ("Gustav's wine", "Ida's wine #2"), then one "waiting for
 * {name} to add it" row per JOINED participant who has not brought a bottle
 * yet, in participant order — the create sheet's and the lobby's rows, with no
 * per-person slots (spec §D.4 #3). `participants` is the tasting's whole list,
 * so a glass from someone who has since left keeps their name.
 */
export function nextUpFlight(
  wineSource: WineSourceMode,
  wines: { id: string; position: number; contributor_participant_id: string | null }[],
  participants: { id: string; status: string; name: string }[],
): FlightLine[] {
  const ordered = [...wines].sort((a, b) => a.position - b.position);
  const label = makeWineLabeler(
    ordered,
    wineSource,
    new Map(participants.map((p) => [p.id, p.name])),
  );
  if (wineSource === "HOST_PROVIDES") {
    return ordered.map((w) => ({ label: label(w), filled: true, note: "set" }));
  }
  const brought = new Set(ordered.map((w) => w.contributor_participant_id));
  return [
    ...ordered.map((w) => ({ label: label(w), filled: true })),
    ...participants
      .filter((p) => p.status === "JOINED" && !brought.has(p.id))
      .map((p) => ({ label: `waiting for ${p.name} to add it`, filled: false })),
  ];
}

/**
 * The Blind tastings card's row order: invitations, then drafts I host, then
 * self-paced tastings in progress, then finished tastings — capped as a whole
 * (default 5), so a full inbox of invitations pushes finished rows off.
 */
export function orderTastingRows(
  invites: TastingRow[],
  hosting: TastingRow[],
  selfPaced: TastingRow[],
  finished: TastingRow[],
  cap = 5,
): TastingRow[] {
  return [...invites, ...hosting, ...selfPaced, ...finished].slice(0, cap);
}
