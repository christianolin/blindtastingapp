import { describe, expect, it } from "vitest";
import { draftFromIdentityInput } from "./identity-draft";
import type { WineIdentityInput } from "./wine-identity-types";

// BlendRow comes from grape-blend-editor.tsx; if it declares further required keys, add them to both rows.
const input = (o: Partial<WineIdentityInput> = {}): WineIdentityInput => ({
  countryId: "c-it", regionId: "r-pie", appellationId: "a-bbr",
  blend: [{ grapeId: "g-neb", percentage: "90" }, { grapeId: "", percentage: "10", pendingName: "Pelaverga" }] as WineIdentityInput["blend"],
  producerId: "", producerLabel: "Cigliuti", typeDesignationId: null, wineName: " ", colour: "RED", style: "STILL",
  vintageKind: "YEAR", vintageYear: "2017", vintageTawnyYears: "", imageUrl: null, ...o,
});
describe("draftFromIdentityInput", () => {
  it("maps a pending producer, a pending grape, a blank name and a year", () => {
    const d = draftFromIdentityInput(input(), { grapes: { "g-neb": "Nebbiolo" } });
    expect(d.producer).toEqual({ kind: "pending", name: "Cigliuti" });
    expect(d.blend).toEqual([
      { grape: { kind: "existing", id: "g-neb", name: "Nebbiolo" }, percentage: 90 },
      { grape: { kind: "pending", name: "Pelaverga" }, percentage: 10 },
    ]);
    expect([d.wineName, d.vintage]).toEqual([null, { kind: "YEAR", year: 2017, tawnyYears: null, read: false }]);
    expect(d.provenance.country).toBe("manual");
  });
  it("maps an existing producer id and a tawny age", () => {
    const d = draftFromIdentityInput(input({ producerId: "p1", producerLabel: "Taylor's", vintageKind: "TAWNY", vintageYear: "", vintageTawnyYears: "20", style: "STILL" }));
    expect(d.producer).toEqual({ kind: "existing", id: "p1", name: "Taylor's" });
    expect([d.vintage.tawnyYears, d.style]).toEqual([20, "FORTIFIED"]);
  });
  it("turns an unknown colour into null", () => expect(draftFromIdentityInput(input({ colour: "" })).colour).toBeNull());
});
