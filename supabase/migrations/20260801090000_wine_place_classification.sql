-- Phase 3A classification schema (addendum 2026-07-21): legal relationship
-- types REPLACES_WITHIN/DUAL_LABEL plus flat classification facts on
-- wine_places. The relationship enum is RECREATED rather than extended:
-- ALTER TYPE ... ADD VALUE cannot be used inside the same transaction,
-- which would break the rollback-only dry-run harness; recreation is fully
-- transactional. The table's PK includes relationship_type and rebuilds
-- through the type round-trip.
alter table wine_place_relationships
  alter column relationship_type type text;
drop type wine_place_relationship_type;
create type wine_place_relationship_type as enum (
  'OVERLAPS', 'ALTERNATE_PARENT', 'RELATED', 'REPLACES_WITHIN', 'DUAL_LABEL'
);
alter table wine_place_relationships
  alter column relationship_type type wine_place_relationship_type
  using relationship_type::wine_place_relationship_type;

alter table wine_places
  add column is_appellation boolean not null default false,
  add column appellation_system text,
  add column appellation_level text
    check (appellation_level is null
           or appellation_level in ('regional', 'subregional', 'communal', 'cru')),
  add constraint wine_places_classification_coupling check (
    (is_appellation and appellation_system is not null)
    or (not is_appellation
        and appellation_system is null
        and appellation_level is null)
  );

-- Backfill the pilot catalog. Bordeaux carries the generic Bordeaux AOP
-- role on the same node (duplicates rule); France is not an appellation.
update wine_places set
  is_appellation = true,
  appellation_system = 'AOC/AOP',
  appellation_level = case canonical_key
    when 'france.bordeaux' then 'regional'
    when 'france.bordeaux.medoc' then 'subregional'
    when 'france.bordeaux.haut-medoc' then 'subregional'
    when 'france.bordeaux.graves' then 'subregional'
    when 'france.bordeaux.pessac-leognan' then 'subregional'
    when 'france.bordeaux.saint-emilion' then 'communal'
    when 'france.bordeaux.pomerol' then 'communal'
    when 'france.bordeaux.sauternes' then 'communal'
    when 'france.bordeaux.sauternes.barsac' then 'communal'
    when 'france.bordeaux.haut-medoc.margaux' then 'communal'
    when 'france.bordeaux.haut-medoc.pauillac' then 'communal'
    when 'france.bordeaux.haut-medoc.saint-julien' then 'communal'
    when 'france.bordeaux.haut-medoc.saint-estephe' then 'communal'
  end
where canonical_key like 'france.%';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from wine_places where is_appellation;
  if v_count <> 13 then
    raise exception 'expected 13 appellation-role places, got %', v_count;
  end if;
  select count(*) into v_count
  from wine_places where is_appellation and appellation_level is null;
  if v_count <> 0 then
    raise exception '% appellation places missing a level', v_count;
  end if;
end;
$$;
