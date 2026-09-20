import { describe, expect, it } from "vitest";
import { placeStyleRows } from "./place-style-rows";

describe("placeStyleRows", () => {
  it("passes a colour through and defaults a missing one to null", () => {
    expect(
      placeStyleRows([
        { style: "SPARKLING", colour: "WHITE", note: null, sort_order: 0 },
        { style: "RED", colour: null, note: null, sort_order: 1 },
        { style: "WHITE", sort_order: 2 },
      ]),
    ).toEqual([
      { style: "SPARKLING", colour: "WHITE", note: null },
      { style: "RED", colour: null, note: null },
      { style: "WHITE", colour: null, note: null },
    ]);
  });

  it("passes a note through and defaults a missing one to null", () => {
    expect(
      placeStyleRows([
        { style: "RED", colour: null, note: "Mondeuse, Gamay, Pinot Noir", sort_order: 0 },
        { style: "ROSE", colour: null, sort_order: 1 },
      ]),
    ).toEqual([
      { style: "RED", colour: null, note: "Mondeuse, Gamay, Pinot Noir" },
      { style: "ROSE", colour: null, note: null },
    ]);
  });

  it("preserves the server's order and never sorts", () => {
    expect(
      placeStyleRows([
        { style: "ROSE", sort_order: 9 },
        { style: "WHITE", sort_order: 1 },
      ]).map((r) => r.style),
    ).toEqual(["ROSE", "WHITE"]);
  });

  it("reproduces the live france.savoie rows", () => {
    expect(
      placeStyleRows([
        { style: "WHITE", colour: null, note: null, sort_order: 0 },
        { style: "RED", colour: null, note: "Mondeuse, Gamay, Pinot Noir", sort_order: 1 },
        { style: "ROSE", colour: null, note: null, sort_order: 2 },
      ]),
    ).toEqual([
      { style: "WHITE", colour: null, note: null },
      { style: "RED", colour: null, note: "Mondeuse, Gamay, Pinot Noir" },
      { style: "ROSE", colour: null, note: null },
    ]);
  });

  it("returns [] for null, undefined and a non-array, and drops a row with no style", () => {
    expect(placeStyleRows(null)).toEqual([]);
    expect(placeStyleRows(undefined)).toEqual([]);
    expect(placeStyleRows({ style: "RED" })).toEqual([]);
    expect(placeStyleRows([{ colour: "WHITE" }, null, "x"])).toEqual([]);
  });
});
