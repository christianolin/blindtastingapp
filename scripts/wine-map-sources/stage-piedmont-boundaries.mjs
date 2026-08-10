// Task 4a: stage DRAFT wine_place_boundaries for Piedmont's three
// ISTAT-sourced places — italy.piemonte.barolo, italy.piemonte.barbaresco,
// italy.piemonte — following the Champagne commune-union model
// (fetch-champagne-communes.mjs) but with ISTAT comuni as the geometry
// source (istat-lib.mjs's matchComune) instead of IGN Admin Express.
//
// Barolo/Barbaresco footprints = whole-comune union of their verified
// member comuni (data/wine-map/{barolo,barbaresco}-comuni.json; Alba is
// EXCLUDED from Barbaresco per that artifact's in_footprint:false).
// Piemonte footprint = the ACTUAL administrative region: the dissolve of
// EVERY comune in the ISTAT Piemonte file (region 1), not just the two
// denominations' members.
//
// DEFAULT mode (no flag): fetch ISTAT, dissolve all three inside a single
// `begin ... rollback` transaction (temp table only — nothing persisted),
// run every geometry assertion the real staging insert would also enforce
// (validity, non-empty, window bbox, ST_Covers(geom,label_point)), write a
// preview SVG per boundary to .tiles-build/, and print vertex/part counts +
// bbox. No bucket upload, no boundary insert — this mode is safe to run
// freely to test the dissolve logic.
//
// `--stage` mode (controller-gated; do NOT run from this task): reuses the
// exact same computed geometry (same open transaction, no rollback) to
// upload raw+normalized artifacts to the private wine-map-sources bucket
// with SHA-256 checksums, then commits wine_boundary_sources /
// wine_boundary_source_snapshots / wine_place_boundaries rows —
// boundary_method='MANUAL', quality_status='DRAFT', is_current=false.
//
// Env: DATABASE_URL (read from .env.local), SUPABASE_SERVICE_ROLE_KEY
// (only required in --stage mode, via inao-lib.mjs's uploadRawObject).
// Usage:
//   node scripts/wine-map-sources/stage-piedmont-boundaries.mjs           (test only, default)
//   node scripts/wine-map-sources/stage-piedmont-boundaries.mjs --stage   (controller-gated; persists)
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { sha256hex, releaseVersion } from "../wine-map-tiles/lib.mjs";
import { uploadRawObject } from "./inao-lib.mjs";
import { matchComune } from "./istat-lib.mjs";

const hasFlag = (n) => process.argv.includes(`--${n}`);
const STAGE = hasFlag("stage");

const OUT_DIR = ".tiles-build";

// --- pilot source wiring (pinned during Task 2's source spike; see
// fetch-piedmont-comuni.mjs for the full rationale / rejected candidates) --
const PILOT_SOURCE_URL =
  "https://raw.githubusercontent.com/guglielmo/geojson-italy/master/geojson/limits_R_1_municipalities.geojson";
const PILOT_NAME_PROP = "name";
const PILOT_PRO_COM_PROP = "com_istat_code_num";
const PILOT_LICENCE =
  "ISTAT — Confini delle unità amministrative a fini statistici (comuni). " +
  "Original boundaries © ISTAT, released under CC BY. Redistributed as " +
  "simplification-free WGS84 GeoJSON by guglielmo/geojson-italy " +
  "(https://github.com/guglielmo/geojson-italy, formerly openpolis/geojson-italy) " +
  "under the same CC BY licence. Attribute: ISTAT.";

const NAMESPACE = "ISTAT_CONFINI";
const AUTHORITY = "ISTAT";
const JURISDICTION = "Italy";
const revision = releaseVersion();

// France-palette single boundary colour (per brief): garnet fill, cream casing.
const FILL = "#8C2D3C";
const CASING = "#FFFDF7";
const BACKGROUND = "#F4F0E4";

const BOUNDARIES = [
  {
    key: "barolo",
    targetKey: "italy.piemonte.barolo",
    featureId: "barolo",
    label: "Barolo",
    membershipFile: "data/wine-map/barolo-comuni.json",
    tolerance: 0.0008,
    window: { minLon: 7.7, minLat: 44.5, maxLon: 8.3, maxLat: 44.9 },
  },
  {
    key: "barbaresco",
    targetKey: "italy.piemonte.barbaresco",
    featureId: "barbaresco",
    label: "Barbaresco",
    membershipFile: "data/wine-map/barbaresco-comuni.json",
    tolerance: 0.0008,
    window: { minLon: 7.7, minLat: 44.5, maxLon: 8.3, maxLat: 44.9 },
  },
  {
    key: "piemonte",
    targetKey: "italy.piemonte",
    featureId: "piemonte",
    label: "Piemonte",
    membershipFile: null, // all comuni in the ISTAT region-1 file
    tolerance: 0.002,
    window: { minLon: 6.5, minLat: 43.9, maxLon: 9.3, maxLat: 46.6 },
  },
];

// --- env: DATABASE_URL from .env.local (de-risked path; do NOT depend on
// pgConfig()'s host env) -----------------------------------------------------
async function loadDatabaseUrl() {
  const envPath = new URL("../../.env.local", import.meta.url);
  const raw = await readFile(envPath, "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  assert.ok(line, "DATABASE_URL not found in .env.local");
  const value = line
    .slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
  assert.ok(value, "DATABASE_URL is empty in .env.local");
  return value;
}

// --- 1. fetch the ISTAT comuni layer (Piemonte region file) ----------------
console.log(`fetching ISTAT comuni: ${PILOT_SOURCE_URL}`);
const res = await fetch(PILOT_SOURCE_URL);
if (!res.ok) throw new Error(`ISTAT comuni fetch -> ${res.status} ${res.statusText}`);
const istat = await res.json();
assert.ok(Array.isArray(istat.features) && istat.features.length > 0, "empty ISTAT comuni layer");
console.log(`fetched ${istat.features.length} ISTAT comuni features`);
assert.ok(
  PILOT_NAME_PROP in istat.features[0].properties,
  `PILOT_NAME_PROP "${PILOT_NAME_PROP}" not present on first ISTAT feature — property keys drifted`,
);
assert.ok(
  PILOT_PRO_COM_PROP in istat.features[0].properties,
  `PILOT_PRO_COM_PROP "${PILOT_PRO_COM_PROP}" not present on first ISTAT feature — property keys drifted`,
);
// Sanity bound on the region file's comune count — Piemonte has had ~1180-
// 1200 comuni through recent ISTAT vintages (mergers shift this slowly);
// a wildly different count means the fetched file isn't the expected
// region-1 scope.
assert.ok(
  istat.features.length >= 900 && istat.features.length <= 1400,
  `ISTAT Piemonte file has ${istat.features.length} comuni — outside the expected ~900-1400 sanity range`,
);

// --- 2. resolve each boundary's member comuni, fail-closed ------------------
async function resolveMembers(boundary) {
  if (!boundary.membershipFile) {
    // piemonte: every comune in the region file IS the membership.
    return istat.features.map((f) => ({
      name: f.properties[PILOT_NAME_PROP],
      pro_com: f.properties[PILOT_PRO_COM_PROP],
      feature: f,
    }));
  }
  const artifact = JSON.parse(await readFile(boundary.membershipFile, "utf8"));
  const expected = artifact.comuni.filter((c) => c.in_footprint !== false);
  return expected.map((c) => {
    const hits = istat.features.filter((f) => matchComune(f, c.name, PILOT_NAME_PROP));
    assert.equal(
      hits.length,
      1,
      `${boundary.label}: comune "${c.name}" matched ${hits.length} ISTAT features (need exactly 1)`,
    );
    return { name: c.name, pro_com: hits[0].properties[PILOT_PRO_COM_PROP], feature: hits[0] };
  });
}

const members = {};
for (const boundary of BOUNDARIES) {
  members[boundary.key] = await resolveMembers(boundary);
  console.log(`${boundary.label}: ${members[boundary.key].length} member comuni resolved`);
}
assert.equal(members.barolo.length, 11, `expected 11 Barolo comuni, matched ${members.barolo.length}`);
assert.equal(
  members.barbaresco.length,
  3,
  `expected 3 Barbaresco-footprint comuni (Barbaresco+Neive+Treiso), matched ${members.barbaresco.length}`,
);
assert.equal(
  members.piemonte.length,
  istat.features.length,
  "piemonte membership should be every comune in the region file",
);

// --- 3. connect + dissolve each boundary in Postgres ------------------------
const connectionString = await loadDatabaseUrl();
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

async function dissolveInTx(boundary) {
  const geojsonStrings = members[boundary.key].map((m) => JSON.stringify(m.feature.geometry));
  await client.query("drop table if exists dissolve_input");
  await client.query("create temp table dissolve_input (geom extensions.geometry)");
  await client.query(
    `insert into dissolve_input (geom)
       select extensions.ST_MakeValid(
                extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g), 4326))
         from unnest($1::text[]) g`,
    [geojsonStrings],
  );
  const result = await client.query(
    `with u as (
       select extensions.ST_UnaryUnion(extensions.ST_MakeValid(extensions.ST_Collect(geom))) g
         from dissolve_input
     ),
     simp as (
       select extensions.ST_CollectionExtract(
                extensions.ST_MakeValid(
                  extensions.ST_SimplifyPreserveTopology(g, $1)
                ), 3) g
         from u
     ),
     multi as (
       select extensions.ST_Multi(g) g from simp
     ),
     labelled as (
       select g, extensions.ST_PointOnSurface(g) lp from multi
     )
     select extensions.ST_AsGeoJSON(g, 5) geojson,
            extensions.ST_AsGeoJSON(lp, 6) label_point_geojson,
            extensions.ST_NPoints(g) npoints,
            extensions.ST_NumGeometries(g) nparts,
            extensions.ST_IsValid(g) valid,
            extensions.ST_IsEmpty(g) is_empty,
            extensions.ST_Covers(g, lp) covers_label,
            extensions.ST_XMin(extensions.Box3D(g)) minx,
            extensions.ST_YMin(extensions.Box3D(g)) miny,
            extensions.ST_XMax(extensions.Box3D(g)) maxx,
            extensions.ST_YMax(extensions.Box3D(g)) maxy
       from labelled`,
    [boundary.tolerance],
  );
  const report = result.rows[0];
  assert.ok(report.geojson, `${boundary.label}: dissolve produced no geometry`);
  assert.equal(report.is_empty, false, `${boundary.label}: dissolved geometry is empty`);
  assert.ok(report.valid, `${boundary.label}: dissolved geometry is invalid`);
  assert.ok(
    report.covers_label,
    `${boundary.label}: display_geometry does not cover its own label_point`,
  );
  const w = boundary.window;
  assert.ok(
    report.minx >= w.minLon && report.miny >= w.minLat && report.maxx <= w.maxLon && report.maxy <= w.maxLat,
    `${boundary.label}: dissolved bbox ${report.minx},${report.miny},${report.maxx},${report.maxy} ` +
      `escapes window lon[${w.minLon},${w.maxLon}] lat[${w.minLat},${w.maxLat}]`,
  );
  return report;
}

// Round-trips report.geojson through the EXACT same geom CTE the --stage
// insert uses (ST_GeomFromGeoJSON -> ST_MakeValid -> ST_CollectionExtract(3)
// -> ST_Multi) and asserts the table's CHECK constraints on the result:
// ST_IsValid, not ST_IsEmpty, ST_Covers(geom, ST_PointOnSurface(geom)). The
// dissolve's own pre-serialization output can be valid while the ROUND-
// TRIPPED (5-decimal ST_AsGeoJSON -> ST_GeomFromGeoJSON) geometry is not —
// rounding can introduce a self-intersection at dissolve-union seams — so
// this is what actually predicts whether --stage's insert would pass the
// wine_place_boundaries table CHECKs, not just whether the dissolve did.
async function roundtripStageInsertGeom(boundary, report) {
  const result = await client.query(
    `with geom as (
       select extensions.ST_Multi(
                extensions.ST_CollectionExtract(
                  extensions.ST_MakeValid(
                    extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($1), 4326)
                  ), 3)) g
     )
     select extensions.ST_IsValid(g) valid,
            extensions.ST_IsEmpty(g) is_empty,
            extensions.ST_Covers(g, extensions.ST_PointOnSurface(g)) covers_label
       from geom`,
    [report.geojson],
  );
  const rt = result.rows[0];
  assert.ok(
    rt.valid,
    `${boundary.label}: post-round-trip (--stage insert CTE) geometry is invalid — the dissolve ` +
      `output passed ST_IsValid, but re-parsing it through GeoJSON like the real insert does did not`,
  );
  assert.equal(
    rt.is_empty,
    false,
    `${boundary.label}: post-round-trip (--stage insert CTE) geometry is empty`,
  );
  assert.ok(
    rt.covers_label,
    `${boundary.label}: post-round-trip (--stage insert CTE) geometry does not cover ` +
      `ST_PointOnSurface(geometry) — would fail the wine_place_boundaries ST_Covers CHECK`,
  );
  return rt;
}

const reports = {};
try {
  await client.query("begin");
  await client.query("set local statement_timeout = 600000");
  for (const boundary of BOUNDARIES) {
    console.log(`dissolving ${boundary.label} (tolerance ${boundary.tolerance})...`);
    reports[boundary.key] = await dissolveInTx(boundary);
    const r = reports[boundary.key];
    console.log(
      `  ${boundary.label}: ${r.npoints} vertices, ${r.nparts} part(s), ` +
        `bbox lon ${Number(r.minx).toFixed(3)}..${Number(r.maxx).toFixed(3)} ` +
        `lat ${Number(r.miny).toFixed(3)}..${Number(r.maxy).toFixed(3)}, valid=${r.valid}, covers_label=${r.covers_label}`,
    );
    const rt = await roundtripStageInsertGeom(boundary, r);
    console.log(
      `  ${boundary.label}: post-round-trip (--stage insert CTE) valid=${rt.valid} ` +
        `is_empty=${rt.is_empty} covers_label=${rt.covers_label}`,
    );
  }

  if (!STAGE) {
    await client.query("rollback");
    console.log("rolled back — temp table only, nothing persisted");
  }
} catch (e) {
  await client.query("rollback").catch(() => {});
  await client.end();
  throw e;
}

// --- preview SVGs (default mode always writes these; harmless in --stage too) ---
await mkdir(OUT_DIR, { recursive: true });
for (const boundary of BOUNDARIES) {
  const r = reports[boundary.key];
  const g = JSON.parse(r.geojson);
  const pad = boundary.key === "piemonte" ? 0.15 : 0.03;
  const [w, s, e, n] = [
    Number(r.minx) - pad,
    Number(r.miny) - pad,
    Number(r.maxx) + pad,
    Number(r.maxy) + pad,
  ];
  const scale = 1200 / Math.max(e - w, n - s);
  const project = ([x, y]) => `${((x - w) * scale).toFixed(1)},${((n - y) * scale).toFixed(1)}`;
  let d = "";
  for (const poly of g.coordinates) for (const ring of poly) d += `M${ring.map(project).join("L")}Z`;
  const W = ((e - w) * scale).toFixed(0);
  const H = ((n - s) * scale).toFixed(0);
  const title = `Piemonte — ${boundary.label} (DRAFT, ISTAT comuni union)`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif">` +
    `<rect width="${W}" height="${H}" fill="${BACKGROUND}"/>` +
    `<path d="${d}" fill="${FILL}" fill-opacity="0.55" stroke="${CASING}" stroke-width="2.2"/>` +
    `<text x="${Number(W) / 2}" y="24" font-size="16" font-weight="bold" text-anchor="middle" ` +
    `paint-order="stroke" stroke="${CASING}" stroke-width="3" stroke-linejoin="round" fill="#2b0f18">${title}</text>` +
    `</svg>\n`;
  const outPath = `${OUT_DIR}/preview-${boundary.key}-dissolved.svg`;
  await writeFile(outPath, svg);
  console.log(`wrote ${outPath}`);
}

if (!STAGE) {
  // Confirmation read: no italy* boundary rows exist (rollback already
  // guarantees this — this is a belt-and-braces visibility check).
  const check = await client.query(
    `select count(*)::int as n
       from wine_place_boundaries b
       join wine_places p on p.id = b.wine_place_id
      where p.canonical_key like 'italy%'`,
  );
  console.log(`post-run check: ${check.rows[0].n} italy* wine_place_boundaries rows exist`);
  await client.end();
  console.log("DONE (default mode): dissolved + asserted all three boundaries, persisted nothing.");
  process.exit(0);
}

// =============================================================================
// --stage mode: controller-gated. Uploads raw+normalized artifacts, commits
// source/snapshot/boundary rows. The transaction opened above is still open
// (not rolled back) and reuses the exact geometry already computed.
// =============================================================================
console.log("STAGE MODE: uploading artifacts + committing boundary rows...");

const importer = `scripts/wine-map-sources/stage-piedmont-boundaries.mjs@${
  process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()
}`;

async function membershipGeneration(boundary) {
  if (boundary.key === "piemonte") {
    return {
      engine: "administrative-region-dissolve",
      comune_count: members.piemonte.length,
      commune_geometry: "ISTAT comuni (guglielmo/geojson-italy region-1 mirror)",
      membership_source: "ISTAT region code 1 (Piemonte) — every comune in the fetched region file",
      simplify_tolerance: boundary.tolerance,
      coordinate_precision: 5,
      note: "Actual administrative Piemonte region: dissolve of every comune in the ISTAT region-1 file, not just the Barolo/Barbaresco member comuni.",
    };
  }
  return {
    engine: "commune-union",
    member_comune_count: members[boundary.key].length,
    source_commune_list: boundary.membershipFile,
    commune_geometry: "ISTAT comuni (guglielmo/geojson-italy region-1 mirror)",
    membership_source: `Disciplinare di produzione DOCG «${boundary.label}», Art. 3 (zona di produzione)`,
    simplify_tolerance: boundary.tolerance,
    coordinate_precision: 5,
    note:
      boundary.key === "barbaresco"
        ? "Whole-comune over-approximation: Barbaresco + Neive + Treiso union. Alba is EXCLUDED (only its San Rocco Seno d'Elvio frazione is in the DOCG; ISTAT has no sub-comune geometry) — see data/wine-map/barbaresco-comuni.json."
        : "Whole-comune over-approximation: partial member comuni (e.g. Cherasco, Roddi) are included whole, not trimmed to their true vineyard-land sliver — see data/wine-map/barolo-comuni.json.",
  };
}

try {
  for (const boundary of BOUNDARIES) {
    const memberList = members[boundary.key];
    const rawFeatures = memberList.map((m) => ({
      type: "Feature",
      properties: { [PILOT_NAME_PROP]: m.name, [PILOT_PRO_COM_PROP]: m.pro_com },
      geometry: m.feature.geometry,
    }));
    const rawBody = Buffer.from(
      `${JSON.stringify({ type: "FeatureCollection", features: rawFeatures })}\n`,
    );
    const rawPath = `${NAMESPACE}/${revision}/${boundary.featureId}/raw-comuni.geojson`;
    await uploadRawObject(rawPath, rawBody, { upsert: false });
    console.log(`raw artifact -> storage://wine-map-sources/${rawPath}`);

    const generation = await membershipGeneration(boundary);
    const report = reports[boundary.key];
    const normalizedFeature = {
      type: "Feature",
      properties: { target_key: boundary.targetKey, generation },
      geometry: JSON.parse(report.geojson),
    };
    const normalizedBody = Buffer.from(`${JSON.stringify(normalizedFeature)}\n`);
    const normalizedPath = `${NAMESPACE}/${revision}/${boundary.featureId}/normalized.geojson`;
    await uploadRawObject(normalizedPath, normalizedBody, { upsert: true });
    console.log(`normalized artifact -> storage://wine-map-sources/${normalizedPath}`);

    const sourceFeatureRefs =
      boundary.key === "piemonte"
        ? { comune_count: memberList.length }
        : { comune_count: memberList.length, comuni: memberList.map((m) => ({ name: m.name, pro_com: m.pro_com })) };

    const result = await client.query(
      `with source as (
         insert into wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
         values ($1, $2, $3, $4)
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
         select source.id, $5, now(), $6, $7,
                $8, $9, $10, $11,
                $12,
                $13
         from source
         returning id
       ),
       geom as (
         select extensions.ST_Multi(
                  extensions.ST_CollectionExtract(
                    extensions.ST_MakeValid(
                      extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($14), 4326)
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
              $15::jsonb,
              $16::jsonb,
              $5, false, null
         from wine_places place, source, snapshot, geom
        where place.canonical_key = $17
       returning id`,
      [
        NAMESPACE,
        boundary.featureId,
        AUTHORITY,
        JURISDICTION,
        revision,
        PILOT_SOURCE_URL,
        PILOT_LICENCE,
        `storage://wine-map-sources/${rawPath}`,
        sha256hex(rawBody),
        `storage://wine-map-sources/${normalizedPath}`,
        sha256hex(normalizedBody),
        `Whole-comune union footprint from ISTAT comuni (region 1, Piemonte). ${generation.note}`,
        importer,
        report.geojson,
        JSON.stringify(sourceFeatureRefs),
        JSON.stringify(generation),
        boundary.targetKey,
      ],
    );
    assert.equal(result.rows.length, 1, `${boundary.label}: expected one staged boundary row`);
    console.log(`BOUNDARY-STAGED ${boundary.key} DRAFT boundary=${result.rows[0].id}`);
  }
  await client.query("commit");
  console.log("STAGE MODE COMPLETE: 3 DRAFT boundaries committed.");
} catch (e) {
  await client.query("rollback").catch(() => {});
  throw e;
} finally {
  await client.end();
}
