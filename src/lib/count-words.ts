// Count words (spec §10.3 item 1, §11.3 item 10): one to ten as words,
// numerals above ten. "Tonight's six wines", "two of these are Nebbiolo",
// "Five of seven said Nebbiolo" and "Tonight's 12 wines" all read through this
// one helper, so every tasting surface counts the same way.
//
// Pure: no imports.

const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
] as const;

/**
 * `n` as a word from zero to ten, otherwise as numerals ("11", "-1", "2.5").
 * `capital` upper-cases the word's first letter for the start of a sentence;
 * numerals come back unchanged either way.
 */
export function countWord(n: number, opts?: { capital?: boolean }): string {
  const word = Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : null;
  if (word == null) return String(n);
  return opts?.capital ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}
