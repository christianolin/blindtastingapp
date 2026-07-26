-- Corse — scoring reference links (exact-name, never fuzzy).
--
-- Links the live scoring rows to the canonical places: the `regions` row
-- 'Corsica' (English stored spelling) -> france.corse, and all 10 Corsican
-- `appellations` rows by their exact stored names. 'Corse AOP' and
-- 'Vin de Corse AOP' both map to the dual-role region place (the region
-- footprint IS the island-wide Vin de Corse AOC — the Jura/Savoie pattern).
-- The scoring table's stored spellings differ from the place names in three
-- curated rows, still keyed by their exact stored names: 'Corse Porto
-- Vecchio AOP' (no hyphen) -> porto-vecchio, 'Corse-Sartene AOP' (ASCII) ->
-- sartene, 'Muscat de Cap Corse AOP' ("de", not "du") -> muscat-du-cap-corse.
--
-- Idempotent by final state (twin-applier gremlin): updates carry no PENDING
-- filter and assertions check the linked end-state, not row-count deltas.
do $$
declare
  v_region_place uuid;
  v_count int;
begin
  select id into v_region_place from wine_places
   where canonical_key = 'france.corse' and publication_status = 'VERIFIED';
  if v_region_place is null then
    raise exception 'france.corse is not VERIFIED';
  end if;

  update regions
     set wine_place_id = v_region_place,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Corse region migration: exact name match'
   where name = 'Corsica';

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Corse region migration: exact name match'
    from (values
      ('Corse AOP',                       'france.corse'),
      ('Vin de Corse AOP',                'france.corse'),
      ('Corse-Calvi AOP',                 'france.corse.calvi'),
      ('Corse-Coteaux du Cap Corse AOP',  'france.corse.coteaux-du-cap-corse'),
      ('Corse-Figari AOP',                'france.corse.figari'),
      ('Corse Porto Vecchio AOP',         'france.corse.porto-vecchio'),
      ('Corse-Sartene AOP',               'france.corse.sartene'),
      ('Ajaccio AOP',                     'france.corse.ajaccio'),
      ('Patrimonio AOP',                  'france.corse.patrimonio'),
      ('Muscat de Cap Corse AOP',         'france.corse.muscat-du-cap-corse')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state assertions (safe under re-apply).
  select count(*) into v_count from regions
   where wine_place_id = v_region_place and map_status = 'VERIFIED'
     and map_match_method = 'MIGRATED_EXACT' and map_match_confidence = 1;
  if v_count <> 1 then
    raise exception 'expected 1 linked Corsica region row, got %', v_count;
  end if;
  select count(*) into v_count from appellations a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.corse%'
     and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT';
  if v_count <> 10 then
    raise exception 'expected 10 linked Corse appellation rows, got %', v_count;
  end if;
end;
$$;
