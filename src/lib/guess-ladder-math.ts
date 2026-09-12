// Pure maths for the guess ladder (6e/6h): what a guess is worth so far, which
// row to open next, how the standings moved, and the flight progress bar. No
// Next/Supabase imports so vitest's node environment can test it directly
// (the one runtime import is relative — vitest has no `@/` alias; the type
// import below is erased at build time).
import { competitorRank } from "./stats-math";
import type {
  FlightSegment,
  GrapeShortlistDetail,
  GuessRow,
  LadderField,
} from "@/app/tastings/[id]/play/ladder-types";

export type { FlightSegment, GrapeShortlistDetail, GuessRow, LadderField };

export type FieldPoints = {
  field: LadderField;
  points: number;
  /** Scores only when the wine has one — shown under "More". */
  optional: boolean;
};

/**
 * The real VM/DM point values (Danish Championship rules), in ladder order:
 * the six required rows first, then the two optional ones. Vintage is 2 exact
 * / 1 when a year out — the ladder shows the 2.
 */
export const FIELD_POINTS: readonly FieldPoints[] = [
  { field: "country", points: 2, optional: false },
  { field: "region", points: 3, optional: false },
  { field: "appellation", points: 5, optional: false },
  { field: "primary_grape", points: 8, optional: false },
  { field: "producer", points: 6, optional: false },
  { field: "vintage", points: 2, optional: false },
  { field: "secondary_grape", points: 2, optional: true },
  { field: "type_designation", points: 2, optional: true },
];

/** The six rows every blind glass shows, top to bottom. */
export const LADDER_ORDER: readonly LadderField[] = FIELD_POINTS.filter(
  (f) => !f.optional,
).map((f) => f.field);

/** The two rows under "More". */
export const OPTIONAL_FIELDS: readonly LadderField[] = FIELD_POINTS.filter(
  (f) => f.optional,
).map((f) => f.field);

/**
 * The fixed denominator ("/ 30 pts at stake"): all eight fields together —
 * 2+3+5+8+6+2 for the required rows is 26, the two optional 2s make 30. The
 * stake therefore never exceeds it.
 */
export const MAX_POINTS = FIELD_POINTS.reduce((n, f) => n + f.points, 0);

export function fieldPoints(field: LadderField): number {
  return FIELD_POINTS.find((f) => f.field === field)?.points ?? 0;
}

/**
 * A field is answered when it carries an id; vintage needs a kind AND the
 * value that kind implies (a year for YEAR, an age statement for TAWNY,
 * nothing more for NV) — a bare kind scores nothing server-side.
 */
export function isFieldAnswered(guess: GuessRow, field: LadderField): boolean {
  switch (field) {
    case "country":
      return guess.country_id != null;
    case "region":
      return guess.region_id != null;
    case "appellation":
      return guess.appellation_id != null;
    case "primary_grape":
      return guess.primary_grape_id != null;
    case "producer":
      return guess.producer_id != null;
    case "secondary_grape":
      return guess.secondary_grape_id != null;
    case "type_designation":
      return guess.type_designation_id != null;
    case "vintage":
      if (guess.vintage_kind === "YEAR") return guess.vintage_year != null;
      if (guess.vintage_kind === "TAWNY") return guess.vintage_tawny_years != null;
      return guess.vintage_kind === "NV";
  }
}

/**
 * Σ point values of the answered fields — "13 / 30 pts at stake". The two
 * optional rows count only once answered.
 */
export function pointsAtStake(guess: GuessRow | null): number {
  if (!guess) return 0;
  return FIELD_POINTS.reduce(
    (n, f) => (isFieldAnswered(guess, f.field) ? n + f.points : n),
    0,
  );
}

/**
 * The first field in `order` without an answer — what the picker's "Next"
 * opens. Pass `after` to continue from the field currently open (so Next on
 * an answered row still moves forward). Null when the pass is complete.
 */
export function nextUnanswered(
  guess: GuessRow,
  order: readonly LadderField[],
  after?: LadderField,
): LadderField | null {
  const start = after ? order.indexOf(after) + 1 : 0;
  for (let i = start; i < order.length; i++) {
    if (!isFieldAnswered(guess, order[i])) return order[i];
  }
  return null;
}

/**
 * The 6f picker's secondary line for a shortlisted grape — "Barolo,
 * Barbaresco · you guess this often", "Gavi · white": the linked places
 * under the region, then "white" (red is the default assumption, as drawn),
 * then the frequent-guess clause. Undefined when there is nothing to say, so
 * the row renders as a plain 15px name.
 */
export function grapeSecondaryLine(
  detail: GrapeShortlistDetail | undefined,
  frequent: boolean,
): string | undefined {
  const parts = [
    detail && detail.places.length > 0 ? detail.places.join(", ") : undefined,
    detail?.color === "WHITE" ? "white" : undefined,
    frequent ? "you guess this often" : undefined,
  ].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * "▲ 2nd → 1st": my dense rank before and after the most recent round. The
 * previous total is `total − lastRoundPoints` (reveal_wine scores a wine's
 * guesses in one transaction, so the last round is well-defined). Null when
 * I am not among the rows.
 */
export function rankDelta(
  rows: { participantId: string; total: number; lastRoundPoints: number | null }[],
  me: string,
): { before: number; after: number } | null {
  const after = competitorRank(rows, me);
  if (!after) return null;
  const before = competitorRank(
    rows.map((r) => ({
      participantId: r.participantId,
      total: r.total - (r.lastRoundPoints ?? 0),
    })),
    me,
  );
  return { before: before?.rank ?? after.rank, after: after.rank };
}

/**
 * One segment per wine in serving order: revealed = bordeaux, the current
 * (lowest unrevealed) glass = gold, the rest = border. A revealed wine is
 * never "current" even if asked.
 */
export function flightSegments(
  wines: { id: string; is_revealed: boolean }[],
  currentWineId: string | null,
): FlightSegment[] {
  return wines.map((w) =>
    w.is_revealed ? "revealed" : w.id === currentWineId ? "current" : "todo",
  );
}
