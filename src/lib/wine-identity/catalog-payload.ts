// The find_or_create_catalog_wine payload (spec 2026-09-19-rule1-older-leaks §6.1).
// Pure: vitest loads it.
import type { VintageKind, WineColour, WineStyle } from "./types";

/** The payload key find_or_create_catalog_wine reads (20260919223100): a row the function CREATES
    with it is born blind_pending; a row it finds is returned unchanged. Pinned to the migration by
    catalog-payload.test.ts. */
export const BORN_HIDDEN_KEY = "hidden";

/** A wine created for a flight is born hidden, except on an OPEN board, whose glasses are inserted
    revealed (spec D1). */
export function flightWineBornHidden(revealMode: "BLIND" | "SEMI_BLIND" | "OPEN"): boolean {
  return revealMode !== "OPEN";
}

/** The identity columns find_or_create_catalog_wine writes. `ResolvedWine`
    (server/write.ts) satisfies it. */
export type CatalogWineIdentity = {
  countryId: string;
  regionId: string;
  appellationId: string;
  primaryGrapeId: string;
  secondaryGrapeId: string | null;
  producerId: string;
  typeDesignationId: string | null;
  vintage: { kind: VintageKind; year: number | null; tawnyYears: number | null };
  wineName: string | null;
  colour: WineColour;
  style: WineStyle;
};

/** The jsonb keys every find_or_create_catalog_wine caller sends (a blank wine name is null, D3;
    the RPC stores `nullif(btrim(...), '')` either way), plus BORN_HIDDEN_KEY only when `hidden`. */
export function catalogWinePayload(wine: CatalogWineIdentity, options: { hidden?: boolean } = {}) {
  return {
    country_id: wine.countryId,
    region_id: wine.regionId,
    appellation_id: wine.appellationId,
    primary_grape_id: wine.primaryGrapeId,
    secondary_grape_id: wine.secondaryGrapeId,
    producer_id: wine.producerId,
    type_designation_id: wine.typeDesignationId,
    vintage_kind: wine.vintage.kind,
    vintage_year: wine.vintage.year,
    vintage_tawny_years: wine.vintage.tawnyYears,
    wine_name: wine.wineName,
    colour: wine.colour,
    style: wine.style,
    ...(options.hidden ? { [BORN_HIDDEN_KEY]: true } : {}),
  };
}
