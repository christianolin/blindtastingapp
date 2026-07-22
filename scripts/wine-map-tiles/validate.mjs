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
  decodeTileFeatures,
  expectedIdSets,
  lonLatToTile,
  NodeFileSource,
  WORK_DIR,
  WORLD_TARGET,
} from "./lib.mjs";

// TODO(3E): the first non-France region shard will need its own bbox gate;
// today every shard is a subset of France, so this window is a safe superset.
const FRANCE_BBOX = { minLon: -6, minLat: 41, maxLon: 11, maxLat: 52 };

export async function validateArchives(sources, release) {
  const idSets = expectedIdSets(release);
  const allExpectedIds = new Set([
    ...idSets.world,
    ...Object.values(idSets.shards).flatMap((set) => [...set]),
  ]);
  const gates = [];
  const featureCounts = {};

  for (const name of Object.keys(sources)) {
    const spec =
      name === "world"
        ? WORLD_TARGET
        : { minZoom: release.shards[name].min_zoom, maxZoom: release.shards[name].max_zoom };
    const pmt = new PMTiles(sources[name]);
    const header = await pmt.getHeader();
    assert.equal(header.minZoom, spec.minZoom, `${name}: header minZoom`);
    assert.equal(header.maxZoom, spec.maxZoom, `${name}: header maxZoom`);
    assert.equal(header.tileType, 1, `${name}: tileType must be MVT`);
    assert.ok(
      header.minLon >= FRANCE_BBOX.minLon && header.maxLon <= FRANCE_BBOX.maxLon &&
      header.minLat >= FRANCE_BBOX.minLat && header.maxLat <= FRANCE_BBOX.maxLat,
      `${name}: bounds outside France bbox`,
    );
    gates.push(`${name}: header ok (z${header.minZoom}-z${header.maxZoom})`);

    const metadata = await pmt.getMetadata();
    const layerNames = (metadata.vector_layers ?? []).map(({ id }) => id).sort();
    assert.deepEqual(layerNames, ["labels", "places"], `${name}: vector layers`);
    gates.push(`${name}: layers ok`);

    const expectedIds = name === "world" ? idSets.world : idSets.shards[name];
    assert.ok(expectedIds, `no expected id set for archive ${name}`);
    const seen = { places: new Set(), labels: new Set() };
    const expectedRows = release.expected.filter(({ id }) => expectedIds.has(id));
    for (const row of expectedRows) {
      const { z, x, y } = lonLatToTile(row.label_lon, row.label_lat, spec.maxZoom);
      const tile = await pmt.getZxy(z, x, y);
      assert.ok(tile?.data, `${name}: missing tile ${z}/${x}/${y} for ${row.key}`);
      const layers = await decodeTileFeatures(tile.data);
      for (const layer of ["places", "labels"]) {
        for (const properties of layers[layer] ?? []) {
          if (expectedIds.has(properties.id)) seen[layer].add(properties.id);
          assert.ok(allExpectedIds.has(properties.id),
            `${name}/${layer}: unexpected feature id ${properties.id}`);
          assert.equal(typeof properties.key, "string", `${name}/${layer}: missing key`);
          assert.equal(typeof properties.tier, "number", `${name}/${layer}: missing tier`);
        }
      }
    }
    for (const layer of ["places", "labels"]) {
      const missing = [...expectedIds].filter((id) => !seen[layer].has(id));
      assert.equal(missing.length, 0, `${name}/${layer}: missing ids ${missing.join(",")}`);
    }
    featureCounts[name] = { places: seen.places.size, labels: seen.labels.size };
    gates.push(`${name}: all ${expectedIds.size} ids present in places+labels`);
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
