// Extract metropolitan Italy (mainland + Sicily + Sardinia) from Natural
// Earth 1:50m admin-0 countries into raw + normalized repo artifacts, then
// (second mode) emit the boundary migration SQL with artifact URLs pinned to
// a commit. Mirrors scripts/wine-map-tiles/extract-france-ne.mjs. Unlike
// France, Italy has no prior boundary in the database, so the emitted
// migration inserts a DRAFT, non-current boundary and does not retire
// anything; a later flip migration promotes it.
// Usage: node scripts/wine-map-tiles/extract-italy-ne.mjs extract <ne_geojson>
//        node scripts/wine-map-tiles/extract-italy-ne.mjs sql <commit_sha>
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const RAW_PATH = "data/wine-map/italy-ne50m-raw.geojson";
const NORM_PATH = "data/wine-map/italy-mainland-ne50m.geojson";
const MIGRATION_PATH =
  "supabase/migrations/20260829268500_italy_boundary_natural_earth.sql";
const BOX = { minLon: 6.5, minLat: 36.5, maxLon: 18.6, maxLat: 47.2 };

const sha256 = (buf) =>
  createHash("sha256").update(buf).digest("hex").toUpperCase();

const mode = process.argv[2];

if (mode === "extract") {
  const collection = JSON.parse(await readFile(process.argv[3], "utf8"));
  // NE quirk: mirror France script's use of the stable ADM0_A3 code.
  const italy = collection.features.find(
    (f) => f.properties?.ADM0_A3 === "ITA",
  );
  if (!italy) throw new Error("Italy (ADM0_A3=ITA) not found");

  const inBox = ([lon, lat]) =>
    lon >= BOX.minLon && lon <= BOX.maxLon && lat >= BOX.minLat && lat <= BOX.maxLat;
  const polygons =
    italy.geometry.type === "Polygon"
      ? [italy.geometry.coordinates]
      : italy.geometry.coordinates;
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
  await writeFile(RAW_PATH, `${JSON.stringify(italy)}\n`);
  const normalized = {
    type: "Feature",
    properties: {
      source: "Natural Earth 1:50m admin_0_countries ADM0_A3=ITA",
      filter: "components fully inside lon [6.5,18.6], lat [36.5,47.2]",
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

  const sql = `-- Italy display boundary (DRAFT): mainland + Sicily + Sardinia from
-- Natural Earth 1:50m admin-0 countries (public domain). Italy has no prior
-- boundary, so this lands as DRAFT / not current; a later flip migration
-- promotes it once reviewed. Raw and normalized artifacts are retained
-- in-repo and pinned by commit.
begin;

insert into wine_boundary_sources (
  source_namespace, source_feature_id, authority, jurisdiction
) values (
  'NATURAL_EARTH', 'ne_50m_admin_0_countries:ITA', 'Natural Earth', 'Italy'
)
on conflict (source_namespace, source_feature_id)
do update set authority = excluded.authority
returning id;

insert into wine_boundary_source_snapshots (
  source_id, source_revision, retrieved_at, source_url, licence,
  raw_snapshot_uri, raw_checksum_sha256, normalized_artifact_uri,
  normalized_checksum_sha256, provenance_note, importer_version
)
select
  source.id, 'master-2026-08-10', '2026-08-10 00:00:00+00',
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson',
  'Public domain (Natural Earth)',
  '${pin(RAW_PATH)}',
  '${sha256(rawBuf)}',
  '${pin(NORM_PATH)}',
  '${sha256(normBuf)}',
  'Raw artifact is the unmodified Natural Earth Italy feature; normalized artifact filters to components fully inside lon [6.5,18.6], lat [36.5,47.2] (mainland + Sicily + Sardinia, dropping far-south islets) and rounds to 4 decimals.',
  'scripts/wine-map-tiles/extract-italy-ne.mjs@${commit.slice(0, 7)}'
from wine_boundary_sources source
where source.source_namespace = 'NATURAL_EARTH'
  and source.source_feature_id = 'ne_50m_admin_0_countries:ITA';

do $$
declare
  v_place_id uuid;
  v_snapshot_id uuid;
  v_geom extensions.geometry;
  v_existing int;
  v_draft_count int;
begin
  select id into v_place_id from wine_places where canonical_key = 'italy';
  if v_place_id is null then raise exception 'italy place missing'; end if;

  select snapshot.id into v_snapshot_id
  from wine_boundary_source_snapshots snapshot
  join wine_boundary_sources source on source.id = snapshot.source_id
  where source.source_namespace = 'NATURAL_EARTH'
    and source.source_feature_id = 'ne_50m_admin_0_countries:ITA';
  if v_snapshot_id is null then raise exception 'natural earth snapshot missing'; end if;

  v_geom := extensions.ST_Multi(extensions.ST_SetSRID(
    extensions.ST_GeomFromGeoJSON('${geometryJson}'), 4326));
  if not extensions.ST_IsValid(v_geom) then
    raise exception 'italy geometry is invalid';
  end if;
  if extensions.ST_XMin(extensions.Box3D(v_geom)) < 6.5
     or extensions.ST_YMin(extensions.Box3D(v_geom)) < 36.5
     or extensions.ST_XMax(extensions.Box3D(v_geom)) > 18.6
     or extensions.ST_YMax(extensions.Box3D(v_geom)) > 47.2 then
    raise exception 'italy geometry exceeds the metropolitan display window';
  end if;

  select count(*) into v_existing
  from wine_place_boundaries
  where wine_place_id = v_place_id;
  if v_existing <> 0 then
    raise exception 'expected no existing italy boundary, found %', v_existing;
  end if;

  insert into wine_place_boundaries (
    wine_place_id, source_snapshot_id, boundary_method, quality_status,
    display_geometry, label_point, bbox, source_feature_refs,
    generation_parameters, revision, is_current, reviewed_at
  ) values (
    v_place_id, v_snapshot_id, 'MANUAL', 'DRAFT',
    v_geom,
    extensions.ST_PointOnSurface(v_geom),
    array[
      extensions.ST_XMin(extensions.Box3D(v_geom)),
      extensions.ST_YMin(extensions.Box3D(v_geom)),
      extensions.ST_XMax(extensions.Box3D(v_geom)),
      extensions.ST_YMax(extensions.Box3D(v_geom))
    ]::double precision[],
    jsonb_build_object('adm0_a3', 'ITA', 'dataset', 'ne_50m_admin_0_countries'),
    jsonb_build_object(
      'component_filter', 'outer ring fully inside lon [6.5,18.6], lat [36.5,47.2]',
      'coordinate_precision', 4
    ),
    '20260829268500', false, null
  );

  select count(*) into v_draft_count
  from wine_place_boundaries
  where wine_place_id = v_place_id and quality_status = 'DRAFT';
  if v_draft_count <> 1 then
    raise exception 'expected exactly 1 draft italy boundary, got %', v_draft_count;
  end if;
end;
$$;

commit;
`;
  await writeFile(MIGRATION_PATH, sql);
  console.log("WROTE", MIGRATION_PATH, sha256(Buffer.from(sql)).slice(0, 12));
} else {
  throw new Error("mode must be extract|sql");
}
