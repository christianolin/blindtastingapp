// Precise Spain country outline = dissolve of ALL peninsular + Balearic INE
// municipios (georef), replacing the coarse Natural Earth 1:50m border so the
// national outline matches the comunidad/DO boundaries' resolution exactly
// (same data source). Canary municipios (prov 35/38) are excluded — out of
// scope + outside the display window. Grid-dissolve (union per 1° cell, then
// globally) keeps the ~8,000-polygon union within the free-tier's capacity.
//
// Default = DRY (dissolve + guard, rolled back). --commit replaces the boundary.
// Usage: node scripts/wine-map-sources/build-spain-country-outline.mjs [--commit]
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { sha256hex, releaseVersion } from "../wine-map-tiles/lib.mjs";
import { uploadRawObject } from "./inao-lib.mjs";
import { loadMunicipioCache } from "./fetch-spain-municipios.mjs";

const NAMESPACE = "IGN_CNIG_SPAIN";
const DATASET_URL = "https://public.opendatasoft.com/explore/dataset/georef-spain-municipio/";
const WINDOW = { minLon: -10, minLat: 35, maxLon: 5, maxLat: 44 };
const SIMPLIFY = 0.0015; // finer than the comunidad overview (0.003); << NE 1:50m
const COMMIT = process.argv.includes("--commit");

async function loadDatabaseUrl() {
  const raw = await readFile(new URL("../../.env.local", import.meta.url), "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  assert.ok(line, "DATABASE_URL not found in .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const cache = await loadMunicipioCache();
  const munis = cache.municipios.filter((m) => m.prov_code !== "35" && m.prov_code !== "38");
  console.log(`dissolving ${munis.length} peninsular + Balearic municipios (Canaries excluded)`);

  const client = new pg.Client({ connectionString: await loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = 900000");
    await client.query("create temp table _mun (cell text, geom extensions.geometry) on commit drop");
    // Load in batches, pre-validated.
    const B = 400;
    for (let i = 0; i < munis.length; i += B) {
      const batch = munis.slice(i, i + B);
      await client.query(
        `insert into _mun (geom) select extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g), 4326)) from unnest($1::text[]) g`,
        [batch.map((m) => JSON.stringify(m.geometry))],
      );
    }
    // 1° grid key, union per cell, then union all cells (bounded memory).
    await client.query(
      `update _mun set cell = floor(extensions.ST_X(extensions.ST_PointOnSurface(geom)))::int::text || ':' || floor(extensions.ST_Y(extensions.ST_PointOnSurface(geom)))::int::text`,
    );
    await client.query("create temp table _cells (g extensions.geometry) on commit drop");
    const cells = (await client.query("select distinct cell from _mun")).rows;
    for (const { cell } of cells) {
      await client.query(
        `insert into _cells select extensions.ST_MakeValid(extensions.ST_UnaryUnion(extensions.ST_Collect(geom))) from _mun where cell = $1`,
        [cell],
      );
    }
    const { rows } = await client.query(
      `with u as (select extensions.ST_UnaryUnion(extensions.ST_MakeValid(extensions.ST_Collect(g))) g from _cells),
       simp as (select extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SimplifyPreserveTopology(g, $1)), 3) g from u),
       noholes as (select extensions.ST_Multi(extensions.ST_Collect(extensions.ST_MakePolygon(extensions.ST_ExteriorRing(d.geom)))) g from simp, lateral extensions.ST_Dump(extensions.ST_Multi(simp.g)) d),
       big as (
         -- keep only components >= 0.02 deg² (drops sliver artifacts from imperfect municipal tiling; keeps mainland + each Balearic island)
         select extensions.ST_Multi(extensions.ST_Collect(d.geom)) g
           from noholes, lateral extensions.ST_Dump(noholes.g) d
          where extensions.ST_Area(d.geom) >= 0.02
       ),
       labelled as (select g, extensions.ST_PointOnSurface(g) lp from big)
       select extensions.ST_AsGeoJSON(g, 5) geojson, extensions.ST_NPoints(g) npoints, extensions.ST_NumGeometries(g) nparts,
              extensions.ST_IsValid(g) valid, extensions.ST_IsEmpty(g) is_empty, extensions.ST_Covers(g, lp) covers,
              extensions.ST_XMin(extensions.Box3D(g)) minx, extensions.ST_YMin(extensions.Box3D(g)) miny,
              extensions.ST_XMax(extensions.Box3D(g)) maxx, extensions.ST_YMax(extensions.Box3D(g)) maxy
         from labelled`,
      [SIMPLIFY],
    );
    const r = rows[0];
    assert.ok(r.geojson && !r.is_empty && r.valid && r.covers, "dissolve produced invalid/empty geometry");
    assert.ok(r.minx >= WINDOW.minLon && r.miny >= WINDOW.minLat && r.maxx <= WINDOW.maxLon && r.maxy <= WINDOW.maxLat, `bbox ${r.minx},${r.miny},${r.maxx},${r.maxy} escapes window`);
    console.log(`dissolved: ${r.npoints} vertices, ${r.nparts} part(s), bbox ${(+r.minx).toFixed(2)}..${(+r.maxx).toFixed(2)} / ${(+r.miny).toFixed(2)}..${(+r.maxy).toFixed(2)}, valid=${r.valid}`);

    if (!COMMIT) { await client.query("rollback"); console.log("DRY — rolled back."); return; }

    const revision = releaseVersion();
    const rawBody = Buffer.from(`${JSON.stringify({ type: "Feature", properties: { note: "Spain outline: dissolve of all peninsular + Balearic INE municipios" }, geometry: JSON.parse(r.geojson) })}\n`);
    const rawPath = `${NAMESPACE}/${revision}/country-spain/outline.geojson`;
    await uploadRawObject(rawPath, rawBody, { upsert: true });
    const place = await client.query("select id from wine_places where canonical_key = 'spain'");
    assert.equal(place.rows.length, 1, "spain place missing");
    await client.query("update wine_place_boundaries set is_current = false where wine_place_id = $1 and is_current", [place.rows[0].id]);
    const res = await client.query(
      `with source as (
         insert into wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
         values ($1, 'georef-municipio-dissolve:ESP', 'IGN/CNIG España', 'Spain')
         on conflict (source_namespace, source_feature_id) do update set authority = excluded.authority
         returning id
       ),
       snapshot as (
         insert into wine_boundary_source_snapshots (source_id, source_revision, retrieved_at, source_url, licence, raw_snapshot_uri, raw_checksum_sha256, normalized_artifact_uri, normalized_checksum_sha256, provenance_note, importer_version)
         select source.id, $2, now(), $3, $4, $5, $6, $5, $6, $7, $8 from source returning id
       ),
       geom as (select extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($9), 4326)), 3)) g)
       insert into wine_place_boundaries (wine_place_id, source_snapshot_id, boundary_method, quality_status, display_geometry, label_point, bbox, source_feature_refs, generation_parameters, revision, is_current, reviewed_at)
       select $10, snapshot.id, 'MANUAL', 'VALIDATED', geom.g, extensions.ST_PointOnSurface(geom.g),
              array[extensions.ST_XMin(extensions.Box3D(geom.g)), extensions.ST_YMin(extensions.Box3D(geom.g)), extensions.ST_XMax(extensions.Box3D(geom.g)), extensions.ST_YMax(extensions.Box3D(geom.g))]::double precision[],
              $11::jsonb, $12::jsonb, $2, true, now()
         from snapshot, geom returning id`,
      [
        NAMESPACE, revision, DATASET_URL, cache.licence ?? "IGN/CNIG open data",
        `storage://wine-map-sources/${rawPath}`, sha256hex(rawBody),
        `Spain country outline: dissolve of ${munis.length} peninsular + Balearic INE municipios (georef), replacing the Natural Earth 1:50m border for a precise, data-consistent national outline.`,
        `scripts/wine-map-sources/build-spain-country-outline.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`,
        r.geojson, place.rows[0].id,
        JSON.stringify({ municipio_count: munis.length }), JSON.stringify({ engine: "municipio-dissolve", simplify_tolerance: SIMPLIFY, min_component_area: 0.02 }),
      ],
    );
    assert.equal(res.rows.length, 1, "boundary insert failed");
    const chk = await client.query("select count(*)::int n from wine_place_boundaries where wine_place_id = $1 and is_current and quality_status = 'VALIDATED'", [place.rows[0].id]);
    assert.equal(chk.rows[0].n, 1, "expected exactly 1 current-validated spain boundary");
    await client.query("commit");
    console.log(`COMMITTED precise Spain outline: ${r.npoints} vertices, ${r.nparts} part(s), boundary ${res.rows[0].id}`);
  } catch (e) { await client.query("rollback").catch(() => {}); throw e; } finally { await client.end(); }
}

await main();
