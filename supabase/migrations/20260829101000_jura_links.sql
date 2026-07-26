-- Jura — scoring reference links (exact-name, never fuzzy).
--
-- Links the live scoring rows to the canonical places: the `regions` row
-- 'Jura' -> france.jura, and 6 `appellations` rows by their exact stored
-- names. 'Cotes du Jura AOP' maps to the dual-role region place france.jura
-- (the region footprint IS the region-wide Côtes du Jura AOC per the
-- artifact's modeling decision — same dual-role pattern as 'Alsace AOP' and
-- 'Beaujolais AOP'); the plain 'Jura' appellation row maps to the region
-- place by exact place-name match. Left PENDING deliberately: 'Cremant du
-- Jura AOP' and 'Macvin du Jura AOP' (product/style AOCs over the same
-- footprint — designations, not map places, per the artifact caveat) and
-- 'Marc du Jura' (a spirit). 'Chalone AVA' / 'Cote Chalonnaise AOP' /
-- 'Jurancon AOP' merely resemble the name and are untouched.
--
-- Idempotent by final state (twin-applier gremlin): updates carry no PENDING
-- filter and assertions check the linked end-state, not row-count deltas.
do $$
declare
  v_region_place uuid;
  v_count int;
begin
  select id into v_region_place from wine_places
   where canonical_key = 'france.jura' and publication_status = 'VERIFIED';
  if v_region_place is null then
    raise exception 'france.jura is not VERIFIED';
  end if;

  update regions
     set wine_place_id = v_region_place,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Jura region migration: exact name match'
   where name = 'Jura';

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Jura region migration: exact name match'
    from (values
      ('Jura',                 'france.jura'),
      ('Cotes du Jura AOP',    'france.jura'),
      ('Arbois AOP',           'france.jura.arbois'),
      ('Arbois Pupillin AOP',  'france.jura.arbois-pupillin'),
      ('Château-Chalon AOP',   'france.jura.chateau-chalon'),
      ('L''Etoile AOP',        'france.jura.l-etoile')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state assertions (safe under re-apply).
  select count(*) into v_count from regions
   where wine_place_id = v_region_place and map_status = 'VERIFIED'
     and map_match_method = 'MIGRATED_EXACT' and map_match_confidence = 1;
  if v_count <> 1 then
    raise exception 'expected 1 linked Jura region row, got %', v_count;
  end if;
  select count(*) into v_count from appellations a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.jura%'
     and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT';
  if v_count <> 6 then
    raise exception 'expected 6 linked Jura appellation rows, got %', v_count;
  end if;
  -- The deliberate PENDING leftovers are untouched.
  select count(*) into v_count from appellations
   where name in ('Cremant du Jura AOP', 'Macvin du Jura AOP', 'Marc du Jura')
     and map_status = 'PENDING' and wine_place_id is null;
  if v_count <> 3 then
    raise exception 'expected 3 untouched Jura product/spirit rows, got %', v_count;
  end if;
end;
$$;
