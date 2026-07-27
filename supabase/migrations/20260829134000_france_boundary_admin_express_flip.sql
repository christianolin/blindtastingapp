-- France — Admin Express outline flip.
--
-- Promotes the staged DRAFT France boundary (union of the 13 IGN Admin
-- Express metropolitan regions incl. Corse, ~7k vertices, engine
-- admin-express-region-union) to current-VALIDATED and retires the Natural
-- Earth 1:50m outline, whose ~5 km coastline generalization visibly cut
-- across the Provence shore (Toulon peninsulas, Hyères). The NE revision is
-- kept as history, not deleted. bbox window guard = the France window
-- (lon [-6,11], lat [41,52]).
do $$
declare
  v_old uuid;
  v_new uuid;
  v_np int;
  v_bbox double precision[];
begin
  select b.id into v_new
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france' and b.quality_status = 'DRAFT'
     and b.generation_parameters->>'engine' = 'admin-express-region-union';
  if v_new is null then
    raise exception 'Admin Express France DRAFT boundary missing pre-flip';
  end if;
  select b.id into v_old
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'france' and b.is_current;
  if v_old is null then
    raise exception 'France has no current boundary pre-flip';
  end if;

  select bbox, extensions.ST_NPoints(display_geometry)
    into v_bbox, v_np
    from wine_place_boundaries where id = v_new;
  if v_bbox[1] < -6 or v_bbox[2] < 41 or v_bbox[3] > 11 or v_bbox[4] > 52 then
    raise exception 'France boundary bbox %,%,%,% escapes the window',
      v_bbox[1], v_bbox[2], v_bbox[3], v_bbox[4];
  end if;
  -- Sanity: the Admin Express outline is a real coastline, far above the
  -- Natural Earth vertex budget, and not runaway-detailed either.
  if v_np < 3000 or v_np > 20000 then
    raise exception 'France outline vertex count % outside 3000..20000', v_np;
  end if;

  update wine_place_boundaries set is_current = false where id = v_old;
  update wine_place_boundaries
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
   where id = v_new;

  -- Same-transaction assertions.
  if (select count(*) from wine_place_boundaries b
        join wine_places p on p.id = b.wine_place_id
       where p.canonical_key = 'france' and b.is_current) <> 1 then
    raise exception 'france must have exactly one current boundary';
  end if;
  if (select b.generation_parameters->>'engine'
        from wine_place_boundaries b
        join wine_places p on p.id = b.wine_place_id
       where p.canonical_key = 'france' and b.is_current)
     is distinct from 'admin-express-region-union' then
    raise exception 'france current boundary is not the Admin Express union';
  end if;
  if (select b.boundary_method
        from wine_place_boundaries b
        join wine_places p on p.id = b.wine_place_id
       where p.canonical_key = 'france' and b.is_current) <> 'MANUAL' then
    raise exception 'france current boundary method must stay MANUAL';
  end if;
end;
$$;
