import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
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
  shadeIndex,
  SHADE_COUNT,
  COVERAGE_BOXES,
  archiveCountries,
  boundsInside,
  countryOfKey,
  coverageBoxFor,
  featureOutsideCoverage,
  placeFeatures,
  PIECE_PX_RATIO,
  FAMILY_MARGIN_REPORT,
  firstDrawnZoom,
  labelPartIndex,
  pointInPolygon,
  REVEAL_CAP_ZOOM,
  REVEAL_CHECK_PX,
  REVEAL_FAMILY_PINS,
  revealFamilyReport,
  RIBBON_MIN_ASPECT,
  REVEAL_LENGTH_RATIO,
  REVEAL_RULE,
  REVEAL_THICKNESS_RATIO,
  SUBREGION_FAMILY_RATIO,
  convexHull,
  manifestForRelease,
  mercatorPx,
  minAreaRectangle,
  partMeasure,
  partSize,
  revealAreaFromSide,
  revealPlan,
  withRevealArea,
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
    tint: shadeIndex("france.bordeaux"),
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

test("shadeIndex is stable, in range, and well spread", () => {
  // A place must keep its colour across rebuilds.
  assert.equal(shadeIndex("france.bordeaux"), shadeIndex("france.bordeaux"));
  const counts = new Array(SHADE_COUNT).fill(0);
  for (let i = 0; i < 3000; i += 1) {
    const v = shadeIndex(`germany.mosel.bernkastel.michelsberg.site-${i}`);
    assert.ok(Number.isInteger(v) && v >= 0 && v < SHADE_COUNT, `out of range: ${v}`);
    counts[v] += 1;
  }
  // Even-ish spread matters: a lopsided hash would put neighbours on the same
  // shade and defeat the point.
  for (const c of counts) assert.ok(c > 3000 / SHADE_COUNT / 2, `bucket too small: ${counts}`);
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
    "emilia-romagna": ATTRIBUTION.EMILIAROMAGNA_COMUNI.text,
    campania: ATTRIBUTION.CAMPANIA_COMUNI.text,
    puglia: ATTRIBUTION.PUGLIA_COMUNI.text,
    umbria: ATTRIBUTION.UMBRIA_COMUNI.text,
    abruzzo: ATTRIBUTION.ABRUZZO_COMUNI.text,
    marche: ATTRIBUTION.MARCHE_COMUNI.text,
    lazio: ATTRIBUTION.LAZIO_COMUNI.text,
    sardegna: ATTRIBUTION.SARDEGNA_COMUNI.text,
    liguria: ATTRIBUTION.LIGURIA_COMUNI.text,
    calabria: ATTRIBUTION.CALABRIA_COMUNI.text,
    basilicata: ATTRIBUTION.BASILICATA_COMUNI.text,
    "valle-d-aosta": ATTRIBUTION.VALLEDAOSTA_COMUNI.text,
    molise: ATTRIBUTION.MOLISE_COMUNI.text,
    bkg: ATTRIBUTION.BKG_VG250.text,
    "lwk-rlp": ATTRIBUTION.LWK_RLP_WEINLAGEN.text,
    "dgt-caop": ATTRIBUTION.CAOP_CONCELHOS.text,
    "hvbg-atkis": ATTRIBUTION.HESSEN_ATKIS_WEINBAU.text,
    "de-spec-atkis": ATTRIBUTION.DE_SPEC_ATKIS_WEINBAU.text,
    "ucd-ava": ATTRIBUTION.UCD_TTB_AVA.text,
    "ttb-ava": ATTRIBUTION.TTB_AVA_MAP.text,
  });
});

test("the German namespaces resolve to their own credits", () => {
  assert.equal(attributionKeyFor("BKG_VG250"), "bkg");
  assert.equal(attributionKeyFor("LWK_RLP_WEINLAGEN"), "lwk-rlp");
  // Mainland and Madeira come from separate CAOP datasets but collapse to one
  // public credit, the way the IGN parcel and admin sources do for France.
  assert.equal(attributionKeyFor("CAOP_CONCELHOS"), "dgt-caop");
  assert.equal(attributionKeyFor("CAOP_RAM"), "dgt-caop");
  assert.equal(attributionKeyFor("CAOP_FREGUESIAS"), "dgt-caop");
  // Hessen is the one German source that is not a Weinbergsrolle: ATKIS land
  // use clipped to the Gemeinden the Weinbauamt names, so it gets its own
  // credit rather than sharing the Rheinland-Pfalz one.
  assert.equal(attributionKeyFor("HESSEN_ATKIS_WEINBAU"), "hvbg-atkis");
  // Franken and the regions to follow are delimited by their EU product
  // specification rather than a state Weinbergsrolle, so they carry their own
  // credit naming both the survey authority and the register.
  assert.equal(attributionKeyFor("DE_SPEC_ATKIS_WEINBAU"), "de-spec-atkis");
  // Every state whose survey data is in that namespace has to be named in the
  // credit, because dl-de/by-2-0 and CC BY 4.0 both pay for the data in
  // attribution. Saale-Unstrut alone added three. Adding a state's geometry
  // without adding its authority here puts the map in breach, and nothing else
  // in the build notices.
  for (const authority of [/Bayerische Vermessungsverwaltung/, /LVermGeo Sachsen-Anhalt/,
                           /TLBG Th/, /LGB Brandenburg/, /eAmbrosia/]) {
    assert.match(ATTRIBUTION.DE_SPEC_ATKIS_WEINBAU.text, authority);
  }
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

test("tippecanoeArgs honours per-archive zoom and zoom-dependent detail", async () => {
  const { tippecanoeArgs, WORLD_TARGET, SHARD_TARGET, SIMPLIFICATION } =
    await import("./lib.mjs");
  assert.deepEqual(tippecanoeArgs("world", WORLD_TARGET), [
    "-o", "world.pmtiles", "--force", "-Z0", "-z7", "-r1",
    `--simplification=${SIMPLIFICATION}`,
    "--no-tiny-polygon-reduction",
    "--no-progress-indicator",
    "-L", "places:world-places.geojson", "-L", "labels:world-labels.geojson",
  ]);
  assert.deepEqual(tippecanoeArgs("bourgogne", SHARD_TARGET), [
    "-o", "bourgogne.pmtiles", "--force", "-Z4", "-z16", "-r1",
    `--simplification=${SIMPLIFICATION}`,
    "--no-tiny-polygon-reduction",
    "--no-progress-indicator",
    "-L", "places:bourgogne-places.geojson", "-L", "labels:bourgogne-labels.geojson",
  ]);
  // The whole point: geometry gets simpler as you zoom out. A value of 1 would
  // be tippecanoe's default and would silently undo this.
  assert.ok(SIMPLIFICATION > 1, "simplification must exceed tippecanoe's default");
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

const US_BOX = { minLon: -125.5, minLat: 24, maxLon: -66.5, maxLat: 49.5 };
const EUROPE_BOX = { minLon: -18, minLat: 32, maxLon: 19, maxLat: 56 };

test("coverage: the European countries keep the old box exactly", () => {
  for (const country of ["france", "italy", "spain", "germany", "portugal"]) {
    assert.deepEqual({ ...COVERAGE_BOXES[country] }, EUROPE_BOX, country);
  }
  assert.deepEqual({ ...COVERAGE_BOXES["united-states"] }, US_BOX);
  assert.equal(countryOfKey("united-states.california.napa-valley"), "united-states");
});

test("coverage: a Madeira shard passes the header check", () => {
  const madeira = { minLon: -17.266, minLat: 32.633, maxLon: -16.289, maxLat: 33.107 };
  assert.equal(boundsInside(madeira, coverageBoxFor(["portugal"])), true);
});

test("coverage: a US shard passes, and would not pass as a European one", () => {
  const california = { minLon: -124.41, minLat: 32.53, maxLon: -114.13, maxLat: 42.01 };
  assert.equal(boundsInside(california, coverageBoxFor(["united-states"])), true);
  assert.equal(boundsInside(california, coverageBoxFor(["france"])), false);
});

test("coverage: a Paris label on a united-states key fails, even in the world archive", () => {
  const release = {
    expected: [
      { id: "p1", key: "united-states.california.paris", label_lon: 2.35, label_lat: 48.85, archive: { world: true, shard: null } },
      { id: "p2", key: "france.bourgogne", label_lon: 4.8, label_lat: 47.0, archive: { world: true, shard: "bourgogne" } },
      { id: "p3", key: "united-states.new-york", label_lon: -75.5, label_lat: 42.9, archive: { world: true, shard: "new-york" } },
    ],
  };
  assert.deepEqual(featureOutsideCoverage(release).map(({ id }) => id), ["p1"]);
});

test("coverage: a world archive holding the US and Europe passes the header check", () => {
  const release = {
    expected: [
      { id: "f", key: "france", label_lon: 2.4, label_lat: 46.6 },
      { id: "g", key: "germany", label_lon: 10.4, label_lat: 51.1 },
      { id: "p", key: "portugal.madeira", label_lon: -16.9, label_lat: 32.7 },
      { id: "u", key: "united-states", label_lon: -98, label_lat: 39 },
      { id: "x", key: "italy", label_lon: 12.5, label_lat: 42.5 },
    ],
  };
  const countries = archiveCountries(release, new Set(["f", "g", "p", "u"]));
  assert.deepEqual(countries, ["france", "germany", "portugal", "united-states"]);
  const box = coverageBoxFor(countries);
  assert.deepEqual(box, { minLon: -125.5, minLat: 24, maxLon: 19, maxLat: 56 });
  assert.equal(boundsInside({ minLon: -124.73, minLat: 24.52, maxLon: 15.04, maxLat: 55.06 }, box), true);
});

test("coverage: an unknown country throws, prototype names included", () => {
  assert.throws(() => coverageBoxFor(["austria"]), /No coverage box for country "austria"/);
  assert.throws(() => coverageBoxFor(["constructor"]), /No coverage box for country "constructor"/);
  assert.throws(() => coverageBoxFor([]), /at least one country/);
  assert.throws(
    () => featureOutsideCoverage({ expected: [{ id: "a", key: "austria.wachau", label_lon: 15.4, label_lat: 48.4 }] }),
    /No coverage box for country "austria"/,
  );
});

test("the US AVA namespaces resolve to their own credits and never claim a legal boundary", () => {
  assert.equal(attributionKeyFor("UCD_TTB_AVA"), "ucd-ava");
  assert.equal(attributionKeyFor("TTB_AVA_MAP"), "ttb-ava");
  assert.match(ATTRIBUTION.UCD_TTB_AVA.text, /not TTB's legal boundary$/);
  assert.match(ATTRIBUTION.TTB_AVA_MAP.text, /not the legal boundary$/);
  for (const { text } of [ATTRIBUTION.UCD_TTB_AVA, ATTRIBUTION.TTB_AVA_MAP]) {
    assert.doesNotMatch(text, /official/i);
  }
});

test("outline appears only for an outline boundary, on the fill and on every label", () => {
  const outlined = placeFeature({ ...EXPORT_ROW, display: "outline" });
  assert.equal(outlined.properties.outline, true);
  for (const label of labelFeatures({ ...EXPORT_ROW, display: "outline" })) {
    assert.equal(label.properties.outline, true);
  }
  for (const display of [undefined, null, "fill", "OUTLINE"]) {
    const feature = placeFeature({ ...EXPORT_ROW, display });
    assert.equal(Object.hasOwn(feature.properties, "outline"), false, String(display));
  }
});

// ---------------------------------------------------------------------------
// reveal_area (owner, 2026-09-30: small places later, ribbons still with their
// region). src/lib/wine-map/reveal.ts judges a tier >= 2 feature by
// reveal_area * 4^z >= K(N, shard mid-latitude); these pin what the export
// hands it. Near the equator a degree is 512/360 z0 px on both axes, which
// keeps the fixtures readable.
const PX_PER_DEG = 512 / 360;
const rect = (x, y, w, h) => [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]];
const rotated = (cx, cy, w, h, degrees) => {
  const t = (degrees * Math.PI) / 180;
  const corner = ([u, v]) => [cx + u * Math.cos(t) - v * Math.sin(t), cy + u * Math.sin(t) + v * Math.cos(t)];
  const ring = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(corner);
  return [[...ring, ring[0]]];
};
const placeRow = (id, polygons, extra = {}) => ({
  ...EXPORT_ROW,
  id,
  canonical_key: `france.bourgogne.${id}`,
  name: id,
  kind: "APPELLATION",
  display_tier: 3,
  primary_parent_id: "bourgogne",
  geometry: JSON.stringify({ type: "MultiPolygon", coordinates: polygons }),
  ...extra,
});
const REGION = { ...EXPORT_ROW, id: "bourgogne", canonical_key: "france.bourgogne", display_tier: 1, kind: "REGION" };
const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
// reveal.ts's K and test, restated.
const appK = (px, latitude) => ((px * 360) / 512) ** 2 * Math.cos((latitude * Math.PI) / 180);
const appPasses = (revealArea, z, px, latitude) => revealArea * 4 ** z >= appK(px, latitude);

test("reveal constants: rule 1; ribbons 2N long and N/8 thick; subregions at half their median; pieces at N/3", () => {
  assert.equal(REVEAL_RULE, 1);
  assert.equal(REVEAL_LENGTH_RATIO, 2);
  assert.equal(REVEAL_THICKNESS_RATIO, 8);
  assert.equal(SUBREGION_FAMILY_RATIO, 2);
  assert.equal(PIECE_PX_RATIO, 3);
});

test("mercatorPx maps lon/lat onto the 512 px z0 world", () => {
  assert.deepEqual(mercatorPx(0, 0), [256, 256]);
  close(mercatorPx(180, 0)[0], 512);
  close(mercatorPx(-180, 0)[0], 0);
  close(mercatorPx(0, 85.0511287798066)[1], 0, 1e-9);
  // Conformal: at 60 degrees a degree of latitude is twice a degree of longitude.
  const [x0, y0] = mercatorPx(10, 60);
  const [x1, y1] = mercatorPx(10.001, 60.001);
  close((y0 - y1) / (x1 - x0), 2, 1e-3);
});

test("convexHull and minAreaRectangle measure a rotated rectangle exactly", () => {
  const ring = rotated(3, 4, 10, 2, 30)[0];
  const hull = convexHull([...ring, [3, 4], [3.5, 4.1]]);
  assert.equal(hull.length, 4);
  const { long, short } = minAreaRectangle(hull);
  close(long, 10, 1e-9);
  close(short, 2, 1e-9);
  assert.deepEqual(minAreaRectangle(convexHull([[0, 0], [3, 4]])), { long: 5, short: 0 });
  assert.deepEqual(minAreaRectangle(convexHull([[1, 1], [1, 1]])), { long: 0, short: 0 });
  assert.deepEqual(minAreaRectangle([]), { long: 0, short: 0 });
});

test("partMeasure: z0 Mercator area (holes out) and the long side, at any latitude", () => {
  const square = partMeasure(rect(0.1, 0.1, 0.01, 0.01));
  close(square.area, (0.01 * PX_PER_DEG) ** 2, 1e-4);
  close(square.long, 0.01 * PX_PER_DEG, 1e-4);
  const holed = partMeasure([rect(0, 0, 0.02, 0.02)[0], rect(0.005, 0.005, 0.01, 0.01)[0]]);
  close(holed.area, (0.02 * PX_PER_DEG) ** 2 - (0.01 * PX_PER_DEG) ** 2, 1e-4);
  close(holed.long, 0.02 * PX_PER_DEG, 1e-4);
  // A degree square at 60 N is twice as tall as wide on screen.
  const north = partMeasure(rect(5, 60, 0.01, 0.01));
  close(north.long, 2 * 0.01 * PX_PER_DEG, 1e-3);
  close(north.area, 2 * (0.01 * PX_PER_DEG) ** 2, 1e-3);
  assert.deepEqual(partMeasure([]), { area: 0, long: 0 });
});

test("partSize: compact shapes get the plain rule; ribbons their length, capped by their thickness", () => {
  assert.equal(partSize({ area: 100, long: 10 }), 10); // a square
  assert.equal(partSize({ area: 100, long: 20 }), 10); // twice as long as its square: still plain
  assert.equal(partSize({ area: 180, long: 60 }), 24); // 60 x 3: min(60/2, 8 x 3)
  assert.equal(partSize({ area: 400, long: 60 }), 30); // 60 x 6.7: its length decides
  assert.equal(partSize({ area: 100, long: 100 }), 10); // 100 x 1: too thin, the plain rule
  // Review 2026-09-30: an aspect over 4 alone is not a ribbon. Hermitage is
  // 51 x 10 px (aspect 5.0) and must wait like any compact hill.
  close(partSize({ area: 51 * 10.2, long: 51 }), Math.sqrt(51 * 10.2));
  close(partSize({ area: 50 * 7, long: 50 }), Math.sqrt(350)); // aspect 7.1: plain
  assert.equal(partSize({ area: 800, long: 80 }), 40); // 80 x 10, aspect 8: a ribbon, min(80/2, 8 x 10)
  close(partSize({ area: 53.8 * 3.68, long: 53.8 }), 26.9); // Côte de Nuits, aspect 14.6: 53.8 / 2
  assert.equal(partSize({ area: 0, long: 5 }), 0);
  assert.equal(partSize({ area: 4, long: 0 }), 2);
});

test("revealAreaFromSide is exactly the app's test at the shard latitude", () => {
  for (const latitude of [0, 37.27, 47.06, 50.53]) {
    for (const px of [16, 24, 32]) {
      for (const z of [6, 7, 13]) {
        const edge = px / 2 ** z;
        assert.equal(appPasses(revealAreaFromSide(edge * 1.001, latitude), z, px, latitude), true);
        assert.equal(appPasses(revealAreaFromSide(edge * 0.999, latitude), z, px, latitude), false);
        assert.equal(appPasses(revealAreaFromSide(edge * 0.999, latitude), z + 1, px, latitude), true);
      }
    }
  }
  assert.equal(revealAreaFromSide(0, 45), 0);
});

test("revealPlan: a region's subregions at least half its median subregion come in with it", () => {
  const sub = (id, polygons) => placeRow(id, polygons, { kind: "SUBREGION", display_tier: 2 });
  const rows = [
    REGION,
    sub("chablis", [rect(0.1, 0.1, 0.3, 0.3)]), // 0.3 (in degrees; x PX_PER_DEG for px)
    sub("auxerrois", [rect(0.5, 0.1, 0.18, 0.18)]), // 0.18: compact, but at least half the median
    sub("nuits", [rect(0.1, 0.5, 0.8, 0.03)]), // a ribbon: min(0.8/2, 8 x 0.03) = 0.24
    sub("beaune", [rect(1, 0.1, 0.9, 0.05)]), // min(0.45, 0.4) = 0.4
    sub("chalonnaise", [rect(1, 0.3, 0.8, 0.045)]), // min(0.4, 0.36) = 0.36
    sub("maconnais", [rect(2, 0.1, 0.7, 0.7)]), // 0.7
    sub("speck", [rect(3, 0.1, 0.05, 0.05)]), // 0.05: under half the median, on its own
    placeRow("appellation", [rect(3.2, 0.1, 0.1, 0.1)]), // an APPELLATION of the region: no family
    { ...sub("nested", [rect(3.4, 0.1, 0.1, 0.1)]), primary_parent_id: "chablis" }, // a district's SUBREGION: no family
  ];
  const plan = revealPlan(rows, () => 0);
  const side = (id) => plan.get(id).side / PX_PER_DEG;
  // The median of [0.3, 0.18, 0.24, 0.4, 0.36, 0.7, 0.05] is 0.3.
  close(side("auxerrois"), 0.3, 1e-3);
  close(side("nuits"), 0.3, 1e-3);
  close(side("chablis"), 0.3, 1e-3);
  close(side("beaune"), 0.4, 1e-3);
  close(side("chalonnaise"), 0.36, 1e-3);
  close(side("maconnais"), 0.7, 1e-3);
  close(side("speck"), 0.05, 1e-3);
  close(side("appellation"), 0.1, 1e-3);
  close(side("nested"), 0.1, 1e-3);
  assert.equal(plan.has("bourgogne"), false); // regions are exempt
  for (const [, entry] of plan) assert.equal(entry.revealArea, revealAreaFromSide(entry.side, 0));
});

test("revealPlan: the anchor part carries its place, small pieces wait for a third of the threshold", () => {
  // Geometry order: a sliver, the big part, a middling part.
  const polygons = [rect(0.05, 0.05, 0.005, 0.005), rect(0.1, 0.1, 0.2, 0.2), rect(0.4, 0.4, 0.05, 0.05)];
  const plan = revealPlan([placeRow("ridge", polygons)], () => 0).get("ridge");
  assert.equal(plan.anchor, 1);
  const total = Math.sqrt(0.005 ** 2 + 0.2 ** 2 + 0.05 ** 2) * PX_PER_DEG;
  close(plan.side, total, 1e-3);
  close(plan.parts[1].side, total, 1e-3);
  close(plan.parts[0].side, 3 * 0.005 * PX_PER_DEG, 1e-3);
  close(plan.parts[2].side, 3 * 0.05 * PX_PER_DEG, 1e-3);
  // A piece never comes before its place.
  const even = revealPlan([placeRow("even", [rect(0, 0, 0.1, 0.1), rect(0.3, 0.3, 0.1, 0.1)])], () => 0).get("even");
  close(even.parts[0].side, even.side, 1e-9);
  close(even.parts[1].side, even.side, 1e-9);
});

test("revealPlan: the part that makes a place long is its anchor", () => {
  // A 0.1 blob and a 0.6 x 0.02 ribbon: min(0.6/2, 8 x 0.02) = 0.16 beats the blob's 0.1.
  const plan = revealPlan([placeRow("mixed", [rect(0, 0, 0.1, 0.1), rect(0.3, 0, 0.6, 0.02)])], () => 0).get("mixed");
  assert.equal(plan.anchor, 1);
  close(plan.side / PX_PER_DEG, 0.16, 1e-3);
  close(plan.parts[0].side / PX_PER_DEG, 0.16, 1e-3); // min(0.16, 3 x 0.1)
});

test("revealPlan fails closed on a value that is not a finite number", () => {
  assert.throws(() => revealPlan([placeRow("x", [rect(0, 0, 1, 1)])], () => Number.NaN), /reveal_area/);
});

test("placeFeatures: countries and regions unchanged; a subregion one feature per part, each with its reveal_area", () => {
  assert.deepEqual(placeFeatures(EXPORT_ROW), [placeFeature(EXPORT_ROW)]);
  const single = placeRow("single", [rect(0, 0, 1, 1)]);
  const singlePlan = revealPlan([single], () => 46).get("single");
  assert.deepEqual(placeFeatures(single, singlePlan), [
    { ...placeFeature(single), properties: { ...placeFeature(single).properties, reveal_area: singlePlan.revealArea } },
  ]);
  const polygons = [rect(0.5, 0.5, 0.05, 0.05), rect(1, 1, 2, 2)];
  const row = placeRow("split", polygons);
  const plan = revealPlan([row], () => 46).get("split");
  const features = placeFeatures(row, plan);
  assert.equal(features.length, 2);
  const whole = placeFeature(row);
  features.forEach((feature, i) => {
    assert.deepEqual(feature.geometry, { type: "MultiPolygon", coordinates: [polygons[i]] });
    assert.deepEqual(feature.tippecanoe, whole.tippecanoe);
    assert.deepEqual({ ...feature.properties, reveal_area: undefined }, { ...whole.properties, reveal_area: undefined });
    assert.equal(feature.properties.reveal_area, plan.parts[i].revealArea);
    assert.equal(typeof feature.properties.reveal_area, "number");
  });
  // Put back together, the parts are the place (what the app draws with the rule off).
  assert.deepEqual(features.flatMap((f) => f.geometry.coordinates), whole.geometry.coordinates);
  assert.throws(() => placeFeatures(row), /no reveal plan/);
});

test("withRevealArea copies, leaving the feature it was given alone", () => {
  const [label] = labelFeatures(EXPORT_ROW);
  const copy = withRevealArea(label, 0.25);
  assert.equal(copy.properties.reveal_area, 0.25);
  assert.equal("reveal_area" in label.properties, false);
  assert.deepEqual({ ...copy.properties, reveal_area: undefined }, { ...label.properties, reveal_area: undefined });
});

test("manifestForRelease builds promote's manifest, passing reveal_rule through when the release has it", () => {
  const tileChecksums = {
    world: { path: "tiles/releases/V/world.pmtiles", bytes: 10, checksum_sha256: "A".repeat(64) },
    bourgogne: {
      path: "tiles/releases/V/bourgogne.pmtiles", bytes: 20, checksum_sha256: "B".repeat(64),
      bbox: [3, 46, 5, 48], min_zoom: 4, max_zoom: 16,
    },
  };
  const manifest = manifestForRelease({ version: "V", tileChecksums, generatedAt: "2026-09-30T00:00:00.000Z" });
  assert.deepEqual(manifest, buildManifest({
    version: "V",
    generatedAt: "2026-09-30T00:00:00.000Z",
    world: { url: storagePublicUrl("tiles/releases/V/world.pmtiles"), checksum_sha256: "A".repeat(64), bytes: 10 },
    shards: {
      bourgogne: {
        url: storagePublicUrl("tiles/releases/V/bourgogne.pmtiles"), checksum_sha256: "B".repeat(64), bytes: 20,
        bbox: [3, 46, 5, 48], min_zoom: 4, max_zoom: 16,
      },
    },
    attribution: attributionDisplayMap(),
  }));
  assert.equal("reveal_rule" in manifest.shards.bourgogne, false);
  const flagged = manifestForRelease({
    version: "V",
    tileChecksums: { ...tileChecksums, bourgogne: { ...tileChecksums.bourgogne, reveal_rule: REVEAL_RULE } },
    generatedAt: "2026-09-30T00:00:00.000Z",
  });
  assert.equal(flagged.shards.bourgogne.reveal_rule, REVEAL_RULE);
  assert.equal("reveal_rule" in flagged.world, false);
});

test("validate: a place split into parts passes the per-feature gates, and its id counts once", async () => {
  const { checkTileFeature } = await import("./validate.mjs");
  const polygons = [rect(0.5, 0.5, 0.05, 0.05), rect(1, 1, 2, 2)];
  const row = placeRow("split", polygons);
  const features = placeFeatures(row, revealPlan([row], () => 46).get("split"));
  const allExpectedIds = new Set([row.id]);
  const seen = new Set();
  for (const { properties } of features) {
    checkTileFeature(properties, { name: "bourgogne", layer: "places", allExpectedIds, revealRule: true });
    seen.add(properties.id);
  }
  assert.equal(seen.size, 1);
});

test("validate: a shard with reveal_rule refuses a subregion without a numeric reveal_area", async () => {
  const { checkTileFeature } = await import("./validate.mjs");
  const allExpectedIds = new Set(["a"]);
  const base = { id: "a", key: "france.bourgogne.a", tier: 3 };
  const opts = { name: "bourgogne", layer: "labels", allExpectedIds, revealRule: true };
  assert.throws(() => checkTileFeature(base, opts), /has no reveal_area/);
  assert.throws(() => checkTileFeature({ ...base, reveal_area: "0.1" }, opts), /has no reveal_area/);
  assert.throws(() => checkTileFeature({ ...base, reveal_area: Number.NaN }, opts), /has no reveal_area/);
  checkTileFeature({ ...base, reveal_area: 0 }, opts);
  checkTileFeature({ ...base, tier: 1 }, opts); // regions are exempt
  checkTileFeature(base, { ...opts, revealRule: false }); // an archive from before the rule
  assert.throws(() => checkTileFeature({ ...base, id: "b", reveal_area: 1 }, opts), /unexpected feature id b/);
});

test("reveal check constants follow the app (reveal.ts); a ribbon is at least 8 times as long as thick", () => {
  const app = readFileSync(new URL("../../src/lib/wine-map/reveal.ts", import.meta.url), "utf8");
  assert.equal(Number(/export const REVEAL_MIN_PX = (\d+);/.exec(app)?.[1]), REVEAL_CHECK_PX);
  assert.equal(Number(/export const REVEAL_CAP_ZOOM = (\d+);/.exec(app)?.[1]), REVEAL_CAP_ZOOM);
  assert.equal(RIBBON_MIN_ASPECT, 8);
  assert.deepEqual(REVEAL_FAMILY_PINS, ["france.bourgogne"]);
  assert.equal(FAMILY_MARGIN_REPORT, 1.2);
});

test("pointInPolygon and labelPartIndex: the outer ring counts, a hole does not", () => {
  const withHole = [rect(0, 0, 1, 1)[0], rect(0.4, 0.4, 0.2, 0.2)[0]];
  assert.equal(pointInPolygon([0.1, 0.1], withHole), true);
  assert.equal(pointInPolygon([0.5, 0.5], withHole), false);
  assert.equal(pointInPolygon([2, 2], withHole), false);
  const polygons = [rect(0, 0, 1, 1), rect(3, 3, 0.1, 0.1)];
  const at = (lon, lat) => ({ label_point: JSON.stringify({ type: "Point", coordinates: [lon, lat] }) });
  assert.equal(labelPartIndex(at(0.5, 0.5), polygons), 0);
  assert.equal(labelPartIndex(at(3.05, 3.05), polygons), 1);
  assert.equal(labelPartIndex(at(9, 9), polygons), -1);
  assert.equal(labelPartIndex({ label_point: null }, polygons), -1);
  assert.equal(labelPartIndex({ label_point: "not json" }, polygons), -1);
});

// Review 2026-09-30: ten places (Paradiesgarten, Weinhex, Lago di Caldaro...)
// have their label point in a small non-anchor part; the name came 1-2 zooms
// before the part under it.
test("revealPlan: the part under the label comes with the name", () => {
  const polygons = [rect(0, 0, 0.3, 0.3), rect(1, 1, 0.01, 0.01), rect(2, 2, 0.01, 0.01)];
  const label = (lon, lat) => JSON.stringify({ type: "Point", coordinates: [lon, lat] });
  const plan = revealPlan([placeRow("scatter", polygons, { label_point: label(1.005, 1.005) })], () => 47).get("scatter");
  assert.equal(plan.anchor, 0);
  assert.equal(plan.labelPart, 1);
  assert.equal(plan.parts[1].side, plan.side);
  assert.equal(plan.parts[1].revealArea, plan.revealArea);
  close(plan.parts[2].side, 3 * 0.01 * PX_PER_DEG, 1e-3); // the other piece still waits
  // A label on the anchor, or outside every part: only the anchor carries the place.
  for (const point of [label(0.1, 0.1), label(9, 9)]) {
    const other = revealPlan([placeRow("scatter", polygons, { label_point: point })], () => 47).get("scatter");
    assert.equal(other.parts[1].side < other.side, true);
    assert.equal(other.parts[0].side, other.side);
  }
});

test("firstDrawnZoom: the app's test, floored at the tile zoom and the z5 mount, capped at z16", () => {
  assert.equal(firstDrawnZoom(24 / 2 ** 7, 4), 7);
  assert.equal(firstDrawnZoom((24 / 2 ** 7) * 0.999, 4), 8);
  assert.equal(firstDrawnZoom(100, 7.35), 7);
  assert.equal(firstDrawnZoom(100, 2), 5);
  assert.equal(firstDrawnZoom(1e-9, 7), 16);
  assert.equal(firstDrawnZoom(0, 7), 16);
  assert.equal(firstDrawnZoom(24 / 2 ** 6, 4, 12), 5);
});

// Review 2026-09-30: Grand Auxerrois reaches the Burgundy view only through
// the family median (0.545 of it); a sibling change could leave it behind,
// and nothing said so. The export now reports members near the cut and fails
// when a pinned region's subregions no longer come in together.
test("revealFamilyReport: members near the cut, and a pinned region whose subregions split", () => {
  const sub = (id, polygons) => placeRow(id, polygons, { kind: "SUBREGION", display_tier: 2 });
  const districts = [
    sub("chablis", [rect(0.1, 0.1, 0.3, 0.3)]),
    sub("auxerrois", [rect(0.5, 0.1, 0.17, 0.17)]), // 0.17 of a 0.3 median: pulled, near the cut
    sub("nuits", [rect(0.1, 0.5, 0.8, 0.03)]),
    sub("beaune", [rect(1, 0.1, 0.9, 0.05)]),
    sub("chalonnaise", [rect(1, 0.3, 0.8, 0.045)]),
    sub("maconnais", [rect(2, 0.1, 0.32, 0.32)]),
  ];
  const rows = [REGION, ...districts];
  const plan = revealPlan(rows, () => 0);
  const report = revealFamilyReport(rows, plan);
  assert.deepEqual(report.pinFailures, []);
  assert.deepEqual(report.nearCut, [{ key: "france.bourgogne.auxerrois", parent: "france.bourgogne", ratio: 0.548, pulled: true }]);
  // Two big new districts raise the median past twice Auxerrois: it is left a zoom behind.
  const grown = [...rows, sub("new1", [rect(3, 0.1, 0.6, 0.6)]), sub("new2", [rect(4, 0.1, 0.6, 0.6)])];
  const split = revealFamilyReport(grown, revealPlan(grown, () => 0));
  assert.equal(split.pinFailures.length, 1);
  assert.equal(split.pinFailures[0].parent, "france.bourgogne");
  const zoomOf = Object.fromEntries(split.pinFailures[0].zooms.map((z) => [z.key, z.zoom]));
  assert.equal(zoomOf["france.bourgogne.auxerrois"] > zoomOf["france.bourgogne.chablis"], true);
  // An unpinned region is only reported, never failed.
  const other = { ...REGION, id: "loire", canonical_key: "france.loire" };
  const moved = grown.map((row) => (row.primary_parent_id === "bourgogne" ? { ...row, primary_parent_id: "loire" } : row));
  assert.deepEqual(revealFamilyReport([other, ...moved], revealPlan([other, ...moved], () => 0)).pinFailures, []);
});
