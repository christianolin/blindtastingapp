// The fill rule behind fillCatalogWine (spec 2026-09-19-rule1-usage-and-main-photo §5.1, D9).
// Pure: relative imports only, so vitest can load it.

export type CatalogFillRow = {
  createdBy: string | null;
  blindPending: boolean;
  imageUrl: string | null;
  description: string | null;
  /** numeric arrives as a string through PostgREST; only null matters here. */
  alcoholPercent: number | string | null;
};

export type CatalogFillSource = { imageUrl: string | null; description: string | null; alcohol: number | null };

/** Where the identity is being written: the caller's catalog, cellar or note (`catalog`), or a
    glass's answer key (`flight`: add, finish, Edit, Swap). `glassRevealed` is true only on an OPEN
    board, whose glasses are inserted revealed. */
export type CatalogFillContext = { kind: "catalog" } | { kind: "flight"; glassRevealed: boolean };

export type CatalogFillPlan = {
  patch: { image_url?: string; description?: string; alcohol_percent?: number };
  /** The UPDATE also filters `blind_pending = true`, so a wine that turned public since the read is left alone. */
  onlyWhileHidden: boolean;
};

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === "";
}

/** null: write nothing, the blend included. Otherwise the blank-only patch (maybe empty), and the
    blend may be replaced (still only when blendNeedsReplace says so). */
export function catalogFillPlan(
  row: CatalogFillRow,
  source: CatalogFillSource,
  userId: string,
  context: CatalogFillContext,
): CatalogFillPlan | null {
  if (row.createdBy !== userId) return null;
  const flight = context.kind === "flight";
  // Rule 1: a flight never changes a wine others can already read, unless the glass itself is public.
  if (flight && !row.blindPending && !context.glassRevealed) return null;
  const patch: CatalogFillPlan["patch"] = {};
  // Owner rule: a flight scan never becomes a catalog wine's main photo; it stays on the answer key.
  if (!flight && source.imageUrl && isBlank(row.imageUrl)) patch.image_url = source.imageUrl;
  if (source.description && isBlank(row.description)) patch.description = source.description;
  if (source.alcohol !== null && row.alcoholPercent === null) patch.alcohol_percent = source.alcohol;
  return { patch, onlyWhileHidden: flight && !context.glassRevealed };
}
