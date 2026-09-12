import { describe, expect, it } from "vitest";
import type { WineFormInitial } from "@/app/catalog/new/new-wine-form";
import {
  actionLabel,
  applyInference,
  buildIdentity,
  colourGroupOf,
  missingFields,
  parseAlcohol,
  parseYear,
  pickProducerSuggestion,
  producerRowLabel,
  stateFromPrefill,
  type ByHandState,
} from "./by-hand-logic";

const inference = {
  countryId: "c-it",
  countryName: "Italy",
  regionId: "r-pie",
  regionName: "Piemonte",
  appellationId: "a-pie",
  appellationName: "Piemonte DOC",
  primaryGrapeId: "g-neb",
  primaryGrapeName: "Nebbiolo",
};

const prefill: WineFormInitial = {
  countryId: "c-it",
  regionId: "r-pie",
  appellationId: "a-barb",
  blend: [
    { grapeId: "", percentage: "", pendingName: "Nebbiolo" },
    { grapeId: "g-bar", percentage: "" },
  ],
  producerId: "",
  producerLabel: "Cigliuti",
  typeDesignationId: "td-docg",
  colour: "ROSE",
  style: "SPARKLING",
  wineName: "Serraboella",
  description: "  A single vineyard.  ",
  profile: {
    wineryDescription: null,
    aroma: null,
    tastingNotes: null,
    foodPairing: null,
    servingTempC: null,
    decantMinutes: null,
    alcoholPercent: 14.5,
  },
  estimatedPrice: "",
  vintagePrompt: false,
  vintageKind: "YEAR",
  vintageYear: "2017",
  tawnyYears: "",
  imageUrl: "https://x/label.jpg",
  appellations: [{ id: "a-barb", name: "Barbaresco DOCG" }],
};

function complete(): ByHandState {
  return {
    ...stateFromPrefill(prefill),
    producerId: "p-cig",
    primaryGrapeId: "g-neb",
    primaryGrapePending: "",
  };
}

describe("stateFromPrefill", () => {
  it("starts empty with the form defaults", () => {
    const s = stateFromPrefill(null);
    expect(s.producerId).toBe("");
    expect(s.producerName).toBe("");
    expect(s.vintageKind).toBe("YEAR");
    expect(s.style).toBe("STILL");
    expect(s.colour).toBeNull();
    expect(s.colourGroup).toBeNull();
    expect(s.originSource).toBe("none");
    expect(s.imageUrl).toBeNull();
  });

  it("seeds every field from a scan prefill, pending names included", () => {
    const s = stateFromPrefill(prefill);
    expect(s.producerId).toBe("");
    expect(s.producerName).toBe("Cigliuti");
    expect(s.wineName).toBe("Serraboella");
    expect(s.vintageKind).toBe("YEAR");
    expect(s.vintageYear).toBe("2017");
    expect(s.colour).toBe("ROSE");
    expect(s.colourGroup).toBe("OTHER");
    expect(s.style).toBe("SPARKLING");
    expect(s.countryId).toBe("c-it");
    expect(s.regionId).toBe("r-pie");
    expect(s.appellationId).toBe("a-barb");
    expect(s.primaryGrapeId).toBe("");
    expect(s.primaryGrapePending).toBe("Nebbiolo");
    expect(s.secondaryGrapeId).toBe("g-bar");
    expect(s.typeDesignationId).toBe("td-docg");
    expect(s.alcohol).toBe("14.5");
    expect(s.description).toBe("  A single vineyard.  ");
    expect(s.imageUrl).toBe("https://x/label.jpg");
    expect(s.originSource).toBe("prefill");
    expect(s.labels.appellation).toBe("Barbaresco DOCG");
  });

  it("treats an unread vintage as a year still to type, not NV", () => {
    const s = stateFromPrefill({ ...prefill, vintagePrompt: true, vintageKind: "NV", vintageYear: "" });
    expect(s.vintageKind).toBe("YEAR");
    expect(s.vintageYear).toBe("");
  });
});

describe("colourGroupOf", () => {
  it("maps the four colours onto the three segments", () => {
    expect(colourGroupOf("RED")).toBe("RED");
    expect(colourGroupOf("WHITE")).toBe("WHITE");
    expect(colourGroupOf("ROSE")).toBe("OTHER");
    expect(colourGroupOf("ORANGE")).toBe("OTHER");
    expect(colourGroupOf(null)).toBeNull();
  });
});

describe("applyInference", () => {
  it("fills an untouched origin wholesale and marks it inferred", () => {
    const s = applyInference(stateFromPrefill(null), inference);
    expect(s.countryId).toBe("c-it");
    expect(s.regionId).toBe("r-pie");
    expect(s.appellationId).toBe("a-pie");
    expect(s.primaryGrapeId).toBe("g-neb");
    expect(s.labels).toEqual({
      country: "Italy",
      region: "Piemonte",
      appellation: "Piemonte DOC",
      grape: "Nebbiolo",
    });
    expect(s.originSource).toBe("inferred");
  });

  it("replaces a previous inference when the producer changes", () => {
    const first = applyInference(stateFromPrefill(null), inference);
    const s = applyInference(first, {
      ...inference,
      countryId: "c-fr",
      countryName: "France",
      regionId: "r-bdx",
      regionName: "Bordeaux",
      appellationId: "a-bdx",
      appellationName: "Bordeaux AOP",
      primaryGrapeId: "g-cs",
      primaryGrapeName: "Cabernet Sauvignon",
    });
    expect(s.regionId).toBe("r-bdx");
    expect(s.appellationId).toBe("a-bdx");
    expect(s.primaryGrapeId).toBe("g-cs");
  });

  it("keeps a label-read origin and only fills what is empty", () => {
    const s = applyInference(stateFromPrefill(prefill), inference);
    expect(s.appellationId).toBe("a-barb");
    expect(s.originSource).toBe("prefill");
    // The pending grape name is a real value — not overwritten.
    expect(s.primaryGrapeId).toBe("");
    expect(s.primaryGrapePending).toBe("Nebbiolo");
  });

  it("fills the appellation and grape when the region agrees and they are empty", () => {
    const base: ByHandState = {
      ...stateFromPrefill(prefill),
      appellationId: "",
      primaryGrapePending: "",
      labels: { country: null, region: null, appellation: null, grape: null },
    };
    const s = applyInference(base, inference);
    expect(s.appellationId).toBe("a-pie");
    expect(s.primaryGrapeId).toBe("g-neb");
    expect(s.labels.appellation).toBe("Piemonte DOC");
    expect(s.originSource).toBe("prefill");
  });

  it("fills region and appellation under a matching country", () => {
    const base: ByHandState = {
      ...stateFromPrefill(prefill),
      regionId: "",
      appellationId: "",
    };
    const s = applyInference(base, inference);
    expect(s.regionId).toBe("r-pie");
    expect(s.appellationId).toBe("a-pie");
  });

  it("leaves a conflicting manual origin alone", () => {
    const base: ByHandState = {
      ...stateFromPrefill(null),
      countryId: "c-fr",
      regionId: "r-bdx",
      appellationId: "",
      originSource: "manual",
    };
    const s = applyInference(base, inference);
    expect(s.countryId).toBe("c-fr");
    expect(s.regionId).toBe("r-bdx");
    expect(s.appellationId).toBe("");
    // A grape is not region-bound; an empty one still gets the suggestion.
    expect(s.primaryGrapeId).toBe("g-neb");
  });

  it("is a no-op without an inference", () => {
    const base = stateFromPrefill(null);
    expect(applyInference(base, null)).toBe(base);
  });
});

describe("missingFields", () => {
  it("lists every required field, in form order, for an empty state", () => {
    expect(missingFields(stateFromPrefill(null))).toEqual([
      "producer",
      "wine name",
      "vintage",
      "colour",
      "country",
      "region",
      "appellation",
      "grape",
    ]);
  });

  it("is empty for a complete state", () => {
    expect(missingFields(complete())).toEqual([]);
  });

  it("accepts a pending producer and a pending grape as answers", () => {
    const s: ByHandState = {
      ...complete(),
      producerId: "",
      producerName: "New Estate",
      primaryGrapeId: "",
      primaryGrapePending: "Nebbiolo",
    };
    expect(missingFields(s)).toEqual([]);
  });

  it("needs a real year for YEAR and an age for TAWNY, nothing for NV", () => {
    expect(missingFields({ ...complete(), vintageYear: "" })).toEqual(["vintage"]);
    expect(missingFields({ ...complete(), vintageYear: "17" })).toEqual(["vintage"]);
    expect(missingFields({ ...complete(), vintageKind: "TAWNY", tawnyYears: "" })).toEqual([
      "vintage",
    ]);
    expect(missingFields({ ...complete(), vintageKind: "TAWNY", tawnyYears: "20" })).toEqual([]);
    expect(missingFields({ ...complete(), vintageKind: "NV", vintageYear: "" })).toEqual([]);
  });

  it("needs a colour even when the Other segment is chosen", () => {
    expect(missingFields({ ...complete(), colourGroup: "OTHER", colour: null })).toEqual([
      "colour",
    ]);
  });
});

describe("parseYear / parseAlcohol", () => {
  it("parses a four-digit year in range only", () => {
    expect(parseYear("2017")).toBe(2017);
    expect(parseYear(" 1999 ")).toBe(1999);
    expect(parseYear("17")).toBeNull();
    expect(parseYear("2200")).toBeNull();
    expect(parseYear("")).toBeNull();
  });

  it("parses alcohol with a comma or a dot, rejecting nonsense", () => {
    expect(parseAlcohol("13,5")).toBe(13.5);
    expect(parseAlcohol("14")).toBe(14);
    expect(parseAlcohol("")).toBeNull();
    expect(parseAlcohol("abc")).toBeNull();
    expect(parseAlcohol("-1")).toBeNull();
  });
});

describe("buildIdentity", () => {
  it("maps the state onto the ByHandIdentity contract", () => {
    const id = buildIdentity(
      { ...complete(), alcohol: "13,5", secondaryGrapePending: "" },
      { primaryGrapeId: "g-neb", secondaryGrapeId: "g-bar" },
    );
    expect(id).toEqual({
      producerId: "p-cig",
      producerName: "Cigliuti",
      wineName: "Serraboella",
      vintageKind: "YEAR",
      vintageYear: 2017,
      vintageTawnyYears: null,
      colour: "ROSE",
      style: "SPARKLING",
      countryId: "c-it",
      regionId: "r-pie",
      appellationId: "a-barb",
      primaryGrapeId: "g-neb",
      secondaryGrapeId: "g-bar",
      typeDesignationId: "td-docg",
      imageUrl: "https://x/label.jpg",
      description: "A single vineyard.",
      alcoholPercent: 13.5,
    });
  });

  it("keeps a pending producer as a name with a null id", () => {
    const id = buildIdentity(
      { ...complete(), producerId: "", producerName: "  New Estate " },
      { primaryGrapeId: "g-neb", secondaryGrapeId: null },
    );
    expect(id?.producerId).toBeNull();
    expect(id?.producerName).toBe("New Estate");
  });

  it("carries tawny years and blanks the year for TAWNY, both for NV", () => {
    const tawny = buildIdentity(
      { ...complete(), vintageKind: "TAWNY", tawnyYears: "20" },
      { primaryGrapeId: "g-neb", secondaryGrapeId: null },
    );
    expect(tawny?.vintageYear).toBeNull();
    expect(tawny?.vintageTawnyYears).toBe(20);
    const nv = buildIdentity(
      { ...complete(), vintageKind: "NV" },
      { primaryGrapeId: "g-neb", secondaryGrapeId: null },
    );
    expect(nv?.vintageYear).toBeNull();
    expect(nv?.vintageTawnyYears).toBeNull();
  });

  it("returns null when a required value is still missing", () => {
    expect(
      buildIdentity({ ...complete(), colour: null }, { primaryGrapeId: "g-neb", secondaryGrapeId: null }),
    ).toBeNull();
    expect(
      buildIdentity({ ...complete(), wineName: " " }, { primaryGrapeId: "g-neb", secondaryGrapeId: null }),
    ).toBeNull();
  });
});

describe("actionLabel", () => {
  it("names the destination action", () => {
    expect(
      actionLabel({
        kind: "flight",
        tastingId: "t",
        tastingName: "Nebbiolo vs Sangiovese",
        revealMode: "BLIND",
        wineSource: "HOST_PROVIDES",
        position: 4,
      }),
    ).toBe("Add as glass 4");
    expect(actionLabel({ kind: "cellar" })).toBe("Add to cellar");
    expect(actionLabel({ kind: "catalog" })).toBe("Add to the catalog");
    // No destination yet: the footer opens the 7i chooser, it does not add.
    expect(actionLabel(null)).toBe("Choose where it goes");
  });
});

describe("producerRowLabel", () => {
  it("joins name, place and wine count", () => {
    expect(
      producerRowLabel("Cigliuti", { regionName: "Piemonte", countryName: "Italy", wineCount: 4 }),
    ).toBe("Cigliuti · Piemonte, Italy · 4 wines");
    expect(
      producerRowLabel("Cigliuti", { regionName: null, countryName: null, wineCount: 1 }),
    ).toBe("Cigliuti · 1 wine");
    expect(
      producerRowLabel("Cigliuti", { regionName: "Piemonte", countryName: null, wineCount: 0 }),
    ).toBe("Cigliuti · Piemonte · no wines yet");
  });
});

describe("pickProducerSuggestion", () => {
  const hits = [
    { id: "p1", name: "Château Cigliuti" },
    { id: "p2", name: "Cigliuti" },
  ];
  it("prefers an exact (accent-insensitive) name match over the first hit", () => {
    expect(pickProducerSuggestion("cigliuti", hits)).toEqual({ id: "p2", name: "Cigliuti" });
    expect(pickProducerSuggestion("chateau cigliuti", hits)).toEqual({
      id: "p1",
      name: "Château Cigliuti",
    });
  });
  it("falls back to the first hit, and to nothing", () => {
    expect(pickProducerSuggestion("cigl", hits)).toEqual({ id: "p1", name: "Château Cigliuti" });
    expect(pickProducerSuggestion("cigl", [])).toBeNull();
  });
});
