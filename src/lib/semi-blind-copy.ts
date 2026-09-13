import type { CandidateCard } from "./semi-blind-candidates";
import { countWord } from "./count-words";
import { deaccent } from "./deaccent";

// Copy for semi-blind: the list (SB1), the matching board (SB2 phone, SB3
// laptop) and the reveal (SB4) — spec §10.3. Exact handoff and spec copy;
// the one string the plan had to add is marked (plan copy).
//
// Two sentences are data-driven where the handoff printed one flight's data
// ("two of these are Nebbiolo from Piedmont", "Two Nebbiolos still in the
// pool"): they name a grape only when two or more of the cards in question
// share it — the most common shared grape, ties by folded name — and are left
// out otherwise.
//
// Nothing here imports from `play/`: the caller passes the ladder's locked-in
// sentence to `matchRefusalSentence`. Pure: relative imports only.

const wineNoun = (n: number) => (n === 1 ? "wine" : "wines");

const isText = (value: string | null | undefined): value is string =>
  value != null && value.trim() !== "";

// ── The list (SB1) ───────────────────────────────────────────────────────────

export function listEyebrow(host: string): string {
  return `Semi-blind · ${host} is hosting`;
}

/** "Tonight's six wines"; numerals above ten. */
export function listTitle(count: number): string {
  // "Tonight's one wine" is the singular of the spec's "Tonight's {count word} wines".
  return `Tonight's ${countWord(count)} ${wineNoun(count)}`;
}

export const LIST_BODY =
  "These are the bottles on the table. You will not be told which glass is which — that is what you work out.";

export const LIST_FOOTNOTE =
  "Listed alphabetically by producer. Never in pouring order — position in this list would otherwise be the answer.";

/** Under the list before Start. */
export function beforeStartLine(host: string): string {
  return `Glass 1 is poured when ${host} starts.`;
}

/** A guest's lobby before Start, in place of the list (Q7). */
export function listOpensAtStart(host: string): string {
  return `The list of tonight's wines opens when ${host} starts.`;
}

/** Glasses with no answer key yet; null when there are none. */
export function pendingLine(pending: number | null): string | null {
  if (pending == null || pending <= 0) return null;
  return `${pending} ${wineNoun(pending)} still being added`;
}

// ── The board (SB2, SB3) ─────────────────────────────────────────────────────

/** The phone title; the laptop title is the tasting name. */
export const MATCH_TITLE = "Match the glasses";
/** The laptop glass column heading. */
export const THE_GLASSES = "The glasses";
/** The laptop pool heading. */
export const THE_BOTTLES = "The bottles";

/**
 * Phone: "Semi-blind · glass {n} poured". Laptop: "Live · semi-blind · {host}
 * is hosting". With no pour pointer (ASYNC or free flow, every glass open) the
 * phone has no poured glass to name and falls back to the list's eyebrow.
 */
export function boardEyebrow(opts: {
  phone: boolean;
  host: string;
  pouredGlass?: number | null;
}): string {
  if (!opts.phone) return `Live · semi-blind · ${opts.host} is hosting`;
  return opts.pouredGlass != null
    ? `Semi-blind · glass ${opts.pouredGlass} poured`
    : listEyebrow(opts.host);
}

/** The gold pill: matches, never points. */
export function matchedPill(assigned: number, total: number): string {
  return `${assigned} of ${total} matched`;
}

/** Laptop, on its own line under "The bottles". */
export function stillUnassigned(n: number): string {
  return `${n} still unassigned`;
}

/** Phone pool heading. */
export function unassignedHeading(n: number): string {
  return `Still unassigned · ${n} ${wineNoun(n)}`;
}

export function emptyRowText(opts: { phone: boolean }): string {
  return opts.phone ? "Tap to choose" : "Drop a wine here, or click to choose";
}

export const NOT_POURED = "Not poured yet";
export const YOUR_BOTTLE = "Your bottle";

/** A card held by a locked glass, and the refusal to take it. */
export function lockedHolderLabel(glass: number): string {
  return `Glass ${glass} · locked`;
}

/** "{producer}, {wine name} {vintage}"; missing parts drop out. */
export function candidateLabel(
  card: Pick<CandidateCard, "producer" | "wineName" | "vintageLabel">,
): string {
  const names = [card.producer, card.wineName].filter(isText).join(", ");
  return [names, card.vintageLabel].filter(isText).join(" ");
}

/** A revealed glass row: "Glass {n} was {producer} {vintage}". */
export function revealedRowText(input: {
  glass: number;
  producer: string | null;
  vintageLabel: string;
}): string {
  return [`Glass ${input.glass} was`, input.producer, input.vintageLabel].filter(isText).join(" ");
}

export function footerLine(host: string, opts: { phone: boolean }): string {
  return opts.phone
    ? `Change anything until ${host} reveals. Nothing is scored before then.`
    : `Every assignment stays changeable until ${host} reveals that glass. Locking a glass only closes that one.`;
}

/** Laptop footer, for the current glass. */
export function clearGlassLabel(glass: number): string {
  return `Clear glass ${glass}`;
}

export function lockGlassLabel(glass: number): string {
  return `Lock in glass ${glass}`;
}

export const LOCK_ONLY_THIS = "Locking only this glass. The rest stay open.";

/** The app guard before a per-glass lock. */
export function chooseFirst(glass: number): string {
  return `Choose a wine for glass ${glass} first.`;
}

export const REVEALED_WINE_REFUSAL = "That wine has been revealed.";

export const POOL_SWAP_NOTE =
  "Assigning one that sits on another glass swaps the two; revealed wines leave the list entirely.";

/** The phone helper under the pool: the grape sentence when it applies, then the swap note. */
export function poolHelperLines(poolCards: readonly Pick<CandidateCard, "grape">[]): string[] {
  const shared = mostSharedGrape(poolCards);
  if (!shared) return [POOL_SWAP_NOTE];
  return [
    `Producer alone is not enough — ${countWord(shared.count)} of these are ${shared.grape}, so the wine and the vintage have to be on the label too.`,
    POOL_SWAP_NOTE,
  ];
}

// `assign_semi_blind_match` / `clear_semi_blind_match` exception messages (M9a).
const GLASS_LOCKED = "glass locked";
const NOT_IN_POOL = "that wine is not in your pool";
const THIS_GLASS_LOCKED_IN = "this glass is locked in";
// `guesses_refuse_locked_edit`'s exception message (M8). An assign meets it only
// in a race: another tab inserts and locks the row while this call runs, and the
// assign's `insert … on conflict do update` then lands on a locked row.
const THIS_GUESS_LOCKED_IN = "this guess is locked in — change it first";

function asSentence(message: string): string {
  if (message === "") return message;
  const capitalised = message.charAt(0).toUpperCase() + message.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

/**
 * The sentence a refused assign or clear shows (BT-S2).
 *
 * - "glass locked" names the holder: `detail` is its glass wine id, turned into
 *   "Glass {N} · locked" through `glassNumberOf`.
 * - "that wine is not in your pool" says "That wine has been revealed." when
 *   the candidate is revealed.
 * - "this glass is locked in", and M8's lock pin "this guess is locked in —
 *   change it first", are the ladder's locked-in sentence, passed in.
 * - Anything else is the RPC's own sentence, capitalised.
 *
 * PostgREST puts a `raise … using detail` into `details`, so a PostgrestError
 * can be passed straight in; `detail` wins when both are set.
 */
export function matchRefusalSentence(
  error: { message: string; detail?: string | null; details?: string | null },
  ctx: {
    glassNumberOf: (wineId: string) => number | null;
    candidateKey: string;
    revealedKeys: ReadonlySet<string>;
    lockedIn: string;
  },
): string {
  const message = error.message.trim();
  switch (message.toLowerCase()) {
    case GLASS_LOCKED: {
      const holderWineId = error.detail ?? error.details;
      const holderGlass = holderWineId ? ctx.glassNumberOf(holderWineId) : null;
      return holderGlass != null ? lockedHolderLabel(holderGlass) : asSentence(message);
    }
    case NOT_IN_POOL:
      return ctx.revealedKeys.has(ctx.candidateKey) ? REVEALED_WINE_REFUSAL : asSentence(message);
    case THIS_GLASS_LOCKED_IN:
    case THIS_GUESS_LOCKED_IN:
      return ctx.lockedIn;
    default:
      return asSentence(message);
  }
}

// ── The reveal (SB4) ─────────────────────────────────────────────────────────

export const HOW_THE_TABLE_SPLIT = "How the table split";
export const STANDINGS_ONE_POINT = "Standings · one point a glass";

export function revealingGlassEyebrow(glass: number): string {
  return `Revealing glass ${glass}`;
}

export function revealedSoFar(k: number, n: number): string {
  return `${k} of ${n} revealed`;
}

export function glassWas(glass: number): string {
  return `Glass ${glass} was`;
}

/**
 * The viewer's result on the glass just revealed. `mine` is their matches so
 * far, `revealed` the glasses revealed so far.
 */
export function revealResult(input: {
  hit: boolean;
  pickLabel: string | null;
  mine: number;
  revealed: number;
}): { title: string; detail: string } {
  const soFar = `${input.mine} of ${input.revealed} so far`;
  if (input.hit) return { title: "You had it", detail: `+1 · ${soFar}` };
  return {
    title: isText(input.pickLabel)
      ? `You said ${input.pickLabel}`
      : "You did not match this glass", // (plan copy)
    detail: `0 · ${soFar}`,
  };
}

const REVEALED_LEAVE_THE_LIST =
  "Wines already revealed are gone from the list — that is why a late glass is easier than an early one.";

/** Under the split: the shared-grape sentence when it applies, then the pool rule. */
export function poolNoteLines(remainingCards: readonly Pick<CandidateCard, "grape">[]): string[] {
  const shared = mostSharedGrape(remainingCards);
  if (!shared) return [REVEALED_LEAVE_THE_LIST];
  return [
    `${countWord(shared.count, { capital: true })} ${shared.grape} wines still in the pool.`,
    REVEALED_LEAVE_THE_LIST,
  ];
}

// ── Shared grape ─────────────────────────────────────────────────────────────

function foldName(value: string): string {
  return deaccent(value).toLowerCase().replace(/\s+/g, " ").trim();
}

// The grape two or more cards share: the largest group, ties by folded name
// (code units, as `sortCandidates` compares, so server and client agree). The
// name is printed as the first card in that group spells it.
function mostSharedGrape(
  cards: readonly Pick<CandidateCard, "grape">[],
): { grape: string; count: number } | null {
  const groups = new Map<string, { grape: string; count: number }>();
  for (const card of cards) {
    if (!isText(card.grape)) continue;
    const grape = card.grape.trim();
    const folded = foldName(grape);
    const group = groups.get(folded);
    if (group) group.count += 1;
    else groups.set(folded, { grape, count: 1 });
  }
  let best: { folded: string; grape: string; count: number } | null = null;
  for (const [folded, group] of groups) {
    if (group.count < 2) continue;
    if (!best || group.count > best.count || (group.count === best.count && folded < best.folded)) {
      best = { folded, ...group };
    }
  }
  return best ? { grape: best.grape, count: best.count } : null;
}
