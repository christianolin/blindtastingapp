// Task 3a: cache every Spanish municipio (INE code + polygon geometry) once,
// locally, so each DO's boundary fetch reads whole-municipality shapes from
// disk instead of hammering the OpenDataSoft API over a multi-hour run.
//
// Source: OpenDataSoft `georef-spain-municipio` — 8,223 municipios, each with
// an INE `mun_code`, `prov_code`/`prov_name`, `acom_code`/`acom_name` and a
// `geo_shape` polygon. This is the Spanish analogue of the IGN Admin Express
// commune layer used for Champagne/Alsace and the ISTAT comuni layer used for
// Piedmont: official municipal polygons that a DO's pliego municipality list is
// dissolved over. Licence: IGN/CNIG-derived open data (attributed downstream as
// NAMESPACE `IGN_CNIG_SPAIN`).
//
// The cache lands in .tiles-build/sources/ (gitignored — 8k polygons is far too
// large to commit; France/Italy commit only their single country outline, and
// the France WFS parcels are likewise never committed, only per-denomination
// raw pages uploaded to the private bucket at stage time). Idempotent: a valid
// existing cache is reused, so this is safe to re-run and resumable.
//
// Usage: node scripts/wine-map-sources/fetch-spain-municipios.mjs [--force]
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256hex } from "../wine-map-tiles/lib.mjs";

export const MUNICIPIO_CACHE_PATH = path.resolve(
  ".tiles-build",
  "sources",
  "spain-municipios.json",
);
export const DATASET = "georef-spain-municipio";
const EXPORT_URL =
  `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/${DATASET}` +
  `/exports/geojson?select=mun_code,mun_name,prov_code,prov_name,acom_code,acom_name&limit=-1`;
const RECORDS_URL =
  `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/${DATASET}/records`;
const EXPECTED_MIN = 8000;
const EXPECTED_MAX = 8300;

// Normalize one georef feature to the flat record the rest of the pipeline
// reads. geo_shape becomes the feature geometry in a geojson export; the
// records API instead nests it under properties.geo_shape.geometry.
function toRecord(feature) {
  const p = feature.properties ?? feature;
  const geometry =
    feature.geometry ??
    p.geo_shape?.geometry ??
    p.geo_shape ??
    null;
  return {
    mun_code: p.mun_code,
    mun_name: p.mun_name,
    prov_code: p.prov_code,
    prov_name: p.prov_name,
    acom_code: p.acom_code,
    acom_name: p.acom_name,
    geometry,
  };
}

function geometryParts(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

// Coalesce any records that share an INE mun_code into one MultiPolygon. The
// records API returns one intact record per municipio, but the geojson export
// splits a multi-component municipio (Balearic islands, coastal islets) into a
// feature per polygon — merging by mun_code makes both sources yield exactly
// one whole-municipality shape each.
function mergeByMunCode(records) {
  const byCode = new Map();
  for (const record of records) {
    const existing = byCode.get(record.mun_code);
    if (existing) {
      existing.parts.push(...geometryParts(record.geometry));
      // A same-code second feature is the municipio under a co-official-language
      // name variant (Maó / Maó-Mahón, Alacant / Alicante); keep every spelling
      // as an alias so the resolver matches whichever form a pliego uses.
      if (record.mun_name && !existing.names.includes(record.mun_name)) {
        existing.names.push(record.mun_name);
      }
    } else {
      byCode.set(record.mun_code, {
        record,
        parts: geometryParts(record.geometry),
        names: record.mun_name ? [record.mun_name] : [],
      });
    }
  }
  return [...byCode.values()].map(({ record, parts, names }) => ({
    mun_code: record.mun_code,
    mun_name: record.mun_name,
    // All distinct dataset spellings (Castilian + co-official) for this INE code.
    aliases: names,
    prov_code: record.prov_code,
    prov_name: record.prov_name,
    acom_code: record.acom_code,
    acom_name: record.acom_name,
    geometry: { type: "MultiPolygon", coordinates: parts },
  }));
}

function assertRecords(records) {
  assert.ok(
    records.length >= EXPECTED_MIN && records.length <= EXPECTED_MAX,
    `municipio count ${records.length} outside expected ${EXPECTED_MIN}-${EXPECTED_MAX} — dataset drifted`,
  );
  const byCode = new Map();
  for (const r of records) {
    assert.ok(
      typeof r.mun_code === "string" && /^\d{5}$/.test(r.mun_code),
      `bad mun_code ${JSON.stringify(r.mun_code)} for ${r.mun_name}`,
    );
    assert.ok(r.mun_name, `municipio ${r.mun_code} has no name`);
    assert.ok(
      r.geometry && (r.geometry.type === "Polygon" || r.geometry.type === "MultiPolygon"),
      `municipio ${r.mun_code} (${r.mun_name}) has no polygon geometry`,
    );
    assert.ok(!byCode.has(r.mun_code), `duplicate mun_code ${r.mun_code}`);
    byCode.set(r.mun_code, r);
  }
}

async function fetchViaExport() {
  const res = await fetch(EXPORT_URL);
  if (!res.ok) throw new Error(`export -> ${res.status} ${res.statusText}`);
  const collection = await res.json();
  assert.ok(Array.isArray(collection.features), "export returned no features array");
  return collection.features.map(toRecord);
}

// Fallback: paginate the records API (100/page). 8,223 < the 10,000 offset cap,
// so full coverage is guaranteed without the export endpoint.
async function fetchViaRecords() {
  const out = [];
  for (let offset = 0; offset < EXPECTED_MAX + 100; offset += 100) {
    const url =
      `${RECORDS_URL}?select=mun_code,mun_name,prov_code,prov_name,acom_code,acom_name,geo_shape` +
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
  if (!existsSync(MUNICIPIO_CACHE_PATH)) return null;
  try {
    const cache = JSON.parse(await readFile(MUNICIPIO_CACHE_PATH, "utf8"));
    assertRecords(cache.municipios);
    return cache;
  } catch (error) {
    console.warn(`cache invalid (${error.message}); refetching`);
    return null;
  }
}

// Exported so the stage/build scripts can load the cache without re-fetching.
export async function loadMunicipioCache() {
  const cache = await loadCache();
  assert.ok(
    cache,
    `municipio cache missing/invalid at ${MUNICIPIO_CACHE_PATH} — run fetch-spain-municipios.mjs first`,
  );
  return cache;
}

async function main() {
  const force = process.argv.includes("--force");
  if (!force) {
    const cache = await loadCache();
    if (cache) {
      console.log(
        `REUSE cache: ${cache.municipios.length} municipios (retrieved ${cache.retrieved_at})`,
      );
      return;
    }
  }
  console.log(`fetching all municipios: ${DATASET}`);
  let features;
  try {
    features = await fetchViaExport();
    console.log(`export endpoint returned ${features.length} features`);
  } catch (error) {
    console.warn(`export failed (${error.message}); falling back to records pagination`);
    features = await fetchViaRecords();
    console.log(`records pagination returned ${features.length} features`);
  }
  // The geojson export emits one feature per polygon, so an island municipio
  // arrives as several same-mun_code features; coalesce to one shape each.
  const records = mergeByMunCode(features);
  console.log(`coalesced ${features.length} features -> ${records.length} municipios`);
  assertRecords(records);
  records.sort((a, b) => a.mun_code.localeCompare(b.mun_code));
  const municipiosJson = JSON.stringify(records);
  const cache = {
    dataset: DATASET,
    dataset_url: `https://public.opendatasoft.com/explore/dataset/${DATASET}/`,
    licence: "IGN/CNIG-derived open data (© IGN/CNIG España)",
    retrieved_at: new Date().toISOString(),
    count: records.length,
    municipios_sha256: sha256hex(Buffer.from(municipiosJson)),
    municipios: records,
  };
  await mkdir(path.dirname(MUNICIPIO_CACHE_PATH), { recursive: true });
  await writeFile(MUNICIPIO_CACHE_PATH, `${JSON.stringify(cache)}\n`);
  console.log(
    `WROTE ${MUNICIPIO_CACHE_PATH}: ${records.length} municipios, sha ${cache.municipios_sha256.slice(0, 12)}`,
  );
}

// Only run the fetch when invoked directly (import for loadMunicipioCache is
// free). Cross-platform entrypoint check — string-building a file:// URL breaks
// on Windows (file:///C:/… vs file://C:/…), so compare resolved fs paths.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
