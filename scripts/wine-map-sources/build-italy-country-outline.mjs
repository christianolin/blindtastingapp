// Precise Italy country outline = dissolve of ALL Italian INE/ISTAT comuni
// (georef-italy-comune), replacing the coarse Natural Earth 1:50m border so the
// national outline matches the region/DOC boundaries' resolution exactly (same
// data family as France's IGN and Spain's IGN/CNIG dissolves). Mirrors
// build-spain-country-outline.mjs: grid-dissolve (union per 1° cell, then
// globally) keeps the ~7,900-polygon union within the free-tier's capacity.
//
// Scope parity with the superseded NE outline: mainland + Sicily + Sardinia.
// Far-south islets below the display window (Lampedusa/Linosa ~35.5°N) are
// dropped before dissolving; the min-component-area filter drops the remaining
// tiny islands (Pantelleria etc.), exactly as the NE version "dropped far-south
// islets". The two big islands dwarf that threshold and are kept.
//
// Default = DRY (dissolve + guard, rolled back). --commit replaces the boundary.
// Usage: node scripts/wine-map-sources/build-italy-country-outline.mjs [--commit]
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { sha256hex, releaseVersion } from "../wine-map-tiles/lib.mjs";
import { uploadRawObject } from "./inao-lib.mjs";
import { loadComuneCache } from "./fetch-italy-comuni.mjs";

const NAMESPACE = "ISTAT_CONFINI";
const DATASET_URL = "https://public.opendatasoft.com/explore/dataset/georef-italy-comune/";
// Metropolitan display window — matches the Task-equivalent NE Italy base
// (extract-italy-ne.mjs BOX / migration 20260829268500): mainland + Sicily +
// Sardinia. A comune whose union component escapes this window is rejected.
const WINDOW = { minLon: 6.5, minLat: 36.5, maxLon: 18.6, maxLat: 47.2 };
const SIMPLIFY = 0.0015; // same as Spain's precise outline; << NE 1:50m
const MIN_COMPONENT_AREA = 0.02; // keep mainland + Sicily + Sardinia; drop islets
const COMMIT = process.argv.includes("--commit");

async function loadDatabaseUrl() {
  const raw = await readFile(new URL("../../.env.local", import.meta.url), "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  assert.ok(line, "DATABASE_URL not found in .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const cache = await loadComuneCache();
  const comuni = cache.comuni;
  console.log(`dissolving ${comuni.length} Italian comuni (georef-italy-comune)`);

  const client = new pg.Client({ connectionString: await loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = 900000");
    await client.query("create temp table _mun (cell text, geom extensions.geometry) on commit drop");
    // Load in batches, pre-validated.
    const B = 400;
    for (let i = 0; i < comuni.length; i += B) {
      const batch = comuni.slice(i, i + B);
      await client.query(
        `insert into _mun (geom) select extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g), 4326)) from unnest($1::text[]) g`,
        [batch.map((m) => JSON.stringify(m.geometry))],
      );
    }
    // Drop comuni whose representative point sits below the display window
    // (Lampedusa/Linosa ~35.5°N) so the dissolved bbox stays in-window; the
    // area filter removes the remaining out-of-scope islets.
    const dropped = await client.query(
      `delete from _mun where extensions.ST_Y(extensions.ST_PointOnSurface(geom)) < $1`,
      [WINDOW.minLat],
    );
    console.log(`dropped ${dropped.rowCount} comuni below lat ${WINDOW.minLat} (far-south islets)`);
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
         -- keep only components >= MIN_COMPONENT_AREA (drops sliver artifacts + tiny islets; keeps mainland + Sicily + Sardinia)
         select extensions.ST_Multi(extensions.ST_Collect(d.geom)) g
           from noholes, lateral extensions.ST_Dump(noholes.g) d
          where extensions.ST_Area(d.geom) >= $2
       ),
       labelled as (select g, extensions.ST_PointOnSurface(g) lp from big)
       select extensions.ST_AsGeoJSON(g, 5) geojson, extensions.ST_NPoints(g) npoints, extensions.ST_NumGeometries(g) nparts,
              extensions.ST_IsValid(g) valid, extensions.ST_IsEmpty(g) is_empty, extensions.ST_Covers(g, lp) covers,
              extensions.ST_XMin(extensions.Box3D(g)) minx, extensions.ST_YMin(extensions.Box3D(g)) miny,
              extensions.ST_XMax(extensions.Box3D(g)) maxx, extensions.ST_YMax(extensions.Box3D(g)) maxy
         from labelled`,
      [SIMPLIFY, MIN_COMPONENT_AREA],
    );
    const r = rows[0];
    assert.ok(r.geojson && !r.is_empty && r.valid && r.covers, "dissolve produced invalid/empty geometry");
    assert.ok(r.minx >= WINDOW.minLon && r.miny >= WINDOW.minLat && r.maxx <= WINDOW.maxLon && r.maxy <= WINDOW.maxLat, `bbox ${r.minx},${r.miny},${r.maxx},${r.maxy} escapes window`);
    console.log(`dissolved: ${r.npoints} vertices, ${r.nparts} part(s), bbox ${(+r.minx).toFixed(2)}..${(+r.maxx).toFixed(2)} / ${(+r.miny).toFixed(2)}..${(+r.maxy).toFixed(2)}, valid=${r.valid}`);

    if (!COMMIT) { await client.query("rollback"); console.log("DRY — rolled back."); return; }

    const revision = releaseVersion();
    const rawBody = Buffer.from(`${JSON.stringify({ type: "Feature", properties: { note: "Italy outline: dissolve of all Italian ISTAT comuni (georef-italy-comune)" }, geometry: JSON.parse(r.geojson) })}\n`);
    const rawPath = `${NAMESPACE}/${revision}/country-italy/outline.geojson`;
    await uploadRawObject(rawPath, rawBody, { upsert: true });
    const place = await client.query("select id from wine_places where canonical_key = 'italy'");
    assert.equal(place.rows.length, 1, "italy place missing");
    await client.query("update wine_place_boundaries set is_current = false where wine_place_id = $1 and is_current", [place.rows[0].id]);
    const res = await client.query(
      `with source as (
         insert into wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
         values ($1, 'georef-comune-dissolve:ITA', 'ISTAT (confini comunali), via OpenDataSoft', 'Italy')
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
        NAMESPACE, revision, DATASET_URL, cache.licence ?? "ISTAT confini amministrativi (CC BY)",
        `storage://wine-map-sources/${rawPath}`, sha256hex(rawBody),
        `Italy country outline: dissolve of ${comuni.length - dropped.rowCount} Italian ISTAT comuni (georef-italy-comune), replacing the Natural Earth 1:50m border for a precise, data-consistent national outline (mainland + Sicily + Sardinia).`,
        `scripts/wine-map-sources/build-italy-country-outline.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`,
        r.geojson, place.rows[0].id,
        JSON.stringify({ comune_count: comuni.length - dropped.rowCount }), JSON.stringify({ engine: "comune-dissolve", simplify_tolerance: SIMPLIFY, min_component_area: MIN_COMPONENT_AREA }),
      ],
    );
    assert.equal(res.rows.length, 1, "boundary insert failed");
    const chk = await client.query("select count(*)::int n from wine_place_boundaries where wine_place_id = $1 and is_current and quality_status = 'VALIDATED'", [place.rows[0].id]);
    assert.equal(chk.rows[0].n, 1, "expected exactly 1 current-validated italy boundary");
    await client.query("commit");
    console.log(`COMMITTED precise Italy outline: ${r.npoints} vertices, ${r.nparts} part(s), boundary ${res.rows[0].id}`);
  } catch (e) { await client.query("rollback").catch(() => {}); throw e; } finally { await client.end(); }
}

await main();
