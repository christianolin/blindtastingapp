// Extract Baden and Württemberg for build-germany-weinbau.mjs.
//
// Two files per region, in the shape that builder already reads:
//   <region>-areas.tsv   key \t srid \t geojson   the member Gemarkungen
//   rebflaeche.tsv       srid \t geojson          every recorded vineyard parcel
//
// WHY BADEN-WÜRTTEMBERG NEEDS ITS OWN EXTRACTOR.
//
// Franken's specification names Gemeinden and Saale-Unstrut's names Landkreise,
// so for those the named unit IS the area to clip against and the membership
// list is the whole story. Baden and Württemberg are different: they share a
// state, their boundary runs between neighbouring villages and sometimes
// between two Gemarkungen of the SAME village -- Eppingen is Baden and its own
// Kleingartach is Württemberg -- and the flat name lists in the specifications
// cannot express that. Twelve names appear in both lists.
//
// So membership here is resolved to Gemarkung level first, in .tiles-build, from
// the 1983 Rechtsverordnungen that delimit the two regions, cross-checked
// against the current specifications. bw-membership.json is that result. This
// script only turns it into geometry.
//
// Run first (all in .tiles-build, none of it in the repo):
//   the LGL ALKIS register    -> gemarkung.geojson
//   the ATKIS Rebfläche class -> rebflaeche.gpkg
//   node .tiles-build/bw-assign-merged.mjs     the ordinance -> Gemarkungen
//   node .tiles-build/bw-propagate.mjs         unnamed Gemarkungen of a unanimous Gemeinde
//   node .tiles-build/bw-area-coverage.mjs     vineyard hectares per Gemarkung
//   node .tiles-build/bw-finalise.mjs          membership, using those hectares
//
// Usage: node scripts/wine-map-sources/extract-bw-weinbau.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";

const B = ".tiles-build/sources/bw";
const SRID_REG = 4326;   // the LGL register export
const SRID_VINE = 25832; // ATKIS, UTM zone 32N

// ---- areas ------------------------------------------------------------------
const mem = JSON.parse(readFileSync(`${B}/bw-membership.json`, "utf8")).membership;
const gj = JSON.parse(readFileSync(`${B}/gemarkung.geojson`, "utf8"));

const out = { baden: [], wuerttemberg: [] };
let seen = 0;
for (const f of gj.features) {
  const id = String(f.properties.gemarkung_id);
  const m = mem[id];
  if (!m) continue;
  seen++;
  out[m.region].push(`${id}\t${SRID_REG}\t${JSON.stringify(f.geometry)}`);
}
assert.equal(seen, Object.keys(mem).length,
  `${seen} member Gemarkungen found in the register for ${Object.keys(mem).length} in the membership`);

for (const [slug, lines] of Object.entries(out)) {
  writeFileSync(`${B}/${slug}-areas.tsv`, lines.join("\n") + "\n");
  console.log(`${slug}: ${lines.length} Gemarkungen -> ${slug}-areas.tsv`);
}

// ---- vineyard parcels -------------------------------------------------------
// A GeoPackage geometry is a small header followed by ordinary WKB. Strip the
// header, then read the WKB here rather than sending it through PostGIS, so this
// extractor stays offline like its Bavarian and Saale-Unstrut siblings.
const ENV = [0, 32, 48, 48, 64];

// WKB carries its byte order in its first byte, and EVERY geometry carries its
// own -- including each Polygon inside a MultiPolygon. This file is big-endian
// throughout (its flags byte is 0x02 and its srs_id reads 25832 only when read
// big-endian), which is easy to miss because PostGIS accepts either silently:
// the same bytes went through ST_GeomFromWKB for the coverage measurement
// without complaint. Read the flag rather than assuming.
function readWkb(buf) {
  let o = 0, be = false;
  const u32 = () => { const v = be ? buf.readUInt32BE(o) : buf.readUInt32LE(o); o += 4; return v; };
  const f64 = (at) => (be ? buf.readDoubleBE(at) : buf.readDoubleLE(at));
  const order = () => {
    const b = buf.readUInt8(o); o += 1;
    assert.ok(b === 0 || b === 1, `WKB byte-order flag is ${b}`);
    be = b === 0;
  };
  const ring = () => {
    const n = u32(); const pts = new Array(n);
    for (let i = 0; i < n; i++) { pts[i] = [f64(o), f64(o + 8)]; o += 16; }
    return pts;
  };
  const poly = () => { const n = u32(); return Array.from({ length: n }, ring); };
  order();
  const type = u32();
  if (type === 3) return { type: "Polygon", coordinates: poly() };
  if (type === 6) {
    const n = u32();
    return { type: "MultiPolygon", coordinates: Array.from({ length: n }, () => {
      order();
      assert.equal(u32(), 3, "MultiPolygon member is not a Polygon");
      return poly();
    }) };
  }
  throw new Error(`unexpected WKB geometry type ${type}`);
}

const db = new DatabaseSync(`${B}/rebflaeche.gpkg`, { readOnly: true });
const rows = db.prepare("select geom from v_vegetationsflaeche").all();
const vines = rows.map((r) => {
  const blob = Buffer.from(r.geom);
  return readWkb(blob.subarray(8 + ENV[(blob[3] >> 1) & 7]));
});

// Planar area in UTM metres, purely as a check that the parsing is right: the
// same layer measured 33 468 ha through PostGIS. A silent misparse would show
// up here as a wildly different number rather than as a wrong map months later.
const ringArea = (r) => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return s / 2;
};
const polyArea = (p) => p.reduce((s, r, i) => s + (i === 0 ? Math.abs(ringArea(r)) : -Math.abs(ringArea(r))), 0);
const ha = vines.reduce((s, g) =>
  s + (g.type === "Polygon" ? polyArea(g.coordinates) : g.coordinates.reduce((t, p) => t + polyArea(p), 0)), 0) / 1e4;
console.log(`vineyard: ${vines.length} parcels, ${Math.round(ha)} ha`);
assert.ok(Math.abs(ha - 33468) < 400, `parsed ${Math.round(ha)} ha, expected about 33468`);

writeFileSync(`${B}/rebflaeche.tsv`,
  vines.map((g) => `${SRID_VINE}\t${JSON.stringify(g)}`).join("\n") + "\n");
console.log(`wrote rebflaeche.tsv`);
