// Extract peninsular Spain + the Balearic Islands from Natural Earth 1:50m
// admin-0 countries into raw + normalized repo artifacts, then (second mode)
// emit the country-base migration SQL with artifact URLs pinned to a commit.
// Mirrors scripts/wine-map-tiles/extract-italy-ne.mjs, with two differences:
//  - the Canary Islands are deliberately dropped (owner decision) via the
//    display window, which also excludes them from the map viewport later;
//  - Spain has neither a place row nor a boundary yet, so the emitted SQL is a
//    SINGLE combined migration that creates the `spain` COUNTRY (tier 0) place
//    AND its boundary, landing both live (VERIFIED place / current-VALIDATED
//    boundary) — the owner waived the shape-review gate for the Spain run and
//    this is the same trusted public-domain source as France/Italy.
// Usage: node scripts/wine-map-tiles/extract-spain-ne.mjs extract <ne_geojson>
//        node scripts/wine-map-tiles/extract-spain-ne.mjs sql <commit_sha>
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const RAW_PATH = "data/wine-map/spain-ne50m-raw.geojson";
const NORM_PATH = "data/wine-map/spain-mainland-ne50m.geojson";
// Spain lives in its own 20260901xxxxxx migration block, deliberately clear of
// the collaborator's live Italy sequence (which is actively marching up the
// 20260829xxxxxx range — Piemonte, Toscana, Trentino-Alto-Adige, Veneto and
// counting), so the two efforts never race the same migration slot.
const MIGRATION_PATH =
  "supabase/migrations/20260901090000_spain_country_base.sql";
// Peninsula + Balearics only. Peninsula bbox is [-9.24,36.03,3.31,43.77] and
// the four Balearic components sit at lon 1.2..4.32 / lat 38.6..40.08; every
// Canary component is west of -13, so this window keeps 5 components and drops
// all 7 Canary ones.
const BOX = { minLon: -10, minLat: 35, maxLon: 5, maxLat: 44 };

const sha256 = (buf) =>
  createHash("sha256").update(buf).digest("hex").toUpperCase();

const mode = process.argv[2];

if (mode === "extract") {
  const collection = JSON.parse(await readFile(process.argv[3], "utf8"));
  // NE quirk: mirror the France/Italy scripts' use of the stable ADM0_A3 code.
  const spain = collection.features.find(
    (f) => f.properties?.ADM0_A3 === "ESP",
  );
  if (!spain) throw new Error("Spain (ADM0_A3=ESP) not found");

  const inBox = ([lon, lat]) =>
    lon >= BOX.minLon && lon <= BOX.maxLon && lat >= BOX.minLat && lat <= BOX.maxLat;
  const polygons =
    spain.geometry.type === "Polygon"
      ? [spain.geometry.coordinates]
      : spain.geometry.coordinates;
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
  await writeFile(RAW_PATH, `${JSON.stringify(spain)}\n`);
  const normalized = {
    type: "Feature",
    properties: {
      source: "Natural Earth 1:50m admin_0_countries ADM0_A3=ESP",
      filter: "components fully inside lon [-10,5], lat [35,44]",
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

  const sql = `-- Spain country base: the \`spain\` COUNTRY (tier 0) place + its display
-- boundary — peninsular Spain + the Balearic Islands — from Natural Earth
-- 1:50m admin-0 countries (public domain). The Canary Islands are out of scope
-- (owner decision) and are excluded from both the geometry and the display
-- window. Single migration, no DRAFT/flip: the outline is the same trusted
-- public-domain source as France and Italy and the owner waived the
-- shape-review gate for the Spain run, so the place lands VERIFIED and the
-- boundary current-VALIDATED in one transaction. Raw + normalized artifacts are
-- retained in-repo and pinned by commit.
begin;

-- spain (COUNTRY, tier 0). min_zoom/label_min_zoom follow the france/italy
-- country convention (1.5 / 2); endonym name, matching 'Italia'. Lands VERIFIED
-- (country keys never rename, so locking the canonical key immediately is safe).
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, publication_status, sort_order
) values (
  'spain', 'spain', 'España', 'COUNTRY', 0, 1.5, 2,
  false, 'VERIFIED', 110
);

insert into wine_boundary_sources (
  source_namespace, source_feature_id, authority, jurisdiction
) values (
  'NATURAL_EARTH', 'ne_50m_admin_0_countries:ESP', 'Natural Earth', 'Spain'
)
on conflict (source_namespace, source_feature_id)
do update set authority = excluded.authority;

insert into wine_boundary_source_snapshots (
  source_id, source_revision, retrieved_at, source_url, licence,
  raw_snapshot_uri, raw_checksum_sha256, normalized_artifact_uri,
  normalized_checksum_sha256, provenance_note, importer_version
)
select
  source.id, 'master-2026-08-14', '2026-08-14 00:00:00+00',
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson',
  'Public domain (Natural Earth)',
  '${pin(RAW_PATH)}',
  '${sha256(rawBuf)}',
  '${pin(NORM_PATH)}',
  '${sha256(normBuf)}',
  'Raw artifact is the unmodified Natural Earth Spain feature; normalized artifact filters to components fully inside lon [-10,5], lat [35,44] (peninsular Spain + Balearic Islands, excluding the Canary Islands) and rounds to 4 decimals.',
  'scripts/wine-map-tiles/extract-spain-ne.mjs@${commit.slice(0, 7)}'
from wine_boundary_sources source
where source.source_namespace = 'NATURAL_EARTH'
  and source.source_feature_id = 'ne_50m_admin_0_countries:ESP';

do $$
declare
  v_place_id uuid;
  v_snapshot_id uuid;
  v_geom extensions.geometry;
  v_existing int;
  v_current int;
begin
  select id into v_place_id from wine_places where canonical_key = 'spain';
  if v_place_id is null then raise exception 'spain place missing'; end if;

  select snapshot.id into v_snapshot_id
  from wine_boundary_source_snapshots snapshot
  join wine_boundary_sources source on source.id = snapshot.source_id
  where source.source_namespace = 'NATURAL_EARTH'
    and source.source_feature_id = 'ne_50m_admin_0_countries:ESP';
  if v_snapshot_id is null then raise exception 'natural earth snapshot missing'; end if;

  v_geom := extensions.ST_Multi(extensions.ST_SetSRID(
    extensions.ST_GeomFromGeoJSON('${geometryJson}'), 4326));
  if not extensions.ST_IsValid(v_geom) then
    raise exception 'spain geometry is invalid';
  end if;
  if extensions.ST_XMin(extensions.Box3D(v_geom)) < -10
     or extensions.ST_YMin(extensions.Box3D(v_geom)) < 35
     or extensions.ST_XMax(extensions.Box3D(v_geom)) > 5
     or extensions.ST_YMax(extensions.Box3D(v_geom)) > 44 then
    raise exception 'spain geometry exceeds the peninsula+balearics display window';
  end if;

  select count(*) into v_existing
  from wine_place_boundaries
  where wine_place_id = v_place_id;
  if v_existing <> 0 then
    raise exception 'expected no existing spain boundary, found %', v_existing;
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
    jsonb_build_object('adm0_a3', 'ESP', 'dataset', 'ne_50m_admin_0_countries'),
    jsonb_build_object(
      'component_filter', 'outer ring fully inside lon [-10,5], lat [35,44]',
      'coordinate_precision', 4
    ),
    '20260901090000', true, now()
  );

  select count(*) into v_current
  from wine_place_boundaries
  where wine_place_id = v_place_id and is_current and quality_status = 'VALIDATED';
  if v_current <> 1 then
    raise exception 'expected exactly 1 current validated spain boundary, got %', v_current;
  end if;
end;
$$;

-- Same-transaction final assertions (never trust "version recorded").
do $$
declare v_place int; v_verified int;
begin
  select count(*) into v_place from wine_places where canonical_key = 'spain';
  if v_place <> 1 then raise exception 'expected 1 spain place, got %', v_place; end if;
  select count(*) into v_verified from wine_places
   where canonical_key = 'spain' and publication_status = 'VERIFIED'
     and canonical_key_locked_at is not null;
  if v_verified <> 1 then raise exception 'spain place is not locked/VERIFIED'; end if;
end;
$$;

commit;
`;
  await writeFile(MIGRATION_PATH, sql);
  console.log("WROTE", MIGRATION_PATH, sha256(Buffer.from(sql)).slice(0, 12));
} else {
  throw new Error("mode must be extract|sql");
}
