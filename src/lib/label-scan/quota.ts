// How many label reads one account may spend, as pure predicates (the
// guards.ts pattern: no `server-only`, no runtime imports, so vitest loads it).
//
// Why this exists. `readLabelPhoto` is the only caller of `readLabel`, and each
// call is about a cent of model spend (spec §A.7). Signing up is open --
// /signup is linked from /login and takes anyone with an email -- so before
// this, any account could hold one uploaded photo and call the action in a loop
// for unbounded spend. `isOwnStagingPath` stops a caller reading someone else's
// image; it says nothing about reading their own a thousand times.
//
// The window is counted from `label_reads`, which holds exactly the calls that
// were billed (`labelReadRow` returns null for the outcomes that threw before
// the model answered), so the count is real spend and never punishes a user for
// a network blip.

/** Per account. A 12-bottle case, re-shot and retried, sits well inside the hour. */
export const SCAN_LIMITS = { perHour: 40, perDay: 150 } as const;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * How many rows the server needs to fetch to decide. One more than the day
 * limit: if that many come back the day window is full whatever the timestamps
 * are, so the query stays bounded no matter how many reads an account has.
 */
export const QUOTA_FETCH_LIMIT = SCAN_LIMITS.perDay + 1;

export type QuotaWindow = "hour" | "day";

/**
 * Which limit the next read would break, or null when it may proceed.
 * `timestamps` are `label_reads.created_at` values for one user; anything older
 * than a day is ignored, so the caller may over-fetch safely.
 */
export function quotaRefusal(
  now: Date,
  timestamps: readonly (string | Date)[],
): QuotaWindow | null {
  const t = now.getTime();
  let hour = 0;
  let day = 0;
  for (const raw of timestamps) {
    const at = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
    if (!Number.isFinite(at)) continue;
    const age = t - at;
    // A clock skew that puts a row in the future still counts against both
    // windows -- it is a read that happened, and dropping it would be a hole.
    if (age > DAY_MS) continue;
    day++;
    if (age <= HOUR_MS) hour++;
  }
  if (hour >= SCAN_LIMITS.perHour) return "hour";
  if (day >= SCAN_LIMITS.perDay) return "day";
  return null;
}

/** What the sheet says. Retrying is futile until the window moves, so the copy says when. */
export function quotaMessage(window: QuotaWindow): string {
  return window === "hour"
    ? "That's a lot of label scans in one hour — try again a little later, or add the wine by hand."
    : "You've reached today's label scans — try again tomorrow, or add the wine by hand.";
}
