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

// Resolve any pending (scanned-but-unmatched) grape rows into real grape ids,
// preserving row order. A pending row has no grapeId but carries pendingName;
// `create` (the createGrape server action, find-or-create) runs only now, on
// save, so scanning a label never spawns a stray/variant grape (e.g. "Brunello"
// for Sangiovese) until the user commits. Empty rows are dropped.
export async function resolvePendingBlend(
  rows: { grapeId: string; percentage: string; pendingName?: string }[],
  create: (name: string) => Promise<{ id: string }>,
): Promise<{ grapeId: string; percentage: string }[]> {
  const out: { grapeId: string; percentage: string }[] = [];
  for (const r of rows) {
    if (r.grapeId) {
      out.push({ grapeId: r.grapeId, percentage: r.percentage });
    } else if (r.pendingName?.trim()) {
      const created = await create(r.pendingName.trim());
      out.push({ grapeId: created.id, percentage: r.percentage });
    }
  }
  return out;
}
