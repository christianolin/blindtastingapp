import { describe, expect, it } from "vitest";
import { emptyDraft, missingWineFields } from "./complete";
import { draftFromAnswerKey, draftFromCatalogWine, parseStoredDraft, type CatalogWineSource } from "./from-sources";

const wine: CatalogWineSource = {
  id: "c1", producer: { id: "p", name: "Vietti" }, wineName: "Castiglione", vintageKind: "YEAR", vintageYear: 2017, vintageTawnyYears: null,
  colour: "RED", style: "STILL", countryId: "it", regionId: "pie", appellationId: "barolo", typeDesignationId: null,
  alcohol: 14.5, description: null, imageUrl: null, grapes: [{ id: "neb", name: "Nebbiolo", percentage: null }],
};
describe("draft sources", () => {
  it("a catalog wine is complete and marked catalog-match", () => {
    const d = draftFromCatalogWine(wine);
    expect(missingWineFields(d)).toEqual([]);
    expect(d.provenance).toMatchObject({ producer: "catalog-match", vintage: "catalog-match", appellation: "catalog-match" });
    expect(d.vintage.read).toBe(false);
  });
  it("an answer key without a catalog link keeps primary and secondary, marked manual", () => {
    const d = draftFromAnswerKey({ countryId: "it", regionId: "pie", appellationId: null, producer: null, typeDesignationId: null,
      vintageKind: "NV", vintageYear: null, vintageTawnyYears: null, imageUrl: null,
      primaryGrape: { id: "neb", name: "Nebbiolo" }, secondaryGrape: { id: "bar", name: "Barbera" }, catalog: null });
    expect(d.blend.map((b) => b.grape.name)).toEqual(["Nebbiolo", "Barbera"]);
    expect(d.provenance.country).toBe("manual");
  });
  it("parseStoredDraft round-trips a draft and rejects malformed JSON", () => {
    const d = draftFromCatalogWine(wine);
    expect(parseStoredDraft(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(parseStoredDraft({ ...emptyDraft(), colour: "PURPLE" })).toBeNull();
    expect(parseStoredDraft("nope")).toBeNull();
  });
});
