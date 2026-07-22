// Export stage: reads every verified place + current validated boundary from
// Supabase and writes tippecanoe-ready GeoJSON plus release.json into
// .tiles-build/. Tile split is by display tier (tier 0 -> world archive,
// tier 1 -> both, tier >= 2 -> country shard). Fail-closed on count/shape drift.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {
  WORK_DIR,
  archiveForPlace,
  SHARD_TARGET,
  featureCollection,
  labelFeatures,
  pgConfig,
  placeFeature,
  releaseVersion,
} from "./lib.mjs";

const EXPORT_SQL = `
  select
    p.id::text as id,
    p.canonical_key,
    p.name,
    p.kind::text as kind,
    p.display_tier,
    p.primary_parent_id::text as primary_parent_id,
    p.min_zoom,
    p.label_min_zoom,
    p.sort_order,
    exists (
      select 1 from wine_places c
      where c.primary_parent_id = p.id and c.publication_status = 'VERIFIED'
    ) as has_children,
    s.source_namespace,
    extensions.ST_AsGeoJSON(b.display_geometry, 6) as geometry,
    extensions.ST_AsGeoJSON(b.label_point, 6) as label_point,
    extensions.ST_X(b.label_point) as label_lon,
    extensions.ST_Y(b.label_point) as label_lat,
    round(extensions.ST_Area(b.display_geometry)::numeric, 8) as area,
    (
      select json_agg(json_build_array(
        round(extensions.ST_X(extensions.ST_PointOnSurface(d.geom))::numeric, 6),
        round(extensions.ST_Y(extensions.ST_PointOnSurface(d.geom))::numeric, 6)
      ))
      from extensions.ST_Dump(b.display_geometry) d
    ) as component_labels
  from wine_places p
  join wine_place_boundaries b
    on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
  join wine_boundary_source_snapshots snap on snap.id = b.source_snapshot_id
  join wine_boundary_sources s on s.id = snap.source_id
  where p.publication_status = 'VERIFIED'
  order by p.canonical_key`;

const client = new pg.Client(pgConfig());
await client.connect();
let rows;
try {
  const verified = await client.query(
    "select count(*)::int as count from wine_places where publication_status = 'VERIFIED'",
  );
  ({ rows } = await client.query(EXPORT_SQL));
  assert.equal(rows.length, verified.rows[0].count, "verified/export row mismatch");
  assert.ok(rows.length >= 20, "implausibly few exportable places");
} finally {
  await client.end();
}

assert.equal(new Set(rows.map(({ id }) => id)).size, rows.length, "duplicate place ids");
for (const row of rows) {
  const geometry = JSON.parse(row.geometry);
  assert.equal(geometry.type, "MultiPolygon", `${row.canonical_key}: unexpected geometry type`);
  assert.equal(JSON.parse(row.label_point).type, "Point", `${row.canonical_key}: unexpected label type`);
}

function extendBbox(bbox, geojson) {
  for (const polygon of geojson.coordinates) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        bbox[0] = Math.min(bbox[0], x);
        bbox[1] = Math.min(bbox[1], y);
        bbox[2] = Math.max(bbox[2], x);
        bbox[3] = Math.max(bbox[3], y);
      }
    }
  }
  return bbox;
}

const world = { rows: [], ids: [] };
const shards = {};
for (const row of rows) {
  const { world: inWorld, shard } = archiveForPlace(row);
  if (inWorld) {
    world.rows.push(row);
    world.ids.push(row.id);
  }
  if (shard) {
    const bucket = (shards[shard] ??= {
      rows: [], ids: [], bbox: [180, 90, -180, -90], maxLabelZoom: 0,
    });
    bucket.rows.push(row);
    bucket.ids.push(row.id);
    bucket.maxLabelZoom = Math.max(bucket.maxLabelZoom, Number(row.label_min_zoom));
    extendBbox(bucket.bbox, JSON.parse(row.geometry));
  }
}
assert.ok(
  world.rows.some(({ canonical_key }) => canonical_key === "france"),
  "world archive must contain France",
);
assert.ok(world.rows.length >= 2 && Object.keys(shards).length >= 1, "empty archive");

await mkdir(WORK_DIR, { recursive: true });
const outputs = [
  ["world-places.geojson", featureCollection(world.rows.map(placeFeature))],
  ["world-labels.geojson", featureCollection(world.rows.flatMap(labelFeatures))],
];
for (const [key, bucket] of Object.entries(shards)) {
  outputs.push([`${key}-places.geojson`, featureCollection(bucket.rows.map(placeFeature))]);
  outputs.push([`${key}-labels.geojson`, featureCollection(bucket.rows.flatMap(labelFeatures))]);
}
for (const [filename, collection] of outputs) {
  await writeFile(path.join(WORK_DIR, filename), `${JSON.stringify(collection)}\n`);
}

const byKind = {};
for (const { kind } of rows) byKind[kind] = (byKind[kind] ?? 0) + 1;
const labelFeatureTotal = outputs
  .filter(([filename]) => filename.endsWith("-labels.geojson"))
  .reduce((sum, [, collection]) => sum + collection.features.length, 0);
const release = {
  version: releaseVersion(),
  generated_at: new Date().toISOString(),
  git_sha: process.env.GITHUB_SHA ?? null,
  node: process.version,
  counts: { places: rows.length, labels: labelFeatureTotal, by_kind: byKind },
  world: { place_ids: world.ids },
  shards: Object.fromEntries(
    Object.entries(shards).map(([key, bucket]) => [
      key,
      {
        place_ids: bucket.ids,
        bbox: bucket.bbox,
        min_zoom: SHARD_TARGET.minZoom,
        // Content-driven ceiling: deepest label reveal + 2 zooms of headroom
        // (MapLibre overzooms past the archive max), capped at the envelope.
        // Keeps shallow shards (Bordeaux, z9 reveals) from emitting tens of
        // thousands of empty z16 tiles.
        max_zoom: Math.min(
          SHARD_TARGET.maxZoom,
          Math.max(SHARD_TARGET.minZoom + 1, Math.ceil(bucket.maxLabelZoom) + 2),
        ),
      },
    ]),
  ),
  expected: rows.map((row) => ({
    id: row.id,
    key: row.canonical_key,
    tier: row.display_tier,
    parent_id: row.primary_parent_id,
    label_lon: Number(row.label_lon),
    label_lat: Number(row.label_lat),
    archive: archiveForPlace(row),
  })),
};
await writeFile(path.join(WORK_DIR, "release.json"), `${JSON.stringify(release, null, 2)}\n`);
console.log(
  `Exported ${rows.length} places (${JSON.stringify(byKind)}) as release ${release.version}.`,
);
