// Build a German Anbaugebiet footprint: vineyard land clipped to the areas its
// product specification names, then closed for region display.
//
// Same division of labour as the Hessian build, and for the same reason:
//
//   the specification  decides WHICH AREAS carry the Rebflächen
//                      (germany-weinbau-membership.json, from eAmbrosia)
//   ATKIS / ALKIS      decide WHICH LAND inside them is vineyard
//
// "Areas" rather than "Gemeinden" because the specifications do not agree on a
// level. Franken names 138 Gemeinden. Saale-Unstrut names ten Landkreise, two
// kreisfreie Städte, two Ortsteile of Weimar and four Gemarkungen of Stadt
// Werder (Havel) in Brandenburg, 90 km from the rest. The clip is what makes
// that safe: naming a Landkreis would be unusable as a footprint on its own.
//
// The specification is explicit that a Gemeinde is not the zone: the area is
// those Gemeinden' vineyard land "wenn ihre Eignung zur Erzeugung von
// Qualitätswein festgestellt wird". Franken names 138 Gemeinden across twelve
// Landkreise and three Regierungsbezirke, from Aschaffenburg to Bamberg -- a
// whole-Gemeinde union of that is most of northern Bavaria.
//
// The close (buffer out, then most of the way back) is the same operation and
// the same constants build-germany-anbaugebiete.mjs applies to the six
// Rheinland-Pfalz regions. It inflates area deliberately: scattered parcels are
// not a readable region outline, and a raw clip would render as a speckle field
// beside neighbours drawn as solids. Planted extent is kept separately, and is
// what the promotion migration checks.
//
// Run first:
//   node   scripts/wine-map-sources/fetch-germany-specs.mjs
//   python scripts/wine-map-sources/fetch-bayern-atkis.py
//   python scripts/wine-map-sources/extract-bayern-weinbau.py
//   node   scripts/wine-map-sources/fetch-saale-unstrut.mjs
//   python scripts/wine-map-sources/extract-saale-unstrut.py
//
// Usage: node scripts/wine-map-sources/build-germany-weinbau.mjs [--write]
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import assert from "node:assert/strict";
import pg from "pg";

const MEMBERSHIP = "data/wine-map/germany-weinbau-membership.json";
const OUT = "data/wine-map/germany-weinbau-dissolved.geojson";
const write = process.argv.includes("--write");

// Matching build-germany-anbaugebiete.mjs exactly; see its header for the
// measured effect on the Rheinland-Pfalz regions.
const CLOSE = 0.012;
const CLOSE_BACK = 0.008;

// Drop a closed part holding less than this much PLANTED vineyard.
//
// The close knits dense parcel fields into solids -- that is why Mosel is three
// parts and Rheinhessen one. It cannot do the same for vineyards that are
// genuinely far apart, and Franken's run from Aschaffenburg to Bamberg: it came
// out as 87 parts and Saale-Unstrut as 43, rendering as a speckle field beside
// neighbours drawn as solids. The exact thing this builder's close exists to
// prevent, arriving by a route the close cannot reach.
//
// Raising CLOSE instead was measured and rejected. Saale-Unstrut already shows
// 103 km² for 894 ha of vines; the close that got it to 17 parts showed 266 km²,
// roughly thirty times its planted extent, and still left a speckle.
//
// The threshold is on planted hectares, NOT on the displayed part's area, which
// is inflated by the close and inflated unevenly -- a part's display area says
// more about how its parcels happen to cluster than about how much vineyard is
// in it. Measured at 5 ha, this drops 46 of Franken's 87 parts for 0.8% of its
// vineyard, and 24 of Saale-Unstrut's 43 for 4.4% of its own. What goes is
// dust: single parcels of a hectare or two, tens of kilometres from the body of
// the region, that carry a whole Anbaugebiet's colour on the map.
const MIN_PLANTED_HA = 5;

// Region -> where its extracted geometry landed, and how to read it.
//
// The two adapters do not share a file format, because the sources do not share
// one. Bavaria's ATKIS arrives as a GeoPackage, so its extractor hands over the
// WKB it already holds and the SRID is a property of the whole state. Saale-
// Unstrut is assembled from shapefiles in three states, two of them in UTM 32N
// and Brandenburg in 33N, so its rows carry their own SRID and their geometry
// as GeoJSON — pyshp groups the shapefile rings and PostGIS parses the result,
// which keeps a ring-winding heuristic out of this repo.
//
// `areas` is deliberately not called `gemeinden`. Franken's containment units
// are Gemeinden; Saale-Unstrut's are Landkreise, two Weimar Ortsteile and four
// Brandenburg Gemarkungen. What they have in common is that the specification
// names them and the vineyard land inside them is the region.
const SOURCES = {
  franken: {
    name: "Franken",
    state: "Bayern",
    areas: ".tiles-build/sources/bayern/franken-gemeinden.tsv",
    vineyards: ".tiles-build/sources/bayern/rebflaeche.wkb",
    format: "wkb",
    srid: 25832,
    attribution: "Datenquelle: Bayerische Vermessungsverwaltung - www.geodaten.bayern.de",
    licence: "CC BY 4.0",
  },
  "saale-unstrut": {
    name: "Saale-Unstrut",
    state: "Sachsen-Anhalt / Thüringen / Brandenburg",
    areas: ".tiles-build/sources/saale-unstrut/areas.tsv",
    vineyards: ".tiles-build/sources/saale-unstrut/rebflaeche.tsv",
    format: "geojson",
    attribution: "© GeoBasis-DE / LVermGeo Sachsen-Anhalt, GDI-Th / TLBG Thüringen, "
      + "LGB Brandenburg — ATKIS Basis-DLM und ALKIS",
    licence: "Datenlizenz Deutschland — Namensnennung 2.0 (dl-de/by-2-0)",
  },
};

// How many distinct named units the specification puts in a region. For Franken
// that is its 138 Gemeinden; for Saale-Unstrut the Kreise plus the Ortsteile and
// Gemarkungen, which the specification lists separately because they are
// delimited at a different level.
const namedUnits = (region) =>
  region.places.length + (region.ortsteile?.length ?? 0) + (region.gemarkungen?.length ?? 0);

const env = Object.fromEntries(
  (await readFile(".env.local", "utf8")).split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const client = new pg.Client({
  connectionString: env.DATABASE_URL.trim().replace(/^["']|["']$/g, ""),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const membership = JSON.parse(await readFile(MEMBERSHIP, "utf8"));
const features = [];

for (const [slug, src] of Object.entries(SOURCES)) {
  const region = membership.anbaugebiete[slug];
  assert.ok(region, `${slug}: not in ${MEMBERSHIP}`);

  await client.query("begin");
  // Unioning 4 000-odd parcels and buffering the result twice takes minutes,
  // comfortably past the default statement timeout.
  await client.query("set local statement_timeout = 1800000");
  await client.query("create temp table gem (gkz text, g extensions.geometry) on commit drop");
  await client.query("create temp table vine (g extensions.geometry) on commit drop");

  // Geometry crosses as WKB hex or as GeoJSON, never as anything this repo
  // parses itself.
  //
  // Batched through unnest rather than one INSERT per row. The row-at-a-time
  // version needed 4 165 round trips to a pooled database several hundred
  // kilometres away and had not finished in ten minutes; this is one statement
  // per 500 rows and completes in seconds. The database was never the
  // bottleneck, the latency was.
  const BATCH = 500;
  const load = async (file, sql, pick) => {
    const rl = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
    let batch = [];
    let n = 0;
    const flush = async () => {
      if (!batch.length) return;
      await client.query(sql, pick(batch));
      n += batch.length;
      batch = [];
    };
    for await (const line of rl) {
      if (!line.trim()) continue;
      batch.push(line);
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    return n;
  };
  // One column layout per format. A WKB row is `[key\t]hex` with the SRID fixed
  // for the whole source; a GeoJSON row spells its own SRID out, because
  // Saale-Unstrut mixes UTM 32N and 33N in one region.
  const parse = src.format === "wkb"
    ? "extensions.ST_GeomFromWKB(decode(g,'hex'))"
    : "extensions.ST_GeomFromGeoJSON(g)";
  const cols = src.format === "wkb"
    ? { area: (l) => [l.split("\t")[0], String(src.srid), l.split("\t")[1]],
        vine: (l) => [String(src.srid), l.trim()] }
    : { area: (l) => l.split("\t"), vine: (l) => l.split("\t") };
  const columns = (lines, pick, n) =>
    Array.from({ length: n }, (_, i) => lines.map((l) => pick(l)[i]));

  const nArea = await load(src.areas,
    `insert into gem
     select k, extensions.ST_Transform(extensions.ST_SetSRID(${parse}, s::int), 4326)
       from unnest($1::text[], $2::text[], $3::text[]) as t(k, s, g)`,
    (lines) => columns(lines, cols.area, 3));
  const nVine = await load(src.vineyards,
    `insert into vine
     select extensions.ST_Transform(extensions.ST_SetSRID(${parse}, s::int), 4326)
       from unnest($1::text[], $2::text[]) as t(s, g)`,
    (lines) => columns(lines, cols.vine, 2));
  const { rows: [{ units }] } = await client.query("select count(distinct gkz)::int units from gem");
  console.log(`${src.name}: ${nArea} polygons over ${units} named units, `
    + `${nVine} Rebfläche parcels loaded`);
  // Polygon count varies — a Landkreis arrives as its Gemeinden — but every unit
  // the specification names has to be present exactly once in the key set, or
  // the region is being built from a different list than the register protects.
  assert.equal(units, namedUnits(region),
    `${slug}: loaded ${units} named units for ${namedUnits(region)} in the specification`);

  const { rows } = await client.query(
    // Buffer each parcel, THEN union, then shrink once. Unioning 4 000 parcels
    // first and buffering that result is the obvious order and it does not
    // finish: the union is a single geometry with tens of thousands of rings
    // and ST_Buffer's cost climbs with vertex count. Buffering the small
    // parcels individually is cheap, and the outward buffer makes neighbours
    // overlap so the union that follows has far less to keep apart.
    // The close runs first and the pebble filter second, on its parts. Doing it
    // the other way round -- dropping small PARCELS before the close -- was the
    // obvious order and it is wrong: a dozen scattered half-hectare parcels
    // three kilometres apart are dust, while a dozen of them adjacent are a
    // vineyard that closes into a perfectly good part. Only the close knows
    // which it is looking at.
    //
    // `kept` re-measures planted hectares over the surviving parts, so the
    // number the promotion migration bands describes the geometry actually
    // stored rather than vineyards this no longer draws.
    `with area as (select extensions.ST_Union(g) g from gem),
          clipped as (select v.g from vine v, area a where extensions.ST_Intersects(v.g, a.g)),
          raw as (select extensions.ST_Union(g) g, count(*) parcels from clipped),
          grown as (select extensions.ST_Union(
                            extensions.ST_Buffer(g, $1::float8, 'quad_segs=2')) g from clipped),
          closed as (select extensions.ST_Buffer(g, -$2::float8, 'quad_segs=2') g from grown),
          parts as (select (extensions.ST_Dump(extensions.ST_CollectionExtract(
                              extensions.ST_MakeValid(closed.g), 3))).geom p from closed),
          scored as (
            select p.p,
                   coalesce(extensions.ST_Area(extensions.ST_Union(v.g)::extensions.geography), 0) / 10000 planted_ha
              from parts p
              left join clipped v on extensions.ST_Intersects(v.g, p.p)
             group by p.p),
          kept as (select * from scored where planted_ha >= $3::float8),
          final as (select extensions.ST_Multi(extensions.ST_Union(p)) g,
                           count(*)::int parts,
                           sum(planted_ha) planted_ha
                      from kept)
     select extensions.ST_AsGeoJSON(final.g, 6) gj,
            raw.parcels,
            round(final.planted_ha::numeric, 1) hectares,
            round((extensions.ST_Area(final.g::extensions.geography) / 10000)::numeric, 1) display_hectares,
            extensions.ST_NumGeometries(extensions.ST_Multi(extensions.ST_CollectionExtract(
              extensions.ST_MakeValid(raw.g), 3))) raw_parts,
            (select count(*)::int from scored) closed_parts,
            (select count(*)::int from scored where planted_ha < $3::float8) dropped_parts,
            round((select coalesce(sum(planted_ha), 0) from scored
                    where planted_ha < $3::float8)::numeric, 1) dropped_hectares,
            round((extensions.ST_Area(raw.g::extensions.geography) / 10000)::numeric, 1) planted_before_filter
       from raw, final`,
    [CLOSE, CLOSE_BACK, MIN_PLANTED_HA],
  );
  await client.query("rollback");

  const r = rows[0];
  assert.ok(r.gj, `${slug}: no vineyard land inside its named units`);
  const geometry = JSON.parse(r.gj);
  features.push({
    type: "Feature",
    properties: {
      slug, name: region.name, tier: "anbaugebiet", state: src.state,
      gi_id: region.gi_id, named_units: namedUnits(region),
      parcels: Number(r.parcels), hectares: Number(r.hectares),
      display_hectares: Number(r.display_hectares), raw_parts: Number(r.raw_parts),
      parts: geometry.coordinates.length,
      // What the pebble filter did, so the promotion migration can check it ran
      // and a reader can see its cost without rerunning the build.
      min_planted_ha: MIN_PLANTED_HA,
      closed_parts: Number(r.closed_parts),
      dropped_parts: Number(r.dropped_parts),
      dropped_hectares: Number(r.dropped_hectares),
      planted_before_filter: Number(r.planted_before_filter),
      attribution: src.attribution, licence: src.licence,
    },
    geometry,
  });
  console.log(`  ${namedUnits(region)} named units, ${r.parcels} parcels, `
    + `${r.raw_parts} -> ${r.closed_parts} parts after close`);
  console.log(`  pebble filter (<${MIN_PLANTED_HA} ha planted): dropped ${r.dropped_parts} parts `
    + `holding ${r.dropped_hectares} ha -> ${geometry.coordinates.length} parts, `
    + `${r.hectares} of ${r.planted_before_filter} ha planted kept `
    + `(${(Number(r.hectares) / Number(r.planted_before_filter) * 100).toFixed(1)}%), `
    + `${r.display_hectares} ha shown`);
}

await client.end();
if (!write) { console.log("\nnothing written (pass --write)"); process.exit(0); }

await writeFile(OUT, `${JSON.stringify({
  type: "FeatureCollection",
  _provenance: {
    membership: "European Commission — eAmbrosia product specifications (see germany-weinbau-membership.json)",
    geometry: "State ATKIS Basis-DLM vineyard land-use class; ALKIS where a state "
      + "publishes no open Basis-DLM (Brandenburg) or the named unit is sub-municipal (the "
      + "Weimar Ortsteile, which exist only in the cadastre)",
    method: "vineyard-clip+close: Rebfläche intersected with the areas the product "
      + "specification names, then closed morphologically (buffer +0.012°, then -0.008°) as "
      + "build-germany-anbaugebiete.mjs closes the Rheinland-Pfalz regions, then closed parts "
      + `holding under ${MIN_PLANTED_HA} ha of planted vineyard dropped. The close cannot knit `
      + "together vineyards that are genuinely far apart, so Franken and Saale-Unstrut came out "
      + "as speckle fields; the filter removes isolated dust, and 'dropped_parts' / "
      + "'dropped_hectares' record what it cost. NOT a Weinbergsrolle: this is recorded land use, "
      + "so an unregistered planted parcel is in and a registered Lage lying fallow is out. The "
      + "close INFLATES the displayed area; 'hectares' is the planted extent of the parts that "
      + "survive the filter, 'planted_before_filter' the whole clip, 'display_hectares' what the "
      + "geometry covers.",
    generated_at: new Date().toISOString().slice(0, 10),
  },
  features,
}, null, 1)}\n`);
console.log(`\nwrote ${OUT}`);
