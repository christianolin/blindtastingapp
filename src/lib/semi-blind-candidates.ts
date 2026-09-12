// The semi-blind candidate list (ledger B9 "The list"; map SB-02, SB-03).
//
// A semi-blind tasting names every wine up front, so the ORDER of that list is
// part of the secret: if it ever followed pour order (wines.position), or the
// insertion order a query happens to return, the list would be the answer key.
// Every surface that shows candidates — the lobby list, the matching pool, the
// picker, the desktop bottles — sorts through `sortCandidates`, and the sort
// reads only what is printed on the card plus the opaque key:
//
//   1. producer, folded (accents, ligatures, case), missing last;
//   2. wine name, folded the same way, missing last;
//   3. vintage: years ascending, then NV, then tawny by age, unknown last;
//   4. the opaque per-tasting key, by code unit.
//
// The key is the last tiebreak so two indistinguishable cards (same producer,
// name and vintage) still land in one fixed order that says nothing about
// which glass is which. Keys come from SQL later and must be unique within a
// tasting, and random: never derived from wines.position, a wine id or the
// insertion time. For twin cards the key is the only thing that orders them,
// so an ordered key would put the pour order straight back into the list.
// Text is compared by code unit after folding, not with a locale
// collator, so the server render and the client agree whatever ICU data the
// runtime ships.

import type { VintageKind } from "./supabase/database.types";
import { deaccent } from "./deaccent";

export type CandidateVintage = {
  kind: VintageKind | null;
  year: number | null;
  tawnyYears: number | null;
};

/** What a caller knows about one candidate, names already looked up. */
export type CandidateInput = {
  /** Opaque per-tasting key — never a wine id or a position. */
  key: string;
  producer: string | null;
  /** Optional: a third of the catalog has no cuvée name. */
  wineName: string | null;
  vintageKind: VintageKind | null;
  vintageYear: number | null;
  vintageTawnyYears: number | null;
  appellation: string | null;
  /** The primary grape's name. */
  grape: string | null;
};

/** One card: producer / wine name + vintage / appellation · grape. */
export type CandidateCard = {
  key: string;
  producer: string | null;
  wineName: string | null;
  vintage: CandidateVintage;
  /** "2016", "NV", "20yo", "Tawny", or "" while the vintage is unknown. */
  vintageLabel: string;
  appellation: string | null;
  grape: string | null;
};

const isNumber = (value: number | null): value is number =>
  value != null && Number.isFinite(value);

// A tawny age statement is a positive number of years. The column has no
// check, so a 0 or negative age reads as no age ("Tawny"), as it does in
// the catalog's own vintage label.
const isTawnyAge = (value: number | null): value is number =>
  isNumber(value) && value > 0;

/**
 * The vintage as printed on a card. Tawny wording matches the catalog and
 * cellar pages ("20yo", or "Tawny" without an age).
 */
export function vintageLabel(vintage: CandidateVintage): string {
  switch (vintage.kind) {
    case "YEAR":
      return isNumber(vintage.year) ? String(vintage.year) : "";
    case "NV":
      return "NV";
    case "TAWNY":
      return isTawnyAge(vintage.tawnyYears) ? `${vintage.tawnyYears}yo` : "Tawny";
    default:
      return "";
  }
}

function cleanText(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function cleanVintage(input: CandidateInput): CandidateVintage {
  switch (input.vintageKind) {
    case "YEAR":
      return {
        kind: "YEAR",
        year: isNumber(input.vintageYear) ? input.vintageYear : null,
        tawnyYears: null,
      };
    case "NV":
      return { kind: "NV", year: null, tawnyYears: null };
    case "TAWNY":
      return {
        kind: "TAWNY",
        year: null,
        tawnyYears: isTawnyAge(input.vintageTawnyYears) ? input.vintageTawnyYears : null,
      };
    default:
      return { kind: null, year: null, tawnyYears: null };
  }
}

/** Normalise a candidate into its card: trimmed text, blanks as null. */
export function buildCandidateCard(input: CandidateInput): CandidateCard {
  const vintage = cleanVintage(input);
  return {
    key: input.key,
    producer: cleanText(input.producer),
    wineName: cleanText(input.wineName),
    vintage,
    vintageLabel: vintageLabel(vintage),
    appellation: cleanText(input.appellation),
    grape: cleanText(input.grape),
  };
}

type SortKey = {
  producer: string | null;
  wineName: string | null;
  vintageTier: number;
  vintageValue: number;
  key: string;
};

function fold(value: string | null): string | null {
  if (value == null) return null;
  const folded = deaccent(value).toLowerCase().replace(/\s+/g, " ").trim();
  return folded === "" ? null : folded;
}

// Tiers: 0 a year (by year), 1 NV, 2 tawny with an age (by age),
// 3 tawny without an age, 4 unknown.
function vintageRank(vintage: CandidateVintage): [tier: number, value: number] {
  if (vintage.kind === "YEAR" && isNumber(vintage.year)) return [0, vintage.year];
  if (vintage.kind === "NV") return [1, 0];
  if (vintage.kind === "TAWNY") {
    return isTawnyAge(vintage.tawnyYears) ? [2, vintage.tawnyYears] : [3, 0];
  }
  return [4, 0];
}

function sortKeyOf(card: CandidateCard): SortKey {
  const [vintageTier, vintageValue] = vintageRank(card.vintage);
  return {
    producer: fold(card.producer),
    wineName: fold(card.wineName),
    vintageTier,
    vintageValue,
    key: card.key,
  };
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareMissingLast(a: string | null, b: string | null): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return compareCodeUnits(a, b);
}

function compareSortKeys(a: SortKey, b: SortKey): number {
  return (
    compareMissingLast(a.producer, b.producer) ||
    compareMissingLast(a.wineName, b.wineName) ||
    a.vintageTier - b.vintageTier ||
    a.vintageValue - b.vintageValue ||
    compareCodeUnits(a.key, b.key)
  );
}

/** Comparator for candidate cards. Reads no position and no input order. */
export function compareCandidates(a: CandidateCard, b: CandidateCard): number {
  return compareSortKeys(sortKeyOf(a), sortKeyOf(b));
}

/**
 * The one order for a candidate list. Returns a new array; extra fields on
 * the cards ride along untouched but never affect the order.
 */
export function sortCandidates<T extends CandidateCard>(cards: readonly T[]): T[] {
  return cards
    .map((card) => ({ card, sortKey: sortKeyOf(card) }))
    .sort((a, b) => compareSortKeys(a.sortKey, b.sortKey))
    .map(({ card }) => card);
}
