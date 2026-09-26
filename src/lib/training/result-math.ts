// View rules for the training room's result and history (training-room spec
// §3.5, §3.6): the seven verdict rows, the top five of the frozen ranking,
// where the real wine's style stood in it, what Another glass does, and the
// history list's merge of its first page with the pages Show more fetched.
// Pure, relative imports only.
import type { ColourHue, WineColour, WineStyle } from "../wset/types";
import { colourFromHue } from "../wset/vocab";
import { RESULT_ROW_LABELS, RESULT_ROW_ORDER, resultMark } from "./copy";
import type { AttemptRow, CapReason, PointCategory, RankingSnapshot, TrainingDraft } from "./types";

// The seven rows' order lives in copy.ts beside their labels; re-exported here
// so the result's view rules read from one module.
export { RESULT_ROW_ORDER };

export type VerdictRow = { category: PointCategory; label: string; mark: string; points: number | null };

/** The verdict table's rows, always all seven (spec §3.5): ✓ for points, ✗ for
    zero, — when the category did not apply (null). */
export function verdictRows(points: Record<PointCategory, number | null>): VerdictRow[] {
  return RESULT_ROW_ORDER.map((category) => {
    const p = points[category];
    return { category, label: RESULT_ROW_LABELS[category], mark: resultMark(p), points: p };
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

/** What copy.ts's styleVerdictLine names a cap reason with. */
export type StyleVerdictContext = {
  noteColour: WineColour | null;
  candidateColour: WineColour;
  candidateStyle?: WineStyle;
};

/**
 * The style verdict's context: the note's own colour — from the hue as called,
 * which the attempt keeps even when the RPC cleared it from the note (D16) —
 * beside the real wine's archetype, whose colour and style the ranking capped
 * against. The archetype comes from the pool the room ranked over; D17 maps a
 * wine only to an archetype of its own colour, so when the archetype has left
 * the pool since, the wine's colour stands in (and a bubbles or fortified cap
 * reads its still, unfortified default). Null when neither is known — an
 * unreadable wine whose archetype is gone — and the result then shows no line.
 */
export function styleVerdictContext(
  noteColourHue: string | null,
  archetype: { colour: WineColour; style: WineStyle } | null,
  wineColour: WineColour | null,
): StyleVerdictContext | null {
  const candidateColour = archetype?.colour ?? wineColour;
  if (!candidateColour) return null;
  const noteColour = colourFromHue(noteColourHue as ColourHue | null);
  return archetype
    ? { noteColour, candidateColour, candidateStyle: archetype.style }
    : { noteColour, candidateColour };
}

/** What the result's Another glass does. */
export type AnotherGlassPlan = "start" | "landing";

/**
 * Another glass (spec §3.5) starts a new session only when no draft is stored.
 * After a finish that is always so: finish() clears the session's own draft
 * before the result opens. After a Reveal now another, unfinished session's
 * draft may still be stored — one per user (D13) — and starting would overwrite
 * it with no confirm, past Discard's two taps. The room then returns to the
 * landing, whose Continue / Discard pair decides.
 */
export function anotherGlassPlan(storedDraft: TrainingDraft | null): AnotherGlassPlan {
  return storedDraft ? "landing" : "start";
}

/** The server's first page plus the Show more pages, once each, newest first. */
export function mergeHistoryRows(first: readonly AttemptRow[], more: readonly AttemptRow[]): AttemptRow[] {
  const byId = new Map<string, AttemptRow>();
  for (const r of [...first, ...more]) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0,
  );
}
