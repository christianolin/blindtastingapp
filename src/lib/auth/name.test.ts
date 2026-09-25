import { describe, expect, it } from "vitest";
import {
  NAME_HINT,
  NAME_LABEL,
  NAME_MAX,
  NAME_REQUIRED,
  NAME_TOO_LONG,
  checkName,
  normalizeName,
  suggestNameFromEmail,
} from "./name";

describe("name copy (spec §4, verbatim)", () => {
  it("label, helper, refusals and the limit", () => {
    expect(NAME_LABEL).toBe("Your name");
    expect(NAME_HINT).toBe("How you'll appear to other tasters.");
    expect(NAME_REQUIRED).toBe("Please enter your name.");
    expect(NAME_TOO_LONG).toBe("Please use a shorter name (80 characters at most).");
    expect(NAME_MAX).toBe(80);
  });
});

describe("normalizeName", () => {
  it("trims both ends", () => {
    expect(normalizeName("  Carsten Olin  ")).toBe("Carsten Olin");
  });

  it("collapses every run of inner whitespace to one space", () => {
    expect(normalizeName("Anna   Marie\tde \n la  Cruz")).toBe("Anna Marie de la Cruz");
  });

  it("is empty for an empty or blank name", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName(" \t\n ")).toBe("");
  });

  it("returns a full name as itself: nothing is joined or added", () => {
    expect(normalizeName("Carsten Olin")).toBe("Carsten Olin");
  });
});

describe("checkName (the server's rule)", () => {
  it("returns the normalised name", () => {
    expect(checkName("  Carsten   Olin ")).toEqual({ name: "Carsten Olin" });
  });

  it("refuses an empty or blank name", () => {
    expect(checkName("")).toEqual({ error: "Please enter your name." });
    expect(checkName("   ")).toEqual({ error: "Please enter your name." });
  });

  it("accepts 80 characters and refuses 81", () => {
    expect(checkName("a".repeat(80))).toEqual({ name: "a".repeat(80) });
    expect(checkName("a".repeat(81))).toEqual({
      error: "Please use a shorter name (80 characters at most).",
    });
  });

  it("measures the length after normalising, so padding never counts", () => {
    expect(checkName(`   ${"a".repeat(80)}   `)).toEqual({ name: "a".repeat(80) });
  });

  it("counts characters, not UTF-16 units: 80 emoji fit, 81 accented letters do not", () => {
    const glasses = "\u{1F377}".repeat(80);
    expect(checkName(glasses)).toEqual({ name: glasses });
    expect(checkName("é".repeat(81))).toEqual({ error: NAME_TOO_LONG });
  });
});

describe("suggestNameFromEmail", () => {
  it("splits on dots and title-cases each part", () => {
    expect(suggestNameFromEmail("carsten.olin@example.com")).toBe("Carsten Olin");
  });

  it("title-cases a one-part local part", () => {
    expect(suggestNameFromEmail("cdo@example.com")).toBe("Cdo");
  });

  it("splits on underscores and digits, dropping the digits", () => {
    expect(suggestNameFromEmail("jens_h2@example.com")).toBe("Jens H");
  });

  it("splits on hyphens", () => {
    expect(suggestNameFromEmail("anna-maria@example.com")).toBe("Anna Maria");
  });

  it("ignores leading, trailing and repeated separators", () => {
    expect(suggestNameFromEmail(".carsten..olin_@example.com")).toBe("Carsten Olin");
  });

  it("lower-cases the rest of each part", () => {
    expect(suggestNameFromEmail("CDO@example.com")).toBe("Cdo");
    expect(suggestNameFromEmail("CARSTEN.OLIN@example.com")).toBe("Carsten Olin");
  });

  it("keeps letters outside ASCII", () => {
    expect(suggestNameFromEmail("søren.ørsted@example.dk")).toBe("Søren Ørsted");
  });

  it("keeps any other character inside its part (plus addressing is not a separator)", () => {
    expect(suggestNameFromEmail("carsten+blindr@example.com")).toBe("Carsten+blindr");
  });

  it("falls back to the raw local part when nothing is left to title-case", () => {
    expect(suggestNameFromEmail("2024@example.com")).toBe("2024");
    expect(suggestNameFromEmail("__@example.com")).toBe("__");
  });

  it("is empty only when the local part itself is", () => {
    expect(suggestNameFromEmail("")).toBe("");
    expect(suggestNameFromEmail("@example.com")).toBe("");
  });
});
