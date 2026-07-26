-- Languedoc-Roussillon region — catalog (places only, DRAFT).
--
-- Official-first from the pinned INAO artifact (data/wine-map/
-- languedoc-roussillon-appellations.json, owner-previewed): the region place
-- france.languedoc-roussillon (dual-role: its footprint is the base
-- 'Languedoc' AOC — which legally spans both Languedoc and Roussillon —
-- dissolved at boundary-build time) plus 56 constituent AOCs as DRAFT.
-- Levels per the artifact: the big regional/VDN AOCs (Corbières*,
-- Minervois*, Côtes du Roussillon*, Rivesaltes, Grand Roussillon, Limoux,
-- Costières de Nîmes) = subregional (14); crus, terroirs,
-- Clairettes and Muscats = communal. Clairette de Die belongs to the Rhône
-- and is excluded (artifact caveat). The reviewed flip of all 57
-- boundaries lands in 20260829127000; scoring rows link by exact stored
-- names in 20260829128000. Generated from the artifact by a scratch
-- generator (values verbatim).
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
  if exists (select 1 from wine_places where canonical_key like 'france.languedoc-roussillon%') then
    raise exception 'languedoc-roussillon places already exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  ) values (
    v_france, 'REGION', 'france.languedoc-roussillon', 'Languedoc-Roussillon',
    'languedoc-roussillon', 1, 4, 4, 'DRAFT', true, 'AOC/AOP', 'regional', 0
  )
  returning id into v_region;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  )
  select v_region, 'APPELLATION', 'france.languedoc-roussillon.' || v.slug, v.name, v.slug, 2,
         7, 7, 'DRAFT', true, 'AOC/AOP', v.level, v.so
  from (values
    ('languedoc-cabrieres', 'Languedoc Cabrières', 'communal', 1),
    ('languedoc-gres-de-montpellier', 'Languedoc Grès de Montpellier', 'communal', 2),
    ('languedoc-la-mejanelle', 'Languedoc La Méjanelle', 'communal', 3),
    ('languedoc-montpeyroux', 'Languedoc Montpeyroux', 'communal', 4),
    ('languedoc-quatourze', 'Languedoc Quatourze', 'communal', 5),
    ('languedoc-saint-christol', 'Languedoc Saint-Christol', 'communal', 6),
    ('languedoc-saint-drezery', 'Languedoc Saint-Drézéry', 'communal', 7),
    ('languedoc-saint-georges-d-orques', 'Languedoc Saint-Georges-d''Orques', 'communal', 8),
    ('languedoc-saint-saturnin', 'Languedoc Saint-Saturnin', 'communal', 9),
    ('terrasses-du-larzac', 'Terrasses du Larzac', 'communal', 10),
    ('pic-saint-loup', 'Pic Saint-Loup', 'communal', 11),
    ('la-clape', 'La Clape', 'communal', 12),
    ('picpoul-de-pinet', 'Picpoul de Pinet', 'communal', 13),
    ('clairette-du-languedoc', 'Clairette du Languedoc', 'communal', 14),
    ('clairette-du-languedoc-adissan', 'Clairette du Languedoc Adissan', 'communal', 15),
    ('clairette-du-languedoc-aspiran', 'Clairette du Languedoc Aspiran', 'communal', 16),
    ('clairette-du-languedoc-cabrieres', 'Clairette du Languedoc Cabrières', 'communal', 17),
    ('clairette-du-languedoc-ceyras', 'Clairette du Languedoc Ceyras', 'communal', 18),
    ('clairette-du-languedoc-fontes', 'Clairette du Languedoc Fontès', 'communal', 19),
    ('clairette-du-languedoc-le-bosc', 'Clairette du Languedoc Le Bosc', 'communal', 20),
    ('clairette-du-languedoc-lieuran-cabrieres', 'Clairette du Languedoc Lieuran-Cabrières', 'communal', 21),
    ('clairette-du-languedoc-nizas', 'Clairette du Languedoc Nizas', 'communal', 22),
    ('clairette-du-languedoc-paulhan', 'Clairette du Languedoc Paulhan', 'communal', 23),
    ('clairette-du-languedoc-peret', 'Clairette du Languedoc Péret', 'communal', 24),
    ('clairette-du-languedoc-saint-andre-de-sangonis', 'Clairette du Languedoc Saint-André-de-Sangonis', 'communal', 25),
    ('clairette-de-bellegarde', 'Clairette de Bellegarde', 'communal', 26),
    ('corbieres', 'Corbières', 'subregional', 27),
    ('corbieres-boutenac', 'Corbières-Boutenac', 'subregional', 28),
    ('minervois', 'Minervois', 'subregional', 29),
    ('minervois-la-liviniere', 'Minervois-La Livinière', 'subregional', 30),
    ('saint-chinian', 'Saint-Chinian', 'communal', 31),
    ('saint-chinian-berlou', 'Saint-Chinian Berlou', 'communal', 32),
    ('saint-chinian-roquebrun', 'Saint-Chinian Roquebrun', 'communal', 33),
    ('faugeres', 'Faugères', 'communal', 34),
    ('fitou', 'Fitou', 'communal', 35),
    ('cabardes', 'Cabardès', 'communal', 36),
    ('malepere', 'Malepère', 'communal', 37),
    ('limoux', 'Limoux', 'subregional', 38),
    ('costieres-de-nimes', 'Costières de Nîmes', 'subregional', 39),
    ('cotes-du-roussillon', 'Côtes du Roussillon', 'subregional', 40),
    ('cotes-du-roussillon-villages', 'Côtes du Roussillon Villages', 'subregional', 41),
    ('cotes-du-roussillon-villages-caramany', 'Côtes du Roussillon Villages Caramany', 'subregional', 42),
    ('cotes-du-roussillon-villages-les-aspres', 'Côtes du Roussillon Villages Les Aspres', 'subregional', 43),
    ('cotes-du-roussillon-villages-lesquerde', 'Côtes du Roussillon Villages Lesquerde', 'subregional', 44),
    ('cotes-du-roussillon-villages-tautavel', 'Côtes du Roussillon Villages Tautavel', 'subregional', 45),
    ('collioure', 'Collioure', 'communal', 46),
    ('banyuls', 'Banyuls', 'communal', 47),
    ('banyuls-grand-cru', 'Banyuls grand cru', 'communal', 48),
    ('maury', 'Maury', 'communal', 49),
    ('rivesaltes', 'Rivesaltes', 'subregional', 50),
    ('grand-roussillon', 'Grand Roussillon', 'subregional', 51),
    ('muscat-de-rivesaltes', 'Muscat de Rivesaltes', 'communal', 52),
    ('muscat-de-frontignan', 'Muscat de Frontignan', 'communal', 53),
    ('muscat-de-lunel', 'Muscat de Lunel', 'communal', 54),
    ('muscat-de-mireval', 'Muscat de Mireval', 'communal', 55),
    ('muscat-de-saint-jean-de-minervois', 'Muscat de Saint-Jean-de-Minervois', 'communal', 56)
  ) as v(slug, name, level, so);

  select count(*) into v_n from wine_places where canonical_key like 'france.languedoc-roussillon%';
  if v_n <> 57 then
    raise exception 'expected 57 languedoc-roussillon places, got %', v_n;
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.languedoc-roussillon.%'
          and kind = 'APPELLATION' and is_appellation
          and appellation_system = 'AOC/AOP'
          and primary_parent_id = v_region
          and publication_status = 'DRAFT') <> 56 then
    raise exception 'languedoc-roussillon child places assertion failed';
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.languedoc-roussillon.%'
          and appellation_level = 'subregional') <> 14 then
    raise exception 'languedoc-roussillon subregional count assertion failed';
  end if;
  if not exists (
    select 1 from wine_places
     where canonical_key = 'france.languedoc-roussillon'
       and primary_parent_id = v_france
       and kind = 'REGION' and display_tier = 1
       and is_appellation and appellation_system = 'AOC/AOP'
       and appellation_level = 'regional' and publication_status = 'DRAFT'
  ) then
    raise exception 'languedoc-roussillon region assertion failed';
  end if;
end;
$$;
