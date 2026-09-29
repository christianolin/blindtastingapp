import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

vi.mock("server-only", () => ({}));

// readTrainingPool's wine-map read (training-room-map spec RM3, RM3a): the
// training_archetype_places RPC starts in the pool's FIRST round, replaces the
// old "map places" wine_places read, and fails SOFT — logged once, every wine
// off the map, the pool still returned — while the archetype read itself
// still fails the page.

type Rows = Record<string, unknown[]>;
type Rpc = () => Promise<{ data: unknown; error: { message: string } | null }>;

const ARCH = "00000000-0000-4000-8000-00000000a001";

const TABLES: Rows = {
  wine_archetypes: [
    {
      id: ARCH,
      name: "A typical Pauillac",
      description: null,
      colour: "RED",
      style: "STILL",
      country_id: "fr",
      region_id: "bdx",
      appellation_id: "pauillac",
      primary_grape_id: "cs",
      secondary_grape_id: null,
      typical_age_low: null,
      typical_age_high: null,
      sat: {},
      quality_low: null,
      quality_high: null,
      wine_place_id: "place-pauillac",
      sort_order: 1,
    },
  ],
  wine_archetype_aromas: [],
  wset_aroma_terms: [],
  wine_archetype_designations: [],
  countries: [{ id: "fr", name: "France" }],
  regions: [{ id: "bdx", name: "Bordeaux" }],
  appellations: [{ id: "pauillac", name: "Pauillac AOC" }],
  grapes: [{ id: "cs", name: "Cabernet Sauvignon" }],
  type_designations: [],
};

const PLACE_ROW = {
  archetype_id: ARCH,
  place_key: "france.bordeaux.haut-medoc.pauillac",
  region_key: "france.bordeaux",
  region_name: "Bordeaux",
  point_key: "france.bordeaux.haut-medoc.pauillac",
  point_lon: -0.7708,
  point_lat: 45.1971,
};

const UNPLACED_ROW = {
  archetype_id: ARCH,
  place_key: null,
  region_key: null,
  region_name: null,
  point_key: null,
  point_lon: null,
  point_lat: null,
};

// The display-point read's select (spec RM23): answered from `display`, not TABLES.
const DISPLAY_COLUMNS = "id, display_lon, display_lat";

/** A PostgREST stand-in: every builder method chains, awaiting it answers
    that table's rows (or `fails`'s error, by table and selected columns);
    `calls` records the order. */
function fakeClient(
  rpc: Rpc,
  fails: (table: string, columns: string) => boolean = () => false,
  display: unknown[] = [],
) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(`from:${table}`);
      let columns = "";
      const result = () => {
        if (fails(table, columns)) return Promise.resolve({ data: null, error: { message: "boom" } });
        const rows = table === "wine_archetypes" && columns === DISPLAY_COLUMNS ? display : (TABLES[table] ?? []);
        return Promise.resolve({ data: rows, error: null });
      };
      const builder: Record<string, unknown> = {};
      for (const m of ["order", "range", "in", "eq", "not"]) builder[m] = () => builder;
      builder.select = (c: string) => {
        columns = c;
        return builder;
      };
      builder.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result().then(ok, bad);
      return builder;
    },
    rpc(fn: string) {
      calls.push(`rpc:${fn}`);
      return rpc();
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readTrainingPool's wine-map read", () => {
  it("starts the RPC in the first round and never reads wine_places", async () => {
    const { readTrainingPool } = await import("./pool");
    const { client, calls } = fakeClient(async () => ({ data: [PLACE_ROW], error: null }));

    const [pauillac] = await readTrainingPool(client);

    expect(pauillac).toMatchObject({
      placeCanonicalKey: "france.bordeaux.haut-medoc.pauillac",
      mapRegion: { key: "france.bordeaux", name: "Bordeaux" },
      mapPoint: { lon: -0.7708, lat: 45.1971, source: "place" },
    });
    expect(calls.filter((c) => c === "rpc:training_archetype_places")).toHaveLength(1);
    expect(calls.indexOf("rpc:training_archetype_places")).toBeLessThan(calls.indexOf("from:countries"));
    expect(calls).not.toContain("from:wine_places");
  });

  it("an RPC error logs once and leaves every wine off the map; the pool still comes back", async () => {
    const { readTrainingPool } = await import("./pool");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient(async () => ({ data: null, error: { message: "schema cache" } }));

    const pool = await readTrainingPool(client);

    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({ name: "A typical Pauillac", placeCanonicalKey: null, mapRegion: null, mapPoint: null });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe("training pool: map places");
  });

  it("a rejected RPC call is handled the same way", async () => {
    const { readTrainingPool } = await import("./pool");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient(() => Promise.reject(new Error("network")));

    const pool = await readTrainingPool(client);

    expect(pool[0]).toMatchObject({ placeCanonicalKey: null, mapRegion: null, mapPoint: null });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe("training pool: map places");
  });

  it("a failed archetype read still fails the page", async () => {
    const { readTrainingPool } = await import("./pool");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient(
      async () => ({ data: [PLACE_ROW], error: null }),
      (table) => table === "wine_archetypes",
    );

    await expect(readTrainingPool(client)).rejects.toThrow("Training room: the archetypes read failed (boom)");
  });
});

describe("readTrainingPool's curated display points (spec RM23)", () => {
  it("reads them in the first round and gives an unplaced wine its curated dot", async () => {
    const { readTrainingPool } = await import("./pool");
    const { client, calls } = fakeClient(
      async () => ({ data: [UNPLACED_ROW], error: null }),
      () => false,
      [{ id: ARCH, display_lon: 15.42, display_lat: 48.39 }],
    );

    const [wine] = await readTrainingPool(client);

    expect(wine).toMatchObject({
      placeCanonicalKey: null,
      mapRegion: null,
      mapPoint: { lon: 15.42, lat: 48.39, source: "curated" },
    });
    const archetypeReads = calls.flatMap((c, i) => (c === "from:wine_archetypes" ? [i] : []));
    expect(archetypeReads).toHaveLength(2);
    expect(Math.max(...archetypeReads)).toBeLessThan(calls.indexOf("from:countries"));
  });

  it("a place point wins: the curated one is ignored", async () => {
    const { readTrainingPool } = await import("./pool");
    const { client } = fakeClient(
      async () => ({ data: [PLACE_ROW], error: null }),
      () => false,
      [{ id: ARCH, display_lon: 1, display_lat: 1 }],
    );

    const [wine] = await readTrainingPool(client);

    expect(wine.mapPoint).toEqual({ lon: -0.7708, lat: 45.1971, source: "place" });
  });

  it("a failed display-point read logs once and shows no curated dot; the pool still comes back", async () => {
    const { readTrainingPool } = await import("./pool");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient(
      async () => ({ data: [UNPLACED_ROW], error: null }),
      (table, columns) => table === "wine_archetypes" && columns === DISPLAY_COLUMNS,
      [{ id: ARCH, display_lon: 15.42, display_lat: 48.39 }],
    );

    const pool = await readTrainingPool(client);

    expect(pool).toHaveLength(1);
    expect(pool[0].mapPoint).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe("training pool: display points");
  });
});
