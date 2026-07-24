-- Vallee du Rhone (Northern Rhone slice) — catalog (places only, DRAFT).
--
-- Creates the region place france.rhone (display 'Vallee du Rhone') plus the 8
-- Northern Rhone communal crus as DRAFT, so their boundaries can be staged and
-- flipped. The region's own boundary is DERIVED from its children (like
-- france.bourgogne is a union of its districts) in a two-phase flip: crus are
-- verified first (20260822093000), france.rhone is derived + flipped second
-- (20260822094000). The full Cotes du Rhone dissolve + Southern Rhone are a
-- documented follow-up, at which point france.rhone's outline expands. Model:
-- REGION/regional for the region, APPELLATION/communal for each cru. Display
-- names keep accents; scoring rows are linked by their own exact names in
-- 20260822096000.
do $$
declare
  v_france uuid;
  v_region uuid;
  v_n int;
begin
  select id into v_france from wine_places where canonical_key = 'france';
  if v_france is null then
    raise exception 'france place missing';
  end if;
  if exists (select 1 from wine_places where canonical_key like 'france.rhone%') then
    raise exception 'rhone places already exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  ) values (
    v_france, 'REGION', 'france.rhone', 'Vallée du Rhône', 'rhone', 1,
    4, 4, 'DRAFT', true, 'AOC/AOP', 'regional', 0
  )
  returning id into v_region;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  )
  select v_region, 'APPELLATION', 'france.rhone.' || v.slug, v.name, v.slug, 2,
         7, 7, 'DRAFT', true, 'AOC/AOP', 'communal', v.so
  from (values
    ('cote-rotie',       'Côte-Rôtie',       1),
    ('condrieu',         'Condrieu',         2),
    ('chateau-grillet',  'Château-Grillet',  3),
    ('saint-joseph',     'Saint-Joseph',     4),
    ('hermitage',        'Hermitage',        5),
    ('crozes-hermitage', 'Crozes-Hermitage', 6),
    ('cornas',           'Cornas',           7),
    ('saint-peray',      'Saint-Péray',      8)
  ) as v(slug, name, so);

  select count(*) into v_n from wine_places where canonical_key like 'france.rhone%';
  if v_n <> 9 then
    raise exception 'expected 9 rhone places, got %', v_n;
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.rhone.%'
          and kind = 'APPELLATION' and is_appellation
          and appellation_level = 'communal'
          and appellation_system = 'AOC/AOP') <> 8 then
    raise exception 'rhone crus assertion failed';
  end if;
  if not exists (
    select 1 from wine_places
     where canonical_key = 'france.rhone'
       and primary_parent_id = v_france
       and kind = 'REGION' and display_tier = 1
       and is_appellation and appellation_system = 'AOC/AOP'
       and appellation_level = 'regional' and publication_status = 'DRAFT'
  ) then
    raise exception 'rhone region assertion failed';
  end if;
end;
$$;
