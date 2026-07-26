-- Provence — scoring reference links (exact-name, never fuzzy).
--
-- Links the live scoring rows to the canonical places: the `regions` row
-- 'Provence' -> france.provence, and 8 `appellations` rows by their exact
-- stored names. 'Provence AOP' maps to the aggregate region place (the
-- Beaujolais-AOP-to-region pattern); 'Sainte-Victoire AOP' is the stored
-- short form of the Côtes de Provence Sainte-Victoire terroir; 'Les
-- Baux-de-Provence AOP' is the stored hyphenated form. Left PENDING
-- deliberately: 'Bellet AOP', 'Cassis AOP', 'Pierrevert AOP' (real AOCs
-- deferred from the artifact — unmodeled, artifact caveat),
-- 'Alpes-de-Haute-Provence IGP' (IGP), 'Montbellet AOP' (a Mâconnais
-- village; name resemblance only) and the Creme de Cassis liqueur rows.
--
-- Idempotent by final state (twin-applier gremlin): updates carry no PENDING
-- filter and assertions check the linked end-state, not row-count deltas.
do $$
declare
  v_region_place uuid;
  v_count int;
begin
  select id into v_region_place from wine_places
   where canonical_key = 'france.provence' and publication_status = 'VERIFIED';
  if v_region_place is null then
    raise exception 'france.provence is not VERIFIED';
  end if;

  update regions
     set wine_place_id = v_region_place,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Provence region migration: exact name match'
   where name = 'Provence';

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Provence region migration: exact name match'
    from (values
      ('Provence AOP',                   'france.provence'),
      ('Côtes de Provence AOP',          'france.provence.cotes-de-provence'),
      ('Coteaux d''Aix-en-Provence AOP', 'france.provence.coteaux-daix-en-provence'),
      ('Coteaux Varois en Provence AOP', 'france.provence.coteaux-varois-en-provence'),
      ('Sainte-Victoire AOP',            'france.provence.cotes-de-provence-sainte-victoire'),
      ('Bandol AOP',                     'france.provence.bandol'),
      ('Les Baux-de-Provence AOP',       'france.provence.les-baux-de-provence'),
      ('Palette AOP',                    'france.provence.palette')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state assertions (safe under re-apply).
  select count(*) into v_count from regions
   where wine_place_id = v_region_place and map_status = 'VERIFIED'
     and map_match_method = 'MIGRATED_EXACT' and map_match_confidence = 1;
  if v_count <> 1 then
    raise exception 'expected 1 linked Provence region row, got %', v_count;
  end if;
  select count(*) into v_count from appellations a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.provence%'
     and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT';
  if v_count <> 8 then
    raise exception 'expected 8 linked Provence appellation rows, got %', v_count;
  end if;
  -- The deliberate PENDING leftovers are untouched.
  select count(*) into v_count from appellations
   where name in ('Bellet AOP', 'Cassis AOP', 'Pierrevert AOP',
                  'Alpes-de-Haute-Provence IGP', 'Montbellet AOP')
     and map_status = 'PENDING' and wine_place_id is null;
  if v_count <> 5 then
    raise exception 'expected 5 untouched Provence-adjacent rows, got %', v_count;
  end if;
end;
$$;
