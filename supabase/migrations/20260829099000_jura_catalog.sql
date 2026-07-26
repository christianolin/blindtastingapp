-- Jura region — catalog (places only, DRAFT).
--
-- Official-first from the pinned INAO artifact (data/wine-map/
-- jura-appellations.json, owner-previewed): the region place france.jura
-- (dual-role: its footprint is the region-wide 'Côtes du Jura' AOC, dissolved
-- at boundary-build time) plus the 4 geographic village AOCs as DRAFT, so the
-- staged boundaries (scripts/wine-map-sources/build-boundary.mjs --engine
-- concave, namespace IGN_INAO_AOC_VITICOLES) can reference them. The reviewed
-- flip lands in 20260829100000. Model mirrors Beaujolais: REGION/regional for
-- the region (tier 1), APPELLATION/communal for the villages (tier 2, zoom 7).
-- Crémant du Jura and Macvin du Jura are product/style AOCs over the same
-- footprint — designations, not map places (artifact caveat). Display names
-- keep accents (Château-Chalon, L'Étoile); scoring rows are linked by their
-- own exact stored names in 20260829101000.
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
  if exists (select 1 from wine_places where canonical_key like 'france.jura%') then
    raise exception 'jura places already exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  ) values (
    v_france, 'REGION', 'france.jura', 'Jura', 'jura', 1,
    4, 4, 'DRAFT', true, 'AOC/AOP', 'regional', 0
  )
  returning id into v_region;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  )
  select v_region, 'APPELLATION', 'france.jura.' || v.slug, v.name, v.slug, 2,
         7, 7, 'DRAFT', true, 'AOC/AOP', 'communal', v.so
  from (values
    ('arbois',          'Arbois',          1),
    ('arbois-pupillin', 'Arbois Pupillin', 2),
    ('chateau-chalon',  'Château-Chalon',  3),
    ('l-etoile',        'L''Étoile',       4)
  ) as v(slug, name, so);

  select count(*) into v_n from wine_places where canonical_key like 'france.jura%';
  if v_n <> 5 then
    raise exception 'expected 5 jura places, got %', v_n;
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.jura.%'
          and kind = 'APPELLATION' and is_appellation
          and appellation_system = 'AOC/AOP'
          and appellation_level = 'communal'
          and primary_parent_id = v_region
          and publication_status = 'DRAFT') <> 4 then
    raise exception 'jura village places assertion failed';
  end if;
  if not exists (
    select 1 from wine_places
     where canonical_key = 'france.jura'
       and primary_parent_id = v_france
       and kind = 'REGION' and display_tier = 1
       and is_appellation and appellation_system = 'AOC/AOP'
       and appellation_level = 'regional' and publication_status = 'DRAFT'
  ) then
    raise exception 'jura region assertion failed';
  end if;
end;
$$;
