import { describe, expect, it } from "vitest";
import { archetypeRows } from "./archetype-rows";

const chablis = { id: "a1", name: "A typical Chablis", colour: "WHITE", style: "STILL" };
const nuits = { id: "a2", name: "A typical Côte de Nuits", colour: "RED", style: "STILL" };

describe("archetypeRows", () => {
  it("maps a to-one embed delivered as an OBJECT", () => {
    expect(archetypeRows([{ sort_order: 10, wine_archetypes: chablis }])).toEqual([
      { id: "a1", name: "A typical Chablis", colour: "WHITE", style: "STILL" },
    ]);
  });

  it("maps a to-one embed delivered as a ONE-ELEMENT ARRAY, identically", () => {
    // PostgREST/postgrest-js have shipped both shapes; the repo already hedges
    // this way for `grapes(name)` embeds elsewhere.
    expect(archetypeRows([{ sort_order: 10, wine_archetypes: [chablis] }])).toEqual(
      archetypeRows([{ sort_order: 10, wine_archetypes: chablis }]),
    );
  });

  it("drops a row whose embed is missing, keeping the rest", () => {
    const rows = archetypeRows([
      { sort_order: 10, wine_archetypes: null },
      { sort_order: 20, wine_archetypes: nuits },
      { sort_order: 30 },
      { sort_order: 40, wine_archetypes: [] },
    ]);
    expect(rows).toEqual([
      { id: "a2", name: "A typical Côte de Nuits", colour: "RED", style: "STILL" },
    ]);
  });

  it("preserves the incoming order verbatim and never re-sorts", () => {
    const rows = archetypeRows([
      { sort_order: 90, wine_archetypes: nuits },
      { sort_order: 10, wine_archetypes: chablis },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a2", "a1"]);
  });

  it("takes id and name from the embed, and passes colour and style through", () => {
    const rows = archetypeRows([
      {
        sort_order: 10,
        archetype_id: "WRONG",
        name: "WRONG",
        wine_archetypes: { id: "a9", name: "A typical Rosé", colour: "ROSE", style: "SPARKLING" },
      },
    ]);
    expect(rows).toEqual([
      { id: "a9", name: "A typical Rosé", colour: "ROSE", style: "SPARKLING" },
    ]);
  });

  it("returns [] for null, undefined and a non-array, never throwing", () => {
    expect(archetypeRows(null)).toEqual([]);
    expect(archetypeRows(undefined)).toEqual([]);
    expect(archetypeRows({ sort_order: 10 })).toEqual([]);
    expect(archetypeRows("nope")).toEqual([]);
    expect(archetypeRows([])).toEqual([]);
  });

  it("skips a malformed embed rather than emitting a half row", () => {
    expect(
      archetypeRows([
        { sort_order: 10, wine_archetypes: { id: "a1" } },
        { sort_order: 20, wine_archetypes: { name: "no id", colour: "RED", style: "STILL" } },
        { sort_order: 30, wine_archetypes: nuits },
      ]).map((r) => r.id),
    ).toEqual(["a2"]);
  });

  it("reproduces the live Bourgogne placement list in order", () => {
    // The five rows the live database returns for france.bourgogne
    // (sort_order 10/20/30/40/50) — the regression case for §8 check 4.
    const rows = archetypeRows([
      { sort_order: 10, wine_archetypes: { id: "b1", name: "A typical Chablis", colour: "WHITE", style: "STILL" } },
      { sort_order: 20, wine_archetypes: { id: "b2", name: "A typical Côte de Nuits", colour: "RED", style: "STILL" } },
      { sort_order: 30, wine_archetypes: { id: "b3", name: "A typical Côte de Beaune", colour: "WHITE", style: "STILL" } },
      { sort_order: 40, wine_archetypes: { id: "b4", name: "A typical Côte Chalonnaise", colour: "RED", style: "STILL" } },
      { sort_order: 50, wine_archetypes: { id: "b5", name: "A typical Mâconnais", colour: "WHITE", style: "STILL" } },
    ]);
    expect(rows.map((r) => r.name)).toEqual([
      "A typical Chablis",
      "A typical Côte de Nuits",
      "A typical Côte de Beaune",
      "A typical Côte Chalonnaise",
      "A typical Mâconnais",
    ]);
  });
});
