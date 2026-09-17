// The one cellar-lot select string and the shaping from what PostgREST returns
// to the shared `BottleRow` contract (CC-D1, spec §4 "bottles.ts").
//
// Every cellar surface — Bottles, the read-only cellar, the lot sheet, the
// collection — reads a lot through `LOT_SELECT` and shapes it here, so the
// identity joins, the embed unwrap and the numeric coercions exist once.
//
// Field mapping and `Number()` only: no filtering, no derived display strings
// (those live in `./format`), and nothing about money beyond carrying the
// owner's own `price_per_bottle` through to the lot (D4 — the lot sheet is the
// single place it renders). The catalog wine's typical-price column is never
// selected here, and no valuation is ever derived.
//
// Pure: type-only `@/` imports plus the pure `wine-title` module, no
// `server-only`, no `next` import.
import { catalogWineTitle } from "@/lib/wset/wine-title";
import type {
  BottleLot,
  BottleRow,
  BottleWine,
  CommunityRating,
  VintageKind,
  WineColour,
  WineStyle,
  YourScore,
} from "./types";

/** A cellar lot with everything the cellar needs to name and place its wine.
 *  The catalog wine's typical price is deliberately absent (D4). */
export const LOT_SELECT =
  "id, owner_id, catalog_wine_id, bottle_size_ml, quantity, purchased_quantity, price_per_bottle, currency, " +
  "purchased_on, purchase_source, drink_from, drink_to, storage_location, lot_note, created_at, " +
  "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, colour, style, image_url, " +
  "producer:producers(name), appellation:appellations(name), region:regions(name), country:countries(name), " +
  "primary_grape:grapes!catalog_wines_primary_grape_id_fkey(name), type_designation:type_designations(name))";

/** A `(name)` embed: PostgREST returns an object or a one-element array
 *  depending on the client version. */
export type Rel = { name: string } | { name: string }[] | null;

export type CatalogEmbed = {
  wine_name: string | null;
  vintage_kind: VintageKind;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  colour: WineColour | null;
  style: WineStyle | null;
  image_url: string | null;
  producer: Rel;
  appellation: Rel;
  region: Rel;
  country: Rel;
  primary_grape: Rel;
  type_designation: Rel;
};

export type LotEmbedRow = {
  id: string;
  owner_id: string;
  catalog_wine_id: string;
  bottle_size_ml: number;
  quantity: number;
  purchased_quantity: number;
  /** `numeric` arrives as a string from PostgREST. */
  price_per_bottle: number | string | null;
  currency: string;
  purchased_on: string | null;
  purchase_source: string | null;
  drink_from: number | null;
  drink_to: number | null;
  storage_location: string | null;
  lot_note: string | null;
  created_at: string;
  catalog_wines: CatalogEmbed | CatalogEmbed[] | null;
};

/** The single row of an embed, whichever shape it arrived in. */
export function unwrapEmbed<T>(rel: T | T[] | null): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

/** The `name` of a `(name)` embed, or null when it is absent. */
export function relName(rel: unknown): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return (row as { name?: string } | undefined)?.name ?? null;
}

function numberOrNull(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function lotFrom(r: LotEmbedRow): BottleLot {
  return {
    id: r.id,
    quantity: r.quantity,
    purchasedQuantity: r.purchased_quantity,
    bottleSizeMl: r.bottle_size_ml,
    storageLocation: r.storage_location,
    purchasedOn: r.purchased_on,
    purchaseSource: r.purchase_source,
    pricePerBottle: numberOrNull(r.price_per_bottle),
    currency: r.currency,
    drinkFrom: r.drink_from,
    drinkTo: r.drink_to,
    lotNote: r.lot_note,
    createdAt: r.created_at,
  };
}

export function wineFrom(
  catalogWineId: string,
  c: CatalogEmbed | null,
): BottleWine {
  const producer = relName(c?.producer);
  const appellation = relName(c?.appellation);
  // `vintageLabel` is not stored: the row keeps the three vintage parts so
  // every surface builds the same label from `./format`.
  const vintageKind: VintageKind = c?.vintage_kind ?? "NV";
  return {
    catalogWineId,
    title: c
      ? catalogWineTitle({
          producerName: producer,
          wineName: c.wine_name,
          vintageKind,
          vintageYear: c.vintage_year,
          vintageTawnyYears: c.vintage_tawny_years,
          appellationName: appellation,
        })
      : "Untitled wine",
    producer,
    wineName: c?.wine_name ?? null,
    vintageKind,
    vintageYear: c?.vintage_year ?? null,
    vintageTawnyYears: c?.vintage_tawny_years ?? null,
    primaryGrape: relName(c?.primary_grape),
    colour: c?.colour ?? null,
    style: c?.style ?? null,
    designation: relName(c?.type_designation),
    appellation,
    region: relName(c?.region),
    country: relName(c?.country),
    imageUrl: c?.image_url ?? null,
  };
}

export function bottleRowFrom(
  r: LotEmbedRow,
  extras: {
    community: CommunityRating;
    yours: YourScore | null;
    inFlight: number;
  },
): BottleRow {
  return {
    lot: lotFrom(r),
    wine: wineFrom(r.catalog_wine_id, unwrapEmbed(r.catalog_wines)),
    community: extras.community,
    yours: extras.yours,
    inFlight: extras.inFlight,
  };
}
