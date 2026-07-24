-- Beaujolais region — catalog (places only, DRAFT).
--
-- Official-first (unlike Champagne, which had zero INAO parcels): Beaujolais is
-- present in IGN AOC-VITICOLES. This inserts the region place france.beaujolais
-- (the regional 'Beaujolais' AOC — dual-role region) plus 11 sub-appellations
-- (Beaujolais-Villages + the 10 crus) as DRAFT, so the staged boundaries
-- (scripts/wine-map-sources/build-boundary.mjs --engine concave, namespace
-- IGN_INAO_AOC_VITICOLES) can reference them. The reviewed flip lands in
-- 20260821093000. Model mirrors Bordeaux: REGION/regional for the region,
-- APPELLATION/subregional for Beaujolais-Villages, APPELLATION/communal for the
-- 10 crus. Display names keep their accents; the scoring reference rows
-- (Chenas/Julienas/Regnie/Cote de Brouilly/Moulin-a-Vent) are linked by their
-- own exact names in 20260821096000.
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
  if exists (select 1 from wine_places where canonical_key like 'france.beaujolais%') then
    raise exception 'beaujolais places already exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  ) values (
    v_france, 'REGION', 'france.beaujolais', 'Beaujolais', 'beaujolais', 1,
    4, 4, 'DRAFT', true, 'AOC/AOP', 'regional', 0
  )
  returning id into v_region;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  )
  select v_region, 'APPELLATION', 'france.beaujolais.' || v.slug, v.name, v.slug, 2,
         7, 7, 'DRAFT', true, 'AOC/AOP', v.level, v.so
  from (values
    ('beaujolais-villages', 'Beaujolais-Villages', 'subregional', 1),
    ('brouilly',            'Brouilly',            'communal',    2),
    ('cote-de-brouilly',    'Côte de Brouilly',    'communal',    3),
    ('chenas',              'Chénas',              'communal',    4),
    ('chiroubles',          'Chiroubles',          'communal',    5),
    ('fleurie',             'Fleurie',             'communal',    6),
    ('julienas',            'Juliénas',            'communal',    7),
    ('morgon',              'Morgon',              'communal',    8),
    ('moulin-a-vent',       'Moulin-à-Vent',       'communal',    9),
    ('regnie',              'Régnié',              'communal',   10),
    ('saint-amour',         'Saint-Amour',         'communal',   11)
  ) as v(slug, name, level, so);

  select count(*) into v_n from wine_places where canonical_key like 'france.beaujolais%';
  if v_n <> 12 then
    raise exception 'expected 12 beaujolais places, got %', v_n;
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.beaujolais.%'
          and kind = 'APPELLATION' and is_appellation
          and appellation_system = 'AOC/AOP') <> 11 then
    raise exception 'beaujolais sub-appellations assertion failed';
  end if;
  if not exists (
    select 1 from wine_places
     where canonical_key = 'france.beaujolais'
       and primary_parent_id = v_france
       and kind = 'REGION' and display_tier = 1
       and is_appellation and appellation_system = 'AOC/AOP'
       and appellation_level = 'regional' and publication_status = 'DRAFT'
  ) then
    raise exception 'beaujolais region assertion failed';
  end if;
end;
$$;
