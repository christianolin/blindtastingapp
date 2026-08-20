// Cache the Rheinland-Pfalz Weinbergsrolle — the LEGAL vineyard-site boundaries
// (Namen und Grenzen der Einzellagen) published by the Landwirtschaftskammer
// Rheinland-Pfalz via LGB, served as a QGIS WFS.
//
// This one layer is the source for EVERY German tier in RLP, because each
// feature carries its whole ancestry:
//   anbaugebiet -> bereich -> grosslage -> wlg_name (the Einzellage)
// so Anbaugebiet/Bereich/Großlage are dissolves of it, exactly as Spanish DOs
// were unions of municipios.
//
// Facts verified against the live service (2026-08-20):
//   - 1,583 Einzellagen, MultiPolygon, ALREADY WGS84 lon/lat (no reprojection)
//   - one request returns everything (~13.4 MB); COUNT is ignored by the server
//   - wlg_nr is unique across all 1,583 -> the stable source_feature_id
//   - Lage names are NOT unique (Schloßberg x43): keys must include the village
//   - licence dl-de/by-2.0, attribution "©LGB-RLP …, dl-de/by-2-0"
//
// Covers 6 of Germany's 13 Anbaugebiete (Mosel, Rheinhessen, Pfalz, Nahe,
// Mittelrhein, Ahr). The other 7 live in other states and need their own source.
//
// Usage:  node scripts/wine-map-sources/fetch-rlp-weinlagen.mjs [--refresh]

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SERVICE =
  "https://geodaten.lwk-rlp.de/cgi-bin/qgis_mapserv.fcgi" +
  "?MAP=/home/qgis/projects/gg_wfslvermgeo_lokal.qgs&SERVICE=WFS";
export const SOURCE_URL = `${SERVICE}&VERSION=2.0.0&REQUEST=GetFeature&outputFormat=geojson&typeName=weinlagen_recht`;
export const DATASET_URL = "https://open.rlp.de/de/suchergebnisse/dataset/bfd5w-weinlagen1";
export const LICENCE =
  "©LGB-RLP, dl-de/by-2-0, https://www.lgb-rlp.de [Daten bearbeitet]";
export const CACHE_PATH = path.resolve(".tiles-build/sources/rlp-weinlagen.json");

/** The six Anbaugebiete this source covers, as spelled in the data. */
export const RLP_ANBAUGEBIETE = [
  "Ahr",
  "Mittelrhein",
  "Mosel",
  "Nahe",
  "Pfalz",
  "Rheinhessen",
];

export async function loadWeinlagenCache() {
  const gj = JSON.parse(await readFile(CACHE_PATH, "utf8"));
  const features = gj.features ?? [];
  if (features.length === 0) throw new Error("Weinlagen cache is empty");
  return { features, geojson: gj };
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  if (!refresh) {
    try {
      await stat(CACHE_PATH);
      const { features } = await loadWeinlagenCache();
      console.log(`cache hit: ${features.length} Einzellagen (--refresh to re-download)`);
      return;
    } catch {
      /* fall through and fetch */
    }
  }

  console.log("downloading Weinbergsrolle (WFS, ~13 MB)…");
  const res = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(600_000) });
  if (!res.ok) throw new Error(`Weinlagen WFS HTTP ${res.status}`);
  const text = await res.text();
  const gj = JSON.parse(text);
  const features = gj.features ?? [];

  // Fail closed on the two properties everything downstream depends on.
  if (features.length < 1500) {
    throw new Error(`expected ~1583 Einzellagen, got ${features.length}`);
  }
  const nrs = new Set(features.map((f) => f.properties?.wlg_nr));
  if (nrs.size !== features.length) {
    throw new Error(
      `wlg_nr is not unique (${nrs.size} distinct for ${features.length} features) — it is used as the stable id`,
    );
  }
  const missing = features.filter(
    (f) => !f.properties?.anbaugebiet || !f.properties?.wlg_name,
  );
  if (missing.length) {
    throw new Error(`${missing.length} features lack anbaugebiet/wlg_name`);
  }

  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, text);
  const gebiete = [...new Set(features.map((f) => f.properties.anbaugebiet))].sort();
  console.log(
    `cached ${features.length} Einzellagen (${(text.length / 1e6).toFixed(1)} MB) -> ${CACHE_PATH}`,
  );
  console.log(`Anbaugebiete: ${gebiete.join(", ")}`);
}

// argv[1] is undefined under `node -e`, where pathToFileURL would throw — guard
// it so importing this module from an eval context stays harmless.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
