import assert from "node:assert/strict";
import test from "node:test";
import { LOWER48_BOX, lower48, pointInPolygons, polygonsOf, roundPolygon } from "./usa-ne-lib.mjs";

const box = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const US = {
  type: "MultiPolygon",
  coordinates: [
    [box(-120, 30, -80, 45), box(-90, 40, -85, 43)], // mainland with a lake hole
    [box(-160, 60, -150, 65)], // Alaska
    [box(-158, 20, -155, 22)], // Hawaii
    [box(-119.9, 33.9, -119.5, 34.1)], // Channel Islands
    [box(-123.2, 48.4, -122.9, 48.7)], // San Juan Islands
    [box(-74, 40.5, -72, 41)], // Long Island
    [box(-130, 50, -120, 55)], // straddles the box edge
  ],
};

test("the lower-48 filter keeps the mainland and its islands, and drops Alaska, Hawaii and a straddler", () => {
  assert.deepEqual(LOWER48_BOX, { minLon: -125, minLat: 24, maxLon: -66.5, maxLat: 49.5 });
  const kept = lower48(US);
  assert.equal(kept.length, 4);
  assert.equal(pointInPolygons([-100, 35], kept), true, "mainland");
  assert.equal(pointInPolygons([-87.5, 41.5], kept), false, "the lake hole stays a hole");
  assert.equal(pointInPolygons([-119.7, 34.0], kept), true, "Channel Islands");
  assert.equal(pointInPolygons([-123.05, 48.55], kept), true, "San Juan Islands");
  assert.equal(pointInPolygons([-73, 40.75], kept), true, "Long Island");
  assert.equal(pointInPolygons([-155, 62], kept), false, "Alaska");
  assert.equal(pointInPolygons([-157, 21], kept), false, "Hawaii");
});

test("polygonsOf and roundPolygon", () => {
  assert.equal(polygonsOf({ type: "Polygon", coordinates: [box(0, 0, 1, 1)] }).length, 1);
  assert.throws(() => polygonsOf({ type: "Point", coordinates: [0, 0] }), /unexpected geometry/);
  assert.deepEqual(roundPolygon([[[0.123456, 0], [1, 0], [1, 1], [0.123456, 0]]], 4)[0][0], [0.1235, 0]);
  assert.equal(roundPolygon([[[0, 0], [0.00001, 0], [0, 0.00001], [0, 0]]], 4), null);
});
