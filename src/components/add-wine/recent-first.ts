// Approved proposal item 4 (owner, 2026-10-03): catalog wines the caller's circle
// added in the last day — people they share a tasting with, or their friends —
// rank first in the add-wine search, so the second person at a tasting finds the
// first person's entry instead of adding it again. The rows come from
// `recent_circle_catalog_wines` (20261003100000: SECURITY INVOKER, never a
// blind_pending or merged row). Pure: vitest loads it.

/** `recent` (newest first) ahead of `hits`, each wine once. */
export function recentFirst<T extends { id: string }>(recent: readonly T[], hits: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of [...recent, ...hits]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}
