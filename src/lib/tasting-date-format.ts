// BT-D1 (spec §6.3 item 3; §3.3 item 1; refinement 8): the date/time strings
// used across the redesigned tasting surfaces — the lobby eyebrow, the guest
// invitation chip and the S5 card — in English words, 24-hour clock, in the
// viewer's own time zone (or a given IANA zone, for tests). "default" is
// `LocalDateTime`'s pre-existing locale-formatted string and is not produced
// here; every other format goes through `formatTastingDate`.
// Pure: runtime imports by relative path only, so vitest loads it in node.

export type TastingDateFormat = "default" | "eyebrow" | "eyebrow-short" | "card";

type DateParts = {
  weekday: string;
  day: string;
  month: string;
  hour: string;
  minute: string;
};

function dateParts(iso: string, timeZone: string | undefined): DateParts | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  // `hourCycle: "h23"` (not `hour12: false`, which some engines pair with
  // the "h24" cycle instead and render midnight as "24:00") is what keeps
  // midnight as "00:00".
  const formatter = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });

  const out: Partial<DateParts> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type === "weekday" || part.type === "day" || part.type === "month" || part.type === "hour" || part.type === "minute") {
      out[part.type] = part.value;
    }
  }
  if (!out.weekday || !out.day || !out.month || !out.hour || !out.minute) return null;
  return out as DateParts;
}

/**
 * Formats `iso` for a given tasting-surface format, in `timeZone` (an IANA
 * zone name) or the runtime's own zone when omitted. An unparseable `iso`
 * returns "" — the caller (`LocalDateTime`) falls back to "Scheduled".
 */
export function formatTastingDate(
  iso: string,
  format: Exclude<TastingDateFormat, "default">,
  timeZone?: string,
): string {
  const parts = dateParts(iso, timeZone);
  if (!parts) return "";
  const time = `${parts.hour}:${parts.minute}`;
  switch (format) {
    case "eyebrow":
      return `${parts.weekday} ${parts.day} ${parts.month} ${time}`;
    case "eyebrow-short":
      return `${parts.weekday} ${time}`;
    case "card":
      return `${parts.weekday} ${parts.day} ${parts.month}, ${time}`;
  }
}
