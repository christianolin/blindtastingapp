// Stage DRAFT wine_place_boundaries for the German Anbaugebiete built from a
// product specification plus state ATKIS, from the repo-committed
// germany-weinbau-dissolved.geojson.
//
// Sibling of stage-hessen-weinbau.mjs and the same contract: DEFAULT builds
// every boundary inside one transaction, runs the assertions the real insert
// would run, and rolls back. --stage commits DRAFT rows for a promotion
// migration to validate.
//
// The engine is "vineyard-clip+close", not "official-delimited-area", for the
// reason 20260913120000 had to relabel eighteen Italian rows: this is an
// approximation of the zone and must never read as a regulator's own boundary.
//
// Usage:
//   node scripts/wine-map-sources/stage-germany-weinbau.mjs           (test only)
//   node scripts/wine-map-sources/stage-germany-weinbau.mjs --stage   (persists)
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { sha256hex, releaseVersion, attributionKeyFor } from "../wine-map-tiles/lib.mjs";
import { warnIfNeighbourCacheStale } from "./neighbour-cache.mjs";

const STAGE = process.argv.includes("--stage");
const SOURCE_FILE = "data/wine-map/germany-weinbau-dissolved.geojson";
const NAMESPACE = "DE_SPEC_ATKIS_WEINBAU";
const JURISDICTION = "Germany";
const SIMPLIFY_TOLERANCE = 0.0002;
// Germany, padded. Deliberately the whole country: Saale-Unstrut alone reaches
// from Thüringen to a Brandenburg exclave near Potsdam, and Baden and
// Württemberg add the Kaiserstuhl and the Bodensee shore.
const WINDOW = { minLon: 5.5, minLat: 47.0, maxLon: 15.5, maxLat: 55.5 };
const revision = releaseVersion();

const TARGETS = {
  franken: "germany.franken",
  baden: "germany.baden",
  wuerttemberg: "germany.wuerttemberg",
  "saale-unstrut": "germany.saale-unstrut",
};

// Fail here, not in CI. A namespace with no entry in lib.mjs's ATTRIBUTION map
// stages and promotes happily, then takes the whole tiles run down at export
// with "Unknown source namespace" -- after the rows are live, so the only way
// back is another migration. That is exactly how the Rheingau merge went red.
attributionKeyFor(NAMESPACE);

const buffer = await readFile(SOURCE_FILE);
const sourceSha256 = sha256hex(buffer);
const source = JSON.parse(buffer.toString("utf8"));
assert.equal(source.type, "FeatureCollection", "source is not a FeatureCollection");
assert.ok(source._provenance?.method, "source is missing _provenance.method");
console.log(`${SOURCE_FILE}: ${source.features.length} feature(s), sha256=${sourceSha256}`);

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

const reports = {};
try {
  await client.query("begin");
  await client.query("set local statement_timeout = 900000");
  const existing = await client.query(
    `select p.canonical_key from wine_places p
       join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
       join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
       join wine_boundary_sources so on so.id = s.source_id
      where so.source_namespace = $1 and p.canonical_key = any($2::text[])`,
    [NAMESPACE, Object.values(TARGETS)],
  );
  const current = new Set(existing.rows.map((r) => r.canonical_key));

  for (const feature of source.features) {
    const slug = feature.properties.slug;
    const targetKey = TARGETS[slug];
    assert.ok(targetKey, `${slug}: no catalogue target`);
    if (current.has(targetKey)) { console.log(`SKIP (already current) ${slug}`); continue; }

    const { rows } = await client.query(
      `with built as (
         select extensions.ST_Multi(extensions.ST_CollectionExtract(
                  extensions.ST_MakeValid(extensions.ST_SimplifyPreserveTopology(
                    extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($1), 4326), $2)), 3)) g)
       select extensions.ST_AsGeoJSON(g, 6) geojson,
              extensions.ST_NPoints(g) npoints, extensions.ST_NumGeometries(g) nparts,
              extensions.ST_IsValid(g) valid, extensions.ST_IsEmpty(g) is_empty,
              extensions.ST_Covers(g, extensions.ST_PointOnSurface(g)) covers_label,
              extensions.ST_XMin(extensions.Box3D(g)) minx, extensions.ST_YMin(extensions.Box3D(g)) miny,
              extensions.ST_XMax(extensions.Box3D(g)) maxx, extensions.ST_YMax(extensions.Box3D(g)) maxy,
              round((extensions.ST_Area(g::extensions.geography) / 10000)::numeric, 1) hectares
         from built`,
      [JSON.stringify(feature.geometry), SIMPLIFY_TOLERANCE],
    );
    const r = rows[0];
    assert.ok(r.valid && !r.is_empty, `${slug}: geometry invalid or empty`);
    assert.ok(r.covers_label, `${slug}: label point falls outside the geometry`);
    assert.ok(
      r.minx >= WINDOW.minLon && r.miny >= WINDOW.minLat && r.maxx <= WINDOW.maxLon && r.maxy <= WINDOW.maxLat,
      `${slug}: bbox ${r.minx},${r.miny},${r.maxx},${r.maxy} escapes the Germany window`,
    );
    // Against display_hectares: the artifact geometry is the CLOSED outline, so
    // its area is the inflated one by design.
    const drift = Math.abs(Number(r.hectares) - feature.properties.display_hectares)
      / feature.properties.display_hectares;
    assert.ok(drift < 0.15,
      `${slug}: simplification moved the area ${(drift * 100).toFixed(1)}%`);
    reports[slug] = { ...r, feature, targetKey };
    console.log(`  ${slug.padEnd(16)} ${r.npoints} verts, ${r.nparts} part(s), ${r.hectares} ha shown `
      + `(${feature.properties.hectares} ha planted), valid=${r.valid}`);
  }
  if (!STAGE) { await client.query("rollback"); console.log("rolled back — nothing persisted"); }
} catch (e) {
  await client.query("rollback").catch(() => {});
  await client.end();
  throw e;
}

if (!STAGE) {
  await client.end();
  console.log(`DONE (default): built + asserted ${Object.keys(reports).length} boundaries, persisted nothing.`);
  process.exit(0);
}

const importer = `scripts/wine-map-sources/stage-germany-weinbau.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`;
try {
  for (const [slug, rep] of Object.entries(reports)) {
    const props = rep.feature.properties;
    const generation = {
      engine: "vineyard-clip+close",
      name: props.name,
      state: props.state,
      gi_id: props.gi_id,
      named_units: props.named_units,
      parcels: props.parcels,
      hectares_planted: props.hectares,
      hectares_displayed: props.display_hectares,
      raw_parts: props.raw_parts,
      // The pebble filter's record. Carried so a promotion migration can check
      // the filter ran and at what threshold, rather than inferring it from a
      // part count that a different close would also produce.
      // `hectares_planted` above is the extent of the parts that SURVIVED it;
      // `planted_before_filter` is the whole clip.
      min_planted_ha: props.min_planted_ha,
      closed_parts: props.closed_parts,
      dropped_parts: props.dropped_parts,
      dropped_hectares: props.dropped_hectares,
      planted_before_filter: props.planted_before_filter,
      simplify_tolerance: SIMPLIFY_TOLERANCE,
      coordinate_precision: 6,
      note: source._provenance.method,
    };
    const provenanceNote =
      `Vineyard-clip footprint for "${props.name}": recorded vineyard land in ${props.state} clipped `
      + `to the ${props.named_units} areas named in eAmbrosia ${props.gi_id}, read from repo-committed `
      + `${SOURCE_FILE} (see its _provenance). The committed file at its current git content is the `
      + `immutable snapshot.`;
    const result = await client.query(
      `with source as (
         insert into wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
         values ($1,$2,$3,$4) on conflict (source_namespace, source_feature_id) do update set authority = excluded.authority returning id),
       snapshot as (
         insert into wine_boundary_source_snapshots (source_id, source_revision, retrieved_at, source_url, licence, raw_snapshot_uri, raw_checksum_sha256, normalized_artifact_uri, normalized_checksum_sha256, provenance_note, importer_version)
         select source.id,$5,now(),$6,$7,null,null,$8,$9,$10,$11 from source returning id),
       geom as (select extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($12),4326)),3)) g)
       insert into wine_place_boundaries (wine_place_id, source_snapshot_id, boundary_method, quality_status, display_geometry, label_point, bbox, source_feature_refs, generation_parameters, revision, is_current, reviewed_at)
       select place.id, snapshot.id, 'GENERALIZED_FROM_OFFICIAL_SOURCE', 'DRAFT', geom.g, extensions.ST_PointOnSurface(geom.g),
              array[extensions.ST_XMin(extensions.Box3D(geom.g)),extensions.ST_YMin(extensions.Box3D(geom.g)),extensions.ST_XMax(extensions.Box3D(geom.g)),extensions.ST_YMax(extensions.Box3D(geom.g))]::double precision[],
              $13::jsonb,$14::jsonb,$5,false,null
         from wine_places place, source, snapshot, geom where place.canonical_key = $15 returning id`,
      [NAMESPACE, slug,
       `${props.attribution} (vineyard land use) / eAmbrosia product specification (membership)`,
       JURISDICTION, revision,
       "https://ec.europa.eu/geographical-indications-register/",
       props.licence, SOURCE_FILE, sourceSha256, provenanceNote, importer, rep.geojson,
       JSON.stringify({ slug, name: props.name, gi_id: props.gi_id }),
       JSON.stringify(generation), rep.targetKey],
    );
    assert.equal(result.rows.length, 1, `${slug}: expected one staged boundary`);
    console.log(`BOUNDARY-STAGED ${slug} DRAFT boundary=${result.rows[0].id}`);
  }
  await client.query("commit");
  await warnIfNeighbourCacheStale(client);
  console.log(`STAGE MODE COMPLETE: ${Object.keys(reports).length} DRAFT boundaries committed.`);
} catch (e) { await client.query("rollback").catch(() => {}); throw e; } finally { await client.end(); }
