import { describe, expect, it } from "vitest";
import { emptyNoteState } from "../wset/note-state";
import { clearDraft, readDraft, writeDraft } from "./draft";
import {
  RESULT_ROW_ORDER,
  anotherGlassPlan,
  mergeHistoryRows,
  pointedTopFive,
  styleVerdictContext,
  styleVerdictInput,
  verdictRows,
} from "./result-math";
import type { AttemptRow, RankingSnapshot, TrainingDraft } from "./types";

const SNAPSHOT: RankingSnapshot = [
  { archetypeId: "a3", name: "A typical Margaux", closeness: 70, rank: 3, capped: null },
  { archetypeId: "a1", name: "A typical Pauillac", closeness: 91, rank: 1, capped: null },
  { archetypeId: "a2", name: "A typical Saint-Julien", closeness: 88, rank: 2, capped: null },
  { archetypeId: "a5", name: "A typical Bandol", closeness: 40, rank: 5, capped: null },
  { archetypeId: "a4", name: "A typical Pomerol", closeness: 62, rank: 4, capped: null },
  { archetypeId: "a6", name: "A typical Chablis", closeness: 15, rank: 6, capped: "colour" },
];

function row(id: string, createdAt: string): AttemptRow {
  return {
    id,
    createdAt,
    picked: null,
    pickedRegion: null,
    pickedGrape: null,
    vintage: null,
    actual: null,
    actualArchetype: null,
    hueCleared: false,
    noteColourHue: null,
    points: {
      country: null,
      region: null,
      appellation: null,
      primaryGrape: null,
      secondaryGrape: null,
      typeDesignation: null,
      vintage: null,
    },
    total: null,
    possible: null,
    snapshot: [],
  };
}

describe("verdictRows", () => {
  it("always shows the seven rows in order, ✓ / ✗ / —", () => {
    const rows = verdictRows({
      country: 2,
      region: 3,
      appellation: 0,
      primaryGrape: 8,
      secondaryGrape: null,
      typeDesignation: 0,
      vintage: null,
    });
    expect(rows.map((r) => r.category)).toEqual([...RESULT_ROW_ORDER]);
    expect(rows.map((r) => [r.label, r.mark, r.points])).toEqual([
      ["Country", "✓", 2],
      ["Region", "✓", 3],
      ["Appellation", "✗", 0],
      ["Grape", "✓", 8],
      ["Second grape", "—", null],
      ["Designation", "✗", 0],
      ["Vintage", "—", null],
    ]);
  });
});

describe("pointedTopFive", () => {
  it("takes the five best ranks of the frozen ranking", () => {
    expect(pointedTopFive(SNAPSHOT).map((e) => e.archetypeId)).toEqual(["a1", "a2", "a3", "a4", "a5"]);
    expect(pointedTopFive([])).toEqual([]);
  });
});

describe("styleVerdictInput", () => {
  it("finds the real wine's style in the whole ranking", () => {
    expect(styleVerdictInput(SNAPSHOT, "a2")).toEqual({ rank: 2, n: 6, pct: 88, capped: null });
    expect(styleVerdictInput(SNAPSHOT, "a6")).toEqual({ rank: 6, n: 6, pct: 15, capped: "colour" });
    expect(styleVerdictInput(SNAPSHOT, "zz")).toBeNull();
    expect(styleVerdictInput(SNAPSHOT, null)).toBeNull();
  });
});

describe("styleVerdictContext", () => {
  it("sets the note's own colour beside the real wine's archetype", () => {
    expect(styleVerdictContext("RUBY", { colour: "WHITE", style: "STILL" }, "WHITE")).toEqual({
      noteColour: "RED",
      candidateColour: "WHITE",
      candidateStyle: "STILL",
    });
    // A sparkling archetype names the direction of a bubbles cap.
    expect(styleVerdictContext("LEMON", { colour: "WHITE", style: "SPARKLING" }, null)).toEqual({
      noteColour: "WHITE",
      candidateColour: "WHITE",
      candidateStyle: "SPARKLING",
    });
  });

  it("falls back to the wine's own colour when the archetype has left the pool", () => {
    expect(styleVerdictContext(null, null, "RED")).toEqual({ noteColour: null, candidateColour: "RED" });
    expect(styleVerdictContext("BROWN", null, "ROSE")).toEqual({ noteColour: null, candidateColour: "ROSE" });
  });

  it("is null when neither the archetype nor the wine's colour is known", () => {
    expect(styleVerdictContext("RUBY", null, null)).toBeNull();
  });
});

describe("anotherGlassPlan", () => {
  const USER = "11111111-2222-4333-8444-555555555555";
  // An unfinished session the taster left with ✕ (the draft stays, spec §3.3).
  const LEFT: TrainingDraft = {
    userId: USER,
    sessionKey: "0f8fad5b-d9cb-469f-a165-70867728950e",
    startedAt: "2026-09-24T18:14:00.000Z",
    note: { ...emptyNoteState(), tannin: "HIGH", noseTermIds: ["t1"] },
    extras: { bubbles: false, fortified: null },
    pickedArchetypeId: "arch-margaux",
    pickedRegionId: "region-bordeaux",
    pickedGrapeId: null,
    vintage: { kind: "YEAR", year: 2016 },
  };

  function fakeStorage() {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    return () => storage;
  }

  it("starts a new session once the finished session's own draft is cleared", () => {
    const get = fakeStorage();
    writeDraft(LEFT, get);
    clearDraft(USER, get); // finish() clears it before the result opens
    expect(anotherGlassPlan(readDraft(USER, get))).toBe("start");
  });

  it("never replaces another session's draft: after a Reveal now it goes to the landing", () => {
    // ✕ out of a session, then Reveal now on an older attempt: its result's
    // Another glass must not mint a session over the one stored draft (D13).
    const get = fakeStorage();
    writeDraft(LEFT, get);
    expect(anotherGlassPlan(readDraft(USER, get))).toBe("landing");
  });
});

describe("mergeHistoryRows", () => {
  it("drops repeats and keeps newest first, id breaking ties", () => {
    const merged = mergeHistoryRows(
      [row("c", "2026-09-24T18:00:00+00:00"), row("b", "2026-09-23T18:00:00+00:00")],
      [row("b", "2026-09-23T18:00:00+00:00"), row("a", "2026-09-23T18:00:00+00:00")],
    );
    expect(merged.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});
