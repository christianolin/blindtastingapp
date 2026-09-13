// Folding helpers (spec §B.5). Pure: no imports, so vitest and the client can
// both load it.

// The letters the Postgres `unaccent` dictionary rewrites but Unicode NFD does
// not decompose. Only lowercase forms: folding lowercases first, as SQL does.
const LETTER_MAP: Record<string, string> = { ß: "ss", æ: "ae", œ: "oe", ø: "o", đ: "d", ł: "l" };
const MAPPED_LETTERS = /[ßæœøđł]/g;
// Combining diacritical marks (base block, extended, supplement, for symbols,
// half marks). No `u` flag: the tsconfig target is ES2017.
const COMBINING_MARKS = /[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]/g;

function foldLetters(s: string): string {
  return s
    .toLowerCase()
    .replace(MAPPED_LETTERS, (c) => LETTER_MAP[c] ?? c)
    .normalize("NFD")
    .replace(COMBINING_MARKS, "");
}

/** The TypeScript twin of SQL `f_search_norm` (20260829260000): lowercase,
    unaccent, then drop everything outside [a-z0-9].
    "Château La Fleur-Pétrus" → "chateaulafleurpetrus". */
export function foldName(s: string): string {
  return foldLetters(s).replace(/[^a-z0-9]+/g, "");
}

/** Folded like `foldName`, but each run of other characters becomes one space.
    "Saint-Émilion  Grand Cru AOC" → "saint emilion grand cru aoc". */
export function foldWords(s: string): string {
  return foldLetters(s).replace(/[^a-z0-9]+/g, " ").trim();
}

/** `foldWords` form with "1er cru" rewritten to "premier cru". */
export function normaliseCru(s: string): string {
  return foldWords(s).replace(/(^| )1er cru(?= |$)/g, "$1premier cru");
}

/** Geographic designations only: the allowlist in
    scripts/add-appellation-designations.mjs plus the EU forms. German quality
    tiers and table-wine markers are never suffixes. */
export const DESIGNATION_SUFFIXES: readonly string[] = [
  "aoc", "aop", "ac", "doc", "docg", "doca", "dop", "do",
  "igt", "igp", "ig", "ava", "dac", "vqa", "wo", "gi", "pdo", "pgi",
];
const DESIGNATION_SET = new Set(DESIGNATION_SUFFIXES);

/** `foldWords(s)` minus ONE trailing designation word. A lone word is kept, so
    a name is never stripped down to nothing. "Barbaresco DOCG" → "barbaresco". */
export function stripDesignationSuffix(s: string): string {
  const words = foldWords(s);
  const cut = words.lastIndexOf(" ");
  if (cut < 0) return words;
  return DESIGNATION_SET.has(words.slice(cut + 1)) ? words.slice(0, cut) : words;
}

export const TITLE_WORDS: readonly string[] = [
  "domaine", "chateau", "bodega", "bodegas", "weingut", "tenuta", "maison", "cantina",
  "clos", "castello", "quinta", "casa", "schloss", "azienda", "agricola",
];
const TITLE_SET = new Set(TITLE_WORDS);

/** True when the name is nothing but producer titles ("Domaine", "Bodegas"). */
export function isTitleOnly(name: string): boolean {
  const words = foldWords(name);
  return words !== "" && words.split(" ").every((w) => TITLE_SET.has(w));
}
