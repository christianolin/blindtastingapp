import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DOSAGE_CATEGORY,
  DOSAGE_NAMES,
  canonicalDosageName,
  dosageApplies,
  dosageChoices,
  typeDesignationChoices,
  effectiveDosageId,
  isDosageCategory,
  splitDosageFromName,
} from "./dosage";

describe("canonicalDosageName", () => {
  it.each([
    ["Brut Nature", "Brut Nature"],
    ["BRUT NATURE", "Brut Nature"],
    ["brut-nature", "Brut Nature"],
    ["Extra Brut", "Extra Brut"],
    ["Brut", "Brut"],
    ["Extra Dry", "Extra Dry"],
    ["Sec", "Sec"],
    ["Demi-Sec", "Demi-Sec"],
    ["Doux", "Doux"],
  ])("keeps the canonical %s as %s", (text, name) => {
    expect(canonicalDosageName(text)).toBe(name);
  });

  it.each([
    ["Semiseco", "Demi-Sec"],
    ["Semi-seco", "Demi-Sec"],
    ["Semi-sec", "Demi-Sec"],
    ["SEMI SEC", "Demi-Sec"],
    ["Demi-sec", "Demi-Sec"],
    ["Demi sec", "Demi-Sec"],
    ["Pas dosé", "Brut Nature"],
    ["PAS DOSE", "Brut Nature"],
    ["Dosage zéro", "Brut Nature"],
    ["Zero dosage", "Brut Nature"],
    ["Dosaggio zero", "Brut Nature"],
    ["Brut zero", "Brut Nature"],
    ["Extra seco", "Extra Dry"],
    ["Extra sec", "Extra Dry"],
    ["Seco", "Sec"],
    ["Dulce", "Doux"],
    ["Dolce", "Doux"],
  ])("resolves the local name %s to %s", (text, name) => {
    expect(canonicalDosageName(text)).toBe(name);
  });

  it.each([null, "", "  ", "Gran Reserva", "Reserva", "Nature", "Dry", "Blanc de Noirs", "贺兰晴雪"])(
    "knows no dosage in %s",
    (text) => {
      expect(canonicalDosageName(text)).toBeNull();
    },
  );

  it("maps every synonym onto one of the seven Sparkling Dosage rows", () => {
    expect(DOSAGE_NAMES).toEqual(["Brut Nature", "Extra Brut", "Brut", "Extra Dry", "Sec", "Demi-Sec", "Doux"]);
  });
});

describe("splitDosageFromName", () => {
  it("takes a name that is only a dosage word out of the name", () => {
    expect(splitDosageFromName("Semi-sec")).toEqual({ wineName: null, dosage: "Demi-Sec" });
    expect(splitDosageFromName("Brut Nature")).toEqual({ wineName: null, dosage: "Brut Nature" });
  });

  it("strips a trailing dosage phrase", () => {
    expect(splitDosageFromName("Òrtus Brut Nature")).toEqual({ wineName: "Òrtus", dosage: "Brut Nature" });
    expect(splitDosageFromName("Reserva Superior – Semi Sec")).toEqual({ wineName: "Reserva Superior", dosage: "Demi-Sec" });
  });

  it("strips a leading dosage phrase", () => {
    expect(splitDosageFromName("Brut Yellow Label")).toEqual({ wineName: "Yellow Label", dosage: "Brut" });
    expect(splitDosageFromName("Pas Dosé Grand Cru")).toEqual({ wineName: "Grand Cru", dosage: "Brut Nature" });
  });

  it("takes the longest phrase, so Extra Brut is never read as Brut", () => {
    expect(splitDosageFromName("Cuvée Extra Brut")).toEqual({ wineName: "Cuvée", dosage: "Extra Brut" });
  });

  it("leaves a dosage word in the middle of a name alone", () => {
    expect(splitDosageFromName("Le Brut de Mon Père")).toEqual({ wineName: "Le Brut de Mon Père", dosage: null });
  });

  it("leaves a name without a dosage word alone", () => {
    expect(splitDosageFromName("Òrtus Blanc de Noirs")).toEqual({ wineName: "Òrtus Blanc de Noirs", dosage: null });
    expect(splitDosageFromName("Nodal")).toEqual({ wineName: "Nodal", dosage: null });
  });

  it("is null for a null or blank name", () => {
    expect(splitDosageFromName(null)).toEqual({ wineName: null, dosage: null });
    expect(splitDosageFromName("  ")).toEqual({ wineName: null, dosage: null });
  });
});

describe("dosage applies to sparkling wines only", () => {
  it("dosageApplies", () => {
    expect(dosageApplies("SPARKLING")).toBe(true);
    for (const style of ["STILL", "SWEET", "FORTIFIED", null] as const) expect(dosageApplies(style)).toBe(false);
  });

  it("effectiveDosageId keeps a dosage only on a sparkling wine", () => {
    expect(effectiveDosageId("SPARKLING", "d1")).toBe("d1");
    expect(effectiveDosageId("SPARKLING", " ")).toBeNull();
    expect(effectiveDosageId("STILL", "d1")).toBeNull();
    expect(effectiveDosageId(null, "d1")).toBeNull();
  });

  it("isDosageCategory", () => {
    expect(isDosageCategory(DOSAGE_CATEGORY)).toBe(true);
    expect(isDosageCategory("Aging Classification")).toBe(false);
    expect(isDosageCategory(null)).toBe(false);
  });
});

describe("the dosage migration", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "supabase/migrations/20261003101000_catalog_dosage.sql"),
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("asserts the same seven Sparkling Dosage rows, in order", () => {
    expect(sql).toContain(`'${DOSAGE_NAMES.join("|")}'`);
    expect(sql).toContain(`'${DOSAGE_CATEGORY}'`);
  });

  it("makes the dosage part of the identity key", () => {
    expect(sql).toMatch(/create unique index catalog_wines_identity_key[\s\S]*dosage_designation_id/);
  });
});

describe("the two pickers (type designation and dosage) never offer the same row", () => {
  const rows = [
    { id: "gr", name: "Gran Reserva", category: "Aging Classification" },
    { id: "doux", name: "Doux", category: DOSAGE_CATEGORY },
    { id: "brut", name: "Brut", category: DOSAGE_CATEGORY },
    { id: "bn", name: "Brut Nature", category: DOSAGE_CATEGORY },
    { id: "own", name: "Cuvée maison", category: null },
  ];

  it("the type designation picker leaves the dosages out", () => {
    expect(typeDesignationChoices(rows, null).map((r) => r.id)).toEqual(["gr", "own"]);
  });

  it("but keeps a dosage an older answer key already names", () => {
    expect(typeDesignationChoices(rows, "brut").map((r) => r.id)).toEqual(["gr", "brut", "own"]);
  });

  it("the dosage picker lists only the dosages, driest first", () => {
    expect(dosageChoices(rows).map((r) => r.name)).toEqual(["Brut Nature", "Brut", "Doux"]);
  });
});
