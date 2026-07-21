// Extract metropolitan France + Corsica from Natural Earth 1:50m admin-0
// countries into raw + normalized repo artifacts, then (second mode) emit
// the boundary migration SQL with artifact URLs pinned to a commit. This is
// the tool behind supabase/migrations/20260731090000_france_boundary_natural_earth.sql
// (the applied snapshot's importer_version references the scratch copy of
// this same content).
// Usage: node scripts/wine-map-tiles/extract-france-ne.mjs extract <ne_geojson>
//        node scripts/wine-map-tiles/extract-france-ne.mjs sql <commit_sha>
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const RAW_PATH = "data/wine-map/france-ne50m-raw.geojson";
const NORM_PATH = "data/wine-map/france-mainland-ne50m.geojson";
const MIGRATION_PATH =
  "supabase/migrations/20260731090000_france_boundary_natural_earth.sql";
const BOX = { minLon: -6, minLat: 41, maxLon: 11, maxLat: 52 };

const sha256 = (buf) =>
  createHash("sha256").update(buf).digest("hex").toUpperCase();

const mode = process.argv[2];

if (mode === "extract") {
  const collection = JSON.parse(await readFile(process.argv[3], "utf8"));
  // NE quirk: France's ISO_A3 is "-99" in several releases; ADM0_A3 is stable.
  const france = collection.features.find(
    (f) => f.properties?.ADM0_A3 === "FRA",
  );
  if (!france) throw new Error("France (ADM0_A3=FRA) not found");

  const inBox = ([lon, lat]) =>
    lon >= BOX.minLon && lon <= BOX.maxLon && lat >= BOX.minLat && lat <= BOX.maxLat;
  const polygons =
    france.geometry.type === "Polygon"
      ? [france.geometry.coordinates]
      : france.geometry.coordinates;
  const kept = polygons.filter((poly) => poly[0].every(inBox));

  const round = (n) => Math.round(n * 1e4) / 1e4;
  const cleanRing = (ring) => {
    const out = [];
    for (const [lon, lat] of ring) {
      const p = [round(lon), round(lat)];
      const prev = out[out.length - 1];
      if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
    }
    const [first] = out;
    const last = out[out.length - 1];
    if (first && (first[0] !== last[0] || first[1] !== last[1])) out.push([...first]);
    return out;
  };
  const cleaned = kept
    .map((poly) => poly.map(cleanRing).filter((ring) => ring.length >= 4))
    .filter((poly) => poly.length > 0);

  await mkdir("data/wine-map", { recursive: true });
  await writeFile(RAW_PATH, `${JSON.stringify(france)}\n`);
  const normalized = {
    type: "Feature",
    properties: {
      source: "Natural Earth 1:50m admin_0_countries ADM0_A3=FRA",
      filter: "components fully inside lon [-6,11], lat [41,52]",
      precision: 4,
    },
    geometry: { type: "MultiPolygon", coordinates: cleaned },
  };
  await writeFile(NORM_PATH, `${JSON.stringify(normalized)}\n`);

  const points = cleaned.flat(2).length;
  console.log("COMPONENTS total=" + polygons.length + " kept=" + cleaned.length);
  console.log("POINTS", points);
  console.log("RAW-SHA256", sha256(await readFile(RAW_PATH)));
  console.log("NORM-SHA256", sha256(await readFile(NORM_PATH)));
} else if (mode === "sql") {
  const commit = process.argv[3];
  if (!/^[0-9a-f]{40}$/.test(commit ?? "")) throw new Error("full commit sha required");
  const rawBuf = await readFile(RAW_PATH);
  const normBuf = await readFile(NORM_PATH);
  const normalized = JSON.parse(normBuf.toString("utf8"));
  const geometryJson = JSON.stringify(normalized.geometry);
  const pin = (path) =>
    `https://raw.githubusercontent.com/christianolin/blindtastingapp/${commit}/${path}`;

  const sql = `-- France display boundary v2: metropolitan France + Corsica from Natural
-- Earth 1:50m admin-0 countries (public domain), replacing the hand-traced
-- 20-point outline that spilled into the Atlantic and Switzerland. Raw and
-- normalized artifacts are retained in-repo and pinned by commit.
insert into wine_boundary_sources (
  source_namespace, source_feature_id, authority, jurisdiction
) values (
  'NATURAL_EARTH', 'ne_50m_admin_0_countries:FRA', 'Natural Earth', 'France'
);

insert into wine_boundary_source_snapshots (
  source_id, source_revision, retrieved_at, source_url, licence,
  raw_snapshot_uri, raw_checksum_sha256, normalized_artifact_uri,
  normalized_checksum_sha256, provenance_note, importer_version
)
select
  source.id, 'master-2026-07-21', '2026-07-21 00:00:00+00',
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson',
  'Public domain (Made with Natural Earth)',
  '${pin(RAW_PATH)}',
  '${sha256(rawBuf)}',
  '${pin(NORM_PATH)}',
  '${sha256(normBuf)}',
  'Raw artifact is the unmodified Natural Earth France feature; normalized artifact filters to metropolitan + Corsica components and rounds to 4 decimals.',
  '.superpowers/sdd/extract-france-ne.mjs@${commit.slice(0, 7)}'
from wine_boundary_sources source
where source.source_namespace = 'NATURAL_EARTH'
  and source.source_feature_id = 'ne_50m_admin_0_countries:FRA';

do $$
declare
  v_place_id uuid;
  v_snapshot_id uuid;
  v_geom extensions.geometry;
  v_retired int;
begin
  select id into v_place_id from wine_places where canonical_key = 'france';
  if v_place_id is null then raise exception 'france place missing'; end if;

  select snapshot.id into v_snapshot_id
  from wine_boundary_source_snapshots snapshot
  join wine_boundary_sources source on source.id = snapshot.source_id
  where source.source_namespace = 'NATURAL_EARTH'
    and source.source_feature_id = 'ne_50m_admin_0_countries:FRA';
  if v_snapshot_id is null then raise exception 'natural earth snapshot missing'; end if;

  v_geom := extensions.ST_Multi(extensions.ST_SetSRID(
    extensions.ST_GeomFromGeoJSON('${geometryJson}'), 4326));
  if not extensions.ST_IsValid(v_geom) then
    raise exception 'france geometry is invalid';
  end if;
  if extensions.ST_XMin(extensions.Box3D(v_geom)) < -6
     or extensions.ST_YMin(extensions.Box3D(v_geom)) < 41
     or extensions.ST_XMax(extensions.Box3D(v_geom)) > 11
     or extensions.ST_YMax(extensions.Box3D(v_geom)) > 52 then
    raise exception 'france geometry exceeds the metropolitan display window';
  end if;

  update wine_place_boundaries
  set is_current = false
  where wine_place_id = v_place_id and is_current;
  get diagnostics v_retired = row_count;
  if v_retired <> 1 then
    raise exception 'expected to retire exactly 1 current france boundary, got %', v_retired;
  end if;

  insert into wine_place_boundaries (
    wine_place_id, source_snapshot_id, boundary_method, quality_status,
    display_geometry, label_point, bbox, source_feature_refs,
    generation_parameters, revision, is_current, reviewed_at
  ) values (
    v_place_id, v_snapshot_id, 'MANUAL', 'VALIDATED',
    v_geom,
    extensions.ST_PointOnSurface(v_geom),
    array[
      extensions.ST_XMin(extensions.Box3D(v_geom)),
      extensions.ST_YMin(extensions.Box3D(v_geom)),
      extensions.ST_XMax(extensions.Box3D(v_geom)),
      extensions.ST_YMax(extensions.Box3D(v_geom))
    ]::double precision[],
    jsonb_build_object('adm0_a3', 'FRA', 'dataset', 'ne_50m_admin_0_countries'),
    jsonb_build_object(
      'component_filter', 'outer ring fully inside lon [-6,11], lat [41,52]',
      'coordinate_precision', 4
    ),
    '20260731090000', true, now()
  );
end;
$$;
`;
  await writeFile(MIGRATION_PATH, sql);
  console.log("WROTE", MIGRATION_PATH, sha256(Buffer.from(sql)).slice(0, 12));
} else {
  throw new Error("mode must be extract|sql");
}
