import assert from "node:assert/strict";
import test from "node:test";
import { fold, shortlistFromRows } from "./shortlist-mirror.mjs";

const places = [
  { id: "us", name: "United States", kind: "COUNTRY", primary_parent_id: null },
  { id: "ca", name: "California", kind: "REGION", primary_parent_id: "us" },
  { id: "nc", name: "North Coast", kind: "SUBREGION", primary_parent_id: "ca" },
  { id: "cc", name: "Central Coast", kind: "SUBREGION", primary_parent_id: "ca" },
];
const grapeName = new Map([["cs", "Cabernet Sauvignon"], ["ch", "Chardonnay"], ["zi", "Zinfandel"], ["pn", "Pinot Noir"]]);
const links = [
  { grape_id: "cs", role: "PRINCIPAL", wine_place_id: "ca" },
  { grape_id: "cs", role: "PRINCIPAL", wine_place_id: "nc" },
  { grape_id: "cs", role: "PRINCIPAL", wine_place_id: "cc" },
  { grape_id: "ch", role: "PRINCIPAL", wine_place_id: "nc" },
  { grape_id: "ch", role: "PRINCIPAL", wine_place_id: "cc" },
  { grape_id: "zi", role: "ACCESSORY", wine_place_id: "nc" },
];
const regionGrapes = [
  { grape_id: "zi", role: "PRINCIPAL" }, { grape_id: "cs", role: "PRINCIPAL" }, { grape_id: "ch", role: "ACCESSORY" },
];
const base = { regionName: "California", countryName: "United States", places, links, regionGrapes, grapeName };

test("the map's links, PRINCIPAL by count before ACCESSORY", () => {
  assert.deepEqual(shortlistFromRows(base), {
    source: "map", placeName: "California", grapes: ["Cabernet Sauvignon", "Chardonnay", "Zinfandel"],
  });
});

test("no links: region_grapes, PRINCIPAL first, then name", () => {
  assert.deepEqual(shortlistFromRows({ ...base, links: [] }), {
    source: "region_grapes", placeName: "California", grapes: ["Cabernet Sauvignon", "Zinfandel", "Chardonnay"],
  });
  assert.deepEqual(shortlistFromRows({ ...base, links: [], regionGrapes: [] }), { source: "none", placeName: null, grapes: [] });
});

test("a Washington place under Australia is not matched", () => {
  const aus = [
    { id: "au", name: "Australia", kind: "COUNTRY", primary_parent_id: null },
    { id: "wa", name: "Washington", kind: "REGION", primary_parent_id: "au" },
  ];
  const got = shortlistFromRows({
    ...base, regionName: "Washington", places: aus,
    links: [{ grape_id: "pn", role: "PRINCIPAL", wine_place_id: "wa" }],
    regionGrapes: [{ grape_id: "cs", role: "PRINCIPAL" }],
  });
  assert.equal(got.source, "region_grapes");
});

test("a COUNTRY place named like the region is never matched", () => {
  const got = shortlistFromRows({
    ...base, regionName: "United States",
    links: [{ grape_id: "pn", role: "PRINCIPAL", wine_place_id: "us" }],
  });
  assert.equal(got.source, "region_grapes");
});

test("a region linked through regions.wine_place_id uses that place; ties break by name", () => {
  const got = shortlistFromRows({
    ...base, regionName: "Somewhere else", linkedPlaceId: "nc",
    links: [
      { grape_id: "zi", role: "PRINCIPAL", wine_place_id: "nc" },
      { grape_id: "ch", role: "PRINCIPAL", wine_place_id: "nc" },
    ],
  });
  assert.deepEqual(got, { source: "map", placeName: "North Coast", grapes: ["Chardonnay", "Zinfandel"] });
});

test("fold matches the app: accents, case and punctuation", () => {
  assert.equal(fold("Côte-Rôtie"), "cote rotie");
  assert.equal(fold("New  York"), "new york");
});
