import { describe, expect, it } from "vitest";
import { fetchArchetypesForPlace } from "./archetype-query";
import { stubClient } from "../testing/stub-postgrest";

/** The live Bourgogne placements, as PostgREST returns them with the embed. */
const bourgogne = [
  { sort_order: 10, wine_archetypes: { id: "b1", name: "A typical Chablis", colour: "WHITE", style: "STILL" } },
  { sort_order: 20, wine_archetypes: { id: "b2", name: "A typical Côte de Nuits", colour: "RED", style: "STILL" } },
  { sort_order: 30, wine_archetypes: { id: "b3", name: "A typical Côte de Beaune", colour: "WHITE", style: "STILL" } },
  { sort_order: 40, wine_archetypes: { id: "b4", name: "A typical Côte Chalonnaise", colour: "RED", style: "STILL" } },
  { sort_order: 50, wine_archetypes: { id: "b5", name: "A typical Mâconnais", colour: "WHITE", style: "STILL" } },
];

describe("fetchArchetypesForPlace", () => {
  it("is ONE request — the three-hop chain is gone", async () => {
    const { client, calls } = stubClient({
      tables: { wine_archetype_placements: () => ({ data: bourgogne, error: null }) },
    });

    const rows = await fetchArchetypesForPlace(client, "france.bourgogne");

    expect(calls.queries).toHaveLength(1);
    // Specifically: no wine_places lookup for an id, and no wine_archetypes
    // follow-up — those were the two chained requests this replaced.
    expect(calls.queries.map((q) => q.table)).toEqual(["wine_archetype_placements"]);
    expect(rows.map((r) => r.name)).toEqual([
      "A typical Chablis",
      "A typical Côte de Nuits",
      "A typical Côte de Beaune",
      "A typical Côte Chalonnaise",
      "A typical Mâconnais",
    ]);
  });

  it("filters through the embedded place and orders by sort_order", async () => {
    const { client, calls } = stubClient({
      tables: { wine_archetype_placements: () => ({ data: [], error: null }) },
    });
    await fetchArchetypesForPlace(client, "france.savoie");
    const [query] = calls.queries;
    expect(query.select).toBe(
      "sort_order, wine_archetypes!inner(id, name, colour, style), wine_places!inner(canonical_key)",
    );
    expect(query.eq).toEqual([["wine_places.canonical_key", "france.savoie"]]);
    expect(query.order).toBe("sort_order");
  });

  it("returns [] for a place with no archetypes (the common case)", async () => {
    const { client } = stubClient({
      tables: { wine_archetype_placements: () => ({ data: [], error: null }) },
    });
    await expect(fetchArchetypesForPlace(client, "france.savoie")).resolves.toEqual([]);
  });

  it("accepts the to-one embed as a one-element array too", async () => {
    const { client } = stubClient({
      tables: {
        wine_archetype_placements: () => ({
          data: bourgogne.map((r) => ({ ...r, wine_archetypes: [r.wine_archetypes] })),
          error: null,
        }),
      },
    });
    const rows = await fetchArchetypesForPlace(client, "france.bourgogne");
    expect(rows.map((r) => r.id)).toEqual(["b1", "b2", "b3", "b4", "b5"]);
  });

  it("throws on a PostgREST error rather than silently showing no typical wine", async () => {
    const { client } = stubClient({
      tables: {
        wine_archetype_placements: () => ({ data: null, error: { message: "boom" } }),
      },
    });
    await expect(fetchArchetypesForPlace(client, "k")).rejects.toThrow("boom");
  });
});
