-- Loire — reference link fixes (short stored names).
--
-- Eight scoring rows that stayed PENDING in 20260829124000 only because the
-- reference table stores SHORT names for sub-appellations: 'Amboise AOP' is
-- Touraine Amboise, 'Clisson AOP'/'Gorges AOP' are the Muscadet Sevre et
-- Maine crus communaux, and 'Savennières AOP' (accented as stored) simply
-- had no link. 'Azay-le Rideau AOP' is the stored (typo) form. Matched to
-- the INAO-named places; IDEMPOTENT (final-state).
do $$
declare
  v_app int;
begin
  update appellations a
     set wine_place_id = p.id,
         map_status = 'VERIFIED',
         map_match_method = 'MIGRATED_EXACT',
         map_match_confidence = 1,
         map_reviewed_at = now(),
         map_review_note = 'Loire region migration: exact name match'
    from (values
      ('Amboise AOP',        'france.loire.touraine-amboise'),
      ('Azay-le Rideau AOP', 'france.loire.touraine-azay-le-rideau'),
      ('Chenonceaux AOP',    'france.loire.touraine-chenonceaux'),
      ('Mesland AOP',        'france.loire.touraine-mesland'),
      ('Oisly AOP',          'france.loire.touraine-oisly'),
      ('Clisson AOP',        'france.loire.muscadet-sevre-et-maine-clisson'),
      ('Gorges AOP',         'france.loire.muscadet-sevre-et-maine-gorges'),
      ('Savennières AOP',    'france.loire.savennieres')
    ) as v(app_name, ck)
    join wine_places p on p.canonical_key = v.ck
   where a.name = v.app_name;

  -- Final-state: 35 from the region migration + these 8 = 43.
  select count(*) into v_app from appellations a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.loire%'
     and a.map_status = 'VERIFIED' and a.map_match_method = 'MIGRATED_EXACT';
  if v_app <> 43 then
    raise exception 'expected 43 linked Loire appellation rows, got %', v_app;
  end if;
end;
$$;
