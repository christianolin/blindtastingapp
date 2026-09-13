// The grape suggestion for an appellation (spec §B.8, D8). Pure: no imports.
// The server half (`suggestGrapeForAppellation`) loads the place's PRINCIPAL,
// permitted `wine_place_grapes` and the catalog's primary-grape counts; this
// module only decides. The UI offers the result as a "suggested" chip that
// fills on tap — it is never selected automatically.

/** One principal, permitted grape of the appellation's linked place. */
export type PlaceGrape = { grapeId: string; name: string; sharePct: number | null };
/** How many catalog wines of the appellation have this primary grape — one row per grape. */
export type CatalogGrapeCount = { grapeId: string; name: string; count: number };
export type GrapeSuggestion = { grape: { id: string; name: string }; source: "place" | "catalog" };

/** A principal's share, or the catalog's top grape, counts from this percentage. */
const DOMINANT_PCT = 60;
/** The catalog fallback needs at least this many wines. */
const CATALOG_MIN_WINES = 3;

/**
 * 1. The place has exactly one principal grape → that grape.
 * 2. Several principals, exactly one with a share of at least 60% → that grape.
 * 3. Otherwise the catalog: at least 3 wines, the top grape at least 60% of them.
 * 4. Otherwise null.
 */
export function pickGrapeSuggestion(
  placeGrapes: readonly PlaceGrape[],
  catalogCounts: readonly CatalogGrapeCount[],
): GrapeSuggestion | null {
  const dominant = placeGrapes.filter((g) => g.sharePct !== null && g.sharePct >= DOMINANT_PCT);
  const fromPlace = placeGrapes.length === 1 ? placeGrapes[0] : dominant.length === 1 ? dominant[0] : null;
  if (fromPlace) return { grape: { id: fromPlace.grapeId, name: fromPlace.name }, source: "place" };

  const counted = catalogCounts.filter((row) => row.count > 0);
  const total = counted.reduce((sum, row) => sum + row.count, 0);
  if (total < CATALOG_MIN_WINES) return null;
  const top = counted.reduce((best, row) => (row.count > best.count ? row : best));
  // top / total ≥ 60%, in integers: 3 of 5 is exactly 60% with no float error.
  if (top.count * 100 < total * DOMINANT_PCT) return null;
  return { grape: { id: top.grapeId, name: top.name }, source: "catalog" };
}
