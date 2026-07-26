-- Savoie — reviewed boundary flip (all 23 places).
--
-- Promotes the 23 staged DRAFT boundaries (region + Roussette de Savoie +
-- Seyssel + 16 Vin de Savoie crus + 4 Roussette crus;
-- scripts/wine-map-sources/build-boundary.mjs --engine concave, namespace
-- IGN_INAO_AOC_VITICOLES, params from the owner-previewed artifact
-- data/wine-map/savoie-appellations.json) to current-VALIDATED and their
-- places DRAFT -> VERIFIED. The region footprint is the dissolved base
-- 'Vin de Savoie ou Savoie' AOC; multi-component outlines are expected and
-- correct (scattered alpine pockets, per the artifact caveat). bbox window
-- guard = the artifact's region_window (lon [5.6,7.0], lat [45.3,46.5]).
do $$
declare
  r record;
  v_count int;
begin
  -- Pre-flip shape: exactly 23 DRAFT savoie boundaries, none current.
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.savoie%' and b.quality_status = 'DRAFT';
  if v_count <> 23 then
    raise exception 'expected exactly 23 DRAFT savoie boundaries pre-flip, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.savoie%' and b.is_current;
  if v_count <> 0 then
    raise exception 'savoie already has current boundaries pre-flip: %', v_count;
  end if;

  for r in
    select p.id place_id, p.canonical_key ck, b.id boundary_id, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key like 'france.savoie%' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 5.6 or r.bbox[2] < 45.3 or r.bbox[3] > 7.0 or r.bbox[4] > 46.5 then
      raise exception 'savoie boundary % bbox %,%,%,% escapes the window',
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
   where canonical_key like 'france.savoie%' and publication_status = 'VERIFIED';
  if v_count <> 23 then
    raise exception 'expected 23 verified savoie places, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key like 'france.savoie%'
     and b.is_current and b.quality_status = 'VALIDATED';
  if v_count <> 23 then
    raise exception 'expected 23 current/validated savoie boundaries, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.savoie%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a savoie place lacks exactly one current boundary';
  end if;
  if exists (
    select 1 from wine_places
     where canonical_key like 'france.savoie%' and canonical_key_locked_at is null
  ) then
    raise exception 'a savoie place is not locked post-verify';
  end if;
end;
$$;
