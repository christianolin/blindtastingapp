import { describe, expect, it } from "vitest";
import { fetchPlaceStyles } from "./place-styles";
import { stubClient } from "../testing/stub-postgrest";

describe("fetchPlaceStyles", () => {
  it("asks wine_place_styles once, keyed by canonical_key, ordered by sort_order", async () => {
    const { client, calls } = stubClient({
      tables: {
        wine_place_styles: () => ({
          data: [
            { style: "WHITE", colour: null, note: null, sort_order: 0 },
            { style: "SPARKLING", colour: "WHITE", note: "Crémant", sort_order: 1 },
          ],
          error: null,
        }),
      },
    });

    const rows = await fetchPlaceStyles(client, "france.savoie");

    // ONE request, and nothing it needs comes from another one: the whole point
    // of re-keying this from wine_place_id to canonical_key is that it can now
    // start alongside the context RPC instead of behind it.
    expect(calls.queries).toHaveLength(1);
    expect(calls.rpcs).toHaveLength(0);
    const [query] = calls.queries;
    expect(query.table).toBe("wine_place_styles");
    expect(query.select).toBe(
      "style, colour, note, sort_order, wine_places!inner(canonical_key)",
    );
    expect(query.eq).toEqual([["wine_places.canonical_key", "france.savoie"]]);
    expect(query.order).toBe("sort_order");

    // The colour dimension survives — it is the only reason this is a separate
    // request at all (get_wine_place_context's style_list is {style, note}).
    expect(rows).toEqual([
      { style: "WHITE", colour: null, note: null },
      { style: "SPARKLING", colour: "WHITE", note: "Crémant" },
    ]);
  });

  it("never widens the select: no column beyond what the panel renders", async () => {
    const { client, calls } = stubClient({
      tables: { wine_place_styles: () => ({ data: [], error: null }) },
    });
    await fetchPlaceStyles(client, "france.bourgogne");
    const columns = (calls.queries[0].select ?? "")
      .replace(/wine_places!inner\([^)]*\)/, "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    expect(columns.sort()).toEqual(["colour", "note", "sort_order", "style"]);
  });

  it("throws on a PostgREST error rather than caching an empty list", async () => {
    const { client } = stubClient({
      tables: {
        wine_place_styles: () => ({ data: null, error: { message: "boom" } }),
      },
    });
    await expect(fetchPlaceStyles(client, "k")).rejects.toThrow("boom");
  });

  it("returns [] for an unverified or unknown place, as the inner join drops it", async () => {
    const { client } = stubClient({
      tables: { wine_place_styles: () => ({ data: [], error: null }) },
    });
    await expect(fetchPlaceStyles(client, "nowhere")).resolves.toEqual([]);
  });
});
