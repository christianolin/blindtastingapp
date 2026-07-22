-- Phase 3C Task 5a reference links: attach the Vosne-Romanée subtree to its
-- scoring rows by EXACT name ("<name> AOP" form; "Grands Échezeaux AOP" is the
-- documented space-variant of Grands-Échezeaux). Rule: link only when exactly
-- one scoring row matches; abort on multiple; leave PENDING (notice) on none.
--
-- Grand-cru names are safe to match bare: only the grand cru itself is a
-- standalone AOP (a "La Romanée"/"Échezeaux" scoring row can only mean the
-- grand cru; the like-named 1er-cru climats elsewhere are lieux-dits inside
-- their village AOP, never their own AOP row).
--
-- Climat rows are linked ONLY when the climat name is unique across the whole
-- INAO vocabulary. "Les Chaumes AOP" is deliberately NOT linked: the name is
-- ambiguous (Vosne 1er cru, Chassagne 1er cru, and Corton grand-cru climat) —
-- it stays PENDING until curated. Aux Brulées / Clos des Réas / Les Petis
-- Monts have no scoring rows today; nothing to link.
--
-- The district (Côte de Nuits) gets NO link: "Cote de Nuits-Villages AOP" and
-- the Hautes-Côtes rows are different appellations, not the district.
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
      ('france.bourgogne.cote-de-nuits.vosne-romanee', array['Vosne-Romanée', 'Vosne-Romanée AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.echezeaux', array['Échezeaux', 'Échezeaux AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.grands-echezeaux',
       array['Grands-Échezeaux', 'Grands-Échezeaux AOP', 'Grands Échezeaux', 'Grands Échezeaux AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.richebourg', array['Richebourg', 'Richebourg AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.romanee-conti', array['Romanée-Conti', 'Romanée-Conti AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.la-romanee', array['La Romanée', 'La Romanée AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.la-tache', array['La Tâche', 'La Tâche AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.romanee-saint-vivant',
       array['Romanée-Saint-Vivant', 'Romanée-Saint-Vivant AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.au-dessus-des-malconsorts',
       array['Au-dessus des Malconsorts', 'Au-dessus des Malconsorts AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.aux-malconsorts',
       array['Aux Malconsorts', 'Aux Malconsorts AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.aux-raignots',
       array['Aux Raignots', 'Aux Raignots AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.cros-parantoux',
       array['Cros Parantoux', 'Cros Parantoux AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.en-orveaux',
       array['En Orveaux', 'En Orveaux AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.la-croix-rameau',
       array['La Croix Rameau', 'La Croix Rameau AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-beaux-monts',
       array['Les Beaux Monts', 'Les Beaux Monts AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-gaudichots',
       array['Les Gaudichots', 'Les Gaudichots AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-rouges',
       array['Les Rouges', 'Les Rouges AOP']),
      ('france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-suchots',
       array['Les Suchots', 'Les Suchots AOP'])
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
        map_reviewed_at = now(), map_review_note = 'Phase 3C cote-de-nuits migration'
      where id = v_row;
    end if;
  end loop;

  select count(*) into v_count from appellations where map_status = 'VERIFIED';
  if v_count <> 34 then raise exception 'expected 34 verified appellations, got %', v_count; end if;
  select count(*) into v_count from regions where map_status = 'VERIFIED';
  if v_count <> 2 then raise exception 'expected 2 verified regions, got %', v_count; end if;
end;
$$;
