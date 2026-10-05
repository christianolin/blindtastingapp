// The coarse sea the footprint cleanup's "keep water out" rule reads (owner
// 2026-10-03: "Keep water out (Recommended)" — "Never fill across water:
// gap-closing only bridges land."). READ-ONLY: the geometry work runs in one
// read-only transaction (nothing is written live); the output is the committed
// data/wine-map/footprint-water-ne50m.json, which footprint-sql.mjs
// renderMigrationA() loads into public.wine_footprint_water.
//
// Source: Natural Earth 1:50m admin_0_countries_lakes, the copy already cached
// for the USA base (ne_commit pinned below; no download here: pass the cached
// file with --ne). Land = the union of every country polygon that meets an area
// of interest, its interior rings dropped (a lake is not sea: lakes stay land, so
// Bodensee, Garda or the Great Lakes never count as water); sea = the area of
// interest minus that land, cut into pieces of at most 256 vertices on the 1e-5°
// grid. It is coarse (1:50m, typically 0.3-5 km off the real shore): the rule
// therefore gives it a wide reach (PARAMS.water_reach_m) and uses the national
// outline (about 150 m) for the exact shore; see footprint-sql.mjs.
//
//   node scripts/wine-map-sources/build-footprint-water.mjs --ne <ne_50m_admin_0_countries_lakes.geojson>
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { withReadOnly } from "./read-only-client.mjs";

export const WATER_FILE = "data/wine-map/footprint-water-ne50m.json";
export const NE_COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19";
// Europe (Madeira and the Azores included) and the contiguous USA.
export const AOI = Object.freeze({ europe: [-32, 27, 22, 57], usa: [-128, 23, -64, 51] });

const bboxOf = (g) => {
  const b = [180, 90, -180, -90];
  const walk = (c) => {
    if (typeof c[0] === "number") { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); } else c.forEach(walk);
  };
  walk(g.coordinates);
  return b;
};
const meet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

async function main() {
  const i = process.argv.indexOf("--ne");
  if (i === -1) throw new Error("pass the cached Natural Earth file with --ne <path>");
  const text = await readFile(process.argv[i + 1], "utf8");
  const ne = JSON.parse(text);
  const rows = [];
  await withReadOnly(async (c) => {
    await c.query("set local search_path = public, extensions");
    for (const [name, box] of Object.entries(AOI)) {
      const fs = ne.features.filter((f) => meet(bboxOf(f.geometry), box));
      const { rows: out } = await c.query(`
        with f as (select st_makevalid(st_setsrid(st_geomfromgeojson(x->>'geometry'), 4326)) g from jsonb_array_elements($1::jsonb) x),
        land as (select st_unaryunion(st_collect(g)) g from f),
        filled as (select st_unaryunion(st_collect(st_makepolygon(st_exteriorring(d.geom)))) g from land, st_dump(land.g) d),
        sea as (select st_collectionextract(st_reduceprecision(st_difference(st_makeenvelope($2, $3, $4, $5, 4326), filled.g), 0.00001), 3) g from filled)
        select encode(st_asewkb(d.geom), 'hex') hex from sea, st_subdivide(sea.g, 256) d(geom)
         order by st_xmin(d.geom), st_ymin(d.geom), st_xmax(d.geom), st_ymax(d.geom)`, [JSON.stringify(fs), ...box]);
      console.log(`${name}: ${fs.length} countries, ${out.length} sea pieces`);
      for (const r of out) rows.push({ aoi: name, hex: r.hex });
    }
  }, { statementTimeoutMs: 300000 });
  const doc = {
    _provenance: {
      what: "Sea (not lakes) around the wine map's countries, for footprint-sql.mjs's keep-water-out rule",
      source: "Natural Earth 1:50m admin_0_countries_lakes (public domain)",
      ne_commit: NE_COMMIT,
      source_sha256: createHash("sha256").update(text).digest("hex"),
      aoi: AOI,
      method: "AOI minus the union of every country meeting it (interior rings dropped: lakes are land); ST_ReducePrecision 1e-5; ST_Subdivide 256",
      built_by: "scripts/wine-map-sources/build-footprint-water.mjs (read-only)",
    },
    rows: rows.map((r, k) => ({ id: k + 1, aoi: r.aoi, hex: r.hex })),
  };
  await writeFile(WATER_FILE, `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`wrote ${WATER_FILE}: ${doc.rows.length} pieces`);
}

if (import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}` || process.argv[1]?.endsWith("build-footprint-water.mjs")) await main();
