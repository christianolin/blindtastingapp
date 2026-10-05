// The coarse sea the footprint cleanup's "keep water out" rule reads (owner
// 2026-10-03: "Keep water out (Recommended)" — "Never fill across water:
// gap-closing only bridges land."). READ-ONLY: the geometry work runs in one
// read-only transaction (nothing is written live); the output is the committed
// data/wine-map/footprint-water-ne50m.json, which footprint-sql.mjs
// renderMigrationW() loads into public.wine_footprint_water.
//
// Source: Natural Earth 1:50m admin_0_countries_lakes, the copy already cached
// for the USA base (ne_commit pinned below; no download here: pass the cached
// file with --ne). Land = the union of every country polygon that meets an area
// of interest, its interior rings dropped (a lake is not sea: lakes stay land, so
// Bodensee, Garda, the Great Lakes, the IJsselmeer or the Caspian never count as
// water); sea = the area of interest minus that land, cut into pieces of at most
// 256 vertices on the 1e-5° grid. It is coarse (1:50m, typically 0.3-5 km off the
// real shore): the rule therefore gives it a wide reach (PARAMS.water_reach_m) and
// uses the national outline (about 150 m) for the exact shore; see footprint-sql.mjs.
//
// Coverage (review 2026-10-05): the sea used to exist only for Europe and the
// contiguous USA, so outside those two boxes the rule switched itself off with a
// stamp that read like "no water nearby". The AOIs now tile the whole band
// COVERAGE (every latitude where wine grows, |lat| <= 57: within it 0.25° of
// longitude, the context's sea reach, is at least coast_band_m), and the step
// REFUSES a place whose box plus that reach leaves the band (footprint-sql.mjs
// water_covered). europe and usa are kept as they were (ids 1-70, byte for byte),
// "world" is the rest of the band.
//
//   node scripts/wine-map-sources/build-footprint-water.mjs --ne <ne_50m_admin_0_countries_lakes.geojson>
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { withReadOnly } from "./read-only-client.mjs";

export const WATER_FILE = "data/wine-map/footprint-water-ne50m.json";
export const NE_COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19";
/** Every place the step cleans must lie (box plus the sea reach) inside this band. */
export const COVERAGE = Object.freeze([-180, -57, 180, 57]);
// Europe (Madeira and the Azores included), the contiguous USA, then the rest of the band.
export const AOI = Object.freeze({
  europe: [-32, 27, 22, 57],
  usa: [-128, 23, -64, 51],
  world: { box: COVERAGE, minus: ["europe", "usa"] },
});
/** Points the build asserts are sea (an enclosed sea filled as a "lake" would silently switch the rule off there). */
export const SEA_PROBES = Object.freeze({
  "Black Sea": [34, 43], "Sea of Azov": [36.5, 46], "Sea of Marmara": [28, 40.75], "Aegean off Santorini": [25.6, 36.6],
  "Eastern Mediterranean off Cyprus": [33, 34.3], "Gulf of St. Lawrence": [-63, 47.5], "Off Cape Town": [18, -34.5],
  "Off Adelaide": [138.2, -35], "Cook Strait": [174.5, -41.3], "Off Valparaíso": [-72, -33], "Off Hawaii": [-157.5, 21],
});
/** Water the build asserts is land (lakes are land to the rule). */
export const LAND_PROBES = Object.freeze({ Caspian: [50.5, 41.9], "Lake Superior": [-87.5, 47.6], Bodensee: [9.33, 47.65] });

const bboxOf = (g) => {
  const b = [180, 90, -180, -90];
  const walk = (c) => {
    if (typeof c[0] === "number") { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); } else c.forEach(walk);
  };
  walk(g.coordinates);
  return b;
};
const meet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const env = (b) => `st_makeenvelope(${b.map(Number).join(", ")}, 4326)`;

async function main() {
  const i = process.argv.indexOf("--ne");
  if (i === -1) throw new Error("pass the cached Natural Earth file with --ne <path>");
  const text = await readFile(process.argv[i + 1], "utf8");
  const ne = JSON.parse(text);
  const rows = [];
  await withReadOnly(async (c) => {
    await c.query("set local search_path = public, extensions");
    for (const [name, spec] of Object.entries(AOI)) {
      const box = Array.isArray(spec) ? spec : spec.box;
      const area = Array.isArray(spec) ? env(box) : `st_difference(${env(box)}, st_union(array[${spec.minus.map((m) => env(AOI[m])).join(", ")}]))`;
      const fs = ne.features.filter((f) => meet(bboxOf(f.geometry), box));
      const { rows: out } = await c.query(`
        with f as (select st_makevalid(st_setsrid(st_geomfromgeojson(x->>'geometry'), 4326)) g from jsonb_array_elements($1::jsonb) x),
        land as (select st_unaryunion(st_collect(g)) g from f),
        filled as (select st_unaryunion(st_collect(st_makepolygon(st_exteriorring(d.geom)))) g from land, st_dump(land.g) d),
        sea as (select st_collectionextract(st_reduceprecision(st_difference(${area}, filled.g), 0.00001), 3) g from filled)
        select encode(st_asewkb(d.geom), 'hex') hex from sea, st_subdivide(sea.g, 256) d(geom)
         order by st_xmin(d.geom), st_ymin(d.geom), st_xmax(d.geom), st_ymax(d.geom)`, [JSON.stringify(fs)]);
      console.log(`${name}: ${fs.length} countries, ${out.length} sea pieces`);
      for (const r of out) rows.push({ aoi: name, hex: r.hex });
    }
    // the probes, against the pieces just built
    const hexes = JSON.stringify(rows.map((r) => r.hex));
    const wet = async ([x, y]) => (await c.query(
      `select exists (select 1 from jsonb_array_elements_text($1::jsonb) h
                       where st_intersects(st_geomfromewkb(decode(h, 'hex')), st_setsrid(st_point($2, $3), 4326))) wet`, [hexes, x, y])).rows[0].wet;
    for (const [n, p] of Object.entries(SEA_PROBES)) if (!(await wet(p))) throw new Error(`probe ${n} ${p} is not sea`);
    for (const [n, p] of Object.entries(LAND_PROBES)) if (await wet(p)) throw new Error(`probe ${n} ${p} is sea (lakes are land)`);
    console.log(`probes: ${Object.keys(SEA_PROBES).length} sea, ${Object.keys(LAND_PROBES).length} land: ok`);
  }, { statementTimeoutMs: 300000 });
  const doc = {
    _provenance: {
      what: "Sea (not lakes) over every latitude where wine grows, for footprint-sql.mjs's keep-water-out rule",
      source: "Natural Earth 1:50m admin_0_countries_lakes (public domain)",
      ne_commit: NE_COMMIT,
      source_sha256: createHash("sha256").update(text).digest("hex"),
      aoi: AOI,
      coverage: COVERAGE,
      method: "per AOI: the AOI minus the union of every country meeting it (interior rings dropped: lakes are land); ST_ReducePrecision 1e-5; ST_Subdivide 256. world = COVERAGE minus the europe and usa boxes",
      probes: { sea: SEA_PROBES, land: LAND_PROBES },
      built_by: "scripts/wine-map-sources/build-footprint-water.mjs (read-only)",
    },
    rows: rows.map((r, k) => ({ id: k + 1, aoi: r.aoi, hex: r.hex })),
  };
  // europe and usa must come back exactly as committed (the 2026-10-05 coastal recompute was made with them)
  try {
    const prior = JSON.parse(await readFile(WATER_FILE, "utf8"));
    const kept = prior.rows.filter((r) => r.aoi === "europe" || r.aoi === "usa");
    const same = kept.every((r, k) => doc.rows[k]?.id === r.id && doc.rows[k].aoi === r.aoi && doc.rows[k].hex === r.hex);
    console.log(`europe + usa pieces ${same ? "unchanged" : "CHANGED"} against the committed file (${kept.length})`);
  } catch { /* no prior file */ }
  await writeFile(WATER_FILE, `${JSON.stringify(doc, null, 1)}\n`);
  console.log(`wrote ${WATER_FILE}: ${doc.rows.length} pieces`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("build-footprint-water.mjs")) await main();
