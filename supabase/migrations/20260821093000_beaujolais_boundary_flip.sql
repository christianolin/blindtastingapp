-- Beaujolais — reviewed boundary flip (all 12 places).
--
-- Promotes the 12 staged DRAFT boundaries (region + Beaujolais-Villages + 10
-- crus; scripts/wine-map-sources/build-boundary.mjs --engine concave, namespace
-- IGN_INAO_AOC_VITICOLES) to current-VALIDATED and their places DRAFT ->
-- VERIFIED, after owner shape review of the dissolved outlines (preview
-- artifacts: .superpowers/sdd/preview-beaujolais.svg + per-cru SVGs; vertex
-- counts identical to the staged rows). bbox window guard = the artifact's
-- region_window (lon [4.4,5.0], lat [45.7,46.4]).
do $$
declare
  r record;
  v_count int;
begin
  -- Pre-flip shape: exactly 12 DRAFT beaujolais boundaries, none current.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.beaujolais%' and b.quality_status = 'DRAFT';
  if v_count <> 12 then
    raise exception 'expected exactly 12 DRAFT beaujolais boundaries pre-flip, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.beaujolais%' and b.is_current;
  if v_count <> 0 then
    raise exception 'beaujolais already has current boundaries pre-flip: %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.beaujolais%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 4.4 or r.bbox[2] < 45.7 or r.bbox[3] > 5.0 or r.bbox[4] > 46.4 then
      raise exception 'beaujolais boundary % bbox %,%,%,% escapes the window',
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
   where canonical_key like 'france.beaujolais%' and publication_status = 'VERIFIED';
  if v_count <> 12 then
    raise exception 'expected 12 verified beaujolais places, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.beaujolais%'
     and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 12 then
    raise exception 'expected 12 current/validated beaujolais boundaries, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.beaujolais%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a beaujolais place lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places
     where canonical_key like 'france.beaujolais%' and canonical_key_locked_at is null
  ) then
    raise exception 'a beaujolais place is not locked post-verify';
  end if;
end;
$$;
