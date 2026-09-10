// Fetch a CAOP administrative layer from the DGT OGC API Features endpoint.
// Portugal's equivalent of the ISTAT comuni file the Italian waves used, but
// already WGS84, so there is no reprojection step. The outputs are large
// (~24 MB for concelhos, ~50 MB for freguesias) and stay out of the repo under
// .tiles-build/; the small dissolved footprints they feed are what gets
// committed.
//
// The endpoint ignores attribute filters like `municipio=`, silently returning
// the whole collection, so there is no point fetching a subset — take the layer
// once and filter locally.
//
// Usage: node scripts/wine-map-sources/fetch-caop.mjs [concelhos|freguesias]
import { mkdir, writeFile } from "node:fs/promises";

const LAYERS = {
  concelhos: {
    collection: "municipios",
    out: ".tiles-build/portugal/concelhos-caop.geojson",
    label: "concelhos",
    source: "Carta Administrativa Oficial de Portugal (CAOP) 2025 — Municípios",
    note: "Mainland concelhos only; Madeira (RAM) and the Azores (RAA) are separate CAOP datasets. Coordinates rounded to 5 decimals.",
    properties: (p) => ({
      name: p.municipio,
      distrito: p.distrito_ilha,
      nuts2: p.nuts2,
      nuts3: p.nuts3,
      dtmn: p.dtmn,
    }),
  },
  freguesias: {
    collection: "freguesias",
    out: ".tiles-build/portugal/freguesias-caop.geojson",
    label: "freguesias",
    source: "Carta Administrativa Oficial de Portugal (CAOP) 2025 — Freguesias",
    note: "Mainland freguesias only. Post-2013 territorial reform, so amalgamated parishes appear under their union name; the pre-2013 names used by the wine statutes are resolved by the concordance in data/wine-map/portugal-freguesia-concordance.json. Coordinates rounded to 5 decimals.",
    properties: (p) => ({
      name: p.freguesia,
      simplified: p.designacao_simplificada,
      concelho: p.municipio,
      distrito: p.distrito_ilha,
      dtmnfr: p.dtmnfr,
      area_ha: p.area_ha,
    }),
  },
};

const which = process.argv[2] ?? "concelhos";
const layer = LAYERS[which];
if (!layer) throw new Error(`unknown layer ${which}; expected ${Object.keys(LAYERS).join("|")}`);

const BASE = `https://ogcapi.dgterritorio.gov.pt/collections/${layer.collection}/items`;
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
console.log(`\n  total: ${features.length} ${layer.label} (expected ${matched})`);
if (features.length !== matched) throw new Error("incomplete fetch");

// Round to 5dp — same precision as every other boundary artifact in the repo.
const r5 = (n) => Math.round(n * 1e5) / 1e5;
const round = (c) => (typeof c[0] === "number" ? [r5(c[0]), r5(c[1])] : c.map(round));

const out = {
  type: "FeatureCollection",
  _provenance: {
    source: layer.source,
    authority: "Direção-Geral do Território (DGT)",
    service: `OGC API Features https://ogcapi.dgterritorio.gov.pt/collections/${layer.collection}`,
    record: "https://dados.gov.pt/en/datasets/carta-administrativa-oficial-de-portugal-caop2025-continente/",
    licence: "CC BY 4.0",
    attribution: "Direção-Geral do Território",
    crs: "OGC:CRS84 (WGS84 lon/lat) as served — no reprojection applied",
    retrieved: "2026-09-10",
    note: layer.note,
  },
  features: features.map((f) => ({
    type: "Feature",
    properties: layer.properties(f.properties),
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
  })),
};
await mkdir(".tiles-build/portugal", { recursive: true });
await writeFile(layer.out, JSON.stringify(out));
console.log(`  wrote ${layer.out}`);
