// Großlage boundaries: the Weinbergsrolle dissolve one tier below Bereich.
// Same model as build-germany-bereiche.mjs — gentler close (these render from
// z7), and CLIPPED to the parent Bereich so containment is true by construction
// rather than by tolerance (parent and child are independent generalisations).
//
//   node scripts/wine-map-sources/build-germany-grosslagen.mjs [--commit] [--skip N] [--take N]

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { sha256hex, releaseVersion } from "../wine-map-tiles/lib.mjs";
import { uploadRawObject } from "./inao-lib.mjs";
import { loadWeinlagenCache, LICENCE, SOURCE_URL } from "./fetch-rlp-weinlagen.mjs";

const NAMESPACE = "LWK_RLP_WEINLAGEN";
const CLOSE = 0.0006, CLOSE_BACK = 0.00045, SIMPLIFY = 0.0002;
const MIN_COMPONENT_AREA = 0.000005;
const AREA_BAND = [0.00002, 0.2];
const COMMIT = process.argv.includes("--commit");
const num = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const SKIP = num("--skip", 0), TAKE = num("--take", Infinity);

const slugify = (s) => s.toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const bereichDisplay = (r) => r.replace(/^(Bereich|Ber\.)\s+/i, "").trim();

async function dbUrl() {
  const raw = await readFile(new URL("../../.env.local", import.meta.url), "utf8");
  const l = raw.split(/\r?\n/).find((x) => x.trim().startsWith("DATABASE_URL="));
  return l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

async function buildOne(client, t) {
  await client.query("begin");
  await client.query("set local statement_timeout = 1800000");
  try {
    await client.query("create temp table _w (geom extensions.geometry) on commit drop");
    for (let i = 0; i < t.geoms.length; i += 300) {
      await client.query(
        `insert into _w (geom) select extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g),4326)) from unnest($1::text[]) g`,
        [t.geoms.slice(i, i + 300).map((g) => JSON.stringify(g))]);
    }
    const { rows } = await client.query(
      `with u as (select extensions.ST_UnaryUnion(extensions.ST_MakeValid(extensions.ST_Collect(geom))) g from _w),
       closed as (select extensions.ST_MakeValid(extensions.ST_Buffer(extensions.ST_Buffer(g,$1::float8),-$2::float8)) g from u),
       parent as (select b.display_geometry g from wine_place_boundaries b
                    join wine_places p on p.id=b.wine_place_id
                   where p.canonical_key=$5 and b.is_current),
       clipped as (select extensions.ST_MakeValid(extensions.ST_Intersection(closed.g,parent.g)) g from closed,parent),
       simp as (select extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SimplifyPreserveTopology(g,$3)),3) g from clipped),
       big as (select extensions.ST_Multi(extensions.ST_Collect(d.geom)) g
                 from simp, lateral extensions.ST_Dump(extensions.ST_Multi(simp.g)) d
                where extensions.ST_Area(d.geom) >= $4),
       lab as (select g, extensions.ST_PointOnSurface(g) lp from big)
       select extensions.ST_AsGeoJSON(g,5) geojson, extensions.ST_NPoints(g) npoints,
              extensions.ST_NumGeometries(g) nparts, extensions.ST_IsValid(g) valid,
              extensions.ST_IsEmpty(g) is_empty, extensions.ST_Covers(g,lp) covers, extensions.ST_Area(g) area
         from lab`,
      [CLOSE, CLOSE_BACK, SIMPLIFY, MIN_COMPONENT_AREA, t.parent]);
    const r = rows[0];
    assert.ok(r?.geojson && !r.is_empty && r.valid && r.covers, `${t.key}: invalid/empty`);
    assert.ok(Number(r.area) >= AREA_BAND[0] && Number(r.area) <= AREA_BAND[1],
      `${t.key}: area ${Number(r.area).toFixed(5)} outside [${AREA_BAND}]`);

    if (!COMMIT) { await client.query("rollback"); console.log(`   DRY ${t.key}: ${r.npoints}p/${r.nparts}x ${Number(r.area).toFixed(5)}`); return; }

    const place = await client.query("select id from wine_places where canonical_key=$1", [t.key]);
    assert.equal(place.rows.length, 1, `${t.key} missing`);
    const id = place.rows[0].id, revision = releaseVersion();
    const rawBody = Buffer.from(`${JSON.stringify({ type: "Feature", properties: { grosslage: t.name, einzellagen: t.geoms.length }, geometry: JSON.parse(r.geojson) })}\n`);
    const rawPath = `${NAMESPACE}/${revision}/grosslage-${t.key.split(".").slice(1).join("-")}/outline.geojson`;
    await uploadRawObject(rawPath, rawBody, { upsert: true });
    await client.query("update wine_place_boundaries set is_current=false where wine_place_id=$1 and is_current", [id]);
    const res = await client.query(
      `with source as (insert into wine_boundary_sources (source_namespace,source_feature_id,authority,jurisdiction)
         values ($1,$2,'Landwirtschaftskammer Rheinland-Pfalz (Weinbergsrolle), via LGB','Germany / Rheinland-Pfalz')
         on conflict (source_namespace,source_feature_id) do update set authority=excluded.authority returning id),
       snapshot as (insert into wine_boundary_source_snapshots (source_id,source_revision,retrieved_at,source_url,licence,raw_snapshot_uri,raw_checksum_sha256,normalized_artifact_uri,normalized_checksum_sha256,provenance_note,importer_version)
         select source.id,$3,now(),$4,$5,$6,$7,$6,$7,$8,$9 from source returning id),
       geom as (select extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($10),4326)),3)) g)
       insert into wine_place_boundaries (wine_place_id,source_snapshot_id,boundary_method,quality_status,display_geometry,label_point,bbox,source_feature_refs,generation_parameters,revision,is_current,reviewed_at)
       select $11,snapshot.id,'GENERALIZED_FROM_OFFICIAL_SOURCE','VALIDATED',geom.g,extensions.ST_PointOnSurface(geom.g),
              array[extensions.ST_XMin(extensions.Box3D(geom.g)),extensions.ST_YMin(extensions.Box3D(geom.g)),extensions.ST_XMax(extensions.Box3D(geom.g)),extensions.ST_YMax(extensions.Box3D(geom.g))]::double precision[],
              $12::jsonb,$13::jsonb,$3,true,now() from snapshot,geom returning id`,
      [NAMESPACE, `weinlagen-dissolve:grosslage:${t.key}`, revision, SOURCE_URL, LICENCE,
       `storage://wine-map-sources/${rawPath}`, sha256hex(rawBody),
       `Großlage "${t.name}": union of its ${t.geoms.length} Einzellagen from the Rheinland-Pfalz Weinbergsrolle, generalised for display (close +${CLOSE}°, -${CLOSE_BACK}°) and clipped to its Bereich. Area is inflated relative to the true planted parcels; precise geometry is at Einzellage level.`,
       `scripts/wine-map-sources/build-germany-grosslagen.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`,
       r.geojson, id,
       JSON.stringify({ grosslage: t.name, einzellage_count: t.geoms.length }),
       JSON.stringify({ engine: "weinlagen-dissolve+close+clip", close_buffer: CLOSE, close_buffer_back: CLOSE_BACK, simplify_tolerance: SIMPLIFY, min_component_area: MIN_COMPONENT_AREA, generalised: true, clipped_to: t.parent })]);
    assert.equal(res.rows.length, 1, `${t.key}: insert failed`);
    await client.query("update wine_places set publication_status='VERIFIED' where id=$1 and publication_status='DRAFT'", [id]);
    await client.query("commit");
    console.log(`   OK ${t.key}: ${r.npoints}p/${r.nparts}x ${Number(r.area).toFixed(5)}`);
  } catch (e) { await client.query("rollback").catch(() => {}); throw e; }
}

const { features } = await loadWeinlagenCache();
const groups = new Map();
for (const f of features) {
  const { anbaugebiet: a, bereich: b, grosslage: g } = f.properties;
  const parent = `germany.${slugify(a)}.${slugify(bereichDisplay(b))}`;
  const key = `${parent}.${slugify(g)}`;
  if (!groups.has(key)) groups.set(key, { key, name: g, parent, geoms: [] });
  groups.get(key).geoms.push(f.geometry);
}
const all = [...groups.values()].sort((x, y) => x.key.localeCompare(y.key));
const targets = all.slice(SKIP, SKIP === 0 && TAKE === Infinity ? undefined : SKIP + TAKE);
console.log(`${all.length} Großlagen; processing ${targets.length} (skip ${SKIP})`);

const client = new pg.Client({ connectionString: await dbUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();
try { for (const t of targets) await buildOne(client, t); } finally { await client.end(); }
console.log(`DONE (${COMMIT ? "committed" : "dry"}): ${targets.length}`);
