import assert from "node:assert/strict";
import test from "node:test";
import { EXPORT_SQL_COPY, exportSqlFromSource, previewRelease } from "./export-preview.mjs";

test("the copy of EXPORT_SQL is verbatim", async () => {
  assert.equal(EXPORT_SQL_COPY, await exportSqlFromSource());
});

const sq = [[[[-120, 37], [-119, 37], [-119, 38], [-120, 38], [-120, 37]]]];
const row = (over) => ({
  id: over.canonical_key, name: "x", kind: "SUBREGION", display_tier: 2, primary_parent_id: null, has_children: false,
  sort_order: 0, source_namespace: "UCD_TTB_AVA", min_zoom: 5, label_min_zoom: 5, area: 1, level: null,
  classification: null, display: null, geometry: JSON.stringify({ type: "MultiPolygon", coordinates: sq }),
  label_lon: -119.5, label_lat: 37.5, ...over,
});
const rows = [
  row({ canonical_key: "france", kind: "COUNTRY", display_tier: 0, source_namespace: "NATURAL_EARTH", label_lon: 2.3, label_lat: 46.6 }),
  row({ canonical_key: "united-states", kind: "COUNTRY", display_tier: 0, source_namespace: "NATURAL_EARTH", min_zoom: 1.5, label_min_zoom: 2, label_lon: -98, label_lat: 39 }),
  row({ canonical_key: "united-states.california", kind: "REGION", display_tier: 1, source_namespace: "NATURAL_EARTH", min_zoom: 4, label_min_zoom: 4 }),
  row({ canonical_key: "united-states.california.north-coast", display: "outline" }),
  row({ canonical_key: "united-states.new-york", kind: "REGION", display_tier: 1, source_namespace: "NATURAL_EARTH", min_zoom: 4, label_min_zoom: 4, label_lon: -75, label_lat: 43 }),
  row({ canonical_key: "united-states.new-york.long-island", label_lon: -72.8, label_lat: 40.9 }),
];

test("US rows: world gets country and states, shards get z7, outline only where display says so", () => {
  const p = previewRelease(rows);
  assert.deepEqual(p.world, ["united-states", "united-states.california", "united-states.new-york"]);
  assert.deepEqual(Object.keys(p.shards).sort(), ["california", "new-york"]);
  assert.equal(p.shards.california.max_zoom, 7);
  assert.deepEqual(p.shards.california.keys, ["united-states.california", "united-states.california.north-coast"]);
  assert.ok(p.shards.california.bytes > 0);
  assert.deepEqual(p.outline, ["united-states.california.north-coast"]);
  assert.deepEqual(p.outside, []);
});

test("a Paris label on a united-states key is caught", () => {
  const bad = rows.map((r) => (r.canonical_key === "united-states.new-york.long-island" ? { ...r, label_lon: 2.35, label_lat: 48.85 } : r));
  assert.deepEqual(previewRelease(bad).outside, ["united-states.new-york.long-island"]);
});

test("a state's label moves to its largest component, as export.mjs does", () => {
  const moved = rows.map((r) => (r.canonical_key === "united-states.new-york"
    ? { ...r, component_labels: [[2.35, 48.85, 1], [-75, 43, 0.1]] } : r));
  assert.deepEqual(previewRelease(moved).outside, ["united-states.new-york"]);
});

test("a US row without its country outline fails, as the export would", () => {
  assert.throws(() => previewRelease(rows.filter((r) => r.canonical_key !== "united-states")), /no united-states country outline/);
});
