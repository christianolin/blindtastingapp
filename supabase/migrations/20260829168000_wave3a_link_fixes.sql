-- Wave 3a — reference link fixes (Alsace GC pair, Chablis 1er, La Grande Rue).
--
-- Three rows were PENDING purely on stored-name form: 'Alsace Grand Cru
-- Rangen'/'Alsace Grand Cru Schlossberg' (no AOP suffix) match the existing
-- grand-cru places, and 'Chablis Premier Cru' matches the Chablis 1er Cru
-- umbrella SITE. 'La Grande Rue AOP' links the newly flipped grand cru.
-- Review notes reuse each family's canonical note string (pinned allow-list
-- in world-wine-map-foundation.test.mjs). IDEMPOTENT (final-state).
do $$
declare
  v_app int;
begin
  if not exists (
    select 1 from wine_places
     where canonical_key = 'france.bourgogne.cote-de-nuits.vosne-romanee.la-grande-rue'
       and publication_status = 'VERIFIED'
  ) then
    raise exception 'la-grande-rue is not VERIFIED';
  end if;

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = v.note
    from (values
      ('Alsace Grand Cru Rangen',      'france.alsace.rangen',      'Alsace region migration: exact name match'),
      ('Alsace Grand Cru Schlossberg', 'france.alsace.schlossberg', 'Alsace region migration: exact name match'),
      ('Chablis Premier Cru',          'france.bourgogne.chablis.chablis.premier-cru', 'Phase 3F chablis-climats migration: exact name match'),
      ('La Grande Rue AOP',            'france.bourgogne.cote-de-nuits.vosne-romanee.la-grande-rue', 'Phase 3C cote-de-nuits migration')
    ) as v(app_name, ck, note)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  select count(*) into v_app from appellations a
   where a.name in ('Alsace Grand Cru Rangen','Alsace Grand Cru Schlossberg','Chablis Premier Cru','La Grande Rue AOP')
     and a.map_status = 'VERIFIED' and a.wine_place_id is not null;
  if v_app <> 4 then
    raise exception 'expected 4 wave-3a links, got %', v_app;
  end if;
end;
$$;
