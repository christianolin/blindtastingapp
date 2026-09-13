import { countWord } from "./count-words";
import { CATEGORY_ORDER, CATEGORY_POINTS, type ResultCategory } from "./result-math";

// The record's pattern sentence (S13; RECORD-11; spec §11.3 item 15): what the
// viewer got right on every glass tonight, what they got least, and whether at
// least two earlier tastings show the same shape. The rates come from the
// caller (`record-history.ts`, BT-R3); this module only compares them.
// Pure: relative imports only.

export type CategoryRate = { category: ResultCategory; hits: number; inPlay: number };

export type RecordPattern = {
  /** Every in-play glass hit tonight, in `CATEGORY_ORDER`. */
  everyTime: ResultCategory[];
  /** Tonight's lowest hit rate among the other in-play categories. */
  weakest: CategoryRate;
  /** How many earlier tastings back the pattern (at least 2). */
  backedBy: number;
};

/** "Every time" needs this many in-play glasses tonight. */
const MIN_EVERY_TIME_IN_PLAY = 3;
/** Earlier tastings that must back the pattern before it is shown. */
const MIN_BACKERS = 2;

// Rates are compared cross-multiplied, so the thresholds are exact: 2 of 6 is
// "at most a third", 4 of 5 is "at least 0.8".
const atMostAThird = (r: CategoryRate) => 3 * r.hits <= r.inPlay;
const atLeastFourFifths = (r: CategoryRate) => 5 * r.hits >= 4 * r.inPlay;
const atMost34Percent = (r: CategoryRate) => 100 * r.hits <= 34 * r.inPlay;

/** The category's rate when it was in play; the first entry wins. */
function inPlayRate(rates: readonly CategoryRate[], category: ResultCategory): CategoryRate | null {
  const rate = rates.find((r) => r.category === category);
  return rate && rate.inPlay > 0 ? rate : null;
}

/**
 * An earlier tasting backs the pattern when every "every time" category was in
 * play there at a rate of at least 0.8, and the weakest category was in play at
 * a rate of at most 0.34. A category that was not in play proves nothing, so
 * it never backs.
 */
function backs(
  tasting: readonly CategoryRate[],
  everyTime: readonly ResultCategory[],
  weakest: ResultCategory,
): boolean {
  const weak = inPlayRate(tasting, weakest);
  if (!weak || !atMost34Percent(weak)) return false;
  return everyTime.every((category) => {
    const rate = inPlayRate(tasting, category);
    return rate !== null && atLeastFourFifths(rate);
  });
}

/**
 * The pattern, or null:
 * - "every time" = the categories hit on every in-play glass tonight, with at
 *   least three in play;
 * - "weakest" = the lowest hit rate among the other in-play categories, and
 *   only when it is at most a third. Equal rates go to the heavier category
 *   (the weakness that costs more), then to the earlier one — the mirror of
 *   `strongestAttribute`;
 * - shown only when both exist and at least two earlier tastings back it.
 */
export function recordPattern(
  current: readonly CategoryRate[],
  earlier: readonly (readonly CategoryRate[])[],
): RecordPattern | null {
  const inPlay = CATEGORY_ORDER.flatMap((category) => {
    const rate = inPlayRate(current, category);
    return rate ? [rate] : [];
  });

  const everyTime = inPlay
    .filter((r) => r.inPlay >= MIN_EVERY_TIME_IN_PLAY && r.hits === r.inPlay)
    .map((r) => r.category);
  if (everyTime.length === 0) return null;

  let weakest: CategoryRate | null = null;
  for (const rate of inPlay) {
    if (everyTime.includes(rate.category)) continue;
    if (weakest) {
      const higher = rate.hits * weakest.inPlay - weakest.hits * rate.inPlay;
      const heavier = CATEGORY_POINTS[rate.category] > CATEGORY_POINTS[weakest.category];
      if (higher > 0 || (higher === 0 && !heavier)) continue;
    }
    weakest = rate;
  }
  if (!weakest || !atMostAThird(weakest)) return null;

  const weakCategory = weakest.category;
  const backedBy = earlier.filter((tasting) => backs(tasting, everyTime, weakCategory)).length;
  if (backedBy < MIN_BACKERS) return null;

  return {
    everyTime,
    weakest: { category: weakest.category, hits: weakest.hits, inPlay: weakest.inPlay },
    backedBy,
  };
}

const NOUN: Readonly<Record<ResultCategory, string>> = {
  country: "country",
  region: "region",
  appellation: "the appellation",
  primary_grape: "the grape",
  secondary_grape: "the second grape",
  producer: "the producer",
  type_designation: "the designation",
  vintage: "the vintage",
};

// "never in six" · "once in six" · "twice in six" · "three times in six"
function timesIn(hits: number, inPlay: number): string {
  const outOf = countWord(inPlay);
  if (hits === 0) return `never in ${outOf}`;
  if (hits === 1) return `once in ${outOf}`;
  if (hits === 2) return `twice in ${outOf}`; // (plan copy)
  return `${countWord(hits)} times in ${outOf}`; // (plan copy)
}

/**
 * "Country and region every time, the producer once in six. That pattern is
 * now three tastings old — it shows up in your numbers too." Tonight counts as
 * one of the tastings, so the age is `backedBy + 1`, in words.
 */
export function patternSentence(pattern: RecordPattern): string {
  const every = joinAnd(pattern.everyTime.map((category) => NOUN[category]));
  const lead = every.charAt(0).toUpperCase() + every.slice(1);
  const { category, hits, inPlay } = pattern.weakest;
  return `${lead} every time, ${NOUN[category]} ${timesIn(hits, inPlay)}. That pattern is now ${countWord(pattern.backedBy + 1)} tastings old — it shows up in your numbers too.`;
}

// "a" · "a and b" · "a, b and c" (no serial comma).
function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
