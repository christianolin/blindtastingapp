-- Vallee du Rhone — sub-region boundary flip (2 SUBREGION nodes).
--
-- Promotes the 2 DERIVED_FROM_DESCENDANTS sub-region boundaries (unions of
-- their 8 crus each) to current-VALIDATED and their places -> VERIFIED.
-- Mirrors the Champagne sub-region flip (20260826093000). Per-side window
-- guards from the live cru bboxes (+~0.1 margin over the 0.02 closing):
--   septentrional lon [4.6,5.0],  lat [44.8,45.6]
--   meridional    lon [4.5,5.2],  lat [43.9,44.5]
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.rhone.%' and p.kind = 'SUBREGION' and b.quality_status = 'DRAFT';
  if v_count <> 2 then
    raise exception 'expected exactly 2 DRAFT rhone subregion boundaries, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.rhone.%' and p.kind = 'SUBREGION' and b.quality_status = 'DRAFT'
  loop
    if r.ck = 'france.rhone.septentrional' then
      if r.bbox[1] < 4.6 or r.bbox[2] < 44.8 or r.bbox[3] > 5.0 or r.bbox[4] > 45.6 then
        raise exception 'septentrional bbox %,%,%,% escapes the window',
          r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck = 'france.rhone.meridional' then
      if r.bbox[1] < 4.5 or r.bbox[2] < 43.9 or r.bbox[3] > 5.2 or r.bbox[4] > 44.5 then
        raise exception 'meridional bbox %,%,%,% escapes the window',
          r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    else
      raise exception 'unexpected DRAFT subregion boundary for %', r.ck;
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places set publication_status = 'VERIFIED' where id = r.place_id;
  end loop;

  select count(*) into v_count from wine_places
   where canonical_key like 'france.rhone.%' and kind = 'SUBREGION' and publication_status = 'VERIFIED';
  if v_count <> 2 then
    raise exception 'expected 2 verified rhone subregions, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p where p.canonical_key like 'france.rhone.%' and p.kind = 'SUBREGION'
       and (select count(*) from wine_place_boundaries b where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a rhone subregion lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places where canonical_key like 'france.rhone.%' and kind = 'SUBREGION' and canonical_key_locked_at is null
  ) then
    raise exception 'a rhone subregion not locked post-verify';
  end if;
end;
$$;
