import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTRIBUTION,
  attributionKeyFor,
  attributionDisplayMap,
  buildManifest,
  featureCollection,
  labelFeature,
  lonLatToTile,
  placeFeature,
  releaseObjectPath,
  releaseVersion,
  sha256hex,
  storagePublicUrl,
  WORLD_KEYS,
} from "./lib.mjs";

const EXPORT_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  canonical_key: "france.bordeaux",
  name: "Bordeaux",
  kind: "REGION",
  display_tier: 1,
  primary_parent_id: "22222222-2222-2222-2222-222222222222",
  min_zoom: 4,
  label_min_zoom: 4,
  sort_order: 0,
  has_children: true,
  source_namespace: "IGN_INAO_AOC_VITICOLES_LEGACY",
  geometry: '{"type":"MultiPolygon","coordinates":[[[[0,0],[1,0],[1,1],[0,0]]]]}',
  label_point: '{"type":"Point","coordinates":[-0.58,44.84]}',
};

test("releaseVersion formats a UTC compact timestamp", () => {
  assert.equal(releaseVersion(new Date("2026-07-20T14:00:00.000Z")), "20260720T140000Z");
});

test("sha256hex returns uppercase hex", () => {
  assert.equal(
    sha256hex(Buffer.from("abc")),
    "BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD",
  );
});

test("storage paths and URLs are stable", () => {
  assert.equal(
    releaseObjectPath("20260720T140000Z", "world.pmtiles"),
    "tiles/releases/20260720T140000Z/world.pmtiles",
  );
  assert.match(
    storagePublicUrl("tiles/manifest.json"),
    /^https:\/\/.+\/storage\/v1\/object\/public\/wine-map-tiles\/tiles\/manifest\.json$/,
  );
});

test("lonLatToTile matches known slippy-map tiles", () => {
  assert.deepEqual(lonLatToTile(0, 0, 0), { z: 0, x: 0, y: 0 });
  assert.deepEqual(lonLatToTile(-0.58, 44.84, 4), { z: 4, x: 7, y: 5 });
  assert.deepEqual(lonLatToTile(2.35, 48.85, 7), { z: 7, x: 64, y: 44 });
});

test("placeFeature maps an export row to the exact tile properties", () => {
  const feature = placeFeature(EXPORT_ROW);
  assert.deepEqual(feature.properties, {
    id: EXPORT_ROW.id,
    key: "france.bordeaux",
    name: "Bordeaux",
    kind: "REGION",
    tier: 1,
    parent_id: EXPORT_ROW.primary_parent_id,
    has_children: true,
    rank: 0,
    attribution: "ign-inao",
    min_zoom: 4,
    label_min_zoom: 4,
  });
  assert.deepEqual(feature.tippecanoe, { minzoom: 4 });
  assert.equal(feature.geometry.type, "MultiPolygon");
});

test("labelFeature uses the label point and label_min_zoom", () => {
  const feature = labelFeature(EXPORT_ROW);
  assert.deepEqual(feature.geometry, { type: "Point", coordinates: [-0.58, 44.84] });
  assert.deepEqual(feature.tippecanoe, { minzoom: 4 });
  assert.equal(feature.properties.id, EXPORT_ROW.id);
});

test("fractional min_zoom floors and never goes below zero", () => {
  const france = placeFeature({ ...EXPORT_ROW, min_zoom: 1.5 });
  assert.equal(france.tippecanoe.minzoom, 1);
  assert.equal(france.properties.min_zoom, 1.5);
});

test("attribution keys reject unknown namespaces", () => {
  assert.equal(attributionKeyFor("BLINDR_MANUAL"), "blindr");
  assert.throws(() => attributionKeyFor("SOMETHING_ELSE"), /Unknown source namespace/);
  assert.deepEqual(attributionDisplayMap(), {
    blindr: ATTRIBUTION.BLINDR_MANUAL.text,
    "ign-inao": ATTRIBUTION.IGN_INAO_AOC_VITICOLES_LEGACY.text,
    "natural-earth": ATTRIBUTION.NATURAL_EARTH.text,
  });
});

test("buildManifest emits the schema_version 1 contract", () => {
  const archive = { url: "https://x/world.pmtiles", checksum_sha256: "A".repeat(64), bytes: 10 };
  const manifest = buildManifest({
    version: "20260720T140000Z",
    generatedAt: "2026-07-20T14:00:00.000Z",
    world: archive,
    france: archive,
    attribution: attributionDisplayMap(),
  });
  assert.deepEqual(manifest, {
    schema_version: 1,
    release_version: "20260720T140000Z",
    generated_at: "2026-07-20T14:00:00.000Z",
    world: archive,
    shards: { france: archive },
    attribution: attributionDisplayMap(),
  });
});

test("featureCollection wraps features", () => {
  assert.deepEqual(featureCollection([]), { type: "FeatureCollection", features: [] });
});

test("WORLD_KEYS pins the world archive contents", () => {
  assert.deepEqual(WORLD_KEYS, ["france", "france.bordeaux"]);
});

test("tippecanoeArgs pins zoom windows and layers per archive", async () => {
  const { tippecanoeArgs } = await import("./lib.mjs");
  assert.deepEqual(tippecanoeArgs("world"), [
    "-o", "world.pmtiles", "--force", "-Z0", "-z7", "-r1",
    "--no-progress-indicator",
    "-L", "places:world-places.geojson", "-L", "labels:world-labels.geojson",
  ]);
  assert.deepEqual(tippecanoeArgs("france"), [
    "-o", "france.pmtiles", "--force", "-Z4", "-z12", "-r1",
    "--no-progress-indicator",
    "-L", "places:france-places.geojson", "-L", "labels:france-labels.geojson",
  ]);
  assert.throws(() => tippecanoeArgs("mars"), /Unknown build target/);
});

test("expectedIdSets splits ids by archive with Bordeaux in both", async () => {
  const { expectedIdSets } = await import("./lib.mjs");
  const release = {
    expected: [
      { id: "a", archive: "world" },
      { id: "b", archive: "both" },
      { id: "c", archive: "france" },
    ],
  };
  const sets = expectedIdSets(release);
  assert.deepEqual([...sets.world].sort(), ["a", "b"]);
  assert.deepEqual([...sets.france].sort(), ["b", "c"]);
});

test("tile decode dependencies expose the expected API", async () => {
  const { PbfReader } = await import("pbf");
  const { VectorTile } = await import("@mapbox/vector-tile");
  // .layers is a null-prototype object; spread it so strict deepEqual
  // compares contents rather than prototypes.
  assert.deepEqual({ ...new VectorTile(new PbfReader(new Uint8Array())).layers }, {});
  const { decodeTileFeatures } = await import("./lib.mjs");
  assert.deepEqual(await decodeTileFeatures(new ArrayBuffer(0)), {});
});
