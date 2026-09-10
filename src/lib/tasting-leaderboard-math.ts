// Pure leaderboard arithmetic, kept free of any Supabase or Next import so it
// can be unit-tested in vitest's node environment. The scoring rules
// themselves live in the get_tasting_leaderboard RPC, because they need
// elevated rights to see other participants' guesses.

/**
 * How many bottles each participant contributed, keyed by participant id.
 * In bring-your-own tastings you never guess your own bottle, so a
 * participant's "out of" total is the wine count minus this.
 */
export function ownWineCounts(
  wines: { contributor_participant_id: string | null }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const wine of wines) {
    const id = wine.contributor_participant_id;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
