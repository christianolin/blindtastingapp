// Every string the training room shows (spec 2026-09-25-training-room-design.md
// §9, English only — D20), and the pure helpers that fill its templates. Pure:
// relative imports only, no React, no DB, no browser globals, so vitest loads it.
import { foldName } from "../wine-identity/fold";
import type { WineColour, WineStyle } from "../wset/types";
import { LABELS } from "../wset/vocab";
import type {
  AttemptRow,
  CapReason,
  PointCategory,
  RankedCandidate,
  RegionGroup,
  TrainingCandidate,
  VintageGuess,
} from "./types";

/** The strip's "more close" window: other uncapped candidates within this many
    points of the leader (spec §9, strip). */
export const CLOSE_WINDOW = 10;

/** The fixed strings, verbatim from spec §9. Templated lines are functions below. */
export const TRAINING_COPY = {
  // nav label / pill
  navLabel: "Training Room",
  previewPill: "Preview",
  // the page's app bar (and, with " · Blindr", its browser title)
  appBarTitle: "Training room",
  // landing
  loading: "Setting up the training room…",
  eyebrow: "Training room · Preview",
  title: "Taste blind. Then find out.",
  promise:
    "Pour a glass whose label you can't see. Describe it, watch the list tell you what it could be, then reveal the bottle.",
  coverageEmpty: "No typical wines yet — the room opens once the first batch lands.",
  start: "Start a session",
  discard: "Discard",
  discardArmed: "Tap again to discard",
  // session
  footerAction: "Your call →",
  candidatesHeading: "What it could be",
  beforeAnswers: "Start describing the wine",
  nothingFits: "Nothing fits yet — check colour and bubbles",
  unlikelyGroup: "Unlikely from what you've said",
  // the phone candidates sheet's header buttons (accessible names)
  back: "Back",
  close: "Close",
  // explanation tails: "{Scale} higher than typical" / "{Scale} lower than typical"
  higherThanTypical: "higher than typical",
  lowerThanTypical: "lower than typical",
  // explanation lines without a template
  colourDarker: "Colour darker than typical",
  colourLighter: "Colour lighter than typical",
  fitsSoFar: "Fits what you've said so far",
  // cap reasons without a template
  capBubbles: "Bubbles noted",
  capNoBubbles: "No bubbles noted",
  capFortified: "Fortified",
  capNotFortified: "Not fortified",
  // your call
  yourCall: "Your call",
  notInList: "It's not in the list",
  // your call by region (region-guess addendum R5, R10)
  whichRegion: "Which region is it?",
  searchRegions: "Search regions…",
  goDeeper: "Go deeper (optional)",
  justTheRegion: "Just the region",
  grapeOptional: "Grape (optional)",
  otherGrape: "Other grape…",
  searchGrapes: "Search grapes…",
  vintageOptional: "Vintage (optional)",
  // the vintage picker, word for word the guess ladder's (guess-ladder.tsx)
  vintageYearGroup: "Year",
  vintageNvGroup: "Non-vintage",
  vintageNv: "NV",
  vintageTawnyGroup: "Tawny",
  vintageOtherAge: "Other age…",
  tawnyAgeLabel: "Tawny age (years)",
  tawnyAgePlaceholder: "e.g. 25",
  tawnyAgeCancel: "Cancel",
  tawnyAgeSet: "Set age",
  revealBottle: "Reveal the bottle",
  cantFindOut: "I can't find out",
  // reveal sheet (the add-wine note matrix, reveal variant)
  revealEyebrow: "Reveal the bottle",
  revealTitle: "Which bottle was it?",
  revealRowAction: "This is it",
  revealPrimary: "This is it",
  revealEnterHint: "↵ reveals the first hit",
  revealByHandPrimary: "This is it",
  // the reveal sheet's laptop upload zone and "From my cellar" tile tail
  revealUploadBody: "Read and matched exactly as it is on the phone, then your result shows.",
  revealCellarSubtitle: "if the bottle came from your cellar",
  // result
  noPick: "You didn't pick a wine",
  wherePointed: "Where your note pointed",
  notInPool: "This style isn't in the pool yet",
  notRevealed: "Not revealed — your note is kept. Reveal now from Your sessions.",
  anotherGlass: "Another glass",
  seeNote: "See the note",
  done: "Done",
  // result rows' marks
  markHit: "✓",
  markMiss: "✗",
  markNotApplicable: "—",
  // history
  yourSessions: "Your sessions",
  notRevealedShort: "Not revealed",
  revealNow: "Reveal now",
  showMore: "Show more",
  noSessions: "No sessions yet",
  // deleting a session (owner, 2026-09-27): a two-tap confirm, since the
  // session's tasting note goes with it (training_attempts.note_id cascades)
  deleteSession: "Delete session",
  deleteSessionArmed: "Tap again to delete",
  deleteSessionHint: "Deleting a session also deletes its tasting note.",
  deleteSessionFailed: "Not deleted. Try again.",
  // badges
  trainingBadge: "Training",
  unrevealedBadge: "Training room · not revealed",
  // unreadable / gone wine
  unreadableWine: "a wine you can't see yet",
} as const;

/** The result table's seven rows, in order (spec §3.5, §9 "result rows"). */
export const RESULT_ROW_ORDER: readonly PointCategory[] = [
  "country",
  "region",
  "appellation",
  "primaryGrape",
  "secondaryGrape",
  "typeDesignation",
  "vintage",
];

export const RESULT_ROW_LABELS: Record<PointCategory, string> = {
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  primaryGrape: "Grape",
  secondaryGrape: "Second grape",
  typeDesignation: "Designation",
  vintage: "Vintage",
};

/** ✓ when the category earned points, ✗ when it applied and earned none, — when
    it did not apply (null). */
export function resultMark(points: number | null): string {
  if (points === null) return TRAINING_COPY.markNotApplicable;
  return points > 0 ? TRAINING_COPY.markHit : TRAINING_COPY.markMiss;
}

/** The "{Scale}" word of an explanation line, per matched sat key (the admin
    editor's row labels). colourHue has its own darker/lighter lines. */
export const SCALE_LABELS: Record<string, string> = {
  appearanceIntensity: "Appearance intensity",
  colourHue: "Colour",
  noseIntensity: "Nose intensity",
  development: "Development",
  sweetness: "Sweetness",
  acidity: "Acidity",
  tannin: "Tannin",
  alcohol: "Alcohol",
  body: "Body",
  mousse: "Mousse",
  flavourIntensity: "Flavour intensity",
  finish: "Finish",
};

/** Strips a leading "A typical " (any case); otherwise the name unchanged. */
export function shortName(name: string): string {
  const m = /^a typical /i.exec(name);
  return m ? name.slice(m[0].length) : name;
}

// "France" · "France and Italy" · "France, Italy and Spain"
function listAll(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The landing's coverage line (spec §3.2, §9). Countries by count desc, then
 * name; four named and "and more" when there are five or more; fewer than
 * five all named, no "and more"; one country "{n} typical wines so far — {c1}.
 * More each week."; an empty pool its own sentence (the room hides Start).
 */
export function coverageLine(
  countries: readonly { name: string; count: number }[],
  total: number,
): string {
  if (total <= 0 || countries.length === 0) return TRAINING_COPY.coverageEmpty;
  const sorted = [...countries].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "en"),
  );
  const names = sorted.map((c) => c.name);
  const head = `${total} typical ${total === 1 ? "wine" : "wines"} so far — `;
  if (names.length >= 5) return `${head}${names.slice(0, 4).join(", ")} and more. More each week.`;
  return `${head}${listAll(names)}. More each week.`;
}

/**
 * The phone strip under the sheet's bar (spec §3.3, §9; region-guess addendum
 * R4): "Top match: Bourgogne · Chablis Premier Cru 100 % · 3 more close" — the
 * leading wine's region, then the wine (the region alone when the wine's short
 * name is the region's own, folded: "Top match: Champagne 88 %"). `ranked` is
 * rankCandidates' output, already in §5.8 order (uncapped numbered first); k
 * counts the other uncapped wines within CLOSE_WINDOW of the leader.
 *
 * The leader is the list's top group's best wine (R3), not simply the ranking's
 * first: rankCandidates breaks a tie by wine name, groupRanking (groups.ts
 * byPlace) by country, then region, then region id. So among the uncapped wines
 * at the top closeness, the one whose place sorts first leads; within one
 * region the earliest (that group's best) is kept.
 */
export function stripLine(ranked: readonly RankedCandidate[]): string {
  if (ranked.length === 0) return TRAINING_COPY.beforeAnswers;
  const first = ranked.find((r) => r.capped === null);
  if (!first) return TRAINING_COPY.nothingFits;
  if (first.closeness === null) return TRAINING_COPY.beforeAnswers;
  const top = first.closeness;
  const leader = ranked
    .filter((r) => r.capped === null && r.closeness === top)
    .reduce((a, b) => (byPlace(b, a) < 0 ? b : a));
  const k = ranked.filter(
    (r) =>
      r !== leader &&
      r.capped === null &&
      r.closeness !== null &&
      top - r.closeness <= CLOSE_WINDOW,
  ).length;
  const wine = shortName(leader.candidate.name);
  const region = leader.candidate.region.name;
  const label = foldName(wine) === foldName(region) ? wine : `${region} · ${wine}`;
  const head = `Top match: ${label} ${top} %`;
  return k === 0 ? head : `${head} · ${k} more close`;
}

// groups.ts's byPlace on a wine's own place, so the strip's tie-break is the
// list's (groups.ts imports this module, so it is not imported from there).
function byPlace(x: RankedCandidate, y: RankedCandidate): number {
  return (
    x.candidate.country.name.localeCompare(y.candidate.country.name, "en") ||
    x.candidate.region.name.localeCompare(y.candidate.region.name, "en") ||
    x.candidate.region.id.localeCompare(y.candidate.region.id)
  );
}

/** A region group's name with its country: "Bourgogne, France" (R1). */
export function regionLabel(g: { region: { name: string }; country: { name: string } }): string {
  return `${g.region.name}, ${g.country.name}`;
}

/** "best: {shortName}" (R3). */
export function bestLine(wineShortName: string): string {
  return `best: ${wineShortName}`;
}

/** A group row's second line: its best wine, once the list has numbers — before
    any answer there is no "best" (R3), so the row has no second line. */
export function groupSubLine(g: RegionGroup): string | null {
  return g.closeness === null ? null : bestLine(shortName(g.best.candidate.name));
}

/** "Show all {n} regions" (R3). */
export function showAllRegionsLine(n: number): string {
  return `Show all ${n} regions`;
}

/** "{Appellation} · {Region}, {Country} · {grapes}"; a regional appellation
    drops its own part: "{Region}, {Country} · {grapes}" (D11, §9). */
export function lineageLine(c: TrainingCandidate): string {
  const grapes = [c.primaryGrape.name, c.secondaryGrape?.name]
    .filter((g): g is string => Boolean(g))
    .join(", ");
  const place = `${c.region.name}, ${c.country.name}`;
  const origin = c.appellation.isRegional ? place : `${c.appellation.name} · ${place}`;
  return `${origin} · ${grapes}`;
}

/** "{n} of {m}" */
export function resultTotalLine(total: number, possible: number): string {
  return `${total} of ${possible}`;
}

/**
 * "{n} of {m} right on the grape · {k} on the appellation" — n grape hits, m
 * scored attempts, k appellation hits. Empty when nothing has been scored yet:
 * the history then hides the line (and shows "No sessions yet" only when it
 * has no rows at all).
 */
export function tallyLine(t: { scored: number; grapeHits: number; appellationHits: number }): string {
  if (t.scored === 0) return "";
  return `${t.grapeHits} of ${t.scored} right on the grape · ${t.appellationHits} on the appellation`;
}

/** The line under "Your sessions": "No sessions yet" before any attempt, then
    the tally — empty (the landing then renders no line) until one is scored. */
export function sessionsLine(
  hasRows: boolean,
  t: { scored: number; grapeHits: number; appellationHits: number },
): string {
  return hasRows ? tallyLine(t) : TRAINING_COPY.noSessions;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateParts(iso: string, timeZone: string | undefined) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: get("day"), month: Number(get("month")), hour: get("hour"), minute: get("minute") };
}

/** "24 Sep" in the viewer's zone (or `timeZone`). A fixed month table, not
    Intl's short month, which reads "Sept" under en-GB. */
export function shortDate(iso: string, timeZone?: string): string {
  const p = dateParts(iso, timeZone);
  return `${p.day} ${MONTHS[p.month - 1]}`;
}

/** "20:14" in the viewer's zone (or `timeZone`). */
export function clockTime(iso: string, timeZone?: string): string {
  const p = dateParts(iso, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** "Continue your session · started {time}" */
export function continueLine(time: string): string {
  return `Continue your session · started ${time}`;
}

/** "Unknown wine · started {time}" — the session sheet's title. */
export function sheetTitle(time: string): string {
  return `Unknown wine · started ${time}`;
}

/** A candidate's closeness as the strip and the rows write it: "91 %" (a
    space before the sign, as §9 does); empty when it has no number. */
export function percentLabel(n: number | null): string {
  return n === null ? "" : `${n} %`;
}

/** The guessed vintage as the guess ladder words it: "2016", "NV",
    "20 years tawny"; null when no vintage was guessed. */
export function vintageGuessLabel(v: VintageGuess): string | null {
  if (v === null) return null;
  if (v.kind === "YEAR") return String(v.year);
  if (v.kind === "NV") return TRAINING_COPY.vintageNv;
  return `${v.years} years tawny`;
}

/** A tawny age in the vintage picker: "20 years" (the guess ladder's words). */
export function tawnyAgeOption(years: number): string {
  return `${years} years`;
}

/** "You said {shortName}{, vintage}" */
export function youSaidLine(pickName: string, vintage: VintageGuess): string {
  const v = vintageGuessLabel(vintage);
  return `You said ${shortName(pickName)}${v ? `, ${v}` : ""}`;
}

/** "You said {region} · {grape}{, vintage}" / "You said {region}{, vintage}" —
    a pick that stopped at the region (R8). */
export function youSaidRegionLine(region: string, grape: string | null, vintage: VintageGuess): string {
  const v = vintageGuessLabel(vintage);
  return `You said ${region}${grape ? ` · ${grape}` : ""}${v ? `, ${v}` : ""}`;
}

/**
 * What the taster said (R8): a typical wine "You said Pauillac{, vintage}", a
 * region "You said Bourgogne · Chardonnay{, vintage}" or "You said
 * Bourgogne{, vintage}", else "You didn't pick a wine". The history row passes
 * no vintage — its line never showed one.
 */
export function pickSaidLine(
  row: Pick<AttemptRow, "picked" | "pickedRegion" | "pickedGrape">,
  vintage: VintageGuess,
): string {
  if (row.picked) return youSaidLine(row.picked.name, vintage);
  if (row.pickedRegion) return youSaidRegionLine(row.pickedRegion.name, row.pickedGrape?.name ?? null, vintage);
  return TRAINING_COPY.noPick;
}

/** "It was {wine}"; an unreadable wine reads "a wine you can't see yet". */
export function itWasLine(wine: string | null): string {
  return `It was ${wine ?? TRAINING_COPY.unreadableWine}`;
}

/**
 * One history row's text (spec §3.6, §9 "history"; region-guess addendum R8):
 * "24 Sep · You said Pauillac · It was Saint-Julien · 14 of 22",
 * "24 Sep · You said Bourgogne · Chardonnay · It was … · 13 of 22",
 * "24 Sep · You didn't pick a wine · It was … · 0 of 22",
 * "24 Sep · You said Pauillac · Not revealed". An unrevealed row's
 * "Reveal now" is a button the list renders after this text
 * (TRAINING_COPY.revealNow), so it is not part of the string.
 */
export function attemptRowLine(row: AttemptRow, opts?: { timeZone?: string }): string {
  const parts = [shortDate(row.createdAt, opts?.timeZone)];
  parts.push(pickSaidLine(row, null));
  if (row.actual === null) {
    parts.push(TRAINING_COPY.notRevealedShort);
  } else {
    parts.push(itWasLine(row.actual.label));
    if (row.total !== null && row.possible !== null) {
      parts.push(resultTotalLine(row.total, row.possible));
    }
  }
  return parts.join(" · ");
}

const COLOUR_WORDS: Record<WineColour, string> = {
  WHITE: "white",
  ROSE: "rosé",
  RED: "red",
  ORANGE: "orange",
};

// "a white" · "an orange"
function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
}

/**
 * A capped candidate's reason (spec §5.6, §9 "cap reasons"). Colour:
 * "Looks like a {note colour} wine, not a {candidate colour}" — the note's
 * colour is `colourFromHue(note.colourHue)`; null only for BROWN, which caps
 * only a rosé, so it reads "a white or red wine". Bubbles and fortification
 * read the direction from the candidate's style: a sparkling candidate is
 * capped because the note said no bubbles, a fortified one because the note
 * said not fortified; without `candidateStyle` the still/unfortified side is
 * assumed.
 */
export function capReasonLine(
  reason: CapReason,
  ctx: { noteColour: WineColour | null; candidateColour: WineColour; candidateStyle?: WineStyle },
): string {
  if (reason === "colour") {
    const said = ctx.noteColour ? COLOUR_WORDS[ctx.noteColour] : "white or red";
    return `Looks like ${withArticle(said)} wine, not ${withArticle(COLOUR_WORDS[ctx.candidateColour])}`;
  }
  if (reason === "bubbles") {
    return ctx.candidateStyle === "SPARKLING" ? TRAINING_COPY.capNoBubbles : TRAINING_COPY.capBubbles;
  }
  return ctx.candidateStyle === "FORTIFIED" ? TRAINING_COPY.capNotFortified : TRAINING_COPY.capFortified;
}

/**
 * The result's style verdict (spec §3.5, D17). `v` is the real wine's style
 * looked up in the frozen snapshot (null: not in the pool). A capped style
 * always names its reason through capReasonLine, so the bracket holds one of
 * §9's cap reasons and never a bare word — `ctx` is the real wine's
 * archetype (its colour and style) beside the note's own colour, and is
 * required even when `v` is null or uncapped, where it is not read.
 * A style with no percentage drops "at {pct} %".
 */
export function styleVerdictLine(
  v: { rank: number; n: number; pct: number | null; capped: CapReason | null } | null,
  ctx: { noteColour: WineColour | null; candidateColour: WineColour; candidateStyle?: WineStyle },
): string {
  if (v === null) return TRAINING_COPY.notInPool;
  if (v.capped !== null) {
    return `You had ruled its style out (${capReasonLine(v.capped, ctx)})`;
  }
  const at = v.pct === null ? "" : ` at ${v.pct} %`;
  return `Its style was your #${v.rank} of ${v.n}${at}`;
}

/** "Your colour call ({hue}) didn't fit — it was a {colour} wine." */
export function hueClearedLine(hue: string, colour: WineColour): string {
  const word = LABELS[hue] ?? hue.toLowerCase();
  return `Your colour call (${word}) didn't fit — it was ${withArticle(COLOUR_WORDS[colour])} wine.`;
}

/** "{Scale} higher than typical" / "{Scale} lower than typical"; colour reads
    darker / lighter (the hue ladders run light → dark). */
export function scaleLossLine(scale: string, direction: "higher" | "lower"): string {
  if (scale === "colourHue") {
    return direction === "higher" ? TRAINING_COPY.colourDarker : TRAINING_COPY.colourLighter;
  }
  const tail = direction === "higher" ? TRAINING_COPY.higherThanTypical : TRAINING_COPY.lowerThanTypical;
  return `${SCALE_LABELS[scale] ?? scale} ${tail}`;
}

/** "{Group} isn't typical" */
export function groupLossLine(group: string): string {
  return `${group} isn't typical`;
}

/** "✓ {term} — a signature" */
export function signatureLine(term: string): string {
  return `✓ ${term} — a signature`;
}
