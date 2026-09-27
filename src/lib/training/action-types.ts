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
  /** call.ts's callPayload: a typical wine alone, or a region with an
      optional grape, or none (region-guess addendum R7). */
  pickedArchetypeId: string | null;
  pickedRegionId: string | null;
  pickedGrapeId: string | null;
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
