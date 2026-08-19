// Unit tests for the auto-promote GUARDS — the only safety net for Spain's
// waived shape review (plan risk #2: "a plausible-but-wrong outline can ship
// with no human catch"). The live path is exercised by `run-spain-dos.mjs
// --selftest`; these prove, offline and deterministically, that the guards
// actually REJECT the bad geometry a wrong membership list would produce.
//
// Importing the driver must not connect to anything — main() is gated behind a
// direct-invocation check, so this only pulls in the pure guard functions.
import assert from "node:assert/strict";
import test from "node:test";
import { assertGuards, WINDOW, AREA_BAND } from "./run-spain-dos.mjs";

// A clean regional report: valid, non-empty, label-covered, bbox inside the
// peninsula+Balearics window, area mid-band. Each test perturbs one field.
const goodReport = (over = {}) => ({
  geojson: '{"type":"MultiPolygon","coordinates":[[[[-3,42],[-1.5,42],[-1.5,43],[-3,42]]]]}',
  is_empty: false,
  valid: true,
  covers_label: true,
  minx: -3.0,
  miny: 42.0,
  maxx: -1.5,
  maxy: 43.0,
  area: 0.5,
  npoints: 300,
  nparts: 1,
  ...over,
});
const guard = (report, opts = {}) =>
  assertGuards(report, { label: "test.do", level: "regional", memberCount: 10, ...opts });

test("the window and bands are the ones the country base pins", () => {
  assert.deepEqual(WINDOW, { minLon: -10, minLat: 35, maxLon: 5, maxLat: 44 });
  assert.ok(AREA_BAND.communal[1] < AREA_BAND.regional[1], "communal band tighter than regional");
});

test("a clean regional report passes", () => {
  assert.doesNotThrow(() => guard(goodReport()));
});

test("a clean communal report passes in the communal band", () => {
  assert.doesNotThrow(() =>
    guard(goodReport({ area: 0.02, minx: 0.7, miny: 41.2, maxx: 0.9, maxy: 41.4 }), {
      level: "communal",
    }),
  );
});

test("rejects a bbox west of the window (a Canary municipio slipped in)", () => {
  // Tenerife sits near lon -16, well outside the peninsula+Balearics window.
  assert.throws(
    () => guard(goodReport({ minx: -16.5, maxx: -16.1, miny: 28.0, maxy: 28.6 })),
    /escapes the Spain window/,
  );
});

test("rejects a bbox that runs north past the window", () => {
  assert.throws(() => guard(goodReport({ maxy: 44.6 })), /escapes the Spain window/);
});

test("rejects a regional area below its band (too few/scattered municipios)", () => {
  assert.throws(() => guard(goodReport({ area: 0.004 })), /outside the regional band/);
});

test("rejects a communal area above its band (a wrong-province municipio blew it up)", () => {
  assert.throws(
    () => guard(goodReport({ area: 1.0 }), { level: "communal" }),
    /outside the communal band/,
  );
});

test("rejects empty geometry", () => {
  assert.throws(() => guard(goodReport({ is_empty: true })), /empty/);
});

test("rejects invalid geometry", () => {
  assert.throws(() => guard(goodReport({ valid: false })), /invalid/);
});

test("rejects a label point the geometry does not cover", () => {
  assert.throws(() => guard(goodReport({ covers_label: false })), /does not cover/);
});

test("rejects a DO with no member municipios", () => {
  assert.throws(() => guard(goodReport(), { memberCount: 0 }), /no member municipios/);
});

test("an unknown level falls back to the regional band rather than passing everything", () => {
  // level "cru" isn't in AREA_BAND -> regional band applies; 0.004 is below it.
  assert.throws(() => guard(goodReport({ area: 0.004 }), { level: "cru" }), /outside the cru band/);
});
