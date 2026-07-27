-- Loire — wave 3b scoring reference links (exact stored names).
--
-- NOTE stored-name quirks matched verbatim: 'Rose d’Anjou AOP' carries a
-- CURLY apostrophe in the reference table while 'Cabernet d''Anjou AOP' is
-- straight; 'Cote Roannaise'/'Saint Pourcain'/'Orleans' etc. are stored
-- unaccented. Reopens two rows 20260829124000 left as "style" PENDINGs —
-- the owner's complete-picture call gives them real places now.
-- IDEMPOTENT (final-state).
do $$
declare
  v_app int;
begin
  if not exists (select 1 from wine_places where canonical_key = 'france.loire.cremant-de-loire' and publication_status = 'VERIFIED') then
    raise exception 'france.loire.cremant-de-loire is not VERIFIED';
  end if;

  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Loire region migration: exact name match'
    from (values
      ('Cremant de Loire AOP',     'france.loire.cremant-de-loire'),
      ('Rose de Loire AOP',        'france.loire.rose-de-loire'),
      ('Cabernet d''Anjou AOP',    'france.loire.cabernet-d-anjou'),
      ('Rose d’Anjou AOP',         'france.loire.rose-d-anjou'),
      ('Coteaux de Saumur AOP',    'france.loire.coteaux-de-saumur'),
      ('Coteaux du Vendomois AOP', 'france.loire.coteaux-du-vendomois'),
      ('Orleans AOP',              'france.loire.orleans'),
      ('Orleans-Clery AOP',        'france.loire.orleans-clery'),
      ('Cote Roannaise AOP',       'france.loire.cote-roannaise'),
      ('Cotes du Forez AOP',       'france.loire.cotes-du-forez'),
      ('Saint Pourcain AOP',       'france.loire.saint-pourcain')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state: 43 pre-wave links + these 11 = 54.
  select count(*) into v_app from appellations a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.loire%'
     and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT';
  if v_app <> 54 then
    raise exception 'expected 54 linked Loire appellation rows, got %', v_app;
  end if;
end;
$$;
