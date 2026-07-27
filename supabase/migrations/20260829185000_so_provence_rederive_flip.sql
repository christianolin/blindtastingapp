-- Sud-Ouest + Provence — aggregate outline re-derives (revision flips).
--
-- Wave 3d added five Sud-Ouest constituents (Bergerac côtes, the Montravel
-- pair, Saint-Mont, Tursan) and Pierrevert to Provence, so both derived
-- aggregate regions were re-derived from their full child sets. Windows from
-- the live staged bboxes (+margin):
--   sud-ouest lon [-1.45,2.65], lat [43.0,45.1]
--   provence  lon [4.6,6.95],   lat [42.9,44.0]
do $$
declare
  r record;
  v_old uuid;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in ('france.sud-ouest','france.provence') and b.quality_status = 'DRAFT';
  if v_count <> 2 then
    raise exception 'expected exactly 2 DRAFT region re-derives, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key in ('france.sud-ouest','france.provence') and b.quality_status = 'DRAFT'
  loop
    if r.ck = 'france.sud-ouest' then
      if r.bbox[1] < -1.45 or r.bbox[2] < 43.0 or r.bbox[3] > 2.65 or r.bbox[4] > 45.1 then
        raise exception 'sud-ouest bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck = 'france.provence' then
      if r.bbox[1] < 4.6 or r.bbox[2] < 42.9 or r.bbox[3] > 6.95 or r.bbox[4] > 44.0 then
        raise exception 'provence bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    else
      raise exception 'unexpected DRAFT re-derive for %', r.ck;
    end if;

    select id into v_old from wine_place_boundaries
     where wine_place_id = r.place_id and is_current;
    if v_old is null then
      raise exception '% has no current boundary to retire', r.ck;
    end if;
    update wine_place_boundaries set is_current = false where id = v_old;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
  end loop;

  if exists (
    select 1 from wine_places p
     where p.canonical_key in ('france.sud-ouest','france.provence')
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a region lacks exactly one current boundary post-flip';
  end if;
end;
$$;
