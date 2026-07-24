-- Champagne — sub-region boundary flip (3 SUBREGION nodes).
--
-- Promotes the 3 DERIVED_FROM_DESCENDANTS sub-region boundaries (unions of their
-- Grand Cru villages) to current-VALIDATED and their places -> VERIFIED. Window
-- guard = the Champagne display window (lon [3.0,5.05], lat [47.8,49.6]).
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.champagne.%' and p.kind = 'SUBREGION' and b.quality_status = 'DRAFT';
  if v_count <> 3 then
    raise exception 'expected exactly 3 DRAFT champagne subregion boundaries, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.champagne.%' and p.kind = 'SUBREGION' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 3.0 or r.bbox[2] < 47.8 or r.bbox[3] > 5.05 or r.bbox[4] > 49.6 then
      raise exception 'champagne subregion % bbox %,%,%,% escapes the window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places set publication_status = 'VERIFIED' where id = r.place_id;
  end loop;

  select count(*) into v_count from wine_places
   where canonical_key like 'france.champagne.%' and kind = 'SUBREGION' and publication_status = 'VERIFIED';
  if v_count <> 3 then
    raise exception 'expected 3 verified champagne subregions, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p where p.canonical_key like 'france.champagne.%' and p.kind = 'SUBREGION'
       and (select count(*) from wine_place_boundaries b where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a champagne subregion lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places where canonical_key like 'france.champagne.%' and kind = 'SUBREGION' and canonical_key_locked_at is null
  ) then
    raise exception 'a champagne subregion not locked post-verify';
  end if;
end;
$$;
