import { describe, expect, it } from "vitest";
import { TRAINING_COPY, attemptRowLine } from "./copy";
import { tally } from "./history-math";
import type { AttemptRow, PointCategory } from "./types";

// Your sessions (spec §3.6): the tally line's counts and every row's text.

const NO_POINTS: Record<PointCategory, number | null> = {
  country: null,
  region: null,
  appellation: null,
  primaryGrape: null,
  secondaryGrape: null,
  typeDesignation: null,
  vintage: null,
};

function row(patch: Partial<AttemptRow>): AttemptRow {
  return {
    id: "attempt-1",
    createdAt: "2026-09-24T18:14:00.000Z",
    picked: { id: "arch-pauillac", name: "A typical Pauillac" },
    pickedRegion: null,
    pickedGrape: null,
    vintage: null,
    actual: null,
    actualArchetype: null,
    hueCleared: false,
    noteColourHue: null,
    points: NO_POINTS,
    total: null,
    possible: null,
    snapshot: [],
    ...patch,
  };
}

const scored = (primaryGrape: number, appellation: number | null, total: number) =>
  row({
    actual: { catalogWineId: "wine-1", label: "Château Talbot 2016", lineage: null },
    points: { ...NO_POINTS, country: 2, region: 3, appellation, primaryGrape, secondaryGrape: 0 },
    total,
    possible: 22,
  });

describe("tally", () => {
  it("counts scored attempts only, and grape/appellation hits among them", () => {
    const rows = [
      scored(8, 5, 18), // grape ✓ appellation ✓
      scored(8, 0, 13), // grape ✓
      scored(0, 5, 10), // appellation ✓
      scored(0, 0, 5), // neither
      row({}), // unrevealed: not scored
      row({ picked: null }), // unrevealed, no pick
    ];
    expect(tally(rows)).toEqual({ scored: 4, grapeHits: 2, appellationHits: 2 });
  });

  it("an appellation that did not apply (null) is not a hit", () => {
    expect(tally([scored(8, null, 13)])).toEqual({ scored: 1, grapeHits: 1, appellationHits: 0 });
  });

  it("nothing yet", () => {
    expect(tally([])).toEqual({ scored: 0, grapeHits: 0, appellationHits: 0 });
    expect(tally([row({})])).toEqual({ scored: 0, grapeHits: 0, appellationHits: 0 });
  });
});

describe("attemptRowLine", () => {
  const utc = { timeZone: "UTC" };

  it("a pick, revealed and scored", () => {
    expect(attemptRowLine(scored(8, 0, 14), utc)).toBe(
      "24 Sep · You said Pauillac · It was Château Talbot 2016 · 14 of 22",
    );
  });

  it("no pick, revealed", () => {
    const r = { ...scored(0, 0, 0), picked: null };
    expect(attemptRowLine(r, utc)).toBe("24 Sep · You didn't pick a wine · It was Château Talbot 2016 · 0 of 22");
  });

  it("a wine the viewer cannot read", () => {
    const r = scored(8, 5, 18);
    r.actual = { catalogWineId: "wine-1", label: null, lineage: null };
    expect(attemptRowLine(r, utc)).toBe("24 Sep · You said Pauillac · It was a wine you can't see yet · 18 of 22");
  });

  it("a pick that stopped at the region, with or without a grape (region-guess addendum R8)", () => {
    const bourgogne = { id: "region-bgn", name: "Bourgogne" };
    const r = { ...scored(8, 0, 13), picked: null, pickedRegion: bourgogne, pickedGrape: { id: "g", name: "Chardonnay" } };
    expect(attemptRowLine(r, utc)).toBe("24 Sep · You said Bourgogne · Chardonnay · It was Château Talbot 2016 · 13 of 22");
    expect(attemptRowLine(row({ picked: null, pickedRegion: bourgogne }), utc)).toBe(
      "24 Sep · You said Bourgogne · Not revealed",
    );
  });

  it("not revealed: the list adds the Reveal now button after it", () => {
    expect(attemptRowLine(row({}), utc)).toBe("24 Sep · You said Pauillac · Not revealed");
    expect(attemptRowLine(row({ picked: null }), utc)).toBe("24 Sep · You didn't pick a wine · Not revealed");
    expect(TRAINING_COPY.revealNow).toBe("Reveal now");
  });
});
