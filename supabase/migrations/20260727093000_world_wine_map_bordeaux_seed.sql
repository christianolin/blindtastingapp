create temporary table world_wine_expected_nodes (
  slug text primary key,
  parent_slug text,
  level text not null,
  canonical_key text not null unique,
  source_namespace text not null,
  source_feature_id text not null unique,
  boundary_method wine_boundary_method not null
) on commit drop;

insert into world_wine_expected_nodes values
  ('france', null, 'COUNTRY', 'france', 'BLINDR_MANUAL',
   'legacy-20260724-france-mainland', 'MANUAL'),
  ('bordeaux', 'france', 'REGION', 'france.bordeaux',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-bordeaux',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('medoc', 'bordeaux', 'APPELLATION', 'france.bordeaux.medoc',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-medoc',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('haut-medoc', 'bordeaux', 'APPELLATION', 'france.bordeaux.haut-medoc',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-haut-medoc',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('margaux', 'haut-medoc', 'APPELLATION',
   'france.bordeaux.haut-medoc.margaux', 'IGN_INAO_AOC_VITICOLES_LEGACY',
   'legacy-20260726-margaux', 'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('pauillac', 'haut-medoc', 'APPELLATION',
   'france.bordeaux.haut-medoc.pauillac', 'IGN_INAO_AOC_VITICOLES_LEGACY',
   'legacy-20260726-pauillac', 'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('saint-julien', 'haut-medoc', 'APPELLATION',
   'france.bordeaux.haut-medoc.saint-julien',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-saint-julien',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('saint-estephe', 'haut-medoc', 'APPELLATION',
   'france.bordeaux.haut-medoc.saint-estephe',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-saint-estephe',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('pessac-leognan', 'bordeaux', 'APPELLATION',
   'france.bordeaux.pessac-leognan', 'IGN_INAO_AOC_VITICOLES_LEGACY',
   'legacy-20260726-pessac-leognan', 'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('graves', 'bordeaux', 'APPELLATION', 'france.bordeaux.graves',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-graves',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('saint-emilion', 'bordeaux', 'APPELLATION',
   'france.bordeaux.saint-emilion', 'IGN_INAO_AOC_VITICOLES_LEGACY',
   'legacy-20260726-saint-emilion', 'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('pomerol', 'bordeaux', 'APPELLATION', 'france.bordeaux.pomerol',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-pomerol',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('sauternes', 'bordeaux', 'APPELLATION', 'france.bordeaux.sauternes',
   'IGN_INAO_AOC_VITICOLES_LEGACY', 'legacy-20260726-sauternes',
   'GENERALIZED_FROM_OFFICIAL_SOURCE'),
  ('barsac', 'sauternes', 'APPELLATION',
   'france.bordeaux.sauternes.barsac', 'IGN_INAO_AOC_VITICOLES_LEGACY',
   'legacy-20260726-barsac', 'GENERALIZED_FROM_OFFICIAL_SOURCE');

do $$
begin
  if (select count(*) from wine_map_nodes) <> 14 then
    raise exception 'expected exactly 14 legacy wine map nodes';
  end if;

  if exists (
    select 1
    from world_wine_expected_nodes expected
    full join wine_map_nodes node on node.slug = expected.slug
    where expected.slug is null or node.id is null
  ) then
    raise exception 'legacy wine map slug set differs from the expected 14';
  end if;

  if exists (
    select 1
    from world_wine_expected_nodes expected
    join wine_map_nodes node on node.slug = expected.slug
    left join wine_map_nodes parent on parent.id = node.parent_id
    where node.level::text <> expected.level
       or parent.slug is distinct from expected.parent_slug
       or node.boundary_geojson is null
  ) then
    raise exception 'legacy wine map hierarchy, level, or geometry differs from the reviewed source set';
  end if;
end;
$$;

create temporary table world_wine_map_seed on commit drop as
with recursive map_tree as (
  select node.*, expected.canonical_key, 0 depth
  from world_wine_expected_nodes expected
  join wine_map_nodes node on node.slug = expected.slug
  where expected.parent_slug is null

  union all

  select node.*, expected.canonical_key, parent.depth + 1
  from map_tree parent
  join world_wine_expected_nodes expected on expected.parent_slug = parent.slug
  join wine_map_nodes node
    on node.slug = expected.slug and node.parent_id = parent.id
)
select * from map_tree;

do $$
begin
  if (select count(*) from world_wine_map_seed) <> 14 then
    raise exception 'expected the reviewed legacy tree to contain 14 connected nodes';
  end if;
end;
$$;

do $$
declare
  v_depth int;
  v_max_depth int;
begin
  select max(depth) into v_max_depth from world_wine_map_seed;
  for v_depth in 0..v_max_depth loop
    insert into wine_places (
      id, primary_parent_id, kind, canonical_key, name, slug, display_tier,
      min_zoom, label_min_zoom, publication_status, sort_order, created_at,
      updated_at
    )
    select
      id,
      parent_id,
      level::text::wine_place_kind,
      canonical_key,
      name,
      slug,
      depth::smallint,
      case depth when 0 then 1.5 when 1 then 4 when 2 then 7 else 9 end,
      case depth when 0 then 2 when 1 then 4 when 2 then 7 else 9 end,
      'VERIFIED',
      sort_order,
      created_at,
      now()
    from world_wine_map_seed
    where depth = v_depth
    order by sort_order, name;
  end loop;
end;
$$;

insert into wine_place_articles (
  wine_place_id, description, climate, grape_varieties, wine_styles, key_facts,
  editorial_status, created_at, updated_at
)
select id, description, climate, grape_varieties, wine_styles, key_facts,
       'PUBLISHED', created_at, now()
from wine_map_nodes;

create temporary table world_wine_boundary_source_seed on commit drop as
select
  expected.slug,
  expected.source_namespace,
  expected.source_feature_id,
  expected.boundary_method,
  case when expected.slug = 'france' then 'Blindr' else 'IGN / INAO' end authority,
  'France'::text jurisdiction,
  case when expected.slug = 'france'
    then null
    else 'https://data.geopf.fr/wfs/ows'
  end source_url,
  case when expected.slug = 'france'
    then 'Blindr project-authored geometry; no external licence'
    else 'Licence Ouverte Etalab'
  end licence,
  case when expected.slug = 'france'
    then '20260724090000'
    else '20260726090000'
  end source_revision,
  null::timestamptz retrieved_at,
  null::text raw_snapshot_uri,
  null::text raw_checksum_sha256,
  case when expected.slug = 'france'
    then 'https://raw.githubusercontent.com/christianolin/blindtastingapp/1a2b3dd6d3898d0d02872d4eb8ceb8078f1da5c7/supabase/migrations/20260724090000_wine_map_real_boundaries.sql'
    else 'https://raw.githubusercontent.com/christianolin/blindtastingapp/1a2b3dd6d3898d0d02872d4eb8ceb8078f1da5c7/supabase/migrations/20260726090000_wine_map_inao_boundaries.sql'
  end normalized_artifact_uri,
  case when expected.slug = 'france'
    then 'C5196565DFB93ABD68F5C398717440C142FCE621A773CABE6CEAEF7BEE9A0D50'
    else 'B197FB23F8D784E77B72BDBE599AFAC6C822DA06423CFBD1EA501E3340833177'
  end normalized_checksum_sha256,
  case when expected.slug = 'france'
    then 'Project-authored manual outline; no external raw response or parcel features apply. The pinned Git migration is the original retained artifact.'
    else 'The original raw WFS response, retrieval timestamp, and parcel feature IDs were not retained; the normalized Git blob is the earliest immutable artifact.'
  end provenance_note,
  case when expected.slug = 'france'
    then 'manual-v1'
    else 'legacy-wfs-import-unversioned'
  end importer_version
from world_wine_expected_nodes expected;

insert into wine_boundary_sources (
  source_namespace, source_feature_id, authority, jurisdiction
)
select source_namespace, source_feature_id, authority, jurisdiction
from world_wine_boundary_source_seed;

insert into wine_boundary_source_snapshots (
  source_id, source_revision, retrieved_at, source_url, licence,
  raw_snapshot_uri, raw_checksum_sha256, normalized_artifact_uri,
  normalized_checksum_sha256, provenance_note, importer_version
)
select source.id, seed.source_revision, seed.retrieved_at, seed.source_url,
       seed.licence, seed.raw_snapshot_uri, seed.raw_checksum_sha256,
       seed.normalized_artifact_uri, seed.normalized_checksum_sha256,
       seed.provenance_note, seed.importer_version
from world_wine_boundary_source_seed seed
join wine_boundary_sources source
  on source.source_namespace = seed.source_namespace
 and source.source_feature_id = seed.source_feature_id;

with converted as (
  select
    n.*,
    extensions.ST_Multi(
      extensions.ST_SetSRID(
        extensions.ST_GeomFromGeoJSON(n.boundary_geojson::text),
        4326
      )
    )::extensions.geometry(MultiPolygon, 4326) geom
  from wine_map_nodes n
  where n.boundary_geojson is not null
), prepared as (
  select
    converted.*,
    seed.source_feature_id,
    snapshot.id source_snapshot_id,
    seed.boundary_method method
  from converted
  join world_wine_boundary_source_seed seed on seed.slug = converted.slug
  join wine_boundary_sources source
    on source.source_namespace = seed.source_namespace
   and source.source_feature_id = seed.source_feature_id
  join wine_boundary_source_snapshots snapshot
    on snapshot.source_id = source.id
   and snapshot.source_revision = seed.source_revision
   and snapshot.normalized_checksum_sha256 = seed.normalized_checksum_sha256
)
insert into wine_place_boundaries (
  wine_place_id, source_snapshot_id, boundary_method, quality_status,
  display_geometry, label_point, bbox, source_feature_refs,
  generation_parameters, revision, is_current, reviewed_at
)
select
  id,
  source_snapshot_id,
  method,
  'VALIDATED',
  geom,
  extensions.ST_PointOnSurface(geom),
  array[
    extensions.ST_XMin(extensions.Box3D(geom)),
    extensions.ST_YMin(extensions.Box3D(geom)),
    extensions.ST_XMax(extensions.Box3D(geom)),
    extensions.ST_YMax(extensions.Box3D(geom))
  ]::double precision[],
  jsonb_build_object(
    'wine_map_slug', slug,
    'legacy_internal_source_id', source_feature_id,
    'source_layer', case when slug = 'france' then null else 'AOC-VITICOLES:aire_parcellaire' end,
    'underlying_parcel_ids_retained', case when slug = 'france' then null else false end,
    'legacy_provenance_note', case when slug = 'france'
      then 'Project-authored manual outline; no external raw response or parcel features apply. The pinned Git migration is the original retained artifact.'
      else 'The original raw WFS response, retrieval timestamp, and parcel feature IDs were not retained; the normalized Git blob is the earliest immutable artifact.'
    end
  ),
  jsonb_build_object(
    'display_migration', case
      when slug = 'france' then '20260724090000_wine_map_real_boundaries.sql'
      else '20260726100000_wine_map_concave_boundaries.sql'
    end,
    'display_migration_sha256', case
      when slug = 'france' then 'C5196565DFB93ABD68F5C398717440C142FCE621A773CABE6CEAEF7BEE9A0D50'
      else '0DBC8A73D62C709745AAE739E0DE3FD31A67714B8EFC2C0EA1FF99A21624F0B6'
    end,
    'generator', case when slug = 'france'
      then null
      else 'scripts/generate-wine-map-concave-boundaries.mjs@1a2b3dd6d3898d0d02872d4eb8ceb8078f1da5c7'
    end,
    'concaveman_version', case when slug = 'france' then null else '2.0.0' end,
    'concavity', case when slug = 'france' then null else 2 end,
    'edge_threshold_divisor', case when slug = 'france' then null else 30 end,
    'coordinate_precision', case when slug = 'france' then null else 4 end,
    'max_edge_diagonal_share', case when slug = 'france' then null else 0.2 end,
    'min_component_area_share', case when slug = 'france' then null else 0.02 end
  ),
  case when slug = 'france' then '20260724090000' else '20260726100000' end,
  true,
  now()
from prepared;

do $$
begin
  if (select count(*) from wine_places) <> 14
     or (select count(*) from wine_place_articles) <> 14
     or (select count(*) from wine_boundary_sources) <> 14
     or (select count(*) from wine_boundary_source_snapshots) <> 14
     or (select count(*) from wine_place_boundaries) <> 14 then
    raise exception 'legacy catalog migration did not create exactly 14 rows in every required table';
  end if;

  if exists (
    select 1
    from world_wine_expected_nodes expected
    join wine_map_nodes node on node.slug = expected.slug
    left join wine_places place on place.canonical_key = expected.canonical_key
    left join wine_place_articles article on article.wine_place_id = place.id
    left join wine_boundary_sources source
      on source.source_namespace = expected.source_namespace
     and source.source_feature_id = expected.source_feature_id
    left join wine_boundary_source_snapshots snapshot
      on snapshot.source_id = source.id
    left join wine_place_boundaries boundary
      on boundary.wine_place_id = place.id and boundary.is_current
    where place.id is distinct from node.id
       or place.publication_status is distinct from 'VERIFIED'
       or place.canonical_key_locked_at is null
       or article.wine_place_id is null
       or source.id is null
       or snapshot.id is null
       or snapshot.raw_snapshot_uri is not null
       or snapshot.raw_checksum_sha256 is not null
       or snapshot.provenance_note is null
       or boundary.boundary_method is distinct from expected.boundary_method
       or boundary.quality_status is distinct from 'VALIDATED'
       or extensions.ST_Equals(
            boundary.display_geometry,
            extensions.ST_Multi(
              extensions.ST_SetSRID(
                extensions.ST_GeomFromGeoJSON(node.boundary_geojson::text),
                4326
              )
            )
          ) is not true
  ) then
    raise exception 'legacy catalog migration failed per-place parity or provenance checks';
  end if;
end;
$$;

create temporary table world_wine_reference_seed (
  current_name text not null,
  replay_name text not null,
  canonical_key text primary key
) on commit drop;

insert into world_wine_reference_seed values
  ('Barsac AOP', 'Barsac', 'france.bordeaux.sauternes.barsac'),
  ('Graves AOP', 'Graves', 'france.bordeaux.graves'),
  ('Haut-Médoc AOP', 'Haut-Médoc', 'france.bordeaux.haut-medoc'),
  ('Margaux AOP', 'Margaux', 'france.bordeaux.haut-medoc.margaux'),
  ('Médoc AOP', 'Médoc', 'france.bordeaux.medoc'),
  ('Pauillac AOP', 'Pauillac', 'france.bordeaux.haut-medoc.pauillac'),
  ('Pessac-Léognan AOP', 'Pessac-Léognan', 'france.bordeaux.pessac-leognan'),
  ('Pomerol AOP', 'Pomerol', 'france.bordeaux.pomerol'),
  ('Saint-Estèphe AOP', 'Saint-Estèphe', 'france.bordeaux.haut-medoc.saint-estephe'),
  ('Saint-Émilion AOP', 'Saint-Émilion', 'france.bordeaux.saint-emilion'),
  ('Saint-Julien AOP', 'Saint-Julien', 'france.bordeaux.haut-medoc.saint-julien'),
  ('Sauternes AOP', 'Sauternes', 'france.bordeaux.sauternes');

do $$
declare
  v_count int;
begin
  update countries c
  set wine_place_id = p.id,
      map_status = 'VERIFIED',
      map_match_method = 'MIGRATED_EXACT',
      map_match_confidence = 1,
      map_reviewed_at = now(),
      map_review_note = 'Phase 1 canonical migration'
  from wine_places p
  where c.name = 'France' and p.canonical_key = 'france';
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'expected 1 France link, got %', v_count; end if;

  update regions r
  set wine_place_id = p.id,
      map_status = 'VERIFIED',
      map_match_method = 'MIGRATED_EXACT',
      map_match_confidence = 1,
      map_reviewed_at = now(),
      map_review_note = 'Phase 1 canonical migration'
  from countries c, wine_places p
  where r.country_id = c.id and c.name = 'France' and r.name = 'Bordeaux'
    and p.canonical_key = 'france.bordeaux';
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'expected 1 Bordeaux link, got %', v_count; end if;

  select count(*) into v_count
  from world_wine_reference_seed e
  where (
    select count(*)
    from appellations a
    join regions r on r.id = a.region_id
    join countries c on c.id = r.country_id
    where c.name = 'France'
      and r.name = 'Bordeaux'
      and a.name in (e.current_name, e.replay_name)
  ) = 1;
  if v_count <> 12 then
    raise exception 'expected one exact row for each of 12 Bordeaux appellations, got %', v_count;
  end if;

  update appellations a
  set wine_place_id = p.id,
      map_status = 'VERIFIED',
      map_match_method = 'MIGRATED_EXACT',
      map_match_confidence = 1,
      map_reviewed_at = now(),
      map_review_note = 'Phase 1 canonical migration'
  from regions r
  join countries c on c.id = r.country_id
  join world_wine_reference_seed e on true
  join wine_places p on p.canonical_key = e.canonical_key
  where a.region_id = r.id
    and c.name = 'France'
    and r.name = 'Bordeaux'
    and a.name in (e.current_name, e.replay_name);
  get diagnostics v_count = row_count;
  if v_count <> 12 then raise exception 'expected 12 Bordeaux appellation links, got %', v_count; end if;
end;
$$;
