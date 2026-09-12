import { describe, expect, it } from "vitest";
import {
  glassLabel,
  identityFromPrefill,
  ratePickPlan,
  scanTitle,
  vintageLabel,
  wineMetaFromExtracted,
  wineTitleFromExtracted,
} from "./format";
import type { WineFormInitial } from "@/app/catalog/new/new-wine-form";

const extracted = {
  producer: "Produttori del Barbaresco",
  wineName: "Barbaresco",
  appellation: "Barbaresco DOCG",
  region: "Piedmont",
  country: "Italy",
  vintageKind: "YEAR" as const,
  vintageRead: true,
  vintageYear: 2018,
  grapes: [{ name: "Nebbiolo", percentage: null }],
};

describe("wineTitleFromExtracted", () => {
  it("joins producer, wine name and vintage with commas", () => {
    expect(wineTitleFromExtracted(extracted)).toBe(
      "Produttori del Barbaresco, Barbaresco 2018",
    );
  });
  it("omits an unread vintage and falls back when nothing was read", () => {
    expect(
      wineTitleFromExtracted({ ...extracted, vintageRead: false, vintageYear: null }),
    ).toBe("Produttori del Barbaresco, Barbaresco");
    expect(
      wineTitleFromExtracted({
        ...extracted,
        producer: null,
        wineName: null,
        vintageRead: false,
      }),
    ).toBe("Unnamed wine");
  });
  it("labels NV and tawny reads", () => {
    expect(wineTitleFromExtracted({ ...extracted, vintageKind: "NV", vintageYear: null })).toBe(
      "Produttori del Barbaresco, Barbaresco NV",
    );
    expect(
      wineTitleFromExtracted({ ...extracted, vintageKind: "TAWNY", vintageYear: null }),
    ).toBe("Produttori del Barbaresco, Barbaresco Tawny");
  });
});

describe("wineMetaFromExtracted", () => {
  it("joins appellation · region · country · grapes", () => {
    expect(wineMetaFromExtracted(extracted)).toBe(
      "Barbaresco DOCG · Piedmont · Italy · Nebbiolo",
    );
  });
  it("drops blanks", () => {
    expect(wineMetaFromExtracted({ ...extracted, appellation: null, grapes: [] })).toBe(
      "Piedmont · Italy",
    );
  });
});

describe("glassLabel / vintageLabel / scanTitle", () => {
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
  it("titles a prefill the same way as a read", () => {
    expect(scanTitle(prefill())).toBe("Cigliuti, Barbaresco 2017");
  });
});

function prefill(over: Partial<WineFormInitial> = {}): WineFormInitial {
  return {
    countryId: "c1",
    regionId: "r1",
    appellationId: "a1",
    blend: [{ grapeId: "g1", percentage: "" }],
    producerId: "p1",
    producerLabel: "Cigliuti",
    typeDesignationId: "",
    colour: "RED",
    style: "STILL",
    wineName: "Barbaresco",
    description: null,
    estimatedPrice: "",
    vintageKind: "YEAR",
    vintageYear: "2017",
    tawnyYears: "",
    imageUrl: "https://x/y.jpg",
    appellations: [],
    ...over,
  };
}

describe("identityFromPrefill", () => {
  it("maps a complete prefill to a ByHandIdentity", () => {
    expect(identityFromPrefill(prefill())).toEqual({
      producerId: "p1",
      producerName: "Cigliuti",
      wineName: "Barbaresco",
      vintageKind: "YEAR",
      vintageYear: 2017,
      vintageTawnyYears: null,
      colour: "RED",
      style: "STILL",
      countryId: "c1",
      regionId: "r1",
      appellationId: "a1",
      primaryGrapeId: "g1",
      secondaryGrapeId: null,
      typeDesignationId: null,
      imageUrl: "https://x/y.jpg",
      description: null,
      alcoholPercent: null,
    });
  });
  it("keeps a pending producer by name", () => {
    const id = identityFromPrefill(prefill({ producerId: "", producerLabel: "New Estate" }));
    expect(id?.producerId).toBeNull();
    expect(id?.producerName).toBe("New Estate");
  });
  it("returns null when the floor is missing", () => {
    expect(identityFromPrefill(prefill({ appellationId: "" }))).toBeNull();
    expect(identityFromPrefill(prefill({ vintageYear: "" }))).toBeNull();
    expect(identityFromPrefill(prefill({ vintagePrompt: true }))).toBeNull();
    expect(identityFromPrefill(prefill({ producerId: "", producerLabel: null }))).toBeNull();
    expect(identityFromPrefill(prefill({ blend: [] }))).toBeNull();
    expect(
      identityFromPrefill(prefill({ blend: [{ grapeId: "", percentage: "", pendingName: "X" }] })),
    ).toBeNull();
    expect(identityFromPrefill(prefill({ colour: null }))).toBeNull();
  });
  it("accepts NV and tawny", () => {
    expect(identityFromPrefill(prefill({ vintageKind: "NV", vintageYear: "" }))?.vintageKind).toBe(
      "NV",
    );
    const tawny = identityFromPrefill(prefill({ vintageKind: "TAWNY", vintageYear: "", tawnyYears: "20" }));
    expect(tawny?.vintageTawnyYears).toBe(20);
    expect(identityFromPrefill(prefill({ vintageKind: "TAWNY", vintageYear: "" }))).toBeNull();
  });
});

describe("ratePickPlan", () => {
  it("takes a catalog wine (a search row, a matched scan) as it is", () => {
    expect(ratePickPlan({ kind: "catalog", catalogWineId: "w1" })).toEqual({
      kind: "pick",
      pick: { catalogWineId: "w1" },
    });
  });
  it("carries a cellar lot's wine and its consume choice through, with no lookup", () => {
    expect(
      ratePickPlan({ kind: "lot", lotId: "lot1", consume: true, catalogWineId: "w1" }),
    ).toEqual({ kind: "pick", pick: { catalogWineId: "w1", lotId: "lot1", consume: true } });
    expect(
      ratePickPlan({ kind: "lot", lotId: "lot1", consume: false, catalogWineId: "w1" }),
    ).toEqual({ kind: "pick", pick: { catalogWineId: "w1", lotId: "lot1", consume: false } });
  });
  it("refuses a lot that arrives without its wine instead of guessing", () => {
    const plan = ratePickPlan({ kind: "lot", lotId: "lot1", consume: true });
    expect(plan.kind).toBe("error");
  });
  it("finds or creates a by-hand identity (an unmatched scan) in the catalog first", () => {
    const identity = identityFromPrefill(prefill());
    expect(identity).not.toBeNull();
    expect(ratePickPlan({ kind: "identity", identity: identity! })).toEqual({
      kind: "catalog-first",
      source: { kind: "identity", identity },
    });
  });
});
