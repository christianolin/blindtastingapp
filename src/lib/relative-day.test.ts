import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  calendarDaysBetween,
  eyebrowDayPhrase,
  invitationDayPhrase,
} from "./relative-day";

// The module works in the runtime's LOCAL calendar, so every block below pins
// its time zone. Without the pin, a run on a UTC machine (a typical CI runner)
// has no offset and no DST, and a UTC-calendar or 24-hour-floor implementation
// passes every case. Node applies a runtime change to process.env.TZ, and
// vitest runs each test file in its own forked process, so the pin stays in
// this file. Each block first checks that the pin took, so a runtime that
// ignored it fails loudly instead of passing quietly.
//
// Dates are built INSIDE each test, after the zone is set, with the local-time
// constructor. `at` takes a 1-based month.
const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute);

const hoursBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 3_600_000;

function pinZone(zone: string) {
  let previous = "";
  beforeAll(() => {
    // Deleting TZ falls back to UTC, not the machine zone, so restore by name.
    previous = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    process.env.TZ = zone;
  });
  afterAll(() => {
    process.env.TZ = previous;
  });
  it(`runs in ${zone}`, () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
  });
}

// An offset on each side of UTC, a zone near the date line, and UTC itself.
// Every assertion in this block holds in every one of them.
describe.each(["Europe/Copenhagen", "America/New_York", "Pacific/Auckland", "UTC"])(
  "in %s",
  (zone) => {
    pinZone(zone);

    describe("calendarDaysBetween", () => {
      it("is zero on the same calendar day, whatever the times", () => {
        expect(calendarDaysBetween(at(2026, 9, 12, 0, 1), at(2026, 9, 12, 23, 59))).toBe(0);
        expect(calendarDaysBetween(at(2026, 9, 12, 23, 59), at(2026, 9, 12, 0, 1))).toBe(0);
      });

      it("counts calendar days, not 24-hour spans", () => {
        // Two minutes apart, but across midnight.
        expect(calendarDaysBetween(at(2026, 9, 12, 23, 59), at(2026, 9, 13, 0, 1))).toBe(1);
        // Almost 48 hours apart, but only one midnight between them.
        expect(calendarDaysBetween(at(2026, 9, 12, 0, 1), at(2026, 9, 13, 23, 59))).toBe(1);
      });

      it("is negative when the second date is earlier", () => {
        expect(calendarDaysBetween(at(2026, 9, 13, 0, 1), at(2026, 9, 12, 23, 59))).toBe(-1);
        expect(calendarDaysBetween(at(2026, 9, 14), at(2026, 9, 12))).toBe(-2);
      });

      it("crosses month and year boundaries", () => {
        expect(calendarDaysBetween(at(2026, 1, 31), at(2026, 2, 1))).toBe(1);
        expect(calendarDaysBetween(at(2026, 4, 30, 22), at(2026, 5, 1, 1))).toBe(1);
        expect(calendarDaysBetween(at(2026, 8, 30), at(2026, 9, 12))).toBe(13);
        expect(calendarDaysBetween(at(2026, 12, 31, 23, 30), at(2027, 1, 1, 0, 15))).toBe(1);
      });

      it("knows February's length, leap years included", () => {
        expect(calendarDaysBetween(at(2026, 2, 28), at(2026, 3, 1))).toBe(1);
        expect(calendarDaysBetween(at(2028, 2, 28), at(2028, 3, 1))).toBe(2);
        expect(calendarDaysBetween(at(2028, 2, 29), at(2028, 3, 1))).toBe(1);
      });

      it("stays exact over most of a year", () => {
        expect(calendarDaysBetween(at(2026, 3, 1, 0, 0), at(2026, 11, 15, 0, 0))).toBe(259);
        expect(calendarDaysBetween(at(2026, 11, 15, 0, 0), at(2026, 3, 1, 0, 0))).toBe(-259);
      });

      it("is NaN when either date is invalid", () => {
        expect(calendarDaysBetween(new Date(Number.NaN), at(2026, 9, 12))).toBeNaN();
        expect(calendarDaysBetween(at(2026, 9, 12), new Date("not a date"))).toBeNaN();
      });
    });

    describe("invitationDayPhrase", () => {
      const now = () => at(2026, 9, 12, 9, 0);

      it("says today for a tasting later the same day", () => {
        expect(invitationDayPhrase(at(2026, 9, 12, 19, 0), now())).toBe("today");
      });

      it("says tomorrow for the next calendar day, even minutes away", () => {
        expect(invitationDayPhrase(at(2026, 9, 13, 19, 0), now())).toBe("tomorrow");
        expect(invitationDayPhrase(at(2026, 9, 13, 0, 30), at(2026, 9, 12, 23, 50))).toBe(
          "tomorrow",
        );
      });

      it("says in N days further out", () => {
        expect(invitationDayPhrase(at(2026, 9, 14, 19, 0), now())).toBe("in 2 days");
        expect(invitationDayPhrase(at(2026, 10, 1, 19, 0), now())).toBe("in 19 days");
      });

      it("says yesterday and N days ago for a date already gone", () => {
        expect(invitationDayPhrase(at(2026, 9, 11, 19, 0), now())).toBe("yesterday");
        expect(invitationDayPhrase(at(2026, 9, 10, 19, 0), now())).toBe("2 days ago");
      });

      it("says nothing for an invalid date", () => {
        expect(invitationDayPhrase(new Date("nope"), now())).toBe("");
      });
    });

    describe("eyebrowDayPhrase", () => {
      const now = () => at(2026, 9, 12, 9, 0);

      it("says today and tomorrow like the invitation", () => {
        expect(eyebrowDayPhrase(at(2026, 9, 12, 19, 0), now())).toBe("today");
        expect(eyebrowDayPhrase(at(2026, 9, 13, 19, 0), now())).toBe("tomorrow");
      });

      it("says N days away further out, as S5b's 'Invitation · 2 days away'", () => {
        expect(eyebrowDayPhrase(at(2026, 9, 14, 19, 0), now())).toBe("2 days away");
        expect(eyebrowDayPhrase(at(2026, 10, 1, 19, 0), now())).toBe("19 days away");
      });

      it("falls back to the past wording for a date already gone", () => {
        expect(eyebrowDayPhrase(at(2026, 9, 11, 19, 0), now())).toBe("yesterday");
        expect(eyebrowDayPhrase(at(2026, 9, 9, 19, 0), now())).toBe("3 days ago");
      });

      it("crosses a month boundary by calendar day", () => {
        expect(eyebrowDayPhrase(at(2026, 10, 1, 0, 5), at(2026, 9, 30, 23, 55))).toBe("tomorrow");
      });

      it("says nothing for an invalid date", () => {
        expect(eyebrowDayPhrase(at(2026, 9, 14), new Date(Number.NaN))).toBe("");
      });
    });
  },
);

describe("across the EU shifts, in Europe/Copenhagen", () => {
  pinZone("Europe/Copenhagen");

  it("really shifts there: 29 Mar 2026 has 23 hours and 25 Oct 2026 has 25", () => {
    expect(hoursBetween(at(2026, 3, 29, 0, 0), at(2026, 3, 30, 0, 0))).toBe(23);
    expect(hoursBetween(at(2026, 10, 25, 0, 0), at(2026, 10, 26, 0, 0))).toBe(25);
  });

  it("counts the 23-hour spring-forward day as one day, in both directions", () => {
    expect(calendarDaysBetween(at(2026, 3, 29, 0, 0), at(2026, 3, 30, 0, 0))).toBe(1);
    expect(calendarDaysBetween(at(2026, 3, 30, 0, 0), at(2026, 3, 29, 0, 0))).toBe(-1);
    expect(calendarDaysBetween(at(2026, 3, 28, 23, 30), at(2026, 3, 29, 3, 30))).toBe(1);
    expect(calendarDaysBetween(at(2026, 3, 29, 0, 30), at(2026, 3, 29, 23, 30))).toBe(0);
    expect(calendarDaysBetween(at(2026, 3, 28), at(2026, 3, 30))).toBe(2);
  });

  it("counts the 25-hour fall-back day as one day, in both directions", () => {
    expect(calendarDaysBetween(at(2026, 10, 25, 0, 0), at(2026, 10, 25, 23, 59))).toBe(0);
    expect(calendarDaysBetween(at(2026, 10, 25, 0, 0), at(2026, 10, 26, 0, 0))).toBe(1);
    expect(calendarDaysBetween(at(2026, 10, 26, 0, 0), at(2026, 10, 25, 0, 0))).toBe(-1);
    expect(calendarDaysBetween(at(2026, 10, 24, 23, 30), at(2026, 10, 26, 0, 30))).toBe(2);
  });

  it("phrases a date across a shift by calendar day", () => {
    expect(invitationDayPhrase(at(2026, 3, 30, 19, 0), at(2026, 3, 28, 21, 0))).toBe("in 2 days");
    expect(eyebrowDayPhrase(at(2026, 3, 30, 0, 0), at(2026, 3, 29, 0, 0))).toBe("tomorrow");
    expect(eyebrowDayPhrase(at(2026, 10, 26, 0, 30), at(2026, 10, 24, 23, 30))).toBe(
      "2 days away",
    );
  });
});

describe("across the US shifts, in America/New_York", () => {
  pinZone("America/New_York");

  it("really shifts there: 8 Mar 2026 has 23 hours and 1 Nov 2026 has 25", () => {
    expect(hoursBetween(at(2026, 3, 8, 0, 0), at(2026, 3, 9, 0, 0))).toBe(23);
    expect(hoursBetween(at(2026, 11, 1, 0, 0), at(2026, 11, 2, 0, 0))).toBe(25);
  });

  it("counts the 23-hour and 25-hour days as one day each, in both directions", () => {
    expect(calendarDaysBetween(at(2026, 3, 8, 0, 0), at(2026, 3, 9, 0, 0))).toBe(1);
    expect(calendarDaysBetween(at(2026, 3, 9, 0, 0), at(2026, 3, 8, 0, 0))).toBe(-1);
    expect(calendarDaysBetween(at(2026, 3, 7, 23, 30), at(2026, 3, 8, 3, 30))).toBe(1);
    expect(calendarDaysBetween(at(2026, 11, 1, 0, 0), at(2026, 11, 1, 23, 59))).toBe(0);
    expect(calendarDaysBetween(at(2026, 11, 1, 0, 0), at(2026, 11, 2, 0, 0))).toBe(1);
    expect(calendarDaysBetween(at(2026, 11, 2, 0, 0), at(2026, 11, 1, 0, 0))).toBe(-1);
  });

  it("phrases a date across a shift by calendar day", () => {
    expect(invitationDayPhrase(at(2026, 11, 2, 0, 30), at(2026, 10, 31, 23, 30))).toBe(
      "in 2 days",
    );
    expect(invitationDayPhrase(at(2026, 3, 8, 0, 0), at(2026, 3, 9, 0, 0))).toBe("yesterday");
  });
});
