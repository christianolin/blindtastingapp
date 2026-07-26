-- Jura — reviewed boundary flip (all 5 places).
--
-- Promotes the 5 staged DRAFT boundaries (region + Arbois + Arbois Pupillin +
-- Château-Chalon + L'Étoile; scripts/wine-map-sources/build-boundary.mjs
-- --engine concave, namespace IGN_INAO_AOC_VITICOLES, params from the
-- owner-previewed artifact data/wine-map/jura-appellations.json) to
-- current-VALIDATED and their places DRAFT -> VERIFIED. The region footprint
-- is the dissolved region-wide 'Côtes du Jura' AOC per the artifact's
-- modeling decision. bbox window guard = the artifact's region_window
-- (lon [5.3,6.0], lat [46.3,47.4]).
do $$
declare
  r record;
  v_count int;
begin
  -- Pre-flip shape: exactly 5 DRAFT jura boundaries, none current.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.jura%' and b.quality_status = 'DRAFT';
  if v_count <> 5 then
    raise exception 'expected exactly 5 DRAFT jura boundaries pre-flip, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.jura%' and b.is_current;
  if v_count <> 0 then
    raise exception 'jura already has current boundaries pre-flip: %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.jura%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 5.3 or r.bbox[2] < 46.3 or r.bbox[3] > 6.0 or r.bbox[4] > 47.4 then
      raise exception 'jura boundary % bbox %,%,%,% escapes the window',
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
   where canonical_key like 'france.jura%' and publication_status = 'VERIFIED';
  if v_count <> 5 then
    raise exception 'expected 5 verified jura places, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.jura%'
     and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 5 then
    raise exception 'expected 5 current/validated jura boundaries, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.jura%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a jura place lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places
     where canonical_key like 'france.jura%' and canonical_key_locked_at is null
  ) then
    raise exception 'a jura place is not locked post-verify';
  end if;
end;
$$;
