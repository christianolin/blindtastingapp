// Stage DRAFT wine_place_boundaries for the two Hessian Anbaugebiete and their
// three Bereiche, from the repo-committed hessen-weinbau-dissolved.geojson.
//
// Sibling of stage-wave5-region.mjs, and the same contract: DEFAULT mode builds
// every boundary inside one transaction, runs the assertions the real insert
// would run, and rolls back. --stage commits DRAFT rows for a promotion
// migration to validate.
//
// The artifact is built by build-hessen-weinbau.mjs from two open sources that
// each govern only what they are authoritative for -- the Weinbauamt Eltville
// Info-Blatt for WHICH Gemeinden, ATKIS Basis-DLM for WHICH LAND is vineyard.
// See that script's header for why a whole-Gemeinde union is not an option
// here. The engine name says "vineyard-clip" and not "official-delimited-area"
// for the reason 20260913120000 had to correct eighteen Italian rows: this is
// an approximation and must not read as a regulator's own boundary.
//
// Usage:
//   node scripts/wine-map-sources/stage-hessen-weinbau.mjs           (test only)
//   node scripts/wine-map-sources/stage-hessen-weinbau.mjs --stage   (persists)
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { sha256hex, releaseVersion, attributionKeyFor } from "../wine-map-tiles/lib.mjs";

const STAGE = process.argv.includes("--stage");
const SOURCE_FILE = "data/wine-map/hessen-weinbau-dissolved.geojson";
const NAMESPACE = "HESSEN_ATKIS_WEINBAU";
const AUTHORITY =
  "HVBG ATKIS Basis-DLM (vineyard land use) / Regierungspräsidium Darmstadt, Dezernat Weinbau Eltville (membership)";
const JURISDICTION = "Germany";
const LICENCE = "Free use without restriction or condition, § 24 HVGG";
const SOURCE_URL = "https://www.gds.hessen.de/wfs2/aaa-suite/cgi-bin/atkis-bdlm/sf/wfs";
const SIMPLIFY_TOLERANCE = 0.0002;
// Hessen, padded. Felsberg's Böddiger Berg sits ~120 km north of the Rheingau
// proper, so this window is deliberately the whole state and not the Rhine.
const WINDOW = { minLon: 7.7, minLat: 49.3, maxLon: 10.3, maxLat: 51.7 };
const revision = releaseVersion();

const TARGETS = {
  rheingau: "germany.rheingau",
  "hessische-bergstrasse": "germany.hessische-bergstrasse",
  johannisberg: "germany.rheingau.johannisberg",
  starkenburg: "germany.hessische-bergstrasse.starkenburg",
  umstadt: "germany.hessische-bergstrasse.umstadt",
};

// Fail here, not in CI. A source_namespace with no entry in lib.mjs's
// ATTRIBUTION map stages and promotes perfectly happily, then takes down the
// whole tiles run at export with "Unknown source namespace" -- after the rows
// are already live, so the only way back is another migration. attributionKeyFor
// throws on an unknown namespace, so calling it before any work is done turns a
// red pipeline into a failed script.
attributionKeyFor(NAMESPACE);

const buffer = await readFile(SOURCE_FILE);
const sourceSha256 = sha256hex(buffer);
const source = JSON.parse(buffer.toString("utf8"));
assert.equal(source.type, "FeatureCollection", "source is not a FeatureCollection");
assert.ok(source._provenance?.method, "source is missing _provenance.method");
assert.equal(source.features.length, Object.keys(TARGETS).length,
  `expected ${Object.keys(TARGETS).length} features, found ${source.features.length}`);
console.log(`${SOURCE_FILE}: ${source.features.length} features, sha256=${sourceSha256}`);

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
  await client.query("set local statement_timeout = 600000");
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
    assert.ok(targetKey, `${slug}: no catalogue target for this feature`);
    if (current.has(targetKey)) { console.log(`SKIP (already current) ${slug}`); continue; }

    const { rows } = await client.query(
      `with built as (
         select extensions.ST_Multi(extensions.ST_CollectionExtract(
                  extensions.ST_MakeValid(extensions.ST_SimplifyPreserveTopology(
                    extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($1), 4326), $2)), 3)) g)
       select extensions.ST_AsGeoJSON(g, 6) geojson,
              extensions.ST_NPoints(g) npoints,
              extensions.ST_NumGeometries(g) nparts,
              extensions.ST_IsValid(g) valid,
              extensions.ST_IsEmpty(g) is_empty,
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
      `${slug}: bbox ${r.minx},${r.miny},${r.maxx},${r.maxy} escapes the Hessen window`,
    );
    // Compare against display_hectares, not hectares: the artifact geometry is
    // the CLOSED outline, so its area is the inflated one by design. hectares is
    // the planted extent measured before the close and is carried through to
    // generation_parameters, where the promotion migration bands it.
    const drift = Math.abs(Number(r.hectares) - feature.properties.display_hectares)
      / feature.properties.display_hectares;
    assert.ok(drift < 0.15,
      `${slug}: simplification moved the area ${(drift * 100).toFixed(1)}% (${feature.properties.display_hectares} -> ${r.hectares} ha)`);
    reports[slug] = { ...r, feature, targetKey };
    console.log(`  ${slug.padEnd(22)} ${r.npoints} verts, ${r.nparts} part(s), ${r.hectares} ha shown `
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

const importer = `scripts/wine-map-sources/stage-hessen-weinbau.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`;
try {
  for (const [slug, rep] of Object.entries(reports)) {
    const generation = {
      engine: "vineyard-clip+close",
      name: rep.feature.properties.name,
      tier: rep.feature.properties.tier,
      gemeinden_count: rep.feature.properties.gemeinden_count,
      parcels: rep.feature.properties.parcels,
      hectares_planted: rep.feature.properties.hectares,
      hectares_displayed: rep.feature.properties.display_hectares,
      raw_parts: rep.feature.properties.raw_parts,
      statute_section: rep.feature.properties.statute_section,
      simplify_tolerance: SIMPLIFY_TOLERANCE,
      coordinate_precision: 6,
      note: source._provenance.method,
    };
    const provenanceNote =
      `Vineyard-clip footprint for "${rep.feature.properties.name}", read from repo-committed ${SOURCE_FILE} `
      + `(see its _provenance). The committed file at its current git content is the immutable snapshot.`;
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
      [NAMESPACE, slug, AUTHORITY, JURISDICTION, revision, SOURCE_URL, LICENCE, SOURCE_FILE, sourceSha256,
       provenanceNote, importer, rep.geojson,
       JSON.stringify({ slug, name: rep.feature.properties.name, tier: rep.feature.properties.tier }),
       JSON.stringify(generation), rep.targetKey],
    );
    assert.equal(result.rows.length, 1, `${slug}: expected one staged boundary (is the catalogue place present?)`);
    console.log(`BOUNDARY-STAGED ${slug} DRAFT boundary=${result.rows[0].id}`);
  }
  await client.query("commit");
  console.log(`STAGE MODE COMPLETE: ${Object.keys(reports).length} DRAFT boundaries committed.`);
} catch (e) { await client.query("rollback").catch(() => {}); throw e; } finally { await client.end(); }
