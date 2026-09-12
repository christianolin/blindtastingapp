// Relative day words for a scheduled tasting (ledger B3; map GUEST-02,
// GUEST-09): the invitation's "in 2 days" and the laptop eyebrow's
// "Invitation · 2 days away".
//
// Everything works in the runtime's LOCAL calendar, so call it on the client,
// where local means the viewer's zone — the same reason LocalDateTime formats
// client-side. Days are counted as calendar days, not 24-hour spans: 23:59
// to 00:01 is "tomorrow", and a 23- or 25-hour DST day still counts as one.
// Omit the phrase when scheduled_at is null; an invalid Date gives "".

const MS_PER_DAY = 86400000;

// The local calendar date, re-expressed as a whole day count on the UTC
// axis, which has no DST. setUTCFullYear avoids Date.UTC's 0–99 → 19xx
// year mapping.
function localDayNumber(date: Date): number {
  const utc = new Date(0);
  utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round(utc.getTime() / MS_PER_DAY);
}

/**
 * Calendar days from `from` to `to` in local time: positive when `to` is a
 * later day, 0 on the same day, NaN when either date is invalid.
 */
export function calendarDaysBetween(from: Date, to: Date): number {
  return localDayNumber(to) - localDayNumber(from);
}

function pastPhrase(days: number): string {
  return days === -1 ? "yesterday" : `${-days} days ago`;
}

/** The invitation's time card: today, tomorrow, in N days, yesterday, N days ago. */
export function invitationDayPhrase(when: Date, now: Date): string {
  const days = calendarDaysBetween(now, when);
  if (!Number.isFinite(days)) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return days > 1 ? `in ${days} days` : pastPhrase(days);
}

/** The laptop eyebrow: today, tomorrow, N days away; past dates as the invitation. */
export function eyebrowDayPhrase(when: Date, now: Date): string {
  const days = calendarDaysBetween(now, when);
  if (!Number.isFinite(days)) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return days > 1 ? `${days} days away` : pastPhrase(days);
}
