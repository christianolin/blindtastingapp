// Tasks 4a+4b: the one resumable Spain DO driver. For each `ready` DO in
// data/wine-map/spain-do-membership.json it resolves the pliego municipality
// list to INE codes (spain-lib, fail-closed), dissolves the whole-municipality
// polygons from the georef cache into the DO outline, runs the auto-promote
// GUARDS that stand in for the waived human review, and — only with --commit —
// uploads provenance artifacts and lands the boundary current-VALIDATED with
// the place VERIFIED, in one transaction. Resumable: a DO that already has a
// current-VALIDATED boundary is skipped, so a multi-hour run resumes cleanly.
//
// Modes:
//   (default)            DRY: resolve + dissolve + guard every ready DO, roll back.
//   --commit             persist: stage artifacts + promote each passing DO.
//   --only <substr>      limit to canonical_keys containing <substr>.
//   --selftest <prov>    dissolve every municipio of INE province <prov> and run
//                        the geometry guards, rolled back — proves the dissolve
//                        engine + guards on real Spanish geometry with no DO
//                        membership involved (a province IS its municipios' union).
//
// A DO whose guards fail is logged and SKIPPED (not promoted); other DOs
// continue — a bad membership list or a stray municipio never blocks the rest,
// and never ships (fail-closed).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { sha256hex, releaseVersion } from "../wine-map-tiles/lib.mjs";
import { uploadRawObject } from "./inao-lib.mjs";
import { loadMunicipioCache } from "./fetch-spain-municipios.mjs";
import { buildMunicipioIndex, resolveMembership } from "./spain-lib.mjs";

const MEMBERSHIP_FILE = "data/wine-map/spain-do-membership.json";
const NAMESPACE = "IGN_CNIG_SPAIN";
const AUTHORITY = "IGN/CNIG España (municipios) + BOE pliego (membership)";
const JURISDICTION = "Spain";
const DATASET_URL =
  "https://public.opendatasoft.com/explore/dataset/georef-spain-municipio/";
// Peninsula + Balearics display window — must match the Task 2 country base
// (20260901090000). Canary Islands are out of scope, so a Canary municipio
// slipping into a list makes the bbox escape this window and the DO is rejected.
const WINDOW = { minLon: -10, minLat: 35, maxLon: 5, maxLat: 44 };
// Loose planar-deg² sanity bands per level: generous enough never to reject a
// real DO, tight enough to catch a gross membership error (a municipio in the
// wrong province blows up the bbox/area). Rioja ~0.5, Ribera ~0.4, Priorat ~0.02.
const AREA_BAND = {
  regional: [0.01, 4.0],
  subregional: [0.003, 2.0],
  communal: [0.0003, 0.8],
};
// A DO's geometry may sit at most this fraction outside its declared parent DO
// before the containment guard rejects it (absorbs simplification mismatch).
const CONTAINMENT_SLACK = 0.02;

const argv = process.argv.slice(2);
const hasFlag = (n) => argv.includes(`--${n}`);
const argVal = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i < 0 ? null : argv[i + 1];
};
const COMMIT = hasFlag("commit");
const ONLY = argVal("only");
const SELFTEST_PROV = argVal("selftest");

async function loadDatabaseUrl() {
  const raw = await readFile(new URL("../../.env.local", import.meta.url), "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL="));
  assert.ok(line, "DATABASE_URL not found in .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

// The dissolve + all geometry guards, inside the caller's open transaction
// (temp table only). Mirrors stage-piedmont-boundaries.mjs: ST_UnaryUnion of
// the member municipios, simplify, rebuild each part from its exterior ring
// (municipality tiling + simplify otherwise leave spurious interior holes in a
// solid wine footprint), then PointOnSurface. Returns the dissolve report.
async function dissolve(client, geometries, tolerance) {
  const geojson = geometries.map((g) => JSON.stringify(g));
  await client.query("drop table if exists _spain_dissolve");
  await client.query("create temp table _spain_dissolve (geom extensions.geometry)");
  await client.query(
    `insert into _spain_dissolve (geom)
       select extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(g), 4326))
         from unnest($1::text[]) g`,
    [geojson],
  );
  const { rows } = await client.query(
    `with u as (
       select extensions.ST_UnaryUnion(extensions.ST_MakeValid(extensions.ST_Collect(geom))) g
         from _spain_dissolve
     ),
     simp as (
       select extensions.ST_CollectionExtract(
                extensions.ST_MakeValid(extensions.ST_SimplifyPreserveTopology(g, $1)), 3) g
         from u
     ),
     noholes as (
       select extensions.ST_Multi(extensions.ST_Collect(
                extensions.ST_MakePolygon(extensions.ST_ExteriorRing(d.geom)))) g
         from simp, lateral extensions.ST_Dump(extensions.ST_Multi(simp.g)) d
     ),
     labelled as (select g, extensions.ST_PointOnSurface(g) lp from noholes)
     select extensions.ST_AsGeoJSON(g, 5) geojson,
            extensions.ST_AsGeoJSON(lp, 6) label_point_geojson,
            extensions.ST_NPoints(g) npoints,
            extensions.ST_NumGeometries(g) nparts,
            extensions.ST_IsValid(g) valid,
            extensions.ST_IsEmpty(g) is_empty,
            extensions.ST_Covers(g, lp) covers_label,
            extensions.ST_Area(g) area,
            extensions.ST_XMin(extensions.Box3D(g)) minx,
            extensions.ST_YMin(extensions.Box3D(g)) miny,
            extensions.ST_XMax(extensions.Box3D(g)) maxx,
            extensions.ST_YMax(extensions.Box3D(g)) maxy
       from labelled`,
    [tolerance],
  );
  return rows[0];
}

// The guards that replace the human eye. Throw on any failure — the caller
// turns a throw into "skip this DO, keep going".
function assertGuards(report, { label, level, memberCount }) {
  assert.ok(report.geojson, `${label}: dissolve produced no geometry`);
  assert.equal(report.is_empty, false, `${label}: geometry empty`);
  assert.ok(report.valid, `${label}: geometry invalid`);
  assert.ok(report.covers_label, `${label}: geometry does not cover its label point`);
  assert.ok(
    report.minx >= WINDOW.minLon && report.miny >= WINDOW.minLat &&
      report.maxx <= WINDOW.maxLon && report.maxy <= WINDOW.maxLat,
    `${label}: bbox ${(+report.minx).toFixed(2)},${(+report.miny).toFixed(2)},${(+report.maxx).toFixed(2)},${(+report.maxy).toFixed(2)} escapes the Spain window (a Canary/other-country municipio in the list?)`,
  );
  const band = AREA_BAND[level] ?? AREA_BAND.regional;
  assert.ok(
    Number(report.area) >= band[0] && Number(report.area) <= band[1],
    `${label}: area ${Number(report.area).toFixed(4)} deg² outside the ${level} band [${band[0]}, ${band[1]}]`,
  );
  assert.ok(memberCount >= 1, `${label}: no member municipios`);
}

// Round-trip through the exact CTE the insert uses, asserting the
// wine_place_boundaries CHECKs would pass (5-decimal round-trip can introduce a
// seam self-intersection the dissolve output didn't have).
async function assertInsertable(client, report, label) {
  const { rows } = await client.query(
    `with geom as (
       select extensions.ST_Multi(extensions.ST_CollectionExtract(
                extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($1), 4326)), 3)) g
     )
     select extensions.ST_IsValid(g) valid, extensions.ST_IsEmpty(g) is_empty,
            extensions.ST_Covers(g, extensions.ST_PointOnSurface(g)) covers
       from geom`,
    [report.geojson],
  );
  const rt = rows[0];
  assert.ok(rt.valid && !rt.is_empty && rt.covers,
    `${label}: post-round-trip geometry would fail the wine_place_boundaries CHECK (valid=${rt.valid} empty=${rt.is_empty} covers=${rt.covers})`);
}

// Containment guard: the DO must sit (almost) entirely inside its parent DO's
// current geometry. Runs against committed parent rows, so parents promote first.
async function assertContainedInParent(client, report, parentKey, label) {
  const { rows } = await client.query(
    `with child as (
       select extensions.ST_Multi(extensions.ST_CollectionExtract(
                extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($1), 4326)), 3)) g
     ),
     parent as (
       select b.display_geometry g
         from wine_places p
         join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
        where p.canonical_key = $2
     )
     select (select count(*) from parent) has_parent,
            case when (select count(*) from parent) = 1
              then extensions.ST_Area(extensions.ST_Difference(child.g, (select g from parent)))
                   / nullif(extensions.ST_Area(child.g), 0)
              else null end outside_fraction
       from child`,
    [report.geojson, parentKey],
  );
  const r = rows[0];
  assert.equal(Number(r.has_parent), 1, `${label}: declared parent ${parentKey} has no current boundary yet`);
  assert.ok(
    Number(r.outside_fraction) <= CONTAINMENT_SLACK,
    `${label}: ${(Number(r.outside_fraction) * 100).toFixed(1)}% of the outline falls outside parent ${parentKey} (max ${CONTAINMENT_SLACK * 100}%)`,
  );
}

async function main() {
  const membership = JSON.parse(await readFile(MEMBERSHIP_FILE, "utf8"));
  const cache = await loadMunicipioCache();
  const index = buildMunicipioIndex(cache);
  console.log(`municipio cache: ${cache.municipios.length} municipios (retrieved ${cache.retrieved_at})`);

  const client = new pg.Client({ connectionString: await loadDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    if (SELFTEST_PROV) {
      const munis = cache.municipios.filter((m) => m.prov_code === SELFTEST_PROV);
      assert.ok(munis.length > 0, `no municipios for province ${SELFTEST_PROV}`);
      console.log(`SELFTEST province ${SELFTEST_PROV}: dissolving ${munis.length} municipios`);
      await client.query("begin");
      try {
        const report = await dissolve(client, munis.map((m) => m.geometry), 0.002);
        assertGuards(report, { label: `province ${SELFTEST_PROV}`, level: "regional", memberCount: munis.length });
        await assertInsertable(client, report, `province ${SELFTEST_PROV}`);
        console.log(
          `  OK: ${report.npoints} vertices, ${report.nparts} part(s), area ${Number(report.area).toFixed(4)} deg², ` +
            `bbox ${(+report.minx).toFixed(2)}..${(+report.maxx).toFixed(2)} / ${(+report.miny).toFixed(2)}..${(+report.maxy).toFixed(2)}, ` +
            `valid=${report.valid} covers_label=${report.covers_label}`,
        );
        console.log("SELFTEST PASSED (dissolve engine + guards proven on real Spanish geometry); rolling back.");
      } finally {
        await client.query("rollback");
      }
      return;
    }

    const ready = membership.denominations.filter(
      (d) => d.status === "ready" && (!ONLY || d.canonical_key.includes(ONLY)),
    );
    const pending = membership.denominations.filter((d) => d.status !== "ready").length;
    console.log(`${ready.length} ready DO(s), ${pending} pending (skipped).`);
    if (ready.length === 0) {
      console.log("Nothing to do — populate a pliego list + set status:'ready' first (see the artifact _readme).");
      return;
    }

    // Resumability: skip DOs already promoted to a current-VALIDATED boundary.
    const promoted = new Set(
      (
        await client.query(
          `select p.canonical_key from wine_places p
             join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
            where p.canonical_key like 'spain.%'`,
        )
      ).rows.map((r) => r.canonical_key),
    );

    const revision = releaseVersion();
    let promotedCount = 0;
    let rejected = 0;
    for (const entry of ready) {
      const label = entry.canonical_key;
      if (promoted.has(label)) { console.log(`SKIP (already promoted) ${label}`); continue; }
      let records;
      try {
        records = resolveMembership(entry, index);
      } catch (error) {
        console.error(`REJECT ${label}: membership did not resolve — ${error.message}`);
        rejected += 1;
        continue;
      }
      const slug = label.split(".").at(-1);
      const level = entry.appellation_level ?? "regional";
      const tolerance = level === "communal" ? 0.0008 : 0.002;

      await client.query("begin");
      try {
        await client.query("set local statement_timeout = 600000");
        const report = await dissolve(client, records.map((r) => r.geometry), tolerance);
        assertGuards(report, { label, level, memberCount: records.length });
        await assertInsertable(client, report, label);
        if (entry.parent_key) await assertContainedInParent(client, report, entry.parent_key, label);

        if (!COMMIT) {
          await client.query("rollback");
          console.log(
            `DRY OK ${label}: ${records.length} municipios -> ${report.npoints} vertices, ` +
              `area ${Number(report.area).toFixed(4)} deg², ${report.nparts} part(s)`,
          );
          continue;
        }

        // --- persist: artifacts + source/snapshot/boundary + place flip -------
        const featureId = slug;
        const rawFeatures = records.map((r) => ({
          type: "Feature",
          properties: { mun_code: r.mun_code, mun_name: r.mun_name, prov_code: r.prov_code },
          geometry: r.geometry,
        }));
        const rawBody = Buffer.from(`${JSON.stringify({ type: "FeatureCollection", features: rawFeatures })}\n`);
        const rawPath = `${NAMESPACE}/${revision}/${featureId}/raw-municipios.geojson`;
        await uploadRawObject(rawPath, rawBody, { upsert: false });

        const generation = {
          engine: "municipality-union",
          member_municipio_count: records.length,
          municipio_geometry: "OpenDataSoft georef-spain-municipio (IGN/CNIG)",
          membership_source: entry.provenance?.source ?? null,
          simplify_tolerance: tolerance,
          coordinate_precision: 5,
          note: "Whole-municipality over-approximation of vineyard land, dissolved with interior holes rebuilt from exterior rings (solid wine footprint).",
        };
        const normalizedBody = Buffer.from(
          `${JSON.stringify({ type: "Feature", properties: { target_key: label, generation }, geometry: JSON.parse(report.geojson) })}\n`,
        );
        const normalizedPath = `${NAMESPACE}/${revision}/${featureId}/normalized.geojson`;
        await uploadRawObject(normalizedPath, normalizedBody, { upsert: true });

        const importer = `scripts/wine-map-sources/run-spain-dos.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`;
        const provenanceNote =
          `Whole-municipality union of ${records.length} INE municipios per the ${entry.provenance?.source ?? "pliego"} ` +
          `(${entry.provenance?.retrieved ?? "n/d"}). Geometry: georef-spain-municipio (IGN/CNIG).`;
        const res = await client.query(
          `with place as (select id from wine_places where canonical_key = $1),
             source as (
               insert into wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
               values ($2, $3, $4, $5)
               on conflict (source_namespace, source_feature_id) do update set authority = excluded.authority
               returning id
             ),
             snapshot as (
               insert into wine_boundary_source_snapshots (
                 source_id, source_revision, retrieved_at, source_url, licence,
                 raw_snapshot_uri, raw_checksum_sha256, normalized_artifact_uri, normalized_checksum_sha256,
                 provenance_note, importer_version
               )
               select source.id, $6, now(), $7, $8, $9, $10, $11, $12, $13, $14 from source
               returning id
             ),
             geom as (
               select extensions.ST_Multi(extensions.ST_CollectionExtract(
                        extensions.ST_MakeValid(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($15), 4326)), 3)) g
             )
             insert into wine_place_boundaries (
               wine_place_id, source_snapshot_id, boundary_method, quality_status,
               display_geometry, label_point, bbox, source_feature_refs, generation_parameters,
               revision, is_current, reviewed_at
             )
             select place.id, snapshot.id, 'MANUAL', 'VALIDATED',
                    geom.g, extensions.ST_PointOnSurface(geom.g),
                    array[extensions.ST_XMin(extensions.Box3D(geom.g)), extensions.ST_YMin(extensions.Box3D(geom.g)),
                          extensions.ST_XMax(extensions.Box3D(geom.g)), extensions.ST_YMax(extensions.Box3D(geom.g))]::double precision[],
                    $16::jsonb, $17::jsonb, $6, true, now()
               from place, source, snapshot, geom
             returning id`,
          [
            label, NAMESPACE, `do:${slug}`, AUTHORITY, JURISDICTION,
            revision, DATASET_URL, cache.licence ?? "IGN/CNIG open data",
            `storage://wine-map-sources/${rawPath}`, sha256hex(rawBody),
            `storage://wine-map-sources/${normalizedPath}`, sha256hex(normalizedBody),
            provenanceNote, importer, report.geojson,
            JSON.stringify({ mun_codes: records.map((r) => r.mun_code), municipio_count: records.length }),
            JSON.stringify(generation),
          ],
        );
        assert.equal(res.rows.length, 1, `${label}: place row missing — create the catalog node (Task 5) first`);

        const flip = await client.query(
          `update wine_places set publication_status = 'VERIFIED'
             where canonical_key = $1 and publication_status <> 'VERIFIED'
           returning id`,
          [label],
        );
        // Post-flip invariant: exactly one current-validated boundary + VERIFIED place.
        const check = await client.query(
          `select p.publication_status,
                  (select count(*) from wine_place_boundaries b where b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED') curval
             from wine_places p where p.canonical_key = $1`,
          [label],
        );
        assert.equal(check.rows[0]?.publication_status, "VERIFIED", `${label}: place not VERIFIED post-flip`);
        assert.equal(Number(check.rows[0]?.curval), 1, `${label}: expected exactly 1 current-validated boundary`);
        await client.query("commit");
        promotedCount += 1;
        console.log(`PROMOTED ${label}: ${records.length} municipios, boundary=${res.rows[0].id}${flip.rows.length ? "" : " (place already VERIFIED)"}`);
      } catch (error) {
        await client.query("rollback").catch(() => {});
        console.error(`REJECT ${label}: ${error.message}`);
        rejected += 1;
      }
    }
    console.log(`DONE: ${promotedCount} promoted, ${rejected} rejected/held, ${ready.length - promotedCount - rejected} skipped this run.`);
  } finally {
    await client.end();
  }
}

await main();
