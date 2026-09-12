// RFC 5545 calendar file for a scheduled tasting ("Add to your calendar", B3).
//
// Pure: the caller passes `now` for DTSTAMP, so the output is deterministic.
// Times are always written in UTC ("Z" form) and every calendar client shows
// them in the viewer's own zone; a tasting stores no time zone to offer as a
// TZID anyway.
//
// Wire rules followed (RFC 5545):
//  - every content line ends in CRLF, the last one included (§3.1);
//  - a line longer than 75 octets is folded with CRLF plus one space, split
//    between whole characters so a multi-octet UTF-8 sequence never breaks
//    across lines (§3.1);
//  - TEXT values escape backslash, semicolon and comma and write a newline as
//    "\n"; control characters other than tab are not allowed in TEXT and are
//    dropped (§3.3.11).
//
// No METHOD property: METHOD:PUBLISH makes the file an iTIP message, which
// requires an ORGANIZER (RFC 5546), and the host's email does not belong in a
// downloaded file. A plain VCALENDAR imports the same way everywhere.

import { deaccent } from "./deaccent";

/** Tastings store no end time; the calendar entry lasts this long. */
export const DEFAULT_TASTING_MINUTES = 180;

const MAX_LINE_OCTETS = 75;
const MAX_SLUG_LENGTH = 60;
const PRODID = "-//Blindr//Tasting calendar//EN";

export type TastingCalendarEvent = {
  /** Stable across downloads, so importing again updates the same event. */
  uid: string;
  title: string;
  description?: string | null;
  start: Date;
  /** Defaults to DEFAULT_TASTING_MINUTES. */
  durationMinutes?: number;
  /** Absolute link back to the tasting. */
  url: string;
  location?: string | null;
  /** When this file was generated (DTSTAMP). */
  now: Date;
};

const TAB = 0x09;
const LF = 0x0a;
const TEXT_KEEPS = new Set([TAB, LF]);
const KEEP_NONE = new Set<number>();

function withoutControls(value: string, keep: ReadonlySet<number>): string {
  let out = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    const isControl = cp < 0x20 || cp === 0x7f;
    if (!isControl || keep.has(cp)) out += ch;
  }
  return out;
}

/** Escape a TEXT property value (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return withoutControls(value.replace(/\r\n?/g, "\n"), TEXT_KEEPS)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function utf8Octets(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/**
 * Fold one content line to at most 75 octets per physical line (the leading
 * space of a continuation line counts). Splits only between code points.
 */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const ch of line) {
    const size = utf8Octets(ch.codePointAt(0) ?? 0);
    if (octets + size > MAX_LINE_OCTETS) {
      parts.push(current);
      current = " ";
      octets = 1;
    }
    current += ch;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n");
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** A DATE-TIME in UTC basic format, e.g. 20260917T170000Z. */
export function formatIcsUtc(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Cannot write an invalid date to a calendar file");
  }
  // The format has exactly four year digits (RFC 5545 §3.3.4); padding cannot
  // make a negative or five-digit year fit.
  const year = date.getUTCFullYear();
  if (year < 0 || year > 9999) {
    throw new RangeError(`Cannot write the year ${year} to a calendar file`);
  }
  return (
    `${pad(year, 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** A complete VCALENDAR holding one VEVENT for the tasting. */
export function buildTastingIcs(event: TastingCalendarEvent): string {
  const minutes = event.durationMinutes ?? DEFAULT_TASTING_MINUTES;
  const startMs = event.start.getTime();
  const end = new Date(startMs + minutes * 60_000);
  // DTEND must be later than DTSTART (RFC 5545 §3.8.2.2) as written, in whole
  // seconds: a positive duration under a second would print the same time
  // twice. (An invalid start is refused by formatIcsUtc below.)
  if (
    !Number.isFinite(minutes) ||
    Math.floor(end.getTime() / 1000) <= Math.floor(startMs / 1000)
  ) {
    throw new RangeError(`durationMinutes must end the event after its start, got ${minutes}`);
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${formatIcsUtc(event.now)}`,
    `DTSTART:${formatIcsUtc(event.start)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  const description = event.description?.trim();
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  const location = event.location?.trim();
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  // URL's value type is URI, not TEXT: no text escaping, but never a raw line
  // break, which would start a new property.
  lines.push(`URL:${withoutControls(event.url, KEEP_NONE)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/**
 * The download's file name: the tasting name as an ASCII slug
 * ("Barolo night, Østerbro!" → "barolo-night-osterbro.ics").
 */
export function icsFilename(name: string): string {
  const slug = deaccent(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");
  return `${slug || "tasting"}.ics`;
}
