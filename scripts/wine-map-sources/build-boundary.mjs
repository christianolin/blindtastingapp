// Dissolve fetched parcels into one generalized region footprint using
// PostGIS (union -> closing buffer -> topology-preserving simplify ->
// small-component filter -> 4-decimal quantization), create the
// source/snapshot provenance rows, and stage a DRAFT, non-current
// wine_place_boundaries row. Review (a later task) flips it current.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import pg from "pg";
import { pgConfig, sha256hex } from "../wine-map-tiles/lib.mjs";
import { rawObjectPath, uploadRawObject, SOURCE_NAMESPACE, WFS_LICENCE } from "./inao-lib.mjs";

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}
const slug = arg("slug");
const targetKey = arg("target-key");
assert.ok(slug && targetKey, "--slug and --target-key are required");
const closing = Number(arg("closing", "0.02"));
const tolerance = Number(arg("tolerance", "0.005"));
const minShare = Number(arg("min-share", "0.02"));

const workDir = path.resolve(".tiles-build", "sources");
const parcels = JSON.parse(
  await readFile(path.join(workDir, `${slug}-parcels.geojson`), "utf8"),
);
const fetchManifest = JSON.parse(
  await readFile(path.join(workDir, `${slug}-fetch-manifest.json`), "utf8"),
);
assert.equal(fetchManifest.slug, slug);
assert.equal(fetchManifest.target_key, targetKey);
assert.ok(parcels.features.length > 0, "no parcels to dissolve");

const client = new pg.Client(pgConfig());
await client.connect();
try {
  await client.query("begin");
  await client.query(
    "create temporary table _parcels (geom extensions.geometry) on commit drop",
  );
  const batchSize = 200;
  for (let i = 0; i < parcels.features.length; i += batchSize) {
    const batch = parcels.features.slice(i, i + batchSize);
    const values = batch.map((_, j) =>
      `(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($${j + 1}), 4326))`,
    );
    await client.query(
      `insert into _parcels (geom) values ${values.join(", ")}`,
      batch.map((feature) => JSON.stringify(feature.geometry)),
    );
  }

  const dissolved = await client.query(
    `with u as (select extensions.ST_Union(geom) g from _parcels),
     closed as (
       select extensions.ST_MakeValid(
         extensions.ST_Buffer(extensions.ST_Buffer(g, $1), -$1)
       ) g from u
     ),
     simplified as (
       select extensions.ST_MakeValid(
         extensions.ST_SimplifyPreserveTopology(g, $2)
       ) g from closed
     ),
     parts as (
       select (extensions.ST_Dump(extensions.ST_Multi(g))).geom part
       from simplified
     ),
     measured as (
       select part, extensions.ST_Area(part) area,
              sum(extensions.ST_Area(part)) over () total
       from parts
     ),
     kept as (
       select extensions.ST_Multi(extensions.ST_Collect(part)) g
       from measured where area / total >= $3
     )
     select extensions.ST_AsGeoJSON(
       extensions.ST_MakeValid(g), 4
     ) geojson from kept`,
    [closing, tolerance, minShare],
  );
  const geojson = dissolved.rows[0]?.geojson;
  assert.ok(geojson, "dissolve produced no geometry");

  const normalizedFeature = {
    type: "Feature",
    properties: {
      target_key: targetKey,
      members: fetchManifest.members,
      generation: { closing_buffer: closing, simplify_tolerance: tolerance, min_component_area_share: minShare, coordinate_precision: 4 },
    },
    geometry: JSON.parse(geojson),
  };
  const normalizedBody = Buffer.from(`${JSON.stringify(normalizedFeature)}\n`);
  const normalizedPath = rawObjectPath(fetchManifest.revision, slug, "normalized.geojson");
  await uploadRawObject(normalizedPath, normalizedBody);

  const result = await client.query(
    `with place as (
       select id from wine_places where canonical_key = $1
     ),
     source as (
       insert into wine_boundary_sources (source_namespace, source_feature_id, authority, jurisdiction)
       values ($2, $3, 'IGN / INAO', 'France')
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
       select source.id, $4, $5, $6, $7,
              $8, $9, $10, $11,
              'Raw artifacts are the unmodified WFS page responses listed in the fetch manifest.',
              $12
       from source
       returning id
     ),
     geom as (
       select extensions.ST_Multi(extensions.ST_MakeValid(
         extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($13), 4326)
       )) g
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
            jsonb_build_object('dataset', 'AOC-VITICOLES:aire_parcellaire', 'members', $14::jsonb, 'filtered_parcels', $15::int),
            jsonb_build_object('closing_buffer', $16::numeric, 'simplify_tolerance', $17::numeric, 'min_component_area_share', $18::numeric, 'coordinate_precision', 4),
            $4, false, null
     from place, source, snapshot, geom
     returning id`,
    [
      targetKey,
      SOURCE_NAMESPACE,
      `denomset:${slug}`,
      fetchManifest.revision,
      fetchManifest.retrieved_at,
      "https://data.geopf.fr/wfs/ows",
      WFS_LICENCE,
      `storage://wine-map-sources/${fetchManifest.manifest_object_path}`,
      fetchManifest.manifest_checksum_sha256,
      `storage://wine-map-sources/${normalizedPath}`,
      sha256hex(normalizedBody),
      `scripts/wine-map-sources/build-boundary.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`,
      geojson,
      JSON.stringify(fetchManifest.members),
      parcels.features.length,
      closing,
      tolerance,
      minShare,
    ],
  );
  assert.equal(result.rows.length, 1, "expected one staged boundary row");

  // Preview renders BEFORE commit: a preview failure rolls the staged row
  // back rather than leaving an unreviewable DRAFT behind.
  const geometry = JSON.parse(geojson);
  const rings = geometry.coordinates.flat(1);
  const all = rings.flat(1);
  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const scale = 800 / Math.max(maxX - minX, maxY - minY);
  const paths = geometry.coordinates
    .map((poly) =>
      poly
        .map(
          (ring) =>
            `M${ring
              .map(([x, y]) => `${((x - minX) * scale).toFixed(1)},${((maxY - y) * scale).toFixed(1)}`)
              .join("L")}Z`,
        )
        .join(""),
    )
    .join("");
  await writeFile(
    `.superpowers/sdd/preview-${slug}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${((maxX - minX) * scale).toFixed(0)} ${((maxY - minY) * scale).toFixed(0)}"><path d="${paths}" fill="#5C1A2B" fill-opacity="0.35" stroke="#5C1A2B"/></svg>\n`,
  );
  await client.query("commit");
  console.log(
    `BOUNDARY-STAGED ${slug} -> ${targetKey} boundary=${result.rows[0].id} vertices=${all.length} components=${geometry.coordinates.length}`,
  );
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
