// fetchArchetype backs the "typical wine from here" sheet on the wine map.
// What is pinned here is the SHAPE OF THE WAIT: the aroma links are keyed by
// the id the caller passed, so they must not sit behind the archetype row, and
// the sheet must open in two network rounds rather than three.
import { describe, expect, it } from "vitest";
import { fetchArchetype } from "./archetype-detail";
import { stubClient, type RecordedQuery } from "../testing/stub-postgrest";

const ARCHETYPE = {
  id: "a1",
  name: "A typical Chablis",
  colour: "WHITE",
  style: "STILL",
  wine_place_id: "p1",
  primary_grape_id: "g1",
  secondary_grape_id: null,
  description: "Lean and mineral.",
  quality_low: "GOOD",
  quality_high: "VERY_GOOD",
  sat: "DRY",
};

function archetypeClient(overrides?: {
  archetype?: unknown;
  aromas?: Array<{ term_id: string; kind: string }>;
}) {
  const aromas = overrides?.aromas ?? [
    { term_id: "t2", kind: "NOSE" },
    { term_id: "t1", kind: "NOSE" },
    { term_id: "t3", kind: "PALATE" },
  ];
  return stubClient({
    tables: {
      wine_archetypes: () => ({
        data: "archetype" in (overrides ?? {}) ? overrides?.archetype : ARCHETYPE,
        error: null,
      }),
      wine_places: () => ({ data: { name: "Chablis" }, error: null }),
      grapes: () => ({ data: [{ id: "g1", name: "Chardonnay" }], error: null }),
      wine_archetype_aromas: () => ({ data: aromas, error: null }),
      wset_aroma_terms: (query: RecordedQuery) => ({
        data: [
          { id: "t1", term: "Lemon", sort_order: 1 },
          { id: "t2", term: "Chalk", sort_order: 2 },
          { id: "t3", term: "Green apple", sort_order: 3 },
        ].filter((t) => (query.in[0]?.[1] as string[]).includes(t.id)),
        error: null,
      }),
    },
  });
}

describe("fetchArchetype", () => {
  it("starts the aroma links BEFORE the archetype row, not behind it", async () => {
    const { client, calls } = archetypeClient();

    await fetchArchetype(client, "a1");

    // The links are keyed by the caller's own id, so they go out first; the
    // terms then resolve in round two rather than round three.
    expect(calls.queries[0].table).toBe("wine_archetype_aromas");
    expect(calls.queries[0].eq).toEqual([["archetype_id", "a1"]]);
    expect(calls.queries[1].table).toBe("wine_archetypes");
  });

  it("makes exactly five requests, and asks each table once", async () => {
    const { client, calls } = archetypeClient();

    await fetchArchetype(client, "a1");

    expect(calls.queries.map((q) => q.table).sort()).toEqual([
      "grapes",
      "wine_archetype_aromas",
      "wine_archetypes",
      "wine_places",
      "wset_aroma_terms",
    ]);
  });

  it("returns the same view as before: place, grapes and sorted aroma terms", async () => {
    const { client } = archetypeClient();

    const view = await fetchArchetype(client, "a1");

    expect(view).toEqual({
      name: "A typical Chablis",
      colour: "WHITE",
      style: "STILL",
      placeName: "Chablis",
      grapes: "Chardonnay",
      description: "Lean and mineral.",
      qualityLow: "GOOD",
      qualityHigh: "VERY_GOOD",
      sat: "DRY",
      // Sorted by the terms' own sort_order, not by link order.
      aromas: ["Lemon", "Chalk"],
      flavours: ["Green apple"],
    });
  });

  it("an archetype with no aroma links skips the terms request entirely", async () => {
    const { client, calls } = archetypeClient({ aromas: [] });

    const view = await fetchArchetype(client, "a1");

    expect(view?.aromas).toEqual([]);
    expect(view?.flavours).toEqual([]);
    expect(calls.queries.some((q) => q.table === "wset_aroma_terms")).toBe(false);
  });

  it("an unknown id returns null and leaves no request unsettled", async () => {
    const { client, calls } = archetypeClient({ archetype: null });

    await expect(fetchArchetype(client, "nope")).resolves.toBeNull();

    // The links request was already out; it is awaited rather than abandoned,
    // and nothing that depends on the row is issued.
    expect(calls.queries.map((q) => q.table)).toEqual([
      "wine_archetype_aromas",
      "wine_archetypes",
    ]);
  });
});
