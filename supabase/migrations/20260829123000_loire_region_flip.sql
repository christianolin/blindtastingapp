-- Loire — derived region boundary flip (the aggregate outline).
--
-- Promotes the single staged DRAFT DERIVED_FROM_DESCENDANTS boundary on
-- france.loire (scripts/wine-map-sources/derive-boundary.mjs — the union of
-- the 59 VERIFIED constituent AOC footprints, the Provence/Sud-Ouest
-- pattern) to current-VALIDATED and the region place DRAFT -> VERIFIED.
-- Strongly multi-component is expected and correct: the valley's families
-- sit in separated pockets from the Atlantic (Pays Nantais) to Sancerre.
-- bbox window guard = the artifact's region_window
-- (lon [-2.1,3.2], lat [46.2,48.0]).
do $$
declare
  r record;
  v_count int;
begin
  -- Pre-flip shape: exactly 1 DRAFT derived boundary on the region place.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.loire' and b.quality_status = 'DRAFT';
  if v_count <> 1 then
    raise exception 'expected exactly 1 DRAFT loire region boundary pre-flip, got %', v_count;
  end if;
  if exists (
    select 1 from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = 'france.loire' and b.is_current
  ) then
    raise exception 'loire region already has a current boundary pre-flip';
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france.loire' and b.quality_status = 'DRAFT'
     and b.boundary_method = 'DERIVED_FROM_DESCENDANTS';
  if v_count <> 1 then
    raise exception 'loire region DRAFT boundary is not DERIVED_FROM_DESCENDANTS';
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = 'france.loire' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < -2.1 or r.bbox[2] < 46.2 or r.bbox[3] > 3.2 or r.bbox[4] > 48.0 then
      raise exception 'loire region boundary bbox %,%,%,% escapes the window',
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
   where canonical_key like 'france.loire%' and publication_status = 'VERIFIED';
  if v_count <> 60 then
    raise exception 'expected 60 verified loire places, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.loire%'
     and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 60 then
    raise exception 'expected 60 current/validated loire boundaries, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.loire%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a loire place lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places
     where canonical_key like 'france.loire%' and canonical_key_locked_at is null
  ) then
    raise exception 'a loire place is not locked post-verify';
  end if;
end;
$$;
