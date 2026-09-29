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

/** A PostgREST stand-in: every builder method chains, awaiting it answers
    that table's rows (or `failing`'s error); `calls` records the order. */
function fakeClient(rpc: Rpc, failing?: string) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(`from:${table}`);
      const result = () =>
        Promise.resolve(
          table === failing
            ? { data: null, error: { message: "boom" } }
            : { data: TABLES[table] ?? [], error: null },
        );
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "order", "range", "in", "eq"]) builder[m] = () => builder;
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
    const { client } = fakeClient(async () => ({ data: [PLACE_ROW], error: null }), "wine_archetypes");

    await expect(readTrainingPool(client)).rejects.toThrow("Training room: the archetypes read failed (boom)");
  });
});
