import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASTING_MINUTES,
  buildTastingIcs,
  escapeIcsText,
  foldIcsLine,
  formatIcsUtc,
  icsFilename,
  type TastingCalendarEvent,
} from "./ics";

const WINE_GLASS = "\u{1F377}"; // 4 octets in UTF-8, a surrogate pair in UTF-16

const octets = (s: string) => new TextEncoder().encode(s).length;

// RFC 5545 §3.1 unfolding: drop every CRLF that is followed by a space or tab.
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "");

/** The unfolded value of the first `name:` content line, if there is one. */
const property = (ics: string, name: string) =>
  unfold(ics)
    .split("\r\n")
    .find((line) => line.startsWith(`${name}:`))
    ?.slice(name.length + 1);

/** True when no UTF-16 surrogate has been cut off from its partner. */
const wholeCharacters = (s: string) =>
  [...s].every((ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return cp < 0xd800 || cp > 0xdfff;
  });

const event: TastingCalendarEvent = {
  uid: "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b@blindr",
  title: "Barolo night",
  start: new Date("2026-09-17T17:00:00Z"),
  url: "https://blindr.example/tastings/3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
  now: new Date("2026-09-12T08:30:15.123Z"),
};

describe("escapeIcsText", () => {
  it("escapes backslash, semicolon and comma", () => {
    expect(escapeIcsText("a\\b;c,d")).toBe("a\\\\b\\;c\\,d");
  });

  it("escapes a backslash before the escapes that follow it", () => {
    // The two characters \, become \\\, — an escaped backslash, then an escaped comma.
    expect(escapeIcsText("\\,")).toBe("\\\\\\,");
  });

  it("writes LF, CRLF and a lone CR as \\n", () => {
    expect(escapeIcsText("one\ntwo\r\nthree\rfour")).toBe("one\\ntwo\\nthree\\nfour");
  });

  it("drops control characters but keeps tabs", () => {
    expect(escapeIcsText("a\x00b\x07c\td\x7f")).toBe("abc\td");
  });

  it("leaves accents and other punctuation alone", () => {
    const text = 'Château Pétrus: 2015 — "magnum"';
    expect(escapeIcsText(text)).toBe(text);
  });
});

describe("foldIcsLine", () => {
  it("leaves a line of exactly 75 octets alone", () => {
    const line = "X".repeat(75);
    expect(foldIcsLine(line)).toBe(line);
  });

  it("folds past 75 octets with CRLF and one space", () => {
    expect(foldIcsLine("X".repeat(76))).toBe(`${"X".repeat(75)}\r\n X`);
  });

  it("counts the continuation space toward the next line's 75 octets", () => {
    const parts = foldIcsLine("X".repeat(75 + 74 + 10)).split("\r\n");
    expect(parts.map(octets)).toEqual([75, 75, 11]);
  });

  it("folds before a multi-octet character rather than through it", () => {
    // "SUMMARY:" plus 66 letters is 74 octets; "å" (2 octets) would make 76.
    const line = `SUMMARY:${"a".repeat(66)}å og mere`;
    const folded = foldIcsLine(line);
    const parts = folded.split("\r\n");
    expect(octets(parts[0])).toBe(74);
    expect(parts[1].startsWith(" å")).toBe(true);
    expect(unfold(folded)).toBe(line);
  });

  it("folds before a 4-octet character that would cross the limit", () => {
    // 73 octets, then the glass (4 octets) would make 77.
    const line = `SUMMARY:${"a".repeat(65)}${WINE_GLASS}`;
    const parts = foldIcsLine(line).split("\r\n");
    expect(octets(parts[0])).toBe(73);
    expect(parts[1]).toBe(` ${WINE_GLASS}`);
  });

  it("keeps 2-, 3- and 4-octet characters whole across many folds", () => {
    const line = `DESCRIPTION:${`Smagning på Østerbro ${WINE_GLASS} koster 150 € — `.repeat(12)}`;
    const folded = foldIcsLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(5);
    parts.forEach((part, i) => {
      expect(octets(part)).toBeLessThanOrEqual(75);
      expect(wholeCharacters(part)).toBe(true);
      if (i > 0) expect(part.startsWith(" ")).toBe(true);
    });
    // Every octet survives: the parts carry the line plus one space per fold.
    const total = parts.reduce((sum, part) => sum + octets(part), 0);
    expect(total).toBe(octets(line) + parts.length - 1);
    expect(unfold(folded)).toBe(line);
  });
});

describe("formatIcsUtc", () => {
  it("writes UTC in basic format and drops milliseconds", () => {
    expect(formatIcsUtc(new Date("2026-09-17T19:05:09.999+02:00"))).toBe("20260917T170509Z");
  });

  it("refuses an invalid date", () => {
    expect(() => formatIcsUtc(new Date("not a date"))).toThrow(RangeError);
  });

  it("pads a short year and refuses one that does not fit four digits", () => {
    expect(formatIcsUtc(new Date(Date.UTC(999, 0, 1)))).toBe("09990101T000000Z");
    expect(() => formatIcsUtc(new Date(Date.UTC(10000, 0, 1)))).toThrow(RangeError);
    expect(() => formatIcsUtc(new Date(Date.UTC(-1, 0, 1)))).toThrow(RangeError);
  });
});

describe("buildTastingIcs", () => {
  it("wraps one VEVENT in a VCALENDAR, every line ending in CRLF", () => {
    const ics = buildTastingIcs(event);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:")).toBe(true);
    expect(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
    // No bare CR or LF anywhere once the CRLF pairs are gone.
    expect(ics.split("\r\n").join("")).not.toMatch(/[\r\n]/);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(property(ics, "UID")).toBe(event.uid);
    expect(property(ics, "SUMMARY")).toBe("Barolo night");
    expect(property(ics, "URL")).toBe(event.url);
  });

  it("lasts three hours when no duration is given", () => {
    expect(DEFAULT_TASTING_MINUTES).toBe(180);
    const ics = buildTastingIcs(event);
    expect(property(ics, "DTSTART")).toBe("20260917T170000Z");
    expect(property(ics, "DTEND")).toBe("20260917T200000Z");
  });

  it("carries the default duration across midnight and the year end", () => {
    const ics = buildTastingIcs({ ...event, start: new Date("2026-12-31T22:30:00Z") });
    expect(property(ics, "DTEND")).toBe("20270101T013000Z");
  });

  it("uses an explicit duration when one is given", () => {
    const ics = buildTastingIcs({ ...event, durationMinutes: 90 });
    expect(property(ics, "DTEND")).toBe("20260917T183000Z");
  });

  it("refuses a duration that would not end after the start", () => {
    // 0.001 and 1/120 minutes are positive but under a second, so DTEND would
    // print the same second as DTSTART.
    for (const durationMinutes of [0, -30, 0.001, 1 / 120, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => buildTastingIcs({ ...event, durationMinutes })).toThrow(RangeError);
    }
  });

  it("accepts a duration of one second", () => {
    const ics = buildTastingIcs({ ...event, durationMinutes: 1 / 60 });
    expect(property(ics, "DTEND")).toBe("20260917T170001Z");
  });

  it("writes the start and the stamp in UTC whatever offset they were made with", () => {
    const ics = buildTastingIcs({ ...event, start: new Date("2026-09-17T19:00:00+02:00") });
    expect(property(ics, "DTSTART")).toBe("20260917T170000Z");
    expect(property(ics, "DTSTAMP")).toBe("20260912T083015Z");
  });

  it("escapes the title, the description and the location", () => {
    const ics = buildTastingIcs({
      ...event,
      title: "Barolo, Barbaresco; and friends",
      description: "Bring a glass.\nNo perfume, please.",
      location: "Christian's place; Østerbro",
    });
    expect(property(ics, "SUMMARY")).toBe("Barolo\\, Barbaresco\\; and friends");
    expect(property(ics, "DESCRIPTION")).toBe("Bring a glass.\\nNo perfume\\, please.");
    expect(property(ics, "LOCATION")).toBe("Christian's place\\; Østerbro");
  });

  it("omits DESCRIPTION and LOCATION when they are missing or blank", () => {
    const ics = buildTastingIcs({ ...event, description: null, location: "   " });
    expect(property(ics, "DESCRIPTION")).toBeUndefined();
    expect(unfold(ics)).not.toContain("LOCATION");
    expect(unfold(buildTastingIcs(event))).not.toContain("DESCRIPTION");
  });

  it("writes the URL as a URI, not as escaped text", () => {
    const url = "https://blindr.example/tastings/abc?from=calendar,ics;x=1";
    expect(property(buildTastingIcs({ ...event, url }), "URL")).toBe(url);
  });

  it("keeps a line break in the URL from starting a new property", () => {
    const ics = buildTastingIcs({ ...event, url: "https://blindr.example/x\r\nATTACH:evil" });
    expect(property(ics, "URL")).toBe("https://blindr.example/xATTACH:evil");
    expect(property(ics, "ATTACH")).toBeUndefined();
  });

  it("folds a long description within 75 octets and unfolds back to it", () => {
    const description = `Vi smager blindt på Østerbro — tag ${WINE_GLASS} og godt humør med, tak. `
      .repeat(8)
      .trim();
    const ics = buildTastingIcs({ ...event, description });
    for (const line of ics.split("\r\n")) {
      expect(octets(line)).toBeLessThanOrEqual(75);
      expect(wholeCharacters(line)).toBe(true);
    }
    expect(property(ics, "DESCRIPTION")).toBe(escapeIcsText(description));
  });
});

describe("icsFilename", () => {
  it("slugs the tasting name, folding accents and Nordic letters", () => {
    expect(icsFilename("Barolo night, Østerbro!")).toBe("barolo-night-osterbro.ics");
    expect(icsFilename("Château Margaux — vertical 2005–2015")).toBe(
      "chateau-margaux-vertical-2005-2015.ics",
    );
    expect(icsFilename("Smagning på Ærø")).toBe("smagning-pa-aero.ics");
  });

  it("falls back to tasting.ics when nothing sluggable is left", () => {
    expect(icsFilename(`${WINE_GLASS} ${WINE_GLASS}`)).toBe("tasting.ics");
    expect(icsFilename("   ")).toBe("tasting.ics");
  });

  it("caps the slug without leaving a dangling dash", () => {
    // "wine-" repeats every 5 characters, so the 60-character cut lands on a dash.
    const name = icsFilename("Wine ".repeat(20));
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.ics$/);
    expect(name.length).toBeLessThanOrEqual(60 + ".ics".length);
  });
});
