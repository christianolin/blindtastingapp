-- Languedoc-Roussillon — reviewed boundary flip (all 57 places).
--
-- Promotes the 57 staged DRAFT boundaries (dual-role region — the base
-- 'Languedoc' AOC dissolve, 53818 parcels — plus 56 constituent AOCs;
-- scripts/wine-map-sources/build-boundary.mjs --engine concave, namespace
-- IGN_INAO_AOC_VITICOLES, params from the owner-previewed artifact
-- data/wine-map/languedoc-roussillon-appellations.json) to current-VALIDATED
-- and their places DRAFT -> VERIFIED. Overlapping footprints are expected
-- and correct for the VDN family (Banyuls/Banyuls grand cru/Collioure share
-- delimitations; Rivesaltes/Grand Roussillon/Muscat de Rivesaltes likewise).
-- bbox window guard = the artifact's region_window
-- (lon [1.9,4.7], lat [42.3,44.1]).
do $$
declare
  r record;
  v_count int;
begin
  -- Pre-flip shape: exactly 57 DRAFT boundaries, none current.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.languedoc-roussillon%' and b.quality_status = 'DRAFT';
  if v_count <> 57 then
    raise exception 'expected exactly 57 DRAFT languedoc-roussillon boundaries pre-flip, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.languedoc-roussillon%' and b.is_current;
  if v_count <> 0 then
    raise exception 'languedoc-roussillon already has current boundaries pre-flip: %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.languedoc-roussillon%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 1.9 or r.bbox[2] < 42.3 or r.bbox[3] > 4.7 or r.bbox[4] > 44.1 then
      raise exception 'languedoc-roussillon boundary % bbox %,%,%,% escapes the window',
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
   where canonical_key like 'france.languedoc-roussillon%' and publication_status = 'VERIFIED';
  if v_count <> 57 then
    raise exception 'expected 57 verified languedoc-roussillon places, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.languedoc-roussillon%'
     and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 57 then
    raise exception 'expected 57 current/validated languedoc-roussillon boundaries, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.languedoc-roussillon%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a languedoc-roussillon place lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places
     where canonical_key like 'france.languedoc-roussillon%' and canonical_key_locked_at is null
  ) then
    raise exception 'a languedoc-roussillon place is not locked post-verify';
  end if;
end;
$$;
