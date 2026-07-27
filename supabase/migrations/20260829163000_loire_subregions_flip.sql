-- Loire — sub-region boundary flip (4 SUBREGION nodes).
--
-- Promotes the 4 DERIVED_FROM_DESCENDANTS sub-region boundaries (unions of
-- their member AOCs; Fiefs Vendeens and Haut-Poitou stay honest islands) to
-- current-VALIDATED and their places -> VERIFIED. Mirrors the Champagne/Rhone
-- sub-region flips. Per-side windows from the live staged bboxes (+margin):
--   pays-nantais    lon [-2.15,-0.7], lat [46.25,47.55]
--   anjou-saumur    lon [-1.45,0.2],  lat [46.85,47.6]
--   touraine-region lon [-0.1,1.8],   lat [46.55,47.9]
--   centre-loire    lon [1.9,3.15],   lat [46.4,47.7]
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.loire.%' and p.kind = 'SUBREGION' and b.quality_status = 'DRAFT';
  if v_count <> 4 then
    raise exception 'expected exactly 4 DRAFT loire subregion boundaries, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.loire.%' and p.kind = 'SUBREGION' and b.quality_status = 'DRAFT'
  loop
    if r.ck = 'france.loire.pays-nantais' then
      if r.bbox[1] < -2.15 or r.bbox[2] < 46.25 or r.bbox[3] > -0.7 or r.bbox[4] > 47.55 then
        raise exception 'pays-nantais bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck = 'france.loire.anjou-saumur' then
      if r.bbox[1] < -1.45 or r.bbox[2] < 46.85 or r.bbox[3] > 0.2 or r.bbox[4] > 47.6 then
        raise exception 'anjou-saumur bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck = 'france.loire.touraine-region' then
      if r.bbox[1] < -0.1 or r.bbox[2] < 46.55 or r.bbox[3] > 1.8 or r.bbox[4] > 47.9 then
        raise exception 'touraine bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck = 'france.loire.centre-loire' then
      if r.bbox[1] < 1.9 or r.bbox[2] < 46.4 or r.bbox[3] > 3.15 or r.bbox[4] > 47.7 then
        raise exception 'centre-loire bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
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
   where canonical_key like 'france.loire.%' and kind = 'SUBREGION' and publication_status = 'VERIFIED';
  if v_count <> 4 then
    raise exception 'expected 4 verified loire subregions, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p where p.canonical_key like 'france.loire.%' and p.kind = 'SUBREGION'
       and (select count(*) from wine_place_boundaries b where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a loire subregion lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places where canonical_key like 'france.loire.%' and kind = 'SUBREGION' and canonical_key_locked_at is null
  ) then
    raise exception 'a loire subregion not locked post-verify';
  end if;
end;
$$;
