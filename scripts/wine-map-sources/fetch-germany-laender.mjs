// Cache the 16 German Bundesländer (BKG VG250 via OpenDataSoft
// georef-germany-land) for the national outline dissolve.
//
// Why the Länder and not the 10,949 Gemeinden: both layers come from the same
// BKG base at the same resolution, and the Länder are already dissolved. The
// 16 features carry ~71,600 vertices between them — every bit of the national
// boundary detail — so dissolving 16 polygons produces an identical outline for
// a fraction of the work. (The Gemeinde layer is still the right source if a
// future German tier ever needs municipality unions.)
//
// Usage:  node scripts/wine-map-sources/fetch-germany-laender.mjs
// The cache lands in .tiles-build/sources (gitignored).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DATASET = "georef-germany-land";
const API = `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/${DATASET}/records`;
export const CACHE_PATH = path.resolve(".tiles-build/sources/germany-laender.json");
export const DATASET_URL = `https://public.opendatasoft.com/explore/dataset/${DATASET}/`;
export const LICENCE = "© GeoBasis-DE / BKG (VG250), dl-de/by-2.0";

export async function loadLaenderCache() {
  const raw = await readFile(CACHE_PATH, "utf8");
  return JSON.parse(raw);
}

async function fetchAll() {
  const url = `${API}?limit=100&select=${encodeURIComponent("lan_name,lan_code,geo_shape")}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`${DATASET} HTTP ${res.status}`);
  const json = await res.json();
  const rows = json.results ?? [];
  if (rows.length !== 16) {
    throw new Error(`expected 16 Bundesländer, got ${rows.length}`);
  }
  return rows.map((r) => ({
    code: r.lan_code,
    name: r.lan_name,
    geometry: r.geo_shape?.geometry ?? r.geo_shape,
  }));
}

async function main() {
  const laender = await fetchAll();
  for (const l of laender) {
    if (!l.geometry?.coordinates) throw new Error(`no geometry for ${l.name}`);
  }
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(
    CACHE_PATH,
    JSON.stringify(
      { dataset: DATASET, retrieved: new Date().toISOString(), licence: LICENCE, laender },
      null,
      2,
    ),
  );
  console.log(`cached ${laender.length} Bundesländer -> ${CACHE_PATH}`);
}

// pathToFileURL, not string-building: a Windows path produces `file:///C:/...`
// (three slashes), so a hand-rolled `file://${argv[1]}` never matches and the
// script silently does nothing.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
