// The training room's matcher (spec 2026-09-25-training-room-design.md §5):
// every archetype keeps a closeness score over the fields the taster has
// answered so far, and the list is sorted by it — ranking, never filtering
// (D3). Pure: relative imports only, no React, no DB, so vitest loads it and
// the room re-ranks on the device on every change (D6).
import type { WineColour, WsetNoteState } from "../wset/types";
import {
  ALCOHOL_STOPS,
  BODY_STOPS,
  DEVELOPMENT_STOPS,
  FINISH_STOPS,
  HUES_BY_COLOUR,
  INTENSITY_STOPS,
  LEVEL_STOPS,
  colourFromHue,
} from "../wset/vocab";
import {
  TRAINING_COPY,
  capReasonLine,
  groupLossLine,
  scaleLossLine,
  shortName,
  signatureLine,
} from "./copy";
import type {
  AromaLexicon,
  CapReason,
  MatchExtras,
  RankedCandidate,
  RankingSnapshot,
  TrainingCandidate,
} from "./types";

/** The matched sat keys, in the order the explanation's tie-break walks them
    (spec §4.4). clarity is stored on the live rows and never matched (D18). */
export const MATCHED_SCALES = [
  "appearanceIntensity",
  "colourHue",
  "noseIntensity",
  "development",
  "sweetness",
  "acidity",
  "tannin",
  "alcohol",
  "body",
  "mousse",
  "flavourIntensity",
  "finish",
] as const;
export type MatchedScale = (typeof MATCHED_SCALES)[number];

/** Spec §5.3. `aromas` is the group-agreement term. */
export const WEIGHTS: Record<MatchedScale | "aromas", number> = {
  sweetness: 1.5,
  tannin: 1.5,
  acidity: 1.5,
  body: 1.2,
  alcohol: 1.0,
  colourHue: 1.0,
  mousse: 1.0,
  noseIntensity: 0.8,
  flavourIntensity: 0.8,
  finish: 0.8,
  development: 0.6,
  appearanceIntensity: 0.6,
  aromas: 2.0,
};

/** Each exact signature hit adds this, at most SIGNATURE_MAX_HITS times — a
    pure bonus that never enters the denominator (D5). */
export const SIGNATURE_BONUS = 1.0;
export const SIGNATURE_MAX_HITS = 2;

/** A contradicted colour, bubbles or fortification caps closeness here (D3). */
export const CAP_MAX = 15;

/** Below this largest weighted loss the explanation praises instead (§5.7). */
export const EXPLAIN_THRESHOLD = 0.3;

// Full enum orders (spec §4.4, "since the critique"): the note sliders offer
// fewer stops on some scales (appearance: PALE / MEDIUM / DEEP; sweetness has
// no MEDIUM), but a range bound may be any enum value, so distance is taken on
// the whole enum. Kept in lockstep with the string unions in ../wset/types.
const APPEARANCE_LADDER = ["PALE", "MEDIUM_MINUS", "MEDIUM", "MEDIUM_PLUS", "DEEP"];
const SWEETNESS_LADDER = [
  "DRY",
  "OFF_DRY",
  "MEDIUM_DRY",
  "MEDIUM",
  "MEDIUM_SWEET",
  "SWEET",
  "LUSCIOUS",
];
const MOUSSE_LADDER = ["DELICATE", "CREAMY", "AGGRESSIVE"];

/**
 * The ladder a scale is measured on for this candidate, or null when the scale
 * is not matched for it: clarity and unknown keys; alcohol on a FORTIFIED
 * candidate (D19: never a distance); mousse on anything but SPARKLING. Hue is
 * the candidate colour's own hue row; unfortified alcohol is ALCOHOL_STOPS
 * (three steps, so medium → high is one step).
 */
export function ladderFor(scale: string, candidate: TrainingCandidate): string[] | null {
  switch (scale) {
    case "appearanceIntensity":
      return APPEARANCE_LADDER;
    case "colourHue":
      return HUES_BY_COLOUR[candidate.colour];
    case "noseIntensity":
    case "flavourIntensity":
      return INTENSITY_STOPS;
    case "development":
      return DEVELOPMENT_STOPS;
    case "sweetness":
      return SWEETNESS_LADDER;
    case "acidity":
    case "tannin":
      return LEVEL_STOPS;
    case "alcohol":
      return candidate.style === "FORTIFIED" ? null : ALCOHOL_STOPS;
    case "body":
      return BODY_STOPS;
    case "finish":
      return FINISH_STOPS;
    case "mousse":
      return candidate.style === "SPARKLING" ? MOUSSE_LADDER : null;
    default:
      return null;
  }
}

/** s(d): in range 1.0, one step out 0.6, two 0.2, further 0 (D4). */
export function stepScore(d: number): number {
  if (d <= 0) return 1;
  if (d === 1) return 0.6;
  if (d === 2) return 0.2;
  return 0;
}

// Steps from `value` to the nearer bound of [lo, hi] on `ladder`, and which
// bound was exceeded; null when the value or either bound is off the ladder
// (the scale is then skipped for this candidate, spec §4.4).
function distance(
  ladder: readonly string[],
  value: string,
  range: readonly [string, string],
): { d: number; direction: "higher" | "lower" | null } | null {
  const v = ladder.indexOf(value);
  const a = ladder.indexOf(range[0]);
  const b = ladder.indexOf(range[1]);
  if (v < 0 || a < 0 || b < 0) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (v < lo) return { d: lo - v, direction: "lower" };
  if (v > hi) return { d: v - hi, direction: "higher" };
  return { d: 0, direction: null };
}

function capFor(note: WsetNoteState, extras: MatchExtras, c: TrainingCandidate): CapReason | null {
  if (note.colourHue !== null && !HUES_BY_COLOUR[c.colour].includes(note.colourHue)) {
    return "colour";
  }
  if (
    (extras.bubbles === true && c.style !== "SPARKLING") ||
    (extras.bubbles === false && c.style === "SPARKLING")
  ) {
    return "bubbles";
  }
  if (
    (extras.fortified === true && c.style !== "FORTIFIED") ||
    (extras.fortified === false && c.style === "FORTIFIED")
  ) {
    return "fortified";
  }
  return null;
}

/**
 * The one explanation line of a candidate row (spec §5.7). A capped candidate
 * explains its cap. Otherwise null when nothing answered applies; else the
 * largest weighted loss (the first in MATCHED_SCALES order on a tie, aromas
 * after every scale) names a scale direction or the taster's aroma group the
 * archetype lacks; below EXPLAIN_THRESHOLD a signature hit reads
 * "✓ {term} — a signature" and no hit "Fits what you've said so far".
 * `noteColour` is `colourFromHue(note.colourHue)`, for the colour cap line.
 */
export function explain(input: {
  candidate: TrainingCandidate;
  closeness: number | null;
  capped: CapReason | null;
  signatureHits: string[];
  losses: { scale: string; loss: number; direction: "higher" | "lower" | null }[];
  aromaLoss: { loss: number; group: string | null } | null;
  noteColour?: WineColour | null;
}): string | null {
  const { candidate, capped } = input;
  if (capped !== null) {
    return capReasonLine(capped, {
      noteColour: input.noteColour ?? null,
      candidateColour: candidate.colour,
      candidateStyle: candidate.style,
    });
  }
  if (input.losses.length === 0 && input.aromaLoss === null) return null;
  let top: { kind: "scale"; scale: string; loss: number; direction: "higher" | "lower" | null } | {
    kind: "aroma";
    loss: number;
    group: string | null;
  } | null = null;
  for (const l of input.losses) {
    if (top === null || l.loss > top.loss) top = { kind: "scale", ...l };
  }
  if (input.aromaLoss && (top === null || input.aromaLoss.loss > top.loss)) {
    top = { kind: "aroma", ...input.aromaLoss };
  }
  if (top === null || top.loss < EXPLAIN_THRESHOLD) {
    return input.signatureHits.length > 0
      ? signatureLine(input.signatureHits[0])
      : TRAINING_COPY.fitsSoFar;
  }
  if (top.kind === "aroma") {
    return top.group ? groupLossLine(top.group) : TRAINING_COPY.fitsSoFar;
  }
  // A loss ≥ 0.3 always comes from a distance > 0, so direction is set.
  return top.direction ? scaleLossLine(top.scale, top.direction) : TRAINING_COPY.fitsSoFar;
}

function scoreOne(
  note: WsetNoteState,
  extras: MatchExtras,
  c: TrainingCandidate,
  lexicon: AromaLexicon,
  noteTermIds: string[],
): RankedCandidate {
  let num = 0;
  let den = 0;
  const losses: { scale: string; loss: number; direction: "higher" | "lower" | null }[] = [];

  for (const scale of MATCHED_SCALES) {
    const value = note[scale];
    if (value === null) continue;
    // D19: fortification is never a distance — skip alcohol on either side.
    if (scale === "alcohol" && (extras.fortified === true || c.style === "FORTIFIED")) continue;
    const range = c.sat[scale];
    if (!range) continue; // a scale the archetype does not carry leaves both sums
    const ladder = ladderFor(scale, c);
    if (!ladder) continue;
    const dist = distance(ladder, value, range);
    if (!dist) continue; // off-ladder hue, bound or answer: skipped
    const w = WEIGHTS[scale];
    const s = stepScore(dist.d);
    num += w * s;
    den += w;
    losses.push({ scale, loss: w * (1 - s), direction: dist.direction });
  }

  // Aromas (§5.5): the share of the taster's groups the archetype also carries.
  let aromaLoss: { loss: number; group: string | null } | null = null;
  const perGroup = new Map<string, number>();
  for (const id of noteTermIds) {
    const entry = lexicon[id];
    if (entry) perGroup.set(entry.group, (perGroup.get(entry.group) ?? 0) + 1);
  }
  if (perGroup.size > 0 && c.aromas.length > 0) {
    const archGroups = new Set(c.aromas.map((a) => a.group));
    const shared = [...perGroup.keys()].filter((g) => archGroups.has(g)).length;
    const a = shared / perGroup.size;
    num += WEIGHTS.aromas * a;
    den += WEIGHTS.aromas;
    // The taster's group the archetype lacks with the most picked terms;
    // ties by group name.
    const missing = [...perGroup.entries()]
      .filter(([g]) => !archGroups.has(g))
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], "en"));
    aromaLoss = { loss: WEIGHTS.aromas * (1 - a), group: missing[0]?.[0] ?? null };
  }

  // Signature hits: the taster's exact term ids ∩ the archetype's signature
  // terms, each term once, in the archetype's aroma order.
  const picked = new Set(noteTermIds);
  const hitIds = new Set<string>();
  const signatureHits: string[] = [];
  for (const a of c.aromas) {
    if (a.signature && picked.has(a.termId) && !hitIds.has(a.termId)) {
      hitIds.add(a.termId);
      signatureHits.push(a.term);
    }
  }
  const bonus = SIGNATURE_BONUS * Math.min(signatureHits.length, SIGNATURE_MAX_HITS);

  let closeness: number | null =
    den === 0 ? null : Math.min(100, Math.round((100 * (num + bonus)) / den));
  const capped = capFor(note, extras, c);
  if (capped !== null && closeness !== null) closeness = Math.min(closeness, CAP_MAX);

  const explanation = explain({
    candidate: c,
    closeness,
    capped,
    signatureHits,
    losses,
    aromaLoss,
    noteColour: colourFromHue(note.colourHue),
  });
  return { candidate: c, closeness, capped, explanation, signatureHits };
}

function byName(a: TrainingCandidate, b: TrainingCandidate): number {
  return shortName(a.name).localeCompare(shortName(b.name), "en") || a.id.localeCompare(b.id);
}

// §5.8: uncapped with a number (closeness desc), then uncapped nulls
// (country, then name), then capped (closeness desc, nulls last); ties by
// shortName, then id so the order is total.
function bucket(r: RankedCandidate): number {
  if (r.capped !== null) return 2;
  return r.closeness === null ? 1 : 0;
}

function compareRanked(x: RankedCandidate, y: RankedCandidate): number {
  const bx = bucket(x);
  const by = bucket(y);
  if (bx !== by) return bx - by;
  if (bx === 1) {
    return (
      x.candidate.country.name.localeCompare(y.candidate.country.name, "en") ||
      byName(x.candidate, y.candidate)
    );
  }
  if (x.closeness !== y.closeness) {
    if (x.closeness === null) return 1;
    if (y.closeness === null) return -1;
    return y.closeness - x.closeness;
  }
  return byName(x.candidate, y.candidate);
}

/** Every candidate, scored and sorted (spec §5). Nothing is removed (D3). */
export function rankCandidates(
  note: WsetNoteState,
  extras: MatchExtras,
  pool: TrainingCandidate[],
  lexicon: AromaLexicon,
): RankedCandidate[] {
  const noteTermIds = [...new Set([...note.noseTermIds, ...note.palateTermIds])];
  return pool
    .map((c) => scoreOne(note, extras, c, lexicon, noteTermIds))
    .sort(compareRanked);
}

/** The whole ranking, frozen for the attempt (spec §5.8): rank is 1-based. */
export function snapshotRanking(ranked: RankedCandidate[]): RankingSnapshot {
  return ranked.map((r, i) => ({
    archetypeId: r.candidate.id,
    name: r.candidate.name,
    closeness: r.closeness,
    rank: i + 1,
    capped: r.capped,
  }));
}
