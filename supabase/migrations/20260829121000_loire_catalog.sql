-- Loire (Vallée de la Loire) region — catalog (places only, DRAFT).
--
-- Official-first from the pinned INAO artifact (data/wine-map/
-- loire-appellations.json, owner-previewed): the AGGREGATE region place
-- france.loire (no single Loire AOC — its outline derives from the
-- constituent AOCs at flip time, the Provence/Sud-Ouest pattern) plus all
-- 59 constituent AOCs as DRAFT. Levels per the artifact: the large
-- sub-regional families (Muscadet*, Anjou*, Touraine*, Saumur, Gros Plant,
-- Haut-Poitou) = subregional (22); communal AOCs and sweet crus
-- (Sancerre, Vouvray, Chinon, Quarts de Chaume...) = communal. The
-- cross-region style AOCs (Cremant de Loire, Rose de Loire, Cabernet/Rose
-- d'Anjou) are styles, not geographies — excluded (artifact caveat).
-- Children flip in 20260829122000, the derived region outline in
-- 20260829123000; scoring rows link by exact stored names in 20260829124000.
-- Generated from the artifact by a scratch generator (values verbatim).
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
  if exists (select 1 from wine_places where canonical_key like 'france.loire%') then
    raise exception 'loire places already exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  ) values (
    v_france, 'REGION', 'france.loire', 'Vallée de la Loire', 'loire', 1,
    4, 4, 'DRAFT', true, 'AOC/AOP', 'regional', 0
  )
  returning id into v_region;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  )
  select v_region, 'APPELLATION', 'france.loire.' || v.slug, v.name, v.slug, 2,
         7, 7, 'DRAFT', true, 'AOC/AOP', v.level, v.so
  from (values
    ('muscadet', 'Muscadet', 'subregional', 1),
    ('muscadet-coteaux-de-la-loire', 'Muscadet Coteaux de la Loire', 'subregional', 2),
    ('muscadet-cotes-de-grandlieu', 'Muscadet Côtes de Grandlieu', 'subregional', 3),
    ('muscadet-sevre-et-maine', 'Muscadet Sèvre et Maine', 'subregional', 4),
    ('muscadet-sevre-et-maine-clisson', 'Muscadet Sèvre et Maine Clisson', 'subregional', 5),
    ('muscadet-sevre-et-maine-gorges', 'Muscadet Sèvre et Maine Gorges', 'subregional', 6),
    ('muscadet-sevre-et-maine-le-pallet', 'Muscadet Sèvre et Maine Le Pallet', 'subregional', 7),
    ('gros-plant-du-pays-nantais', 'Gros Plant du Pays Nantais', 'subregional', 8),
    ('coteaux-d-ancenis', 'Coteaux d''Ancenis', 'communal', 9),
    ('fiefs-vendeens-brem', 'Fiefs Vendéens Brem', 'communal', 10),
    ('fiefs-vendeens-chantonnay', 'Fiefs Vendéens Chantonnay', 'communal', 11),
    ('fiefs-vendeens-mareuil', 'Fiefs Vendéens Mareuil', 'communal', 12),
    ('fiefs-vendeens-pissotte', 'Fiefs Vendéens Pissotte', 'communal', 13),
    ('fiefs-vendeens-vix', 'Fiefs Vendéens Vix', 'communal', 14),
    ('anjou', 'Anjou', 'subregional', 15),
    ('anjou-brissac', 'Anjou Brissac', 'subregional', 16),
    ('anjou-villages', 'Anjou Villages', 'subregional', 17),
    ('anjou-coteaux-de-la-loire', 'Anjou-Coteaux de la Loire', 'subregional', 18),
    ('savennieres', 'Savennières', 'communal', 19),
    ('savennieres-roche-aux-moines', 'Savennières Roche aux Moines', 'communal', 20),
    ('coteaux-du-layon', 'Coteaux du Layon', 'communal', 21),
    ('coteaux-du-layon-beaulieu-sur-layon-ou-beaulieu', 'Coteaux du Layon Beaulieu-sur-Layon ou Beaulieu', 'communal', 22),
    ('coteaux-du-layon-faye-d-anjou-ou-faye', 'Coteaux du Layon Faye-d''Anjou ou Faye', 'communal', 23),
    ('coteaux-du-layon-premier-cru-chaume', 'Coteaux du Layon premier cru Chaume', 'communal', 24),
    ('coteaux-du-layon-rablay-sur-layon-ou-rablay', 'Coteaux du Layon Rablay-sur-Layon ou Rablay', 'communal', 25),
    ('coteaux-du-layon-rochefort-sur-loire-ou-rochefort', 'Coteaux du Layon Rochefort-sur-Loire ou Rochefort', 'communal', 26),
    ('coteaux-du-layon-saint-aubin-de-luigne-ou-saint-aubin', 'Coteaux du Layon Saint-Aubin-de-Luigné ou Saint-Aubin', 'communal', 27),
    ('coteaux-du-layon-saint-lambert-du-lattay-ou-saint-lambert', 'Coteaux du Layon Saint-Lambert-du-Lattay ou Saint-Lambert', 'communal', 28),
    ('quarts-de-chaume', 'Quarts de Chaume', 'communal', 29),
    ('bonnezeaux', 'Bonnezeaux', 'communal', 30),
    ('coteaux-de-l-aubance', 'Coteaux de l''Aubance', 'communal', 31),
    ('saumur', 'Saumur', 'subregional', 32),
    ('saumur-champigny', 'Saumur-Champigny', 'subregional', 33),
    ('touraine', 'Touraine', 'subregional', 34),
    ('touraine-amboise', 'Touraine Amboise', 'subregional', 35),
    ('touraine-azay-le-rideau', 'Touraine Azay-le-Rideau', 'subregional', 36),
    ('touraine-chenonceaux', 'Touraine Chenonceaux', 'subregional', 37),
    ('touraine-mesland', 'Touraine Mesland', 'subregional', 38),
    ('touraine-noble-joue', 'Touraine Noble Joué', 'subregional', 39),
    ('touraine-oisly', 'Touraine Oisly', 'subregional', 40),
    ('vouvray', 'Vouvray', 'communal', 41),
    ('montlouis-sur-loire', 'Montlouis-sur-Loire', 'communal', 42),
    ('chinon', 'Chinon', 'communal', 43),
    ('bourgueil', 'Bourgueil', 'communal', 44),
    ('saint-nicolas-de-bourgueil', 'Saint-Nicolas-de-Bourgueil', 'communal', 45),
    ('jasnieres', 'Jasnières', 'communal', 46),
    ('coteaux-du-loir', 'Coteaux du Loir', 'communal', 47),
    ('cheverny', 'Cheverny', 'communal', 48),
    ('cour-cheverny', 'Cour-Cheverny', 'communal', 49),
    ('valencay', 'Valençay', 'communal', 50),
    ('haut-poitou', 'Haut-Poitou', 'subregional', 51),
    ('sancerre', 'Sancerre', 'communal', 52),
    ('pouilly-fume', 'Pouilly-Fumé', 'communal', 53),
    ('pouilly-sur-loire', 'Pouilly-sur-Loire', 'communal', 54),
    ('menetou-salon', 'Menetou-Salon', 'communal', 55),
    ('quincy', 'Quincy', 'communal', 56),
    ('reuilly', 'Reuilly', 'communal', 57),
    ('coteaux-du-giennois', 'Coteaux du Giennois', 'communal', 58),
    ('chateaumeillant', 'Châteaumeillant', 'communal', 59)
  ) as v(slug, name, level, so);

  select count(*) into v_n from wine_places where canonical_key like 'france.loire%';
  if v_n <> 60 then
    raise exception 'expected 60 loire places, got %', v_n;
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.loire.%'
          and kind = 'APPELLATION' and is_appellation
          and appellation_system = 'AOC/AOP'
          and primary_parent_id = v_region
          and publication_status = 'DRAFT') <> 59 then
    raise exception 'loire child places assertion failed';
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.loire.%'
          and appellation_level = 'subregional') <> 22 then
    raise exception 'loire subregional count assertion failed';
  end if;
  if not exists (
    select 1 from wine_places
     where canonical_key = 'france.loire'
       and primary_parent_id = v_france
       and kind = 'REGION' and display_tier = 1
       and is_appellation and appellation_system = 'AOC/AOP'
       and appellation_level = 'regional' and publication_status = 'DRAFT'
  ) then
    raise exception 'loire region assertion failed';
  end if;
end;
$$;
