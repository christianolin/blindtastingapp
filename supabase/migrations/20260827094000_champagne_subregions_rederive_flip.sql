-- Champagne — sub-region outline re-derive (revision flip).
--
-- With the 38 Premier Cru villages now verified, the 3 sub-regions were
-- re-derived from all their children (Grand Cru + Premier Cru). This atomically
-- retires each old (GC-only) current boundary and promotes the new expanded
-- outline. Window guard = the Champagne display window.
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.champagne.%' and p.kind = 'SUBREGION' and b.quality_status = 'DRAFT';
  if v_count <> 3 then
    raise exception 'expected 3 DRAFT champagne subregion boundaries pre-flip, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck,
           (select id from wine_place_boundaries b where b.wine_place_id = p.id and b.is_current) old_id,
           (select id from wine_place_boundaries b where b.wine_place_id = p.id and b.quality_status = 'DRAFT') new_id,
           (select bbox from wine_place_boundaries b where b.wine_place_id = p.id and b.quality_status = 'DRAFT') new_bbox
      from wine_places p where p.canonical_key like 'france.champagne.%' and p.kind = 'SUBREGION'
  loop
    if r.new_bbox[1] < 3.0 or r.new_bbox[2] < 47.8 or r.new_bbox[3] > 5.05 or r.new_bbox[4] > 49.6 then
      raise exception 'champagne subregion % new bbox escapes the window', r.ck;
    end if;
    update wine_place_boundaries set is_current = false where id = r.old_id;
    update wine_place_boundaries set quality_status = 'VALIDATED', is_current = true, reviewed_at = now() where id = r.new_id;
  end loop;

  if exists (
    select 1 from wine_places p where p.canonical_key like 'france.champagne.%' and p.kind = 'SUBREGION'
       and (select count(*) from wine_place_boundaries b where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a champagne subregion lacks exactly one current boundary post-flip';
  end if;
  if exists (
    select 1 from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.champagne.%' and p.kind = 'SUBREGION' and b.quality_status = 'DRAFT'
  ) then
    raise exception 'a champagne subregion still has a DRAFT boundary';
  end if;
end;
$$;
