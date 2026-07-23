// Stage the Champagne region's DRAFT boundary as the dissolve of its 635
// official member communes. Champagne has no INAO parcel source, so the
// footprint is a commune-union: INAO's official commune list
// (data/wine-map/champagne-communes.json, Licence Ouverte) → IGN Admin Express
// commune polygons → ST_Union → generalize. Honest over-approximation (whole
// communes, not parcels); boundary_method = MANUAL. Raw fetch + normalized
// dissolve are retained in the wine-map-sources bucket with checksums. The
// boundary lands DRAFT; the reviewed flip to current-VALIDATED is a later
// migration.
//
// Env: DB_PASSWORD, SUPABASE_SERVICE_ROLE_KEY (+ optional DB_PORT).
// Usage: node scripts/wine-map-sources/fetch-champagne-communes.mjs [--tolerance 0.0012]
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { pgConfig, releaseVersion, sha256hex } from "../wine-map-tiles/lib.mjs";
import { uploadRawObject } from "./inao-lib.mjs";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i < 0 ? d : process.argv[i + 1];
};

const COMMUNES_JSON = "data/wine-map/champagne-communes.json";
const WFS = "https://data.geopf.fr/wfs/ows";
const LAYER = "LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:commune";
const DELEGUEE_LAYER =
  "LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:commune_associee_ou_deleguee";
const NAMESPACE = "IGN_ADMIN_EXPRESS";
const FEATURE_ID = "aire-geographique:champagne";
const TARGET_KEY = "france.champagne";
const LICENCE = "Licence Ouverte / Open Licence (Etalab)";
const WINDOW = { minLon: 3.0, minLat: 47.8, maxLon: 5.05, maxLat: 49.6 };
const TOLERANCE = Number(arg("tolerance", "0.0012"));
const BATCH = 80;
const revision = releaseVersion();

function batchUrl(codes, layer) {
  const inList = codes.map((c) => `'${c}'`).join(",");
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: layer,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    count: "5000",
    cql_filter: `code_insee IN (${inList})`,
  });
  return `${WFS}?${params.toString()}`;
}

const round = (n) => Math.round(n * 1e4) / 1e4;
function thinRing(ring) {
  const out = [];
  for (const [lon, lat] of ring) {
    const p = [round(lon), round(lat)];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
  }
  const [first] = out;
  const last = out[out.length - 1];
  if (first && (first[0] !== last[0] || first[1] !== last[1])) out.push([...first]);
  return out;
}
function thinGeom(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const cleaned = polys
    .map((poly) => poly.map(thinRing).filter((r) => r.length >= 4))
    .filter((poly) => poly.length > 0);
  return { type: "MultiPolygon", coordinates: cleaned };
}

// --- fetch every member commune (current layer, then déléguées for merges) ---
const artifact = JSON.parse(await readFile(COMMUNES_JSON, "utf8"));
const wanted = artifact.communes.map((c) => c.insee);
const rawFeatures = [];
const gotInsee = new Set();
async function fetchInto(codes, layer) {
  const res = await fetch(batchUrl(codes, layer));
  if (!res.ok) throw new Error(`WFS ${layer} -> ${res.status}`);
  const fc = await res.json();
  for (const f of fc.features ?? []) {
    const insee = f.properties?.code_insee;
    if (insee && !gotInsee.has(insee)) {
      gotInsee.add(insee);
      rawFeatures.push({
        type: "Feature",
        properties: { code_insee: insee, nom: f.properties?.nom_officiel ?? "" },
        geometry: f.geometry,
      });
    }
  }
}
for (let i = 0; i < wanted.length; i += BATCH) {
  await fetchInto(wanted.slice(i, i + BATCH), LAYER);
  process.stdout.write(`\r  fetched ${gotInsee.size}/${wanted.length}`);
}
let missing = wanted.filter((c) => !gotInsee.has(c));
if (missing.length) {
  for (let i = 0; i < missing.length; i += BATCH) {
    await fetchInto(missing.slice(i, i + BATCH), DELEGUEE_LAYER);
  }
  missing = wanted.filter((c) => !gotInsee.has(c));
}
process.stdout.write("\n");
assert.equal(missing.length, 0, `missing commune geometries: ${missing.join(", ")}`);
console.log(`fetched ${gotInsee.size}/${wanted.length} member communes`);

// --- raw artifact (unmodified fetch) -> bucket ------------------------------
const rawBody = Buffer.from(
  `${JSON.stringify({ type: "FeatureCollection", features: rawFeatures })}\n`,
);
const rawPath = `${NAMESPACE}/${revision}/champagne/raw-communes.geojson`;
await uploadRawObject(rawPath, rawBody, { upsert: false });
console.log(`raw artifact -> storage://wine-map-sources/${rawPath}`);

// --- dissolve in Postgres (thinned + grid-snapped so shared borders merge) --
const thinned = rawFeatures.map((f) => JSON.stringify(thinGeom(f.geometry)));
const client = new pg.Client({
  ...pgConfig(),
  port: Number(process.env.DB_PORT ?? 5432),
});
await client.connect();
let geojson;
let report;
try {
  await client.query("begin");
  await client.query("set local statement_timeout = 600000");
  await client.query(
    "create temp table champ_communes (geom extensions.geometry) on commit drop",
  );
  // Communes are already thinned to 4 decimals client-side (shared borders
  // round identically, so they stay coincident and dissolve cleanly); just
  // make each valid before the union.
  await client.query(
    `insert into champ_communes (geom)
       select extensions.ST_MakeValid(
                extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g), 4326))
         from unnest($1::text[]) g`,
    [thinned],
  );
  const dissolve = await client.query(
     `with u as (
       select extensions.ST_UnaryUnion(extensions.ST_MakeValid(extensions.ST_Collect(geom))) g
         from champ_communes
     ),
     simp as (
       select extensions.ST_CollectionExtract(
                extensions.ST_MakeValid(
                  extensions.ST_SimplifyPreserveTopology(g, $1)
                ), 3) g
         from u
     )
     select extensions.ST_AsGeoJSON(extensions.ST_Multi(g), 5) geojson,
            extensions.ST_NPoints(g) npoints,
            extensions.ST_NumGeometries(extensions.ST_Multi(g)) nparts,
            extensions.ST_IsValid(g) valid,
            extensions.ST_XMin(extensions.Box3D(g)) minx,
            extensions.ST_YMin(extensions.Box3D(g)) miny,
            extensions.ST_XMax(extensions.Box3D(g)) maxx,
            extensions.ST_YMax(extensions.Box3D(g)) maxy
       from simp`,
    [TOLERANCE],
  );
  report = dissolve.rows[0];
  geojson = report.geojson;
  assert.ok(geojson, "dissolve produced no geometry");
  assert.ok(report.valid, "dissolved geometry is invalid");
  assert.ok(
    report.minx >= WINDOW.minLon &&
      report.miny >= WINDOW.minLat &&
      report.maxx <= WINDOW.maxLon &&
      report.maxy <= WINDOW.maxLat,
    `dissolved bbox ${report.minx},${report.miny},${report.maxx},${report.maxy} escapes the Champagne window`,
  );
  await client.query("rollback"); // temp table only; nothing to keep yet
} catch (e) {
  await client.query("rollback").catch(() => {});
  await client.end();
  throw e;
}

console.log(
  `dissolved: ${report.npoints} vertices, ${report.nparts} parts, bbox lon ${Number(report.minx).toFixed(3)}..${Number(report.maxx).toFixed(3)} lat ${Number(report.miny).toFixed(3)}..${Number(report.maxy).toFixed(3)}`,
);

// --- normalized artifact -> bucket ------------------------------------------
const generation = {
  engine: "commune-union",
  member_communes: wanted.length,
  source_commune_list: COMMUNES_JSON,
  commune_geometry: "IGN Admin Express (LIMITES_ADMINISTRATIVES_EXPRESS:commune)",
  membership_source: "INAO — Aires géographiques des AOC/AOP (Licence Ouverte)",
  simplify_tolerance: TOLERANCE,
  snap_grid: 0.0001,
  coordinate_precision: 4,
  note: "Over-approximation: whole member communes dissolved, not the parcel-level AOC area. Champagne is absent from the IGN AOC-VITICOLES parcel layer.",
};
const normalizedFeature = {
  type: "Feature",
  properties: { target_key: TARGET_KEY, generation },
  geometry: JSON.parse(geojson),
};
const normalizedBody = Buffer.from(`${JSON.stringify(normalizedFeature)}\n`);
const normalizedPath = `${NAMESPACE}/${revision}/champagne/normalized.geojson`;
await uploadRawObject(normalizedPath, normalizedBody, { upsert: true });

// local preview SVG of the dissolved outline (scratch, gitignored)
await mkdir(".superpowers/sdd", { recursive: true });
{
  const g = JSON.parse(geojson);
  const pad = 0.03;
  const [w, s, e, n] = [
    report.minx - pad,
    report.miny - pad,
    report.maxx + pad,
    report.maxy + pad,
  ];
  const scale = 1400 / Math.max(e - w, n - s);
  const project = ([x, y]) =>
    `${((x - w) * scale).toFixed(1)},${((n - y) * scale).toFixed(1)}`;
  let d = "";
  for (const poly of g.coordinates)
    for (const ring of poly) d += `M${ring.map(project).join("L")}Z`;
  const W = ((e - w) * scale).toFixed(0);
  const H = ((n - s) * scale).toFixed(0);
  await writeFile(
    ".superpowers/sdd/preview-champagne-dissolved.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#F5EFE3"/><path d="${d}" fill="#7E1B26" fill-opacity="0.2" stroke="#7E1B26" stroke-width="0.7"/></svg>\n`,
  );
}

// --- stage the DRAFT boundary (source + snapshot + boundary) -----------------
const importer = `scripts/wine-map-sources/fetch-champagne-communes.mjs@${
  process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()
}`;
await client.query("begin");
try {
  const result = await client.query(
    `with place as (
       select id from wine_places where canonical_key = $1
     ),
     source as (
       insert into wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
       values ($2, $3, 'IGN / INAO', 'France')
       on conflict (source_namespace, source_feature_id) do update set authority = excluded.authority
       returning id
     ),
     snapshot as (
       insert into wine_boundary_source_snapshots (
         source_id, source_revision, retrieved_at, source_url, licence,
         raw_snapshot_uri, raw_checksum_sha256,
         normalized_artifact_uri, normalized_checksum_sha256,
         provenance_note, importer_version
       )
       select source.id, $4, now(), $5, $6,
              $7, $8, $9, $10,
              'Commune-union footprint: 635 INAO member communes dissolved from IGN Admin Express polygons. Champagne has no INAO parcel delimitation; this is an honest commune-level over-approximation for region display.',
              $11
       from source
       returning id
     ),
     geom as (
       select extensions.ST_Multi(extensions.ST_CollectionExtract(
                extensions.ST_MakeValid(
                  extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($12), 4326)
                ), 3)) g
     )
     insert into wine_place_boundaries (
       wine_place_id, source_snapshot_id, boundary_method, quality_status,
       display_geometry, label_point, bbox, source_feature_refs,
       generation_parameters, revision, is_current, reviewed_at
     )
     select place.id, snapshot.id, 'MANUAL', 'DRAFT',
            geom.g, extensions.ST_PointOnSurface(geom.g),
            array[
              extensions.ST_XMin(extensions.Box3D(geom.g)),
              extensions.ST_YMin(extensions.Box3D(geom.g)),
              extensions.ST_XMax(extensions.Box3D(geom.g)),
              extensions.ST_YMax(extensions.Box3D(geom.g))
            ]::double precision[],
            jsonb_build_object('member_commune_count', $13::int, 'commune_list', $1::text),
            $14::jsonb,
            $4, false, null
     from place, source, snapshot, geom
     returning id`,
    [
      TARGET_KEY,
      NAMESPACE,
      FEATURE_ID,
      revision,
      "https://data.geopf.fr/wfs/ows",
      LICENCE,
      `storage://wine-map-sources/${rawPath}`,
      sha256hex(rawBody),
      `storage://wine-map-sources/${normalizedPath}`,
      sha256hex(normalizedBody),
      importer,
      geojson,
      wanted.length,
      JSON.stringify(generation),
    ],
  );
  assert.equal(result.rows.length, 1, "expected one staged boundary row");
  await client.query("commit");
  console.log(`BOUNDARY-STAGED champagne DRAFT boundary=${result.rows[0].id}`);
} catch (e) {
  await client.query("rollback").catch(() => {});
  throw e;
} finally {
  await client.end();
}
