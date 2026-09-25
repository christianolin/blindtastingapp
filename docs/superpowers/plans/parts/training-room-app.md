# Training room — app part (Tasks 9, 10, 11, 12, 14)

Part of `docs/superpowers/plans/2026-09-25-training-room.md`. Every shell command
starts with `cd /c/Users/Public/repos/blindtastingapp-training && …`.

**Contract notes** (where this part had to choose; the spec wins over the header):

1. `candidateToArchetypeView` is produced by Task 6 in `src/lib/training/archetype-view.ts`
   (task list). The header puts it in `pool.ts`, which is `server-only` and so cannot be
   imported by a client component; `pool.ts` re-exports it so both statements hold.
   Client code imports it from `@/lib/training/archetype-view`.
2. `FinishInput` / `FinishResult` are declared in the header inside `actions.ts`; the Global
   Constraint ("`use server` files export only async functions; shared types live in plain
   modules") wins, so they live in the plain module `src/lib/training/action-types.ts`
   with exactly the header's shapes. That module also declares `HistoryCursor`,
   `HistoryPage`, `TrainingTally`, `AromaPayload` and `TrainingAttemptDetail`.
3. The result screen needs the saved note's id (for *See the note*) and the revealed
   wine's colour (for *Your colour call … it was a {colour} wine*); `AttemptRow` carries
   neither. This part adds one read-only action, `loadTrainingAttempt(attemptId):
   Promise<TrainingAttemptDetail | null>`, backed by `readTrainingAttemptDetail` in
   `pool.ts`. The three header actions are unchanged.
4. `justTheRegionOption` lives in `src/components/add-wine/self-named-appellation.ts`
   (the header/spec say `src/lib/self-named-appellation.ts`, which does not exist).
5. Copy consumed from Task 2 (`src/lib/training/copy.ts`). Besides the header's
   functions (`shortName`, `coverageLine`, `stripLine`, `lineageLine`, `resultTotalLine`,
   `tallyLine`, `attemptRowLine`, `hueClearedLine`, `styleVerdictLine`) this part reads
   these `TRAINING_COPY` keys: `eyebrow, title, promise, start, discard, discardArmed,
   footerAction, candidatesHeading, beforeAnswers, unlikely, yourCall, whichWine,
   somethingElse, notInList, vintageOptional, revealBottle, cantFindOut, youDidntPick,
   wherePointed, notRevealed, anotherGlass, seeNote, done, rowLabels (Record<PointCategory,
   string>), markRight, markWrong, markNone, yourSessions, showMore, noSessions, revealNow,
   badge, notRevealedRow, unreadableWine`, and these helpers: `continueLine(time)`,
   `sheetTitleLine(time)`, `showAllLine(n)`, `itWasLine(wine)`, `vintageGuessLabel(v)`,
   `youSaidLine(pickName, vintage)`, `percentLabel(closeness)`. Task 10 Step 1 adds
   whichever of them Task 2 did not define, with the exact §9 values below.
6. Assumed behaviour of Task 2 functions: `coverageLine(countries, 0)` returns the
   empty-pool line; `attemptRowLine(row)` for an unrevealed row ends at "Not revealed"
   (the *Reveal now* control is a separate button); `hueClearedLine(hue, colour)` gets
   the hue's display word from `LABELS` in `src/lib/wset/vocab.ts` ("ruby").
7. Task 6: `ArchetypeSheet`'s `answers` prop must accept a `WsetNoteState` (the room
   passes the whole note; typing it `Partial<WsetNoteState>` satisfies that).
8. Task 1: the code below reads `training_attempts` with the spec §6.1 column names,
   `wine_archetypes.country_id/region_id/appellation_id/typical_age_low/typical_age_high`,
   nullable `wine_archetypes.wine_place_id`, `wine_archetype_aromas.signature`,
   `wine_archetype_designations(archetype_id, type_designation_id)` and the RPC
   `record_training_attempt(p_note, p_aromas, p_attempt)`; every raw row is cast through
   `unknown` to the local raw types, so the exact `database.types.ts` spelling of the
   RPC's `Args` (`unknown` or `Json`) does not matter.

---

### Task 9: Server reads and actions

**Files:**
- Create: `src/lib/training/action-types.ts`
- Create: `src/lib/training/pool-shape.ts`
- Test: `src/lib/training/pool-shape.test.ts`
- Create: `src/lib/training/attempt-payload.ts`
- Test: `src/lib/training/attempt-payload.test.ts`
- Create: `src/lib/training/pool.ts`
- Create: `src/app/taste/training/actions.ts`

**Interfaces:**
- Consumes: Task 1 — tables/columns of Contract note 8 and the RPC. Task 2 —
  `src/lib/training/types.ts` (`AttemptRow`, `CapReason`, `Named`, `PointCategory`,
  `RankingSnapshot`, `TrainingCandidate`, `VintageGuess`) and
  `tally(rows: Pick<AttemptRow, "points" | "total">[]): { scored: number; grapeHits: number; appellationHits: number }`
  from `src/lib/training/history-math.ts`. Task 6 —
  `candidateToArchetypeView(c: TrainingCandidate): ArchetypeView` from
  `src/lib/training/archetype-view.ts`.
- Produces (used by Tasks 10 and 11):
  - `src/lib/training/action-types.ts`: `HistoryCursor = { createdAt: string; id: string }`,
    `HistoryPage = { rows: AttemptRow[]; nextCursor: HistoryCursor | null }`,
    `AromaPayload`, `FinishInput`, `FinishResult` (header shapes), `TrainingTally`,
    `TrainingAttemptDetail = { row: AttemptRow; noteId: string; wineColour: WineColour | null }`.
  - `src/lib/training/attempt-payload.ts`: `SAVE_REFUSED`, `SNAPSHOT_MAX`, `isUuid`,
    `isHistoryCursor`, `attemptPayload`, `revealPayload`, `finishResultFromRpc`.
  - `src/lib/training/pool-shape.ts` (pure): `HISTORY_PAGE = 20`, `MAX_MERGE_HOPS`,
    `ATTEMPT_COLUMNS`, `CATALOG_DISPLAY_COLUMNS`, `shapeCandidates`, `coverageCountries`,
    `vintageFromColumns`, `vintageColumns`, `parseSnapshot`, `finalWineId`,
    `actualWineLineage`, `wineDisplay`, `shapeAttemptRow`, `historyOrFilter`, `pageOf`,
    `tallyRows`.
  - `src/lib/training/pool.ts` (server-only): `readTrainingPool(supabase): Promise<TrainingCandidate[]>`
    (`cache()`d), `readTrainingHistory(supabase, userId, cursor?): Promise<HistoryPage>`,
    `readTrainingAttemptDetail(supabase, userId, attemptId): Promise<TrainingAttemptDetail | null>`,
    `readTrainingTally(supabase, userId): Promise<TrainingTally>`, re-exports
    `coverageCountries` and `candidateToArchetypeView`.
  - `src/app/taste/training/actions.ts` (`"use server"`):
    `finishTrainingSession(input: FinishInput): Promise<FinishResult>`,
    `revealTrainingAttempt(attemptId: string, catalogWineId: string): Promise<FinishResult>`,
    `loadMoreTrainingHistory(cursor: HistoryCursor): Promise<HistoryPage>`,
    `loadTrainingAttempt(attemptId: string): Promise<TrainingAttemptDetail | null>`.

- [ ] **Step 1: Confirm Task 1's types are in place**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && grep -n "training_attempts: {\|wine_archetype_designations: {\|record_training_attempt: {\|typical_age_low\|signature: boolean" src/lib/supabase/database.types.ts`
Expected: at least one line for each of the five patterns. If any is missing, Task 1 is not
done — stop and finish it first.

- [ ] **Step 2: Write the plain types module `src/lib/training/action-types.ts`**

```ts
// Shapes the training room's server actions take and return (training-room
// spec §6.5). A plain module, not the "use server" file: that one may export
// only async functions (CLAUDE.md, "A `use server` file exports only async
// functions"), so the client and the actions both import these with
// `import type`.
import type { WineColour } from "../wset/types";
import type { AttemptRow, PointCategory, RankingSnapshot, VintageGuess } from "./types";

/** The history list's keyset cursor: the last row's raw `created_at` and id. */
export type HistoryCursor = { createdAt: string; id: string };

export type HistoryPage = { rows: AttemptRow[]; nextCursor: HistoryCursor | null };

/** One `wset_note_aromas` row as `save_wset_note` takes it. */
export type AromaPayload = { term_id: string; sensed_on_nose: boolean; sensed_on_palate: boolean };

export type FinishInput = {
  sessionKey: string;
  startedAt: string;
  /** noteToPayload(state, { catalogWineId: null, contextKind: "TRAINING", tastingWineId: null });
      the RPC forces the identity fields anyway (D14). */
  note: Record<string, unknown>;
  aromas: AromaPayload[];
  pickedArchetypeId: string | null;
  vintage: VintageGuess;
  actualCatalogWineId: string | null;
  snapshot: RankingSnapshot;
};

export type FinishResult =
  | {
      ok: true;
      attemptId: string;
      noteId: string;
      points: Record<PointCategory, number | null>;
      total: number | null;
      possible: number | null;
      actualArchetypeId: string | null;
      hueCleared: boolean;
    }
  | { error: string };

/** "6 of 9 right on the grape · 4 on the appellation" — history-math's tally(). */
export type TrainingTally = { scored: number; grapeHits: number; appellationHits: number };

/** What the result screen renders: the stored attempt as a history row, plus the
    saved note's id (See the note) and the revealed wine's colour (the hue line). */
export type TrainingAttemptDetail = {
  row: AttemptRow;
  noteId: string;
  wineColour: WineColour | null;
};
```

- [ ] **Step 3: Write the failing test `src/lib/training/pool-shape.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  HISTORY_PAGE,
  actualWineLineage,
  coverageCountries,
  finalWineId,
  historyOrFilter,
  pageOf,
  parseSnapshot,
  shapeAttemptRow,
  shapeCandidates,
  tallyRows,
  vintageColumns,
  vintageFromColumns,
  wineDisplay,
  type AttemptRaw,
  type CatalogDisplayRaw,
  type PoolRaw,
  type WineDisplay,
} from "./pool-shape";

const ARCH_PAUILLAC = "00000000-0000-4000-8000-00000000a001";
const ARCH_BOURGOGNE = "00000000-0000-4000-8000-00000000a002";
const WINE_OLD = "00000000-0000-4000-8000-00000000b001";
const WINE_NEW = "00000000-0000-4000-8000-00000000b002";
const WINE_HIDDEN = "00000000-0000-4000-8000-00000000b003";
const ATTEMPT = "00000000-0000-4000-8000-00000000c001";
const NOTE = "00000000-0000-4000-8000-00000000d001";

function pool(overrides: Partial<PoolRaw> = {}): PoolRaw {
  return {
    archetypes: [
      {
        id: ARCH_PAUILLAC,
        name: "A typical Pauillac",
        description: "Cedar and cassis.",
        colour: "RED",
        style: "STILL",
        country_id: "fr",
        region_id: "bdx",
        appellation_id: "pauillac",
        primary_grape_id: "cs",
        secondary_grape_id: "me",
        typical_age_low: 8,
        typical_age_high: 25,
        sat: { tannin: ["MEDIUM_PLUS", "HIGH"], clarity: ["CLEAR", "CLEAR"], broken: ["HIGH"] },
        quality_low: 88,
        quality_high: 96,
        wine_place_id: "place-pauillac",
        sort_order: 2,
      },
      {
        id: ARCH_BOURGOGNE,
        name: "A typical Bourgogne rouge",
        description: null,
        colour: "RED",
        style: "STILL",
        country_id: "fr",
        region_id: "bgn",
        appellation_id: "bourgogne",
        primary_grape_id: "pn",
        secondary_grape_id: null,
        typical_age_low: null,
        typical_age_high: 6,
        sat: {},
        quality_low: null,
        quality_high: null,
        wine_place_id: null,
        sort_order: 1,
      },
    ],
    aromas: [
      { archetype_id: ARCH_PAUILLAC, term_id: "t-cassis", kind: "NOSE", signature: false },
      { archetype_id: ARCH_PAUILLAC, term_id: "t-cedar", kind: "NOSE", signature: true },
      { archetype_id: ARCH_PAUILLAC, term_id: "t-gone", kind: "PALATE", signature: false },
    ],
    terms: [
      { id: "t-cassis", term: "blackcurrant", group_name: "Black fruit" },
      { id: "t-cedar", term: "cedar", group_name: "Oak" },
    ],
    designations: [
      { archetype_id: ARCH_PAUILLAC, type_designation_id: "d-grand" },
      { archetype_id: ARCH_PAUILLAC, type_designation_id: "d-first" },
    ],
    names: {
      countries: [{ id: "fr", name: "France" }],
      regions: [
        { id: "bdx", name: "Bordeaux" },
        { id: "bgn", name: "Bourgogne" },
      ],
      appellations: [
        { id: "pauillac", name: "Pauillac AOC" },
        { id: "bourgogne", name: "Bourgogne AOC" },
      ],
      grapes: [
        { id: "cs", name: "Cabernet Sauvignon" },
        { id: "me", name: "Merlot" },
        { id: "pn", name: "Pinot Noir" },
      ],
      typeDesignations: [
        { id: "d-first", name: "Premier Grand Cru Classé" },
        { id: "d-grand", name: "Grand Cru Classé" },
      ],
    },
    placeKeys: [{ id: "place-pauillac", canonical_key: "france.bordeaux.haut-medoc.pauillac" }],
    ...overrides,
  };
}

function attempt(overrides: Partial<AttemptRaw> = {}): AttemptRaw {
  return {
    id: ATTEMPT,
    created_at: "2026-09-24T18:00:00.123456+00:00",
    note_id: NOTE,
    picked_archetype_id: ARCH_PAUILLAC,
    guessed_vintage_kind: "YEAR",
    guessed_vintage_year: 2015,
    guessed_vintage_tawny_years: null,
    actual_catalog_wine_id: WINE_OLD,
    actual_archetype_id: ARCH_BOURGOGNE,
    note_colour_hue: "RUBY",
    hue_cleared: false,
    candidates_snapshot: [
      { archetypeId: ARCH_PAUILLAC, name: "A typical Pauillac", closeness: 91, rank: 1, capped: null },
    ],
    country_points: 2,
    region_points: 3,
    appellation_points: 0,
    primary_grape_points: 8,
    secondary_grape_points: null,
    type_designation_points: 0,
    vintage_points: 1,
    total_points: 14,
    possible_points: 22,
    ...overrides,
  };
}

const CTX = {
  archetypeNames: new Map([
    [ARCH_PAUILLAC, "A typical Pauillac"],
    [ARCH_BOURGOGNE, "A typical Bourgogne rouge"],
  ]),
  mergedInto: new Map<string, string | null>([
    [WINE_OLD, WINE_NEW],
    [WINE_NEW, null],
  ]),
  wines: new Map<string, WineDisplay>([
    [
      WINE_NEW,
      {
        label: "Château Léoville Barton Saint-Julien AOC 2016",
        lineage: "Saint-Julien AOC · Bordeaux, France",
        colour: "RED",
      },
    ],
  ]),
};

const NO_POINTS = {
  country: null,
  region: null,
  appellation: null,
  primaryGrape: null,
  secondaryGrape: null,
  typeDesignation: null,
  vintage: null,
};

describe("shapeCandidates", () => {
  it("orders by sort_order and names every reference", () => {
    const [first, second] = shapeCandidates(pool());
    expect(first.id).toBe(ARCH_BOURGOGNE);
    expect(second).toMatchObject({
      id: ARCH_PAUILLAC,
      name: "A typical Pauillac",
      description: "Cedar and cassis.",
      colour: "RED",
      style: "STILL",
      country: { id: "fr", name: "France" },
      region: { id: "bdx", name: "Bordeaux" },
      appellation: { id: "pauillac", name: "Pauillac AOC", isRegional: false },
      primaryGrape: { id: "cs", name: "Cabernet Sauvignon" },
      secondaryGrape: { id: "me", name: "Merlot" },
      typicalAge: [8, 25],
      placeCanonicalKey: "france.bordeaux.haut-medoc.pauillac",
      qualityLow: 88,
      qualityHigh: 96,
    });
  });

  it("marks a region's self-named appellation as regional and tolerates a null place", () => {
    const [bourgogne] = shapeCandidates(pool());
    expect(bourgogne.appellation).toEqual({ id: "bourgogne", name: "Bourgogne AOC", isRegional: true });
    expect(bourgogne.secondaryGrape).toBeNull();
    expect(bourgogne.typicalAge).toBeNull();
    expect(bourgogne.placeCanonicalKey).toBeNull();
    expect(bourgogne.aromas).toEqual([]);
    expect(bourgogne.designations).toEqual([]);
  });

  it("joins aromas with their term and group, keeps signature and drops unknown terms", () => {
    const pauillac = shapeCandidates(pool())[1];
    expect(pauillac.aromas).toEqual([
      { termId: "t-cassis", term: "blackcurrant", group: "Black fruit", kind: "NOSE", signature: false },
      { termId: "t-cedar", term: "cedar", group: "Oak", kind: "NOSE", signature: true },
    ]);
  });

  it("orders designations by the type designation order", () => {
    const pauillac = shapeCandidates(pool())[1];
    expect(pauillac.designations).toEqual([
      { id: "d-first", name: "Premier Grand Cru Classé" },
      { id: "d-grand", name: "Grand Cru Classé" },
    ]);
  });

  it("drops malformed sat entries and keeps every well-formed key", () => {
    const pauillac = shapeCandidates(pool())[1];
    expect(pauillac.sat).toEqual({ tannin: ["MEDIUM_PLUS", "HIGH"], clarity: ["CLEAR", "CLEAR"] });
  });

  it("leaves out an archetype whose appellation the viewer cannot read", () => {
    const names = { ...pool().names, appellations: [{ id: "bourgogne", name: "Bourgogne AOC" }] };
    expect(shapeCandidates(pool({ names })).map((c) => c.id)).toEqual([ARCH_BOURGOGNE]);
  });
});

describe("coverageCountries", () => {
  it("counts by country, most first, then by name", () => {
    const [bourgogne, pauillac] = shapeCandidates(pool());
    const italy = { ...pauillac, id: "it-1", country: { id: "it", name: "Italy" } };
    const austria = { ...pauillac, id: "at-1", country: { id: "at", name: "Austria" } };
    expect(coverageCountries([bourgogne, pauillac, austria, italy, { ...italy, id: "it-2" }])).toEqual([
      { name: "France", count: 2 },
      { name: "Italy", count: 2 },
      { name: "Austria", count: 1 },
    ]);
    expect(coverageCountries([])).toEqual([]);
  });
});

describe("vintage columns", () => {
  it("reads and writes the guessed vintage triple", () => {
    expect(vintageFromColumns("YEAR", 2016, null)).toEqual({ kind: "YEAR", year: 2016 });
    expect(vintageFromColumns("NV", null, null)).toEqual({ kind: "NV" });
    expect(vintageFromColumns("TAWNY", null, 20)).toEqual({ kind: "TAWNY", years: 20 });
    expect(vintageFromColumns(null, null, null)).toBeNull();
    expect(vintageFromColumns("YEAR", null, null)).toBeNull();
    expect(vintageColumns({ kind: "YEAR", year: 2016 })).toEqual({
      guessed_vintage_kind: "YEAR",
      guessed_vintage_year: 2016,
      guessed_vintage_tawny_years: null,
    });
    expect(vintageColumns({ kind: "NV" })).toEqual({
      guessed_vintage_kind: "NV",
      guessed_vintage_year: null,
      guessed_vintage_tawny_years: null,
    });
    expect(vintageColumns({ kind: "TAWNY", years: 20 })).toEqual({
      guessed_vintage_kind: "TAWNY",
      guessed_vintage_year: null,
      guessed_vintage_tawny_years: 20,
    });
    expect(vintageColumns(null)).toEqual({
      guessed_vintage_kind: null,
      guessed_vintage_year: null,
      guessed_vintage_tawny_years: null,
    });
  });
});

describe("parseSnapshot", () => {
  it("keeps well-formed entries only", () => {
    const good = { archetypeId: ARCH_PAUILLAC, name: "A typical Pauillac", closeness: 91, rank: 1, capped: null };
    const capped = {
      archetypeId: ARCH_BOURGOGNE,
      name: "A typical Bourgogne rouge",
      closeness: 15,
      rank: 2,
      capped: "colour",
    };
    expect(
      parseSnapshot([good, capped, { ...good, closeness: 140 }, { ...good, capped: "weird" }, { ...good, rank: 0 }, null, "x"]),
    ).toEqual([good, capped]);
    expect(parseSnapshot([{ ...good, closeness: null }])).toEqual([{ ...good, closeness: null }]);
    expect(parseSnapshot({ not: "a list" })).toEqual([]);
  });
});

describe("finalWineId", () => {
  it("follows merges, stops on a cycle and keeps an id it never read", () => {
    const merged = new Map<string, string | null>([
      ["a", "b"],
      ["b", "c"],
      ["c", null],
      ["x", "y"],
      ["y", "x"],
    ]);
    expect(finalWineId("a", merged)).toBe("c");
    expect(finalWineId("c", merged)).toBe("c");
    expect(finalWineId("x", merged)).toBe("y");
    expect(finalWineId("q", merged)).toBe("q");
  });
});

describe("actualWineLineage", () => {
  it("names a specific appellation, the grapes and the designation", () => {
    expect(
      actualWineLineage({
        appellation: "Saint-Julien AOC",
        region: "Bordeaux",
        country: "France",
        primaryGrape: "Cabernet Sauvignon",
        secondaryGrape: "Merlot",
        designation: "Grand Cru Classé",
      }),
    ).toBe("Saint-Julien AOC · Bordeaux, France · Cabernet Sauvignon, Merlot · Grand Cru Classé");
  });

  it("drops a regional appellation and needs a region and a country", () => {
    expect(
      actualWineLineage({
        appellation: "Bourgogne AOC",
        region: "Bourgogne",
        country: "France",
        primaryGrape: "Pinot Noir",
        secondaryGrape: null,
        designation: null,
      }),
    ).toBe("Bourgogne, France · Pinot Noir");
    expect(
      actualWineLineage({
        appellation: "Bourgogne AOC",
        region: null,
        country: "France",
        primaryGrape: "Pinot Noir",
        secondaryGrape: null,
        designation: null,
      }),
    ).toBeNull();
  });
});

describe("wineDisplay", () => {
  it("builds the catalog label and lineage from the embeds", () => {
    const row: CatalogDisplayRaw = {
      id: WINE_NEW,
      colour: "RED",
      wine_name: null,
      vintage_kind: "YEAR",
      vintage_year: 2016,
      vintage_tawny_years: null,
      producer: { name: "Château Léoville Barton" },
      country: [{ name: "France" }],
      region: { name: "Bordeaux" },
      appellation: { name: "Saint-Julien AOC" },
      primary_grape: { name: "Cabernet Sauvignon" },
      secondary_grape: null,
      type_designation: { name: "Grand Cru Classé" },
    };
    expect(wineDisplay(row)).toEqual({
      label: "Château Léoville Barton Saint-Julien AOC 2016",
      lineage: "Saint-Julien AOC · Bordeaux, France · Cabernet Sauvignon · Grand Cru Classé",
      colour: "RED",
    });
  });
});

describe("shapeAttemptRow", () => {
  it("shapes a scored attempt and follows a merged wine", () => {
    expect(shapeAttemptRow(attempt(), CTX)).toEqual({
      id: ATTEMPT,
      createdAt: "2026-09-24T18:00:00.123456+00:00",
      picked: { id: ARCH_PAUILLAC, name: "A typical Pauillac" },
      vintage: { kind: "YEAR", year: 2015 },
      actual: {
        catalogWineId: WINE_NEW,
        label: "Château Léoville Barton Saint-Julien AOC 2016",
        lineage: "Saint-Julien AOC · Bordeaux, France",
      },
      actualArchetype: { id: ARCH_BOURGOGNE, name: "A typical Bourgogne rouge" },
      hueCleared: false,
      noteColourHue: "RUBY",
      points: {
        country: 2,
        region: 3,
        appellation: 0,
        primaryGrape: 8,
        secondaryGrape: null,
        typeDesignation: 0,
        vintage: 1,
      },
      total: 14,
      possible: 22,
      snapshot: [{ archetypeId: ARCH_PAUILLAC, name: "A typical Pauillac", closeness: 91, rank: 1, capped: null }],
    });
  });

  it("shapes an unrevealed attempt and a wine the viewer cannot read", () => {
    const unrevealed = shapeAttemptRow(
      attempt({
        picked_archetype_id: null,
        guessed_vintage_kind: null,
        guessed_vintage_year: null,
        actual_catalog_wine_id: null,
        actual_archetype_id: null,
        country_points: null,
        region_points: null,
        appellation_points: null,
        primary_grape_points: null,
        type_designation_points: null,
        vintage_points: null,
        total_points: null,
        possible_points: null,
      }),
      CTX,
    );
    expect(unrevealed.picked).toBeNull();
    expect(unrevealed.vintage).toBeNull();
    expect(unrevealed.actual).toBeNull();
    expect(unrevealed.actualArchetype).toBeNull();
    expect(unrevealed.points).toEqual(NO_POINTS);
    expect(unrevealed.total).toBeNull();

    const hidden = shapeAttemptRow(attempt({ actual_catalog_wine_id: WINE_HIDDEN }), CTX);
    expect(hidden.actual).toEqual({ catalogWineId: WINE_HIDDEN, label: null, lineage: null });
  });
});

describe("history paging", () => {
  it("builds the keyset filter from the raw timestamp", () => {
    expect(historyOrFilter({ createdAt: "2026-09-24T18:00:00.123456+00:00", id: ATTEMPT })).toBe(
      `created_at.lt."2026-09-24T18:00:00.123456+00:00",and(created_at.eq."2026-09-24T18:00:00.123456+00:00",id.lt.${ATTEMPT})`,
    );
  });

  it("cuts a page at twenty and points the cursor at its last row", () => {
    expect(HISTORY_PAGE).toBe(20);
    const rows = Array.from({ length: HISTORY_PAGE + 1 }, (_, i) => ({ created_at: `t${i}`, id: `id-${i}` }));
    const cursorOf = (r: { created_at: string; id: string }) => ({ createdAt: r.created_at, id: r.id });
    const full = pageOf(rows, cursorOf);
    expect(full.rows).toHaveLength(20);
    expect(full.nextCursor).toEqual({ createdAt: "t19", id: "id-19" });
    const short = pageOf(rows.slice(0, 5), cursorOf);
    expect(short.rows).toHaveLength(5);
    expect(short.nextCursor).toBeNull();
  });

  it("maps the light tally select onto tally()'s input", () => {
    expect(
      tallyRows([
        { primary_grape_points: 8, appellation_points: 0, total_points: 11 },
        { primary_grape_points: null, appellation_points: null, total_points: null },
      ]),
    ).toEqual([
      { points: { ...NO_POINTS, primaryGrape: 8, appellation: 0 }, total: 11 },
      { points: NO_POINTS, total: null },
    ]);
  });
});
```

- [ ] **Step 4: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/pool-shape.test.ts`
Expected: FAIL — `Failed to resolve import "./pool-shape"`.

- [ ] **Step 5: Write `src/lib/training/pool-shape.ts`**

```ts
// Pure shaping behind the training room's server reads (training-room spec
// §4.6, §3.6, §6.1). pool.ts runs the queries as the viewer and hands the raw
// rows here; nothing in this file touches Supabase, React or server-only, so
// vitest pins every rule. Runtime imports are relative only (vitest has no
// `@/` alias).
import { justTheRegionOption } from "../../components/add-wine/self-named-appellation";
import { catalogWineTitle } from "../wset/wine-title";
import type { VintageKind } from "../supabase/database.types";
import type { WineColour, WineStyle } from "../wset/types";
import type { HistoryCursor } from "./action-types";
import type {
  AttemptRow,
  CapReason,
  Named,
  PointCategory,
  RankingSnapshot,
  TrainingCandidate,
  VintageGuess,
} from "./types";

/** Rows per history page (spec §3.6). */
export const HISTORY_PAGE = 20;
/** How far a merged catalog wine is followed — a cycle guard, not a real depth. */
export const MAX_MERGE_HOPS = 5;

// --- The candidate pool (spec §4.6) --------------------------------------------

export type ArchetypeRaw = {
  id: string;
  name: string;
  description: string | null;
  colour: WineColour;
  style: WineStyle;
  country_id: string;
  region_id: string;
  appellation_id: string;
  primary_grape_id: string;
  secondary_grape_id: string | null;
  typical_age_low: number | null;
  typical_age_high: number | null;
  /** jsonb — shaped defensively, a malformed entry is dropped. */
  sat: unknown;
  quality_low: number | null;
  quality_high: number | null;
  wine_place_id: string | null;
  sort_order: number;
};
export type ArchetypeAromaRaw = {
  archetype_id: string;
  term_id: string;
  kind: "NOSE" | "PALATE";
  signature: boolean;
};
export type AromaTermRaw = { id: string; term: string; group_name: string };
export type ArchetypeDesignationRaw = { archetype_id: string; type_designation_id: string };
export type PoolRaw = {
  archetypes: ArchetypeRaw[];
  aromas: ArchetypeAromaRaw[];
  terms: AromaTermRaw[];
  designations: ArchetypeDesignationRaw[];
  names: {
    countries: Named[];
    regions: Named[];
    appellations: Named[];
    grapes: Named[];
    /** In type_designations.sort_order — the order a candidate lists them. */
    typeDesignations: Named[];
  };
  placeKeys: { id: string; canonical_key: string }[];
};

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

function named(row: Named | undefined): Named | null {
  return row ? { id: row.id, name: row.name } : null;
}

function cleanSat(raw: unknown): Record<string, [string, string] | undefined> {
  const out: Record<string, [string, string] | undefined> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      typeof value[1] === "string"
    ) {
      out[key] = [value[0], value[1]];
    }
  }
  return out;
}

/**
 * The pool as TrainingCandidate[], in sort_order then name. An archetype whose
 * scoring identity the viewer cannot name (a reference row missing from the
 * reads) is left out rather than shown half-named (D8, D11).
 */
export function shapeCandidates(raw: PoolRaw): TrainingCandidate[] {
  const index = (rows: readonly Named[]) => new Map(rows.map((r) => [r.id, r] as const));
  const countries = index(raw.names.countries);
  const regions = index(raw.names.regions);
  const appellations = index(raw.names.appellations);
  const grapes = index(raw.names.grapes);
  const designationById = index(raw.names.typeDesignations);
  const designationRank = new Map(raw.names.typeDesignations.map((d, i) => [d.id, i] as const));
  const termById = new Map(raw.terms.map((t) => [t.id, t] as const));
  const placeKey = new Map(raw.placeKeys.map((p) => [p.id, p.canonical_key] as const));
  const aromasOf = groupBy(raw.aromas, (a) => a.archetype_id);
  const designationsOf = groupBy(raw.designations, (d) => d.archetype_id);

  const ordered = [...raw.archetypes].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const out: TrainingCandidate[] = [];
  for (const a of ordered) {
    const country = named(countries.get(a.country_id));
    const region = named(regions.get(a.region_id));
    const appellation = named(appellations.get(a.appellation_id));
    const primaryGrape = named(grapes.get(a.primary_grape_id));
    if (!country || !region || !appellation || !primaryGrape) continue;

    const aromas = (aromasOf.get(a.id) ?? []).flatMap((link) => {
      const term = termById.get(link.term_id);
      return term
        ? [{ termId: link.term_id, term: term.term, group: term.group_name, kind: link.kind, signature: link.signature }]
        : [];
    });
    const designations = (designationsOf.get(a.id) ?? [])
      .map((d) => named(designationById.get(d.type_designation_id)))
      .filter((d): d is Named => d !== null)
      .sort((x, y) => (designationRank.get(x.id) ?? 0) - (designationRank.get(y.id) ?? 0));

    out.push({
      id: a.id,
      name: a.name,
      description: a.description,
      colour: a.colour,
      style: a.style,
      country,
      region,
      appellation: { ...appellation, isRegional: justTheRegionOption(region, [appellation]) !== null },
      primaryGrape,
      secondaryGrape: a.secondary_grape_id ? named(grapes.get(a.secondary_grape_id)) : null,
      designations,
      typicalAge:
        a.typical_age_low !== null && a.typical_age_high !== null
          ? [a.typical_age_low, a.typical_age_high]
          : null,
      sat: cleanSat(a.sat),
      aromas,
      placeCanonicalKey: a.wine_place_id ? (placeKey.get(a.wine_place_id) ?? null) : null,
      qualityLow: a.quality_low,
      qualityHigh: a.quality_high,
    });
  }
  return out;
}

/** The coverage line's countries: how many candidates each, most first, then by name. */
export function coverageCountries(pool: readonly TrainingCandidate[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const c of pool) counts.set(c.country.name, (counts.get(c.country.name) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// --- Attempts (spec §6.1, §3.6) -----------------------------------------------------

export function vintageFromColumns(
  kind: VintageKind | null,
  year: number | null,
  tawnyYears: number | null,
): VintageGuess {
  if (kind === "YEAR" && year !== null) return { kind: "YEAR", year };
  if (kind === "NV") return { kind: "NV" };
  if (kind === "TAWNY" && tawnyYears !== null) return { kind: "TAWNY", years: tawnyYears };
  return null;
}

export function vintageColumns(v: VintageGuess): {
  guessed_vintage_kind: VintageKind | null;
  guessed_vintage_year: number | null;
  guessed_vintage_tawny_years: number | null;
} {
  return {
    guessed_vintage_kind: v ? v.kind : null,
    guessed_vintage_year: v && v.kind === "YEAR" ? v.year : null,
    guessed_vintage_tawny_years: v && v.kind === "TAWNY" ? v.years : null,
  };
}

const CAPS: readonly CapReason[] = ["colour", "bubbles", "fortified"];

/** The stored ranking (candidates_snapshot jsonb), keeping only well-formed entries. */
export function parseSnapshot(raw: unknown): RankingSnapshot {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;
    const { archetypeId, name, closeness, rank, capped } = e;
    if (typeof archetypeId !== "string" || typeof name !== "string") return [];
    if (typeof rank !== "number" || !Number.isInteger(rank) || rank < 1) return [];
    if (closeness !== null && (typeof closeness !== "number" || closeness < 0 || closeness > 100)) return [];
    if (capped !== null && !CAPS.includes(capped as CapReason)) return [];
    return [
      {
        archetypeId,
        name,
        closeness: closeness as number | null,
        rank,
        capped: capped as CapReason | null,
      },
    ];
  });
}

/** Follows catalog_wines.merged_into from `start` (spec §6.1: merges are followed on read). */
export function finalWineId(start: string, mergedInto: ReadonlyMap<string, string | null>): string {
  let id = start;
  const seen = new Set([id]);
  for (let hop = 0; hop < MAX_MERGE_HOPS; hop++) {
    const next = mergedInto.get(id);
    if (!next || seen.has(next)) return id;
    seen.add(next);
    id = next;
  }
  return id;
}

/** "Saint-Julien AOC · Bordeaux, France · Cabernet Sauvignon, Merlot · Grand Cru Classé";
    a region's self-named appellation is left out, as the candidate lineage does. */
export function actualWineLineage(p: {
  appellation: string | null;
  region: string | null;
  country: string | null;
  primaryGrape: string | null;
  secondaryGrape: string | null;
  designation: string | null;
}): string | null {
  if (!p.region || !p.country) return null;
  const regional =
    p.appellation !== null &&
    justTheRegionOption({ id: "region", name: p.region }, [{ id: "appellation", name: p.appellation }]) !== null;
  const place =
    p.appellation && !regional ? `${p.appellation} · ${p.region}, ${p.country}` : `${p.region}, ${p.country}`;
  const grapes = [p.primaryGrape, p.secondaryGrape].filter((g): g is string => Boolean(g)).join(", ");
  return [place, grapes, p.designation].filter((part): part is string => Boolean(part)).join(" · ");
}

type One<T> = T | T[] | null;
function nameOf(rel: One<{ name: string }> | undefined): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}

/** The revealed wine's display read. Embeds need the FK hints (two grape FKs). */
export const CATALOG_DISPLAY_COLUMNS: string =
  "id, colour, wine_name, vintage_kind, vintage_year, vintage_tawny_years, " +
  "producer:producers(name), country:countries(name), region:regions(name), " +
  "appellation:appellations(name), " +
  "primary_grape:grapes!catalog_wines_primary_grape_id_fkey(name), " +
  "secondary_grape:grapes!catalog_wines_secondary_grape_id_fkey(name), " +
  "type_designation:type_designations(name)";

export type CatalogDisplayRaw = {
  id: string;
  colour: WineColour | null;
  wine_name: string | null;
  vintage_kind: VintageKind | null;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  producer: One<{ name: string }>;
  country: One<{ name: string }>;
  region: One<{ name: string }>;
  appellation: One<{ name: string }>;
  primary_grape: One<{ name: string }>;
  secondary_grape: One<{ name: string }>;
  type_designation: One<{ name: string }>;
};

export type WineDisplay = { label: string; lineage: string | null; colour: WineColour | null };

export function wineDisplay(row: CatalogDisplayRaw): WineDisplay {
  return {
    label: catalogWineTitle({
      producerName: nameOf(row.producer),
      wineName: row.wine_name,
      vintageKind: row.vintage_kind ?? "YEAR",
      vintageYear: row.vintage_year,
      vintageTawnyYears: row.vintage_tawny_years,
      appellationName: nameOf(row.appellation),
    }),
    lineage: actualWineLineage({
      appellation: nameOf(row.appellation),
      region: nameOf(row.region),
      country: nameOf(row.country),
      primaryGrape: nameOf(row.primary_grape),
      secondaryGrape: nameOf(row.secondary_grape),
      designation: nameOf(row.type_designation),
    }),
    colour: row.colour,
  };
}

/** Every training_attempts column the room reads (spec §6.1). */
export const ATTEMPT_COLUMNS: string =
  "id, created_at, note_id, picked_archetype_id, guessed_vintage_kind, guessed_vintage_year, " +
  "guessed_vintage_tawny_years, actual_catalog_wine_id, actual_archetype_id, note_colour_hue, " +
  "hue_cleared, candidates_snapshot, country_points, region_points, appellation_points, " +
  "primary_grape_points, secondary_grape_points, type_designation_points, vintage_points, " +
  "total_points, possible_points";

export type AttemptRaw = {
  id: string;
  created_at: string;
  note_id: string;
  picked_archetype_id: string | null;
  guessed_vintage_kind: VintageKind | null;
  guessed_vintage_year: number | null;
  guessed_vintage_tawny_years: number | null;
  actual_catalog_wine_id: string | null;
  actual_archetype_id: string | null;
  note_colour_hue: string | null;
  hue_cleared: boolean;
  candidates_snapshot: unknown;
  country_points: number | null;
  region_points: number | null;
  appellation_points: number | null;
  primary_grape_points: number | null;
  secondary_grape_points: number | null;
  type_designation_points: number | null;
  vintage_points: number | null;
  total_points: number | null;
  possible_points: number | null;
};

type PointColumns = Partial<
  Pick<
    AttemptRaw,
    | "country_points"
    | "region_points"
    | "appellation_points"
    | "primary_grape_points"
    | "secondary_grape_points"
    | "type_designation_points"
    | "vintage_points"
  >
>;

function pointsOf(raw: PointColumns): Record<PointCategory, number | null> {
  return {
    country: raw.country_points ?? null,
    region: raw.region_points ?? null,
    appellation: raw.appellation_points ?? null,
    primaryGrape: raw.primary_grape_points ?? null,
    secondaryGrape: raw.secondary_grape_points ?? null,
    typeDesignation: raw.type_designation_points ?? null,
    vintage: raw.vintage_points ?? null,
  };
}

export function shapeAttemptRow(
  raw: AttemptRaw,
  ctx: {
    archetypeNames: ReadonlyMap<string, string>;
    mergedInto: ReadonlyMap<string, string | null>;
    wines: ReadonlyMap<string, WineDisplay>;
  },
): AttemptRow {
  const archetype = (id: string | null): Named | null => {
    const name = id ? ctx.archetypeNames.get(id) : undefined;
    return id && name !== undefined ? { id, name } : null;
  };
  let actual: AttemptRow["actual"] = null;
  if (raw.actual_catalog_wine_id) {
    const catalogWineId = finalWineId(raw.actual_catalog_wine_id, ctx.mergedInto);
    const wine = ctx.wines.get(catalogWineId);
    actual = { catalogWineId, label: wine?.label ?? null, lineage: wine?.lineage ?? null };
  }
  return {
    id: raw.id,
    createdAt: raw.created_at,
    picked: archetype(raw.picked_archetype_id),
    vintage: vintageFromColumns(
      raw.guessed_vintage_kind,
      raw.guessed_vintage_year,
      raw.guessed_vintage_tawny_years,
    ),
    actual,
    actualArchetype: archetype(raw.actual_archetype_id),
    hueCleared: raw.hue_cleared,
    noteColourHue: raw.note_colour_hue,
    points: pointsOf(raw),
    total: raw.total_points,
    possible: raw.possible_points,
    snapshot: parseSnapshot(raw.candidates_snapshot),
  };
}

/** PostgREST `or=` for "older than the cursor": (created_at, id) < (cursor). The
    raw timestamp keeps its microseconds (a JS Date would drop them). */
export function historyOrFilter(cursor: HistoryCursor): string {
  return (
    `created_at.lt."${cursor.createdAt}",` +
    `and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`
  );
}

/** A page read with limit HISTORY_PAGE + 1: the extra row only says "there is more". */
export function pageOf<T>(
  rows: readonly T[],
  cursorOf: (row: T) => HistoryCursor,
): { rows: T[]; nextCursor: HistoryCursor | null } {
  if (rows.length <= HISTORY_PAGE) return { rows: [...rows], nextCursor: null };
  const page = rows.slice(0, HISTORY_PAGE);
  return { rows: page, nextCursor: cursorOf(page[page.length - 1]) };
}

/** The tally's one light select, shaped for history-math's tally(). */
export function tallyRows(
  raw: readonly { primary_grape_points: number | null; appellation_points: number | null; total_points: number | null }[],
): Pick<AttemptRow, "points" | "total">[] {
  return raw.map((r) => ({
    points: pointsOf({ primary_grape_points: r.primary_grape_points, appellation_points: r.appellation_points }),
    total: r.total_points,
  }));
}
```

- [ ] **Step 6: Run the test and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/pool-shape.test.ts`
Expected: PASS — 18 tests in 1 file.

- [ ] **Step 7: Write the failing test `src/lib/training/attempt-payload.test.ts`**

```ts
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
const ENTRY = { archetypeId: ARCH, name: "A typical Pauillac", closeness: 91, rank: 1, capped: null };

function input(overrides: Partial<FinishInput> = {}): FinishInput {
  return {
    sessionKey: SESSION,
    startedAt: "2026-09-25T18:14:00.000Z",
    note: { id: null, colour_hue: "RUBY" },
    aromas: [{ term_id: TERM, sensed_on_nose: true, sensed_on_palate: false }],
    pickedArchetypeId: ARCH,
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

  it("refuses a bad session key, start time, pick or wine id", () => {
    for (const bad of [
      input({ sessionKey: "nope" }),
      input({ startedAt: "yesterday" }),
      input({ pickedArchetypeId: "x" }),
      input({ actualCatalogWineId: "x" }),
    ]) {
      expect(attemptPayload(bad)).toEqual({ error: SAVE_REFUSED });
    }
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
```

- [ ] **Step 8: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/attempt-payload.test.ts`
Expected: FAIL — `Failed to resolve import "./attempt-payload"`.

- [ ] **Step 9: Write `src/lib/training/attempt-payload.ts`**

```ts
// The server's own check of what the room sends before record_training_attempt
// runs (training-room spec §6.2, §6.5): the actions never trust the client's
// shape, and map the RPC's snake_case answer back. Pure, relative imports only,
// so vitest pins it.
import { parseSnapshot, vintageColumns } from "./pool-shape";
import type { AromaPayload, FinishInput, FinishResult, HistoryCursor } from "./action-types";
import type { PointCategory, VintageGuess } from "./types";

/** Every refusal this module makes, and the room's fallback for a thrown action. */
export const SAVE_REFUSED = "That session could not be saved.";
/** A few hundred archetypes at most; far above any real ranking, far below abuse. */
export const SNAPSHOT_MAX = 2000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ISO 8601 as the browser (toISOString) and PostgREST (timestamptz) write it.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

const POINT_ORDER: readonly PointCategory[] = [
  "country",
  "region",
  "appellation",
  "primaryGrape",
  "secondaryGrape",
  "typeDesignation",
  "vintage",
];
const RPC_KEY: Record<PointCategory, string> = {
  country: "country",
  region: "region",
  appellation: "appellation",
  primaryGrape: "primary_grape",
  secondaryGrape: "secondary_grape",
  typeDesignation: "type_designation",
  vintage: "vintage",
};

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** Guards the history cursor: it is spliced into a PostgREST `or=` filter. */
export function isHistoryCursor(v: unknown): v is HistoryCursor {
  if (!v || typeof v !== "object") return false;
  const { createdAt, id } = v as Record<string, unknown>;
  return typeof createdAt === "string" && TIMESTAMP.test(createdAt) && isUuid(id);
}

function validVintage(v: VintageGuess): boolean {
  if (v === null) return true;
  if (typeof v !== "object") return false;
  if (v.kind === "NV") return true;
  if (v.kind === "YEAR") return Number.isInteger(v.year) && v.year >= 1900 && v.year <= 2100;
  if (v.kind === "TAWNY") return Number.isInteger(v.years) && v.years >= 1 && v.years <= 100;
  return false;
}

function validAromas(aromas: unknown): aromas is AromaPayload[] {
  return (
    Array.isArray(aromas) &&
    aromas.every((row) => {
      if (!row || typeof row !== "object") return false;
      const r = row as Record<string, unknown>;
      return (
        isUuid(r.term_id) &&
        typeof r.sensed_on_nose === "boolean" &&
        typeof r.sensed_on_palate === "boolean"
      );
    })
  );
}

/** record_training_attempt's p_attempt for a fresh attempt, or a refusal. */
export function attemptPayload(
  input: FinishInput,
): { attempt: Record<string, unknown> } | { error: string } {
  const ok =
    input !== null &&
    typeof input === "object" &&
    isUuid(input.sessionKey) &&
    typeof input.startedAt === "string" &&
    TIMESTAMP.test(input.startedAt) &&
    (input.pickedArchetypeId === null || isUuid(input.pickedArchetypeId)) &&
    (input.actualCatalogWineId === null || isUuid(input.actualCatalogWineId)) &&
    validVintage(input.vintage) &&
    input.note !== null &&
    typeof input.note === "object" &&
    !Array.isArray(input.note) &&
    validAromas(input.aromas) &&
    Array.isArray(input.snapshot) &&
    input.snapshot.length <= SNAPSHOT_MAX &&
    parseSnapshot(input.snapshot).length === input.snapshot.length;
  if (!ok) return { error: SAVE_REFUSED };
  return {
    attempt: {
      session_key: input.sessionKey,
      started_at: input.startedAt,
      picked_archetype_id: input.pickedArchetypeId,
      ...vintageColumns(input.vintage),
      actual_catalog_wine_id: input.actualCatalogWineId,
      candidates_snapshot: input.snapshot,
    },
  };
}

/** p_attempt for Reveal now: only the attempt and the wine (spec §3.6, §6.2 step 3). */
export function revealPayload(
  attemptId: string,
  catalogWineId: string,
): { attempt: Record<string, unknown> } | { error: string } {
  if (!isUuid(attemptId) || !isUuid(catalogWineId)) return { error: SAVE_REFUSED };
  return { attempt: { attempt_id: attemptId, actual_catalog_wine_id: catalogWineId } };
}

function numberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** The RPC's jsonb answer (spec §6.2 step 5) as a FinishResult. */
export function finishResultFromRpc(raw: unknown): FinishResult {
  if (!raw || typeof raw !== "object") return { error: SAVE_REFUSED };
  const r = raw as Record<string, unknown>;
  const attemptId = r.attempt_id;
  const noteId = r.note_id;
  if (!isUuid(attemptId) || !isUuid(noteId)) return { error: SAVE_REFUSED };
  const source =
    r.points && typeof r.points === "object" ? (r.points as Record<string, unknown>) : {};
  const points = Object.fromEntries(
    POINT_ORDER.map((c) => [c, numberOrNull(source[RPC_KEY[c]])]),
  ) as Record<PointCategory, number | null>;
  const actualArchetypeId = r.actual_archetype_id;
  return {
    ok: true,
    attemptId,
    noteId,
    points,
    total: numberOrNull(r.total),
    possible: numberOrNull(r.possible),
    actualArchetypeId: isUuid(actualArchetypeId) ? actualArchetypeId : null,
    hueCleared: r.hue_cleared === true,
  };
}
```

- [ ] **Step 10: Run the test and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/attempt-payload.test.ts src/lib/training/pool-shape.test.ts`
Expected: PASS — 28 tests in 2 files (10 + 18).

- [ ] **Step 11: Write the server reads `src/lib/training/pool.ts`**

```ts
// The training room's server reads (training-room spec §4.6, §3.6): the
// candidate pool, the viewer's history page by page, one attempt, and the
// tally — all as the viewer under RLS. Server-only, not "use server": the page
// calls these during render (cache() shares one pool read per request) and
// src/app/taste/training/actions.ts wraps the history reads for the client.
// Every rule lives in the pure ./pool-shape; this file only queries.
//
// PostgREST answers at most 1000 rows per request, so whole-table reads go
// page by page and id lookups go in chunks (CLAUDE.md: never preload a table
// with a bare select).
import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { WineColour } from "@/lib/wset/types";
import type { HistoryCursor, HistoryPage, TrainingAttemptDetail, TrainingTally } from "./action-types";
import { tally } from "./history-math";
import {
  ATTEMPT_COLUMNS,
  CATALOG_DISPLAY_COLUMNS,
  MAX_MERGE_HOPS,
  HISTORY_PAGE,
  finalWineId,
  historyOrFilter,
  pageOf,
  shapeAttemptRow,
  shapeCandidates,
  tallyRows,
  wineDisplay,
  type AromaTermRaw,
  type ArchetypeAromaRaw,
  type ArchetypeDesignationRaw,
  type ArchetypeRaw,
  type AttemptRaw,
  type CatalogDisplayRaw,
  type WineDisplay,
} from "./pool-shape";
import type { AttemptRow, Named, TrainingCandidate } from "./types";

export { coverageCountries } from "./pool-shape";
export { candidateToArchetypeView } from "./archetype-view";

type Client = SupabaseClient<Database>;
type Result<T> = { data: T[] | null; error: { message: string } | null };

const PAGE = 1000;
const ID_CHUNK = 150;

// A failed read fails the page: a pool or history quietly missing rows would mislead.
async function readAll<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<Result<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`Training room: the ${what} read failed (${error.message})`);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE) return rows;
  }
}

async function readByIds<T>(
  what: string,
  ids: readonly string[],
  read: (chunk: string[]) => PromiseLike<Result<T>>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += ID_CHUNK) {
    const { data, error } = await read(unique.slice(i, i + ID_CHUNK));
    if (error) throw new Error(`Training room: the ${what} read failed (${error.message})`);
    rows.push(...(data ?? []));
  }
  return rows;
}

const ARCHETYPE_COLUMNS: string =
  "id, name, description, colour, style, country_id, region_id, appellation_id, " +
  "primary_grape_id, secondary_grape_id, typical_age_low, typical_age_high, sat, " +
  "quality_low, quality_high, wine_place_id, sort_order";

/** Every archetype as a TrainingCandidate (spec §4.6). One read per table, joined in TS. */
export const readTrainingPool = cache(async (supabase: Client): Promise<TrainingCandidate[]> => {
  const [archetypesRaw, aromasRaw, termsRaw, designationsRaw] = await Promise.all([
    readAll("archetypes", (from, to) =>
      supabase.from("wine_archetypes").select(ARCHETYPE_COLUMNS).order("sort_order").order("id").range(from, to),
    ),
    readAll("archetype aromas", (from, to) =>
      supabase
        .from("wine_archetype_aromas")
        .select("archetype_id, term_id, kind, signature")
        .order("archetype_id")
        .order("term_id")
        .order("kind")
        .range(from, to),
    ),
    readAll("aroma terms", (from, to) =>
      supabase.from("wset_aroma_terms").select("id, term, group_name").order("sort_order").order("id").range(from, to),
    ),
    readAll("archetype designations", (from, to) =>
      supabase
        .from("wine_archetype_designations")
        .select("archetype_id, type_designation_id")
        .order("archetype_id")
        .order("type_designation_id")
        .range(from, to),
    ),
  ]);
  const archetypes = archetypesRaw as unknown as ArchetypeRaw[];
  const designations = designationsRaw as unknown as ArchetypeDesignationRaw[];
  const ids = (pick: (a: ArchetypeRaw) => string | null) =>
    archetypes.map(pick).filter((id): id is string => id !== null);

  const [countries, regions, appellations, grapes, typeDesignations, places] = await Promise.all([
    readByIds("countries", ids((a) => a.country_id), (chunk) =>
      supabase.from("countries").select("id, name").in("id", chunk),
    ),
    readByIds("regions", ids((a) => a.region_id), (chunk) =>
      supabase.from("regions").select("id, name").in("id", chunk),
    ),
    readByIds("appellations", ids((a) => a.appellation_id), (chunk) =>
      supabase.from("appellations").select("id, name").in("id", chunk),
    ),
    readByIds("grapes", [...ids((a) => a.primary_grape_id), ...ids((a) => a.secondary_grape_id)], (chunk) =>
      supabase.from("grapes").select("id, name").in("id", chunk),
    ),
    readByIds("type designations", designations.map((d) => d.type_designation_id), (chunk) =>
      supabase.from("type_designations").select("id, name, sort_order").in("id", chunk),
    ),
    // Only non-null place ids: most batch-1 archetypes have no map place (D9).
    readByIds("map places", ids((a) => a.wine_place_id), (chunk) =>
      supabase.from("wine_places").select("id, canonical_key").in("id", chunk),
    ),
  ]);

  const orderedDesignations: Named[] = [...typeDesignations]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }));

  return shapeCandidates({
    archetypes,
    aromas: aromasRaw as unknown as ArchetypeAromaRaw[],
    terms: termsRaw as unknown as AromaTermRaw[],
    designations,
    names: { countries, regions, appellations, grapes, typeDesignations: orderedDesignations },
    placeKeys: places,
  });
});

// Follows merged_into from the given wines, a hop at a time (spec §6.1).
async function followMerges(supabase: Client, ids: readonly string[]): Promise<Map<string, string | null>> {
  const mergedInto = new Map<string, string | null>();
  let frontier = [...new Set(ids)];
  for (let hop = 0; hop <= MAX_MERGE_HOPS && frontier.length > 0; hop++) {
    const rows = await readByIds("merged wines", frontier, (chunk) =>
      supabase.from("catalog_wines").select("id, merged_into").in("id", chunk),
    );
    for (const r of rows) mergedInto.set(r.id, r.merged_into);
    frontier = rows
      .map((r) => r.merged_into)
      .filter((m): m is string => m !== null && !mergedInto.has(m));
  }
  return mergedInto;
}

type Hydrated = { row: AttemptRow; raw: AttemptRaw; wineColour: WineColour | null };

// Names the picks and the archetypes, follows merged wines and reads their labels.
// A wine the viewer cannot read (a hidden catalog row) keeps label null: the copy
// says "a wine you can't see yet".
async function hydrateAttempts(supabase: Client, raws: readonly AttemptRaw[]): Promise<Hydrated[]> {
  if (raws.length === 0) return [];
  const archetypeIds = raws
    .flatMap((r) => [r.picked_archetype_id, r.actual_archetype_id])
    .filter((id): id is string => id !== null);
  const wineIds = raws.map((r) => r.actual_catalog_wine_id).filter((id): id is string => id !== null);

  const [archetypes, mergedInto] = await Promise.all([
    readByIds("archetype names", archetypeIds, (chunk) =>
      supabase.from("wine_archetypes").select("id, name").in("id", chunk),
    ),
    followMerges(supabase, wineIds),
  ]);
  const finals = wineIds.map((id) => finalWineId(id, mergedInto));
  const displayRows = await readByIds("revealed wines", finals, (chunk) =>
    supabase.from("catalog_wines").select(CATALOG_DISPLAY_COLUMNS).in("id", chunk),
  );
  const wines = new Map<string, WineDisplay>(
    (displayRows as unknown as CatalogDisplayRaw[]).map((w) => [w.id, wineDisplay(w)]),
  );
  const archetypeNames = new Map(archetypes.map((a) => [a.id, a.name] as const));

  return raws.map((raw) => {
    const row = shapeAttemptRow(raw, { archetypeNames, mergedInto, wines });
    const wineColour = row.actual ? (wines.get(row.actual.catalogWineId)?.colour ?? null) : null;
    return { row, raw, wineColour };
  });
}

/** One page of the viewer's attempts, newest first (spec §3.6). */
export async function readTrainingHistory(
  supabase: Client,
  userId: string,
  cursor?: HistoryCursor,
): Promise<HistoryPage> {
  const base = supabase.from("training_attempts").select(ATTEMPT_COLUMNS).eq("author_id", userId);
  const filtered = cursor ? base.or(historyOrFilter(cursor)) : base;
  const { data, error } = await filtered
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(HISTORY_PAGE + 1);
  if (error) throw new Error(`Training room: the history read failed (${error.message})`);
  const page = pageOf((data ?? []) as unknown as AttemptRaw[], (r) => ({ createdAt: r.created_at, id: r.id }));
  const hydrated = await hydrateAttempts(supabase, page.rows);
  return { rows: hydrated.map((h) => h.row), nextCursor: page.nextCursor };
}

/** One of the viewer's attempts for the result screen; null when it is not theirs. */
export async function readTrainingAttemptDetail(
  supabase: Client,
  userId: string,
  attemptId: string,
): Promise<TrainingAttemptDetail | null> {
  const { data, error } = await supabase
    .from("training_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("author_id", userId)
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw new Error(`Training room: the attempt read failed (${error.message})`);
  if (!data) return null;
  const [hydrated] = await hydrateAttempts(supabase, [data as unknown as AttemptRaw]);
  return { row: hydrated.row, noteId: hydrated.raw.note_id, wineColour: hydrated.wineColour };
}

/** "6 of 9 right on the grape · 4 on the appellation" over every attempt — one light select. */
export async function readTrainingTally(supabase: Client, userId: string): Promise<TrainingTally> {
  const rows = await readAll("tally", (from, to) =>
    supabase
      .from("training_attempts")
      .select("primary_grape_points, appellation_points, total_points")
      .eq("author_id", userId)
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  return tally(tallyRows(rows as unknown as Parameters<typeof tallyRows>[0]));
}
```

- [ ] **Step 12: Write the actions `src/app/taste/training/actions.ts`**

```ts
"use server";

// The training room's server actions (training-room spec §6.5): thin wrappers
// over record_training_attempt and the history reads. Nothing here writes a
// table directly — no client role can write training_attempts (D14). The
// input is checked again on the server (attemptPayload / revealPayload) and a
// refusal from the RPC comes back verbatim. Types live in the plain module
// src/lib/training/action-types.ts: this file exports only async functions.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type {
  FinishInput,
  FinishResult,
  HistoryCursor,
  HistoryPage,
  TrainingAttemptDetail,
} from "@/lib/training/action-types";
import {
  SAVE_REFUSED,
  attemptPayload,
  finishResultFromRpc,
  isHistoryCursor,
  isUuid,
  revealPayload,
} from "@/lib/training/attempt-payload";
import { readTrainingAttemptDetail, readTrainingHistory } from "@/lib/training/pool";

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

// The room's history and the notes archive (a revealed training note appears there).
function refresh() {
  revalidatePath("/taste/training");
  revalidatePath("/taste/notes");
}

export async function finishTrainingSession(input: FinishInput): Promise<FinishResult> {
  const session = await signedIn();
  if (!session) return { error: SAVE_REFUSED };
  const payload = attemptPayload(input);
  if ("error" in payload) return payload;
  const { data, error } = await session.supabase.rpc("record_training_attempt", {
    p_note: input.note as unknown as Json,
    p_aromas: input.aromas as unknown as Json,
    p_attempt: payload.attempt as unknown as Json,
  });
  if (error) return { error: error.message };
  refresh();
  return finishResultFromRpc(data as unknown);
}

export async function revealTrainingAttempt(
  attemptId: string,
  catalogWineId: string,
): Promise<FinishResult> {
  const session = await signedIn();
  if (!session) return { error: SAVE_REFUSED };
  const payload = revealPayload(attemptId, catalogWineId);
  if ("error" in payload) return payload;
  // A re-reveal ignores p_note and p_aromas entirely (spec §6.2 step 3).
  const { data, error } = await session.supabase.rpc("record_training_attempt", {
    p_note: {} as unknown as Json,
    p_aromas: [] as unknown as Json,
    p_attempt: payload.attempt as unknown as Json,
  });
  if (error) return { error: error.message };
  refresh();
  return finishResultFromRpc(data as unknown);
}

export async function loadMoreTrainingHistory(cursor: HistoryCursor): Promise<HistoryPage> {
  const session = await signedIn();
  if (!session || !isHistoryCursor(cursor)) return { rows: [], nextCursor: null };
  return readTrainingHistory(session.supabase, session.userId, cursor);
}

export async function loadTrainingAttempt(attemptId: string): Promise<TrainingAttemptDetail | null> {
  const session = await signedIn();
  if (!session || !isUuid(attemptId)) return null;
  return readTrainingAttemptDetail(session.supabase, session.userId, attemptId);
}
```

- [ ] **Step 13: Run the gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training && npx tsc --noEmit && npx eslint src/lib/training/action-types.ts src/lib/training/pool-shape.ts src/lib/training/pool-shape.test.ts src/lib/training/attempt-payload.ts src/lib/training/attempt-payload.test.ts src/lib/training/pool.ts src/app/taste/training/actions.ts`
Expected: vitest PASS (every file under `src/lib/training`, including this task's 28 tests);
`tsc` exits 0 with no output; `eslint` prints nothing. If `tsc` reports an unknown column in a
`.select(...)` literal, the Task 1 types disagree with the spec §6.1/§4.1 names — fix
`database.types.ts` (Task 1), not this code.

- [ ] **Step 14: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/training/action-types.ts src/lib/training/pool-shape.ts src/lib/training/pool-shape.test.ts src/lib/training/attempt-payload.ts src/lib/training/attempt-payload.test.ts src/lib/training/pool.ts src/app/taste/training/actions.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): pool and history reads, finish and reveal actions" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The room

**Files:**
- Modify: `src/lib/training/copy.ts` and `src/lib/training/copy.test.ts` (only the names
  Task 2 did not already define — Step 1)
- Create: `src/lib/training/panel.ts`
- Test: `src/lib/training/panel.test.ts`
- Create: `src/app/taste/training/page.tsx`
- Create: `src/app/taste/training/training-room.tsx`
- Create: `src/app/taste/training/candidates-panel.tsx`
- Create: `src/app/taste/training/candidates-strip.tsx`
- Create: `src/app/taste/training/candidates-sheet.tsx`
- Create: `src/app/taste/training/archetype-detail.tsx`
- Create: `src/app/taste/training/your-call.tsx`

**Interfaces:**
- Consumes: Task 2 — `TRAINING_COPY`, `shortName`, `coverageLine`, `stripLine`,
  `lineageLine`, `tallyLine` (copy.ts); `readDraft(userId): TrainingDraft | null`,
  `writeDraft(d)`, `clearDraft(userId)`, `newSessionKey()` (draft.ts); the types. Task 3 —
  `rankCandidates(note, extras, pool, lexicon)`, `snapshotRanking(ranked)`. Task 4 —
  `noteToPayload(state, ids)`, `aromasToPayload(state)` in `src/lib/wset/note-state.ts`
  (beside the existing `emptyNoteState`). Task 5 — `WsetSheet` props `onChange`,
  `footerAction`, `belowBar`, `aside`, `onClose`, `bubbles`, `fortified`, optional
  `onSave`. Task 6 — `ArchetypeSheet({ a, answers, idPrefix })`,
  `candidateToArchetypeView`. Task 7 —
  `openAddWineSheet({ kind: "note", reveal: true }, { onNotePick })`. Task 9 —
  `readTrainingPool`, `readTrainingHistory`, `readTrainingTally`, `coverageCountries`,
  `finishTrainingSession`, `SAVE_REFUSED`, `HistoryPage`, `TrainingTally`.
- Produces (used by Task 11): `TrainingRoom` with the exact anchors Task 11 edits
  (`type View = "landing" | "session";`, the `finish` success block, the sessions `<p>`);
  `panel.ts` exports `PANEL_LIMIT`, `PanelGroup`, `PanelView`, `isBeforeAnswers`,
  `panelView`, `CALL_LIMIT`, `CALL_SEARCH_LIMIT`, `yourCallOptions`,
  `vintagePickerValue`, `vintageFromPickerId`, `VintagePick`, `tawnyYearsFromInput`.

- [ ] **Step 1: Make sure copy.ts has every name the room reads**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && for n in TRAINING_COPY continueLine sheetTitleLine showAllLine itWasLine vintageGuessLabel youSaidLine percentLabel shortName coverageLine stripLine lineageLine tallyLine resultTotalLine attemptRowLine hueClearedLine styleVerdictLine; do grep -q "export \(const\|function\) $n\b" src/lib/training/copy.ts && echo "ok $n" || echo "MISSING $n"; done; for k in eyebrow title promise start discard discardArmed footerAction candidatesHeading beforeAnswers unlikely yourCall whichWine somethingElse notInList vintageOptional revealBottle cantFindOut youDidntPick wherePointed notRevealed anotherGlass seeNote done rowLabels markRight markWrong markNone yourSessions showMore noSessions revealNow badge notRevealedRow unreadableWine; do grep -q "^  $k:" src/lib/training/copy.ts && echo "ok key $k" || echo "MISSING key $k"; done`
Expected: every line starts `ok`. For each `MISSING` line, add exactly the matching
definition below to `src/lib/training/copy.ts` (a missing `TRAINING_COPY` key goes inside
the existing `TRAINING_COPY` object with the value shown; if `TRAINING_COPY` itself is
missing, add the whole object). Add `VintageGuess` to copy.ts's `import type { … } from "./types";`
line if it is not imported yet. Values are verbatim from spec §9.

```ts
export const TRAINING_COPY = {
  eyebrow: "Training room · Preview",
  title: "Taste blind. Then find out.",
  promise:
    "Pour a glass whose label you can't see. Describe it, watch the list tell you what it could be, then reveal the bottle.",
  start: "Start a session",
  discard: "Discard",
  discardArmed: "Tap again to discard",
  footerAction: "Your call →",
  candidatesHeading: "What it could be",
  beforeAnswers: "Start describing the wine",
  unlikely: "Unlikely from what you've said",
  yourCall: "Your call",
  whichWine: "Which wine is it?",
  somethingElse: "Something else…",
  notInList: "It's not in the list",
  vintageOptional: "Vintage (optional)",
  revealBottle: "Reveal the bottle",
  cantFindOut: "I can't find out",
  youDidntPick: "You didn't pick a wine",
  wherePointed: "Where your note pointed",
  notRevealed: "Not revealed — your note is kept. Reveal now from Your sessions.",
  anotherGlass: "Another glass",
  seeNote: "See the note",
  done: "Done",
  rowLabels: {
    country: "Country",
    region: "Region",
    appellation: "Appellation",
    primaryGrape: "Grape",
    secondaryGrape: "Second grape",
    typeDesignation: "Designation",
    vintage: "Vintage",
  },
  markRight: "✓",
  markWrong: "✗",
  markNone: "—",
  yourSessions: "Your sessions",
  showMore: "Show more",
  noSessions: "No sessions yet",
  revealNow: "Reveal now",
  badge: "Training",
  notRevealedRow: "Training room · not revealed",
  unreadableWine: "a wine you can't see yet",
} as const;

/** "Continue your session · started 20:14" — `time` is already formatted. */
export function continueLine(time: string): string {
  return `Continue your session · started ${time}`;
}

/** "Unknown wine · started 20:14" — the WSET sheet's title in the room. */
export function sheetTitleLine(time: string): string {
  return `Unknown wine · started ${time}`;
}

/** "Show all 42". */
export function showAllLine(n: number): string {
  return `Show all ${n}`;
}

/** "It was {wine}". */
export function itWasLine(wine: string): string {
  return `It was ${wine}`;
}

/** A vintage guess as words: "2016", "NV", "20 years tawny" (the ladder's wording). */
export function vintageGuessLabel(v: VintageGuess): string | null {
  if (v === null) return null;
  if (v.kind === "YEAR") return String(v.year);
  if (v.kind === "NV") return "NV";
  return `${v.years} years tawny`;
}

/** "You said {shortName}{, vintage}". */
export function youSaidLine(pickName: string, vintage: VintageGuess): string {
  const v = vintageGuessLabel(vintage);
  return `You said ${shortName(pickName)}${v ? `, ${v}` : ""}`;
}

/** "91 %" — spec §9 writes a space before the sign. */
export function percentLabel(closeness: number): string {
  return `${closeness} %`;
}
```

Then add this block to the end of `src/lib/training/copy.test.ts`, adding every name it
uses that the file does not import yet to its existing `import { … } from "./copy";` line:

```ts
describe("room copy read by the room components (plan Task 10)", () => {
  it("keeps the spec §9 fixed strings", () => {
    expect(TRAINING_COPY.eyebrow).toBe("Training room · Preview");
    expect(TRAINING_COPY.title).toBe("Taste blind. Then find out.");
    expect(TRAINING_COPY.start).toBe("Start a session");
    expect(TRAINING_COPY.discardArmed).toBe("Tap again to discard");
    expect(TRAINING_COPY.footerAction).toBe("Your call →");
    expect(TRAINING_COPY.candidatesHeading).toBe("What it could be");
    expect(TRAINING_COPY.unlikely).toBe("Unlikely from what you've said");
    expect(TRAINING_COPY.notInList).toBe("It's not in the list");
    expect(TRAINING_COPY.notRevealed).toBe("Not revealed — your note is kept. Reveal now from Your sessions.");
    expect(TRAINING_COPY.rowLabels.secondaryGrape).toBe("Second grape");
    expect([TRAINING_COPY.markRight, TRAINING_COPY.markWrong, TRAINING_COPY.markNone]).toEqual(["✓", "✗", "—"]);
    expect(TRAINING_COPY.notRevealedRow).toBe("Training room · not revealed");
    expect(TRAINING_COPY.unreadableWine).toBe("a wine you can't see yet");
  });

  it("fills the room's templates", () => {
    expect(continueLine("20:14")).toBe("Continue your session · started 20:14");
    expect(sheetTitleLine("20:14")).toBe("Unknown wine · started 20:14");
    expect(showAllLine(42)).toBe("Show all 42");
    expect(itWasLine("Château Léoville Barton 2016")).toBe("It was Château Léoville Barton 2016");
    expect(youSaidLine("A typical Pauillac", null)).toBe("You said Pauillac");
    expect(youSaidLine("A typical Pauillac", { kind: "YEAR", year: 2016 })).toBe("You said Pauillac, 2016");
    expect(youSaidLine("A typical Champagne", { kind: "NV" })).toBe("You said Champagne, NV");
    expect(youSaidLine("A typical Tawny Port", { kind: "TAWNY", years: 20 })).toBe(
      "You said Tawny Port, 20 years tawny",
    );
    expect(percentLabel(91)).toBe("91 %");
  });
});
```

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/copy.test.ts`
Expected: PASS (Task 2's tests plus these 2).

- [ ] **Step 2: Write the failing test `src/lib/training/panel.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { TRAINING_COPY } from "./copy";
import {
  PANEL_LIMIT,
  isBeforeAnswers,
  panelView,
  tawnyYearsFromInput,
  vintageFromPickerId,
  vintagePickerValue,
  yourCallOptions,
} from "./panel";
import type { CapReason, RankedCandidate, TrainingCandidate } from "./types";

function candidate(id: string, name: string, country: string, region = "Somewhere"): TrainingCandidate {
  return {
    id,
    name,
    description: null,
    colour: "RED",
    style: "STILL",
    country: { id: `c-${country}`, name: country },
    region: { id: `r-${region}`, name: region },
    appellation: { id: `a-${id}`, name: `${name} AOC`, isRegional: false },
    primaryGrape: { id: "g", name: "Syrah" },
    secondaryGrape: null,
    designations: [],
    typicalAge: null,
    sat: {},
    aromas: [],
    placeCanonicalKey: null,
    qualityLow: null,
    qualityHigh: null,
  };
}

function ranked(c: TrainingCandidate, closeness: number | null, capped: CapReason | null = null): RankedCandidate {
  return { candidate: c, closeness, capped, explanation: null, signatureHits: [] };
}

const ids = (rows: RankedCandidate[]) => rows.map((r) => r.candidate.id);

const BEFORE = [
  ranked(candidate("1", "A typical Barossa Shiraz", "Australia"), null),
  ranked(candidate("2", "A typical Clare Valley Riesling", "Australia"), null),
  ranked(candidate("3", "A typical Bandol", "France"), null),
  ranked(candidate("4", "A typical Chablis", "France"), null),
  ranked(candidate("5", "A typical Margaux", "France"), null),
  ranked(candidate("6", "A typical Barolo", "Italy"), null),
  ranked(candidate("7", "A typical Soave", "Italy"), null),
];

const SCORED = [
  ranked(candidate("1", "A typical Pauillac", "France", "Bordeaux"), 91),
  ranked(candidate("2", "A typical Margaux", "France", "Bordeaux"), 84),
  ranked(candidate("3", "A typical Bandol", "France", "Provence"), 80),
  ranked(candidate("4", "A typical Barolo", "Italy", "Piemonte"), 72),
  ranked(candidate("5", "A typical Rioja Reserva", "Spain", "Rioja"), 70),
  ranked(candidate("6", "A typical Barossa Shiraz", "Australia", "South Australia"), 61),
  ranked(candidate("7", "A typical Côte-Rôtie", "France", "Rhône"), 55),
];

describe("panelView", () => {
  it("groups the first five by country before anything is answered", () => {
    const view = panelView(BEFORE, false);
    expect(view.before).toBe(true);
    expect(view.total).toBe(7);
    expect(view.hidden).toBe(2);
    expect(view.groups.map((g) => [g.heading, ids(g.rows)])).toEqual([
      ["Australia", ["1", "2"]],
      ["France", ["3", "4", "5"]],
    ]);
    expect(PANEL_LIMIT).toBe(5);
  });

  it("shows every candidate once expanded", () => {
    const view = panelView(BEFORE, true);
    expect(view.hidden).toBe(0);
    expect(view.groups.map((g) => g.heading)).toEqual(["Australia", "France", "Italy"]);
  });

  it("puts capped candidates under the unlikely heading", () => {
    const list = [
      ranked(candidate("1", "A typical Pauillac", "France"), 91),
      ranked(candidate("2", "A typical Margaux", "France"), 84),
      ranked(candidate("3", "A typical Bandol", "France"), null),
      ranked(candidate("4", "A typical Chablis", "France"), 15, "colour"),
      ranked(candidate("5", "A typical Champagne", "France"), 12, "bubbles"),
      ranked(candidate("6", "A typical Sancerre", "France"), null, "colour"),
    ];
    const view = panelView(list, false);
    expect(view.before).toBe(false);
    expect(view.groups.map((g) => [g.heading, ids(g.rows)])).toEqual([
      [null, ["1", "2", "3"]],
      [TRAINING_COPY.unlikely, ["4", "5"]],
    ]);
    expect(view.hidden).toBe(1);
  });

  it("is in before-answers mode only while nothing has a number or a cap", () => {
    const c = candidate("1", "A typical Pauillac", "France");
    expect(isBeforeAnswers([ranked(c, null)])).toBe(true);
    expect(isBeforeAnswers([])).toBe(true);
    expect(isBeforeAnswers([ranked(c, 40)])).toBe(false);
    expect(isBeforeAnswers([ranked(c, null, "bubbles")])).toBe(false);
  });
});

describe("yourCallOptions", () => {
  it("lists the top five and keeps a pick from further down", () => {
    expect(ids(yourCallOptions(SCORED, "", null))).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids(yourCallOptions(SCORED, "", "7"))).toEqual(["1", "2", "3", "4", "5", "7"]);
    expect(ids(yourCallOptions(SCORED, "", "2"))).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("searches every candidate by name, region or country, accents folded", () => {
    expect(ids(yourCallOptions(SCORED, "cote rotie", null))).toEqual(["7"]);
    expect(ids(yourCallOptions(SCORED, "rhone", null))).toEqual(["7"]);
    expect(ids(yourCallOptions(SCORED, "italy", null))).toEqual(["4"]);
    expect(ids(yourCallOptions(SCORED, "zzz", null))).toEqual([]);
  });
});

describe("vintage picker mapping", () => {
  const PRESETS = [10, 20, 30, 40];

  it("names the picker row a guess sits on", () => {
    expect(vintagePickerValue(null, PRESETS)).toBe("");
    expect(vintagePickerValue({ kind: "YEAR", year: 2016 }, PRESETS)).toBe("year:2016");
    expect(vintagePickerValue({ kind: "NV" }, PRESETS)).toBe("nv");
    expect(vintagePickerValue({ kind: "TAWNY", years: 20 }, PRESETS)).toBe("tawny:20");
    expect(vintagePickerValue({ kind: "TAWNY", years: 25 }, PRESETS)).toBe("tawny:other");
  });

  it("turns a picked row back into a guess", () => {
    expect(vintageFromPickerId(null)).toEqual({ vintage: null });
    expect(vintageFromPickerId("nv")).toEqual({ vintage: { kind: "NV" } });
    expect(vintageFromPickerId("year:2016")).toEqual({ vintage: { kind: "YEAR", year: 2016 } });
    expect(vintageFromPickerId("tawny:20")).toEqual({ vintage: { kind: "TAWNY", years: 20 } });
    expect(vintageFromPickerId("tawny:other")).toEqual({ otherTawny: true });
    expect(vintageFromPickerId("junk")).toEqual({ vintage: null });
  });

  it("reads a typed tawny age of 1 to 100 whole years", () => {
    expect(tawnyYearsFromInput("25")).toBe(25);
    expect(tawnyYearsFromInput("")).toBeNull();
    expect(tawnyYearsFromInput("0")).toBeNull();
    expect(tawnyYearsFromInput("101")).toBeNull();
    expect(tawnyYearsFromInput("2.5")).toBeNull();
  });
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/panel.test.ts`
Expected: FAIL — `Failed to resolve import "./panel"`.

- [ ] **Step 4: Write `src/lib/training/panel.ts`**

```ts
// View rules for the room's candidate list and Your call card (training-room
// spec §3.3, §5.8): the laptop column's top five and Show all, the
// before-answers country groups, the "Unlikely from what you've said" group,
// the Your call options and the vintage picker's ids. Pure, relative imports
// only, so vitest pins it.
import {
  VINTAGE_NV_ID,
  VINTAGE_TAWNY_OTHER_ID,
  vintageTawnyId,
  vintageYearId,
} from "../../app/tastings/[id]/play/ladder-types";
import { foldName } from "../wine-identity/fold";
import { TRAINING_COPY } from "./copy";
import type { RankedCandidate, VintageGuess } from "./types";

/** Rows the laptop column shows before Show all. */
export const PANEL_LIMIT = 5;

export type PanelGroup = { key: string; heading: string | null; rows: RankedCandidate[] };
export type PanelView = { before: boolean; groups: PanelGroup[]; total: number; hidden: number };

/** Nothing answered yet that any candidate can be measured on, and nothing capped. */
export function isBeforeAnswers(ranked: readonly RankedCandidate[]): boolean {
  return ranked.every((r) => r.closeness === null && r.capped === null);
}

/**
 * The list as groups, in the matcher's order. Before any answer the groups are
 * countries (the matcher already sorts un-numbered candidates by country then
 * name); after, the uncapped rows come first without a heading and the capped
 * ones follow under "Unlikely from what you've said".
 */
export function panelView(
  ranked: readonly RankedCandidate[],
  expanded: boolean,
  limit: number = PANEL_LIMIT,
): PanelView {
  const before = isBeforeAnswers(ranked);
  const rows = expanded ? [...ranked] : ranked.slice(0, limit);
  const groups: PanelGroup[] = [];
  for (const r of rows) {
    const key = before ? `country:${r.candidate.country.name}` : r.capped ? "unlikely" : "likely";
    const heading = before ? r.candidate.country.name : r.capped ? TRAINING_COPY.unlikely : null;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, heading, rows: [r] });
  }
  return { before, groups, total: ranked.length, hidden: ranked.length - rows.length };
}

/** Your call's list without a search: the top five. */
export const CALL_LIMIT = 5;
/** Your call's search results. */
export const CALL_SEARCH_LIMIT = 20;

/**
 * The candidates Your call offers: the ranking's top five (plus the current
 * pick when it sits further down), or — with a query — every candidate whose
 * name, appellation, region or country contains it, accents and punctuation
 * folded, in ranking order.
 */
export function yourCallOptions(
  ranked: readonly RankedCandidate[],
  query: string,
  pickedId: string | null,
): RankedCandidate[] {
  const key = foldName(query);
  if (key !== "") {
    return ranked
      .filter((r) =>
        [r.candidate.name, r.candidate.appellation.name, r.candidate.region.name, r.candidate.country.name].some(
          (n) => foldName(n).includes(key),
        ),
      )
      .slice(0, CALL_SEARCH_LIMIT);
  }
  const top = ranked.slice(0, CALL_LIMIT);
  if (pickedId && !top.some((r) => r.candidate.id === pickedId)) {
    const picked = ranked.find((r) => r.candidate.id === pickedId);
    if (picked) return [...top, picked];
  }
  return top;
}

/** The guess ladder's vintage picker row a guess sits on ("" = none). */
export function vintagePickerValue(v: VintageGuess, tawnyPresets: readonly number[]): string {
  if (v === null) return "";
  if (v.kind === "YEAR") return vintageYearId(v.year);
  if (v.kind === "NV") return VINTAGE_NV_ID;
  return tawnyPresets.includes(v.years) ? vintageTawnyId(v.years) : VINTAGE_TAWNY_OTHER_ID;
}

export type VintagePick = { vintage: VintageGuess } | { otherTawny: true };

/** A picked row as a guess; "Other age…" asks for a typed age instead. */
export function vintageFromPickerId(id: string | null): VintagePick {
  if (id === null) return { vintage: null };
  if (id === VINTAGE_NV_ID) return { vintage: { kind: "NV" } };
  if (id === VINTAGE_TAWNY_OTHER_ID) return { otherTawny: true };
  if (id.startsWith("year:")) {
    const year = Number(id.slice(5));
    return Number.isInteger(year) ? { vintage: { kind: "YEAR", year } } : { vintage: null };
  }
  if (id.startsWith("tawny:")) {
    const years = Number(id.slice(6));
    return Number.isInteger(years) ? { vintage: { kind: "TAWNY", years } } : { vintage: null };
  }
  return { vintage: null };
}

/** A typed tawny age: whole years 1–100, as the ladder's "Other age…" accepts. */
export function tawnyYearsFromInput(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}
```

- [ ] **Step 5: Run the test and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/panel.test.ts`
Expected: PASS — 9 tests in 1 file.

- [ ] **Step 6: Write `src/app/taste/training/archetype-detail.tsx`**

```tsx
"use client";

// A candidate's full profile for the room: the map's read-only archetype sheet
// with the taster's own answers drawn on its ranges (spec §3.3, §7.2), and the
// designations its label would carry (D10). `idPrefix` keeps its section ids
// apart from the WSET sheet on the same page.
import { ArchetypeSheet } from "@/components/wset/archetype-sheet";
import { candidateToArchetypeView } from "@/lib/training/archetype-view";
import type { TrainingCandidate } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";

export function ArchetypeDetail({
  candidate,
  note,
}: {
  candidate: TrainingCandidate;
  note: WsetNoteState;
}) {
  return (
    <div className="flex flex-col gap-2">
      {candidate.designations.length > 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {candidate.designations.map((d) => d.name).join(" · ")}
        </p>
      ) : null}
      <ArchetypeSheet
        a={candidateToArchetypeView(candidate)}
        answers={note}
        idPrefix={`archetype-${candidate.id}-`}
      />
    </div>
  );
}
```

- [ ] **Step 7: Write `src/app/taste/training/candidates-panel.tsx`**

```tsx
"use client";

// "What it could be" — the laptop column (lg+, spec §3.3): the top five
// candidates, Show all N in place, the capped ones last under "Unlikely from
// what you've said". A row opens the candidate's profile in a popover anchored
// to it. CandidateRow and CandidateGroups are shared with the phone sheet.
// Tokens only: the bar is --primary, a capped row --muted-foreground.
import { useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Eyebrow } from "@/components/overview/eyebrow";
import { TRAINING_COPY, lineageLine, percentLabel, shortName, showAllLine } from "@/lib/training/copy";
import { panelView, type PanelView } from "@/lib/training/panel";
import type { RankedCandidate } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";
import { cn } from "@/lib/utils";
import { ArchetypeDetail } from "./archetype-detail";

// 44 px on touch, the row's own height on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";

export function CandidateRow({
  r,
  onOpen,
}: {
  r: RankedCandidate;
  onOpen: (anchor: HTMLElement) => void;
}) {
  const capped = r.capped !== null;
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      className={cn(
        "flex w-full flex-col gap-1 rounded-[10px] px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
        TAP,
      )}
    >
      <span className={cn("text-[13.5px] leading-tight font-semibold", capped && "text-muted-foreground")}>
        {r.candidate.name}
      </span>
      <span className="text-[11.5px] leading-snug text-muted-foreground">{lineageLine(r.candidate)}</span>
      {r.closeness !== null ? (
        <span className="flex items-center gap-2">
          <span
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={r.closeness}
            aria-label={shortName(r.candidate.name)}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          >
            <span
              className={cn("block h-full rounded-full", capped ? "bg-muted-foreground" : "bg-primary")}
              style={{ width: `${r.closeness}%` }}
            />
          </span>
          <span className="w-11 shrink-0 text-right text-[12px] font-semibold tabular-nums">
            {percentLabel(r.closeness)}
          </span>
        </span>
      ) : null}
      {r.explanation ? (
        <span className="text-[11.5px] leading-snug text-muted-foreground">{r.explanation}</span>
      ) : null}
    </button>
  );
}

export function CandidateGroups({
  view,
  onOpen,
}: {
  view: PanelView;
  onOpen: (id: string, anchor: HTMLElement) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {view.groups.map((group) => (
        <div key={group.key} className="flex flex-col">
          {group.heading ? (
            <Eyebrow size="sm" className="block px-3 pt-2 pb-1">
              {group.heading}
            </Eyebrow>
          ) : null}
          <ul className="flex flex-col">
            {group.rows.map((r) => (
              <li key={r.candidate.id}>
                <CandidateRow r={r} onOpen={(anchor) => onOpen(r.candidate.id, anchor)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function CandidatesPanel({ ranked, note }: { ranked: RankedCandidate[]; note: WsetNoteState }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const view = panelView(ranked, expanded);
  const open = detail ? (ranked.find((r) => r.candidate.id === detail.id) ?? null) : null;

  return (
    <section
      aria-labelledby="training-candidates"
      className="flex flex-col gap-2 rounded-[12px] border border-border bg-card p-2"
    >
      <h2 id="training-candidates" className="px-3 pt-2 font-heading text-[19px] font-semibold">
        {TRAINING_COPY.candidatesHeading}
      </h2>
      {view.before ? (
        <p className="px-3 text-[12.5px] text-muted-foreground">{TRAINING_COPY.beforeAnswers}</p>
      ) : null}
      <CandidateGroups view={view} onOpen={(id, anchor) => setDetail({ id, anchor })} />
      {view.hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(
            "mx-1 mb-1 flex items-center justify-center rounded-[10px] border border-border bg-background py-2 text-[12.5px] font-semibold text-primary transition-colors hover:border-gold",
            TAP,
          )}
        >
          {showAllLine(view.total)}
        </button>
      ) : null}

      <PopoverPrimitive.Root
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setDetail(null);
        }}
        modal={false}
      >
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            anchor={detail?.anchor ?? null}
            positionMethod="fixed"
            side="left"
            align="start"
            sideOffset={12}
            collisionPadding={16}
            className="z-50"
          >
            <PopoverPrimitive.Popup
              initialFocus={false}
              className="max-h-[80vh] w-[560px] overflow-y-auto overscroll-contain rounded-2xl bg-background p-4 shadow-lg ring-1 ring-foreground/10 outline-hidden"
            >
              {open ? <ArchetypeDetail candidate={open.candidate} note={note} /> : null}
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </section>
  );
}
```

- [ ] **Step 8: Write `src/app/taste/training/candidates-strip.tsx`**

```tsx
"use client";

// Below lg: the 44 px strip in the WSET sheet's sticky bar (`belowBar`, spec
// §3.3) — "Top match: Pauillac 91 % · 2 more close" — which opens the
// candidates sheet. It re-renders with every answer.
import { ChevronUp } from "lucide-react";
import { stripLine } from "@/lib/training/copy";
import type { RankedCandidate } from "@/lib/training/types";

export function CandidatesStrip({ ranked, onOpen }: { ranked: RankedCandidate[]; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className="mt-2 flex h-11 w-full items-center gap-2 rounded-[10px] border border-border bg-card px-3 text-left text-[13px] font-semibold text-foreground lg:hidden"
    >
      <span className="min-w-0 flex-1 truncate">{stripLine(ranked)}</span>
      <ChevronUp aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
```

- [ ] **Step 9: Write `src/app/taste/training/candidates-sheet.tsx`**

```tsx
"use client";

// Below lg: the full ranked list as the app's bottom sheet (spec §3.3, §8) —
// the tour sheet's idiom: one base-ui Dialog, rounded top, drag pill, at most
// 88dvh, the PHONE classes as max-lg: variants and a centred card from lg
// (never seen: the column takes over there). A row swaps the sheet's content
// to that candidate's profile with a back arrow — no stacked sheets. Escape
// and the backdrop close it; focus moves in on a fine pointer only (the
// Popover touch rule). The list body is the only nested scroller (§8).
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TRAINING_COPY } from "@/lib/training/copy";
import { panelView } from "@/lib/training/panel";
import type { RankedCandidate } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";
import { cn } from "@/lib/utils";
import { ArchetypeDetail } from "./archetype-detail";
import { CandidateGroups } from "./candidates-panel";

// Overrides DialogContent's centred defaults below lg (tailwind-merge keeps the
// variants beside the defaults; a variant wins where it applies). max-w needs
// `!` to beat the default `sm:max-w-sm` between sm and lg.
const PHONE =
  "flex flex-col gap-0 overflow-hidden bg-card p-0 text-foreground max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:max-h-[88dvh] max-lg:w-full max-lg:max-w-none! max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-[22px_22px_0_0] max-lg:ring-0 max-lg:data-open:zoom-in-100 max-lg:data-open:slide-in-from-bottom-8";
const CARD = "lg:max-h-[80vh] lg:w-[480px] lg:max-w-[calc(100vw-2rem)] lg:rounded-2xl";

function finePointer(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
}

export function CandidatesSheet({
  open,
  onOpenChange,
  ranked,
  note,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ranked: RankedCandidate[];
  note: WsetNoteState;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = detailId ? (ranked.find((r) => r.candidate.id === detailId) ?? null) : null;
  const view = panelView(ranked, true);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setDetailId(null);
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        initialFocus={() => finePointer()}
        finalFocus={false}
        className={cn(PHONE, CARD)}
      >
        <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 pt-3 pb-3">
          <span aria-hidden className="h-1 w-[38px] self-center rounded-full bg-border lg:hidden" />
          <div className="flex items-center gap-1">
            {detail ? (
              <button
                type="button"
                aria-label="Back"
                onClick={() => setDetailId(null)}
                className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <ArrowLeft aria-hidden className="size-5" />
              </button>
            ) : null}
            <DialogTitle className="min-w-0 font-heading text-[20px] leading-tight font-semibold">
              {detail ? detail.candidate.name : TRAINING_COPY.candidatesHeading}
            </DialogTitle>
          </div>
          {!detail && view.before ? (
            <DialogDescription className="text-[12.5px] text-muted-foreground">
              {TRAINING_COPY.beforeAnswers}
            </DialogDescription>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2 pb-[max(16px,env(safe-area-inset-bottom))]">
          {detail ? (
            <div className="px-2">
              <ArchetypeDetail candidate={detail.candidate} note={note} />
            </div>
          ) : (
            <CandidateGroups view={view} onOpen={(id) => setDetailId(id)} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 10: Write `src/app/taste/training/your-call.tsx`**

```tsx
"use client";

// "Your call" — the card under the sheet at every width (spec §3.3): which
// wine it is (the ranked candidates with their percentages, a search over
// every candidate, or "It's not in the list"), an optional vintage through the
// guess ladder's own vintage picker (years, NV, tawny ages, "Other age…"), then
// Reveal the bottle / I can't find out. Every value is React state owned by
// the room (CLAUDE.md: never an uncontrolled input).
import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/overview/eyebrow";
import { FieldPicker } from "@/app/tastings/[id]/play/field-picker";
import { vintageOptions } from "@/app/tastings/[id]/play/guess-write";
import { VINTAGE_EMPTY } from "@/app/tastings/[id]/play/ladder-copy";
import {
  VINTAGE_NV_ID,
  VINTAGE_TAWNY_OTHER_ID,
  vintageTawnyId,
  vintageYearId,
  type PickerGroup,
} from "@/app/tastings/[id]/play/ladder-types";
import {
  TRAINING_COPY,
  lineageLine,
  percentLabel,
  shortName,
  vintageGuessLabel,
} from "@/lib/training/copy";
import {
  tawnyYearsFromInput,
  vintageFromPickerId,
  vintagePickerValue,
  yourCallOptions,
} from "@/lib/training/panel";
import type { RankedCandidate, VintageGuess } from "@/lib/training/types";
import { cn } from "@/lib/utils";

const TAP = "min-h-11 md:pointer-fine:min-h-0";

function OptionRow({
  checked,
  onSelect,
  title,
  sub,
  pct,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  sub?: string;
  pct?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors",
        checked ? "border-primary bg-gold/10" : "border-border hover:bg-muted",
        TAP,
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14px] font-semibold">{title}</span>
        {sub ? <span className="truncate text-[11.5px] text-muted-foreground">{sub}</span> : null}
      </span>
      {pct ? <span className="shrink-0 text-[12.5px] font-semibold tabular-nums">{pct}</span> : null}
      <span
        aria-hidden
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full",
          checked ? "bg-primary text-primary-foreground" : "border-[1.5px] border-border",
        )}
      >
        {checked ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

export function YourCall({
  ranked,
  pickedId,
  onPick,
  vintage,
  onVintage,
  onReveal,
  onCantFindOut,
  busy,
  error,
}: {
  ranked: RankedCandidate[];
  pickedId: string | null;
  onPick: (id: string | null) => void;
  vintage: VintageGuess;
  onVintage: (v: VintageGuess) => void;
  onReveal: () => void;
  onCantFindOut: () => void;
  busy: boolean;
  error: string | null;
}) {
  // The guess ladder does the same: its picker lists years from next year down.
  const { years, tawny } = vintageOptions(new Date());
  const [query, setQuery] = useState("");
  // "It's not in the list" and "nothing picked yet" are both a null pick; this
  // flag only says which one the taster tapped.
  const [notListed, setNotListed] = useState(false);
  const [vintageOpen, setVintageOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(
    vintage?.kind === "TAWNY" && !tawny.includes(vintage.years),
  );
  const [otherText, setOtherText] = useState(
    vintage?.kind === "TAWNY" && !tawny.includes(vintage.years) ? String(vintage.years) : "",
  );
  const vintageInputRef = useRef<HTMLInputElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

  const options = yourCallOptions(ranked, query, pickedId);
  const otherYears = tawnyYearsFromInput(otherText);

  // The ladder's own groups, word for word (guess-ladder.tsx, "vintage").
  const groups: PickerGroup[] = [
    { heading: "Year", options: years.map((y) => ({ id: vintageYearId(y), name: String(y) })) },
    { heading: "Non-vintage", options: [{ id: VINTAGE_NV_ID, name: "NV", sub: "Non-vintage" }] },
    {
      heading: "Tawny",
      options: [
        ...tawny.map((n) => ({ id: vintageTawnyId(n), name: `${n} years` })),
        { id: VINTAGE_TAWNY_OTHER_ID, name: "Other age…" },
      ],
    },
  ];

  function pick(id: string | null, listed: boolean) {
    setNotListed(!listed);
    onPick(id);
  }

  function pickVintage(id: string | null) {
    const result = vintageFromPickerId(id);
    setVintageOpen(false);
    if ("otherTawny" in result) {
      setOtherOpen(true);
      // In the same tap: the phone keyboard only opens for a synchronous focus.
      otherInputRef.current?.focus();
      return;
    }
    setOtherOpen(false);
    onVintage(result.vintage);
  }

  function confirmOther() {
    if (otherYears === null) return;
    onVintage({ kind: "TAWNY", years: otherYears });
    setOtherOpen(false);
  }

  return (
    <section
      id="your-call"
      aria-labelledby="your-call-title"
      className="flex scroll-mt-[72px] flex-col gap-4 rounded-[12px] border border-border bg-card p-4 md:p-6"
    >
      <div className="flex flex-col gap-1">
        <Eyebrow size="sm">{TRAINING_COPY.yourCall}</Eyebrow>
        <h2 id="your-call-title" className="font-heading text-[22px] leading-tight font-semibold">
          {TRAINING_COPY.whichWine}
        </h2>
      </div>

      <div role="radiogroup" aria-labelledby="your-call-title" className="flex flex-col gap-1.5">
        {options.map((r) => (
          <OptionRow
            key={r.candidate.id}
            checked={pickedId === r.candidate.id}
            onSelect={() => pick(r.candidate.id, true)}
            title={shortName(r.candidate.name)}
            sub={lineageLine(r.candidate)}
            pct={r.closeness !== null ? percentLabel(r.closeness) : undefined}
          />
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={TRAINING_COPY.somethingElse}
          aria-label={TRAINING_COPY.somethingElse}
          className="min-h-11 w-full rounded-[10px] border border-border bg-card px-3 text-base text-foreground placeholder:text-muted-foreground md:text-[14px]"
        />
        <OptionRow
          checked={pickedId === null && notListed}
          onSelect={() => pick(null, false)}
          title={TRAINING_COPY.notInList}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">{TRAINING_COPY.vintageOptional}</span>
        <button
          type="button"
          onClick={() => {
            setVintageOpen(true);
            // The field picker's search input stays mounted, so this focus runs
            // inside the tap that opens it (the combobox rule).
            vintageInputRef.current?.focus();
          }}
          className={cn(
            "flex w-full items-center rounded-[10px] border border-border bg-background px-3 py-2 text-left text-[14px]",
            TAP,
            vintage === null && "text-muted-foreground",
          )}
        >
          {vintageGuessLabel(vintage) ?? VINTAGE_EMPTY}
        </button>
        {/* Collapsed rather than unmounted, so "Other age…" can focus it in the
            same tap (the ladder's own tawny input does the same). */}
        <div
          aria-hidden={!otherOpen}
          className={cn(
            "flex flex-col gap-2 rounded-[11px] border border-primary bg-card px-[13px] py-3 transition-[opacity,max-height]",
            otherOpen ? "max-h-40 opacity-100" : "pointer-events-none max-h-0 overflow-hidden border-0 px-0 py-0 opacity-0",
          )}
        >
          <span className="text-[11px] text-muted-foreground">Tawny age (years)</span>
          <div className="flex items-center gap-[10px]">
            <input
              ref={otherInputRef}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmOther();
                }
              }}
              placeholder="e.g. 25"
              tabIndex={otherOpen ? undefined : -1}
              className="min-h-11 w-24 rounded-[10px] border border-border bg-card px-3 text-[15.5px] text-foreground"
            />
            <button
              type="button"
              tabIndex={otherOpen ? undefined : -1}
              onClick={() => setOtherOpen(false)}
              className="flex min-h-11 items-center px-2 text-[13px] font-semibold text-muted-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              tabIndex={otherOpen ? undefined : -1}
              disabled={otherYears === null}
              onClick={confirmOther}
              className="ml-auto flex min-h-11 items-center justify-center rounded-[10px] bg-primary px-[16px] text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              Set age
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button className={cn(TAP, "px-4")} disabled={busy} onClick={onReveal}>
          {TRAINING_COPY.revealBottle}
        </Button>
        <Button variant="ghost" className={TAP} disabled={busy} onClick={onCantFindOut}>
          {TRAINING_COPY.cantFindOut}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}

      <FieldPicker
        open={vintageOpen}
        field="vintage"
        points={2}
        title={TRAINING_COPY.vintageOptional}
        groups={groups}
        value={vintagePickerValue(vintage, tawny)}
        onPick={pickVintage}
        onNext={() => setVintageOpen(false)}
        nextLabel={TRAINING_COPY.done}
        search="client"
        onClose={() => setVintageOpen(false)}
        inputRef={vintageInputRef}
        searchPlaceholder="Search"
      />
    </section>
  );
}
```

- [ ] **Step 11: Write `src/app/taste/training/training-room.tsx`**

```tsx
"use client";

// The training room (training-room spec §3): one client component with the
// landing and a session (Task 11 adds the result). It owns every form value as
// React state — the note the WSET sheet reports through `onChange`, the
// Bubbles/Fortified facts, the pick and the vintage — and writes the draft to
// this device on every change (D13, src/lib/training/draft.ts). The landing
// reads the draft back through useSyncExternalStore, so Continue survives a
// reload; a finish or Discard in another tab returns a session here to the
// landing (the `storage` event). Matching runs here, on the device, on every
// change (D6).
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useAddWine } from "@/components/add-wine-context";
import { Eyebrow } from "@/components/overview/eyebrow";
import { Button } from "@/components/ui/button";
import { WsetSheet } from "@/components/wset/wset-sheet";
import { TWO_TAP_WINDOW_MS, type TwoTapState } from "@/lib/console-copy";
import type { HistoryPage, TrainingTally } from "@/lib/training/action-types";
import { SAVE_REFUSED } from "@/lib/training/attempt-payload";
import { TRAINING_COPY, continueLine, sheetTitleLine, tallyLine } from "@/lib/training/copy";
import { clearDraft, newSessionKey, readDraft, writeDraft } from "@/lib/training/draft";
import { rankCandidates, snapshotRanking } from "@/lib/training/match";
import type {
  AromaLexicon,
  MatchExtras,
  RankingSnapshot,
  TrainingCandidate,
  TrainingDraft,
  VintageGuess,
} from "@/lib/training/types";
import { aromasToPayload, emptyNoteState, noteToPayload } from "@/lib/wset/note-state";
import type { AromaTerm, WineColour, WineStyle, WsetNoteState } from "@/lib/wset/types";
import { cn } from "@/lib/utils";
import { finishTrainingSession } from "./actions";
import { CandidatesPanel } from "./candidates-panel";
import { CandidatesSheet } from "./candidates-sheet";
import { CandidatesStrip } from "./candidates-strip";
import { YourCall } from "./your-call";

const TAP = "min-h-11 md:pointer-fine:min-h-0";
const UNKNOWN_WINE: { colour: WineColour | null; style: WineStyle | null } = { colour: null, style: null };

// "20:14" in the viewer's own clock. Only ever rendered client-side (a draft
// is read after hydration; a session starts with a tap).
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function scrollToCall() {
  document.getElementById("your-call")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

type View = "landing" | "session";

export function TrainingRoom({
  userId,
  candidates,
  terms,
  history,
  tally,
  coverage,
}: {
  userId: string;
  candidates: TrainingCandidate[];
  terms: AromaTerm[];
  history: HistoryPage;
  tally: TrainingTally;
  coverage: string;
}) {
  const router = useRouter();
  const { openAddWineSheet } = useAddWine();
  const [view, setView] = useState<View>("landing");
  const [session, setSession] = useState<TrainingDraft | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [armedAt, setArmedAt] = useState<number | null>(null);

  // The stored draft as a string, so the snapshot compares by value.
  const storedJson = useSyncExternalStore(
    subscribeStorage,
    () => {
      const draft = readDraft(userId);
      return draft ? JSON.stringify(draft) : null;
    },
    () => null,
  );
  const stored = useMemo<TrainingDraft | null>(
    () => (storedJson ? (JSON.parse(storedJson) as TrainingDraft) : null),
    [storedJson],
  );

  // Every change reaches the device draft (D13).
  useEffect(() => {
    if (session) writeDraft(session);
  }, [session]);

  // Another tab finished or discarded this session: back to the landing.
  useEffect(() => {
    if (view !== "session") return;
    const onStorage = () => {
      if (readDraft(userId) === null) {
        setSession(null);
        setSheetOpen(false);
        setView("landing");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [view, userId]);

  // Discard's two-tap window (console-copy's rule; the timeout disarms it).
  useEffect(() => {
    if (armedAt === null) return;
    const id = setTimeout(() => setArmedAt(null), TWO_TAP_WINDOW_MS);
    return () => clearTimeout(id);
  }, [armedAt]);
  const discardState: TwoTapState = armedAt === null ? "idle" : "armed";

  const lexicon = useMemo<AromaLexicon>(
    () => Object.fromEntries(terms.map((t) => [t.id, { term: t.term, group: t.groupName }])),
    [terms],
  );
  const note = session ? session.note : null;
  const extras = session ? session.extras : null;
  const ranked = useMemo(
    () => (note && extras ? rankCandidates(note, extras, candidates, lexicon) : []),
    [note, extras, candidates, lexicon],
  );

  // Functional updates: the sheet's onChange and a Bubbles/Fortified tap can
  // land in the same tick, and neither may overwrite the other.
  const patchSession = useCallback(
    (patch: Partial<Pick<TrainingDraft, "note" | "pickedArchetypeId" | "vintage">>) =>
      setSession((s) => (s ? { ...s, ...patch } : s)),
    [],
  );
  const patchExtras = useCallback(
    (patch: Partial<MatchExtras>) =>
      setSession((s) => (s ? { ...s, extras: { ...s.extras, ...patch } } : s)),
    [],
  );

  function start() {
    setError(null);
    setArmedAt(null);
    setSession({
      userId,
      sessionKey: newSessionKey(),
      startedAt: new Date().toISOString(),
      note: emptyNoteState(),
      extras: { bubbles: null, fortified: null },
      pickedArchetypeId: null,
      vintage: null,
    });
    setView("session");
    window.scrollTo({ top: 0 });
  }

  function continueSession() {
    if (!stored) return;
    setError(null);
    setSession(stored);
    setView("session");
    window.scrollTo({ top: 0 });
  }

  function discard() {
    if (discardState !== "armed") {
      setArmedAt(Date.now());
      return;
    }
    clearDraft(userId);
    setArmedAt(null);
  }

  // ✕ returns to the landing and KEEPS the draft (spec §3.3).
  function leave() {
    setSheetOpen(false);
    setView("landing");
  }

  async function finish(draft: TrainingDraft, snapshot: RankingSnapshot, actualCatalogWineId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await finishTrainingSession({
        sessionKey: draft.sessionKey,
        startedAt: draft.startedAt,
        note: noteToPayload(draft.note, { catalogWineId: null, contextKind: "TRAINING", tastingWineId: null }),
        aromas: aromasToPayload(draft.note),
        pickedArchetypeId: draft.pickedArchetypeId,
        vintage: draft.vintage,
        actualCatalogWineId,
        snapshot,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      clearDraft(userId);
      setSession(null);
      setSheetOpen(false);
      setView("landing");
      router.refresh();
    } catch {
      setError(SAVE_REFUSED);
    } finally {
      setBusy(false);
    }
  }

  // The add-wine sheet's reveal variant hands the pick back here; the draft and
  // ranking are taken as they stand at the tap (the sheet is modal meanwhile).
  function reveal() {
    if (!session || busy) return;
    const draft = session;
    const snapshot = snapshotRanking(ranked);
    openAddWineSheet(
      { kind: "note", reveal: true },
      {
        onNotePick: (pick) => {
          void finish(draft, snapshot, pick.catalogWineId);
        },
      },
    );
  }

  function cantFindOut() {
    if (!session || busy) return;
    void finish(session, snapshotRanking(ranked), null);
  }

  if (view === "session" && session) {
    return (
      <>
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <WsetSheet
              key={session.sessionKey}
              wine={UNKNOWN_WINE}
              title={sheetTitleLine(clock(session.startedAt))}
              terms={terms}
              initial={session.note}
              onChange={(next: WsetNoteState) => patchSession({ note: next })}
              footerAction={{ label: TRAINING_COPY.footerAction, onClick: scrollToCall }}
              belowBar={<CandidatesStrip ranked={ranked} onOpen={() => setSheetOpen(true)} />}
              aside={null}
              onClose={leave}
              bubbles={{ value: session.extras.bubbles, onChange: (v) => patchExtras({ bubbles: v }) }}
              fortified={{ value: session.extras.fortified, onChange: (v) => patchExtras({ fortified: v }) }}
            />
            <YourCall
              ranked={ranked}
              pickedId={session.pickedArchetypeId}
              onPick={(id) => patchSession({ pickedArchetypeId: id })}
              vintage={session.vintage}
              onVintage={(v: VintageGuess) => patchSession({ vintage: v })}
              onReveal={reveal}
              onCantFindOut={cantFindOut}
              busy={busy}
              error={error}
            />
          </div>
          <aside className="sticky top-[72px] hidden self-start lg:block">
            <CandidatesPanel ranked={ranked} note={session.note} />
          </aside>
        </div>
        <CandidatesSheet open={sheetOpen} onOpenChange={setSheetOpen} ranked={ranked} note={session.note} />
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Eyebrow>{TRAINING_COPY.eyebrow}</Eyebrow>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{TRAINING_COPY.title}</h1>
        <p className="text-[14.5px] leading-relaxed">{TRAINING_COPY.promise}</p>
        <p className="text-[13px] text-muted-foreground">{coverage}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {stored ? (
          <>
            <Button className={cn(TAP, "px-4")} onClick={continueSession}>
              {continueLine(clock(stored.startedAt))}
            </Button>
            <Button variant="ghost" className={TAP} onClick={discard}>
              {discardState === "armed" ? TRAINING_COPY.discardArmed : TRAINING_COPY.discard}
            </Button>
          </>
        ) : candidates.length > 0 ? (
          <Button className={cn(TAP, "px-4")} onClick={start}>
            {TRAINING_COPY.start}
          </Button>
        ) : null}
      </div>

      <section aria-labelledby="training-sessions" className="flex flex-col gap-3">
        <h2 id="training-sessions" className="font-heading text-[22px] font-semibold">
          {TRAINING_COPY.yourSessions}
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {history.rows.length === 0 ? TRAINING_COPY.noSessions : tallyLine(tally)}
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 12: Write the page `src/app/taste/training/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { coverageLine } from "@/lib/training/copy";
import {
  coverageCountries,
  readTrainingHistory,
  readTrainingPool,
  readTrainingTally,
} from "@/lib/training/pool";
import type { AromaTerm } from "@/lib/wset/types";
import { TrainingRoom } from "./training-room";

export const metadata = { title: "Training room · Blindr" };

// The training room (training-room spec §3, §8): a pillar page — the app bar,
// then one client component with the landing, a session and the result. The
// pool, the aroma lexicon, the first history page and the tally are read here,
// as the viewer; nothing about a session is on the server before its reveal.
export default async function TrainingRoomPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [candidates, termRes, history, tally] = await Promise.all([
    readTrainingPool(supabase),
    supabase
      .from("wset_aroma_terms")
      .select("id, family, origin, group_name, term, sort_order")
      .order("sort_order"),
    readTrainingHistory(supabase, user.id),
    readTrainingTally(supabase, user.id),
  ]);
  const terms: AromaTerm[] = (termRes.data ?? []).map((t) => ({
    id: t.id,
    family: t.family,
    origin: t.origin,
    groupName: t.group_name,
    term: t.term,
    sortOrder: t.sort_order,
  }));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader title="Training room" />
      <main className="flex w-full max-w-[1500px] flex-1 flex-col p-[14px] md:p-8">
        <TrainingRoom
          userId={user.id}
          candidates={candidates}
          terms={terms}
          history={history}
          tally={tally}
          coverage={coverageLine(coverageCountries(candidates), candidates.length)}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 13: Run the gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training && npx tsc --noEmit && npx eslint src/lib/training/copy.ts src/lib/training/copy.test.ts src/lib/training/panel.ts src/lib/training/panel.test.ts src/app/taste/training`
Expected: vitest PASS (all of `src/lib/training`, including panel's 9 and copy's 2 new);
`tsc` exits 0; `eslint` prints nothing. A `tsc` error naming `onChange`, `footerAction`,
`belowBar`, `aside`, `onClose`, `bubbles`, `fortified`, `answers`, `idPrefix`, `reveal` or
`onNotePick` means Task 5, 6 or 7 is incomplete — finish it there.

- [ ] **Step 14: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/training/copy.ts src/lib/training/copy.test.ts src/lib/training/panel.ts src/lib/training/panel.test.ts src/app/taste/training/page.tsx src/app/taste/training/training-room.tsx src/app/taste/training/candidates-panel.tsx src/app/taste/training/candidates-strip.tsx src/app/taste/training/candidates-sheet.tsx src/app/taste/training/archetype-detail.tsx src/app/taste/training/your-call.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): the room — landing, session, live candidates and your call" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Result, history and the notes surfaces

**Files:**
- Create: `src/lib/training/result-math.ts`
- Test: `src/lib/training/result-math.test.ts`
- Create: `src/app/taste/training/result-view.tsx`
- Create: `src/app/taste/training/history-list.tsx`
- Modify: `src/app/taste/training/training-room.tsx` (Task 10's file; exact replacements below)
- Modify: `src/app/catalog/[wineId]/your-notes.tsx` (lines 1–7 imports, lines 50–54 badge)
- Modify: `src/app/taste/notes/notes-search.ts` (lines 7, 41–66, 73–85)
- Modify: `src/app/taste/notes/notes-search.test.ts` (lines 5–24 import, 34–49 helper, new tests)
- Modify: `src/app/taste/notes/notes-data.ts` (lines 172–179 title, 188–206 row)
- Modify: `src/app/taste/notes/notes-list.tsx` (imports, `NoteRowView`, the list's `NoteRowView` call)
- Modify: `src/components/wset/note-modal.tsx` (imports, the `title:` line)

**Interfaces:**
- Consumes: Task 2 — `TRAINING_COPY`, `attemptRowLine`, `hueClearedLine`, `itWasLine`,
  `percentLabel`, `resultTotalLine`, `shortName`, `styleVerdictLine`, `youSaidLine`, the
  types. Task 7 — `openAddWineSheet({ kind: "note", reveal: true }, { onNotePick })`.
  Task 9 — `revealTrainingAttempt`, `loadMoreTrainingHistory`, `loadTrainingAttempt`,
  `SAVE_REFUSED`, `HistoryPage`, `TrainingAttemptDetail`. Task 10 — `TrainingRoom`'s
  anchors.
- Produces: `result-math.ts` exports `POINT_ORDER`, `VerdictRow`, `verdictRows`,
  `POINTED_LIMIT`, `pointedTopFive`, `StyleVerdict`, `styleVerdictInput`,
  `mergeHistoryRows`; `ResultView({ detail, onAnotherGlass, onDone })`;
  `HistoryList({ initial, onRevealed })`; `NoteArchiveRow.contextKind`,
  `archiveRowHref`, `TRAINING_ROOM_HREF` in notes-search.

- [ ] **Step 1: Write the failing test `src/lib/training/result-math.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { POINT_ORDER, mergeHistoryRows, pointedTopFive, styleVerdictInput, verdictRows } from "./result-math";
import type { AttemptRow, RankingSnapshot } from "./types";

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
    expect(rows.map((r) => r.category)).toEqual([...POINT_ORDER]);
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

describe("mergeHistoryRows", () => {
  it("drops repeats and keeps newest first, id breaking ties", () => {
    const merged = mergeHistoryRows(
      [row("c", "2026-09-24T18:00:00+00:00"), row("b", "2026-09-23T18:00:00+00:00")],
      [row("b", "2026-09-23T18:00:00+00:00"), row("a", "2026-09-23T18:00:00+00:00")],
    );
    expect(merged.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/result-math.test.ts`
Expected: FAIL — `Failed to resolve import "./result-math"`.

- [ ] **Step 3: Write `src/lib/training/result-math.ts`**

```ts
// View rules for the training room's result and history (training-room spec
// §3.5, §3.6): the seven verdict rows, the top five of the frozen ranking,
// where the real wine's style stood in it, and the history list's merge of
// its first page with the pages Show more fetched. Pure, relative imports only.
import { TRAINING_COPY } from "./copy";
import type { AttemptRow, CapReason, PointCategory, RankingSnapshot } from "./types";

/** The verdict table's rows, always all seven (spec §3.5). */
export const POINT_ORDER: readonly PointCategory[] = [
  "country",
  "region",
  "appellation",
  "primaryGrape",
  "secondaryGrape",
  "typeDesignation",
  "vintage",
];

export type VerdictRow = { category: PointCategory; label: string; mark: string; points: number | null };

/** ✓ for points, ✗ for zero, — when the category did not apply (null). */
export function verdictRows(points: Record<PointCategory, number | null>): VerdictRow[] {
  return POINT_ORDER.map((category) => {
    const p = points[category];
    return {
      category,
      label: TRAINING_COPY.rowLabels[category],
      mark: p === null ? TRAINING_COPY.markNone : p > 0 ? TRAINING_COPY.markRight : TRAINING_COPY.markWrong,
      points: p,
    };
  });
}

/** "Where your note pointed" shows this many. */
export const POINTED_LIMIT = 5;

export function pointedTopFive(snapshot: RankingSnapshot): RankingSnapshot {
  return [...snapshot].sort((a, b) => a.rank - b.rank).slice(0, POINTED_LIMIT);
}

export type StyleVerdict = { rank: number; n: number; pct: number | null; capped: CapReason | null };

/** Where the real wine's own archetype (D17) stood in the full ranking; null when
    there is none or the ranking never had it ("This style isn't in the pool yet"). */
export function styleVerdictInput(
  snapshot: RankingSnapshot,
  actualArchetypeId: string | null,
): StyleVerdict | null {
  if (!actualArchetypeId) return null;
  const hit = snapshot.find((e) => e.archetypeId === actualArchetypeId);
  return hit ? { rank: hit.rank, n: snapshot.length, pct: hit.closeness, capped: hit.capped } : null;
}

/** The server's first page plus the Show more pages, once each, newest first. */
export function mergeHistoryRows(first: readonly AttemptRow[], more: readonly AttemptRow[]): AttemptRow[] {
  const byId = new Map<string, AttemptRow>();
  for (const r of [...first, ...more]) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0,
  );
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training/result-math.test.ts`
Expected: PASS — 4 tests in 1 file.

- [ ] **Step 5: Write `src/app/taste/training/result-view.tsx`**

```tsx
"use client";

// The result (training-room spec §3.5): the real wine beside what you said,
// the seven-row verdict with ✓ / ✗ / —, "{n} of {m}", the hue line when the
// RPC cleared a colour call, and "Where your note pointed" — the top five of
// the frozen ranking with the real wine's style highlighted and where it
// stood. Without a reveal: "Not revealed — your note is kept…".
import { useState } from "react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { Button } from "@/components/ui/button";
import { NoteModal } from "@/components/wset/note-modal";
import type { TrainingAttemptDetail } from "@/lib/training/action-types";
import {
  TRAINING_COPY,
  hueClearedLine,
  itWasLine,
  percentLabel,
  resultTotalLine,
  shortName,
  styleVerdictLine,
  youSaidLine,
} from "@/lib/training/copy";
import { pointedTopFive, styleVerdictInput, verdictRows } from "@/lib/training/result-math";
import { LABELS } from "@/lib/wset/vocab";
import { cn } from "@/lib/utils";

const TAP = "min-h-11 md:pointer-fine:min-h-0";

export function ResultView({
  detail,
  onAnotherGlass,
  onDone,
}: {
  detail: TrainingAttemptDetail;
  onAnotherGlass: () => void;
  onDone: () => void;
}) {
  const { row, noteId, wineColour } = detail;
  const [noteOpen, setNoteOpen] = useState(false);
  const said = row.picked ? youSaidLine(row.picked.name, row.vintage) : TRAINING_COPY.youDidntPick;

  if (row.actual === null) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <Eyebrow>{TRAINING_COPY.eyebrow}</Eyebrow>
        <h1 className="font-heading text-[26px] leading-tight font-semibold">{said}</h1>
        <p className="text-[14px] text-muted-foreground">{TRAINING_COPY.notRevealed}</p>
        <div className="flex flex-wrap gap-3">
          <Button className={cn(TAP, "px-4")} onClick={onAnotherGlass}>
            {TRAINING_COPY.anotherGlass}
          </Button>
          <Button variant="ghost" className={TAP} onClick={onDone}>
            {TRAINING_COPY.done}
          </Button>
        </div>
      </div>
    );
  }

  const actual = row.actual;
  const rows = verdictRows(row.points);
  const top = pointedTopFive(row.snapshot);
  const actualArchetypeId = row.actualArchetype?.id ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
      <Eyebrow>{TRAINING_COPY.eyebrow}</Eyebrow>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="rounded-[12px] border border-border bg-card p-4">
          <h1 className="font-heading text-[22px] leading-tight font-semibold">
            {itWasLine(actual.label ?? TRAINING_COPY.unreadableWine)}
          </h1>
          {actual.lineage ? (
            <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{actual.lineage}</p>
          ) : null}
        </section>
        <section className="flex items-center rounded-[12px] border border-border bg-background p-4">
          <p className="text-[15px] font-semibold">{said}</p>
        </section>
      </div>

      <table className="w-full text-[14px]">
        <tbody>
          {rows.map((v) => (
            <tr key={v.category} className="border-b border-border-light last:border-b-0">
              <th scope="row" className="py-2 text-left font-normal text-muted-foreground">
                {v.label}
              </th>
              <td className="w-8 py-2 text-center font-semibold">{v.mark}</td>
              <td className="w-10 py-2 text-right font-semibold tabular-nums">{v.points ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {row.total !== null && row.possible !== null ? (
        <p className="font-heading text-[26px] leading-none font-semibold text-primary tabular-nums">
          {resultTotalLine(row.total, row.possible)}
        </p>
      ) : null}

      {row.hueCleared && row.noteColourHue && wineColour ? (
        <p className="text-[13px] text-muted-foreground">
          {hueClearedLine(LABELS[row.noteColourHue] ?? row.noteColourHue, wineColour)}
        </p>
      ) : null}

      <section aria-labelledby="training-pointed" className="flex flex-col gap-2">
        <h2 id="training-pointed" className="font-heading text-[19px] font-semibold">
          {TRAINING_COPY.wherePointed}
        </h2>
        <ol className="flex flex-col">
          {top.map((e) => (
            <li
              key={e.archetypeId}
              className={cn(
                "flex items-center gap-3 rounded-[8px] px-2 py-1.5 text-[13.5px]",
                e.archetypeId === actualArchetypeId && "bg-gold/15 font-semibold",
              )}
            >
              <span className="w-6 text-muted-foreground tabular-nums">{e.rank}</span>
              <span className="min-w-0 flex-1 truncate">{shortName(e.name)}</span>
              {e.closeness !== null ? <span className="tabular-nums">{percentLabel(e.closeness)}</span> : null}
            </li>
          ))}
        </ol>
        <p className="text-[13px] text-muted-foreground">
          {styleVerdictLine(styleVerdictInput(row.snapshot, actualArchetypeId))}
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button className={cn(TAP, "px-4")} onClick={onAnotherGlass}>
          {TRAINING_COPY.anotherGlass}
        </Button>
        <Button variant="outline" className={TAP} onClick={() => setNoteOpen(true)}>
          {TRAINING_COPY.seeNote}
        </Button>
        <Button variant="ghost" className={TAP} onClick={onDone}>
          {TRAINING_COPY.done}
        </Button>
      </div>

      {noteOpen ? (
        <NoteModal noteId={noteId} wineId={actual.catalogWineId} onClose={() => setNoteOpen(false)} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Write `src/app/taste/training/history-list.tsx`**

```tsx
"use client";

// "Your sessions" (training-room spec §3.6): one line per attempt, newest
// first, twenty at a time with Show more (a (created_at, id) cursor), and
// Reveal now on an unrevealed attempt — the add-wine sheet's reveal variant,
// whose pick runs revealTrainingAttempt and opens the result. The parent keys
// this list on its first row, so a refreshed first page starts it afresh.
import { useState } from "react";
import { useAddWine } from "@/components/add-wine-context";
import { Button } from "@/components/ui/button";
import type { HistoryPage, TrainingAttemptDetail } from "@/lib/training/action-types";
import { SAVE_REFUSED } from "@/lib/training/attempt-payload";
import { TRAINING_COPY, attemptRowLine } from "@/lib/training/copy";
import { mergeHistoryRows } from "@/lib/training/result-math";
import type { AttemptRow } from "@/lib/training/types";
import { cn } from "@/lib/utils";
import { loadMoreTrainingHistory, loadTrainingAttempt, revealTrainingAttempt } from "./actions";

const TAP = "min-h-11 md:pointer-fine:min-h-0";

export function HistoryList({
  initial,
  onRevealed,
}: {
  initial: HistoryPage;
  onRevealed: (detail: TrainingAttemptDetail | null) => void;
}) {
  const { openAddWineSheet } = useAddWine();
  const [more, setMore] = useState<AttemptRow[]>([]);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = mergeHistoryRows(initial.rows, more);

  async function showMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const page = await loadMoreTrainingHistory(cursor);
      setMore((m) => [...m, ...page.rows]);
      setCursor(page.nextCursor);
    } catch (e) {
      // The button stays; the next tap tries the same page again.
      console.error("Training room: Show more failed", e instanceof Error ? e.message : typeof e);
    } finally {
      setLoading(false);
    }
  }

  async function revealPick(row: AttemptRow, catalogWineId: string) {
    setRevealing(row.id);
    setError(null);
    try {
      const res = await revealTrainingAttempt(row.id, catalogWineId);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      onRevealed(await loadTrainingAttempt(row.id));
    } catch {
      setError(SAVE_REFUSED);
    } finally {
      setRevealing(null);
    }
  }

  function revealNow(row: AttemptRow) {
    if (revealing) return;
    openAddWineSheet(
      { kind: "note", reveal: true },
      {
        onNotePick: (pick) => {
          void revealPick(row, pick.catalogWineId);
        },
      },
    );
  }

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <ul className="overflow-hidden rounded-[12px] border border-border-strong bg-card">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-center gap-3 border-b border-border-light px-4 py-2.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1 text-[13px] leading-snug">{attemptRowLine(row)}</span>
            {row.actual === null ? (
              <Button
                variant="outline"
                className={cn(TAP, "shrink-0")}
                disabled={revealing !== null}
                onClick={() => revealNow(row)}
              >
                {TRAINING_COPY.revealNow}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {cursor ? (
        <Button variant="outline" className={cn(TAP, "w-full")} disabled={loading} onClick={() => void showMore()}>
          {TRAINING_COPY.showMore}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: Mount the result and the history in `src/app/taste/training/training-room.tsx`**

Apply these six exact replacements (each old string occurs once in Task 10's file).

(a) Imports. Replace
```tsx
import type { HistoryPage, TrainingTally } from "@/lib/training/action-types";
```
with
```tsx
import type { HistoryPage, TrainingAttemptDetail, TrainingTally } from "@/lib/training/action-types";
```
and replace
```tsx
import { finishTrainingSession } from "./actions";
import { CandidatesPanel } from "./candidates-panel";
```
with
```tsx
import { finishTrainingSession, loadTrainingAttempt } from "./actions";
import { CandidatesPanel } from "./candidates-panel";
import { HistoryList } from "./history-list";
import { ResultView } from "./result-view";
```

(b) The view type. Replace
```tsx
type View = "landing" | "session";
```
with
```tsx
type View = "landing" | "session" | "result";
```

(c) The result state. Replace
```tsx
  const [armedAt, setArmedAt] = useState<number | null>(null);
```
with
```tsx
  const [armedAt, setArmedAt] = useState<number | null>(null);
  const [result, setResult] = useState<TrainingAttemptDetail | null>(null);
```

(d) `start` clears an old result, and a shared `showResult`. Replace
```tsx
  function start() {
    setError(null);
    setArmedAt(null);
```
with
```tsx
  // After a finish or a Reveal now: the stored attempt as the result (§3.5); a
  // failed read falls back to the landing, where history shows the attempt.
  function showResult(detail: TrainingAttemptDetail | null) {
    setResult(detail);
    setView(detail ? "result" : "landing");
    window.scrollTo({ top: 0 });
    router.refresh();
  }

  function start() {
    setError(null);
    setArmedAt(null);
    setResult(null);
```

(e) `finish` opens the result. Replace
```tsx
      clearDraft(userId);
      setSession(null);
      setSheetOpen(false);
      setView("landing");
      router.refresh();
```
with
```tsx
      const detail = await loadTrainingAttempt(res.attemptId);
      clearDraft(userId);
      setSession(null);
      setSheetOpen(false);
      showResult(detail);
```

(f) Render the result, and the history on the landing. Replace
```tsx
  if (view === "session" && session) {
```
with
```tsx
  if (view === "result" && result) {
    return (
      <ResultView
        detail={result}
        onAnotherGlass={start}
        onDone={() => {
          setResult(null);
          setView("landing");
        }}
      />
    );
  }

  if (view === "session" && session) {
```
and replace
```tsx
        <p className="text-[13px] text-muted-foreground">
          {history.rows.length === 0 ? TRAINING_COPY.noSessions : tallyLine(tally)}
        </p>
      </section>
```
with
```tsx
        <p className="text-[13px] text-muted-foreground">
          {history.rows.length === 0 ? TRAINING_COPY.noSessions : tallyLine(tally)}
        </p>
        <HistoryList key={history.rows[0]?.id ?? "empty"} initial={history} onRevealed={showResult} />
      </section>
```

- [ ] **Step 8: Badge a training note in `src/app/catalog/[wineId]/your-notes.tsx`**

Replace
```tsx
import { dayMonthYear } from "@/lib/cellar/format";
```
with
```tsx
import { dayMonthYear } from "@/lib/cellar/format";
import { TRAINING_COPY } from "@/lib/training/copy";
```
and replace
```tsx
                {n.contextKind === "BLIND" ? (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    Blind
                  </Badge>
                ) : null}
```
with
```tsx
                {n.contextKind === "BLIND" ? (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    Blind
                  </Badge>
                ) : null}
                {n.contextKind === "TRAINING" ? (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    {TRAINING_COPY.badge}
                  </Badge>
                ) : null}
```

- [ ] **Step 9: Write the failing notes-search tests**

In `src/app/taste/notes/notes-search.test.ts`, add `archiveRowHref,` to the
`import { … } from "./notes-search";` list (after `archiveRowTitle,`), and in the `row()`
helper replace
```ts
    tastingWineId: null,
    tastingName: null,
```
with
```ts
    tastingWineId: null,
    tastingName: null,
    contextKind: "OPEN",
```
Then append:

```ts
describe("training notes (training room)", () => {
  it("titles an unrevealed training note and links it to the room", () => {
    expect(
      archiveRowTitle({ wineTitle: null, tastingName: null, glassNumber: null, unrevealedTraining: true }, t),
    ).toBe("Training room · not revealed");
    expect(archiveRowHref(row({ contextKind: "TRAINING", catalogWineId: null }))).toBe("/taste/training");
  });

  it("leaves every other note's title and link alone", () => {
    expect(
      archiveRowTitle({ wineTitle: "Wine", tastingName: null, glassNumber: null, unrevealedTraining: false }, t),
    ).toBe("Wine");
    expect(archiveRowHref(row({ contextKind: "TRAINING", catalogWineId: "w1" }))).toBeNull();
    expect(archiveRowHref(row({ contextKind: "OPEN", catalogWineId: null }))).toBeNull();
  });
});
```

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/app/taste/notes/notes-search.test.ts`
Expected: FAIL — `archiveRowHref is not a function` (and a type complaint about
`contextKind`/`unrevealedTraining` is not reported by vitest; tsc catches it in Step 13).

- [ ] **Step 10: Teach `src/app/taste/notes/notes-search.ts` about training notes**

Replace
```ts
import { makeT, translateTerm, type WsetLang } from "../../../lib/wset/i18n";
```
with
```ts
import { TRAINING_COPY } from "../../../lib/training/copy";
import { makeT, translateTerm, type WsetLang } from "../../../lib/wset/i18n";
```

In `NoteArchiveRow`, replace
```ts
  /** That tasting's name, when the author can still read it. */
  tastingName: string | null;
```
with
```ts
  /** That tasting's name, when the author can still read it. */
  tastingName: string | null;
  /** wset_notes.context_kind: TRAINING rows carry the "Training" chip. */
  contextKind: "OPEN" | "BLIND" | "TRAINING";
```

Replace
```ts
export function archiveRowTitle(
  input: { wineTitle: string | null; tastingName: string | null; glassNumber: number | null },
  t: NotesT,
): string {
  if (input.wineTitle) return input.wineTitle;
```
with
```ts
export function archiveRowTitle(
  input: {
    wineTitle: string | null;
    tastingName: string | null;
    glassNumber: number | null;
    /** A training-room note whose bottle was never revealed (no identity). */
    unrevealedTraining?: boolean;
  },
  t: NotesT,
): string {
  if (input.unrevealedTraining) return TRAINING_COPY.notRevealedRow;
  if (input.wineTitle) return input.wineTitle;
```

and add, directly after the `archiveRowTitle` function:

```ts
/** Where an unrevealed training note's row goes: back to the room, whose
    history offers Reveal now (training-room spec §3.6). */
export const TRAINING_ROOM_HREF = "/taste/training";

/** A row that links somewhere instead of opening the note view; null for every
    note with a wine to open. */
export function archiveRowHref(row: Pick<NoteArchiveRow, "contextKind" | "catalogWineId">): string | null {
  return row.contextKind === "TRAINING" && row.catalogWineId === null ? TRAINING_ROOM_HREF : null;
}
```

- [ ] **Step 11: Fill the new fields in `src/app/taste/notes/notes-data.ts`**

Replace
```ts
      {
        wineTitle: wineTitles[i],
        tastingName,
        glassNumber: glass ? (glassNo.get(glass.id) ?? null) : null,
      },
```
with
```ts
      {
        wineTitle: wineTitles[i],
        tastingName,
        glassNumber: glass ? (glassNo.get(glass.id) ?? null) : null,
        unrevealedTraining: note.context_kind === "TRAINING" && note.catalog_wine_id === null,
      },
```
and replace
```ts
      tastingWineId: note.tasting_wine_id,
      tastingName,
```
with
```ts
      tastingWineId: note.tasting_wine_id,
      tastingName,
      contextKind: note.context_kind,
```

- [ ] **Step 12: Render the chip and the link in `src/app/taste/notes/notes-list.tsx`**

Replace
```tsx
import { useMemo, useState } from "react";
```
with
```tsx
import Link from "next/link";
import { useMemo, useState } from "react";
```
and replace
```tsx
import { NotesFilterChips, NotesSearchField } from "./notes-filters";
import {
  NOTES_LANG,
```
with
```tsx
import { TRAINING_COPY } from "@/lib/training/copy";
import { NotesFilterChips, NotesSearchField } from "./notes-filters";
import {
  NOTES_LANG,
  archiveRowHref,
```

Replace the `NoteRowView` signature
```tsx
function NoteRowView({ row, onOpen }: { row: NoteArchiveRow; onOpen: (() => void) | null }) {
```
with
```tsx
function NoteRowView({
  row,
  onOpen,
  href,
}: {
  row: NoteArchiveRow;
  onOpen: (() => void) | null;
  /** A link instead of the note view: an unrevealed training note goes back to the room. */
  href: string | null;
}) {
```

Replace
```tsx
          <span className="shrink-0">{dayLabel(row.tastedOn, NOTES_LANG)}</span>
```
with
```tsx
          <span className="shrink-0">{dayLabel(row.tastedOn, NOTES_LANG)}</span>
          {row.contextKind === "TRAINING" ? (
            <span className="shrink-0 rounded-full border border-border bg-background px-2 py-px text-[10.5px]">
              {TRAINING_COPY.badge}
            </span>
          ) : null}
```

Replace
```tsx
        className={cn("w-2 text-[15px] leading-none text-placeholder", !onOpen && "invisible")}
```
with
```tsx
        className={cn("w-2 text-[15px] leading-none text-placeholder", !onOpen && !href && "invisible")}
```

Replace
```tsx
  return onOpen ? (
    <button
```
with
```tsx
  if (href) {
    return (
      <Link
        href={href}
        aria-describedby={describedBy}
        className={cn(
          rowClass,
          "transition-colors hover:bg-background focus-visible:bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {inner}
      </Link>
    );
  }
  return onOpen ? (
    <button
```

And in `NotesList`, replace
```tsx
                  <NoteRowView
                    row={row}
                    onOpen={
```
with
```tsx
                  <NoteRowView
                    row={row}
                    href={archiveRowHref(row)}
                    onOpen={
```

- [ ] **Step 13: Badge the note modal's title in `src/components/wset/note-modal.tsx`**

Replace
```tsx
import { noteStateFromRow } from "@/lib/wset/note-state";
```
with
```tsx
import { noteStateFromRow } from "@/lib/wset/note-state";
import { TRAINING_COPY } from "@/lib/training/copy";
```
and replace
```tsx
        title: catalogWineTitle(wine),
```
with
```tsx
        // A training note carries its badge in the sheet's title (D16).
        title:
          noteRes.data.context_kind === "TRAINING"
            ? `${catalogWineTitle(wine)} · ${TRAINING_COPY.badge}`
            : catalogWineTitle(wine),
```

- [ ] **Step 14: Run the gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/lib/training src/app/taste/notes && npx tsc --noEmit && npx eslint src/lib/training/result-math.ts src/lib/training/result-math.test.ts src/app/taste/training "src/app/catalog/[wineId]/your-notes.tsx" src/app/taste/notes src/components/wset/note-modal.tsx`
Expected: vitest PASS (result-math's 4, notes-search's 2 new, everything else unchanged);
`tsc` exits 0; `eslint` prints nothing.

- [ ] **Step 15: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/lib/training/result-math.ts src/lib/training/result-math.test.ts src/app/taste/training/result-view.tsx src/app/taste/training/history-list.tsx src/app/taste/training/training-room.tsx "src/app/catalog/[wineId]/your-notes.tsx" src/app/taste/notes/notes-search.ts src/app/taste/notes/notes-search.test.ts src/app/taste/notes/notes-data.ts src/app/taste/notes/notes-list.tsx src/components/wset/note-modal.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): result, history with Reveal now, Training badges on notes" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Admin archetype editor

**Files:**
- Create: `src/app/admin/archetypes/profile-rules.ts`
- Test: `src/app/admin/archetypes/profile-rules.test.ts`
- Modify: `src/app/admin/archetypes/actions.ts` (imports lines 1–6; replace lines 71–121:
  `ArchetypeProfileInput` and `updateArchetype`)
- Modify (full replacement): `src/app/admin/archetypes/archetype-editor.tsx`
- Modify: `src/app/admin/archetypes/placement-editor.tsx` (lines 5–13 imports, 121–127
  props, 202 editor call)
- Modify (full replacement): `src/app/admin/archetypes/page.tsx`

**Interfaces:**
- Consumes: Task 1 — the new `wine_archetypes` columns, nullable `wine_place_id`,
  `wine_archetype_aromas.signature`, `wine_archetype_designations` (curator write RLS).
  Task 2 — `TrainingCandidate` (test fixture). Task 3 —
  `ladderFor(scale: string, candidate: TrainingCandidate): string[] | null` (the test pins
  the editor's ladders to it). Existing: `ReferenceCombobox`, `SearchableCombobox`,
  `TypeDesignationField`, `listAppellationsForRegions`, `loadByHandReferences`,
  `justTheRegionOption`, `foldName`, `searchPlaces`, `requireContributor`,
  `isContributor`.
- Produces: `profile-rules.ts` exports `AromaLink`, `ArchetypeProfile`,
  `ArchetypeProfileInput`, `EditorReferences`, `AppellationOption`, `ScaleSpec`,
  `scalesFor`, `rangeFits`, `validateProfile`, `JUST_THE_REGION`, `appellationOptions`,
  `APPELLATION_RESULTS_MAX`, `filterAppellationOptions`, `withTermIds`,
  `toggleSignature`, `aromaRows`, `designationRows`; `updateArchetype(archetypeId, input: ArchetypeProfileInput)`.

- [ ] **Step 1: Write the failing test `src/app/admin/archetypes/profile-rules.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { ladderFor } from "../../../lib/training/match";
import type { TrainingCandidate } from "../../../lib/training/types";
import type { WineColour, WineStyle } from "../../../lib/wset/types";
import {
  aromaRows,
  appellationOptions,
  designationRows,
  filterAppellationOptions,
  rangeFits,
  scalesFor,
  toggleSignature,
  validateProfile,
  withTermIds,
  type ArchetypeProfileInput,
} from "./profile-rules";

const COUNTRY = "00000000-0000-4000-8000-000000000c01";
const REGION = "00000000-0000-4000-8000-000000000c02";
const APPELLATION = "00000000-0000-4000-8000-000000000c03";
const ARCH = "00000000-0000-4000-8000-000000000c05";
const AGE = "Typical age takes two whole numbers of years, low to high.";

function candidate(colour: WineColour, style: WineStyle): TrainingCandidate {
  return {
    id: "a",
    name: "A typical test",
    description: null,
    colour,
    style,
    country: { id: "c", name: "France" },
    region: { id: "r", name: "Bordeaux" },
    appellation: { id: "p", name: "Pauillac AOC", isRegional: false },
    primaryGrape: { id: "g", name: "Cabernet Sauvignon" },
    secondaryGrape: null,
    designations: [],
    typicalAge: null,
    sat: {},
    aromas: [],
    placeCanonicalKey: null,
    qualityLow: null,
    qualityHigh: null,
  };
}

function profile(overrides: Partial<ArchetypeProfileInput> = {}): ArchetypeProfileInput {
  return {
    name: "A typical Pauillac",
    colour: "RED",
    style: "STILL",
    description: null,
    qualityLow: 88,
    qualityHigh: 96,
    sat: {
      tannin: ["MEDIUM_PLUS", "HIGH"],
      appearanceIntensity: ["MEDIUM_PLUS", "DEEP"],
      clarity: ["CLEAR", "CLEAR"],
    },
    nose: [{ termId: "t1", signature: true }],
    palate: [],
    countryId: COUNTRY,
    regionId: REGION,
    appellationId: APPELLATION,
    designationIds: [],
    typicalAgeLow: 8,
    typicalAgeHigh: 25,
    winePlaceId: null,
    ...overrides,
  };
}

function scale(key: string, colour: WineColour = "RED", style: WineStyle = "STILL") {
  const found = scalesFor(colour, style).find((s) => s.key === key);
  if (!found) throw new Error(`no scale ${key}`);
  return found;
}

describe("scalesFor", () => {
  it("edits eleven scales, twelve with mousse on sparkling", () => {
    expect(scalesFor("RED", "STILL").map((s) => s.key)).toEqual([
      "appearanceIntensity",
      "colourHue",
      "noseIntensity",
      "development",
      "sweetness",
      "acidity",
      "tannin",
      "alcohol",
      "body",
      "flavourIntensity",
      "finish",
    ]);
    const sparkling = scalesFor("WHITE", "SPARKLING");
    expect(sparkling).toHaveLength(12);
    expect(sparkling[11].key).toBe("mousse");
  });

  it("uses the matcher's own ladders (still red and still white)", () => {
    for (const [colour, style] of [
      ["RED", "STILL"],
      ["WHITE", "STILL"],
    ] as const) {
      for (const s of scalesFor(colour, style)) {
        expect(ladderFor(s.key, candidate(colour, style))).toEqual([...s.ladder]);
      }
    }
  });

  it("uses the matcher's mousse ladder on sparkling", () => {
    expect(ladderFor("mousse", candidate("WHITE", "SPARKLING"))).toEqual([
      ...scale("mousse", "WHITE", "SPARKLING").ladder,
    ]);
  });
});

describe("rangeFits", () => {
  it("needs a range on its ladder, low to high, that the slider can reach", () => {
    expect(rangeFits(scale("appearanceIntensity"), ["MEDIUM_PLUS", "DEEP"])).toBe(true);
    expect(rangeFits(scale("appearanceIntensity"), ["MEDIUM_MINUS", "MEDIUM_MINUS"])).toBe(false);
    expect(rangeFits(scale("sweetness"), ["MEDIUM", "MEDIUM"])).toBe(false);
    expect(rangeFits(scale("sweetness"), ["MEDIUM", "SWEET"])).toBe(true);
    expect(rangeFits(scale("alcohol"), ["MEDIUM_PLUS", "HIGH"])).toBe(false);
    expect(rangeFits(scale("alcohol", "RED", "FORTIFIED"), ["MEDIUM_PLUS", "HIGH"])).toBe(true);
    expect(rangeFits(scale("colourHue", "WHITE"), ["RUBY", "RUBY"])).toBe(false);
    expect(rangeFits(scale("colourHue", "WHITE"), ["LEMON", "GOLD"])).toBe(true);
    expect(rangeFits(scale("tannin"), ["HIGH", "LOW"])).toBe(false);
  });
});

describe("validateProfile", () => {
  it("accepts a complete profile, with or without a quality range", () => {
    expect(validateProfile(profile())).toBeNull();
    expect(validateProfile(profile({ qualityLow: null, qualityHigh: null }))).toBeNull();
    expect(validateProfile(profile({ typicalAgeLow: null, typicalAgeHigh: null }))).toBeNull();
  });

  it("names the first thing that is wrong", () => {
    expect(validateProfile(profile({ name: "  " }))).toBe("Give it a name.");
    expect(validateProfile(profile({ appellationId: "" }))).toBe("Pick a country, region and appellation.");
    expect(validateProfile(profile({ qualityLow: 40 }))).toBe("Quality runs from 50 to 100, low to high.");
    expect(validateProfile(profile({ typicalAgeLow: 5, typicalAgeHigh: null }))).toBe(AGE);
    expect(validateProfile(profile({ typicalAgeLow: 12, typicalAgeHigh: 5 }))).toBe(AGE);
    expect(validateProfile(profile({ sat: { sweetness: ["MEDIUM", "MEDIUM"] } }))).toBe(
      "Sweetness: pick a range on its own scale.",
    );
    expect(validateProfile(profile({ winePlaceId: "x" }))).toBe("That map place is not valid.");
  });

  it("leaves keys it does not edit alone", () => {
    expect(
      validateProfile(profile({ sat: { clarity: ["HAZY", "CLEAR"], mousse: ["AGGRESSIVE", "DELICATE"] } })),
    ).toBeNull();
    expect(
      validateProfile(
        profile({ colour: "WHITE", style: "SPARKLING", sat: { mousse: ["AGGRESSIVE", "DELICATE"] } }),
      ),
    ).toBe("Mousse: pick a range on its own scale.");
  });
});

describe("appellation options", () => {
  const list = [
    { id: "a1", name: "Bourgogne Aligoté AOC" },
    { id: "a2", name: "Bourgogne AOC" },
    { id: "a3", name: "Chablis AOC" },
  ];

  it("offers the region's own appellation first, as Just the region", () => {
    expect(appellationOptions("Bourgogne", list)).toEqual([
      { id: "a2", name: "Just the region · Bourgogne AOC", matchName: "Bourgogne AOC" },
      { id: "a1", name: "Bourgogne Aligoté AOC" },
      { id: "a3", name: "Chablis AOC" },
    ]);
    expect(appellationOptions("Loire", list)[0]).toEqual({ id: "a1", name: "Bourgogne Aligoté AOC" });
  });

  it("filters by the label or the stored name, accents folded", () => {
    const options = appellationOptions("Bourgogne", list);
    expect(filterAppellationOptions(options, "aligote").map((o) => o.id)).toEqual(["a1"]);
    expect(filterAppellationOptions(options, "just").map((o) => o.id)).toEqual(["a2"]);
    expect(filterAppellationOptions(options, "")).toHaveLength(3);
  });
});

describe("aroma and designation rows", () => {
  it("keeps signatures across a re-pick and toggles one", () => {
    const links = [
      { termId: "t1", signature: true },
      { termId: "t2", signature: false },
    ];
    expect(withTermIds(links, ["t2", "t3"])).toEqual([
      { termId: "t2", signature: false },
      { termId: "t3", signature: false },
    ]);
    expect(toggleSignature(links, "t2")).toEqual([
      { termId: "t1", signature: true },
      { termId: "t2", signature: true },
    ]);
  });

  it("writes one row per term and kind, and one per designation", () => {
    expect(
      aromaRows(
        ARCH,
        [
          { termId: "t1", signature: true },
          { termId: "t1", signature: false },
        ],
        [{ termId: "t1", signature: false }],
      ),
    ).toEqual([
      { archetype_id: ARCH, term_id: "t1", kind: "NOSE", signature: true },
      { archetype_id: ARCH, term_id: "t1", kind: "PALATE", signature: false },
    ]);
    expect(designationRows(ARCH, ["d1", "d2", "d1"])).toEqual([
      { archetype_id: ARCH, type_designation_id: "d1" },
      { archetype_id: ARCH, type_designation_id: "d2" },
    ]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/app/admin/archetypes/profile-rules.test.ts`
Expected: FAIL — `Failed to resolve import "./profile-rules"`.

- [ ] **Step 3: Write `src/app/admin/archetypes/profile-rules.ts`**

```ts
// Pure rules for the /admin/archetypes profile editor (training-room spec §4.4,
// §4.5, D21): which scales a profile edits, the ladder each range must lie on,
// the checks the editor runs before saving and updateArchetype runs again on
// the server, the appellation list with "Just the region", and the aroma and
// designation rows a save writes. Relative runtime imports only, so vitest
// loads it; the ladders are pinned to the matcher's ladderFor by the test.
import { justTheRegionOption } from "../../../components/add-wine/self-named-appellation";
import { foldName } from "../../../lib/wine-identity/fold";
import {
  ALCOHOL_STOPS,
  APPEARANCE_INTENSITY_STOPS,
  BODY_STOPS,
  DEVELOPMENT_STOPS,
  FINISH_STOPS,
  FORTIFIED_ALCOHOL_STOPS,
  HUES_BY_COLOUR,
  INTENSITY_STOPS,
  LEVEL_STOPS,
  SWEETNESS_STOPS,
} from "../../../lib/wset/vocab";
import type { WineColour, WineStyle } from "../../../lib/wset/types";

/** One aroma link; `signature` marks a term that is truly diagnostic (D5). */
export type AromaLink = { termId: string; signature: boolean };

/** What the editor opens on. */
export type ArchetypeProfile = {
  id: string;
  name: string;
  colour: WineColour;
  style: WineStyle;
  description: string | null;
  qualityLow: number | null;
  qualityHigh: number | null;
  sat: { [key: string]: [string, string] };
  nose: AromaLink[];
  palate: AromaLink[];
  countryId: string;
  regionId: string;
  appellationId: string;
  appellationName: string | null;
  designationIds: string[];
  typicalAgeLow: number | null;
  typicalAgeHigh: number | null;
  winePlaceId: string | null;
  winePlaceName: string | null;
};

/** What a save sends to updateArchetype. */
export type ArchetypeProfileInput = {
  name: string;
  colour: WineColour;
  style: WineStyle;
  description: string | null;
  qualityLow: number | null;
  qualityHigh: number | null;
  sat: { [key: string]: [string, string] };
  nose: AromaLink[];
  palate: AromaLink[];
  countryId: string;
  regionId: string;
  appellationId: string;
  designationIds: string[];
  typicalAgeLow: number | null;
  typicalAgeHigh: number | null;
  winePlaceId: string | null;
};

/** The small reference lists the editor picks from (loadByHandReferences). */
export type EditorReferences = {
  countries: { id: string; name: string }[];
  regions: { id: string; name: string; countryId: string }[];
  typeDesignations: { id: string; name: string; category: string | null }[];
};

export type AppellationOption = { id: string; name: string; matchName?: string };

// Full enum order (spec §4.4) where the note's slider offers fewer stops.
const APPEARANCE_LADDER: readonly string[] = ["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"];
const SWEETNESS_LADDER: readonly string[] = [
  "DRY",
  "OFF_DRY",
  "MEDIUM_DRY",
  "MEDIUM",
  "MEDIUM_SWEET",
  "SWEET",
  "LUSCIOUS",
];
const MOUSSE_LADDER: readonly string[] = ["DELICATE", "CREAMY", "AGGRESSIVE"];

/** A scale the editor edits: `ladder` is where a range may lie, `slider` what a note can say. */
export type ScaleSpec = { key: string; label: string; ladder: readonly string[]; slider: readonly string[] };

export function scalesFor(colour: WineColour, style: WineStyle): ScaleSpec[] {
  // A fortified archetype's alcohol is written on the five-stop ladder for the
  // reference sheet only (D19: never a distance).
  const alcohol = style === "FORTIFIED" ? FORTIFIED_ALCOHOL_STOPS : ALCOHOL_STOPS;
  const hues = HUES_BY_COLOUR[colour];
  const scales: ScaleSpec[] = [
    { key: "appearanceIntensity", label: "Appearance intensity", ladder: APPEARANCE_LADDER, slider: APPEARANCE_INTENSITY_STOPS },
    { key: "colourHue", label: "Colour", ladder: hues, slider: hues },
    { key: "noseIntensity", label: "Nose intensity", ladder: INTENSITY_STOPS, slider: INTENSITY_STOPS },
    { key: "development", label: "Development", ladder: DEVELOPMENT_STOPS, slider: DEVELOPMENT_STOPS },
    { key: "sweetness", label: "Sweetness", ladder: SWEETNESS_LADDER, slider: SWEETNESS_STOPS },
    { key: "acidity", label: "Acidity", ladder: LEVEL_STOPS, slider: LEVEL_STOPS },
    { key: "tannin", label: "Tannin", ladder: LEVEL_STOPS, slider: LEVEL_STOPS },
    { key: "alcohol", label: "Alcohol", ladder: alcohol, slider: alcohol },
    { key: "body", label: "Body", ladder: BODY_STOPS, slider: BODY_STOPS },
    { key: "flavourIntensity", label: "Flavour intensity", ladder: INTENSITY_STOPS, slider: INTENSITY_STOPS },
    { key: "finish", label: "Finish", ladder: FINISH_STOPS, slider: FINISH_STOPS },
  ];
  if (style === "SPARKLING") {
    scales.push({ key: "mousse", label: "Mousse", ladder: MOUSSE_LADDER, slider: MOUSSE_LADDER });
  }
  return scales;
}

/** On the scale's ladder, low to high, and holding a value the note's slider can produce (§4.4). */
export function rangeFits(scale: ScaleSpec, range: readonly [string, string]): boolean {
  const lo = scale.ladder.indexOf(range[0]);
  const hi = scale.ladder.indexOf(range[1]);
  if (lo < 0 || hi < 0 || lo > hi) return false;
  return scale.ladder.slice(lo, hi + 1).some((v) => scale.slider.includes(v));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isId(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

function pairOk(lo: number | null, hi: number | null, min: number, max: number): boolean {
  if (lo === null && hi === null) return true;
  if (lo === null || hi === null) return false;
  return Number.isInteger(lo) && Number.isInteger(hi) && lo >= min && hi <= max && lo <= hi;
}

/** The first problem with a profile, in words, or null. Keys the editor does
    not show (clarity; mousse off sparkling) are left alone and survive a save. */
export function validateProfile(p: ArchetypeProfileInput): string | null {
  if (typeof p.name !== "string" || p.name.trim() === "") return "Give it a name.";
  if (!isId(p.countryId) || !isId(p.regionId) || !isId(p.appellationId)) {
    return "Pick a country, region and appellation.";
  }
  if (!pairOk(p.qualityLow, p.qualityHigh, 50, 100)) return "Quality runs from 50 to 100, low to high.";
  if (!pairOk(p.typicalAgeLow, p.typicalAgeHigh, 0, 100)) {
    return "Typical age takes two whole numbers of years, low to high.";
  }
  for (const s of scalesFor(p.colour, p.style)) {
    const range = p.sat[s.key];
    if (range !== undefined && !rangeFits(s, range)) return `${s.label}: pick a range on its own scale.`;
  }
  if (!Array.isArray(p.nose) || !Array.isArray(p.palate) || !Array.isArray(p.designationIds)) {
    return "Something in the profile is malformed.";
  }
  if (p.winePlaceId !== null && !isId(p.winePlaceId)) return "That map place is not valid.";
  return null;
}

/** The answer-key forms' wording for a region's own appellation. */
export const JUST_THE_REGION = "Just the region";

/** A region's appellations with its self-named row first as "Just the region · …". */
export function appellationOptions(
  regionName: string,
  list: readonly { id: string; name: string }[],
): AppellationOption[] {
  const self = justTheRegionOption({ id: "", name: regionName }, list);
  return [
    ...(self ? [{ id: self.id, name: `${JUST_THE_REGION} · ${self.name}`, matchName: self.name }] : []),
    ...list.filter((a) => a.id !== self?.id).map((a) => ({ id: a.id, name: a.name })),
  ];
}

export const APPELLATION_RESULTS_MAX = 50;

export function filterAppellationOptions(
  options: readonly AppellationOption[],
  query: string,
): AppellationOption[] {
  const key = foldName(query);
  const hits =
    key === ""
      ? options
      : options.filter(
          (o) =>
            foldName(o.name).includes(key) ||
            (o.matchName !== undefined && foldName(o.matchName).includes(key)),
        );
  return hits.slice(0, APPELLATION_RESULTS_MAX);
}

/** The aroma picker's new id list, each id keeping the signature it had. */
export function withTermIds(links: readonly AromaLink[], ids: readonly string[]): AromaLink[] {
  return ids.map((id) => links.find((l) => l.termId === id) ?? { termId: id, signature: false });
}

export function toggleSignature(links: readonly AromaLink[], termId: string): AromaLink[] {
  return links.map((l) => (l.termId === termId ? { ...l, signature: !l.signature } : l));
}

/** wine_archetype_aromas rows: one per (term, kind), the first link's signature winning. */
export function aromaRows(
  archetypeId: string,
  nose: readonly AromaLink[],
  palate: readonly AromaLink[],
): { archetype_id: string; term_id: string; kind: "NOSE" | "PALATE"; signature: boolean }[] {
  const rows: { archetype_id: string; term_id: string; kind: "NOSE" | "PALATE"; signature: boolean }[] = [];
  const seen = new Set<string>();
  for (const [kind, links] of [
    ["NOSE", nose],
    ["PALATE", palate],
  ] as const) {
    for (const link of links) {
      const key = `${kind}:${link.termId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ archetype_id: archetypeId, term_id: link.termId, kind, signature: link.signature === true });
    }
  }
  return rows;
}

export function designationRows(
  archetypeId: string,
  ids: readonly string[],
): { archetype_id: string; type_designation_id: string }[] {
  return [...new Set(ids)].map((id) => ({ archetype_id: archetypeId, type_designation_id: id }));
}
```

- [ ] **Step 4: Run the test and see it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/app/admin/archetypes/profile-rules.test.ts`
Expected: PASS — 11 tests in 1 file. If "uses the matcher's own ladders" fails, the matcher
and the editor disagree on a ladder: spec §4.4 decides which one is wrong.

- [ ] **Step 5: Write the new fields in `src/app/admin/archetypes/actions.ts`**

Replace
```ts
import { isContributor } from "@/lib/auth/roles";
import type { WineColour, WineStyle } from "@/lib/wset/types";
```
with
```ts
import { isContributor } from "@/lib/auth/roles";
import {
  aromaRows,
  designationRows,
  validateProfile,
  type ArchetypeProfileInput,
} from "./profile-rules";
```

Then replace everything from `export type ArchetypeProfileInput = {` to the end of the file
(the old type and the old `updateArchetype`) with:

```ts
// Save an archetype's profile: SAT ranges, quality, aromas with their signature
// flags, the scoring identity (country → region → appellation), designations,
// typical age and the optional map place (training-room spec §4.5). RLS gates
// every write to curators (contributor + admin); the app check mirrors it, and
// the profile is validated again here — the editor's own check is only a
// convenience.
export async function updateArchetype(
  archetypeId: string,
  input: ArchetypeProfileInput,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await ensureContributor();
  if (!supabase) return { error: "You don't have permission." };

  const invalid = validateProfile(input);
  if (invalid) return { error: invalid };

  const [{ data: region }, { data: appellation }] = await Promise.all([
    supabase.from("regions").select("country_id").eq("id", input.regionId).maybeSingle(),
    supabase.from("appellations").select("region_id").eq("id", input.appellationId).maybeSingle(),
  ]);
  if (!region || region.country_id !== input.countryId) {
    return { error: "That region is not in that country." };
  }
  if (!appellation || appellation.region_id !== input.regionId) {
    return { error: "That appellation is not in that region." };
  }

  const { error: upErr } = await supabase
    .from("wine_archetypes")
    .update({
      name: input.name.trim(),
      colour: input.colour,
      style: input.style,
      description: input.description,
      sat: input.sat,
      quality_low: input.qualityLow,
      quality_high: input.qualityHigh,
      country_id: input.countryId,
      region_id: input.regionId,
      appellation_id: input.appellationId,
      typical_age_low: input.typicalAgeLow,
      typical_age_high: input.typicalAgeHigh,
      wine_place_id: input.winePlaceId,
    })
    .eq("id", archetypeId);
  if (upErr) return { error: upErr.message };

  const { error: delErr } = await supabase
    .from("wine_archetype_aromas")
    .delete()
    .eq("archetype_id", archetypeId);
  if (delErr) return { error: delErr.message };
  const rows = aromaRows(archetypeId, input.nose, input.palate);
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from("wine_archetype_aromas").insert(rows);
    if (insErr) return { error: insErr.message };
  }

  const { error: delDesErr } = await supabase
    .from("wine_archetype_designations")
    .delete()
    .eq("archetype_id", archetypeId);
  if (delDesErr) return { error: delDesErr.message };
  const designations = designationRows(archetypeId, input.designationIds);
  if (designations.length > 0) {
    const { error: insDesErr } = await supabase.from("wine_archetype_designations").insert(designations);
    if (insDesErr) return { error: insDesErr.message };
  }

  revalidatePath("/admin/archetypes");
  revalidatePath("/taste/training");
  return { ok: true };
}
```

- [ ] **Step 6: Replace `src/app/admin/archetypes/archetype-editor.tsx` in full**

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, X } from "lucide-react";
import type { AromaTerm, WineColour, WineStyle } from "@/lib/wset/types";
import { LABELS, HUES_BY_COLOUR } from "@/lib/wset/vocab";
import { listAppellationsForRegions } from "@/lib/reference-search";
import { EditableRange } from "@/components/wset/range-input";
import { AromaPicker } from "@/components/wset/aroma-picker";
import { ReferenceCombobox } from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { TypeDesignationField, type TypeDesignationOption } from "@/components/type-designation-field";
import { cn } from "@/lib/utils";
import { searchPlaces, updateArchetype, type PlaceHit } from "./actions";
import {
  appellationOptions,
  filterAppellationOptions,
  scalesFor,
  toggleSignature,
  validateProfile,
  withTermIds,
  type AppellationOption,
  type ArchetypeProfile,
  type ArchetypeProfileInput,
  type AromaLink,
  type EditorReferences,
} from "./profile-rules";

const COLOURS: WineColour[] = ["WHITE", "ORANGE", "ROSE", "RED"];
const STYLES: WineStyle[] = ["STILL", "SPARKLING", "SWEET", "FORTIFIED"];
const FIELD = "rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground";
const LABEL = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";

function numberOrNull(s: string): number | null {
  return s.trim() === "" ? null : Number(s);
}

// Each picked aroma as a chip; a starred one is a signature (training-room D5:
// picking that exact term earns a bonus). Module-level so React keeps one
// component identity across renders.
function SignatureToggles({
  links,
  termById,
  onToggle,
}: {
  links: AromaLink[];
  termById: Map<string, string>;
  onToggle: (termId: string) => void;
}) {
  if (links.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">Signature terms — an exact hit earns a bonus</span>
      <div className="flex flex-wrap gap-1.5">
        {links.map((l) => (
          <button
            key={l.termId}
            type="button"
            aria-pressed={l.signature}
            onClick={() => onToggle(l.termId)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
              l.signature ? "border-gold bg-gold/15 text-foreground" : "border-border/70 text-muted-foreground",
            )}
          >
            <Star className={cn("size-3", l.signature && "fill-current")} />
            {termById.get(l.termId) ?? l.termId}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ArchetypeEditor({
  archetype,
  terms,
  references,
}: {
  archetype: ArchetypeProfile;
  terms: AromaTerm[];
  references: EditorReferences;
}) {
  const router = useRouter();
  const [name, setName] = useState(archetype.name);
  const [colour, setColour] = useState<WineColour>(archetype.colour);
  const [style, setStyle] = useState<WineStyle>(archetype.style);
  const [description, setDescription] = useState(archetype.description ?? "");
  const [qLow, setQLow] = useState(archetype.qualityLow?.toString() ?? "");
  const [qHigh, setQHigh] = useState(archetype.qualityHigh?.toString() ?? "");
  const [sat, setSat] = useState<Record<string, [string, string]>>(archetype.sat ?? {});
  const [nose, setNose] = useState<AromaLink[]>(archetype.nose);
  const [palate, setPalate] = useState<AromaLink[]>(archetype.palate);
  const [countryId, setCountryId] = useState(archetype.countryId);
  const [regionId, setRegionId] = useState(archetype.regionId);
  const [appellationId, setAppellationId] = useState(archetype.appellationId);
  const [appellationLabel, setAppellationLabel] = useState<string | null>(archetype.appellationName);
  const [designationIds, setDesignationIds] = useState<string[]>(archetype.designationIds);
  const [ageLow, setAgeLow] = useState(archetype.typicalAgeLow?.toString() ?? "");
  const [ageHigh, setAgeHigh] = useState(archetype.typicalAgeHigh?.toString() ?? "");
  const [place, setPlace] = useState<{ id: string; name: string } | null>(
    archetype.winePlaceId ? { id: archetype.winePlaceId, name: archetype.winePlaceName ?? "" } : null,
  );
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeHits, setPlaceHits] = useState<PlaceHit[]>([]);
  const placeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A region's appellation list, read once per region while the editor is open.
  const appellationLists = useRef(new Map<string, AppellationOption[]>());
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const scales = scalesFor(colour, style);
  const termById = new Map(terms.map((t) => [t.id, t.term]));
  const regionOptions = references.regions
    .filter((r) => r.countryId === countryId)
    .map((r) => ({ id: r.id, name: r.name }));
  const regionName = references.regions.find((r) => r.id === regionId)?.name ?? null;
  const designationName = new Map(references.typeDesignations.map((d) => [d.id, d.name]));
  const designationOptions: TypeDesignationOption[] = references.typeDesignations.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    country_id: null,
  }));

  const setRange = (key: string, r: [string, string]) => {
    setSat((s) => ({ ...s, [key]: r }));
    setStatus("idle");
  };
  const clearRange = (key: string) =>
    setSat((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });
  const changeColour = (c: WineColour) => {
    setColour(c);
    setSat((s) => {
      const hue = s.colourHue;
      if (hue && !(HUES_BY_COLOUR[c] as string[]).includes(hue[0])) {
        const next = { ...s };
        delete next.colourHue;
        return next;
      }
      return s;
    });
  };

  // The answer-key cascade: a new country drops a region from elsewhere, a new
  // region drops the appellation.
  const changeCountry = (id: string) => {
    setCountryId(id);
    if (references.regions.find((r) => r.id === regionId)?.countryId !== id) {
      setRegionId("");
      setAppellationId("");
      setAppellationLabel(null);
    }
  };
  const changeRegion = (id: string) => {
    setRegionId(id);
    setAppellationId("");
    setAppellationLabel(null);
  };

  async function searchRegionAppellations(query: string): Promise<AppellationOption[]> {
    if (!regionId || !regionName) return [];
    let options = appellationLists.current.get(regionId);
    if (!options) {
      options = appellationOptions(regionName, await listAppellationsForRegions([regionId]));
      appellationLists.current.set(regionId, options);
    }
    return filterAppellationOptions(options, query);
  }

  function runPlaceSearch(value: string) {
    setPlaceQuery(value);
    if (placeTimer.current) clearTimeout(placeTimer.current);
    if (value.trim().length < 2) {
      setPlaceHits([]);
      return;
    }
    placeTimer.current = setTimeout(() => {
      searchPlaces(value).then(setPlaceHits);
    }, 250);
  }

  function profileInput(): ArchetypeProfileInput {
    return {
      name: name.trim(),
      colour,
      style,
      description: description.trim() || null,
      qualityLow: numberOrNull(qLow),
      qualityHigh: numberOrNull(qHigh),
      sat,
      nose,
      palate,
      countryId,
      regionId,
      appellationId,
      designationIds,
      typicalAgeLow: numberOrNull(ageLow),
      typicalAgeHigh: numberOrNull(ageHigh),
      winePlaceId: place?.id ?? null,
    };
  }

  const save = () =>
    startTransition(async () => {
      const input = profileInput();
      const invalid = validateProfile(input);
      if (invalid) {
        setStatus("error");
        setError(invalid);
        return;
      }
      setError(null);
      const res = await updateArchetype(archetype.id, input);
      if ("error" in res) {
        setStatus("error");
        setError(res.error);
      } else {
        setStatus("saved");
        router.refresh();
      }
    });

  return (
    <div className="mt-3 flex flex-col gap-4 border-t border-border pt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={LABEL}>
            Colour
            <select value={colour} onChange={(e) => changeColour(e.target.value as WineColour)} className={FIELD}>
              {COLOURS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Style
            <select value={style} onChange={(e) => setStyle(e.target.value as WineStyle)} className={FIELD}>
              {STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
        <p className="text-xs font-medium text-muted-foreground">Where it scores</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={LABEL}>
            <span>Country</span>
            <ReferenceCombobox
              formFieldName="country_id"
              options={references.countries}
              value={countryId}
              onValueChange={changeCountry}
              placeholder="Pick a country"
            />
          </div>
          <div className={LABEL}>
            <span>Region</span>
            <ReferenceCombobox
              formFieldName="region_id"
              options={regionOptions}
              value={regionId}
              onValueChange={changeRegion}
              placeholder={countryId ? "Pick a region" : "Pick a country first"}
              disabled={!countryId}
            />
          </div>
          <div className={LABEL}>
            <span>Appellation</span>
            <SearchableCombobox
              formFieldName="appellation_id"
              value={appellationId}
              selectedLabel={appellationLabel}
              onValueChange={(id, label) => {
                setAppellationId(id);
                setAppellationLabel(label);
              }}
              search={searchRegionAppellations}
              placeholder={regionId ? "Just the region, or pick one" : "Pick a region first"}
              disabled={!regionId}
            />
          </div>
        </div>

        <div className={LABEL}>
          <span>Designations the label would carry</span>
          {designationIds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {designationIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-xs text-foreground"
                >
                  {designationName.get(id) ?? id}
                  <button
                    type="button"
                    aria-label={`Remove ${designationName.get(id) ?? id}`}
                    onClick={() => setDesignationIds((ids) => ids.filter((x) => x !== id))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <TypeDesignationField
            formFieldName="designation_add"
            options={designationOptions}
            value=""
            onValueChange={(id) => {
              if (id) setDesignationIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
            }}
            placeholder="Add a designation"
            allowClear={false}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className={LABEL}>
            Typical age from (years)
            <input
              type="number"
              min={0}
              max={100}
              value={ageLow}
              onChange={(e) => setAgeLow(e.target.value)}
              className={cn(FIELD, "w-20")}
            />
          </label>
          <label className={LABEL}>
            to
            <input
              type="number"
              min={0}
              max={100}
              value={ageHigh}
              onChange={(e) => setAgeHigh(e.target.value)}
              className={cn(FIELD, "w-20")}
            />
          </label>
        </div>

        <div className={LABEL}>
          <span>Map place (optional)</span>
          <div className="flex flex-wrap items-center gap-2">
            {place ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-xs text-foreground">
                {place.name || place.id}
                <button
                  type="button"
                  aria-label="Remove the map place"
                  onClick={() => setPlace(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">None — not on the map</span>
            )}
            <div className="relative">
              <input
                value={placeQuery}
                onChange={(e) => runPlaceSearch(e.target.value)}
                placeholder="Search the map…"
                className={cn(FIELD, "w-48")}
              />
              {placeHits.length > 0 ? (
                <div className="absolute z-10 mt-1 max-h-64 w-72 overflow-auto rounded-md border border-border bg-popover shadow-md">
                  {placeHits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        setPlace({ id: h.id, name: h.name });
                        setPlaceQuery("");
                        setPlaceHits([]);
                      }}
                      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                    >
                      <span className="truncate">{h.name}</span>
                      <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">
                        {h.kind}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <label className={LABEL}>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={FIELD} />
      </label>

      <div className="flex items-end gap-3">
        <label className={LABEL}>
          Quality from
          <input
            type="number"
            min={50}
            max={100}
            value={qLow}
            onChange={(e) => setQLow(e.target.value)}
            className={cn(FIELD, "w-20")}
          />
        </label>
        <label className={LABEL}>
          to
          <input
            type="number"
            min={50}
            max={100}
            value={qHigh}
            onChange={(e) => setQHigh(e.target.value)}
            className={cn(FIELD, "w-20")}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium text-muted-foreground">Structured tasting ranges</p>
        {scales.map((sc) => (
          <div key={sc.key} className="rounded-md border border-border/60 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium">{sc.label}</span>
              {sat[sc.key] ? (
                <button
                  type="button"
                  onClick={() => clearRange(sc.key)}
                  className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  clear
                </button>
              ) : (
                <span className="text-[10px] text-muted-foreground">not set — click to set</span>
              )}
            </div>
            <EditableRange
              stops={sc.ladder}
              labels={LABELS}
              value={sat[sc.key] ?? null}
              onChange={(r) => setRange(sc.key, r)}
            />
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border/60 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Nose — aroma characteristics</p>
        <AromaPicker
          terms={terms}
          selectedIds={nose.map((l) => l.termId)}
          onChange={(ids) => setNose((links) => withTermIds(links, ids))}
          colour={colour}
        />
        <SignatureToggles
          links={nose}
          termById={termById}
          onToggle={(id) => setNose((links) => toggleSignature(links, id))}
        />
      </div>
      <div className="rounded-md border border-border/60 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Palate — flavour characteristics</p>
        <AromaPicker
          terms={terms}
          selectedIds={palate.map((l) => l.termId)}
          onChange={(ids) => setPalate((links) => withTermIds(links, ids))}
          colour={colour}
          copyFrom={{ label: "Copy from nose", ids: nose.map((l) => l.termId) }}
        />
        <SignatureToggles
          links={palate}
          termById={termById}
          onToggle={(id) => setPalate((links) => toggleSignature(links, id))}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Saving…" : status === "saved" ? "Saved ✓" : "Save profile"}
        </button>
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Pass the references through `src/app/admin/archetypes/placement-editor.tsx`**

Replace
```tsx
import { ArchetypeEditor, type ArchetypeProfile } from "./archetype-editor";
import type { AromaTerm } from "@/lib/wset/types";
```
with
```tsx
import { ArchetypeEditor } from "./archetype-editor";
import type { ArchetypeProfile, EditorReferences } from "./profile-rules";
import type { AromaTerm } from "@/lib/wset/types";
```

Replace
```tsx
export function PlacementEditor({
  archetypes,
  terms,
}: {
  archetypes: ArchetypeAdmin[];
  terms: AromaTerm[];
}) {
```
with
```tsx
export function PlacementEditor({
  archetypes,
  terms,
  references,
}: {
  archetypes: ArchetypeAdmin[];
  terms: AromaTerm[];
  references: EditorReferences;
}) {
```

Replace
```tsx
            <ArchetypeEditor archetype={a} terms={terms} />
```
with
```tsx
            <ArchetypeEditor archetype={a} terms={terms} references={references} />
```

- [ ] **Step 8: Replace `src/app/admin/archetypes/page.tsx` in full**

```tsx
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadByHandReferences } from "@/components/add-wine/by-hand-actions";
import { requireContributor } from "@/lib/auth/roles";
import type { Database } from "@/lib/supabase/database.types";
import type { AromaTerm } from "@/lib/wset/types";
import { PlacementEditor, type ArchetypeAdmin } from "./placement-editor";
import type { EditorReferences } from "./profile-rules";

export const metadata = { title: "Typical wines · Admin · Blindr" };

type AromaLinkRow = { archetype_id: string; term_id: string; kind: "NOSE" | "PALATE"; signature: boolean };

// PostgREST answers at most 1000 rows per request; the training room's first
// batch alone brings the aroma links close to that, so they are read in pages.
async function readAromaLinks(supabase: SupabaseClient<Database>): Promise<AromaLinkRow[]> {
  const rows: AromaLinkRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("wine_archetype_aromas")
      .select("archetype_id, term_id, kind, signature")
      .order("archetype_id")
      .order("term_id")
      .order("kind")
      .range(from, from + 999);
    if (error) throw new Error(`Typical wines: the aroma read failed (${error.message})`);
    const page = (data ?? []) as AromaLinkRow[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export default async function ArchetypesAdminPage() {
  const { supabase } = await requireContributor();

  const [
    { data: archetypes },
    { data: placements },
    aromaLinks,
    { data: termRows },
    { data: designationLinks },
    references,
  ] = await Promise.all([
    supabase
      .from("wine_archetypes")
      .select(
        "id, name, colour, style, description, quality_low, quality_high, sat, country_id, region_id, appellation_id, typical_age_low, typical_age_high, wine_place_id",
      )
      .order("sort_order"),
    supabase
      .from("wine_archetype_placements")
      .select("archetype_id, wine_place_id, sort_order")
      .order("sort_order"),
    readAromaLinks(supabase),
    supabase
      .from("wset_aroma_terms")
      .select("id, family, origin, group_name, term, sort_order")
      .order("sort_order"),
    supabase.from("wine_archetype_designations").select("archetype_id, type_designation_id"),
    loadByHandReferences(),
  ]);

  const rows = archetypes ?? [];

  const placeIds = Array.from(
    new Set([
      ...(placements ?? []).map((p) => p.wine_place_id),
      ...rows.map((a) => a.wine_place_id).filter((id): id is string => id !== null),
    ]),
  );
  const placeById = new Map<string, { name: string; kind: string; canonicalKey: string }>();
  if (placeIds.length > 0) {
    const { data: places } = await supabase
      .from("wine_places")
      .select("id, name, kind, canonical_key")
      .in("id", placeIds);
    for (const p of places ?? []) {
      placeById.set(p.id, { name: p.name, kind: p.kind as string, canonicalKey: p.canonical_key });
    }
  }

  const appellationIds = Array.from(new Set(rows.map((a) => a.appellation_id)));
  const appellationName = new Map<string, string>();
  if (appellationIds.length > 0) {
    const { data: appellations } = await supabase
      .from("appellations")
      .select("id, name")
      .in("id", appellationIds);
    for (const a of appellations ?? []) appellationName.set(a.id, a.name);
  }

  const terms: AromaTerm[] = (termRows ?? []).map((t) => ({
    id: t.id,
    family: t.family,
    origin: t.origin,
    groupName: t.group_name,
    term: t.term,
    sortOrder: t.sort_order,
  }));

  const items: ArchetypeAdmin[] = rows.map((a) => ({
    id: a.id,
    name: a.name,
    colour: a.colour,
    style: a.style,
    description: a.description,
    qualityLow: a.quality_low,
    qualityHigh: a.quality_high,
    sat: a.sat,
    nose: aromaLinks
      .filter((l) => l.archetype_id === a.id && l.kind === "NOSE")
      .map((l) => ({ termId: l.term_id, signature: l.signature })),
    palate: aromaLinks
      .filter((l) => l.archetype_id === a.id && l.kind === "PALATE")
      .map((l) => ({ termId: l.term_id, signature: l.signature })),
    countryId: a.country_id,
    regionId: a.region_id,
    appellationId: a.appellation_id,
    appellationName: appellationName.get(a.appellation_id) ?? null,
    designationIds: (designationLinks ?? [])
      .filter((d) => d.archetype_id === a.id)
      .map((d) => d.type_designation_id),
    typicalAgeLow: a.typical_age_low,
    typicalAgeHigh: a.typical_age_high,
    winePlaceId: a.wine_place_id,
    winePlaceName: a.wine_place_id ? (placeById.get(a.wine_place_id)?.name ?? null) : null,
    placements: (placements ?? [])
      .filter((pl) => pl.archetype_id === a.id)
      .map((pl) => {
        const info = placeById.get(pl.wine_place_id);
        return {
          placeId: pl.wine_place_id,
          name: info?.name ?? "(unknown place)",
          kind: info?.kind ?? "",
          canonicalKey: info?.canonicalKey ?? "",
          sortOrder: pl.sort_order,
        };
      }),
  }));

  const editorReferences: EditorReferences = {
    countries: references.countries,
    regions: references.regions,
    typeDesignations: references.typeDesignations.map(({ id, name, category }) => ({ id, name, category })),
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">Typical wines</h1>
        <p className="mt-2 text-muted-foreground">
          Edit each typical wine&apos;s tasting-sheet profile — where it scores (country, region,
          appellation), designations, typical age, appearance, nose, palate and quality ranges plus
          aromas and their signature terms — and choose which map places surface it.
        </p>
      </div>
      <PlacementEditor archetypes={items} terms={terms} references={editorReferences} />
    </div>
  );
}
```

- [ ] **Step 9: Run the gates**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && npx vitest run src/app/admin/archetypes && npx tsc --noEmit && npx eslint src/app/admin/archetypes`
Expected: vitest PASS — 11 tests in 1 file; `tsc` exits 0; `eslint` prints nothing.

- [ ] **Step 10: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add src/app/admin/archetypes/profile-rules.ts src/app/admin/archetypes/profile-rules.test.ts src/app/admin/archetypes/actions.ts src/app/admin/archetypes/archetype-editor.tsx src/app/admin/archetypes/placement-editor.tsx src/app/admin/archetypes/page.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(training): archetype editor — scoring identity, designations, typical age, signatures" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: CLAUDE.md bullet and the copy cross-check

**Files:**
- Modify: `CLAUDE.md` (insert one bullet directly before the line
  `- Tasting lifecycle: a new tasting is created \`DRAFT\` ("not started"), NOT`, i.e. after
  the "First-run tour" bullet, around line 953)

**Interfaces:**
- Consumes: every earlier task's final file names (the bullet names them).
- Produces: nothing code depends on.

- [ ] **Step 1: Cross-check every spec §9 string against copy.ts**

Run:
```bash
cd /c/Users/Public/repos/blindtastingapp-training && node <<'EOF'
const fs = require("fs");
const copy = fs.readFileSync("src/lib/training/copy.ts", "utf8");
const matrix = fs.readFileSync("src/components/add-wine/matrix.ts", "utf8");
const inCopy = [
  "Training room · Preview", "Taste blind. Then find out.",
  "Pour a glass whose label you can't see. Describe it, watch the list tell you what it could be, then reveal the bottle.",
  "typical wines so far — ", " and more", "More each week.",
  "No typical wines yet — the room opens once the first batch lands.",
  "Start a session", "Continue your session · started ", "Discard", "Tap again to discard",
  "Unknown wine · started ", "Your call →", "What it could be", "Start describing the wine",
  "Top match: ", "more close", "Nothing fits yet — check colour and bubbles",
  "Unlikely from what you've said", "higher than typical", "lower than typical",
  "Colour darker than typical", "Colour lighter than typical", "isn't typical", "— a signature",
  "Fits what you've said so far", "Looks like a ", " wine, not a ", "Bubbles noted", "No bubbles noted",
  "Fortified", "Not fortified", "Show all ", "Your call", "Which wine is it?", "Something else…",
  "It's not in the list", "Vintage (optional)", "Reveal the bottle", "I can't find out",
  "It was ", "You said ", "You didn't pick a wine", "Your colour call (", ") didn't fit — it was a ",
  "Where your note pointed", "Its style was your #", "You had ruled its style out (",
  "This style isn't in the pool yet", "Not revealed — your note is kept. Reveal now from Your sessions.",
  "Another glass", "See the note", "Done", "Country", "Region", "Appellation", "Grape", "Second grape",
  "Designation", "Vintage", "✓", "✗", "—", "Your sessions", " right on the grape · ", " on the appellation",
  "Not revealed", "Reveal now", "Show more", "No sessions yet", "Training", "Training room · not revealed",
  "a wine you can't see yet", "A typical ",
];
const inMatrix = ["Reveal the bottle", "Which bottle was it?", "This is it", "↵ reveals the first hit"];
const missing = [
  ...inCopy.filter((s) => !copy.includes(s)).map((s) => `copy.ts: ${JSON.stringify(s)}`),
  ...inMatrix.filter((s) => !matrix.includes(s)).map((s) => `matrix.ts: ${JSON.stringify(s)}`),
];
if (missing.length) {
  console.error("Missing spec §9 strings:\n" + missing.join("\n"));
  process.exit(1);
}
console.log(`All ${inCopy.length + inMatrix.length} spec §9 strings found`);
EOF
```
Expected: `All 78 spec §9 strings found`. A `Missing` line names a string that drifted from
spec §9 — fix it in `copy.ts` (Task 2) or `matrix.ts` (Task 7) with the §9 wording, rerun
`npx vitest run src/lib/training src/components/add-wine`, then rerun this check.

- [ ] **Step 2: Check no room component hard-codes a §9 string**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && grep -rn "Your call →\|What it could be\|Reveal the bottle\|I can't find out\|Another glass\|Your sessions\|Training room · not revealed\|Start a session" src/app src/components --include=*.tsx`
Expected: no output (every one of them is read from `TRAINING_COPY` or the matrix).

- [ ] **Step 3: Insert the CLAUDE.md bullet**

Insert this bullet immediately before the line that begins
`- Tasting lifecycle: a new tasting is created` (keep the blank-free list formatting of the
neighbouring bullets):

```markdown
- **Training room** (2026-09-25, spec
  `docs/superpowers/specs/2026-09-25-training-room-design.md`, plan
  `docs/superpowers/plans/2026-09-25-training-room.md`, migrations
  `20260925120000_training_room.sql` and `20260925130000_archetypes_batch_1.sql`;
  DB suite `scripts/training-room.test.mjs`). `/taste/training` is a solo blind
  practice room, live for everyone behind a **Preview** pill (`NavChild.preview`
  read through `navChildState` in the sidebar, the phone drawer and the `/taste`
  start menu; no role gate, no flag). The page (`page.tsx`) reads the pool, the
  aroma lexicon, the first history page and the tally as the viewer
  (`src/lib/training/pool.ts`: server-only, `cache()`d, paged past PostgREST's
  1000-row cap, every rule in the pure `pool-shape.ts`) and hands them to one
  client component, `training-room.tsx`, with three states: landing, session,
  result. The session is the WSET sheet in unknown-wine mode (`WsetSheet` with
  `onChange`, `footerAction`, `belowBar`, `aside={null}`, `onClose`, `bubbles`,
  `fortified`) beside a ranked list of typical wines (`wine_archetypes`) that
  re-orders on every answer: the laptop column (`candidates-panel.tsx`, lg+), a
  44 px strip in the sheet's sticky bar and a bottom sheet below lg. Matching is
  pure and on the device (`src/lib/training/match.ts`): ranking, never
  filtering; soft ranges on the full enum ladders (`ALCOHOL_STOPS` for an
  unfortified alcohol, `HUES_BY_COLOUR[colour]` for hue); a scale the archetype
  lacks, or an off-ladder range bound, leaves numerator AND denominator; a
  signature aroma hit is a pure bonus (max two, closeness capped at 100); a
  contradicted colour, bubbles or fortification caps a candidate at 15 % under
  "Unlikely from what you've said", and an unanswered (`null`) fact never caps.
  The unfinished session is a device draft only (`src/lib/training/draft.ts`,
  key `blindr-training-draft:<userId>`, written on every change): nothing
  reaches the server before the reveal, ✕ keeps the draft, and a finish or
  Discard in another tab returns this one to the landing (`storage` event). The
  reveal is the add-wine sheet's `{ kind: "note", reveal: true }` with
  `onNotePick`: the pick comes back to the room, never opens `NewNoteModal`,
  never draws down a cellar lot, and a stale pick from an earlier open is
  ignored. One RPC writes the result: `record_training_attempt` (SECURITY
  DEFINER; EXECUTE `authenticated` only, revoked from PUBLIC, `anon` and
  `service_role`) saves the note through `save_wset_note` — inside a definer RLS
  is bypassed, so the RPC itself forces `context_kind = 'TRAINING'`, the
  identity fields and the author — drops a hue that does not fit the revealed
  wine (`hue_cleared`, kept on the attempt for the result's hue line), scores
  with the championship values (a DB test pins them to `reveal_wine`'s), and is
  idempotent on the device-minted `session_key`. Reveal now re-runs it with
  `attempt_id` and the wine only. The actions (`src/app/taste/training/actions.ts`)
  check every input again (`src/lib/training/attempt-payload.ts`); their types
  live in the plain `action-types.ts`. `training_attempts` is author-only SELECT
  with no client write grant; history reads follow `catalog_wines.merged_into`
  (`merge_catalog_wines` is deliberately not recreated), 20 rows a page on a
  `(created_at, id)` cursor, and a wine the viewer cannot read shows as "a wine
  you can't see yet". An identity-less TRAINING note is admitted by the
  `wset_notes_one_identity` TRAINING branch (author-only by the existing read
  policy) and shows in `/taste/notes` as "Training room · not revealed",
  linking back to the room; a revealed one is a normal public note with a
  "Training" badge (`your-notes.tsx`, the archive chip, the note modal's
  title). Deleting a revealed training note deletes its attempt (cascade).
  `/admin/archetypes` edits the scoring identity (country → region →
  appellation with "Just the region"), designations, typical age, signature
  aromas, an optional map place and mousse on sparkling; its ladders and checks
  are pure in `src/app/admin/archetypes/profile-rules.ts`, whose test pins them
  to the matcher's `ladderFor`. New archetypes arrive only as data migrations
  generated from a reviewed JSON batch (`data/training/archetypes-batch-*.json`
  → `scripts/training/gen-archetype-batch-migration.mjs`, checked read-only by
  `validate-archetype-batch.mjs`, fail-closed on any name that does not resolve
  to exactly one live row) — never through the Anthropic API (AGENTS.md). All
  room copy lives in `src/lib/training/copy.ts` (English only, D20); never
  hard-code a room string in a component.
```

- [ ] **Step 4: Check the insertion landed once, in place**

Run: `cd /c/Users/Public/repos/blindtastingapp-training && grep -n "^- \*\*Training room\*\*\|^- \*\*First-run tour\*\*\|^- Tasting lifecycle: a new tasting" CLAUDE.md`
Expected: three lines, in the order First-run tour, Training room, Tasting lifecycle, and
exactly one `Training room` line.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-training && git add CLAUDE.md && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "docs(training): the training room in CLAUDE.md" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
