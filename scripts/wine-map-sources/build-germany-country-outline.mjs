// Precise Germany country outline = dissolve of the 16 Bundesländer (BKG VG250
// via OpenDataSoft georef-germany-land), matching the resolution of the France
// (IGN), Spain (IGN/CNIG) and Italy (ISTAT) outlines.
//
// Why 16 Länder rather than 10,949 Gemeinden: both layers derive from the same
// BKG base at the same resolution, and the Länder are already dissolved. They
// carry ~71,600 vertices between them — the whole national boundary — so this is
// an identical outline from 16 unions instead of ~11k. No grid-dissolve needed.
//
// Unlike Spain (Canaries) and Italy (Lampedusa) there is no out-of-window
// territory to exclude: Germany is compact. The component filter is therefore
// tiny — just enough to drop degenerate slivers from the union while KEEPING the
// real islands (Rügen, Usedom, Fehmarn, Sylt and the Frisians), which are part
// of the coastline even though none of them grow wine.
//
// Default = DRY (dissolve + guard, rolled back). --commit writes the boundary.
// Usage: node scripts/wine-map-sources/build-germany-country-outline.mjs [--commit]

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { sha256hex, releaseVersion } from "../wine-map-tiles/lib.mjs";
import { uploadRawObject } from "./inao-lib.mjs";
import { loadLaenderCache, DATASET_URL, LICENCE } from "./fetch-germany-laender.mjs";

const NAMESPACE = "BKG_VG250";
// Germany spans roughly lon 5.87..15.04, lat 47.27..55.06; the window is a
// modest margin around that. An escape means a bad/foreign polygon crept in.
const WINDOW = { minLon: 5.5, minLat: 46.9, maxLon: 15.6, maxLat: 55.5 };
const SIMPLIFY = 0.0015; // same as the Spain/Italy precise outlines
const MIN_COMPONENT_AREA = 0.0005; // ~4 km²: kills union slivers, keeps real islands
const COMMIT = process.argv.includes("--commit");

async function loadDatabaseUrl() {
  const raw = await readFile(new URL("../../.env.local", import.meta.url), "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  assert.ok(line, "DATABASE_URL not found in .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const cache = await loadLaenderCache();
  const laender = cache.laender;
  assert.equal(laender.length, 16, `expected 16 Bundesländer, got ${laender.length}`);
  console.log(`dissolving ${laender.length} Bundesländer (georef-germany-land)`);

  const client = new pg.Client({
    connectionString: await loadDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = 900000");
    await client.query("create temp table _land (geom extensions.geometry) on commit drop");
    await client.query(
      `insert into _land (geom)
       select extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g), 4326))
         from unnest($1::text[]) g`,
      [laender.map((l) => JSON.stringify(l.geometry))],
    );

    const { rows } = await client.query(
      `with u as (
         select extensions.ST_UnaryUnion(extensions.ST_MakeValid(extensions.ST_Collect(geom))) g from _land
       ),
       simp as (
         select extensions.ST_CollectionExtract(
                  extensions.ST_MakeValid(extensions.ST_SimplifyPreserveTopology(g, $1)), 3) g from u
       ),
       -- Drop interior rings: the national outline is a silhouette, and the
       -- Länder union can leave hairline holes on shared borders.
       noholes as (
         select extensions.ST_Multi(extensions.ST_Collect(
                  extensions.ST_MakePolygon(extensions.ST_ExteriorRing(d.geom)))) g
           from simp, lateral extensions.ST_Dump(extensions.ST_Multi(simp.g)) d
       ),
       big as (
         select extensions.ST_Multi(extensions.ST_Collect(d.geom)) g
           from noholes, lateral extensions.ST_Dump(noholes.g) d
          where extensions.ST_Area(d.geom) >= $2
       ),
       labelled as (select g, extensions.ST_PointOnSurface(g) lp from big)
       select extensions.ST_AsGeoJSON(g, 5) geojson,
              extensions.ST_NPoints(g) npoints, extensions.ST_NumGeometries(g) nparts,
              extensions.ST_IsValid(g) valid, extensions.ST_IsEmpty(g) is_empty,
              extensions.ST_Covers(g, lp) covers, extensions.ST_Area(g) area,
              extensions.ST_XMin(extensions.Box3D(g)) minx, extensions.ST_YMin(extensions.Box3D(g)) miny,
              extensions.ST_XMax(extensions.Box3D(g)) maxx, extensions.ST_YMax(extensions.Box3D(g)) maxy
         from labelled`,
      [SIMPLIFY, MIN_COMPONENT_AREA],
    );
    const r = rows[0];
    assert.ok(r.geojson && !r.is_empty && r.valid && r.covers, "dissolve produced invalid/empty geometry");
    assert.ok(
      r.minx >= WINDOW.minLon && r.miny >= WINDOW.minLat &&
      r.maxx <= WINDOW.maxLon && r.maxy <= WINDOW.maxLat,
      `bbox ${r.minx},${r.miny},${r.maxx},${r.maxy} escapes window`,
    );
    // Germany is ~357,000 km²; in planar degrees near 51°N that is very roughly
    // 43 deg². A wildly different figure means the union went wrong.
    assert.ok(Number(r.area) > 30 && Number(r.area) < 60, `area ${r.area} deg² is not Germany-shaped`);
    console.log(
      `dissolved: ${r.npoints} vertices, ${r.nparts} part(s), ${Number(r.area).toFixed(2)} deg², ` +
      `bbox ${(+r.minx).toFixed(2)}..${(+r.maxx).toFixed(2)} / ${(+r.miny).toFixed(2)}..${(+r.maxy).toFixed(2)}, valid=${r.valid}`,
    );

    if (!COMMIT) {
      await client.query("rollback");
      console.log("DRY — rolled back.");
      return;
    }

    const revision = releaseVersion();
    const rawBody = Buffer.from(
      `${JSON.stringify({
        type: "Feature",
        properties: { note: "Germany outline: dissolve of the 16 Bundesländer (BKG VG250)" },
        geometry: JSON.parse(r.geojson),
      })}\n`,
    );
    const rawPath = `${NAMESPACE}/${revision}/country-germany/outline.geojson`;
    await uploadRawObject(rawPath, rawBody, { upsert: true });

    const place = await client.query("select id from wine_places where canonical_key = 'germany'");
    assert.equal(place.rows.length, 1, "germany place missing");
    await client.query(
      "update wine_place_boundaries set is_current = false where wine_place_id = $1 and is_current",
      [place.rows[0].id],
    );
    const res = await client.query(
      `with source as (
         insert into wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
         values ($1, 'georef-land-dissolve:DEU', 'BKG — Verwaltungsgebiete VG250, via OpenDataSoft', 'Germany')
         on conflict (source_namespace, source_feature_id) do update set authority = excluded.authority
         returning id
       ),
       snapshot as (
         insert into wine_boundary_source_snapshots (
           source_id, source_revision, retrieved_at, source_url, licence,
           raw_snapshot_uri, raw_checksum_sha256, normalized_artifact_uri,
           normalized_checksum_sha256, provenance_note, importer_version)
         select source.id, $2, now(), $3, $4, $5, $6, $5, $6, $7, $8 from source returning id
       ),
       geom as (
         select extensions.ST_Multi(extensions.ST_CollectionExtract(
                  extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($9), 4326)), 3)) g
       )
       insert into wine_place_boundaries (
         wine_place_id, source_snapshot_id, boundary_method, quality_status,
         display_geometry, label_point, bbox, source_feature_refs,
         generation_parameters, revision, is_current, reviewed_at)
       select $10, snapshot.id, 'MANUAL', 'VALIDATED', geom.g, extensions.ST_PointOnSurface(geom.g),
              array[extensions.ST_XMin(extensions.Box3D(geom.g)), extensions.ST_YMin(extensions.Box3D(geom.g)),
                    extensions.ST_XMax(extensions.Box3D(geom.g)), extensions.ST_YMax(extensions.Box3D(geom.g))]::double precision[],
              $11::jsonb, $12::jsonb, $2, true, now()
         from snapshot, geom returning id`,
      [
        NAMESPACE, revision, DATASET_URL, cache.licence ?? LICENCE,
        `storage://wine-map-sources/${rawPath}`, sha256hex(rawBody),
        `Germany country outline: dissolve of the 16 Bundesländer (BKG VG250 via georef-germany-land), for a precise national outline consistent with the German wine-region boundaries.`,
        `scripts/wine-map-sources/build-germany-country-outline.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`,
        r.geojson, place.rows[0].id,
        JSON.stringify({ land_count: laender.length }),
        JSON.stringify({
          engine: "land-dissolve",
          simplify_tolerance: SIMPLIFY,
          min_component_area: MIN_COMPONENT_AREA,
        }),
      ],
    );
    assert.equal(res.rows.length, 1, "boundary insert failed");
    const chk = await client.query(
      "select count(*)::int n from wine_place_boundaries where wine_place_id = $1 and is_current and quality_status = 'VALIDATED'",
      [place.rows[0].id],
    );
    assert.equal(chk.rows[0].n, 1, "expected exactly 1 current-validated germany boundary");
    await client.query("commit");
    console.log(`COMMITTED Germany outline: ${r.npoints} vertices, ${r.nparts} part(s), boundary ${res.rows[0].id}`);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

await main();
