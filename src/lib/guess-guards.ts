// play-8 (spec §D.2 #6): whether a participant may write or lock a guess on a
// glass. App-level on purpose: a trigger keyed on reveal_step would block
// reveal_next_category's own scoring writes. play/actions.ts loads the wines row
// (inside the tasting) and asks this.
// Pure: no imports, so vitest can load it.

/**
 * Why this participant may not guess this glass, or null when they may.
 * - no row: the glass isn't in this tasting;
 * - the reveal has started (fully revealed, or any reveal step taken);
 * - the participant brought the bottle, and a contributor never guesses their own.
 */
export function guessBlockReason(
  wine: { isRevealed: boolean; revealStep: number; contributorParticipantId: string | null } | null,
  participantId: string,
): string | null {
  if (!wine) return "This glass isn't in this tasting.";
  if (wine.isRevealed || wine.revealStep > 0) {
    return "The reveal for this glass has started — guessing is closed.";
  }
  if (wine.contributorParticipantId === participantId) {
    return "This is your bottle — you don't guess it.";
  }
  return null;
}
