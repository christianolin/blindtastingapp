// Region overview for Spain: each comunidad REGION node (spain.<comunidad>) gets
// a boundary = the dissolve of ALL its ready DOs' member municipios — the wine
// footprint of the comunidad, exactly as France/Italy regions are the union of
// their appellations. Without this the comunidad nodes are tree-only and Spain
// shows nothing until you zoom into the tier-2 DOs (z6); with it the comunidad
// renders at region zoom (z4) like Bourgogne/Piemonte.
//
// Re-runnable: recomputes every comunidad boundary from the current membership
// artifact, retiring the previous one. Run it after each DO wave. Default is a
// DRY dissolve+guard (rolled back); --commit persists.
//
// Usage: node scripts/wine-map-sources/build-spain-comunidad-boundaries.mjs [--commit]
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { sha256hex, releaseVersion } from "../wine-map-tiles/lib.mjs";
import { uploadRawObject } from "./inao-lib.mjs";
import { loadMunicipioCache } from "./fetch-spain-municipios.mjs";
import { buildMunicipioIndex } from "./spain-lib.mjs";

const MEMBERSHIP_FILE = "data/wine-map/spain-do-membership.json";
const NAMESPACE = "IGN_CNIG_SPAIN";
const DATASET_URL = "https://public.opendatasoft.com/explore/dataset/georef-spain-municipio/";
const WINDOW = { minLon: -10, minLat: 35, maxLon: 5, maxLat: 44 };
const COMMIT = process.argv.includes("--commit");

async function loadDatabaseUrl() {
  const raw = await readFile(new URL("../../.env.local", import.meta.url), "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  assert.ok(line, "DATABASE_URL not found in .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

// Region-scale dissolve: union member municipios, simplify a touch coarser than
// a single DO (region overview), rebuild solid parts from exterior rings.
async function dissolve(client, geometries) {
  await client.query("drop table if exists _com_dissolve");
  await client.query("create temp table _com_dissolve (geom extensions.geometry)");
  await client.query(
    `insert into _com_dissolve (geom)
       select extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g), 4326))
         from unnest($1::text[]) g`,
    [geometries.map((g) => JSON.stringify(g))],
  );
  const { rows } = await client.query(
    `with u as (
       select extensions.ST_UnaryUnion(extensions.ST_MakeValid(extensions.ST_Collect(geom))) g from _com_dissolve
     ),
     simp as (
       select extensions.ST_CollectionExtract(
                extensions.ST_MakeValid(extensions.ST_SimplifyPreserveTopology(g, 0.003)), 3) g from u
     ),
     noholes as (
       select extensions.ST_Multi(extensions.ST_Collect(
                extensions.ST_MakePolygon(extensions.ST_ExteriorRing(d.geom)))) g
         from simp, lateral extensions.ST_Dump(extensions.ST_Multi(simp.g)) d
     ),
     labelled as (select g, extensions.ST_PointOnSurface(g) lp from noholes)
     select extensions.ST_AsGeoJSON(g, 5) geojson,
            extensions.ST_NPoints(g) npoints, extensions.ST_NumGeometries(g) nparts,
            extensions.ST_IsValid(g) valid, extensions.ST_IsEmpty(g) is_empty,
            extensions.ST_Covers(g, lp) covers_label, extensions.ST_Area(g) area,
            extensions.ST_XMin(extensions.Box3D(g)) minx, extensions.ST_YMin(extensions.Box3D(g)) miny,
            extensions.ST_XMax(extensions.Box3D(g)) maxx, extensions.ST_YMax(extensions.Box3D(g)) maxy
       from labelled`,
  );
  return rows[0];
}

function assertGuards(report, label) {
  assert.ok(report.geojson && report.is_empty === false && report.valid, `${label}: invalid/empty geometry`);
  assert.ok(report.covers_label, `${label}: geometry does not cover its label point`);
  assert.ok(
    report.minx >= WINDOW.minLon && report.miny >= WINDOW.minLat && report.maxx <= WINDOW.maxLon && report.maxy <= WINDOW.maxLat,
    `${label}: bbox escapes the Spain window`,
  );
}

async function main() {
  const membership = JSON.parse(await readFile(MEMBERSHIP_FILE, "utf8"));
  const cache = await loadMunicipioCache();
  const index = buildMunicipioIndex(cache);

  // comunidad_key -> { key: spain.<comunidad>, geometries: [], doCount, munCount }
  const byCom = new Map();
  for (const d of membership.denominations) {
    if (d.status !== "ready") continue;
    const comKey = `spain.${d.comunidad_key}`;
    const g = byCom.get(comKey) ?? { comunidad: d.comunidad, geometries: [], codes: new Set(), dos: 0 };
    g.dos += 1;
    for (const m of d.municipios) {
      if (g.codes.has(m.code)) continue;
      const rec = index.byCode.get(m.code);
      assert.ok(rec, `${d.canonical_key}: mun_code ${m.code} missing from cache`);
      g.codes.add(m.code);
      g.geometries.push(rec.geometry);
    }
    byCom.set(comKey, g);
  }

  const client = new pg.Client({ connectionString: await loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  const revision = releaseVersion();
  const importer = `scripts/wine-map-sources/build-spain-comunidad-boundaries.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`;
  let done = 0;
  try {
    for (const [comKey, g] of byCom) {
      await client.query("begin");
      try {
        await client.query("set local statement_timeout = 600000");
        const place = await client.query("select id from wine_places where canonical_key = $1", [comKey]);
        assert.equal(place.rows.length, 1, `${comKey}: comunidad REGION node missing (create it in a catalog migration first)`);
        const report = await dissolve(client, g.geometries);
        assertGuards(report, comKey);

        if (!COMMIT) {
          await client.query("rollback");
          console.log(`DRY OK ${comKey}: ${g.dos} DOs / ${g.codes.size} municipios -> ${report.npoints} pts, ${report.nparts} part(s), area ${Number(report.area).toFixed(3)}`);
          continue;
        }

        const featureId = comKey.split(".").at(-1);
        const rawBody = Buffer.from(`${JSON.stringify({ type: "FeatureCollection", features: [...g.codes].map((c) => ({ type: "Feature", properties: { mun_code: c }, geometry: index.byCode.get(c).geometry }))})}\n`);
        const rawPath = `${NAMESPACE}/${revision}/comunidad-${featureId}/raw-municipios.geojson`;
        await uploadRawObject(rawPath, rawBody, { upsert: true });
        const generation = { engine: "comunidad-union", do_count: g.dos, member_municipio_count: g.codes.size, simplify_tolerance: 0.003, coordinate_precision: 5, note: "Region overview: union of every ready DO's member municipios in this comunidad." };
        const normBody = Buffer.from(`${JSON.stringify({ type: "Feature", properties: { target_key: comKey, generation }, geometry: JSON.parse(report.geojson) })}\n`);
        const normPath = `${NAMESPACE}/${revision}/comunidad-${featureId}/normalized.geojson`;
        await uploadRawObject(normPath, normBody, { upsert: true });

        await client.query("update wine_place_boundaries set is_current = false where wine_place_id = $1 and is_current", [place.rows[0].id]);
        const res = await client.query(
          `with source as (
             insert into wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
             values ($1, $2, 'IGN/CNIG España (municipios) + BOE pliegos (membership)', 'Spain')
             on conflict (source_namespace, source_feature_id) do update set authority = excluded.authority
             returning id
           ),
           snapshot as (
             insert into wine_boundary_source_snapshots (
               source_id, source_revision, retrieved_at, source_url, licence,
               raw_snapshot_uri, raw_checksum_sha256, normalized_artifact_uri, normalized_checksum_sha256,
               provenance_note, importer_version
             )
             select source.id, $3, now(), $4, $5, $6, $7, $8, $9, $10, $11 from source
             returning id
           ),
           geom as (
             select extensions.ST_Multi(extensions.ST_CollectionExtract(
                      extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($12), 4326)), 3)) g
           )
           insert into wine_place_boundaries (
             wine_place_id, source_snapshot_id, boundary_method, quality_status,
             display_geometry, label_point, bbox, source_feature_refs, generation_parameters,
             revision, is_current, reviewed_at
           )
           select $13, snapshot.id, 'MANUAL', 'VALIDATED', geom.g, extensions.ST_PointOnSurface(geom.g),
                  array[extensions.ST_XMin(extensions.Box3D(geom.g)), extensions.ST_YMin(extensions.Box3D(geom.g)),
                        extensions.ST_XMax(extensions.Box3D(geom.g)), extensions.ST_YMax(extensions.Box3D(geom.g))]::double precision[],
                  $14::jsonb, $15::jsonb, $3, true, now()
             from snapshot, geom
           returning id`,
          [
            NAMESPACE, `comunidad:${featureId}`, revision, DATASET_URL, cache.licence ?? "IGN/CNIG open data",
            `storage://wine-map-sources/${rawPath}`, sha256hex(rawBody),
            `storage://wine-map-sources/${normPath}`, sha256hex(normBody),
            `Comunidad overview: union of ${g.dos} DO(s)' ${g.codes.size} member municipios.`, importer,
            report.geojson, place.rows[0].id,
            JSON.stringify({ do_count: g.dos, municipio_count: g.codes.size }), JSON.stringify(generation),
          ],
        );
        assert.equal(res.rows.length, 1, `${comKey}: boundary insert failed`);
        const check = await client.query("select count(*)::int n from wine_place_boundaries where wine_place_id = $1 and is_current and quality_status = 'VALIDATED'", [place.rows[0].id]);
        assert.equal(check.rows[0].n, 1, `${comKey}: expected exactly 1 current-validated boundary`);
        await client.query("commit");
        done += 1;
        console.log(`BUILT ${comKey}: ${g.dos} DOs / ${g.codes.size} municipios -> boundary ${res.rows[0].id}`);
      } catch (error) {
        await client.query("rollback").catch(() => {});
        console.error(`REJECT ${comKey}: ${error.message}`);
      }
    }
    console.log(`DONE: ${done} comunidad boundaries ${COMMIT ? "committed" : "(dry — rolled back)"}.`);
  } finally {
    await client.end();
  }
}

await main();
