// The blend rules behind fillCatalogWine (spec §B.9; byhand-4, byhand-6). Pure:
// relative imports only, so vitest can load it.
import { orderedBlend } from "../wine-blend";

export type StoredBlendRow = { grapeId: string; percentage: number | null };

// catalog_wine_grapes.percentage is numeric(5,2) with check (> 0 and <= 100)
// (20260829245000). Rounding first mirrors the cast Postgres applies before it
// checks the value.
function storablePercentage(percentage: number | null): number | null {
  if (typeof percentage !== "number" || !Number.isFinite(percentage)) return null;
  const rounded = Math.round(percentage * 100) / 100;
  return rounded > 0 && rounded <= 100 ? rounded : null;
}

/**
 * The blend as `catalog_wine_grapes` can hold it: one row per grape (the first row
 * wins; the table is unique on catalog_wine_id + grape_id), a percentage only in
 * (0, 100] at two decimals, and the recompute trigger's order (by percentage when
 * any is set, nulls last, ties in row order). Its first row is the primary grape,
 * its second the secondary, exactly as the trigger derives them.
 */
export function storableBlend(rows: readonly StoredBlendRow[]): StoredBlendRow[] {
  const seen = new Set<string>();
  const unique: StoredBlendRow[] = [];
  for (const row of rows) {
    if (!row.grapeId || seen.has(row.grapeId)) continue;
    seen.add(row.grapeId);
    unique.push({ grapeId: row.grapeId, percentage: storablePercentage(row.percentage) });
  }
  // orderedBlend is the one ordering rule; it takes the editor's string form.
  return orderedBlend(
    unique.map((row) => ({
      grapeId: row.grapeId,
      percentage: row.percentage == null ? "" : String(row.percentage),
    })),
  );
}

/** What the catalog_wines insert trigger seeds: the primary grape at sort order 0,
    then the secondary at 1 when there is one (a repeat of the primary is skipped
    by its `on conflict do nothing`), all with null percentages. */
function seededRows(seeded: { primaryGrapeId: string; secondaryGrapeId: string | null }): StoredBlendRow[] {
  const rows: StoredBlendRow[] = [{ grapeId: seeded.primaryGrapeId, percentage: null }];
  if (seeded.secondaryGrapeId && seeded.secondaryGrapeId !== seeded.primaryGrapeId) {
    rows.push({ grapeId: seeded.secondaryGrapeId, percentage: null });
  }
  return rows;
}

function sameRows(a: readonly StoredBlendRow[], b: readonly StoredBlendRow[]): boolean {
  return a.length === b.length
    && a.every((row, i) => row.grapeId === b[i].grapeId && (row.percentage ?? null) === (b[i].percentage ?? null));
}

/**
 * True only when the stored `catalog_wine_grapes` rows are still exactly what the
 * insert trigger seeds (primary [+ secondary], all null %) AND the incoming blend
 * differs. Anything else in storage (a percentage, another grape, an extra row) is
 * a curated blend and is never overwritten. An empty incoming blend is never written.
 */
export function blendNeedsReplace(
  stored: { grapeId: string; percentage: number | null }[],
  seeded: { primaryGrapeId: string; secondaryGrapeId: string | null },
  incoming: { grapeId: string; percentage: number | null }[],
): boolean {
  if (incoming.length === 0) return false;
  const seed = seededRows(seeded);
  const seedIds = new Set(seed.map((row) => row.grapeId));
  const storedIsSeed = stored.length === seed.length
    && stored.every((row) => row.percentage == null && seedIds.has(row.grapeId))
    && new Set(stored.map((row) => row.grapeId)).size === seed.length;
  if (!storedIsSeed) return false;
  // Stored equals the seed as a set, so the seed's own order stands in for it.
  return !sameRows(seed, incoming);
}
