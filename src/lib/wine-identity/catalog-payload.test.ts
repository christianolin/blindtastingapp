import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BORN_HIDDEN_KEY,
  catalogWinePayload,
  flightWineBornHidden,
  type CatalogWineIdentity,
} from "./catalog-payload";

// The find_or_create_catalog_wine payload (spec 2026-09-19-rule1-older-leaks §6.1, §9 T1, T2).

const MIGRATION = "supabase/migrations/20260919223100_rule1_born_hidden_and_shared_cellar.sql";

const WINE: CatalogWineIdentity = {
  countryId: "c0000000-0000-4000-8000-000000000001",
  regionId: "c0000000-0000-4000-8000-000000000002",
  appellationId: "c0000000-0000-4000-8000-000000000003",
  primaryGrapeId: "c0000000-0000-4000-8000-000000000004",
  secondaryGrapeId: "c0000000-0000-4000-8000-000000000005",
  producerId: "c0000000-0000-4000-8000-000000000006",
  typeDesignationId: null,
  vintage: { kind: "YEAR", year: 2015, tawnyYears: null },
  wineName: "Cuvée Test",
  colour: "RED",
  style: "STILL",
};

const IDENTITY_KEYS = [
  "appellation_id",
  "colour",
  "country_id",
  "primary_grape_id",
  "producer_id",
  "region_id",
  "secondary_grape_id",
  "style",
  "type_designation_id",
  "vintage_kind",
  "vintage_tawny_years",
  "vintage_year",
  "wine_name",
];

describe("flightWineBornHidden", () => {
  it("is true for a BLIND flight", () => {
    expect(flightWineBornHidden("BLIND")).toBe(true);
  });

  it("is true for a SEMI_BLIND flight", () => {
    expect(flightWineBornHidden("SEMI_BLIND")).toBe(true);
  });

  it("is false on an OPEN board, whose glasses are inserted revealed", () => {
    expect(flightWineBornHidden("OPEN")).toBe(false);
  });
});

describe("catalogWinePayload", () => {
  it("sends exactly the 13 identity keys and no hidden key by default", () => {
    const payload = catalogWinePayload(WINE);
    expect(Object.keys(payload).sort()).toEqual(IDENTITY_KEYS);
    expect(BORN_HIDDEN_KEY in payload).toBe(false);
    expect(payload).toEqual({
      country_id: WINE.countryId,
      region_id: WINE.regionId,
      appellation_id: WINE.appellationId,
      primary_grape_id: WINE.primaryGrapeId,
      secondary_grape_id: WINE.secondaryGrapeId,
      producer_id: WINE.producerId,
      type_designation_id: null,
      vintage_kind: "YEAR",
      vintage_year: 2015,
      vintage_tawny_years: null,
      wine_name: "Cuvée Test",
      colour: "RED",
      style: "STILL",
    });
  });

  it("sends no hidden key for { hidden: false }", () => {
    const payload = catalogWinePayload(WINE, { hidden: false });
    expect(Object.keys(payload).sort()).toEqual(IDENTITY_KEYS);
    expect(BORN_HIDDEN_KEY in payload).toBe(false);
  });

  it("adds hidden: true to the same 13 keys for { hidden: true }", () => {
    const payload = catalogWinePayload(WINE, { hidden: true });
    expect(Object.keys(payload).sort()).toEqual([...IDENTITY_KEYS, BORN_HIDDEN_KEY].sort());
    expect((payload as Record<string, unknown>)[BORN_HIDDEN_KEY]).toBe(true);
    const identity: Record<string, unknown> = { ...payload };
    delete identity[BORN_HIDDEN_KEY];
    expect(identity).toEqual(catalogWinePayload(WINE));
  });

  it("sends a blank wine name as null (D3)", () => {
    expect(catalogWinePayload({ ...WINE, wineName: null }).wine_name).toBeNull();
  });

  it("carries a tawny vintage through unchanged", () => {
    const payload = catalogWinePayload({ ...WINE, vintage: { kind: "TAWNY", year: null, tawnyYears: 20 } });
    expect(payload.vintage_kind).toBe("TAWNY");
    expect(payload.vintage_year).toBeNull();
    expect(payload.vintage_tawny_years).toBe(20);
  });
});

describe("the born-hidden key is pinned to the migration", () => {
  // Normalised so a CRLF checkout (Windows autocrlf) matches.
  const sql = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");

  it("find_or_create_catalog_wine reads exactly BORN_HIDDEN_KEY, once, defaulting to public", () => {
    const needle = "coalesce((p->>'" + BORN_HIDDEN_KEY + "')::boolean, false)";
    expect(sql.split(needle).length - 1).toBe(1);
  });
});
