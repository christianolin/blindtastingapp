// Pure maths for the tasting result (S12) and the record (S13), ledger B10:
// what each fully revealed glass was worth, the viewer's score against that,
// the best glass, the strongest attribute, the glass the table agreed least
// on, and the record's per-glass marks. No imports at all, so vitest's node
// environment tests it directly and server and client code can share it.
//
// Scoring stays in reveal_wine, reveal_next_category and score_own_guess;
// this module only reads the points they wrote. What it mirrors is the
// engine's "answer unknown => null points" rule, to know which categories a
// wine had in play. Appellation, secondary grape and type designation are
// guarded live. The producer and vintage guards come from
// 20260807090000_optional_producer_vintage.sql, which never ran live (its
// version collided with 20260807090000_cote_de_nuits_villages): live
// wine_answers.producer_id and vintage_kind are still NOT NULL and the live
// reveal_wine scores both unconditionally, so today both are always in play
// and those two branches are inert. In play comes from the answer key, never
// from which guess columns happen to be non-null: the live step reveal would
// write 0, not null, for a wine with no producer or vintage.
//
// Two decisions belong to the callers and are never made here:
// - who may guess a glass. Each glass carries its eligible participant ids:
//   JOINED, minus the bottle's contributor, minus a HOST_PROVIDES host.
// - ranking. Rows arrive in the caller's order (e.g. rankRows' standings).
//   The only thing that order decides here is which of two equally common
//   picks a sentence names.
//
// Rule 1 (GUEST-12): an answer key is read only for a FULLY revealed glass.
// A half-revealed or unrevealed glass adds nothing, not its maximum and not
// its categories, so no figure here can hint that a hidden wine lacks an
// appellation, a producer or a vintage. Copy before the reveal keeps the
// flat "up to 30 points a glass".

/** The eight scored categories, named as the `guesses.<name>_points` columns. */
export type ResultCategory =
  | "country"
  | "region"
  | "appellation"
  | "primary_grape"
  | "secondary_grape"
  | "producer"
  | "type_designation"
  | "vintage";

/** Full points per category (VM/DM, Danish Championship rules). */
export const CATEGORY_POINTS: Readonly<Record<ResultCategory, number>> = {
  country: 2,
  region: 3,
  appellation: 5,
  primary_grape: 8,
  secondary_grape: 2,
  producer: 6,
  type_designation: 2,
  vintage: 2,
};

/** reveal_wine's column order. Equal-weight ties go to the earlier entry. */
export const CATEGORY_ORDER: readonly ResultCategory[] = [
  "country",
  "region",
  "appellation",
  "primary_grape",
  "secondary_grape",
  "producer",
  "type_designation",
  "vintage",
];

/**
 * The six attributes the record marks (C R A G P V), which are also the ones
 * the S12 card picks a strongest attribute from. Secondary grape and type
 * designation still count in a glass's maximum and points, but carry no mark
 * (the S13 legend: "26 across these six, and 30 a glass once a secondary
 * grape and a type designation are in play").
 */
export const MARK_CATEGORIES: readonly ResultCategory[] = [
  "country",
  "region",
  "appellation",
  "primary_grape",
  "producer",
  "vintage",
];

/**
 * The answer-key columns reveal_wine's null guards read. A `wine_answers`
 * row fits as is. Country, region and primary grape are always in play.
 */
export type AnswerFlags = {
  primary_grape_id: string;
  appellation_id: string | null;
  secondary_grape_id: string | null;
  producer_id: string | null;
  type_designation_id: string | null;
  vintage_kind: string | null;
};

/** One glass of the flight. Pass the whole flight in list order ("Glass N"). */
export type ResultGlass = {
  wineId: string;
  /** `wines.is_revealed`, the only "fully revealed" signal. */
  isRevealed: boolean;
  /** `wines.reveal_step`. Above 0 on a glass not fully revealed = half-revealed. */
  revealStep: number;
  /** Participant ids allowed to guess this glass. The caller's rule. */
  eligibleParticipantIds: readonly string[];
};

export type BlindResultGlass = ResultGlass & {
  /** The glass's answer key. Read only once fully revealed; null is fine before. */
  answer: AnswerFlags | null;
};

/** A blind guess row's scored columns. A `guesses` row fits as is. */
export type BlindGuessRow = {
  wine_id: string;
  participant_id: string;
  primary_grape_id: string | null;
  country_points: number | null;
  region_points: number | null;
  appellation_points: number | null;
  primary_grape_points: number | null;
  secondary_grape_points: number | null;
  producer_points: number | null;
  type_designation_points: number | null;
  vintage_points: number | null;
  total_points: number | null;
};

/** A semi-blind guess row. A `guesses` row fits as is. */
export type SemiBlindGuessRow = {
  wine_id: string;
  participant_id: string;
  guessed_wine_id: string | null;
  total_points: number | null;
};

export type RevealState = "revealed" | "half_revealed" | "unrevealed";

/** A glass left out of every score and maximum ("Glass 5 was never revealed"). */
export type ExcludedGlass = {
  wineId: string;
  /**
   * `no_answer_key` is fail-closed: reveal_wine refuses a wine without an
   * answer key, so it only means the caller could not read one.
   */
  reason: "half_revealed" | "unrevealed" | "no_answer_key";
};

/** One counted glass, as the viewer played it. */
export type ViewerGlass = {
  wineId: string;
  /** `total_points` from the scoring engine; 0 without a row. */
  points: number;
  /** The glass's in-play maximum (1 in semi-blind). */
  max: number;
  /** False when the viewer could guess it but never saved a row; still counted, as 0. */
  hasRow: boolean;
};

export type ScoreSummary = {
  /** Sum of `glasses[].points`. */
  score: number;
  /** Sum of `glasses[].max`: the "of 180" in "93 of 180 points". */
  maximum: number;
  /** Fully revealed glasses the viewer was eligible for, in list order. */
  glasses: ViewerGlass[];
  /**
   * Fully revealed glasses the viewer could not guess (their own bottle, a
   * HOST_PROVIDES host), in list order. Never infer "You hosted" from this or
   * from `maximum === 0`: a contributor whose own bottle is the only revealed
   * glass looks the same. Decide it from the host id and `wine_source`.
   */
  notEligible: string[];
  /** Glasses left out of every score and maximum, in list order. */
  excluded: ExcludedGlass[];
  /** Sum of the maximum of every fully revealed glass, whoever could guess it. */
  flightMaximum: number;
};

/** hit = full points; near = a vintage one year out (1 of 2); miss; out = not in play on this wine. */
export type Mark = "hit" | "near" | "miss" | "out";

export type AttributeTally = Record<ResultCategory, { hits: number; inPlay: number }>;

export type StrongestAttribute = {
  category: ResultCategory;
  hits: number;
  inPlay: number;
};

/**
 * The parts of the agreed-least sentence. `pickId` is a grape id in blind, a
 * candidate wine id in semi-blind. `outOf` is the eligible guessers with a
 * row, including rows that picked nothing.
 *
 * Semi-blind: resolve `pickId` to the candidate's label on the server and
 * never send the id itself to the client. The most-picked candidate can be a
 * wine whose own glass was never revealed, and a wine id maps to its pour
 * position, which B9's opaque candidate keys exist to hide.
 * - said: the most common pick was wrong ("Five of seven said Nebbiolo").
 * - got: the most common pick was right ("{hits} of {outOf} got the grape").
 * - none: nobody with a row picked anything.
 */
export type SplitSentence =
  | { kind: "said"; pickId: string; count: number; outOf: number }
  | { kind: "got"; pickId: string; hits: number; outOf: number }
  | { kind: "none"; outOf: number };

export type AgreedLeast = {
  wineId: string;
  /** Eligible guessers with a row. */
  guessers: number;
  /** Their summed `total_points`. The mean share is points / (max × guessers). */
  points: number;
  max: number;
  sentence: SplitSentence;
};

export type TastingResult = ScoreSummary & {
  bestGlass: ViewerGlass | null;
  strongestAttribute: StrongestAttribute | null;
  agreedLeast: AgreedLeast | null;
};

export function revealState(
  glass: Pick<ResultGlass, "isRevealed" | "revealStep">,
): RevealState {
  if (glass.isRevealed) return "revealed";
  return glass.revealStep > 0 ? "half_revealed" : "unrevealed";
}

/** Whether reveal_wine scores this category for this answer key (vs. writing null). */
export function isInPlay(category: ResultCategory, answer: AnswerFlags): boolean {
  switch (category) {
    case "country":
    case "region":
    case "primary_grape":
      return true;
    case "appellation":
      return answer.appellation_id != null;
    case "secondary_grape":
      return answer.secondary_grape_id != null;
    case "producer":
      return answer.producer_id != null;
    case "type_designation":
      return answer.type_designation_id != null;
    case "vintage":
      return answer.vintage_kind != null;
  }
}

export function inPlayCategories(answer: AnswerFlags): ResultCategory[] {
  return CATEGORY_ORDER.filter((category) => isInPlay(category, answer));
}

/**
 * The per-glass maximum: 13 at the least (2 + 3 + 8), 30 with everything in
 * play. Only for a fully revealed glass (Rule 1); before that the copy stays
 * "Up to 30 points a glass".
 */
export function glassMaxPoints(answer: AnswerFlags): number {
  return inPlayCategories(answer).reduce((n, c) => n + CATEGORY_POINTS[c], 0);
}

const POINTS_COLUMN = {
  country: "country_points",
  region: "region_points",
  appellation: "appellation_points",
  primary_grape: "primary_grape_points",
  secondary_grape: "secondary_grape_points",
  producer: "producer_points",
  type_designation: "type_designation_points",
  vintage: "vintage_points",
} as const satisfies Record<ResultCategory, keyof BlindGuessRow>;

/**
 * One attribute's mark on the record. Whether it was in play comes from the
 * answer key; hit or miss from the points the engine wrote. No row, or a
 * null column on an in-play attribute, is a miss.
 */
export function categoryMark(
  category: ResultCategory,
  answer: AnswerFlags,
  row: BlindGuessRow | null,
): Mark {
  if (!isInPlay(category, answer)) return "out";
  const points = row ? row[POINTS_COLUMN[category]] : null;
  if (points === CATEGORY_POINTS[category]) return "hit";
  if (category === "vintage" && points === 1) return "near";
  return "miss";
}

/**
 * Every category's mark for one glass (RECORD-06). The record draws
 * `MARK_CATEGORIES`. Only for a glass in `ScoreSummary.glasses`: a glass in
 * `notEligible` (the viewer's own bottle) has no marks, and calling this with
 * no row would draw every in-play attribute as a miss.
 */
export function glassMarks(
  answer: AnswerFlags,
  row: BlindGuessRow | null,
): Record<ResultCategory, Mark> {
  return {
    country: categoryMark("country", answer, row),
    region: categoryMark("region", answer, row),
    appellation: categoryMark("appellation", answer, row),
    primary_grape: categoryMark("primary_grape", answer, row),
    secondary_grape: categoryMark("secondary_grape", answer, row),
    producer: categoryMark("producer", answer, row),
    type_designation: categoryMark("type_designation", answer, row),
    vintage: categoryMark("vintage", answer, row),
  };
}

type KeyedRow = {
  wine_id: string;
  participant_id: string;
  total_points: number | null;
};

type CountedGlass<A> = {
  wineId: string;
  eligible: ReadonlySet<string>;
  max: number;
  answer: A;
};

/**
 * Splits the flight into counted (fully revealed, readable) glasses and
 * excluded ones, in list order. `read` is only ever called on a fully
 * revealed glass. That is the Rule 1 guarantee.
 */
function partition<G extends ResultGlass, A>(
  glasses: readonly G[],
  read: (glass: G) => { answer: A; max: number } | null,
): { counted: CountedGlass<A>[]; excluded: ExcludedGlass[] } {
  const counted: CountedGlass<A>[] = [];
  const excluded: ExcludedGlass[] = [];
  for (const glass of glasses) {
    const state = revealState(glass);
    if (state !== "revealed") {
      excluded.push({ wineId: glass.wineId, reason: state });
      continue;
    }
    const key = read(glass);
    if (!key) {
      excluded.push({ wineId: glass.wineId, reason: "no_answer_key" });
      continue;
    }
    counted.push({
      wineId: glass.wineId,
      eligible: new Set(glass.eligibleParticipantIds),
      max: key.max,
      answer: key.answer,
    });
  }
  return { counted, excluded };
}

function readBlind(glass: BlindResultGlass) {
  const answer = glass.answer;
  return answer ? { answer, max: glassMaxPoints(answer) } : null;
}

function readSemiBlind() {
  return { answer: null, max: 1 };
}

/**
 * wine id → participant id → row, keeping the caller's row order.
 * `guesses` is unique on the pair, so the first row is the only one.
 */
function indexRows<R extends KeyedRow>(
  rows: readonly R[],
): Map<string, Map<string, R>> {
  const byWine = new Map<string, Map<string, R>>();
  for (const row of rows) {
    let byParticipant = byWine.get(row.wine_id);
    if (!byParticipant) {
      byParticipant = new Map<string, R>();
      byWine.set(row.wine_id, byParticipant);
    }
    if (!byParticipant.has(row.participant_id)) {
      byParticipant.set(row.participant_id, row);
    }
  }
  return byWine;
}

function summarise<A, R extends KeyedRow>(
  counted: readonly CountedGlass<A>[],
  excluded: ExcludedGlass[],
  rows: readonly R[],
  viewerId: string | null,
): ScoreSummary {
  const byWine = indexRows(rows);
  const glasses: ViewerGlass[] = [];
  const notEligible: string[] = [];
  let flightMaximum = 0;
  for (const glass of counted) {
    flightMaximum += glass.max;
    if (viewerId === null || !glass.eligible.has(viewerId)) {
      notEligible.push(glass.wineId);
      continue;
    }
    const row = byWine.get(glass.wineId)?.get(viewerId);
    glasses.push({
      wineId: glass.wineId,
      points: row?.total_points ?? 0,
      max: glass.max,
      hasRow: row !== undefined,
    });
  }
  return {
    score: glasses.reduce((n, g) => n + g.points, 0),
    maximum: glasses.reduce((n, g) => n + g.max, 0),
    glasses,
    notEligible,
    excluded,
    flightMaximum,
  };
}

/**
 * The viewer's blind score against the maximum of the fully revealed glasses
 * they could guess. `viewerId` is a `tasting_participants.id` (null for
 * someone with no participant row).
 */
export function blindScore(
  glasses: readonly BlindResultGlass[],
  rows: readonly BlindGuessRow[],
  viewerId: string | null,
): ScoreSummary {
  const { counted, excluded } = partition(glasses, readBlind);
  return summarise(counted, excluded, rows, viewerId);
}

/** Semi-blind: one per fully revealed glass the viewer could match, and the score is the matches. */
export function semiBlindScore(
  glasses: readonly ResultGlass[],
  rows: readonly SemiBlindGuessRow[],
  viewerId: string | null,
): ScoreSummary {
  const { counted, excluded } = partition(glasses, readSemiBlind);
  return summarise(counted, excluded, rows, viewerId);
}

/**
 * The glass with the highest share of its own maximum. Ties go to the later
 * glass. Null only when there is no counted glass; the best can still be
 * worth 0, and the caller hides the card then.
 */
export function bestGlass(glasses: readonly ViewerGlass[]): ViewerGlass | null {
  let best: ViewerGlass | null = null;
  for (const glass of glasses) {
    // points / max >= best.points / best.max, cross-multiplied so equal
    // shares tie exactly; `>=` hands the tie to the later glass.
    if (!best || glass.points * best.max >= best.points * glass.max) best = glass;
  }
  return best;
}

function emptyTally(): AttributeTally {
  return {
    country: { hits: 0, inPlay: 0 },
    region: { hits: 0, inPlay: 0 },
    appellation: { hits: 0, inPlay: 0 },
    primary_grape: { hits: 0, inPlay: 0 },
    secondary_grape: { hits: 0, inPlay: 0 },
    producer: { hits: 0, inPlay: 0 },
    type_designation: { hits: 0, inPlay: 0 },
    vintage: { hits: 0, inPlay: 0 },
  };
}

/**
 * Hits (full points) over in-play occurrences per category, across the fully
 * revealed glasses the viewer could guess. A glass they never guessed counts
 * as misses, like its 0 in the score. A vintage one year out is not a hit.
 */
export function attributeTally(
  glasses: readonly BlindResultGlass[],
  rows: readonly BlindGuessRow[],
  viewerId: string | null,
): AttributeTally {
  const tally = emptyTally();
  if (viewerId === null) return tally;
  const byWine = indexRows(rows);
  for (const glass of partition(glasses, readBlind).counted) {
    if (!glass.eligible.has(viewerId)) continue;
    const row = byWine.get(glass.wineId)?.get(viewerId) ?? null;
    for (const category of CATEGORY_ORDER) {
      const mark = categoryMark(category, glass.answer, row);
      if (mark === "out") continue;
      tally[category].inPlay += 1;
      if (mark === "hit") tally[category].hits += 1;
    }
  }
  return tally;
}

/**
 * The highest hit rate among `categories` (default: the six marked
 * attributes). Ties go to the higher weight, then to the earlier category.
 * Null when none of them was in play. A result with 0 hits means in play but
 * never hit, and the caller hides the card then (RESULT-08).
 */
export function strongestAttribute(
  tally: AttributeTally,
  categories: readonly ResultCategory[] = MARK_CATEGORIES,
): StrongestAttribute | null {
  let best: StrongestAttribute | null = null;
  for (const category of CATEGORY_ORDER) {
    if (!categories.includes(category)) continue;
    const { hits, inPlay } = tally[category];
    if (inPlay === 0) continue;
    if (best) {
      const byRate = hits * best.inPlay - best.hits * inPlay;
      const heavier = CATEGORY_POINTS[category] > CATEGORY_POINTS[best.category];
      if (byRate < 0 || (byRate === 0 && !heavier)) continue;
    }
    best = { category, hits, inPlay };
  }
  return best;
}

/**
 * The most common pick. On a tie a wrong pick beats the right one (it is what
 * split the table), then the first in the caller's row order.
 */
function splitSentence(picks: readonly (string | null)[], right: string): SplitSentence {
  const outOf = picks.length;
  const counts = new Map<string, number>();
  for (const pick of picks) {
    if (pick !== null) counts.set(pick, (counts.get(pick) ?? 0) + 1);
  }
  let top = 0;
  for (const n of counts.values()) top = Math.max(top, n);
  let chosen: string | null = null;
  for (const [pick, n] of counts) {
    if (n !== top) continue;
    if (pick !== right) {
      chosen = pick;
      break;
    }
    chosen ??= pick;
  }
  if (chosen === null) return { kind: "none", outOf };
  if (chosen === right) return { kind: "got", pickId: right, hits: top, outOf };
  return { kind: "said", pickId: chosen, count: top, outOf };
}

function agreedLeast<A, R extends KeyedRow>(
  counted: readonly CountedGlass<A>[],
  rows: readonly R[],
  pickOf: (row: R) => string | null,
  rightPickOf: (glass: CountedGlass<A>) => string,
): AgreedLeast | null {
  const byWine = indexRows(rows);
  let least: { glass: CountedGlass<A>; guessRows: R[]; points: number } | null = null;
  for (const glass of counted) {
    const guessRows = Array.from(byWine.get(glass.wineId)?.values() ?? []).filter(
      (row) => glass.eligible.has(row.participant_id),
    );
    if (guessRows.length === 0) continue;
    const points = guessRows.reduce((n, row) => n + (row.total_points ?? 0), 0);
    // Mean share = points / (max × guessers), cross-multiplied so equal
    // shares tie exactly; `<=` hands the tie to the later glass.
    if (
      !least ||
      points * least.glass.max * least.guessRows.length <=
        least.points * glass.max * guessRows.length
    ) {
      least = { glass, guessRows, points };
    }
  }
  if (!least) return null;
  return {
    wineId: least.glass.wineId,
    guessers: least.guessRows.length,
    points: least.points,
    max: least.glass.max,
    sentence: splitSentence(least.guessRows.map(pickOf), rightPickOf(least.glass)),
  };
}

/**
 * "The table agreed least on": the fully revealed glass with the lowest mean
 * share of its maximum among eligible guessers with a row. Ties go to the
 * later glass. The sentence names the most common primary-grape guess.
 * Null when no fully revealed glass has an eligible row.
 */
export function blindAgreedLeast(
  glasses: readonly BlindResultGlass[],
  rows: readonly BlindGuessRow[],
): AgreedLeast | null {
  return agreedLeast(
    partition(glasses, readBlind).counted,
    rows,
    (row) => row.primary_grape_id,
    (glass) => glass.answer.primary_grape_id,
  );
}

/** Semi-blind: the lowest match rate, and the candidate most often picked for that glass. */
export function semiBlindAgreedLeast(
  glasses: readonly ResultGlass[],
  rows: readonly SemiBlindGuessRow[],
): AgreedLeast | null {
  return agreedLeast(
    partition(glasses, readSemiBlind).counted,
    rows,
    (row) => row.guessed_wine_id,
    (glass) => glass.wineId,
  );
}

/** Everything S12 needs for a blind tasting, from one viewer's side. */
export function blindResult(
  glasses: readonly BlindResultGlass[],
  rows: readonly BlindGuessRow[],
  viewerId: string | null,
): TastingResult {
  const summary = blindScore(glasses, rows, viewerId);
  return {
    ...summary,
    bestGlass: bestGlass(summary.glasses),
    strongestAttribute: strongestAttribute(attributeTally(glasses, rows, viewerId)),
    agreedLeast: blindAgreedLeast(glasses, rows),
  };
}

/** Everything S12 needs for a semi-blind tasting. Matches carry no attributes. */
export function semiBlindResult(
  glasses: readonly ResultGlass[],
  rows: readonly SemiBlindGuessRow[],
  viewerId: string | null,
): TastingResult {
  const summary = semiBlindScore(glasses, rows, viewerId);
  return {
    ...summary,
    bestGlass: bestGlass(summary.glasses),
    strongestAttribute: null,
    agreedLeast: semiBlindAgreedLeast(glasses, rows),
  };
}
