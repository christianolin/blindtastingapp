import { describe, expect, it } from "vitest";
import {
  ATTEMPT_COLUMNS,
  HISTORY_PAGE,
  actualWineLineage,
  coverageCountries,
  finalWineId,
  historyOrFilter,
  pageOf,
  parseSnapshot,
  displayPoints,
  placeLinks,
  shapeAttemptRow,
  shapeCandidates,
  tallyRows,
  vintageColumns,
  vintageFromColumns,
  wineDisplay,
  type ArchetypePlaceRaw,
  type AttemptRaw,
  type CatalogDisplayRaw,
  type PoolRaw,
  type WineDisplay,
} from "./pool-shape";
import { lineageForParts } from "./archetype-view";

const ARCH_PAUILLAC = "00000000-0000-4000-8000-00000000a001";
const ARCH_BOURGOGNE = "00000000-0000-4000-8000-00000000a002";
// training_archetype_places() rows (training-room-map spec §4.1).
const PAUILLAC_PLACE: ArchetypePlaceRaw = {
  archetype_id: ARCH_PAUILLAC,
  place_key: "france.bordeaux.haut-medoc.pauillac",
  region_key: "france.bordeaux",
  region_name: "Bordeaux",
  point_key: "france.bordeaux.haut-medoc.pauillac",
  point_lon: -0.7708,
  point_lat: 45.1971,
};
const NO_PLACE: ArchetypePlaceRaw = {
  archetype_id: ARCH_BOURGOGNE,
  place_key: null,
  region_key: null,
  region_name: null,
  point_key: null,
  point_lon: null,
  point_lat: null,
};
const WINE_OLD = "00000000-0000-4000-8000-00000000b001";
const WINE_NEW = "00000000-0000-4000-8000-00000000b002";
const WINE_HIDDEN = "00000000-0000-4000-8000-00000000b003";
const ATTEMPT = "00000000-0000-4000-8000-00000000c001";
const NOTE = "00000000-0000-4000-8000-00000000d001";

function pool(overrides: Partial<PoolRaw> = {}): PoolRaw {
  return {
    archetypes: [
      {
        id: ARCH_PAUILLAC,
        name: "A typical Pauillac",
        description: "Cedar and cassis.",
        colour: "RED",
        style: "STILL",
        country_id: "fr",
        region_id: "bdx",
        appellation_id: "pauillac",
        primary_grape_id: "cs",
        secondary_grape_id: "me",
        typical_age_low: 8,
        typical_age_high: 25,
        sat: { tannin: ["MEDIUM_PLUS", "HIGH"], clarity: ["CLEAR", "CLEAR"], broken: ["HIGH"] },
        quality_low: 88,
        quality_high: 96,
        wine_place_id: "place-pauillac",
        sort_order: 2,
      },
      {
        id: ARCH_BOURGOGNE,
        name: "A typical Bourgogne rouge",
        description: null,
        colour: "RED",
        style: "STILL",
        country_id: "fr",
        region_id: "bgn",
        appellation_id: "bourgogne",
        primary_grape_id: "pn",
        secondary_grape_id: null,
        typical_age_low: null,
        typical_age_high: 6,
        sat: {},
        quality_low: null,
        quality_high: null,
        wine_place_id: null,
        sort_order: 1,
      },
    ],
    aromas: [
      { archetype_id: ARCH_PAUILLAC, term_id: "t-cassis", kind: "NOSE", signature: false },
      { archetype_id: ARCH_PAUILLAC, term_id: "t-cedar", kind: "NOSE", signature: true },
      { archetype_id: ARCH_PAUILLAC, term_id: "t-gone", kind: "PALATE", signature: false },
    ],
    terms: [
      { id: "t-cassis", term: "blackcurrant", group_name: "Black fruit" },
      { id: "t-cedar", term: "cedar", group_name: "Oak" },
    ],
    designations: [
      { archetype_id: ARCH_PAUILLAC, type_designation_id: "d-grand" },
      { archetype_id: ARCH_PAUILLAC, type_designation_id: "d-first" },
    ],
    names: {
      countries: [{ id: "fr", name: "France" }],
      regions: [
        { id: "bdx", name: "Bordeaux" },
        { id: "bgn", name: "Bourgogne" },
      ],
      appellations: [
        { id: "pauillac", name: "Pauillac AOC" },
        { id: "bourgogne", name: "Bourgogne AOC" },
      ],
      grapes: [
        { id: "cs", name: "Cabernet Sauvignon" },
        { id: "me", name: "Merlot" },
        { id: "pn", name: "Pinot Noir" },
      ],
      typeDesignations: [
        { id: "d-first", name: "Premier Grand Cru Classé" },
        { id: "d-grand", name: "Grand Cru Classé" },
      ],
    },
    placeLinks: placeLinks([PAUILLAC_PLACE, NO_PLACE]),
    displayPoints: new Map(),
    ...overrides,
  };
}

function attempt(overrides: Partial<AttemptRaw> = {}): AttemptRaw {
  return {
    id: ATTEMPT,
    created_at: "2026-09-24T18:00:00.123456+00:00",
    note_id: NOTE,
    picked_archetype_id: ARCH_PAUILLAC,
    picked_region_id: null,
    picked_grape_id: null,
    guessed_vintage_kind: "YEAR",
    guessed_vintage_year: 2015,
    guessed_vintage_tawny_years: null,
    actual_catalog_wine_id: WINE_OLD,
    actual_archetype_id: ARCH_BOURGOGNE,
    note_colour_hue: "RUBY",
    hue_cleared: false,
    candidates_snapshot: [
      { archetypeId: ARCH_PAUILLAC, name: "A typical Pauillac", closeness: 91, rank: 1, capped: null },
    ],
    country_points: 2,
    region_points: 3,
    appellation_points: 0,
    primary_grape_points: 8,
    secondary_grape_points: null,
    type_designation_points: 0,
    vintage_points: 1,
    total_points: 14,
    possible_points: 22,
    ...overrides,
  };
}

const REGION_BGN = "00000000-0000-4000-8000-00000000e101";
const GRAPE_PN = "00000000-0000-4000-8000-00000000e201";

const CTX = {
  archetypeNames: new Map([
    [ARCH_PAUILLAC, "A typical Pauillac"],
    [ARCH_BOURGOGNE, "A typical Bourgogne rouge"],
  ]),
  regionNames: new Map([[REGION_BGN, "Bourgogne"]]),
  grapeNames: new Map([[GRAPE_PN, "Pinot Noir"]]),
  mergedInto: new Map<string, string | null>([
    [WINE_OLD, WINE_NEW],
    [WINE_NEW, null],
  ]),
  wines: new Map<string, WineDisplay>([
    [
      WINE_NEW,
      {
        label: "Château Léoville Barton Saint-Julien AOC 2016",
        lineage: "Saint-Julien AOC · Bordeaux, France",
        colour: "RED",
      },
    ],
  ]),
};

const NO_POINTS = {
  country: null,
  region: null,
  appellation: null,
  primaryGrape: null,
  secondaryGrape: null,
  typeDesignation: null,
  vintage: null,
};

describe("placeLinks (training-room-map spec §5, RM3a)", () => {
  it("maps a row to the home key, its REGION and the home's own point", () => {
    expect(placeLinks([PAUILLAC_PLACE]).get(ARCH_PAUILLAC)).toEqual({
      placeCanonicalKey: "france.bordeaux.haut-medoc.pauillac",
      mapRegion: { key: "france.bordeaux", name: "Bordeaux" },
      mapPoint: { lon: -0.7708, lat: 45.1971, source: "place" },
    });
  });

  it("marks a point from further up the chain as an ancestor's", () => {
    const row: ArchetypePlaceRaw = {
      archetype_id: "a-mda",
      place_key: "italy.abruzzo.montepulciano-d-abruzzo",
      region_key: "italy.abruzzo",
      region_name: "Abruzzo",
      point_key: "italy.abruzzo",
      point_lon: 13.8523,
      point_lat: 42.2926,
    };
    expect(placeLinks([row]).get("a-mda")?.mapPoint).toEqual({ lon: 13.8523, lat: 42.2926, source: "ancestor" });
  });

  it("leaves an unplaced archetype with all three null, whatever else its row carries", () => {
    const stray = { ...NO_PLACE, region_key: "france.bordeaux", region_name: "Bordeaux", point_key: "x", point_lon: 1, point_lat: 1 };
    const unplaced = { placeCanonicalKey: null, mapRegion: null, mapPoint: null };
    expect(placeLinks([NO_PLACE]).get(ARCH_BOURGOGNE)).toEqual(unplaced);
    expect(placeLinks([stray]).get(ARCH_BOURGOGNE)).toEqual(unplaced);
  });

  it("gives no point for a NaN, infinite or out-of-range coordinate, and keeps the key and region", () => {
    for (const bad of [
      { point_lon: Number.NaN },
      { point_lat: Number.POSITIVE_INFINITY },
      { point_lon: 180.5 },
      { point_lat: -90.01 },
      { point_lon: null },
      { point_key: null },
    ]) {
      const link = placeLinks([{ ...PAUILLAC_PLACE, ...bad }]).get(ARCH_PAUILLAC);
      expect(link?.mapPoint).toBeNull();
      expect(link?.placeCanonicalKey).toBe("france.bordeaux.haut-medoc.pauillac");
      expect(link?.mapRegion).toEqual({ key: "france.bordeaux", name: "Bordeaux" });
    }
  });

  it("gives no region without both its key and its name", () => {
    expect(placeLinks([{ ...PAUILLAC_PLACE, region_name: null }]).get(ARCH_PAUILLAC)?.mapRegion).toBeNull();
    expect(placeLinks([{ ...PAUILLAC_PLACE, region_key: null }]).get(ARCH_PAUILLAC)?.mapRegion).toBeNull();
  });

  it("the fail-soft path: no rows leaves every candidate off the wine map", () => {
    const shaped = shapeCandidates(pool({ placeLinks: placeLinks([]) }));
    expect(shaped).toHaveLength(2);
    for (const c of shaped) {
      expect(c).toMatchObject({ placeCanonicalKey: null, mapRegion: null, mapPoint: null });
    }
  });
});

describe("curated display points (training-room-map spec RM12, RM23)", () => {
  it("displayPoints keeps a whole, finite, in-range point by archetype id", () => {
    expect(displayPoints([{ id: ARCH_BOURGOGNE, display_lon: 15.42, display_lat: 48.39 }])).toEqual(
      new Map([[ARCH_BOURGOGNE, { lon: 15.42, lat: 48.39 }]]),
    );
  });

  it("drops a half-set, non-finite or out-of-range point", () => {
    for (const bad of [
      { display_lon: 15.42, display_lat: null },
      { display_lon: null, display_lat: 48.39 },
      { display_lon: Number.NaN, display_lat: 48.39 },
      { display_lon: 180.01, display_lat: 0 },
      { display_lon: 0, display_lat: -90.5 },
    ]) {
      expect(displayPoints([{ id: ARCH_BOURGOGNE, ...bad }]).size).toBe(0);
    }
  });

  it("an unplaced wine takes its curated point, as 'curated', and stays off the map's links", () => {
    const shaped = shapeCandidates(
      pool({ displayPoints: displayPoints([{ id: ARCH_BOURGOGNE, display_lon: 4.8, display_lat: 47.1 }]) }),
    );
    expect(shaped.find((c) => c.id === ARCH_BOURGOGNE)).toMatchObject({
      placeCanonicalKey: null,
      mapRegion: null,
      mapPoint: { lon: 4.8, lat: 47.1, source: "curated" },
    });
  });

  it("a place point wins over a curated one", () => {
    const shaped = shapeCandidates(
      pool({ displayPoints: displayPoints([{ id: ARCH_PAUILLAC, display_lon: 1, display_lat: 1 }]) }),
    );
    expect(shaped.find((c) => c.id === ARCH_PAUILLAC)?.mapPoint).toEqual({
      lon: -0.7708,
      lat: 45.1971,
      source: "place",
    });
  });

  it("the RPC's fail-soft path still shows the curated points, and nothing else", () => {
    const shaped = shapeCandidates(
      pool({
        placeLinks: placeLinks([]),
        displayPoints: displayPoints([{ id: ARCH_BOURGOGNE, display_lon: 4.8, display_lat: 47.1 }]),
      }),
    );
    expect(shaped.find((c) => c.id === ARCH_PAUILLAC)?.mapPoint).toBeNull();
    expect(shaped.find((c) => c.id === ARCH_BOURGOGNE)?.mapPoint?.source).toBe("curated");
  });
});

describe("shapeCandidates", () => {
  it("orders by sort_order and names every reference", () => {
    const [first, second] = shapeCandidates(pool());
    expect(first.id).toBe(ARCH_BOURGOGNE);
    expect(second).toMatchObject({
      id: ARCH_PAUILLAC,
      name: "A typical Pauillac",
      description: "Cedar and cassis.",
      colour: "RED",
      style: "STILL",
      country: { id: "fr", name: "France" },
      region: { id: "bdx", name: "Bordeaux" },
      appellation: { id: "pauillac", name: "Pauillac AOC", isRegional: false },
      primaryGrape: { id: "cs", name: "Cabernet Sauvignon" },
      secondaryGrape: { id: "me", name: "Merlot" },
      typicalAge: [8, 25],
      placeCanonicalKey: "france.bordeaux.haut-medoc.pauillac",
      mapRegion: { key: "france.bordeaux", name: "Bordeaux" },
      mapPoint: { lon: -0.7708, lat: 45.1971, source: "place" },
      qualityLow: 88,
      qualityHigh: 96,
    });
  });

  it("marks a region's self-named appellation as regional and tolerates a null place", () => {
    const [bourgogne] = shapeCandidates(pool());
    expect(bourgogne.appellation).toEqual({ id: "bourgogne", name: "Bourgogne AOC", isRegional: true });
    expect(bourgogne.secondaryGrape).toBeNull();
    expect(bourgogne.typicalAge).toBeNull();
    expect(bourgogne.placeCanonicalKey).toBeNull();
    expect(bourgogne.mapRegion).toBeNull();
    expect(bourgogne.mapPoint).toBeNull();
    expect(bourgogne.aromas).toEqual([]);
    expect(bourgogne.designations).toEqual([]);
  });

  it("joins aromas with their term and group, keeps signature and drops unknown terms", () => {
    const pauillac = shapeCandidates(pool())[1];
    expect(pauillac.aromas).toEqual([
      { termId: "t-cassis", term: "blackcurrant", group: "Black fruit", kind: "NOSE", signature: false },
      { termId: "t-cedar", term: "cedar", group: "Oak", kind: "NOSE", signature: true },
    ]);
  });

  it("orders designations by the type designation order", () => {
    const pauillac = shapeCandidates(pool())[1];
    expect(pauillac.designations).toEqual([
      { id: "d-first", name: "Premier Grand Cru Classé" },
      { id: "d-grand", name: "Grand Cru Classé" },
    ]);
  });

  it("drops malformed sat entries and keeps every well-formed key", () => {
    const pauillac = shapeCandidates(pool())[1];
    expect(pauillac.sat).toEqual({ tannin: ["MEDIUM_PLUS", "HIGH"], clarity: ["CLEAR", "CLEAR"] });
  });

  it("leaves out an archetype whose appellation the viewer cannot read", () => {
    const names = { ...pool().names, appellations: [{ id: "bourgogne", name: "Bourgogne AOC" }] };
    expect(shapeCandidates(pool({ names })).map((c) => c.id)).toEqual([ARCH_BOURGOGNE]);
  });
});

describe("coverageCountries", () => {
  it("counts by country, most first, then by name", () => {
    const [bourgogne, pauillac] = shapeCandidates(pool());
    const italy = { ...pauillac, id: "it-1", country: { id: "it", name: "Italy" } };
    const austria = { ...pauillac, id: "at-1", country: { id: "at", name: "Austria" } };
    expect(coverageCountries([bourgogne, pauillac, austria, italy, { ...italy, id: "it-2" }])).toEqual([
      { name: "France", count: 2 },
      { name: "Italy", count: 2 },
      { name: "Austria", count: 1 },
    ]);
    expect(coverageCountries([])).toEqual([]);
  });
});

describe("vintage columns", () => {
  it("reads and writes the guessed vintage triple", () => {
    expect(vintageFromColumns("YEAR", 2016, null)).toEqual({ kind: "YEAR", year: 2016 });
    expect(vintageFromColumns("NV", null, null)).toEqual({ kind: "NV" });
    expect(vintageFromColumns("TAWNY", null, 20)).toEqual({ kind: "TAWNY", years: 20 });
    expect(vintageFromColumns(null, null, null)).toBeNull();
    expect(vintageFromColumns("YEAR", null, null)).toBeNull();
    expect(vintageColumns({ kind: "YEAR", year: 2016 })).toEqual({
      guessed_vintage_kind: "YEAR",
      guessed_vintage_year: 2016,
      guessed_vintage_tawny_years: null,
    });
    expect(vintageColumns({ kind: "NV" })).toEqual({
      guessed_vintage_kind: "NV",
      guessed_vintage_year: null,
      guessed_vintage_tawny_years: null,
    });
    expect(vintageColumns({ kind: "TAWNY", years: 20 })).toEqual({
      guessed_vintage_kind: "TAWNY",
      guessed_vintage_year: null,
      guessed_vintage_tawny_years: 20,
    });
    expect(vintageColumns(null)).toEqual({
      guessed_vintage_kind: null,
      guessed_vintage_year: null,
      guessed_vintage_tawny_years: null,
    });
  });
});

describe("parseSnapshot", () => {
  it("keeps well-formed entries only", () => {
    const good = { archetypeId: ARCH_PAUILLAC, name: "A typical Pauillac", closeness: 91, rank: 1, capped: null };
    const capped = {
      archetypeId: ARCH_BOURGOGNE,
      name: "A typical Bourgogne rouge",
      closeness: 15,
      rank: 2,
      capped: "colour",
    };
    expect(
      parseSnapshot([good, capped, { ...good, closeness: 140 }, { ...good, capped: "weird" }, { ...good, rank: 0 }, null, "x"]),
    ).toEqual([good, capped]);
    expect(parseSnapshot([{ ...good, closeness: null }])).toEqual([{ ...good, closeness: null }]);
    expect(parseSnapshot({ not: "a list" })).toEqual([]);
  });
});

describe("finalWineId", () => {
  it("follows merges, stops on a cycle and keeps an id it never read", () => {
    const merged = new Map<string, string | null>([
      ["a", "b"],
      ["b", "c"],
      ["c", null],
      ["x", "y"],
      ["y", "x"],
    ]);
    expect(finalWineId("a", merged)).toBe("c");
    expect(finalWineId("c", merged)).toBe("c");
    expect(finalWineId("x", merged)).toBe("y");
    expect(finalWineId("q", merged)).toBe("q");
  });
});

describe("actualWineLineage", () => {
  it("names a specific appellation, the grapes and the designation", () => {
    expect(
      actualWineLineage({
        appellation: "Saint-Julien AOC",
        region: "Bordeaux",
        country: "France",
        primaryGrape: "Cabernet Sauvignon",
        secondaryGrape: "Merlot",
        designation: "Grand Cru Classé",
      }),
    ).toBe("Saint-Julien AOC · Bordeaux, France · Cabernet Sauvignon, Merlot · Grand Cru Classé");
  });

  it("drops a regional appellation and needs a region and a country", () => {
    expect(
      actualWineLineage({
        appellation: "Bourgogne AOC",
        region: "Bourgogne",
        country: "France",
        primaryGrape: "Pinot Noir",
        secondaryGrape: null,
        designation: null,
      }),
    ).toBe("Bourgogne, France · Pinot Noir");
    expect(
      actualWineLineage({
        appellation: "Bourgogne AOC",
        region: null,
        country: "France",
        primaryGrape: "Pinot Noir",
        secondaryGrape: null,
        designation: null,
      }),
    ).toBeNull();
  });

  it("needs an appellation and a primary grape too (catalog_wines holds all four)", () => {
    const whole = {
      appellation: "Saint-Julien AOC",
      region: "Bordeaux",
      country: "France",
      primaryGrape: "Cabernet Sauvignon",
      secondaryGrape: "Merlot",
      designation: null,
    };
    expect(actualWineLineage({ ...whole, appellation: null })).toBeNull();
    expect(actualWineLineage({ ...whole, primaryGrape: null })).toBeNull();
  });

  it("is the candidate lineage (lineageForParts), plus the designation", () => {
    const n = (name: string) => ({ id: name, name });
    const specific = {
      country: n("France"),
      region: n("Bordeaux"),
      appellation: n("Saint-Julien AOC"),
      primaryGrape: n("Cabernet Sauvignon"),
      secondaryGrape: n("Merlot"),
    };
    const regional = {
      country: n("France"),
      region: n("Bourgogne"),
      appellation: n("Bourgogne AOC"),
      primaryGrape: n("Pinot Noir"),
      secondaryGrape: null,
    };
    for (const parts of [specific, regional]) {
      const flat = {
        appellation: parts.appellation.name,
        region: parts.region.name,
        country: parts.country.name,
        primaryGrape: parts.primaryGrape.name,
        secondaryGrape: parts.secondaryGrape?.name ?? null,
      };
      expect(actualWineLineage({ ...flat, designation: null })).toBe(lineageForParts(parts));
      expect(actualWineLineage({ ...flat, designation: "Grand Cru Classé" })).toBe(
        `${lineageForParts(parts)} · Grand Cru Classé`,
      );
    }
  });
});

describe("wineDisplay", () => {
  it("builds the catalog label and lineage from the embeds", () => {
    const row: CatalogDisplayRaw = {
      id: WINE_NEW,
      colour: "RED",
      wine_name: null,
      vintage_kind: "YEAR",
      vintage_year: 2016,
      vintage_tawny_years: null,
      producer: { name: "Château Léoville Barton" },
      country: [{ name: "France" }],
      region: { name: "Bordeaux" },
      appellation: { name: "Saint-Julien AOC" },
      primary_grape: { name: "Cabernet Sauvignon" },
      secondary_grape: null,
      type_designation: { name: "Grand Cru Classé" },
    };
    expect(wineDisplay(row)).toEqual({
      label: "Château Léoville Barton Saint-Julien AOC 2016",
      lineage: "Saint-Julien AOC · Bordeaux, France · Cabernet Sauvignon · Grand Cru Classé",
      colour: "RED",
    });
  });
});

describe("shapeAttemptRow", () => {
  it("shapes a scored attempt and follows a merged wine", () => {
    expect(shapeAttemptRow(attempt(), CTX)).toEqual({
      id: ATTEMPT,
      createdAt: "2026-09-24T18:00:00.123456+00:00",
      picked: { id: ARCH_PAUILLAC, name: "A typical Pauillac" },
      pickedRegion: null,
      pickedGrape: null,
      vintage: { kind: "YEAR", year: 2015 },
      actual: {
        catalogWineId: WINE_NEW,
        label: "Château Léoville Barton Saint-Julien AOC 2016",
        lineage: "Saint-Julien AOC · Bordeaux, France",
      },
      actualArchetype: { id: ARCH_BOURGOGNE, name: "A typical Bourgogne rouge" },
      hueCleared: false,
      noteColourHue: "RUBY",
      points: {
        country: 2,
        region: 3,
        appellation: 0,
        primaryGrape: 8,
        secondaryGrape: null,
        typeDesignation: 0,
        vintage: 1,
      },
      total: 14,
      possible: 22,
      snapshot: [{ archetypeId: ARCH_PAUILLAC, name: "A typical Pauillac", closeness: 91, rank: 1, capped: null }],
    });
  });

  it("shapes an unrevealed attempt and a wine the viewer cannot read", () => {
    const unrevealed = shapeAttemptRow(
      attempt({
        picked_archetype_id: null,
        guessed_vintage_kind: null,
        guessed_vintage_year: null,
        actual_catalog_wine_id: null,
        actual_archetype_id: null,
        country_points: null,
        region_points: null,
        appellation_points: null,
        primary_grape_points: null,
        type_designation_points: null,
        vintage_points: null,
        total_points: null,
        possible_points: null,
      }),
      CTX,
    );
    expect(unrevealed.picked).toBeNull();
    expect(unrevealed.vintage).toBeNull();
    expect(unrevealed.actual).toBeNull();
    expect(unrevealed.actualArchetype).toBeNull();
    expect(unrevealed.points).toEqual(NO_POINTS);
    expect(unrevealed.total).toBeNull();

    const hidden = shapeAttemptRow(attempt({ actual_catalog_wine_id: WINE_HIDDEN }), CTX);
    expect(hidden.actual).toEqual({ catalogWineId: WINE_HIDDEN, label: null, lineage: null });
  });

  it("names a pick that stopped at the region, with its grape (region-guess addendum R8)", () => {
    const regionPick = shapeAttemptRow(
      attempt({ picked_archetype_id: null, picked_region_id: REGION_BGN, picked_grape_id: GRAPE_PN }),
      CTX,
    );
    expect(regionPick.picked).toBeNull();
    expect(regionPick.pickedRegion).toEqual({ id: REGION_BGN, name: "Bourgogne" });
    expect(regionPick.pickedGrape).toEqual({ id: GRAPE_PN, name: "Pinot Noir" });
    // A name that was not read leaves the pick unnamed rather than half-named.
    const unread = shapeAttemptRow(attempt({ picked_archetype_id: null, picked_region_id: "gone" }), CTX);
    expect(unread.pickedRegion).toBeNull();
  });

  it("reads the two pick columns", () => {
    expect(ATTEMPT_COLUMNS).toContain("picked_region_id, picked_grape_id");
  });
});

describe("history paging", () => {
  it("builds the keyset filter from the raw timestamp", () => {
    expect(historyOrFilter({ createdAt: "2026-09-24T18:00:00.123456+00:00", id: ATTEMPT })).toBe(
      `created_at.lt."2026-09-24T18:00:00.123456+00:00",and(created_at.eq."2026-09-24T18:00:00.123456+00:00",id.lt.${ATTEMPT})`,
    );
  });

  it("cuts a page at twenty and points the cursor at its last row", () => {
    expect(HISTORY_PAGE).toBe(20);
    const rows = Array.from({ length: HISTORY_PAGE + 1 }, (_, i) => ({ created_at: `t${i}`, id: `id-${i}` }));
    const cursorOf = (r: { created_at: string; id: string }) => ({ createdAt: r.created_at, id: r.id });
    const full = pageOf(rows, cursorOf);
    expect(full.rows).toHaveLength(20);
    expect(full.nextCursor).toEqual({ createdAt: "t19", id: "id-19" });
    const short = pageOf(rows.slice(0, 5), cursorOf);
    expect(short.rows).toHaveLength(5);
    expect(short.nextCursor).toBeNull();
  });

  it("maps the light tally select onto tally()'s input", () => {
    expect(
      tallyRows([
        { primary_grape_points: 8, appellation_points: 0, total_points: 11 },
        { primary_grape_points: null, appellation_points: null, total_points: null },
      ]),
    ).toEqual([
      { points: { ...NO_POINTS, primaryGrape: 8, appellation: 0 }, total: 11 },
      { points: NO_POINTS, total: null },
    ]);
  });
});
