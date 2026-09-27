import { describe, expect, it } from "vitest";
import type { FinishInput } from "./action-types";
import {
  SAVE_REFUSED,
  SNAPSHOT_MAX,
  attemptPayload,
  finishResultFromRpc,
  isHistoryCursor,
  isUuid,
  revealPayload,
} from "./attempt-payload";

const SESSION = "00000000-0000-4000-8000-00000000e001";
const ARCH = "00000000-0000-4000-8000-00000000a001";
const WINE = "00000000-0000-4000-8000-00000000b001";
const TERM = "00000000-0000-4000-8000-00000000f001";
const ATTEMPT = "00000000-0000-4000-8000-00000000c001";
const NOTE = "00000000-0000-4000-8000-00000000d001";
const REGION = "00000000-0000-4000-8000-00000000e101";
const GRAPE = "00000000-0000-4000-8000-00000000e201";
const ENTRY = { archetypeId: ARCH, name: "A typical Pauillac", closeness: 91, rank: 1, capped: null };

function input(overrides: Partial<FinishInput> = {}): FinishInput {
  return {
    sessionKey: SESSION,
    startedAt: "2026-09-25T18:14:00.000Z",
    note: { id: null, colour_hue: "RUBY" },
    aromas: [{ term_id: TERM, sensed_on_nose: true, sensed_on_palate: false }],
    pickedArchetypeId: ARCH,
    pickedRegionId: null,
    pickedGrapeId: null,
    vintage: { kind: "YEAR", year: 2016 },
    actualCatalogWineId: WINE,
    snapshot: [ENTRY],
    ...overrides,
  };
}

const NULL_POINTS = {
  country: null,
  region: null,
  appellation: null,
  primaryGrape: null,
  secondaryGrape: null,
  typeDesignation: null,
  vintage: null,
};

describe("attemptPayload", () => {
  it("builds the RPC's p_attempt from a valid input", () => {
    expect(attemptPayload(input())).toEqual({
      attempt: {
        session_key: SESSION,
        started_at: "2026-09-25T18:14:00.000Z",
        picked_archetype_id: ARCH,
        picked_region_id: null,
        picked_grape_id: null,
        guessed_vintage_kind: "YEAR",
        guessed_vintage_year: 2016,
        guessed_vintage_tawny_years: null,
        actual_catalog_wine_id: WINE,
        candidates_snapshot: [ENTRY],
      },
    });
    expect(attemptPayload(input({ pickedArchetypeId: null, actualCatalogWineId: null, vintage: null }))).toEqual({
      attempt: {
        session_key: SESSION,
        started_at: "2026-09-25T18:14:00.000Z",
        picked_archetype_id: null,
        picked_region_id: null,
        picked_grape_id: null,
        guessed_vintage_kind: null,
        guessed_vintage_year: null,
        guessed_vintage_tawny_years: null,
        actual_catalog_wine_id: null,
        candidates_snapshot: [ENTRY],
      },
    });
  });

  it("maps NV and tawny guesses to their columns", () => {
    const nv = attemptPayload(input({ vintage: { kind: "NV" } }));
    expect(nv).toMatchObject({
      attempt: { guessed_vintage_kind: "NV", guessed_vintage_year: null, guessed_vintage_tawny_years: null },
    });
    const tawny = attemptPayload(input({ vintage: { kind: "TAWNY", years: 20 } }));
    expect(tawny).toMatchObject({
      attempt: { guessed_vintage_kind: "TAWNY", guessed_vintage_year: null, guessed_vintage_tawny_years: 20 },
    });
  });

  it("sends a pick that stopped at the region, with or without its grape", () => {
    expect(attemptPayload(input({ pickedArchetypeId: null, pickedRegionId: REGION, pickedGrapeId: GRAPE }))).toMatchObject({
      attempt: { picked_archetype_id: null, picked_region_id: REGION, picked_grape_id: GRAPE },
    });
    expect(attemptPayload(input({ pickedArchetypeId: null, pickedRegionId: REGION }))).toMatchObject({
      attempt: { picked_archetype_id: null, picked_region_id: REGION, picked_grape_id: null },
    });
  });

  it("refuses a bad session key, start time, pick or wine id", () => {
    for (const bad of [
      input({ sessionKey: "nope" }),
      input({ startedAt: "yesterday" }),
      input({ pickedArchetypeId: "x" }),
      input({ pickedArchetypeId: null, pickedRegionId: "x" }),
      input({ pickedArchetypeId: null, pickedRegionId: REGION, pickedGrapeId: "x" }),
      input({ actualCatalogWineId: "x" }),
    ]) {
      expect(attemptPayload(bad)).toEqual({ error: SAVE_REFUSED });
    }
  });

  it("refuses a typical wine and a region together, and a grape without a region", () => {
    expect(attemptPayload(input({ pickedRegionId: REGION }))).toEqual({ error: SAVE_REFUSED });
    expect(attemptPayload(input({ pickedArchetypeId: null, pickedGrapeId: GRAPE }))).toEqual({ error: SAVE_REFUSED });
  });

  it("refuses an off-range vintage", () => {
    for (const vintage of [
      { kind: "YEAR" as const, year: 1850 },
      { kind: "YEAR" as const, year: 2016.5 },
      { kind: "TAWNY" as const, years: 0 },
    ]) {
      expect(attemptPayload(input({ vintage }))).toEqual({ error: SAVE_REFUSED });
    }
  });

  it("refuses a malformed or oversized snapshot", () => {
    expect(attemptPayload(input({ snapshot: [{ ...ENTRY, rank: 0 }] }))).toEqual({ error: SAVE_REFUSED });
    const huge = Array.from({ length: SNAPSHOT_MAX + 1 }, (_, i) => ({ ...ENTRY, rank: i + 1 }));
    expect(attemptPayload(input({ snapshot: huge }))).toEqual({ error: SAVE_REFUSED });
  });

  it("refuses malformed aromas or a note that is not an object", () => {
    expect(
      attemptPayload(input({ aromas: [{ term_id: "x", sensed_on_nose: true, sensed_on_palate: false }] })),
    ).toEqual({ error: SAVE_REFUSED });
    expect(attemptPayload(input({ note: [] as unknown as Record<string, unknown> }))).toEqual({
      error: SAVE_REFUSED,
    });
  });
});

describe("revealPayload", () => {
  it("sends only the attempt and the wine, and refuses bad ids", () => {
    expect(revealPayload(ATTEMPT, WINE)).toEqual({
      attempt: { attempt_id: ATTEMPT, actual_catalog_wine_id: WINE },
    });
    expect(revealPayload("x", WINE)).toEqual({ error: SAVE_REFUSED });
    expect(revealPayload(ATTEMPT, "")).toEqual({ error: SAVE_REFUSED });
  });
});

describe("finishResultFromRpc", () => {
  it("maps the RPC's snake_case answer", () => {
    expect(
      finishResultFromRpc({
        attempt_id: ATTEMPT,
        note_id: NOTE,
        points: {
          country: 2,
          region: 3,
          appellation: 0,
          primary_grape: 8,
          secondary_grape: null,
          type_designation: null,
          vintage: 1,
        },
        total: 14,
        possible: 20,
        actual_archetype_id: ARCH,
        hue_cleared: true,
      }),
    ).toEqual({
      ok: true,
      attemptId: ATTEMPT,
      noteId: NOTE,
      points: {
        country: 2,
        region: 3,
        appellation: 0,
        primaryGrape: 8,
        secondaryGrape: null,
        typeDesignation: null,
        vintage: 1,
      },
      total: 14,
      possible: 20,
      actualArchetypeId: ARCH,
      hueCleared: true,
    });
    expect(
      finishResultFromRpc({
        attempt_id: ATTEMPT,
        note_id: NOTE,
        points: null,
        total: null,
        possible: null,
        actual_archetype_id: null,
        hue_cleared: false,
      }),
    ).toEqual({
      ok: true,
      attemptId: ATTEMPT,
      noteId: NOTE,
      points: NULL_POINTS,
      total: null,
      possible: null,
      actualArchetypeId: null,
      hueCleared: false,
    });
  });

  it("refuses an answer without both ids", () => {
    expect(finishResultFromRpc(null)).toEqual({ error: SAVE_REFUSED });
    expect(finishResultFromRpc({ note_id: NOTE })).toEqual({ error: SAVE_REFUSED });
  });
});

describe("isHistoryCursor", () => {
  it("admits a raw timestamp and a uuid, nothing that could break the filter", () => {
    expect(isHistoryCursor({ createdAt: "2026-09-24T18:00:00.123456+00:00", id: ATTEMPT })).toBe(true);
    expect(isHistoryCursor({ createdAt: "2026-09-24T18:00:00Z", id: ATTEMPT })).toBe(true);
    expect(isHistoryCursor({ createdAt: '2026-09-24T18:00:00Z",id.gt.0', id: ATTEMPT })).toBe(false);
    expect(isHistoryCursor({ createdAt: "2026-09-24T18:00:00Z", id: "1" })).toBe(false);
    expect(isHistoryCursor(null)).toBe(false);
    expect(isUuid(ATTEMPT)).toBe(true);
    expect(isUuid("x")).toBe(false);
  });
});
