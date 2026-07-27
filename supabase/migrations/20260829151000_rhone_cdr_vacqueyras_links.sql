-- Vallee du Rhone — Cotes du Rhone + Vacqueyras scoring reference links.
--
-- Links the two `appellations` rows -> their places by exact stored name.
-- NOTE: 'Cotes du Rhone AOP' is stored UNACCENTED in the reference table
-- (unlike 'Châteauneuf-du-Pape AOP'); 'Vacqueyras AOP' as stored. 'Cotes du
-- Rhone Villages AOP' stays PENDING (no place yet — deferred). IDEMPOTENT
-- (final-state, not row-count).
do $$
declare
  v_app int;
begin
  if not exists (select 1 from wine_places where canonical_key = 'france.rhone.cotes-du-rhone' and publication_status = 'VERIFIED') then
    raise exception 'france.rhone.cotes-du-rhone is not VERIFIED';
  end if;
  if not exists (select 1 from wine_places where canonical_key = 'france.rhone.vacqueyras' and publication_status = 'VERIFIED') then
    raise exception 'france.rhone.vacqueyras is not VERIFIED';
  end if;

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Rhone region migration: exact name match'
    from (values
      ('Cotes du Rhone AOP', 'france.rhone.cotes-du-rhone'),
      ('Vacqueyras AOP',     'france.rhone.vacqueyras')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state: all 18 Rhone appellation links (16 crus + these 2).
  select count(*) into v_app from appellations a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.rhone.%'
     and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT';
  if v_app <> 18 then
    raise exception 'expected 18 Rhone appellation links, got %', v_app;
  end if;
end;
$$;
