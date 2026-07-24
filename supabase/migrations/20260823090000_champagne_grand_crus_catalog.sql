-- Champagne — Grand Cru villages catalog (17 places, DRAFT).
--
-- The 17 historically-fixed Echelle des Crus Grand Cru (100%-rated) villages.
-- A Champagne Grand Cru is a COMMUNE RATING, not an AOC/parcel appellation, so
-- these are modelled kind=SITE, is_appellation=false, appellation_level=null
-- (per data/wine-map/champagne-grand-crus.json). That keeps them out of the
-- AOC/appellation counts and the classification-coupling constraint. Boundaries
-- are the commune footprints from IGN Admin Express (by INSEE), staged MANUAL
-- and flipped in 20260823093000. Parent = france.champagne, tier 2.
-- Caveats: 'Ay' is INSEE 51030 (commune nouvelle Ay-Champagne, over-includes
-- Mareuil-sur-Ay 1er cru + Bisseuil); 'Le Mesnil-sur-Oger' is commune
-- Mesnil-sur-Oger (51367).
do $$
declare
  v_champagne uuid;
  v_n int;
begin
  select id into v_champagne from wine_places
   where canonical_key = 'france.champagne' and publication_status = 'VERIFIED';
  if v_champagne is null then
    raise exception 'france.champagne is not VERIFIED';
  end if;
  if exists (select 1 from wine_places where canonical_key like 'france.champagne.%') then
    raise exception 'champagne sub-places already exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, sort_order
  )
  select v_champagne, 'SITE', 'france.champagne.' || v.slug, v.name, v.slug, 2,
         8, 8, 'DRAFT', false, v.so
  from (values
    ('ambonnay',           'Ambonnay',            1),
    ('avize',              'Avize',               2),
    ('ay',                 'Aÿ',                  3),
    ('beaumont-sur-vesle', 'Beaumont-sur-Vesle',  4),
    ('bouzy',              'Bouzy',               5),
    ('chouilly',           'Chouilly',            6),
    ('cramant',            'Cramant',             7),
    ('louvois',            'Louvois',             8),
    ('mailly-champagne',   'Mailly-Champagne',    9),
    ('le-mesnil-sur-oger', 'Le Mesnil-sur-Oger', 10),
    ('oger',               'Oger',               11),
    ('oiry',               'Oiry',               12),
    ('puisieulx',          'Puisieulx',          13),
    ('sillery',            'Sillery',            14),
    ('tours-sur-marne',    'Tours-sur-Marne',    15),
    ('verzenay',           'Verzenay',           16),
    ('verzy',              'Verzy',              17)
  ) as v(slug, name, so);

  select count(*) into v_n from wine_places where canonical_key like 'france.champagne.%';
  if v_n <> 17 then
    raise exception 'expected 17 champagne grand cru places, got %', v_n;
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.champagne.%'
          and kind = 'SITE' and not is_appellation
          and appellation_level is null and appellation_system is null
          and display_tier = 2) <> 17 then
    raise exception 'champagne grand cru catalog assertion failed';
  end if;
end;
$$;
