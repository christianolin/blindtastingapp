import { describe, expect, it } from "vitest";
import { emptyDraft } from "../../lib/wine-identity/complete";
import type { WineIdentityDraft } from "../../lib/wine-identity/types";
import { glassLabel, notePickPlan, starLabel, vintageLabel } from "./format";
import type { AddSource } from "./types";

const complete: WineIdentityDraft = {
  ...emptyDraft(), producer: { kind: "existing", id: "p", name: "Vietti" }, vintage: { kind: "YEAR", year: 2017, tawnyYears: null, read: false },
  colour: "RED", style: "STILL", countryId: "it", regionId: "pie", appellationId: "barolo",
  blend: [{ grape: { kind: "existing", id: "neb", name: "Nebbiolo" }, percentage: null }],
};
it("notePickPlan: a catalog source picks directly", () =>
  expect(notePickPlan({ kind: "catalog", catalogWineId: "c1", via: "search" })).toEqual({ kind: "pick", pick: { catalogWineId: "c1" } }));
it("notePickPlan: a lot carries its wine and consume", () =>
  expect(notePickPlan({ kind: "lot", lotId: "l1", consume: true, catalogWineId: "c1" })).toEqual({ kind: "pick", pick: { catalogWineId: "c1", lotId: "l1", consume: true } }));
it("notePickPlan: a complete identity is written to the catalog first", () =>
  expect(notePickPlan({ kind: "identity", draft: complete, via: "byhand", readId: null }).kind).toBe("catalog-first"));
it("notePickPlan: an identity with gaps opens By hand first (D7)", () =>
  expect(notePickPlan({ kind: "identity", draft: emptyDraft(), via: "scan", readId: null }).kind).toBe("by-hand-first"));

describe("notePickPlan: the rest of a note's single pick (C1, C2, D7)", () => {
  it("a complete identity goes to the catalog as it is, read id included", () => {
    const source: Extract<AddSource, { kind: "identity" }> = { kind: "identity", draft: complete, via: "scan", readId: "r1" };
    expect(notePickPlan(source)).toEqual({ kind: "catalog-first", source });
  });
  it("By hand first carries the draft and names its gaps in completeness order", () => {
    const draft: WineIdentityDraft = { ...complete, vintage: { kind: null, year: null, tawnyYears: null, read: false }, appellationId: null };
    expect(notePickPlan({ kind: "identity", draft, via: "scan", readId: "r1" })).toEqual({ kind: "by-hand-first", draft, missing: ["vintage", "appellation"] });
  });
  it("an incomplete or unidentified draft is finished by hand first; once complete it goes to the catalog as an identity", () => {
    const gaps: WineIdentityDraft = { ...complete, producer: null };
    expect(notePickPlan({ kind: "incomplete", draft: gaps, via: "scan" })).toEqual({ kind: "by-hand-first", draft: gaps, missing: ["producer"] });
    expect(notePickPlan({ kind: "unidentified", draft: gaps })).toEqual({ kind: "by-hand-first", draft: gaps, missing: ["producer"] });
    expect(notePickPlan({ kind: "incomplete", draft: complete, via: "scan" })).toEqual({ kind: "catalog-first", source: { kind: "identity", draft: complete, via: "scan", readId: null } });
    expect(notePickPlan({ kind: "unidentified", draft: complete })).toEqual({ kind: "catalog-first", source: { kind: "identity", draft: complete, via: "byhand", readId: null } });
  });
  it("refuses a lot that arrives without its wine, and a +1 bottle, instead of guessing", () => {
    expect(notePickPlan({ kind: "lot", lotId: "l1", consume: false }).kind).toBe("error");
    expect(notePickPlan({ kind: "plusOne", lotId: "l1" }).kind).toBe("error");
  });
});

describe("glassLabel / vintageLabel / starLabel", () => {
  it("formats a glass number", () => {
    expect(glassLabel(4)).toBe("glass 4");
  });
  it("formats each vintage kind", () => {
    expect(vintageLabel("YEAR", 2018, null)).toBe("2018");
    expect(vintageLabel("YEAR", null, null)).toBeNull();
    expect(vintageLabel("NV", null, null)).toBe("NV");
    expect(vintageLabel("TAWNY", null, 20)).toBe("20yo");
    expect(vintageLabel("TAWNY", null, null)).toBe("Tawny");
  });
  it("formats a rating average", () => {
    expect(starLabel(91.4)).toBe("★ 91");
    expect(starLabel(null)).toBeNull();
  });
});
