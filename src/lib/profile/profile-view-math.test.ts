import { describe, expect, it } from "vitest";
import type { OriginStat, ProfileStatsSummary, TastingHistoryEntry } from "../profile-stats";
import {
  MIN_SAMPLE_FOOTNOTE,
  NOTHING_YET,
  SEMI_BLIND_ONLY,
  accuracyView,
  emptyProfileCopy,
  profileMeta,
  profileStatTrio,
  profileTastingRows,
  shareRows,
  tastingsFooter,
} from "./profile-view-math";

// NOTHING_YET is asserted for its exact string once; it is otherwise the
// page's own literal ("Nothing to show yet" in profile-stat-cards.tsx), not
// something this module computes.
describe("NOTHING_YET", () => {
  it("is the empty-card copy", () => {
    expect(NOTHING_YET).toBe("Nothing to show yet");
  });
});

describe("profileMeta", () => {
  it("joins location and joined month (favourite wine type is retired)", () => {
    expect(
      profileMeta({
        location: "Copenhagen",
        createdAt: "2026-09-12T10:00:00Z",
      }),
    ).toBe("Copenhagen · Joined Sep 2026");
  });

  it("drops missing parts and skips a blank location", () => {
    expect(
      profileMeta({ location: null, createdAt: "2026-09-12T10:00:00Z" }),
    ).toBe("Joined Sep 2026");
    expect(
      profileMeta({ location: "   ", createdAt: "2026-09-12T10:00:00Z" }),
    ).toBe("Joined Sep 2026");
  });

  it("formats the joined month in UTC, not local", () => {
    expect(
      profileMeta({ location: null, createdAt: "2026-08-31T23:30:00Z" }),
    ).toBe("Joined Aug 2026");
  });
});

describe("profileStatTrio", () => {
  it("is null with no wines guessed", () => {
    expect(profileStatTrio({ tastingsAttended: 0, winesGuessed: 0, averagePoints: 0 })).toBeNull();
  });

  it("formats the three stats", () => {
    expect(
      profileStatTrio({ tastingsAttended: 12, winesGuessed: 48, averagePoints: 18.64 }),
    ).toEqual([
      { value: "12", label: "tastings" },
      { value: "48", label: "wines guessed" },
      { value: "18.6", label: "avg points" },
    ]);
  });

  it("singularizes at 1", () => {
    const trio = profileStatTrio({ tastingsAttended: 1, winesGuessed: 1, averagePoints: 5 });
    expect(trio?.[0]).toEqual({ value: "1", label: "tasting" });
    expect(trio?.[1]).toEqual({ value: "1", label: "wine guessed" });
  });

  it("groups thousands", () => {
    const trio = profileStatTrio({ tastingsAttended: 1234, winesGuessed: 1, averagePoints: 0 });
    expect(trio?.[0].value).toBe("1,234");
  });
});

function acc(
  parts: Partial<Record<keyof ProfileStatsSummary["categoryAccuracy"], { correct: number; applicable: number }>>,
): ProfileStatsSummary["categoryAccuracy"] {
  const zero = { correct: 0, applicable: 0 };
  return {
    country: zero,
    region: zero,
    appellation: zero,
    primary_grape: zero,
    secondary_grape: zero,
    producer: zero,
    type_designation: zero,
    vintage: zero,
    ...parts,
  };
}

describe("accuracyView", () => {
  it("orders and omits 0-applicable rows, and values them", () => {
    const view = accuracyView({
      winesGuessed: 9,
      vintagePartialCredit: 3,
      categoryAccuracy: acc({
        country: { correct: 7, applicable: 9 },
        region: { correct: 5, applicable: 9 },
        appellation: { correct: 0, applicable: 0 },
        primary_grape: { correct: 4, applicable: 9 },
        vintage: { correct: 2, applicable: 9 },
        producer: { correct: 1, applicable: 9 },
        secondary_grape: { correct: 1, applicable: 2 },
        type_designation: { correct: 0, applicable: 0 },
      }),
    });
    expect(view.rows.map((r) => r.label)).toEqual([
      "Country",
      "Region",
      "Grape",
      "Vintage ±1",
      "Producer",
      "Second grape",
    ]);
    expect(view.rows.find((r) => r.label === "Country")?.value).toBe("78%");
    expect(view.rows.find((r) => r.label === "Vintage ±1")?.value).toBe("56%");
    expect(view.rows.find((r) => r.label === "Second grape")?.value).toBe("—");
    expect(view.strongest).toBe("Country · 78% of 9 wines");
    expect(view.footnote).toBe(MIN_SAMPLE_FOOTNOTE);
  });

  it("shows a rate at 3 applicable and a dash below it", () => {
    const at3 = accuracyView({
      winesGuessed: 3,
      vintagePartialCredit: 0,
      categoryAccuracy: acc({ country: { correct: 2, applicable: 3 } }),
    });
    expect(at3.rows[0].value).toBe("67%");
    expect(at3.footnote).toBeNull();

    const at2 = accuracyView({
      winesGuessed: 2,
      vintagePartialCredit: 0,
      categoryAccuracy: acc({ country: { correct: 2, applicable: 2 } }),
    });
    expect(at2.rows[0].value).toBe("—");
    expect(at2.footnote).toBe(MIN_SAMPLE_FOOTNOTE);
  });

  it("strongest: a rate tie goes to more wines", () => {
    const view = accuracyView({
      winesGuessed: 12,
      vintagePartialCredit: 0,
      categoryAccuracy: acc({
        country: { correct: 6, applicable: 8 },
        region: { correct: 9, applicable: 12 },
      }),
    });
    expect(view.strongest).toBe("Region · 75% of 12 wines");
  });

  it("strongest: an exact tie goes to the earlier row", () => {
    const view = accuracyView({
      winesGuessed: 9,
      vintagePartialCredit: 0,
      categoryAccuracy: acc({
        country: { correct: 7, applicable: 9 },
        region: { correct: 7, applicable: 9 },
      }),
    });
    expect(view.strongest).toBe("Country · 78% of 9 wines");
  });

  it("strongest: a sub-threshold 100% row never wins", () => {
    const view = accuracyView({
      winesGuessed: 9,
      vintagePartialCredit: 0,
      categoryAccuracy: acc({
        country: { correct: 4, applicable: 9 },
        secondary_grape: { correct: 2, applicable: 2 },
      }),
    });
    expect(view.strongest).toBe("Country · 44% of 9 wines");
  });

  it("strongest is null when no qualifying row has a hit", () => {
    const view = accuracyView({
      winesGuessed: 9,
      vintagePartialCredit: 0,
      categoryAccuracy: acc({
        country: { correct: 0, applicable: 9 },
        region: { correct: 0, applicable: 9 },
      }),
    });
    expect(view.strongest).toBeNull();
  });

  it("vintage wins on ±1 hits", () => {
    const view = accuracyView({
      winesGuessed: 9,
      vintagePartialCredit: 8,
      categoryAccuracy: acc({
        country: { correct: 4, applicable: 8 },
        region: { correct: 4, applicable: 8 },
        vintage: { correct: 1, applicable: 9 },
      }),
    });
    expect(view.strongest).toBe("Vintage ±1 · 100% of 9 wines");
  });

  it("is the semi-blind-only empty state when every category is inapplicable", () => {
    const view = accuracyView({
      winesGuessed: 4,
      vintagePartialCredit: 0,
      categoryAccuracy: acc({}),
    });
    expect(view).toEqual({ rows: [], strongest: null, footnote: null, empty: SEMI_BLIND_ONLY });
  });

  it("is empty with nothing set when nobody has guessed", () => {
    const view = accuracyView({
      winesGuessed: 0,
      vintagePartialCredit: 0,
      categoryAccuracy: acc({}),
    });
    expect(view.rows).toEqual([]);
    expect(view.empty).toBeNull();
  });
});

describe("shareRows", () => {
  it("shares relative to the top entry", () => {
    const items: OriginStat[] = [
      { id: "fr", name: "France", count: 6 },
      { id: "it", name: "Italy", count: 3 },
    ];
    expect(shareRows(items)).toEqual([
      { label: "France", pct: 100, value: "6" },
      { label: "Italy", pct: 50, value: "3" },
    ]);
  });

  it("merges same-name entries and re-sorts", () => {
    const items: OriginStat[] = [
      { id: "fr-none", name: "None", count: 2 },
      { id: "us", name: "USA", count: 2 },
      { id: "it-none", name: "None", count: 1 },
    ];
    const rows = shareRows(items);
    expect(rows[0]).toEqual({ label: "None", pct: 100, value: "3" });
  });

  it("caps at 5 after merging, ties sorted by name", () => {
    const items: OriginStat[] = Array.from({ length: 7 }, (_, i) => ({
      id: `id-${i}`,
      name: `Region ${i}`,
      count: 4,
    }));
    const rows = shareRows(items);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.label)).toEqual([
      "Region 0",
      "Region 1",
      "Region 2",
      "Region 3",
      "Region 4",
    ]);
  });

  it("is empty for an empty list", () => {
    expect(shareRows([])).toEqual([]);
  });
});

function tasting(p: Partial<TastingHistoryEntry> & { tastingId: string }): TastingHistoryEntry {
  return {
    tastingName: "Tasting",
    hostId: "host",
    hostName: "Host",
    revealMode: "BLIND",
    winesRevealed: 1,
    pointsEarned: 0,
    lastScoredAt: "2026-01-01T00:00:00Z",
    ...p,
  };
}

describe("profileTastingRows", () => {
  const ctx = { profileId: "p", viewerId: "v" };

  it("orders newest scored first, ties by name then id", () => {
    const rows = profileTastingRows(
      [
        tasting({ tastingId: "a", tastingName: "Zeta", lastScoredAt: "2026-09-01T00:00:00Z" }),
        tasting({ tastingId: "b", tastingName: "Alpha", lastScoredAt: "2026-09-10T00:00:00Z" }),
        tasting({ tastingId: "c", tastingName: "Beta", lastScoredAt: "2026-09-01T00:00:00Z" }),
        tasting({ tastingId: "d", tastingName: "Beta", lastScoredAt: "2026-09-01T00:00:00Z" }),
      ],
      ctx,
    );
    expect(rows.map((r) => r.id)).toEqual(["b", "c", "d", "a"]);
  });

  it("formats the date in UTC with the year", () => {
    const [row] = profileTastingRows(
      [tasting({ tastingId: "a", lastScoredAt: "2026-09-12T19:40:00Z" })],
      ctx,
    );
    expect(row.date).toBe("12 Sep 2026");

    const [row2] = profileTastingRows(
      [tasting({ tastingId: "a", lastScoredAt: "2026-01-01T00:30:00+01:00" })],
      ctx,
    );
    expect(row2.date).toBe("31 Dec 2025");
  });

  it("blind result and wine count", () => {
    const [row] = profileTastingRows(
      [tasting({ tastingId: "a", pointsEarned: 42, winesRevealed: 6 })],
      ctx,
    );
    expect(row.result).toBe("42 pts");
    expect(row.wines).toBe("6");
    expect(row.phoneBottom).toBe("6 wines");
    expect(row.modeNote).toBeNull();

    expect(profileTastingRows([tasting({ tastingId: "a", pointsEarned: 1 })], ctx)[0].result).toBe(
      "1 pt",
    );
    expect(profileTastingRows([tasting({ tastingId: "a", pointsEarned: 0 })], ctx)[0].result).toBe(
      "0 pts",
    );
    expect(
      profileTastingRows([tasting({ tastingId: "a", winesRevealed: 1 })], ctx)[0].phoneBottom,
    ).toBe("1 wine");
  });

  it("semi-blind reads as matches, open still reads as points", () => {
    const [sb] = profileTastingRows(
      [
        tasting({
          tastingId: "a",
          revealMode: "SEMI_BLIND",
          pointsEarned: 3,
          winesRevealed: 4,
        }),
      ],
      ctx,
    );
    expect(sb.result).toBe("3 of 4 matched");
    expect(sb.modeNote).toBe("Semi-blind");
    expect(sb.phoneBottom).toBe("Semi-blind");

    const [open] = profileTastingRows(
      [tasting({ tastingId: "a", revealMode: "OPEN", pointsEarned: 5, winesRevealed: 2 })],
      ctx,
    );
    expect(open.modeNote).toBe("Open");
    expect(open.result).toBe("5 pts");
  });

  it("names the host, or You when the viewer hosted", () => {
    const [mine] = profileTastingRows(
      [
        tasting({
          tastingId: "a",
          hostId: "v",
          hostName: "Anna",
          lastScoredAt: "2026-09-12T19:40:00Z",
        }),
      ],
      ctx,
    );
    expect(mine.host).toBe("You");
    expect(mine.phoneMeta).toBe("hosted by you · 12 Sep 2026");

    const [theirs] = profileTastingRows(
      [
        tasting({
          tastingId: "a",
          hostId: "g",
          hostName: "Gustav",
          lastScoredAt: "2026-09-12T19:40:00Z",
        }),
      ],
      ctx,
    );
    expect(theirs.host).toBe("Gustav");
    expect(theirs.phoneMeta).toBe("hosted by Gustav · 12 Sep 2026");

    // The profile owner hosted their own tasting, seen by someone else (the
    // viewer): still shows the host's real name, not "You".
    const [ownHost] = profileTastingRows(
      [
        tasting({
          tastingId: "a",
          hostId: "p",
          hostName: "Profile Person",
          lastScoredAt: "2026-09-12T19:40:00Z",
        }),
      ],
      ctx,
    );
    expect(ownHost.host).toBe("Profile Person");
  });

  it("builds the href from profileId", () => {
    const [row] = profileTastingRows([tasting({ tastingId: "xyz" })], ctx);
    expect(row.href).toBe("/u/p/tastings/xyz");
  });
});

describe("tastingsFooter", () => {
  it("singularizes and groups thousands", () => {
    expect(tastingsFooter(1)).toBe("1 tasting · newest first");
    expect(tastingsFooter(12)).toBe("12 tastings · newest first");
    expect(tastingsFooter(1234)).toBe("1,234 tastings · newest first");
  });
});

describe("emptyProfileCopy", () => {
  it("own profile", () => {
    expect(emptyProfileCopy({ isOwn: true, name: "Anna" })).toEqual({
      title: "No tastings yet",
      body: "Your numbers and tastings show up here once a glass you guessed has been revealed.",
    });
  });

  it("another person's profile, with a typographic apostrophe", () => {
    expect(emptyProfileCopy({ isOwn: false, name: "Anna" })).toEqual({
      title: "No tastings yet",
      body: "Anna’s numbers and tastings show up here once a glass they guessed has been revealed.",
    });
  });
});
