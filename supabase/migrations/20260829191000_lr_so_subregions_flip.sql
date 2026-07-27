-- Languedoc-Roussillon + Sud-Ouest — sub-region boundary flip (6 nodes).
--
-- Promotes the 6 DERIVED_FROM_DESCENDANTS sub-region boundaries to
-- current-VALIDATED and their places -> VERIFIED. Per-node windows from the
-- live staged bboxes (+margin).
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where (p.canonical_key like 'france.languedoc-roussillon.%' or p.canonical_key like 'france.sud-ouest.%')
     and p.kind = 'SUBREGION' and b.quality_status = 'DRAFT';
  if v_count <> 6 then
    raise exception 'expected exactly 6 DRAFT LR/SO subregion boundaries, got %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where (p.canonical_key like 'france.languedoc-roussillon.%' or p.canonical_key like 'france.sud-ouest.%')
       and p.kind = 'SUBREGION' and b.quality_status = 'DRAFT'
  loop
    if r.ck = 'france.languedoc-roussillon.languedoc' then
      if r.bbox[1] < 1.9 or r.bbox[2] < 42.75 or r.bbox[3] > 4.7 or r.bbox[4] > 44.0 then
        raise exception 'languedoc bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck = 'france.languedoc-roussillon.roussillon' then
      if r.bbox[1] < 2.25 or r.bbox[2] < 42.35 or r.bbox[3] > 3.25 or r.bbox[4] > 43.1 then
        raise exception 'roussillon bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck = 'france.sud-ouest.bergeracois' then
      if r.bbox[1] < -0.1 or r.bbox[2] < 44.55 or r.bbox[3] > 0.95 or r.bbox[4] > 45.1 then
        raise exception 'bergeracois bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck = 'france.sud-ouest.garonne-tarn' then
      if r.bbox[1] < -0.1 or r.bbox[2] < 43.65 or r.bbox[3] > 2.65 or r.bbox[4] > 44.7 then
        raise exception 'garonne-tarn bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck = 'france.sud-ouest.gascogne' then
      if r.bbox[1] < -0.65 or r.bbox[2] < 43.35 or r.bbox[3] > 0.35 or r.bbox[4] > 43.85 then
        raise exception 'gascogne bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
      end if;
    elsif r.ck = 'france.sud-ouest.pyrenees' then
      if r.bbox[1] < -1.45 or r.bbox[2] < 43.05 or r.bbox[3] > 0.05 or r.bbox[4] > 43.7 then
        raise exception 'pyrenees bbox %,%,%,% escapes the window', r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
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
   where kind = 'SUBREGION' and publication_status = 'VERIFIED'
     and (canonical_key like 'france.languedoc-roussillon.%' or canonical_key like 'france.sud-ouest.%');
  if v_count <> 6 then
    raise exception 'expected 6 verified LR/SO subregions, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.kind = 'SUBREGION'
       and (p.canonical_key like 'france.languedoc-roussillon.%' or p.canonical_key like 'france.sud-ouest.%')
       and (select count(*) from wine_place_boundaries b where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'an LR/SO subregion lacks exactly one current boundary';
  end if;
end;
$$;
