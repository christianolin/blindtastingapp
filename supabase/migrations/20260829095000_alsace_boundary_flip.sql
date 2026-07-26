-- Alsace — reviewed boundary flip (all 52 places).
--
-- Promotes the 52 staged DRAFT boundaries (region + 51 grands crus;
-- scripts/wine-map-sources/build-boundary.mjs --engine concave, namespace
-- IGN_INAO_AOC_VITICOLES, params from the owner-previewed artifact
-- data/wine-map/alsace-appellations.json) to current-VALIDATED and their
-- places DRAFT -> VERIFIED. bbox window guard = the artifact's region_window
-- (lon [6.9,7.8], lat [47.7,49.2]).
do $$
declare
  r record;
  v_count int;
begin
  -- Pre-flip shape: exactly 52 DRAFT alsace boundaries, none current.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.alsace%' and b.quality_status = 'DRAFT';
  if v_count <> 52 then
    raise exception 'expected exactly 52 DRAFT alsace boundaries pre-flip, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.alsace%' and b.is_current;
  if v_count <> 0 then
    raise exception 'alsace already has current boundaries pre-flip: %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.alsace%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 6.9 or r.bbox[2] < 47.7 or r.bbox[3] > 7.8 or r.bbox[4] > 49.2 then
      raise exception 'alsace boundary % bbox %,%,%,% escapes the window',
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
   where canonical_key like 'france.alsace%' and publication_status = 'VERIFIED';
  if v_count <> 52 then
    raise exception 'expected 52 verified alsace places, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.alsace%'
     and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 52 then
    raise exception 'expected 52 current/validated alsace boundaries, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.alsace%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'an alsace place lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places
     where canonical_key like 'france.alsace%' and canonical_key_locked_at is null
  ) then
    raise exception 'an alsace place is not locked post-verify';
  end if;
end;
$$;
