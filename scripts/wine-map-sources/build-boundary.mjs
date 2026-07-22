// Generalize fetched parcels into one region footprint and stage a DRAFT,
// non-current wine_place_boundaries row with full provenance. Two engines:
// "dissolve" (PostGIS union -> closing -> simplify; the default) and
// "concave" (client-side clustered concave envelopes for region-scale sets
// that exceed the free-tier instance's GEOS capacity). Review (a later
// task) flips staged rows current.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import pg from "pg";
import { pgConfig, sha256hex } from "../wine-map-tiles/lib.mjs";
import { rawObjectPath, uploadRawObject, SOURCE_NAMESPACE, WFS_LICENCE } from "./inao-lib.mjs";
import { buildConcaveGeometry } from "./concave-engine.mjs";

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
// Post-MakeValid part filter: ST_MakeValid can split a self-touching hull into
// a dominant part plus tiny slivers that the client-side cluster filter never
// sees. Default 0 keeps every part (grand crus / climats want all of them).
const minPartShare = Number(arg("min-part-share", "0"));
// Pre-union simplification: below the closing buffer and final tolerance,
// so the output shape is unchanged while union cost collapses.
const presimplify = Number(arg("presimplify", "0.0005"));
const engine = arg("engine", "dissolve");
assert.ok(["dissolve", "concave"].includes(engine), "--engine must be dissolve|concave");

const workDir = path.resolve(".tiles-build", "sources");
const parcels = JSON.parse(
  await readFile(path.join(workDir, `${slug}-parcels.geojson`), "utf8"),
);
const fetchManifest = JSON.parse(
  await readFile(path.join(workDir, `${slug}-fetch-manifest.json`), "utf8"),
);
assert.equal(fetchManifest.slug, slug);
assert.equal(fetchManifest.target_key, targetKey);
assert.ok(parcels.features.length > 0, "no parcels to generalize");

// Concave runs entirely client-side before any DB work.
let clientGeojson = null;
if (engine === "concave") {
  const started = Date.now();
  clientGeojson = JSON.stringify(
    buildConcaveGeometry(parcels, { minComponentShare: minShare }),
  );
  console.log(`concave engine done (${Math.round((Date.now() - started) / 1000)}s)`);
}
const generation = clientGeojson
  ? {
      engine: "concave",
      concavity: 2,
      cluster_grid_size: 0.05,
      min_component_area_share: minShare,
      min_part_area_share: minPartShare,
      coordinate_precision: 4,
    }
  : {
      engine: "dissolve",
      closing_buffer: closing,
      simplify_tolerance: tolerance,
      min_component_area_share: minShare,
      min_part_area_share: minPartShare,
      presimplify_tolerance: presimplify,
      coordinate_precision: 4,
    };

const client = new pg.Client(pgConfig());
await client.connect();
try {
  await client.query("begin");
  // set local: transaction-scoped and guaranteed to land on the same pooled
  // backend as the work.
  await client.query("set local statement_timeout = 600000");

  let geojson = clientGeojson;
  if (!geojson) {
    await client.query(
      "create temporary table _parcels (cell text, geom extensions.geometry) on commit drop",
    );
    const batchSize = 200;
    for (let i = 0; i < parcels.features.length; i += batchSize) {
      const batch = parcels.features.slice(i, i + batchSize);
      const values = batch.map((_, j) =>
        `(extensions.ST_SimplifyPreserveTopology(extensions.ST_MakeValid(
            extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($${j + 1}), 4326)
          ), ${presimplify}))`,
      );
      await client.query(
        `insert into _parcels (geom) values ${values.join(", ")}`,
        batch.map((feature) => JSON.stringify(feature.geometry)),
      );
    }
    console.log(`parcels loaded: ${parcels.features.length}`);
    // Bounded dissolve: numeric grid key (floor arithmetic cannot fail to
    // collide), one short union statement per cell, then per super-cell.
    await client.query(
      `update _parcels set cell =
         floor(extensions.ST_X(extensions.ST_Centroid(geom)) / 0.05)::int::text
         || ':' ||
         floor(extensions.ST_Y(extensions.ST_Centroid(geom)) / 0.05)::int::text`,
    );
    const cellKeys = await client.query(
      "select distinct cell from _parcels order by cell",
    );
    console.log(`grid cells: ${cellKeys.rows.length}`);
    assert.ok(
      cellKeys.rows.length <= parcels.features.length / 2 ||
        parcels.features.length < 500,
      `grid clustering ineffective: ${cellKeys.rows.length} cells for ${parcels.features.length} parcels`,
    );
    await client.query(
      "create temporary table _cells (super text, g extensions.geometry) on commit drop",
    );
    const superOf = (cell) => {
      const [x, y] = cell.split(":").map(Number);
      return `${Math.floor(x / 10)}:${Math.floor(y / 10)}`;
    };
    for (const { cell } of cellKeys.rows) {
      await client.query(
        `insert into _cells
         select $2, extensions.ST_SimplifyPreserveTopology(extensions.ST_Union(geom), $3)
         from _parcels where cell = $1`,
        [cell, superOf(cell), presimplify],
      );
    }
    const superKeys = [...new Set(cellKeys.rows.map(({ cell }) => superOf(cell)))];
    console.log(`super cells: ${superKeys.length}`);
    await client.query(
      "create temporary table _supers (g extensions.geometry) on commit drop",
    );
    for (const superKey of superKeys) {
      await client.query(
        `insert into _supers
         select extensions.ST_SimplifyPreserveTopology(extensions.ST_Union(g), $2)
         from _cells where super = $1`,
        [superKey, presimplify],
      );
    }
    const dissolved = await client.query(
      `with u as (select extensions.ST_Union(g) g from _supers),
       closed as (
         select extensions.ST_MakeValid(
           extensions.ST_Buffer(extensions.ST_Buffer(g, $1, 'quad_segs=4'), -$1, 'quad_segs=4')
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
       select extensions.ST_AsGeoJSON(extensions.ST_MakeValid(g), 4) geojson
       from kept`,
      [closing, tolerance, minShare],
    );
    geojson = dissolved.rows[0]?.geojson;
  }
  assert.ok(geojson, "generalization produced no geometry");

  const normalizedFeature = {
    type: "Feature",
    properties: {
      target_key: targetKey,
      members: fetchManifest.members,
      generation,
    },
    geometry: JSON.parse(geojson),
  };
  const normalizedBody = Buffer.from(`${JSON.stringify(normalizedFeature)}\n`);
  const normalizedPath = rawObjectPath(fetchManifest.revision, slug, "normalized.geojson");
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
       select source.id, $4, $5, $6, $7,
              $8, $9, $10, $11,
              'Raw artifacts are the unmodified WFS page responses listed in the fetch manifest.',
              $12
       from source
       returning id
     ),
     valid_geom as (
       -- ST_MakeValid can repair self-touching rings into a collection;
       -- CollectionExtract(…, 3) keeps the polygonal parts only, which is
       -- what the MultiPolygon column requires.
       select extensions.ST_CollectionExtract(
         extensions.ST_MakeValid(
           extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($13), 4326)
         ), 3
       ) g
     ),
     geom_parts as (
       select (extensions.ST_Dump(extensions.ST_Multi(g))).geom part from valid_geom
     ),
     geom_measured as (
       select part, extensions.ST_Area(part) area,
              sum(extensions.ST_Area(part)) over () total
       from geom_parts
     ),
     geom as (
       -- Drop tiny MakeValid slivers below the part-area floor (0 keeps all).
       select extensions.ST_Multi(extensions.ST_Collect(part)) g
       from geom_measured
       where total = 0 or area / total >= $17
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
            $16::jsonb,
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
      JSON.stringify(generation),
      minPartShare,
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
