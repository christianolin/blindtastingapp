// Pure helper for the semi-blind match board's glass list (owner decision
// OD-4a, approved 2026-09-14: "the just-revealed semi-blind glass renders
// only once — MatchBoard skips the glass whose id is semiBlindReveal.wineId
// (the SB4 hero shows it)"). Kept dependency-free (only a type-only import
// from semi-blind-board.ts) so the rule is pinned by
// match-board-visibility.test.ts; match-board.tsx applies it to the board's
// own glass list before rendering rows — the matched/total pill and the pool
// both keep reading the full, unfiltered board.
import type { BoardGlass } from "@/lib/semi-blind-board";

export function visibleGlasses(
  glasses: readonly BoardGlass[],
  heroWineId: string | null,
): readonly BoardGlass[] {
  if (heroWineId == null) return glasses;
  return glasses.filter((glass) => glass.wineId !== heroWineId);
}
