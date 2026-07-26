-- Alsace — scoring reference links (exact-name, never fuzzy).
--
-- Links the live scoring rows to the canonical places: the `regions` row
-- 'Alsace' -> france.alsace, and 52 `appellations` rows by their exact stored
-- names -> the matching places. 'Alsace AOP' maps to the dual-role region
-- place france.alsace (region == regional AOC, like Beaujolais). The scoring
-- table stores ASCII/idiosyncratic spellings ('Kirchberg De Barr AOP',
-- 'Wineck Schlossberg AOP', 'Kitterle AOP'); French display names live on
-- wine_places only. Left PENDING deliberately: 'Alsace Grand Cru' (generic,
-- no single place), 'Alsace Grand Cru Rangen'/'Alsace Grand Cru Schlossberg'
-- (non-exact duplicates of the cru rows), 'Cremant d''Alsace AOP' (product
-- AOC — modeled as a designation, not a map place, per the Jura precedent),
-- the four eaux-de-vie and 'Marc d''Alsace Gewurztraminer AOP' (spirits).
--
-- Idempotent by final state (twin-applier gremlin): updates carry no PENDING
-- filter and assertions check the linked end-state, not row-count deltas.
do $$
declare
  v_region_place uuid;
  v_count int;
begin
  select id into v_region_place from wine_places
   where canonical_key = 'france.alsace' and publication_status = 'VERIFIED';
  if v_region_place is null then
    raise exception 'france.alsace is not VERIFIED';
  end if;

  update regions
     set wine_place_id = v_region_place,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Alsace region migration: exact name match'
   where name = 'Alsace';

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Alsace region migration: exact name match'
    from (values
      ('Alsace AOP',                   'france.alsace'),
      ('Altenberg de Bergbieten AOP',  'france.alsace.altenberg-de-bergbieten'),
      ('Altenberg de Bergheim AOP',    'france.alsace.altenberg-de-bergheim'),
      ('Altenberg de Wolxheim AOP',    'france.alsace.altenberg-de-wolxheim'),
      ('Brand AOP',                    'france.alsace.brand'),
      ('Bruderthal AOP',               'france.alsace.bruderthal'),
      ('Eichberg AOP',                 'france.alsace.eichberg'),
      ('Engelberg AOP',                'france.alsace.engelberg'),
      ('Florimont AOP',                'france.alsace.florimont'),
      ('Frankstein AOP',               'france.alsace.frankstein'),
      ('Froehn AOP',                   'france.alsace.froehn'),
      ('Furstentum AOP',               'france.alsace.furstentum'),
      ('Geisberg AOP',                 'france.alsace.geisberg'),
      ('Gloeckelberg AOP',             'france.alsace.gloeckelberg'),
      ('Goldert AOP',                  'france.alsace.goldert'),
      ('Hatschbourg AOP',              'france.alsace.hatschbourg'),
      ('Hengst AOP',                   'france.alsace.hengst'),
      ('Kaefferkopf AOP',              'france.alsace.kaefferkopf'),
      ('Kanzlerberg AOP',              'france.alsace.kanzlerberg'),
      ('Kastelberg AOP',               'france.alsace.kastelberg'),
      ('Kessler AOP',                  'france.alsace.kessler'),
      ('Kirchberg De Barr AOP',        'france.alsace.kirchberg-de-barr'),
      ('Kirchberg de Ribeauville AOP', 'france.alsace.kirchberg-de-ribeauville'),
      ('Kitterle AOP',                 'france.alsace.kitterle'),
      ('Mambourg AOP',                 'france.alsace.mambourg'),
      ('Mandelberg AOP',               'france.alsace.mandelberg'),
      ('Marckrain AOP',                'france.alsace.marckrain'),
      ('Moenchberg AOP',               'france.alsace.moenchberg'),
      ('Muenchberg AOP',               'france.alsace.muenchberg'),
      ('Ollwiller AOP',                'france.alsace.ollwiller'),
      ('Osterberg AOP',                'france.alsace.osterberg'),
      ('Pfersigberg AOP',              'france.alsace.pfersigberg'),
      ('Pfingstberg AOP',              'france.alsace.pfingstberg'),
      ('Praelatenberg AOP',            'france.alsace.praelatenberg'),
      ('Rangen AOP',                   'france.alsace.rangen'),
      ('Rosacker AOP',                 'france.alsace.rosacker'),
      ('Saering AOP',                  'france.alsace.saering'),
      ('Schlossberg AOP',              'france.alsace.schlossberg'),
      ('Schoenenbourg AOP',            'france.alsace.schoenenbourg'),
      ('Sommerberg AOP',               'france.alsace.sommerberg'),
      ('Sonnenglanz AOP',              'france.alsace.sonnenglanz'),
      ('Spiegel AOP',                  'france.alsace.spiegel'),
      ('Sporen AOP',                   'france.alsace.sporen'),
      ('Steinert AOP',                 'france.alsace.steinert'),
      ('Steingrubler AOP',             'france.alsace.steingrubler'),
      ('Steinklotz AOP',               'france.alsace.steinklotz'),
      ('Vorbourg AOP',                 'france.alsace.vorbourg'),
      ('Wiebelsberg AOP',              'france.alsace.wiebelsberg'),
      ('Wineck Schlossberg AOP',       'france.alsace.wineck-schlossberg'),
      ('Winzenberg AOP',               'france.alsace.winzenberg'),
      ('Zinnkoepfle AOP',              'france.alsace.zinnkoepfle'),
      ('Zotzenberg AOP',               'france.alsace.zotzenberg')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state assertions (safe under re-apply).
  select count(*) into v_count from regions
   where wine_place_id = v_region_place and map_status = 'VERIFIED'
     and map_match_method = 'MIGRATED_EXACT' and map_match_confidence = 1;
  if v_count <> 1 then
    raise exception 'expected 1 linked Alsace region row, got %', v_count;
  end if;
  select count(*) into v_count from appellations a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.alsace%'
     and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT';
  if v_count <> 52 then
    raise exception 'expected 52 linked Alsace appellation rows, got %', v_count;
  end if;
  -- The deliberate PENDING leftovers are untouched.
  select count(*) into v_count from appellations
   where name in ('Alsace Grand Cru', 'Alsace Grand Cru Rangen', 'Alsace Grand Cru Schlossberg')
     and map_status = 'PENDING' and wine_place_id is null;
  if v_count <> 3 then
    raise exception 'expected 3 untouched generic Alsace Grand Cru rows, got %', v_count;
  end if;
end;
$$;
