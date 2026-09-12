// Pure maths for the participant reveal (6h): which categories a wine has in
// play, inferred without ever reading the answer key. No Next/Supabase
// imports so vitest's node environment can test it directly.

/** The reveal step keys, in the order `in_play_steps` emits them. */
export type RevealKey =
  | "country"
  | "region"
  | "appellation"
  | "grapes"
  | "producer"
  | "type_designation"
  | "vintage";

export const REVEAL_KEY_ORDER: readonly RevealKey[] = [
  "country",
  "region",
  "appellation",
  "grapes",
  "producer",
  "type_designation",
  "vintage",
];

/** The two steps a wine only has when its answer key carries the value. */
const OPTIONAL: readonly RevealKey[] = ["appellation", "type_designation"];

/**
 * The full in-play sequence for a wine, from what `get_wine_reveal` is allowed
 * to tell a participant: the revealed prefix (in order) and `in_play_count`.
 * Producer and vintage are always steps; appellation and designation only
 * when the wine has them — and that is exactly what must not leak early, so
 * this never asks the answer key. It is exact whenever the count settles it
 * (5 → neither, 7 → both) or the third reveal has shown which one a 6 is.
 * Before that, a 6 is ambiguous: the appellation row is shown (the more
 * common case) and the designation row is held back until it appears in the
 * revealed keys — `uncertain` says so. A revealed key is never dropped.
 */
export function inPlayKeys(
  revealedKeys: readonly string[],
  inPlayCount: number,
): { keys: RevealKey[]; uncertain: boolean } {
  const revealed = new Set(revealedKeys);
  const thirdKnown = revealedKeys.length >= 3;

  let hasAppellation: boolean | null = null;
  if (revealed.has("appellation")) hasAppellation = true;
  else if (thirdKnown) hasAppellation = false;
  else if (inPlayCount <= 5) hasAppellation = false;
  else if (inPlayCount >= 7) hasAppellation = true;

  let hasDesignation: boolean | null = null;
  if (revealed.has("type_designation")) hasDesignation = true;
  else if (revealed.has("vintage")) hasDesignation = false;
  else if (inPlayCount <= 5) hasDesignation = false;
  else if (inPlayCount >= 7) hasDesignation = true;
  else if (hasAppellation !== null) hasDesignation = !hasAppellation;

  const uncertain = hasAppellation === null || hasDesignation === null;
  // The ambiguous 6: show the appellation, hold the designation.
  const includeAppellation = hasAppellation ?? true;
  const includeDesignation = hasDesignation ?? false;

  const keys = REVEAL_KEY_ORDER.filter((key) => {
    if (revealed.has(key)) return true;
    if (!OPTIONAL.includes(key)) return true;
    return key === "appellation" ? includeAppellation : includeDesignation;
  });
  return { keys, uncertain };
}

/** The most a category is worth — what a still-hidden row shows. Grapes is
 *  the primary's 8; a secondary's +2 only exists once the wine reveals one. */
export function keyMaxPoints(key: RevealKey): number {
  switch (key) {
    case "country":
      return 2;
    case "region":
      return 3;
    case "appellation":
      return 5;
    case "grapes":
      return 8;
    case "producer":
      return 6;
    case "type_designation":
      return 2;
    case "vintage":
      return 2;
  }
}

/** Row label as the reveal draws it. */
export function keyLabel(key: RevealKey, plural = false): string {
  switch (key) {
    case "country":
      return "Country";
    case "region":
      return "Region";
    case "appellation":
      return "Appellation";
    case "grapes":
      return plural ? "Grapes" : "Grape";
    case "producer":
      return "Producer";
    case "type_designation":
      return "Designation";
    case "vintage":
      return "Vintage";
  }
}

/** "The grape was" — the hero eyebrow for the newest revealed key. */
export function heroLabel(key: RevealKey, plural: boolean): string {
  if (key === "grapes" && plural) return "The grapes were";
  return `The ${keyLabel(key).toLowerCase()} was`;
}
