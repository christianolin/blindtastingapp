-- Vallee du Rhone — reviewed boundary flip, Phase A: the 8 Northern Rhone crus.
--
-- Promotes the 8 staged DRAFT cru boundaries (build-boundary --engine concave,
-- IGN_INAO_AOC_VITICOLES) to current-VALIDATED and their places -> VERIFIED,
-- after owner shape review (preview: .superpowers/sdd/preview-rhone-
-- septentrional.svg; vertex counts identical to the staged rows). The region
-- place france.rhone stays DRAFT here — its boundary is DERIVED from these now-
-- verified crus and flipped in Phase B (20260822094000). Window guard = the
-- artifact region_window (lon [4.5,5.1], lat [44.7,45.7]).
do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.rhone.%' and b.quality_status = 'DRAFT';
  if v_count <> 8 then
    raise exception 'expected exactly 8 DRAFT rhone cru boundaries pre-flip, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.rhone.%' and b.is_current;
  if v_count <> 0 then
    raise exception 'rhone crus already have current boundaries pre-flip: %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.rhone.%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 4.5 or r.bbox[2] < 44.7 or r.bbox[3] > 5.1 or r.bbox[4] > 45.7 then
      raise exception 'rhone cru % bbox %,%,%,% escapes the window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places
       set publication_status = 'VERIFIED'
     where id = r.place_id;
  end loop;

  select count(*) into v_count from wine_places
   where canonical_key like 'france.rhone.%' and publication_status = 'VERIFIED';
  if v_count <> 8 then
    raise exception 'expected 8 verified rhone crus, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.rhone.%'
     and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 8 then
    raise exception 'expected 8 current/validated rhone cru boundaries, got %', v_count;
  end if;
  -- Region stays DRAFT until Phase B derives + flips its boundary.
  if exists (
    select 1 from wine_places where canonical_key = 'france.rhone' and publication_status <> 'DRAFT'
  ) then
    raise exception 'france.rhone must remain DRAFT after Phase A';
  end if;
end;
$$;
