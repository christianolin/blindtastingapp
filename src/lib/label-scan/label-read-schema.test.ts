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
