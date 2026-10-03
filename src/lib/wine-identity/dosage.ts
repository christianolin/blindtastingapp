// A sparkling wine's dosage (owner, 2026-10-03: "Its own field"): Brut Nature … Doux,
// stored on catalog_wines.dosage_designation_id (20261003101000), a foreign key to one
// of the seven "Sparkling Dosage" rows of type_designations. It sits beside the type
// designation (Reserva, Gran Reserva) rather than in it, is part of the wine's
// identity, so a Brut Nature and a Semi-sec of one Cava stay two wines, and is never
// scored (wine_answers and guesses have no dosage). Pure: no imports.
import { foldName } from "./fold";
import type { WineStyle } from "./types";

/** type_designations.category of the seven dosage rows (20260717090000). */
export const DOSAGE_CATEGORY = "Sparkling Dosage";

/** The seven rows' exact names, driest first (their sort_order). */
export const DOSAGE_NAMES = ["Brut Nature", "Extra Brut", "Brut", "Extra Dry", "Sec", "Demi-Sec", "Doux"] as const;
export type DosageName = (typeof DOSAGE_NAMES)[number];

/** Curated label spellings, folded → the row's exact name. A lookup table, never a
    heuristic: a word that is not here ("Nature" alone, "Dry") is no dosage. */
const SYNONYMS: ReadonlyArray<readonly [string, DosageName]> = [
  ...DOSAGE_NAMES.map((name) => [name, name] as const),
  ["Pas dosé", "Brut Nature"],
  ["Dosage zéro", "Brut Nature"],
  ["Zero dosage", "Brut Nature"],
  ["Dosaggio zero", "Brut Nature"],
  ["Brut zero", "Brut Nature"],
  ["Extra seco", "Extra Dry"],
  ["Extra sec", "Extra Dry"],
  ["Seco", "Sec"],
  ["Semiseco", "Demi-Sec"],
  ["Semi-seco", "Demi-Sec"],
  ["Semi-sec", "Demi-Sec"],
  ["Dulce", "Doux"],
  ["Dolce", "Doux"],
];

const BY_FOLDED: ReadonlyMap<string, DosageName> = new Map(
  SYNONYMS.map(([spelling, name]) => [foldName(spelling), name] as const),
);

/** The longest synonym, in whitespace-separated words ("dosaggio zero" is two). */
const MAX_PHRASE_WORDS = 3;

/** The dosage row name a label's text names, or null. Compared folded: accents,
    case, spaces and hyphens never matter ("SEMI SEC" is Demi-Sec). */
export function canonicalDosageName(text: string | null | undefined): DosageName | null {
  if (typeof text !== "string") return null;
  const key = foldName(text);
  return key === "" ? null : (BY_FOLDED.get(key) ?? null);
}

function phraseAt(tokens: readonly string[], from: number, count: number): DosageName | null {
  if (count < 1 || from < 0 || from + count > tokens.length) return null;
  return canonicalDosageName(tokens.slice(from, from + count).join(" "));
}

/** Leftover separators ("–", "·", "-") at either end of what remains of a name. */
function trimSeparators(tokens: string[]): string[] {
  let start = 0;
  let end = tokens.length;
  while (start < end && foldName(tokens[start]) === "") start += 1;
  while (end > start && foldName(tokens[end - 1]) === "") end -= 1;
  return tokens.slice(start, end);
}

/**
 * A wine name with any dosage phrase at its start or its end taken out: a dosage
 * word never belongs in `wine_name` (owner, 2026-10-03). "Semi-sec" → no name,
 * Demi-Sec; "Brut Yellow Label" → "Yellow Label", Brut; "Òrtus Brut Nature" →
 * "Òrtus", Brut Nature. The longest phrase wins, so "Extra Brut" is never "Brut".
 * A dosage word inside a name ("Le Brut de Mon Père") is left alone. When both
 * ends carry one, the end's is taken.
 */
export function splitDosageFromName(name: string | null): { wineName: string | null; dosage: DosageName | null } {
  let tokens = (name ?? "").trim().split(/\s+/).filter((t) => t !== "");
  if (tokens.length === 0) return { wineName: null, dosage: null };

  let dosage: DosageName | null = null;
  for (let count = Math.min(MAX_PHRASE_WORDS, tokens.length); count >= 1; count -= 1) {
    const hit = phraseAt(tokens, tokens.length - count, count);
    if (hit !== null) {
      dosage = hit;
      tokens = trimSeparators(tokens.slice(0, tokens.length - count));
      break;
    }
  }
  for (let count = Math.min(MAX_PHRASE_WORDS, tokens.length); count >= 1; count -= 1) {
    const hit = phraseAt(tokens, 0, count);
    if (hit !== null) {
      dosage = dosage ?? hit;
      tokens = trimSeparators(tokens.slice(count));
      break;
    }
  }
  if (dosage === null) return { wineName: (name ?? "").trim() || null, dosage: null };
  const rest = tokens.join(" ").trim();
  return { wineName: rest === "" ? null : rest, dosage };
}

/** A dosage belongs to a sparkling wine only. */
export function dosageApplies(style: WineStyle | null): boolean {
  return style === "SPARKLING";
}

/** The dosage a wine of this style keeps: its own on a sparkling wine, else none. */
export function effectiveDosageId(style: WineStyle | null, dosageId: string | null): string | null {
  const id = dosageId?.trim();
  return dosageApplies(style) && id ? id : null;
}

export function isDosageCategory(category: string | null | undefined): boolean {
  return category === DOSAGE_CATEGORY;
}

type DesignationRow = { id: string; name: string; category: string | null };

/**
 * The type designation picker's rows: every row except the seven dosages, which have
 * their own picker. A dosage row the value already names stays, so an older answer key
 * that stores "Brut" as its type designation still shows it, and still scores it.
 */
export function typeDesignationChoices<T extends DesignationRow>(options: readonly T[], currentId: string | null): T[] {
  return options.filter((o) => !isDosageCategory(o.category) || o.id === currentId);
}

/** The dosage picker's rows, driest first (DOSAGE_NAMES), whatever order they came in. */
export function dosageChoices<T extends DesignationRow>(options: readonly T[]): T[] {
  const rank = (name: string) => DOSAGE_NAMES.indexOf(name as DosageName);
  return options
    .filter((o) => isDosageCategory(o.category) && rank(o.name) >= 0)
    .sort((a, b) => rank(a.name) - rank(b.name));
}
