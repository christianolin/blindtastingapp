import { describe, expect, it } from "vitest";
import { catalogWineTitle } from "./wine-title";

type TitleInput = Parameters<typeof catalogWineTitle>[0];

// A wine with every title part empty; each case fills in only what it needs.
function wine(overrides: Partial<TitleInput> = {}): TitleInput {
  return {
    producerName: null,
    wineName: null,
    appellationName: null,
    vintageKind: "YEAR",
    vintageYear: null,
    vintageTawnyYears: null,
    ...overrides,
  };
}

describe("catalogWineTitle: today's behaviour", () => {
  it("joins producer, wine name, appellation and vintage in that order", () => {
    expect(
      catalogWineTitle(
        wine({
          producerName: "Domaine Leflaive",
          wineName: "Les Pucelles",
          appellationName: "Puligny-Montrachet 1er Cru AOP",
          vintageYear: 2019,
        }),
      ),
    ).toBe("Domaine Leflaive Les Pucelles Puligny-Montrachet 1er Cru AOP 2019");
  });

  it("skips the parts a wine does not have", () => {
    expect(catalogWineTitle(wine({ producerName: "Penfolds", vintageYear: 2018 }))).toBe(
      "Penfolds 2018",
    );
    expect(
      catalogWineTitle(wine({ wineName: "", appellationName: "Chablis AOP", vintageYear: 2021 })),
    ).toBe("Chablis AOP 2021");
  });

  describe("vintage", () => {
    it("YEAR shows the year", () => {
      expect(catalogWineTitle(wine({ producerName: "Penfolds", vintageYear: 2018 }))).toBe(
        "Penfolds 2018",
      );
    });

    it("YEAR without a year shows no vintage", () => {
      expect(catalogWineTitle(wine({ producerName: "Penfolds" }))).toBe("Penfolds");
    });

    it("TAWNY with years shows the age", () => {
      expect(
        catalogWineTitle(
          wine({ producerName: "Taylor's", vintageKind: "TAWNY", vintageTawnyYears: 20 }),
        ),
      ).toBe("Taylor's 20yo");
    });

    it("TAWNY without years shows Tawny", () => {
      expect(catalogWineTitle(wine({ producerName: "Taylor's", vintageKind: "TAWNY" }))).toBe(
        "Taylor's Tawny",
      );
    });

    it("NV shows NV", () => {
      expect(catalogWineTitle(wine({ producerName: "Krug", vintageKind: "NV" }))).toBe("Krug NV");
    });
  });

  it("collapses a part that exactly repeats an earlier one", () => {
    expect(
      catalogWineTitle(
        wine({
          producerName: "Château Lascombes",
          wineName: "Château Lascombes",
          vintageYear: 2017,
        }),
      ),
    ).toBe("Château Lascombes 2017");
  });

  it("collapses a part that repeats an earlier one in another case, keeping the first spelling", () => {
    expect(
      catalogWineTitle(
        wine({
          producerName: "Chateau Lascombes",
          wineName: "CHATEAU LASCOMBES",
          vintageYear: 2017,
        }),
      ),
    ).toBe("Chateau Lascombes 2017");
  });

  it("reads 'Untitled wine' when there is nothing to show", () => {
    expect(catalogWineTitle(wine())).toBe("Untitled wine");
    expect(
      catalogWineTitle(wine({ producerName: "", wineName: "", appellationName: "" })),
    ).toBe("Untitled wine");
  });
});

describe("catalogWineTitle: a repeat that differs only by accents and/or case", () => {
  it("drops the unaccented copy and keeps the first spelling (catalog wine bb0a9d3c)", () => {
    expect(
      catalogWineTitle(
        wine({
          producerName: "Château Lascombes",
          wineName: "Chateau Lascombes",
          vintageYear: 2017,
        }),
      ),
    ).toBe("Château Lascombes 2017");
  });

  it("keeps the unaccented spelling when it comes first", () => {
    expect(
      catalogWineTitle(
        wine({
          producerName: "Chateau Lascombes",
          wineName: "Château Lascombes",
          vintageYear: 2017,
        }),
      ),
    ).toBe("Chateau Lascombes 2017");
  });

  it("folds accents and case together", () => {
    expect(
      catalogWineTitle(
        wine({
          producerName: "CHÂTEAU LASCOMBES",
          wineName: "chateau lascombes",
          vintageYear: 2017,
        }),
      ),
    ).toBe("CHÂTEAU LASCOMBES 2017");
  });

  it("treats a decomposed accent (NFD) like a precomposed one (NFC)", () => {
    expect(
      catalogWineTitle(
        wine({
          producerName: "Ch\u00e2teau Lascombes",
          wineName: "Cha\u0302teau Lascombes",
          vintageYear: 2017,
        }),
      ),
    ).toBe("Ch\u00e2teau Lascombes 2017");
  });

  it("drops a later part too, not just the wine name", () => {
    expect(
      catalogWineTitle(
        wine({
          producerName: "Domaine de la Pépière",
          wineName: "Muscadet Sèvre et Maine",
          appellationName: "Muscadet Sevre et Maine",
          vintageYear: 2022,
        }),
      ),
    ).toBe("Domaine de la Pépière Muscadet Sèvre et Maine 2022");
  });
});

// Guards: these hold before and after the accent fold, and would break if the
// key folded more than accents and case (spaces, or substring matching).
describe("catalogWineTitle: different words are never dropped", () => {
  it("keeps both 'Domaine Laroche' and 'Domaine La Roche'", () => {
    expect(
      catalogWineTitle(
        wine({
          producerName: "Domaine Laroche",
          wineName: "Domaine La Roche",
          vintageYear: 2020,
        }),
      ),
    ).toBe("Domaine Laroche Domaine La Roche 2020");
  });

  it("keeps a part that only contains an earlier one", () => {
    expect(
      catalogWineTitle(
        wine({
          producerName: "Château Margaux",
          wineName: "Pavillon Rouge du Chateau Margaux",
          vintageYear: 2015,
        }),
      ),
    ).toBe("Château Margaux Pavillon Rouge du Chateau Margaux 2015");
  });
});
