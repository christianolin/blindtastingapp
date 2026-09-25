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
