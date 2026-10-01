// Validation gates: open each archive with the pmtiles client, verify header
// zoom windows and layer metadata, then decode the tiles at every expected
// label point at the archive's max zoom and assert the exact feature-id sets
// for both layers. Reused by publish.mjs against remote FetchSources.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PMTiles } from "pmtiles";
import {
  archiveCountries,
  boundsInside,
  coverageBoxFor,
  decodeTileFeatures,
  expectedIdSets,
  featureOutsideCoverage,
  lonLatToTile,
  NodeFileSource,
  WORK_DIR,
  WORLD_TARGET,
} from "./lib.mjs";

// Coverage: every label point inside its own country's box, and each archive's
// header inside the union of its countries' boxes (lib.mjs COVERAGE_BOXES,
// spec 2026-09-29 D17). The tight per-archive gate is still the feature-id-set
// check below; these catch wildly misplaced geometry (e.g. 0,0) and a place
// keyed under the wrong country.

/** The checks every decoded feature of one archive must pass. Pure, so the
    tests run it without an archive. A place split into one feature per part
    (lib.mjs placeFeatures) decodes as several features with one id; the id
    sets count it once, so parts need nothing here beyond what a whole place
    needs. In a shard whose release entry carries reveal_rule, every subregion
    (tier >= 2), polygon or label, must carry a numeric reveal_area: the app
    reads a feature without one as "no size delay", so a gap here would put a
    speck back on the map with nothing to say why. */
export function checkTileFeature(properties, { name, layer, allExpectedIds, revealRule }) {
  assert.ok(allExpectedIds.has(properties.id), `${name}/${layer}: unexpected feature id ${properties.id}`);
  assert.equal(typeof properties.key, "string", `${name}/${layer}: missing key`);
  assert.equal(typeof properties.tier, "number", `${name}/${layer}: missing tier`);
  if (revealRule && properties.tier >= 2) {
    assert.ok(
      typeof properties.reveal_area === "number" &&
        Number.isFinite(properties.reveal_area) &&
        properties.reveal_area >= 0,
      `${name}/${layer}: ${properties.key} has no reveal_area`,
    );
  }
}

/** A shard tile's places, in tile order, must be in the export's paint order
    (lib.mjs paintOrdered: tier ascending, then larger `area` first, then key),
    which holds only if tippecanoe kept the input order (tippecanoeArgs'
    --preserve-input-order). MapLibre paints later features on top, so this is
    what keeps a deeper or smaller place over the one it sits in. Pure: the
    decoded properties of one tile's places layer. */
export function checkPaintOrder(placesProperties, { name, tile }) {
  for (let i = 1; i < placesProperties.length; i += 1) {
    const a = placesProperties[i - 1];
    const b = placesProperties[i];
    const inOrder =
      a.tier < b.tier ||
      (a.tier === b.tier && (a.area > b.area || (a.area === b.area && String(a.key) <= String(b.key))));
    assert.ok(
      inOrder,
      `${name} tile ${tile}: ${b.key} (tier ${b.tier}) paints over ${a.key} (tier ${a.tier})`,
    );
  }
}

export async function validateArchives(sources, release) {
  const idSets = expectedIdSets(release);
  const allExpectedIds = new Set([
    ...idSets.world,
    ...Object.values(idSets.shards).flatMap((set) => [...set]),
  ]);
  const gates = [];
  const featureCounts = {};
  const outside = featureOutsideCoverage(release);
  assert.equal(
    outside.length,
    0,
    `label points outside their own country's coverage box: ${outside
      .map(({ key, label_lon: lon, label_lat: lat }) => `${key} (${lon}, ${lat})`)
      .join("; ")}`,
  );
  gates.push(`all ${release.expected.length} label points inside their country's box`);

  for (const name of Object.keys(sources)) {
    const spec =
      name === "world"
        ? WORLD_TARGET
        : { minZoom: release.shards[name].min_zoom, maxZoom: release.shards[name].max_zoom };
    const pmt = new PMTiles(sources[name]);
    const header = await pmt.getHeader();
    const expectedIds = name === "world" ? idSets.world : idSets.shards[name];
    assert.ok(expectedIds, `no expected id set for archive ${name}`);
    assert.equal(header.minZoom, spec.minZoom, `${name}: header minZoom`);
    assert.equal(header.maxZoom, spec.maxZoom, `${name}: header maxZoom`);
    assert.equal(header.tileType, 1, `${name}: tileType must be MVT`);
    const box = coverageBoxFor(archiveCountries(release, expectedIds));
    assert.ok(
      boundsInside(header, box),
      `${name}: bounds [${header.minLon}, ${header.minLat}, ${header.maxLon}, ${header.maxLat}] outside its countries' coverage box`,
    );
    gates.push(`${name}: header ok (z${header.minZoom}-z${header.maxZoom})`);

    const metadata = await pmt.getMetadata();
    const layerNames = (metadata.vector_layers ?? []).map(({ id }) => id).sort();
    assert.deepEqual(layerNames, ["labels", "places"], `${name}: vector layers`);
    gates.push(`${name}: layers ok`);

    const seen = { places: new Set(), labels: new Set() };
    const revealRule = name !== "world" && release.shards[name].reveal_rule !== undefined;
    const expectedRows = release.expected.filter(({ id }) => expectedIds.has(id));
    for (const row of expectedRows) {
      const { z, x, y } = lonLatToTile(row.label_lon, row.label_lat, spec.maxZoom);
      const tile = await pmt.getZxy(z, x, y);
      assert.ok(tile?.data, `${name}: missing tile ${z}/${x}/${y} for ${row.key}`);
      const layers = await decodeTileFeatures(tile.data);
      for (const layer of ["places", "labels"]) {
        for (const properties of layers[layer] ?? []) {
          if (expectedIds.has(properties.id)) seen[layer].add(properties.id);
          checkTileFeature(properties, { name, layer, allExpectedIds, revealRule });
        }
      }
      // A shard built by this export (reveal_rule) paints in its order.
      if (revealRule) checkPaintOrder(layers.places ?? [], { name, tile: `${z}/${x}/${y}` });
    }
    for (const layer of ["places", "labels"]) {
      const missing = [...expectedIds].filter((id) => !seen[layer].has(id));
      assert.equal(missing.length, 0, `${name}/${layer}: missing ids ${missing.join(",")}`);
    }
    featureCounts[name] = { places: seen.places.size, labels: seen.labels.size };
    gates.push(`${name}: all ${expectedIds.size} ids present in places+labels`);
    if (revealRule) {
      gates.push(`${name}: every subregion decoded carries reveal_area`);
      gates.push(`${name}: places in paint order in every probed tile`);
    }
  }
  return { gates, featureCounts };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const mode = process.argv[2];
  if (mode !== "local") {
    throw new Error(`validate.mjs requires mode "local" when run directly, got ${mode}`);
  }
  const release = JSON.parse(await readFile(path.join(WORK_DIR, "release.json"), "utf8"));
  const sources = { world: new NodeFileSource(path.join(WORK_DIR, "world.pmtiles")) };
  for (const key of Object.keys(release.shards)) {
    sources[key] = new NodeFileSource(path.join(WORK_DIR, `${key}.pmtiles`));
  }
  const { gates, featureCounts } = await validateArchives(sources, release);
  for (const gate of gates) console.log(`GATE ${gate}`);
  console.log(`Local validation passed: ${JSON.stringify(featureCounts)}`);
}
