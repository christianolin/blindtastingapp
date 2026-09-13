import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";
import { countWord } from "./count-words";
import type { ExcludedGlass, ResultCategory, SplitSentence } from "./result-math";
import { ordinal } from "./stats-math";
import { DESIGNATION_SUFFIXES, foldWords } from "./wine-identity/fold";

// Copy for the result (S12 phone, S12b laptop) and the headings and legend the
// record shares (S13, S13b): spec §11.3 items 10, 11 and 13. Exact handoff and
// spec copy; strings the plan had to add are marked (plan copy). The numbers
// come from `result-math.ts`; nothing here scores or ranks. Pure: relative
// runtime imports only (`@/` for types), so vitest loads it without the alias.

const isText = (value: string | null | undefined): value is string =>
  value != null && value.trim() !== "";

// "a" · "a and b" · "a, b and c" (no serial comma).
function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// Semi-blind counts matches; blind (and a legacy OPEN tasting) counts points.
const scoreUnit = (mode: RevealMode) => (mode === "SEMI_BLIND" ? "matched" : "points");

// ── The placing ──────────────────────────────────────────────────────────────

export const YOU_FINISHED = "You finished";

export function resultEyebrow(tasting: string): string {
  return `${tasting} · finished`;
}

/**
 * The placing at full size ("2nd"; "=1st" when tied, as the standings' rank
 * label marks a tie) and the line under it: "of 7 · 93 of 180 points", or
 * "of 5 · 4 of 6 matched" in semi-blind (spec copy).
 */
export function placingLines(p: {
  mode: RevealMode;
  rank: number;
  tied: boolean;
  competitors: number;
  score: number;
  maximum: number;
}): { ordinal: string; line: string } {
  return {
    ordinal: `${p.tied ? "=" : ""}${ordinal(p.rank)}`,
    line: `of ${p.competitors} · ${p.score} of ${p.maximum} ${scoreUnit(p.mode)}`,
  };
}

/**
 * A host-provides host is not a competitor: "You hosted", then who won —
 * "Maja won with 27 points", or "Maja and Gustav shared first with 27 points"
 * on a tie (spec copy). Semi-blind counts matches (plan copy). One point or
 * one match reads in the singular. With no winner (nobody competed) the line
 * is empty and the caller leaves it out.
 */
export function hostedLines(h: {
  winners: readonly string[];
  points: number;
  mode: RevealMode;
}): { title: string; line: string } {
  const title = "You hosted";
  if (h.winners.length === 0) return { title, line: "" };
  const amount =
    h.mode === "SEMI_BLIND"
      ? `${h.points} ${h.points === 1 ? "match" : "matches"}` // (plan copy)
      : `${h.points} ${h.points === 1 ? "point" : "points"}`;
  const line =
    h.winners.length === 1
      ? `${h.winners[0]} won with ${amount}`
      : `${joinAnd(h.winners)} shared first with ${amount}`;
  return { title, line };
}

// ── The cards (blind) ────────────────────────────────────────────────────────

/** "26 / 30" and "Glass 6 · Le Pergole Torte". */
export function bestGlassLines(b: {
  points: number;
  max: number;
  glass: number;
  name: string;
}): { score: string; name: string } {
  return {
    score: `${b.points} / ${b.max}`,
    name: isText(b.name) ? `Glass ${b.glass} · ${b.name}` : `Glass ${b.glass}`,
  };
}

const STRONGEST_LABEL: Readonly<Record<ResultCategory, string>> = {
  country: "Countries",
  region: "Regions",
  appellation: "Appellations",
  primary_grape: "Grapes",
  secondary_grape: "Second grapes",
  producer: "Producers",
  type_designation: "Designations",
  vintage: "Vintages",
};

/** "Grapes right", "4 of 6", "your best category". */
export function strongestLines(s: {
  category: ResultCategory;
  hits: number;
  inPlay: number;
}): { title: string; detail: string; caption: string } {
  return {
    title: `${STRONGEST_LABEL[s.category]} right`,
    detail: `${s.hits} of ${s.inPlay}`,
    caption: "your best category",
  };
}

// ── Glass names ──────────────────────────────────────────────────────────────

/**
 * A bring-your-own glass is "{contributor}'s {short name}" ("Gustav's Brunello
 * di Montalcino"); a host-provides glass, or one with no contributor, is the
 * short name. A short name can only be empty for an answer key with no name,
 * appellation or producer, which live data never has; the contributor's glass
 * then keeps `makeWineLabeler`'s "{contributor}'s wine".
 */
export function glassTitle(g: {
  wineSource: WineSourceMode;
  contributor: string | null;
  shortName: string;
}): string {
  if (g.wineSource === "PARTICIPANT_CONTRIBUTED" && isText(g.contributor)) {
    return isText(g.shortName) ? `${g.contributor}'s ${g.shortName}` : `${g.contributor}'s wine`;
  }
  return g.shortName;
}

const DESIGNATIONS = new Set(DESIGNATION_SUFFIXES);

/**
 * The name a glass goes by: the catalog wine name, else the appellation
 * without its geographic designation ("Barbaresco DOCG" → "Barbaresco"), else
 * the producer. Display case is kept. Only one trailing designation word is
 * cut, and a one-word appellation is never cut to nothing (the rule of
 * `stripDesignationSuffix`, which folds the case away).
 */
export function shortWineName(w: {
  wineName: string | null;
  appellation: string | null;
  producer: string | null;
}): string {
  if (isText(w.wineName)) return w.wineName.trim();
  if (isText(w.appellation)) {
    const appellation = w.appellation.trim();
    const parts = /^(.*\S)\s+(\S+)$/.exec(appellation);
    return parts && DESIGNATIONS.has(foldWords(parts[2])) ? parts[1] : appellation;
  }
  return isText(w.producer) ? w.producer.trim() : "";
}

// ── The table agreed least on ────────────────────────────────────────────────

/**
 * "Glass 4 — Gustav's Brunello di Montalcino. Five of seven said Nebbiolo."
 * The count words are capitalised at the start of the sentence, numerals above
 * ten. `pickLabel` is the most common pick already resolved to a name — a
 * grape in blind, a candidate label in semi-blind (never a key or an id).
 *
 * - said: the most common pick was wrong ("… said {pick}").
 * - got: it was right — "… got the grape" in blind, "… got it" in semi-blind
 *   (spec copy).
 * - none: nobody with a row picked anything, so the line only names the glass
 *   (plan copy). A "said" with no label to name reads the same way.
 */
export function agreedLeastLine(a: {
  glass: number;
  title: string;
  mode: RevealMode;
  sentence: SplitSentence;
  pickLabel: string | null;
}): string {
  const head = isText(a.title) ? `Glass ${a.glass} — ${a.title}.` : `Glass ${a.glass}.`;
  const s = a.sentence;
  switch (s.kind) {
    case "said":
      return isText(a.pickLabel)
        ? `${head} ${countWord(s.count, { capital: true })} of ${countWord(s.outOf)} said ${a.pickLabel}.`
        : head;
    case "got": {
      const what = a.mode === "SEMI_BLIND" ? "got it" : "got the grape";
      return `${head} ${countWord(s.hits, { capital: true })} of ${countWord(s.outOf)} ${what}.`;
    }
    case "none":
      return head; // (plan copy) "Glass {n} — {title}."
  }
}

// ── Excluded glasses ─────────────────────────────────────────────────────────

/**
 * The glasses left out of every score and maximum, one line per kind: "Glass 4
 * was only partly revealed" (spec copy) first, then "Glasses 5 and 6 were never
 * revealed" — the order the End-tasting confirm names them in. A glass whose
 * answer key could not be read counts as never revealed; it fails closed the
 * same way (`ExcludedGlass`). Glass numbers are listed in ascending order.
 */
export function excludedLines(
  glasses: readonly { glass: number; reason: ExcludedGlass["reason"] }[],
): string[] {
  const partly = glasses.filter((g) => g.reason === "half_revealed").map((g) => g.glass);
  const never = glasses.filter((g) => g.reason !== "half_revealed").map((g) => g.glass);
  const line = (nums: number[], what: string) => {
    const one = nums.length === 1;
    const listed = joinAnd([...nums].sort((x, y) => x - y).map(String));
    return `${one ? "Glass" : "Glasses"} ${listed} ${one ? "was" : "were"} ${what}`;
  };
  const lines: string[] = [];
  if (partly.length > 0) lines.push(line(partly, "only partly revealed"));
  if (never.length > 0) lines.push(line(never, "never revealed"));
  return lines;
}

// ── Share ────────────────────────────────────────────────────────────────────

export type ShareInput =
  | {
      kind: "placed";
      mode: RevealMode;
      ordinal: string;
      competitors: number;
      tasting: string;
      score: number;
      maximum: number;
    }
  | { kind: "hosted"; tasting: string; winners: readonly string[] };

/**
 * The one line `navigator.share` sends with the results URL (spec copy):
 * "2nd of 7 at {tasting} — 93 of 180 points", semi-blind "… — 4 of 6
 * matched", a host "{tasting} — Maja won". Tied winners are named together
 * ("Maja and Gustav won"); with no winner the line is the tasting name alone.
 */
export function shareText(s: ShareInput): string {
  if (s.kind === "hosted") {
    return s.winners.length > 0 ? `${s.tasting} — ${joinAnd(s.winners)} won` : s.tasting;
  }
  return `${s.ordinal} of ${s.competitors} at ${s.tasting} — ${s.score} of ${s.maximum} ${scoreUnit(s.mode)}`;
}

export function shareLabel(opts: { phone: boolean }): string {
  return opts.phone ? "Share the result" : "Share";
}

/** Shown inline for 3 seconds after the clipboard fallback. */
export const LINK_COPIED = "Link copied";
/** The gold primary: dismisses the result and shows the record. */
export const SEE_EVERY_WINE = "See every wine";
/** S12b laptop table heading. */
export const FINAL_STANDINGS = "Final standings";
/** S13 rows heading. */
export const GLASS_BY_GLASS = "Glass by glass";

/** The record's mark legend: laptop "you had it" / "you missed"; phone "had it" / "missed". */
export function legendLabels(opts: { phone: boolean }): { hit: string; miss: string } {
  return opts.phone
    ? { hit: "had it", miss: "missed" }
    : { hit: "you had it", miss: "you missed" };
}
