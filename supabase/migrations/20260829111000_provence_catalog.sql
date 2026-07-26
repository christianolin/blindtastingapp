-- Provence region — catalog (places only, DRAFT).
--
-- Official-first from the pinned INAO artifact (data/wine-map/
-- provence-appellations.json, owner-previewed): the AGGREGATE region place
-- france.provence (no single Provence AOC exists — its outline is derived
-- from the constituent AOCs at flip time via derive-boundary.mjs, the Rhône
-- pattern) plus 7 constituent AOCs as DRAFT so the staged boundaries can
-- reference them. Region modeled like every live region (REGION/regional,
-- is_appellation=true per the france.rhone precedent). Constituents per the
-- artifact: the three sprawling regional AOCs (Côtes de Provence, Coteaux
-- d'Aix-en-Provence, Coteaux varois en Provence) as subregional; the
-- smaller/prestige AOCs (Côtes de Provence Sainte-Victoire, Bandol, Les
-- Baux de Provence, Palette) as communal. Children flip in 20260829112000,
-- the derived region outline in 20260829113000; scoring rows link by exact
-- stored names in 20260829114000. Cassis, Bellet and Pierrevert are not in
-- the artifact (deferred) and stay unmodeled.
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
  if exists (select 1 from wine_places where canonical_key like 'france.provence%') then
    raise exception 'provence places already exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  ) values (
    v_france, 'REGION', 'france.provence', 'Provence', 'provence', 1,
    4, 4, 'DRAFT', true, 'AOC/AOP', 'regional', 0
  )
  returning id into v_region;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  )
  select v_region, 'APPELLATION', 'france.provence.' || v.slug, v.name, v.slug, 2,
         7, 7, 'DRAFT', true, 'AOC/AOP', v.level, v.so
  from (values
    ('cotes-de-provence',                 'Côtes de Provence',                 'subregional', 1),
    ('coteaux-daix-en-provence',          'Coteaux d''Aix-en-Provence',        'subregional', 2),
    ('coteaux-varois-en-provence',        'Coteaux varois en Provence',        'subregional', 3),
    ('cotes-de-provence-sainte-victoire', 'Côtes de Provence Sainte-Victoire', 'communal',    4),
    ('bandol',                            'Bandol',                            'communal',    5),
    ('les-baux-de-provence',              'Les Baux de Provence',              'communal',    6),
    ('palette',                           'Palette',                           'communal',    7)
  ) as v(slug, name, level, so);

  select count(*) into v_n from wine_places where canonical_key like 'france.provence%';
  if v_n <> 8 then
    raise exception 'expected 8 provence places, got %', v_n;
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.provence.%'
          and kind = 'APPELLATION' and is_appellation
          and appellation_system = 'AOC/AOP'
          and primary_parent_id = v_region
          and publication_status = 'DRAFT') <> 7 then
    raise exception 'provence child places assertion failed';
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.provence.%'
          and appellation_level = 'subregional') <> 3 then
    raise exception 'provence subregional count assertion failed';
  end if;
  if not exists (
    select 1 from wine_places
     where canonical_key = 'france.provence'
       and primary_parent_id = v_france
       and kind = 'REGION' and display_tier = 1
       and is_appellation and appellation_system = 'AOC/AOP'
       and appellation_level = 'regional' and publication_status = 'DRAFT'
  ) then
    raise exception 'provence region assertion failed';
  end if;
end;
$$;
