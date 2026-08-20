// Einzellage boundaries — the one German tier that is NOT generalised.
//
// Every tier above this dissolves the Weinbergsrolle and applies a morphological
// close for readability, which inflates area. Here the Weinbergsrolle polygon IS
// the legal site, so it is used as-is: no union, no close, no clip. That is the
// whole point of going four levels deep — the precision lives here.
//
// One shared source snapshot is created for the run (all 1,583 come from the
// same WFS pull), with each boundary carrying its own wlg_nr in
// source_feature_refs.
//
//   node scripts/wine-map-sources/build-germany-einzellagen.mjs [--commit] [--skip N] [--take N]

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { sha256hex, releaseVersion } from "../wine-map-tiles/lib.mjs";
import { loadWeinlagenCache, LICENCE, SOURCE_URL } from "./fetch-rlp-weinlagen.mjs";

const NAMESPACE = "LWK_RLP_WEINLAGEN";
const WINDOW = { minLon: 5.5, minLat: 46.9, maxLon: 15.6, maxLat: 55.5 };
const COMMIT = process.argv.includes("--commit");
const num = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const SKIP = num("--skip", 0), TAKE = num("--take", Infinity);

const slugify = (s) => String(s).toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const bereichDisplay = (r) => r.replace(/^(Bereich|Ber\.)\s+/i, "").trim();

async function dbUrl() {
  const raw = await readFile(new URL("../../.env.local", import.meta.url), "utf8");
  const l = raw.split(/\r?\n/).find((x) => x.trim().startsWith("DATABASE_URL="));
  return l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

const { features } = await loadWeinlagenCache();
const seen = new Set();
const items = features.map((f) => {
  const p = f.properties;
  const parent = `germany.${slugify(p.anbaugebiet)}.${slugify(bereichDisplay(p.bereich))}.${slugify(p.grosslage)}`;
  const village = p.gemeinde || p.gemarkungen || "";
  let slug = `${slugify(village)}-${slugify(p.wlg_name)}`;
  if (seen.has(`${parent}.${slug}`)) slug = `${slug}-${p.wlg_nr}`;
  seen.add(`${parent}.${slug}`);
  return { key: `${parent}.${slug}`, nr: p.wlg_nr, name: p.wlg_name, geometry: f.geometry };
}).sort((a, b) => a.key.localeCompare(b.key));

const targets = items.slice(SKIP, SKIP === 0 && TAKE === Infinity ? undefined : SKIP + TAKE);
console.log(`${items.length} Einzellagen; processing ${targets.length} (skip ${SKIP})`);

const client = new pg.Client({ connectionString: await dbUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();
let ok = 0, failed = 0;
try {
  const revision = releaseVersion();
  // One snapshot for the whole run: all sites come from the same WFS pull.
  let snapshotId = null;
  if (COMMIT) {
    const body = Buffer.from(`weinbergsrolle:${revision}:${items.length}\n`);
    const s = await client.query(
      `with source as (insert into wine_boundary_sources (source_namespace,source_feature_id,authority,jurisdiction)
         values ($1,'weinlagen-einzellagen','Landwirtschaftskammer Rheinland-Pfalz (Weinbergsrolle), via LGB','Germany / Rheinland-Pfalz')
         on conflict (source_namespace,source_feature_id) do update set authority=excluded.authority returning id)
       insert into wine_boundary_source_snapshots (source_id,source_revision,retrieved_at,source_url,licence,raw_snapshot_uri,raw_checksum_sha256,normalized_artifact_uri,normalized_checksum_sha256,provenance_note,importer_version)
       select source.id,$2,now(),$3,$4,$5,$6,$5,$6,$7,$8 from source returning id`,
      [NAMESPACE, revision, SOURCE_URL, LICENCE,
       `storage://wine-map-sources/${NAMESPACE}/${revision}/einzellagen/source.txt`, sha256hex(body),
       `Einzellagen of the Rheinland-Pfalz Weinbergsrolle, used AS-IS: unlike the Anbaugebiet/Bereich/Großlage tiers above, these polygons are the legal vineyard sites and are neither dissolved nor generalised.`,
       `scripts/wine-map-sources/build-germany-einzellagen.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`]);
    snapshotId = s.rows[0].id;
  }

  for (const t of targets) {
    try {
      await client.query("begin");
      await client.query("set local statement_timeout = 120000");
      const { rows } = await client.query(
        `with g as (select extensions.ST_Multi(extensions.ST_CollectionExtract(
                      extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($1),4326)),3)) g)
         select extensions.ST_AsGeoJSON(g,6) geojson, extensions.ST_NPoints(g) npoints,
                extensions.ST_IsValid(g) valid, extensions.ST_IsEmpty(g) is_empty,
                extensions.ST_Covers(g, extensions.ST_PointOnSurface(g)) covers, extensions.ST_Area(g) area,
                extensions.ST_XMin(extensions.Box3D(g)) minx, extensions.ST_YMin(extensions.Box3D(g)) miny,
                extensions.ST_XMax(extensions.Box3D(g)) maxx, extensions.ST_YMax(extensions.Box3D(g)) maxy
           from g`,
        [JSON.stringify(t.geometry)]);
      const r = rows[0];
      assert.ok(r?.geojson && !r.is_empty && r.valid && r.covers, `${t.key}: invalid/empty`);
      assert.ok(r.minx >= WINDOW.minLon && r.miny >= WINDOW.minLat && r.maxx <= WINDOW.maxLon && r.maxy <= WINDOW.maxLat,
        `${t.key}: bbox escapes window`);
      assert.ok(Number(r.area) > 0 && Number(r.area) < 0.01, `${t.key}: area ${r.area} implausible for a vineyard site`);

      if (!COMMIT) { await client.query("rollback"); ok += 1; continue; }

      const place = await client.query("select id from wine_places where canonical_key=$1", [t.key]);
      assert.equal(place.rows.length, 1, `${t.key} place missing`);
      const id = place.rows[0].id;
      await client.query("update wine_place_boundaries set is_current=false where wine_place_id=$1 and is_current", [id]);
      await client.query(
        `with geom as (select extensions.ST_Multi(extensions.ST_CollectionExtract(extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($1),4326)),3)) g)
         insert into wine_place_boundaries (wine_place_id,source_snapshot_id,boundary_method,quality_status,display_geometry,label_point,bbox,source_feature_refs,generation_parameters,revision,is_current,reviewed_at)
         select $2,$3,'MANUAL','VALIDATED',geom.g,extensions.ST_PointOnSurface(geom.g),
                array[extensions.ST_XMin(extensions.Box3D(geom.g)),extensions.ST_YMin(extensions.Box3D(geom.g)),extensions.ST_XMax(extensions.Box3D(geom.g)),extensions.ST_YMax(extensions.Box3D(geom.g))]::double precision[],
                $4::jsonb,$5::jsonb,$6,true,now() from geom`,
        [r.geojson, id, snapshotId,
         JSON.stringify({ wlg_nr: t.nr, wlg_name: t.name }),
         JSON.stringify({ engine: "weinbergsrolle-asis", generalised: false, note: "Official Einzellage polygon used unmodified." }),
         revision]);
      await client.query("update wine_places set publication_status='VERIFIED' where id=$1 and publication_status='DRAFT'", [id]);
      await client.query("commit");
      ok += 1;
      if (ok % 200 === 0) console.log(`   ${ok}/${targets.length}…`);
    } catch (e) {
      await client.query("rollback").catch(() => {});
      failed += 1;
      console.log(`   FAILED ${t.key}: ${e.message}`);
      if (failed > 20) throw new Error("too many failures, aborting");
    }
  }
} finally { await client.end(); }
console.log(`DONE (${COMMIT ? "committed" : "dry"}): ok=${ok} failed=${failed}`);
