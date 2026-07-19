create schema if not exists extensions;

do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'postgis';

  if v_schema is not null and v_schema <> 'extensions' then
    raise exception
      'postgis is already installed in schema %, expected extensions; relocate it in a separate reviewed migration',
      v_schema;
  end if;
end;
$$;

create extension if not exists postgis with schema extensions;

create type wine_place_kind as enum (
  'COUNTRY', 'MACRO_REGION', 'REGION', 'SUBREGION',
  'APPELLATION', 'SITE', 'VINEYARD'
);
create type wine_place_publication_status as enum ('DRAFT', 'VERIFIED', 'EXCLUDED');
create type wine_place_relationship_type as enum ('OVERLAPS', 'ALTERNATE_PARENT', 'RELATED');
create type wine_article_status as enum ('PLACEHOLDER', 'DRAFT', 'PUBLISHED');
create type wine_reference_map_status as enum (
  'PENDING', 'VERIFIED', 'SYNTHETIC', 'DUPLICATE', 'INVALID', 'NOT_GEOGRAPHIC'
);
create type wine_boundary_method as enum (
  'OFFICIAL', 'GENERALIZED_FROM_OFFICIAL_SOURCE',
  'DERIVED_FROM_DESCENDANTS', 'MANUAL'
);
create type wine_boundary_quality_status as enum ('DRAFT', 'VALIDATED', 'REJECTED');
create type wine_map_release_status as enum (
  'BUILDING', 'VALIDATED', 'ACTIVE', 'RETIRED', 'FAILED'
);

create table wine_places (
  id uuid primary key default gen_random_uuid(),
  primary_parent_id uuid references wine_places(id) on delete restrict,
  kind wine_place_kind not null,
  canonical_key text not null unique,
  canonical_key_locked_at timestamptz,
  name text not null,
  slug text not null,
  display_tier smallint not null check (display_tier between 0 and 20),
  min_zoom real not null check (min_zoom between 0 and 24),
  label_min_zoom real not null check (label_min_zoom between 0 and 24),
  publication_status wine_place_publication_status not null default 'DRAFT',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (primary_parent_id is null or primary_parent_id <> id)
);

create unique index wine_places_parent_slug_unique
  on wine_places (coalesce(primary_parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
create index wine_places_parent_sort_idx on wine_places (primary_parent_id, sort_order, name);
create index wine_places_publication_tier_idx on wine_places (publication_status, display_tier);

create table wine_place_aliases (
  id uuid primary key default gen_random_uuid(),
  wine_place_id uuid not null references wine_places(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  language_code text not null default 'und',
  alias_type text not null check (alias_type in ('ALTERNATE', 'LOCALIZED', 'HISTORICAL', 'SEARCH')),
  created_at timestamptz not null default now(),
  unique (wine_place_id, language_code, normalized_name)
);
create index wine_place_aliases_normalized_name_idx on wine_place_aliases (normalized_name);

create table wine_place_relationships (
  source_place_id uuid not null references wine_places(id) on delete cascade,
  target_place_id uuid not null references wine_places(id) on delete cascade,
  relationship_type wine_place_relationship_type not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (source_place_id, target_place_id, relationship_type),
  check (source_place_id <> target_place_id)
);

create table wine_place_articles (
  wine_place_id uuid primary key references wine_places(id) on delete cascade,
  description text,
  climate text,
  grape_varieties text,
  wine_styles text,
  key_facts text[],
  editorial_status wine_article_status not null default 'PLACEHOLDER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wine_boundary_sources (
  id uuid primary key default gen_random_uuid(),
  source_namespace text not null,
  source_feature_id text not null,
  authority text not null,
  jurisdiction text not null,
  created_at timestamptz not null default now(),
  unique (source_namespace, source_feature_id)
);

create table wine_boundary_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references wine_boundary_sources(id) on delete restrict,
  source_revision text not null,
  retrieved_at timestamptz,
  source_url text,
  licence text not null,
  raw_snapshot_uri text,
  raw_checksum_sha256 text
    check (raw_checksum_sha256 is null or raw_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  normalized_artifact_uri text not null,
  normalized_checksum_sha256 text not null
    check (normalized_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  provenance_note text,
  importer_version text not null,
  created_at timestamptz not null default now(),
  unique (source_id, source_revision, normalized_checksum_sha256),
  check ((raw_snapshot_uri is null) = (raw_checksum_sha256 is null)),
  check (raw_snapshot_uri is not null or provenance_note is not null)
);

create table wine_place_boundaries (
  id uuid primary key default gen_random_uuid(),
  wine_place_id uuid not null references wine_places(id) on delete cascade,
  source_snapshot_id uuid not null
    references wine_boundary_source_snapshots(id) on delete restrict,
  boundary_method wine_boundary_method not null,
  quality_status wine_boundary_quality_status not null default 'DRAFT',
  display_geometry extensions.geometry(MultiPolygon, 4326) not null,
  label_point extensions.geometry(Point, 4326) not null,
  bbox double precision[] not null check (cardinality(bbox) = 4),
  source_feature_refs jsonb not null default '{}'::jsonb,
  generation_parameters jsonb not null default '{}'::jsonb,
  revision text not null,
  is_current boolean not null default false,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (not extensions.ST_IsEmpty(display_geometry)),
  check (extensions.ST_IsValid(display_geometry)),
  check (extensions.ST_SRID(display_geometry) = 4326),
  check (extensions.ST_SRID(label_point) = 4326),
  check (extensions.ST_Covers(display_geometry, label_point))
);
create unique index wine_place_boundaries_one_current_idx
  on wine_place_boundaries (wine_place_id) where is_current;
create index wine_place_boundaries_geometry_idx
  on wine_place_boundaries using gist (display_geometry);

create table wine_map_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status wine_map_release_status not null default 'BUILDING',
  manifest_url text,
  manifest_checksum_sha256 text,
  tile_checksums jsonb not null default '{}'::jsonb,
  feature_counts jsonb not null default '{}'::jsonb,
  build_inputs jsonb not null default '{}'::jsonb,
  validation_report jsonb not null default '{}'::jsonb,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    status <> 'ACTIVE'
    or (manifest_url is not null and manifest_checksum_sha256 is not null)
  )
);
create unique index wine_map_releases_one_active_idx
  on wine_map_releases ((status)) where status = 'ACTIVE';

create function validate_wine_place_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent_tier smallint;
begin
  -- All hierarchy writers take the same transaction lock before reading paths.
  perform pg_catalog.pg_advisory_xact_lock(9132072026072709);

  if new.primary_parent_id is null then
    if exists (
      select 1 from wine_places child
      where child.primary_parent_id = new.id
        and child.display_tier < new.display_tier
    ) then
      raise exception 'child display tier cannot precede parent display tier';
    end if;
    return new;
  end if;

  if new.primary_parent_id = new.id then
    raise exception 'wine place cannot parent itself';
  end if;

  if exists (
    with recursive ancestors as (
      select id, primary_parent_id
      from wine_places where id = new.primary_parent_id
      union all
      select parent.id, parent.primary_parent_id
      from wine_places parent
      join ancestors child on parent.id = child.primary_parent_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'wine place hierarchy cycle detected';
  end if;

  select display_tier into v_parent_tier
  from wine_places where id = new.primary_parent_id;
  if v_parent_tier is null or new.display_tier < v_parent_tier then
    raise exception 'child display tier cannot precede parent display tier';
  end if;

  if exists (
    select 1 from wine_places child
    where child.primary_parent_id = new.id
      and child.display_tier < new.display_tier
  ) then
    raise exception 'child display tier cannot precede parent display tier';
  end if;

  return new;
end;
$$;

create trigger wine_places_validate_hierarchy
  before insert or update of primary_parent_id, display_tier on wine_places
  for each row execute function validate_wine_place_hierarchy();

create function lock_verified_wine_place_canonical_key()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.publication_status = 'VERIFIED' then
      new.canonical_key_locked_at = coalesce(new.canonical_key_locked_at, now());
    end if;
    return new;
  end if;

  if old.canonical_key_locked_at is not null then
    if new.canonical_key is distinct from old.canonical_key then
      raise exception 'verified wine place canonical key is immutable';
    end if;
    new.canonical_key_locked_at = old.canonical_key_locked_at;
  elsif new.publication_status = 'VERIFIED' then
    new.canonical_key_locked_at = coalesce(new.canonical_key_locked_at, now());
  end if;

  return new;
end;
$$;

create trigger wine_places_lock_canonical_key
  before insert or update of canonical_key, canonical_key_locked_at,
    publication_status on wine_places
  for each row execute function lock_verified_wine_place_canonical_key();

create function lock_wine_boundary_source_identity()
returns trigger
language plpgsql
as $$
begin
  if new.source_namespace is distinct from old.source_namespace
     or new.source_feature_id is distinct from old.source_feature_id then
    raise exception 'wine boundary source identity is immutable';
  end if;
  return new;
end;
$$;

create trigger wine_boundary_sources_lock_identity
  before update of source_namespace, source_feature_id on wine_boundary_sources
  for each row execute function lock_wine_boundary_source_identity();

create function prevent_wine_boundary_source_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'wine boundary source snapshots are immutable';
  return null;
end;
$$;

create trigger wine_boundary_source_snapshots_immutable
  before update or delete on wine_boundary_source_snapshots
  for each row execute function prevent_wine_boundary_source_snapshot_mutation();
create trigger wine_boundary_source_snapshots_no_truncate
  before truncate on wine_boundary_source_snapshots
  for each statement execute function prevent_wine_boundary_source_snapshot_mutation();

create trigger wine_places_set_updated_at
  before update on wine_places
  for each row execute function set_updated_at();
create trigger wine_place_articles_set_updated_at
  before update on wine_place_articles
  for each row execute function set_updated_at();

alter table countries
  add column wine_place_id uuid references wine_places(id) on delete set null,
  add column map_status wine_reference_map_status not null default 'PENDING',
  add column map_match_method text,
  add column map_match_confidence numeric(5,4)
    check (map_match_confidence between 0 and 1),
  add column map_reviewed_by uuid references profiles(id) on delete set null,
  add column map_reviewed_at timestamptz,
  add column map_review_note text,
  add constraint countries_map_link_state_check check (
    (map_status in ('VERIFIED', 'SYNTHETIC', 'DUPLICATE') and wine_place_id is not null)
    or
    (map_status not in ('VERIFIED', 'SYNTHETIC', 'DUPLICATE') and wine_place_id is null)
  );
create index countries_wine_place_id_idx on countries (wine_place_id);
create index countries_map_status_idx on countries (map_status);

alter table regions
  add column wine_place_id uuid references wine_places(id) on delete set null,
  add column map_status wine_reference_map_status not null default 'PENDING',
  add column map_match_method text,
  add column map_match_confidence numeric(5,4)
    check (map_match_confidence between 0 and 1),
  add column map_reviewed_by uuid references profiles(id) on delete set null,
  add column map_reviewed_at timestamptz,
  add column map_review_note text,
  add constraint regions_map_link_state_check check (
    (map_status in ('VERIFIED', 'SYNTHETIC', 'DUPLICATE') and wine_place_id is not null)
    or
    (map_status not in ('VERIFIED', 'SYNTHETIC', 'DUPLICATE') and wine_place_id is null)
  );
create index regions_wine_place_id_idx on regions (wine_place_id);
create index regions_map_status_idx on regions (map_status);

alter table appellations
  add column wine_place_id uuid references wine_places(id) on delete set null,
  add column map_status wine_reference_map_status not null default 'PENDING',
  add column map_match_method text,
  add column map_match_confidence numeric(5,4)
    check (map_match_confidence between 0 and 1),
  add column map_reviewed_by uuid references profiles(id) on delete set null,
  add column map_reviewed_at timestamptz,
  add column map_review_note text,
  add constraint appellations_map_link_state_check check (
    (map_status in ('VERIFIED', 'SYNTHETIC', 'DUPLICATE') and wine_place_id is not null)
    or
    (map_status not in ('VERIFIED', 'SYNTHETIC', 'DUPLICATE') and wine_place_id is null)
  );
create index appellations_wine_place_id_idx on appellations (wine_place_id);
create index appellations_map_status_idx on appellations (map_status);

revoke insert on countries, regions, appellations from authenticated;
grant insert (name) on countries to authenticated;
grant insert (country_id, name) on regions to authenticated;
grant insert (region_id, name) on appellations to authenticated;

alter table wine_places enable row level security;
alter table wine_place_aliases enable row level security;
alter table wine_place_relationships enable row level security;
alter table wine_place_articles enable row level security;
alter table wine_boundary_sources enable row level security;
alter table wine_boundary_source_snapshots enable row level security;
alter table wine_place_boundaries enable row level security;
alter table wine_map_releases enable row level security;

create policy "wine places verified read" on wine_places
  for select to authenticated using (publication_status = 'VERIFIED');
create policy "wine place aliases verified read" on wine_place_aliases
  for select to authenticated using (
    exists (select 1 from wine_places p where p.id = wine_place_id and p.publication_status = 'VERIFIED')
  );
create policy "wine place relationships verified read" on wine_place_relationships
  for select to authenticated using (
    exists (select 1 from wine_places p where p.id = source_place_id and p.publication_status = 'VERIFIED')
    and exists (select 1 from wine_places p where p.id = target_place_id and p.publication_status = 'VERIFIED')
  );
create policy "wine place articles published read" on wine_place_articles
  for select to authenticated using (
    editorial_status in ('PLACEHOLDER', 'PUBLISHED')
    and exists (select 1 from wine_places p where p.id = wine_place_id and p.publication_status = 'VERIFIED')
  );
create policy "wine boundary sources read" on wine_boundary_sources
  for select to authenticated using (true);
create policy "wine boundary source snapshots read" on wine_boundary_source_snapshots
  for select to authenticated using (true);
create policy "wine place boundaries validated read" on wine_place_boundaries
  for select to authenticated using (
    is_current and quality_status = 'VALIDATED'
    and exists (select 1 from wine_places p where p.id = wine_place_id and p.publication_status = 'VERIFIED')
  );
create policy "wine map active release read" on wine_map_releases
  for select to authenticated using (status = 'ACTIVE');

grant select on wine_places, wine_place_aliases, wine_place_relationships,
  wine_place_articles, wine_boundary_sources, wine_boundary_source_snapshots,
  wine_place_boundaries, wine_map_releases to authenticated;
