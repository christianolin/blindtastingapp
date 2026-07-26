-- Loire — children boundary flip (the 59 constituent AOCs).
--
-- Promotes the 59 staged DRAFT boundaries (Muscadet/Anjou/Layon/Saumur/
-- Touraine/Centre-Loire families; scripts/wine-map-sources/build-boundary.mjs
-- --engine concave, namespace IGN_INAO_AOC_VITICOLES, params from the
-- owner-previewed artifact data/wine-map/loire-appellations.json) to
-- current-VALIDATED and their places DRAFT -> VERIFIED. The aggregate region
-- place france.loire stays DRAFT here — its DERIVED_FROM_DESCENDANTS outline
-- is staged next and flips in 20260829123000 (the Provence/Sud-Ouest
-- pattern). bbox window guard = the artifact's region_window
-- (lon [-2.1,3.2], lat [46.2,48.0]).
do $$
declare
  r record;
  v_count int;
begin
  -- Pre-flip shape: exactly 59 DRAFT child boundaries, none current; the
  -- region place has no boundary yet.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.loire.%' and b.quality_status = 'DRAFT';
  if v_count <> 59 then
    raise exception 'expected exactly 59 DRAFT loire child boundaries pre-flip, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.loire%' and b.is_current;
  if v_count <> 0 then
    raise exception 'loire already has current boundaries pre-flip: %', v_count;
  end if;
  if exists (
    select 1 from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = 'france.loire'
  ) then
    raise exception 'loire region unexpectedly already has a boundary';
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.loire.%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < -2.1 or r.bbox[2] < 46.2 or r.bbox[3] > 3.2 or r.bbox[4] > 48.0 then
      raise exception 'loire boundary % bbox %,%,%,% escapes the window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places
       set publication_status = 'VERIFIED'
     where id = r.place_id;
  end loop;

  -- Same-transaction assertions.
  select count(*) into v_count from wine_places
   where canonical_key like 'france.loire.%' and publication_status = 'VERIFIED';
  if v_count <> 59 then
    raise exception 'expected 59 verified loire children, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.loire.%'
     and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 59 then
    raise exception 'expected 59 current/validated loire child boundaries, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.loire.%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a loire child lacks exactly one current boundary';
  end if;
  if (select publication_status from wine_places where canonical_key = 'france.loire') <> 'DRAFT' then
    raise exception 'loire region should remain DRAFT until its derived flip';
  end if;
end;
$$;
