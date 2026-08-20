import assert from "node:assert/strict";
import test from "node:test";
import {
  ATTRIBUTION,
  attributionKeyFor,
  attributionDisplayMap,
  buildManifest,
  featureCollection,
  labelFeatures,
  lonLatToTile,
  placeFeature,
  releaseObjectPath,
  releaseVersion,
  sha256hex,
  storagePublicUrl,
  archiveForPlace,
  assertMultiCountryArchive,
  shardKeyFor,
} from "./lib.mjs";

const EXPORT_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  canonical_key: "france.bordeaux",
  name: "Bordeaux",
  kind: "REGION",
  display_tier: 1,
  level: "regional",
  primary_parent_id: "22222222-2222-2222-2222-222222222222",
  min_zoom: 4,
  label_min_zoom: 4,
  sort_order: 0,
  has_children: true,
  area: "0.042",
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
    level: "regional",
    classification: "regional",
    parent_id: EXPORT_ROW.primary_parent_id,
    has_children: true,
    rank: 0,
    region: "bordeaux",
    attribution: "ign-inao",
    min_zoom: 4,
    label_min_zoom: 4,
    area: 0.042,
    group: null,
    group_name: null,
    area_key: null,
    area_name: null,
  });
  assert.deepEqual(feature.tippecanoe, { minzoom: 4 });
  assert.equal(feature.geometry.type, "MultiPolygon");
});

test("placeFeature carries the district group when export computed one", () => {
  const feature = placeFeature({
    ...EXPORT_ROW,
    canonical_key: "france.bordeaux.medoc.haut-medoc.margaux",
    group: "medoc",
    group_name: "Médoc",
  });
  assert.equal(feature.properties.group, "medoc");
  assert.equal(feature.properties.group_name, "Médoc");
});

test("labelFeatures fall back to the canonical label point", () => {
  const features = labelFeatures(EXPORT_ROW);
  assert.equal(features.length, 1);
  assert.deepEqual(features[0].geometry, { type: "Point", coordinates: [-0.58, 44.84] });
  assert.deepEqual(features[0].tippecanoe, { minzoom: 4 });
  assert.equal(features[0].properties.id, EXPORT_ROW.id);
  assert.equal(features[0].properties.label_rank, 1);
});

test("labelFeatures rank islands by area and zoom-gate the minor ones", () => {
  const features = labelFeatures({
    ...EXPORT_ROW,
    component_labels: [
      [4.7, 47.9, 0.5],
      [3.6, 47.7, 0.1],
      [4.8, 46.8, 0.005],
    ],
  });
  // The 0.005 sliver is under MIN_LABEL_COMPONENT_SHARE of the footprint.
  assert.equal(features.length, 2);
  assert.equal(features[0].properties.label_rank, 1);
  assert.deepEqual(features[0].geometry, { type: "Point", coordinates: [4.7, 47.9] });
  assert.deepEqual(features[0].tippecanoe, { minzoom: 4 });
  assert.equal(features[1].properties.label_rank, 2);
  assert.deepEqual(features[1].tippecanoe, { minzoom: 9 });
  assert.ok(features.every((f) => f.properties.id === EXPORT_ROW.id));
});

test("labelFeatures keep bare fixture points, ranked by order", () => {
  const features = labelFeatures({
    ...EXPORT_ROW,
    component_labels: [[4.7, 47.9], [3.6, 47.7], [4.8, 46.8]],
  });
  assert.equal(features.length, 3);
  assert.deepEqual(features[1].geometry, { type: "Point", coordinates: [3.6, 47.7] });
  assert.deepEqual(
    features.map((f) => f.properties.label_rank),
    [1, 2, 3],
  );
  assert.deepEqual(
    features.map((f) => f.tippecanoe.minzoom),
    [4, 9, 9],
  );
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
    istat: ATTRIBUTION.ISTAT_CONFINI.text,
    piemonte: ATTRIBUTION.PIEMONTE_DOC_DOCG.text,
    toscana: ATTRIBUTION.TOSCANA_DOC_DOCG.text,
    "ign-cnig-spain": ATTRIBUTION.IGN_CNIG_SPAIN.text,
    "trentino-alto-adige": ATTRIBUTION.ALTOADIGE_DOC_IGT.text,
    veneto: ATTRIBUTION.VENETO_DOC_DOCG.text,
    sicilia: ATTRIBUTION.SICILY_COMUNI.text,
    lombardia: ATTRIBUTION.LOMBARDIA_COMUNI.text,
    friuli: ATTRIBUTION.FRIULI_COMUNI.text,
    bkg: ATTRIBUTION.BKG_VG250.text,
    "lwk-rlp": ATTRIBUTION.LWK_RLP_WEINLAGEN.text,
  });
});

test("the German namespaces resolve to their own credits", () => {
  assert.equal(attributionKeyFor("BKG_VG250"), "bkg");
  assert.equal(attributionKeyFor("LWK_RLP_WEINLAGEN"), "lwk-rlp");
  assert.match(ATTRIBUTION.BKG_VG250.text, /BKG/);
  assert.match(ATTRIBUTION.LWK_RLP_WEINLAGEN.text, /Weinbergsrolle/);
});

test("the Spain IGN/CNIG namespace resolves to its own credit", () => {
  assert.equal(attributionKeyFor("IGN_CNIG_SPAIN"), "ign-cnig-spain");
  assert.match(ATTRIBUTION.IGN_CNIG_SPAIN.text, /IGN\/CNIG Espa/);
});

test("buildManifest emits the schema_version 2 contract", () => {
  const world = { url: "https://x/world.pmtiles", checksum_sha256: "A".repeat(64), bytes: 10 };
  const shard = {
    url: "https://x/bourgogne.pmtiles", checksum_sha256: "B".repeat(64), bytes: 20,
    bbox: [3, 46, 5, 48], min_zoom: 4, max_zoom: 16,
  };
  const manifest = buildManifest({
    version: "20260720T140000Z",
    generatedAt: "2026-07-20T14:00:00.000Z",
    world,
    shards: { bourgogne: shard },
    attribution: attributionDisplayMap(),
  });
  assert.deepEqual(manifest, {
    schema_version: 2,
    release_version: "20260720T140000Z",
    generated_at: "2026-07-20T14:00:00.000Z",
    world,
    shards: { bourgogne: shard },
    attribution: attributionDisplayMap(),
  });
});

test("featureCollection wraps features", () => {
  assert.deepEqual(featureCollection([]), { type: "FeatureCollection", features: [] });
});

test("archiveForPlace routes by tier and region segment", () => {
  assert.deepEqual(archiveForPlace({ display_tier: 0, canonical_key: "france" }), {
    world: true, shard: null,
  });
  assert.deepEqual(archiveForPlace({ display_tier: 1, canonical_key: "france.bourgogne" }), {
    world: true, shard: "bourgogne",
  });
  assert.deepEqual(
    archiveForPlace({ display_tier: 3, canonical_key: "france.bourgogne.cote-de-nuits.vosne-romanee" }),
    { world: false, shard: "bourgogne" },
  );
  assert.equal(shardKeyFor("france.bordeaux.fronsac"), "bordeaux");
});

test("archiveForPlace routes a Spanish key by its comunidad segment", () => {
  // Spain reuses the same country.region.* shape as France/Italy, so the
  // country prefix is inert to routing: the shard is still segment 1.
  assert.deepEqual(archiveForPlace({ display_tier: 0, canonical_key: "spain" }), {
    world: true, shard: null,
  });
  assert.deepEqual(archiveForPlace({ display_tier: 1, canonical_key: "spain.galicia" }), {
    world: true, shard: "galicia",
  });
  assert.deepEqual(
    archiveForPlace({ display_tier: 2, canonical_key: "spain.galicia.rias-baixas" }),
    { world: false, shard: "galicia" },
  );
  // La Rioja the comunidad (shard) vs Rioja the DO (leaf) — the shard is the
  // comunidad, and no French region is named `la-rioja`, so no collision.
  assert.equal(shardKeyFor("spain.la-rioja.rioja"), "la-rioja");
});

test("assertMultiCountryArchive accepts a France + Italy + Spain archive", () => {
  assert.doesNotThrow(() =>
    assertMultiCountryArchive([
      { canonical_key: "france", display_tier: 0 },
      { canonical_key: "france.bordeaux", display_tier: 1 },
      { canonical_key: "italy", display_tier: 0 },
      { canonical_key: "italy.piemonte.barolo", display_tier: 2 },
      { canonical_key: "spain", display_tier: 0 },
      { canonical_key: "spain.galicia.rias-baixas", display_tier: 2 },
    ]),
  );
});

test("assertMultiCountryArchive fails closed when a country outline is missing", () => {
  // A Spanish DO shipped before (or without) its `spain` COUNTRY node — the
  // orphan the auto-promote pipeline must never let through.
  assert.throws(
    () =>
      assertMultiCountryArchive([
        { canonical_key: "france", display_tier: 0 },
        { canonical_key: "spain.galicia.rias-baixas", display_tier: 2 },
      ]),
    /no spain country outline/,
  );
});

test("assertMultiCountryArchive fails closed on a cross-country shard collision", () => {
  // Hypothetical `rioja` used as both a French region and a Spanish comunidad:
  // both would land in one shard archive. The guard is the tripwire.
  assert.throws(
    () =>
      assertMultiCountryArchive([
        { canonical_key: "france", display_tier: 0 },
        { canonical_key: "france.rioja", display_tier: 1 },
        { canonical_key: "spain", display_tier: 0 },
        { canonical_key: "spain.rioja.rioja", display_tier: 2 },
      ]),
    /claimed by two countries/,
  );
});

test("the Phase 3A INAO namespace resolves to the ign-inao credit", () => {
  assert.equal(attributionKeyFor("IGN_INAO_AOC_VITICOLES"), "ign-inao");
  assert.equal(
    ATTRIBUTION.IGN_INAO_AOC_VITICOLES.text,
    ATTRIBUTION.IGN_INAO_AOC_VITICOLES_LEGACY.text,
  );
});

test("the Admin Express namespace shares the ign-inao credit", () => {
  assert.equal(attributionKeyFor("IGN_ADMIN_EXPRESS"), "ign-inao");
  // Collapses to the same credit key as the other IGN/INAO namespaces
  // (doesn't add a new attributionDisplayMap entry).
  assert.equal(
    ATTRIBUTION.IGN_ADMIN_EXPRESS.text,
    ATTRIBUTION.IGN_INAO_AOC_VITICOLES.text,
  );
});

test("tippecanoeArgs honours per-archive zoom", async () => {
  const { tippecanoeArgs, WORLD_TARGET, SHARD_TARGET } = await import("./lib.mjs");
  assert.deepEqual(tippecanoeArgs("world", WORLD_TARGET), [
    "-o", "world.pmtiles", "--force", "-Z0", "-z7", "-r1",
    "--no-progress-indicator",
    "-L", "places:world-places.geojson", "-L", "labels:world-labels.geojson",
  ]);
  assert.deepEqual(tippecanoeArgs("bourgogne", SHARD_TARGET), [
    "-o", "bourgogne.pmtiles", "--force", "-Z4", "-z16", "-r1",
    "--no-progress-indicator",
    "-L", "places:bourgogne-places.geojson", "-L", "labels:bourgogne-labels.geojson",
  ]);
});

test("expectedIdSets splits ids into world + shard sets", async () => {
  const { expectedIdSets } = await import("./lib.mjs");
  const release = {
    world: { place_ids: ["a", "b"] },
    shards: { bourgogne: { place_ids: ["b", "c"] } },
  };
  const sets = expectedIdSets(release);
  assert.deepEqual([...sets.world].sort(), ["a", "b"]);
  assert.deepEqual([...sets.shards.bourgogne].sort(), ["b", "c"]);
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
