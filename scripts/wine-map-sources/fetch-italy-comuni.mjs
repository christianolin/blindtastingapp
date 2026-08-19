// Cache every Italian comune (ISTAT code + polygon geometry) once, locally, so
// the country-outline dissolve (and any future Italian DOC/DOCG municipality
// unions) read whole-comune shapes from disk instead of hammering the API.
//
// Source: OpenDataSoft `georef-italy-comune` — ~7,900 comuni, each with an ISTAT
// `com_code`, `prov_code`/`prov_name`, `reg_code`/`reg_name` and a `geo_shape`
// polygon. This is the Italian analogue of `georef-spain-municipio` (see
// fetch-spain-municipios.mjs): official municipal polygons that a country
// outline is dissolved from, at the same fidelity as France/Spain. Licence:
// ISTAT confini amministrativi, republished by OpenDataSoft (attributed
// downstream as NAMESPACE `ISTAT_CONFINI`, CC BY).
//
// The cache lands in .tiles-build/sources/ (gitignored — 8k polygons is far too
// large to commit; France/Italy/Spain commit only their single country outline).
// Idempotent: a valid existing cache is reused, so this is safe to re-run.
//
// Usage: node scripts/wine-map-sources/fetch-italy-comuni.mjs [--force]
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256hex } from "../wine-map-tiles/lib.mjs";

export const COMUNE_CACHE_PATH = path.resolve(
  ".tiles-build",
  "sources",
  "italy-comuni.json",
);
export const DATASET = "georef-italy-comune";
const EXPORT_URL =
  `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/${DATASET}` +
  `/exports/geojson?select=com_code,com_name,prov_code,prov_name,reg_code,reg_name&limit=-1`;
const RECORDS_URL =
  `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/${DATASET}/records`;
const EXPECTED_MIN = 7500;
const EXPECTED_MAX = 8200;

// Normalize one georef feature to the flat record the rest of the pipeline
// reads. geo_shape becomes the feature geometry in a geojson export; the
// records API instead nests it under properties.geo_shape.geometry.
function toRecord(feature) {
  const p = feature.properties ?? feature;
  const geometry = feature.geometry ?? p.geo_shape?.geometry ?? p.geo_shape ?? null;
  return {
    com_code: p.com_code,
    com_name: p.com_name,
    prov_code: p.prov_code,
    prov_name: p.prov_name,
    reg_code: p.reg_code,
    reg_name: p.reg_name,
    geometry,
  };
}

function geometryParts(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

// Coalesce records sharing an ISTAT com_code into one MultiPolygon. The geojson
// export splits a multi-component comune (coastal/island comuni) into a feature
// per polygon; merging by com_code yields exactly one whole-comune shape each,
// and keeps every distinct dataset spelling as an alias.
function mergeByComCode(records) {
  const byCode = new Map();
  for (const record of records) {
    const existing = byCode.get(record.com_code);
    if (existing) {
      existing.parts.push(...geometryParts(record.geometry));
      if (record.com_name && !existing.names.includes(record.com_name)) {
        existing.names.push(record.com_name);
      }
    } else {
      byCode.set(record.com_code, {
        record,
        parts: geometryParts(record.geometry),
        names: record.com_name ? [record.com_name] : [],
      });
    }
  }
  return [...byCode.values()].map(({ record, parts, names }) => ({
    com_code: record.com_code,
    com_name: record.com_name,
    aliases: names,
    prov_code: record.prov_code,
    prov_name: record.prov_name,
    reg_code: record.reg_code,
    reg_name: record.reg_name,
    geometry: { type: "MultiPolygon", coordinates: parts },
  }));
}

function assertRecords(records) {
  assert.ok(
    records.length >= EXPECTED_MIN && records.length <= EXPECTED_MAX,
    `comune count ${records.length} outside expected ${EXPECTED_MIN}-${EXPECTED_MAX} — dataset drifted`,
  );
  const byCode = new Map();
  for (const r of records) {
    assert.ok(
      typeof r.com_code === "string" && /^\d{5,6}$/.test(r.com_code),
      `bad com_code ${JSON.stringify(r.com_code)} for ${r.com_name}`,
    );
    assert.ok(r.com_name, `comune ${r.com_code} has no name`);
    assert.ok(
      r.geometry && (r.geometry.type === "Polygon" || r.geometry.type === "MultiPolygon"),
      `comune ${r.com_code} (${r.com_name}) has no polygon geometry`,
    );
    assert.ok(!byCode.has(r.com_code), `duplicate com_code ${r.com_code}`);
    byCode.set(r.com_code, r);
  }
}

async function fetchViaExport() {
  const res = await fetch(EXPORT_URL);
  if (!res.ok) throw new Error(`export -> ${res.status} ${res.statusText}`);
  const collection = await res.json();
  assert.ok(Array.isArray(collection.features), "export returned no features array");
  return collection.features.map(toRecord);
}

// Fallback: paginate the records API (100/page). ~7,900 < the 10,000 offset cap,
// so full coverage is guaranteed without the export endpoint.
async function fetchViaRecords() {
  const out = [];
  for (let offset = 0; offset < EXPECTED_MAX + 100; offset += 100) {
    const url =
      `${RECORDS_URL}?select=com_code,com_name,prov_code,prov_name,reg_code,reg_name,geo_shape` +
      `&limit=100&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`records offset ${offset} -> ${res.status}`);
    const body = await res.json();
    const results = body.results ?? [];
    if (results.length === 0) break;
    for (const r of results) out.push(toRecord(r));
    if (out.length >= (body.total_count ?? EXPECTED_MAX)) break;
  }
  return out;
}

async function loadCache() {
  if (!existsSync(COMUNE_CACHE_PATH)) return null;
  try {
    const cache = JSON.parse(await readFile(COMUNE_CACHE_PATH, "utf8"));
    assertRecords(cache.comuni);
    return cache;
  } catch (error) {
    console.warn(`cache invalid (${error.message}); refetching`);
    return null;
  }
}

// Exported so the outline/stage scripts can load the cache without re-fetching.
export async function loadComuneCache() {
  const cache = await loadCache();
  assert.ok(
    cache,
    `comune cache missing/invalid at ${COMUNE_CACHE_PATH} — run fetch-italy-comuni.mjs first`,
  );
  return cache;
}

async function main() {
  const force = process.argv.includes("--force");
  if (!force) {
    const cache = await loadCache();
    if (cache) {
      console.log(`REUSE cache: ${cache.comuni.length} comuni (retrieved ${cache.retrieved_at})`);
      return;
    }
  }
  console.log(`fetching all comuni: ${DATASET}`);
  let features;
  try {
    features = await fetchViaExport();
    console.log(`export endpoint returned ${features.length} features`);
  } catch (error) {
    console.warn(`export failed (${error.message}); falling back to records pagination`);
    features = await fetchViaRecords();
    console.log(`records pagination returned ${features.length} features`);
  }
  const records = mergeByComCode(features);
  console.log(`coalesced ${features.length} features -> ${records.length} comuni`);
  assertRecords(records);
  records.sort((a, b) => a.com_code.localeCompare(b.com_code));
  const comuniJson = JSON.stringify(records);
  const cache = {
    dataset: DATASET,
    dataset_url: `https://public.opendatasoft.com/explore/dataset/${DATASET}/`,
    licence: "ISTAT confini amministrativi, via OpenDataSoft (CC BY)",
    retrieved_at: new Date().toISOString(),
    count: records.length,
    comuni_sha256: sha256hex(Buffer.from(comuniJson)),
    comuni: records,
  };
  await mkdir(path.dirname(COMUNE_CACHE_PATH), { recursive: true });
  await writeFile(COMUNE_CACHE_PATH, `${JSON.stringify(cache)}\n`);
  console.log(
    `WROTE ${COMUNE_CACHE_PATH}: ${records.length} comuni, sha ${cache.comuni_sha256.slice(0, 12)}`,
  );
}

// Only run the fetch when invoked directly (import for loadComuneCache is free).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
