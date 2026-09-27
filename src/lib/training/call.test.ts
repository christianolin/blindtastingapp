import { describe, expect, it } from "vitest";
import { arch } from "./__fixtures__/archetypes";
import {
  NO_CALL,
  callPayload,
  chooseDeeper,
  chooseGrape,
  chooseRegion,
  grapeChips,
  normalizeCall,
  regionCallOptions,
  regionGrapeChoices,
} from "./call";
import { groupRanking } from "./groups";
import type { CallPick, CapReason, RankedCandidate } from "./types";

// Your call by region (region-guess addendum R5, R7).

function rc(key: string, closeness: number | null, capped: CapReason | null = null): RankedCandidate {
  return { candidate: arch(key), closeness, capped, explanation: null, signatureHits: [] };
}

// Seven regions, in rankCandidates' order.
const GROUPS = groupRanking([
  rc("margaux", 91),
  rc("vosne", 88),
  rc("cote-rotie", 85),
  rc("cote-de-nuits", 80),
  rc("cdp", 60),
  rc("bandol", 50),
  rc("alsace-riesling", 40),
  rc("tannin-free-white", 30),
  rc("chablis", 15, "colour"),
  rc("sancerre", 12, "colour"),
]);
const regions = (gs: { region: { name: string } }[]) => gs.map((g) => g.region.name);

describe("regionCallOptions", () => {
  it("offers the top five regions and keeps a picked one from further down", () => {
    expect(regions(regionCallOptions(GROUPS, "", null))).toEqual([
      "Bordeaux",
      "Bourgogne",
      "Rhône",
      "Provence",
      "Alsace",
    ]);
    expect(regions(regionCallOptions(GROUPS, "", "region-Loire"))).toEqual([
      "Bordeaux",
      "Bourgogne",
      "Rhône",
      "Provence",
      "Alsace",
      "Loire",
    ]);
    expect(regions(regionCallOptions(GROUPS, "", "region-Rhône"))).toHaveLength(5);
  });

  it("searches every region by its name, its country, or a wine or appellation in it, accents folded", () => {
    expect(regions(regionCallOptions(GROUPS, "rhone", null))).toEqual(["Rhône"]);
    expect(regions(regionCallOptions(GROUPS, "austria", null))).toEqual(["Niederösterreich"]);
    expect(regions(regionCallOptions(GROUPS, "chablis", null))).toEqual(["Bourgogne"]);
    expect(regions(regionCallOptions(GROUPS, "Côte-Rôtie AOC", null))).toEqual(["Rhône"]);
    expect(regions(regionCallOptions(GROUPS, "zzz", null))).toEqual([]);
  });

  it("does not match every region on the names' shared 'A typical'", () => {
    expect(regionCallOptions(GROUPS, "typical", null)).toEqual([]);
  });
});

describe("regionGrapeChoices", () => {
  const members = (region: string) => GROUPS.find((g) => g.region.name === region)!.members;

  it("names the region's grapes once each, most named first", () => {
    // Bourgogne here: Vosne-Romanée and Côte de Nuits (Pinot Noir), Chablis (Chardonnay).
    expect(regionGrapeChoices(members("Bourgogne")).map((g) => g.name)).toEqual(["Pinot Noir", "Chardonnay"]);
    // Rhône: Côte-Rôtie (Syrah), Châteauneuf-du-Pape (Grenache, Syrah).
    expect(regionGrapeChoices(members("Rhône"))).toEqual([
      { id: "grape-Syrah", name: "Syrah" },
      { id: "grape-Grenache", name: "Grenache" },
    ]);
  });

  it("breaks a tie by how often the grape is the primary one, then by name", () => {
    const bordeaux = groupRanking([rc("margaux", 60), rc("sauternes", 50)])[0].members;
    // Every grape is named once: Cabernet Sauvignon and Semillon lead as primaries.
    expect(regionGrapeChoices(bordeaux).map((g) => g.name)).toEqual([
      "Cabernet Sauvignon",
      "Semillon",
      "Merlot",
      "Sauvignon Blanc",
    ]);
  });

  it("is empty without wines", () => {
    expect(regionGrapeChoices([])).toEqual([]);
  });
});

describe("grapeChips", () => {
  const CHOICES = [
    { id: "grape-Syrah", name: "Syrah" },
    { id: "grape-Grenache", name: "Grenache" },
  ];
  const ALL = [...CHOICES, { id: "grape-Mourvèdre", name: "Mourvèdre" }];

  it("adds a grape picked through Other grape… that the region does not name", () => {
    expect(grapeChips(CHOICES, "grape-Mourvèdre", ALL).map((g) => g.name)).toEqual(["Syrah", "Grenache", "Mourvèdre"]);
  });
  it("adds nothing for a grape already a chip, no grape, or an unknown one", () => {
    expect(grapeChips(CHOICES, "grape-Syrah", ALL)).toEqual(CHOICES);
    expect(grapeChips(CHOICES, null, ALL)).toEqual(CHOICES);
    expect(grapeChips(CHOICES, "grape-gone", ALL)).toEqual(CHOICES);
  });
});

describe("a tap changes the pick", () => {
  const FULL: CallPick = { pickedArchetypeId: "arch-vosne", pickedRegionId: "region-Bourgogne", pickedGrapeId: "g" };

  it("a new region clears the deeper choice and the grape; the same region changes nothing", () => {
    expect(chooseRegion(FULL, "region-Rhône")).toEqual({
      pickedArchetypeId: null,
      pickedRegionId: "region-Rhône",
      pickedGrapeId: null,
    });
    expect(chooseRegion(FULL, "region-Bourgogne")).toBe(FULL);
  });

  it("going deeper keeps the region and the (hidden) grape", () => {
    expect(chooseDeeper(FULL, null)).toEqual({ ...FULL, pickedArchetypeId: null });
    expect(chooseDeeper({ ...FULL, pickedArchetypeId: null }, "arch-cote-de-nuits")).toEqual({
      ...FULL,
      pickedArchetypeId: "arch-cote-de-nuits",
    });
  });

  it("a grape needs a region", () => {
    expect(chooseGrape({ ...FULL, pickedGrapeId: null }, "grape-Pinot Noir").pickedGrapeId).toBe("grape-Pinot Noir");
    expect(chooseGrape(FULL, null).pickedGrapeId).toBeNull();
    expect(chooseGrape(NO_CALL, "grape-Pinot Noir")).toBe(NO_CALL);
  });
});

describe("normalizeCall", () => {
  const POOL = [arch("vosne"), arch("chablis"), arch("margaux")];

  it("gives a typical wine its own region (a draft from before the region step)", () => {
    expect(normalizeCall({ pickedArchetypeId: "arch-vosne", pickedRegionId: null, pickedGrapeId: null }, POOL)).toEqual({
      pickedArchetypeId: "arch-vosne",
      pickedRegionId: "region-Bourgogne",
      pickedGrapeId: null,
    });
    expect(
      normalizeCall({ pickedArchetypeId: "arch-margaux", pickedRegionId: "region-Bourgogne", pickedGrapeId: "g" }, POOL),
    ).toEqual({ pickedArchetypeId: "arch-margaux", pickedRegionId: "region-Bordeaux", pickedGrapeId: "g" });
  });

  it("drops a wine, or a region, that left the pool — and a grape without a region", () => {
    expect(normalizeCall({ pickedArchetypeId: "arch-gone", pickedRegionId: "region-Bourgogne", pickedGrapeId: "g" }, POOL))
      .toEqual({ pickedArchetypeId: null, pickedRegionId: "region-Bourgogne", pickedGrapeId: "g" });
    expect(normalizeCall({ pickedArchetypeId: null, pickedRegionId: "region-Rhône", pickedGrapeId: "g" }, POOL)).toEqual(
      NO_CALL,
    );
    expect(normalizeCall({ pickedArchetypeId: null, pickedRegionId: null, pickedGrapeId: "g" }, POOL)).toEqual(NO_CALL);
    expect(normalizeCall(NO_CALL, POOL)).toEqual(NO_CALL);
  });

  it("drops a grape that is no longer among the loaded grapes (merged away since the draft)", () => {
    const pick = { pickedArchetypeId: null, pickedRegionId: "region-Bourgogne", pickedGrapeId: "g-gone" };
    expect(normalizeCall(pick, POOL, ["g-pinot", "g-chardonnay"])).toEqual({
      pickedArchetypeId: null,
      pickedRegionId: "region-Bourgogne",
      pickedGrapeId: null,
    });
    expect(normalizeCall({ ...pick, pickedGrapeId: "g-pinot" }, POOL, ["g-pinot"]).pickedGrapeId).toBe("g-pinot");
  });
});

describe("callPayload", () => {
  it("a typical wine alone, a region with its grape, or nothing", () => {
    expect(callPayload({ pickedArchetypeId: "arch-vosne", pickedRegionId: "region-Bourgogne", pickedGrapeId: "g" })).toEqual(
      { pickedArchetypeId: "arch-vosne", pickedRegionId: null, pickedGrapeId: null },
    );
    expect(callPayload({ pickedArchetypeId: null, pickedRegionId: "region-Bourgogne", pickedGrapeId: "g" })).toEqual({
      pickedArchetypeId: null,
      pickedRegionId: "region-Bourgogne",
      pickedGrapeId: "g",
    });
    expect(callPayload({ pickedArchetypeId: null, pickedRegionId: "region-Bourgogne", pickedGrapeId: null })).toEqual({
      pickedArchetypeId: null,
      pickedRegionId: "region-Bourgogne",
      pickedGrapeId: null,
    });
    expect(callPayload({ pickedArchetypeId: null, pickedRegionId: null, pickedGrapeId: "g" })).toEqual(NO_CALL);
  });
});
