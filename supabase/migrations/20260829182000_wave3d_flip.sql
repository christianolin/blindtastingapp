-- Wave 3d — boundary flip (9 places).
--
-- Promotes the 9 staged DRAFT concave dissolves to current-VALIDATED and
-- their places -> VERIFIED. Grouped windows from the live staged bboxes:
--   sud-ouest five  lon [-0.65,0.95], lat [43.4,45.1]
--   pierrevert      lon [5.6,6.15],   lat [43.6,44.0]
--   bourgogne trio  lon [4.5,5.0],    lat [46.2,47.15]
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where (p.canonical_key like 'france.sud-ouest%' or p.canonical_key like 'france.provence%'
       or p.canonical_key like 'france.bourgogne%')
     and b.quality_status = 'DRAFT';
  if v_count <> 9 then
    raise exception 'expected exactly 9 DRAFT wave-3d boundaries, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where (p.canonical_key like 'france.sud-ouest%' or p.canonical_key like 'france.provence%'
         or p.canonical_key like 'france.bourgogne%')
       and b.quality_status = 'DRAFT'
  loop
    if r.ck like 'france.sud-ouest.%' then
      if r.bbox[1] < -0.65 or r.bbox[2] < 43.4 or r.bbox[3] > 0.95 or r.bbox[4] > 45.1 then
        raise exception 'sud-ouest % bbox %,%,%,% escapes the window', r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck = 'france.provence.pierrevert' then
      if r.bbox[1] < 5.6 or r.bbox[2] < 43.6 or r.bbox[3] > 6.15 or r.bbox[4] > 44.0 then
        raise exception 'pierrevert bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck like 'france.bourgogne.%' then
      if r.bbox[1] < 4.5 or r.bbox[2] < 46.2 or r.bbox[3] > 5.0 or r.bbox[4] > 47.15 then
        raise exception 'bourgogne % bbox %,%,%,% escapes the window', r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    else
      raise exception 'unexpected DRAFT boundary for %', r.ck;
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places set publication_status = 'VERIFIED' where id = r.place_id;
  end loop;

  select count(*) into v_count from wine_places
   where canonical_key in ('france.sud-ouest.cotes-de-bergerac','france.sud-ouest.cotes-de-montravel',
     'france.sud-ouest.haut-montravel','france.sud-ouest.saint-mont','france.sud-ouest.tursan',
     'france.provence.pierrevert','france.bourgogne.cote-de-beaune.cote-de-beaune',
     'france.bourgogne.cote-de-beaune.cote-de-beaune-villages','france.bourgogne.maconnais.macon-villages')
     and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if v_count <> 9 then
    raise exception 'expected 9 verified wave-3d places, got %', v_count;
  end if;
end;
$$;
