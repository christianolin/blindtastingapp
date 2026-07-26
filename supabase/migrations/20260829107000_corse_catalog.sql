-- Corse region — catalog (places only, DRAFT).
--
-- Official-first from the pinned INAO artifact (data/wine-map/
-- corse-appellations.json, owner-previewed): the region place france.corse
-- (dual-role: its footprint is the island-wide 'Vin de Corse ou Corse' AOC,
-- dissolved at boundary-build time) plus 8 village AOCs as DRAFT so the
-- staged boundaries (scripts/wine-map-sources/build-boundary.mjs --engine
-- concave, namespace IGN_INAO_AOC_VITICOLES) can reference them: the five
-- Vin de Corse geographic denominations (Calvi, Coteaux du Cap Corse,
-- Figari, Porto-Vecchio, Sartène) plus the standalone Ajaccio, Patrimonio
-- and Muscat du Cap Corse. The reviewed flip lands in 20260829108000.
-- Model mirrors Jura/Savoie: REGION/regional tier 1; APPELLATION/communal
-- tier 2 zoom 7. Display names use the place form (Calvi, Sartène...);
-- scoring rows link by their own exact stored names in 20260829109000.
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
  if exists (select 1 from wine_places where canonical_key like 'france.corse%') then
    raise exception 'corse places already exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  ) values (
    v_france, 'REGION', 'france.corse', 'Corse', 'corse', 1,
    4, 4, 'DRAFT', true, 'AOC/AOP', 'regional', 0
  )
  returning id into v_region;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  )
  select v_region, 'APPELLATION', 'france.corse.' || v.slug, v.name, v.slug, 2,
         7, 7, 'DRAFT', true, 'AOC/AOP', 'communal', v.so
  from (values
    ('calvi',                'Calvi',                1),
    ('coteaux-du-cap-corse', 'Coteaux du Cap Corse', 2),
    ('figari',               'Figari',               3),
    ('porto-vecchio',        'Porto-Vecchio',        4),
    ('sartene',              'Sartène',              5),
    ('ajaccio',              'Ajaccio',              6),
    ('patrimonio',           'Patrimonio',           7),
    ('muscat-du-cap-corse',  'Muscat du Cap Corse',  8)
  ) as v(slug, name, so);

  select count(*) into v_n from wine_places where canonical_key like 'france.corse%';
  if v_n <> 9 then
    raise exception 'expected 9 corse places, got %', v_n;
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.corse.%'
          and kind = 'APPELLATION' and is_appellation
          and appellation_system = 'AOC/AOP'
          and appellation_level = 'communal'
          and primary_parent_id = v_region
          and publication_status = 'DRAFT') <> 8 then
    raise exception 'corse village places assertion failed';
  end if;
  if not exists (
    select 1 from wine_places
     where canonical_key = 'france.corse'
       and primary_parent_id = v_france
       and kind = 'REGION' and display_tier = 1
       and is_appellation and appellation_system = 'AOC/AOP'
       and appellation_level = 'regional' and publication_status = 'DRAFT'
  ) then
    raise exception 'corse region assertion failed';
  end if;
end;
$$;
