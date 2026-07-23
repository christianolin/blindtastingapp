// Stage a DRAFT DERIVED_FROM_DESCENDANTS boundary: the union of a parent's
// VERIFIED children's current VALIDATED boundaries, simplified to the level
// tolerance. Cheap (a handful of child geometries) so it runs on the pooled
// connection. Provenance: no raw artifact (provenance_note explains), but a
// real normalized artifact is uploaded; child boundary ids are recorded in
// generation_parameters.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import pg from "pg";
import { pgConfig, releaseVersion, sha256hex } from "../wine-map-tiles/lib.mjs";
import { rawObjectPath, uploadRawObject, SOURCE_NAMESPACE, WFS_LICENCE } from "./inao-lib.mjs";

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}
const slug = arg("slug");
const targetKey = arg("target-key");
assert.ok(slug && targetKey, "--slug and --target-key are required");
const tolerance = Number(arg("tolerance", "0.002"));
// Morphological closing (deg) bridges gaps between child footprints so a
// côte reads as one strip; part-share drops sub-fragment noise after it.
const closing = Number(arg("closing", "0"));
const minPartShare = Number(arg("min-part-share", "0"));
const revision = releaseVersion();

const client = new pg.Client(pgConfig());
await client.connect();
try {
  await client.query("begin");
  await client.query("set local statement_timeout = 600000");

  const children = await client.query(
    `select b.id, extensions.ST_AsGeoJSON(b.display_geometry, 6) g
       from wine_places parent
       join wine_places child on child.primary_parent_id = parent.id
        and child.publication_status = 'VERIFIED'
       join wine_place_boundaries b on b.wine_place_id = child.id
        and b.is_current and b.quality_status = 'VALIDATED'
      where parent.canonical_key = $1`,
    [targetKey],
  );
  assert.ok(children.rows.length > 0, `no VERIFIED+current children under ${targetKey}`);

  const derived = await client.query(
    `with u as (
       select extensions.ST_Union(b.display_geometry) g
         from wine_places parent
         join wine_places child on child.primary_parent_id = parent.id
          and child.publication_status = 'VERIFIED'
         join wine_place_boundaries b on b.wine_place_id = child.id
          and b.is_current and b.quality_status = 'VALIDATED'
        where parent.canonical_key = $1
     ),
     closed as (
       select case when $3::float8 > 0 then
                extensions.ST_Buffer(
                  extensions.ST_Buffer(g, $3::float8, 'quad_segs=4'),
                  -$3::float8, 'quad_segs=4')
              else g end g
       from u
     ),
     simplified as (
       select extensions.ST_CollectionExtract(extensions.ST_MakeValid(
                extensions.ST_SimplifyPreserveTopology(g, $2)), 3) g
       from closed
     ),
     -- Coverage guarantee: union the processed shape back with the raw
     -- children so no closing arc or simplification cut can ever slice
     -- inside a child footprint (owner: "overlapping must not happen").
     covered as (
       select extensions.ST_CollectionExtract(extensions.ST_MakeValid(
                extensions.ST_Union(s.g, u.g)), 3) g
       from simplified s, u
     ),
     parts as (
       select (extensions.ST_Dump(g)).geom part, extensions.ST_Area(g) total
       from covered
     )
     select extensions.ST_AsGeoJSON(
              extensions.ST_Multi(extensions.ST_Collect(part)), 4) geojson
       from parts
      where $4::float8 <= 0 or extensions.ST_Area(part) >= total * $4::float8`,
    [targetKey, tolerance, closing, minPartShare],
  );
  const geojson = derived.rows[0]?.geojson;
  assert.ok(geojson, "derivation produced no geometry");

  const generation = {
    engine: "derived",
    simplify_tolerance: tolerance,
    closing,
    min_part_share: minPartShare,
    coverage_union: true,
    coordinate_precision: 4,
    child_boundary_ids: children.rows.map(({ id }) => id),
  };
  const normalizedFeature = {
    type: "Feature",
    properties: { target_key: targetKey, generation },
    geometry: JSON.parse(geojson),
  };
  const normalizedBody = Buffer.from(`${JSON.stringify(normalizedFeature)}\n`);
  const normalizedPath = rawObjectPath(revision, slug, "normalized.geojson");
  await uploadRawObject(normalizedPath, normalizedBody, { upsert: true });

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
       select source.id, $4, now(), 'https://data.geopf.fr/wfs/ows', $5,
              null, null, $6, $7,
              'Derived from descendant boundaries (child ids in generation_parameters); no raw artifact of its own — children carry the raw WFS provenance.',
              $8
       from source
       returning id
     ),
     geom as (
       select extensions.ST_Multi(extensions.ST_CollectionExtract(
         extensions.ST_MakeValid(
           extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($9), 4326)
         ), 3
       )) g
     )
     insert into wine_place_boundaries (
       wine_place_id, source_snapshot_id, boundary_method, quality_status,
       display_geometry, label_point, bbox, source_feature_refs,
       generation_parameters, revision, is_current, reviewed_at
     )
     select place.id, snapshot.id, 'DERIVED_FROM_DESCENDANTS', 'DRAFT',
            geom.g, extensions.ST_PointOnSurface(geom.g),
            array[
              extensions.ST_XMin(extensions.Box3D(geom.g)),
              extensions.ST_YMin(extensions.Box3D(geom.g)),
              extensions.ST_XMax(extensions.Box3D(geom.g)),
              extensions.ST_YMax(extensions.Box3D(geom.g))
            ]::double precision[],
            jsonb_build_object('derived_from_children', $10::jsonb),
            $11::jsonb,
            $4, false, null
     from place, source, snapshot, geom
     returning id`,
    [
      targetKey,
      SOURCE_NAMESPACE,
      `derived:${slug}`,
      revision,
      WFS_LICENCE,
      `storage://wine-map-sources/${normalizedPath}`,
      sha256hex(normalizedBody),
      `scripts/wine-map-sources/derive-boundary.mjs@${process.env.GITHUB_SHA ?? execSync("git rev-parse HEAD").toString().trim()}`,
      geojson,
      JSON.stringify(children.rows.map(({ id }) => id)),
      JSON.stringify(generation),
    ],
  );
  assert.equal(result.rows.length, 1, "expected one staged boundary row");
  await client.query("commit");

  const geometry = JSON.parse(geojson);
  const vertices = geometry.coordinates.flat(2).length;
  console.log(
    `BOUNDARY-DERIVED ${slug} -> ${targetKey} boundary=${result.rows[0].id} children=${children.rows.length} vertices=${vertices} components=${geometry.coordinates.length}`,
  );
  await writeFile(
    `.superpowers/sdd/preview-${slug}.txt`,
    `${targetKey} derived from ${children.rows.length} children; ${vertices} vertices, ${geometry.coordinates.length} components\n`,
  );
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
