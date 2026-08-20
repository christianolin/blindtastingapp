// Anbaugebiet (German wine region) boundaries = dissolve of their Einzellagen
// from the Rheinland-Pfalz Weinbergsrolle, GENERALISED for region-level zoom.
//
// Why generalised, stated plainly: vineyard parcels are scattered, so an honest
// raw union is unusable as a region outline — measured, Mosel's 462 Einzellagen
// union to 1,391 disconnected slivers. A morphological "close" (buffer out, then
// most of the way back) knits neighbouring parcels into a readable shape:
//
//   Mosel        1,391 parts -> 93     Mittelrhein  299 -> 47     Ahr  115 -> 5
//
// The cost is area inflation (Mosel 0.0235 -> 0.0364 deg², ~55%), so this is
// explicitly a cartographic generalisation, recorded in generation_parameters
// and in the provenance note. The PRECISE geometry lives where it matters — at
// Einzellage level — and is untouched by this.
//
// The `gu` (PDO) layer would have been the legally-correct outline but covers
// only 4 of the 6 RLP Anbaugebiete (no Rheinhessen, no Ahr), so it can't be used
// consistently.
//
// The close is expensive; run one region at a time:
//   node scripts/wine-map-sources/build-germany-anbaugebiete.mjs --only mosel [--commit]

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { sha256hex, releaseVersion } from "../wine-map-tiles/lib.mjs";
import { uploadRawObject } from "./inao-lib.mjs";
import {
  loadWeinlagenCache,
  DATASET_URL,
  LICENCE,
  SOURCE_URL,
} from "./fetch-rlp-weinlagen.mjs";

const NAMESPACE = "LWK_RLP_WEINLAGEN";
const WINDOW = { minLon: 5.5, minLat: 46.9, maxLon: 15.6, maxLat: 55.5 };
const CLOSE = 0.002;        // ~150 m: buffer out this far…
const CLOSE_BACK = 0.0015;  // …and back 75%, knitting neighbours together
const SIMPLIFY = 0.0005;
const MIN_COMPONENT_AREA = 0.00002; // ~0.15 km²: drop specks left after closing
const AREA_BAND = [0.0005, 0.5];    // Ahr ~0.002 … Mosel ~0.036 measured

const COMMIT = process.argv.includes("--commit");
const ONLY = (() => {
  const i = process.argv.indexOf("--only");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const slugOf = (anbaugebiet) => anbaugebiet.toLowerCase();

async function loadDatabaseUrl() {
  const raw = await readFile(new URL("../../.env.local", import.meta.url), "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  assert.ok(line, "DATABASE_URL not found in .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function buildOne(client, gebiet, geoms) {
  const slug = slugOf(gebiet);
  const key = `germany.${slug}`;
  console.log(`\n=== ${gebiet} (${geoms.length} Einzellagen) -> ${key}`);

  await client.query("begin");
  await client.query("set local statement_timeout = 1800000");
  try {
    await client.query("create temp table _w (geom extensions.geometry) on commit drop");
    const B = 300;
    for (let i = 0; i < geoms.length; i += B) {
      await client.query(
        `insert into _w (geom)
         select extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g), 4326))
           from unnest($1::text[]) g`,
        [geoms.slice(i, i + B).map((g) => JSON.stringify(g))],
      );
    }

    const { rows } = await client.query(
      `with u as (
         select extensions.ST_UnaryUnion(extensions.ST_MakeValid(extensions.ST_Collect(geom))) g from _w
       ),
       closed as (
         select extensions.ST_MakeValid(
                  extensions.ST_Buffer(extensions.ST_Buffer(g, $1::float8), -$2::float8)) g from u
       ),
       simp as (
         select extensions.ST_CollectionExtract(
                  extensions.ST_MakeValid(extensions.ST_SimplifyPreserveTopology(g, $3)), 3) g from closed
       ),
       big as (
         select extensions.ST_Multi(extensions.ST_Collect(d.geom)) g
           from simp, lateral extensions.ST_Dump(extensions.ST_Multi(simp.g)) d
          where extensions.ST_Area(d.geom) >= $4
       ),
       labelled as (select g, extensions.ST_PointOnSurface(g) lp from big)
       select extensions.ST_AsGeoJSON(g, 5) geojson,
              extensions.ST_NPoints(g) npoints, extensions.ST_NumGeometries(g) nparts,
              extensions.ST_IsValid(g) valid, extensions.ST_IsEmpty(g) is_empty,
              extensions.ST_Covers(g, lp) covers, extensions.ST_Area(g) area,
              extensions.ST_XMin(extensions.Box3D(g)) minx, extensions.ST_YMin(extensions.Box3D(g)) miny,
              extensions.ST_XMax(extensions.Box3D(g)) maxx, extensions.ST_YMax(extensions.Box3D(g)) maxy
         from labelled`,
      [CLOSE, CLOSE_BACK, SIMPLIFY, MIN_COMPONENT_AREA],
    );
    const r = rows[0];
    assert.ok(r?.geojson && !r.is_empty && r.valid && r.covers, `${key}: invalid/empty dissolve`);
    assert.ok(
      r.minx >= WINDOW.minLon && r.miny >= WINDOW.minLat &&
      r.maxx <= WINDOW.maxLon && r.maxy <= WINDOW.maxLat,
      `${key}: bbox ${r.minx},${r.miny},${r.maxx},${r.maxy} escapes window`,
    );
    assert.ok(
      Number(r.area) >= AREA_BAND[0] && Number(r.area) <= AREA_BAND[1],
      `${key}: area ${Number(r.area).toFixed(4)} deg² outside band [${AREA_BAND}]`,
    );

    // Containment: the region must sit inside the German outline.
    const cont = await client.query(
      `select extensions.ST_Area(extensions.ST_Difference(
                extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($1), 4326), b.display_geometry))
              / nullif(extensions.ST_Area(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($1), 4326)), 0) outside
         from wine_place_boundaries b
         join wine_places p on p.id = b.wine_place_id
        where p.canonical_key = 'germany' and b.is_current`,
      [r.geojson],
    );
    const outside = Number(cont.rows[0]?.outside ?? 1);
    assert.ok(outside <= 0.02, `${key}: ${(outside * 100).toFixed(1)}% lies outside Germany`);

    console.log(
      `   ${r.npoints} pts, ${r.nparts} parts, ${Number(r.area).toFixed(4)} deg², ` +
      `${(outside * 100).toFixed(2)}% outside DE, valid=${r.valid}`,
    );

    if (!COMMIT) {
      await client.query("rollback");
      console.log("   DRY — rolled back.");
      return;
    }

    const place = await client.query("select id from wine_places where canonical_key = $1", [key]);
    assert.equal(place.rows.length, 1, `${key} place missing`);
    const placeId = place.rows[0].id;

    const revision = releaseVersion();
    const rawBody = Buffer.from(
      `${JSON.stringify({
        type: "Feature",
        properties: { anbaugebiet: gebiet, einzellagen: geoms.length },
        geometry: JSON.parse(r.geojson),
      })}\n`,
    );
    const rawPath = `${NAMESPACE}/${revision}/anbaugebiet-${slug}/outline.geojson`;
    await uploadRawObject(rawPath, rawBody, { upsert: true });

    await client.query(
      "update wine_place_boundaries set is_current = false where wine_place_id = $1 and is_current",
      [placeId],
    );
    const res = await client.query(
      `with source as (
         insert into wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
         values ($1, $2, 'Landwirtschaftskammer Rheinland-Pfalz (Weinbergsrolle), via LGB', 'Germany / Rheinland-Pfalz')
         on conflict (source_namespace, source_feature_id) do update set authority = excluded.authority
         returning id
       ),
       snapshot as (
         insert into wine_boundary_source_snapshots (
           source_id, source_revision, retrieved_at, source_url, licence,
           raw_snapshot_uri, raw_checksum_sha256, normalized_artifact_uri,
           normalized_checksum_sha256, provenance_note, importer_version)
         select source.id, $3, now(), $4, $5, $6, $7, $6, $7, $8, $9 from source returning id
       ),
       geom as (
         select extensions.ST_Multi(extensions.ST_CollectionExtract(
                  extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($10), 4326)), 3)) g
       )
       insert into wine_place_boundaries (
         wine_place_id, source_snapshot_id, boundary_method, quality_status,
         display_geometry, label_point, bbox, source_feature_refs,
         generation_parameters, revision, is_current, reviewed_at)
       select $11, snapshot.id, 'GENERALIZED_FROM_OFFICIAL_SOURCE', 'VALIDATED',
              geom.g, extensions.ST_PointOnSurface(geom.g),
              array[extensions.ST_XMin(extensions.Box3D(geom.g)), extensions.ST_YMin(extensions.Box3D(geom.g)),
                    extensions.ST_XMax(extensions.Box3D(geom.g)), extensions.ST_YMax(extensions.Box3D(geom.g))]::double precision[],
              $12::jsonb, $13::jsonb, $3, true, now()
         from snapshot, geom returning id`,
      [
        NAMESPACE, `weinlagen-dissolve:${slug}`, revision, SOURCE_URL, LICENCE,
        `storage://wine-map-sources/${rawPath}`, sha256hex(rawBody),
        `Anbaugebiet ${gebiet}: union of its ${geoms.length} Einzellagen from the Rheinland-Pfalz Weinbergsrolle, then GENERALISED for region-level display — a morphological close (buffer +${CLOSE}°, then -${CLOSE_BACK}°) knits scattered vineyard parcels into a readable outline. This deliberately INFLATES the area relative to the true planted parcels (the raw union of Mosel, for example, is 1,391 disconnected slivers). Precise geometry is retained at Einzellage level.`,
        `scripts/wine-map-sources/build-germany-anbaugebiete.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`,
        r.geojson, placeId,
        JSON.stringify({ anbaugebiet: gebiet, einzellage_count: geoms.length }),
        JSON.stringify({
          engine: "weinlagen-dissolve+close",
          close_buffer: CLOSE,
          close_buffer_back: CLOSE_BACK,
          simplify_tolerance: SIMPLIFY,
          min_component_area: MIN_COMPONENT_AREA,
          generalised: true,
          note: "Area is inflated relative to the true planted parcels; see provenance_note.",
        }),
      ],
    );
    assert.equal(res.rows.length, 1, `${key}: boundary insert failed`);

    await client.query(
      "update wine_places set publication_status = 'VERIFIED' where id = $1 and publication_status = 'DRAFT'",
      [placeId],
    );
    const chk = await client.query(
      `select (select count(*) from wine_place_boundaries where wine_place_id = $1 and is_current and quality_status = 'VALIDATED')::int b,
              (select publication_status from wine_places where id = $1) s`,
      [placeId],
    );
    assert.equal(chk.rows[0].b, 1, `${key}: expected exactly 1 current-validated boundary`);
    assert.equal(chk.rows[0].s, "VERIFIED", `${key}: not promoted`);
    await client.query("commit");
    console.log(`   PROMOTED ${key}: boundary ${res.rows[0].id}`);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  }
}

async function main() {
  const { features } = await loadWeinlagenCache();
  const byGebiet = new Map();
  for (const f of features) {
    const a = f.properties.anbaugebiet;
    if (!byGebiet.has(a)) byGebiet.set(a, []);
    byGebiet.get(a).push(f.geometry);
  }

  const targets = [...byGebiet].filter(([g]) => !ONLY || slugOf(g) === ONLY);
  assert.ok(targets.length > 0, ONLY ? `no Anbaugebiet matching --only ${ONLY}` : "no Anbaugebiete");

  const client = new pg.Client({
    connectionString: await loadDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (const [gebiet, geoms] of targets) await buildOne(client, gebiet, geoms);
  } finally {
    await client.end();
  }
  console.log(`\nDONE (${COMMIT ? "committed" : "dry"}): ${targets.length} Anbaugebiet(e)`);
}

await main();
