// Task: stage DRAFT wine_place_boundaries for six Langhe-area denominations
// from the OFFICIAL Regione Piemonte delimited-area dataset, replacing the
// old ISTAT-comune-dissolve approximation (stage-piedmont-boundaries.mjs) for
// Barolo/Barbaresco and supplying accurate footprints for four new targets:
// Dogliani, Dolcetto di Diano d'Alba, Verduno Pelaverga o Verduno, Langhe.
//
// Source: data/wine-map/piemonte-doc-docg.geojson — a FeatureCollection
// (EPSG:4326) already committed to the repo (reprojected from the official
// EPSG:32632 Regione Piemonte "Aree di produzione dei vini DOC e DOCG"
// dataset; see its top-level `_provenance` object for the authoritative
// source/licence detail). No shapefile parsing, no network fetch — this
// script reads that one committed file.
//
// Unlike the ISTAT commune-union approximation, these are AUTHORITATIVE
// delimited zones: interior rings (holes) are real and are NOT stripped.
//
// DEFAULT mode (no flag): build all six inside a single `begin ... rollback`
// transaction, run every geometry assertion the real staging insert would
// also enforce (validity, non-empty, window bbox, ST_Covers(geom,
// label_point)), plus the post-round-trip validity check against the exact
// --stage insert CTE, write a preview SVG per boundary to .tiles-build/, and
// print vertex/part counts + bbox. No bucket upload, no boundary insert —
// this mode is safe to run freely.
//
// `--stage` mode (controller-gated; do NOT run from this task): reuses the
// exact same computed geometry (same open transaction, no rollback) to
// commit wine_boundary_sources / wine_boundary_source_snapshots /
// wine_place_boundaries rows — boundary_method='GENERALIZED_FROM_OFFICIAL_SOURCE',
// quality_status='DRAFT', is_current=false. The source geojson is already an
// immutable, committed repo artifact (unlike the ephemeral WFS/API payloads
// other adapters fetch), so normalized_artifact_uri points directly at its
// repo path + content sha256 rather than a fresh per-run bucket upload;
// raw_snapshot_uri is left null with a provenance_note filled in (the schema
// requires one or the other).
//
// Env: DATABASE_URL (read from .env.local). No SUPABASE_SERVICE_ROLE_KEY
// needed (no bucket upload — see note above).
// Usage:
//   node scripts/wine-map-sources/stage-piemonte-official.mjs           (test only, default)
//   node scripts/wine-map-sources/stage-piemonte-official.mjs --stage   (controller-gated; persists)
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { sha256hex, releaseVersion } from "../wine-map-tiles/lib.mjs";

const hasFlag = (n) => process.argv.includes(`--${n}`);
const STAGE = hasFlag("stage");

const OUT_DIR = ".tiles-build";
const SOURCE_FILE = "data/wine-map/piemonte-doc-docg.geojson";
const NAMESPACE = "PIEMONTE_DOC_DOCG";
const AUTHORITY = "Regione Piemonte — Direzione Agricoltura e Cibo";
const JURISDICTION = "Italy";
const LICENCE = "CC BY 4.0";
const SIMPLIFY_TOLERANCE = 0.0002;
// Piemonte staging window, per the task brief: [minLon, minLat, maxLon, maxLat].
const WINDOW = { minLon: 6.5, minLat: 44.0, maxLon: 9.3, maxLat: 46.6 };
const revision = releaseVersion();

// Same France-palette single boundary colour as stage-piedmont-boundaries.mjs.
const FILL = "#8C2D3C";
const CASING = "#FFFDF7";
const BACKGROUND = "#F4F0E4";

const BOUNDARIES = [
  { key: "barolo", targetKey: "italy.piemonte.barolo", denominazi: "Barolo", label: "Barolo" },
  { key: "barbaresco", targetKey: "italy.piemonte.barbaresco", denominazi: "Barbaresco", label: "Barbaresco" },
  { key: "dogliani", targetKey: "italy.piemonte.dogliani", denominazi: "Dogliani", label: "Dogliani" },
  {
    key: "diano-dalba",
    targetKey: "italy.piemonte.diano-dalba",
    denominazi: "Dolcetto di Diano d'Alba",
    label: "Dolcetto di Diano d'Alba",
  },
  {
    key: "verduno-pelaverga",
    targetKey: "italy.piemonte.verduno-pelaverga",
    denominazi: "Verduno Pelaverga o Verduno",
    label: "Verduno Pelaverga o Verduno",
  },
  { key: "langhe", targetKey: "italy.piemonte.langhe", denominazi: "Langhe", label: "Langhe" },
  { key: "roero", targetKey: "italy.piemonte.roero", denominazi: "Roero", label: "Roero" },
  {
    key: "gavi",
    targetKey: "italy.piemonte.gavi",
    denominazi: "Gavi o Cortese di Gavi",
    label: "Gavi",
  },
  {
    key: "monferrato",
    targetKey: "italy.piemonte.monferrato",
    denominazi: "Monferrato",
    label: "Monferrato",
  },
  {
    key: "barbera-dasti",
    targetKey: "italy.piemonte.barbera-dasti",
    denominazi: "Barbera D'Asti",
    label: "Barbera d'Asti",
  },
  { key: "nizza", targetKey: "italy.piemonte.nizza", denominazi: "Nizza", label: "Nizza" },
  { key: "asti", targetKey: "italy.piemonte.asti", denominazi: "Asti", label: "Asti" },
  {
    key: "brachetto-dacqui",
    targetKey: "italy.piemonte.brachetto-dacqui",
    denominazi: "Brachetto D'Acqui",
    label: "Brachetto d'Acqui",
  },
  {
    key: "gattinara",
    targetKey: "italy.piemonte.gattinara",
    denominazi: "Gattinara",
    label: "Gattinara",
  },
  { key: "ghemme", targetKey: "italy.piemonte.ghemme", denominazi: "Ghemme", label: "Ghemme" },
  // Batch 2.
  { key: "alta-langa", targetKey: "italy.piemonte.alta-langa", denominazi: "Alta Langa", label: "Alta Langa" },
  {
    key: "colli-tortonesi",
    targetKey: "italy.piemonte.colli-tortonesi",
    denominazi: "Colli Tortonesi",
    label: "Colli Tortonesi",
  },
  {
    key: "ruche",
    targetKey: "italy.piemonte.ruche",
    denominazi: "Ruche' di Castagnole Monferrato",
    label: "Ruché di Castagnole Monferrato",
  },
  {
    key: "grignolino-dasti",
    targetKey: "italy.piemonte.grignolino-dasti",
    denominazi: "Grignolino d'Asti",
    label: "Grignolino d'Asti",
  },
  {
    key: "grignolino-casalese",
    targetKey: "italy.piemonte.grignolino-casalese",
    denominazi: "Grignolino del Monferrato Casalese",
    label: "Grignolino del Monferrato Casalese",
  },
  // Batch 3 — Alto Piemonte siblings.
  { key: "boca", targetKey: "italy.piemonte.boca", denominazi: "Boca", label: "Boca" },
  { key: "bramaterra", targetKey: "italy.piemonte.bramaterra", denominazi: "Bramaterra", label: "Bramaterra" },
  { key: "lessona", targetKey: "italy.piemonte.lessona", denominazi: "Lessona", label: "Lessona" },
  { key: "fara", targetKey: "italy.piemonte.fara", denominazi: "Fara", label: "Fara" },
  { key: "sizzano", targetKey: "italy.piemonte.sizzano", denominazi: "Sizzano", label: "Sizzano" },
  {
    key: "colline-novaresi",
    targetKey: "italy.piemonte.colline-novaresi",
    denominazi: "Colline Novaresi",
    label: "Colline Novaresi",
  },
  {
    key: "coste-della-sesia",
    targetKey: "italy.piemonte.coste-della-sesia",
    denominazi: "Coste della Sesia",
    label: "Coste della Sesia",
  },
  // Batch 4 — Canavese subregion.
  { key: "canavese", targetKey: "italy.piemonte.canavese", denominazi: "Canavese", label: "Canavese" },
  {
    key: "erbaluce-di-caluso",
    targetKey: "italy.piemonte.erbaluce-di-caluso",
    denominazi: "Erbaluce di Caluso",
    label: "Erbaluce di Caluso",
  },
  { key: "carema", targetKey: "italy.piemonte.carema", denominazi: "Carema", label: "Carema" },
];

function slugify(name) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

// --- 1. read the committed source geojson -----------------------------------
console.log(`reading ${SOURCE_FILE}`);
const sourcePath = new URL(`../../${SOURCE_FILE}`, import.meta.url);
const sourceBuffer = await readFile(sourcePath);
const sourceSha256 = sha256hex(sourceBuffer);
const source = JSON.parse(sourceBuffer.toString("utf8"));
assert.equal(source.type, "FeatureCollection", "source is not a FeatureCollection");
assert.ok(Array.isArray(source.features) && source.features.length > 0, "empty source feature collection");
assert.ok(source._provenance, "source is missing its _provenance object");
assert.ok(source._provenance.download, "source._provenance.download (source URL) is missing");
console.log(`loaded ${source.features.length} features; sha256=${sourceSha256}`);
console.log(`_provenance.source: ${source._provenance.source}`);
console.log(`_provenance.download: ${source._provenance.download}`);

// --- 2. resolve each boundary's matching features, fail-closed --------------
function resolveFeatures(boundary) {
  const hits = source.features.filter((f) => f.properties?.denominazi === boundary.denominazi);
  assert.ok(
    hits.length > 0,
    `${boundary.label}: no source features matched denominazi "${boundary.denominazi}"`,
  );
  return hits;
}

const matched = {};
for (const boundary of BOUNDARIES) {
  matched[boundary.key] = resolveFeatures(boundary);
  console.log(`${boundary.label}: ${matched[boundary.key].length} matching feature(s)`);
}

// --- 3. connect + build each boundary in Postgres ----------------------------
const connectionString = await loadDatabaseUrl();
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

async function buildInTx(boundary) {
  const geojsonStrings = matched[boundary.key].map((f) => JSON.stringify(f.geometry));
  const result = await client.query(
    `with input_geoms as (
       select extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g), 4326) as geom
         from unnest($1::text[]) as g
     ),
     built as (
       select extensions.ST_Multi(
                extensions.ST_CollectionExtract(
                  extensions.ST_MakeValid(
                    extensions.ST_SimplifyPreserveTopology(
                      extensions.ST_Collect(geom), $2
                    )
                  ), 3
                )
              ) as g
         from input_geoms
     ),
     labelled as (
       select g, extensions.ST_PointOnSurface(g) as lp from built
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
    [geojsonStrings, SIMPLIFY_TOLERANCE],
  );
  const report = result.rows[0];
  assert.ok(report.geojson, `${boundary.label}: build produced no geometry`);
  assert.equal(report.is_empty, false, `${boundary.label}: built geometry is empty`);
  assert.ok(report.valid, `${boundary.label}: built geometry is invalid`);
  assert.ok(
    report.covers_label,
    `${boundary.label}: display_geometry does not cover its own label_point`,
  );
  assert.ok(
    report.minx >= WINDOW.minLon &&
      report.miny >= WINDOW.minLat &&
      report.maxx <= WINDOW.maxLon &&
      report.maxy <= WINDOW.maxLat,
    `${boundary.label}: built bbox ${report.minx},${report.miny},${report.maxx},${report.maxy} ` +
      `escapes window lon[${WINDOW.minLon},${WINDOW.maxLon}] lat[${WINDOW.minLat},${WINDOW.maxLat}]`,
  );
  return report;
}

// Round-trips report.geojson through the EXACT same geom CTE the --stage
// insert uses (ST_GeomFromGeoJSON -> ST_MakeValid -> ST_CollectionExtract(3)
// -> ST_Multi) and asserts the table's CHECK constraints on the result. The
// build's own pre-serialization output can be valid while the ROUND-TRIPPED
// (5-decimal ST_AsGeoJSON -> ST_GeomFromGeoJSON) geometry is not — rounding
// can introduce a self-intersection at seams — so this is what actually
// predicts whether --stage's insert would pass the wine_place_boundaries
// table CHECKs, not just whether the build did.
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
    `${boundary.label}: post-round-trip (--stage insert CTE) geometry is invalid — the build ` +
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
  // Resumable: skip targets whose place already has a current boundary from this
  // namespace (e.g. the live Langhe set) so re-running never duplicates them.
  const existingRes = await client.query(
    `select p.canonical_key from wine_places p
       join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
       join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
       join wine_boundary_sources so on so.id = s.source_id
      where so.source_namespace = $1 and p.canonical_key = any($2::text[])`,
    [NAMESPACE, BOUNDARIES.map((b) => b.targetKey)],
  );
  const alreadyCurrent = new Set(existingRes.rows.map((r) => r.canonical_key));
  for (const boundary of BOUNDARIES) {
    if (alreadyCurrent.has(boundary.targetKey)) {
      console.log(`SKIP (already current ${NAMESPACE}) ${boundary.label}`);
      continue;
    }
    console.log(`building ${boundary.label} (tolerance ${SIMPLIFY_TOLERANCE})...`);
    reports[boundary.key] = await buildInTx(boundary);
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
    console.log("rolled back — nothing persisted");
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
  if (!r) continue;
  const g = JSON.parse(r.geojson);
  const pad = boundary.key === "langhe" ? 0.05 : 0.03;
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
  const title = `Piemonte — ${boundary.label} (DRAFT, official Regione Piemonte delimited area)`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif">` +
    `<rect width="${W}" height="${H}" fill="${BACKGROUND}"/>` +
    `<path d="${d}" fill="${FILL}" fill-opacity="0.55" stroke="${CASING}" stroke-width="2.2" fill-rule="evenodd"/>` +
    `<text x="${Number(W) / 2}" y="24" font-size="16" font-weight="bold" text-anchor="middle" ` +
    `paint-order="stroke" stroke="${CASING}" stroke-width="3" stroke-linejoin="round" fill="#2b0f18">${title}</text>` +
    `</svg>\n`;
  const outPath = `${OUT_DIR}/preview-${boundary.key}-official.svg`;
  await writeFile(outPath, svg);
  console.log(`wrote ${outPath}`);
}

if (!STAGE) {
  // Confirmation read: no DRAFT boundary rows from this source namespace
  // exist for our six targets (rollback already guarantees this — this is a
  // belt-and-braces visibility check).
  const targetKeys = BOUNDARIES.map((b) => b.targetKey);
  const check = await client.query(
    `select count(*)::int as n
       from wine_place_boundaries b
       join wine_places p on p.id = b.wine_place_id
      where p.canonical_key = any($1::text[])
        and b.quality_status = 'DRAFT'
        and b.source_snapshot_id in (
          select s.id
            from wine_boundary_source_snapshots s
            join wine_boundary_sources so on so.id = s.source_id
           where so.source_namespace = $2
        )`,
    [targetKeys, NAMESPACE],
  );
  console.log(
    `post-run check: ${check.rows[0].n} DRAFT wine_place_boundaries rows exist for the six targets under ${NAMESPACE}`,
  );
  await client.end();
  console.log("DONE (default mode): built + asserted all six boundaries, persisted nothing.");
  process.exit(0);
}

// =============================================================================
// --stage mode: controller-gated. Commits source/snapshot/boundary rows. The
// transaction opened above is still open (not rolled back) and reuses the
// exact geometry already computed. No bucket upload: the source geojson is
// already an immutable, committed repo artifact (see header note), so
// normalized_artifact_uri points at its repo path + content sha256 directly.
// =============================================================================
console.log("STAGE MODE: committing boundary rows...");

const importer = `scripts/wine-map-sources/stage-piemonte-official.mjs@${
  process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()
}`;

try {
  for (const boundary of BOUNDARIES) {
    if (!reports[boundary.key]) continue;
    const features = matched[boundary.key];
    const firstCodice = features[0]?.properties?.codice;
    const sourceFeatureId =
      firstCodice && String(firstCodice).trim() ? String(firstCodice).trim() : slugify(boundary.denominazi);

    const report = reports[boundary.key];
    const generation = {
      engine: "official-delimited-area",
      denominazi: boundary.denominazi,
      matched_feature_count: features.length,
      matched_codici: features.map((f) => f.properties?.codice ?? null),
      simplify_tolerance: SIMPLIFY_TOLERANCE,
      coordinate_precision: 5,
      note:
        "Authoritative delimited zone from Regione Piemonte's official DOC/DOCG production-area " +
        "dataset — interior rings (holes) are real and were not stripped, unlike the earlier " +
        "ISTAT whole-comune approximation.",
    };
    const sourceFeatureRefs = {
      denominazi: boundary.denominazi,
      codici: features.map((f) => f.properties?.codice ?? null),
      tipo: features[0]?.properties?.tipo ?? null,
    };
    const provenanceNote =
      `Official Regione Piemonte DOC/DOCG delimited-area polygon(s) for "${boundary.denominazi}" ` +
      `(feature codice ${sourceFeatureId}), read directly from the repo-committed ${SOURCE_FILE} ` +
      `(see that file's _provenance object for full source/licence detail). No separate raw/bucket ` +
      `artifact — the committed file at its current git content is the immutable snapshot.`;

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
                null, null, $8, $9,
                $10,
                $11
         from source
         returning id
       ),
       geom as (
         select extensions.ST_Multi(
                  extensions.ST_CollectionExtract(
                    extensions.ST_MakeValid(
                      extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($12), 4326)
                    ), 3)) g
       )
       insert into wine_place_boundaries (
         wine_place_id, source_snapshot_id, boundary_method, quality_status,
         display_geometry, label_point, bbox, source_feature_refs,
         generation_parameters, revision, is_current, reviewed_at
       )
       select place.id, snapshot.id, 'GENERALIZED_FROM_OFFICIAL_SOURCE', 'DRAFT',
              geom.g, extensions.ST_PointOnSurface(geom.g),
              array[
                extensions.ST_XMin(extensions.Box3D(geom.g)),
                extensions.ST_YMin(extensions.Box3D(geom.g)),
                extensions.ST_XMax(extensions.Box3D(geom.g)),
                extensions.ST_YMax(extensions.Box3D(geom.g))
              ]::double precision[],
              $13::jsonb,
              $14::jsonb,
              $5, false, null
         from wine_places place, source, snapshot, geom
        where place.canonical_key = $15
       returning id`,
      [
        NAMESPACE,
        sourceFeatureId,
        AUTHORITY,
        JURISDICTION,
        revision,
        source._provenance.download,
        LICENCE,
        SOURCE_FILE,
        sourceSha256,
        provenanceNote,
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
  console.log("STAGE MODE COMPLETE: 6 DRAFT boundaries committed.");
} catch (e) {
  await client.query("rollback").catch(() => {});
  throw e;
} finally {
  await client.end();
}
