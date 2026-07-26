-- Savoie region — catalog (places only, DRAFT).
--
-- Official-first from the pinned INAO artifact (data/wine-map/
-- savoie-appellations.json, owner-previewed): the region place france.savoie
-- (dual-role: its footprint is the base 'Vin de Savoie ou Savoie' AOC,
-- dissolved at boundary-build time) plus 22 children as DRAFT so the staged
-- boundaries (scripts/wine-map-sources/build-boundary.mjs --engine concave,
-- namespace IGN_INAO_AOC_VITICOLES) can reference them. The reviewed flip
-- lands in 20260829104000. Model per the artifact: REGION/regional tier 1;
-- 'Roussette de Savoie' = APPELLATION/subregional (the region-wide Altesse
-- overlay AOC); Seyssel + the 16 named Vin de Savoie crus + the 4 Roussette
-- crus = APPELLATION/communal (tier 2, zoom 7 — the flat Beaujolais model).
-- Crémant de Savoie is a product AOC — a designation, not a map place.
-- Display names keep the artifact spelling exactly (Abymes ou Les Abymes,
-- Crépy, Montmélian, Saint-Jeoire-Prieuré); scoring rows link by their own
-- exact stored names in 20260829105000.
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
  if exists (select 1 from wine_places where canonical_key like 'france.savoie%') then
    raise exception 'savoie places already exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  ) values (
    v_france, 'REGION', 'france.savoie', 'Savoie', 'savoie', 1,
    4, 4, 'DRAFT', true, 'AOC/AOP', 'regional', 0
  )
  returning id into v_region;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  )
  select v_region, 'APPELLATION', 'france.savoie.' || v.slug, v.name, v.slug, 2,
         7, 7, 'DRAFT', true, 'AOC/AOP', v.level, v.so
  from (values
    ('roussette-de-savoie',    'Roussette de Savoie',    'subregional',  1),
    ('seyssel',                'Seyssel',                'communal',     2),
    ('abymes-ou-les-abymes',   'Abymes ou Les Abymes',   'communal',     3),
    ('apremont',               'Apremont',               'communal',     4),
    ('arbin',                  'Arbin',                  'communal',     5),
    ('ayze',                   'Ayze',                   'communal',     6),
    ('chautagne',              'Chautagne',              'communal',     7),
    ('chignin',                'Chignin',                'communal',     8),
    ('chignin-bergeron',       'Chignin-Bergeron',       'communal',     9),
    ('crepy',                  'Crépy',                  'communal',    10),
    ('cruet',                  'Cruet',                  'communal',    11),
    ('jongieux',               'Jongieux',               'communal',    12),
    ('marignan',               'Marignan',               'communal',    13),
    ('marin',                  'Marin',                  'communal',    14),
    ('montmelian',             'Montmélian',             'communal',    15),
    ('ripaille',               'Ripaille',               'communal',    16),
    ('saint-jean-de-la-porte', 'Saint-Jean-de-la-Porte', 'communal',    17),
    ('saint-jeoire-prieure',   'Saint-Jeoire-Prieuré',   'communal',    18),
    ('frangy',                 'Frangy',                 'communal',    19),
    ('marestel',               'Marestel',               'communal',    20),
    ('monterminod',            'Monterminod',            'communal',    21),
    ('monthoux',               'Monthoux',               'communal',    22)
  ) as v(slug, name, level, so);

  select count(*) into v_n from wine_places where canonical_key like 'france.savoie%';
  if v_n <> 23 then
    raise exception 'expected 23 savoie places, got %', v_n;
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.savoie.%'
          and kind = 'APPELLATION' and is_appellation
          and appellation_system = 'AOC/AOP'
          and primary_parent_id = v_region
          and publication_status = 'DRAFT') <> 22 then
    raise exception 'savoie child places assertion failed';
  end if;
  if (select count(*) from wine_places
        where canonical_key = 'france.savoie.roussette-de-savoie'
          and appellation_level = 'subregional') <> 1 then
    raise exception 'roussette-de-savoie subregional assertion failed';
  end if;
  if not exists (
    select 1 from wine_places
     where canonical_key = 'france.savoie'
       and primary_parent_id = v_france
       and kind = 'REGION' and display_tier = 1
       and is_appellation and appellation_system = 'AOC/AOP'
       and appellation_level = 'regional' and publication_status = 'DRAFT'
  ) then
    raise exception 'savoie region assertion failed';
  end if;
end;
$$;
