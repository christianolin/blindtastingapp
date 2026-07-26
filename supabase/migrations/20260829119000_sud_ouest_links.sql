-- Sud-Ouest — scoring reference links (exact-name, never fuzzy).
--
-- Links the live scoring rows to the canonical places: the `regions` row
-- 'Sud Ouest' (stored without hyphen) -> france.sud-ouest, and 18
-- `appellations` rows by their exact stored names (ASCII spellings:
-- Pecharmant, Jurancon, Irouleguy, Gaillac Premieres Cotes...). Béarn has
-- no scoring row at all and stays map-only per the artifact rule. Left
-- PENDING deliberately: 'Cotes de Bergerac AOP', 'Cotes de Montravel AOP'
-- and 'Haut-Montravel AOP' (Bergerac-area sub-AOCs deferred from the
-- artifact — unmodeled, artifact caveat).
--
-- Idempotent by final state (twin-applier gremlin): updates carry no PENDING
-- filter and assertions check the linked end-state, not row-count deltas.
do $$
declare
  v_region_place uuid;
  v_count int;
begin
  select id into v_region_place from wine_places
   where canonical_key = 'france.sud-ouest' and publication_status = 'VERIFIED';
  if v_region_place is null then
    raise exception 'france.sud-ouest is not VERIFIED';
  end if;

  update regions
     set wine_place_id = v_region_place,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Sud-Ouest region migration: exact name match'
   where name = 'Sud Ouest';

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Sud-Ouest region migration: exact name match'
    from (values
      ('Bergerac AOP',                'france.sud-ouest.bergerac'),
      ('Monbazillac AOP',             'france.sud-ouest.monbazillac'),
      ('Montravel AOP',               'france.sud-ouest.montravel'),
      ('Pecharmant AOP',              'france.sud-ouest.pecharmant'),
      ('Saussignac AOP',              'france.sud-ouest.saussignac'),
      ('Cotes de Duras AOP',          'france.sud-ouest.cotes-de-duras'),
      ('Cotes du Marmandais AOP',     'france.sud-ouest.cotes-du-marmandais'),
      ('Cahors AOP',                  'france.sud-ouest.cahors'),
      ('Gaillac AOP',                 'france.sud-ouest.gaillac'),
      ('Gaillac Premieres Cotes AOP', 'france.sud-ouest.gaillac-premieres-cotes'),
      ('Fronton AOP',                 'france.sud-ouest.fronton'),
      ('Brulhois AOP',                'france.sud-ouest.brulhois'),
      ('Marcillac AOP',               'france.sud-ouest.marcillac'),
      ('Madiran AOP',                 'france.sud-ouest.madiran'),
      ('Pacherenc du Vic-Bilh AOP',   'france.sud-ouest.pacherenc-du-vic-bilh'),
      ('Jurancon AOP',                'france.sud-ouest.jurancon'),
      ('Irouleguy AOP',               'france.sud-ouest.irouleguy'),
      ('Buzet AOP',                   'france.sud-ouest.buzet')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state assertions (safe under re-apply).
  select count(*) into v_count from regions
   where wine_place_id = v_region_place and map_status = 'VERIFIED'
     and map_match_method = 'MIGRATED_EXACT' and map_match_confidence = 1;
  if v_count <> 1 then
    raise exception 'expected 1 linked Sud Ouest region row, got %', v_count;
  end if;
  select count(*) into v_count from appellations a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.sud-ouest%'
     and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT';
  if v_count <> 18 then
    raise exception 'expected 18 linked Sud-Ouest appellation rows, got %', v_count;
  end if;
  -- The deliberate PENDING leftovers are untouched.
  select count(*) into v_count from appellations
   where name in ('Cotes de Bergerac AOP', 'Cotes de Montravel AOP', 'Haut-Montravel AOP')
     and map_status = 'PENDING' and wine_place_id is null;
  if v_count <> 3 then
    raise exception 'expected 3 untouched Bergerac sub-AOC rows, got %', v_count;
  end if;
end;
$$;
