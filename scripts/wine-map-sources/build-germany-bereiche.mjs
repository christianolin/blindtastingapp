// Bereich (district) boundaries: the same Weinbergsrolle dissolve as the
// Anbaugebiete, one tier down.
//
// The close is GENTLER here (0.001° ≈ 75 m vs 0.002°) because a Bereich renders
// from z6 rather than z4 — less knitting is needed for readability, so less area
// is invented. Same honesty caveat: this is a generalisation, recorded in
// generation_parameters and provenance_note; the precise geometry lives at
// Einzellage level.
//
// Usage:
//   node scripts/wine-map-sources/build-germany-bereiche.mjs [--only <slug>] [--commit]

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { sha256hex, releaseVersion } from "../wine-map-tiles/lib.mjs";
import { uploadRawObject } from "./inao-lib.mjs";
import { loadWeinlagenCache, LICENCE, SOURCE_URL } from "./fetch-rlp-weinlagen.mjs";

const NAMESPACE = "LWK_RLP_WEINLAGEN";
const WINDOW = { minLon: 5.5, minLat: 46.9, maxLon: 15.6, maxLat: 55.5 };
const CLOSE = 0.001;
const CLOSE_BACK = 0.00075;
const SIMPLIFY = 0.0003;
const MIN_COMPONENT_AREA = 0.00001;
const AREA_BAND = [0.0002, 0.3];

const COMMIT = process.argv.includes("--commit");
const ONLY = (() => {
  const i = process.argv.indexOf("--only");
  return i >= 0 ? process.argv[i + 1] : null;
})();

const slugify = (s) =>
  s.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const bereichDisplay = (raw) => raw.replace(/^(Bereich|Ber\.)\s+/i, "").trim();

async function loadDatabaseUrl() {
  const raw = await readFile(new URL("../../.env.local", import.meta.url), "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  assert.ok(line, "DATABASE_URL not found in .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function buildOne(client, { key, rawName, parentKey, geoms }) {
  console.log(`\n=== ${rawName} (${geoms.length} Einzellagen) -> ${key}`);
  await client.query("begin");
  await client.query("set local statement_timeout = 1800000");
  try {
    await client.query("create temp table _w (geom extensions.geometry) on commit drop");
    const B = 300;
    for (let i = 0; i < geoms.length; i += B) {
      await client.query(
        `insert into _w (geom) select extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g),4326)) from unnest($1::text[]) g`,
        [geoms.slice(i, i + B).map((g) => JSON.stringify(g))],
      );
    }
    const { rows } = await client.query(
      `with u as (select extensions.ST_UnaryUnion(extensions.ST_MakeValid(extensions.ST_Collect(geom))) g from _w),
       closed as (select extensions.ST_MakeValid(extensions.ST_Buffer(extensions.ST_Buffer(g,$1::float8),-$2::float8)) g from u),
       -- Clip to the parent Anbaugebiet. A Bereich legally cannot extend beyond
       -- it, and without this the child pokes outside purely as an artifact:
       -- parent and child are INDEPENDENT generalisations (the parent used a
       -- wider close and a larger speck filter), so neither strictly contains
       -- the other. Clipping makes containment true by construction.
       parent as (
         select b.display_geometry g from wine_place_boundaries b
           join wine_places p on p.id = b.wine_place_id
          where p.canonical_key = $5 and b.is_current
       ),
       clipped as (
         select extensions.ST_MakeValid(extensions.ST_Intersection(closed.g, parent.g)) g
           from closed, parent
       ),
       simp as (select extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SimplifyPreserveTopology(g,$3)),3) g from clipped),
       big as (select extensions.ST_Multi(extensions.ST_Collect(d.geom)) g
                 from simp, lateral extensions.ST_Dump(extensions.ST_Multi(simp.g)) d
                where extensions.ST_Area(d.geom) >= $4),
       labelled as (select g, extensions.ST_PointOnSurface(g) lp from big)
       select extensions.ST_AsGeoJSON(g,5) geojson, extensions.ST_NPoints(g) npoints,
              extensions.ST_NumGeometries(g) nparts, extensions.ST_IsValid(g) valid,
              extensions.ST_IsEmpty(g) is_empty, extensions.ST_Covers(g,lp) covers,
              extensions.ST_Area(g) area,
              extensions.ST_XMin(extensions.Box3D(g)) minx, extensions.ST_YMin(extensions.Box3D(g)) miny,
              extensions.ST_XMax(extensions.Box3D(g)) maxx, extensions.ST_YMax(extensions.Box3D(g)) maxy
         from labelled`,
      [CLOSE, CLOSE_BACK, SIMPLIFY, MIN_COMPONENT_AREA, parentKey],
    );
    const r = rows[0];
    assert.ok(r?.geojson && !r.is_empty && r.valid && r.covers, `${key}: invalid/empty dissolve`);
    assert.ok(
      r.minx >= WINDOW.minLon && r.miny >= WINDOW.minLat && r.maxx <= WINDOW.maxLon && r.maxy <= WINDOW.maxLat,
      `${key}: bbox escapes window`,
    );
    assert.ok(
      Number(r.area) >= AREA_BAND[0] && Number(r.area) <= AREA_BAND[1],
      `${key}: area ${Number(r.area).toFixed(4)} deg² outside band [${AREA_BAND}]`,
    );

    // A Bereich must sit inside its own Anbaugebiet, not merely inside Germany.
    const cont = await client.query(
      `select extensions.ST_Area(extensions.ST_Difference(
                extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($1),4326), b.display_geometry))
              / nullif(extensions.ST_Area(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($1),4326)),0) outside
         from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
        where p.canonical_key = $2 and b.is_current`,
      [r.geojson, parentKey],
    );
    const outside = Number(cont.rows[0]?.outside ?? 1);
    // The parent used a WIDER close, so a child built with a narrower one is
    // comfortably inside; a real escape means wrong parentage.
    assert.ok(outside <= 0.02, `${key}: ${(outside * 100).toFixed(1)}% outside ${parentKey}`);
    console.log(`   ${r.npoints} pts, ${r.nparts} parts, ${Number(r.area).toFixed(4)} deg², ${(outside * 100).toFixed(2)}% outside parent`);

    if (!COMMIT) { await client.query("rollback"); console.log("   DRY — rolled back."); return; }

    const place = await client.query("select id from wine_places where canonical_key = $1", [key]);
    assert.equal(place.rows.length, 1, `${key} place missing`);
    const placeId = place.rows[0].id;
    const revision = releaseVersion();
    const rawBody = Buffer.from(`${JSON.stringify({ type: "Feature", properties: { bereich: rawName, einzellagen: geoms.length }, geometry: JSON.parse(r.geojson) })}\n`);
    const rawPath = `${NAMESPACE}/${revision}/bereich-${key.split(".").slice(1).join("-")}/outline.geojson`;
    await uploadRawObject(rawPath, rawBody, { upsert: true });

    await client.query("update wine_place_boundaries set is_current = false where wine_place_id = $1 and is_current", [placeId]);
    const res = await client.query(
      `with source as (
         insert into wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
         values ($1, $2, 'Landwirtschaftskammer Rheinland-Pfalz (Weinbergsrolle), via LGB', 'Germany / Rheinland-Pfalz')
         on conflict (source_namespace, source_feature_id) do update set authority = excluded.authority returning id
       ),
       snapshot as (
         insert into wine_boundary_source_snapshots (source_id, source_revision, retrieved_at, source_url, licence, raw_snapshot_uri, raw_checksum_sha256, normalized_artifact_uri, normalized_checksum_sha256, provenance_note, importer_version)
         select source.id, $3, now(), $4, $5, $6, $7, $6, $7, $8, $9 from source returning id
       ),
       geom as (select extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($10),4326)),3)) g)
       insert into wine_place_boundaries (wine_place_id, source_snapshot_id, boundary_method, quality_status, display_geometry, label_point, bbox, source_feature_refs, generation_parameters, revision, is_current, reviewed_at)
       select $11, snapshot.id, 'GENERALIZED_FROM_OFFICIAL_SOURCE', 'VALIDATED', geom.g, extensions.ST_PointOnSurface(geom.g),
              array[extensions.ST_XMin(extensions.Box3D(geom.g)), extensions.ST_YMin(extensions.Box3D(geom.g)), extensions.ST_XMax(extensions.Box3D(geom.g)), extensions.ST_YMax(extensions.Box3D(geom.g))]::double precision[],
              $12::jsonb, $13::jsonb, $3, true, now() from snapshot, geom returning id`,
      [
        NAMESPACE, `weinlagen-dissolve:bereich:${key}`, revision, SOURCE_URL, LICENCE,
        `storage://wine-map-sources/${rawPath}`, sha256hex(rawBody),
        `Bereich "${rawName}": union of its ${geoms.length} Einzellagen from the Rheinland-Pfalz Weinbergsrolle, generalised for district-level display via a morphological close (+${CLOSE}°, -${CLOSE_BACK}°). This INFLATES area relative to the true planted parcels; precise geometry is retained at Einzellage level.`,
        `scripts/wine-map-sources/build-germany-bereiche.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`,
        r.geojson, placeId,
        JSON.stringify({ bereich_legal_name: rawName, einzellage_count: geoms.length }),
        JSON.stringify({ engine: "weinlagen-dissolve+close", close_buffer: CLOSE, close_buffer_back: CLOSE_BACK, simplify_tolerance: SIMPLIFY, min_component_area: MIN_COMPONENT_AREA, generalised: true }),
      ],
    );
    assert.equal(res.rows.length, 1, `${key}: boundary insert failed`);
    await client.query("update wine_places set publication_status = 'VERIFIED' where id = $1 and publication_status = 'DRAFT'", [placeId]);
    await client.query("commit");
    console.log(`   PROMOTED ${key}`);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  }
}

async function main() {
  const { features } = await loadWeinlagenCache();
  const groups = new Map();
  for (const f of features) {
    const { anbaugebiet: a, bereich: b } = f.properties;
    const key = `germany.${slugify(a)}.${slugify(bereichDisplay(b))}`;
    if (!groups.has(key)) {
      groups.set(key, { key, rawName: b, parentKey: `germany.${slugify(a)}`, geoms: [] });
    }
    groups.get(key).geoms.push(f.geometry);
  }
  const targets = [...groups.values()].filter((g) => !ONLY || g.key.endsWith(`.${ONLY}`));
  assert.ok(targets.length > 0, `no Bereich matching --only ${ONLY}`);

  const client = new pg.Client({ connectionString: await loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const t of targets) await buildOne(client, t);
  } finally {
    await client.end();
  }
  console.log(`\nDONE (${COMMIT ? "committed" : "dry"}): ${targets.length} Bereich(e)`);
}

await main();
