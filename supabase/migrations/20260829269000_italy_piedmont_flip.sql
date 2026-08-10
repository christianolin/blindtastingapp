-- Italy / Piedmont pilot — reviewed flip.
--
-- Promotes the 4 staged DRAFT boundaries (italy country outline: Natural
-- Earth, MANUAL; piemonte/barolo/barbaresco: ISTAT comuni dissolve, MANUAL)
-- to current-VALIDATED, and their places DRAFT -> VERIFIED. Simpler than the
-- Alsace flip: no re-parenting and no wine_designation_members join — the
-- hierarchy (italy -> piemonte -> {barolo, barbaresco}) was set correctly at
-- catalog time (20260829268000) and is untouched here. Window guard is the
-- single Italy display window (lon [6.5,18.6], lat [36.5,47.2]) that
-- contains all four boundaries' bboxes (same window used to clip the italy
-- country geometry in 20260829268500).
begin;

do $$
declare
  r record;
  v_count int;
begin
  -- Pre-flip shape: 4 DRAFT italy% boundaries, none current, 4 DRAFT places.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'italy%' and b.quality_status = 'DRAFT';
  if v_count <> 4 then
    raise exception 'expected exactly 4 DRAFT italy boundaries pre-flip, got %', v_count;
  end if;

  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'italy%' and b.is_current;
  if v_count <> 0 then
    raise exception 'italy places already have current boundaries pre-flip: %', v_count;
  end if;

  select count(*) into v_count
    from wine_places
   where canonical_key like 'italy%' and publication_status = 'DRAFT';
  if v_count <> 4 then
    raise exception 'expected exactly 4 DRAFT italy places pre-flip, got %', v_count;
  end if;

  -- Promote each boundary, window-guarded against the Italy display window.
  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'italy%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 6.5 or r.bbox[2] < 36.5 or r.bbox[3] > 18.6 or r.bbox[4] > 47.2 then
      raise exception 'italy boundary % bbox %,%,%,% escapes the window',
        r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.boundary_id;
    update wine_places set publication_status = 'VERIFIED' where id = r.place_id;
  end loop;

  -- Post-flip assertions, same transaction.
  select count(*) into v_count
    from wine_places
   where canonical_key like 'italy%' and publication_status = 'VERIFIED';
  if v_count <> 4 then
    raise exception 'expected 4 verified italy places, got %', v_count;
  end if;

  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'italy%' and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 4 then
    raise exception 'expected 4 current/validated italy boundaries, got %', v_count;
  end if;

  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'italy%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'an italy place lacks exactly one current boundary';
  end if;

  if exists (
    select 1 from wine_places
     where canonical_key like 'italy%' and canonical_key_locked_at is null
  ) then
    raise exception 'an italy place is not locked post-verify';
  end if;
end;
$$;

commit;
