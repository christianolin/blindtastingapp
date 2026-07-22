-- Phase 3C wave 5b reference links: the seven Côte de Nuits villages and all
-- sixteen grands crus, by EXACT name ("<name> AOP" form). Two documented
-- variants: the scoring data strips accents on Latricieres/Mazoyeres-
-- Chambertin. Grand-cru names are safe bare matches (only the grand cru is a
-- standalone AOP). "Aux Mazoyeres"/"Les Mazoyeres" are unrelated lieu-dit
-- rows and stay untouched. Link only on exactly one match; abort on many;
-- PENDING (notice) on none.
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
      ('france.bourgogne.cote-de-nuits.marsannay', array['Marsannay', 'Marsannay AOP']),
      ('france.bourgogne.cote-de-nuits.fixin', array['Fixin', 'Fixin AOP']),
      ('france.bourgogne.cote-de-nuits.gevrey-chambertin', array['Gevrey-Chambertin', 'Gevrey-Chambertin AOP']),
      ('france.bourgogne.cote-de-nuits.morey-saint-denis', array['Morey-Saint-Denis', 'Morey-Saint-Denis AOP']),
      ('france.bourgogne.cote-de-nuits.chambolle-musigny', array['Chambolle-Musigny', 'Chambolle-Musigny AOP']),
      ('france.bourgogne.cote-de-nuits.vougeot', array['Vougeot', 'Vougeot AOP']),
      ('france.bourgogne.cote-de-nuits.nuits-saint-georges', array['Nuits-Saint-Georges', 'Nuits-Saint-Georges AOP']),
      ('france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin', array['Chambertin', 'Chambertin AOP']),
      ('france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin-clos-de-beze',
       array['Chambertin-Clos de Bèze', 'Chambertin-Clos de Bèze AOP']),
      ('france.bourgogne.cote-de-nuits.gevrey-chambertin.chapelle-chambertin',
       array['Chapelle-Chambertin', 'Chapelle-Chambertin AOP']),
      ('france.bourgogne.cote-de-nuits.gevrey-chambertin.charmes-chambertin',
       array['Charmes-Chambertin', 'Charmes-Chambertin AOP']),
      ('france.bourgogne.cote-de-nuits.gevrey-chambertin.griotte-chambertin',
       array['Griotte-Chambertin', 'Griotte-Chambertin AOP']),
      ('france.bourgogne.cote-de-nuits.gevrey-chambertin.latricieres-chambertin',
       array['Latricières-Chambertin', 'Latricières-Chambertin AOP', 'Latricieres-Chambertin AOP']),
      ('france.bourgogne.cote-de-nuits.gevrey-chambertin.mazis-chambertin',
       array['Mazis-Chambertin', 'Mazis-Chambertin AOP']),
      ('france.bourgogne.cote-de-nuits.gevrey-chambertin.mazoyeres-chambertin',
       array['Mazoyères-Chambertin', 'Mazoyères-Chambertin AOP', 'Mazoyeres-Chambertin AOP']),
      ('france.bourgogne.cote-de-nuits.gevrey-chambertin.ruchottes-chambertin',
       array['Ruchottes-Chambertin', 'Ruchottes-Chambertin AOP']),
      ('france.bourgogne.cote-de-nuits.morey-saint-denis.clos-de-la-roche',
       array['Clos de la Roche', 'Clos de la Roche AOP']),
      ('france.bourgogne.cote-de-nuits.morey-saint-denis.clos-saint-denis',
       array['Clos Saint-Denis', 'Clos Saint-Denis AOP']),
      ('france.bourgogne.cote-de-nuits.morey-saint-denis.clos-des-lambrays',
       array['Clos des Lambrays', 'Clos des Lambrays AOP']),
      ('france.bourgogne.cote-de-nuits.morey-saint-denis.clos-de-tart',
       array['Clos de Tart', 'Clos de Tart AOP']),
      ('france.bourgogne.cote-de-nuits.chambolle-musigny.bonnes-mares',
       array['Bonnes-Mares', 'Bonnes-Mares AOP']),
      ('france.bourgogne.cote-de-nuits.chambolle-musigny.musigny', array['Musigny', 'Musigny AOP']),
      ('france.bourgogne.cote-de-nuits.vougeot.clos-de-vougeot',
       array['Clos de Vougeot', 'Clos de Vougeot AOP'])
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
  if v_count <> 57 then raise exception 'expected 57 verified appellations, got %', v_count; end if;
  select count(*) into v_count from regions where map_status = 'VERIFIED';
  if v_count <> 2 then raise exception 'expected 2 verified regions, got %', v_count; end if;
end;
$$;
