import assert from "node:assert/strict";
import test from "node:test";
import {
  foldAvaName, isCurrent, normalizeCfr, placeSlug, simplifyGeometry, splitList, stateCodes, trimProperties,
} from "./usa-ava-lib.mjs";

test("splitList reads UC Davis pipe lists", () => {
  assert.deepEqual(splitList("north_coast|northern_sonoma"), ["north_coast", "northern_sonoma"]);
  assert.deepEqual(splitList(" a | b ||"), ["a", "b"]);
  assert.deepEqual(splitList(""), []);
  assert.deepEqual(splitList(null), []);
});

test("stateCodes takes codes or names, and throws on an unknown one", () => {
  assert.deepEqual(stateCodes("WA|OR"), ["OR", "WA"]);
  assert.deepEqual(stateCodes("Oregon|Idaho", { Oregon: "OR", Idaho: "ID" }), ["ID", "OR"]);
  assert.throws(() => stateCodes("Atlantis"), /unknown state "Atlantis"/);
});

test("isCurrent: no valid_end, or an empty one", () => {
  assert.equal(isCurrent({}), true);
  assert.equal(isCurrent({ valid_end: null }), true);
  assert.equal(isCurrent({ valid_end: " " }), true);
  assert.equal(isCurrent({ valid_end: "2021-03-01" }), false);
});

test("trimProperties keeps exactly the nine spec properties", () => {
  assert.deepEqual(Object.keys(trimProperties({ ava_id: "x", name: "X", petitioner: "p", lcsh: 1 })), [
    "ava_id", "name", "aka", "state", "county", "within", "contains", "cfr_index", "valid_start",
  ]);
});

test("normalizeCfr", () => {
  assert.equal(normalizeCfr("9.150"), "9.150");
  assert.equal(normalizeCfr("27 CFR 9.23"), "9.23");
  assert.equal(normalizeCfr("§ 9.279"), "9.279");
  assert.equal(normalizeCfr(""), null);
  assert.equal(normalizeCfr(null), null);
});

test("foldAvaName ignores case, accents, punctuation and a trailing AVA", () => {
  assert.equal(foldAvaName("Mt. Pisgah Polk County Oregon AVA"), foldAvaName("Mt. Pisgah, Polk County, Oregon"));
  assert.equal(foldAvaName("The Hamptons (Long Island) AVA"), foldAvaName("The Hamptons, Long Island"));
  assert.equal(foldAvaName("Fort Ross-Seaview"), "fort ross seaview");
  assert.notEqual(foldAvaName("Contra Costa County AVA"), foldAvaName("Contra Costa"));
});

test("placeSlug follows the spec's examples", () => {
  assert.equal(placeSlug("Sta. Rita Hills"), "sta-rita-hills");
  assert.equal(placeSlug("Mt. Veeder"), "mt-veeder");
  assert.equal(placeSlug("Mt. Pisgah, Polk County, Oregon"), "mt-pisgah-polk-county-oregon");
  assert.equal(placeSlug("Oak Knoll District of Napa Valley AVA"), "oak-knoll-district-of-napa-valley");
  assert.equal(placeSlug("Fort Ross-Seaview"), "fort-ross-seaview");
  assert.equal(placeSlug("Paso Robles Estrella District"), "paso-robles-estrella-district");
});

test("simplifyGeometry: DP per ring, rounding, holes kept, collapsed polygons dropped", () => {
  const square = [[0, 0], [0.5, 0.00001], [1, 0], [1, 1], [0, 1], [0, 0]];
  const hole = [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.4], [0.2, 0.2]];
  // Rounds to one point at 5 decimals, so its outer ring collapses.
  const speck = [[5, 5], [5.000001, 5], [5.000001, 5.000001], [5, 5]];
  const out = simplifyGeometry({ type: "MultiPolygon", coordinates: [[square, hole], [speck]] }, 0.0001, 5);
  assert.equal(out.type, "MultiPolygon");
  assert.equal(out.coordinates.length, 1, "the speck collapses and is dropped");
  assert.deepEqual(out.coordinates[0][0], [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
  assert.equal(out.coordinates[0].length, 2, "the hole survives");
  const poly = simplifyGeometry({ type: "Polygon", coordinates: [[[0, 0], [1.123456789, 0], [1, 1], [0, 0]]] });
  assert.deepEqual(poly.coordinates[0][0][1], [1.12346, 0]);
  assert.throws(() => simplifyGeometry({ type: "Polygon", coordinates: [speck] }), /collapsed/);
  assert.throws(() => simplifyGeometry({ type: "LineString", coordinates: [] }), /unexpected geometry/);
});
