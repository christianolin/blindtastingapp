-- Champagne — Premier Cru villages boundary flip (38 places).
--
-- Promotes the 38 staged DRAFT commune-footprint boundaries (IGN Admin Express
-- by INSEE, MANUAL) to current-VALIDATED and their SITE places -> VERIFIED. The
-- DRAFT boundaries under france.champagne.% are exactly these 38 (the 17 GC + 3
-- sub-regions are already current). Window guard = the Champagne display window.
-- The 3 sub-regions are re-derived to include these in 20260827094000.
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.champagne.%' and b.quality_status = 'DRAFT';
  if v_count <> 38 then
    raise exception 'expected exactly 38 DRAFT champagne 1er cru boundaries pre-flip, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.champagne.%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 3.0 or r.bbox[2] < 47.8 or r.bbox[3] > 5.05 or r.bbox[4] > 49.6 then
      raise exception 'champagne 1er cru % bbox %,%,%,% escapes the window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places set publication_status = 'VERIFIED' where id = r.place_id;
  end loop;

  select count(*) into v_count from wine_places
   where canonical_key like 'france.champagne.%' and kind = 'SITE' and display_tier = 3 and publication_status = 'VERIFIED';
  if v_count <> 55 then
    raise exception 'expected 55 verified champagne villages (17 GC + 38 1er cru), got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p where p.canonical_key like 'france.champagne.%' and p.kind = 'SITE'
       and (select count(*) from wine_place_boundaries b where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a champagne village lacks exactly one current boundary';
  end if;
end;
$$;
