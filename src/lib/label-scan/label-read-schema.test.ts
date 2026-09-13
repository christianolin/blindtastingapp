import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { LabelReadSchema, coerceLabelRead } from "./label-read-schema";

const dir = path.join(process.cwd(), "src/lib/label-scan/__fixtures__");
const fixtures = readdirSync(dir).filter((f) => f.endsWith(".json"));
const base = () => JSON.parse(readFileSync(path.join(dir, "produttori-barbaresco-2018.json"), "utf8"));

it("commits the nine fixtures", () => expect(fixtures).toHaveLength(9));
it.each(fixtures)("%s satisfies LabelReadSchema", (f) =>
  expect(LabelReadSchema.safeParse(JSON.parse(readFileSync(path.join(dir, f), "utf8"))).success).toBe(true));
it("the SDK zod helper accepts the schema (no network)", () => expect(() => zodOutputFormat(LabelReadSchema)).not.toThrow());

describe("coerceLabelRead (spec A.3 rules 1–8)", () => {
  it("1 trims, blanks become null, rawText ≤ 2000", () => {
    const r = coerceLabelRead({ ...base(), wineName: "  ", producer: " Produttori del Barbaresco ", rawText: "x".repeat(3000) });
    expect([r.wineName, r.producer, r.rawText.length]).toEqual([null, "Produttori del Barbaresco", 2000]);
  });
  it("2 not a label clears the identity", () =>
    expect(coerceLabelRead({ ...base(), isWineLabel: false })).toMatchObject({ producer: null, appellation: null, country: null, grapes: [], noGeographicIndication: false, vintageRead: false, confidence: "low" }));
  it("3 year and tawny ranges", () => {
    expect(coerceLabelRead({ ...base(), vintageYear: 1800 }).vintageYear).toBeNull();
    expect(coerceLabelRead({ ...base(), vintageKind: "YEAR", vintageTawnyYears: 20 }).vintageTawnyYears).toBeNull();
  });
  it("4 an incomplete vintage shape is never read", () =>
    expect(coerceLabelRead({ ...base(), vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: null, vintageRead: true }).vintageRead).toBe(false));
  it("5 no geographic indication nulls the appellation", () =>
    expect(coerceLabelRead({ ...base(), noGeographicIndication: true }).appellation).toBeNull());
  it("6 grapes: empty names, bad percentages, folded duplicates", () =>
    expect(coerceLabelRead({ ...base(), grapes: [{ name: "Nebbiolo", percentage: 150 }, { name: "nebbiolo", percentage: 20 }, { name: " ", percentage: 10 }] }).grapes)
      .toEqual([{ name: "Nebbiolo", percentage: null }]));
  it("7 alcohol in (0, 100), one decimal", () => {
    expect(coerceLabelRead({ ...base(), alcoholPercent: 14.04 }).alcoholPercent).toBe(14);
    expect(coerceLabelRead({ ...base(), alcoholPercent: 0 }).alcoholPercent).toBeNull();
  });
  it("8 out-of-schema values", () =>
    expect(coerceLabelRead({ ...base(), colour: "PURPLE", style: "FIZZY", confidence: "sure", vintageKind: "BOTTLE", vintageYear: 2018 }))
      .toMatchObject({ colour: null, style: null, confidence: "low", vintageKind: "YEAR" }));
});

// Review follow-ups (F4 fix): branches the verbatim cases above leave unpinned, and
// transport drift that zodOutputFormat does not constrain (enums reach the API as
// description text only).
describe("coerceLabelRead review cases", () => {
  const vintage = (patch: Record<string, unknown>) => {
    const r = coerceLabelRead({ ...base(), ...patch });
    return { kind: r.vintageKind, year: r.vintageYear, tawny: r.vintageTawnyYears, read: r.vintageRead };
  };

  it("2 not a label clears every identity field and keeps rawText", () => {
    const b = base();
    expect(coerceLabelRead({ ...b, isWineLabel: false })).toEqual({
      ...b, isWineLabel: false, producer: null, wineName: null, appellation: null, noGeographicIndication: false,
      region: null, country: null, designation: null, vintageYear: null, vintageTawnyYears: null, vintageRead: false,
      colour: null, style: null, grapes: [], alcoholPercent: null, description: null, confidence: "low",
    });
  });
  it("2 a missing or non-boolean isWineLabel is not a label", () => {
    const withoutFlag = base();
    delete withoutFlag.isWineLabel;
    expect(coerceLabelRead(withoutFlag)).toMatchObject({ isWineLabel: false, producer: null, grapes: [] });
    expect(coerceLabelRead({ ...base(), isWineLabel: "true" })).toMatchObject({ isWineLabel: false, producer: null });
  });
  it("3 year bounds 1900..2100, integers only", () => {
    expect([2101, 2100, 1900, 1899, 2018.5].map((y) => coerceLabelRead({ ...base(), vintageYear: y }).vintageYear))
      .toEqual([null, 2100, 1900, null, null]);
  });
  it("3 tawny age 1..100 on a TAWNY read", () => {
    const tawny = (t: unknown) => coerceLabelRead({ ...base(), vintageKind: "TAWNY", vintageYear: null, vintageTawnyYears: t }).vintageTawnyYears;
    expect([101, 100, 1, 0, 20.5].map(tawny)).toEqual([null, 100, 1, null, null]);
  });
  it("4 an empty YEAR shape is never read", () =>
    expect(vintage({ vintageKind: "YEAR", vintageYear: null, vintageRead: true })).toEqual({ kind: "YEAR", year: null, tawny: null, read: false }));
  it("4 a stated NV is read", () =>
    expect(vintage({ vintageKind: "NV", vintageYear: null, vintageRead: true })).toMatchObject({ kind: "NV", read: true }));
  it("8 an unknown kind defaults to NV without a year, YEAR with one, and is never read", () => {
    expect(vintage({ vintageKind: "BOTTLE", vintageYear: null, vintageTawnyYears: 20, vintageRead: true }))
      .toEqual({ kind: "NV", year: null, tawny: null, read: false });
    expect(vintage({ vintageKind: undefined, vintageYear: null, vintageRead: true })).toMatchObject({ kind: "NV", read: false });
    expect(vintage({ vintageKind: "BOTTLE", vintageYear: 2018, vintageRead: true })).toEqual({ kind: "YEAR", year: 2018, tawny: null, read: false });
  });
  it("8 enum values match folded: case, accents and punctuation are transport noise", () => {
    expect(coerceLabelRead({ ...base(), colour: "Red", style: "still", confidence: "High" }))
      .toMatchObject({ colour: "RED", style: "STILL", confidence: "high" });
    expect(coerceLabelRead({ ...base(), colour: " Rosé " }).colour).toBe("ROSE");
    expect(vintage({ vintageKind: "Tawny", vintageYear: null, vintageTawnyYears: 20, vintageRead: true }))
      .toEqual({ kind: "TAWNY", year: null, tawny: 20, read: true });
    expect(vintage({ vintageKind: "n/v", vintageYear: null, vintageRead: true })).toMatchObject({ kind: "NV", read: true });
  });
  it("6 a grape name that folds to nothing is dropped, never merged with another", () => {
    expect(coerceLabelRead({ ...base(), grapes: [{ name: "Ркацители", percentage: 60 }, { name: "Саперави", percentage: 40 }] }).grapes)
      .toEqual([]);
    expect(coerceLabelRead({ ...base(), grapes: [{ name: "—", percentage: null }, { name: "Nebbiolo", percentage: 100 }] }).grapes)
      .toEqual([{ name: "Nebbiolo", percentage: 100 }]);
  });
});
