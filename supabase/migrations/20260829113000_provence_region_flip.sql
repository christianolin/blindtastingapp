-- Provence — derived region boundary flip (the aggregate outline).
--
-- Promotes the single staged DRAFT DERIVED_FROM_DESCENDANTS boundary on
-- france.provence (scripts/wine-map-sources/derive-boundary.mjs — the union
-- of the 7 VERIFIED constituent AOC footprints, the Rhône/Bourgogne
-- pattern) to current-VALIDATED and the region place DRAFT -> VERIFIED.
-- Multi-component is expected (Côtes de Provence sprawls in separated
-- pockets). bbox window guard = the artifact's region_window
-- (lon [4.5,6.9], lat [42.9,44.0]).
do $$
declare
  r record;
  v_count int;
begin
  -- Pre-flip shape: exactly 1 DRAFT derived boundary on the region place.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.provence' and b.quality_status = 'DRAFT';
  if v_count <> 1 then
    raise exception 'expected exactly 1 DRAFT provence region boundary pre-flip, got %', v_count;
  end if;
  if exists (
    select 1 from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = 'france.provence' and b.is_current
  ) then
    raise exception 'provence region already has a current boundary pre-flip';
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.provence' and b.quality_status = 'DRAFT'
     and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';
  if v_count <> 1 then
    raise exception 'provence region DRAFT boundary is not DERIVED_FROM_DESCENDANTS';
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = 'france.provence' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 4.5 or r.bbox[2] < 42.9 or r.bbox[3] > 6.9 or r.bbox[4] > 44.0 then
      raise exception 'provence region boundary bbox %,%,%,% escapes the window',
        r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places
       set publication_status = 'VERIFIED'
     where id = r.place_id;
  end loop;

  -- Same-transaction assertions: the whole subtree is now live.
  select count(*) into v_count from wine_places
   where canonical_key like 'france.provence%' and publication_status = 'VERIFIED';
  if v_count <> 8 then
    raise exception 'expected 8 verified provence places, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.provence%'
     and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 8 then
    raise exception 'expected 8 current/validated provence boundaries, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.provence%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a provence place lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places
     where canonical_key like 'france.provence%' and canonical_key_locked_at is null
  ) then
    raise exception 'a provence place is not locked post-verify';
  end if;
end;
$$;
