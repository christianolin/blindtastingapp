-- Champagne region — reviewed boundary flip.
--
-- Promotes the staged commune-union DRAFT boundary (from
-- fetch-champagne-communes.mjs, namespace IGN_ADMIN_EXPRESS) to
-- current-VALIDATED and the place DRAFT -> VERIFIED, after owner shape review
-- of the dissolved outline. bbox window guard (Champagne ~ lon [3.0,5.05],
-- lat [47.8,49.6]) mirrors the France Natural-Earth boundary guard.
do $$
declare
  v_place uuid;
  v_boundary uuid;
  v_count int;
  v_minx float8; v_miny float8; v_maxx float8; v_maxy float8;
begin
  select id into v_place from wine_places where canonical_key = 'france.champagne';
  if v_place is null then
    raise exception 'champagne place missing';
  end if;

  -- Exactly one staged DRAFT boundary is expected.
  select count(*) into v_count
    from wine_place_boundaries
   where wine_place_id = v_place and quality_status = 'DRAFT';
  if v_count <> 1 then
    raise exception 'expected exactly 1 DRAFT champagne boundary, got %', v_count;
  end if;

  select count(*) into v_count
    from wine_place_boundaries
   where wine_place_id = v_place and is_current;
  if v_count <> 0 then
    raise exception 'champagne already has a current boundary (%))', v_count;
  end if;

  select id, bbox[1], bbox[2], bbox[3], bbox[4]
    into v_boundary, v_minx, v_miny, v_maxx, v_maxy
    from wine_place_boundaries
   where wine_place_id = v_place and quality_status = 'DRAFT';

  if v_minx < 3.0 or v_miny < 47.8 or v_maxx > 5.05 or v_maxy > 49.6 then
    raise exception 'champagne boundary bbox %,%,%,% escapes the display window',
      v_minx, v_miny, v_maxx, v_maxy;
  end if;

  update wine_place_boundaries
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
   where id = v_boundary;

  update wine_places
     set publication_status = 'VERIFIED'
   where id = v_place;

  -- Same-transaction assertions.
  if not exists (
    select 1 from wine_places
     where id = v_place
       and publication_status = 'VERIFIED'
       and canonical_key_locked_at is not null
  ) then
    raise exception 'champagne place not verified/locked post-flip';
  end if;
  if not exists (
    select 1 from wine_place_boundaries
     where id = v_boundary and is_current and quality_status = 'VALIDATED'
  ) then
    raise exception 'champagne boundary not current/validated post-flip';
  end if;
  if (
    select count(*) from wine_place_boundaries
     where wine_place_id = v_place and is_current
  ) <> 1 then
    raise exception 'champagne must have exactly one current boundary';
  end if;
end;
$$;
