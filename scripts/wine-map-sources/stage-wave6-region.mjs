// Wave-5 comune-union staging adapter (parameterized by region). Reads the
// repo-committed data/wine-map/<slug>-comuni-dissolved.geojson (ISTAT comuni
// dissolved per MASAF disciplinare comune lists — comune-level approximation),
// matches each appellation footprint by feature.properties.name, simplifies +
// validates in Postgres, and (with --stage) commits DRAFT wine_place_boundaries.
// Sibling of stage-sicily-official.mjs; DEFAULT mode builds + asserts + rolls
// back (safe). --stage is controller-gated.
//
// Usage:
//   node scripts/wine-map-sources/stage-wave5-region.mjs --region=campania
//   node scripts/wine-map-sources/stage-wave5-region.mjs --region=campania --stage
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { sha256hex, releaseVersion } from "../wine-map-tiles/lib.mjs";

const hasFlag = (n) => process.argv.includes(`--${n}`);
const STAGE = hasFlag("stage");
const regionArg = process.argv.find((a) => a.startsWith("--region="));
assert.ok(regionArg, "pass --region=<slug>");
const REGION = regionArg.slice("--region=".length);

const AUTHORITY = "ISTAT (comune geometry) / MASAF disciplinari (comune membership)";
const JURISDICTION = "Italy";
const LICENCE = "CC BY 4.0";
const SIMPLIFY_TOLERANCE = 0.0002;
const SOURCE_URL = "https://github.com/openpolis/geojson-italy (limits_IT_municipalities) + MASAF disciplinari";
const revision = releaseVersion();

// Per-region config: namespace, region canonical key, staging window, and the
// footprint appellation slugs (must equal feature.properties.name in the file).
const REGIONS = {
  marche: {
    namespace: "MARCHE_COMUNI", regionKey: "italy.marche",
    window: { minLon: 12.1, minLat: 42.6, maxLon: 14.0, maxLat: 44.0 },
    appellations: ["verdicchio-di-matelica", "conero", "offida"],
  },
  lazio: {
    namespace: "LAZIO_COMUNI", regionKey: "italy.lazio",
    window: { minLon: 11.4, minLat: 41.2, maxLon: 14.1, maxLat: 42.9 },
    appellations: ["frascati", "marino", "cesanese-del-piglio", "est-est-est-di-montefiascone"],
  },
  sardegna: {
    namespace: "SARDEGNA_COMUNI", regionKey: "italy.sardegna",
    window: { minLon: 8.1, minLat: 38.8, maxLon: 9.9, maxLat: 41.3 },
    appellations: ["vermentino-di-gallura", "carignano-del-sulcis", "vernaccia-di-oristano"],
  },
  liguria: {
    namespace: "LIGURIA_COMUNI", regionKey: "italy.liguria",
    window: { minLon: 7.4, minLat: 43.7, maxLon: 10.1, maxLat: 44.7 },
    appellations: ["rossese-di-dolceacqua", "cinque-terre", "colli-di-luni"],
  },
  calabria: {
    namespace: "CALABRIA_COMUNI", regionKey: "italy.calabria",
    window: { minLon: 15.6, minLat: 37.9, maxLon: 17.3, maxLat: 40.2 },
    appellations: ["ciro", "greco-di-bianco"],
  },
  basilicata: {
    namespace: "BASILICATA_COMUNI", regionKey: "italy.basilicata",
    window: { minLon: 15.3, minLat: 39.8, maxLon: 16.9, maxLat: 41.2 },
    appellations: ["aglianico-del-vulture"],
  },
  "valle-d-aosta": {
    namespace: "VALLEDAOSTA_COMUNI", regionKey: "italy.valle-d-aosta",
    window: { minLon: 6.7, minLat: 45.4, maxLon: 8.0, maxLat: 46.0 },
    appellations: ["blanc-de-morgex-et-de-la-salle", "donnas"],
  },
  molise: {
    namespace: "MOLISE_COMUNI", regionKey: "italy.molise",
    window: { minLon: 13.9, minLat: 41.3, maxLon: 15.2, maxLat: 42.1 },
    appellations: ["biferno"],
  },
};
const CFG = REGIONS[REGION];
assert.ok(CFG, `unknown region "${REGION}"`);
const NAMESPACE = CFG.namespace;
const WINDOW = CFG.window;
const SOURCE_FILE = `data/wine-map/${REGION}-comuni-dissolved.geojson`;
const BOUNDARIES = CFG.appellations.map((name) => ({ key: name, targetKey: `${CFG.regionKey}.${name}`, name, label: name }));

async function loadDatabaseUrl() {
  const raw = await readFile(new URL("../../.env.local", import.meta.url), "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  assert.ok(line, "DATABASE_URL not found in .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

console.log(`reading ${SOURCE_FILE}`);
const sourceBuffer = await readFile(new URL(`../../${SOURCE_FILE}`, import.meta.url));
const sourceSha256 = sha256hex(sourceBuffer);
const source = JSON.parse(sourceBuffer.toString("utf8"));
assert.equal(source.type, "FeatureCollection", "source is not a FeatureCollection");
assert.ok(source._provenance?.authority, "source is missing _provenance.authority");

const matched = {};
for (const b of BOUNDARIES) {
  const hits = source.features.filter((f) => f.properties?.name === b.name);
  assert.equal(hits.length, 1, `${b.label}: expected exactly one feature named "${b.name}", got ${hits.length}`);
  matched[b.key] = hits;
}

const connectionString = await loadDatabaseUrl();
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

async function buildInTx(b) {
  const geojsonStrings = matched[b.key].map((f) => JSON.stringify(f.geometry));
  const result = await client.query(
    `with input_geoms as (select extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g),4326) geom from unnest($1::text[]) g),
       built as (select extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SimplifyPreserveTopology(extensions.ST_Collect(geom),$2)),3)) g from input_geoms),
       labelled as (select g, extensions.ST_PointOnSurface(g) lp from built)
     select extensions.ST_AsGeoJSON(g,5) geojson, extensions.ST_NPoints(g) npoints, extensions.ST_NumGeometries(g) nparts,
            extensions.ST_IsValid(g) valid, extensions.ST_IsEmpty(g) is_empty, extensions.ST_Covers(g,lp) covers_label,
            extensions.ST_XMin(extensions.Box3D(g)) minx, extensions.ST_YMin(extensions.Box3D(g)) miny,
            extensions.ST_XMax(extensions.Box3D(g)) maxx, extensions.ST_YMax(extensions.Box3D(g)) maxy
       from labelled`,
    [geojsonStrings, SIMPLIFY_TOLERANCE],
  );
  const r = result.rows[0];
  assert.ok(r.geojson, `${b.label}: no geometry`);
  assert.equal(r.is_empty, false, `${b.label}: empty geometry`);
  assert.ok(r.valid, `${b.label}: invalid geometry`);
  assert.ok(r.covers_label, `${b.label}: geometry does not cover its label_point`);
  assert.ok(
    r.minx >= WINDOW.minLon && r.miny >= WINDOW.minLat && r.maxx <= WINDOW.maxLon && r.maxy <= WINDOW.maxLat,
    `${b.label}: bbox ${r.minx},${r.miny},${r.maxx},${r.maxy} escapes window lon[${WINDOW.minLon},${WINDOW.maxLon}] lat[${WINDOW.minLat},${WINDOW.maxLat}]`,
  );
  return r;
}

const reports = {};
try {
  await client.query("begin");
  await client.query("set local statement_timeout = 600000");
  const existingRes = await client.query(
    `select p.canonical_key from wine_places p
       join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
       join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
       join wine_boundary_sources so on so.id = s.source_id
      where so.source_namespace = $1 and p.canonical_key = any($2::text[])`,
    [NAMESPACE, BOUNDARIES.map((b) => b.targetKey)],
  );
  const alreadyCurrent = new Set(existingRes.rows.map((r) => r.canonical_key));
  for (const b of BOUNDARIES) {
    if (alreadyCurrent.has(b.targetKey)) { console.log(`SKIP (already current) ${b.label}`); continue; }
    reports[b.key] = await buildInTx(b);
    const r = reports[b.key];
    console.log(`  ${b.label}: ${r.npoints} verts, ${r.nparts} part(s), bbox lon ${(+r.minx).toFixed(3)}..${(+r.maxx).toFixed(3)} lat ${(+r.miny).toFixed(3)}..${(+r.maxy).toFixed(3)}, valid=${r.valid}`);
  }
  if (!STAGE) { await client.query("rollback"); console.log("rolled back — nothing persisted"); }
} catch (e) { await client.query("rollback").catch(() => {}); await client.end(); throw e; }

if (!STAGE) {
  await client.end();
  console.log(`DONE (default): built + asserted ${Object.keys(reports).length} boundaries, persisted nothing.`);
  process.exit(0);
}

const importer = `scripts/wine-map-sources/stage-wave5-region.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`;
try {
  for (const b of BOUNDARIES) {
    if (!reports[b.key]) continue;
    const feature = matched[b.key][0];
    const sourceFeatureId = b.name;
    const report = reports[b.key];
    const generation = {
      engine: "comune-union", name: b.name, comuni_count: feature.properties?.comuni_count ?? null,
      simplify_tolerance: SIMPLIFY_TOLERANCE, coordinate_precision: 5,
      // The artifact states its own method, and it is no longer the same for
      // every file: footprints rebuilt by build-italy-comuni-dissolved.mjs keep
      // the interior ring where the disciplinare excludes an enclosed comune.
      // Restating it here let the two drift apart.
      note: `Comune-union footprint. ${source._provenance.method}`,
    };
    const sourceFeatureRefs = { name: b.name, comuni_count: feature.properties?.comuni_count ?? null };
    const provenanceNote = `Comune-union footprint for "${b.name}" (ISTAT comuni per disciplinare), read from repo-committed ${SOURCE_FILE} (see its _provenance object). The committed file at its current git content is the immutable snapshot.`;
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
      [NAMESPACE, sourceFeatureId, AUTHORITY, JURISDICTION, revision, SOURCE_URL, LICENCE, SOURCE_FILE, sourceSha256, provenanceNote, importer, report.geojson, JSON.stringify(sourceFeatureRefs), JSON.stringify(generation), b.targetKey],
    );
    assert.equal(result.rows.length, 1, `${b.label}: expected one staged boundary row (is the catalog place present?)`);
    console.log(`BOUNDARY-STAGED ${b.key} DRAFT boundary=${result.rows[0].id}`);
  }
  await client.query("commit");
  console.log(`STAGE MODE COMPLETE: ${BOUNDARIES.filter((b) => reports[b.key]).length} DRAFT boundaries committed.`);
} catch (e) { await client.query("rollback").catch(() => {}); throw e; } finally { await client.end(); }
