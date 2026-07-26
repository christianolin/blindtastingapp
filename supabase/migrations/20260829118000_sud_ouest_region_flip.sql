-- Sud-Ouest — derived region boundary flip (the aggregate outline).
--
-- Promotes the single staged DRAFT DERIVED_FROM_DESCENDANTS boundary on
-- france.sud-ouest (scripts/wine-map-sources/derive-boundary.mjs — the
-- union of the 19 VERIFIED constituent AOC footprints, the Provence/Rhône
-- pattern) to current-VALIDATED and the region place DRAFT -> VERIFIED.
-- Strongly multi-component is expected and correct: Sud-Ouest is scattered
-- pockets from the Dordogne to the Basque country (artifact caveat).
-- bbox window guard = the artifact's region_window
-- (lon [-1.6,2.75], lat [42.7,45.2]).
do $$
declare
  r record;
  v_count int;
begin
  -- Pre-flip shape: exactly 1 DRAFT derived boundary on the region place.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.sud-ouest' and b.quality_status = 'DRAFT';
  if v_count <> 1 then
    raise exception 'expected exactly 1 DRAFT sud-ouest region boundary pre-flip, got %', v_count;
  end if;
  if exists (
    select 1 from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = 'france.sud-ouest' and b.is_current
  ) then
    raise exception 'sud-ouest region already has a current boundary pre-flip';
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.sud-ouest' and b.quality_status = 'DRAFT'
     and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';
  if v_count <> 1 then
    raise exception 'sud-ouest region DRAFT boundary is not DERIVED_FROM_DESCENDANTS';
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = 'france.sud-ouest' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < -1.6 or r.bbox[2] < 42.7 or r.bbox[3] > 2.75 or r.bbox[4] > 45.2 then
      raise exception 'sud-ouest region boundary bbox %,%,%,% escapes the window',
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
   where canonical_key like 'france.sud-ouest%' and publication_status = 'VERIFIED';
  if v_count <> 20 then
    raise exception 'expected 20 verified sud-ouest places, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.sud-ouest%'
     and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 20 then
    raise exception 'expected 20 current/validated sud-ouest boundaries, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.sud-ouest%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a sud-ouest place lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places
     where canonical_key like 'france.sud-ouest%' and canonical_key_locked_at is null
  ) then
    raise exception 'a sud-ouest place is not locked post-verify';
  end if;
end;
$$;
