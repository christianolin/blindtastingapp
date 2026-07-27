-- Vallee du Rhone — Cotes du Rhone + Vacqueyras boundary flip.
--
-- Promotes the 2 staged DRAFT boundaries to current-VALIDATED and their
-- places -> VERIFIED:
--  * cotes-du-rhone: concave dissolve of all 18,181 INAO member parcels
--    (723 vtx, 2 components; live bbox 4.462,43.838..5.183,45.521 — Gard west
--    bank, Valreas enclave and the northern strip included).
--    Window lon [4.4,5.25], lat [43.8,45.6].
--  * vacqueyras: 2-commune aire-geographique union (44 vtx, 1 part;
--    boundary_method MANUAL, the Champagne commune model).
--    Window lon [4.85,5.05], lat [44.0,44.2].
-- meridional + france.rhone re-derive to absorb them in 20260829153000+.
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.rhone.%' and b.quality_status = 'DRAFT';
  if v_count <> 2 then
    raise exception 'expected exactly 2 DRAFT rhone boundaries pre-flip, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.rhone.%' and b.quality_status = 'DRAFT'
  loop
    if r.ck = 'france.rhone.cotes-du-rhone' then
      if r.bbox[1] < 4.4 or r.bbox[2] < 43.8 or r.bbox[3] > 5.25 or r.bbox[4] > 45.6 then
        raise exception 'cotes-du-rhone bbox %,%,%,% escapes the window',
          r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck = 'france.rhone.vacqueyras' then
      if r.bbox[1] < 4.85 or r.bbox[2] < 44.0 or r.bbox[3] > 5.05 or r.bbox[4] > 44.2 then
        raise exception 'vacqueyras bbox %,%,%,% escapes the window',
          r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    else
      raise exception 'unexpected DRAFT boundary for %', r.ck;
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places set publication_status = 'VERIFIED' where id = r.place_id;
  end loop;

  -- Final-state assertions.
  select count(*) into v_count from wine_places
   where canonical_key in ('france.rhone.cotes-du-rhone','france.rhone.vacqueyras')
     and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if v_count <> 2 then
    raise exception 'cdr/vacqueyras not verified+locked post-flip';
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key in ('france.rhone.cotes-du-rhone','france.rhone.vacqueyras')
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'cdr/vacqueyras lacks exactly one current boundary';
  end if;
end;
$$;
