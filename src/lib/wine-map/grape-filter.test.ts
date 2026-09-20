import { describe, expect, it } from "vitest";
import { fetchGrapeOptions, fetchPlaceGrapeLinks } from "./grape-filter";
import { GRAPE_LINK_PAGE_SIZE, GRAPE_LINK_PARALLEL_PAGES } from "./page-plan";
import { stubClient, type RecordedQuery } from "../testing/stub-postgrest";

/** `n` link rows starting at `offset`, one per place, all the same grape. */
function links(offset: number, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    wine_place_id: `place-${offset + i}`,
    grape_id: "grape-a",
  }));
}

/** A table of `total` rows, served by whatever range each request asks for. */
function tableOf(total: number) {
  return (query: RecordedQuery) => {
    const [from, to] = query.range ?? [0, total - 1];
    const start = Math.min(from, total);
    const end = Math.min(to + 1, total);
    return { data: links(start, Math.max(0, end - start)), error: null };
  };
}

describe("fetchPlaceGrapeLinks", () => {
  it("asks for a whole round of pages AT ONCE, not one after another", async () => {
    const { client, calls } = stubClient({
      tables: { wine_place_grapes: tableOf(2964) },
    });

    await fetchPlaceGrapeLinks(client);

    // One round, four requests — the old walk made three, each waiting for the
    // one before it. Four requests in parallel cost one round trip; three in
    // series cost three.
    expect(calls.queries).toHaveLength(GRAPE_LINK_PARALLEL_PAGES);
    expect(calls.queries.map((q) => q.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
    ]);
    expect(new Set(calls.queries.map((q) => q.table))).toEqual(
      new Set(["wine_place_grapes"]),
    );
    expect(calls.queries[0].select).toBe("wine_place_id, grape_id");
  });

  it("returns every row of the live-sized table, keyed by place", async () => {
    const { client } = stubClient({ tables: { wine_place_grapes: tableOf(2964) } });

    const byPlace = await fetchPlaceGrapeLinks(client);

    expect(byPlace.size).toBe(2964);
    expect(byPlace.get("place-0")).toEqual(new Set(["grape-a"]));
    expect(byPlace.get("place-2963")).toEqual(new Set(["grape-a"]));
    expect(byPlace.get("place-2964")).toBeUndefined();
  });

  it("collects several grapes for one place into a single set", async () => {
    const { client } = stubClient({
      tables: {
        wine_place_grapes: () => ({
          data: [
            { wine_place_id: "p1", grape_id: "g1" },
            { wine_place_id: "p1", grape_id: "g2" },
            { wine_place_id: "p2", grape_id: "g1" },
          ],
          error: null,
        }),
      },
    });

    const byPlace = await fetchPlaceGrapeLinks(client);

    expect(byPlace.get("p1")).toEqual(new Set(["g1", "g2"]));
    expect(byPlace.get("p2")).toEqual(new Set(["g1"]));
  });

  it("runs a second round only when every page of the first one filled", async () => {
    const total = GRAPE_LINK_PAGE_SIZE * GRAPE_LINK_PARALLEL_PAGES + 7;
    const { client, calls } = stubClient({
      tables: { wine_place_grapes: tableOf(total) },
    });

    const byPlace = await fetchPlaceGrapeLinks(client);

    expect(calls.queries).toHaveLength(GRAPE_LINK_PARALLEL_PAGES * 2);
    expect(calls.queries[GRAPE_LINK_PARALLEL_PAGES].range).toEqual([4000, 4999]);
    expect(byPlace.size).toBe(total);
  });

  it("stops after one round for an empty table", async () => {
    const { client, calls } = stubClient({
      tables: { wine_place_grapes: tableOf(0) },
    });

    const byPlace = await fetchPlaceGrapeLinks(client);

    expect(byPlace.size).toBe(0);
    expect(calls.queries).toHaveLength(GRAPE_LINK_PARALLEL_PAGES);
  });

  it("rejects when any page of a round errors, rather than filtering on half the links", async () => {
    const { client } = stubClient({
      tables: {
        wine_place_grapes: (query) =>
          query.range?.[0] === 2000
            ? { data: null, error: { message: "boom" } }
            : { data: links(query.range?.[0] ?? 0, GRAPE_LINK_PAGE_SIZE), error: null },
      },
    });

    await expect(fetchPlaceGrapeLinks(client)).rejects.toThrow("boom");
  });
});

describe("fetchGrapeOptions", () => {
  it("asks for the two columns it renders, in name order, in one request", async () => {
    const { client, calls } = stubClient({
      tables: {
        grapes: () => ({
          data: [
            { id: "g1", name: "Chardonnay" },
            { id: "g2", name: "Pinot Noir" },
          ],
          error: null,
        }),
      },
    });

    const options = await fetchGrapeOptions(client);

    expect(calls.queries).toHaveLength(1);
    expect(calls.queries[0].select).toBe("id, name");
    expect(calls.queries[0].order).toBe("name");
    expect(options).toEqual([
      { id: "g1", name: "Chardonnay" },
      { id: "g2", name: "Pinot Noir" },
    ]);
  });
});
