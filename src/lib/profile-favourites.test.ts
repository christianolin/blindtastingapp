import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import {
  ADD_PRODUCER_PLACEHOLDER,
  ADD_REGION_PLACEHOLDER,
  BIO_PLACEHOLDER,
  FAVOURITES_DB_REFUSALS,
  FAVOURITES_HINT,
  FAVOURITES_LIMIT,
  FAVOURITES_LOAD_ERROR,
  FAVOURITE_PRODUCERS_LABEL,
  FAVOURITE_PRODUCER_IDS_FIELD,
  FAVOURITE_REGIONS_LABEL,
  FAVOURITE_REGION_IDS_FIELD,
  NONE_REGION_NAME,
  canAddFavourite,
  favouriteRegionOptions,
  favouritesFromRows,
  getProfileFavourites,
  loadFavouriteRegionOptions,
  parseFavouriteIds,
  regionLabel,
  serializeFavouriteIds,
  setProfileFavourites,
  unchosen,
  withFavourite,
  withoutFavourite,
  type FavouriteProducer,
  type FavouriteRegion,
} from "./profile-favourites";

// ---------------------------------------------------------------------------
// Copy and constants (§6, §7)
// ---------------------------------------------------------------------------

describe("copy and constants", () => {
  it("the limit and the None sentinel name", () => {
    expect(FAVOURITES_LIMIT).toBe(10);
    expect(NONE_REGION_NAME).toBe("None");
  });

  it("the two hidden-field names", () => {
    expect(FAVOURITE_REGION_IDS_FIELD).toBe("favourite_region_ids");
    expect(FAVOURITE_PRODUCER_IDS_FIELD).toBe("favourite_producer_ids");
  });

  it("every §6 string matches character for character", () => {
    expect(FAVOURITE_REGIONS_LABEL).toBe("Favourite regions");
    expect(FAVOURITE_PRODUCERS_LABEL).toBe("Favourite producers");
    expect(ADD_REGION_PLACEHOLDER).toBe("Add a region");
    expect(ADD_PRODUCER_PLACEHOLDER).toBe("Add a producer");
    expect(FAVOURITES_HINT).toBe("Up to 10.");
    expect(FAVOURITES_LOAD_ERROR).toBe(
      "Your favourites could not be loaded. Reload the page to change them.",
    );
    expect(BIO_PLACEHOLDER).toBe(
      "Go-to grape, how you got into wine, anything you'd like other tasters to know",
    );
  });

  it("FAVOURITES_DB_REFUSALS equals §6's list, in order", () => {
    expect(FAVOURITES_DB_REFUSALS).toEqual([
      "you can pick up to 10 favourite regions",
      "you can pick up to 10 favourite producers",
      "each region can be picked once",
      "each producer can be picked once",
      "that region cannot be a favourite",
      "favourites must be two lists of ids",
      "not signed in",
    ]);
  });
});

// ---------------------------------------------------------------------------
// regionLabel
// ---------------------------------------------------------------------------

describe("regionLabel", () => {
  it('joins as "{name}, {country}"', () => {
    expect(regionLabel({ name: "Bordeaux", country: "France" })).toBe("Bordeaux, France");
  });
});

// ---------------------------------------------------------------------------
// favouriteRegionOptions
// ---------------------------------------------------------------------------

describe("favouriteRegionOptions", () => {
  const france = { id: "c-fr", name: "France" };
  const germany = { id: "c-de", name: "Germany" };
  const spain = { id: "c-es", name: "Spain" };
  const countries = [france, germany, spain];

  it("drops every None region, one per country across two countries", () => {
    const regions = [
      { id: "r1", name: "Bordeaux", country_id: france.id },
      { id: "r-none-fr", name: "None", country_id: france.id },
      { id: "r-none-de", name: "None", country_id: germany.id },
      { id: "r2", name: "Ahr", country_id: germany.id },
    ];
    const options = favouriteRegionOptions(regions, countries);
    expect(options.map((o) => o.name)).toEqual(["Ahr", "Bordeaux"]);
  });

  it('keeps "Vin de France, France"', () => {
    const regions = [{ id: "r1", name: "Vin de France", country_id: france.id }];
    expect(favouriteRegionOptions(regions, countries)).toEqual([
      { id: "r1", name: "Vin de France", country: "France" },
    ]);
  });

  it("drops a region whose country_id is not among the countries", () => {
    const regions = [
      { id: "r1", name: "Bordeaux", country_id: france.id },
      { id: "r2", name: "Somewhere", country_id: "c-unknown" },
    ];
    expect(favouriteRegionOptions(regions, countries).map((o) => o.id)).toEqual(["r1"]);
  });

  it("sorts by label accent- and case-insensitively, id breaking a tie", () => {
    const regions = [
      { id: "r-alsace", name: "Alsace", country_id: france.id },
      { id: "r-alava", name: "Álava", country_id: spain.id },
      { id: "r-ahr", name: "Ahr", country_id: germany.id },
    ];
    const options = favouriteRegionOptions(regions, countries);
    expect(options.map((o) => regionLabel(o))).toEqual([
      "Ahr, Germany",
      "Álava, Spain",
      "Alsace, France",
    ]);
  });

  it("breaks an exact label tie by id", () => {
    const regions = [
      { id: "r-b", name: "Bourgogne", country_id: france.id },
      { id: "r-a", name: "Bourgogne", country_id: france.id },
    ];
    expect(favouriteRegionOptions(regions, countries).map((o) => o.id)).toEqual(["r-a", "r-b"]);
  });
});

// ---------------------------------------------------------------------------
// withFavourite / withoutFavourite / canAddFavourite / unchosen
// ---------------------------------------------------------------------------

describe("withFavourite / withoutFavourite / canAddFavourite / unchosen", () => {
  it("adding keeps insertion order", () => {
    let list: { id: string }[] = [];
    list = withFavourite(list, { id: "a" });
    list = withFavourite(list, { id: "b" });
    list = withFavourite(list, { id: "c" });
    expect(list.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("a duplicate id returns the same array instance", () => {
    const list = [{ id: "a" }, { id: "b" }];
    expect(withFavourite(list, { id: "a" })).toBe(list);
  });

  it("at 10 items, adding returns the same instance", () => {
    const list = Array.from({ length: 10 }, (_, i) => ({ id: `id-${i}` }));
    expect(withFavourite(list, { id: "new" })).toBe(list);
  });

  it("removing by id keeps the others in order", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(withoutFavourite(list, "b").map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("removing an absent id changes nothing (by value)", () => {
    const list = [{ id: "a" }, { id: "b" }];
    expect(withoutFavourite(list, "z")).toEqual(list);
  });

  it("canAddFavourite is true at 9 and false at 10", () => {
    expect(canAddFavourite(Array.from({ length: 9 }, (_, i) => ({ id: `${i}` })))).toBe(true);
    expect(canAddFavourite(Array.from({ length: 10 }, (_, i) => ({ id: `${i}` })))).toBe(false);
  });

  it("after a removal from 10, adding works again", () => {
    let list = Array.from({ length: 10 }, (_, i) => ({ id: `id-${i}` }));
    list = withoutFavourite(list, "id-0");
    expect(canAddFavourite(list)).toBe(true);
    list = withFavourite(list, { id: "new" });
    expect(list.map((x) => x.id)).toEqual([
      "id-1", "id-2", "id-3", "id-4", "id-5", "id-6", "id-7", "id-8", "id-9", "new",
    ]);
  });

  it("unchosen drops exactly the chosen ids and keeps option order", () => {
    const options = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(unchosen(options, [{ id: "b" }]).map((o) => o.id)).toEqual(["a", "c"]);
  });
});

// ---------------------------------------------------------------------------
// serializeFavouriteIds / parseFavouriteIds
// ---------------------------------------------------------------------------

describe("serializeFavouriteIds / parseFavouriteIds", () => {
  it("round-trip", () => {
    const ids = ["a", "b", "c"];
    expect(parseFavouriteIds(serializeFavouriteIds(ids.map((id) => ({ id }))))).toEqual(ids);
  });

  it("null, undefined and a File-like object give null", () => {
    expect(parseFavouriteIds(null)).toBeNull();
    expect(parseFavouriteIds(undefined)).toBeNull();
    expect(parseFavouriteIds({ name: "x.txt", size: 3 })).toBeNull();
  });

  it('"" and "\\n \\n" give []', () => {
    expect(parseFavouriteIds("")).toEqual([]);
    expect(parseFavouriteIds("\n \n")).toEqual([]);
  });

  it('" a \\r\\n\\n b " gives ["a", "b"]', () => {
    expect(parseFavouriteIds(" a \r\n\n b ")).toEqual(["a", "b"]);
  });

  it("duplicates are kept as sent", () => {
    expect(parseFavouriteIds("a\na\nb")).toEqual(["a", "a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// favouritesFromRows
// ---------------------------------------------------------------------------

describe("favouritesFromRows", () => {
  const regions = [
    { id: "r1", name: "Bordeaux", country_id: "c-fr" },
    { id: "r2", name: "Rioja", country_id: "c-es" },
  ];
  const countries = [
    { id: "c-fr", name: "France" },
    { id: "c-es", name: "Spain" },
  ];
  const producers = [
    { id: "p1", name: "Ridge Vineyards" },
    { id: "p2", name: "Gaja" },
  ];

  it("rows given out of order come back ordered by position", () => {
    const result = favouritesFromRows({
      regionRows: [
        { region_id: "r2", position: 2 },
        { region_id: "r1", position: 1 },
      ],
      producerRows: [
        { producer_id: "p2", position: 2 },
        { producer_id: "p1", position: 1 },
      ],
      regions,
      countries,
      producers,
    });
    expect(result).toEqual({
      regions: [
        { id: "r1", name: "Bordeaux", country: "France" },
        { id: "r2", name: "Rioja", country: "Spain" },
      ],
      producers: [
        { id: "p1", name: "Ridge Vineyards" },
        { id: "p2", name: "Gaja" },
      ],
    });
  });

  it("a region row whose region, or whose region's country, is missing is dropped; likewise a producer row whose producer is missing", () => {
    const result = favouritesFromRows({
      regionRows: [
        { region_id: "r1", position: 1 },
        { region_id: "unknown-region", position: 2 },
      ],
      producerRows: [
        { producer_id: "p1", position: 1 },
        { producer_id: "unknown-producer", position: 2 },
      ],
      regions: [
        { id: "r1", name: "Bordeaux", country_id: "c-orphan" }, // orphan country
        { id: "r-orphan-country", name: "Somewhere", country_id: "c-orphan" },
      ],
      countries: [],
      producers: [{ id: "p1", name: "Ridge Vineyards" }],
    });
    expect(result).toEqual({ regions: [], producers: [{ id: "p1", name: "Ridge Vineyards" }] });
  });
});

// ---------------------------------------------------------------------------
// A recording fake client, in the pattern of place.test.ts, extended to
// several tables (and rpc) since favourites reads join across five.
// ---------------------------------------------------------------------------

type Call = { table: string; op: string; args: unknown[] };
type TableResult = { data?: unknown; error: { message: string } | null };

function fakeSupabase(results: Record<string, TableResult>, rpcResult?: TableResult) {
  const calls: Call[] = [];

  function builderFor(table: string) {
    const result = results[table] ?? { data: [], error: null };
    const builder: Record<string, unknown> = {};
    for (const op of ["select", "eq", "order", "in", "range"]) {
      builder[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        return builder;
      };
    }
    builder.then = (
      onFulfilled: (value: TableResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected);
    return builder;
  }

  const client = {
    from: (table: string) => {
      calls.push({ table, op: "from", args: [] });
      return builderFor(table);
    },
    rpc: (name: string, args: unknown) => {
      calls.push({ table: name, op: "rpc", args: [args] });
      return Promise.resolve(rpcResult ?? { data: null, error: null });
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

// ---------------------------------------------------------------------------
// getProfileFavourites
// ---------------------------------------------------------------------------

describe("getProfileFavourites", () => {
  it("reads both favourites tables with .eq(profile_id) and .order(position)", async () => {
    const { client, calls } = fakeSupabase({});
    await getProfileFavourites(client, "u1");
    const regionCalls = calls.filter((c) => c.table === "profile_favourite_regions");
    expect(regionCalls.map((c) => c.op)).toEqual(["from", "select", "eq", "order"]);
    expect(regionCalls.find((c) => c.op === "select")?.args).toEqual(["region_id, position"]);
    expect(regionCalls.find((c) => c.op === "eq")?.args).toEqual(["profile_id", "u1"]);
    expect(regionCalls.find((c) => c.op === "order")?.args).toEqual(["position"]);

    const producerCalls = calls.filter((c) => c.table === "profile_favourite_producers");
    expect(producerCalls.map((c) => c.op)).toEqual(["from", "select", "eq", "order"]);
    expect(producerCalls.find((c) => c.op === "select")?.args).toEqual(["producer_id, position"]);
  });

  it("with no favourite rows it makes no reference reads", async () => {
    const { client, calls } = fakeSupabase({
      profile_favourite_regions: { data: [], error: null },
      profile_favourite_producers: { data: [], error: null },
    });
    const result = await getProfileFavourites(client, "u1");
    expect(result).toEqual({ regions: [], producers: [] });
    expect(calls.some((c) => c.table === "regions")).toBe(false);
    expect(calls.some((c) => c.table === "countries")).toBe(false);
    expect(calls.some((c) => c.table === "producers")).toBe(false);
  });

  it("with rows it reads regions/producers with .in(id, ids) and countries in full", async () => {
    const { client, calls } = fakeSupabase({
      profile_favourite_regions: { data: [{ region_id: "r1", position: 1 }], error: null },
      profile_favourite_producers: { data: [{ producer_id: "p1", position: 1 }], error: null },
      regions: { data: [{ id: "r1", name: "Bordeaux", country_id: "c-fr" }], error: null },
      countries: { data: [{ id: "c-fr", name: "France" }], error: null },
      producers: { data: [{ id: "p1", name: "Ridge Vineyards" }], error: null },
    });
    const result = await getProfileFavourites(client, "u1");
    expect(result).toEqual({
      regions: [{ id: "r1", name: "Bordeaux", country: "France" }],
      producers: [{ id: "p1", name: "Ridge Vineyards" }],
    });
    const regionsCall = calls.find((c) => c.table === "regions" && c.op === "in");
    expect(regionsCall?.args).toEqual(["id", ["r1"]]);
    const producersCall = calls.find((c) => c.table === "producers" && c.op === "in");
    expect(producersCall?.args).toEqual(["id", ["p1"]]);
    // countries is read in full — no .in() call against it.
    expect(calls.some((c) => c.table === "countries" && c.op === "in")).toBe(false);
    expect(calls.some((c) => c.table === "countries" && c.op === "select")).toBe(true);
  });

  it("an error in any read gives null, not an empty set", async () => {
    const refused = { message: "permission denied" };
    const { client: c1 } = fakeSupabase({
      profile_favourite_regions: { data: null, error: refused },
    });
    expect(await getProfileFavourites(c1, "u1")).toBeNull();

    const { client: c2 } = fakeSupabase({
      profile_favourite_regions: { data: [{ region_id: "r1", position: 1 }], error: null },
      profile_favourite_producers: { data: [], error: null },
      regions: { data: null, error: refused },
    });
    expect(await getProfileFavourites(c2, "u1")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// loadFavouriteRegionOptions
// ---------------------------------------------------------------------------

describe("loadFavouriteRegionOptions", () => {
  it("pages with .range(0, 999) and then .range(1000, 1999) when a page comes back full", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      id: `r-${i}`,
      name: `Region ${i}`,
      country_id: "c-fr",
    }));
    const seenRanges: [string, number, number][] = [];
    const client = {
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        for (const op of ["select", "order"]) builder[op] = () => builder;
        builder.range = (from: number, to: number) => {
          seenRanges.push([table, from, to]);
          if (table === "regions") {
            return Promise.resolve({ data: from === 0 ? fullPage : [], error: null });
          }
          return Promise.resolve({ data: from === 0 ? [{ id: "c-fr", name: "France" }] : [], error: null });
        };
        return builder;
      },
    } as unknown as SupabaseClient<Database>;

    await loadFavouriteRegionOptions(client);
    const regionRanges = seenRanges.filter(([table]) => table === "regions").map(([, from, to]) => [from, to]);
    expect(regionRanges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("maps through favouriteRegionOptions", async () => {
    const { client } = fakeSupabase({
      countries: { data: [{ id: "c-fr", name: "France" }], error: null },
      regions: {
        data: [
          { id: "r1", name: "Bordeaux", country_id: "c-fr" },
          { id: "r-none", name: "None", country_id: "c-fr" },
        ],
        error: null,
      },
    });
    const options = await loadFavouriteRegionOptions(client);
    expect(options).toEqual([{ id: "r1", name: "Bordeaux", country: "France" }]);
  });

  it("an error gives null", async () => {
    const { client } = fakeSupabase({
      countries: { data: null, error: { message: "boom" } },
    });
    expect(await loadFavouriteRegionOptions(client)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// setProfileFavourites
// ---------------------------------------------------------------------------

describe("setProfileFavourites", () => {
  it("calls rpc(set_profile_favourites, ...) with the arrays in order, and returns { ok: true }", async () => {
    const { client, calls } = fakeSupabase({}, { data: null, error: null });
    const result = await setProfileFavourites(client, ["r1", "r2"], ["p1"]);
    expect(result).toEqual({ ok: true });
    const rpcCall = calls.find((c) => c.op === "rpc");
    expect(rpcCall?.table).toBe("set_profile_favourites");
    expect(rpcCall?.args).toEqual([{ p_region_ids: ["r1", "r2"], p_producer_ids: ["p1"] }]);
  });

  it("a PostgREST error comes back as { error: message }, verbatim", async () => {
    const { client } = fakeSupabase(
      {},
      { data: null, error: { message: "you can pick up to 10 favourite regions" } },
    );
    expect(await setProfileFavourites(client, [], [])).toEqual({
      error: "you can pick up to 10 favourite regions",
    });
  });
});

// Type-only usage so the exported types are exercised (tsc catches drift).
const _typeCheck: { r: FavouriteRegion; p: FavouriteProducer } = {
  r: { id: "r1", name: "Bordeaux", country: "France" },
  p: { id: "p1", name: "Ridge Vineyards" },
};
void _typeCheck;
