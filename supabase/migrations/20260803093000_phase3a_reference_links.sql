-- Phase 3A reference links: attach the newly published Bourgogne region and
-- the four unambiguous new Bordeaux appellations to their scoring rows by
-- EXACT name (accepting the "<name>"/"<name> AOP" forms plus documented
-- spelling variants). Rule: link only when exactly one scoring row matches;
-- abort on multiple; leave PENDING (with a notice) on none.
--
-- Blaye is deliberately NOT linked here: although a "Blaye AOP" scoring row
-- exists, the mapping of the Blaye geography to the Blaye vs Blaye Côtes de
-- Bordeaux appellation is an owner decision (see Phase 3A notes); it stays
-- PENDING until confirmed.
do $$
declare
  r record;
  v_place uuid;
  v_row uuid;
  v_count int;
begin
  for r in
    select *
    from (values
      ('france.bordeaux.fronsac', array['Fronsac', 'Fronsac AOP']),
      ('france.bordeaux.canon-fronsac', array['Canon-Fronsac', 'Canon-Fronsac AOP']),
      ('france.bordeaux.cotes-de-bourg', array['Côtes de Bourg', 'Côtes de Bourg AOP']),
      ('france.bordeaux.entre-deux-mers',
       array['Entre-deux-Mers', 'Entre-deux-Mers AOP', 'Entre-Deux-Mers', 'Entre-Deux-Mers AOP'])
    ) as t(key, names)
  loop
    select id into v_place from wine_places where canonical_key = r.key;
    if v_place is null then raise exception 'place % missing', r.key; end if;
    select count(*), (array_agg(id))[1] into v_count, v_row
      from appellations where name = any(r.names);
    if v_count = 0 then
      raise notice 'no scoring appellation matched % — left PENDING', r.key;
    elsif v_count > 1 then
      raise exception 'ambiguous: % appellation rows matched %', v_count, r.key;
    else
      update appellations set
        wine_place_id = v_place, map_status = 'VERIFIED',
        map_match_method = 'MIGRATED_EXACT', map_match_confidence = 1,
        map_reviewed_at = now(), map_review_note = 'Phase 3A canonical migration'
      where id = v_row;
    end if;
  end loop;

  select id into v_place from wine_places where canonical_key = 'france.bourgogne';
  if v_place is null then raise exception 'bourgogne place missing'; end if;
  select count(*), (array_agg(id))[1] into v_count, v_row
    from regions where name in ('Bourgogne', 'Burgundy');
  if v_count = 0 then
    raise notice 'no Bourgogne region row matched — left PENDING';
  elsif v_count > 1 then
    raise exception 'ambiguous: % Bourgogne region rows', v_count;
  else
    update regions set
      wine_place_id = v_place, map_status = 'VERIFIED',
      map_match_method = 'MIGRATED_EXACT', map_match_confidence = 1,
      map_reviewed_at = now(), map_review_note = 'Phase 3A canonical migration'
    where id = v_row;
  end if;

  select count(*) into v_count from appellations where map_status = 'VERIFIED';
  if v_count <> 16 then raise exception 'expected 16 verified appellations, got %', v_count; end if;
  select count(*) into v_count from regions where map_status = 'VERIFIED';
  if v_count <> 2 then raise exception 'expected 2 verified regions, got %', v_count; end if;
end;
$$;
