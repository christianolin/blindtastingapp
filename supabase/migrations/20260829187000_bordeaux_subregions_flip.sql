-- Bordeaux — sub-region boundary flip (2 SUBREGION nodes).
--
-- Promotes the 2 DERIVED_FROM_DESCENDANTS boundaries (Libournais = union of
-- its 9 right-bank AOCs; Blaye & Bourg = union of the 2 northern ones) to
-- current-VALIDATED and their places -> VERIFIED. Combined right-bank
-- window: lon [-0.85,0.15], lat [44.7,45.4].
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.bordeaux.%' and p.kind = 'SUBREGION' and b.quality_status = 'DRAFT';
  if v_count <> 2 then
    raise exception 'expected exactly 2 DRAFT bordeaux subregion boundaries, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.bordeaux.%' and p.kind = 'SUBREGION' and b.quality_status = 'DRAFT'
  loop
    if r.ck not in ('france.bordeaux.libournais','france.bordeaux.blaye-bourg') then
      raise exception 'unexpected DRAFT subregion boundary for %', r.ck;
    end if;
    if r.bbox[1] < -0.85 or r.bbox[2] < 44.7 or r.bbox[3] > 0.15 or r.bbox[4] > 45.4 then
      raise exception '% bbox %,%,%,% escapes the window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places set publication_status = 'VERIFIED' where id = r.place_id;
  end loop;

  select count(*) into v_count from wine_places
   where canonical_key in ('france.bordeaux.libournais','france.bordeaux.blaye-bourg')
     and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if v_count <> 2 then
    raise exception 'expected 2 verified bordeaux subregions, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p where p.canonical_key like 'france.bordeaux.%' and p.kind = 'SUBREGION'
       and (select count(*) from wine_place_boundaries b where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a bordeaux subregion lacks exactly one current boundary';
  end if;
end;
$$;
