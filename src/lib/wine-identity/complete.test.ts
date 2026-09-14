import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPLETE_WINE_FIELDS, UNIDENTIFIED_WINE_FIELDS, emptyDraft, missingWineFields,
  normaliseDraft, toCompleteWine, toUnidentifiedWine, vintageYearMax,
} from "./complete";
import type { WineIdentityDraft } from "./types";

const NOW = new Date("2026-09-12T12:00:00Z");
const nebbiolo = { kind: "existing", id: "g-neb", name: "Nebbiolo" } as const;
const full = (): WineIdentityDraft => ({
  ...emptyDraft(),
  producer: { kind: "existing", id: "p1", name: "Produttori del Barbaresco" },
  vintage: { kind: "YEAR", year: 2018, tawnyYears: null, read: true },
  colour: "RED", style: "STILL",
  countryId: "c-it", regionId: "r-pie", appellationId: "a-bbr",
  blend: [{ grape: nebbiolo, percentage: 100 }],
});
const COLUMN: Record<(typeof COMPLETE_WINE_FIELDS)[number], string> = {
  producer: "producer_id", vintage: "vintage_kind", colour: "colour", style: "style",
  country: "country_id", region: "region_id", appellation: "appellation_id", primaryGrape: "primary_grape_id",
};
const migration = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

describe("COMPLETE_WINE_FIELDS is pinned to the catalog_wines NOT NULL columns (D2)", () => {
  it("equals 20260829211000's set-not-null columns minus wine_name, plus the three original ones", () => {
    const sql = migration("20260829211000_catalog_wines_strict.sql");
    expect(sql).toContain("-- country_id, primary_grape_id, producer_id are already NOT NULL.");
    const cols = new Set([...sql.matchAll(/alter column\s+(\w+)\s+set not null/g)].map((m) => m[1]));
    cols.delete("wine_name");
    ["country_id", "primary_grape_id", "producer_id"].forEach((c) => cols.add(c));
    expect(new Set(COMPLETE_WINE_FIELDS.map((f) => COLUMN[f]))).toEqual(cols);
  });
  it("keeps wine name optional (D3)", () => {
    expect(migration("20260829215000_wine_name_optional.sql")).toContain("alter column wine_name drop not null");
    expect(Object.values(COLUMN)).not.toContain("wine_name");
  });
});

describe("missingWineFields", () => {
  it.each<[string, (d: WineIdentityDraft) => WineIdentityDraft, string[]]>([
    ["a complete read", (d) => d, []],
    ["no wine name", (d) => ({ ...d, wineName: null }), []],
    ["a pending producer", (d) => ({ ...d, producer: { kind: "pending", name: "Cigliuti" } }), []],
    ["a pending producer that folds to nothing", (d) => ({ ...d, producer: { kind: "pending", name: " – " } }), ["producer"]],
    ["a pending grape", (d) => ({ ...d, blend: [{ grape: { kind: "pending", name: "Pelaverga" }, percentage: null }] }), []],
    ["no style", (d) => ({ ...d, style: null }), ["style"]],
    ["a region but a blank appellation", (d) => ({ ...d, appellationId: "" }), ["appellation"]],
    ["TAWNY without an age", (d) => ({ ...d, vintage: { kind: "TAWNY", year: null, tawnyYears: null, read: false }, style: "FORTIFIED" }), ["vintage"]],
    ["a year two years ahead", (d) => ({ ...d, vintage: { ...d.vintage, year: 2028 } }), ["vintage"]],
    ["next year", (d) => ({ ...d, vintage: { ...d.vintage, year: 2027 } }), []],
    ["1899", (d) => ({ ...d, vintage: { ...d.vintage, year: 1899 } }), ["vintage"]],
    ["NV", (d) => ({ ...d, vintage: { kind: "NV", year: null, tawnyYears: null, read: true } }), []],
    ["no vintage and no grape", (d) => ({ ...d, vintage: { kind: null, year: null, tawnyYears: null, read: false }, blend: [] }), ["vintage", "primaryGrape"]],
  ])("%s", (_l, edit, expected) => expect(missingWineFields(edit(full()), { now: NOW })).toEqual(expected));

  it("lists every field in contract order for an empty draft", () =>
    expect(missingWineFields(emptyDraft(), { now: NOW })).toEqual([...COMPLETE_WINE_FIELDS]));

  it("unidentified mode needs vintage, country, region and grape only (byhand-7)", () => {
    const d: WineIdentityDraft = { ...emptyDraft(), vintage: { kind: "NV", year: null, tawnyYears: null, read: false }, countryId: "c-fr", regionId: "r-bdx", blend: [{ grape: nebbiolo, percentage: null }] };
    expect(missingWineFields(d, { unidentified: true, now: NOW })).toEqual([]);
    expect(missingWineFields(emptyDraft(), { unidentified: true, now: NOW })).toEqual([...UNIDENTIFIED_WINE_FIELDS]);
  });
});

describe("normaliseDraft", () => {
  it("has next UTC year as the max", () => expect(vintageYearMax(NOW)).toBe(2027));
  it("TAWNY forces FORTIFIED and clears the year", () => {
    const d = normaliseDraft({ ...full(), vintage: { kind: "TAWNY", year: 2001, tawnyYears: 20, read: true }, style: "STILL" });
    expect([d.style, d.vintage]).toEqual(["FORTIFIED", { kind: "TAWNY", year: null, tawnyYears: 20, read: true }]);
  });
  it("turns blank text into null", () => {
    const d = normaliseDraft({ ...full(), wineName: "  ", description: "" });
    expect([d.wineName, d.description]).toEqual([null, null]);
  });
  it("dedupes, drops empty pending rows and orders like orderedBlend", () => {
    const merlot = { kind: "existing", id: "g-mer", name: "Merlot" } as const;
    const cab = { kind: "existing", id: "g-cab", name: "Cabernet Sauvignon" } as const;
    const d = normaliseDraft({ ...full(), blend: [
      { grape: merlot, percentage: 20 }, { grape: cab, percentage: 80 }, { grape: merlot, percentage: 5 },
      { grape: { kind: "pending", name: "Petit Verdot" }, percentage: null },
      { grape: { kind: "pending", name: "petit-verdot" }, percentage: null },
      { grape: { kind: "pending", name: "  " }, percentage: null },
    ] });
    expect(d.blend.map((b) => b.grape.name)).toEqual(["Cabernet Sauvignon", "Merlot", "Petit Verdot"]);
  });
  it("keeps alcohol only in (0, 100), one decimal", () => {
    expect(normaliseDraft({ ...full(), alcohol: 13.46 }).alcohol).toBe(13.5);
    expect(normaliseDraft({ ...full(), alcohol: 0 }).alcohol).toBeNull();
    expect(normaliseDraft({ ...full(), alcohol: 100 }).alcohol).toBeNull();
  });
});

describe("toCompleteWine / toUnidentifiedWine", () => {
  it("derives primary and secondary from the ordered blend", () => {
    const r = toCompleteWine({ ...full(), blend: [{ grape: { kind: "existing", id: "g-bar", name: "Barbera" }, percentage: 10 }, { grape: nebbiolo, percentage: 90 }] }, { now: NOW });
    if (!("wine" in r)) throw new Error("expected a wine");
    expect(r.wine.primaryGrape).toEqual(nebbiolo);
    expect(r.wine.secondaryGrape).toMatchObject({ id: "g-bar" });
  });
  it("returns the missing keys instead", () => expect(toCompleteWine({ ...full(), colour: null }, { now: NOW })).toEqual({ missing: ["colour"] }));
  // This assertion is correct and has always passed -- and for a year the
  // database disagreed with it. wine_answers.producer_id was NOT NULL live,
  // because 20260807090000_optional_producer_vintage.sql never ran (its version
  // collided with cote_de_nuits_villages and the applier records
  // `on conflict do nothing`). So a producer-less unidentified glass passed
  // here, passed prepareUnidentifiedWine, inserted into
  // catalog_wines_unidentified -- and then died on a raw 23502 inserting the
  // answer key. database.types.ts says `string | null`, so tsc could not see it.
  //
  // Fixed by 20260914140000_answer_key_optional_producer.sql. If this test is
  // ever the thing that fails, the answer is NOT to start requiring a producer
  // here: check that migration is applied (.tiles-build/drift-check.mjs).
  it("an unidentified glass needs no producer, colour, style or appellation", () =>
    expect("wine" in toUnidentifiedWine({ ...full(), producer: null, colour: null, style: null, appellationId: null }, { now: NOW })).toBe(true));

  it("carries the null producer through rather than inventing one", () => {
    const r = toUnidentifiedWine({ ...full(), producer: null }, { now: NOW });
    if (!("wine" in r)) throw new Error("expected a wine");
    expect(r.wine.producer).toBeNull();
  });
});
