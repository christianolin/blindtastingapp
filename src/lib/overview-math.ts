// Pure selection rules for the Overview page — which tasting the banner shows,
// what its stage line says, and how the Blind tastings card orders its rows.
// Kept free of any Next/Supabase import so vitest's node environment can test
// them; getOverviewData (overview-data.ts) feeds them RLS-readable rows.
import type { TastingRow } from "@/lib/overview-types";

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
