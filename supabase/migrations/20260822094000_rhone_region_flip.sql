-- Vallee du Rhone — reviewed boundary flip, Phase B: the region france.rhone.
--
-- Promotes the DERIVED_FROM_DESCENDANTS boundary (derive-boundary.mjs, the
-- coverage-union of the 8 now-verified Northern Rhone crus; 1 component, 779
-- vtx, bridged by Saint-Joseph's strip) to current-VALIDATED and the place
-- DRAFT -> VERIFIED. Mirrors france.bourgogne (a region == union of its
-- children). The outline is the Northern Rhone extent for now; it expands when
-- Southern Rhone / the full Cotes du Rhone dissolve land. Window guard = the
-- artifact region_window (lon [4.5,5.1], lat [44.7,45.7]).
do $$
declare
  v_place uuid;
  v_boundary uuid;
  v_count int;
  v_minx float8; v_miny float8; v_maxx float8; v_maxy float8;
begin
  select id into v_place from wine_places where canonical_key = 'france.rhone';
  if v_place is null then
    raise exception 'france.rhone place missing';
  end if;

  select count(*) into v_count
    from wine_place_boundaries where wine_place_id = v_place and quality_status = 'DRAFT';
  if v_count <> 1 then
    raise exception 'expected exactly 1 DRAFT france.rhone boundary, got %', v_count;
  end if;
  select count(*) into v_count
    from wine_place_boundaries where wine_place_id = v_place and is_current;
  if v_count <> 0 then
    raise exception 'france.rhone already has a current boundary: %', v_count;
  end if;

  select id, bbox[1], bbox[2], bbox[3], bbox[4]
    into v_boundary, v_minx, v_miny, v_maxx, v_maxy
    from wine_place_boundaries where wine_place_id = v_place and quality_status = 'DRAFT';
  if v_minx < 4.5 or v_miny < 44.7 or v_maxx > 5.1 or v_maxy > 45.7 then
    raise exception 'france.rhone boundary %,%,%,% escapes the window',
      v_minx, v_miny, v_maxx, v_maxy;
  end if;

  update wine_place_boundaries
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
   where id = v_boundary;
  update wine_places
     set publication_status = 'VERIFIED'
   where id = v_place;

  -- Same-transaction assertions: france.rhone verified/locked, and all 9 rhone
  -- places now verified with exactly one current boundary each.
  if not exists (
    select 1 from wine_places
     where id = v_place and publication_status = 'VERIFIED'
       and canonical_key_locked_at is not null
  ) then
    raise exception 'france.rhone not verified/locked post-flip';
  end if;
  select count(*) into v_count from wine_places
   where canonical_key like 'france.rhone%' and publication_status = 'VERIFIED';
  if v_count <> 9 then
    raise exception 'expected 9 verified rhone places, got %', v_count;
  end if;
  if exists (
    select 1 from wine_places p
     where p.canonical_key like 'france.rhone%'
       and (select count(*) from wine_place_boundaries b
              where b.wine_place_id = p.id and b.is_current) <> 1
  ) then
    raise exception 'a rhone place lacks exactly one current boundary';
  end if;
end;
$$;
