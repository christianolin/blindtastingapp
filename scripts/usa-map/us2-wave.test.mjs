import assert from "node:assert/strict";
import test from "node:test";
import { loadTrees, us2Wave, depthOf, US2_VERSIONS, US2_FILES, US2_ROLLBACK_FILES } from "./us2-wave.mjs";

const KEYS = [
  "united-states",
  "united-states.california",
  "united-states.california.central-coast",
  "united-states.california.central-valley",
  "united-states.california.north-coast",
  "united-states.california.sierra-foothills",
  "united-states.california.south-coast",
  "united-states.new-york",
  "united-states.new-york.finger-lakes",
  "united-states.new-york.long-island",
  "united-states.oregon",
  "united-states.oregon.southern-oregon",
  "united-states.oregon.willamette-valley",
  "united-states.washington",
  "united-states.washington.columbia-valley",
  "united-states.washington.puget-sound",
];

test("US-2 is the country, the four states, their umbrella AVAs and Central Valley", async () => {
  const w = us2Wave(await loadTrees());
  assert.deepEqual(w.places.map((p) => p.key), KEYS);
  assert.deepEqual(w.places.map((p) => p.kind).reduce((a, k) => ({ ...a, [k]: (a[k] ?? 0) + 1 }), {}),
    { COUNTRY: 1, REGION: 4, SUBREGION: 11 });
  assert.deepEqual(w.states.map((s) => s.code), ["CA", "NY", "OR", "WA"]);
});

test("zooms and tiers follow spec §4", async () => {
  const w = us2Wave(await loadTrees());
  for (const p of w.places) {
    const want = p.kind === "COUNTRY" ? [0, 1.5, 2] : p.kind === "REGION" ? [1, 4, 4] : [2, 5, 5];
    assert.deepEqual([p.display_tier, p.min_zoom, p.label_min_zoom], want, p.key);
    assert.ok(p.label_min_zoom <= 10, `${p.key}: D16`);
    assert.equal(depthOf(p.key), p.kind === "COUNTRY" ? 0 : p.kind === "REGION" ? 1 : 2, p.key);
  }
  assert.equal(w.places[0].sort_order, 140);
});

test("classification: umbrella AVAs are AVA/regional, Central Valley and the states are not appellations", async () => {
  const w = us2Wave(await loadTrees());
  for (const p of w.places) {
    if (p.kind === "SUBREGION" && !p.navigation_node) {
      assert.deepEqual([p.is_appellation, p.appellation_system, p.appellation_level], [true, "AVA", "regional"], p.key);
    } else {
      assert.deepEqual([p.is_appellation, p.appellation_system, p.appellation_level], [false, null, null], p.key);
    }
  }
});

test("the one edge, the outline set (D15), Central Valley's members (D25)", async () => {
  const w = us2Wave(await loadTrees());
  assert.deepEqual(w.edges, [{
    type: "ALTERNATE_PARENT", source_key: "united-states.washington.columbia-valley",
    target_key: "united-states.oregon", basis: "state_share", share: 0.224,
  }]);
  assert.deepEqual(w.outlineKeys, [
    "united-states.california.central-coast", "united-states.california.central-valley",
    "united-states.california.north-coast", "united-states.california.sierra-foothills",
    "united-states.california.south-coast", "united-states.new-york.finger-lakes",
    "united-states.oregon.southern-oregon", "united-states.oregon.willamette-valley",
    "united-states.washington.columbia-valley", "united-states.washington.puget-sound",
  ]);
  assert.ok(!w.outlineKeys.includes("united-states.new-york.long-island"), "Long Island (~3,147 km²) keeps its fill");
  assert.deepEqual(w.derived, [{
    key: "united-states.california.central-valley", state: "CA",
    members: ["capay_valley", "clarksburg", "diablo_grande", "dunnigan_hills", "lodi", "madera",
      "paulsell_valley", "river_junction", "salado_creek", "tracy_hills", "winters_highlands"],
  }]);
  assert.equal(w.ucd.length, 10);
  const cv = w.ucd.find((u) => u.ucd_ava_id === "columbia_valley");
  assert.deepEqual([cv.state, cv.artifact, cv.legal_states], ["WA", "data/wine-map/usa-washington-ava.geojson", ["OR", "WA"]]);
});

test("refuses reports it cannot place", async () => {
  const trees = await loadTrees();
  assert.throws(() => us2Wave({ ...trees, CA: undefined }), /no tree report for CA/);
  const bad = structuredClone(trees);
  bad.NY.places.find((p) => p.kind === "COUNTRY").sort_order = 999;
  assert.throws(() => us2Wave(bad), /disagree on the country row/);
  const orphan = structuredClone(trees);
  orphan.OR.places.push({ ...orphan.OR.places.find((p) => p.kind === "SUBREGION"), key: "united-states.oregon.x.y", parent_key: "united-states.oregon.x" });
  assert.throws(() => us2Wave(orphan), /is in no wave slot/);
});

test("versions end in 4747 and file names follow them", () => {
  for (const v of Object.values(US2_VERSIONS)) assert.match(v, /^\d{10}4747$/);
  assert.equal(US2_FILES.catalog, "supabase/migrations/20260930084747_usa_us2_catalog.sql");
  assert.equal(US2_FILES.promote, "supabase/migrations/20260930104747_usa_us2_promote.sql");
  assert.equal(US2_ROLLBACK_FILES.unpublish, "scripts/usa-map/20260930144747_usa_us2_unpublish.sql");
});
