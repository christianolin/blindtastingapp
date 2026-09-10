// Accent-insensitive matching for the client-side comboboxes.
//
// cmdk's default scorer compares raw strings, so "rhone" scores 0 against
// "Rhône" and the option vanishes from the list entirely. That is fatal for a
// blind tasting: nobody types the umlaut in Gewürztraminer or the tilde in
// Albariño while a glass is in front of them. Reference options therefore
// carry a deaccented copy of their name as a cmdk `keyword`, which matches at
// ~0.90 while an exactly-typed accented name still scores 0.9999 — so precise
// input keeps ranking first.
//
// The server-side searches (search_appellations, search_producers) do not need
// this: Postgres `unaccent` already handles them, which is why typing
// "Chateauneuf" finds Châteauneuf-du-Pape today.

// NFD splits a letter into its base plus combining marks, so stripping the
// marks turns é into e. Characters that are their own letter rather than an
// accented base — ø, æ, ß, đ — do not decompose, so they are mapped by hand.
// Postgres `unaccent` makes the same distinction and the same choices.
const LIGATURES: Record<string, string> = {
  ø: "o",
  Ø: "O",
  æ: "ae",
  Æ: "AE",
  œ: "oe",
  Œ: "OE",
  ß: "ss",
  đ: "d",
  Đ: "D",
  ð: "d",
  Ð: "D",
  ł: "l",
  Ł: "L",
  þ: "th",
  Þ: "TH",
};

/**
 * Strip accents so typed ASCII matches accented reference data.
 * Returns the input unchanged when it has nothing to strip.
 */
export function deaccent(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[øØæÆœŒßđĐðÐłŁþÞ]/g, (ch) => LIGATURES[ch] ?? ch);
}
