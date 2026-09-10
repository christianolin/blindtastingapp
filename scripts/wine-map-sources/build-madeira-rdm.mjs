// Regiao Demarcada da Madeira footprint: dissolve the 11 CAOP 2025 RAM
// municipios and keep the two inhabited islands (Madeira, Porto Santo), which
// is exactly the DO area per IVBAM ("abrange as ilhas da Madeira e do Porto
// Santo"). The dissolve also yields the uninhabited Desertas and Selvagens
// islet groups, which carry no vineyard and are not in the DO wording.
// Usage: node scripts/wine-map-sources/build-madeira-rdm.mjs
// Wave 1 was run from .tiles-build/portugal/, which is the path recorded in
// the snapshots' importer_version; the script is tracked here so the wave is
// reproducible. Later waves should run it from this path.
import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const RAW = ".tiles-build/portugal/ram-municipios-raw.json";
const OUT = "data/wine-map/madeira-rdm-caop.geojson";
const src = JSON.parse(await readFile(RAW, "utf8"));
if (src.features.length !== 11) throw new Error(`expected 11 RAM municipios, got ${src.features.length}`);

const tmpIn = ".tiles-build/portugal/_madeira-in.geojson";
const tmpOut = ".tiles-build/portugal/_madeira-out.geojson";
await writeFile(tmpIn, JSON.stringify({ type: "FeatureCollection", features: src.features.map((f) => ({ type: "Feature", properties: {}, geometry: f.geometry })) }));
execSync(`npx mapshaper "${tmpIn}" -dissolve2 -simplify percentage=6% keep-shapes -o precision=0.00001 "${tmpOut}"`, { stdio: "pipe" });
const dis = JSON.parse(await readFile(tmpOut, "utf8"));
const g = dis.type === "GeometryCollection" ? dis.geometries[0]
      : dis.type === "FeatureCollection" ? dis.features[0].geometry
      : dis.type === "Feature" ? dis.geometry : dis;

const r5 = (x) => Math.round(x * 1e5) / 1e5;
const shoelace = (r) => { let a = 0; for (let i = 0, n = r.length - 1; i < n; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };
const all = (g.type === "Polygon" ? [g.coordinates] : g.coordinates)
  .map((poly) => [poly[0].map(([a, b]) => [r5(a), r5(b)])])
  .sort((a, b) => shoelace(b[0]) - shoelace(a[0]));

const kept = all.slice(0, 2);
// Guard the identification rather than trusting the sort: Madeira ~741 km2,
// Porto Santo ~42 km2, the next part (Deserta Grande) is an order smaller.
const bbox = (poly) => poly[0].reduce((o, [x, y]) => [Math.min(o[0], x), Math.min(o[1], y), Math.max(o[2], x), Math.max(o[3], y)], [180, 90, -180, -90]);
const [madeira, portoSanto] = kept.map(bbox);
if (!(madeira[0] < -17.2 && madeira[2] > -16.7 && madeira[1] > 32.6 && madeira[3] < 32.9)) throw new Error(`largest part is not Madeira island: ${madeira}`);
if (!(portoSanto[0] > -16.5 && portoSanto[2] < -16.2 && portoSanto[1] > 32.9 && portoSanto[3] < 33.2)) throw new Error(`second part is not Porto Santo: ${portoSanto}`);
if (shoelace(all[2][0]) > shoelace(kept[1][0]) / 4) throw new Error("third part is too large to be an uninhabited islet");

const verts = kept.flat(2);
await writeFile(OUT, JSON.stringify({
  type: "Feature",
  properties: {
    source: "CAOP 2025 (RAM) municipios, dissolved",
    authority: "Direção-Geral do Território (DGT)",
    licence: "CC BY 4.0",
    attribution: "Direção-Geral do Território",
    service: "https://geo2.dgterritorio.gov.pt/geoserver/caop_ram/wfs (caop_ram:ram_municipios, EPSG:4326)",
    record: "https://dados.gov.pt/en/datasets/carta-administrativa-oficial-de-portugal-caop2025-ram/",
    method: "Union of the 11 RAM municipios, reduced to the islands of Madeira and Porto Santo (the DO Madeira / DO Madeirense / IG Terras Madeirenses area per IVBAM). mapshaper 6% Visvalingam simplify with keep-shapes, interior rings dropped, 5dp.",
    retrieved: "2026-09-10",
  },
  geometry: { type: "MultiPolygon", coordinates: kept },
}) + "\n");
console.log(`WROTE ${OUT} parts=${kept.length} verts=${verts.length} madeira=[${madeira}] portosanto=[${portoSanto}] dropped=${all.length - 2}`);
