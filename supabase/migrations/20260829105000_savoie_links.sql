-- Savoie — scoring reference links (exact-name, never fuzzy).
--
-- Links the live scoring rows to the canonical places: the `regions` row
-- 'Savoie' -> france.savoie, and 14 `appellations` rows by their exact
-- stored names. 'Savoie AOP' and 'Vin de Savoie AOP' both map to the
-- dual-role region place france.savoie (the region footprint IS the base
-- Vin de Savoie AOC — same pattern as 'Cotes du Jura AOP' -> france.jura).
-- 'Les Abymes AOP' is the scoring table's stored form of the cru the INAO
-- denomination calls 'Abymes ou Les Abymes' — one curated row, still keyed
-- by the exact stored name. Crus with no scoring row at all (Seyssel, Crepy,
-- Cruet, Marignan, Marin, Montmelian, Ripaille, Saint-Jean-de-la-Porte,
-- Saint-Jeoire-Prieure, Marestel) stay map-only per the artifact rule.
-- Left PENDING deliberately: 'Cremant de Savoie AOP' (product AOC — a
-- designation, not a map place), 'Roussette du Bugey AOP' (Bugey is a
-- separate region, not modeled) and 'Marin County AVA' (California; name
-- resemblance only).
--
-- Idempotent by final state (twin-applier gremlin): updates carry no PENDING
-- filter and assertions check the linked end-state, not row-count deltas.
do $$
declare
  v_region_place uuid;
  v_count int;
begin
  select id into v_region_place from wine_places
   where canonical_key = 'france.savoie' and publication_status = 'VERIFIED';
  if v_region_place is null then
    raise exception 'france.savoie is not VERIFIED';
  end if;

  update regions
     set wine_place_id = v_region_place,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Savoie region migration: exact name match'
   where name = 'Savoie';

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Savoie region migration: exact name match'
    from (values
      ('Savoie AOP',              'france.savoie'),
      ('Vin de Savoie AOP',       'france.savoie'),
      ('Roussette de Savoie AOP', 'france.savoie.roussette-de-savoie'),
      ('Apremont AOP',            'france.savoie.apremont'),
      ('Arbin AOP',               'france.savoie.arbin'),
      ('Ayze AOP',                'france.savoie.ayze'),
      ('Chautagne AOP',           'france.savoie.chautagne'),
      ('Chignin AOP',             'france.savoie.chignin'),
      ('Chignin-Bergeron AOP',    'france.savoie.chignin-bergeron'),
      ('Frangy AOP',              'france.savoie.frangy'),
      ('Jongieux AOP',            'france.savoie.jongieux'),
      ('Les Abymes AOP',          'france.savoie.abymes-ou-les-abymes'),
      ('Monterminod AOP',         'france.savoie.monterminod'),
      ('Monthoux AOP',            'france.savoie.monthoux')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state assertions (safe under re-apply).
  select count(*) into v_count from regions
   where wine_place_id = v_region_place and map_status = 'VERIFIED'
     and map_match_method = 'MIGRATED_EXACT' and map_match_confidence = 1;
  if v_count <> 1 then
    raise exception 'expected 1 linked Savoie region row, got %', v_count;
  end if;
  select count(*) into v_count from appellations a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.savoie%'
     and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT';
  if v_count <> 14 then
    raise exception 'expected 14 linked Savoie appellation rows, got %', v_count;
  end if;
  -- The deliberate PENDING leftovers are untouched.
  select count(*) into v_count from appellations
   where name in ('Cremant de Savoie AOP', 'Roussette du Bugey AOP', 'Marin County AVA')
     and map_status = 'PENDING' and wine_place_id is null;
  if v_count <> 3 then
    raise exception 'expected 3 untouched Savoie-adjacent rows, got %', v_count;
  end if;
end;
$$;
