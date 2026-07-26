-- Sud-Ouest region — catalog (places only, DRAFT).
--
-- Official-first from the pinned INAO artifact (data/wine-map/
-- sud-ouest-appellations.json, owner-previewed): the AGGREGATE region place
-- france.sud-ouest (no single regional AOC — its outline is derived from
-- the 19 constituent AOCs at flip time via derive-boundary.mjs, the
-- Provence pattern) plus the 19 constituents as DRAFT. Region modeled like
-- every live region (REGION/regional, is_appellation=true). Large AOCs
-- (Bergerac, Cahors, Gaillac, Madiran, Jurançon, Béarn) = subregional;
-- the rest = communal (tier 2, zoom 7). Children flip in 20260829117000,
-- the derived region outline in 20260829118000; scoring rows link by exact
-- stored names in 20260829119000. Deferred sub-AOCs (Côtes de Bergerac,
-- Côtes de Montravel, Haut-Montravel, Rosette, Saint-Mont, Coteaux du
-- Quercy) stay unmodeled per the artifact caveat.
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
  if exists (select 1 from wine_places where canonical_key like 'france.sud-ouest%') then
    raise exception 'sud-ouest places already exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  ) values (
    v_france, 'REGION', 'france.sud-ouest', 'Sud-Ouest', 'sud-ouest', 1,
    4, 4, 'DRAFT', true, 'AOC/AOP', 'regional', 0
  )
  returning id into v_region;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  )
  select v_region, 'APPELLATION', 'france.sud-ouest.' || v.slug, v.name, v.slug, 2,
         7, 7, 'DRAFT', true, 'AOC/AOP', v.level, v.so
  from (values
    ('bergerac',                'Bergerac',                'subregional',  1),
    ('monbazillac',             'Monbazillac',             'communal',     2),
    ('montravel',               'Montravel',               'communal',     3),
    ('pecharmant',              'Pécharmant',              'communal',     4),
    ('saussignac',              'Saussignac',              'communal',     5),
    ('cotes-de-duras',          'Côtes de Duras',          'communal',     6),
    ('cotes-du-marmandais',     'Côtes du Marmandais',     'communal',     7),
    ('cahors',                  'Cahors',                  'subregional',  8),
    ('gaillac',                 'Gaillac',                 'subregional',  9),
    ('gaillac-premieres-cotes', 'Gaillac premières côtes', 'communal',    10),
    ('fronton',                 'Fronton',                 'communal',    11),
    ('brulhois',                'Brulhois',                'communal',    12),
    ('marcillac',               'Marcillac',               'communal',    13),
    ('madiran',                 'Madiran',                 'subregional', 14),
    ('pacherenc-du-vic-bilh',   'Pacherenc du Vic-Bilh',   'communal',    15),
    ('jurancon',                'Jurançon',                'subregional', 16),
    ('bearn',                   'Béarn',                   'subregional', 17),
    ('irouleguy',               'Irouléguy',               'communal',    18),
    ('buzet',                   'Buzet',                   'communal',    19)
  ) as v(slug, name, level, so);

  select count(*) into v_n from wine_places where canonical_key like 'france.sud-ouest%';
  if v_n <> 20 then
    raise exception 'expected 20 sud-ouest places, got %', v_n;
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.sud-ouest.%'
          and kind = 'APPELLATION' and is_appellation
          and appellation_system = 'AOC/AOP'
          and primary_parent_id = v_region
          and publication_status = 'DRAFT') <> 19 then
    raise exception 'sud-ouest child places assertion failed';
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.sud-ouest.%'
          and appellation_level = 'subregional') <> 6 then
    raise exception 'sud-ouest subregional count assertion failed';
  end if;
  if not exists (
    select 1 from wine_places
     where canonical_key = 'france.sud-ouest'
       and primary_parent_id = v_france
       and kind = 'REGION' and display_tier = 1
       and is_appellation and appellation_system = 'AOC/AOP'
       and appellation_level = 'regional' and publication_status = 'DRAFT'
  ) then
    raise exception 'sud-ouest region assertion failed';
  end if;
end;
$$;
