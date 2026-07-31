// Turns the grape-blend editor rows into an ordered blend. When any percentage
// is given the blend is ordered by percentage (desc); otherwise the row order
// stands. Empty rows are dropped. The lead entry is the primary grape, the next
// the secondary — callers derive those, and the catalog_wine_grapes trigger
// recomputes the same thing on the catalog wine, so nothing sees a raw
// primary/secondary picker outside blind guessing + scoring.
export type BlendGrape = { grapeId: string; percentage: number | null };

export function orderedBlend(
  rows: { grapeId: string; percentage: string }[],
): BlendGrape[] {
  const parsed = rows
    .filter((r) => r.grapeId)
    .map((r) => ({
      grapeId: r.grapeId,
      percentage: r.percentage.trim() ? Number(r.percentage) : null,
    }));
  const anyPct = parsed.some((p) => p.percentage != null);
  return anyPct
    ? [...parsed].sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1))
    : parsed;
}
