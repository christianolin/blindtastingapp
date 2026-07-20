// Export stage: reads the 14 verified places + current validated boundaries
// from Supabase and writes tippecanoe-ready GeoJSON plus release.json into
// .tiles-build/. Fail-closed: aborts on any count or shape mismatch.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {
  EXPECTED_PLACES,
  WORK_DIR,
  WORLD_KEYS,
  featureCollection,
  labelFeature,
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
    extensions.ST_Y(b.label_point) as label_lat
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
  assert.equal(verified.rows[0].count, EXPECTED_PLACES, "verified place count drifted");
  ({ rows } = await client.query(EXPORT_SQL));
} finally {
  await client.end();
}

assert.equal(rows.length, EXPECTED_PLACES, `expected ${EXPECTED_PLACES} exportable places, got ${rows.length}`);
assert.equal(new Set(rows.map(({ id }) => id)).size, EXPECTED_PLACES, "duplicate place ids");
for (const row of rows) {
  const geometry = JSON.parse(row.geometry);
  assert.equal(geometry.type, "MultiPolygon", `${row.canonical_key}: unexpected geometry type`);
  assert.equal(JSON.parse(row.label_point).type, "Point", `${row.canonical_key}: unexpected label type`);
}

const worldRows = rows.filter(({ canonical_key }) => WORLD_KEYS.includes(canonical_key));
const franceRows = rows.filter(({ canonical_key }) => canonical_key !== "france");
assert.equal(worldRows.length, 2, "world archive must contain France + Bordeaux");
assert.equal(franceRows.length, 13, "france shard must contain Bordeaux + 12 appellations");

await mkdir(WORK_DIR, { recursive: true });
const outputs = [
  ["world-places.geojson", featureCollection(worldRows.map(placeFeature))],
  ["world-labels.geojson", featureCollection(worldRows.map(labelFeature))],
  ["france-places.geojson", featureCollection(franceRows.map(placeFeature))],
  ["france-labels.geojson", featureCollection(franceRows.map(labelFeature))],
];
for (const [filename, collection] of outputs) {
  await writeFile(path.join(WORK_DIR, filename), `${JSON.stringify(collection)}\n`);
}

const byKind = {};
for (const { kind } of rows) byKind[kind] = (byKind[kind] ?? 0) + 1;
const release = {
  version: releaseVersion(),
  generated_at: new Date().toISOString(),
  git_sha: process.env.GITHUB_SHA ?? null,
  node: process.version,
  counts: { places: rows.length, labels: rows.length, by_kind: byKind },
  expected: rows.map((row) => ({
    id: row.id,
    key: row.canonical_key,
    tier: row.display_tier,
    parent_id: row.primary_parent_id,
    label_lon: Number(row.label_lon),
    label_lat: Number(row.label_lat),
    archive:
      row.canonical_key === "france"
        ? "world"
        : row.canonical_key === "france.bordeaux"
          ? "both"
          : "france",
  })),
};
await writeFile(path.join(WORK_DIR, "release.json"), `${JSON.stringify(release, null, 2)}\n`);
console.log(
  `Exported ${rows.length} places (${JSON.stringify(byKind)}) as release ${release.version}.`,
);
