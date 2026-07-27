-- Vallee du Rhone — wave 1 boundary flip (29 places).
--
-- Promotes the 29 staged DRAFT concave dissolves (CdRV + its 21 named
-- villages + 6 satellite AOCs + Muscat de Beaumes-de-Venise) to
-- current-VALIDATED and their places -> VERIFIED. All are parcel-backed INAO
-- dissolves. Combined window from the live staged bboxes
-- (lon [4.311,5.742], lat [43.669,44.796]): lon [4.25,5.8], lat [43.6,44.85].
-- meridional + france.rhone re-derive afterwards (20260829158000+).
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.rhone%' and b.quality_status = 'DRAFT';
  if v_count <> 29 then
    raise exception 'expected exactly 29 DRAFT rhone wave-1 boundaries, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.rhone%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 4.25 or r.bbox[2] < 43.6 or r.bbox[3] > 5.8 or r.bbox[4] > 44.85 then
      raise exception 'wave-1 % bbox %,%,%,% escapes the window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places set publication_status = 'VERIFIED' where id = r.place_id;
  end loop;

  -- Final-state: 21 pre-wave places + 29 new = 50 verified under the region.
  select count(*) into v_count from wine_places
   where canonical_key like 'france.rhone%' and publication_status = 'VERIFIED';
  if v_count <> 50 then
    raise exception 'expected 50 verified rhone places, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.rhone%' and p.publication_status = 'VERIFIED'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a rhone place lacks exactly one current boundary';
  end if;
end;
$$;
