// Portugal concelho-union dissolver. Reads the pinned CAOP 2025 concelhos file
// and, for each footprint (slug -> concelho list), selects members by
// normalized name match, dissolves them, drops interior rings, rounds 5dp and
// writes data/wine-map/portugal-concelhos-dissolved.geojson.
// CRITICAL: any concelho name that does not match is reported and aborts.
// Usage: node scripts/wine-map-sources/build-portugal-concelho-union.mjs data/wine-map/portugal-do-membership.json
// Wave 1 was run from .tiles-build/portugal/, which is the path recorded in
// the snapshots' importer_version; the script is tracked here so the wave is
// reproducible. Later waves should run it from this path.
import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const cfg = JSON.parse(await readFile(process.argv[2], "utf8"));
const SRC = ".tiles-build/portugal/concelhos-caop.geojson";
const CONCELHOS = JSON.parse(await readFile(SRC, "utf8"));

const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/['’`.]/g, "").replace(/\s+/g, " ").trim();

const byName = new Map();
for (const f of CONCELHOS.features) byName.set(norm(f.properties.name), f);

const r5 = (x) => Math.round(x * 1e5) / 1e5;
const MIN_PART_AREA_DEG2 = 1e-5; // ~0.1 km2 at these latitudes
const outFeatures = [];
let hadError = false;

for (const [slug, spec] of Object.entries(cfg.footprints)) {
  const feats = [];
  const missing = [];
  for (const c of spec.concelhos) {
    const f = byName.get(norm(c));
    if (!f) { missing.push(c); continue; }
    feats.push(f);
  }
  if (missing.length) { console.error(`[${slug}] UNMATCHED: ${missing.join(" | ")}`); hadError = true; continue; }
  const tmpIn = `.tiles-build/portugal/_${slug}-in.geojson`;
  const tmpOut = `.tiles-build/portugal/_${slug}-out.geojson`;
  await writeFile(tmpIn, JSON.stringify({ type: "FeatureCollection", features: feats.map((f) => ({ type: "Feature", properties: {}, geometry: f.geometry })) }));
  execSync(`npx mapshaper "${tmpIn}" -dissolve2 -simplify percentage=6% keep-shapes -o precision=0.00001 "${tmpOut}"`, { stdio: "pipe" });
  const dis = JSON.parse(await readFile(tmpOut, "utf8"));
  const g = dis.type === "GeometryCollection" ? dis.geometries[0]
        : dis.type === "FeatureCollection" ? dis.features[0].geometry
        : dis.type === "Feature" ? dis.geometry : dis;
  const rings = (poly) => [poly[0].map(([a, b]) => [r5(a), r5(b)])];
  const shoelace = (r) => { let a = 0; for (let i = 0, n = r.length - 1; i < n; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };
  const all = g.type === "Polygon" ? [rings(g.coordinates)] : g.coordinates.map(rings);
  // Estuary sandbanks and offshore islets survive the dissolve as sub-0.1 km2
  // parts that carry vertices but no visible fill. Keep them only if something
  // would otherwise disappear.
  const polys = all.filter((poly) => shoelace(poly[0]) >= MIN_PART_AREA_DEG2);
  if (polys.length === 0) polys.push(all.sort((a, b) => shoelace(b[0]) - shoelace(a[0]))[0]);
  if (polys.length !== all.length) console.log(`[${slug}] dropped ${all.length - polys.length} sliver part(s) < ${MIN_PART_AREA_DEG2} deg2`);
  const verts = polys.flat(2);
  const bb = verts.reduce((o, [x, y]) => ({ mnx: Math.min(o.mnx, x), mny: Math.min(o.mny, y), mxx: Math.max(o.mxx, x), mxy: Math.max(o.mxy, y) }), { mnx: 1e9, mny: 1e9, mxx: -1e9, mxy: -1e9 });
  outFeatures.push({ type: "Feature", properties: { name: slug, concelho_count: feats.length, legal: spec.legal ?? null }, geometry: { type: "MultiPolygon", coordinates: polys } });
  console.log(`[${slug}] concelhos=${feats.length} parts=${polys.length} verts=${verts.length} bbox=[${r5(bb.mnx)},${r5(bb.mny)},${r5(bb.mxx)},${r5(bb.mxy)}]`);
}

if (hadError) { console.error("ABORT: unmatched concelhos — fix names before writing artifact."); process.exit(1); }

const outPath = "data/wine-map/portugal-concelhos-dissolved.geojson";
const fc = {
  type: "FeatureCollection",
  _provenance: {
    authority: "Direção-Geral do Território — CAOP 2025 (concelho geometry) / IVV, IVDP, CVR disciplinari (concelho membership)",
    licence: "CC BY 4.0",
    attribution: "Direção-Geral do Território",
    method: "concelho-union: CAOP 2025 municipios dissolved per the legal area definitions (concelho-level approximation; mapshaper 6% Visvalingam simplify with keep-shapes, interior rings dropped, 5dp, parts under ~0.1 km2 dropped). Concelhos included in part by the legal text are included whole.",
    reviewed_at: "2026-09-10",
  },
  features: outFeatures,
};
await writeFile(outPath, JSON.stringify(fc));
console.log(`WROTE ${outPath} (${outFeatures.length} features)`);
