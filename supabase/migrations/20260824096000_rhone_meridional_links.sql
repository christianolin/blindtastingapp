-- Vallee du Rhone (Southern slice) — scoring reference links (exact-name).
--
-- Links the 8 Southern Rhone cru `appellations` rows -> their places by exact
-- stored name ('Chateauneuf-du-Pape AOP' with accents; 'Beaumes de Venise AOP'
-- is the dry red cru, NOT 'Muscat de Beaumes de Venise AOP'). The regions
-- 'Rhône' row is already linked (northern migration). IDEMPOTENT (final-state,
-- not row-count) so a re-apply after any twin-applier revert self-heals.
do $$
declare
  v_app int;
begin
  if not exists (select 1 from wine_places where canonical_key = 'france.rhone' and publication_status = 'VERIFIED') then
    raise exception 'france.rhone is not VERIFIED';
  end if;

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Rhone region migration: exact name match'
    from (values
      ('Châteauneuf-du-Pape AOP', 'france.rhone.chateauneuf-du-pape'),
      ('Gigondas AOP',            'france.rhone.gigondas'),
      ('Vinsobres AOP',           'france.rhone.vinsobres'),
      ('Cairanne AOP',            'france.rhone.cairanne'),
      ('Rasteau AOP',             'france.rhone.rasteau'),
      ('Beaumes de Venise AOP',   'france.rhone.beaumes-de-venise'),
      ('Lirac AOP',               'france.rhone.lirac'),
      ('Tavel AOP',               'france.rhone.tavel')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state assertion: all 16 Rhone crus (8 north + 8 south) are linked.
  select count(*) into v_app from appellations a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.rhone.%'
     and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT';
  if v_app <> 16 then
    raise exception 'expected 16 Rhone cru appellation links, got % (Chateauneuf name mismatch?)', v_app;
  end if;
end;
$$;
