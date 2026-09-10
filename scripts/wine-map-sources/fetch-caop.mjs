// Fetch CAOP municipios (concelhos) from the DGT OGC API Features endpoint.
// Portugal's equivalent of the ISTAT comuni file the Italian waves used, but
// already WGS84, so there is no reprojection step. The output is ~24 MB and
// stays out of the repo under .tiles-build/; the small dissolved footprints it
// feeds are what gets committed.
//   node .tiles-build/portugal/fetch-caop.mjs
import { writeFile } from "node:fs/promises";

const BASE = "https://ogcapi.dgterritorio.gov.pt/collections/municipios/items";
const PAGE = 200;
const features = [];
let offset = 0, matched = null;

for (;;) {
  const url = `${BASE}?f=json&limit=${PAGE}&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CAOP fetch failed: ${res.status} at offset ${offset}`);
  const page = await res.json();
  matched ??= page.numberMatched;
  features.push(...(page.features ?? []));
  process.stdout.write(`  fetched ${features.length}/${matched}\r`);
  if (!page.features?.length || features.length >= matched) break;
  offset += PAGE;
}
console.log(`\n  total: ${features.length} concelhos (expected ${matched})`);
if (features.length !== matched) throw new Error("incomplete fetch");

// Round to 5dp — same precision as every other boundary artifact in the repo.
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const round = (c) => (typeof c[0] === "number" ? [r5(c[0]), r5(c[1])] : c.map(round));

const out = {
  type: "FeatureCollection",
  _provenance: {
    source: "Carta Administrativa Oficial de Portugal (CAOP) 2025 — Municípios",
    authority: "Direção-Geral do Território (DGT)",
    service: "OGC API Features https://ogcapi.dgterritorio.gov.pt/collections/municipios",
    record: "https://dados.gov.pt/en/datasets/carta-administrativa-oficial-de-portugal-caop2025-continente/",
    licence: "CC BY 4.0",
    attribution: "Direção-Geral do Território",
    crs: "OGC:CRS84 (WGS84 lon/lat) as served — no reprojection applied",
    retrieved: "2026-09-10",
    note: "Mainland concelhos only; Madeira (RAM) and the Azores (RAA) are separate CAOP datasets. Coordinates rounded to 5 decimals.",
  },
  features: features.map((f) => ({
    type: "Feature",
    properties: {
      name: f.properties.municipio,
      distrito: f.properties.distrito_ilha,
      nuts2: f.properties.nuts2,
      nuts3: f.properties.nuts3,
      dtmn: f.properties.dtmn,
    },
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
  })),
};
await writeFile(".tiles-build/portugal/concelhos-caop.geojson", JSON.stringify(out));
console.log(`  wrote .tiles-build/portugal/concelhos-caop.geojson`);
